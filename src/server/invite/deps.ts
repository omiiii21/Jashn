import "server-only";

import type { Tx } from "@/db/client";
import { buildItinerarySnapshot, diffSnapshots, snapshotsEqual } from "@/db/itinerary-snapshot";

import { createDrizzleInviteStore } from "./drizzle-store";
import type { InviteHandlerDeps } from "./publish";
import type { SnapshotTools } from "./snapshot";

/**
 * The one place Lane D's invite handlers get their store and snapshot tools: Lane A's
 * schema through Lane D's Drizzle store, and Lane A's pure snapshot builder (D95).
 */
const snapshotTools: SnapshotTools = {
  build: (input) => buildItinerarySnapshot(input),
  diff: (previous, next, options) => diffSnapshots(previous, next, options),
  equal: (a, b) => snapshotsEqual(a, b),
};

export const inviteDeps: InviteHandlerDeps<Tx> = { store: createDrizzleInviteStore(), snapshot: snapshotTools };
