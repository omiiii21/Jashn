import { CalendarBlank } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import type { ReactNode } from "react";

import { Amount, EmptyState, NotShared, StatusLabel, Wash } from "@/components/planner";
import { BUDGET_CATEGORY_LABELS, type WeddingId } from "@/contracts/domain";
import { formatInr, formatOverpaid } from "@/contracts/money";
import type { MoneySummary, MoneySummaryVendorRow } from "@/contracts/read-models";
import { routes } from "@/contracts/routes";

import { dueCell } from "./vendor-text";

// From 768 px a table; below it each row becomes a short block: the name, then three
// labelled figures, then the due line, so the page never scrolls sideways.
const TH = "px-3 py-3 text-left text-meta font-medium text-ink-3";
const TH_NUM = "px-3 py-3 text-right text-meta font-medium text-ink-3";
const ROW = "border-t border-line max-md:grid max-md:grid-cols-3 max-md:gap-x-3 max-md:gap-y-2 max-md:px-4 max-md:py-3";
const NAME_CELL = "text-left align-baseline max-md:col-span-3 md:sticky md:left-0 md:z-10 md:bg-paper md:px-3 md:py-3";
const NUM_CELL = "text-right align-baseline md:px-3 md:py-3";
const DUE_CELL = "align-baseline max-md:col-span-3 md:px-3 md:py-3";

/** The column name, shown above the figure on phones only (the table header says it from 768 px). */
function PhoneLabel({ children }: { children: ReactNode }) {
  return <span className="block text-meta text-ink-3 md:hidden">{children}</span>;
}

function DueCell({ row }: { row: MoneySummaryVendorRow }) {
  if (row.overpaid_inr > 0) {
    return <StatusLabel kind="overpaid" label={formatOverpaid(row.overpaid_inr)} field="overpaid_inr" />;
  }
  const due = dueCell(row);
  if (!due) return <span className="text-ink-3">Nothing committed</span>;
  if (due.kind === "plain") {
    return (
      <span className="text-ink-2 tabular-nums">
        <CalendarBlank size={16} aria-hidden="true" className="mr-2 inline-block align-middle text-ink-3" />
        {due.text}
      </span>
    );
  }
  return <StatusLabel kind={due.kind} label={due.text} />;
}

function VendorRow({ wedding_id, row }: { wedding_id: WeddingId; row: MoneySummaryVendorRow }) {
  const category = BUDGET_CATEGORY_LABELS[row.vendor_category];
  const owedTone = row.due_state === "overdue" ? "text-overdue" : row.due_state === "due_soon" ? "text-due" : "text-ink";
  return (
    <tr className={ROW}>
      <th scope="row" className={`${NAME_CELL} font-normal`}>
        {/* Inline padding widens the tap target without moving the line. */}
        <Link
          href={routes.vendor(wedding_id, row.vendor_id)}
          className="py-3 text-body font-medium text-maroon underline-offset-4 hover:text-maroon-deep hover:underline"
        >
          {row.name}
        </Link>
        <span className="block text-meta text-ink-3">{category.en}</span>
      </th>
      <td className={NUM_CELL}>
        <PhoneLabel>Committed</PhoneLabel>
        <Wash watch={row.committed_inr}>
          <Amount inr={row.committed_inr} field="committed_inr" className="text-ink" />
        </Wash>
      </td>
      <td className={NUM_CELL}>
        <PhoneLabel>Paid</PhoneLabel>
        <Wash watch={row.paid_inr}>
          <Amount inr={row.paid_inr} field="paid_inr" className="text-paid" />
        </Wash>
      </td>
      <td className={NUM_CELL}>
        <PhoneLabel>Still owed</PhoneLabel>
        <Wash watch={row.outstanding_inr}>
          <Amount inr={row.outstanding_inr} weight="total" field="outstanding_inr" className={owedTone} />
        </Wash>
      </td>
      <td className={DUE_CELL}>
        <DueCell row={row} />
        {row.pending_proposals_inr > 0 ? (
          <StatusLabel
            kind="proposed"
            label={`${formatInr(row.pending_proposals_inr)} proposed`}
            explanation="Not in the totals until an owner approves it."
            className="mt-2"
          />
        ) : null}
      </td>
    </tr>
  );
}

