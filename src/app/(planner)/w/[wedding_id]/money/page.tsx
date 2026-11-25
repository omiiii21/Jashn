import type { Metadata } from "next";
import Link from "next/link";

import { SectionPlaceholder } from "@/components/planner/shell/SectionPlaceholder";
import { routes } from "@/contracts/routes";

import { getMember } from "../_lib/read";

type MoneyPageProps = {
  params: Promise<{ wedding_id: string }>;
};

export const metadata: Metadata = { title: "Money" };

/** Money placeholder (brief B1). The ledger, the money bar and the approvals land in B2. */
export default async function MoneyPage({ params }: MoneyPageProps) {
  const { wedding_id } = await params;
  await getMember(wedding_id);

  return (
    <SectionPlaceholder title="Money">
      This page will set the budget beside what is committed, paid and still owed, category by category. Each
      vendor&rsquo;s account is already open in{" "}
      <Link href={routes.vendors(wedding_id)} className="py-3 text-maroon underline underline-offset-4 hover:text-maroon-deep">
        Vendors
      </Link>
      .
    </SectionPlaceholder>
  );
}
