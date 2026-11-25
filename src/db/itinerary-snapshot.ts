/**
 * The publication snapshot builder (decision D95; domain-and-data 2.5 P1–P8 and 5.3).
 *
 * Pure functions with no I/O and no `server-only`, so every caller shares one copy:
 * - `scripts/seed.ts` builds REV-1 and REV-2 with `buildItinerarySnapshot`, never by hand;
 * - Lane D's `publish_itinerary` builds each later revision with it and stores
 *   `diffSnapshots(latest, next)` as `publications.changes` (P4, P7);
 * - Lane A's `itinerary` read model diffs the draft against the latest snapshot for
 *   `unpublished_changes` (P8).
 * Nobody writes a second builder.
 *
 * A snapshot holds exactly P2's guest-visible fields: the couple's names, city and main
 * date; each function's kind, titles, date, start, end, muhurat, venue, dress code and
 * description; each venue's name, place, locality, address and map link; the invitation
 * style, wording, blessing line and couple photo (as an asset id). Nothing else gets in:
 * no function leads, headcounts, capacities, versions or seed keys (privacy, G rules).
 *
 * Inputs are plain rows shaped like `src/db/schema.ts` rows (snake_case keys, `id` as the
 * primary key). The contract DTOs (`event_id`, `venue_id` as the key) are accepted too.
 * Extra columns are ignored. Times may come from Postgres as `HH:MM:SS`; the snapshot
 * always writes `HH:MM`, and absent values as `null`.
 */

import type {
  EventKind,
  InviteLayout,
  InviteTheme,
  InviteTypeface,
  IsoDate,
  IsoTime,
  JsonPrimitive,
  PhotoFrame,
  PublicationSnapshot,
  SnapshotChange,
  SnapshotEvent,
  SnapshotVenue,
} from "../contracts/domain";

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/** A date as Postgres returns it through Drizzle: `YYYY-MM-DD` (mode "string") or a Date at UTC midnight. */
export type SnapshotDateInput = string | Date;

/** The `weddings` columns the snapshot reads. */
export type SnapshotWeddingRow = {
  id?: string;
  bride_name: string;
  groom_name: string;
  city?: string | null;
  wedding_date: SnapshotDateInput;
};

/** The `invite_styles` columns the snapshot reads. Missing or null values take the table defaults. */
export type SnapshotInviteStyleRow = {
  wedding_id?: string;
  theme?: InviteTheme | null;
  typeface?: InviteTypeface | null;
  layout?: InviteLayout | null;
  photo_frame?: PhotoFrame | null;
  photo_asset_id?: string | null;
  heading_hi?: string | null;
  wording_en?: string | null;
  wording_hi?: string | null;
  blessing_line?: string | null;
};

/** The `events` columns the snapshot reads. `id` (schema row) or `event_id` (DTO) is the key. */
export type SnapshotEventRow = {
  id?: string;
  event_id?: string;
  wedding_id?: string;
  event_kind: EventKind;
  title: string;
  title_hi: string;
  event_date: SnapshotDateInput;
  start_time?: string | null;
  end_time?: string | null;
  muhurat_time?: string | null;
  venue_id?: string | null;
  dress_code?: string | null;
  description?: string | null;
  /** Tie-break after date and start time (5.1). Not part of the snapshot. */
  sort_order?: number | null;
  /** Rows with a value are left out (5.0). */
  deleted_at?: SnapshotDateInput | null;
};

/** The `venues` columns the snapshot reads. `id` (schema row) or `venue_id` (DTO) is the key. */
export type SnapshotVenueRow = {
  id?: string;
  venue_id?: string;
  wedding_id?: string;
  name: string;
  place_name?: string | null;
  locality?: string | null;
  address?: string | null;
  map_url?: string | null;
};

/**
 * The itinerary rows of one wedding. `venues` may hold every venue of the wedding: only
 * the ones a published function uses reach the snapshot. `invite_style` null means the
 * wedding has no style row yet, and the snapshot carries the table defaults.
 */
