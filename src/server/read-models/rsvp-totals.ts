import "server-only";

import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";

import { CommandFailure } from "@/contracts/commands";
import type { EventId, EventKind, IsoInstant, RsvpStatus, SessionActor, WeddingId } from "@/contracts/domain";
import type { ReadModelParams, RsvpCounts, RsvpTotals, RsvpTotalsRow } from "@/contracts/read-models";
import type { DbOrTx } from "@/db/client";
import { isUuidShaped } from "@/db/ids";
import { toIstInstant, istWallClock } from "@/db/ist";
import { events, guests, invitations, weddings } from "@/db/schema";

/**
 * `rsvp_totals` (domain 4.4, rules R4 and R5): per active function, ordered by start, the
 * counts of active invitations (not revoked, guest not deleted) by status, the confirmed
 * headcount (1 + plus_ones per attending row), the same five counts split named / synthetic,
 * and the planning figure `expected_headcount`, which is never mixed into the counts (E7).
 *
 * Every count is a count of stored rows, aggregated in SQL and cast to bigint (domain 0.1).
 * The helpers below are shared with `rsvp_guest_list` and are safe for overview and the
 * catering estimate to reuse.
 */

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** Read models never return a count that isn't a safe integer (domain 0.1). */
export function safeCount(name: string, value: unknown): number {
  const number = typeof value === "string" ? Number(value) : typeof value === "bigint" ? Number(value) : value;
  if (typeof number !== "number" || !Number.isSafeInteger(number) || number < 0) {
    throw new Error(`rsvp read model: ${name} is not a safe non-negative integer`);
  }
  return number;
}

export function emptyRsvpCounts(): RsvpCounts {
  return { invited: 0, attending: 0, declined: 0, pending: 0, confirmed_headcount: 0 };
}

/** One SQL group: active invitations of one function, one status, named or synthetic. */
export type RsvpCountGroup = {
  event_id: EventId;
  is_synthetic: boolean;
  rsvp_status: RsvpStatus;
  /** Invitation rows in the group. */
  invitations: number | string;
  /** Sum of 1 + plus_ones over the group's rows (R4 counts it for attending rows only). */
  headcount: number | string;
};

export type RsvpTally = { total: RsvpCounts; named: RsvpCounts; synthetic: RsvpCounts };

function addGroup(counts: RsvpCounts, status: RsvpStatus, rows: number, headcount: number): void {
  counts.invited += rows;
  counts[status] += rows;
  if (status === "attending") counts.confirmed_headcount += headcount;
}

/** Folds the SQL groups into per-function counts (R4, R5). Functions with no rows are absent. */
export function tallyRsvpCounts(groups: readonly RsvpCountGroup[]): Map<EventId, RsvpTally> {
  const tallies = new Map<EventId, RsvpTally>();
  for (const group of groups) {
    let tally = tallies.get(group.event_id);
    if (!tally) {
      tally = { total: emptyRsvpCounts(), named: emptyRsvpCounts(), synthetic: emptyRsvpCounts() };
      tallies.set(group.event_id, tally);
    }
    const rows = safeCount("invited", group.invitations);
    const headcount = safeCount("confirmed_headcount", group.headcount);
    addGroup(tally.total, group.rsvp_status, rows, headcount);
    addGroup(group.is_synthetic ? tally.synthetic : tally.named, group.rsvp_status, rows, headcount);
  }
  return tallies;
}

