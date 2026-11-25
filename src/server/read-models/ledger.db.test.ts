import { and, eq, isNull } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { SessionActor } from "@/contracts/domain";
import { createDb, type Db, type Tx } from "@/db/client";
import { seededId } from "@/db/ids";
import { budgetLines, commitmentVersions, commitments, paymentVersions, payments, proposals, vendors, weddings } from "@/db/schema";
import { localDatabaseUrl } from "@/db/testing";
import { applySeedState } from "@/db/seed-apply";
import { buildSeedDataset, fallbackUserId, seedAccounts } from "@/db/seed-data";

import { buildCateringEstimate } from "./catering-estimate";
import { moneyWarnings, totalsBalance, vendorTotals } from "./ledger-math";
import { buildMoneySummary } from "./money-summary";
import { buildProposals } from "./proposals";
import { buildVendorLedger } from "./vendor-ledger";

/**
 * Lane A's money read models against the seeded D0 state (npm run test:db). Copy `e2e` only
 * (copies share fixed ids, so each worker keeps to its own copy). Every change a test makes
 * runs inside a transaction that is rolled back, so the copy stays at D0.
 */

const COPY = "e2e" as const;
const NOW = new Date("2026-11-25T10:00:00+05:30");

let db: Db;
let close: () => Promise<void>;
let wedding_id: string;
let mira: SessionActor;
let diya: SessionActor;

const id = (table: string, key: string) => seededId(COPY, table, key);

function actorFor(email: string, display_name: string, role: "owner" | "manager", member_id: string): SessionActor {
  return {
    kind: "member",
    user_id: fallbackUserId(email),
    email,
    display_name,
    wedding_id,
    member_id,
    role,
    is_internal: true,
    is_first_wedding: false,
    preferred_language: "en",
  };
}

class Rollback extends Error {}

/** Runs `body` in a transaction that is always rolled back. */
async function inRollback(body: (tx: Tx) => Promise<void>): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      await tx.select({ id: weddings.id }).from(weddings).where(eq(weddings.id, wedding_id)).for("update");
      await body(tx);
      throw new Rollback();
    });
  } catch (error) {
    if (!(error instanceof Rollback)) throw error;
  }
}

/** C2's order: supersede version n, insert n+1, then link it and move the identity row. */
async function correctPayment(tx: Tx, payment_key: string, amount_inr: number, member_id: string): Promise<void> {
  const payment_id = id("payments", payment_key);
  const [current] = await tx
    .select()
    .from(paymentVersions)
    .where(and(eq(paymentVersions.payment_id, payment_id), isNull(paymentVersions.superseded_at)));
  const at = new Date(NOW.getTime() + 60_000);
  await tx.update(paymentVersions).set({ superseded_at: at }).where(eq(paymentVersions.id, current.id));
  const [next] = await tx
    .insert(paymentVersions)
    .values({
      wedding_id,
      payment_id,
      version_no: current.version_no + 1,
      amount_inr,
      paid_on: current.paid_on,
      method: current.method,
      note: current.note,
      change_reason: "Advance was ₹40,000, not ₹50,000",
      source: "ui",
      created_by_member_id: member_id,
      created_at: at,
    })
    .returning({ id: paymentVersions.id });
  await tx.update(paymentVersions).set({ superseded_by_version_id: next.id }).where(eq(paymentVersions.id, current.id));
  await tx.update(payments).set({ current_version_no: current.version_no + 1 }).where(eq(payments.id, payment_id));
}

async function updateCommitmentAmount(tx: Tx, commitment_key: string, amount_inr: number, member_id: string): Promise<void> {
  const commitment_id = id("commitments", commitment_key);
  const [current] = await tx
    .select()
    .from(commitmentVersions)
    .where(and(eq(commitmentVersions.commitment_id, commitment_id), isNull(commitmentVersions.superseded_at)));
  const at = new Date(NOW.getTime() + 60_000);
  await tx.update(commitmentVersions).set({ superseded_at: at }).where(eq(commitmentVersions.id, current.id));
  const { id: _old, superseded_at: _s, superseded_by_version_id: _b, seed_key: _k, created_at: _c, ...values } = current;
  void [_old, _s, _b, _k, _c];
  const [next] = await tx
    .insert(commitmentVersions)
    .values({ ...values, version_no: current.version_no + 1, amount_inr, source: "ui", created_by_member_id: member_id, created_at: at })
    .returning({ id: commitmentVersions.id });
  await tx.update(commitmentVersions).set({ superseded_by_version_id: next.id }).where(eq(commitmentVersions.id, current.id));
  await tx.update(commitments).set({ current_version_no: current.version_no + 1 }).where(eq(commitments.id, commitment_id));
}

