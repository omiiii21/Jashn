import type { CateringEstimateRow } from "@/contracts/read-models";

import { Amount } from "./Amount";
import { cx } from "./cx";
import { Wash } from "./Wash";

const RENEGOTIATE = "The contract changes only if you renegotiate it.";

export type EstimateBoxProps = {
  row: CateringEstimateRow;
  /** For `aria-labelledby`; give each box on a page its own. */
  id?: string;
  className?: string;
};

/**
 * The estimate from replies, in its own dashed box, never in the contract's cell
 * (design-direction 8, rule 2; acceptance AT-6.1): the read model's label, "≈" and the
 * figure, the formula, one sentence on how it compares with the contract, and both
 * headcounts. Every figure comes from `catering_estimate`; the sentence only picks
 * "below" or "above" from `direction` and drops the sign of `difference_inr`. Server-safe.
 */
export function EstimateBox({ row, id, className }: EstimateBoxProps) {
  const headingId = id ?? `estimate-${row.commitment_id}`;
  return (
    <section
      aria-labelledby={headingId}
      className={cx("rounded-control border border-dashed border-line-strong p-4 lg:p-6", className)}
    >
      <h3 id={headingId} className="text-body font-semibold text-ink">
        {row.label}
      </h3>
      <p lang="hi" className="text-body text-ink-2">
        {row.label_hi}
      </p>

      <p className="mt-3 flex flex-wrap items-baseline gap-x-2 text-ink">
        <span aria-hidden="true" className="text-panel text-ink-2">
          ≈
        </span>
        <span className="sr-only">About</span>
        <Wash watch={row.estimate_inr}>
          <Amount inr={row.estimate_inr} weight="panel" field="estimate_inr" />
        </Wash>
        <span className="text-meta text-ink-3">estimate</span>
      </p>
      <p data-field="formula_text" className="text-table text-ink-2 tabular-nums">
        {row.formula_text}
      </p>

      <p className="mt-3 text-body text-ink-2">
        {row.direction === "equal" ? (
          <>The same as the contract. {RENEGOTIATE}</>
        ) : (
          <>
            <Amount inr={Math.abs(row.difference_inr)} field="difference_inr" />{" "}
            {row.direction === "below" ? "below" : "above"} the contract. {RENEGOTIATE}
          </>
        )}
      </p>

      <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-3 border-t border-line pt-3">
        <div>
          <dt className="text-meta text-ink-3">Expected (planning)</dt>
          <dd className="text-body font-medium text-ink tabular-nums">
            {row.expected_headcount === null ? (
              <span className="font-normal text-ink-3">Not set</span>
            ) : (
              <span data-field="expected_headcount">{row.expected_headcount}</span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-meta text-ink-3">Confirmed</dt>
          <dd className="text-body font-medium text-ink tabular-nums">
            <Wash watch={row.confirmed_headcount}>
              <span data-field="confirmed_headcount" className="-mx-1 rounded-chip px-1">
                {row.confirmed_headcount}
              </span>
            </Wash>
          </dd>
        </div>
      </dl>
    </section>
  );
}