export type ItinerarySnapshotInput = {
  wedding: SnapshotWeddingRow;
  invite_style: SnapshotInviteStyleRow | null | undefined;
  events: readonly SnapshotEventRow[];
  venues: readonly SnapshotVenueRow[];
};

/** Thrown when the rows can't make a valid snapshot (a bad time, a missing or foreign venue). */
export class SnapshotInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SnapshotInputError";
  }
}

// ---------------------------------------------------------------------------
// The snapshot's fields (P2), in the order 5.3 writes them
// ---------------------------------------------------------------------------

export const SNAPSHOT_WEDDING_FIELDS = ["bride_name", "groom_name", "city", "wedding_date"] as const;

export const SNAPSHOT_INVITE_STYLE_FIELDS = [
  "theme",
  "typeface",
  "layout",
  "photo_frame",
  "photo_asset_id",
  "heading_hi",
  "wording_en",
  "wording_hi",
  "blessing_line",
] as const;

/** Every SnapshotEvent key. `venue` is compared by venue, not field by field (see diffSnapshots). */
export const SNAPSHOT_EVENT_FIELDS = [
  "event_id",
  "event_kind",
  "title",
  "title_hi",
  "event_date",
  "start_time",
  "end_time",
  "muhurat_time",
  "dress_code",
  "description",
  "venue",
] as const;

export const SNAPSHOT_VENUE_FIELDS = ["venue_id", "name", "place_name", "locality", "address", "map_url"] as const;

/** The `invite_styles` table defaults (5.1), used when a wedding has no style row yet. */
export const DEFAULT_INVITE_STYLE: PublicationSnapshot["invite_style"] = {
  theme: "maroon_gold",
  typeface: "eczar",
  layout: "card_with_inserts",
  photo_frame: "mounted",
  photo_asset_id: null,
  heading_hi: "शुभ विवाह",
  wording_en: null,
  wording_hi: null,
  blessing_line: null,
};

// ---------------------------------------------------------------------------
// Value normalisers (also for the itinerary read model, so draft and snapshot agree)
// ---------------------------------------------------------------------------

const TIME_PATTERN = /^(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/;
/** A bare calendar date, as Postgres `date` columns come back. Instants are refused: their date depends on the zone. */
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const IST_OFFSET_MS = 330 * 60 * 1000;

/** `HH:MM` from `HH:MM`, `H:MM`, `HH:MM:SS` or `HH:MM:SS.ffffff`; null stays null. Throws on anything else. */
export function toIsoTime(value: string | null | undefined): IsoTime | null {
  if (value === null || value === undefined) return null;
  const match = TIME_PATTERN.exec(value.trim());
  if (!match) throw new SnapshotInputError(`Not a time: ${JSON.stringify(value)}`);
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = match[3] === undefined ? 0 : Number(match[3]);
  // Postgres allows 24:00:00 as the end of a day; nothing later.
  const valid = minutes < 60 && seconds < 60 && (hours < 24 || (hours === 24 && minutes === 0 && seconds === 0));
  if (!valid) throw new SnapshotInputError(`Not a time: ${JSON.stringify(value)}`);
  return `${String(hours).padStart(2, "0")}:${match[2]}`;
}

/**
 * `YYYY-MM-DD` from a bare date string or a Date. A Date is read as an IST calendar date
 * (AGENTS rule 9): a Drizzle `date` Date sits at UTC midnight, which is the same IST date,
 * and an instant such as IST midnight (18:30 UTC the day before) still gives the right day.
 * Throws on anything else, including impossible dates such as 2026-02-30.
 */
export function toIsoDate(value: SnapshotDateInput): IsoDate {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new SnapshotInputError("Not a date: Invalid Date");
    return new Date(value.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
  }
  const match = DATE_PATTERN.exec(value.trim());
  if (!match) throw new SnapshotInputError(`Not a date: ${JSON.stringify(value)}`);
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const calendar = new Date(Date.UTC(year, month - 1, day));
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day) {
    throw new SnapshotInputError(`Not a date: ${JSON.stringify(value)}`);
  }
  return `${match[1]}-${match[2]}-${match[3]}`;
}