beforeAll(async () => {
  const url = localDatabaseUrl();
  if (!url) return; // skipped: not a local database
  const created = createDb(url, { max: 2 });
  db = created.db;
  close = () => created.client.end();

  const accounts = seedAccounts(COPY);
  const user_ids = Object.fromEntries(accounts.map((account) => [account.email, fallbackUserId(account.email)]));
  const dataset = buildSeedDataset(COPY, { user_ids });
  wedding_id = dataset.wedding_id;
  await db.transaction((tx) => applySeedState(tx, dataset, { now: NOW }));

  const owner = accounts.find((account) => account.role === "owner" && account.display_name === "Mira") ?? accounts[0];
  const manager = accounts.find((account) => account.role === "manager");
  if (!manager) throw new Error("no manager account");
  mira = actorFor(owner.email, owner.display_name, "owner", id("members", owner.member_key));
  diya = actorFor(manager.email, manager.display_name, "manager", id("members", manager.member_key));
}, 60_000);

afterAll(async () => {
  await close?.();
});

describe.skipIf(!localDatabaseUrl())("money_summary at D0 (AT-5.1)", () => {
  it("gives the owner the totals, the category lines and the vendor rows", async () => {
    const summary = await buildMoneySummary(db, mira, wedding_id, {}, { now: NOW });
    expect(summary.hidden).toEqual([]);
    expect(Number.isSafeInteger(summary.version)).toBe(true);
    expect(summary.totals).toEqual({
      total_committed_inr: 927_000,
      total_paid_inr: 397_000,
      total_outstanding_inr: 530_000,
      total_overpaid_inr: 0,
      budget_inr: 1_200_000,
      uncommitted_inr: 273_000,
      over_budget_inr: 0,
      unallocated_inr: 0,
      pending_proposals_inr: 15_000,
      if_approved_committed_inr: 942_000,
    });

    const lines = Object.fromEntries((summary.categories ?? []).map((line) => [line.label, line]));
    expect(summary.categories?.map((line) => line.label)).toEqual([
      "Venue and halls",
      "Catering",
      "Decor and flowers",
      "Photography and video",
      "Attire and jewellery",
      "Music and entertainment",
      "Mehendi and makeup",
      "Invitations and gifts",
      "Transport and logistics",
      "Contingency",
    ]);
    const table: [string, number, number, number, number, number][] = [
      ["Venue and halls", 300_000, 280_000, 140_000, 140_000, 20_000],
      ["Catering", 240_000, 200_000, 50_000, 150_000, 40_000],
      ["Decor and flowers", 160_000, 150_000, 50_000, 100_000, 10_000],
      ["Photography and video", 120_000, 110_000, 30_000, 80_000, 10_000],
      ["Attire and jewellery", 150_000, 95_000, 95_000, 0, 55_000],
      ["Music and entertainment", 70_000, 55_000, 15_000, 40_000, 15_000],
      ["Mehendi and makeup", 50_000, 25_000, 5_000, 20_000, 25_000],
      ["Invitations and gifts", 40_000, 12_000, 12_000, 0, 28_000],
      ["Transport and logistics", 30_000, 0, 0, 0, 30_000],
      ["Contingency", 40_000, 0, 0, 0, 40_000],
    ];
    for (const [label, planned, committed, paid, outstanding, uncommitted] of table) {
      expect(lines[label], label).toMatchObject({
        has_line: true,
        planned_inr: planned,
        committed_inr: committed,
        paid_inr: paid,
        outstanding_inr: outstanding,
        uncommitted_inr: uncommitted,
        over_budget_inr: 0,
      });
    }
    // PRP-01 (Dhol player, ₹15,000) is in Music's if-approved figure and in no total.
    expect(lines["Music and entertainment"].pending_proposals_inr).toBe(15_000);

    const vendors = Object.fromEntries((summary.vendors ?? []).map((row) => [row.seed_key, row]));
    expect(summary.vendors?.map((row) => row.seed_key)).toEqual(["VEN-CAT", "VEN-VEN", "VEN-DEC", "VEN-PHO", "VEN-MEH", "VEN-DJ", "VEN-PRN", "VEN-BTQ"]);
    expect(vendors["VEN-CAT"]).toMatchObject({
      name: "Annapoorna Caterers",
      committed_inr: 200_000,
      paid_inr: 50_000,
      outstanding_inr: 150_000,
      overpaid_inr: 0,
      next_due_on: "2026-12-12",
      due_state: "upcoming",
    });
    expect(vendors["VEN-VEN"]).toMatchObject({ next_due_on: "2026-12-01", days_until_due: 6, due_state: "due_soon" });
    expect((summary.vendors ?? []).filter((row) => row.due_state === "due_soon").map((row) => row.seed_key)).toEqual(["VEN-VEN"]);
    for (const key of ["VEN-PRN", "VEN-BTQ"]) {
      expect(vendors[key]).toMatchObject({ is_one_off: true, outstanding_inr: 0, next_due_on: null, days_until_due: null, due_state: "none" });
    }
    expect(totalsBalance(summary.totals!)).toBe(true);
  });

  it("gives the seeded manager the vendor rows but not the budget (AT-5.9)", async () => {
    const summary = await buildMoneySummary(db, diya, wedding_id, {}, { now: NOW });
    expect(summary.hidden).toEqual(["budget"]);
    expect(summary).not.toHaveProperty("totals");
    expect(summary).not.toHaveProperty("categories");
    expect(summary.vendors).toHaveLength(8);
  });
});

