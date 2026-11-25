import type { ReactNode } from "react";

import { cx } from "./cx";

export type SectionHeadingProps = {
  children: ReactNode;
  /** Short meta on the right, such as a count or a reference: "COM-01". */
  meta?: ReactNode;
  /** For `aria-labelledby` on the section it heads. */
  id?: string;
  /** h2 by default; h3 inside a section that already has one. */
  level?: 2 | 3;
  className?: string;
};

/** A section heading in Anek 18/26 600, with optional meta on the right. Server-safe. */
export function SectionHeading({ children, meta, id, level = 2, className }: SectionHeadingProps) {
  const Heading = level === 3 ? "h3" : "h2";
  return (
    <div className={cx("flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1", className)}>
      <Heading id={id} className="text-heading text-ink">
        {children}
      </Heading>
      {meta ? <div className="text-meta text-ink-3 tabular-nums">{meta}</div> : null}
    </div>
  );
}
