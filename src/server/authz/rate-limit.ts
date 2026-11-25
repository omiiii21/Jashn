import "server-only";

import type { CommandErrorBody } from "@/contracts/commands";
import type { RateLimiter } from "@/contracts/services";

import { GUEST_RESPONSE_HEADERS } from "./guest-token";

/**
 * The single guest rate limiter (domain 6.3; decisions D57, D108).
 *
 * - Per token hash: about 120 GETs and 30 POSTs a minute (the 10 s poll is 6 GETs).
 * - Per IP: a loose ceiling of 600 requests a minute on `/i/` and `/api/i/`, so a shared
 *   venue Wi-Fi is never blocked.
 * - In memory, per server instance, fixed one-minute windows: best effort against a stuck
 *   retry loop or a flood, not an exact limit. Memory stays bounded: windows that have
 *   ended are swept, and past `max_keys` the oldest windows go first.
 * - Lane D calls `limitGuestRequest` once per guest request (page, revision poll, RSVP,
 *   dietary) and answers a refusal with `rateLimitedResponse`. No other counters exist.
 * - Keys are token hashes and IPs, held in memory only and never logged.
 */

export const GUEST_RATE_LIMITS = Object.freeze({
  window_ms: 60_000,
  /** GETs per token hash per window. */
  token_get: 120,
  /** POSTs per token hash per window. */
  token_post: 30,
  /** Requests per IP per window, across `/i/` and `/api/i/`. */
  ip: 600,
});

export type GuestRateLimits = { window_ms: number; token_get: number; token_post: number; ip: number };

export type RateLimitDecision = { allowed: true } | { allowed: false; retry_after_s: number };

export type GuestRequestKind = "get" | "post";

export type GuestRequestInput = {
  /** The hex SHA-256 of the token (`GuestActor.token_hash`); null for a malformed token. */
  token_hash: string | null;
  /** The client IP (`clientIpFrom`); null when unknown. */
  ip: string | null;
  kind: GuestRequestKind;
};

const ALLOWED: RateLimitDecision = Object.freeze({ allowed: true });

/** The most distinct keys held at once (about 2 MB at worst). */
export const DEFAULT_MAX_KEYS = 20_000;

type Window = { start: number; count: number };

export type GuestRateLimiterOptions = {
  now?: () => number;
  limits?: Partial<GuestRateLimits>;
  max_keys?: number;
};

export type GuestRateLimiter = {
  /** The per-token limits alone, keyed by the token hash (the contract's `RateLimiter`). */
  limitToken: RateLimiter;
  /** The IP ceiling, then the token limits: call once per guest request. */
  limitGuestRequest(input: GuestRequestInput): Promise<RateLimitDecision>;
  /** Keys currently held (tests). */
  size(): number;
  /** Drops every window (tests). */
  reset(): void;
};

/** Builds a limiter with its own counters; the app uses the one shared instance below. */
export function createGuestRateLimiter(options: GuestRateLimiterOptions = {}): GuestRateLimiter {
  const now = options.now ?? Date.now;
  const limits: GuestRateLimits = { ...GUEST_RATE_LIMITS, ...options.limits };
  const maxKeys = Math.max(1, options.max_keys ?? DEFAULT_MAX_KEYS);
  // Insertion order is window-start order: a key is re-inserted whenever its window restarts.
  const windows = new Map<string, Window>();

  function sweep(at: number): void {
    for (const [key, window] of windows) {
      if (at - window.start < limits.window_ms && at >= window.start) break;
      windows.delete(key);
    }
    while (windows.size > maxKeys) {
      const oldest = windows.keys().next();
      if (oldest.done) break;
      windows.delete(oldest.value);
    }
  }

  function hit(key: string, limit: number): RateLimitDecision {
    const at = now();
    let window = windows.get(key);
    if (!window || at - window.start >= limits.window_ms || at < window.start) {
      if (window) windows.delete(key);
      window = { start: at, count: 0 };
      windows.set(key, window);
      sweep(at);
    }
    if (window.count >= limit) {
      return { allowed: false, retry_after_s: Math.max(1, Math.ceil((window.start + limits.window_ms - at) / 1000)) };
    }
    window.count += 1;
    return ALLOWED;
  }

  function tokenHit(token_hash: string, kind: GuestRequestKind): RateLimitDecision {
    return kind === "post" ? hit(`post:${token_hash}`, limits.token_post) : hit(`get:${token_hash}`, limits.token_get);
  }

  return {
    limitToken: async (key, kind) => tokenHit(key, kind),
    async limitGuestRequest({ token_hash, ip, kind }) {
      // A request counts against its IP whenever it arrives, and against its token only
      // once it passes the IP ceiling.
      if (ip) {
        const byIp = hit(`ip:${ip}`, limits.ip);
        if (!byIp.allowed) return byIp;
      }
      return token_hash ? tokenHit(token_hash, kind) : ALLOWED;
    },
    size: () => windows.size,
    reset: () => windows.clear(),
  };
}

// One limiter per server instance, on globalThis so every route bundle shares it.
const holder = globalThis as unknown as { __jashnGuestRateLimiter?: GuestRateLimiter };
const shared: GuestRateLimiter = (holder.__jashnGuestRateLimiter ??= createGuestRateLimiter());

/** The per-token-hash limits (the contract's `RateLimiter`): `key` is the hex token hash. */
export const limitGuestToken: RateLimiter = (key, kind) => shared.limitToken(key, kind);

/** The one call per guest request: the per-IP ceiling, then the per-token limits. */
export function limitGuestRequest(input: GuestRequestInput): Promise<RateLimitDecision> {
  return shared.limitGuestRequest(input);
}

// ---------------------------------------------------------------------------
// Request helpers for the guest routes
// ---------------------------------------------------------------------------

/** The client IP from Vercel's headers (`x-real-ip`, else the first `x-forwarded-for`). */
export function clientIpFrom(headers: Headers): string | null {
  const real = headers.get("x-real-ip")?.trim();
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = real || forwarded;
  return ip ? ip.slice(0, 64) : null;
}

/** The 429 body (AT-4.6, AT-9.4). */
export const RATE_LIMITED_BODY: Readonly<CommandErrorBody> = Object.freeze({
  code: "rate_limited",
  message: "Too many requests. Try again in a moment.",
  field: null,
});

/** The 429 JSON response, with `Retry-After` and the guest headers. */
export function rateLimitedResponse(retry_after_s: number): Response {
  const seconds = Number.isFinite(retry_after_s) ? Math.max(1, Math.ceil(retry_after_s)) : 60;
  return Response.json(
    { ok: false, error: { ...RATE_LIMITED_BODY } },
    { status: 429, headers: { ...GUEST_RESPONSE_HEADERS, "Retry-After": String(seconds) } },
  );
}