describe.skipIf(!localDatabaseUrl())("vendor_ledger for Annapoorna Caterers (AT-6.1, AT-5.2)", () => {
  it("shows the D0 contract, the advance, the quote and the estimate", async () => {
    const ledger = await buildVendorLedger(db, mira, wedding_id, { vendor_id: id("vendors", "VEN-CAT") });
    expect(ledger.hidden).toEqual([]);
    expect(ledger.vendor).toMatchObject({ name: "Annapoorna Caterers", vendor_category: "catering", status: "booked", contact_name: "Suresh" });
    expect(ledger.vendor.functions.map((event) => event.title)).toEqual(["Reception"]);
    expect(ledger.figures).toEqual({ committed_inr: 200_000, paid_inr: 50_000, outstanding_inr: 150_000, overpaid_inr: 0 });
    expect(ledger.quotes).toMatchObject([{ seed_key: "QUO-01", amount_inr: 212_500, status: "accepted", unit_price_inr: 850, quantity: 250 }]);
    expect(ledger.commitments).toMatchObject([
      { seed_key: "COM-01", version_no: 1, version_count: 1, amount_inr: 200_000, formula_text: "250 plates × ₹800 = ₹2,00,000", due_on: "2026-12-12", voided: false },
    ]);
    expect(ledger.payments).toMatchObject([
      { seed_key: "PAY-01", payment_kind: "advance", version_no: 1, version_count: 1, amount_inr: 50_000, paid_on: "2026-11-20", method: "upi", previous_amount_inr: null, corrected_by: null, voided: false },
    ]);
    expect(ledger.history?.map((entry) => entry.seed_key)).toEqual(["COM-01/v1", "PAY-01/v1"]);
    expect(ledger.estimate).toMatchObject([
      { seed_key: "COM-01", confirmed_headcount: 229, estimate_inr: 183_200, difference_inr: 16_800, direction: "below", contract_amount_inr: 200_000 },
    ]);
  });

  it("keeps the trail after PAY-01 is corrected to ₹40,000 (D1)", async () => {
    await inRollback(async (tx) => {
      await correctPayment(tx, "PAY-01", 40_000, mira.member_id!);
      const ledger = await buildVendorLedger(tx, mira, wedding_id, { vendor_id: id("vendors", "VEN-CAT") });
      expect(ledger.payments).toHaveLength(1);
      expect(ledger.payments?.[0]).toMatchObject({
        seed_key: "PAY-01",
        version_no: 2,
        version_count: 2,
        amount_inr: 40_000,
        previous_amount_inr: 50_000,
        corrected_by: "Mira",
      });
      expect(ledger.payments?.[0].corrected_at).toMatch(/\+05:30$/);
      expect(ledger.history?.filter((entry) => entry.entity === "payment").map((entry) => [entry.version_no, entry.values.amount_inr, entry.source])).toEqual([
        [1, 50_000, "seed"],
        [2, 40_000, "ui"],
      ]);
      expect(ledger.figures).toEqual({ committed_inr: 200_000, paid_inr: 40_000, outstanding_inr: 160_000, overpaid_inr: 0 });
      expect(await vendorTotals(tx, wedding_id, id("vendors", "VEN-CAT"))).toEqual(ledger.figures);

      const summary = await buildMoneySummary(tx, mira, wedding_id, {}, { now: NOW });
      expect(summary.totals).toMatchObject({ total_paid_inr: 387_000, total_outstanding_inr: 540_000 });
      expect(await moneyWarnings(tx, wedding_id, id("vendors", "VEN-CAT"))).toEqual([]);
    });
  });

  it("warns overpaid, and one overpaid vendor never hides another's due (AT-6.4)", async () => {
    await inRollback(async (tx) => {
      await correctPayment(tx, "PAY-01", 40_000, mira.member_id!);
      const [payment] = await tx
        .insert(payments)
        .values({ wedding_id, vendor_id: id("vendors", "VEN-CAT"), commitment_id: id("commitments", "COM-01"), payment_kind: "instalment" })
        .returning({ id: payments.id });
      await tx.insert(paymentVersions).values({ wedding_id, payment_id: payment.id, version_no: 1, amount_inr: 170_000, source: "ui", created_by_member_id: mira.member_id });

      expect(await vendorTotals(tx, wedding_id, id("vendors", "VEN-CAT"))).toEqual({
        committed_inr: 200_000,
        paid_inr: 210_000,
        outstanding_inr: 0,
        overpaid_inr: 10_000,
      });
      expect(await moneyWarnings(tx, wedding_id, id("vendors", "VEN-CAT"), { kinds: ["overpaid"] })).toEqual([
        { kind: "overpaid", message: "Annapoorna Caterers has been overpaid by ₹10,000.", entity_ids: [id("vendors", "VEN-CAT")] },
      ]);
      const summary = await buildMoneySummary(tx, mira, wedding_id, {}, { now: NOW });
      expect(summary.totals).toMatchObject({ total_outstanding_inr: 380_000, total_overpaid_inr: 10_000 });
      expect(summary.totals!.total_outstanding_inr - summary.totals!.total_overpaid_inr).toBe(
        summary.totals!.total_committed_inr - summary.totals!.total_paid_inr,
      );
      const caterer = summary.vendors?.find((row) => row.seed_key === "VEN-CAT");
      expect(caterer).toMatchObject({ outstanding_inr: 0, overpaid_inr: 10_000, next_due_on: null, due_state: "none" });
    });
  });

  it("warns over budget when COM-04 goes to ₹1,25,000 (M-08)", async () => {
    await inRollback(async (tx) => {
      await updateCommitmentAmount(tx, "COM-04", 125_000, mira.member_id!);
      const warnings = await moneyWarnings(tx, wedding_id, id("vendors", "VEN-PHO"));
      expect(warnings.map((warning) => [warning.kind, warning.message])).toEqual([
        ["over_budget", "Photography and video is ₹5,000 over its ₹1,20,000 budget."],
      ]);
      const summary = await buildMoneySummary(tx, mira, wedding_id, {}, { now: NOW });
      expect(summary.totals).toMatchObject({ total_committed_inr: 942_000, uncommitted_inr: 258_000 });
      expect(summary.categories?.find((line) => line.budget_category === "photography")).toMatchObject({ over_budget_inr: 5_000, uncommitted_inr: 0 });
      // The voided commitment leaves every total; its payment still counts as paid.
      await tx.update(commitments).set({ voided_at: NOW }).where(eq(commitments.id, id("commitments", "COM-04")));
      expect(await vendorTotals(tx, wedding_id, id("vendors", "VEN-PHO"))).toEqual({
        committed_inr: 0,
        paid_inr: 30_000,
        outstanding_inr: 0,
        overpaid_inr: 30_000,
      });
    });
  });
});

