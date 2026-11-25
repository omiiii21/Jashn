import { WarningCircle } from "@phosphor-icons/react/ssr";
import type { ReactNode } from "react";

import { Amount } from "@/components/planner/kit/Amount";
import { Wash } from "@/components/planner/kit/Wash";
import type { BudgetCategoryLine, MoneyTotals } from "@/contracts/read-models";

import { proposedNote } from "./money-text";

// From 768 px a table; below it each line is a short block of labelled, right-aligned figures
// in three columns (as the vendor rows), so the page never scrolls sideways at 360 px.
const TH = "px-3 py-3 text-left text-meta font-medium text-ink-3";
const TH_NUM = "px-3 py-3 text-right text-meta font-medium text-ink-3";
const ROW = "border-t border-line max-md:grid max-md:grid-cols-3 max-md:gap-x-3 max-md:gap-y-2 max-md:px-4 max-md:py-3";
const NAME = "text-left align-baseline font-normal max-md:col-span-3 md:px-3 md:py-3";
const NUM = "text-right align-baseline md:px-3 md:py-3";

function PhoneLabel({ children }: { children: ReactNode }) {
  return <span className="block text-right text-meta text-ink-3 md:hidden">{children}</span>;
}

function Figure({ inr, field, watch, className }: { inr: number; field: string; watch: string; className?: string }) {
  return (
    <Wash watch={`${watch}:${inr}`}>
      <Amount inr={inr} field={field} className={className} />
    </Wash>
  );
}

function TotalCell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <td className={NUM}>
      <PhoneLabel>{label}</PhoneLabel>
      <span className="inline-block min-w-24 border-t border-line-strong pt-2 max-md:justify-self-end">
        <span className="block border-b-3 border-double border-line-strong pb-1">{children}</span>
      </span>
    </td>
  );
}

function CategoryRow({ line }: { line: BudgetCategoryLine }) {
  const key = line.budget_category;
  const proposed = proposedNote(line.pending_proposals_inr);
  return (
    <tr className={ROW} data-category={key}>
      <th scope="row" className={NAME}>
        <span className="text-body text-ink">{line.label}</span>
        <span lang="hi" className="ml-2 text-body text-ink-2">
          {line.label_hi}
        </span>
        {proposed ? (
          <span data-field="categories.pending_proposals_inr" className="mt-1 block text-meta text-proposal tabular-nums">
            {proposed}
          </span>
        ) : null}
      </th>
      <td className={NUM}>
        <PhoneLabel>Planned</PhoneLabel>
        {line.has_line && line.planned_inr !== null ? (
          <Figure inr={line.planned_inr} field="categories.planned_inr" watch={key} className="text-ink-2" />
        ) : (
          <span className="text-ink-3">No line</span>
        )}
      </td>
      <td className={NUM}>
        <PhoneLabel>Committed</PhoneLabel>
        <Figure inr={line.committed_inr} field="categories.committed_inr" watch={key} />
      </td>
      <td className={NUM}>
        <PhoneLabel>Paid</PhoneLabel>
        <Figure inr={line.paid_inr} field="categories.paid_inr" watch={key} className={line.paid_inr > 0 ? "text-paid" : "text-ink-3"} />
      </td>
      <td className={NUM}>
        <PhoneLabel>Still owed</PhoneLabel>
        <Figure inr={line.outstanding_inr} field="categories.outstanding_inr" watch={key} />
      </td>
      <td className={NUM}>
        <PhoneLabel>Not yet committed</PhoneLabel>
        {line.has_line ? (
          line.over_budget_inr > 0 ? (
            <span className="inline-flex items-center gap-1 text-due tabular-nums">
              <WarningCircle size={16} aria-hidden="true" className="shrink-0" />
              <Figure inr={line.over_budget_inr} field="categories.over_budget_inr" watch={key} className="text-due" /> over
            </span>
          ) : (
            <Figure inr={line.uncommitted_inr} field="categories.uncommitted_inr" watch={key} className="text-ink-2" />
          )
        ) : (
          <span className="text-ink-3">No line</span>
        )}
      </td>
    </tr>
  );
}

/**
 * The budget by category, in the read model's order (5.2), with the wedding's totals at the
 * foot: a single rule above and a double rule below. A category with no line shows "No line"
 * and is never over budget (M6). Server-safe.
 */
export function CategoryTable({ categories, totals }: { categories: BudgetCategoryLine[]; totals: MoneyTotals }) {
  return (
    <div className="overflow-hidden rounded-sheet border border-line bg-paper">
      <div className="md:overflow-x-auto md:overscroll-x-contain">
        <table className="w-full border-collapse text-table text-ink max-md:block md:min-w-160">
          <caption className="sr-only">Budget by category: planned, committed, paid, still owed and not yet committed</caption>
          <thead className="max-md:hidden">
            <tr>
              <th scope="col" className={TH}>
                Category
              </th>
              <th scope="col" className={TH_NUM}>
                Planned
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
              <th scope="col" className={TH_NUM}>
                Not yet committed
              </th>
            </tr>
          </thead>
          <tbody className="max-md:block [&>tr:first-child]:max-md:border-t-0">
            {categories.map((line) => (
              <CategoryRow key={line.budget_category} line={line} />
            ))}
            {totals.unallocated_inr > 0 ? (
              <tr className={ROW}>
                <th scope="row" className={NAME}>
                  <span className="text-body text-ink-2">Not assigned to a category</span>
                </th>
                <td className={NUM}>
                  <PhoneLabel>Planned</PhoneLabel>
                  <Figure inr={totals.unallocated_inr} field="unallocated_inr" watch="unallocated" className="text-ink-2" />
                </td>
                <td className="max-md:hidden" colSpan={4} />
              </tr>
            ) : null}
          </tbody>
          <tfoot className="max-md:block">
            <tr className={ROW}>
              <th scope="row" className={`${NAME} text-body font-semibold`}>
                Total
              </th>
              <TotalCell label="Budget">
                <Amount inr={totals.budget_inr} weight="total" field="budget_inr" className="text-ink-2" />
              </TotalCell>
              <TotalCell label="Committed">
                <Amount inr={totals.total_committed_inr} weight="total" field="total_committed_inr" />
              </TotalCell>
              <TotalCell label="Paid">
                <Amount inr={totals.total_paid_inr} weight="total" field="total_paid_inr" className="text-paid" />
              </TotalCell>
              <TotalCell label="Still owed">
                <Amount inr={totals.total_outstanding_inr} weight="total" field="total_outstanding_inr" />
              </TotalCell>
              <TotalCell label="Not yet committed">
                <Amount inr={totals.uncommitted_inr} weight="total" field="uncommitted_inr" className="text-ink-2" />
              </TotalCell>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
