import "server-only";

import type { HandlerMap } from "@/contracts/services";

import { inviteDeps } from "./deps";
import { createUpdateInviteStyleHandler } from "./invite-style";
import { createPublishItineraryHandler, type InviteHandlerDeps } from "./publish";

/**
 * Lane D's command handlers, which Lane A's handler registry imports (architecture 4.3):
 * `update_invite_style` and `publish_itinerary` here; `request_card_export` and
 * `retry_card_export` join from lane-d-export-jobs.
 */
export function createInviteHandlers<Tx>(deps: InviteHandlerDeps<Tx>): HandlerMap {
  return {
    update_invite_style: createUpdateInviteStyleHandler(deps),
    publish_itinerary: createPublishItineraryHandler(deps),
  } as HandlerMap;
}

export const inviteHandlers: HandlerMap = createInviteHandlers(inviteDeps);
