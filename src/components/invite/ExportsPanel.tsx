"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowClockwiseIcon, DownloadSimpleIcon, WarningCircleIcon } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import type { MemberRole, WeddingId } from "@/contracts/domain";
import type { ExportJobStatusModel, ExportJobView } from "@/contracts/read-models";
import { routes } from "@/contracts/routes";

import { emptyState, panelState, type PanelState } from "./exports-panel-copy";

export type ExportsPanelProps = {
  wedding_id: WeddingId;
  /** The `export_job_status` read model (newest revision first). */
  model: ExportJobStatusModel;
  role: MemberRole;
  /** For an out-of-date card, keyed by `job_id`: "The reception venue has changed since." */
  out_of_date_notes?: Record<string, string>;
};

/** Ticks the time-based copy ("stopped responding", the 45-minute line). */
const TICK_MS = 30_000;

const FOCUS = "focus-visible:ring-2 focus-visible:ring-maroon focus-visible:ring-offset-2";
const PRIMARY = `h-10 bg-maroon px-4 text-body text-paper hover:bg-maroon-deep ${FOCUS}`;
const SECONDARY = `h-10 border-line-strong bg-paper px-4 text-body text-ink hover:bg-ivory ${FOCUS}`;

type PostResult = { ok: true } | { ok: false; message: string };

async function postJson(url: string, body: unknown): Promise<PostResult> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const data = (await response.json().catch(() => null)) as { ok?: boolean; error?: { message?: string } } | null;
    if (response.ok && data?.ok !== false) return { ok: true };
    return { ok: false, message: data?.error?.message ?? "That didn't go through. Try again." };
  } catch {
    return { ok: false, message: "Couldn't reach Jashn. Check the connection and try again." };
  }
}

/** One press, one request: the key is made when the button appears and renewed after every answer. */
function useCommandButton(send: (idempotency_key: string) => Promise<PostResult>) {
  const router = useRouter();
  const key = useRef<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    key.current = crypto.randomUUID();
  }, []);

  async function press() {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError(null);
    const result = await send(key.current ?? crypto.randomUUID());
    key.current = crypto.randomUUID();
    inFlight.current = false;
    setPending(false);
    if (!result.ok) setError(result.message);
    router.refresh();
  }

  return { press, pending, error };
}

function StatusPill({ job, state }: { job: ExportJobView; state: PanelState }) {
  const tone =
    state.status_label === "Out of date"
      ? "bg-due-tint text-due"
      : job.status === "succeeded"
        ? "bg-paid-tint text-paid"
        : job.status === "failed"
          ? "bg-overdue-tint text-overdue"
          : "bg-ivory-deep text-ink-2";
  return <span className={`rounded-chip px-2 py-0.5 text-meta font-medium ${tone}`}>{state.status_label}</span>;
}

function ExportButton({ wedding_id, label, primary }: { wedding_id: WeddingId; label: string; primary: boolean }) {
  const { press, pending, error } = useCommandButton((idempotency_key) =>
    postJson(routes.api.exports(wedding_id), {
      wedding_id,
      command: "request_card_export",
      input: { format: "png" },
      idempotency_key,
      source: "ui",
    }),
  );
  return (
    <div className="flex flex-col gap-2">
      <Button type="button" onClick={press} disabled={pending} variant={primary ? "default" : "outline"} className={primary ? PRIMARY : SECONDARY}>
        {pending ? "Starting…" : label}
      </Button>
      <ErrorLine message={error} />
    </div>
  );
}

function RetryButton({ wedding_id, job }: { wedding_id: WeddingId; job: ExportJobView }) {
  const { press, pending, error } = useCommandButton((idempotency_key) =>
    postJson(routes.api.exportRetry(wedding_id, job.job_id), { idempotency_key }),
  );
  return (
    <div className="flex flex-col gap-2">
      <Button type="button" onClick={press} disabled={pending} className={PRIMARY}>
        <ArrowClockwiseIcon aria-hidden="true" />
        {pending ? "Retrying…" : "Retry here"}
      </Button>
      <ErrorLine message={error} />
    </div>
  );
}

function ErrorLine({ message }: { message: string | null }) {
  return (
    <p role="status" aria-live="polite" className="text-meta text-overdue">
      {message ? (
        <span className="inline-flex items-start gap-1">
          <WarningCircleIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {message}
        </span>
      ) : null}
    </p>
  );
}

function DownloadLink({ job, secondary }: { job: ExportJobView; secondary: boolean }) {
  if (!job.download_url) return null;
  return (
    <a
      href={job.download_url}
      download={`jashn-card-rev${job.revision}.png`}
      className={`inline-flex items-center justify-center gap-2 rounded-control border font-medium ${secondary ? `border-line-strong ${SECONDARY}` : `border-transparent ${PRIMARY}`}`}
    >
      <DownloadSimpleIcon aria-hidden="true" className="size-4" />
      {secondary ? "Download" : "Download card"}
    </a>
  );
}

