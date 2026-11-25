import { randomBytes, randomUUID } from "node:crypto";

import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CommandFailure, commandSchemas, type CommandEnvelope } from "@/contracts/commands";
import type { SessionActor } from "@/contracts/domain";
import { invitationKey, namedGuestKey, SEED_KEYS } from "@/contracts/fixtures";
import type { CommandHandlerContext, CommandHandlerResult } from "@/contracts/services";
import { createDb, type Db, type Tx } from "@/db/client";
import { seededId } from "@/db/ids";
import {
  activityEntries,
  commandReceipts,
  commitments,
  events,
  exportAttempts,
  exportJobs,
  guests,
  households,
  invitationLinks,
  invitations,
  memberInvites,
  members,
  paymentVersions,
  payments,
  proposals,
  publications,
  quotes,
  requirements,
  vendors,
  venues,
  voiceTurns,
  weddings,
} from "@/db/schema";
import { localDatabaseUrl } from "@/db/testing";
import { applySeedState, ensureInvitationLinks, hashLinkToken, newLinkToken } from "@/db/seed-apply";
import { buildSeedDataset, invitationLinkSeedKey, seedAccounts, type SeedDataset } from "@/db/seed-data";

import { createResetDemoHandler, seedUserIds } from "./demo";
import { createDispatcher } from "./dispatcher";

/**
 * `reset_demo` against a real Postgres (npm run test:db with .env.local, or the throwaway local
 * database). Uses sample copy "a" only (D120): seeds it, makes live changes, resets, and leaves
 * it at D0 with its members' Auth user ids and H16's link exactly as it found them, so a run on
 * the shared database never locks mira.a or diya.a out of copy a or breaks Tara's printed link.
 */

const COPY = "a" as const;
// Resets a whole sample copy, so it runs only against a local Postgres (src/db/testing.ts).
const url = localDatabaseUrl();
const W = seededId(COPY, "weddings", SEED_KEYS.wedding);
const id = (table: string, seed_key: string) => seededId(COPY, table, seed_key);
const PAY_01 = id("payments", "PAY-01");
const PAY_01_V1 = id("payment_versions", "PAY-01/v1");
const COM_01 = id("commitments", "COM-01");
const QUO_01 = id("quotes", "QUO-01");
const EVT_REC = id("events", "EVT-REC");
const VNU_BANYAN = id("venues", SEED_KEYS.venues.banyan);
const H16 = id("households", "H16");
const REV_2 = id("publications", "REV-2");
const MIRA = id("members", SEED_KEYS.members.mira);
const DIYA = id("members", SEED_KEYS.members.diya);
/** Tara Bhat (G40, household H16) at the reception. */
const TARA_REC = id("invitations", invitationKey(namedGuestKey(40), "EVT-REC"));

const accountEmail = (member_key: string): string => {
  const account = seedAccounts(COPY).find((row) => row.member_key === member_key);
  if (!account) throw new Error(`No ${member_key} account for copy ${COPY}`);
  return account.email;
};
const MIRA_EMAIL = accountEmail(SEED_KEYS.members.mira);
const DIYA_EMAIL = accountEmail(SEED_KEYS.members.diya);

let db: Db;
let close: () => Promise<void>;
let dataset: SeedDataset;
/** The copy's stored Auth user ids by account email (fixture stand-ins only on a fresh database). */
let userIds: Record<string, string> = {};
/** H16's active link before the test, and every row the test adds to kept tables, for clean-up. */
let originalH16Link: string | null = null;
const createdLinks: string[] = [];
const liveMembers: string[] = [];
const throwaway: string[] = [];

const handler = createResetDemoHandler({ resetEnabled: () => true, log: () => {} });

function ownerActor(user_id: string, wedding_id = W, member_id: string | null = MIRA): SessionActor {
  return {
    kind: "member",
    user_id,
    email: MIRA_EMAIL,
    display_name: "Mira",
    wedding_id,
    member_id,
    role: "owner",
    is_internal: true,
    is_first_wedding: false,
    preferred_language: "en",
  };
}

const mira = (): SessionActor => ownerActor(userIds[MIRA_EMAIL]);

