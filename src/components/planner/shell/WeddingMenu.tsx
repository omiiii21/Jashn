"use client";

import { ClockCounterClockwiseIcon, DotsThreeVerticalIcon, UsersThreeIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";

import type { Dispatch } from "@/components/planner/forms/command";
import { cx } from "@/components/planner/kit/cx";
import { TeamSheet } from "@/components/planner/team/TeamSheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { MemberRole, WeddingId } from "@/contracts/domain";

import { SECTION_TITLES, activeSection, sectionHref } from "./nav-items";

type WeddingMenuProps = {
  wedding_id: WeddingId;
  /** "Mira & Kabir". */
  wedding_name: string;
  /** "Mira, owner". */
  member_label: string;
  /** The signed-in member's role: owners also get "Team and sharing". */
  role: MemberRole;
  /** `dispatchCommand` from the server layout (D98). */
  dispatch: Dispatch;
};

const ITEM_CLASS =
  "min-h-11 gap-3 rounded-chip px-3 text-ink focus:bg-ivory focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-maroon focus-visible:outline-solid";

/**
 * The wedding menu in the shell header. Below 1024 px it is the way to Activity (the
 * phone's tab row has only the six sections) and says who is signed in. For owners it also
 * opens the "Team and sharing" sheet (D64, D109), with no route of its own, so their trigger
 * shows at every width; a manager's trigger hides from 1024 px, where the rail shows the rest.
 */
export function WeddingMenu({ wedding_id, wedding_name, member_label, role, dispatch }: WeddingMenuProps) {
  const onActivity = activeSection(usePathname(), wedding_id) === "activity";
  const isOwner = role === "owner";
  const [teamOpen, setTeamOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  function closeTeam() {
    setTeamOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger
          ref={triggerRef}
          aria-label="Wedding menu"
          className={cx(
            "inline-flex size-11 shrink-0 items-center justify-center rounded-control text-ivory transition-colors duration-150 ease-arrive hover:bg-maroon data-[state=open]:bg-maroon",
            isOwner ? undefined : "lg:hidden",
          )}
        >
          <DotsThreeVerticalIcon size={24} aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          sideOffset={8}
          className="w-auto min-w-56 rounded-control bg-paper p-1 text-ink shadow-overlay ring-0"
          // The sheet takes focus when it opens; the menu must not pull it back to the trigger.
          onCloseAutoFocus={(event) => {
            if (teamOpen) event.preventDefault();
          }}
        >
          {/* The shared cn() drops the type-size tokens, so sizes sit on inner spans. */}
          <DropdownMenuLabel className="px-3 py-2 font-normal text-ink-3">
            <span className="block font-serif text-heading text-ink">{wedding_name}</span>
            <span className="block text-meta">Signed in as {member_label}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-line" />
          {/* The primitive hides the outline; keyboard focus gets the 2 px maroon ring back. */}
          <DropdownMenuItem asChild className={ITEM_CLASS}>
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
          {isOwner ? (
            <DropdownMenuItem className={ITEM_CLASS} onSelect={() => setTeamOpen(true)}>
              <UsersThreeIcon size={20} className="size-5" aria-hidden="true" />
              <span className="text-body">Team and sharing</span>
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {isOwner && teamOpen ? <TeamSheet wedding_id={wedding_id} dispatch={dispatch} onClose={closeTeam} /> : null}
    </>
  );
}
