import "server-only";

import { verifySystemToken } from "@/server/authz/system";

/**
 * The ops routes' bearer check (EX-05): exactly `Bearer <token>`, one space, nothing after.
 * The scheme matches in any case (RFC 7235). The token itself is Lane A's verifier's call
 * (D58); this only refuses the header shapes EX-05 lists, extra whitespace among them.
 */
const STRICT_BEARER = /^bearer [^\s]+$/i;

export async function verifyOpsBearer(authorization: string | null): Promise<boolean> {
  if (authorization === null || !STRICT_BEARER.test(authorization)) return false;
  return (await verifySystemToken(authorization)) !== null;
}
