import "server-only";

import { and, desc, eq, gte, isNull, lt, sql, type SQL } from "drizzle-orm";

import { CommandFailure } from "@/contracts/commands";
import type { JsonObject, JsonValue, MemberRole, SessionActor, WeddingId } from "@/contracts/domain";
import type { ActivityFeed, ActivityFeedEntry, ActivityFeedParams } from "@/contracts/read-models";
import type { DbOrTx } from "@/db/client";
import { isUuidShaped } from "@/db/ids";
import { istDate, istToday, istWallClock, toIstInstant } from "@/db/ist";
import { activityEntries, members, publications, weddings } from "@/db/schema";

/**
 * `activity_feed` (domain 4.7, L5, L5a). Owners see every entry; managers only `members`
 * entries, and for them `before`/`after` also lose any money, budget, contact or shagun
 * field (L5a item 4, a second check behind the write-time rules). Newest first by `seq`,
 * paged with `before_seq`; filters `day` (an IST date or `today`), `actor_member_id`,
 * `topic_prefix` and `entity_id`.
 *
 * `awaiting_publish` marks a guest-visible draft edit made after the latest publish
 * ("Draft. Guests still see Banyan Hall."): a new function, a guest-visible function or
 * wedding field, or an invitation-style change.
 */

export const DEFAULT_FEED_LIMIT = 50;
export const MAX_FEED_LIMIT = 200;

// ---------------------------------------------------------------------------
// Pure parts (unit-tested in activity-feed.test.ts)
// ---------------------------------------------------------------------------

/** P2's guest-visible fields as activity `before`/`after` keys. */
const GUEST_VISIBLE_EVENT_KEYS = new Set([
  "event_kind",
  "title",
  "title_hi",
  "event_date",
  "start_time",
  "end_time",
  "muhurat_time",
  "venue_id",
  "venue",
  "dress_code",
  "description",
]);
const GUEST_VISIBLE_WEDDING_KEYS = new Set(["bride_name", "groom_name", "city", "wedding_date"]);

function keysOf(value: JsonValue | null | undefined): string[] {
  return value !== null && value !== undefined && typeof value === "object" && !Array.isArray(value) ? Object.keys(value) : [];
}

/** Whether an entry is a guest-visible draft edit (P1, P2): the kind `awaiting_publish` can mark. */
export function isGuestVisibleDraftEdit(entry: { topic: string; before: JsonValue | null; after: JsonValue | null }): boolean {
  const keys = new Set([...keysOf(entry.before), ...keysOf(entry.after)]);
  switch (entry.topic) {
    case "event.created":
    case "invite_style.updated":
      return true;
    case "event.updated":
      return [...keys].some((key) => GUEST_VISIBLE_EVENT_KEYS.has(key));
    case "wedding.updated":
      return [...keys].some((key) => GUEST_VISIBLE_WEDDING_KEYS.has(key));
    default:
      return false;
  }
}

/** Keys a manager's feed never shows (L5a item 4): money, budget, contacts, shagun. */
export function isHiddenFromManagers(key: string): boolean {
  const k = key.toLowerCase();
  return (
    k.endsWith("_inr") ||
    k === "budget" ||
    k.startsWith("budget_") ||
    k === "phone" ||
    k === "email" ||
    k.endsWith("_phone") ||
    k.endsWith("_email") ||
    k === "guest_contacts" ||
    k === "contacts" ||
    k.startsWith("shagun") ||
    k === "giver_name" ||
    k === "unit_price" ||
    k === "amount"
  );
}

/** A copy of `value` without the keys managers may not read, at any depth. */
export function stripForManager(value: JsonValue | null): JsonValue | null {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => stripForManager(item) as JsonValue);
  const out: JsonObject = {};
  for (const [key, inner] of Object.entries(value)) {
    if (isHiddenFromManagers(key)) continue;
    out[key] = stripForManager(inner as JsonValue) as JsonValue;
  }
  return out;
}

/** The limit, clamped to 1–200 (default 50). */
export function feedLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return DEFAULT_FEED_LIMIT;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_FEED_LIMIT);
}

