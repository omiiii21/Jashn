import { randomUUID } from "node:crypto";

import { and, eq, isNull, sql } from "drizzle-orm";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDb, type Db } from "./client";
import { seededId, type SampleCopy } from "./ids";
import {
  activityEntries,
  ALL_TABLES,
  assets,
  budgetLines,
  commandReceipts,
  commitments,
  commitmentVersions,
  events,
  experimentExposures,
  exportAttempts,
  exportJobs,
  guests,
  households,
  invitationLinks,
  invitations,
  inviteStyles,
  members,
  paymentVersions,
  payments,
  proposals,
  publications,
  quotes,
  requirements,
  vendorEvents,
  vendors,
  venues,
  voiceTurns,
  weddings,
} from "./schema";
import {
  applySeedState,
  datasetForCheckpoint,
  datasetForReset,
  ensureInvitationLinks,
  hashLinkToken,
  newLinkToken,
  sampleCopyOfWedding,
  upsertCouplePhotoAsset,
} from "./seed-apply";
import { buildSeedDataset, fallbackUserId, seedAccounts, type SeedDataset } from "./seed-data";

/**
 * Runs against the database in DATABASE_URL (npm run test:db). It applies sample copy "c" (a
 * rehearsal copy no other test writes) and never assumes an empty database. The few kept live
 * rows it adds (a member, an exposure) and its throwaway wedding are removed afterwards.
 */

const COPY: SampleCopy = "c";
const NOW = new Date("2026-11-25T09:30:00+05:30");
type TableKey = keyof typeof ALL_TABLES;
type Snapshot = Partial<Record<TableKey, Record<string, unknown>[]>>;

let db: Db;
let close: () => Promise<void>;
let dataset: SeedDataset;
const cleanup: Array<() => Promise<unknown>> = [];

function serialize(value: unknown): unknown {
  if (Buffer.isBuffer(value)) return `\\x${value.toString("hex")}`;
  if (value instanceof Date) return value.toISOString();
  return value;
}

/** Every row of the copy, per table, ordered by its primary key (invitation links apart). */
async function snapshot(options: { omit?: string[] } = {}): Promise<Snapshot> {
  const result: Snapshot = {};
  for (const key of Object.keys(ALL_TABLES) as TableKey[]) {
    if (key === "invitationLinks") continue;
    const table = ALL_TABLES[key] as unknown as PgTable;
    const config = getTableConfig(table);
    const wedding = config.columns.find((column) => column.name === (key === "weddings" ? "id" : "wedding_id"));
    if (!wedding) continue;
    const primary = config.columns.filter((column) => column.primary);
    const order = primary.length > 0 ? primary : (config.primaryKeys[0]?.columns ?? []);
    const rows = (await db
      .select()
      .from(table)
      .where(eq(wedding, dataset.wedding_id))
      .orderBy(...order)) as Record<string, unknown>[];
    result[key] = rows.map((row) =>
      Object.fromEntries(
        Object.entries(row)
          .filter(([name]) => !(options.omit ?? []).includes(name))
          .map(([name, value]) => [name, serialize(value)]),
      ),
    );
  }
  return result;
}

function withoutVersion(state: Snapshot): Snapshot {
  return { ...state, weddings: state.weddings?.map((row) => ({ ...row, version: null })) };
}

async function apply(target: SeedDataset = dataset): Promise<number> {
  const { version } = await db.transaction((tx) => applySeedState(tx, target, { now: NOW }));
  return version;
}

async function linkRows() {
  return db
    .select({ id: invitationLinks.id, household_id: invitationLinks.household_id, token_hash: invitationLinks.token_hash, revoked_at: invitationLinks.revoked_at })
    .from(invitationLinks)
    .where(eq(invitationLinks.wedding_id, dataset.wedding_id))
    .orderBy(invitationLinks.id);
}

const url = process.env.DATABASE_URL;

/**
 * Local Postgres only. These tests reset copy c with stand-in Auth user ids, so on the shared
 * database (npm run test:db with .env.local) they would wipe Lane C's rehearsal copy and sign
 * mira.c and diya.c out of it; a lane's database tests run there on copy a only (D103, D120).
 */