describe.skipIf(!localDatabaseUrl())("catering_estimate and proposals at D0", () => {
  it("shows the estimate beside the contract (AT-6.1, E1–E6)", async () => {
    const model = await buildCateringEstimate(db, mira, wedding_id, {});
    expect(model.hidden).toEqual([]);
    expect(model.rows).toEqual([
      expect.objectContaining({
        seed_key: "COM-01",
        vendor_name: "Annapoorna Caterers",
        event_title: "Reception",
        unit: "plate",
        unit_price_inr: 800,
        contract_amount_inr: 200_000,
        contract_quantity: 250,
        expected_headcount: 250,
        confirmed_headcount: 229,
        estimate_inr: 183_200,
        difference_inr: 16_800,
        direction: "below",
        formula_text: "229 attending × ₹800",
        label: "Estimate, not the contract",
        label_hi: "अंदाज़ा, कॉन्ट्रैक्ट नहीं",
      }),
    ]);
  });

  it("lists PRP-01 for the owner and for Diya, who proposed it (A7)", async () => {
    for (const actor of [mira, diya]) {
      const model = await buildProposals(db, actor, wedding_id, {});
      expect(model.proposals).toHaveLength(1);
      expect(model.proposals[0]).toMatchObject({
        seed_key: "PRP-01",
        command: "record_expense",
        status: "pending",
        committed_delta_inr: 15_000,
        paid_delta_inr: 0,
        proposed_by: "Diya",
        decided_by: null,
      });
      expect(model.proposals[0].summary_en.endsWith(", not yet paid")).toBe(true);
    }
    expect((await buildProposals(db, mira, wedding_id, { status: "approved" })).proposals).toEqual([]);
  });
});

