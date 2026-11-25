import type { ReactNode } from "react";

import { Amount, type AmountWeight } from "./Amount";
import { cx } from "./cx";
import { Wash } from "./Wash";

/** The figure's colour: ink by default, paid green for Paid, amber or vermilion for a due Still owed. */
export type MoneyTone = "ink" | "paid" | "due" | "overdue";

const TONE_CLASSES: Record<MoneyTone, string> = {
  ink: "text-ink",
  paid: "text-paid",
  due: "text-due",
  overdue: "text-overdue",
};

export type MoneyRowProps = {
  /** "Committed", "Paid", "Still owed" (never "Outstanding"). */
  label: ReactNode;
  /** The draft Hindi label beside it, as English's equal (DESIGN.md): "तय", "दिया", "बाकी". */
  label_hi?: string;
  inr: number;
  /** The read-model field key, the highlight target (D121). */
  field?: string;
  weight?: AmountWeight;
  tone?: MoneyTone;
  /** A total: a single rule above the figure and a double rule below, as in accounting. */
  total?: boolean;
  /** A line under the label, such as the due date. */
  note?: ReactNode;
  className?: string;
};

/**
 * One labelled figure: the label on the left, the amount right-aligned in tabular figures.
 * Renders a `div` of `dt` and `dd`, so it sits inside a `<dl>`. The figure washes when a new
 * value arrives (Wash). Server-safe; the wash is its only client part.
 */
export function MoneyRow({
  label,
  label_hi,
  inr,
  field,
  weight = "cell",
  tone = "ink",
  total = false,
  note,
  className,
}: MoneyRowProps) {
  return (
    <div className={cx("flex items-baseline justify-between gap-4 py-2", className)}>
      <dt className="min-w-0">
        <span className="text-body text-ink-2">{label}</span>
        {label_hi ? (
          <span lang="hi" className="ml-2 text-body text-ink-2">
            {label_hi}
          </span>
        ) : null}
        {note ? <span className="mt-1 block text-meta text-ink-3">{note}</span> : null}
      </dt>
      <dd className={cx("min-w-32 shrink-0 text-right", TONE_CLASSES[tone], total && "border-t border-line-strong pt-2")}>
        <Wash watch={inr} className={total ? "block border-b-3 border-double border-line-strong pb-1" : undefined}>
          <Amount inr={inr} weight={weight} field={field} />
        </Wash>
      </dd>
    </div>
  );
}
