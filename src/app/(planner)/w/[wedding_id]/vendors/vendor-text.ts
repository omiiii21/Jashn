/**
 * The vendor page's sentences, built only from read-model fields (M8): no figure is added,
 * subtracted or multiplied here. Pure functions, shared by the page and its tests.
 */
import {
  PAYMENT_KIND_LABELS,
  PAYMENT_METHOD_LABELS,
  type CommitmentUnit,
  type IsoDate,
  type PaymentMethod,
  type VendorStatus,
} from "@/contracts/domain";
import { formatInr, groupIndian } from "@/contracts/money";
import type {
  CommitmentView,
  LedgerHistoryEntry,
  MoneySummaryVendorRow,
  PaymentView,
  QuoteView,
  VendorMoneyFigures,
} from "@/contracts/read-models";
import { formatDaysUntil } from "@/components/planner/format";
import { formatWeekdayDate, formatWeekdayDayMonth } from "@/components/planner/kit/dates";

/** `booked` reads "Contracted" (domain value sets: demo-data's "Contracted" and "Booked" are both `booked`). */
export const VENDOR_STATUS_LABELS: Record<VendorStatus, string> = {
  considering: "Considering",
  booked: "Contracted",
  cancelled: "Cancelled",
};

const UNIT_PLURALS: Record<CommitmentUnit, string> = {
  plate: "plates",
  person: "people",
  item: "items",
  hour: "hours",
  day: "days",
};

function unitWord(unit: CommitmentUnit, quantity: number): string {
  return quantity === 1 ? unit : UNIT_PLURALS[unit];
}

/** "₹850 × 250 = ₹2,12,500" for a per-unit quote, or "₹2,12,500" for a lump sum. */
export function quoteFormula(quote: QuoteView): string {
  if (quote.pricing === "per_unit" && quote.unit_price_inr !== null && quote.quantity !== null) {
    return `${formatInr(quote.unit_price_inr)} × ${groupIndian(quote.quantity)} = ${formatInr(quote.amount_inr)}`;
  }
  return formatInr(quote.amount_inr);
}

/** The contract line: the read model's `formula_text` ("250 plates × ₹800 = ₹2,00,000"), or the lump sum. */
export function commitmentFormula(commitment: CommitmentView): string {
  return commitment.formula_text ?? `${formatInr(commitment.amount_inr)}, lump sum`;
}

/** "Fri 20 Nov 2026, UPI", or "Date not given" when `paid_on` is empty. */
export function paymentMeta(paid_on: IsoDate | null | undefined, method: PaymentMethod | null | undefined): string {
  const parts = [paid_on ? formatWeekdayDate(paid_on) : "Date not given"];
  if (method) parts.push(PAYMENT_METHOD_LABELS[method]);
  return parts.join(", ");
}

/** The earliest version of a record in the history, for "Recorded 20 Nov by Mira". */
export function firstVersion(history: readonly LedgerHistoryEntry[], entity_id: string): LedgerHistoryEntry | null {
  return history.find((entry) => entry.entity_id === entity_id && entry.version_no === 1) ?? null;
}

/** The version before `entry` of the same record, if the history holds it. */
export function previousVersion(
  history: readonly LedgerHistoryEntry[],
  entry: LedgerHistoryEntry,
): LedgerHistoryEntry | null {
  let previous: LedgerHistoryEntry | null = null;
  for (const candidate of history) {
    if (candidate.entity_id !== entry.entity_id || candidate.version_no >= entry.version_no) continue;
    if (!previous || candidate.version_no > previous.version_no) previous = candidate;
  }
  return previous;
}

/** What one history version says (domain C7): "Advance corrected from ₹50,000 to ₹40,000". */
export function describeHistoryEntry(
  entry: LedgerHistoryEntry,
  previous: LedgerHistoryEntry | null,
  payments: readonly PaymentView[],
): { what: string; detail: string } {
  const { values } = entry;
  const changedAmount = previous !== null && previous.values.amount_inr !== values.amount_inr;

  if (entry.entity === "commitment") {
    const formula =
      values.pricing === "per_unit" && values.unit && values.unit_price_inr != null && values.quantity != null
        ? `${groupIndian(values.quantity)} ${unitWord(values.unit, values.quantity)} × ${formatInr(values.unit_price_inr)} = ${formatInr(values.amount_inr)}`
        : `${formatInr(values.amount_inr)}, lump sum`;
    const due = values.due_on ? `, balance due ${formatWeekdayDayMonth(values.due_on)}` : "";
    const what = !previous
      ? `Contract recorded at ${formatInr(values.amount_inr)}`
      : changedAmount
        ? `Contract changed from ${formatInr(previous.values.amount_inr)} to ${formatInr(values.amount_inr)}`
        : "Contract details changed";
    return { what, detail: `Version ${entry.version_no}: ${formula}${due}` };
  }

  const payment = payments.find((row) => row.payment_id === entry.entity_id);
  const kind = payment ? PAYMENT_KIND_LABELS[payment.payment_kind].en : "Payment";
  const what = !previous
    ? `${kind} recorded at ${formatInr(values.amount_inr)}`
    : changedAmount
      ? `${kind} corrected from ${formatInr(previous.values.amount_inr)} to ${formatInr(values.amount_inr)}`
      : `${kind} details changed`;
  return { what, detail: `Version ${entry.version_no}: ${paymentMeta(values.paid_on, values.method)}` };
}

/** The due line under Still owed, from `money_summary`'s row: never a computed day count. */
export type DueLine =
  | { kind: "plain"; text: string }
  | { kind: "due" | "overdue" | "paid"; text: string }
  | null;

export function dueLine(figures: VendorMoneyFigures, row: MoneySummaryVendorRow | null, fallback_due_on: IsoDate | null): DueLine {
  if (figures.overpaid_inr > 0) return null;
  if (figures.outstanding_inr === 0) return figures.committed_inr > 0 ? { kind: "paid", text: "Paid in full" } : null;

  const due_on = row?.next_due_on ?? fallback_due_on;
  if (!due_on) return { kind: "plain", text: "No due date set" };
  const date = formatWeekdayDayMonth(due_on);
  const days = row?.days_until_due ?? null;
  const when = days === null ? "" : `, ${formatDaysUntil(days)}`;

  switch (row?.due_state) {
    case "overdue":
      return { kind: "overdue", text: `Overdue since ${date}` };
    case "due_soon":
      return { kind: "due", text: `Balance due ${date}${when}` };
    default:
      return { kind: "plain", text: `Balance due ${date}${when}` };
  }
}

/** The vendor list's short due cell: "Overdue since 1 Dec", "Due 1 Dec, in 6 days", "12 Dec, in 17 days". */
export function dueCell(row: MoneySummaryVendorRow): DueLine {
  if (row.overpaid_inr > 0) return null;
  if (row.outstanding_inr === 0) return row.committed_inr > 0 ? { kind: "paid", text: "Paid in full" } : null;
  if (!row.next_due_on) return { kind: "plain", text: "No due date" };
  const date = formatWeekdayDayMonth(row.next_due_on);
  const when = row.days_until_due === null ? "" : `, ${formatDaysUntil(row.days_until_due)}`;
  if (row.due_state === "overdue") return { kind: "overdue", text: `Overdue since ${date}` };
  if (row.due_state === "due_soon") return { kind: "due", text: `Due ${date}${when}` };
  return { kind: "plain", text: `${date}${when}` };
}
