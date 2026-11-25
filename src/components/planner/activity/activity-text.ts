/**
 * Pure helpers for the Activity feed (brief B3). Every line is the read model's own words
 * (`summary_en`, D23); these only pick labels and build filter links.
 */
import type { ActivityFeedEntry, ActivityFeedParams } from "@/contracts/read-models";

/**
 * Topic filters (AT-8.6): the label and the `topic_prefix` it sends. The read model takes one
 * prefix, so each label names only what that prefix shows; broader groups need Lane A.
 */
export const TOPIC_FILTERS = [
  { label: "Function changes", prefix: "event." },
  { label: "Replies", prefix: "rsvp." },
  { label: "Payments", prefix: "payment." },
] as const;

/** The query keys the page reads. */
export type FeedQuery = { day?: string; topic?: string; before?: string };

/** Turns the page's query into the read model's params; unknown values are dropped. */
export function feedParams(query: FeedQuery): ActivityFeedParams {
  const params: ActivityFeedParams = { limit: 50 };
  if (query.day === "today") params.day = "today";
  const topic = TOPIC_FILTERS.find((item) => item.prefix === query.topic);
  if (topic) params.topic_prefix = topic.prefix;
  if (query.before && /^\d+$/.test(query.before)) params.before_seq = Number(query.before);
  return params;
}

/** A link to the feed with these filters (paging resets when a filter changes). */
export function feedHref(base: string, query: FeedQuery): string {
  const search = new URLSearchParams();
  if (query.day) search.set("day", query.day);
  if (query.topic) search.set("topic", query.topic);
  if (query.before) search.set("before", query.before);
  const text = search.toString();
  return text ? `${base}?${text}` : base;
}

/** System actors show by name ("Jashn", "NudgeBee"); members by their label. */
export function actorName(entry: Pick<ActivityFeedEntry, "actor_type" | "actor_label">): string {
  return entry.actor_label;
}

const PUBLISHED_VALUE_KEYS = ["venue_name", "venue", "title", "dress_code"] as const;

/**
 * "Draft. Guests still see Banyan Hall." for a draft edit made after the latest publish,
 * built only from the entry's own `before` object; otherwise the general line.
 */
export function awaitingPublishLine(entry: Pick<ActivityFeedEntry, "awaiting_publish" | "before">): string | null {
  if (!entry.awaiting_publish) return null;
  const before = entry.before ?? {};
  for (const key of PUBLISHED_VALUE_KEYS) {
    const value = before[key];
    if (typeof value === "string" && value.trim() !== "") return `Draft. Guests still see ${value}.`;
  }
  return "Draft. Guests still see the published schedule.";
}
