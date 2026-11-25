import type { ReactNode } from "react";

import { cx } from "./cx";

export type EmptyStateProps = {
  /** The teaching line: "No payments yet. Say 'I paid the caterer fifty thousand' or record one." */
  children: ReactNode;
  /** An optional control that does what the line suggests. */
  action?: ReactNode;
  className?: string;
};

/**
 * An empty state that teaches by example (design-direction 9, ban 22): one plain line in
 * ink-2, and the action when there is one. No illustration. Server-safe.
 */
export function EmptyState({ children, action, className }: EmptyStateProps) {
  return (
    <div className={cx("flex flex-col items-start gap-3 py-3", className)}>
      <p className="max-w-prose text-body text-ink-2">{children}</p>
      {action}
    </div>
  );
}