/** The next IST calendar date. */
export function nextIsoDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/** LIKE pattern for a prefix, with `%`, `_` and `\` escaped. */
export function likePrefix(prefix: string): string {
  return `${prefix.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

/** The publish boundary `awaiting_publish` compares against: a seq when known, else the instant. */
export type PublishBoundary = { seq: number | null; published_at: Date } | null;

export function awaitingPublish(
  entry: { seq: number; occurred_at: Date; topic: string; before: JsonValue | null; after: JsonValue | null },
  boundary: PublishBoundary,
): boolean {
  if (!isGuestVisibleDraftEdit(entry)) return false;
  if (boundary === null) return true;
  if (boundary.seq !== null) return entry.seq > boundary.seq;
  return entry.occurred_at.getTime() > boundary.published_at.getTime();
}

// ---------------------------------------------------------------------------
// The read model
// ---------------------------------------------------------------------------

function safeInteger(name: string, value: unknown): number {
  const number = typeof value === "string" ? Number(value) : value;
  if (typeof number !== "number" || !Number.isSafeInteger(number)) {
    throw new Error(`activity_feed: ${name} is not a safe integer`);
  }
  return number;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

async function readerRole(db: DbOrTx, actor: SessionActor, wedding_id: WeddingId): Promise<MemberRole> {
  const rows = await db
    .select({ role: members.role })
    .from(members)
    .where(and(eq(members.wedding_id, wedding_id), eq(members.user_id, actor.user_id), isNull(members.removed_at)))
    .limit(1);
  const role = rows[0]?.role;
  if (!role) throw new CommandFailure({ code: "not_found", message: "Wedding not found." });
  return role;
}

/**
 * The latest publish as a boundary. When the latest `itinerary.published` entry was
 * written with that publication (same instant, give or take a few seconds), its `seq` is
 * the exact boundary: an edit that waited on the wedding lock behind the publish still
 * counts as after it. Otherwise (a seeded publication without an entry) the instant is.
 */
async function publishBoundary(db: DbOrTx, wedding_id: WeddingId, published_revision: number | null): Promise<PublishBoundary> {
  if (published_revision === null) return null;
  const [publicationRows, entryRows] = await Promise.all([
    db
      .select({ published_at: publications.published_at })
      .from(publications)
      .where(and(eq(publications.wedding_id, wedding_id), eq(publications.revision, published_revision)))
      .limit(1),
    db
      .select({ seq: activityEntries.seq, occurred_at: activityEntries.occurred_at })
      .from(activityEntries)
      .where(and(eq(activityEntries.wedding_id, wedding_id), eq(activityEntries.topic, "itinerary.published")))
      .orderBy(desc(activityEntries.seq))
      .limit(1),
  ]);
  const publication = publicationRows[0];
  if (!publication) return null;
  const entry = entryRows[0];
  const sameMoment = entry && Math.abs(entry.occurred_at.getTime() - publication.published_at.getTime()) <= 5_000;
  return { seq: sameMoment ? safeInteger("seq", entry.seq) : null, published_at: publication.published_at };
}

export type ActivityFeedOptions = { now?: Date };

export async function buildActivityFeed(
  db: DbOrTx,
  actor: SessionActor,
  wedding_id: WeddingId,
  params: ActivityFeedParams = {},
  options: ActivityFeedOptions = {},
): Promise<ActivityFeed> {
  const weddingRows = await db
    .select({ version: weddings.version, published_revision: weddings.published_revision })
    .from(weddings)
    .where(eq(weddings.id, wedding_id))
    .limit(1);
  const wedding = weddingRows[0];
  if (!wedding) throw new CommandFailure({ code: "not_found", message: "Wedding not found." });
  const role = await readerRole(db, actor, wedding_id);
  const limit = feedLimit(params.limit);
  const empty: ActivityFeed = { version: safeInteger("version", wedding.version), hidden: [], entries: [], next_before_seq: null };

  const conditions: SQL[] = [eq(activityEntries.wedding_id, wedding_id)];
  if (role !== "owner") conditions.push(eq(activityEntries.visibility, "members"));
  if (params.before_seq !== undefined) {
    if (!Number.isSafeInteger(params.before_seq)) {
      throw new CommandFailure({ code: "validation_failed", message: "not_integer", field: "before_seq" });
    }
    conditions.push(lt(activityEntries.seq, params.before_seq));
  }
  if (params.day !== undefined) {
    const day = params.day === "today" ? istToday(options.now ?? new Date()) : params.day;
    // The round trip refuses impossible dates: JS rolls "2026-02-30" over to 2 March.
    if (!DATE_PATTERN.test(day) || Number.isNaN(istWallClock(day).getTime()) || istDate(istWallClock(day)) !== day) {
      throw new CommandFailure({ code: "validation_failed", message: "unknown_value", field: "day" });
    }
    conditions.push(gte(activityEntries.occurred_at, istWallClock(day)));
    conditions.push(lt(activityEntries.occurred_at, istWallClock(nextIsoDate(day))));
  }
  if (params.actor_member_id !== undefined) {
    if (!isUuidShaped(params.actor_member_id)) return empty;
    conditions.push(eq(activityEntries.actor_member_id, params.actor_member_id));
  }
  if (params.entity_id !== undefined) {
    if (!isUuidShaped(params.entity_id)) return empty;
    conditions.push(eq(activityEntries.entity_id, params.entity_id));
  }
  if (params.topic_prefix) {
    conditions.push(sql`${activityEntries.topic} like ${likePrefix(params.topic_prefix)}`);
  }

  const [rows, boundary] = await Promise.all([
    db
      .select()
      .from(activityEntries)
      .where(and(...conditions))
      .orderBy(desc(activityEntries.seq))
      .limit(limit + 1),
    publishBoundary(db, wedding_id, wedding.published_revision),
  ]);

  const page = rows.slice(0, limit);
  const manager = role !== "owner";
  const entries: ActivityFeedEntry[] = page.map((row) => {
    const seq = safeInteger("seq", row.seq);
    const before = (row.before ?? null) as JsonValue | null;
    const after = (row.after ?? null) as JsonValue | null;
    return {
      id: row.id,
      seed_key: row.seed_key,
      seq,
      occurred_at: toIstInstant(row.occurred_at),
      actor_type: row.actor_type,
      actor_label: row.actor_label,
      command: row.command,
      topic: row.topic,
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      summary_en: row.summary_en,
      summary_hi: row.summary_hi,
      before: (manager ? stripForManager(before) : before) as JsonObject | null,
      after: (manager ? stripForManager(after) : after) as JsonObject | null,
      source: row.source,
      voice_turn_id: row.voice_turn_id,
      spoken_text: row.spoken_text,
      proposal_id: row.proposal_id,
      awaiting_publish: awaitingPublish({ seq, occurred_at: row.occurred_at, topic: row.topic, before, after }, boundary),
    };
  });

  return {
    version: safeInteger("version", wedding.version),
    hidden: [],
    entries,
    next_before_seq: rows.length > limit && entries.length > 0 ? entries[entries.length - 1].seq : null,
  };
}
