import type { Metadata } from "next";

import { SectionPlaceholder } from "@/components/planner/shell/SectionPlaceholder";

import { getMember } from "../_lib/read";

type ActivityPageProps = {
  params: Promise<{ wedding_id: string }>;
};

export const metadata: Metadata = { title: "Activity" };

/** Activity placeholder (brief B1). The feed with its filters lands in B3. */
export default async function ActivityPage({ params }: ActivityPageProps) {
  const { wedding_id } = await params;
  await getMember(wedding_id);

  return (
    <SectionPlaceholder title="Activity">
      This page will list every change to the wedding, newest first, with who made it and when.
    </SectionPlaceholder>
  );
}
