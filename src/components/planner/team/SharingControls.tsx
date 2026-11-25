"use client";

import { useId, useState } from "react";

import type { Dispatch } from "@/components/planner/forms/command";
import { useCommand } from "@/components/planner/forms/useCommand";
import { SaveError } from "@/components/planner/kit/SaveError";
import { PRIMARY, Receipt, SECONDARY } from "@/components/planner/money/form-parts";
import type { CommandEnvelope } from "@/contracts/commands";
import type { WeddingId } from "@/contracts/domain";

import { SHARING_ROWS, sharingReceipt, teamErrorText } from "./team-text";

type SharingControlsProps = {
  wedding_id: WeddingId;
  dispatch: Dispatch;
};

/**
 * "Sharing with managers": one row per switch. The current values aren't readable here yet
 * (no `team` read model), so each row is a pair of buttons that sends `set_sharing` with only
 * its own key, and the receipt says what managers see now.
 */
export function SharingControls({ wedding_id, dispatch }: SharingControlsProps) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h3 id={headingId} className="text-heading text-ink">
        Sharing with managers
      </h3>
      <p className="text-meta text-ink-2">
        By default managers see vendor dues, but not the budget or guest contacts.
      </p>
      <ul className="flex flex-col divide-y divide-line">
        {SHARING_ROWS.map((row) => (
          <SharingRow key={row.key} wedding_id={wedding_id} dispatch={dispatch} row={row} />
        ))}
      </ul>
    </section>
  );
}

function SharingRow({
  wedding_id,
  dispatch,
  row,
}: SharingControlsProps & { row: (typeof SHARING_ROWS)[number] }) {
  const labelId = useId();
  const errorId = useId();
  const save = useCommand(dispatch);
  const [pending, setPending] = useState<boolean | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);

  async function send(shared: boolean) {
    setPending(shared);
    setReceipt(null);
    const response = await save.submit({
      wedding_id,
      command: "set_sharing",
      input: { [row.key]: shared },
      source: "ui",
    } as Omit<CommandEnvelope, "idempotency_key">);
    setPending(null);
    if (response.ok) setReceipt(sharingReceipt(row.noun, shared));
  }

  const error = save.state.status === "error" ? teamErrorText(save.state.error) : null;

  return (
    <li className="flex flex-col gap-2 py-3">
      <div
        role="group"
        aria-labelledby={labelId}
        aria-describedby={error ? errorId : undefined}
        className="flex flex-wrap items-center justify-between gap-2"
      >
        <span id={labelId} className="text-body font-medium text-ink">
          {row.label}
        </span>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={PRIMARY}
            aria-label={`Share ${row.noun}`}
            disabled={save.saving}
            onClick={() => send(true)}
          >
            {save.saving && pending === true ? "Saving…" : "Share"}
          </button>
          <button
            type="button"
            className={SECONDARY}
            aria-label={`Don't share ${row.noun}`}
            disabled={save.saving}
            onClick={() => send(false)}
          >
            {save.saving && pending === false ? "Saving…" : "Don't share"}
          </button>
        </div>
      </div>
      {receipt ? <Receipt>{receipt}</Receipt> : null}
      {error ? <SaveError id={errorId} message={error} /> : null}
    </li>
  );
}
