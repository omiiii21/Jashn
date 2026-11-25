import { randomUUID } from "node:crypto";

import { and, eq, isNull } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { CommandEnvelope, CommandName, CommandResponse } from "@/contracts/commands";
import type { SessionActor } from "@/contracts/domain";
import { createDb, type Db } from "@/db/client";
import { seededId, type SampleCopy } from "@/db/ids";
import { activityEntries, events, members, venues, weddings } from "@/db/schema";
import { localDatabaseUrl } from "@/db/testing";
import { applySeedState } from "@/db/seed-apply";
import { buildSeedDataset, fallbackUserId, seedAccounts, type SeedDataset } from "@/db/seed-data";
import { createDispatcher } from "@/server/commands/dispatcher";
import { buildActivityFeed } from "@/server/read-models/activity-feed";
import { buildItinerary, loadPublishDraft } from "@/server/read-models/itinerary";

import { eventHandlers } from "./events";

/**
 * A4 against a real database (npm run test:db), on sample copy "d" only: it resets the copy
 * to D0 with the seed's `applySeedState` before and after, and runs the commands through the
 * real dispatcher with A4's handler map. Domain 7.1 step 4, AT-3.1, AT-3.3, AT-3.7, AT-8.2,
 * AT-8.5 and AT-12.2.
 */

const COPY: SampleCopy = "d";
const SEED_NOW = new Date("2026-11-25T09:30:00+05:30");
// Resets a whole sample copy, so it runs only against a local Postgres (src/db/testing.ts).
const url = localDatabaseUrl();

let db: Db;
let close: () => Promise<void>;
let dataset: SeedDataset;
let wedding_id: string;
let mira: SessionActor;
let diya: SessionActor;
let clock = new Date("2026-11-25T10:00:00+05:30");

const RECEPTION = seededId(COPY, "events", "EVT-REC");
const LOTUS = seededId(COPY, "venues", "VNU-LOTUS");
const BANYAN = seededId(COPY, "venues", "VNU-BANYAN");
const CATERER = seededId(COPY, "vendors", "VEN-CAT");

async function resetToD0(): Promise<void> {
  await db.transaction((tx) => applySeedState(tx, dataset, { now: SEED_NOW }));
}

async function actorFor(member_key: string): Promise<SessionActor> {
  const rows = await db
    .select()
    .from(members)
    .where(and(eq(members.wedding_id, wedding_id), eq(members.seed_key, member_key), isNull(members.removed_at)))
    .limit(1);
  const member = rows[0];
  if (!member) throw new Error(`no member ${member_key}`);
  return {
    kind: "member",
    user_id: member.user_id,
    email: `${member.display_name.toLowerCase()}.${COPY}@example.com`,
    display_name: member.display_name,
    wedding_id,
    member_id: member.id,
    role: member.role,
    is_internal: true,
    is_first_wedding: false,
    preferred_language: "en",
  };
}

function dispatcher() {
  return createDispatcher({
    db: () => db,
    registry: () => eventHandlers,
    schedule: () => {},
    now: () => clock,
    log: () => {},
  });
}

async function run<C extends CommandName>(
  actor: SessionActor,
  command: C,
  input: Record<string, unknown>,
  idempotency_key: string | null = randomUUID(),
): Promise<CommandResponse<C>> {
  clock = new Date(clock.getTime() + 60_000);
  const envelope = { wedding_id, command, input, idempotency_key, source: "ui" } as unknown as CommandEnvelope<C>;
  return dispatcher().runCommand(actor, envelope);
}

async function weddingRow() {
  const rows = await db.select().from(weddings).where(eq(weddings.id, wedding_id)).limit(1);
  return rows[0];
}

