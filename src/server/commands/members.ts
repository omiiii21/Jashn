import "server-only";

import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";

import { CommandFailure, type CommandErrorBody, type CommandName } from "@/contracts/commands";
import {
  SHARING_FLAGS,
  type MemberInviteId,
  type MemberRole,
  type SessionActor,
  type SharingFlag,
  type SharingSettings,
  type WeddingId,
} from "@/contracts/domain";
import { routes } from "@/contracts/routes";
import type {
  ActivityEntryDraft,
  CommandHandler,
  CommandHandlerContext,
  CommandHandlerResult,
  HandlerMap,
} from "@/contracts/services";
import type { Tx } from "@/db/client";
import { memberInvites, members, weddings } from "@/db/schema";
import { normalizeEmail } from "@/server/auth/actor";
import { generateLinkToken, hashLinkToken, isWellFormedToken } from "@/server/authz/guest-token";

/**
 * Sharing and members (domain 3.1, 6.1–6.2; decisions D64, D99, D109): `set_sharing`,
 * `invite_member`, `accept_member_invite`, `revoke_member_invite` and `remove_member`.
 *
 * The dispatcher has already resolved the actor, applied the role matrix (all owner-only
 * except `accept_member_invite`, which any signed-in user may send), parsed the input,
 * checked the receipt and, for a command with a wedding in its envelope, locked the
 * `weddings` row FOR UPDATE. `accept_member_invite` has no wedding in its envelope (the user
 * isn't a member yet), so its handler finds the invite by its token's digest and then takes
 * the same lock order itself: the invite's `weddings` row first, then the invite row.
 *
 * Every applied command returns one finished `owners` entry (L5: sharing and members are
 * owner-only), and the dispatcher writes it with the one `version` bump. A no-op
 * `set_sharing` is `unchanged`; every failure throws `CommandFailure` and writes nothing.
 *
 * Join tokens follow the guest-link format (6.3): 32 random bytes in base64url, 43
 * characters, stored only as their SHA-256. The raw token leaves the server once, inside
 * `invite_member`'s `join_url`; the receipt drops `join_url` and a replay says
 * `token_already_issued` (receipts.ts). Tokens never enter activity, logs or errors.
 */

// ---------------------------------------------------------------------------
// Constants and small pure helpers (unit-tested in members.test.ts)
// ---------------------------------------------------------------------------

/** Invites expire 48 hours after they are made (3.1). */
export const INVITE_TTL_MS = 48 * 60 * 60 * 1000;

/** The role in a sentence: "Mira invited x@example.com as manager." (AT-8.1). */
const ROLE_WORDS: Record<MemberRole, { en: string; hi: string }> = {
  owner: { en: "owner", hi: "मालिक" },
  manager: { en: "manager", hi: "इवेंट मैनेजर" },
};

export function roleWord(role: MemberRole, language: "en" | "hi"): string {
  return ROLE_WORDS[role][language];
}

/** What each sharing flag opens to managers (G7), as `{changes}` names it. */
export const SHARING_LABELS: Record<SharingFlag, { en: string; hi: string }> = {
  managers_can_see_vendor_dues: { en: "vendors and dues", hi: "वेंडर और बकाया" },
  managers_can_see_budget: { en: "budget", hi: "बजट" },
  managers_can_see_guest_contacts: { en: "guest contacts", hi: "मेहमानों के संपर्क" },
};

export type SharingChange = { flag: SharingFlag; from: boolean; to: boolean };

/** The given flags whose value differs from the stored one, in `SHARING_FLAGS` order. */
export function diffSharing(current: SharingSettings, input: Partial<SharingSettings>): SharingChange[] {
  const changes: SharingChange[] = [];
  for (const flag of SHARING_FLAGS) {
    const next = input[flag];
    if (next === undefined || next === current[flag]) continue;
    changes.push({ flag, from: current[flag], to: next });
  }
  return changes;
}

