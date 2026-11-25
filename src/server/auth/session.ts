import "server-only";

import type { SessionActor, WeddingId } from "@/contracts/domain";
import { fixtureSessionActor } from "@/contracts/fixtures";

/**
 * The fixture member until Lane A's real body lands (decision D96): Mira, owner of the
 * demo copy (demo-data 1.2), taken from the shared fixtures so her ids match every
 * fixture read model. Every seeded account uses @example.com, so she counts as internal
 * (flagsmith.md 2.3). The email stays on the server: it is never sent to Flagsmith,
 * logged or returned.
 */
function fixtureMember(): SessionActor {
  return fixtureSessionActor("mira", "demo");
}

/**
 * The signed-in actor, or null when nobody is signed in. Final signature (D96).
 * Stub: always the fixture member. Lane A's body reads the Supabase session with
 * `getClaims()` and the user's membership.
 */
export async function getSession(): Promise<SessionActor | null> {
  return fixtureMember();
}

/**
 * The signed-in actor as a member of `wedding_id`. Final signature (D96). Lane A's body
 * sends a signed-out user to /login and answers a non-member with not-found.
 * Stub: the fixture member, re-pointed at the requested wedding so `wedding_id` always
 * matches the argument, as the real helper guarantees.
 */
export async function requireMember(wedding_id: WeddingId): Promise<SessionActor> {
  return { ...fixtureMember(), wedding_id };
}