function isLocalDatabase(value: string | undefined): boolean {
  if (!value) return false;
  try {
    return ["127.0.0.1", "localhost", "::1", "[::1]"].includes(new URL(value).hostname);
  } catch {
    return false;
  }
}

describe.skipIf(!isLocalDatabase(url))("applySeedState and the seed links (copy c, local database only)", () => {
  beforeAll(async () => {
    const created = createDb(url as string, { max: 2 });
    db = created.db;
    close = () => created.client.end({ timeout: 5 });
    const user_ids = Object.fromEntries(seedAccounts(COPY).map((account) => [account.email, fallbackUserId(account.email)]));
    dataset = buildSeedDataset(COPY, { user_ids });
  });

  afterAll(async () => {
    for (const step of cleanup.reverse()) await step();
    await close?.();
  });

  it("applies twice with the same ids, no duplicates, and a version that only goes up", async () => {
    const first = await apply();
    const before = await snapshot();
    const second = await apply();
    const after = await snapshot();

    expect(second).toBe(first + 1);
    expect(withoutVersion(after)).toEqual(withoutVersion(before));

    for (const key of Object.keys(dataset.rows) as TableKey[]) {
      const expected = (dataset.rows[key] ?? []) as Record<string, unknown>[];
      const stored = after[key] ?? [];
      const seededStored = stored.filter((row) => row.seed_key !== null && row.seed_key !== undefined);
      expect(seededStored.length, `${key} seeded rows`).toBe(expected.length);
      const keys = seededStored.map((row) => row.seed_key);
      expect(new Set(keys).size, `${key} seed keys are unique`).toBe(keys.length);
      if (expected.length > 0 && "id" in expected[0]) {
        expect(seededStored.map((row) => row.id).sort(), `${key} ids`).toEqual(expected.map((row) => row.id).sort());
      }
    }
    // The wedding's own id is the seeded one, and the D0 photo row exists (D126).
    expect(after.weddings?.[0]?.id).toBe(seededId(COPY, "weddings", "WEDDING"));
    expect(after.assets?.some((row) => row.id === dataset.photo.asset_id)).toBe(true);
  });

  it("issues each link household one link, once; a second run returns nothing and keeps the rows", async () => {
    const issued = await db.transaction((tx) => ensureInvitationLinks(tx, dataset));
    for (const link of issued) {
      expect(link.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      const [row] = await db
        .select({ token_hash: invitationLinks.token_hash, token_hint: invitationLinks.token_hint })
        .from(invitationLinks)
        .where(eq(invitationLinks.token_hash, hashLinkToken(link.token)));
      expect(row.token_hint).toBe(link.token.slice(-4));
    }
    const rowsBefore = await linkRows();
    const active = rowsBefore.filter((row) => row.revoked_at === null);
    expect(new Set(active.map((row) => row.household_id)).size).toBe(dataset.link_households.length);
    expect(rowsBefore.every((row) => row.token_hash.length === 32)).toBe(true);

    const again = await db.transaction((tx) => ensureInvitationLinks(tx, dataset));
    expect(again).toEqual([]);
    expect(await linkRows()).toEqual(rowsBefore);

    // A reset keeps every link (domain 3.7).
    await apply();
    expect(await linkRows()).toEqual(rowsBefore);
  });

  it("restores exactly D0: live rows go, changed seeded values come back, kept tables and other weddings stay", async () => {
    await apply();
    await db.transaction((tx) => ensureInvitationLinks(tx, dataset));
    const d0 = await snapshot();
    const linksAtD0 = await linkRows();
    const versionAtD0 = Number(d0.weddings?.[0]?.version);
    const W = dataset.wedding_id;
    const owner = seededId(COPY, "members", "MEM-MIRA");

    // Another wedding, which the reset must never touch.
    const otherWedding = randomUUID();
    cleanup.push(() => db.delete(weddings).where(eq(weddings.id, otherWedding)));
    await db.insert(weddings).values({ id: otherWedding, bride_name: "Asha", groom_name: "Ravi", wedding_date: "2027-01-10", created_by_user_id: randomUUID() });
    const [otherVendor] = await db
      .insert(vendors)
      .values({ wedding_id: otherWedding, name: "Other caterer", vendor_category: "catering" })
      .returning({ id: vendors.id });

    // Live rows and changed seeded values, the way commands would leave them.
    const [liveVendor] = await db
      .insert(vendors)
      .values({ wedding_id: W, name: "Live florist", vendor_category: "decor" })
      .returning({ id: vendors.id });
    await db.insert(quotes).values({ wedding_id: W, vendor_id: liveVendor.id, pricing: "lump_sum", amount_inr: 30_000 });

    const payId = seededId(COPY, "payments", "PAY-01");
    const v1Id = seededId(COPY, "payment_versions", "PAY-01/v1");
    const liveV2 = randomUUID();
    await db.update(paymentVersions).set({ superseded_at: NOW, superseded_by_version_id: liveV2 }).where(eq(paymentVersions.id, v1Id));
    await db.insert(paymentVersions).values({ id: liveV2, wedding_id: W, payment_id: payId, version_no: 2, amount_inr: 40_000, source: "voice" });
    await db.update(payments).set({ current_version_no: 2 }).where(eq(payments.id, payId));

    const [liveVenue] = await db.insert(venues).values({ wedding_id: W, name: "Live Lawn", capacity: 400 }).returning({ id: venues.id });
    await db
      .update(events)
      .set({ venue_id: liveVenue.id, version: 9 })
      .where(eq(events.id, seededId(COPY, "events", "EVT-REC")));
    await db.update(weddings).set({ bride_name: "Changed", draft_version: 99 }).where(eq(weddings.id, W));
    await db.update(budgetLines).set({ planned_inr: 1 }).where(eq(budgetLines.id, seededId(COPY, "budget_lines", "BL-catering")));

    const [liveHousehold] = await db.insert(households).values({ wedding_id: W, name: "Live family" }).returning({ id: households.id });
    const [liveGuest] = await db
      .insert(guests)
      .values({ wedding_id: W, household_id: liveHousehold.id, full_name: "Live Guest" })
      .returning({ id: guests.id });
    await db.update(households).set({ primary_guest_id: liveGuest.id }).where(eq(households.id, liveHousehold.id));
    const liveToken = randomUUID();
    await db.insert(invitationLinks).values({ wedding_id: W, household_id: liveHousehold.id, token_hash: hashLinkToken(liveToken), token_hint: "live" });

    await db.insert(activityEntries).values({
      wedding_id: W,
      actor_type: "member",
      actor_member_id: owner,
      actor_label: "Mira",
      command: "correct_payment",
      topic: "payment.corrected",
      source: "voice",
      entity_type: "payment",
      entity_id: payId,
      summary_en: "live",
      summary_hi: "live",
      visibility: "owners",
    });
    const receiptKey = `seed-apply-test-${randomUUID()}`;
    await db.insert(commandReceipts).values({
      idempotency_key: receiptKey,
      command: "correct_payment",
      wedding_id: W,
      actor_key: `member:${owner}`,
      request_hash: "x",
      outcome: "applied",
      http_status: 200,
      response: {},
    });
    await db.insert(voiceTurns).values({ wedding_id: W, user_id: randomUUID(), status: "proposed", client_turn_id: randomUUID(), input_mode: "typed" });

    // Kept tables: a live member and an exposure survive the reset.
    const liveUser = randomUUID();
    const [liveMember] = await db
      .insert(members)
      .values({ wedding_id: W, user_id: liveUser, role: "manager", display_name: "Live manager" })
      .returning({ id: members.id });
    cleanup.push(() => db.delete(members).where(eq(members.id, liveMember.id)));
    const [exposure] = await db
      .insert(experimentExposures)
      .values({ user_id: liveUser, experiment: "setup_entry", flagsmith_env: "development", identity_key: "k", variant: "voice_first", wedding_id: W })
      .returning({ id: experimentExposures.id });
    cleanup.push(() => db.delete(experimentExposures).where(eq(experimentExposures.id, exposure.id)));

    const version = await apply();
    expect(version).toBeGreaterThan(versionAtD0);

    const restored = await snapshot();
    const withoutKeptLiveRows = {
      ...restored,
      members: restored.members?.filter((row) => row.id !== liveMember.id),
      experimentExposures: restored.experimentExposures?.filter((row) => row.id !== exposure.id),
    };
    expect(withoutVersion(withoutKeptLiveRows)).toEqual(withoutVersion(d0));
    expect(await linkRows()).toEqual(linksAtD0);

    // PAY-01 is back to one current version.
    const versions = await db.select().from(paymentVersions).where(eq(paymentVersions.payment_id, payId));
    expect(versions).toHaveLength(1);
    expect(versions[0].superseded_at).toBeNull();
    expect(versions[0].amount_inr).toBe(50_000);

    // Live rows are gone; kept rows and the other wedding are not.
    expect(await db.select().from(vendors).where(eq(vendors.id, liveVendor.id))).toHaveLength(0);
    expect(await db.select().from(venues).where(eq(venues.id, liveVenue.id))).toHaveLength(0);
    expect(await db.select().from(households).where(eq(households.id, liveHousehold.id))).toHaveLength(0);
    expect(await db.select().from(commandReceipts).where(eq(commandReceipts.idempotency_key, receiptKey))).toHaveLength(0);
    expect(await db.select().from(voiceTurns).where(eq(voiceTurns.wedding_id, W))).toHaveLength(0);
    expect(
      await db.select().from(activityEntries).where(and(eq(activityEntries.wedding_id, W), isNull(activityEntries.seed_key))),
    ).toHaveLength(0);
    expect(await db.select().from(members).where(eq(members.id, liveMember.id))).toHaveLength(1);
    expect(await db.select().from(experimentExposures).where(eq(experimentExposures.id, exposure.id))).toHaveLength(1);
    expect(await db.select().from(vendors).where(eq(vendors.id, otherVendor.id))).toHaveLength(1);
    const [other] = await db.select({ version: weddings.version }).from(weddings).where(eq(weddings.id, otherWedding));
    expect(other.version).toBe(0);
  });

  it("restores D0 after a rehearsal: PRP-01 approved, REV-3 and its export, an RSVP, a rotated link, Diya removed", async () => {
    await apply();
    await db.transaction((tx) => ensureInvitationLinks(tx, dataset));
    const d0 = await snapshot();
    const W = dataset.wedding_id;
    const key = (table: string, seed_key: string) => seededId(COPY, table, seed_key);
    const owner = key("members", "MEM-MIRA");

    // PRP-01 approved: a live one-off vendor and commitment, and the seeded proposal pointing at them.
    const [dhol] = await db
      .insert(vendors)
      .values({ wedding_id: W, name: "Dhol player", vendor_category: "music", status: "booked", is_one_off: true })
      .returning({ id: vendors.id });
    const [commitment] = await db.insert(commitments).values({ wedding_id: W, vendor_id: dhol.id }).returning({ id: commitments.id });
    await db
      .insert(commitmentVersions)
      .values({ wedding_id: W, commitment_id: commitment.id, version_no: 1, pricing: "lump_sum", amount_inr: 15_000, source: "ui" });
    await db
      .update(proposals)
      .set({ status: "approved", vendor_id: dhol.id, result_entity_id: commitment.id, decided_by_member_id: owner, decided_at: NOW })
      .where(eq(proposals.id, key("proposals", "PRP-01")));

    // The venue move published as REV-3, with a live card export and its attempt.
    await db.update(events).set({ venue_id: key("venues", "VNU-LOTUS"), version: 2 }).where(eq(events.id, key("events", "EVT-REC")));
    const [rev2] = await db.select().from(publications).where(eq(publications.id, key("publications", "REV-2")));
    const [rev3] = await db
      .insert(publications)
      .values({ wedding_id: W, revision: 3, snapshot: rev2.snapshot, draft_version: 99, published_by_member_id: owner })
      .returning({ id: publications.id });
    await db.update(weddings).set({ published_revision: 3, draft_version: 99 }).where(eq(weddings.id, W));
    const [job] = await db
      .insert(exportJobs)
      .values({ wedding_id: W, publication_id: rev3.id, revision: 3, export_key: `export:${W}:rev3:png`, card_event_ids: [], requested_by_member_id: owner })
      .returning({ id: exportJobs.id });
    await db.insert(exportAttempts).values({ wedding_id: W, job_id: job.id, attempt_no: 1, trigger: "request" });

    // Tara's reception RSVP, REQ-10, a live vendor link and a live invitation for a seeded guest.
    const tara = (dataset.rows.guests ?? []).find((row) => row.full_name === "Tara Bhat");
    expect(tara).toBeDefined();
    await db
      .update(invitations)
      .set({ rsvp_status: "attending", responded_at: NOW, responded_via: "guest_link" })
      .where(and(eq(invitations.guest_id, tara!.id as string), eq(invitations.event_id, key("events", "EVT-REC"))));
    await db.insert(requirements).values({ wedding_id: W, event_id: key("events", "EVT-REC"), text: "Jain food for 12 guests", quantity: 12, vendor_id: key("vendors", "VEN-CAT") });
    await db.insert(vendorEvents).values({ wedding_id: W, vendor_id: key("vendors", "VEN-MEH"), event_id: key("events", "EVT-SAN") });
    const invited = new Set((dataset.rows.invitations ?? []).map((row) => `${row.guest_id}:${row.event_id}`));
    const eventIds = (dataset.rows.events ?? []).map((row) => row.id as string);
    const guest = (dataset.rows.guests ?? []).find((row) => !row.is_synthetic && eventIds.some((event) => !invited.has(`${row.id}:${event}`)));
    const missingEvent = eventIds.find((event) => !invited.has(`${guest?.id}:${event}`));
    await db.insert(invitations).values({ wedding_id: W, guest_id: guest!.id as string, event_id: missingEvent! });

    // H16's link rotated (the seeded row revoked, a live one active), and Diya removed.
    const h16 = key("households", "H16");
    await db.update(invitationLinks).set({ revoked_at: NOW }).where(and(eq(invitationLinks.household_id, h16), isNull(invitationLinks.revoked_at)));
    const rotated = newLinkToken();
    await db.insert(invitationLinks).values({ wedding_id: W, household_id: h16, token_hash: hashLinkToken(rotated), token_hint: rotated.slice(-4) });
    await db.update(members).set({ removed_at: NOW }).where(eq(members.id, key("members", "MEM-DIYA")));
    const linksBeforeReset = await linkRows();

    await apply();

    expect(withoutVersion(await snapshot())).toEqual(withoutVersion(d0));
    // Links are kept exactly: the revoked one stays revoked, the rotated one keeps working (3.7).
    expect(await linkRows()).toEqual(linksBeforeReset);
    expect(await db.transaction((tx) => ensureInvitationLinks(tx, dataset))).toEqual([]);
  });

  it("keeps the photo step's file fields and the REV-2 card's artifact through a reset", async () => {
    await apply();
    const W = dataset.wedding_id;
    const jobId = dataset.rev2_job.job_id;
    const clearFiles = async () => {
      await db.update(assets).set({ bytes: null, width: null, height: null }).where(eq(assets.id, dataset.photo.asset_id));
      await db
        .update(exportJobs)
        .set({ artifact_path: null, artifact_sha256: null, artifact_bytes: null, artifact_created_at: null })
        .where(eq(exportJobs.id, jobId));
    };
    cleanup.push(clearFiles);

    const before = await db.select({ version: weddings.version }).from(weddings).where(eq(weddings.id, W));
    const photo = await db.transaction((tx) =>
      upsertCouplePhotoAsset(tx, dataset, { bytes: 123_456, mime_type: "image/jpeg", width: 1500, height: 1000 }),
    );
    expect(photo.storage_path).toBe(`${W}/${dataset.photo.asset_id}.jpg`);
    expect(photo.version).toBe(before[0].version + 1);

    const user_ids = Object.fromEntries(seedAccounts(COPY).map((account) => [account.email, fallbackUserId(account.email)]));
    const withCard = buildSeedDataset(COPY, { user_ids, rev2_card: { sha256: "ab".repeat(32), bytes: 412_377 } });
    await apply(withCard);
    await apply();

    const [asset] = await db.select().from(assets).where(eq(assets.id, dataset.photo.asset_id));
    expect(asset).toMatchObject({ seed_key: dataset.photo.seed_key, bytes: 123_456, width: 1500, height: 1000, mime_type: "image/jpeg" });
    const [style] = await db.select({ photo_asset_id: inviteStyles.photo_asset_id }).from(inviteStyles).where(eq(inviteStyles.wedding_id, W));
    expect(style.photo_asset_id).toBe(dataset.photo.asset_id);
    const [job] = await db.select().from(exportJobs).where(eq(exportJobs.id, jobId));
    expect(job).toMatchObject({
      status: "succeeded",
      artifact_path: dataset.rev2_job.artifact_path,
      artifact_sha256: "ab".repeat(32),
      artifact_bytes: 412_377,
    });
    expect(job.artifact_created_at).toBeInstanceOf(Date);

    await clearFiles();
    await apply();
  });

  it("resets with the members' current Auth user ids, so nobody is signed out", async () => {
    await apply();
    expect(sampleCopyOfWedding(dataset.wedding_id)).toBe(COPY);
    expect(sampleCopyOfWedding(randomUUID())).toBeNull();

    const miraMember = seededId(COPY, "members", "MEM-MIRA");
    const realUser = randomUUID();
    await db.update(members).set({ user_id: realUser }).where(eq(members.id, miraMember));
    await db.update(weddings).set({ bride_name: "Changed" }).where(eq(weddings.id, dataset.wedding_id));

    await db.transaction(async (tx) => applySeedState(tx, await datasetForReset(tx, COPY, "d0"), { now: NOW }));
    const [mira] = await db.select({ user_id: members.user_id }).from(members).where(eq(members.id, miraMember));
    expect(mira.user_id).toBe(realUser);
    const [wedding] = await db
      .select({ bride_name: weddings.bride_name, created_by_user_id: weddings.created_by_user_id })
      .from(weddings)
      .where(eq(weddings.id, dataset.wedding_id));
    expect(wedding).toEqual({ bride_name: "Mira", created_by_user_id: realUser });

    // Back to the stand-in ids the other tests use.
    await apply();
  });

  it("goes to S0 and back to D0 with the same ids", async () => {
    await apply();
    const d0 = await snapshot({ omit: ["created_at"] });
    const commitmentId = seededId(COPY, "commitments", "COM-01");
    const paymentId = seededId(COPY, "payments", "PAY-01");

    await apply(datasetForCheckpoint(dataset, "s0"));
    const s0 = await snapshot({ omit: ["created_at"] });
    expect(s0.commitments?.some((row) => row.id === commitmentId)).toBe(false);
    expect(s0.payments?.some((row) => row.id === paymentId)).toBe(false);
    expect(s0.paymentVersions?.some((row) => row.payment_id === paymentId)).toBe(false);
    expect(s0.quotes?.find((row) => row.seed_key === "QUO-01")?.status).toBe("open");
    expect(s0.vendors?.find((row) => row.seed_key === "VEN-CAT")?.status).toBe("considering");

    await apply();
    const back = await snapshot({ omit: ["created_at"] });
    expect(withoutVersion(back)).toEqual(withoutVersion(d0));
    const [{ count }] = await db.execute<{ count: number }>(
      sql`select count(*)::int as count from ${weddings} where ${weddings.id} = ${dataset.wedding_id}`,
    );
    expect(count).toBe(1);
  });
});