/** `{changes}`: "vendors and dues off, budget on" / "वेंडर और बकाया बंद, बजट चालू". */
export function describeSharingChanges(changes: readonly SharingChange[], language: "en" | "hi"): string {
  return changes
    .map((change) => {
      const label = SHARING_LABELS[change.flag][language];
      if (language === "en") return `${label} ${change.to ? "on" : "off"}`;
      return `${label} ${change.to ? "चालू" : "बंद"}`;
    })
    .join(", ");
}

export type InviteState = "pending" | "accepted" | "revoked" | "expired";

/** An invite's state at `now`: accepted and revoked win over expiry. */
export function inviteState(
  invite: { accepted_at: Date | null; revoked_at: Date | null; expires_at: Date },
  now: Date,
): InviteState {
  if (invite.accepted_at) return "accepted";
  if (invite.revoked_at) return "revoked";
  if (invite.expires_at.getTime() <= now.getTime()) return "expired";
  return "pending";
}

/**
 * The origin for absolute links (architecture 2.3, 5): `APP_BASE_URL` (local, or the tunnel),
 * else `https://` plus `VERCEL_PROJECT_PRODUCTION_URL`, else none (a site-relative link).
 * Never `VERCEL_URL`, which Standard Protection covers.
 */
export function appBaseUrl(env: Record<string, string | undefined> = process.env): string {
  const local = env.APP_BASE_URL?.trim();
  if (local) return local.replace(/\/+$/, "");
  const production = env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (production) return `https://${production.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;
  return "";
}

/** `{APP_BASE_URL}/join/{token}`: shown to the owner once (3.1). */
export function joinUrlFor(token: string, env: Record<string, string | undefined> = process.env): string {
  return `${appBaseUrl(env)}${routes.join(token)}`;
}

/** The member's `display_name` on joining: the invite's name, else their earlier one, else the actor's. */
export function joinedDisplayName(invite_name: string | null, earlier_name: string | null, actor_name: string): string {
  const name = invite_name?.trim() || earlier_name?.trim() || actor_name.trim() || "Member";
  return name.slice(0, 60);
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * The one `invite_invalid` body `accept_member_invite` sends for an unknown, malformed,
 * expired, revoked or already used token, so the join link is no oracle (3.1, G5's spirit).
 */
export const INVITE_INVALID_BODY: CommandErrorBody = {
  code: "invite_invalid",
  message: "This invite link isn't valid any more.",
  field: null,
};

export const EMAIL_MISMATCH_MESSAGE = "This invite was sent to a different email address.";

function inviteInvalid(): CommandFailure {
  return new CommandFailure({ ...INVITE_INVALID_BODY });
}

function notFound(field: string, message: string): CommandFailure {
  return new CommandFailure({ code: "not_found", message, field });
}

function forbidden(message = "Not allowed for your role.", field: string | null = null): CommandFailure {
  return new CommandFailure({ code: "forbidden", message, field });
}

function alreadyMember(message: string, current: { wedding_id: WeddingId } | null = null, field: string | null = null): CommandFailure {
  return new CommandFailure({ code: "already_member", message, field, ...(current ? { current } : {}) });
}

// ---------------------------------------------------------------------------
// The activity text (domain 3.1 templates; every entry is `owners`, L5)
// ---------------------------------------------------------------------------

export function sharingActivity(args: { actor_label: string; wedding_id: WeddingId; changes: readonly SharingChange[] }): ActivityEntryDraft {
  const { actor_label, wedding_id, changes } = args;
  const before: Record<string, boolean> = {};
  const after: Record<string, boolean> = {};
  for (const change of changes) {
    before[change.flag] = change.from;
    after[change.flag] = change.to;
  }
  return {
    topic: "sharing.updated",
    entity_type: "wedding",
    entity_id: wedding_id,
    summary_en: `${actor_label} changed what managers can see: ${describeSharingChanges(changes, "en")}.`,
    summary_hi: `${actor_label} ने बदला कि मैनेजर क्या देख सकते हैं: ${describeSharingChanges(changes, "hi")}।`,
    before,
    after,
    visibility: "owners",
  };
}

export function invitedActivity(args: {
  actor_label: string;
  member_invite_id: MemberInviteId;
  email: string;
  role: MemberRole;
  display_name: string | null;
  expires_at: string;
}): ActivityEntryDraft {
  const { actor_label, member_invite_id, email, role, display_name, expires_at } = args;
  return {
    topic: "member.invited",
    entity_type: "member_invite",
    entity_id: member_invite_id,
    summary_en: `${actor_label} invited ${email} as ${roleWord(role, "en")}.`,
    summary_hi: `${actor_label} ने ${email} को ${roleWord(role, "hi")} के रूप में बुलाया।`,
    before: null,
    after: { email, role, display_name, expires_at },
    visibility: "owners",
  };
}

export function joinedActivity(args: {
  member_id: string;
  member_invite_id: MemberInviteId;
  email: string;
  role: MemberRole;
  display_name: string;
}): ActivityEntryDraft {
  const { member_id, member_invite_id, email, role, display_name } = args;
  return {
    topic: "member.joined",
    entity_type: "member",
    entity_id: member_id,
    // Owners only, so an unexpected join is visible to the owners (3.1).
    summary_en: `${email} accepted the invite as ${roleWord(role, "en")}.`,
    summary_hi: `${email} ने ${roleWord(role, "hi")} के रूप में न्योता स्वीकार किया।`,
    before: null,
    after: { email, role, display_name, member_invite_id },
    visibility: "owners",
    actor_label: display_name,
  };
}

export function inviteRevokedActivity(args: {
  actor_label: string;
  member_invite_id: MemberInviteId;
  email: string;
  revoked_at: string;
}): ActivityEntryDraft {
  const { actor_label, member_invite_id, email, revoked_at } = args;
  return {
    topic: "member.invite_revoked",
    entity_type: "member_invite",
    entity_id: member_invite_id,
    summary_en: `${actor_label} cancelled the invite to ${email}.`,
    summary_hi: `${actor_label} ने ${email} का न्योता रद्द किया।`,
    before: { revoked_at: null },
    after: { revoked_at },
    visibility: "owners",
  };
}

export function memberRemovedActivity(args: {
  actor_label: string;
  member_id: string;
  member_label: string;
  role: MemberRole;
  removed_at: string;
}): ActivityEntryDraft {
  const { actor_label, member_id, member_label, role, removed_at } = args;
  return {
    topic: "member.removed",
    entity_type: "member",
    entity_id: member_id,
    summary_en: `${actor_label} removed ${member_label} from the wedding.`,
    summary_hi: `${actor_label} ने ${member_label} को शादी से हटाया।`,
    before: { removed_at: null, role },
    after: { removed_at },
    visibility: "owners",
  };
}

// ---------------------------------------------------------------------------
// Actor checks (the guard has checked; these are defence in depth)
// ---------------------------------------------------------------------------

type Ctx<C extends CommandName> = CommandHandlerContext<C, Tx>;
type Res<C extends CommandName> = CommandHandlerResult<C>;

function requireWedding(context: { wedding_id: WeddingId | null }): WeddingId {
  if (!context.wedding_id) throw new CommandFailure({ code: "validation_failed", message: "required", field: "wedding_id" });
  return context.wedding_id;
}

function ownerOf(context: { actor: CommandHandlerContext["actor"]; wedding_id: WeddingId | null }): SessionActor & { member_id: string } {
  const actor = context.actor;
  if (actor.kind === "guest" || actor.kind === "system") throw forbidden("Not allowed.");
  if (!actor.member_id || !actor.role || actor.wedding_id !== context.wedding_id) {
    throw forbidden("You are not a member of this wedding.");
  }
  if (actor.role !== "owner") throw forbidden();
  return actor as SessionActor & { member_id: string };
}

/** Any signed-in user (6.1): `accept_member_invite` runs before the user is a member. */
function signedInUserOf(context: { actor: CommandHandlerContext["actor"] }): SessionActor {
  const actor = context.actor;
  if (actor.kind === "guest" || actor.kind === "system" || !actor.user_id) throw forbidden("Not allowed.");
  return actor;
}

// ---------------------------------------------------------------------------
// set_sharing
// ---------------------------------------------------------------------------

export const setSharingHandler: CommandHandler<"set_sharing", Tx> = async (context: Ctx<"set_sharing">): Promise<Res<"set_sharing">> => {
  const actor = ownerOf(context);
  const wedding_id = requireWedding(context);
  const { tx, input } = context;

  // The dispatcher holds this row's lock already (3.0 step 6).
  const [row] = await tx
    .select({
      managers_can_see_vendor_dues: weddings.managers_can_see_vendor_dues,
      managers_can_see_budget: weddings.managers_can_see_budget,
      managers_can_see_guest_contacts: weddings.managers_can_see_guest_contacts,
    })
    .from(weddings)
    .where(eq(weddings.id, wedding_id))
    .limit(1);
  if (!row) throw notFound("wedding_id", "Wedding not found.");

  const changes = diffSharing(row, input);
  if (changes.length === 0) {
    return { outcome: "unchanged", result: { wedding_id, sharing: row, changed_fields: [] }, activity: null };
  }

  const next: SharingSettings = { ...row };
  for (const change of changes) next[change.flag] = change.to;
  await tx
    .update(weddings)
    .set({ ...next, updated_at: new Date(context.now) })
    .where(eq(weddings.id, wedding_id));

  return {
    outcome: "applied",
    result: { wedding_id, sharing: next, changed_fields: changes.map((change) => change.flag) },
    activity: sharingActivity({ actor_label: actor.display_name, wedding_id, changes }),
  };
};

// ---------------------------------------------------------------------------
// invite_member
// ---------------------------------------------------------------------------

export const inviteMemberHandler: CommandHandler<"invite_member", Tx> = async (
  context: Ctx<"invite_member">,
): Promise<Res<"invite_member">> => {
  const actor = ownerOf(context);
  const wedding_id = requireWedding(context);
  const { tx, input } = context;
  const now = new Date(context.now);
  const email = normalizeEmail(input.email);

  // `already_member` (3.1). `members` holds no emails (they stay in Supabase Auth), so this
  // catches the inviting owner's own address and anyone who joined through an earlier invite
  // and is still a member. `accept_member_invite` checks the user id itself, so nobody can
  // hold two memberships of one wedding either way.
  if (normalizeEmail(actor.email) === email) throw alreadyMember("You are already a member of this wedding.", null, "email");
  const joined = await tx
    .select({ member_id: members.id })
    .from(memberInvites)
    .innerJoin(members, eq(members.id, memberInvites.accepted_by_member_id))
    .where(
      and(
        eq(memberInvites.wedding_id, wedding_id),
        sql`lower(${memberInvites.email}) = ${email}`,
        isNotNull(memberInvites.accepted_at),
        eq(members.wedding_id, wedding_id),
        isNull(members.removed_at),
      ),
    )
    .limit(1);
  if (joined.length > 0) throw alreadyMember("This person is already a member of this wedding.", null, "email");

  const token = generateLinkToken();
  const expires_at = new Date(now.getTime() + INVITE_TTL_MS);
  const display_name = input.display_name ?? null;
  const [invite] = await tx
    .insert(memberInvites)
    .values({
      wedding_id,
      email,
      role: input.role,
      display_name,
      token_hash: hashLinkToken(token).hash,
      expires_at,
      invited_by_member_id: actor.member_id,
      created_at: now,
      updated_at: now,
    })
    .returning({ id: memberInvites.id });

  return {
    outcome: "applied",
    // `join_url` is the one time the raw token leaves the server; the receipt drops it.
    result: { member_invite_id: invite.id, join_url: joinUrlFor(token) },
    activity: invitedActivity({
      actor_label: actor.display_name,
      member_invite_id: invite.id,
      email,
      role: input.role,
      display_name,
      expires_at: expires_at.toISOString(),
    }),
  };
};

// ---------------------------------------------------------------------------
// accept_member_invite
// ---------------------------------------------------------------------------

export const acceptMemberInviteHandler: CommandHandler<"accept_member_invite", Tx> = async (
  context: Ctx<"accept_member_invite">,
): Promise<Res<"accept_member_invite">> => {
  const actor = signedInUserOf(context);
  const { tx, input } = context;
  const now = new Date(context.now);

  // Malformed, unknown, expired, revoked and used tokens all answer the one body.
  if (!isWellFormedToken(input.token)) throw inviteInvalid();
  const token_hash = hashLinkToken(input.token).hash;
  const [found] = await tx
    .select({ id: memberInvites.id, wedding_id: memberInvites.wedding_id })
    .from(memberInvites)
    .where(eq(memberInvites.token_hash, token_hash))
    .limit(1);
  if (!found) throw inviteInvalid();
  if (context.wedding_id && context.wedding_id !== found.wedding_id) throw inviteInvalid();

  // The lock order of every command (3.0 step 6): the wedding row, then the rows changed.
  await tx.select({ id: weddings.id }).from(weddings).where(eq(weddings.id, found.wedding_id)).for("update");
  const [invite] = await tx
    .select({
      id: memberInvites.id,
      wedding_id: memberInvites.wedding_id,
      email: memberInvites.email,
      role: memberInvites.role,
      display_name: memberInvites.display_name,
      expires_at: memberInvites.expires_at,
      accepted_at: memberInvites.accepted_at,
      revoked_at: memberInvites.revoked_at,
    })
    .from(memberInvites)
    .where(eq(memberInvites.id, found.id))
    .for("update");
  if (!invite || inviteState(invite, now) !== "pending") throw inviteInvalid();

  // The email must match (3.1). It proves nothing on its own with "Confirm email" off: the
  // token is the credential, and this keeps a forwarded link from joining someone else.
  if (!actor.email || normalizeEmail(actor.email) !== normalizeEmail(invite.email)) throw forbidden(EMAIL_MISMATCH_MESSAGE);

  const [existing] = await tx
    .select({ id: members.id, display_name: members.display_name, removed_at: members.removed_at })
    .from(members)
    .where(and(eq(members.wedding_id, invite.wedding_id), eq(members.user_id, actor.user_id)))
    .for("update");
  if (existing && !existing.removed_at) {
    throw alreadyMember("You are already a member of this wedding.", { wedding_id: invite.wedding_id });
  }

  const display_name = joinedDisplayName(invite.display_name, existing?.display_name ?? null, actor.display_name);
  let member_id: string;
  if (existing) {
    // A removed member invited back: the one row per user and wedding comes back to life.
    await tx
      .update(members)
      .set({ role: invite.role, display_name, removed_at: null, updated_at: now })
      .where(eq(members.id, existing.id));
    member_id = existing.id;
  } else {
    const [created] = await tx
      .insert(members)
      .values({
        wedding_id: invite.wedding_id,
        user_id: actor.user_id,
        role: invite.role,
        display_name,
        preferred_language: actor.preferred_language,
        created_at: now,
        updated_at: now,
      })
      .returning({ id: members.id });
    member_id = created.id;
  }

  await tx
    .update(memberInvites)
    .set({ accepted_at: now, accepted_by_member_id: member_id, updated_at: now })
    .where(eq(memberInvites.id, invite.id));

  return {
    outcome: "applied",
    // `wedding_id`, `member_id` and `role` let the dispatcher bump this wedding and attribute
    // the entry to the new member (L2); the join page goes to the wedding from here.
    result: { wedding_id: invite.wedding_id, member_id, role: invite.role, display_name },
    activity: joinedActivity({ member_id, member_invite_id: invite.id, email: invite.email, role: invite.role, display_name }),
  };
};

// ---------------------------------------------------------------------------
// revoke_member_invite
// ---------------------------------------------------------------------------

export const revokeMemberInviteHandler: CommandHandler<"revoke_member_invite", Tx> = async (
  context: Ctx<"revoke_member_invite">,
): Promise<Res<"revoke_member_invite">> => {
  const actor = ownerOf(context);
  const wedding_id = requireWedding(context);
  const { tx, input } = context;
  const now = new Date(context.now);

  const [invite] = await tx
    .select({
      id: memberInvites.id,
      email: memberInvites.email,
      expires_at: memberInvites.expires_at,
      accepted_at: memberInvites.accepted_at,
      revoked_at: memberInvites.revoked_at,
    })
    .from(memberInvites)
    .where(and(eq(memberInvites.id, input.member_invite_id), eq(memberInvites.wedding_id, wedding_id)))
    .for("update");
  if (!invite) throw notFound("member_invite_id", "Invite not found.");
  if (inviteState(invite, now) !== "pending") {
    throw new CommandFailure({ code: "invite_invalid", message: "This invite is no longer pending.", field: "member_invite_id" });
  }

  await tx.update(memberInvites).set({ revoked_at: now, updated_at: now }).where(eq(memberInvites.id, invite.id));

  return {
    outcome: "applied",
    result: { member_invite_id: invite.id, revoked: true },
    activity: inviteRevokedActivity({
      actor_label: actor.display_name,
      member_invite_id: invite.id,
      email: invite.email,
      revoked_at: now.toISOString(),
    }),
  };
};

// ---------------------------------------------------------------------------
// remove_member
// ---------------------------------------------------------------------------

export const removeMemberHandler: CommandHandler<"remove_member", Tx> = async (
  context: Ctx<"remove_member">,
): Promise<Res<"remove_member">> => {
  const actor = ownerOf(context);
  const wedding_id = requireWedding(context);
  const { tx, input } = context;
  const now = new Date(context.now);

  const [target] = await tx
    .select({ id: members.id, role: members.role, display_name: members.display_name, removed_at: members.removed_at })
    .from(members)
    .where(and(eq(members.id, input.member_id), eq(members.wedding_id, wedding_id)))
    .for("update");
  if (!target || target.removed_at) throw notFound("member_id", "Member not found.");

  if (target.role === "owner") {
    // The wedding row is locked, so no other removal can race this count.
    const owners = await tx
      .select({ id: members.id })
      .from(members)
      .where(and(eq(members.wedding_id, wedding_id), eq(members.role, "owner"), isNull(members.removed_at)));
    if (!owners.some((owner) => owner.id !== target.id)) {
      throw new CommandFailure({ code: "last_owner", message: "A wedding needs at least one owner.", field: "member_id" });
    }
  }

  // From the next request the removed member fails every check (6.2): the guard and the
  // session helper only ever match rows with no `removed_at`.
  await tx.update(members).set({ removed_at: now, updated_at: now }).where(eq(members.id, target.id));

  return {
    outcome: "applied",
    result: { member_id: target.id, removed: true },
    activity: memberRemovedActivity({
      actor_label: actor.display_name,
      member_id: target.id,
      member_label: target.display_name,
      role: target.role,
      removed_at: now.toISOString(),
    }),
  };
};

/** Lane A's handlers for 3.1's sharing and member commands, for the registry (A6). */
export const memberHandlers: HandlerMap = {
  set_sharing: setSharingHandler,
  invite_member: inviteMemberHandler,
  accept_member_invite: acceptMemberInviteHandler,
  revoke_member_invite: revokeMemberInviteHandler,
  remove_member: removeMemberHandler,
};
