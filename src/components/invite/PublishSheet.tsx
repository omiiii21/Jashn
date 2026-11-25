"use client";

import type { WeddingId } from "@/contracts/domain";
import type { UnpublishedChange } from "@/contracts/read-models";

/** Final props (decisions D59 and D97). Only the lead changes them. */
export type PublishSheetProps = {
  wedding_id: WeddingId;
  /** The draft changes guests can't see yet, from the `itinerary` read model. */
  unpublished_changes: UnpublishedChange[];
  /** The `draft_version` the owner reviewed; `publish_itinerary` answers 409 `draft_changed` if it moved. */
  expected_draft_version: number;
  /**
   * Called once when the owner confirms, with the reviewed `expected_draft_version`.
   * Lane B passes the planner publish action (a server action works) and Lane C passes
   * the voice confirm, so each path makes exactly one write (D59).
   */
  on_confirm: (expected_draft_version: number) => Promise<unknown>;
};

/**
 * The review-and-publish sheet (Lane D). Contracts stub: a disabled button. The real,
 * reusable sheet ships at 11:40 in lane-d-publish, keeping these props.
 */
export function PublishSheet(props: PublishSheetProps) {
  void props;
  return (
    <button
      type="button"
      disabled
      className="inline-flex h-10 items-center justify-center rounded-md border border-current px-4 opacity-50 disabled:cursor-not-allowed"
    >
      Review and publish
    </button>
  );
}
