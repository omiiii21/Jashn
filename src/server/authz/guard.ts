import "server-only";

import { eq } from "drizzle-orm";

import {
  COMMAND_ERROR_HTTP_STATUS,
  CommandFailure,
  type CommandErrorBody,
  type CommandErrorCode,
  type CommandName,
} from "@/contracts/commands";
import type { CommandActor, GuestActor, MemberRole, SessionActor, SharingSettings, SystemActor, WeddingId } from "@/contracts/domain";
import {
  COMMAND_PERMISSIONS,
  GUEST_COMMANDS,
  PROPOSALS_NEEDING_VENDOR_DUES,
  READ_MODEL_PERMISSIONS,
  SYSTEM_COMMANDS,
  memberCommandDecision,
  type RoleDecision,
} from "@/contracts/permissions";
import type { ReadModelName } from "@/contracts/read-models";
import type { GuestTokenResolver, SystemVerifier } from "@/contracts/services";
import type { DbOrTx } from "@/db/client";
import { isUuidShaped } from "@/db/ids";
import { weddings } from "@/db/schema";
import { getSignedInUser, loadMemberActor } from "@/server/auth/session";

/**
 * The one server guard (architecture 3.3, domain 6.1–6.2). Everything here applies the
 * data in `src/contracts/permissions.ts`; flags never decide access (flagsmith.md 2.4).
 *
 * - Member checks: the command decision (allow, 403 `approval_required`, 403 `forbidden`),
 *   the input-dependent limits (3.5's vendor-dues rule, `add_guest` for managers) and
 *   read-model access.
 * - API helpers for route handlers: the member actor, or a 401 (signed out) or 403 (not a
 *   member, or removed) JSON error.
 * - Guest and system actors: accepted only for the commands permissions.ts gives them.
 *   The token resolver and the `JOBS_API_TOKEN` verifier plug in at 14:45 through
 *   `requireGuestForApi` and `requireSystemForApi`.
 */

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export const GUARD_MESSAGES = {
  unauthenticated: "Sign in to continue.",
  not_member: "You are not a member of this wedding.",
  role: "Not allowed for your role.",
  approval_required: "This change needs an owner's approval. Send it as a proposal.",
  not_shared: "Not shared with you.",
  owner_runs_directly: "Owners make this change directly.",
  guest_not_found: "Not found.",
  system: "Not allowed.",
} as const;

function body(code: CommandErrorCode, message: string, field: string | null = null): CommandErrorBody {
  return { code, message, field };
}

/** A JSON error response in the domain 3.0 error envelope. */
export function errorResponse(error: CommandErrorBody, init?: { headers?: HeadersInit }): Response {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "no-store");
  return Response.json({ ok: false, error }, { status: COMMAND_ERROR_HTTP_STATUS[error.code], headers });
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/** True for the two commands any signed-in user may run (6.1): the create and `accept_member_invite`. */
export function isAnySignedInCommand(command: CommandName, wedding_id: WeddingId | null | undefined): boolean {
  if (command === "set_wedding_profile") return !wedding_id;
  return command === "accept_member_invite" && COMMAND_PERMISSIONS[command].any_signed_in;
}

/** The member's role decision for a command (step 2), with the any-signed-in cases. */
export function memberDecision(
  command: CommandName,
  role: MemberRole | null,
  sharing: SharingSettings,
  wedding_id: WeddingId | null | undefined,
): RoleDecision {
  if (isAnySignedInCommand(command, wedding_id)) return "allow";
  if (!role) return "forbidden";
  return memberCommandDecision(command, role, sharing);
}

function decisionError(decision: RoleDecision, command: CommandName, role: MemberRole | null): CommandErrorBody | null {
  if (decision === "allow") return null;
  if (decision === "approval_required") return body("approval_required", GUARD_MESSAGES.approval_required);
  if (role === "owner" && (command === "propose_change" || command === "withdraw_proposal")) {
    return body("forbidden", GUARD_MESSAGES.owner_runs_directly);
  }
  return body("forbidden", role ? GUARD_MESSAGES.role : GUARD_MESSAGES.not_member);
}

export type CommandActorContext = {
  /** The envelope's wedding (null for the create and `accept_member_invite`). */
  wedding_id: WeddingId | null;
  /** The wedding's sharing flags; null when there is no wedding (create, accept). */
  sharing: SharingSettings | null;
};

const NO_SHARING: SharingSettings = {
  managers_can_see_vendor_dues: false,
  managers_can_see_budget: false,
  managers_can_see_guest_contacts: false,
};

/**
 * Steps 1–2 for an already-resolved actor: is this actor allowed to run this command on
 * this wedding? Returns the error body, or null when allowed. A guest is answered 404
 * (never 403, D35); the ops token 403.
 */
export function checkCommandActor(actor: CommandActor, command: CommandName, context: CommandActorContext): CommandErrorBody | null {
  if (actor.kind === "guest") {
    const allowed = (GUEST_COMMANDS as readonly string[]).includes(command) && actor.wedding_id === context.wedding_id;
    return allowed ? null : body("not_found", GUARD_MESSAGES.guest_not_found);
  }
  if (actor.kind === "system") {
    return (SYSTEM_COMMANDS as readonly string[]).includes(command) ? null : body("forbidden", GUARD_MESSAGES.system);
  }
  if (!actor.user_id) return body("unauthenticated", GUARD_MESSAGES.unauthenticated);
  if (isAnySignedInCommand(command, context.wedding_id)) return null;
  // The actor's membership must be for this wedding: its role means nothing elsewhere.
  if (!context.wedding_id || actor.wedding_id !== context.wedding_id || !actor.member_id || !actor.role) {
    return body("forbidden", GUARD_MESSAGES.not_member);
  }
  const decision = memberDecision(command, actor.role, context.sharing ?? NO_SHARING, context.wedding_id);
  return decisionError(decision, command, actor.role);
}

