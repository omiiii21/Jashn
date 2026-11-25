import "server-only";

import type { SessionActor, WeddingId } from "@/contracts/domain";
import { getSession, requireMember } from "@/server/auth/session";

/**
 * Who is speaking (voice.md 1.4 checks 1 and 2, 1.13 check 1). A signed-in session is
 * required (401). With a wedding, the user must be an owner or manager of it (403); a guest
 * link carries no session, so it never gets past check 1 (D35). A setup turn (no wedding)
 * needs only a session.
 */

export type SpeakerResult =
  | { ok: true; actor: SessionActor; session: SessionActor }
  | { ok: false; status: 401; code: "unauthenticated"; session: null }
  | { ok: false; status: 403; code: "forbidden"; session: SessionActor };

export type SessionReader = () => Promise<SessionActor | null>;
export type MemberReader = (wedding_id: WeddingId) => Promise<SessionActor>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The session alone (check 1). */
export async function readSession(read: SessionReader = getSession): Promise<SessionActor | null> {
  try {
    return await read();
  } catch {
    return null;
  }
}

/**
 * The speaker for a wedding, or for setup when `wedding_id` is null. Lane A's real
 * `requireMember` may redirect or answer not-found by throwing; any throw is 403 here.
 */
export async function membershipFor(
  session: SessionActor,
  wedding_id: WeddingId | null,
  member: MemberReader = requireMember,
): Promise<SpeakerResult> {
  if (wedding_id === null) {
    // Setup: no membership yet. The role trait falls back to owner (flagsmith 2.3).
    return { ok: true, session, actor: { ...session, wedding_id: null, member_id: null, role: null } };
  }
  if (!UUID_PATTERN.test(wedding_id)) return { ok: false, status: 403, code: "forbidden", session };
  try {
    const actor = await member(wedding_id);
    if (!actor || actor.user_id !== session.user_id || actor.wedding_id !== wedding_id) {
      return { ok: false, status: 403, code: "forbidden", session };
    }
    if (actor.role !== "owner" && actor.role !== "manager") return { ok: false, status: 403, code: "forbidden", session };
    return { ok: true, session, actor };
  } catch {
    return { ok: false, status: 403, code: "forbidden", session };
  }
}

/** Checks 1 and 2 together. */
export async function resolveSpeaker(
  wedding_id: WeddingId | null,
  readers: { session?: SessionReader; member?: MemberReader } = {},
): Promise<SpeakerResult> {
  const session = await readSession(readers.session);
  if (!session) return { ok: false, status: 401, code: "unauthenticated", session: null };
  return membershipFor(session, wedding_id, readers.member);
}