describe.skipIf(!localDatabaseUrl())("undo, void and approval (acceptance 4.3, C7, C9, AT-5.8)", () => {
  it("an undo is version 3 with version 2 struck through and kept in History", async () => {
    await inRollback(async (tx) => {
      await correctPayment(tx, "PAY-01", 40_000, mira.member_id!);
      await correctPayment(tx, "PAY-01", 50_000, mira.member_id!);
      const ledger = await buildVendorLedger(tx, mira, wedding_id, { vendor_id: id("vendors", "VEN-CAT") });
      expect(ledger.payments?.[0]).toMatchObject({ version_no: 3, version_count: 3, amount_inr: 50_000, previous_amount_inr: 40_000 });
      expect(ledger.history?.filter((entry) => entry.entity === "payment").map((entry) => entry.values.amount_inr)).toEqual([50_000, 40_000, 50_000]);
      expect(ledger.figures?.outstanding_inr).toBe(150_000);
    });
  });

  it("a voided payment stays listed and leaves every total", async () => {
    await inRollback(async (tx) => {
      await tx.update(payments).set({ voided_at: NOW, void_reason: "Wrong vendor" }).where(eq(payments.id, id("payments", "PAY-01")));
      const ledger = await buildVendorLedger(tx, mira, wedding_id, { vendor_id: id("vendors", "VEN-CAT") });
      expect(ledger.payments).toMatchObject([{ seed_key: "PAY-01", voided: true, void_reason: "Wrong vendor", amount_inr: 50_000 }]);
      expect(ledger.history?.map((entry) => entry.seed_key)).toEqual(["COM-01/v1", "PAY-01/v1"]);
      expect(ledger.figures).toEqual({ committed_inr: 200_000, paid_inr: 0, outstanding_inr: 200_000, overpaid_inr: 0 });
      const summary = await buildMoneySummary(tx, mira, wedding_id, {}, { now: NOW });
      expect(summary.totals).toMatchObject({ total_committed_inr: 927_000, total_paid_inr: 347_000, total_outstanding_inr: 580_000 });
      expect(summary.categories?.find((line) => line.budget_category === "catering")).toMatchObject({ paid_inr: 0, outstanding_inr: 200_000 });
    });
  });

  it("an approved PRP-01 leaves the pending figures and lands in Music (AT-5.8)", async () => {
    await inRollback(async (tx) => {
      const [dhol] = await tx
        .insert(vendors)
        .values({ wedding_id, name: "Dhol player", vendor_category: "music", is_one_off: true, status: "booked" })
        .returning({ id: vendors.id });
      const [commitment] = await tx
        .insert(commitments)
        .values({ wedding_id, vendor_id: dhol.id, created_by_member_id: mira.member_id })
        .returning({ id: commitments.id });
      await tx.insert(commitmentVersions).values({
        wedding_id,
        commitment_id: commitment.id,
        version_no: 1,
        pricing: "lump_sum",
        amount_inr: 15_000,
        source: "ui",
        created_by_member_id: mira.member_id,
      });
      await tx
        .update(proposals)
        .set({ status: "approved", decided_by_member_id: mira.member_id, decided_at: NOW })
        .where(eq(proposals.id, id("proposals", "PRP-01")));

      const summary = await buildMoneySummary(tx, mira, wedding_id, {}, { now: NOW });
      expect(summary.totals).toMatchObject({
        total_committed_inr: 942_000,
        total_paid_inr: 397_000,
        total_outstanding_inr: 545_000,
        uncommitted_inr: 258_000,
        pending_proposals_inr: 0,
        if_approved_committed_inr: 942_000,
      });
      expect(summary.categories?.find((line) => line.budget_category === "music")).toMatchObject({
        committed_inr: 70_000,
        uncommitted_inr: 0,
        over_budget_inr: 0,
        pending_proposals_inr: 0,
      });
      // Live one-off payees follow the seeded ones.
      expect(summary.vendors?.at(-1)).toMatchObject({ name: "Dhol player", seed_key: null, is_one_off: true, outstanding_inr: 15_000, due_state: "none" });
      const model = await buildProposals(tx, diya, wedding_id, {});
      expect(model.proposals[0]).toMatchObject({ seed_key: "PRP-01", status: "approved", decided_by: "Mira" });
    });
  });
});

