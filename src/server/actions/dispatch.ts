"use server";

import "server-only";

import type { CommandEnvelope, CommandResponse } from "@/contracts/commands";
import { getSession, requireMember } from "@/server/auth/session";
import { services } from "@/server/services";

/**
 * The one command action every form uses (decision D98). It takes the domain 3.0 request
 * envelope and returns the response envelope. Server components pass it to client forms
 * as a prop; client components never import this file, and lanes never wrap it.
 *
 * Contracts stub: the actor comes from the session stub and the fixture services answer.
 * Lane A replaces the body at 10:45 with the real dispatcher (guard, receipts, after-commit).
 */
export async function dispatchCommand(envelope: CommandEnvelope): Promise<CommandResponse> {
  // Only the set_wedding_profile create has no wedding yet (domain 3.0).
  const actor = envelope.wedding_id ? await requireMember(envelope.wedding_id) : await getSession();
  if (!actor) {
    return { ok: false, error: { code: "unauthenticated", message: "Sign in to continue." } };
  }
  return services.dispatch(actor, envelope);
}