/** The IST instant of a function's start, or null without a start time. */
export function eventStartsAt(event_date: string, start_time: string | null): IsoInstant | null {
  return start_time ? toIstInstant(istWallClock(event_date, start_time)) : null;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export type ActiveEventRow = {
  event_id: EventId;
  seed_key: string | null;
  event_kind: EventKind;
  title: string;
  title_hi: string;
  event_date: string;
  start_time: string | null;
  expected_headcount: number | null;
};

/**
 * The wedding's active functions (not deleted), ordered by date, start and `sort_order`.
 * With `event_id`, only that function; an id that isn't an active function of this wedding
 * is `not_found`, the same answer as an unknown id (V5).
 */
export async function loadActiveEvents(db: DbOrTx, wedding_id: WeddingId, event_id?: EventId): Promise<ActiveEventRow[]> {
  if (event_id !== undefined && !isUuidShaped(event_id)) {
    throw new CommandFailure({ code: "not_found", message: "Function not found." });
  }
  const rows = await db
    .select({
      event_id: events.id,
      seed_key: events.seed_key,
      event_kind: events.event_kind,
      title: events.title,
      title_hi: events.title_hi,
      event_date: events.event_date,
      start_time: events.start_time,
      expected_headcount: events.expected_headcount,
    })
    .from(events)
    .where(
      and(
        eq(events.wedding_id, wedding_id),
        isNull(events.deleted_at),
        event_id === undefined ? undefined : eq(events.id, event_id),
      ),
    )
    .orderBy(asc(events.event_date), sql`${events.start_time} asc nulls last`, asc(events.sort_order), asc(events.id));
  if (event_id !== undefined && rows.length === 0) {
    throw new CommandFailure({ code: "not_found", message: "Function not found." });
  }
  return rows;
}

/**
 * Counts of active invitations for the given functions, grouped by function, status and
 * `guests.is_synthetic`. Every join also matches `wedding_id`, so no row of another wedding
 * can ever be counted (domain 5.0).
 */
export async function loadRsvpCountGroups(db: DbOrTx, wedding_id: WeddingId, event_ids: readonly EventId[]): Promise<RsvpCountGroup[]> {
  if (event_ids.length === 0) return [];
  return db
    .select({
      event_id: invitations.event_id,
      is_synthetic: guests.is_synthetic,
      rsvp_status: invitations.rsvp_status,
      invitations: sql<number>`count(*)::bigint`,
      headcount: sql<number>`coalesce(sum(1 + ${invitations.plus_ones}), 0)::bigint`,
    })
    .from(invitations)
    .innerJoin(guests, and(eq(guests.id, invitations.guest_id), eq(guests.wedding_id, invitations.wedding_id)))
    .where(
      and(
        eq(invitations.wedding_id, wedding_id),
        inArray(invitations.event_id, [...event_ids]),
        isNull(invitations.revoked_at),
        isNull(guests.deleted_at),
      ),
    )
    .groupBy(invitations.event_id, guests.is_synthetic, invitations.rsvp_status);
}

/** `weddings.version`, the poll cursor every member read model returns (5.6). */
export async function loadWeddingVersion(db: DbOrTx, wedding_id: WeddingId): Promise<number> {
  const [row] = await db.select({ version: weddings.version }).from(weddings).where(eq(weddings.id, wedding_id)).limit(1);
  if (!row) throw new CommandFailure({ code: "not_found", message: "Wedding not found." });
  return safeCount("version", row.version);
}

/** One `RsvpTotalsRow` from a function and its tally. */
export function rsvpTotalsRow(event: ActiveEventRow, tally: RsvpTally | undefined): RsvpTotalsRow {
  const total = tally?.total ?? emptyRsvpCounts();
  return {
    event_id: event.event_id,
    seed_key: event.seed_key,
    event_kind: event.event_kind,
    title: event.title,
    title_hi: event.title_hi,
    starts_at: eventStartsAt(event.event_date, event.start_time),
    invited: total.invited,
    attending: total.attending,
    declined: total.declined,
    pending: total.pending,
    confirmed_headcount: total.confirmed_headcount,
    named: { ...(tally?.named ?? emptyRsvpCounts()) },
    synthetic: { ...(tally?.synthetic ?? emptyRsvpCounts()) },
    expected_headcount: event.expected_headcount === null ? null : safeCount("expected_headcount", event.expected_headcount),
  };
}

/** The per-function rows alone, for `overview` and `catering_estimate` (confirmed headcount, E2). */
export async function loadRsvpTotalsRows(db: DbOrTx, wedding_id: WeddingId, event_id?: EventId): Promise<RsvpTotalsRow[]> {
  const activeEvents = await loadActiveEvents(db, wedding_id, event_id);
  const tallies = tallyRsvpCounts(await loadRsvpCountGroups(db, wedding_id, activeEvents.map((event) => event.event_id)));
  return activeEvents.map((event) => rsvpTotalsRow(event, tallies.get(event.event_id)));
}

/**
 * `rsvp_totals` for any member (6.1). Nothing in it is role-filtered: counts carry no money
 * and no contacts, so `hidden` is always empty. The caller (the guard) has checked access.
 */
export async function buildRsvpTotals(
  db: DbOrTx,
  _actor: SessionActor,
  wedding_id: WeddingId,
  params: ReadModelParams<"rsvp_totals"> = {},
): Promise<RsvpTotals> {
  const [version, functions] = await Promise.all([
    loadWeddingVersion(db, wedding_id),
    loadRsvpTotalsRows(db, wedding_id, params.event_id),
  ]);
  return { version, hidden: [], functions };
}
