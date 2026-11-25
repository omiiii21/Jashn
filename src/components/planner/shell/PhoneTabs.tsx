"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import type { WeddingId } from "@/contracts/domain";
import { useNewChanges } from "../activity/useNewChanges";
import { cx } from "../kit/cx";

import {
  PRIMARY_SECTIONS,
  SECTION_TITLES,
  activeSection,
  sectionHref,
  type NavSection,
  type SectionSeqs,
} from "./nav-items";

/**
 * The phone's six-tab row under the header (design-direction 10.1): Anek at width 85,
 * weight 500, in the meta role: 14 px on phones and 13 px from 768 px (DESIGN.md asks for
 * 14 px throughout, which needs a tab token from Lane E). The active tab has ivory text and
 * a gold underline. The row scrolls inside itself when it doesn't fit, never the page, and
 * keeps the active tab in view.
 */
export function PhoneTabs({
  wedding_id,
  className,
  latest = {},
}: {
  wedding_id: WeddingId;
  className?: string;
  /** The newest activity seq per section, for the gold dot (brief B3). */
  latest?: SectionSeqs;
}) {
  const current = activeSection(usePathname(), wedding_id);
  const fresh = useNewChanges(wedding_id, current as NavSection | null, latest);
  const activeRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const tab = activeRef.current;
    const row = tab?.parentElement?.parentElement;
    if (!tab || !row) return;
    const tabBox = tab.getBoundingClientRect();
    const rowBox = row.getBoundingClientRect();
    if (tabBox.left < rowBox.left || tabBox.right > rowBox.right) {
      // Only the row's own scroll moves: the page and the focus stay where they are.
      row.scrollLeft += tabBox.left - rowBox.left - (rowBox.width - tabBox.width) / 2;
    }
  }, [current]);

  return (
    <nav aria-label="Wedding sections" className={cx("min-w-0", className)}>
      <ul className="flex gap-2 overflow-x-auto overscroll-x-contain px-2 [scrollbar-width:none] md:px-4">
        {PRIMARY_SECTIONS.map((section) => {
          const active = current === section;
          return (
            <li key={section} className="shrink-0">
              <Link
                ref={active ? activeRef : undefined}
                href={sectionHref(wedding_id, section)}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex h-11 min-w-11 items-center justify-center border-b-2 px-2 text-meta font-medium font-stretch-85% transition-colors duration-150 ease-arrive focus-visible:-outline-offset-2",
                  active ? "border-gold text-ivory" : "border-transparent text-on-maroon-2 hover:text-ivory",
                )}
              >
                {SECTION_TITLES[section]}
                {fresh.has(section) ? (
                  <span className="ml-1 size-2 rounded-full bg-gold">
                    <span className="sr-only">, new changes</span>
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
