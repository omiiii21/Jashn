import type { Metadata } from "next";

import { HighlightOnce } from "@/components/planner";
import { ActivityFeedView } from "@/components/planner/activity/ActivityFeedView";
import { feedParams } from "@/components/planner/activity/activity-text";
import { HIGHLIGHT_PARAM, parseHighlight } from "@/contracts/routes";

import { getWeddingProfile, readModel } from "../_lib/read";

type ActivityPageProps = {
  params: Promise<{ wedding_id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata: Metadata = { title: "Activity" };

function first(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "" ? undefined : raw;
}

/**
 * Activity (brief B3): the feed from `activity_feed`, newest first, filtered by day, person and
 * topic through query parameters, and paged with `before_seq`. The read model scopes what
 * each role sees (AT-8.5: Mira 5 entries at D0, Diya 4).
 */
export default async function ActivityPage({ params, searchParams }: ActivityPageProps) {
  const [{ wedding_id }, query] = await Promise.all([params, searchParams]);
  const profile = await getWeddingProfile(wedding_id);
  const feedQuery = { day: first(query.day), topic: first(query.topic), before: first(query.before) };
  const person = first(query.person) === "me" ? "me" : undefined;
  const feed = await readModel("activity_feed", wedding_id, {
    ...feedParams(feedQuery),
    ...(person ? { actor_member_id: profile.member.member_id } : {}),
  });

  return (
    <>
      <ActivityFeedView
        wedding_id={wedding_id}
        feed={feed}
        query={{ ...feedQuery, day: feedQuery.day === "today" ? "today" : undefined, person }}
        member={profile.member}
      />
      <HighlightOnce keys={parseHighlight(query[HIGHLIGHT_PARAM])} />
    </>
  );
}
