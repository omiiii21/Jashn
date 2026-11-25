import "server-only";

import type { HandlerMap } from "@/contracts/services";

/**
 * Lane D's command handlers, which Lane A's handler registry imports (architecture 4.3).
 * Empty until the 11:40 batch: `update_invite_style` and `publish_itinerary`
 * (lane-d-publish), then `request_card_export` and `retry_card_export` (lane-d-export-jobs).
 */
export const inviteHandlers: HandlerMap = {};
