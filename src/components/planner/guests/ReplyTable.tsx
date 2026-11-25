import Link from "next/link";

import { EmptyState, SectionHeading, Wash } from "@/components/planner";
import type { WeddingId } from "@/contracts/domain";
import type { RsvpTotals, RsvpTotalsRow } from "@/contracts/read-models";
import { routes } from "@/contracts/routes";

const TH = "px-3 py-3 text-left text-meta font-medium text-ink-3";
const TH_NUM = "px-3 py-3 text-right text-meta font-medium text-ink-3";
const NUM = "px-3 py-3 text-right align-baseline tabular-nums";
// The planning column is set apart: its own ground and a rule, so it never reads as a sum.
// Below 768 px it stays pinned at the right edge while the counts scroll, so a phone always
// shows it beside the function name.
const PLAN = "border-l border-line bg-ivory max-md:sticky max-md:right-0 max-md:z-10";

type CountKey = "invited" | "attending" | "declined" | "pending";

const COUNT_COLUMNS: { key: CountKey; label: string }[] = [
  { key: "invited", label: "Invited" },
  { key: "attending", label: "Attending" },
  { key: "declined", label: "Declined" },
  { key: "pending", label: "Pending" },
];

function Count({ row, field }: { row: RsvpTotalsRow; field: CountKey }) {
  const value = row[field];
  return (
    <Wash watch={value}>
      <span data-field={field} className="tabular-nums">
        {value.toLocaleString("en-IN")}
      </span>
    </Wash>
  );
}

/**
 * The reply table (AT-4.8, D110): one row per active function from `rsvp_totals`, with
 * Invited, Attending, Declined and Pending as stored counts, and "Expected (planning)" set
 * apart as the planning number it is (E7). Each count washes when a new value arrives, so
 * Tara's reply washes the reception's attending count. Server-safe; `Wash` is the client part.
 */
export function ReplyTable({
  wedding_id,
  totals,
  selected,
}: {
  wedding_id: WeddingId;
  totals: RsvpTotals;
  /** The function the households list is filtered to, if any. */
  selected: string | null;
}) {
  if (totals.functions.length === 0) {
    return (
      <section aria-label="Replies" className="rounded-sheet border border-line bg-paper p-4 lg:p-6">
        <EmptyState>No functions yet. Add one on Events, and its replies show here.</EmptyState>
      </section>
    );
  }

  return (
    <section aria-labelledby="replies-heading" className="overflow-hidden rounded-sheet border border-line bg-paper">
      <SectionHeading id="replies-heading" className="px-4 pt-4 pb-1 lg:px-6">
        Replies by function
      </SectionHeading>
      <div className="overflow-x-auto overscroll-x-contain">
        <table className="w-full min-w-136 border-collapse text-table text-ink">
          <caption className="sr-only">
            Invited, attending, declined and pending for each function, with the expected number for planning
          </caption>
          <thead>
            <tr>
              <th scope="col" className={`${TH} sticky left-0 z-10 bg-paper lg:pl-6`}>
                Function
              </th>
              {COUNT_COLUMNS.map((column) => (
                <th key={column.key} scope="col" className={TH_NUM}>
                  {column.label}
                </th>
              ))}
              <th scope="col" className={`${TH_NUM} ${PLAN} lg:pr-6`}>
                Expected <span className="whitespace-nowrap">(planning)</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {totals.functions.map((row) => {
              const isSelected = selected === row.event_id;
              return (
                <tr key={row.event_id} data-event-id={row.event_id} className="border-t border-line">
                  <th scope="row" className="sticky left-0 z-10 bg-paper px-3 py-1 text-left font-normal lg:pl-6">
                    <Link
                      href={routes.guests(wedding_id, isSelected ? undefined : row.event_id)}
                      aria-current={isSelected ? "true" : undefined}
                      className="inline-flex min-h-11 flex-wrap items-baseline gap-x-2 py-2 text-body font-medium text-maroon underline-offset-4 hover:text-maroon-deep hover:underline aria-[current=true]:underline"
                    >
                      <span>{row.title}</span>
                      <span lang="hi" className="text-meta font-normal text-ink-3">
                        {row.title_hi}
                      </span>
                    </Link>
                  </th>
                  {COUNT_COLUMNS.map((column) => (
                    <td key={column.key} className={NUM}>
                      <Count row={row} field={column.key} />
                    </td>
                  ))}
                  <td className={`${NUM} ${PLAN} text-ink-2 lg:pr-6`}>
                    {row.expected_headcount === null ? (
                      <span className="text-ink-3">Not set</span>
                    ) : (
                      <Wash watch={row.expected_headcount}>
                        <span data-field="expected_headcount" className="tabular-nums">
                          {row.expected_headcount.toLocaleString("en-IN")}
                        </span>
                      </Wash>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="border-t border-line px-4 py-3 text-meta text-ink-2 lg:px-6">
        Expected is the planning number set on each function. It is never added into the replies.
      </p>
    </section>
  );
}
