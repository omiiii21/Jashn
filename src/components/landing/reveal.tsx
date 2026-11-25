"use client";

import { useEffect, useRef, useState, type ElementType, type ReactNode } from "react";

type RevealProps = {
  children: ReactNode;
  className?: string;
  /** The element to render; a `section` by default. */
  as?: ElementType;
  id?: string;
  /** How much of the element must be on screen before it reveals. */
  threshold?: number;
};

/**
 * Sets `data-shown` once the element scrolls into view, and never unsets it, so the CSS in
 * landing.module.css can run its reveal (rise, wipe, strike, fan) exactly once per visit.
 */
export function Reveal({ children, className, as: Tag = "section", id, threshold = 0.2 }: RevealProps) {
  const ref = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);

  return (
    <Tag ref={ref} id={id} className={className} data-shown={shown ? "true" : "false"}>
      {children}
    </Tag>
  );
}

/** Use inside a Reveal: the element starts once its ancestor's `data-shown` turns true. */
export function useInView<T extends HTMLElement>(threshold = 0.35) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);

  return [ref, inView] as const;
}
