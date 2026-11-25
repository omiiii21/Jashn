import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SectionPlaceholder } from "@/components/planner/shell/SectionPlaceholder";

import { getWeddingProfile } from "../_lib/read";

type ShagunPageProps = {
  params: Promise<{ wedding_id: string }>;
};

/** "Shagun" for owners only; a manager's not-found keeps the wedding's own title. */
export async function generateMetadata({ params }: ShagunPageProps): Promise<Metadata> {
  const { wedding_id } = await params;
  const profile = await getWeddingProfile(wedding_id);
  return profile.member.role === "owner" ? { title: "Shagun" } : {};
}

/**
 * Shagun, owners only: a manager gets not-found, so the URL shows her nothing (Should 13).
 * The register is future scope today (D131), so owners see one honest line and the nav
 * has no Shagun item.
 */
export default async function ShagunPage({ params }: ShagunPageProps) {
  const { wedding_id } = await params;
  const profile = await getWeddingProfile(wedding_id);
  if (profile.member.role !== "owner") notFound();

  return (
    <SectionPlaceholder title="Shagun">
      The shagun register isn&rsquo;t part of today&rsquo;s build.
    </SectionPlaceholder>
  );
}
