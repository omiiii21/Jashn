import { describe, expect, it } from "vitest";

import {
  formatClock,
  formatDate,
  formatDateLong,
  formatDateRange,
  formatDayMonth,
  formatDaysUntil,
  formatDayTime,
  formatTime,
  istDateOf,
} from "./format";

describe("planner date and time format (IST)", () => {
  it("formats calendar dates without a time-zone shift", () => {
    expect(formatDate("2026-12-13")).toBe("13 Dec 2026");
    expect(formatDayMonth("2026-12-02")).toBe("2 Dec");
    expect(formatDateLong("2026-12-14")).toBe("Monday, 14 December 2026");
  });

  it("formats a wedding's span", () => {
    expect(formatDateRange("2026-12-13", "2026-12-14")).toBe("13–14 Dec 2026");
    expect(formatDateRange("2026-11-30", "2026-12-02")).toBe("30 Nov – 2 Dec 2026");
    expect(formatDateRange("2026-12-31", "2027-01-01")).toBe("31 Dec 2026 – 1 Jan 2027");
    expect(formatDateRange("2026-12-13", "2026-12-13")).toBe("13 Dec 2026");
    expect(formatDateRange(null, "2026-12-14")).toBe("14 Dec 2026");
    expect(formatDateRange(null, null)).toBeNull();
  });

  it("shows instants in IST, whatever the offset they arrive with", () => {
    expect(formatTime("2026-11-25T13:42:00+05:30")).toBe("1:42 pm");
    expect(formatTime("2026-11-25T08:12:00Z")).toBe("1:42 pm");
    expect(formatTime("2026-11-24T18:35:00Z")).toBe("12:05 am");
    expect(formatDayTime("2026-11-25T08:12:00Z")).toBe("25 Nov, 1:42 pm");
    expect(istDateOf("2026-11-24T18:35:00Z")).toBe("2026-11-25");
  });

  it("formats wall-clock times and day counts", () => {
    expect(formatClock("19:30")).toBe("7:30 pm");
    expect(formatClock("00:15:00")).toBe("12:15 am");
    expect(formatClock("12:00")).toBe("12:00 pm");
    expect(formatDaysUntil(0)).toBe("today");
    expect(formatDaysUntil(1)).toBe("tomorrow");
    expect(formatDaysUntil(7)).toBe("in 7 days");
    expect(formatDaysUntil(-1)).toBe("1 day ago");
    expect(formatDaysUntil(-8)).toBe("8 days ago");
  });
});