const orNull = <T>(value: T | null | undefined): T | null => (value === undefined ? null : value);

function eventRowId(row: SnapshotEventRow): string {
  const id = row.id ?? row.event_id;
  if (!id) throw new SnapshotInputError(`A function row has no id: ${row.title}`);
  return id;
}

function venueRowId(row: SnapshotVenueRow): string {
  const id = row.id ?? row.venue_id;
  if (!id) throw new SnapshotInputError(`A venue row has no id: ${row.name}`);
  return id;
}

/**
 * The snapshot's function order (and the itinerary's): date, then start time with
 * untimed functions last, then `sort_order`, then id so the order never depends on
 * the order rows arrived in.
 */
export function compareSnapshotOrder(
  a: { event_date: IsoDate; start_time: IsoTime | null; sort_order: number; event_id: string },
  b: { event_date: IsoDate; start_time: IsoTime | null; sort_order: number; event_id: string },
): number {
  if (a.event_date !== b.event_date) return a.event_date < b.event_date ? -1 : 1;
  if (a.start_time !== b.start_time) {
    if (a.start_time === null) return 1;
    if (b.start_time === null) return -1;
    return a.start_time < b.start_time ? -1 : 1;
  }
  if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
  if (a.event_id !== b.event_id) return a.event_id < b.event_id ? -1 : 1;
  return 0;
}

// ---------------------------------------------------------------------------
// The builder
// ---------------------------------------------------------------------------

function snapshotVenue(row: SnapshotVenueRow): SnapshotVenue {
  return {
    venue_id: venueRowId(row),
    name: row.name,
    place_name: orNull(row.place_name),
    locality: orNull(row.locality),
    address: orNull(row.address),
    map_url: orNull(row.map_url),
  };
}

function snapshotInviteStyle(row: SnapshotInviteStyleRow | null | undefined): PublicationSnapshot["invite_style"] {
  if (!row) return { ...DEFAULT_INVITE_STYLE };
  return {
    theme: row.theme ?? DEFAULT_INVITE_STYLE.theme,
    typeface: row.typeface ?? DEFAULT_INVITE_STYLE.typeface,
    layout: row.layout ?? DEFAULT_INVITE_STYLE.layout,
    photo_frame: row.photo_frame ?? DEFAULT_INVITE_STYLE.photo_frame,
    photo_asset_id: orNull(row.photo_asset_id),
    heading_hi: row.heading_hi ?? DEFAULT_INVITE_STYLE.heading_hi,
    wording_en: orNull(row.wording_en),
    wording_hi: orNull(row.wording_hi),
    blessing_line: orNull(row.blessing_line),
  };
}

function assertSameWedding(wedding_id: string | undefined, row: { wedding_id?: string }, what: string): void {
  if (wedding_id && row.wedding_id && row.wedding_id !== wedding_id) {
    throw new SnapshotInputError(`${what} belongs to another wedding`);
  }
}

/**
 * The guest-visible snapshot of one wedding's draft (P2, 5.3): what `publications.snapshot`
 * stores. Deleted functions are left out; functions come in date, start time and
 * `sort_order` order. Building the same rows twice gives deep-equal snapshots, whatever
 * order the rows arrive in.
 */
