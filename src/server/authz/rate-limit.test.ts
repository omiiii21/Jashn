import { describe, expect, it } from "vitest";

import {
  GUEST_RATE_LIMITS,
  RATE_LIMITED_BODY,
  clientIpFrom,
  createGuestRateLimiter,
  limitGuestRequest,
  limitGuestToken,
  rateLimitedResponse,
} from "./rate-limit";

function clock(start = 1_000_000) {
  let now = start;
  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

async function burst(n: number, call: () => Promise<{ allowed: boolean }>) {
  let allowed = 0;
  let refused = 0;
  for (let i = 0; i < n; i++) {
    if ((await call()).allowed) allowed += 1;
    else refused += 1;
  }
  return { allowed, refused };
}

describe("the guest limits", () => {
  it("are domain 6.3's numbers (D108)", () => {
    expect(GUEST_RATE_LIMITS).toEqual({ window_ms: 60_000, token_get: 120, token_post: 30, ip: 600 });
  });
});

describe("per token hash", () => {
  it("lets 30 POSTs a minute through, refuses the rest with a retry-after, and recovers after the window", async () => {
    const time = clock();
    const limiter = createGuestRateLimiter({ now: time.now });
    const first = await burst(45, () => limiter.limitToken("hash-a", "post"));
    expect(first).toEqual({ allowed: 30, refused: 15 });

    time.advance(20_000);
    const refused = await limiter.limitToken("hash-a", "post");
    expect(refused).toEqual({ allowed: false, retry_after_s: 40 });

    time.advance(40_000);
    expect(await limiter.limitToken("hash-a", "post")).toEqual({ allowed: true });
    expect(await burst(40, () => limiter.limitToken("hash-a", "post"))).toEqual({ allowed: 29, refused: 11 });
  });

  it("lets 120 GETs a minute through, counted apart from POSTs", async () => {
    const time = clock();
    const limiter = createGuestRateLimiter({ now: time.now });
    expect(await burst(150, () => limiter.limitToken("hash-a", "get"))).toEqual({ allowed: 120, refused: 30 });
    // GETs used up; POSTs still have their own 30.
    expect(await limiter.limitToken("hash-a", "post")).toEqual({ allowed: true });
  });

  it("keeps tokens apart: one household's flood never blocks another", async () => {
    const limiter = createGuestRateLimiter({ now: clock().now });
    await burst(60, () => limiter.limitToken("hash-a", "post"));
    expect(await limiter.limitToken("hash-a", "post")).toMatchObject({ allowed: false });
    expect(await limiter.limitToken("hash-b", "post")).toEqual({ allowed: true });
  });

  it("never answers a retry-after below one second", async () => {
    const time = clock();
    const limiter = createGuestRateLimiter({ now: time.now, limits: { token_post: 1 } });
    await limiter.limitToken("hash-a", "post");
    time.advance(59_999);
    expect(await limiter.limitToken("hash-a", "post")).toEqual({ allowed: false, retry_after_s: 1 });
  });
});

describe("limitGuestRequest", () => {
  it("applies the loose 600-a-minute IP ceiling across tokens, then recovers", async () => {
    const time = clock();
    const limiter = createGuestRateLimiter({ now: time.now });
    let n = 0;
    // Many households on one venue Wi-Fi, each well inside its own limits.
    const result = await burst(700, () => limiter.limitGuestRequest({ token_hash: `hash-${n++ % 50}`, ip: "203.0.113.7", kind: "get" }));
    expect(result).toEqual({ allowed: 600, refused: 100 });
    expect(await limiter.limitGuestRequest({ token_hash: null, ip: "203.0.113.7", kind: "get" })).toMatchObject({ allowed: false });
    expect(await limiter.limitGuestRequest({ token_hash: "hash-0", ip: "198.51.100.1", kind: "get" })).toEqual({ allowed: true });

    time.advance(60_000);
    expect(await limiter.limitGuestRequest({ token_hash: "hash-0", ip: "203.0.113.7", kind: "get" })).toEqual({ allowed: true });
  });

  it("applies the token limits beneath the IP ceiling", async () => {
    const limiter = createGuestRateLimiter({ now: clock().now });
    const result = await burst(40, () => limiter.limitGuestRequest({ token_hash: "hash-a", ip: "203.0.113.7", kind: "post" }));
    expect(result).toEqual({ allowed: 30, refused: 10 });
  });

  it("skips the checks it has no key for", async () => {
    const limiter = createGuestRateLimiter({ now: clock().now, limits: { ip: 2, token_get: 2 } });
    expect(await burst(5, () => limiter.limitGuestRequest({ token_hash: null, ip: null, kind: "get" }))).toEqual({ allowed: 5, refused: 0 });
    expect(await burst(5, () => limiter.limitGuestRequest({ token_hash: "hash-a", ip: null, kind: "get" }))).toEqual({ allowed: 2, refused: 3 });
    expect(await burst(5, () => limiter.limitGuestRequest({ token_hash: null, ip: "203.0.113.7", kind: "get" }))).toEqual({ allowed: 2, refused: 3 });
  });
});

describe("memory", () => {
  it("sweeps windows that have ended", async () => {
    const time = clock();
    const limiter = createGuestRateLimiter({ now: time.now });
    for (let i = 0; i < 100; i++) await limiter.limitToken(`hash-${i}`, "get");
    expect(limiter.size()).toBe(100);
    time.advance(60_000);
    await limiter.limitToken("hash-new", "get");
    expect(limiter.size()).toBe(1);
  });

  it("caps the number of keys, dropping the oldest windows first", async () => {
    const time = clock();
    const limiter = createGuestRateLimiter({ now: time.now, max_keys: 10, limits: { token_get: 1 } });
    for (let i = 0; i < 25; i++) {
      await limiter.limitToken(`hash-${i}`, "get");
      time.advance(1);
    }
    expect(limiter.size()).toBe(10);
    // The newest keys keep their counts; the evicted oldest start again.
    expect(await limiter.limitToken("hash-24", "get")).toMatchObject({ allowed: false });
    expect(await limiter.limitToken("hash-0", "get")).toEqual({ allowed: true });
  });

  it("restarts a window if the clock goes backwards", async () => {
    const time = clock();
    const limiter = createGuestRateLimiter({ now: time.now, limits: { token_post: 1 } });
    await limiter.limitToken("hash-a", "post");
    time.advance(-5_000);
    expect(await limiter.limitToken("hash-a", "post")).toEqual({ allowed: true });
  });
});

describe("the shared limiter", () => {
  it("is one instance behind both exports", async () => {
    const hash = `shared-${Math.random()}`;
    for (let i = 0; i < 30; i++) await limitGuestToken(hash, "post");
    expect(await limitGuestRequest({ token_hash: hash, ip: null, kind: "post" })).toMatchObject({ allowed: false });
  });
});

describe("request helpers", () => {
  it("reads the client IP from x-real-ip, else the first x-forwarded-for", () => {
    expect(clientIpFrom(new Headers({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "198.51.100.1" }))).toBe("203.0.113.7");
    expect(clientIpFrom(new Headers({ "x-forwarded-for": " 198.51.100.1 , 10.0.0.1" }))).toBe("198.51.100.1");
    expect(clientIpFrom(new Headers())).toBeNull();
  });

  it("answers 429 rate_limited with Retry-After and the guest headers", async () => {
    const response = rateLimitedResponse(12.2);
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("13");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ ok: false, error: { code: "rate_limited", message: RATE_LIMITED_BODY.message, field: null } });
  });
});
