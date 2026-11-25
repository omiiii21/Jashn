import "server-only";

import type { HandlerMap } from "@/contracts/services";

import { createRequestCardExportHandler, createRetryCardExportHandler, type JobDeps } from "@/server/jobs/handlers";
import { jobDeps } from "@/server/jobs/deps";

import { inviteDeps } from "./deps";
import { createUpdateInviteStyleHandler } from "./invite-style";
import { createPublishItineraryHandler, type InviteHandlerDeps } from "./publish";

/**
 * Lane D's command handlers, which Lane A's handler registry imports (architecture 4.3):
 * `update_invite_style`, `publish_itinerary`, `request_card_export` and `retry_card_export`
 * (decision D41). The export pair lives in `src/server/jobs/`.
 */
export function createInviteHandlers<Tx>(deps: InviteHandlerDeps<Tx>, jobs: JobDeps<Tx>): HandlerMap {
  return {
    update_invite_style: createUpdateInviteStyleHandler(deps),
    publish_itinerary: createPublishItineraryHandler(deps),
    request_card_export: createRequestCardExportHandler(jobs),
    retry_card_export: createRetryCardExportHandler(jobs),
  } as HandlerMap;
}

export const inviteHandlers: HandlerMap = createInviteHandlers(inviteDeps, jobDeps);
