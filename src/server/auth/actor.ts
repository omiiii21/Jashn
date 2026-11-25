import "server-only";

import type { AppLanguage, MemberId, MemberRole, SessionActor, UserId, WeddingId } from "@/contracts/domain";
import { INTERNAL_EMAIL_DOMAIN } from "@/contracts/flags";

/**
 * Pure builders for the session actor (domain 1, flagsmith.md 2.3), shared by the session
 * helper and its tests. The email stays on the server: it is never sent to Flagsmith, logged
 * or returned to the browser.
 */

/** The signed-in user, from the `sub` and `email` claims of `getClaims()`. */
export type SignedInUser = { user_id: UserId; email: string };

/** One active membership (a `members` row with no `removed_at`), oldest first. */
export type ActiveMembership = {
  member_id: MemberId;
  wedding_id: WeddingId;
  role: MemberRole;
  display_name: string;
  preferred_language: AppLanguage;
};

/** Emails compare in lowercase, trimmed. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * The `is_internal` trait (flagsmith.md 2.3): the email ends in `@example.com` (every seeded
 * and rehearsal account) or is listed in the comma-separated `INTERNAL_USER_EMAILS`. Ignores case.
 */
export function isInternalEmail(email: string, internalList: string | undefined = process.env.INTERNAL_USER_EMAILS): boolean {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  if (normalized.endsWith(INTERNAL_EMAIL_DOMAIN)) return true;
  if (!internalList) return false;
  return internalList
    .split(",")
    .map((entry) => normalizeEmail(entry))
    .some((entry) => entry.length > 0 && entry === normalized);
}

/** "mira.a@example.com" → "mira.a": the display name of a user with no membership yet. */
export function emailLocalPart(email: string): string {
  const trimmed = email.trim();
  const at = trimmed.indexOf("@");
  const local = at === -1 ? trimmed : trimmed.slice(0, at);
  return local || trimmed || "You";
}

/** The `is_first_wedding` trait: the user is an active owner of no wedding (flagsmith.md 2.3). */
export function isFirstWedding(memberships: readonly ActiveMembership[]): boolean {
  return !memberships.some((membership) => membership.role === "owner");
}

/** The actor as a member of one wedding. `membership` is one of `memberships`. */
export function memberActorFrom(
  user: SignedInUser,
  membership: ActiveMembership,
  memberships: readonly ActiveMembership[],
  internalList?: string,
): SessionActor {
  return {
    kind: "member",
    user_id: user.user_id,
    email: user.email,
    display_name: membership.display_name,
    wedding_id: membership.wedding_id,
    member_id: membership.member_id,
    role: membership.role,
    is_internal: isInternalEmail(user.email, internalList),
    is_first_wedding: isFirstWedding(memberships),
    preferred_language: membership.preferred_language,
  };
}

/**
 * The actor for a signed-in user with no wedding context (such as /setup): no wedding,
 * member or role. The display name and language come from the oldest membership, else the
 * email's local part and English.
 */
export function userActorFrom(user: SignedInUser, memberships: readonly ActiveMembership[], internalList?: string): SessionActor {
  const first = memberships[0];
  return {
    kind: "member",
    user_id: user.user_id,
    email: user.email,
    display_name: first?.display_name ?? emailLocalPart(user.email),
    wedding_id: null,
    member_id: null,
    role: null,
    is_internal: isInternalEmail(user.email, internalList),
    is_first_wedding: isFirstWedding(memberships),
    preferred_language: first?.preferred_language ?? "en",
  };
}