/**
 * The input-dependent member limits, checked once the input parses:
 * - 3.5: a manager's `propose_change` for an A1 command other than `record_expense`
 *   needs `managers_can_see_vendor_dues`;
 * - 3.4: a manager's `add_guest` may not send `event_ids` or `max_plus_ones` (the
 *   active-link household rule needs the rows, so its handler checks it).
 */
export function checkMemberInput(
  command: CommandName,
  input: unknown,
  role: MemberRole | null,
  sharing: SharingSettings | null,
): CommandErrorBody | null {
  if (role !== "manager") return null;
  const value = (input ?? {}) as Record<string, unknown>;
  if (command === "propose_change") {
    const inner = value.command as string | undefined;
    if (inner && (PROPOSALS_NEEDING_VENDOR_DUES as readonly string[]).includes(inner) && !sharing?.managers_can_see_vendor_dues) {
      return body("forbidden", GUARD_MESSAGES.not_shared);
    }
  }
  if (command === "add_guest") {
    if (value.event_ids !== undefined) return body("forbidden", GUARD_MESSAGES.role, "event_ids");
    if (value.max_plus_ones !== undefined) return body("forbidden", GUARD_MESSAGES.role, "max_plus_ones");
  }
  return null;
}

// ---------------------------------------------------------------------------
// Read models
// ---------------------------------------------------------------------------

/** The wedding's sharing flags (G7), or null when the wedding doesn't exist. */
export async function loadSharing(db: DbOrTx, wedding_id: WeddingId): Promise<SharingSettings | null> {
  if (!isUuidShaped(wedding_id)) return null;
  const rows = await db
    .select({
      managers_can_see_vendor_dues: weddings.managers_can_see_vendor_dues,
      managers_can_see_budget: weddings.managers_can_see_budget,
      managers_can_see_guest_contacts: weddings.managers_can_see_guest_contacts,
    })
    .from(weddings)
    .where(eq(weddings.id, wedding_id))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Whether a member may read a model at all (6.1). Block-level hiding (budget, contacts,
 * vendor money) is the read model's own job. Throws `CommandFailure` (`forbidden`).
 */
export function assertReadModelAccess(name: ReadModelName, actor: SessionActor, wedding_id: WeddingId, sharing: SharingSettings): MemberRole {
  if (!actor.role || !actor.member_id || actor.wedding_id !== wedding_id) {
    throw new CommandFailure(body("forbidden", GUARD_MESSAGES.not_member));
  }
  const rule = READ_MODEL_PERMISSIONS[name];
  if (actor.role === "owner") {
    if (!rule.owner) throw new CommandFailure(body("forbidden", GUARD_MESSAGES.role));
    return actor.role;
  }
  if (rule.manager === "forbidden") throw new CommandFailure(body("forbidden", GUARD_MESSAGES.not_shared));
  if (rule.manager === "if_vendor_dues" && !sharing.managers_can_see_vendor_dues) {
    throw new CommandFailure(body("forbidden", GUARD_MESSAGES.not_shared));
  }
  return actor.role;
}

// ---------------------------------------------------------------------------
// API helpers for route handlers
// ---------------------------------------------------------------------------

export type ApiActorResult<A> = { ok: true; actor: A } | { ok: false; response: Response };

/**
 * The member actor for `wedding_id`, or the JSON error a route returns: 401 when signed
 * out, 403 when the user isn't a member (or was removed). A malformed wedding id is a 403
 * too: no member row can match it.
 */
export async function requireMemberForApi(wedding_id: string): Promise<ApiActorResult<SessionActor>> {
  const user = await getSignedInUser();
  if (!user) return { ok: false, response: errorResponse(body("unauthenticated", GUARD_MESSAGES.unauthenticated)) };
  if (!isUuidShaped(wedding_id)) return { ok: false, response: errorResponse(body("forbidden", GUARD_MESSAGES.not_member)) };
  const actor = await loadMemberActor(user, wedding_id);
  if (!actor || !actor.role || !actor.member_id || actor.wedding_id !== wedding_id) {
    return { ok: false, response: errorResponse(body("forbidden", GUARD_MESSAGES.not_member)) };
  }
  return { ok: true, actor };
}

// ---------------------------------------------------------------------------
// Guest and system actors (14:45: the resolver and verifier plug in here)
// ---------------------------------------------------------------------------

/** Until A2's 14:45 part lands, no guest token resolves (every guest route answers its 404). */
export const pendingGuestTokenResolver: GuestTokenResolver = async () => null;

/** Until A2's 14:45 part lands, no bearer token verifies (every ops route answers 401). */
export const pendingSystemVerifier: SystemVerifier = async () => null;

/** The guest actor for a raw token, or the one 404 body every guest failure shares (G5). */
export async function requireGuestForApi(
  token: string,
  resolve: GuestTokenResolver = pendingGuestTokenResolver,
): Promise<ApiActorResult<GuestActor>> {
  const actor = await resolve(token);
  if (!actor) return { ok: false, response: errorResponse(body("not_found", GUARD_MESSAGES.guest_not_found)) };
  return { ok: true, actor };
}

/** The `system` actor for an `Authorization` header, or 401 `unauthenticated` (3.7). */
export async function requireSystemForApi(
  authorization: string | null,
  verify: SystemVerifier = pendingSystemVerifier,
): Promise<ApiActorResult<SystemActor>> {
  const actor = await verify(authorization);
  if (!actor) return { ok: false, response: errorResponse(body("unauthenticated", GUARD_MESSAGES.unauthenticated)) };
  return { ok: true, actor };
}
