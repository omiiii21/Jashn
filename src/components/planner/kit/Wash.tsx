"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { washElement } from "./wash-element";

export type WashProps = {
  /** The value shown inside. When it changes after the first render, the wrapper washes. */
  watch: string | number | null;
  children: ReactNode;
  className?: string;
  /** The wrapper element: "span" (default) inline, "div" for a block. */
  as?: "span" | "div";
};

/**
 * "A change appeared" (design-direction 7.2): wraps a figure and washes it when a new value
 * arrives through `router.refresh()` (the 2.5 s poll, or the speaker's own save). Nothing on
 * the first render, no toast, and focus and scroll never move. The 2.5 s refresh keeps this
 * component's state, so it compares against the value it showed last.
 */
export function Wash({ watch, children, className, as = "span" }: WashProps) {
  const ref = useRef<HTMLElement | null>(null);
  const shown = useRef(watch);

  useEffect(() => {
    if (Object.is(shown.current, watch)) return;
    shown.current = watch;
    if (ref.current) washElement(ref.current);
  }, [watch]);

  if (as === "div") {
    return (
      <div ref={(node) => void (ref.current = node)} className={className}>
        {children}
      </div>
    );
  }
  return (
    <span ref={(node) => void (ref.current = node)} className={className}>
      {children}
    </span>
  );
}
