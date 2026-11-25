"use client";

import { usePathname } from "next/navigation";

import type { WeddingId } from "@/contracts/domain";
import { cx } from "../kit/cx";

import { SECTION_TITLES, activeSection } from "./nav-items";

/**
 * The current section's name in the desktop header (design-direction 10.1). Layouts don't
 * re-render on navigation, so it follows the pathname on the client. It is a label, not a
 * heading: each page carries its own h1.
 */
export function SectionTitle({ wedding_id, className }: { wedding_id: WeddingId; className?: string }) {
  const current = activeSection(usePathname(), wedding_id);
  if (!current) return null;
  return <p className={cx("truncate text-heading text-ivory", className)}>{SECTION_TITLES[current]}</p>;
}
