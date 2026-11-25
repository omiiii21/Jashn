import Link from "next/link";
import type { ReactNode } from "react";

import { formatDateLong, formatDateRange } from "@/components/planner/format";
import { Amount } from "@/components/planner/kit/Amount";
import { HighlightOnce } from "@/components/planner/kit/HighlightOnce";
import { NotShared } from "@/components/planner/kit/NotShared";
import { VoiceHero } from "@/components/ui/voice-hero";
import { HIGHLIGHT_PARAM, parseHighlight, routes } from "@/contracts/routes";

import { getWeddingProfile } from "./_lib/read";

type WeddingLandingPageProps = {
  params: Promise<{ wedding_id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function DetailRow({ term, field, children }: { term: string; field?: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-3 last:pb-0">
      <dt className="shrink-0 text-table text-ink-3">{term}</dt>
      <dd data-field={field} className="min-w-0 text-right text-body text-ink">
        {children}
      </dd>
    </div>
  );
}

/**
 * The landing view at `/w/{wedding_id}` (D60): a minimal, member-guarded page showing the
 * saved name, date, city and budget from `wedding_profile` (D99), so setup can reopen the
 * new wedding. A manager without budget sharing sees "Not shared with you". The full
 * Overview (design-direction 10.2) replaces it later.
 */
export default async function WeddingLandingPage({ params, searchParams }: WeddingLandingPageProps) {
  const [{ wedding_id }, query] = await Promise.all([params, searchParams]);
  const profile = await getWeddingProfile(wedding_id);

  const span = formatDateRange(profile.first_event_date, profile.last_event_date);
  // "Not shared with you" comes from `hidden`, never from a zero (G7).
  const budget_inr = profile.hidden.includes("budget") ? undefined : profile.budget_inr;

  return (
    <div className="flex flex-col gap-6">
      <h1 data-field="display_name" className="font-title text-title text-ink">
        {profile.display_name}
      </h1>

      {/* Voice first (Lane E): the first thing an owner sees is the way to talk to Jashn. */}
      <VoiceHero
        className="max-w-3xl"
        examples={["Caterer ko ab kitna dena hai?", "Caterer ko chaalis hazaar advance diya tha", "Diya ne kya badla?"]}
      />

      <section aria-labelledby="wedding-details-heading" className="max-w-xl rounded-sheet border border-line bg-paper p-4 lg:p-6">
        <h2 id="wedding-details-heading" className="text-heading text-ink">
          Wedding details
        </h2>
        <dl className="mt-2 divide-y divide-line">
          <DetailRow term="Wedding date" field="wedding_date">
            <time dateTime={profile.wedding_date} className="tabular-nums">
              {formatDateLong(profile.wedding_date)}
            </time>
          </DetailRow>
          <DetailRow term="Functions">
            {span ? <span className="tabular-nums">{span}</span> : <span className="text-ink-3">No functions added yet</span>}
          </DetailRow>
          <DetailRow term="City" field="city">
            {profile.city ?? <span className="text-ink-3">Not added yet</span>}
          </DetailRow>
          <DetailRow term="Budget">
            {budget_inr === undefined ? <NotShared /> : <Amount inr={budget_inr} weight="panel" field="budget_inr" />}
          </DetailRow>
        </dl>
      </section>

      <p className="max-w-prose text-body text-ink-2">
        {/* Inline padding widens each link's tap target to 48 px without moving the line. */}
        What is committed, paid and still owed is in{" "}
        <Link href={routes.money(wedding_id)} className="py-3 text-maroon underline underline-offset-4 hover:text-maroon-deep">
          Money
        </Link>
        . Each function&rsquo;s time, venue and dress code is in{" "}
        <Link href={routes.events(wedding_id)} className="py-3 text-maroon underline underline-offset-4 hover:text-maroon-deep">
          Events
        </Link>
        .
      </p>

      <HighlightOnce keys={parseHighlight(query[HIGHLIGHT_PARAM])} />
    </div>
  );
}