describe.skipIf(!url)("A4 on copy d: functions, the draft and the feed", () => {
  beforeAll(async () => {
    const created = createDb(url as string, { max: 2 });
    db = created.db;
    close = () => created.client.end({ timeout: 5 });
    const user_ids = Object.fromEntries(seedAccounts(COPY).map((account) => [account.email, fallbackUserId(account.email)]));
    dataset = buildSeedDataset(COPY, { user_ids });
    wedding_id = dataset.wedding_id;
    await resetToD0();
    mira = await actorFor("MEM-MIRA");
    diya = await actorFor("MEM-DIYA");
  });

  afterAll(async () => {
    if (db && dataset) await resetToD0();
    await close?.();
  });

  it("D0: five functions, two conflicts, nothing unpublished, revision 2 (AT-3.1, AT-12.1)", async () => {
    const itinerary = await buildItinerary(db, mira, wedding_id);
    expect(itinerary.functions.map((f) => f.event_kind)).toEqual(["haldi", "mehendi", "sangeet", "wedding", "reception"]);
    expect(itinerary.unpublished_changes).toEqual([]);
    expect(itinerary.published_revision).toBe(2);
    expect(itinerary.conflicts.map((c) => c.kind)).toEqual(["overlap", "over_capacity"]);
    expect(itinerary.conflicts[0]).toMatchObject({
      overlap_minutes: 30,
      text: "The Mehendi ends at 19:30 but the Sangeet starts at 19:00: 30 minutes overlap.",
    });
    expect(itinerary.conflicts[1]).toMatchObject({ text: "Banyan Hall seats 220; 229 are attending the reception." });
    const capacity = Object.fromEntries(itinerary.venues.map((v) => [v.name, v.capacity]));
    expect(capacity["Banyan Hall"]).toBe(220);
    expect(capacity["Lotus Hall"]).toBe(300);
    const reception = itinerary.functions.find((f) => f.event_id === RECEPTION)!;
    expect(reception.venue?.name).toBe("Banyan Hall");
    expect(reception.version).toBe(1);
    expect(reception.published?.venue?.name).toBe("Banyan Hall");
    expect(reception.starts_at).toBe("2026-12-14T19:30:00+05:30");
    expect(reception.requirements.map((r) => r.seed_key).sort()).toEqual(["REQ-08", "REQ-09"]);
    expect(reception.requirements.find((r) => r.seed_key === "REQ-08")?.label).toBe("Sugar-free dessert option, for Kamla Arora");
    expect(itinerary.functions.every((f) => f.seed_key !== null)).toBe(true);
  });

  it("D0: Mira's feed has 5 entries, Diya's 4 without the proposal (AT-8.5)", async () => {
    const miraFeed = await buildActivityFeed(db, mira, wedding_id);
    const diyaFeed = await buildActivityFeed(db, diya, wedding_id);
    expect(miraFeed.entries.map((e) => e.seed_key)).toEqual(["ACT-05", "ACT-04", "ACT-03", "ACT-02", "ACT-01"]);
    expect(diyaFeed.entries.map((e) => e.seed_key)).toEqual(["ACT-05", "ACT-04", "ACT-02", "ACT-01"]);
    expect(miraFeed.entries.some((e) => e.awaiting_publish)).toBe(false);
    const today = await buildActivityFeed(db, mira, wedding_id, { day: "today" }, { now: new Date("2026-11-25T12:00:00+05:30") });
    expect(today.entries.map((e) => e.seed_key)).toEqual(["ACT-05", "ACT-04"]);
    const paged = await buildActivityFeed(db, mira, wedding_id, { limit: 2 });
    expect(paged.entries).toHaveLength(2);
    const next = await buildActivityFeed(db, mira, wedding_id, { limit: 2, before_seq: paged.next_before_seq! });
    expect(next.entries.map((e) => e.seed_key)).toEqual(["ACT-03", "ACT-02"]);
    const proposals = await buildActivityFeed(db, mira, wedding_id, { topic_prefix: "proposal." });
    expect(proposals.entries.map((e) => e.seed_key)).toEqual(["ACT-03"]);
    // An impossible date is refused, never rolled over to 2 March.
    await expect(buildActivityFeed(db, mira, wedding_id, { day: "2026-02-30" })).rejects.toMatchObject({
      body: { code: "validation_failed", field: "day" },
    });
  });

  it("Diya moves the reception to Lotus Hall: one draft change, ACT-07 awaiting publish (AT-3.3, AT-8.2)", async () => {
    const before = await weddingRow();
    const venueCount = (await db.select().from(venues).where(eq(venues.wedding_id, wedding_id))).length;

    const response = await run(diya, "update_event", { event_id: RECEPTION, expected_version: 1, venue_name: "Lotus Hall, Mallige Gardens" });
    expect(response.ok).toBe(true);
    if (!response.ok) return;
    expect(response.outcome).toBe("applied");
    expect(response.result).toMatchObject({ event_id: RECEPTION, version: 2, draft_version: Number(before.draft_version) + 1 });
    expect(response.warnings).toEqual([]);

    const after = await weddingRow();
    expect(Number(after.version)).toBe(Number(before.version) + 1);
    expect(Number(after.draft_version)).toBe(Number(before.draft_version) + 1);
    expect((await db.select().from(venues).where(eq(venues.wedding_id, wedding_id))).length).toBe(venueCount);
    const [row] = await db.select().from(events).where(eq(events.id, RECEPTION));
    expect(row.venue_id).toBe(LOTUS);

    const itinerary = await buildItinerary(db, mira, wedding_id);
    expect(itinerary.unpublished_changes).toHaveLength(1);
    expect(itinerary.unpublished_changes[0]).toMatchObject({
      entity: "event",
      entity_id: RECEPTION,
      field: "venue",
      published_value: "Banyan Hall",
      draft_value: "Lotus Hall",
      changed_by: "Diya",
    });
    expect(itinerary.conflicts.map((c) => c.kind)).toEqual(["overlap"]);
    const reception = itinerary.functions.find((f) => f.event_id === RECEPTION)!;
    expect(reception.venue?.name).toBe("Lotus Hall");
    expect(reception.published?.venue?.name).toBe("Banyan Hall");

    const diyaFeed = await buildActivityFeed(db, diya, wedding_id);
    expect(diyaFeed.entries).toHaveLength(5);
    const act07 = diyaFeed.entries[0];
    expect(act07).toMatchObject({
      actor_label: "Diya",
      topic: "event.updated",
      command: "update_event",
      entity_id: RECEPTION,
      summary_en: "Diya moved the reception from Banyan Hall to Lotus Hall.",
      summary_hi: "Diya ने रिसेप्शन का स्थान Banyan Hall से बदलकर Lotus Hall किया।",
      before: { venue_id: BANYAN, venue: "Banyan Hall" },
      after: { venue_id: LOTUS, venue: "Lotus Hall" },
      awaiting_publish: true,
    });
    const [stored] = await db.select().from(activityEntries).where(eq(activityEntries.id, act07.id));
    expect(stored.visibility).toBe("members");
    expect((await buildActivityFeed(db, mira, wedding_id)).entries).toHaveLength(6);

    const draft = await loadPublishDraft(db, wedding_id);
    expect(draft.draft_version).toBe(Number(after.draft_version));
    expect(draft.latest_publication?.revision).toBe(2);
    expect(draft.changes).toEqual([
      { entity: "event", entity_id: RECEPTION, field: "venue", from: "Banyan Hall", to: "Lotus Hall" },
    ]);
  });

  it("the same venue again is unchanged; the same key replays", async () => {
    const key = randomUUID();
    const first = await run(diya, "update_event", { event_id: RECEPTION, expected_version: 2, venue_name: "Lotus" }, key);
    expect(first.ok && first.outcome).toBe("unchanged");
    const again = await run(diya, "update_event", { event_id: RECEPTION, expected_version: 2, venue_name: "Lotus" }, key);
    expect(again.ok && again.outcome).toBe("replayed");
  });

  it("Mira's save on the old version gets stale_version with who changed it last (AT-3.7)", async () => {
    // A later bulk RSVP entry also carries the reception's id; it never names the editor.
    clock = new Date(clock.getTime() + 60_000);
    await db.insert(activityEntries).values({
      wedding_id,
      occurred_at: clock,
      actor_type: "member",
      actor_member_id: mira.member_id,
      actor_label: "Kabir",
      command: "set_rsvp",
      topic: "rsvp.updated",
      source: "ui",
      entity_type: "event",
      entity_id: RECEPTION,
      summary_en: "Kabir marked 2 guests as attending for the reception: A, B.",
      summary_hi: "Kabir ने रिसेप्शन के लिए 2 मेहमानों का जवाब दर्ज किया: आ रहे हैं (A, B)।",
      visibility: "members",
    });
    const before = await weddingRow();
    const response = await run(mira, "update_event", { event_id: RECEPTION, expected_version: 1, start_time: "20:00" });
    expect(response.ok).toBe(false);
    if (response.ok) return;
    expect(response.error.code).toBe("stale_version");
    expect(response.error.current).toMatchObject({ event_id: RECEPTION, version: 2, venue_id: LOTUS, changed_by: "Diya" });
    expect(Number((await weddingRow()).version)).toBe(Number(before.version));
  });

  it("refuses an end before the start, a foreign venue and an unknown function (AT-3.8, 5.0)", async () => {
    const badTime = await run(mira, "update_event", { event_id: RECEPTION, expected_version: 2, end_time: "19:00" });
    expect(!badTime.ok && badTime.error).toMatchObject({ code: "validation_failed", message: "time_order", field: "end_time" });
    const foreignVenue = seededId("a", "venues", "VNU-LOTUS");
    const foreign = await run(mira, "update_event", { event_id: RECEPTION, expected_version: 2, venue_id: foreignVenue });
    expect(!foreign.ok && foreign.error.code).toBe("not_found");
    const unknown = await run(mira, "update_event", { event_id: randomUUID(), expected_version: 1, title: "Party" });
    expect(!unknown.ok && unknown.error.code).toBe("not_found");
  });

  it("a lead-only change moves version but not draft_version (P1)", async () => {
    const before = await weddingRow();
    const response = await run(mira, "update_event", { event_id: RECEPTION, expected_version: 2, lead_name: "Anil Deshpande" });
    expect(response.ok && response.outcome).toBe("applied");
    const after = await weddingRow();
    expect(Number(after.version)).toBe(Number(before.version) + 1);
    expect(Number(after.draft_version)).toBe(Number(before.draft_version));
    const feed = await buildActivityFeed(db, mira, wedding_id, { limit: 1 });
    expect(feed.entries[0].summary_en).toBe("Mira changed the reception: lead Diya Fernandes to Anil Deshpande.");
    expect(feed.entries[0].awaiting_publish).toBe(false);
  });

  it("add_requirement saves Jain food for 12, then refuses the duplicate (AT-12.2, ACT-10)", async () => {
    const input = { event_id: RECEPTION, text: "Jain food", quantity: 12, requirement_category: "catering", vendor_id: CATERER };
    const first = await run(mira, "add_requirement", input);
    expect(first.ok && first.outcome).toBe("applied");
    const feed = await buildActivityFeed(db, mira, wedding_id, { limit: 1 });
    expect(feed.entries[0]).toMatchObject({
      topic: "requirement.added",
      summary_en: 'Mira added "Jain food for 12" to the reception.',
      awaiting_publish: false,
    });
    const duplicate = await run(mira, "add_requirement", { ...input, text: " jain  FOOD " });
    expect(duplicate.ok).toBe(false);
    if (duplicate.ok) return;
    expect(duplicate.error.code).toBe("duplicate_requirement");
    expect(duplicate.error.current).toMatchObject({ label: "Jain food for 12" });
    const itinerary = await buildItinerary(db, diya, wedding_id);
    const labels = itinerary.functions.find((f) => f.event_id === RECEPTION)!.requirements.map((r) => r.label);
    expect(labels.filter((label) => label === "Jain food for 12")).toHaveLength(1);
    // A different quantity is not a duplicate.
    const other = await run(mira, "add_requirement", { ...input, quantity: 14 });
    expect(other.ok && other.outcome).toBe("applied");
  });

  it("create_event adds a function and a new venue, listed as an unpublished addition (AT-3.2)", async () => {
    const before = await weddingRow();
    const response = await run(mira, "create_event", {
      event_kind: "other",
      title: "Cocktail night",
      event_date: "2026-12-12",
      start_time: "19:00",
      venue_name: "Skyline Rooftop Bar",
    });
    expect(response.ok).toBe(true);
    if (!response.ok) return;
    expect(response.result).toMatchObject({ version: 1, venue_created: true });
    const after = await weddingRow();
    expect(Number(after.draft_version)).toBe(Number(before.draft_version) + 1);
    const feed = await buildActivityFeed(db, diya, wedding_id, { limit: 1 });
    expect(feed.entries[0]).toMatchObject({
      topic: "event.created",
      summary_en: "Mira added the Cocktail night on Sat 12 Dec, 7:00 PM at Skyline Rooftop Bar.",
      awaiting_publish: true,
    });
    const itinerary = await buildItinerary(db, mira, wedding_id);
    expect(itinerary.functions[0].title).toBe("Cocktail night");
    expect(itinerary.unpublished_changes.map((c) => c.field).sort()).toEqual(["added", "venue"]);
    expect(itinerary.unpublished_changes.find((c) => c.field === "added")).toMatchObject({ changed_by: "Mira", draft_value: "Cocktail night" });
  });
});
