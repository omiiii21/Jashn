import "server-only";

import { notFound, redirect } from "next/navigation";
import { cache } from "react";

import { CommandFailure } from "@/contracts/commands";
import type { SessionActor, VendorId, WeddingId } from "@/contracts/domain";
import type {
  ReadModelName,
  ReadModelParams,
  ReadModelResult,
  VendorLedger,
  WeddingProfile,
} from "@/contracts/read-models";
import { routes } from "@/contracts/routes";
import type { ReadRequest } from "@/contracts/services";
import { requireMember } from "@/server/auth/session";
import { services } from "@/server/services";

/**
 * Server-side reads for the planner pages (a private `_lib` folder, not a route segment).
 * Every read is member-guarded through `requireMember`, and both helpers are deduplicated
 * per request with React's `cache`, so the shell and the page share one session lookup
 * and one `wedding_profile` read.
 */

/** The signed-in member of this wedding (Lane A's helper sends others away). */
export const getMember = cache((wedding_id: WeddingId): Promise<SessionActor> => requireMember(wedding_id));

/**
 * A refused read never shows the wedding exists: not-found for `not_found` and `forbidden`,
 * and the login page for `unauthenticated`. Anything else is rethrown for `error.tsx`.
 */
export function onReadFailure(error: unknown): never {
  if (error instanceof CommandFailure) {
    if (error.body.code === "not_found" || error.body.code === "forbidden") notFound();
    if (error.body.code === "unauthenticated") redirect(routes.login());
  }
  throw error;
}

/** One member read model, with the actor's role filtering done on the server. */
export async function readModel<N extends ReadModelName>(
  name: N,
  wedding_id: WeddingId,
  params?: ReadModelParams<N>,
): Promise<ReadModelResult<N>> {
  const actor = await getMember(wedding_id);
  try {
    return await services.read(name, { actor, wedding_id, params } as ReadRequest<N>);
  } catch (error) {
    onReadFailure(error);
  }
}

/** The shell's and the landing view's read model (D99), once per request. */
export const getWeddingProfile = cache(
  (wedding_id: WeddingId): Promise<WeddingProfile> => readModel("wedding_profile", wedding_id),
);

/**
 * One vendor's ledger, once per request (the page and its title share it). A record this
 * member may not open comes back as "forbidden", so the page can say "Not shared with you";
 * a missing one is a 404.
 */
export const getVendorLedger = cache(
  async (wedding_id: WeddingId, vendor_id: VendorId): Promise<VendorLedger | "forbidden"> => {
    const actor = await getMember(wedding_id);
    try {
      return await services.read("vendor_ledger", { actor, wedding_id, params: { vendor_id } });
    } catch (error) {
      if (error instanceof CommandFailure && error.body.code === "forbidden") return "forbidden";
      onReadFailure(error);
    }
  },
);
