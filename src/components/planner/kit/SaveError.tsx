import { WarningCircle } from "@phosphor-icons/react/ssr";

import { cx } from "./cx";

export type SaveErrorProps = {
  /** What happened, without apologising: "The amount must be whole rupees, like 40,000." */
  message: string;
  /** What to do next: "Check the amount and save again." */
  next?: string;
  /** The field this error belongs to, for the input's `aria-describedby`. */
  id?: string;
  className?: string;
};

/**
 * The inline save error, right under the field or the button (DESIGN.md "Containers and
 * fields"): WarningCircle in vermilion, what happened and what to do next. Never a toast.
 * Server-safe; forms render it from their own state.
 */
export function SaveError({ message, next, id, className }: SaveErrorProps) {
  return (
    <p id={id} role="alert" className={cx("flex items-start gap-2 text-meta text-overdue", className)}>
      <WarningCircle size={16} aria-hidden="true" className="shrink-0" />
      <span>
        {message}
        {next ? ` ${next}` : null}
      </span>
    </p>
  );
}
