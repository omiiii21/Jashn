/**
 * Calendar dates with a short weekday, for ledger rows and due lines: "Fri 20 Nov 2026" and
 * "Sat 12 Dec" (acceptance AT-6.1). Calendar dates carry no time zone, so nothing shifts.
 * Built on `../format`; fold these into it when that file next changes hands.
 */
import type { IsoDate } from "@/contracts/domain";

import { formatDate, formatDayMonth } from "../format";

const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function weekdayShort(date: IsoDate): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  const day = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))).getUTCDay();
  return WEEKDAYS_SHORT[day];
}

/** "Fri 20 Nov 2026". */
export function formatWeekdayDate(date: IsoDate): string {
  const weekday = weekdayShort(date);
  return weekday ? `${weekday} ${formatDate(date)}` : date;
}

/** "Sat 12 Dec", without the year. */
export function formatWeekdayDayMonth(date: IsoDate): string {
  const weekday = weekdayShort(date);
  return weekday ? `${weekday} ${formatDayMonth(date)}` : date;
}
