import type { Metadata } from "next";

import { SectionPlaceholder } from "@/components/planner/shell/SectionPlaceholder";

import { getMember } from "../_lib/read";

type EventsPageProps = {
  params: Promise<{ wedding_id: string }>;
};

export const metadata: Metadata = { title: "Events" };

/** Events placeholder (brief B1). The functions, the draft view and PublishSheet land in B3. */
export default async function EventsPage({ params }: EventsPageProps) {
  const { wedding_id } = await params;
  await getMember(wedding_id);

  return (
    <SectionPlaceholder title="Events">
      This page will list the functions day by day, with the time, venue and dress code of each, and mark the draft
      changes guests don&rsquo;t see until an owner publishes them.
    </SectionPlaceholder>
  );
}
