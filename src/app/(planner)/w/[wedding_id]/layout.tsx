import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";

import { LiveRefresh } from "@/components/live/LiveRefresh";
import { formatDate, formatDateRange } from "@/components/planner/format";
import { FocusMain, MAIN_ID } from "@/components/planner/shell/FocusMain";
import { memberLabel } from "@/components/planner/shell/member-label";
import { PhoneTabs } from "@/components/planner/shell/PhoneTabs";
import { PlannerNav } from "@/components/planner/shell/PlannerNav";
import { SampleBadge } from "@/components/planner/shell/SampleBadge";
import { Seal } from "@/components/planner/shell/Seal";
import { SectionTitle } from "@/components/planner/shell/SectionTitle";
import { WeddingMenu } from "@/components/planner/shell/WeddingMenu";
import { VoiceDock } from "@/components/voice/VoiceDock";
import { routes } from "@/contracts/routes";

import { getWeddingProfile } from "./_lib/read";

/** Final props (architecture 4.3, decision D97): Next's `children` and `params`. */
type WeddingShellLayoutProps = {
  children: ReactNode;
  params: Promise<{ wedding_id: string }>;
};

/**
 * Each page's title reads "Money, Mira & Kabir", and the landing view's "Mira & Kabir", so
 * Next's route announcer speaks every move between sections (it announces a new title).
 */
export async function generateMetadata({ params }: Pick<WeddingShellLayoutProps, "params">): Promise<Metadata> {
  const { wedding_id } = await params;
  const profile = await getWeddingProfile(wedding_id);
  return { title: { template: `%s, ${profile.display_name}`, default: profile.display_name } };
}

/** Planner screens poll the version every 2.5 s while visible (architecture 2.4, D37). */
const VERSION_POLL_MS = 2500;

/**
 * The planner shell for one wedding (brief B1; DESIGN.md "Layout" and "Navigation and the
 * header mic"; design-direction 10.1). It reads `wedding_profile` (D99) for the name, the
 * dates, the city, the member's role and `is_sample`.
 *
 * - From 1024 px a maroon-deep rail (an `aside` landmark): the seal, the wedding name in
 *   Eczar, the dates and city, the nav, and the signed-in member at its foot.
 * - One sticky maroon-deep header at every width: the seal and name on phones, the
 *   section title on desktop, the "Fictional demo data" badge, the wedding menu (below
 *   1024 px for now), and the voice slot at the right end, which renders `VoiceDock`
 *   exactly once (D20, D121).
 *   Nothing sits at the foot of the screen.
 * - Under the header on phones, the six-tab row.
 */
export default async function WeddingShellLayout({ children, params }: WeddingShellLayoutProps) {
  const { wedding_id } = await params;
  const profile = await getWeddingProfile(wedding_id);

  const dates = formatDateRange(profile.first_event_date, profile.last_event_date) ?? formatDate(profile.wedding_date);
  const member_label = memberLabel(profile.member);

  return (
    <div className="flex min-h-full w-full min-w-0 flex-1 bg-ivory text-ink">
      <a
        href={`#${MAIN_ID}`}
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-control focus:bg-paper focus:px-4 focus:py-3 focus:text-body focus:text-ink focus:shadow-overlay"
      >
        Skip to content
      </a>

      {/* The cover runs the page's full height; the rail's contents stay pinned to the viewport. */}
      <aside aria-label="Wedding" data-surface="shell" className="hidden w-64 shrink-0 bg-maroon-deep text-ivory lg:block">
        <div className="sticky top-0 flex h-dvh flex-col overflow-y-auto px-4 py-6">
          <div className="px-3">
            <Seal bride_name={profile.bride_name} groom_name={profile.groom_name} />
            <p className="mt-4 font-serif text-rail-name text-ivory">{profile.display_name}</p>
            <p className="mt-1 text-meta text-on-maroon-2 tabular-nums">{dates}</p>
            {profile.city ? <p className="text-meta text-on-maroon-2">{profile.city}</p> : null}
          </div>
          <PlannerNav wedding_id={wedding_id} className="mt-8" />
          <p className="mt-auto px-3 pt-8 text-meta text-on-maroon-2">{member_label}</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header data-surface="shell" className="sticky top-0 z-30 bg-maroon-deep text-ivory">
          <div className="flex min-h-16 items-center gap-2 px-4 py-2 md:px-6 lg:gap-3 lg:px-8">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <Seal bride_name={profile.bride_name} groom_name={profile.groom_name} size="header" className="lg:hidden" />
              <div className="flex min-w-0 flex-1 flex-col items-start gap-1 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
                <p className="max-w-full truncate font-serif text-rail-name text-ivory lg:hidden">{profile.display_name}</p>
                <SectionTitle wedding_id={wedding_id} className="hidden min-w-0 lg:block" />
                {profile.is_sample ? <SampleBadge /> : null}
              </div>
            </div>
            <WeddingMenu wedding_id={wedding_id} wedding_name={profile.display_name} member_label={member_label} />
            <div data-slot="voice" className="flex shrink-0 items-center gap-2">
              <VoiceDock wedding_id={wedding_id} />
            </div>
          </div>
          <PhoneTabs wedding_id={wedding_id} className="lg:hidden" />
        </header>

        <main id={MAIN_ID} tabIndex={-1} className="flex-1 px-4 py-6 outline-none md:px-6 lg:px-8 lg:py-8">
          <div className="w-full max-w-content">{children}</div>
        </main>
      </div>

      {/* It reads the query (useSearchParams), so it sits in its own boundary. */}
      <Suspense fallback={null}>
        <FocusMain />
      </Suspense>
      <LiveRefresh endpoint={routes.api.version(wedding_id)} interval_ms={VERSION_POLL_MS} />
    </div>
  );
}
