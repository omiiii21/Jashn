import { buildCardModel, cardSummary } from "@/components/invite/card-model";
import type { MemberRole, PublicationSnapshot } from "@/contracts/domain";
import { EXPORT_ERROR_CODES, exportJobLabel, jobLabel, type ExportErrorCode } from "@/contracts/jobs";
import { IST_OFFSET } from "@/contracts/domain";
import type { ExportAttemptLogEntry, ExportJobView } from "@/contracts/read-models";

import { isStalled } from "./state";
import type { ExportAttemptRow, ExportJobRow } from "./store";

/**
 * The member view of one job (domain 4.8 plus export 11 item 16). Pure: the read model, the
 * command results and the panel all use it. It never writes; a job lazy expiry would fail
 * shows as `stalled`.
 */

export type JobViewContext = {
  snapshot: PublicationSnapshot | null;
  is_sample: boolean;
  published_revision: number | null;
  role: MemberRole | null;
  member_names: Record<string, string>;
  now: Date;
  download_url: string | null;
};

/** An instant in IST offset form, "2026-11-25T13:42:07+05:30" (member views). */
export function istInstant(date: Date): string {
  const shifted = new Date(date.getTime() + 330 * 60_000);
  return shifted.toISOString().replace(/\.\d{3}Z$/, IST_OFFSET);
}

function errorCode(value: string | null): ExportErrorCode | null {
  return value && (EXPORT_ERROR_CODES as readonly string[]).includes(value) ? (value as ExportErrorCode) : null;
}

export function attemptLog(job: ExportJobRow, attempts: readonly ExportAttemptRow[], member_names: Record<string, string>): ExportAttemptLogEntry[] {
  return [...attempts]
    .sort((a, b) => a.attempt_no - b.attempt_no)
    .map((attempt) => ({
      attempt_no: attempt.attempt_no,
      trigger: attempt.trigger,
      status: attempt.status,
      started_at: attempt.started_at ? istInstant(attempt.started_at) : null,
      finished_at: attempt.finished_at ? istInstant(attempt.finished_at) : null,
      error_code: errorCode(attempt.error_code),
      renderer: attempt.renderer,
      nudgebee_execution_id: attempt.nudgebee_execution_id,
      approver: attempt.approver,
      started_by:
        attempt.trigger === "nudgebee"
          ? "NudgeBee"
          : attempt.trigger === "request"
            ? (member_names[job.requested_by_member_id] ?? null)
            : null,
    }));
}

export function cardFacts(snapshot: PublicationSnapshot | null, card_event_ids: string[], is_sample: boolean): { summary: string; functions: string[] } {
  if (!snapshot) return { summary: "", functions: [] };
  const model = buildCardModel({ snapshot, card_event_ids, is_sample, photo: null });
  const wanted = new Set(card_event_ids);
  return {
    summary: cardSummary(model),
    functions: snapshot.events.filter((event) => wanted.has(event.event_id)).map((event) => event.title),
  };
}

export function toJobView(job: ExportJobRow, attempts: readonly ExportAttemptRow[], context: JobViewContext): ExportJobView {
  const stalled = isStalled(job, context.now);
  const out_of_date = context.published_revision !== null && job.revision < context.published_revision;
  const code = errorCode(job.last_error_code);
  const latest = [...attempts].sort((a, b) => b.attempt_no - a.attempt_no)[0];
  const facts = cardFacts(context.snapshot, job.card_event_ids, context.is_sample);
  return {
    job_id: job.id,
    seed_key: job.seed_key,
    job_label: jobLabel(job.revision, job.format),
    export_key: job.export_key,
    revision: job.revision,
    format: job.format,
    status: job.status,
    label: exportJobLabel(job.status, job.attempts),
    synthetic: job.synthetic,
    attempts: job.attempts,
    max_attempts: job.max_attempts,
    renderer: latest?.renderer ?? null,
    card_summary: facts.summary,
    card_functions: facts.functions,
    last_error: code && job.last_error_at ? { code, message: job.last_error_message ?? "", at: istInstant(job.last_error_at) } : null,
    notified_at: job.notified_at ? istInstant(job.notified_at) : null,
    stalled,
    can_retry: context.role === "owner" && (job.status === "failed" || stalled) && job.attempts < job.max_attempts && !out_of_date,
    out_of_date,
    download_url: job.status === "succeeded" && job.artifact_path ? context.download_url : null,
    created_at: istInstant(job.created_at),
    updated_at: istInstant(job.updated_at),
    attempt_log: attemptLog(job, attempts, context.member_names),
  };
}
