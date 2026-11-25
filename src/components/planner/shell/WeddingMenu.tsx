"use client";

import { ClockCounterClockwiseIcon, DotsThreeVerticalIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { WeddingId } from "@/contracts/domain";

import { SECTION_TITLES, activeSection, sectionHref } from "./nav-items";

type WeddingMenuProps = {
  wedding_id: WeddingId;
  /** "Mira & Kabir". */
  wedding_name: string;
  /** "Mira, owner". */
  member_label: string;
};

/**
 * The wedding menu in the shell header. Below 1024 px it is the way to Activity (the
 * phone's tab row has only the six sections) and says who is signed in. From 1024 px the
 * rail already shows all of that, so the trigger hides and the mic stands alone at the
 * header's end. The owners-only "Team and sharing" item joins it in a later batch (D64,
 * D109), with no route of its own; the trigger then shows at every width again.
 */
export function WeddingMenu({ wedding_id, wedding_name, member_label }: WeddingMenuProps) {
  const onActivity = activeSection(usePathname(), wedding_id) === "activity";
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        aria-label="Wedding menu"
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-control text-ivory transition-colors duration-150 ease-arrive hover:bg-maroon data-[state=open]:bg-maroon lg:hidden"
      >
        <DotsThreeVerticalIcon size={24} aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-auto min-w-56 rounded-control bg-paper p-1 text-ink shadow-overlay ring-0"
      >
        {/* The shared cn() drops the type-size tokens, so sizes sit on inner spans. */}
        <DropdownMenuLabel className="px-3 py-2 font-normal text-ink-3">
          <span className="block font-serif text-heading text-ink">{wedding_name}</span>
          <span className="block text-meta">Signed in as {member_label}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-line" />
        {/* The primitive hides the outline; keyboard focus gets the 2 px maroon ring back. */}
        <DropdownMenuItem
          asChild
          className="min-h-11 gap-3 rounded-chip px-3 text-ink focus:bg-ivory focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-maroon focus-visible:outline-solid"
        >
          <Link href={sectionHref(wedding_id, "activity")} aria-current={onActivity ? "page" : undefined}>
            <ClockCounterClockwiseIcon
              size={20}
              weight={onActivity ? "fill" : "regular"}
              className="size-5"
              aria-hidden="true"
            />
            <span className="text-body">{SECTION_TITLES.activity}</span>
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
