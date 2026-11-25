import { describe, expect, it } from "vitest";

import { parseAmountInput } from "./command";

/** AT-5.6's form row: "40,000" and "40000" are accepted; anything else is refused by the field. */
describe("parseAmountInput", () => {
  it.each([
    ["40,000", 40000],
    ["40000", 40000],
    ["1,50,000", 150000],
    ["₹40,000", 40000],
    [" 2,00,000 ", 200000],
    ["800", 800],
  ])("accepts %s", (raw, value) => {
    expect(parseAmountInput(raw)).toEqual({ ok: true, value });
  });

  it.each(["", "40k", "40,000.50", "forty thousand", "-5,000", "4,0000", "0", "40.000", "1.6L"])("refuses %j", (raw) => {
    const result = parseAmountInput(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message.length).toBeGreaterThan(0);
  });
});
