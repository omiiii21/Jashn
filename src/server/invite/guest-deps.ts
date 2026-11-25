import "server-only";

import type { WeddingId } from "@/contracts/domain";
import type { GuestTokenResolver } from "@/contracts/services";
import { SAMPLE_COPIES, seededId } from "@/db/ids";
import { resolveGuestToken } from "@/server/authz/guest-token";
import { clientIpFrom, limitGuestRequest, type RateLimitDecision } from "@/server/authz/rate-limit";
import { services } from "@/server/services";

import { createGuestRoutes, guestTokenHash } from "./guest-routes";

/**
 * The one place the guest site's dependencies are bound: Lane A's token resolver (live with
 * a database, Tara's fixture link without) and its single rate limiter (D57). Lane D adds
 * no counters of its own.
 */

export const resolveGuest: GuestTokenResolver = resolveGuestToken;

export const guestRoutes = createGuestRoutes({ services, resolve: resolveGuest, limit: limitGuestRequest });

/** The guest page's one limiter call per request (domain 6.3: `/i/` counts toward the limits). */
export function limitGuestPage(token: string, headers: Headers): Promise<RateLimitDecision> {
  return limitGuestRequest({ token_hash: guestTokenHash(token), ip: clientIpFrom(headers), kind: "get" });
}

const SAMPLE_WEDDING_IDS: ReadonlySet<string> = new Set(SAMPLE_COPIES.map((copy) => seededId(copy, "weddings", "WEDDING")));

/**
 * Whether the wedding behind a guest link is a sample copy, for the "Fictional demo data"
 * badge and the photo's "AI-generated, fictional" label. The guest view has no `is_sample`
 * yet, so this reads the seeded ids: every sample copy's wedding id is derived from its
 * seed key. An unresolved actor counts as a sample, so the badge errs on the side of showing.
 */
export function isSampleWedding(wedding_id: WeddingId | null): boolean {
  return wedding_id === null || SAMPLE_WEDDING_IDS.has(wedding_id);
}
