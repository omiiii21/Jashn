import "server-only";

import { and, asc, eq, isNull } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";

import type { SessionActor, WeddingId } from "@/contracts/domain";
import { fixtureSessionActor } from "@/contracts/fixtures";
import { routes } from "@/contracts/routes";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { isUuidShaped } from "@/db/ids";
import { members, weddings } from "@/db/schema";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { memberActorFrom, normalizeEmail, userActorFrom, type ActiveMembership, type SignedInUser } from "./actor";

export type { SignedInUser } from "./actor";

/**
 * The one session helper (architecture 3.5, decision D96). It reads the Supabase session
 * with `getClaims()` (never `getSession()` on the server) and maps the `sub` claim to an
 * active `members` row (domain 6.2). The email stays on the server: it is never sent to
 * Flagsmith, logged or returned (flagsmith.md 10.1 item 5).
 *
 * Fixture mode: until Supabase Auth and the database are both configured, every helper
 * returns the fixture member (Mira, owner of the demo copy), re-pointed at the requested
 * wedding, so the other lanes keep working on the fixture services.
 */

// ---------------------------------------------------------------------------
// The fixture switch (the one place that decides)
// ---------------------------------------------------------------------------

/** True when real sign-in runs: Supabase Auth and the database are both configured. */
export function isLiveAuth(): boolean {
  return isSupabaseAuthConfigured() && isDatabaseConfigured();
}

/** The fixture member until the keys land: Mira, owner of the demo copy (demo-data 1.2). */
function fixtureMember(): SessionActor {
  return fixtureSessionActor("mira", "demo");
}

// ---------------------------------------------------------------------------
// Building blocks the guard imports
// ---------------------------------------------------------------------------

/** The signed-in user from `getClaims()` (`sub` and `email`), or null when signed out. */
export async function getSignedInUser(): Promise<SignedInUser | null> {
  if (!isLiveAuth()) {
    const fixture = fixtureMember();
    return { user_id: fixture.user_id, email: fixture.email };
  }
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getClaims();
    if (error || !data) return null;
    const sub = data.claims.sub;
    if (typeof sub !== "string" || !isUuidShaped(sub)) return null;
    // Anonymous sign-ins are never used; treat one as signed out.
    if (data.claims.is_anonymous === true) return null;
    const email = typeof data.claims.email === "string" ? normalizeEmail(data.claims.email) : "";
    return { user_id: sub, email };
  } catch {
    // A Supabase outage or a malformed cookie reads as signed out, never as a crash.
    return null;
  }
}

/** Every active membership of a user (no `removed_at`), oldest first. */
async function loadActiveMemberships(user_id: string): Promise<ActiveMembership[]> {
  const db = getDb();
  return db
    .select({
      member_id: members.id,
      wedding_id: members.wedding_id,
      role: members.role,
      display_name: members.display_name,
      preferred_language: members.preferred_language,
    })
    .from(members)
    .innerJoin(weddings, eq(weddings.id, members.wedding_id))
    .where(and(eq(members.user_id, user_id), isNull(members.removed_at)))
    .orderBy(asc(members.created_at), asc(members.id));
}

/**
 * The user's actor as a member of `wedding_id`: their `members` row of that wedding with no
 * `removed_at`, joined to the wedding. Null when they aren't an active member (or the id
 * isn't a UUID). This is the guard's one membership check (domain 6.2).
 */
export async function loadMemberActor(user: SignedInUser, wedding_id: string): Promise<SessionActor | null> {
  if (!isLiveAuth()) return { ...fixtureMember(), wedding_id };
  if (!isUuidShaped(wedding_id)) return null;
  const memberships = await loadActiveMemberships(user.user_id);
  const membership = memberships.find((row) => row.wedding_id === wedding_id);
  if (!membership) return null;
  return memberActorFrom(user, membership, memberships);
}

/**
 * The actor for a signed-in user with no wedding context (such as /setup, or the first
 * `set_wedding_profile`): wedding, member and role are null.
 */
export async function buildUserActor(user: SignedInUser): Promise<SessionActor> {
  if (!isLiveAuth()) return { ...fixtureMember(), wedding_id: null, member_id: null, role: null };
  const memberships = await loadActiveMemberships(user.user_id);
  return userActorFrom(user, memberships);
}

// ---------------------------------------------------------------------------
// The final signatures (D96)
// ---------------------------------------------------------------------------

/**
 * The signed-in actor, or null when nobody is signed in. A member gets the actor of their
 * oldest active membership; a user with no wedding gets the no-wedding actor.
 */
export async function getSession(): Promise<SessionActor | null> {
  if (!isLiveAuth()) return fixtureMember();
  const user = await getSignedInUser();
  if (!user) return null;
  const memberships = await loadActiveMemberships(user.user_id);
  const first = memberships[0];
  return first ? memberActorFrom(user, first, memberships) : userActorFrom(user, memberships);
}

/**
 * The signed-in actor as a member of `wedding_id`. A signed-out user goes to /login; a user
 * who isn't an active member gets not-found (a removed member too, from their next request).
 * The returned `wedding_id` always equals the argument.
 */
export async function requireMember(wedding_id: WeddingId): Promise<SessionActor> {
  if (!isLiveAuth()) return { ...fixtureMember(), wedding_id };
  const user = await getSignedInUser();
  if (!user) redirect(routes.login());
  const actor = await loadMemberActor(user, wedding_id);
  if (!actor) notFound();
  return actor;
}