export function buildItinerarySnapshot(input: ItinerarySnapshotInput): PublicationSnapshot {
  const wedding_id = input.wedding.id;
  if (input.invite_style) assertSameWedding(wedding_id, input.invite_style, "The invitation style");

  const venues = new Map<string, SnapshotVenueRow>();
  for (const row of input.venues) {
    assertSameWedding(wedding_id, row, `Venue ${row.name}`);
    venues.set(venueRowId(row), row);
  }

  const ordered = input.events
    .filter((row) => row.deleted_at === null || row.deleted_at === undefined)
    .map((row) => {
      assertSameWedding(wedding_id, row, `Function ${row.title}`);
      const venue_id = orNull(row.venue_id);
      const venueRow = venue_id === null ? null : venues.get(venue_id);
      if (venueRow === undefined) {
        throw new SnapshotInputError(`Function ${row.title} uses venue ${venue_id}, which isn't in the venue rows`);
      }
      const event: SnapshotEvent = {
        event_id: eventRowId(row),
        event_kind: row.event_kind,
        title: row.title,
        title_hi: row.title_hi,
        event_date: toIsoDate(row.event_date),
        start_time: toIsoTime(row.start_time),
        end_time: toIsoTime(row.end_time),
        muhurat_time: toIsoTime(row.muhurat_time),
        dress_code: orNull(row.dress_code),
        description: orNull(row.description),
        venue: venueRow === null ? null : snapshotVenue(venueRow),
      };
      return { event, sort_order: row.sort_order ?? 0 };
    })
    .sort((a, b) => compareSnapshotOrder({ ...a.event, sort_order: a.sort_order }, { ...b.event, sort_order: b.sort_order }));

  return {
    wedding: {
      bride_name: input.wedding.bride_name,
      groom_name: input.wedding.groom_name,
      city: orNull(input.wedding.city),
      wedding_date: toIsoDate(input.wedding.wedding_date),
    },
    invite_style: snapshotInviteStyle(input.invite_style),
    events: ordered.map((entry) => entry.event),
  };
}

// ---------------------------------------------------------------------------
// The diff
// ---------------------------------------------------------------------------

/** The `field` of a change for a function that is new in the next snapshot: from null to its title. */
export const EVENT_ADDED_FIELD = "added";
/** The `field` of a change for a function the next snapshot no longer has: from its title to null. */
export const EVENT_REMOVED_FIELD = "removed";
/** The `field` of a function's venue change: from and to are venue names (5.3's REV-3 example). */
export const EVENT_VENUE_FIELD = "venue";

/** The SnapshotEvent fields compared one by one; the venue is compared by id after them. */
const COMPARED_EVENT_FIELDS = [
  "event_kind",
  "title",
  "title_hi",
  "event_date",
  "start_time",
  "end_time",
  "muhurat_time",
  "dress_code",
  "description",
] as const satisfies readonly (keyof SnapshotEvent)[];

/** The venue fields compared for a venue both snapshots use (entity `venue`). */
const COMPARED_VENUE_FIELDS = ["name", "place_name", "locality", "address", "map_url"] as const satisfies readonly (keyof SnapshotVenue)[];

export type DiffSnapshotsOptions = {
  /**
   * The `entity_id` of `wedding` and `invite_style` changes (the style row is keyed by the
   * wedding). The snapshot itself carries no wedding id, so pass it whenever you have it.
   */
  wedding_id?: string;
};

/** A snapshot value for comparing and for `from`/`to`: a key missing from a stored snapshot reads as null. */
const valueOf = (value: JsonPrimitive | undefined): JsonPrimitive => (value === undefined ? null : value);

function venueMap(snapshot: PublicationSnapshot): Map<string, SnapshotVenue> {
  const map = new Map<string, SnapshotVenue>();
  for (const event of snapshot.events) {
    if (event.venue && !map.has(event.venue.venue_id)) map.set(event.venue.venue_id, event.venue);
  }
  return map;
}

/** A venue's name for a venue change; with the place too when two different venues share a name. */
function venueLabels(from: SnapshotVenue | null, to: SnapshotVenue | null): [JsonPrimitive, JsonPrimitive] {
  if (from && to && from.name === to.name) {
    const label = (venue: SnapshotVenue) => (venue.place_name ? `${venue.name}, ${venue.place_name}` : venue.name);
    return [label(from), label(to)];
  }
  return [from?.name ?? null, to?.name ?? null];
}

