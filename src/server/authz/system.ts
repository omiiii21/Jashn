import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

import type { SystemActor } from "@/contracts/domain";
import type { SystemVerifier } from "@/contracts/services";

/**
 * The `JOBS_API_TOKEN` check for `/api/ops/*` (architecture 3.7, domain 6.4; decisions D58,
 * D102).
 *
 * - The header is `Authorization: Bearer <token>`; the scheme matches case-insensitively.
 * - Both sides are hashed with SHA-256 and the 32-byte digests compared with
 *   `timingSafeEqual`, so neither the content nor the length leaks through timing.
 * - Null when the header is missing or malformed, the token is wrong, or `JOBS_API_TOKEN`
 *   is unset or blank. Routes answer that with 401 and no detail.
 * - The token is never logged, echoed or put in an error.
 * - It grants exactly the three ops routes (NudgeBee's status and retry, and the worker's
 *   `/run`); the guard accepts the `system` actor only for `SYSTEM_COMMANDS`.
 */

/** The actor every verified ops request runs as (architecture 3.3's transport table). */
export const OPS_SYSTEM_ACTOR: Readonly<SystemActor> = Object.freeze({ kind: "system", label: "NudgeBee" });

/** Exactly `Bearer <token>`: one space, no surrounding or extra whitespace (EX-05). The scheme is case-insensitive (RFC 9110). */
const BEARER = /^Bearer (\S+)$/i;

/** The bearer token from an `Authorization` header, or null. */
export function bearerToken(authorization_header: string | null | undefined): string | null {
  if (typeof authorization_header !== "string") return null;
  const match = BEARER.exec(authorization_header);
  return match ? match[1] : null;
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/** Constant-time equality of two secrets, through their SHA-256 digests. */
export function secretsMatch(presented: string, expected: string): boolean {
  return timingSafeEqual(digest(presented), digest(expected));
}

/** Builds a verifier over a source of the expected token (tests inject one). */
export function createSystemVerifier(expectedToken: () => string | null | undefined): SystemVerifier {
  return async (authorization_header) => {
    const expected = expectedToken()?.trim();
    const presented = bearerToken(authorization_header);
    if (!expected || !presented) return null;
    return secretsMatch(presented, expected) ? { ...OPS_SYSTEM_ACTOR } : null;
  };
}

/** The real verifier, reading `JOBS_API_TOKEN` on every call (a rotated env needs no restart in dev). */
export const verifySystemToken: SystemVerifier = createSystemVerifier(() => process.env.JOBS_API_TOKEN);
