import type { Icon } from "@phosphor-icons/react";
import { CheckCircle, Clock, HourglassMedium, Info, Prohibit, WarningCircle } from "@phosphor-icons/react/ssr";
import type { ReactNode } from "react";

import { cx } from "./cx";

/** The status chips (DESIGN.md "Buttons and chips"). Colour never stands alone. */
export type StatusKind = "paid" | "due" | "overdue" | "proposed" | "void" | "overpaid";

const STATUS_STYLES: Record<StatusKind, { className: string; icon: Icon }> = {
  paid: { className: "bg-paid-tint text-paid", icon: CheckCircle },
  due: { className: "bg-due-tint text-due", icon: Clock },
  overdue: { className: "bg-overdue-tint text-overdue", icon: WarningCircle },
  proposed: { className: "bg-proposal-tint text-proposal", icon: HourglassMedium },
  void: { className: "bg-ivory-deep text-ink-3", icon: Prohibit },
  overpaid: { className: "bg-due-tint text-due", icon: Info },
};

export type StatusLabelProps = {
  kind: StatusKind;
  /** The word on the chip: "Paid in full", "Due Tue 1 Dec, in 6 days", "Void", "Overpaid ₹10,000". */
  label: ReactNode;
  /** A sentence beside the chip, in ink-2, such as why a vendor reads overpaid. */
  explanation?: ReactNode;
  /** The read-model field key the chip shows, as a highlight target (D121). */
  field?: string;
  className?: string;
};

/**
 * A status chip: tint ground, strong text, a Phosphor icon and a word, always all three.
 * 6 px corners. Server-safe.
 */
export function StatusLabel({ kind, label, explanation, field, className }: StatusLabelProps) {
  const style = STATUS_STYLES[kind];
  const StatusIcon = style.icon;
  const chip = (
    <span
      data-field={field}
      data-status={kind}
      className={cx(
        "inline-flex items-center gap-1 rounded-chip px-2 py-1 text-meta font-medium tabular-nums",
        style.className,
        explanation ? undefined : className,
      )}
    >
      <StatusIcon size={16} aria-hidden="true" className="shrink-0" />
      <span>{label}</span>
    </span>
  );
  if (!explanation) return chip;
  return (
    <span className={cx("inline-flex flex-wrap items-center gap-x-2 gap-y-1", className)}>
      {chip}
      <span className="text-meta text-ink-2">{explanation}</span>
    </span>
  );
}
