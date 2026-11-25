import "server-only";

import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { CommandFailure, type CommandWarning, type ParsedCommandInput } from "@/contracts/commands";
import type { EventKind, JsonObject, JsonValue, SessionActor, WeddingId } from "@/contracts/domain";
import { EVENT_KIND_DEFAULT_TITLES } from "@/contracts/domain";
import type { ItineraryConflict } from "@/contracts/read-models";
import type {
  ActivityEntryDraft,
  CommandHandler,
  CommandHandlerContext,
  HandlerMap,
} from "@/contracts/services";
import type { Tx } from "@/db/client";
import { hhmm, toIstInstant } from "@/db/ist";
import { activityEntries, events, requirements, vendors, venues, weddings } from "@/db/schema";
import { eventWord, loadDraftConflicts } from "@/server/read-models/itinerary";

/**
 * Lane A's function commands (domain 3.2 and 3.4, A4): `create_event`, `update_event`
 * and `add_requirement`. Each writes the draft only; publishing is Lane D's (D41).
 *
 * The dispatcher has already resolved the actor, applied the role matrix (owners and
 * managers), parsed the input with `commandSchemas`, locked the `weddings` row and
 * re-checked the receipt. These handlers lock the rows they change after that lock,
 * check every referenced id belongs to the wedding (404 `not_found` otherwise), and return
 * the finished activity entry; the dispatcher writes it, bumps `version` (and
 * `draft_version` when `bumps_draft_version`) and stores the receipt.
 */

// ---------------------------------------------------------------------------
// Text helpers (pure; unit-tested in events.test.ts)
// ---------------------------------------------------------------------------

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** 2026-12-14 → "Mon 14 Dec" (a calendar date, no time-zone shift). */
export function formatDayShort(date: string): string {
  const [year, month, day] = date.slice(0, 10).split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return `${WEEKDAYS[weekday]} ${day} ${MONTHS[month - 1]}`;
}

/** "19:30" or "19:30:00" → "7:30 PM". */
export function formatClock12(time: string): string {
  const hours = Number(time.slice(0, 2));
  const minutes = time.slice(3, 5);
  const suffix = hours >= 12 && hours < 24 ? "PM" : "AM";
  const h = hours % 12 === 0 ? 12 : hours % 12;
  return `${h}:${minutes} ${suffix}`;
}

/** `{when}`, `{old}` and `{new}` (3.0): "Mon 14 Dec, 7:30 PM", or "Mon 14 Dec" without a time. */
export function formatWhen(date: string, time: string | null | undefined): string {
  const t = hhmm(time ?? null);
  return t ? `${formatDayShort(date)}, ${formatClock12(t)}` : formatDayShort(date);
}

/** Case, spaces and punctuation folded away (3.2's venue matching; voice.md 1.6). */
export function normaliseName(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The duplicate key of a requirement's text (3.4): case and spaces ignored. */
export function requirementTextKey(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/g, "");
}

export type VenueCandidate = { venue_id: string; name: string; place_name: string | null };

export type VenueMatch<V extends VenueCandidate = VenueCandidate> =
  | { kind: "match"; venue: V }
  | { kind: "ambiguous"; venues: V[] }
  | { kind: "none" };

/**
 * 3.2's `venue_name` matching, in three tiers (the first tier with any match decides):
 * 1. "{name}, {place_name}" or "{name} at {place_name}";
 * 2. the name itself;
 * 3. one distinctive word: a word of a venue's name that no other venue's name has
 *    ("Lotus" for Lotus Hall, never "Hall"), when the text holds such words of exactly
 *    one venue.
 * Exactly one match is used; several ask which one; none creates a new venue.
 */
