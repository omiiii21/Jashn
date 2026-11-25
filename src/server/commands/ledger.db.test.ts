import { randomUUID } from "node:crypto";

import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { CommandEnvelope, CommandName, CommandResponse } from "@/contracts/commands";
import type { SessionActor } from "@/contracts/domain";
import { createDb, type Db } from "@/db/client";
import { seededId, type SampleCopy } from "@/db/ids";
import {
  activityEntries,
  commitmentVersions,
  commitments,
  paymentVersions,
  payments,
  proposals,
  vendors,
  voiceTurns,
  weddings,
} from "@/db/schema";
import { localDatabaseUrl } from "@/db/testing";
import { applySeedState } from "@/db/seed-apply";
import { buildSeedDataset, fallbackUserId, seedAccounts, type SeedDataset } from "@/db/seed-data";
import { loadVendorFigures, sumVendorFigures } from "@/server/read-models/ledger-math";

import { createDispatcher } from "./dispatcher";
import { ledgerHandlers } from "./ledger";
import { proposalHandlers } from "./proposals";

/**
 * A3 against a real Postgres, on sample copy "b" only (copies share fixed ids, so each test
 * file owns one copy). Every test starts from D0 (applySeedState), and the copy is left at
 * D0 afterwards. Commands go through the real dispatcher with these handlers, so activity,
 * receipts and the version bump are the production path.
 * Run: DATABASE_URL=… RUN_DB_TESTS=1 npx vitest run src/server/commands/ledger.db.test.ts
 */

const COPY: SampleCopy = "b";
const NOW = new Date("2026-11-25T15:00:00+05:30");
// Resets a whole sample copy, so it runs only against a local Postgres (src/db/testing.ts).
const url = localDatabaseUrl();

let db: Db;
let close: () => Promise<void>;
let dataset: SeedDataset;
let wedding_id: string;
let mira: SessionActor;
let diya: SessionActor;

const id = (table: string, key: string) => seededId(COPY, table, key);

function dispatcher() {
  return createDispatcher({
    db: () => db,
    registry: () => ({ ...ledgerHandlers, ...proposalHandlers }),
    afterCommit: {},
    voiceGate: async () => ({ status: "enabled" }),
    onSetupSaved: async () => {},
    voiceTurnCheck: async (_db, _actor, turn) => {
      const rows = await db.select({ transcript: voiceTurns.transcript }).from(voiceTurns).where(eq(voiceTurns.id, turn.voice_turn_id));
      return { ok: true, transcript: rows[0]?.transcript ?? null, members_safe: false };
    },
    schedule: () => {},
    now: () => NOW,
    log: () => {},
  });
}

async function run<C extends CommandName>(
  actor: SessionActor,
  command: C,
  input: Record<string, unknown>,
  options: { key?: string; voice_turn_id?: string } = {},
): Promise<CommandResponse<C>> {
  const envelope = {
    wedding_id,
    command,
    input,
    idempotency_key: options.key ?? randomUUID(),
    source: options.voice_turn_id ? "voice" : "ui",
    voice_turn_id: options.voice_turn_id ?? null,
  } as unknown as CommandEnvelope<C>;
  return dispatcher().runCommand(actor, envelope);
}

function ok<C extends CommandName>(response: CommandResponse<C>) {
  if (!response.ok) throw new Error(`expected success, got ${response.error.code} (${response.error.field ?? ""}): ${response.error.message}`);
  return response;
}

function err<C extends CommandName>(response: CommandResponse<C>) {
  if (response.ok) throw new Error(`expected an error, got ${response.outcome}`);
  return response.error;
}

async function resetToD0(): Promise<void> {
  await db.transaction((tx) => applySeedState(tx, dataset, { now: NOW }));
}

async function versionOf(): Promise<number> {
  const rows = await db.select({ version: weddings.version }).from(weddings).where(eq(weddings.id, wedding_id));
  return Number(rows[0].version);
}

async function totals() {
  return sumVendorFigures([...(await loadVendorFigures(db, wedding_id)).values()]);
}

async function activityCount(): Promise<number> {
  const rows = await db.select({ n: sql<number>`count(*)::bigint` }).from(activityEntries).where(eq(activityEntries.wedding_id, wedding_id));
  return Number(rows[0].n);
}

async function paymentVersionsOf(payment_id: string) {
  return db.select().from(paymentVersions).where(eq(paymentVersions.payment_id, payment_id)).orderBy(asc(paymentVersions.version_no));
}

function memberActor(seed_key: string): SessionActor {
  const row = dataset.rows.members?.find((member) => member.seed_key === seed_key);
  if (!row?.id) throw new Error(`member ${seed_key} missing from the dataset`);
  return {
    kind: "member",
    user_id: row.user_id,
    email: `${row.display_name.toLowerCase()}.${COPY}@example.com`,
    display_name: row.display_name,
    wedding_id,
    member_id: row.id,
    role: row.role,
    is_internal: true,
    is_first_wedding: false,
    preferred_language: "en",
  };
}

