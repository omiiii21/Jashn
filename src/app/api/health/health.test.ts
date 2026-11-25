import { describe, expect, it } from "vitest";
import { healthResponse } from "./health";

describe("healthResponse", () => {
  it("reports the deployed commit SHA", () => {
    const body = healthResponse({ VERCEL_GIT_COMMIT_SHA: "abc123", VERCEL_ENV: "production" });
    expect(body).toEqual({ ok: true, sha: "abc123", env: "production" });
  });

  it("falls back to local values outside Vercel", () => {
    const body = healthResponse({});
    expect(body).toEqual({ ok: true, sha: "local", env: "development" });
  });
});