describe.skipIf(!localDatabaseUrl())("rules at the edges (M6, A7, domain 5.0)", () => {
  it("a category with no line is never over budget and never warns", async () => {
    await inRollback(async (tx) => {
      await tx.delete(budgetLines).where(and(eq(budgetLines.wedding_id, wedding_id), eq(budgetLines.budget_category, "photography")));
      await updateCommitmentAmount(tx, "COM-04", 125_000, mira.member_id!);
      expect(await moneyWarnings(tx, wedding_id, id("vendors", "VEN-PHO"))).toEqual([]);
      const summary = await buildMoneySummary(tx, mira, wedding_id, {}, { now: NOW });
      expect(summary.categories?.find((line) => line.budget_category === "photography")).toMatchObject({
        has_line: false,
        planned_inr: null,
        committed_inr: 125_000,
        uncommitted_inr: 0,
        over_budget_inr: 0,
        seed_key: null,
      });
      expect(summary.totals).toMatchObject({ unallocated_inr: 120_000, total_committed_inr: 942_000 });
    });
  });

  it("a manager sees only their own proposals; the owner sees all (A7)", async () => {
    await inRollback(async (tx) => {
      await tx.insert(proposals).values({
        wedding_id,
        command: "record_payment",
        input: { vendor_id: id("vendors", "VEN-DEC"), amount_inr: 20_000, payment_kind: "instalment" },
        summary_en: "a payment of ₹20,000 to Marigold Lane Decor",
        summary_hi: "Marigold Lane Decor को ₹20,000 का भुगतान",
        vendor_id: id("vendors", "VEN-DEC"),
        committed_delta_inr: 0,
        paid_delta_inr: 20_000,
        proposed_by_member_id: mira.member_id!,
        created_at: new Date(NOW.getTime() + 60_000),
      });
      expect((await buildProposals(tx, diya, wedding_id, {})).proposals.map((row) => row.seed_key)).toEqual(["PRP-01"]);
      const all = await buildProposals(tx, mira, wedding_id, { status: "pending" });
      expect(all.proposals.map((row) => [row.seed_key, row.paid_delta_inr])).toEqual([
        ["PRP-01", 0],
        [null, 20_000],
      ]);
      // A payment proposal adds nothing to committed (A5).
      expect((await buildMoneySummary(tx, mira, wedding_id, {}, { now: NOW })).totals?.pending_proposals_inr).toBe(15_000);
    });
    await expect(buildProposals(db, mira, wedding_id, { status: "bogus" as never })).rejects.toMatchObject({ body: { code: "validation_failed" } });
  });

  it("never reads another wedding's vendor, nor a malformed id", async () => {
    const other = seededId("a", "vendors", "VEN-CAT");
    await expect(buildVendorLedger(db, mira, wedding_id, { vendor_id: other })).rejects.toMatchObject({ body: { code: "not_found" } });
    await expect(buildVendorLedger(db, mira, wedding_id, { vendor_id: "VEN-CAT" })).rejects.toMatchObject({ body: { code: "not_found" } });
    expect(await vendorTotals(db, wedding_id, other)).toEqual({ committed_inr: 0, paid_inr: 0, outstanding_inr: 0, overpaid_inr: 0 });
    expect(await vendorTotals(db, wedding_id, "not-a-uuid")).toEqual({ committed_inr: 0, paid_inr: 0, outstanding_inr: 0, overpaid_inr: 0 });
    expect(await moneyWarnings(db, wedding_id, other)).toEqual([]);
    expect((await buildCateringEstimate(db, mira, wedding_id, { vendor_id: other })).rows).toEqual([]);
    await expect(buildMoneySummary(db, mira, seededId("a", "weddings", "WED"), {}, { now: NOW })).rejects.toMatchObject({ body: { code: "not_found" } });
  });

  it("a manager with budget sharing but not vendor dues gets the totals and no vendor rows", async () => {
    await inRollback(async (tx) => {
      await tx.update(weddings).set({ managers_can_see_vendor_dues: false, managers_can_see_budget: true }).where(eq(weddings.id, wedding_id));
      const summary = await buildMoneySummary(tx, diya, wedding_id, {}, { now: NOW });
      expect(summary.hidden).toEqual(["vendor_money"]);
      expect(summary).not.toHaveProperty("vendors");
      expect(summary.totals?.total_committed_inr).toBe(927_000);
      expect(summary.categories).toHaveLength(10);
    });
  });
});

