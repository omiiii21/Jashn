import { ArrowUUpLeft, CheckCircle, Prohibit } from "@phosphor-icons/react/ssr";
import type { ReactNode } from "react";

import type { Dispatch } from "@/components/planner/forms/command";
import { formatDayTime } from "@/components/planner/format";
import { Amount } from "@/components/planner/kit/Amount";
import { EmptyState } from "@/components/planner/kit/EmptyState";
import { SectionHeading } from "@/components/planner/kit/SectionHeading";
import { StatusLabel } from "@/components/planner/kit/StatusLabel";
import { Wash } from "@/components/planner/kit/Wash";
import type { MemberRole, ProposalStatus, WeddingId } from "@/contracts/domain";
import { formatInr } from "@/contracts/money";
import type { MoneyTotals, ProposalView } from "@/contracts/read-models";

import { DecisionLog } from "./DecisionLog";
import { ProposalDecision, WithdrawProposal } from "./ProposalDecision";

const SHEET = "rounded-sheet border border-line bg-paper p-4 lg:p-6";

/** The proposal's own figures: "+₹35,000 committed", "+₹10,000 paid" (A5: never in totals). */
function Deltas({ proposal }: { proposal: ProposalView }) {
  const parts: { key: string; label: string; inr: number }[] = [];
  if (proposal.committed_delta_inr !== 0) parts.push({ key: "committed_delta_inr", label: "to committed if approved", inr: proposal.committed_delta_inr });
  if (proposal.paid_delta_inr !== 0) parts.push({ key: "paid_delta_inr", label: "to paid if approved", inr: proposal.paid_delta_inr });
  if (parts.length === 0) return null;
  return (
    <p className="flex flex-wrap gap-x-4 text-table text-ink-2 tabular-nums">
      {parts.map((part) => (
        <span key={part.key}>
          <span data-field={part.key} className="font-medium text-proposal">
            {part.inr > 0 ? "+" : ""}
            {formatInr(part.inr)}
          </span>{" "}
          {part.label}.
        </span>
      ))}
      <span>Not in any total yet.</span>
    </p>
  );
}

const DECIDED: Record<Exclude<ProposalStatus, "pending">, { label: string; icon: typeof CheckCircle }> = {
  approved: { label: "Approved", icon: CheckCircle },
  rejected: { label: "Declined", icon: Prohibit },
  withdrawn: { label: "Withdrawn", icon: ArrowUUpLeft },
};

function ProposalRow({
  proposal,
  children,
}: {
  proposal: ProposalView;
  children?: ReactNode;
}) {
  const decided = proposal.status === "pending" ? null : DECIDED[proposal.status];
  const DecidedIcon = decided?.icon;
  return (
    <li className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0" data-proposal={proposal.seed_key ?? proposal.proposal_id}>
      <div className="flex flex-wrap items-center gap-2">
        {decided && DecidedIcon ? (
          <span className="inline-flex items-center gap-1 rounded-chip bg-ivory-deep px-2 py-1 text-meta text-ink-2">
            <DecidedIcon size={16} aria-hidden="true" />
            {decided.label}
          </span>
        ) : (
          <StatusLabel kind="proposed" label="Proposed" />
        )}
        <time dateTime={proposal.proposed_at} className="text-meta text-ink-3 tabular-nums">
          {formatDayTime(proposal.proposed_at)}
        </time>
      </div>
      {/* summary_en is the template's fragment ("an expense of ₹15,000 to …"), read after its proposer. */}
      <p id={`proposal-${proposal.proposal_id}`} className="max-w-prose text-body text-ink">
        {proposal.proposed_by} proposed {proposal.summary_en}.
      </p>
      {proposal.reason ? <p className="text-table text-ink-2">Reason: {proposal.reason}</p> : null}
      <Deltas proposal={proposal} />
      {proposal.decided_by && proposal.decided_at ? (
        <p className="text-meta text-ink-3 tabular-nums">
          {decided?.label ?? "Decided"} by {proposal.decided_by}, {formatDayTime(proposal.decided_at)}
          {proposal.decision_reason ? `. ${proposal.decision_reason}` : ""}
        </p>
      ) : null}
      {children}
    </li>
  );
}

export type ApprovalsSectionProps = {
  wedding_id: WeddingId;
  role: MemberRole;
  actor_name: string;
  /** Owners: the pending proposals. Managers: their own, any status (A7). */
  proposals: ProposalView[];
  /** For the wedding's "if approved" figure; absent when the budget is not shared. */
  totals?: MoneyTotals;
  dispatch: Dispatch;
};

/**
 * Approvals (A1–A7, 3.5): pending proposals as peacock "Proposed" rows with their own figures,
 * never added into a total. Owners approve or decline; a manager sees her own proposals and
 * can withdraw a pending one. Reusable on the Overview. Server-safe; the buttons are client parts.
 */
export function ApprovalsSection({ wedding_id, role, actor_name, proposals, totals, dispatch }: ApprovalsSectionProps) {
  const owner = role === "owner";
  const heading = owner ? "Waiting for your approval" : "Your proposals";
  return (
    <section aria-labelledby="approvals-heading" className={SHEET}>
      <SectionHeading id="approvals-heading">{heading}</SectionHeading>
      <DecisionLog listed_ids={proposals.map((proposal) => proposal.proposal_id)}>
      {owner && totals && totals.pending_proposals_inr > 0 ? (
        <p className="mt-2 text-table text-ink-2">
          If approved, committed would be{" "}
          <Wash watch={totals.if_approved_committed_inr}>
            <Amount inr={totals.if_approved_committed_inr} field="if_approved_committed_inr" className="text-proposal" />
          </Wash>
          , against{" "}
          <Amount inr={totals.total_committed_inr} field="total_committed_inr" /> today.
        </p>
      ) : null}
      {proposals.length === 0 ? (
        <EmptyState className="mt-3">
          {owner ? "Nothing is waiting for your approval." : "You haven't sent anything for approval."}
        </EmptyState>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {proposals.map((proposal) => (
            <ProposalRow key={proposal.proposal_id} proposal={proposal}>
              {proposal.status === "pending" ? (
                owner ? (
                  <ProposalDecision
                    wedding_id={wedding_id}
                    proposal_id={proposal.proposal_id}
                    summary={`${proposal.proposed_by} proposed ${proposal.summary_en}`}
                    actor_name={actor_name}
                    dispatch={dispatch}
                  />
                ) : (
                  <WithdrawProposal wedding_id={wedding_id} proposal_id={proposal.proposal_id} dispatch={dispatch} />
                )
              ) : null}
            </ProposalRow>
          ))}
        </ul>
      )}
      </DecisionLog>
    </section>
  );
}
