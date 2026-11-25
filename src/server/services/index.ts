import "server-only";

import { CommandFailure, type CommandName } from "@/contracts/commands";
import type { ReadModelName, ReadModelParams, ReadModelResult } from "@/contracts/read-models";
import { fixtureServices, type Services } from "@/contracts/services";
import { getDb } from "@/db/client";
import { isLiveAuth } from "@/server/auth/session";
import { assertReadModelAccess, loadSharing } from "@/server/authz/guard";
import { runCommand } from "@/server/commands/dispatcher";
import { handlerFor } from "@/server/commands/registry";
import { buildWeddingProfile, export_job_status } from "@/server/read-models";

/**
 * The services every lane calls (architecture 4.2 rule 3, 4.3). Real when the database and
 * Supabase Auth are both configured (`isLiveAuth`), the contracts' fixture services
 * otherwise. Switched method by method; anything not real yet answers from the fixtures.
 *
 * Real at 14:00: `dispatch` (the dispatcher), `read("wedding_profile")` and
 * `read("export_job_status")` (Lane D's model, D52). Still fixtures: every other read
 * model, `guestInvitationView`, `guestRevision` and `signUpload`. Seeded ids equal the
 * fixture ids (D100), so fixture reads of a sample copy line up with its real rows.
 */

async function guardedSharing(name: ReadModelName, actor: Parameters<Services["read"]>[1]["actor"], wedding_id: string) {
  const sharing = await loadSharing(getDb(), wedding_id);
  if (!sharing) throw new CommandFailure({ code: "not_found", message: "Wedding not found." });
  assertReadModelAccess(name, actor, wedding_id, sharing);
  return sharing;
}

const realServices: Services = {
  /**
   * Commands with a real handler run through the dispatcher. Until a command's handler map
   * merges (Lane A's at 14:45, Lane D's in its own PRs), it keeps the fixture answer, which
   * still applies the role matrix and validation but writes nothing, so screens built on
   * fixtures keep working in live mode (the lead's call, 13:25).
   */
  dispatch: (actor, envelope) =>
    handlerFor((envelope as { command?: CommandName }).command as CommandName)
      ? runCommand(actor, envelope)
      : fixtureServices.dispatch(actor, envelope),

  async read<N extends ReadModelName>(name: N, request: Parameters<Services["read"]>[1]): Promise<ReadModelResult<N>> {
    const params = ((request as { params?: unknown }).params ?? {}) as Record<string, unknown>;
    switch (name) {
      case "wedding_profile": {
        await guardedSharing(name, request.actor, request.wedding_id);
        return (await buildWeddingProfile(getDb(), request.actor, request.wedding_id)) as ReadModelResult<N>;
      }
      case "export_job_status": {
        await guardedSharing(name, request.actor, request.wedding_id);
        const actor = { ...request.actor, wedding_id: request.wedding_id };
        return (await export_job_status(actor, params as ReadModelParams<"export_job_status">)) as ReadModelResult<N>;
      }
      default:
        // Seeded ids equal the fixture ids (D100), so a fixture read of a real wedding still
        // runs the guard first: only its members, and only what their role may open (6.1).
        await guardedSharing(name, request.actor, request.wedding_id);
        return fixtureServices.read(name, request as never) as Promise<ReadModelResult<N>>;
    }
  },

  guestInvitationView: (token) => fixtureServices.guestInvitationView(token),
  guestRevision: (token) => fixtureServices.guestRevision(token),
  signUpload: (actor, request) => fixtureServices.signUpload(actor, request),
};

function current(): Services {
  return isLiveAuth() ? realServices : fixtureServices;
}

/** Decides per call, so a key landing in `.env.local` takes effect on the next restart's first request. */
export const services: Services = {
  dispatch: (actor, envelope) => current().dispatch(actor, envelope),
  read: (name, request) => current().read(name, request),
  guestInvitationView: (token) => current().guestInvitationView(token),
  guestRevision: (token) => current().guestRevision(token),
  signUpload: (actor, request) => current().signUpload(actor, request),
};

export type { Services };
