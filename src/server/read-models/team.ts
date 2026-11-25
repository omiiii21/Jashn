import "server-only";

import { and, asc, eq, gt, isNull, sql } from "drizzle-orm";

import { CommandFailure } from "@/contracts/commands";
import type { SessionActor, WeddingId } from "@/contracts/domain";
import type { DbOrTx } from "@/db/client";
import { isUuidShaped } from "@/db/ids";
import { toIstInstant } from "@/db/ist";
import { memberInvites, members, weddings } from "@/db/schema";

/**
 * `team` (domain 4.11; decisions D99, D109): who is in the wedding, who is invited and what
 * managers can see, for Lane B's owners-only "Team and sharing" sheet.
 *
 * PROVISIONAL TYPES. The contract for `team` lands in `lane-lead-contracts-2`, which hasn't
 * merged; until it does, the types below are the shape Lane A returns, written from 4.11:
 * `members` (each `member_id`, `display_name`, `role`), `pending_invites` (each
 * `member_invite_id`, `email`, `role`, `display_name`, `expires_at`) and the three
 * `managers_can_see_*` flags, plus the conventions every member read model follows
 * (`version`, `hidden`, `seed_key` on every row). When the contract lands, these names should
 * become re-exports of it.
 *
 * Who reads it: owners only (4.11). A manager gets 403 `forbidden`, as a non-member does, so
 * pending invites' emails and the member list never reach a manager. The role is read from
 * the caller's own active `members` row, not trusted from the actor.
 *
 * It never writes. Expiry is evaluated at read time: an invite past `expires_at` (or
 * accepted, or revoked) is simply not pending, and nothing is stamped.
 */

// The `team` contract (lane-lead-contracts-2, #38) carries these exact shapes.
import type { TeamMember, TeamPendingInvite, TeamView } from "@/contracts/read-models";
export type { TeamMember, TeamPendingInvite, TeamView };

function safeInteger(name: string, value: unknown): number {
  const number = typeof value === "string" ? Number(value) : value;
  if (typeof number !== "number" || !Number.isSafeInteger(number)) throw new Error(`team: ${name} is not a safe integer`);
  return number;
}

const NOT_A_MEMBER = "You are not a member of this wedding.";

/**
 * The `team` read model for `wedding_id`, as `actor` may see it. Throws `CommandFailure`:
 * 404 `not_found` for an unknown wedding, 403 `forbidden` for a non-member, a removed member
 * or a manager.
 */
export async function buildTeam(
  db: DbOrTx,
  actor: SessionActor,
  wedding_id: WeddingId,
  options: { now?: Date } = {},
): Promise<TeamView> {
  const now = options.now ?? new Date();
  if (!isUuidShaped(wedding_id)) throw new CommandFailure({ code: "not_found", message: "Wedding not found.", field: null });

  const [wedding] = await db
    .select({
      version: weddings.version,
      managers_can_see_vendor_dues: weddings.managers_can_see_vendor_dues,
      managers_can_see_budget: weddings.managers_can_see_budget,
      managers_can_see_guest_contacts: weddings.managers_can_see_guest_contacts,
    })
    .from(weddings)
    .where(eq(weddings.id, wedding_id))
    .limit(1);
  if (!wedding) throw new CommandFailure({ code: "not_found", message: "Wedding not found.", field: null });

  const [reader] = await db
    .select({ member_id: members.id, role: members.role })
    .from(members)
    .where(and(eq(members.wedding_id, wedding_id), eq(members.user_id, actor.user_id), isNull(members.removed_at)))
    .limit(1);
  if (!reader) throw new CommandFailure({ code: "forbidden", message: NOT_A_MEMBER, field: null });
  if (reader.role !== "owner") throw new CommandFailure({ code: "forbidden", message: "Not allowed for your role.", field: null });

  const [memberRows, inviteRows] = await Promise.all([
    db
      .select({
        member_id: members.id,
        seed_key: members.seed_key,
        display_name: members.display_name,
        role: members.role,
        created_at: members.created_at,
      })
      .from(members)
      .where(and(eq(members.wedding_id, wedding_id), isNull(members.removed_at)))
      .orderBy(sql`case when ${members.role} = 'owner' then 0 else 1 end`, asc(members.created_at), asc(members.id)),
    db
      .select({
        member_invite_id: memberInvites.id,
        seed_key: memberInvites.seed_key,
        email: memberInvites.email,
        role: memberInvites.role,
        display_name: memberInvites.display_name,
        created_at: memberInvites.created_at,
        expires_at: memberInvites.expires_at,
      })
      .from(memberInvites)
      .where(
        and(
          eq(memberInvites.wedding_id, wedding_id),
          isNull(memberInvites.accepted_at),
          isNull(memberInvites.revoked_at),
          gt(memberInvites.expires_at, now),
        ),
      )
      .orderBy(asc(memberInvites.created_at), asc(memberInvites.id)),
  ]);

  return {
    version: safeInteger("version", wedding.version),
    hidden: [],
    wedding_id,
    members: memberRows.map((row) => ({
      member_id: row.member_id,
      seed_key: row.seed_key,
      display_name: row.display_name,
      role: row.role,
      joined_at: toIstInstant(row.created_at),
      is_you: row.member_id === reader.member_id,
    })),
    pending_invites: inviteRows.map((row) => ({
      member_invite_id: row.member_invite_id,
      seed_key: row.seed_key,
      email: row.email,
      role: row.role,
      display_name: row.display_name,
      invited_at: toIstInstant(row.created_at),
      expires_at: toIstInstant(row.expires_at),
    })),
    sharing: {
      managers_can_see_vendor_dues: wedding.managers_can_see_vendor_dues,
      managers_can_see_budget: wedding.managers_can_see_budget,
      managers_can_see_guest_contacts: wedding.managers_can_see_guest_contacts,
    },
  };
}
