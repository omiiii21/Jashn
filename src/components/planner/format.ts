/**
 * Date and time display for planner screens (AGENTS.md rule 9): always Asia/Kolkata, because
 * the server runs in UTC. Money is formatted only by `src/contracts/money.ts`; this file never
 * touches amounts. Safe on the server and in the browser.
 */
import type { IsoDate, IsoInstant } from "@/contracts/domain";

const TIME_ZONE = "Asia/Kolkata";

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;
const WEEKDAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

type DateParts = { year: number; month: number; day: number };

/** Splits a `YYYY-MM-DD` calendar date without any time-zone shift. */
function parseIsoDate(date: IsoDate): DateParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

/** The IST calendar parts of an instant. */
function istParts(instant: IsoInstant): DateParts & { hour: number; minute: number; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(new Date(instant));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  const weekdayShort = get("weekday");
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekdayShort),
  };
}

/** The weekday of a calendar date (0 = Sunday). */
function weekdayOf({ year, month, day }: DateParts): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** "13 Dec 2026". */
export function formatDate(date: IsoDate): string {
  const parts = parseIsoDate(date);
  if (!parts) return date;
  return `${parts.day} ${MONTHS_SHORT[parts.month - 1]} ${parts.year}`;
}

/** "2 Dec", without the year (for due dates inside the current season). */
export function formatDayMonth(date: IsoDate): string {
  const parts = parseIsoDate(date);
  if (!parts) return date;
  return `${parts.day} ${MONTHS_SHORT[parts.month - 1]}`;
}

/** "Sunday, 13 December 2026". */
export function formatDateLong(date: IsoDate): string {
  const parts = parseIsoDate(date);
  if (!parts) return date;
  return `${WEEKDAYS_LONG[weekdayOf(parts)]}, ${parts.day} ${MONTHS_LONG[parts.month - 1]} ${parts.year}`;
}

/**
 * A wedding's span: "13–14 Dec 2026", "30 Nov – 2 Dec 2026", "31 Dec 2026 – 1 Jan 2027",
 * or one date when both ends match. Null ends fall back to the known one.
 */
export function formatDateRange(first: IsoDate | null, last: IsoDate | null): string | null {
  const start = first ?? last;
  const end = last ?? first;
  if (!start || !end) return null;
  const a = parseIsoDate(start);
  const b = parseIsoDate(end);
  if (!a || !b) return start;
  if (start === end) return formatDate(start);
  if (a.year !== b.year) return `${formatDate(start)} – ${formatDate(end)}`;
  if (a.month !== b.month) return `${a.day} ${MONTHS_SHORT[a.month - 1]} – ${formatDate(end)}`;
  return `${a.day}–${b.day} ${MONTHS_SHORT[b.month - 1]} ${b.year}`;
}

function clock(hour: number, minute: number): string {
  const suffix = hour < 12 ? "am" : "pm";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${String(minute).padStart(2, "0")} ${suffix}`;
}

/** "1:42 pm" in IST. */
export function formatTime(instant: IsoInstant): string {
  const parts = istParts(instant);
  return clock(parts.hour, parts.minute);
}

/** A wall-clock `HH:MM[:SS]` (already IST, from the itinerary) as "7:30 pm". */
export function formatClock(time: string): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(time);
  if (!match) return time;
  return clock(Number(match[1]), Number(match[2]));
}

/** "25 Nov, 1:42 pm" in IST: the stamp on "Corrected by Mira, 25 Nov, 1:42 pm". */
export function formatDayTime(instant: IsoInstant): string {
  const parts = istParts(instant);
  return `${parts.day} ${MONTHS_SHORT[parts.month - 1]}, ${clock(parts.hour, parts.minute)}`;
}

/** The IST calendar date of an instant, as `YYYY-MM-DD` (for grouping by day). */
export function istDateOf(instant: IsoInstant): IsoDate {
  const parts = istParts(instant);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

/**
 * The day-count phrase for a due date, from the read model's `days_until_due` (never computed
 * here): "today", "tomorrow", "in 7 days", "1 day ago", "8 days ago".
 */
export function formatDaysUntil(days: number): string {
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days > 1) return `in ${days} days`;
  const ago = Math.abs(days);
  return ago === 1 ? "1 day ago" : `${ago} days ago`;
}
