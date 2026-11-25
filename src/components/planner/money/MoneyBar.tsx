import { formatInr } from "@/contracts/money";
import type { MoneyTotals } from "@/contracts/read-models";

import { moneyBarDescription } from "./money-text";

/**
 * The one segmented bar (design-direction 8): paid solid green, committed-and-owed outlined
 * maroon on maroon-tint, the rest of the budget dashed. Segment widths come straight from the
 * read-model figures as flex weights, so the component does no arithmetic. Values are printed
 * beside it in a legend that names each fill, so colour never stands alone. Server-safe.
 */
export function MoneyBar({
  totals,
  values = true,
}: {
  totals: MoneyTotals;
  /** False where a labelled list of the same figures sits beside the bar: the legend then names the fills only. */
  values?: boolean;
}) {
  const segments = [
    {
      key: "total_paid_inr",
      label: "Paid",
      value: totals.total_paid_inr,
      bar: "bg-paid",
      swatch: "bg-paid",
    },
    {
      key: "total_outstanding_inr",
      label: "Committed, still owed",
      value: totals.total_outstanding_inr,
      bar: "border-2 border-maroon bg-maroon-tint",
      swatch: "border-2 border-maroon bg-maroon-tint",
    },
    {
      key: "uncommitted_inr",
      label: "Not yet committed",
      value: totals.uncommitted_inr,
      bar: "border-2 border-dashed border-line-strong",
      swatch: "border-2 border-dashed border-line-strong",
    },
  ].filter((segment) => segment.value > 0);

  return (
    <figure className="flex flex-col gap-3">
      <div role="img" aria-label={moneyBarDescription(totals)} className="flex h-6 w-full gap-0.5">
        {segments.map((segment) => (
          <span
            key={segment.key}
            className={`h-full min-w-1 basis-0 rounded-chip ${segment.bar}`}
            style={{ flexGrow: segment.value }}
          />
        ))}
      </div>
      <figcaption>
        <ul className="flex flex-wrap gap-x-6 gap-y-2 text-table text-ink-2">
          {segments.map((segment) => (
            <li key={segment.key} className="inline-flex items-center gap-2">
              <span aria-hidden="true" className={`inline-block size-3 rounded-chip ${segment.swatch}`} />
              {segment.label}
              {values ? (
                <span data-field={segment.key} className="font-medium text-ink tabular-nums">
                  {formatInr(segment.value)}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  );
}
