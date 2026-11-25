import { createHash, randomUUID } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { FIXTURE_TARA_TOKEN } from "@/contracts/fixtures";
import { hashLinkToken as seedHashLinkToken, newLinkToken as seedNewLinkToken } from "@/db/seed-apply";

import {
  GUEST_NOT_FOUND_BODY,
  LINK_TOKEN_LENGTH,
  createGuestTokenResolver,
  generateLinkToken,
  guestNotFoundResponse,
  hashLinkToken,
  isWellFormedToken,
  linkTokenHint,
  type GuestLinkRecord,
} from "./guest-token";

describe("link tokens", () => {
  it("are 43 base64url characters from 32 random bytes", () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const token = generateLinkToken();
      expect(token).toHaveLength(LINK_TOKEN_LENGTH);
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(Buffer.from(token, "base64url")).toHaveLength(32);
      expect(isWellFormedToken(token)).toBe(true);
      tokens.add(token);
    }
    expect(tokens.size).toBe(200);
  });

  it("rejects anything but exactly 43 base64url characters", () => {
    const good = generateLinkToken();
    expect(isWellFormedToken(good.slice(0, 42))).toBe(false);
    expect(isWellFormedToken(`${good}A`)).toBe(false);
    expect(isWellFormedToken(`${good.slice(0, 42)}+`)).toBe(false);
    expect(isWellFormedToken(`${good.slice(0, 42)}=`)).toBe(false);
    expect(isWellFormedToken(`${good.slice(0, 42)}/`)).toBe(false);
    expect(isWellFormedToken(` ${good.slice(1)}`)).toBe(false);
    expect(isWellFormedToken("")).toBe(false);
    expect(isWellFormedToken(undefined)).toBe(false);
    expect(isWellFormedToken(42)).toBe(false);
    expect(isWellFormedToken(FIXTURE_TARA_TOKEN)).toBe(true);
  });

  it("hashes the token's text with SHA-256, as a 32-byte buffer and its hex", () => {
    const token = generateLinkToken();
    const { hash, hex } = hashLinkToken(token);
    expect(hash).toBeInstanceOf(Buffer);
    expect(hash).toHaveLength(32);
    expect(hex).toBe(createHash("sha256").update(token).digest("hex"));
    expect(hash.toString("hex")).toBe(hex);
    expect(hashLinkToken(token).hex).toBe(hex);
    expect(hashLinkToken(generateLinkToken()).hex).not.toBe(hex);
  });

  it("hashes exactly as the seed does, so the seeded links (Tara's) resolve", () => {
    // The seed lives in src/db/ and can't import this module, so it keeps its own copy.
    for (let i = 0; i < 20; i++) {
      const token = seedNewLinkToken();
      expect(isWellFormedToken(token)).toBe(true);
      expect(seedHashLinkToken(token).equals(hashLinkToken(token).hash)).toBe(true);
    }
  });

  it("keeps the last four characters as the hint", () => {
    expect(linkTokenHint("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ")).toBe("NOPQ");
  });
});

describe("the one guest 404", () => {
  it("is a plain not_found with the guest headers", async () => {
    expect(GUEST_NOT_FOUND_BODY).toEqual({ code: "not_found", message: "Not found.", field: null });
    const response = guestNotFoundResponse();
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex");
    expect(await response.json()).toEqual({ ok: false, error: GUEST_NOT_FOUND_BODY });
  });
});

describe("createGuestTokenResolver", () => {
  const token = generateLinkToken();
  const record: GuestLinkRecord = {
    wedding_id: randomUUID(),
    household_id: randomUUID(),
    household_name: "Tara Kapoor",
    guest_ids: [randomUUID()],
  };

  function resolverFor(known: Map<string, GuestLinkRecord>) {
    const lookup = vi.fn(async (hash: Buffer) => known.get(hash.toString("hex")) ?? null);
    return { resolve: createGuestTokenResolver(lookup), lookup };
  }

  it("returns the guest actor, carrying the hex hash and never the token", async () => {
    const { resolve, lookup } = resolverFor(new Map([[hashLinkToken(token).hex, record]]));
    const actor = await resolve(token);
    expect(actor).toEqual({ kind: "guest", ...record, token_hash: hashLinkToken(token).hex });
    expect(JSON.stringify(actor)).not.toContain(token);
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(lookup.mock.calls[0][0].equals(hashLinkToken(token).hash)).toBe(true);
  });

  it("answers null for malformed tokens without a lookup", async () => {
    const { resolve, lookup } = resolverFor(new Map([[hashLinkToken(token).hex, record]]));
    for (const bad of [token.slice(0, 42), `${token}x`, `${token.slice(0, 42)}+`, "", "../etc/passwd"]) {
      expect(await resolve(bad)).toBeNull();
    }
    expect(lookup).not.toHaveBeenCalled();
  });

  it("answers null for unknown and revoked tokens (the lookup finds no active link)", async () => {
    const { resolve } = resolverFor(new Map());
    expect(await resolve(token)).toBeNull();
    expect(await resolve(generateLinkToken())).toBeNull();
  });

  it("does not swallow a lookup failure (an outage is not a revoked link)", async () => {
    const resolve = createGuestTokenResolver(async () => {
      throw new Error("connection refused");
    });
    await expect(resolve(token)).rejects.toThrow("connection refused");
  });
});