/** Runs the handler as the dispatcher would: wedding row locked first, input parsed. */
async function runReset(
  raw: Record<string, unknown>,
  options: { wedding_id?: string; actor?: SessionActor; parse?: boolean } = {},
): Promise<{ handled: CommandHandlerResult<"reset_demo">; versionAfter: number }> {
  const wedding_id = options.wedding_id ?? W;
  return db.transaction(async (tx: Tx) => {
    await tx.select({ id: weddings.id }).from(weddings).where(eq(weddings.id, wedding_id)).for("update");
    const input = (options.parse === false ? raw : commandSchemas.reset_demo.parse(raw)) as CommandHandlerContext<"reset_demo", Tx>["input"];
    const handled = await handler({
      command: "reset_demo",
      actor: options.actor ?? mira(),
      wedding_id,
      input,
      envelope: { wedding_id, command: "reset_demo", input: raw, source: "ui", idempotency_key: null } as unknown as CommandEnvelope<"reset_demo">,
      tx,
      now: new Date().toISOString(),
    });
    const [row] = await tx.select({ version: weddings.version }).from(weddings).where(eq(weddings.id, wedding_id));
    return { handled, versionAfter: Number(row?.version ?? -1) };
  });
}

async function failureOf(promise: Promise<unknown>): Promise<CommandFailure> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof CommandFailure) return error;
    throw error;
  }
  throw new Error("expected a CommandFailure");
}

async function weddingRow() {
  const [row] = await db.select().from(weddings).where(eq(weddings.id, W));
  return row;
}

async function countOf(table: typeof activityEntries | typeof vendors, wedding_id = W): Promise<number> {
  return (await db.select({ id: table.id }).from(table).where(eq(table.wedding_id, wedding_id))).length;
}

type LiveRows = {
  liveVendor: string;
  liveVenue: string;
  liveLink: string;
  liveJob: string;
  liveHousehold: string;
  liveHouseholdLink: string;
  liveGuest: string;
  liveRequirement: string;
  liveProposal: string;
  liveInvite: string;
};

