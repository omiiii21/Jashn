import type { IsoInstant } from "@/contracts/domain";
import { formatInr } from "@/contracts/money";

import { formatDayTime } from "../format";
import { Amount, type AmountWeight } from "./Amount";
import { cx } from "./cx";

export type CorrectionTrailProps = {
  /** The struck-through value: the version before the current one (`previous_amount_inr`, C7). */
  previous_inr: number;
  /** The current value. */
  current_inr: number;
  /** The highlight target on the current value (D121). */
  field?: string;
  weight?: AmountWeight;
  className?: string;
};

/**
 * The correction trail, the khata's signature (DESIGN.md "Money row and the correction
 * trail"): the old figure struck through with a 1.5 px ink-3 line, the new one beside it in
 * ink. Nothing is erased. Server-safe.
 */
export function CorrectionTrail({ previous_inr, current_inr, field, weight = "cell", className }: CorrectionTrailProps) {
  return (
    <span className={cx("inline-flex flex-wrap items-baseline justify-end gap-x-2", className)}>
      <del className="font-sans text-ink-3 tabular-nums whitespace-nowrap line-through decoration-ink-3 decoration-[1.5px]">
        <span className="sr-only">Was </span>
        {formatInr(previous_inr)}
      </del>
      <ins className="text-ink no-underline">
        <span className="sr-only">now </span>
        <Amount inr={current_inr} weight={weight} field={field} />
      </ins>
    </span>
  );
}

/** "Corrected by Mira, 25 Nov, 1:42 pm" (IST), under a corrected row. Server-safe. */
export function CorrectedBy({ by, at, className }: { by: string; at: IsoInstant; className?: string }) {
  return (
    <span className={cx("text-meta text-ink-3", className)}>
      Corrected by {by},{" "}
      <time dateTime={at} className="tabular-nums whitespace-nowrap">
        {formatDayTime(at)}
      </time>
    </span>
  );
}
