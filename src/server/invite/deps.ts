import "server-only";

import type { InviteHandlerDeps } from "./publish";
import type { SnapshotTools } from "./snapshot";
import type { InviteStore } from "./store";

/**
 * The one place Lane D's invite handlers get their store and snapshot tools. Until Lane A's
 * schema and snapshot builder reach main (the 14:00 batch), both are placeholders that
 * refuse loudly; the fixture dispatcher never calls these handlers, so nothing reaches
 * them before then.
 */
function notWired(): never {
  throw new Error("The invite store is not wired yet: Lane A's schema and snapshot builder land at 14:00.");
}

const placeholderStore: InviteStore<unknown> = {
  readWedding: notWired,
  readInviteStyle: notWired,
  readEvents: notWired,
  readVenues: notWired,
  readPublication: notWired,
  insertPublication: notWired,
  setPublishedRevision: notWired,
  writeInviteStyle: notWired,
  isCouplePhoto: notWired,
};

const placeholderTools: SnapshotTools = { build: notWired, diff: notWired, equal: notWired };

export const inviteDeps: InviteHandlerDeps<unknown> = { store: placeholderStore, snapshot: placeholderTools };
