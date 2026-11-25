import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

import { config } from "@/proxy";

import { shouldRefreshSession } from "./paths";

// Next's own matcher compiler (untyped internal), so the test checks what Next really runs.
type CompileMatchers = (matchers: string[], next_config: Record<string, unknown>) => { regexp: string }[];
const { getMiddlewareMatchers } = createRequire(import.meta.url)("next/dist/build/analysis/get-page-static-info") as {
  getMiddlewareMatchers: CompileMatchers;
};

const SKIPPED = [
  "/_next/static/chunks/main.js",
  "/_next/image",
  "/favicon.ico",
  "/next.svg",
  "/card/hindi-line.png",
  "/fonts/eczar.woff2",
  "/i/abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG",
  "/api/i/abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG/revision",
  "/api/i/abc/rsvp",
  "/render/card/0f9a2c1e-1111-4111-8111-111111111111",
  "/api/ops/export-jobs/abc",
  "/api/ops/export-jobs/abc/retry",
  "/api/health",
  "/api/health/",
  "/api/w/0f9a2c1e-1111-4111-8111-111111111111/version",
];

const REFRESHED = [
  "/",
  "/login",
  "/signup",
  "/setup",
  "/join/sometoken",
  "/w/0f9a2c1e-1111-4111-8111-111111111111",
  "/w/0f9a2c1e-1111-4111-8111-111111111111/money",
  "/w/0f9a2c1e-1111-4111-8111-111111111111/invite",
  "/api/w/0f9a2c1e-1111-4111-8111-111111111111/commands/update_event",
  "/api/w/0f9a2c1e-1111-4111-8111-111111111111/exports",
  "/api/uploads/sign",
  "/api/voice/turn",
  "/api/card-imports",
  "/api/healthz",
  "/icons",
  "/invite",
];

describe("shouldRefreshSession", () => {
  it.each(SKIPPED)("skips %s", (path) => {
    expect(shouldRefreshSession(path)).toBe(false);
  });

  it.each(REFRESHED)("refreshes %s", (path) => {
    expect(shouldRefreshSession(path)).toBe(true);
  });
});

describe("proxy config.matcher, compiled with Next's own parser", () => {
  const [compiled] = getMiddlewareMatchers(config.matcher, {});
  const matcher = new RegExp(compiled.regexp);

  it("has exactly one matcher", () => {
    expect(config.matcher).toHaveLength(1);
  });

  it.each([...SKIPPED, ...REFRESHED])("agrees with shouldRefreshSession on %s", (path) => {
    expect(matcher.test(path)).toBe(shouldRefreshSession(path));
  });
});
