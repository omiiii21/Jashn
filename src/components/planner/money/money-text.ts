/**
 * Words for the Money page. Every figure is a read-model field (M8); these helpers only put
 * them into sentences with `formatInr`, never add or subtract.
 */
import { formatInr } from "@/contracts/money";
import type { MoneyTotals } from "@/contracts/read-models";

/** The money sentence (design-direction 8, rule 10). */
export function moneySentence(totals: MoneyTotals): string {
  const parts = [
    `Of the ${formatInr(totals.budget_inr)} budget, ${formatInr(totals.total_committed_inr)} is committed and ${formatInr(totals.total_paid_inr)} is paid, so ${formatInr(totals.total_outstanding_inr)} is still owed.`,
  ];
  if (totals.over_budget_inr > 0) {
    parts.push(`Commitments are ${formatInr(totals.over_budget_inr)} over the budget.`);
  } else {
    parts.push(`${formatInr(totals.uncommitted_inr)} is not yet committed.`);
  }
  return parts.join(" ");
}

/** The bar's accessible description, the same figures in a sentence. */
export function moneyBarDescription(totals: MoneyTotals): string {
  return `Budget bar: ${formatInr(totals.total_paid_inr)} paid, ${formatInr(totals.total_outstanding_inr)} committed and still owed, ${formatInr(totals.uncommitted_inr)} not yet committed, of a ${formatInr(totals.budget_inr)} budget.`;
}

/** "₹15,000 proposed, not in totals", or null when nothing is pending. */
export function proposedNote(pending_proposals_inr: number): string | null {
  return pending_proposals_inr > 0 ? `${formatInr(pending_proposals_inr)} proposed, not in totals` : null;
}
