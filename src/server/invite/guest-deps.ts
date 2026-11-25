import "server-only";

import type { WeddingId } from "@/contracts/domain";
import { FIXTURE_TARA_TOKEN, fixtureGuestActor } from "@/contracts/fixtures";
import type { GuestTokenResolver, RateLimiter } from "@/contracts/services";
import { SAMPLE_COPIES, seededId } from "@/db/ids";
import { services } from "@/server/services";
import { createGuestRoutes } from "./guest-routes";

/**
 * The one place the guest site's dependencies are bound. Until Lane A's guest token
 * resolver and single rate limiter merge (A5, the 14:45 batch), this binds a fixture
 * resolver (Tara's fixture link only) and a limiter that allows everything. Switching to
 * Lane A's exports changes this file only.
 */

/** Fixture resolver: Tara's fixture token resolves to H16 in the demo copy; nothing else does. */
const fixtureResolve: GuestTokenResolver = async (token) => (token === FIXTURE_TARA_TOKEN ? fixtureGuestActor("demo") : null);

/** Allow-all limiter until Lane A's limiter is bound. Lane D adds no counters of its own (D57). */
const allowAll: RateLimiter = async () => ({ allowed: true });

export const resolveGuest: GuestTokenResolver = fixtureResolve;

export const guestRoutes = createGuestRoutes({ services, resolve: resolveGuest, limit: allowAll });

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
