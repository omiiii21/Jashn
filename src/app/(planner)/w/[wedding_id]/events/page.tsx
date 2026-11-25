import type { Metadata } from "next";

import { HighlightOnce } from "@/components/planner";
import { EventsView } from "@/components/planner/events/EventsView";
import { HIGHLIGHT_PARAM, parseHighlight } from "@/contracts/routes";
import { dispatchCommand } from "@/server/actions/dispatch";

import { getWeddingProfile, readModel } from "../_lib/read";

type EventsPageProps = {
  params: Promise<{ wedding_id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === undefined || raw === "" ? null : raw;
}

/** "Events", or the selected function's name ("Reception"). */
export async function generateMetadata({ params, searchParams }: EventsPageProps): Promise<Metadata> {
  const [{ wedding_id }, query] = await Promise.all([params, searchParams]);
  const event_id = first(query.event_id);
  if (event_id === null) return { title: "Events" };
  const itinerary = await readModel("itinerary", wedding_id);
  const fn = itinerary.functions.find((item) => item.event_id === event_id);
  return { title: fn ? fn.title : "Events" };
}

/**
 * Events (brief B3): the functions by IST day, the draft-and-publish line, conflict warnings
 * in their rows, and the selected function's detail (the `event_id` query parameter) with its
 * edit and add-requirement forms. Owners publish through Lane D's PublishSheet (D59).
 */
export default async function EventsPage({ params, searchParams }: EventsPageProps) {
  const [{ wedding_id }, query] = await Promise.all([params, searchParams]);
  const highlight = parseHighlight(query[HIGHLIGHT_PARAM]);
  const [itinerary, profile] = await Promise.all([readModel("itinerary", wedding_id), getWeddingProfile(wedding_id)]);

  return (
    <>
      <EventsView
        wedding_id={wedding_id}
        itinerary={itinerary}
        selected_id={first(query.event_id)}
        is_owner={profile.member.role === "owner"}
        member_name={profile.member.display_name}
        dispatch={dispatchCommand}
      />
      <HighlightOnce keys={highlight} />
    </>
  );
}