describe.skipIf(!localDatabaseUrl())("a manager without vendor-dues sharing (AT-6.5, G7)", () => {
  it("gets the hidden blocks and no figures", async () => {
    await inRollback(async (tx) => {
      await tx.update(weddings).set({ managers_can_see_vendor_dues: false }).where(eq(weddings.id, wedding_id));

      const summary = await buildMoneySummary(tx, diya, wedding_id, {}, { now: NOW });
      expect(summary.hidden).toEqual(["vendor_money", "budget"]);
      expect(summary).not.toHaveProperty("vendors");
      expect(summary).not.toHaveProperty("totals");

      const ledger = await buildVendorLedger(tx, diya, wedding_id, { vendor_id: id("vendors", "VEN-CAT") });
      expect(ledger.hidden).toEqual(["vendor_money", "estimate"]);
      expect(ledger.vendor.name).toBe("Annapoorna Caterers");
      for (const key of ["figures", "quotes", "commitments", "payments", "history", "estimate"]) {
        expect(ledger).not.toHaveProperty(key);
      }

      const estimate = await buildCateringEstimate(tx, diya, wedding_id, {});
      expect(estimate.hidden).toEqual(["estimate"]);
      expect(estimate).not.toHaveProperty("rows");

      // The owner still sees everything.
      expect((await buildMoneySummary(tx, mira, wedding_id, {}, { now: NOW })).hidden).toEqual([]);
    });
  });
});
