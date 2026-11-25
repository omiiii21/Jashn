import { describe, expect, it } from "vitest";
import { bearerMatches, verifyOpsBearer } from "./ops-auth";

// EX-05 (export-and-recovery 8.1): every bad-token variant is refused.
const TOKEN = "jobs-token-abcdefghijklmnopqrstuvwxyz-0123456789";

describe("ops bearer check (temporary, until Lane A's verifier)", () => {
  it("accepts exactly `Bearer <token>`", () => {
    expect(bearerMatches(`Bearer ${TOKEN}`, TOKEN)).toBe(true);
  });

  it.each([
    ["missing header", null],
    ["empty header", ""],
    ["Basic scheme", `Basic ${TOKEN}`],
    ["lowercase scheme", `bearer ${TOKEN}`],
    ["wrong token", "Bearer not-the-token"],
    ["extra whitespace between", `Bearer  ${TOKEN}`],
    ["trailing whitespace", `Bearer ${TOKEN} `],
    ["leading whitespace", ` Bearer ${TOKEN}`],
    ["empty bearer", "Bearer "],
    ["bare token", TOKEN],
    ["a rotated old token", "Bearer jobs-token-old-value-that-was-rotated-out"],
    ["token prefix", `Bearer ${TOKEN.slice(0, -1)}`],
    ["token with suffix", `Bearer ${TOKEN}x`],
  ])("refuses %s", (_label, header) => {
    expect(bearerMatches(header, TOKEN)).toBe(false);
  });

  it("refuses everything when JOBS_API_TOKEN is unset", async () => {
    expect(bearerMatches(`Bearer ${TOKEN}`, "")).toBe(false);
    expect(await verifyOpsBearer(`Bearer ${TOKEN}`, {})).toBe(false);
    expect(await verifyOpsBearer(`Bearer ${TOKEN}`, { JOBS_API_TOKEN: TOKEN })).toBe(true);
  });
});
