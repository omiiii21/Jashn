import * as crypto from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { OPS_SYSTEM_ACTOR, bearerToken, createSystemVerifier, secretsMatch, verifySystemToken } from "./system";

vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, timingSafeEqual: vi.fn(actual.timingSafeEqual) };
});

const TOKEN = "q3VJm0Yx7cW2bQf9N1sZp4LkTgHr8DaE6uOiXjCnBvM=";

describe("bearerToken", () => {
  it("reads `Bearer <token>`, with the scheme in any case", () => {
    expect(bearerToken(`Bearer ${TOKEN}`)).toBe(TOKEN);
    expect(bearerToken(`bearer ${TOKEN}`)).toBe(TOKEN);
    expect(bearerToken(`  BEARER   ${TOKEN}  `)).toBe(TOKEN);
  });

  it("refuses missing, empty and other schemes", () => {
    expect(bearerToken(null)).toBeNull();
    expect(bearerToken(undefined)).toBeNull();
    expect(bearerToken("")).toBeNull();
    expect(bearerToken("Bearer")).toBeNull();
    expect(bearerToken("Bearer ")).toBeNull();
    expect(bearerToken(`Basic ${TOKEN}`)).toBeNull();
    expect(bearerToken(TOKEN)).toBeNull();
    expect(bearerToken(`Bearer ${TOKEN} extra`)).toBeNull();
  });
});

describe("createSystemVerifier", () => {
  afterEach(() => {
    vi.mocked(crypto.timingSafeEqual).mockClear();
  });

  it("accepts the right token as the NudgeBee system actor", async () => {
    const verify = createSystemVerifier(() => TOKEN);
    expect(await verify(`Bearer ${TOKEN}`)).toEqual({ kind: "system", label: "NudgeBee" });
    expect(OPS_SYSTEM_ACTOR).toEqual({ kind: "system", label: "NudgeBee" });
  });

  it("tolerates surrounding whitespace in the env value", async () => {
    const verify = createSystemVerifier(() => `${TOKEN}\n`);
    expect(await verify(`Bearer ${TOKEN}`)).not.toBeNull();
  });

  it("refuses a wrong, shorter, longer or differently cased token", async () => {
    const verify = createSystemVerifier(() => TOKEN);
    expect(await verify(`Bearer ${TOKEN.slice(0, -1)}`)).toBeNull();
    expect(await verify(`Bearer ${TOKEN}x`)).toBeNull();
    expect(await verify(`Bearer ${TOKEN.toLowerCase()}`)).toBeNull();
    expect(await verify("Bearer x")).toBeNull();
  });

  it("refuses a missing or malformed header", async () => {
    const verify = createSystemVerifier(() => TOKEN);
    expect(await verify(null)).toBeNull();
    expect(await verify("")).toBeNull();
    expect(await verify(TOKEN)).toBeNull();
    expect(await verify(`Basic ${TOKEN}`)).toBeNull();
  });

  it("refuses everything while the env var is unset or blank", async () => {
    for (const expected of [undefined, null, "", "   "]) {
      const verify = createSystemVerifier(() => expected);
      expect(await verify(`Bearer ${TOKEN}`)).toBeNull();
      expect(await verify("Bearer ")).toBeNull();
      expect(await verify(`Bearer ${expected ?? ""}`)).toBeNull();
    }
  });

  it("compares equal-length SHA-256 digests in constant time, whatever the token length", async () => {
    const verify = createSystemVerifier(() => TOKEN);
    const timingSafeEqual = vi.mocked(crypto.timingSafeEqual);
    for (const presented of [TOKEN, "x", `${TOKEN}${TOKEN}${TOKEN}`]) {
      timingSafeEqual.mockClear();
      await verify(`Bearer ${presented}`);
      expect(timingSafeEqual).toHaveBeenCalledTimes(1);
      const [a, b] = timingSafeEqual.mock.calls[0] as [Buffer, Buffer];
      expect(a).toHaveLength(32);
      expect(b).toHaveLength(32);
    }
  });

  it("secretsMatch is plain equality underneath", () => {
    expect(secretsMatch(TOKEN, TOKEN)).toBe(true);
    expect(secretsMatch(TOKEN, `${TOKEN} `)).toBe(false);
    expect(secretsMatch("", "")).toBe(true);
  });
});

describe("verifySystemToken", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reads JOBS_API_TOKEN on every call", async () => {
    vi.stubEnv("JOBS_API_TOKEN", TOKEN);
    expect(await verifySystemToken(`Bearer ${TOKEN}`)).toEqual({ kind: "system", label: "NudgeBee" });
    vi.stubEnv("JOBS_API_TOKEN", "rotated-token-value-0123456789");
    expect(await verifySystemToken(`Bearer ${TOKEN}`)).toBeNull();
    vi.stubEnv("JOBS_API_TOKEN", "");
    expect(await verifySystemToken("Bearer ")).toBeNull();
    expect(await verifySystemToken(`Bearer ${TOKEN}`)).toBeNull();
  });
});
