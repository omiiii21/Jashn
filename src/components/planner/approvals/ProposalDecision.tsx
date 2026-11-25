"use client";

import { useId, useState } from "react";

import { commandErrorText, type Dispatch } from "@/components/planner/forms/command";
import { useCommand } from "@/components/planner/forms/useCommand";
import { formatTime } from "@/components/planner/format";
import type { WeddingId } from "@/contracts/domain";

import { INPUT, PRIMARY, Receipt, SECONDARY } from "../money/form-parts";
import { SaveError } from "../kit/SaveError";
import { useDecisionLog } from "./DecisionLog";

/**
 * An owner's Approve and Decline on one pending proposal (A3, A4). A 409 `proposal_changed`
 * says the record changed and the proposal stays pending; `proposal_not_pending` says it was
 * already decided. Never optimistic; the receipt stays.
 */
export function ProposalDecision({
  wedding_id,
  proposal_id,
  summary,
  actor_name,
  dispatch,
}: {
  wedding_id: WeddingId;
  proposal_id: string;
  /** "Diya proposed an expense of ₹15,000 …", for the receipt kept after the row leaves the list. */
  summary?: string;
  actor_name: string;
  dispatch: Dispatch;
}) {
  const log = useDecisionLog();
  const id = useId();
  // The proposal's summary line (ApprovalsSection), so each repeated Approve and Decline names its row.
  const describedBy = `proposal-${proposal_id}`;
  const approve = useCommand(dispatch);
  const decline = useCommand(dispatch);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [receipt, setReceipt] = useState<string | null>(null);
  const busy = approve.saving || decline.saving;

  async function onApprove() {
    decline.reset();
    const response = await approve.submit({ wedding_id, command: "approve_proposal", input: { proposal_id }, source: "ui" });
    if (response.ok) {
      const text = `Approved by ${actor_name}, ${formatTime(new Date().toISOString())}. The ledger now includes it.`;
      setReceipt(text);
      log?.({ proposal_id, text: summary ? `${summary}. ${text}` : text });
    }
  }

  async function onDecline() {
    approve.reset();
    const response = await decline.submit({
      wedding_id,
      command: "reject_proposal",
      input: { proposal_id, ...(reason.trim() ? { decision_reason: reason.trim() } : {}) },
      source: "ui",
    });
    if (response.ok) {
      setDeclining(false);
      const text = `Declined by ${actor_name}, ${formatTime(new Date().toISOString())}. The ledger hasn't changed.`;
      setReceipt(text);
      log?.({ proposal_id, text: summary ? `${summary}. ${text}` : text });
    }
  }

  if (receipt) return <Receipt>{receipt}</Receipt>;
  const error = approve.state.status === "error" ? approve.state.error : decline.state.status === "error" ? decline.state.error : null;

  return (
    <div className="flex flex-col gap-2">
      {declining ? (
        <div className="flex flex-col gap-2">
          <label htmlFor={`${id}-reason`} className="text-table font-medium text-ink">
            Reason for declining (optional)
          </label>
          <input
            id={`${id}-reason`}
            maxLength={200}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className={INPUT}
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" aria-describedby={describedBy} className={PRIMARY} onClick={onDecline} disabled={busy}>
              {decline.saving ? "Saving…" : "Decline proposal"}
            </button>
            <button type="button" className={SECONDARY} onClick={() => setDeclining(false)} disabled={busy}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="button" aria-describedby={describedBy} className={PRIMARY} onClick={onApprove} disabled={busy}>
            {approve.saving ? "Approving…" : "Approve"}
          </button>
          <button type="button" aria-describedby={describedBy} className={SECONDARY} onClick={() => setDeclining(true)} disabled={busy}>
            Decline
          </button>
        </div>
      )}
      {error ? <SaveError message={commandErrorText(error)} /> : null}
    </div>
  );
}

/** A manager's Withdraw on her own pending proposal (3.5). */
export function WithdrawProposal({
  wedding_id,
  proposal_id,
  dispatch,
}: {
  wedding_id: WeddingId;
  proposal_id: string;
  dispatch: Dispatch;
}) {
  const withdraw = useCommand(dispatch);
  const [done, setDone] = useState(false);

  async function onWithdraw() {
    const response = await withdraw.submit({ wedding_id, command: "withdraw_proposal", input: { proposal_id }, source: "ui" });
    if (response.ok) setDone(true);
  }

  if (done) return <Receipt>Withdrawn. The ledger hasn&rsquo;t changed.</Receipt>;
  return (
    <div className="flex flex-col gap-2">
      <div>
        <button type="button" className={SECONDARY} onClick={onWithdraw} disabled={withdraw.saving}>
          {withdraw.saving ? "Withdrawing…" : "Withdraw"}
        </button>
      </div>
      {withdraw.state.status === "error" ? <SaveError message={commandErrorText(withdraw.state.error)} /> : null}
    </div>
  );
}
