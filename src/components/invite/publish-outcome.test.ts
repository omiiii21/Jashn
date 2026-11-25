import { describe, expect, it } from "vitest";

import { interpretConfirmResult } from "./publish-outcome";

describe("interpretConfirmResult", () => {
  it("reads the planner's command response", () => {
    expect(interpretConfirmResult({ ok: true, outcome: "applied", result: { revision: 3, changes: [{}] } })).toBe("published");
    expect(interpretConfirmResult({ ok: true, outcome: "unchanged", result: { revision: 2, changes: [] } })).toBe("unchanged");
    expect(interpretConfirmResult({ ok: true, outcome: "replayed", result: { revision: 2, changes: [] } })).toBe("unchanged");
    expect(interpretConfirmResult({ ok: false, error: { code: "draft_changed", message: "x" } })).toBe("draft_changed");
    expect(interpretConfirmResult({ ok: false, error: { code: "forbidden", message: "x" } })).toBe("forbidden");
    expect(interpretConfirmResult({ ok: false, error: { code: "internal_error", message: "x" } })).toBe("error");
  });

  it("reads a voice confirm response", () => {
    expect(interpretConfirmResult({ ok: true, results: [{ index: 0, outcome: "applied" }] })).toBe("published");
    expect(interpretConfirmResult({ ok: true, results: [{ index: 0, outcome: "unchanged" }] })).toBe("unchanged");
  });

  it("treats a fixture's bare result as published and junk as an error", () => {
    expect(interpretConfirmResult({ ok: true, outcome: "applied", result: {} })).toBe("published");
    expect(interpretConfirmResult(undefined)).toBe("published");
    expect(interpretConfirmResult("nope")).toBe("error");
  });
});
