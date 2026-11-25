import { describe, expect, it } from "vitest";
import { getFlagsSummary } from "@/server/flags";
import { healthResponse } from "./health";

describe("healthResponse", () => {
  it("reports the deployed commit SHA and the flags summary", async () => {
    const flags = await getFlagsSummary();
    const body = healthResponse(flags, { VERCEL_GIT_COMMIT_SHA: "abc123", VERCEL_ENV: "production" });
    expect(body).toEqual({ ok: true, sha: "abc123", env: "production", flags });
  });

  it("falls back to local values outside Vercel", async () => {
    const flags = await getFlagsSummary();
    const body = healthResponse(flags, {});
    expect(body.sha).toBe("local");
    expect(body.env).toBe("development");
  });

  it("reports flags as not built until Lane C's gate lands (D12)", async () => {
    const flags = await getFlagsSummary();
    expect(flags.ok).toBe(false);
  });
});