export function matchVenueName<V extends VenueCandidate>(text: string, candidates: readonly V[]): VenueMatch<V> {
  const wanted = normaliseName(text);
  if (!wanted) return { kind: "none" };
  const decide = (found: V[]): VenueMatch<V> | null => {
    if (found.length === 1) return { kind: "match", venue: found[0] };
    if (found.length > 1) return { kind: "ambiguous", venues: found };
    return null;
  };

  const withPlace = candidates.filter(
    (venue) =>
      venue.place_name !== null &&
      venue.place_name.trim() !== "" &&
      (wanted === normaliseName(`${venue.name}, ${venue.place_name}`) ||
        wanted === normaliseName(`${venue.name} at ${venue.place_name}`)),
  );
  const tier1 = decide(withPlace);
  if (tier1) return tier1;

  const tier2 = decide(candidates.filter((venue) => normaliseName(venue.name) === wanted));
  if (tier2) return tier2;

  const split = (value: string | null) => (value ? normaliseName(value).split(" ").filter((word) => word.length > 0) : []);
  const counts = new Map<string, number>();
  for (const venue of candidates) {
    for (const word of new Set(split(venue.name))) counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  const textWords = new Set(wanted.split(" "));
  // 3.2 and voice.md 2.5: the text holds exactly one saved venue's distinctive word. Other
  // words ("Lotus Hall, Whitefield", "Lotus wala hall") don't stop the match; the preview
  // shows the matched venue before anyone confirms.
  const hits = candidates.filter((venue) =>
    split(venue.name).some((word) => counts.get(word) === 1 && word.length > 1 && textWords.has(word)),
  );
  return decide(hits) ?? { kind: "none" };
}

// ---------------------------------------------------------------------------
// The fields an edit can change
// ---------------------------------------------------------------------------

/** The `events` fields `update_event` writes, in the order `before`/`after` list them. */
export const EVENT_EDIT_FIELDS = [
  "title",
  "title_hi",
  "event_date",
  "start_time",
  "end_time",
  "muhurat_time",
  "venue_id",
  "dress_code",
  "description",
  "lead_name",
  "expected_headcount",
] as const;
export type EventEditField = (typeof EVENT_EDIT_FIELDS)[number];

/** P2: every edit field except the lead and the planning headcount is guest-visible. */
export const NOT_GUEST_VISIBLE: readonly EventEditField[] = ["lead_name", "expected_headcount"];
const TIME_FIELDS: readonly EventEditField[] = ["event_date", "start_time", "end_time", "muhurat_time"];

export type EventValues = {
  title: string;
  title_hi: string;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  muhurat_time: string | null;
  venue_id: string | null;
  dress_code: string | null;
  description: string | null;
  lead_name: string | null;
  expected_headcount: number | null;
};

export type EventChange = { field: EventEditField; from: string | number | null; to: string | number | null };

/** The fields whose value differs, in `EVENT_EDIT_FIELDS` order. Times compare as `HH:MM`. */
export function diffEventValues(current: EventValues, next: EventValues): EventChange[] {
  const changes: EventChange[] = [];
  for (const field of EVENT_EDIT_FIELDS) {
    const isTime = field === "start_time" || field === "end_time" || field === "muhurat_time";
    const from = isTime ? hhmm(current[field] as string | null) : current[field];
    const to = isTime ? hhmm(next[field] as string | null) : next[field];
    if (from !== to) changes.push({ field, from, to });
  }
  return changes;
}

/** P1: whether a change touches a guest-visible field. */
export function changesGuestVisible(changes: readonly EventChange[]): boolean {
  return changes.some((change) => !NOT_GUEST_VISIBLE.includes(change.field));
}

function minutesOf(time: string): number {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

/** 3.2's time rules on the merged values: end after start; muhurat between them when both exist. */
export function checkMergedTimes(values: Pick<EventValues, "start_time" | "end_time" | "muhurat_time">): string | null {
  const start = hhmm(values.start_time);
  const end = hhmm(values.end_time);
  const muhurat = hhmm(values.muhurat_time);
  if (start && end && minutesOf(end) <= minutesOf(start)) return "end_time";
  if (muhurat && start && end && (minutesOf(muhurat) < minutesOf(start) || minutesOf(muhurat) > minutesOf(end))) {
    return "muhurat_time";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Activity entries (3.2 and 3.4 templates, L5: all `members`)
// ---------------------------------------------------------------------------

export type EventLabel = { event_kind: EventKind; title: string; title_hi: string };
export type VenueLabel = { name: string; place_name: string | null };

/** A venue's name for activity text; with the place when the two venues share a name. */
function venueLabels(from: VenueLabel, to: VenueLabel): [string, string] {
  if (from.name === to.name) {
    const label = (venue: VenueLabel) => (venue.place_name ? `${venue.name}, ${venue.place_name}` : venue.name);
    return [label(from), label(to)];
  }
  return [from.name, to.name];
}

/** The `create_event` entry: "{actor} added the {event} on {when} at {venue}." (or without the venue). */
export function createdEventActivity(args: {
  actor_label: string;
  event_id: string;
  event: EventLabel;
  event_date: string;
  start_time: string | null;
  venue: VenueLabel | null;
  after: JsonObject;
}): ActivityEntryDraft {
  const { actor_label, event, venue } = args;
  const word = eventWord(event.event_kind, event.title);
  const when = formatWhen(args.event_date, args.start_time);
  return {
    topic: "event.created",
    entity_type: "event",
    entity_id: args.event_id,
    summary_en: venue
      ? `${actor_label} added the ${word} on ${when} at ${venue.name}.`
      : `${actor_label} added the ${word} on ${when}.`,
    summary_hi: venue
      ? `${actor_label} ने ${event.title_hi} जोड़ा: ${when}, ${venue.name}।`
      : `${actor_label} ने ${event.title_hi} जोड़ा: ${when}।`,
    before: null,
    after: args.after,
    visibility: "members",
  };
}

const CHANGE_LABELS: Record<Exclude<EventEditField, "event_date" | "start_time" | "end_time" | "muhurat_time">, { en: string; hi: string }> = {
  title: { en: "title", hi: "शीर्षक" },
  title_hi: { en: "Hindi title", hi: "हिंदी शीर्षक" },
  venue_id: { en: "venue", hi: "स्थान" },
  dress_code: { en: "dress code", hi: "ड्रेस कोड" },
  description: { en: "description", hi: "विवरण" },
  lead_name: { en: "lead", hi: "ज़िम्मेदार" },
  expected_headcount: { en: "expected headcount", hi: "अनुमानित मेहमान" },
};

/** `{changes}` for the generic line: "dress code Formal evening to Black tie" / "ड्रेस कोड Formal evening से Black tie". */
export function describeEventChanges(
  changes: readonly EventChange[],
  language: "en" | "hi",
  venueNames: { from: string | null; to: string | null },
): string {
  const parts: string[] = [];
  for (const change of changes) {
    if (TIME_FIELDS.includes(change.field)) continue;
    const field = change.field as keyof typeof CHANGE_LABELS;
    const label = CHANGE_LABELS[field][language];
    if (field === "description") {
      parts.push(language === "en" ? "description updated" : "विवरण बदला");
      continue;
    }
    const from = field === "venue_id" ? venueNames.from : change.from;
    const to = field === "venue_id" ? venueNames.to : change.to;
    if (to === null) parts.push(language === "en" ? `${label} removed` : `${label} हटाया`);
    else if (from === null) parts.push(language === "en" ? `${label} set to ${to}` : `${label} ${to}`);
    else parts.push(language === "en" ? `${label} ${from} to ${to}` : `${label} ${from} से ${to}`);
  }
  return parts.join(", ");
}

/** The time a time line shows: the start (with the date) when it or the date moved, else the end, else the muhurat. */
function timeShown(values: EventValues, changes: readonly EventChange[]): string | null {
  const moved = new Set(changes.map((change) => change.field));
  if (moved.has("event_date") || moved.has("start_time")) return values.start_time;
  if (moved.has("end_time")) return values.end_time;
  return values.muhurat_time;
}

/**
 * The `update_event` entry (3.2). A venue change (between two venues) is the venue line;
 * otherwise a date or time change is the time line; otherwise the generic line. `before`
 * and `after` carry every changed field; a venue change also carries the names under
 * `venue` ("before venue Banyan Hall", AT-8.2).
 */
export function updatedEventActivity(args: {
  actor_label: string;
  event_id: string;
  event: EventLabel;
  current: EventValues;
  next: EventValues;
  changes: readonly EventChange[];
  venues: { from: VenueLabel | null; to: VenueLabel | null };
}): ActivityEntryDraft {
  const { actor_label, event, current, next, changes } = args;
  const word = eventWord(event.event_kind, event.title);
  const before: JsonObject = {};
  const after: JsonObject = {};
  for (const change of changes) {
    before[change.field] = change.from as JsonValue;
    after[change.field] = change.to as JsonValue;
    if (change.field === "venue_id") {
      before.venue = args.venues.from?.name ?? null;
      after.venue = args.venues.to?.name ?? null;
    }
  }

  const base = { topic: "event.updated" as const, entity_type: "event" as const, entity_id: args.event_id, before, after, visibility: "members" as const };
  const venueChange = changes.find((change) => change.field === "venue_id");
  if (venueChange && args.venues.from && args.venues.to) {
    const [from, to] = venueLabels(args.venues.from, args.venues.to);
    return {
      ...base,
      summary_en: `${actor_label} moved the ${word} from ${from} to ${to}.`,
      summary_hi: `${actor_label} ने ${event.title_hi} का स्थान ${from} से बदलकर ${to} किया।`,
    };
  }
  if (changes.some((change) => TIME_FIELDS.includes(change.field))) {
    const old = formatWhen(current.event_date, timeShown(current, changes));
    const neu = formatWhen(next.event_date, timeShown(next, changes));
    return {
      ...base,
      summary_en: `${actor_label} changed the ${word} time from ${old} to ${neu}.`,
      summary_hi: `${actor_label} ने ${event.title_hi} का समय ${old} से बदलकर ${neu} किया।`,
    };
  }
  const venueNames = { from: args.venues.from?.name ?? null, to: args.venues.to?.name ?? null };
  return {
    ...base,
    summary_en: `${actor_label} changed the ${word}: ${describeEventChanges(changes, "en", venueNames)}.`,
    summary_hi: `${actor_label} ने ${event.title_hi} में बदलाव किया: ${describeEventChanges(changes, "hi", venueNames)}।`,
  };
}

/** `{item}` (3.4): the text, then " for {quantity}" when a quantity is set. */
export function requirementItem(text: string, quantity: number | null | undefined): string {
  return quantity === null || quantity === undefined ? text : `${text} for ${quantity}`;
}

export function requirementActivity(args: {
  actor_label: string;
  requirement_id: string;
  event: EventLabel;
  item: string;
  after: JsonObject;
}): ActivityEntryDraft {
  const word = eventWord(args.event.event_kind, args.event.title);
  return {
    topic: "requirement.added",
    entity_type: "requirement",
    entity_id: args.requirement_id,
    summary_en: `${args.actor_label} added "${args.item}" to the ${word}.`,
    summary_hi: `${args.actor_label} ने ${args.event.title_hi} में ज़रूरत जोड़ी: ${args.item}।`,
    before: null,
    after: args.after,
    visibility: "members",
  };
}

/** The command warnings (3.2) for one function: the draft conflicts that involve it. */
export function warningsFor(conflicts: readonly ItineraryConflict[], event_id: string): CommandWarning[] {
  return conflicts
    .filter((conflict) => conflict.event_ids.includes(event_id))
    .map((conflict) => ({ kind: conflict.kind, message: conflict.text, entity_ids: [...conflict.event_ids] }));
}

// ---------------------------------------------------------------------------
// Database steps
// ---------------------------------------------------------------------------

function memberActor(actor: CommandHandlerContext["actor"]): SessionActor {
  if (actor.kind === "guest" || actor.kind === "system" || !actor.member_id) {
    throw new CommandFailure({ code: "forbidden", message: "Not allowed." });
  }
  return actor;
}

function weddingOf(context: { wedding_id: WeddingId | null }): WeddingId {
  if (!context.wedding_id) throw new CommandFailure({ code: "validation_failed", message: "required", field: "wedding_id" });
  return context.wedding_id;
}

type VenueRow = typeof venues.$inferSelect;

async function venueById(tx: Tx, wedding_id: WeddingId, venue_id: string): Promise<VenueRow> {
  const rows = await tx
    .select()
    .from(venues)
    .where(and(eq(venues.id, venue_id), eq(venues.wedding_id, wedding_id)))
    .limit(1);
  if (!rows[0]) throw new CommandFailure({ code: "not_found", message: "That venue isn't part of this wedding.", field: "venue_id" });
  return rows[0];
}

/**
 * Resolves `venue_name` (3.2): one match is used; several fail with the candidates in
 * `current` (the preview asks which one); none inserts a new venue with only a name.
 */
async function resolveVenueName(
  tx: Tx,
  wedding_id: WeddingId,
  venue_name: string,
  now: Date,
): Promise<{ venue: VenueRow; created: boolean }> {
  const rows = await tx.select().from(venues).where(eq(venues.wedding_id, wedding_id));
  const match = matchVenueName(
    venue_name,
    rows.map((row) => ({ ...row, venue_id: row.id })),
  );
  if (match.kind === "match") return { venue: match.venue, created: false };
  if (match.kind === "ambiguous") {
    throw new CommandFailure({
      code: "validation_failed",
      message: "unknown_value",
      field: "venue_name",
      current: {
        candidates: match.venues.map((venue) => ({ venue_id: venue.id, name: venue.name, place_name: venue.place_name })),
      },
    });
  }
  const [created] = await tx
    .insert(venues)
    .values({ wedding_id, name: venue_name.trim(), created_at: now, updated_at: now })
    .returning();
  return { venue: created, created: true };
}

async function readDraftVersion(tx: Tx, wedding_id: WeddingId): Promise<number> {
  const rows = await tx.select({ draft_version: weddings.draft_version }).from(weddings).where(eq(weddings.id, wedding_id)).limit(1);
  return Number(rows[0]?.draft_version ?? 0);
}

/** Conflicts for warnings; a failure here never fails the command. */
async function safeWarnings(tx: Tx, wedding_id: WeddingId, event_id: string): Promise<CommandWarning[]> {
  try {
    return warningsFor(await loadDraftConflicts(tx, wedding_id), event_id);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// create_event
// ---------------------------------------------------------------------------

export const createEventHandler: CommandHandler<"create_event", Tx> = async (context) => {
  const actor = memberActor(context.actor);
  const wedding_id = weddingOf(context);
  const { tx } = context;
  const input = context.input as ParsedCommandInput<"create_event">;
  const now = new Date(context.now);

  const defaults = EVENT_KIND_DEFAULT_TITLES[input.event_kind];
  const title = input.title ?? defaults?.en;
  if (!title) throw new CommandFailure({ code: "validation_failed", message: "required", field: "title" });
  const title_hi = input.title_hi ?? defaults?.hi ?? title;

  let venue: VenueRow | null = null;
  let venue_created = false;
  if (input.venue_id) {
    venue = await venueById(tx, wedding_id, input.venue_id);
  } else if (input.venue_name) {
    const resolved = await resolveVenueName(tx, wedding_id, input.venue_name, now);
    venue = resolved.venue;
    venue_created = resolved.created;
  }

  const [{ count }] = await tx
    .select({ count: sql<number>`count(*)::bigint` })
    .from(events)
    .where(eq(events.wedding_id, wedding_id));

  const values = {
    wedding_id,
    event_kind: input.event_kind,
    title,
    title_hi,
    event_date: input.event_date,
    start_time: input.start_time ?? null,
    end_time: input.end_time ?? null,
    muhurat_time: input.muhurat_time ?? null,
    venue_id: venue?.id ?? null,
    dress_code: input.dress_code ?? null,
    description: input.description ?? null,
    lead_name: input.lead_name ?? null,
    expected_headcount: input.expected_headcount ?? null,
    sort_order: Number(count),
    version: 1,
    created_at: now,
    updated_at: now,
  };
  const [inserted] = await tx.insert(events).values(values).returning({ id: events.id });
  const event_id = inserted.id;

  const after: JsonObject = { event_kind: input.event_kind, title, title_hi, event_date: input.event_date };
  for (const field of ["start_time", "end_time", "muhurat_time", "dress_code", "description", "lead_name", "expected_headcount"] as const) {
    const value = values[field];
    if (value !== null) after[field] = value;
  }
  if (venue) {
    after.venue_id = venue.id;
    after.venue = venue.name;
  }

  const draft_version = (await readDraftVersion(tx, wedding_id)) + 1;
  return {
    outcome: "applied",
    result: { event_id, version: 1, venue_id: venue?.id ?? null, venue_created, draft_version },
    activity: createdEventActivity({
      actor_label: actor.display_name,
      event_id,
      event: { event_kind: input.event_kind, title, title_hi },
      event_date: input.event_date,
      start_time: values.start_time,
      venue: venue ? { name: venue.name, place_name: venue.place_name } : null,
      after,
    }),
    warnings: await safeWarnings(tx, wedding_id, event_id),
    bumps_draft_version: true,
  };
};

// ---------------------------------------------------------------------------
// update_event
// ---------------------------------------------------------------------------

/**
 * "Who changed it last" for `stale_version`: the newest entry that edited that function.
 * Only `event.created`/`event.updated` count: bulk RSVP entries (`rsvp.updated`) also carry
 * the event id, and an RSVP never moves `events.version`.
 */
async function lastChangeOf(tx: Tx, wedding_id: WeddingId, event_id: string) {
  const rows = await tx
    .select({ actor_label: activityEntries.actor_label, occurred_at: activityEntries.occurred_at })
    .from(activityEntries)
    .where(
      and(
        eq(activityEntries.wedding_id, wedding_id),
        eq(activityEntries.entity_id, event_id),
        inArray(activityEntries.topic, ["event.created", "event.updated"]),
      ),
    )
    .orderBy(desc(activityEntries.seq))
    .limit(1);
  return rows[0] ?? null;
}

type EventRow = typeof events.$inferSelect;

function valuesOf(row: EventRow): EventValues {
  return {
    title: row.title,
    title_hi: row.title_hi,
    event_date: row.event_date,
    start_time: hhmm(row.start_time),
    end_time: hhmm(row.end_time),
    muhurat_time: hhmm(row.muhurat_time),
    venue_id: row.venue_id,
    dress_code: row.dress_code,
    description: row.description,
    lead_name: row.lead_name,
    expected_headcount: row.expected_headcount,
  };
}

export const updateEventHandler: CommandHandler<"update_event", Tx> = async (context) => {
  const actor = memberActor(context.actor);
  const wedding_id = weddingOf(context);
  const { tx } = context;
  const input = context.input as ParsedCommandInput<"update_event">;
  const now = new Date(context.now);

  // Lock the function (after the dispatcher's wedding lock).
  const locked = await tx
    .select()
    .from(events)
    .where(and(eq(events.id, input.event_id), eq(events.wedding_id, wedding_id), isNull(events.deleted_at)))
    .for("update");
  const row = locked[0];
  if (!row) throw new CommandFailure({ code: "not_found", message: "That function isn't part of this wedding.", field: "event_id" });

  const current = valuesOf(row);
  const label: EventLabel = { event_kind: row.event_kind, title: row.title, title_hi: row.title_hi };

  // I4: the version the editor saw.
  if (input.expected_version !== row.version) {
    const last = await lastChangeOf(tx, wedding_id, row.id);
    const currentVenue = row.venue_id ? await venueById(tx, wedding_id, row.venue_id).catch(() => null) : null;
    const who = last?.actor_label ?? null;
    throw new CommandFailure({
      code: "stale_version",
      message: who
        ? `${who} changed the ${eventWord(row.event_kind, row.title)} while you were editing.`
        : `The ${eventWord(row.event_kind, row.title)} changed while you were editing.`,
      field: "expected_version",
      current: {
        event_id: row.id,
        seed_key: row.seed_key,
        event_kind: row.event_kind,
        version: row.version,
        ...current,
        venue_name: currentVenue?.name ?? null,
        changed_by: who,
        changed_at: last ? toIstInstant(last.occurred_at) : null,
      },
    });
  }

  // The new values: given fields only; `null` clears an optional field.
  const next: EventValues = { ...current };
  if (input.title !== undefined) next.title = input.title;
  if (input.title_hi !== undefined) next.title_hi = input.title_hi;
  if (input.event_date !== undefined) next.event_date = input.event_date;
  if (input.start_time !== undefined) next.start_time = input.start_time;
  if (input.end_time !== undefined) next.end_time = input.end_time;
  if (input.muhurat_time !== undefined) next.muhurat_time = input.muhurat_time;
  if (input.dress_code !== undefined) next.dress_code = input.dress_code;
  if (input.description !== undefined) next.description = input.description;
  if (input.lead_name !== undefined) next.lead_name = input.lead_name;
  if (input.expected_headcount !== undefined) next.expected_headcount = input.expected_headcount;

  const badTime = checkMergedTimes(next);
  if (badTime) throw new CommandFailure({ code: "validation_failed", message: "time_order", field: badTime });

  // The venue: an id wins over a name (3.2).
  let newVenue: VenueRow | null = null;
  let venue_created = false;
  if (input.venue_id !== undefined) {
    if (input.venue_id === null) next.venue_id = null;
    else {
      newVenue = await venueById(tx, wedding_id, input.venue_id);
      next.venue_id = newVenue.id;
    }
  } else if (input.venue_name !== undefined) {
    const resolved = await resolveVenueName(tx, wedding_id, input.venue_name, now);
    newVenue = resolved.venue;
    venue_created = resolved.created;
    next.venue_id = newVenue.id;
  }

  const changes = diffEventValues(current, next);
  const draft_version_now = await readDraftVersion(tx, wedding_id);
  if (changes.length === 0) {
    return {
      outcome: "unchanged",
      result: { event_id: row.id, version: row.version, draft_version: draft_version_now },
      activity: null,
    };
  }

  const patch: Partial<typeof events.$inferInsert> = { version: row.version + 1, updated_at: now };
  for (const change of changes) {
    (patch as Record<string, unknown>)[change.field] = next[change.field];
  }
  await tx
    .update(events)
    .set(patch)
    .where(and(eq(events.id, row.id), eq(events.wedding_id, wedding_id)));

  let oldVenue: VenueLabel | null = null;
  let toVenue: VenueLabel | null = null;
  if (changes.some((change) => change.field === "venue_id")) {
    if (current.venue_id) {
      const previous = await venueById(tx, wedding_id, current.venue_id).catch(() => null);
      oldVenue = previous ? { name: previous.name, place_name: previous.place_name } : null;
    }
    toVenue = newVenue ? { name: newVenue.name, place_name: newVenue.place_name } : null;
  }

  const bumps = changesGuestVisible(changes);
  return {
    outcome: "applied",
    result: {
      event_id: row.id,
      version: row.version + 1,
      draft_version: draft_version_now + (bumps ? 1 : 0),
      ...(venue_created ? { venue_created: true } : {}),
    } as { event_id: string; version: number; draft_version: number },
    activity: updatedEventActivity({
      actor_label: actor.display_name,
      event_id: row.id,
      event: label,
      current,
      next,
      changes,
      venues: { from: oldVenue, to: toVenue },
    }),
    warnings: await safeWarnings(tx, wedding_id, row.id),
    bumps_draft_version: bumps,
  };
};

// ---------------------------------------------------------------------------
// add_requirement
// ---------------------------------------------------------------------------

export const addRequirementHandler: CommandHandler<"add_requirement", Tx> = async (context) => {
  const actor = memberActor(context.actor);
  const wedding_id = weddingOf(context);
  const { tx } = context;
  const input = context.input as ParsedCommandInput<"add_requirement">;
  const now = new Date(context.now);

  const eventRows = await tx
    .select({ id: events.id, event_kind: events.event_kind, title: events.title, title_hi: events.title_hi })
    .from(events)
    .where(and(eq(events.id, input.event_id), eq(events.wedding_id, wedding_id), isNull(events.deleted_at)))
    .limit(1);
  const event = eventRows[0];
  if (!event) throw new CommandFailure({ code: "not_found", message: "That function isn't part of this wedding.", field: "event_id" });

  if (input.vendor_id) {
    const vendorRows = await tx
      .select({ id: vendors.id })
      .from(vendors)
      .where(and(eq(vendors.id, input.vendor_id), eq(vendors.wedding_id, wedding_id), isNull(vendors.deleted_at)))
      .limit(1);
    if (!vendorRows[0]) throw new CommandFailure({ code: "not_found", message: "That vendor isn't part of this wedding.", field: "vendor_id" });
  }

  const text = input.text.trim();
  const quantity = input.quantity ?? null;
  const existing = await tx
    .select({
      requirement_id: requirements.id,
      seed_key: requirements.seed_key,
      text: requirements.text,
      quantity: requirements.quantity,
      requirement_category: requirements.requirement_category,
      vendor_id: requirements.vendor_id,
    })
    .from(requirements)
    .where(and(eq(requirements.wedding_id, wedding_id), eq(requirements.event_id, event.id), isNull(requirements.deleted_at)));
  const key = requirementTextKey(text);
  const duplicate = existing.find((row) => requirementTextKey(row.text) === key && (row.quantity ?? null) === quantity);
  if (duplicate) {
    throw new CommandFailure({
      code: "duplicate_requirement",
      message: `The ${eventWord(event.event_kind, event.title)} already has "${requirementItem(duplicate.text, duplicate.quantity)}".`,
      field: "text",
      current: { ...duplicate, event_id: event.id, label: requirementItem(duplicate.text, duplicate.quantity) },
    });
  }

  const requirement_category = input.requirement_category ?? "other";
  const [inserted] = await tx
    .insert(requirements)
    .values({
      wedding_id,
      event_id: event.id,
      requirement_category,
      text,
      quantity,
      vendor_id: input.vendor_id ?? null,
      created_by_member_id: actor.member_id,
      created_at: now,
      updated_at: now,
    })
    .returning({ id: requirements.id });

  const item = requirementItem(text, quantity);
  const after: JsonObject = { event_id: event.id, text, requirement_category };
  if (quantity !== null) after.quantity = quantity;
  if (input.vendor_id) after.vendor_id = input.vendor_id;

  return {
    outcome: "applied",
    result: { requirement_id: inserted.id, event_id: event.id, label: item },
    activity: requirementActivity({
      actor_label: actor.display_name,
      requirement_id: inserted.id,
      event: { event_kind: event.event_kind, title: event.title, title_hi: event.title_hi },
      item,
      after,
    }),
    bumps_draft_version: false,
  };
};

/** Lane A's A4 handlers, for the registry in `src/server/commands/registry.ts`. */
export const eventHandlers: HandlerMap = {
  create_event: createEventHandler,
  update_event: updateEventHandler,
  add_requirement: addRequirementHandler,
};
