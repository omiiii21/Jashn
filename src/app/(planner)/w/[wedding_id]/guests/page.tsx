import type { Metadata } from "next";

import { SectionPlaceholder } from "@/components/planner/shell/SectionPlaceholder";

import { getMember } from "../_lib/read";

type GuestsPageProps = {
  params: Promise<{ wedding_id: string }>;
};

export const metadata: Metadata = { title: "Guests" };

/** Guests placeholder (brief B1). Households, invitations and the reply table land in B4. */
export default async function GuestsPage({ params }: GuestsPageProps) {
  const { wedding_id } = await params;
  await getMember(wedding_id);

  return (
    <SectionPlaceholder title="Guests">
      This page will list the households, who is invited to each function, and the replies so far.
    </SectionPlaceholder>
  );
}
