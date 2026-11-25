import type { Metadata } from "next";
import Link from "next/link";

import { HighlightOnce } from "@/components/planner";
import { AddGuestForm } from "@/components/planner/guests/GuestForms";
import { HouseholdList } from "@/components/planner/guests/HouseholdList";
import { groupHouseholds } from "@/components/planner/guests/households";
import { ReplyTable } from "@/components/planner/guests/ReplyTable";
import { HIGHLIGHT_PARAM, parseHighlight, routes } from "@/contracts/routes";
import { dispatchCommand } from "@/server/actions/dispatch";

import { getWeddingProfile, readModel } from "../_lib/read";

type GuestsPageProps = {
  params: Promise<{ wedding_id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The `event_id` filter (routes.guests), or null for every function. A malformed id is ignored. */
function eventIdOf(query: Record<string, string | string[] | undefined>): string | null {
  const raw = query.event_id;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value !== undefined && UUID.test(value) ? value : null;
}

export const metadata: Metadata = { title: "Guests" };

/**
 * Guests (B4's minimum, D105, D110): the reply table per function from `rsvp_totals`, then
 * the households and invitations from `rsvp_guest_list`, filtered to one function with
 * `?event_id=`. Members record replies on a guest's behalf through `dispatchCommand` (AT-4.7).
 * Every figure comes from a read model, with the member's role filtering done on the server.
 */
export default async function GuestsPage({ params, searchParams }: GuestsPageProps) {
  const [{ wedding_id }, query] = await Promise.all([params, searchParams]);
  const highlight = parseHighlight(query[HIGHLIGHT_PARAM]);
  const requested = eventIdOf(query);

  const [profile, totals] = await Promise.all([getWeddingProfile(wedding_id), readModel("rsvp_totals", wedding_id)]);
  // Only a function this wedding has filters the list; anything else shows every function.
  const selected = totals.functions.find((row) => row.event_id === requested) ?? null;
  const list = await readModel("rsvp_guest_list", wedding_id, selected ? { event_id: selected.event_id } : {});
  // Owners set invitations and links (permissions: owner only); a manager's add is limited.
  const isOwner = profile.member.role === "owner";
  const functions = totals.functions.map((fn) => ({ event_id: fn.event_id, title: fn.title }));
  const households = groupHouseholds(list).map((h) => ({ household_id: h.household_id, household_name: h.household_name }));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-serif text-title text-ink">Guests</h1>

      <ReplyTable wedding_id={wedding_id} totals={totals} selected={selected?.event_id ?? null} />

      {selected ? (
        <p className="text-table text-ink-2">
          Showing guests invited to the {selected.title.toLowerCase()}.{" "}
          <Link
            href={routes.guests(wedding_id)}
            className="inline-flex min-h-11 items-center text-maroon underline underline-offset-4 hover:text-maroon-deep"
          >
            Show every function
          </Link>
        </p>
      ) : null}

      <AddGuestForm
        wedding_id={wedding_id}
        dispatch={dispatchCommand}
        isOwner={isOwner}
        functions={functions}
        households={households}
      />

      <HouseholdList
        wedding_id={wedding_id}
        dispatch={dispatchCommand}
        list={list}
        actorName={profile.member.display_name}
        filterTitle={selected?.title ?? null}
        ownerFunctions={isOwner ? functions : null}
      />

      <HighlightOnce keys={highlight} />
    </div>
  );
}
