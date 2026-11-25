"use client";

import { createContext, use, useCallback, useMemo, useState, type ReactNode } from "react";

import { Receipt } from "../money/form-parts";

type Decision = { proposal_id: string; text: string };

const DecisionLogContext = createContext<((decision: Decision) => void) | null>(null);

/** ProposalDecision reports a successful Approve or Decline here; null outside a log. */
export function useDecisionLog() {
  return use(DecisionLogContext);
}

/**
 * Keeps this session's decisions as receipt lines. A decided proposal leaves the pending list
 * on the next refresh, so its row (and the receipt in it) unmounts; the log shows the receipt
 * above the list for every decided proposal that is no longer listed, so it never vanishes.
 */
export function DecisionLog({ listed_ids, children }: { listed_ids: string[]; children: ReactNode }) {
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const add = useCallback(
    (decision: Decision) =>
      setDecisions((prev) => [...prev.filter((d) => d.proposal_id !== decision.proposal_id), decision]),
    [],
  );
  const listed = useMemo(() => new Set(listed_ids), [listed_ids]);
  const gone = decisions.filter((d) => !listed.has(d.proposal_id));

  return (
    <DecisionLogContext value={add}>
      {gone.length > 0 ? (
        <div className="mt-3 flex flex-col gap-2">
          {gone.map((d) => (
            <Receipt key={d.proposal_id}>{d.text}</Receipt>
          ))}
        </div>
      ) : null}
      {children}
    </DecisionLogContext>
  );
}
