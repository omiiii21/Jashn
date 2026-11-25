import "server-only";

import type { PublicationSnapshot, SnapshotChange, WeddingId } from "@/contracts/domain";

import type { InviteEventRow, InviteStyleRow, InviteVenueRow, InviteWeddingRow } from "./store";

/**
 * Lane A's pure snapshot builder (decision D95), as Lane D's handlers use it. Lane D never
 * builds or diffs a snapshot itself: the default tools are Lane A's
 * `src/db/itinerary-snapshot.ts` functions, wired in `deps.ts`; tests inject canned ones.
 */
export type SnapshotInputRows = {
  wedding: InviteWeddingRow;
  invite_style: InviteStyleRow | null;
  events: readonly InviteEventRow[];
  venues: readonly InviteVenueRow[];
};

export type SnapshotTools = {
  build(input: SnapshotInputRows): PublicationSnapshot;
  diff(previous: PublicationSnapshot | null, next: PublicationSnapshot, options: { wedding_id: WeddingId }): SnapshotChange[];
  equal(a: PublicationSnapshot | null, b: PublicationSnapshot | null): boolean;
};
