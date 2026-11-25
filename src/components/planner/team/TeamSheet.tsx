"use client";

import { X } from "@phosphor-icons/react";
import { useEffect, useId, useRef } from "react";

import type { Dispatch } from "@/components/planner/forms/command";
import type { WeddingId } from "@/contracts/domain";
import type { TeamView } from "@/contracts/read-models";

import { InviteMemberForm } from "./InviteMemberForm";
import { SharingControls } from "./SharingControls";
import { TeamMembers } from "./TeamMembers";

export type TeamSheetProps = {
  wedding_id: WeddingId;
  dispatch: Dispatch;
  /** The `team` read model (D99), read by the layout for owners; null if the read failed. */
  team: TeamView | null;
  /** Called once the dialog has closed (Close, Escape); the caller moves focus back. */
  onClose: () => void;
};

/**
 * The owner's "Team and sharing" sheet (brief B4, D64, D109), a native modal `<dialog>` that
 * slides in from the right, opened from the shell's wedding menu with no route of its own.
 * Mounted only while open, so a join URL never outlives the sheet. Escape closes it natively.
 */
export function TeamSheet({ wedding_id, dispatch, team, onClose }: TeamSheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const headingId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={headingId}
      onClose={onClose}
      className="fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-none w-full max-w-md overflow-y-auto bg-paper p-0 text-ink shadow-overlay backdrop:bg-ink/40"
    >
      <div className="flex flex-col gap-6 px-4 pt-4 pb-8 md:px-6">
        <div className="flex items-center justify-between gap-3">
          <h2 id={headingId} className="font-serif text-title text-ink">
            Team and sharing
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={() => ref.current?.close()}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-control text-ink-2 transition-colors duration-150 hover:bg-ivory-deep hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-maroon"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        {team ? <TeamMembers wedding_id={wedding_id} dispatch={dispatch} team={team} /> : null}
        {team ? <div className="border-t border-line" /> : null}
        <SharingControls wedding_id={wedding_id} dispatch={dispatch} sharing={team?.sharing ?? null} />
        <div className="border-t border-line" />
        <InviteMemberForm wedding_id={wedding_id} dispatch={dispatch} />
      </div>
    </dialog>
  );
}
