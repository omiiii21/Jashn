import { LockSimple } from "@phosphor-icons/react/ssr";

import { cx } from "./cx";

/**
 * What a hidden block shows (G7): a lock and "Not shared with you", never a zero. Render it
 * when the block's name is in the read model's `hidden` list. Server-safe.
 */
export function NotShared({ className }: { className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-2 text-ink-3", className)}>
      <LockSimple size={16} aria-hidden="true" className="shrink-0" />
      <span>Not shared with you</span>
    </span>
  );
}
