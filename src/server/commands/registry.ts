import "server-only";

import type { CommandName } from "@/contracts/commands";
import { LANE_D_COMMANDS } from "@/contracts/commands";
import type { CommandHandler, HandlerMap } from "@/contracts/services";
import { inviteHandlers } from "@/server/invite/handlers";

import { demoHandlers } from "./demo";
import { eventHandlers } from "./events";
import { guestHandlers } from "./guests";
import { ledgerHandlers } from "./ledger";
import { memberHandlers } from "./members";
import { proposalHandlers } from "./proposals";
import { weddingProfileHandlers } from "./wedding-profile";

/**
 * The handler registry (architecture 3.3): Lane A's maps plus Lane D's
 * `src/server/invite/handlers.ts`, imported statically. Nothing registers itself by an
 * import side effect. Lane D owns its four commands (D41); a Lane A map never claims them.
 *
 * Lane A's maps, in the order they land:
 * - 14:00: `weddingProfileHandlers` (`set_wedding_profile`).
 * - 14:45: events (`create_event`, `update_event`, `add_requirement`), access
 *   (`reset_demo`), guests (`add_guest`, `set_invitations`, `set_rsvp`, `set_dietary`,
 *   `submit_rsvp`, `create_invitation_links`, `revoke_invitation_link`), the ledger
 *   (A3's money and proposal commands) and members (A6). Add each map to `LANE_A_MAPS`.
 */
const LANE_A_MAPS: HandlerMap[] = [
  weddingProfileHandlers,
  eventHandlers,
  demoHandlers,
  ledgerHandlers,
  proposalHandlers,
  guestHandlers,
  memberHandlers,
];

function buildRegistry(): HandlerMap {
  const combined: HandlerMap = {};
  const laneD = new Set<string>(LANE_D_COMMANDS);
  for (const laneAMap of LANE_A_MAPS) {
    for (const [command, handler] of Object.entries(laneAMap) as [CommandName, CommandHandler | undefined][]) {
      if (!handler || laneD.has(command)) continue;
      combined[command] = handler;
    }
  }
  for (const command of LANE_D_COMMANDS) {
    const handler = inviteHandlers[command];
    if (handler) combined[command] = handler;
  }
  return combined;
}

let registry: HandlerMap | null = null;

/**
 * The registry, built on first use. Lazy on purpose: a handler module may import the
 * dispatcher's helpers (`assertSameWedding`), and building at import time would read a map
 * that is still initialising when that module is imported first (a test, for example).
 */
export function getHandlerRegistry(): HandlerMap {
  registry ??= buildRegistry();
  return registry;
}

/** The handler for a command, or null when it isn't built yet. */
export function handlerFor(command: CommandName): CommandHandler | null {
  return getHandlerRegistry()[command] ?? null;
}
