import "server-only";

import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { CommandFailure } from "@/contracts/commands";
import type {
  EventKind,
  IsoInstant,
  JsonValue,
  PublicationSnapshot,
  SessionActor,
  SnapshotChange,
  SnapshotEvent,
  WeddingId,
} from "@/contracts/domain";
import { EVENT_KIND_DEFAULT_TITLES } from "@/contracts/domain";
import type {
  Itinerary,
  ItineraryConflict,
  ItineraryFunction,
  ItineraryRequirement,
  ItineraryVenue,
  NoParams,
  UnpublishedChange,
} from "@/contracts/read-models";
import type { DbOrTx } from "@/db/client";
import { hhmm, toIstInstant } from "@/db/ist";
import {
  EVENT_ADDED_FIELD,
  EVENT_REMOVED_FIELD,
  EVENT_VENUE_FIELD,
  buildItinerarySnapshot,
  compareSnapshotOrder,
  diffSnapshots,
} from "@/db/itinerary-snapshot";
import { activityEntries, events, guests, invitations, inviteStyles, members, publications, requirements, venues, weddings } from "@/db/schema";

/**
 * `itinerary` (domain 4.3, D99, D127) and the draft helpers around it:
 * - `buildItinerary`: the draft functions with their published values, every venue, each
 *   function's requirements, the unpublished changes (P8) and the draft's conflicts;
 * - `loadPublishDraft`: what Lane D's `publish_itinerary` needs inside its transaction
 *   (`draft_version`, the draft snapshot built with the one builder, the latest publication);
 * - the pure conflict rules (`detectConflicts`), which `create_event` and `update_event`
 *   also use for their warnings.
 *
 * Snapshots are built only by `src/db/itinerary-snapshot.ts` (D95): the draft snapshot here
 * and the stored publications come from the same builder, so the diff is field for field.
 */

// ---------------------------------------------------------------------------
// Small helpers shared with the event commands
// ---------------------------------------------------------------------------

/** Read models never return a count or version that isn't a safe integer (domain 0.1). */
export function safeInteger(name: string, value: unknown): number {
  const number = typeof value === "string" ? Number(value) : value;
  if (typeof number !== "number" || !Number.isSafeInteger(number)) {
    throw new Error(`itinerary: ${name} is not a safe integer`);
  }
  return number;
}

/**
 * `{event}` in activity and warning text (domain 3.0): the function word in a sentence,
 * "reception"; an `other` function uses its title.
 */
export function eventWord(event_kind: EventKind, title: string): string {
  const label = EVENT_KIND_DEFAULT_TITLES[event_kind];
  return label ? label.en.toLowerCase() : title;
}

/** `starts_at` and friends: the IST wall clock with the +05:30 offset, or null without a time. */
export function istInstantOf(event_date: string, time: string | null): IsoInstant | null {
  const t = hhmm(time);
  return t ? `${event_date}T${t}:00+05:30` : null;
}

