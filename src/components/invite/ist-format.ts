import { APP_TIMEZONE } from "@/contracts/domain";

/**
 * IST formatting for Lane D's workspace surfaces (AGENTS rule 9): the publish sheet, the
 * Invite page status line and the exports panel. Pure, so client and server both use it.
 * The card and the guest page keep their own formats (export 1.2, design 10.6).
 */

function parts(iso: string, options: Intl.DateTimeFormatOptions): Record<string, string> {
  const formatted = new Intl.DateTimeFormat("en-GB", { ...options, timeZone: APP_TIMEZONE }).formatToParts(new Date(iso));
  return Object.fromEntries(formatted.map((part) => [part.type, part.value]));
}

/** "1:42 pm" (export 2.7). */
export function istTime(iso: string): string {
  const p = parts(iso, { hour: "numeric", minute: "2-digit", hour12: true });
  return `${p.hour}:${p.minute} ${(p.dayPeriod ?? "").toLowerCase()}`.trim();
}

/** "24 Nov". */
export function istDayMonth(iso: string): string {
  const p = parts(iso, { day: "numeric", month: "short" });
  return `${p.day} ${p.month}`;
}

/** "24 Nov 2026, 1:42 pm". */
export function istDateTime(iso: string): string {
  const p = parts(iso, { day: "numeric", month: "short", year: "numeric" });
  return `${p.day} ${p.month} ${p.year}, ${istTime(iso)}`;
}
