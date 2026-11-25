import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

/**
 * TEMPORARY bearer check for the ops routes (decisions D58 and D102). It lives in Lane D's
 * path only until Lane A's `SystemVerifier` for JOBS_API_TOKEN lands (src/contracts/services.ts);
 * then `/run`, the GET and the retry switch to it and this file is deleted.
 *
 * Same rules as the verifier: `Authorization: Bearer <token>` exactly (one space, no extra
 * whitespace), compared in constant time by hashing both values and comparing the digests.
 * An unset JOBS_API_TOKEN refuses every call and logs one line. The token is never logged.
 */

const BEARER = /^Bearer ([\x21-\x7E]+)$/;

let warnedUnset = false;

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/** Pure check, for tests: does this Authorization header carry exactly `expected`? */
export function bearerMatches(authorization_header: string | null | undefined, expected: string | null | undefined): boolean {
  if (!expected) return false;
  if (typeof authorization_header !== "string") return false;
  const match = BEARER.exec(authorization_header);
  const given = match?.[1] ?? "";
  // Hash both so the comparison is constant time whatever the lengths.
  const equal = timingSafeEqual(digest(given), digest(expected));
  return match !== null && equal;
}

/** The temporary verifier: true when the request carries JOBS_API_TOKEN. */
export async function verifyOpsBearer(
  authorization_header: string | null,
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<boolean> {
  const expected = env.JOBS_API_TOKEN;
  if (!expected) {
    if (!warnedUnset) {
      warnedUnset = true;
      console.error("[ops] JOBS_API_TOKEN is not set; every ops call answers 401");
    }
    return false;
  }
  return bearerMatches(authorization_header, expected);
}
