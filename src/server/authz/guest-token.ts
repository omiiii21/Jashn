import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { and, asc, eq, isNull } from "drizzle-orm";

import type { CommandErrorBody } from "@/contracts/commands";
import type { GuestActor } from "@/contracts/domain";
import { FIXTURE_TARA_TOKEN, fixtureGuestActor } from "@/contracts/fixtures";
import type { GuestTokenResolver } from "@/contracts/services";
import { getDb, isDatabaseConfigured, type DbOrTx } from "@/db/client";
import { guests, households, invitationLinks } from "@/db/schema";

/**
 * Guest-link tokens and the guest check (architecture 3.4, domain 6.3; decisions D35, D57).
 *
 * - A token is 32 random bytes in base64url without padding: 43 characters, no ids, names
 *   or counters. Only its SHA-256 is stored (`invitation_links.token_hash`, unique), plus a
 *   4-character `token_hint` for the UI.
 * - The digest is SHA-256 over the token's text (its 43 ASCII characters), not over the
 *   decoded bytes. The seed and `create_invitation_links` must hash the same way.
 * - Resolution: format, SHA-256, lookup, not revoked, then the actor (wedding, household,
 *   its guests). Every failure answers null, so callers send the one 404 body below for
 *   malformed, unknown and revoked tokens alike (G5). A guest is never answered 403 (D35).
 * - The raw token is never logged, stored, put in activity or in an error message.
 */

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

/** Random bytes per token (256 bits; domain 6.3's minimum is 128). */
export const LINK_TOKEN_BYTES = 32;
/** The base64url length of 32 bytes without padding. */
export const LINK_TOKEN_LENGTH = 43;
/** Characters of the token kept for the UI (`invitation_links.token_hint`). */
export const LINK_TOKEN_HINT_LENGTH = 4;

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** A new link token (also the member-invite join token's format). */
export function generateLinkToken(): string {
  return randomBytes(LINK_TOKEN_BYTES).toString("base64url");
}

/** True for exactly 43 base64url characters. */
export function isWellFormedToken(token: unknown): token is string {
  return typeof token === "string" && TOKEN_PATTERN.test(token);
}

/** The stored digest (`token_hash`, bytea) and its hex form (`GuestActor.token_hash`, the limiter key). */
export function hashLinkToken(token: string): { hash: Buffer; hex: string } {
  const hash = createHash("sha256").update(token, "utf8").digest();
  return { hash, hex: hash.toString("hex") };
}

/** The last four characters, stored as `token_hint` (domain 5.1). */
export function linkTokenHint(token: string): string {
  return token.slice(-LINK_TOKEN_HINT_LENGTH);
}

// ---------------------------------------------------------------------------
// The one 404 (G5)
// ---------------------------------------------------------------------------

/**
 * The body every guest failure shares: malformed, unknown or revoked token, an
 * out-of-scope function or guest, on the page, the revision poll, RSVP and dietary.
 * It matches the guard's `requireGuestForApi` body.
 */
export const GUEST_NOT_FOUND_BODY: Readonly<CommandErrorBody> = Object.freeze({ code: "not_found", message: "Not found.", field: null });

/** The guest routes' headers (G6): no referrer, no indexing, no caching. */
export const GUEST_RESPONSE_HEADERS = {
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex",
  "Cache-Control": "private, no-store",
} as const;

/** The 404 JSON response for any guest failure, with the guest headers. */
export function guestNotFoundResponse(): Response {
  return Response.json({ ok: false, error: { ...GUEST_NOT_FOUND_BODY } }, { status: 404, headers: GUEST_RESPONSE_HEADERS });
}

// ---------------------------------------------------------------------------
// Lookup and resolution
// ---------------------------------------------------------------------------

/** What the lookup finds for an active link: everything the actor needs but the hash. */
export type GuestLinkRecord = Omit<GuestActor, "kind" | "token_hash">;

export type GuestLinkLookup = (token_hash: Buffer) => Promise<GuestLinkRecord | null>;

/**
 * The active link with this digest, its household and the household's non-deleted guests,
 * all in the link's wedding. Null when there is no such link or it was revoked.
 */
export async function findActiveGuestLink(db: DbOrTx, token_hash: Buffer): Promise<GuestLinkRecord | null> {
  const links = await db
    .select({
      wedding_id: invitationLinks.wedding_id,
      household_id: households.id,
      household_name: households.name,
    })
    .from(invitationLinks)
    .innerJoin(households, and(eq(households.id, invitationLinks.household_id), eq(households.wedding_id, invitationLinks.wedding_id)))
    .where(and(eq(invitationLinks.token_hash, token_hash), isNull(invitationLinks.revoked_at)))
    .limit(1);
  const link = links[0];
  if (!link) return null;

  const members = await db
    .select({ guest_id: guests.id })
    .from(guests)
    .where(and(eq(guests.household_id, link.household_id), eq(guests.wedding_id, link.wedding_id), isNull(guests.deleted_at)))
    .orderBy(asc(guests.created_at), asc(guests.id));

  return {
    wedding_id: link.wedding_id,
    household_id: link.household_id,
    household_name: link.household_name,
    guest_ids: members.map((row) => row.guest_id),
  };
}

/** Builds a resolver over a lookup (tests inject one). */
export function createGuestTokenResolver(lookup: GuestLinkLookup): GuestTokenResolver {
  return async (token) => {
    if (!isWellFormedToken(token)) return null;
    const { hash, hex } = hashLinkToken(token);
    const record = await lookup(hash);
    if (!record) return null;
    return {
      kind: "guest",
      wedding_id: record.wedding_id,
      household_id: record.household_id,
      household_name: record.household_name,
      guest_ids: [...record.guest_ids],
      token_hash: hex,
    };
  };
}

/** Fixture mode (no `DATABASE_URL`): only Tara's fixture token resolves, to the fixture household. */
async function fixtureResolve(token: string): Promise<GuestActor | null> {
  if (!isWellFormedToken(token) || token !== FIXTURE_TARA_TOKEN) return null;
  return fixtureGuestActor("demo");
}

const liveResolve = createGuestTokenResolver((hash) => findActiveGuestLink(getDb(), hash));

/**
 * The guest check (architecture 3.4): the actor for a raw token, or null for every failure.
 * A database error throws (a 500), so an outage never reads as a revoked link.
 */
export const resolveGuestToken: GuestTokenResolver = async (token) => (isDatabaseConfigured() ? liveResolve(token) : fixtureResolve(token));
