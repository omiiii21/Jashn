"use client";

import {
  CalendarDotsIcon,
  ClockCounterClockwiseIcon,
  CurrencyInrIcon,
  EnvelopeSimpleIcon,
  HouseLineIcon,
  StorefrontIcon,
  UsersThreeIcon,
  type Icon,
} from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import type { WeddingId } from "@/contracts/domain";
import { useNewChanges } from "../activity/useNewChanges";
import { cx } from "../kit/cx";

import {
  PRIMARY_SECTIONS,
  SECONDARY_SECTIONS,
  SECTION_TITLES,
  activeSection,
  sectionHref,
  type NavSection,
  type SectionSeqs,
} from "./nav-items";

/** Phosphor's nav set (design-direction 6): Regular at 24 px, Fill only when active. */
const NAV_ICONS: Record<NavSection, Icon> = {
  overview: HouseLineIcon,
  events: CalendarDotsIcon,
  guests: UsersThreeIcon,
  money: CurrencyInrIcon,
  vendors: StorefrontIcon,
  invite: EnvelopeSimpleIcon,
  activity: ClockCounterClockwiseIcon,
};

function RailLink({
  wedding_id,
  section,
  active,
  fresh,
}: {
  wedding_id: WeddingId;
  section: NavSection;
  active: boolean;
  fresh: boolean;
}) {
  const IconComponent = NAV_ICONS[section];
  return (
    <li>
      <Link
        href={sectionHref(wedding_id, section)}
        aria-current={active ? "page" : undefined}
        className={cx(
          "flex min-h-11 items-center gap-3 rounded-control px-3 text-body transition-colors duration-150 ease-arrive",
          active ? "bg-maroon font-medium text-ivory" : "text-ivory hover:bg-maroon/60",
        )}
      >
        <IconComponent size={24} weight={active ? "fill" : "regular"} aria-hidden="true" />
        <span>{SECTION_TITLES[section]}</span>
        {fresh ? (
          <span className="ml-auto size-2 rounded-full bg-gold">
            <span className="sr-only">, new changes</span>
          </span>
        ) : null}
      </Link>
    </li>
  );
}

/**
 * The rail's nav, from 1024 px up (DESIGN.md "Navigation and the header mic"): the six
 * sections, then Activity. The active item is a maroon block with a filled icon and
 * `aria-current="page"`; no side bar.
 */
export function PlannerNav({
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
  return (
    <nav aria-label="Wedding sections" className={className}>
      <ul className="flex flex-col gap-2">
        {PRIMARY_SECTIONS.map((section) => (
          <RailLink key={section} wedding_id={wedding_id} section={section} active={current === section} fresh={fresh.has(section)} />
        ))}
      </ul>
      <ul className="mt-4 flex flex-col gap-2 border-t border-maroon pt-4">
        {SECONDARY_SECTIONS.map((section) => (
          <RailLink key={section} wedding_id={wedding_id} section={section} active={current === section} fresh={fresh.has(section)} />
        ))}
      </ul>
    </nav>
  );
}