function minutesOf(time: string): number {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

function clockOf(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Conflicts (4.3), computed on the draft, members only
// ---------------------------------------------------------------------------

/** A function as the conflict rules read it. Times are `HH:MM` (or `HH:MM:SS`), or null. */
export type ConflictEvent = {
  event_id: string;
  event_kind: EventKind;
  title: string;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  venue_id: string | null;
  sort_order?: number;
};

export type ConflictVenue = { venue_id: string; name: string; capacity: number | null };

/** The length taken for a function without an end time (4.3). */
export const DEFAULT_FUNCTION_MINUTES = 180;

/**
 * `overlap`: two functions on the same day whose times overlap, taking 3 hours as the
 * length when `end_time` is empty. The earlier-starting function comes first in
 * `event_ids` and in the text: "The Mehendi ends at 19:30 but the Sangeet starts at 19:00:
 * 30 minutes overlap." Functions without a start time can't overlap anything.
 */
export function detectOverlaps(rows: readonly ConflictEvent[]): ItineraryConflict[] {
  const timed = rows
    .filter((row) => hhmm(row.start_time) !== null)
    .map((row) => {
      const start = minutesOf(hhmm(row.start_time)!);
      const end = hhmm(row.end_time) ? minutesOf(hhmm(row.end_time)!) : start + DEFAULT_FUNCTION_MINUTES;
      return { row, start, end, start_time: hhmm(row.start_time)!, sort_order: row.sort_order ?? 0 };
    })
    .sort((a, b) =>
      compareSnapshotOrder(
        { event_date: a.row.event_date, start_time: a.start_time, sort_order: a.sort_order, event_id: a.row.event_id },
        { event_date: b.row.event_date, start_time: b.start_time, sort_order: b.sort_order, event_id: b.row.event_id },
      ),
    );

  const found: ItineraryConflict[] = [];
  for (let i = 0; i < timed.length; i += 1) {
    for (let j = i + 1; j < timed.length; j += 1) {
      const a = timed[i];
      const b = timed[j];
      if (a.row.event_date !== b.row.event_date) continue;
      const overlap = Math.min(a.end, b.end) - b.start;
      if (overlap <= 0) continue;
      found.push({
        kind: "overlap",
        event_ids: [a.row.event_id, b.row.event_id],
        overlap_minutes: overlap,
        text: `The ${a.row.title} ends at ${clockOf(a.end)} but the ${b.row.title} starts at ${b.start_time}: ${overlap} minutes overlap.`,
      });
    }
  }
  return found;
}

/**
 * `over_capacity`: a function's confirmed headcount (4.4) is above its venue's capacity:
 * "Banyan Hall seats 220; 229 are attending the reception." A venue without a capacity
 * never warns.
 */
export function detectOverCapacity(
  rows: readonly ConflictEvent[],
  venueRows: readonly ConflictVenue[],
  confirmed: ReadonlyMap<string, number>,
): ItineraryConflict[] {
  const byId = new Map(venueRows.map((venue) => [venue.venue_id, venue]));
  const found: ItineraryConflict[] = [];
  for (const row of rows) {
    if (!row.venue_id) continue;
    const venue = byId.get(row.venue_id);
    if (!venue || venue.capacity === null) continue;
    const headcount = confirmed.get(row.event_id) ?? 0;
    if (headcount <= venue.capacity) continue;
    found.push({
      kind: "over_capacity",
      event_ids: [row.event_id],
      venue_id: venue.venue_id,
      capacity: venue.capacity,
      confirmed_headcount: headcount,
      text: `${venue.name} seats ${venue.capacity}; ${headcount} are attending the ${eventWord(row.event_kind, row.title)}.`,
    });
  }
  return found;
}

/** Every draft conflict: the overlaps first (in start order), then the over-capacity warnings. */
export function detectConflicts(
  rows: readonly ConflictEvent[],
  venueRows: readonly ConflictVenue[],
  confirmed: ReadonlyMap<string, number>,
): ItineraryConflict[] {
  const ordered = [...rows].sort((a, b) =>
    compareSnapshotOrder(
      { event_date: a.event_date, start_time: hhmm(a.start_time), sort_order: a.sort_order ?? 0, event_id: a.event_id },
      { event_date: b.event_date, start_time: hhmm(b.start_time), sort_order: b.sort_order ?? 0, event_id: b.event_id },
    ),
  );
  return [...detectOverlaps(ordered), ...detectOverCapacity(ordered, venueRows, confirmed)];
}

// ---------------------------------------------------------------------------
// Loading the draft
// ---------------------------------------------------------------------------

/** Confirmed headcount per function (4.4, R4): 1 + plus-ones over attending, active invitations. */
export async function loadConfirmedHeadcounts(db: DbOrTx, wedding_id: WeddingId): Promise<Map<string, number>> {
  const rows = await db
    .select({
      event_id: invitations.event_id,
      headcount: sql<number>`coalesce(sum(1 + ${invitations.plus_ones}), 0)::bigint`,
    })
    .from(invitations)
    .innerJoin(guests, eq(guests.id, invitations.guest_id))
    .where(
      and(
        eq(invitations.wedding_id, wedding_id),
        eq(invitations.rsvp_status, "attending"),
        isNull(invitations.revoked_at),
        isNull(guests.deleted_at),
      ),
    )
    .groupBy(invitations.event_id);
  return new Map(rows.map((row) => [row.event_id, safeInteger("confirmed_headcount", row.headcount)]));
}

async function loadEventRows(db: DbOrTx, wedding_id: WeddingId) {
  return db
    .select()
    .from(events)
    .where(and(eq(events.wedding_id, wedding_id), isNull(events.deleted_at)));
}

async function loadVenueRows(db: DbOrTx, wedding_id: WeddingId) {
  return db
    .select()
    .from(venues)
    .where(eq(venues.wedding_id, wedding_id))
    .orderBy(asc(venues.created_at), asc(venues.name), asc(venues.id));
}

/** The draft conflicts of one wedding, read inside the caller's transaction (for command warnings). */
export async function loadDraftConflicts(db: DbOrTx, wedding_id: WeddingId): Promise<ItineraryConflict[]> {
  const [eventRows, venueRows, confirmed] = await Promise.all([
    loadEventRows(db, wedding_id),
    loadVenueRows(db, wedding_id),
    loadConfirmedHeadcounts(db, wedding_id),
  ]);
  return detectConflicts(
    eventRows.map((row) => ({ ...row, event_id: row.id })),
    venueRows.map((row) => ({ venue_id: row.id, name: row.name, capacity: row.capacity })),
    confirmed,
  );
}

/** The latest publication (the one `weddings.published_revision` points at), or null. */
export type LatestPublication = {
  publication_id: string;
  seed_key: string | null;
  revision: number;
  snapshot: PublicationSnapshot;
  draft_version: number;
  changes: SnapshotChange[];
  note: string | null;
  published_by_member_id: string;
  published_by_label: string | null;
  published_at: Date;
};

async function loadLatestPublication(
  db: DbOrTx,
  wedding_id: WeddingId,
  published_revision: number | null,
): Promise<LatestPublication | null> {
  if (published_revision === null) return null;
  const rows = await db
    .select({
      publication_id: publications.id,
      seed_key: publications.seed_key,
      revision: publications.revision,
      snapshot: publications.snapshot,
      draft_version: publications.draft_version,
      changes: publications.changes,
      note: publications.note,
      published_by_member_id: publications.published_by_member_id,
      published_by_label: members.display_name,
      published_at: publications.published_at,
    })
    .from(publications)
    .leftJoin(members, eq(members.id, publications.published_by_member_id))
    .where(and(eq(publications.wedding_id, wedding_id), eq(publications.revision, published_revision)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    ...row,
    revision: safeInteger("revision", row.revision),
    draft_version: safeInteger("draft_version", row.draft_version),
    snapshot: row.snapshot as unknown as PublicationSnapshot,
    changes: (Array.isArray(row.changes) ? row.changes : []) as unknown as SnapshotChange[],
  };
}

async function loadWeddingRow(db: DbOrTx, wedding_id: WeddingId) {
  const rows = await db
    .select({
      id: weddings.id,
      bride_name: weddings.bride_name,
      groom_name: weddings.groom_name,
      city: weddings.city,
      wedding_date: weddings.wedding_date,
      version: weddings.version,
      draft_version: weddings.draft_version,
      published_revision: weddings.published_revision,
    })
    .from(weddings)
    .where(eq(weddings.id, wedding_id))
    .limit(1);
  const row = rows[0];
  if (!row) throw new CommandFailure({ code: "not_found", message: "Wedding not found." });
  return row;
}

async function loadInviteStyleRow(db: DbOrTx, wedding_id: WeddingId) {
  const rows = await db.select().from(inviteStyles).where(eq(inviteStyles.wedding_id, wedding_id)).limit(1);
  return rows[0] ?? null;
}

/** What Lane D's `publish_itinerary` reads under the wedding lock (D41, D95). */
export type PublishDraft = {
  /** `weddings.draft_version` now: compare with `expected_draft_version` (P6). */
  draft_version: number;
  published_revision: number | null;
  /** The draft's guest-visible snapshot, built with `buildItinerarySnapshot`. */
  snapshot: PublicationSnapshot;
  latest_publication: LatestPublication | null;
  /**
   * `diffSnapshots(latest, snapshot)`: the next revision's `changes`. Empty with a latest
   * publication means nothing to publish (P7); before the first publish it is always empty.
   */
  changes: SnapshotChange[];
};

/**
 * The draft as `publish_itinerary` needs it, read inside its transaction (the dispatcher
 * has locked the `weddings` row, so the draft can't move underneath it). Lane D's handler
 * calls this and never builds a snapshot itself (D95).
 */
export async function loadPublishDraft(tx: DbOrTx, wedding_id: WeddingId): Promise<PublishDraft> {
  const wedding = await loadWeddingRow(tx, wedding_id);
  const [style, eventRows, venueRows, latest] = await Promise.all([
    loadInviteStyleRow(tx, wedding_id),
    loadEventRows(tx, wedding_id),
    loadVenueRows(tx, wedding_id),
    loadLatestPublication(tx, wedding_id, wedding.published_revision),
  ]);
  const snapshot = buildItinerarySnapshot({ wedding, invite_style: style, events: eventRows, venues: venueRows });
  return {
    draft_version: safeInteger("draft_version", wedding.draft_version),
    published_revision: wedding.published_revision,
    snapshot,
    latest_publication: latest,
    changes: diffSnapshots(latest?.snapshot ?? null, snapshot, { wedding_id }),
  };
}

// ---------------------------------------------------------------------------
// Unpublished changes (P8) and who made them
// ---------------------------------------------------------------------------

/** The draft-edit topics an unpublished change can come from. */
const DRAFT_TOPICS = ["wedding.created", "wedding.updated", "event.created", "event.updated", "invite_style.updated", "asset.added"];

const TOPICS_BY_ENTITY: Record<UnpublishedChange["entity"], readonly string[]> = {
  wedding: ["wedding.created", "wedding.updated"],
  event: ["event.created", "event.updated"],
  venue: ["event.created", "event.updated"],
  invite_style: ["invite_style.updated", "asset.added"],
};

export type AttributionEntry = {
  entity_id: string;
  topic: string;
  actor_label: string;
  occurred_at: Date;
  before: JsonValue | null;
  after: JsonValue | null;
};

function hasKey(value: JsonValue | null, key: string): boolean {
  return value !== null && typeof value === "object" && !Array.isArray(value) && key in value;
}

function entryTouches(entry: AttributionEntry, change: SnapshotChange): boolean {
  if (!TOPICS_BY_ENTITY[change.entity].includes(entry.topic)) return false;
  if (change.field === EVENT_ADDED_FIELD) return entry.topic === "event.created";
  if (change.field === EVENT_REMOVED_FIELD) return true;
  const keys = change.field === EVENT_VENUE_FIELD ? ["venue_id", "venue"] : [change.field];
  return keys.some((key) => hasKey(entry.after, key) || hasKey(entry.before, key));
}

/**
 * P8's unpublished changes from the snapshot diff, each with who changed it last: the
 * latest entry (newest first in `entries`) on that record that touched that field, else
 * the latest draft entry on that record. Before the first publish every function is listed
 * as `added`.
 */
export function unpublishedChangesFrom(
  latest: PublicationSnapshot | null,
  draft: PublicationSnapshot,
  wedding_id: WeddingId,
  entriesNewestFirst: readonly AttributionEntry[],
): UnpublishedChange[] {
  const changes = diffSnapshots(latest ?? { ...draft, events: [] }, draft, { wedding_id });
  return changes.map((change) => {
    const forRecord = entriesNewestFirst.filter(
      (entry) => entry.entity_id === change.entity_id && TOPICS_BY_ENTITY[change.entity].includes(entry.topic),
    );
    const entry = forRecord.find((candidate) => entryTouches(candidate, change)) ?? forRecord[0] ?? null;
    return {
      entity: change.entity,
      entity_id: change.entity_id,
      field: change.field,
      published_value: change.from,
      draft_value: change.to,
      changed_by: entry?.actor_label ?? null,
      changed_at: entry ? toIstInstant(entry.occurred_at) : null,
    };
  });
}

async function loadAttribution(db: DbOrTx, wedding_id: WeddingId, entity_ids: string[]): Promise<AttributionEntry[]> {
  const ids = [...new Set(entity_ids.filter((id) => id.length > 0))];
  if (ids.length === 0) return [];
  return db
    .select({
      entity_id: activityEntries.entity_id,
      topic: activityEntries.topic,
      actor_label: activityEntries.actor_label,
      occurred_at: activityEntries.occurred_at,
      before: activityEntries.before,
      after: activityEntries.after,
    })
    .from(activityEntries)
    .where(
      and(
        eq(activityEntries.wedding_id, wedding_id),
        inArray(activityEntries.entity_id, ids),
        inArray(activityEntries.topic, DRAFT_TOPICS),
      ),
    )
    .orderBy(desc(activityEntries.seq));
}

// ---------------------------------------------------------------------------
// The read model
// ---------------------------------------------------------------------------

function requirementLabel(text: string, quantity: number | null): string {
  return quantity === null ? text : `${text} for ${quantity}`;
}

/**
 * `itinerary` for any member (READ_MODEL_PERMISSIONS: owners and managers). Nothing in it
 * is role-filtered: it holds no money, no contacts and no guest data; its conflicts are
 * for members only, and guests never read it (G2).
 */
export async function buildItinerary(
  db: DbOrTx,
  actor: SessionActor,
  wedding_id: WeddingId,
  params: NoParams = {} as NoParams,
): Promise<Itinerary> {
  void actor;
  void params;
  const wedding = await loadWeddingRow(db, wedding_id);
  const [style, eventRows, venueRows, latest, confirmed, requirementRows] = await Promise.all([
    loadInviteStyleRow(db, wedding_id),
    loadEventRows(db, wedding_id),
    loadVenueRows(db, wedding_id),
    loadLatestPublication(db, wedding_id, wedding.published_revision),
    loadConfirmedHeadcounts(db, wedding_id),
    db
      .select({
        requirement_id: requirements.id,
        seed_key: requirements.seed_key,
        event_id: requirements.event_id,
        text: requirements.text,
        quantity: requirements.quantity,
      })
      .from(requirements)
      .where(and(eq(requirements.wedding_id, wedding_id), isNull(requirements.deleted_at)))
      .orderBy(asc(requirements.created_at), asc(requirements.seed_key), asc(requirements.id)),
  ]);

  const draft = buildItinerarySnapshot({ wedding, invite_style: style, events: eventRows, venues: venueRows });
  const changesPreview = diffSnapshots(latest?.snapshot ?? { ...draft, events: [] }, draft, { wedding_id });
  const attribution = await loadAttribution(
    db,
    wedding_id,
    changesPreview.map((change) => change.entity_id),
  );
  const unpublished_changes = unpublishedChangesFrom(latest?.snapshot ?? null, draft, wedding_id, attribution);

  const venueById = new Map(venueRows.map((venue) => [venue.id, venue]));
  const publishedById = new Map<string, SnapshotEvent>((latest?.snapshot.events ?? []).map((event) => [event.event_id, event]));
  const requirementsByEvent = new Map<string, ItineraryRequirement[]>();
  for (const row of requirementRows) {
    const list = requirementsByEvent.get(row.event_id) ?? [];
    list.push({ requirement_id: row.requirement_id, seed_key: row.seed_key, label: requirementLabel(row.text, row.quantity) });
    requirementsByEvent.set(row.event_id, list);
  }

  const ordered = [...eventRows].sort((a, b) =>
    compareSnapshotOrder(
      { event_date: a.event_date, start_time: hhmm(a.start_time), sort_order: a.sort_order, event_id: a.id },
      { event_date: b.event_date, start_time: hhmm(b.start_time), sort_order: b.sort_order, event_id: b.id },
    ),
  );

  const functions: ItineraryFunction[] = ordered.map((row) => {
    const venue = row.venue_id ? (venueById.get(row.venue_id) ?? null) : null;
    const published = publishedById.get(row.id);
    return {
      event_id: row.id,
      seed_key: row.seed_key,
      event_kind: row.event_kind,
      title: row.title,
      title_hi: row.title_hi,
      event_date: row.event_date,
      start_time: hhmm(row.start_time),
      end_time: hhmm(row.end_time),
      muhurat_time: hhmm(row.muhurat_time),
      starts_at: istInstantOf(row.event_date, row.start_time),
      ends_at: istInstantOf(row.event_date, row.end_time),
      muhurat_at: istInstantOf(row.event_date, row.muhurat_time),
      venue_id: row.venue_id,
      venue: venue
        ? {
            venue_id: venue.id,
            name: venue.name,
            place_name: venue.place_name,
            locality: venue.locality,
            address: venue.address,
            capacity: venue.capacity === null ? null : safeInteger("capacity", venue.capacity),
            map_url: venue.map_url,
          }
        : null,
      dress_code: row.dress_code,
      description: row.description,
      lead_name: row.lead_name,
      expected_headcount: row.expected_headcount === null ? null : safeInteger("expected_headcount", row.expected_headcount),
      version: safeInteger("version", row.version),
      ...(published ? { published } : {}),
      requirements: requirementsByEvent.get(row.id) ?? [],
    };
  });

  const venueList: ItineraryVenue[] = venueRows.map((venue) => ({
    venue_id: venue.id,
    seed_key: venue.seed_key,
    name: venue.name,
    place_name: venue.place_name,
    capacity: venue.capacity === null ? null : safeInteger("capacity", venue.capacity),
  }));

  const conflicts = detectConflicts(
    ordered.map((row) => ({ ...row, event_id: row.id })),
    venueRows.map((venue) => ({ venue_id: venue.id, name: venue.name, capacity: venue.capacity })),
    confirmed,
  );

  return {
    version: safeInteger("version", wedding.version),
    hidden: [],
    functions,
    venues: venueList,
    unpublished_changes,
    conflicts,
    draft_version: safeInteger("draft_version", wedding.draft_version),
    published_revision: wedding.published_revision,
    published_at: latest ? toIstInstant(latest.published_at) : null,
    published_by: latest?.published_by_label ?? null,
  };
}