/**
 * The `changes` list (5.3): one `{entity, entity_id, field, from, to}` per guest-visible
 * difference between two snapshots, in this order: wedding fields, then functions in the
 * next snapshot's order (a new one as a single `added` item; otherwise each changed field,
 * then `venue` with venue names), then functions that are gone (`removed`, in the previous
 * order), then fields of a venue both snapshots use (entity `venue`, once per venue), then
 * the invitation style.
 *
 * `previous` null is the first publish: there is no earlier revision, so the list is empty
 * (REV-1's `changes` is `[]`). For the itinerary's `unpublished_changes` before any publish,
 * diff against `{ ...draft, events: [] }` to list every function as added.
 *
 * With a `previous` snapshot, empty means nothing guest-visible changed, and the itinerary
 * shows no unpublished changes. With `previous` null the list is empty too, yet there IS
 * something to publish, so decide P7's `unchanged` with `snapshotsEqual(latest, draft)`,
 * never with `diffSnapshots(...).length === 0`.
 *
 * A value missing from a stored snapshot reads as null, so an older or hand-built snapshot
 * never yields a change whose `from` or `to` is undefined.
 */
export function diffSnapshots(
  previous: PublicationSnapshot | null,
  next: PublicationSnapshot,
  options: DiffSnapshotsOptions = {},
): SnapshotChange[] {
  if (previous === null) return [];
  const wedding_id = options.wedding_id ?? "";
  const changes: SnapshotChange[] = [];

  for (const field of SNAPSHOT_WEDDING_FIELDS) {
    const from = valueOf(previous.wedding[field]);
    const to = valueOf(next.wedding[field]);
    if (from !== to) changes.push({ entity: "wedding", entity_id: wedding_id, field, from, to });
  }

  const previousEvents = new Map(previous.events.map((event) => [event.event_id, event]));
  const nextIds = new Set(next.events.map((event) => event.event_id));

  for (const event of next.events) {
    const before = previousEvents.get(event.event_id);
    if (!before) {
      changes.push({ entity: "event", entity_id: event.event_id, field: EVENT_ADDED_FIELD, from: null, to: event.title });
      continue;
    }
    for (const field of COMPARED_EVENT_FIELDS) {
      const from = valueOf(before[field]);
      const to = valueOf(event[field]);
      if (from !== to) changes.push({ entity: "event", entity_id: event.event_id, field, from, to });
    }
    if ((before.venue?.venue_id ?? null) !== (event.venue?.venue_id ?? null)) {
      const [from, to] = venueLabels(before.venue, event.venue);
      changes.push({ entity: "event", entity_id: event.event_id, field: EVENT_VENUE_FIELD, from, to });
    }
  }

  for (const event of previous.events) {
    if (!nextIds.has(event.event_id)) {
      changes.push({ entity: "event", entity_id: event.event_id, field: EVENT_REMOVED_FIELD, from: event.title, to: null });
    }
  }

  const previousVenues = venueMap(previous);
  for (const [venue_id, venue] of venueMap(next)) {
    const before = previousVenues.get(venue_id);
    if (!before) continue;
    for (const field of COMPARED_VENUE_FIELDS) {
      const from = valueOf(before[field]);
      const to = valueOf(venue[field]);
      if (from !== to) changes.push({ entity: "venue", entity_id: venue_id, field, from, to });
    }
  }

  for (const field of SNAPSHOT_INVITE_STYLE_FIELDS) {
    const from = valueOf(previous.invite_style[field]);
    const to = valueOf(next.invite_style[field]);
    if (from !== to) changes.push({ entity: "invite_style", entity_id: wedding_id, field, from, to });
  }

  return changes;
}

/** True when both are null, or neither is and no guest-visible field differs (P7's "nothing to publish"). */
export function snapshotsEqual(a: PublicationSnapshot | null, b: PublicationSnapshot | null): boolean {
  if (a === null || b === null) return a === b;
  return diffSnapshots(a, b).length === 0;
}
