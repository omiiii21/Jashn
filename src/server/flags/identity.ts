import "server-only";

import { createHmac } from "node:crypto";

import { INTERNAL_EMAIL_DOMAIN, traitsFor, USER_IDENTITY_PREFIX, type UserTraits } from "@/contracts/flags";
import type { AppLanguage, SessionActor } from "@/contracts/domain";

import type { SdkTraits } from "./client";
import { flagsmithIdSalt, internalUserEmails } from "./env";

/**
 * Identity keys and traits (flagsmith 2.2, 2.3). Never sends emails, names or ids as traits.
 */

/** `u_` + the first 32 hex of HMAC-SHA256(salt, user_id). */
export function identityKeyFor(user_id: string, salt: string): string {
  const digest = createHmac("sha256", salt).update(user_id).digest("hex");
  return `${USER_IDENTITY_PREFIX}${digest.slice(0, 32)}`;
}

/** The user's identity key, or null when FLAGSMITH_ID_SALT is missing (identify nobody). */
export function userIdentity(user_id: string): string | null {
  const salt = flagsmithIdSalt();
  if (!salt || !user_id) return null;
  return identityKeyFor(user_id, salt);
}

/**
 * Internal account (2.3): the session already says so, or the email is listed in
 * INTERNAL_USER_EMAILS, or it ends in @example.com. Case is ignored.
 */
export function isInternalUser(actor: Pick<SessionActor, "email" | "is_internal">): boolean {
  if (actor.is_internal) return true;
  const email = (actor.email ?? "").trim().toLowerCase();
  if (email === "") return false;
  if (email.endsWith(INTERNAL_EMAIL_DOMAIN)) return true;
  return internalUserEmails().has(email);
}

/**
 * The traits for this evaluation. On /setup (wedding_id null) the role is `owner` and the
 * language is the UI language the page renders in.
 */
export function userTraitsFor(
  actor: SessionActor,
  opts: { setup: boolean; ui_language?: AppLanguage },
): UserTraits {
  const base = traitsFor({ ...actor, is_internal: isInternalUser(actor) });
  if (opts.setup) {
    return { ...base, role: "owner", preferred_language: opts.ui_language ?? actor.preferred_language };
  }
  return base;
}

/** The SDK trait map: `preferred_language` persisted; `role`, `is_internal`, `is_first_wedding` transient. */
export function sdkTraits(traits: UserTraits): SdkTraits {
  return {
    preferred_language: traits.preferred_language,
    role: { value: traits.role, transient: true },
    is_internal: { value: traits.is_internal, transient: true },
    is_first_wedding: { value: traits.is_first_wedding, transient: true },
  };
}