/** A total: a single rule above and a double rule below, as in accounting. */
function TotalCell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <td className={NUM_CELL}>
      <PhoneLabel>{label}</PhoneLabel>
      <span className="inline-block min-w-24 border-t border-line-strong pt-2">
        <span className="block border-b-3 border-double border-line-strong pb-1">{children}</span>
      </span>
    </td>
  );
}

/**
 * The vendor list (no `vendor_id`): every vendor from `money_summary` with Committed, Paid,
 * Still owed and the next due date, and the wedding's totals at the foot.
 */
export function VendorList({ wedding_id, summary }: { wedding_id: WeddingId; summary: MoneySummary }) {
  const vendors = summary.vendors;
  const moneyHidden = summary.hidden.includes("vendor_money") || vendors === undefined;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-serif text-title text-ink">Vendors</h1>

      {moneyHidden ? (
        <section aria-label="Vendors" className="rounded-sheet border border-line bg-paper p-4 lg:p-6">
          <NotShared className="text-body" />
          <p className="mt-2 max-w-prose text-table text-ink-2">
            An owner can share vendor dues with you from Team and sharing.
          </p>
        </section>
      ) : vendors.length === 0 ? (
        <section aria-label="Vendors" className="rounded-sheet border border-line bg-paper p-4 lg:p-6">
          <EmptyState>
            No vendors yet. Say &lsquo;The caterer is charging eight hundred per person for 250 people&rsquo; to
            add one with its contract.
          </EmptyState>
        </section>
      ) : (
        <section aria-labelledby="vendor-table-caption" className="overflow-hidden rounded-sheet border border-line bg-paper">
          <div className="md:overflow-x-auto md:overscroll-x-contain">
            <table className="w-full border-collapse text-table text-ink max-md:block md:min-w-160">
              <caption id="vendor-table-caption" className="sr-only">
                Vendors with what is committed, paid and still owed
              </caption>
              <thead className="max-md:hidden">
                <tr>
                  <th scope="col" className={`${TH} sticky left-0 z-10 bg-paper`}>
                    Vendor
                  </th>
                  <th scope="col" className={TH_NUM}>
                    Committed
                  </th>
                  <th scope="col" className={TH_NUM}>
                    Paid
                  </th>
                  <th scope="col" className={TH_NUM}>
                    Still owed
                  </th>
                  <th scope="col" className={TH}>
                    Next due
                  </th>
                </tr>
              </thead>
              <tbody className="max-md:block max-md:border-b max-md:border-line [&>tr:first-child]:max-md:border-t-0">
                {vendors.map((row) => (
                  <VendorRow key={row.vendor_id} wedding_id={wedding_id} row={row} />
                ))}
              </tbody>
              <tfoot className="max-md:block">
                <tr className="max-md:grid max-md:grid-cols-3 max-md:gap-x-3 max-md:gap-y-2 max-md:px-4 max-md:py-3">
                  <th scope="row" className={`${NAME_CELL} text-body font-semibold`}>
                    Total
                  </th>
                  {summary.totals ? (
                    <>
                      <TotalCell label="Committed">
                        <Amount inr={summary.totals.total_committed_inr} weight="total" field="total_committed_inr" />
                      </TotalCell>
                      <TotalCell label="Paid">
                        <Amount
                          inr={summary.totals.total_paid_inr}
                          weight="total"
                          field="total_paid_inr"
                          className="text-paid"
                        />
                      </TotalCell>
                      <TotalCell label="Still owed">
                        <Amount inr={summary.totals.total_outstanding_inr} weight="total" field="total_outstanding_inr" />
                      </TotalCell>
                      <td className="max-md:hidden" />
                    </>
                  ) : (
                    <td colSpan={4} className="align-baseline max-md:col-span-3 md:px-3 md:py-3">
                      <NotShared />
                    </td>
                  )}
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
