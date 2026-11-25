"use client";

import { useRef, useState } from "react";
import { XIcon } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { WeddingId } from "@/contracts/domain";
import type { UnpublishedChange } from "@/contracts/read-models";

import { changeLabel } from "./change-text";
import { ChangeList } from "./ChangeList";
import { interpretConfirmResult, PUBLISH_OUTCOME_TEXT, type PublishOutcome } from "./publish-outcome";
import { usePublishSheetExtras } from "./publish-sheet-context";

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

type Reviewed = { changes: UnpublishedChange[]; draft_version: number };

/**
 * The review-and-publish sheet (design-direction 10.7; acceptance AT-3.4 to AT-3.6). Owners
 * only: the page that mounts it decides, and the server's 403 is the real guard. On open it
 * freezes the list and the draft version, so a live refresh never swaps what the owner is
 * reviewing; after a 409 it adopts the newer list and needs another tap. One tap, one call.
 */
export function PublishSheet(props: PublishSheetProps) {
  const { next_revision, subjects } = usePublishSheetExtras();
  const [open, setOpen] = useState(false);
  const [reviewed, setReviewed] = useState<Reviewed>({ changes: props.unpublished_changes, draft_version: props.expected_draft_version });
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<Exclude<PublishOutcome, "published"> | null>(null);
  const inFlight = useRef(false);

  const publishLabel = next_revision ? `Publish revision ${next_revision}` : "Publish";
  const count = reviewed.changes.length;
  const labels = reviewed.changes
    .map((change) =>
      changeLabel({ entity: change.entity, entity_id: change.entity_id, field: change.field, from: change.published_value, to: change.draft_value }, subjects),
    )
    .join(", ");

  function onOpenChange(next: boolean) {
    if (next) {
      setReviewed({ changes: props.unpublished_changes, draft_version: props.expected_draft_version });
      setNotice(null);
    }
    setOpen(next);
  }

  async function confirm() {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setNotice(null);
    let outcome: PublishOutcome;
    try {
      outcome = interpretConfirmResult(await props.on_confirm(reviewed.draft_version));
    } catch {
      outcome = "error";
    }
    inFlight.current = false;
    setPending(false);
    if (outcome === "published") {
      setOpen(false);
      return;
    }
    if (outcome === "draft_changed") {
      // Adopt what the page now shows; the owner reviews it and taps again.
      setReviewed({ changes: props.unpublished_changes, draft_version: props.expected_draft_version });
    }
    setNotice(outcome);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <Button className="h-10 bg-maroon px-4 text-body text-paper hover:bg-maroon-deep focus-visible:ring-2 focus-visible:ring-maroon focus-visible:ring-offset-2">
          Review and publish
        </Button>
      </SheetTrigger>
      <SheetContent side="right" showCloseButton={false} className="w-full bg-paper text-ink sm:max-w-md">
        <SheetHeader className="relative gap-1 px-5 pt-5 pr-14">
          <SheetTitle className="font-serif! text-panel! font-semibold! text-ink!">{count > 0 ? publishLabel : "Nothing to publish"}</SheetTitle>
          <SheetDescription className="text-body text-ink-2">
            {count > 0 ? `${count} ${count === 1 ? "change" : "changes"}: ${labels}` : "Guests already see everything in the draft."}
          </SheetDescription>
          <SheetClose asChild>
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-4 right-4 text-ink-2 focus-visible:ring-2 focus-visible:ring-maroon focus-visible:ring-offset-2"
              aria-label="Close"
            >
              <XIcon aria-hidden="true" />
            </Button>
          </SheetClose>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5">
          {count > 0 ? (
            <>
              <p className="mb-3 text-meta text-ink-2">Guests see these after you publish. Their replies stay as they are.</p>
              <ChangeList changes={reviewed.changes} subjects={subjects} />
            </>
          ) : null}
          <p role="status" aria-live="polite" className="mt-4 min-h-6 text-body text-ink">
            {notice ? PUBLISH_OUTCOME_TEXT[notice] : ""}
          </p>
        </div>

        <SheetFooter className="flex-row justify-end gap-3 border-t border-line px-5 py-4">
          <SheetClose asChild>
            <Button variant="ghost" className="h-10 px-4 text-body text-ink focus-visible:ring-2 focus-visible:ring-maroon focus-visible:ring-offset-2">
              Keep editing
            </Button>
          </SheetClose>
          {count > 0 ? (
            <Button
              type="button"
              onClick={confirm}
              disabled={pending}
              className="h-10 bg-maroon px-4 text-body text-paper hover:bg-maroon-deep focus-visible:ring-2 focus-visible:ring-maroon focus-visible:ring-offset-2"
            >
              {pending ? "Publishing…" : publishLabel}
            </Button>
          ) : null}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
