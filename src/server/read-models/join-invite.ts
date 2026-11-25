import "server-only";

import { and, eq } from "drizzle-orm";

import { MEMBER_ROLE_LABELS, type IsoDate, type MemberRole, type WeddingId } from "@/contracts/domain";
import type { DbOrTx } from "@/db/client";
import { memberInvites, members, weddings } from "@/db/schema";
import { normalizeEmail, type SignedInUser } from "@/server/auth/actor";
import { hashLinkToken, isWellFormedToken } from "@/server/authz/guest-token";
import { inviteState } from "@/server/commands/members";

/**
 * What the `/join/[token]` page shows a signed-in visitor before they accept (AT-8.1). It
 * mirrors `accept_member_invite`'s checks in the same order (the token, then the email, then
 * an existing membership) so the page and the command agree, but it never writes: the
 * command is the one place an invite is used. Expiry is evaluated at read time.
 *
 * - `invalid`: malformed, unknown, expired, revoked or used. One state, so the page shows one
 *   message and the link is no oracle.
 * - `email_mismatch`: signed in with another address. Nothing about the wedding is shown.
 * - `already_member`: the visitor is an active member of the invite's wedding already.
 * - `ready`: the wedding's names and date and the invited role, for the Accept button.
 */
export type JoinInvitePreview =
  | { status: "invalid" }
  | { status: "email_mismatch" }
  | { status: "already_member"; wedding_id: WeddingId }
  | {
      status: "ready";
      wedding_id: WeddingId;
      /** "Mira & Kabir". */
      wedding_name: string;
      wedding_date: IsoDate;
      role: MemberRole;
      /** "Event manager" or "Owner" (5.2's labels). */
      role_label: string;
    };

export async function loadJoinInvite(
  db: DbOrTx,
  token: string,
  user: SignedInUser,
  now: Date = new Date(),
): Promise<JoinInvitePreview> {
  if (!isWellFormedToken(token)) return { status: "invalid" };
  const [invite] = await db
    .select({
      wedding_id: memberInvites.wedding_id,
      email: memberInvites.email,
      role: memberInvites.role,
      expires_at: memberInvites.expires_at,
      accepted_at: memberInvites.accepted_at,
      revoked_at: memberInvites.revoked_at,
      bride_name: weddings.bride_name,
      groom_name: weddings.groom_name,
      wedding_date: weddings.wedding_date,
    })
    .from(memberInvites)
    .innerJoin(weddings, eq(weddings.id, memberInvites.wedding_id))
    .where(eq(memberInvites.token_hash, hashLinkToken(token).hash))
    .limit(1);
  if (!invite || inviteState(invite, now) !== "pending") return { status: "invalid" };
  if (!user.email || normalizeEmail(user.email) !== normalizeEmail(invite.email)) return { status: "email_mismatch" };

  const [existing] = await db
    .select({ removed_at: members.removed_at })
    .from(members)
    .where(and(eq(members.wedding_id, invite.wedding_id), eq(members.user_id, user.user_id)))
    .limit(1);
  if (existing && !existing.removed_at) return { status: "already_member", wedding_id: invite.wedding_id };

  return {
    status: "ready",
    wedding_id: invite.wedding_id,
    wedding_name: `${invite.bride_name} & ${invite.groom_name}`,
    wedding_date: invite.wedding_date,
    role: invite.role,
    role_label: MEMBER_ROLE_LABELS[invite.role].en,
  };
}