/** Live changes like the demo run makes: D1 to D5 plus noise in every table the reset clears. */
async function makeLiveChanges(): Promise<LiveRows> {
  return db.transaction(async (tx) => {
    const now = new Date();
    // A new vendor (live row).
    const [vendor] = await tx
      .insert(vendors)
      .values({ wedding_id: W, name: `Live florist ${randomUUID().slice(0, 6)}`, vendor_category: "decor" })
      .returning({ id: vendors.id });
    // PAY-01 corrected to 40000 (C2's shape): v1 superseded, live v2 current.
    const v2id = randomUUID();
    await tx.update(paymentVersions).set({ superseded_at: now, superseded_by_version_id: v2id }).where(eq(paymentVersions.id, PAY_01_V1));
    await tx.insert(paymentVersions).values({
      id: v2id,
      wedding_id: W,
      payment_id: PAY_01,
      version_no: 2,
      amount_inr: 40_000,
      paid_on: "2026-11-20",
      method: "upi",
      change_reason: "Corrected",
      source: "voice",
      created_by_member_id: MIRA,
    });
    await tx.update(payments).set({ current_version_no: 2 }).where(eq(payments.id, PAY_01));
    // Diya's venue move to a venue made on the fly (a live venue the seeded function points at).
    const [venue] = await tx
      .insert(venues)
      .values({ wedding_id: W, name: `Live hall ${randomUUID().slice(0, 6)}`, place_name: "Mallige Gardens", capacity: 300 })
      .returning({ id: venues.id });
    await tx.update(events).set({ venue_id: venue.id, title: "Reception (moved)", version: 2 }).where(eq(events.id, EVT_REC));
    // A live publication (REV-3) and its export job and attempt.
    const [rev3] = await tx
      .insert(publications)
      .values({ wedding_id: W, revision: 3, snapshot: {}, draft_version: 99, published_by_member_id: MIRA })
      .returning({ id: publications.id });
    const [job] = await tx
      .insert(exportJobs)
      .values({
        wedding_id: W,
        publication_id: rev3.id,
        revision: 3,
        export_key: `export:${W}:rev3:png`,
        card_event_ids: [EVT_REC],
        requested_by_member_id: MIRA,
      })
      .returning({ id: exportJobs.id });
    await tx.insert(exportAttempts).values({ wedding_id: W, job_id: job.id, attempt_no: 1, trigger: "request" });
    await tx.update(weddings).set({ published_revision: 3, draft_version: 99 }).where(eq(weddings.id, W));
    // Tara accepts the reception (a seeded invitation changed), and REQ-10 on the reception.
    const accepted = await tx
      .update(invitations)
      .set({ rsvp_status: "attending", responded_at: now, responded_via: "guest_link" })
      .where(eq(invitations.id, TARA_REC))
      .returning({ id: invitations.id });
    if (accepted.length !== 1) throw new Error("Tara's reception invitation is missing from copy a");
    const [requirement] = await tx
      .insert(requirements)
      .values({ wedding_id: W, event_id: EVT_REC, text: "Jain food for 12", quantity: 12, vendor_id: vendor.id, created_by_member_id: MIRA })
      .returning({ id: requirements.id });
    // A live proposal (PRP-02) naming the live vendor.
    const [proposal] = await tx
      .insert(proposals)
      .values({
        wedding_id: W,
        command: "record_expense",
        input: { amount_inr: 5000 },
        summary_en: "Diya proposed an expense.",
        summary_hi: "…",
        vendor_id: vendor.id,
        proposed_by_member_id: DIYA,
      })
      .returning({ id: proposals.id });
    // A live household with a live guest, an invitation to a seeded function and its own link.
    const [household] = await tx
      .insert(households)
      .values({ wedding_id: W, name: `Live family ${randomUUID().slice(0, 6)}` })
      .returning({ id: households.id });
    const [guest] = await tx
      .insert(guests)
      .values({ wedding_id: W, household_id: household.id, full_name: "Live Guest" })
      .returning({ id: guests.id });
    await tx.update(households).set({ primary_guest_id: guest.id }).where(eq(households.id, household.id));
    await tx.insert(invitations).values({ wedding_id: W, guest_id: guest.id, event_id: EVT_REC });
    const householdToken = newLinkToken();
    const [householdLink] = await tx
      .insert(invitationLinks)
      .values({ wedding_id: W, household_id: household.id, token_hash: hashLinkToken(householdToken), token_hint: householdToken.slice(-4) })
      .returning({ id: invitationLinks.id });
    createdLinks.push(householdLink.id);
    // A pending member invite (live; the reset deletes it).
    const [invite] = await tx
      .insert(memberInvites)
      .values({ wedding_id: W, email: `invitee-${randomUUID().slice(0, 6)}@example.com`, role: "manager", token_hash: randomBytes(32), invited_by_member_id: MIRA })
      .returning({ id: memberInvites.id });
    // Activity, a receipt and a voice turn the activity entry points at.
    const [turn] = await tx
      .insert(voiceTurns)
      .values({
        wedding_id: W,
        user_id: userIds[MIRA_EMAIL],
        member_id: MIRA,
        status: "confirmed",
        client_turn_id: randomUUID(),
        input_mode: "typed",
      })
      .returning({ id: voiceTurns.id });
    await tx.insert(activityEntries).values({
      wedding_id: W,
      actor_type: "member",
      actor_member_id: MIRA,
      actor_label: "Mira",
      command: "correct_payment",
      topic: "payment.corrected",
      source: "voice",
      voice_turn_id: turn.id,
      entity_type: "payment",
      entity_id: PAY_01,
      summary_en: "Mira corrected the advance to Annapoorna Caterers from ₹50,000 to ₹40,000.",
      summary_hi: "…",
      visibility: "owners",
    });
    await tx.insert(commandReceipts).values({
      idempotency_key: `reset-test-${randomUUID()}`,
      command: "correct_payment",
      wedding_id: W,
      actor_key: `member:${MIRA}`,
      request_hash: "x",
      outcome: "applied",
      http_status: 200,
      response: {},
    });
    // H16 rotated: the active link revoked, a live link active (its token is never shown).
    await tx.update(invitationLinks).set({ revoked_at: now }).where(and(eq(invitationLinks.household_id, H16), isNull(invitationLinks.revoked_at)));
    const token = newLinkToken();
    const [link] = await tx
      .insert(invitationLinks)
      .values({ wedding_id: W, household_id: H16, token_hash: hashLinkToken(token), token_hint: token.slice(-4), created_by_member_id: MIRA })
      .returning({ id: invitationLinks.id });
    createdLinks.push(link.id);
    // A few commands' worth of version bumps.
    await tx.update(weddings).set({ version: sql`${weddings.version} + 7` }).where(eq(weddings.id, W));
    return {
      liveVendor: vendor.id,
      liveVenue: venue.id,
      liveLink: link.id,
      liveJob: job.id,
      liveHousehold: household.id,
      liveHouseholdLink: householdLink.id,
      liveGuest: guest.id,
      liveRequirement: requirement.id,
      liveProposal: proposal.id,
      liveInvite: invite.id,
    };
  });
}

