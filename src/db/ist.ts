/**
 * IST calendar helpers (architecture 7.1, trap "Time"). Vercel runs in UTC; "today", `paid_on`
 * "not after today", `due_state`, `days_until` and `days_until_due` all use the IST date.
 * No `server-only`: the seed, tests and server code share these.
 */
import type { IsoDate, IsoInstant } from "../contracts/domain";

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** The IST calendar date ("YYYY-MM-DD") of an instant. */
export function istDate(instant: Date | IsoInstant): IsoDate {
  const ms = (typeof instant === "string" ? new Date(instant) : instant).getTime();
  return new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Today's IST date. */
export function istToday(now: Date = new Date()): IsoDate {
  return istDate(now);
}

/** An instant as ISO 8601 with the +05:30 offset ("2026-11-25T09:30:00+05:30"). */
export function toIstInstant(instant: Date | IsoInstant): IsoInstant {
  const ms = (typeof instant === "string" ? new Date(instant) : instant).getTime();
  const shifted = new Date(ms + IST_OFFSET_MS).toISOString();
  return `${shifted.slice(0, 19)}+05:30`;
}

/** The instant of an IST wall-clock date and time ("HH:MM" or "HH:MM:SS"). */
export function istWallClock(date: IsoDate, time: string = "00:00"): Date {
  const hhmmss = time.length === 5 ? `${time}:00` : time.slice(0, 8);
  return new Date(`${date}T${hhmmss}+05:30`);
}

/** Whole days from `from` to `to` (both IST dates); negative when `to` is earlier. */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  const a = Date.UTC(Number(from.slice(0, 4)), Number(from.slice(5, 7)) - 1, Number(from.slice(8, 10)));
  const b = Date.UTC(Number(to.slice(0, 4)), Number(to.slice(5, 7)) - 1, Number(to.slice(8, 10)));
  return Math.round((b - a) / 86_400_000);
}

/** "HH:MM:SS" or "HH:MM" from Postgres to "HH:MM"; null stays null. */
export function hhmm(time: string | null | undefined): string | null {
  return time ? time.slice(0, 5) : null;
}
