import { formatInr } from "@/contracts/money";

import { cx } from "./cx";

export type AmountWeight = "cell" | "total" | "panel";

export type AmountProps = {
  /** Whole rupees from a read model. Never computed in a component (M8). */
  inr: number;
  /** "cell" 500 in rows, "total" 600 in totals, "panel" 22/28 600 for a key figure. */
  weight?: AmountWeight;
  /** The read-model field key, the highlight target (D121): "outstanding_inr". */
  field?: string;
  className?: string;
};

const WEIGHT_CLASSES: Record<AmountWeight, string> = {
  cell: "font-medium",
  total: "font-semibold",
  panel: "text-panel font-semibold",
};

/**
 * One amount: Anek with tabular figures, en-IN grouping and the ₹ attached ("₹1,50,000").
 * Never Eczar, never monospace. Server-safe. The 4 px inset padding gives the wash room
 * around the figures without moving anything.
 */
export function Amount({ inr, weight = "cell", field, className }: AmountProps) {
  return (
    <span
      data-field={field}
      className={cx("-mx-1 rounded-chip px-1 font-sans tabular-nums whitespace-nowrap", WEIGHT_CLASSES[weight], className)}
    >
      {formatInr(inr)}
    </span>
  );
}
