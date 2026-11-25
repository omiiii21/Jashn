"use server";

import "server-only";

import type { CommandEnvelope, CommandResponse } from "@/contracts/commands";
import { buildUserActor, getSignedInUser, loadMemberActor } from "@/server/auth/session";
import { services } from "@/server/services";

/**
 * The one command action every form uses (decision D98). It takes the domain 3.0 request
 * envelope and returns the response envelope. Server components pass it to client forms
 * as a prop; client components never import this file, and lanes never wrap it.
 *
 * The actor comes from the session helper: the member of the envelope's wedding, or, for
 * the `set_wedding_profile` create and `accept_member_invite` (no wedding yet), the
 * signed-in user. The dispatcher then runs the guard, validation, receipts and the
 * transaction. In fixture mode (no database or Supabase keys yet) the session helper
 * returns the fixture member and the services answer from the fixtures.
 */
export async function dispatchCommand(envelope: CommandEnvelope): Promise<CommandResponse> {
  const user = await getSignedInUser();
  if (!user) return { ok: false, error: { code: "unauthenticated", message: "Sign in to continue.", field: null } };

  const raw = (envelope ?? {}) as { wedding_id?: unknown };
  const wedding_id = typeof raw.wedding_id === "string" && raw.wedding_id ? raw.wedding_id : null;
  const actor = wedding_id ? await loadMemberActor(user, wedding_id) : await buildUserActor(user);
  if (!actor) {
    return { ok: false, error: { code: "forbidden", message: "You are not a member of this wedding.", field: null } };
  }
  return services.dispatch(actor, envelope);
}
