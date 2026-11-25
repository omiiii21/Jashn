import { Microphone } from "@phosphor-icons/react/ssr";
import Link from "next/link";

import type { WeddingId } from "@/contracts/domain";
import type { ActivityFeed, ActivityFeedEntry } from "@/contracts/read-models";
import { routes } from "@/contracts/routes";

import { EmptyState } from "../kit/EmptyState";
import { formatTime, istDateOf } from "../format";
import { formatWeekdayDate } from "../kit/dates";
import { SOURCE_LABELS } from "../kit/HistoryEntry";
import { TOPIC_FILTERS, actorName, awaitingPublishLine, feedHref, type FeedQuery } from "./activity-text";
import type { ReactNode } from "react";

export type ActivityFeedViewProps = {
  wedding_id: WeddingId;
  feed: ActivityFeed;
  query: FeedQuery & { person?: string };
  /** The signed-in member, for the "Only mine" filter. */
  member: { member_id: string; display_name: string };
};

const CHIP =
  "inline-flex h-11 items-center rounded-control border px-3 text-table focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-maroon";

function FilterLink({ href, active, children }: { href: string; active: boolean; children: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={`${CHIP} ${active ? "border-maroon bg-maroon-tint text-maroon" : "border-line-strong bg-paper text-ink-2 hover:bg-ivory-deep"}`}
    >
      {children}
    </Link>
  );
}

function FilterGroup({ label, children }: { label: string; children: ReactNode }) {
  const id = `filter-${label.toLowerCase()}`;
  return (
    <div role="group" aria-labelledby={id} className="flex flex-col gap-1">
      <span id={id} className="text-meta text-ink-3">
        {label}
      </span>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function EntryRow({ entry }: { entry: ActivityFeedEntry }) {
  const draft = awaitingPublishLine(entry);
  const source = entry.source === "ui" || entry.source === "seed" ? null : SOURCE_LABELS[entry.source];
  const actor = actorName(entry);
  // The summary usually opens with its actor ("Diya added …"); name it again only when it doesn't.
  const showActor = !entry.summary_en.startsWith(`${actor} `);
  return (
    <li className="flex flex-col gap-1 py-3 sm:flex-row sm:gap-4" data-field="entries" data-seq={entry.seq}>
      <time dateTime={entry.occurred_at} className="w-20 shrink-0 text-table text-ink-3 tabular-nums">
        {formatTime(entry.occurred_at)}
      </time>
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-body text-ink">{entry.summary_en}</p>
        {draft ? <p className="text-meta text-proposal">{draft}</p> : null}
        {showActor || source ? (
          <p className="flex flex-wrap items-center gap-x-2 text-meta text-ink-3">
            {showActor ? <span>{actor}</span> : null}
            {source ? (
              <span className="inline-flex items-center gap-1">
                {entry.source === "voice" ? <Microphone size={16} aria-hidden="true" /> : null}
                {source}
              </span>
            ) : null}
            {entry.source === "voice" && entry.spoken_text ? (
              <span className="text-ink-2">&ldquo;{entry.spoken_text}&rdquo;</span>
            ) : null}
          </p>
        ) : null}
      </div>
    </li>
  );
}

/** Entries grouped by IST day, keeping the feed's newest-first order. */
function byDay(entries: ActivityFeedEntry[]): { date: string; entries: ActivityFeedEntry[] }[] {
  const days: { date: string; entries: ActivityFeedEntry[] }[] = [];
  for (const entry of entries) {
    const date = istDateOf(entry.occurred_at);
    const last = days.at(-1);
    if (last && last.date === date) last.entries.push(entry);
    else days.push({ date, entries: [entry] });
  }
  return days;
}

/**
 * Activity (brief B3, AT-8.5, AT-8.6): every change, newest first, in the read model's own
 * words. Filters and paging are plain links, so the 2.5 s refresh keeps them.
 */
export function ActivityFeedView({ wedding_id, feed, query, member }: ActivityFeedViewProps) {
  const base = routes.activity(wedding_id);
  const filters = { day: query.day, topic: query.topic, person: query.person };
  const link = (next: Partial<typeof filters>) => {
    const merged = { ...filters, ...next };
    const href = feedHref(base, { day: merged.day, topic: merged.topic });
    if (!merged.person) return href;
    return `${href}${href.includes("?") ? "&" : "?"}person=${encodeURIComponent(merged.person)}`;
  };
  const filtered = Boolean(query.day || query.topic || query.person);
  const days = byDay(feed.entries);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-serif text-title text-ink">Activity</h1>

      <nav aria-label="Filter the activity" className="flex flex-col gap-3">
        <FilterGroup label="Day">
          <FilterLink href={link({ day: undefined })} active={!query.day}>
            All days
          </FilterLink>
          <FilterLink href={link({ day: "today" })} active={query.day === "today"}>
            Today
          </FilterLink>
        </FilterGroup>
        <FilterGroup label="Person">
          <FilterLink href={link({ person: undefined })} active={!query.person}>
            Everyone
          </FilterLink>
          <FilterLink href={link({ person: "me" })} active={query.person === "me"}>
            {`Only ${member.display_name}`}
          </FilterLink>
        </FilterGroup>
        <FilterGroup label="Topic">
          <FilterLink href={link({ topic: undefined })} active={!query.topic}>
            All topics
          </FilterLink>
          {TOPIC_FILTERS.map((topic) => (
            <FilterLink key={topic.prefix} href={link({ topic: topic.prefix })} active={query.topic === topic.prefix}>
              {topic.label}
            </FilterLink>
          ))}
        </FilterGroup>
      </nav>

      <div className="rounded-sheet border border-line bg-paper px-4 lg:px-6">
        {days.length === 0 ? (
          <EmptyState className="py-6">
            {filtered
              ? "Nothing matches these filters. Clear one to see more."
              : "No changes yet. Every payment, reply and schedule change will appear here, with who made it and when."}
          </EmptyState>
        ) : (
          days.map((day) => (
            <section key={day.date} aria-labelledby={`act-${day.date}`} className="border-b border-line py-3 last:border-b-0">
              <h2 id={`act-${day.date}`} className="text-heading text-ink tabular-nums">
                {formatWeekdayDate(day.date)}
              </h2>
              <ul className="flex flex-col divide-y divide-line">
                {day.entries.map((entry) => (
                  <EntryRow key={entry.id} entry={entry} />
                ))}
              </ul>
            </section>
          ))
        )}
      </div>

      {feed.next_before_seq !== null ? (
        <Link
          href={`${link({})}${link({}).includes("?") ? "&" : "?"}before=${feed.next_before_seq}`}
          className="inline-flex h-11 items-center self-start rounded-control border border-line-strong bg-paper px-4 text-body text-maroon hover:bg-ivory-deep"
        >
          Older entries
        </Link>
      ) : null}
      {query.before ? (
        <Link href={link({})} className="inline-flex min-h-11 items-center self-start text-table text-maroon underline underline-offset-4">
          Back to the newest
        </Link>
      ) : null}
    </div>
  );
}