/** A wedding that isn't copy a, with a few rows of its own, for the isolation and refusal checks. */
async function otherWedding(is_sample: boolean): Promise<{ wedding_id: string; owner_user: string; owner_member: string }> {
  const wedding_id = randomUUID();
  throwaway.push(wedding_id);
  const owner_user = randomUUID();
  await db.insert(weddings).values({
    id: wedding_id,
    bride_name: "Real",
    groom_name: "Couple",
    wedding_date: "2027-01-10",
    is_sample,
    version: 3,
    created_by_user_id: owner_user,
  });
  const [owner] = await db
    .insert(members)
    .values({ wedding_id, user_id: owner_user, role: "owner", display_name: "Owner" })
    .returning({ id: members.id });
  return { wedding_id, owner_user, owner_member: owner.id };
}

describe.skipIf(!url)("reset_demo (database, copy a)", () => {
  beforeAll(async () => {
    const created = createDb(url!, { max: 2 });
    db = created.db;
    close = () => created.client.end();
    // The copy's real Auth user ids, read back the way the handler reads them: seeding with the
    // fixture stand-ins would point mira.a's and diya.a's members rows at users that don't exist.
    const stored = await db
      .select({ seed_key: members.seed_key, user_id: members.user_id })
      .from(members)
      .where(and(eq(members.wedding_id, W), isNotNull(members.seed_key)));
    userIds = seedUserIds(COPY, stored).user_ids;
    dataset = buildSeedDataset(COPY, { user_ids: userIds });
    await db.transaction(async (tx) => {
      await applySeedState(tx, dataset, { now: new Date() });
      await ensureInvitationLinks(tx, dataset);
    });
    const [active] = await db
      .select({ id: invitationLinks.id })
      .from(invitationLinks)
      .where(and(eq(invitationLinks.household_id, H16), isNull(invitationLinks.revoked_at)));
    originalH16Link = active?.id ?? null;
  }, 60_000);

  afterAll(async () => {
    if (!db) return;
    // Leave copy a at D0, put H16's link back as it was (a reset keeps a revoked link revoked),
    // and remove the rows the test added to kept tables and the throwaway weddings.
    await runReset({ confirm_text: "RESET" }).catch(() => undefined);
    if (createdLinks.length > 0) await db.delete(invitationLinks).where(inArray(invitationLinks.id, createdLinks));
    if (originalH16Link) await db.update(invitationLinks).set({ revoked_at: null }).where(eq(invitationLinks.id, originalH16Link));
    if (liveMembers.length > 0) await db.delete(members).where(inArray(members.id, liveMembers));
    if (throwaway.length > 0) await db.delete(weddings).where(inArray(weddings.id, throwaway));
    await close();
  }, 60_000);

  it("d0 removes live rows, restores seeded values and keeps links and members", async () => {
    const live = await makeLiveChanges();
    // A member who joined through an invite (a live member row, kept by every reset).
    const [joined] = await db
      .insert(members)
      .values({ wedding_id: W, user_id: randomUUID(), role: "manager", display_name: "Live invitee" })
      .returning({ id: members.id });
    liveMembers.push(joined.id);
    const before = await weddingRow();
    const membersBefore = await db.select().from(members).where(eq(members.wedding_id, W));
    const linksBefore = await db
      .select({ id: invitationLinks.id, revoked_at: invitationLinks.revoked_at })
      .from(invitationLinks)
      .where(eq(invitationLinks.wedding_id, W));

    const { handled, versionAfter } = await runReset({ confirm_text: "RESET", checkpoint: "d0" });

    // The handler leaves `version` where the lock found it; the dispatcher adds the one bump.
    expect(versionAfter).toBe(Number(before.version));
    expect(handled.activity).toBeNull();
    expect(handled.outcome ?? "applied").toBe("applied");
    const seededWedding = dataset.rows.weddings![0];
    expect(handled.result).toEqual({
      checkpoint: "d0",
      draft_version: seededWedding.draft_version,
      published_revision: 2,
    });

    const after = await weddingRow();
    expect(after.published_revision).toBe(2);
    expect(after.draft_version).toBe(seededWedding.draft_version);

    // PAY-01: one version, ₹50,000, current again.
    const versions = await db.select().from(paymentVersions).where(eq(paymentVersions.payment_id, PAY_01));
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({ id: PAY_01_V1, amount_inr: 50_000, superseded_at: null, superseded_by_version_id: null });
    const [pay] = await db.select().from(payments).where(eq(payments.id, PAY_01));
    expect(pay.current_version_no).toBe(1);

    // Live rows gone (acceptance 5.1's middle column).
    expect(await db.select().from(vendors).where(eq(vendors.id, live.liveVendor))).toHaveLength(0);
    expect(await db.select().from(venues).where(eq(venues.id, live.liveVenue))).toHaveLength(0);
    expect(await db.select().from(exportJobs).where(eq(exportJobs.id, live.liveJob))).toHaveLength(0);
    expect(await db.select().from(requirements).where(eq(requirements.id, live.liveRequirement))).toHaveLength(0);
    expect(await db.select().from(proposals).where(eq(proposals.id, live.liveProposal))).toHaveLength(0);
    expect(await db.select().from(households).where(eq(households.id, live.liveHousehold))).toHaveLength(0);
    expect(await db.select().from(guests).where(eq(guests.id, live.liveGuest))).toHaveLength(0);
    expect(await db.select().from(memberInvites).where(eq(memberInvites.id, live.liveInvite))).toHaveLength(0);
    expect(await db.select().from(publications).where(and(eq(publications.wedding_id, W), isNull(publications.seed_key)))).toHaveLength(0);
    expect(await db.select().from(activityEntries).where(and(eq(activityEntries.wedding_id, W), isNull(activityEntries.seed_key)))).toHaveLength(0);
    expect(await db.select().from(invitations).where(and(eq(invitations.wedding_id, W), isNull(invitations.seed_key)))).toHaveLength(0);
    expect(await db.select().from(commandReceipts).where(eq(commandReceipts.wedding_id, W))).toHaveLength(0);
    expect(await db.select().from(voiceTurns).where(eq(voiceTurns.wedding_id, W))).toHaveLength(0);

    // Seeded rows back: 5 activity entries, the reception at Banyan Hall, Tara pending, REV-2's card job.
    expect(await countOf(activityEntries)).toBe(5);
    const [rec] = await db.select().from(events).where(eq(events.id, EVT_REC));
    expect(rec).toMatchObject({ venue_id: VNU_BANYAN, title: "Reception", version: 1 });
    const [tara] = await db.select().from(invitations).where(eq(invitations.id, TARA_REC));
    expect(tara.rsvp_status).toBe("pending");
    const jobs = await db
      .select({ seed_key: exportJobs.seed_key, publication_id: exportJobs.publication_id })
      .from(exportJobs)
      .where(eq(exportJobs.wedding_id, W));
    expect(jobs).toEqual([{ seed_key: SEED_KEYS.rev2_export_job, publication_id: REV_2 }]);

    // Kept: every link of a seeded household (the rotated H16 link active, the one before it
    // revoked); only the deleted live household's link went with it. Members, live ones too.
    const linksAfter = await db
      .select({ id: invitationLinks.id, revoked_at: invitationLinks.revoked_at })
      .from(invitationLinks)
      .where(eq(invitationLinks.wedding_id, W));
    expect(linksAfter.map((row) => row.id).sort()).toEqual(
      linksBefore
        .map((row) => row.id)
        .filter((link) => link !== live.liveHouseholdLink)
        .sort(),
    );
    const h16 = await db.select().from(invitationLinks).where(eq(invitationLinks.household_id, H16));
    expect(h16.find((row) => row.id === live.liveLink)?.revoked_at).toBeNull();
    expect(h16.filter((row) => row.revoked_at === null)).toHaveLength(1);
    if (originalH16Link) expect(h16.find((row) => row.id === originalH16Link)?.revoked_at).not.toBeNull();
    expect(h16.some((row) => row.seed_key === invitationLinkSeedKey("H16"))).toBe(true);
    const membersAfter = await db.select({ id: members.id, user_id: members.user_id }).from(members).where(eq(members.wedding_id, W));
    expect(membersAfter.sort((a, b) => a.id.localeCompare(b.id))).toEqual(
      membersBefore.map((row) => ({ id: row.id, user_id: row.user_id })).sort((a, b) => a.id.localeCompare(b.id)),
    );
    expect(membersAfter.some((row) => row.id === joined.id)).toBe(true);
  }, 60_000);

  it("a second d0 reset is idempotent and never lowers the version", async () => {
    const before = await weddingRow();
    const { versionAfter } = await runReset({ confirm_text: "RESET" });
    expect(versionAfter).toBe(Number(before.version));
    expect(await db.select().from(paymentVersions).where(eq(paymentVersions.payment_id, PAY_01))).toHaveLength(1);
  }, 60_000);

  it("s0 drops COM-01 and PAY-01 and reopens QUO-01; d0 brings them back", async () => {
    const { handled } = await runReset({ confirm_text: "RESET", checkpoint: "s0" });
    expect(handled.result.checkpoint).toBe("s0");
    expect(await db.select().from(payments).where(eq(payments.id, PAY_01))).toHaveLength(0);
    expect(await db.select().from(paymentVersions).where(eq(paymentVersions.payment_id, PAY_01))).toHaveLength(0);
    expect(await db.select().from(commitments).where(eq(commitments.id, COM_01))).toHaveLength(0);
    const [quote] = await db.select().from(quotes).where(eq(quotes.id, QUO_01));
    expect(quote.status).toBe("open");
    expect(await countOf(activityEntries)).toBe(5);

    await runReset({ confirm_text: "RESET", checkpoint: "d0" });
    expect(await db.select().from(payments).where(eq(payments.id, PAY_01))).toHaveLength(1);
    expect(await db.select().from(commitments).where(eq(commitments.id, COM_01))).toHaveLength(1);
    const [reopened] = await db.select().from(quotes).where(eq(quotes.id, QUO_01));
    expect(reopened.status).toBe("accepted");
  }, 60_000);

  it("refuses a wrong confirm_text and writes nothing", async () => {
    expect(commandSchemas.reset_demo.safeParse({ confirm_text: "RESET " }).success).toBe(false);
    const before = await weddingRow();
    const error = await failureOf(runReset({ confirm_text: "reset" }, { parse: false }));
    expect(error.body).toMatchObject({ code: "validation_failed", field: "confirm_text" });
    expect(Number((await weddingRow()).version)).toBe(Number(before.version));
  });

  it("refuses a wedding without is_sample, and a sample wedding that isn't a seeded copy", async () => {
    for (const is_sample of [false, true]) {
      const other = await otherWedding(is_sample);
      const error = await failureOf(
        runReset(
          { confirm_text: "RESET" },
          { wedding_id: other.wedding_id, actor: ownerActor(other.owner_user, other.wedding_id, other.owner_member) },
        ),
      );
      expect(error.body.code).toBe("not_sample_wedding");
      expect(error.http_status).toBe(403);
      const [row] = await db.select({ version: weddings.version }).from(weddings).where(eq(weddings.id, other.wedding_id));
      expect(row.version).toBe(3);
    }
  });

  it("a reset of copy a never touches another wedding (acceptance 5.2)", async () => {
    const other = await otherWedding(false);
    await db.insert(vendors).values({ wedding_id: other.wedding_id, name: "Their caterer", vendor_category: "catering" });
    await db.insert(activityEntries).values({
      wedding_id: other.wedding_id,
      actor_type: "member",
      actor_member_id: other.owner_member,
      actor_label: "Owner",
      command: "add_vendor",
      topic: "vendor.added",
      source: "ui",
      entity_type: "vendor",
      entity_id: randomUUID(),
      summary_en: "Owner added Their caterer.",
      summary_hi: "…",
      visibility: "members",
    });
    await db.insert(commandReceipts).values({
      idempotency_key: `reset-other-${randomUUID()}`,
      command: "add_vendor",
      wedding_id: other.wedding_id,
      actor_key: `member:${other.owner_member}`,
      request_hash: "x",
      outcome: "applied",
      http_status: 200,
      response: {},
    });

    await runReset({ confirm_text: "RESET" });

    expect(await countOf(vendors, other.wedding_id)).toBe(1);
    expect(await countOf(activityEntries, other.wedding_id)).toBe(1);
    expect(await db.select().from(commandReceipts).where(eq(commandReceipts.wedding_id, other.wedding_id))).toHaveLength(1);
    expect(await db.select().from(members).where(eq(members.wedding_id, other.wedding_id))).toHaveLength(1);
    const [row] = await db.select({ version: weddings.version }).from(weddings).where(eq(weddings.id, other.wedding_id));
    expect(row.version).toBe(3);
  }, 60_000);

  it("through the dispatcher: refusals write nothing, then one version bump, no activity entry and a replay", async () => {
    const deps = {
      db: () => db,
      schedule: () => {},
      voiceGate: async () => ({ status: "enabled" as const }),
      onSetupSaved: async () => {},
      afterCommit: {},
      log: () => {},
    };
    const dispatcher = createDispatcher({ ...deps, registry: () => ({ reset_demo: handler }) });
    const disabled = createDispatcher({
      ...deps,
      registry: () => ({ reset_demo: createResetDemoHandler({ resetEnabled: () => false, log: () => {} }) }),
    });
    await makeLiveChanges();
    const before = Number((await weddingRow()).version);
    expect(await countOf(activityEntries)).toBe(6);
    const key = `reset-a-${randomUUID()}`;
    const envelope = {
      wedding_id: W,
      command: "reset_demo",
      input: { checkpoint: "d0", confirm_text: "RESET" },
      idempotency_key: key,
      source: "ui",
    } as CommandEnvelope<"reset_demo">;
    const freshKey = () => `reset-a-${randomUUID()}`;
    const withInput = (input: Record<string, unknown>) =>
      ({ ...envelope, idempotency_key: freshKey(), input }) as unknown as CommandEnvelope<"reset_demo">;

    // Acceptance 5.2: each refusal answers its code and writes nothing.
    const diya: SessionActor = {
      ...mira(),
      user_id: userIds[DIYA_EMAIL],
      email: DIYA_EMAIL,
      display_name: "Diya",
      member_id: DIYA,
      role: "manager",
    };
    const refusals = [
      { response: await dispatcher.runCommand(diya, { ...envelope, idempotency_key: freshKey() }), code: "forbidden", field: null },
      { response: await disabled.runCommand(mira(), { ...envelope, idempotency_key: freshKey() }), code: "demo_reset_disabled", field: null },
      { response: await dispatcher.runCommand(mira(), withInput({ confirm_text: "RESET " })), code: "validation_failed", field: "confirm_text" },
      { response: await dispatcher.runCommand(mira(), withInput({ confirm_text: "reset" })), code: "validation_failed", field: "confirm_text" },
      { response: await dispatcher.runCommand(mira(), withInput({ confirm_text: "" })), code: "validation_failed", field: "confirm_text" },
      { response: await dispatcher.runCommand(mira(), withInput({ confirm_text: "RESET", checkpoint: "d1" })), code: "validation_failed", field: "checkpoint" },
    ];
    for (const { response, code, field } of refusals) {
      expect(response).toMatchObject({ ok: false, error: { code, ...(field ? { field } : {}) } });
    }
    expect(Number((await weddingRow()).version)).toBe(before);
    expect(await countOf(activityEntries)).toBe(6);

    const first = await dispatcher.runCommand(mira(), envelope);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first).toMatchObject({ outcome: "applied", activity_entry_id: null, version: before + 1 });
    expect(first.result).toMatchObject({ checkpoint: "d0", published_revision: 2 });
    expect(Number((await weddingRow()).version)).toBe(before + 1);
    expect(await countOf(activityEntries)).toBe(5);
    // Only this reset's own receipt survives.
    const receipts = await db.select({ key: commandReceipts.idempotency_key }).from(commandReceipts).where(eq(commandReceipts.wedding_id, W));
    expect(receipts).toEqual([{ key }]);

    const replay = await dispatcher.runCommand(mira(), envelope);
    expect(replay).toMatchObject({ ok: true, outcome: "replayed" });
    expect(Number((await weddingRow()).version)).toBe(before + 1);
  }, 60_000);
});
