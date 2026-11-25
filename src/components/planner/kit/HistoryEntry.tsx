import type { CommandSource, IsoInstant } from "@/contracts/domain";

import { formatDayTime } from "../format";
import { cx } from "./cx";

/** How a change was made, as the history line says it: "typed", "by voice". */
export const SOURCE_LABELS: Record<CommandSource, string> = {
  ui: "typed",
  seed: "typed",
  voice: "by voice",
  guest_link: "from the guest page",
  nudgebee: "by NudgeBee",
  system: "by Jashn",
};

const DEVANAGARI = /[ऀ-ॿ]/;

export type HistoryEntryProps = {
  /** What changed, in one line: "Advance corrected from ₹50,000 to ₹40,000". */
  what: string;
  /** A second line with the record's details: "Paid Fri 20 Nov 2026, UPI". */
  detail?: string | null;
  /** The actor label; null reads "Jashn". */
  by: string | null;
  at: IsoInstant;
  source: CommandSource;
  /** The sentence as heard, for a change made by voice. */
  spoken_text?: string | null;
  /** The reason given with a correction or a void. */
  reason?: string | null;
  className?: string;
};

/**
 * One line of a record's history, oldest first: when (IST), who and how, what changed, and
 * the spoken sentence in quotes when the change came by voice. Renders an `<li>`, so it sits
 * in an `<ol>`. Server-safe.
 */
export function HistoryEntry({ what, detail, by, at, source, spoken_text, reason, className }: HistoryEntryProps) {
  return (
    <li className={cx("flex flex-col gap-1 py-3 md:flex-row md:gap-6", className)}>
      <p className="shrink-0 text-meta text-ink-3 md:w-40">
        <time dateTime={at} className="tabular-nums">
          {formatDayTime(at)}
        </time>
        <span className="block">
          {by ?? "Jashn"}, {SOURCE_LABELS[source]}
        </span>
      </p>
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-body text-ink tabular-nums">{what}</p>
        {detail ? <p className="text-table text-ink-2 tabular-nums">{detail}</p> : null}
        {spoken_text ? (
          <p className="text-table text-ink-2">
            <q lang={DEVANAGARI.test(spoken_text) ? "hi" : undefined}>{spoken_text}</q>
          </p>
        ) : null}
        {reason ? <p className="text-table text-ink-2">Reason: {reason}</p> : null}
      </div>
    </li>
  );
}
