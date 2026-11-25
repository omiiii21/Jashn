import { describe, expect, it } from "vitest";

import { buildCreateInput, EMPTY_SETUP_VALUES, joinDate, parseRupees, valuesFromPrefill, weddingIdFromResult } from "./setup-form-values";

describe("the typed setup form's values", () => {
  it("reads the budget with or without Indian grouping", () => {
    expect(parseRupees("12,00,000")).toBe(1_200_000);
    expect(parseRupees("1200000")).toBe(1_200_000);
    expect(parseRupees("₹12,00,000")).toBe(1_200_000);
    expect(parseRupees("")).toBeNull();
    expect(Number.isNaN(parseRupees("twelve lakh"))).toBe(true);
  });

  it("never fills the year: a date needs day, month and year", () => {
    expect(joinDate("14", "12", "")).toBeNull();
    expect(joinDate("14", "12", "2026")).toBe("2026-12-14");
    expect(joinDate("1", "2", "2027")).toBe("2027-02-01");
  });

  it("builds the create input like the dispatcher checks it (AT-1.3, AT-1.4)", () => {
    const ok = buildCreateInput(
      { ...EMPTY_SETUP_VALUES, bride_name: " Mira ", groom_name: "Kabir", day: "14", month: "12", year: "2026", city: "Bengaluru", budget: "12,00,000", guests: "250" },
      "2026-11-25T09:00:00.000Z",
    );
    expect(ok).toEqual({
      ok: true,
      input: {
        bride_name: "Mira",
        groom_name: "Kabir",
        wedding_date: "2026-12-14",
        city: "Bengaluru",
        budget_inr: 1_200_000,
        expected_guests: 250,
        setup_opened_at: "2026-11-25T09:00:00.000Z",
      },
    });

    const missing = buildCreateInput({ ...EMPTY_SETUP_VALUES, day: "14", month: "12" }, null);
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(Object.keys(missing.errors).sort()).toEqual(["bride_name", "date", "groom_name"]);

    const badDate = buildCreateInput({ ...EMPTY_SETUP_VALUES, bride_name: "Mira", groom_name: "Kabir", day: "31", month: "2", year: "2026" }, null);
    expect(badDate.ok).toBe(false);
    if (!badDate.ok) expect(badDate.errors.date).toBe("Pick a real date between 2026 and 2030.");
  });

  it("fills the form from a voice prefill and names the fields it filled (AT-1.6)", () => {
    const { values, filled } = valuesFromPrefill({ city: "Bengaluru", budget_inr: 1_200_000, expected_guests: 250, setup_opened_at: "x" });
    expect(values).toEqual({ city: "Bengaluru", budget: "12,00,000", guests: "250" });
    expect(filled.sort()).toEqual(["budget", "city", "guests"]);
    expect(valuesFromPrefill({ wedding_date: "2026-12-14", bride_name: "Mira" }).values).toEqual({ bride_name: "Mira", year: "2026", month: "12", day: "14" });
  });

  it("reads the new wedding's id from the result", () => {
    expect(weddingIdFromResult({ wedding_id: "w-1", member_id: "m", created: true })).toBe("w-1");
    expect(weddingIdFromResult({})).toBeNull();
    expect(weddingIdFromResult(null)).toBeNull();
  });
});