describe.skipIf(!url)("A3 ledger commands (database, copy b)", () => {
  beforeAll(async () => {
    const created = createDb(url!, { max: 4 });
    db = created.db;
    close = () => created.client.end({ timeout: 5 });
    const user_ids = Object.fromEntries(seedAccounts(COPY).map((account) => [account.email, fallbackUserId(account.email)]));
    dataset = buildSeedDataset(COPY, { user_ids });
    wedding_id = dataset.wedding_id;
    mira = memberActor("MEM-MIRA");
    diya = memberActor("MEM-DIYA");
  });

  beforeEach(async () => {
    await resetToD0();
  });

  afterAll(async () => {
    if (db) {
      await resetToD0();
      await close();
    }
  });

  it("D0 totals (M4, M5): committed 927000, paid 397000, outstanding 530000", async () => {
    expect(await totals()).toEqual({
      total_committed_inr: 927_000,
      total_paid_inr: 397_000,
      total_outstanding_inr: 530_000,
      total_overpaid_inr: 0,
    });
  });

  it("M-03 by typing (AT-5.3): PAY-01 to 40000 gives two versions, paid 387000, outstanding 540000; again is unchanged", async () => {
    const PAY_01 = id("payments", "PAY-01");
    const before = await versionOf();
    const entriesBefore = await activityCount();

    const first = ok(
      await run(mira, "correct_payment", {
        payment_id: PAY_01,
        expected_version: 1,
        amount_inr: 40_000,
        change_reason: "Advance was ₹40,000, not ₹50,000",
      }),
    );
    expect(first.outcome).toBe("applied");
    expect(first.result).toMatchObject({
      payment_id: PAY_01,
      version_no: 2,
      amount_inr: 40_000,
      vendor_id: id("vendors", "VEN-CAT"),
      vendor_totals: { committed_inr: 200_000, paid_inr: 40_000, outstanding_inr: 160_000, overpaid_inr: 0 },
    });
    expect((first.result as unknown as { versions: unknown[] }).versions).toHaveLength(2);
    expect(first.warnings).toEqual([]);
    expect(await versionOf()).toBe(before + 1);
    expect(await activityCount()).toBe(entriesBefore + 1);

    const versions = await paymentVersionsOf(PAY_01);
    expect(versions.map((row) => [row.version_no, row.amount_inr])).toEqual([
      [1, 50_000],
      [2, 40_000],
    ]);
    expect(versions[0].superseded_at).not.toBeNull();
    expect(versions[0].superseded_by_version_id).toBe(versions[1].id);
    expect(versions[1].superseded_at).toBeNull();
    expect(versions[1]).toMatchObject({ source: "ui", change_reason: "Advance was ₹40,000, not ₹50,000", paid_on: "2026-11-20", method: "upi" });
    const [identity] = await db.select().from(payments).where(eq(payments.id, PAY_01));
    expect(identity.current_version_no).toBe(2);

    // C6: the caterer still has exactly one payment; paid fell by exactly 10000.
    const catererPayments = await db.select({ id: payments.id }).from(payments).where(eq(payments.vendor_id, id("vendors", "VEN-CAT")));
    expect(catererPayments).toHaveLength(1);
    expect(await totals()).toMatchObject({ total_committed_inr: 927_000, total_paid_inr: 387_000, total_outstanding_inr: 540_000 });

    const [entry] = await db.select().from(activityEntries).where(eq(activityEntries.id, first.activity_entry_id!));
    expect(entry).toMatchObject({
      topic: "payment.corrected",
      entity_type: "payment",
      entity_id: PAY_01,
      visibility: "owners",
      summary_en: "Mira corrected the advance to Annapoorna Caterers from ₹50,000 to ₹40,000.",
      summary_hi: "Mira ने Annapoorna Caterers का एडवांस ₹50,000 से बदलकर ₹40,000 किया।",
      before: { amount_inr: 50_000 },
      after: { amount_inr: 40_000 },
    });

    // C8: the same values again (from version 2) write nothing.
    const again = ok(await run(mira, "correct_payment", { payment_id: PAY_01, expected_version: 2, amount_inr: 40_000 }));
    expect(again.outcome).toBe("unchanged");
    expect(again.activity_entry_id).toBeNull();
    expect(await versionOf()).toBe(before + 1);
    expect(await paymentVersionsOf(PAY_01)).toHaveLength(2);

    // C4: a second tab still at version 1 is stale and sees who set the current value.
    const stale = err(await run(mira, "correct_payment", { payment_id: PAY_01, expected_version: 1, amount_inr: 45_000 }));
    expect(stale.code).toBe("stale_version");
    expect(stale.current).toMatchObject({ payment_id: PAY_01, current_version_no: 2, amount_inr: 40_000, set_by: "Mira" });

    // C9 undo: a correction back writes version 3 and keeps version 2.
    const undo = ok(await run(mira, "correct_payment", { payment_id: PAY_01, expected_version: 2, amount_inr: 50_000 }));
    expect(undo.result).toMatchObject({ version_no: 3, vendor_totals: { outstanding_inr: 150_000 } });
    expect((await paymentVersionsOf(PAY_01)).map((row) => row.amount_inr)).toEqual([50_000, 40_000, 50_000]);
  });

  it("M-03 by voice (AT-5.2): version 2 carries source voice, the turn id and the transcript", async () => {
    const PAY_01 = id("payments", "PAY-01");
    const transcript = "Caterer ko chaalis hazaar advance diya tha";
    const [turn] = await db
      .insert(voiceTurns)
      .values({
        wedding_id,
        user_id: mira.user_id,
        member_id: mira.member_id,
        status: "proposed",
        transcript,
        client_turn_id: randomUUID(),
        input_mode: "speech",
        expires_at: new Date(NOW.getTime() + 10 * 60_000),
      })
      .returning({ id: voiceTurns.id });
    const response = ok(
      await run(mira, "correct_payment", { payment_id: PAY_01, expected_version: 1, amount_inr: 40_000 }, { key: `${turn.id}:0`, voice_turn_id: turn.id }),
    );
    expect(response.result).toMatchObject({ vendor_totals: { outstanding_inr: 160_000 } });
    const versions = await paymentVersionsOf(PAY_01);
    expect(versions[1]).toMatchObject({ source: "voice", voice_turn_id: turn.id, spoken_text: transcript });
    // I2: confirming twice replays.
    const replay = ok(
      await run(mira, "correct_payment", { payment_id: PAY_01, expected_version: 1, amount_inr: 40_000 }, { key: `${turn.id}:0`, voice_turn_id: turn.id }),
    );
    expect(replay.outcome).toBe("replayed");
    expect(await paymentVersionsOf(PAY_01)).toHaveLength(2);
  });

  it("overpaid (acceptance 4.3): D1 plus a 170000 instalment warns and keeps M5's check", async () => {
    ok(await run(mira, "correct_payment", { payment_id: id("payments", "PAY-01"), expected_version: 1, amount_inr: 40_000 }));
    const response = ok(
      await run(mira, "record_payment", { vendor_id: id("vendors", "VEN-CAT"), amount_inr: 170_000, payment_kind: "instalment", paid_on: "2026-11-25" }),
    );
    expect(response.result).toMatchObject({
      version_no: 1,
      amount_inr: 170_000,
      vendor_totals: { committed_inr: 200_000, paid_inr: 210_000, outstanding_inr: 0, overpaid_inr: 10_000 },
    });
    expect(response.warnings.map((warning) => warning.kind)).toEqual(["overpaid"]);
    const wedding = await totals();
    expect(wedding).toMatchObject({ total_outstanding_inr: 380_000, total_overpaid_inr: 10_000 });
    expect(wedding.total_outstanding_inr - wedding.total_overpaid_inr).toBe(wedding.total_committed_inr - wedding.total_paid_inr);
    expect(wedding.total_committed_inr - wedding.total_paid_inr).toBe(370_000);
    // The vendor's only active commitment is linked when none is named.
    const [row] = await db.select().from(payments).where(eq(payments.id, (response.result as { payment_id: string }).payment_id));
    expect(row.commitment_id).toBe(id("commitments", "COM-01"));
    const [entry] = await db.select().from(activityEntries).where(eq(activityEntries.id, response.activity_entry_id!));
    expect(entry.summary_en).toBe("Mira recorded an instalment of ₹1,70,000 to Annapoorna Caterers.");
  });

  it("M-08 (acceptance 4.3 budget): COM-04 to 125000 warns over_budget; committed 942000", async () => {
    const response = ok(await run(mira, "update_commitment", { commitment_id: id("commitments", "COM-04"), expected_version: 1, amount_inr: 125_000 }));
    expect(response.result).toMatchObject({ version_no: 2, vendor_totals: { committed_inr: 125_000, outstanding_inr: 95_000 } });
    expect(response.warnings).toEqual([
      expect.objectContaining({ kind: "over_budget", message: "Photography and video is ₹5,000 over its ₹1,20,000 budget." }),
    ]);
    expect((await totals()).total_committed_inr).toBe(942_000);
    const versions = await db.select().from(commitmentVersions).where(eq(commitmentVersions.commitment_id, id("commitments", "COM-04")));
    expect(versions).toHaveLength(2);
    const [entry] = await db.select().from(activityEntries).where(eq(activityEntries.id, response.activity_entry_id!));
    expect(entry.summary_en).toBe("Mira changed the agreed amount with Frame & Phera Studio from ₹1,10,000 to ₹1,25,000.");
  });

  it("M3 and M1 at the command: amount_mismatch, the IST date check and unknown ids", async () => {
    const mismatch = err(
      await run(mira, "record_commitment", {
        vendor_id: id("vendors", "VEN-CAT"),
        pricing: "per_unit",
        unit: "plate",
        unit_price_inr: 800,
        quantity: 250,
        amount_inr: 210_000,
      }),
    );
    expect(mismatch).toMatchObject({ code: "amount_mismatch", field: "amount_inr" });

    const future = err(await run(mira, "correct_payment", { payment_id: id("payments", "PAY-01"), expected_version: 1, paid_on: "2026-11-26" }));
    expect(future).toMatchObject({ code: "validation_failed", field: "paid_on" });

    const foreign = err(await run(mira, "correct_payment", { payment_id: randomUUID(), expected_version: 1, amount_inr: 40_000 }));
    expect(foreign).toMatchObject({ code: "not_found", field: "payment_id" });
    const otherCopy = err(await run(mira, "correct_payment", { payment_id: seededId("a", "payments", "PAY-01"), expected_version: 1, amount_inr: 40_000 }));
    expect(otherCopy.code).toBe("not_found");
  });

  it("M-01 (AT-6.3 records): a per-plate commitment fills its function and accepts the quote", async () => {
    // S0-like: void COM-01 so the caterer can sign a fresh contract on QUO-01's terms.
    await db.update(commitments).set({ voided_at: NOW }).where(eq(commitments.id, id("commitments", "COM-01")));
    await db.update(payments).set({ voided_at: NOW }).where(eq(payments.id, id("payments", "PAY-01")));
    const response = ok(
      await run(mira, "record_commitment", {
        vendor_id: id("vendors", "VEN-CAT"),
        pricing: "per_unit",
        unit: "plate",
        unit_price_inr: 800,
        quantity: 250,
      }),
    );
    const commitment_id = (response.result as { commitment_id: string }).commitment_id;
    const [version] = await db.select().from(commitmentVersions).where(eq(commitmentVersions.commitment_id, commitment_id));
    expect(version).toMatchObject({ amount_inr: 200_000, event_id: id("events", "EVT-REC"), agreed_on: "2026-11-25", version_no: 1 });
    expect(response.result).toMatchObject({ vendor_totals: { committed_inr: 200_000 } });
    const [entry] = await db.select().from(activityEntries).where(eq(activityEntries.id, response.activity_entry_id!));
    expect(entry.summary_en).toBe("Mira agreed ₹2,00,000 with Annapoorna Caterers (250 plates × ₹800).");
  });

  it("void_payment (C9): stays listed and leaves every total; a second void is payment_void", async () => {
    const PAY_03 = id("payments", "PAY-03");
    const response = ok(await run(mira, "void_payment", { payment_id: PAY_03, expected_version: 1, void_reason: "Bounced" }));
    expect(response.result).toMatchObject({ vendor_totals: { paid_inr: 0, outstanding_inr: 150_000 } });
    expect((await totals()).total_paid_inr).toBe(347_000);
    expect(await paymentVersionsOf(PAY_03)).toHaveLength(1);
    expect(err(await run(mira, "void_payment", { payment_id: PAY_03, expected_version: 1 })).code).toBe("payment_void");
    expect(err(await run(mira, "correct_payment", { payment_id: PAY_03, expected_version: 1, amount_inr: 1 })).code).toBe("payment_void");
  });

  it("vendors (AT-6.5): duplicate names answer duplicate_vendor with the existing vendor", async () => {
    const duplicate = err(await run(diya, "add_vendor", { name: " annapoorna caterers ", vendor_category: "catering" }));
    expect(duplicate).toMatchObject({ code: "duplicate_vendor", current: { vendor_id: id("vendors", "VEN-CAT"), name: "Annapoorna Caterers" } });
    const added = ok(await run(diya, "add_vendor", { name: "Shehnai Duo", vendor_category: "music", event_ids: [id("events", "EVT-WED")] }));
    const [entry] = await db.select().from(activityEntries).where(eq(activityEntries.id, added.activity_entry_id!));
    expect(entry).toMatchObject({ visibility: "members", summary_en: "Diya added the vendor Shehnai Duo (Music and entertainment)." });
    // A vendor with money keeps its category.
    const locked = err(await run(diya, "update_vendor", { vendor_id: id("vendors", "VEN-CAT"), vendor_category: "decor" }));
    expect(locked).toMatchObject({ code: "validation_failed", field: "vendor_category" });
  });

  it("AT-5.7: Diya's payment becomes a proposal; direct is approval_required", async () => {
    const direct = err(await run(diya, "record_payment", { vendor_id: id("vendors", "VEN-DEC"), amount_inr: 20_000, payment_kind: "instalment" }));
    expect(direct.code).toBe("approval_required");

    const proposed = ok(
      await run(diya, "propose_change", {
        command: "record_payment",
        input: { vendor_id: id("vendors", "VEN-DEC"), amount_inr: 20_000, payment_kind: "instalment" },
      }),
    );
    expect(proposed.outcome).toBe("proposed");
    const proposal_id = (proposed.result as { proposal_id: string }).proposal_id;
    expect(proposed.proposal_id).toBe(proposal_id);
    const [row] = await db.select().from(proposals).where(eq(proposals.id, proposal_id));
    expect(row).toMatchObject({
      command: "record_payment",
      status: "pending",
      committed_delta_inr: 0,
      paid_delta_inr: 20_000,
      vendor_id: id("vendors", "VEN-DEC"),
      budget_category: "decor",
      summary_en: "a payment of ₹20,000 to Marigold Lane Decor",
    });
    const [entry] = await db.select().from(activityEntries).where(eq(activityEntries.id, proposed.activity_entry_id!));
    expect(entry).toMatchObject({
      visibility: "owners",
      proposal_id,
      summary_en: "Diya proposed a payment of ₹20,000 to Marigold Lane Decor. It needs an owner's approval.",
    });
    // A5: nothing changed.
    expect((await totals()).total_paid_inr).toBe(397_000);

    // Approval runs it as Mira, with " Proposed by Diya." (A6).
    const approved = ok(await run(mira, "approve_proposal", { proposal_id }));
    const [approvedEntry] = await db.select().from(activityEntries).where(eq(activityEntries.id, approved.activity_entry_id!));
    expect(approvedEntry).toMatchObject({
      topic: "payment.recorded",
      proposal_id,
      summary_en: "Mira recorded an instalment of ₹20,000 to Marigold Lane Decor. Proposed by Diya.",
    });
    expect((await totals()).total_paid_inr).toBe(417_000);
    expect(err(await run(mira, "approve_proposal", { proposal_id })).code).toBe("proposal_not_pending");
  });

  it("propose_change validates like the command: M3 and paid_in_full inside a proposal", async () => {
    const mismatch = err(
      await run(diya, "propose_change", {
        command: "record_commitment",
        input: { vendor_id: id("vendors", "VEN-CAT"), pricing: "per_unit", unit: "plate", unit_price_inr: 800, quantity: 250, amount_inr: 210_000 },
      }),
    );
    expect(mismatch).toMatchObject({ code: "amount_mismatch", field: "input.amount_inr" });
    const noDefault = err(
      await run(diya, "propose_change", { command: "record_expense", input: { payee_name: "Shehnai", budget_category: "music", amount_inr: 9_000 } }),
    );
    expect(noDefault).toMatchObject({ code: "validation_failed", field: "input.paid_in_full", message: "required" });
  });

  it("AT-5.8: approving PRP-01 records the expense against a new one-off payee", async () => {
    const PRP_01 = id("proposals", "PRP-01");
    const response = ok(await run(mira, "approve_proposal", { proposal_id: PRP_01 }));
    const [entry] = await db.select().from(activityEntries).where(eq(activityEntries.id, response.activity_entry_id!));
    expect(entry).toMatchObject({
      topic: "expense.recorded",
      proposal_id: PRP_01,
      visibility: "owners",
      summary_en: "Mira recorded an expense of ₹15,000 to Dhol player (Music and entertainment). Proposed by Diya.",
    });
    const [vendor] = await db
      .select()
      .from(vendors)
      .where(and(eq(vendors.wedding_id, wedding_id), sql`lower(${vendors.name}) = 'dhol player'`));
    expect(vendor).toMatchObject({ is_one_off: true, status: "booked", vendor_category: "music" });
    const vendorPayments = await db.select().from(payments).where(eq(payments.vendor_id, vendor.id));
    expect(vendorPayments).toHaveLength(0);
    const [row] = await db.select().from(proposals).where(eq(proposals.id, PRP_01));
    expect(row).toMatchObject({ status: "approved", decided_by_member_id: mira.member_id });
    expect(row.result_entity_id).not.toBeNull();
    expect(await totals()).toMatchObject({ total_committed_inr: 942_000, total_paid_inr: 397_000, total_outstanding_inr: 545_000 });
    expect(err(await run(mira, "approve_proposal", { proposal_id: PRP_01 })).code).toBe("proposal_not_pending");
    expect(err(await run(diya, "approve_proposal", { proposal_id: PRP_01 })).code).toBe("forbidden");
  });

  it("proposal_changed: a payee that now exists, or a renamed payee, leaves the proposal pending", async () => {
    const PRP_01 = id("proposals", "PRP-01");
    ok(await run(mira, "add_vendor", { name: "Dhol Player", vendor_category: "music" }));
    const changed = err(await run(mira, "approve_proposal", { proposal_id: PRP_01 }));
    expect(changed.code).toBe("proposal_changed");
    const [row] = await db.select().from(proposals).where(eq(proposals.id, PRP_01));
    expect(row.status).toBe("pending");

    // A proposal against an existing payee, then the payee is renamed.
    const proposed = ok(
      await run(diya, "propose_change", {
        command: "record_expense",
        input: { payee_name: "Dhol Player", budget_category: "music", amount_inr: 5_000, paid_in_full: true },
      }),
    );
    const proposal_id = (proposed.result as { proposal_id: string }).proposal_id;
    const [stored] = await db.select().from(proposals).where(eq(proposals.id, proposal_id));
    expect(stored.vendor_id).not.toBeNull();
    expect(stored).toMatchObject({ committed_delta_inr: 5_000, paid_delta_inr: 5_000, summary_en: "an expense of ₹5,000 to Dhol Player (Music and entertainment), paid in full" });
    ok(await run(diya, "update_vendor", { vendor_id: stored.vendor_id!, name: "Baraat Dhol Wala" }));
    expect(err(await run(mira, "approve_proposal", { proposal_id })).code).toBe("proposal_changed");
    const [still] = await db.select().from(proposals).where(eq(proposals.id, proposal_id));
    expect(still.status).toBe("pending");
  });

  it("stale proposals: a correction proposed at version 1 fails stale_version after another correction", async () => {
    const PAY_01 = id("payments", "PAY-01");
    const proposed = ok(
      await run(diya, "propose_change", { command: "correct_payment", input: { payment_id: PAY_01, expected_version: 1, amount_inr: 45_000 } }),
    );
    const proposal_id = (proposed.result as { proposal_id: string }).proposal_id;
    const [row] = await db.select().from(proposals).where(eq(proposals.id, proposal_id));
    expect(row).toMatchObject({ paid_delta_inr: -5_000, summary_en: "correcting the advance to Annapoorna Caterers from ₹50,000 to ₹45,000" });
    ok(await run(mira, "correct_payment", { payment_id: PAY_01, expected_version: 1, amount_inr: 40_000 }));
    expect(err(await run(mira, "approve_proposal", { proposal_id })).code).toBe("stale_version");
  });

  it("reject and withdraw (3.5)", async () => {
    const PRP_01 = id("proposals", "PRP-01");
    expect(err(await run(mira, "withdraw_proposal", { proposal_id: PRP_01 })).code).toBe("forbidden");
    const rejected = ok(await run(mira, "reject_proposal", { proposal_id: PRP_01, decision_reason: "Not this year" }));
    const [entry] = await db.select().from(activityEntries).where(eq(activityEntries.id, rejected.activity_entry_id!));
    expect(entry.summary_en).toBe("Mira declined Diya's proposal: an expense of ₹15,000 to Dhol player (Music and entertainment), not yet paid.");
    expect((await totals()).total_committed_inr).toBe(927_000);
    expect(err(await run(mira, "reject_proposal", { proposal_id: PRP_01 })).code).toBe("proposal_not_pending");

    const proposed = ok(
      await run(diya, "propose_change", { command: "record_payment", input: { vendor_id: id("vendors", "VEN-DJ"), amount_inr: 10_000, payment_kind: "instalment" } }),
    );
    const proposal_id = (proposed.result as { proposal_id: string }).proposal_id;
    const withdrawn = ok(await run(diya, "withdraw_proposal", { proposal_id }));
    const [withdrawEntry] = await db.select().from(activityEntries).where(eq(activityEntries.id, withdrawn.activity_entry_id!));
    expect(withdrawEntry.summary_en).toBe("Diya withdrew the proposal: a payment of ₹10,000 to Bass Baraat Sound.");
  });

  it("set_budget_line: upserts, and the same value again is unchanged", async () => {
    const response = ok(await run(mira, "set_budget_line", { budget_category: "catering", planned_inr: 250_000 }));
    const [entry] = await db.select().from(activityEntries).where(eq(activityEntries.id, response.activity_entry_id!));
    expect(entry).toMatchObject({ visibility: "owners", topic: "budget.updated", summary_en: "Mira set the Catering budget to ₹2,50,000 (was ₹2,40,000)." });
    expect(ok(await run(mira, "set_budget_line", { budget_category: "catering", planned_inr: 250_000 })).outcome).toBe("unchanged");
    expect(err(await run(diya, "set_budget_line", { budget_category: "catering", planned_inr: 1 })).code).toBe("forbidden");
  });

  it("only one version is ever current (C1)", async () => {
    ok(await run(mira, "correct_payment", { payment_id: id("payments", "PAY-01"), expected_version: 1, amount_inr: 40_000 }));
    ok(await run(mira, "update_commitment", { commitment_id: id("commitments", "COM-04"), expected_version: 1, amount_inr: 125_000 }));
    const paymentCurrent = await db
      .select({ payment_id: paymentVersions.payment_id, n: sql<number>`count(*)::bigint` })
      .from(paymentVersions)
      .where(and(eq(paymentVersions.wedding_id, wedding_id), isNull(paymentVersions.superseded_at)))
      .groupBy(paymentVersions.payment_id);
    expect(paymentCurrent.every((row) => Number(row.n) === 1)).toBe(true);
    const commitmentCurrent = await db
      .select({ commitment_id: commitmentVersions.commitment_id, n: sql<number>`count(*)::bigint` })
      .from(commitmentVersions)
      .where(and(eq(commitmentVersions.wedding_id, wedding_id), isNull(commitmentVersions.superseded_at)))
      .groupBy(commitmentVersions.commitment_id);
    expect(commitmentCurrent.every((row) => Number(row.n) === 1)).toBe(true);
  });

  it("acceptance 4.3 corrections row: v1 applies; the same with v1 is stale_version; with v2 it is unchanged", async () => {
    const PAY_01 = id("payments", "PAY-01");
    expect(ok(await run(mira, "correct_payment", { payment_id: PAY_01, expected_version: 1, amount_inr: 40_000 })).outcome).toBe("applied");
    const before = await versionOf();
    const entriesBefore = await activityCount();
    expect(err(await run(mira, "correct_payment", { payment_id: PAY_01, expected_version: 1, amount_inr: 40_000 })).code).toBe("stale_version");
    expect(ok(await run(mira, "correct_payment", { payment_id: PAY_01, expected_version: 2, amount_inr: 40_000 })).outcome).toBe("unchanged");
    expect(await versionOf()).toBe(before);
    expect(await activityCount()).toBe(entriesBefore);
    expect(await paymentVersionsOf(PAY_01)).toHaveLength(2);
  });

  it("void_commitment: the contract leaves every total, its payment stays, and the vendor reads overpaid", async () => {
    const COM_01 = id("commitments", "COM-01");
    const response = ok(await run(mira, "void_commitment", { commitment_id: COM_01, expected_version: 1, void_reason: "Renegotiating" }));
    expect(response.result).toMatchObject({
      commitment_id: COM_01,
      vendor_totals: { committed_inr: 0, paid_inr: 50_000, outstanding_inr: 0, overpaid_inr: 50_000 },
    });
    expect(response.warnings.map((warning) => warning.kind)).toEqual(["overpaid"]);
    expect(await totals()).toMatchObject({ total_committed_inr: 727_000, total_paid_inr: 397_000, total_outstanding_inr: 380_000, total_overpaid_inr: 50_000 });
    const [entry] = await db.select().from(activityEntries).where(eq(activityEntries.id, response.activity_entry_id!));
    expect(entry).toMatchObject({
      topic: "commitment.voided",
      visibility: "owners",
      summary_en: "Mira cancelled the ₹2,00,000 commitment with Annapoorna Caterers.",
    });
    expect(err(await run(mira, "void_commitment", { commitment_id: COM_01, expected_version: 1 })).code).toBe("commitment_void");
    expect(err(await run(mira, "update_commitment", { commitment_id: COM_01, expected_version: 1, quantity: 260 })).code).toBe("commitment_void");
  });

  it("update_commitment on a per-unit contract recomputes the amount (M3) and checks a sent amount", async () => {
    const COM_01 = id("commitments", "COM-01");
    const response = ok(await run(mira, "update_commitment", { commitment_id: COM_01, expected_version: 1, quantity: 260 }));
    expect(response.result).toMatchObject({ version_no: 2, vendor_totals: { committed_inr: 208_000, outstanding_inr: 158_000 } });
    const [entry] = await db.select().from(activityEntries).where(eq(activityEntries.id, response.activity_entry_id!));
    expect(entry.summary_en).toBe("Mira changed the agreed amount with Annapoorna Caterers from ₹2,00,000 to ₹2,08,000.");
    const mismatch = err(await run(mira, "update_commitment", { commitment_id: COM_01, expected_version: 2, amount_inr: 210_000 }));
    expect(mismatch).toMatchObject({ code: "amount_mismatch", field: "amount_inr" });
  });

  it("record_expense by an owner: a one-off payee with a lump-sum commitment and a final payment", async () => {
    const response = ok(
      await run(mira, "record_expense", {
        payee_name: "Tent House (fictional)",
        budget_category: "transport",
        amount_inr: 8_000,
        paid_on: "2026-11-24",
        method: "cash",
      }),
    );
    const result = response.result as { vendor_id: string; commitment_id: string; payment_id: string | null };
    expect(response.result).toMatchObject({ vendor_totals: { committed_inr: 8_000, paid_inr: 8_000, outstanding_inr: 0 } });
    expect(result.payment_id).not.toBeNull();
    // Committed and paid rise together, so outstanding is unchanged (3.3).
    expect(await totals()).toMatchObject({ total_committed_inr: 935_000, total_paid_inr: 405_000, total_outstanding_inr: 530_000 });
    const [vendor] = await db.select().from(vendors).where(eq(vendors.id, result.vendor_id));
    expect(vendor).toMatchObject({ is_one_off: true, status: "booked", vendor_category: "transport" });
    const [payment] = await db.select().from(payments).where(eq(payments.id, result.payment_id!));
    expect(payment).toMatchObject({ payment_kind: "final", commitment_id: result.commitment_id });
    const [entry] = await db.select().from(activityEntries).where(eq(activityEntries.id, response.activity_entry_id!));
    expect(entry).toMatchObject({
      topic: "expense.recorded",
      visibility: "owners",
      summary_en: "Mira recorded an expense of ₹8,000 to Tent House (fictional) (Transport and logistics).",
    });

    // The category check names the existing vendor.
    const mismatch = err(await run(mira, "record_expense", { payee_name: "annapoorna caterers", budget_category: "decor", amount_inr: 1_000 }));
    expect(mismatch).toMatchObject({
      code: "validation_failed",
      field: "budget_category",
      current: { vendor_id: id("vendors", "VEN-CAT"), vendor_category: "catering" },
    });
    const future = err(await run(mira, "record_expense", { payee_name: "Tent House (fictional)", budget_category: "transport", amount_inr: 1_000, paid_on: "2026-11-26" }));
    expect(future).toMatchObject({ code: "validation_failed", field: "paid_on" });
  });

  it("add_quote never counts, and record_payment refuses another vendor's commitment", async () => {
    const response = ok(
      await run(mira, "add_quote", { vendor_id: id("vendors", "VEN-CAT"), pricing: "per_unit", unit: "plate", unit_price_inr: 900, quantity: 250 }),
    );
    expect(response.result).toMatchObject({ amount_inr: 225_000, vendor_totals: { committed_inr: 200_000 } });
    const [entry] = await db.select().from(activityEntries).where(eq(activityEntries.id, response.activity_entry_id!));
    expect(entry).toMatchObject({ topic: "quote.added", visibility: "owners", summary_en: "Mira added a quote from Annapoorna Caterers: ₹2,25,000." });
    expect((await totals()).total_committed_inr).toBe(927_000);

    const wrong = err(
      await run(mira, "record_payment", {
        vendor_id: id("vendors", "VEN-CAT"),
        amount_inr: 1_000,
        payment_kind: "instalment",
        commitment_id: id("commitments", "COM-04"),
      }),
    );
    expect(wrong).toMatchObject({ code: "validation_failed", field: "commitment_id" });
  });

  it("AT-8.4: every gated command is approval_required for Diya; Mira's propose_change is forbidden", async () => {
    const VEN_CAT = id("vendors", "VEN-CAT");
    const PAY_01 = id("payments", "PAY-01");
    const COM_01 = id("commitments", "COM-01");
    const gated: [CommandName, Record<string, unknown>][] = [
      ["record_commitment", { vendor_id: VEN_CAT, pricing: "lump_sum", amount_inr: 1_000 }],
      ["update_commitment", { commitment_id: COM_01, expected_version: 1, quantity: 260 }],
      ["void_commitment", { commitment_id: COM_01, expected_version: 1 }],
      ["record_payment", { vendor_id: VEN_CAT, amount_inr: 1_000, payment_kind: "instalment" }],
      ["correct_payment", { payment_id: PAY_01, expected_version: 1, amount_inr: 40_000 }],
      ["void_payment", { payment_id: PAY_01, expected_version: 1 }],
      ["record_expense", { payee_name: "Shehnai Duo", budget_category: "music", amount_inr: 9_000 }],
    ];
    const before = await versionOf();
    for (const [command, input] of gated) {
      expect(err(await run(diya, command, input)).code, command).toBe("approval_required");
    }
    expect(
      err(await run(mira, "propose_change", { command: "record_payment", input: { vendor_id: VEN_CAT, amount_inr: 1_000, payment_kind: "instalment" } })).code,
    ).toBe("forbidden");
    expect(await versionOf()).toBe(before);
  });

  it("M-08 proposed by Diya and approved: COM-04 version 2, created by Mira, with the over_budget warning", async () => {
    const COM_04 = id("commitments", "COM-04");
    const proposed = ok(await run(diya, "propose_change", { command: "update_commitment", input: { commitment_id: COM_04, expected_version: 1, amount_inr: 125_000 } }));
    const proposal_id = (proposed.result as { proposal_id: string }).proposal_id;
    const [row] = await db.select().from(proposals).where(eq(proposals.id, proposal_id));
    expect(row).toMatchObject({
      committed_delta_inr: 15_000,
      paid_delta_inr: 0,
      budget_category: "photography",
      summary_en: "changing the agreed amount with Frame & Phera Studio from ₹1,10,000 to ₹1,25,000",
    });
    expect((await totals()).total_committed_inr).toBe(927_000);
    const approved = ok(await run(mira, "approve_proposal", { proposal_id }));
    expect(approved.warnings.map((warning) => warning.kind)).toContain("over_budget");
    const versions = await db
      .select()
      .from(commitmentVersions)
      .where(eq(commitmentVersions.commitment_id, COM_04))
      .orderBy(asc(commitmentVersions.version_no));
    expect(versions.map((version) => [version.version_no, version.amount_inr, version.created_by_member_id])).toEqual([
      [1, 110_000, versions[0].created_by_member_id],
      [2, 125_000, mira.member_id],
    ]);
    const [entry] = await db.select().from(activityEntries).where(eq(activityEntries.id, approved.activity_entry_id!));
    expect(entry).toMatchObject({
      topic: "commitment.updated",
      proposal_id,
      summary_en: "Mira changed the agreed amount with Frame & Phera Studio from ₹1,10,000 to ₹1,25,000. Proposed by Diya.",
    });
    expect((await totals()).total_committed_inr).toBe(942_000);
  });

  it("G7 and 3.5: without vendor-dues sharing, Diya's quotes and money proposals are refused, but an expense proposal goes through", async () => {
    await db.update(weddings).set({ managers_can_see_vendor_dues: false }).where(eq(weddings.id, wedding_id));
    try {
      expect(
        err(await run(diya, "add_quote", { vendor_id: id("vendors", "VEN-CAT"), pricing: "lump_sum", amount_inr: 10_000 })).code,
      ).toBe("forbidden");
      expect(
        err(
          await run(diya, "propose_change", {
            command: "record_payment",
            input: { vendor_id: id("vendors", "VEN-DEC"), amount_inr: 20_000, payment_kind: "instalment" },
          }),
        ).code,
      ).toBe("forbidden");
      const expense = ok(
        await run(diya, "propose_change", {
          command: "record_expense",
          input: { payee_name: "Shehnai Duo", budget_category: "music", amount_inr: 9_000, paid_in_full: false },
        }),
      );
      expect(expense.outcome).toBe("proposed");
      expect(expense.result).toEqual({ proposal_id: expect.any(String) });
    } finally {
      await db.update(weddings).set({ managers_can_see_vendor_dues: true }).where(eq(weddings.id, wedding_id));
    }
  });
});
