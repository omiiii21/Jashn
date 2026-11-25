/**
 * Pure text helpers for the Events screen (brief B3). No arithmetic on figures: the one count
 * used is the length of the read model's own list of draft changes, for the draft line.
 */
import type { IsoDate } from "@/contracts/domain";
import type {
  Itinerary,
  ItineraryConflict,
  ItineraryFunction,
  ItineraryVenue,
  UnpublishedChange,
} from "@/contracts/read-models";

import { formatClock, formatDayTime, formatTime } from "../format";

export type FunctionDay = { date: IsoDate; functions: ItineraryFunction[] };

/** Functions grouped by their IST day (`event_date`), keeping the read model's order. */
export function groupByDay(functions: ItineraryFunction[]): FunctionDay[] {
  const days: FunctionDay[] = [];
  for (const fn of functions) {
    const last = days.at(-1);
    if (last && last.date === fn.event_date) last.functions.push(fn);
    else days.push({ date: fn.event_date, functions: [fn] });
  }
  return days;
}

/** "9:30 am to 11:30 am", or the start alone, or null when no time is set. */
export function timeRange(fn: Pick<ItineraryFunction, "start_time" | "end_time">): string | null {
  if (!fn.start_time) return null;
  return fn.end_time ? `${formatClock(fn.start_time)} to ${formatClock(fn.end_time)}` : formatClock(fn.start_time);
}

/** "Lotus Hall, Mallige Gardens", or null without a venue. */
export function venueText(fn: ItineraryFunction): string | null {
  if (!fn.venue) return null;
  return fn.venue.place_name ? `${fn.venue.name}, ${fn.venue.place_name}` : fn.venue.name;
}

/** The venue picker's option: "Lotus Hall, Mallige Gardens, seats 300". */
export function venueOptionLabel(venue: ItineraryVenue): string {
  const place = venue.place_name ? `${venue.name}, ${venue.place_name}` : venue.name;
  return venue.capacity === null ? place : `${place}, seats ${venue.capacity}`;
}

/** "1 change not published. Guests see the published schedule." */
export function draftLine(changes: UnpublishedChange[]): string | null {
  if (changes.length === 0) return null;
  const noun = changes.length === 1 ? "change" : "changes";
  return `${changes.length} ${noun} not published. Guests see the published schedule.`;
}

/** The header line when the draft and the published schedule are in step (AT-3.1). */
export const NO_DRAFT_LINE = "No unpublished changes.";

/** "Published as revision 2, 24 Nov, 9:00 pm, by Mira", or the never-published line. */
export function publishedLine(itinerary: Pick<Itinerary, "published_revision" | "published_at" | "published_by">): string {
  if (itinerary.published_revision === null) return "Not published yet. Guests see nothing until an owner publishes.";
  const when = itinerary.published_at ? `, ${formatDayTime(itinerary.published_at)}` : "";
  const by = itinerary.published_by ? `, by ${itinerary.published_by}` : "";
  return `Published as revision ${itinerary.published_revision}${when}${by}`;
}

/** The draft changes that belong to one function. */
export function changesFor(changes: UnpublishedChange[], event_id: string): UnpublishedChange[] {
  return changes.filter((change) => change.entity === "event" && change.entity_id === event_id);
}

/** "was Banyan Hall", from the published value. */
export function wasLine(change: UnpublishedChange): string {
  const value = change.published_value;
  if (value === null || value === "") return "was not set";
  const text = typeof value === "string" && /^\d{1,2}:\d{2}/.test(value) ? formatClock(value) : String(value);
  return `was ${text}`;
}

/** "Changed by Diya, 1:42 pm", or null when the read model has no actor. */
export function changedByLine(change: UnpublishedChange): string | null {
  if (!change.changed_by) return null;
  return change.changed_at ? `Changed by ${change.changed_by}, ${formatTime(change.changed_at)}` : `Changed by ${change.changed_by}`;
}

/** The read model's conflicts that name this function. */
export function conflictsFor(conflicts: ItineraryConflict[], event_id: string): ItineraryConflict[] {
  return conflicts.filter((conflict) => conflict.event_ids.includes(event_id as never));
}

/** The labels a draft change's field shows under, for screen readers and the row mark. */
export const CHANGE_FIELD_LABELS: Record<string, string> = {
  venue_id: "Venue",
  venue: "Venue",
  venue_name: "Venue",
  title: "Name",
  title_hi: "Hindi name",
  event_date: "Date",
  start_time: "Start",
  end_time: "End",
  muhurat_time: "Muhurat",
  dress_code: "Dress code",
  description: "Notes",
  lead_name: "Lead",
};