function JobBlock({
  wedding_id,
  job,
  state,
}: {
  wedding_id: WeddingId;
  job: ExportJobView;
  state: PanelState;
}) {
  const showThumb = job.status === "succeeded" && job.download_url;
  return (
    <article className="flex flex-col gap-4 rounded-control border border-line bg-paper p-4" aria-label={`Card for revision ${job.revision}`}>
      <div className="flex flex-wrap items-start gap-4">
        {showThumb ? (
          // A signed Storage URL: next/image would need the bucket host in config, and the file is small.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={job.download_url as string}
            alt={`Card for revision ${job.revision}`}
            loading="lazy"
            width={108}
            height={135}
            className="aspect-[1080/1350] w-[108px] shrink-0 rounded-paper border border-line bg-ivory object-cover"
          />
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill job={job} state={state} />
            {state.chip ? (
              <span className="rounded-chip border border-line-strong px-2 py-0.5 text-meta text-ink-2">{state.chip}</span>
            ) : null}
            <span className="text-meta text-ink-3">Revision {job.revision}</span>
          </div>
          <p className="text-meta text-ink-2 break-words">{job.card_summary}</p>
          {state.lines.map((line) => (
            <p key={line} className="text-body text-ink">
              {line}
            </p>
          ))}
        </div>
      </div>

      {state.buttons.length > 0 ? (
        <div className="flex flex-wrap items-start gap-3">
          {state.buttons.includes("download") ? <DownloadLink job={job} secondary={false} /> : null}
          {state.buttons.includes("download_secondary") ? <DownloadLink job={job} secondary /> : null}
          {state.buttons.includes("retry") ? <RetryButton wedding_id={wedding_id} job={job} /> : null}
          {state.buttons.includes("export_new") ? <ExportButton wedding_id={wedding_id} label="Export a new card" primary /> : null}
        </div>
      ) : null}

      {state.attempt_lines.length > 0 ? (
        <div className="flex flex-col gap-1 border-t border-line pt-3">
          <p className="text-meta font-medium text-ink-2">Attempts</p>
          <ul className="flex flex-col gap-1">
            {state.attempt_lines.map((line) => (
              <li key={line} className="text-meta text-ink-2 break-words">
                {line}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  );
}

/** The newest `updated_at` among the jobs: the clock before the panel mounts, so the first render matches the server's. */
function modelClock(model: ExportJobStatusModel): string {
  let latest = "1970-01-01T00:00:00.000Z";
  for (const job of model.jobs) if (job.updated_at > latest) latest = job.updated_at;
  return latest;
}

/**
 * The exports panel on the Invite page (export-and-recovery 2.7). Built from the
 * `export_job_status` read model and refreshed by the shell's version poll. Members export;
 * only owners see Retry. The download is a signed link that is never shown as text.
 */
export function ExportsPanel({ wedding_id, model, role, out_of_date_notes }: ExportsPanelProps) {
  const [now, setNow] = useState<string | null>(null);

  useEffect(() => {
    const tick = () => setNow(new Date().toISOString());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, TICK_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, []);

  const clock = now ?? modelClock(model);
  const published = model.published_revision;
  const current = published === null ? undefined : model.jobs.find((job) => job.revision === published);
  const older = model.jobs.filter((job) => published !== null && job.revision < published);
  const [newestOlder, ...earlier] = older;

  const stateFor = (job: ExportJobView, has_current_job: boolean) =>
    panelState(job, { role, now: clock, published_revision: published, out_of_date_note: out_of_date_notes?.[job.job_id] ?? null, has_current_job });

  return (
    <section aria-labelledby="card-export-heading" className="flex flex-col gap-4">
      <h2 id="card-export-heading" className="font-serif text-heading text-ink">
        Card export
      </h2>

      {current ? <JobBlock wedding_id={wedding_id} job={current} state={stateFor(current, true)} /> : null}

      {!current && newestOlder ? <JobBlock wedding_id={wedding_id} job={newestOlder} state={stateFor(newestOlder, false)} /> : null}

      {!current && !newestOlder ? <EmptyState wedding_id={wedding_id} published_revision={published} /> : null}

      {(current ? older : earlier).length > 0 ? (
        <div className="flex flex-col gap-3">
          <h3 className="text-body font-medium text-ink-2">Earlier cards</h3>
          {(current ? older : earlier).map((job) => (
            <JobBlock key={job.job_id} wedding_id={wedding_id} job={job} state={stateFor(job, true)} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function EmptyState({ wedding_id, published_revision }: { wedding_id: WeddingId; published_revision: number | null }) {
  const empty = emptyState(published_revision);
  return (
    <div className="flex flex-col gap-3 rounded-control border border-dashed border-line-strong bg-ivory p-4">
      {empty.lines.map((line) => (
        <p key={line} className="text-body text-ink">
          {line}
        </p>
      ))}
      {empty.can_export ? (
        <div>
          <ExportButton wedding_id={wedding_id} label="Export card" primary />
        </div>
      ) : null}
    </div>
  );
}
