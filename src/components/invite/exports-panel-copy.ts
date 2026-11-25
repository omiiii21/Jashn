import type { MemberRole } from "@/contracts/domain";
import {
  DRILL_CHIP_TEXT,
  DRILL_SUFFIX,
  EXPORT_ERRORS,
  LEASE_MS,
  OUT_OF_DATE_TEXT,
  QUEUED_EXPIRY_MS,
  STALLED_TEXT,
  approverLabel,
  exportJobLabel,
  nudgebeeRunLabel,
} from "@/contracts/jobs";
import type { ExportAttemptLogEntry, ExportJobView } from "@/contracts/read-models";

import { istDayMonth, istTime } from "./ist-format";

/**
 * The exports panel's words (export-and-recovery 2.7, verbatim where the table gives them).
 * Pure and client-safe: the panel re-renders this every 30 s so "stopped responding" and
 * the 45-minute line appear without a reload. Sentence case, no exclamation marks, times
 * in IST as "1:42 pm".
 */

export type PanelButton = "retry" | "download" | "download_secondary" | "export_new";

export type PanelState = {
  status_label: string;
  chip: string | null;
  lines: string[];
  buttons: PanelButton[];
  attempt_lines: string[];
};

export type PanelOptions = {
  role: MemberRole;
  /** The clock the copy is computed against (ISO instant). */
  now: string;
  published_revision: number | null;
  /** For an out-of-date card: "The reception venue has changed since." */
  out_of_date_note?: string | null;
  /** True when a job already exists for the latest revision; hides "Export a new card". */
  has_current_job?: boolean;
};

export const APPROVAL_WINDOW_MS = 45 * 60_000;

export const PANEL_TEXT = {
  queued: (by: string | null, at: string) => (by ? `Started by ${by} at ${istTime(at)}.` : `Started at ${istTime(at)}.`),
  rendering: "Making the card. This takes a few seconds.",
  sentToNudgebee: "Sent to NudgeBee for recovery. The retry waits for an operator's approval.",
  notNotified: "NudgeBee was not notified.",
  noApproval: "No approval came within 45 minutes.",
  stalled: "This render stopped responding.",
  maxAttempts: (max: number) => `Failed ${max} times. Export again after the next publish.`,
  managerRetry: "The owner or NudgeBee can retry.",
  ready: (at: string, attempt: number, max: number) => `Ready at ${istTime(at)}, attempt ${attempt} of ${max}.`,
  madeFor: (at: string, revision: number) => `Made ${istDayMonth(at)} for revision ${revision}.`,
  noCard: (revision: number) => `No card yet for revision ${revision}.`,
  nothingPublished: "Publish the schedule first. There's no card to make yet.",
} as const;

function capitalise(text: string): string {
  return text.length === 0 ? text : text[0].toUpperCase() + text.slice(1);
}

function ms(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const value = Date.parse(iso);
  return Number.isNaN(value) ? null : value;
}

/** The attempt with the highest number, or null for a job with no attempt rows. */
export function latestAttempt(job: ExportJobView): ExportAttemptLogEntry | null {
  let latest: ExportAttemptLogEntry | null = null;
  for (const attempt of job.attempt_log) {
    if (!latest || attempt.attempt_no > latest.attempt_no) latest = attempt;
  }
  return latest;
}

/** The server's `stalled`, or the same rule against the panel's clock (queued over 60 s; rendering past its lease). */
export function isStalled(job: ExportJobView, now: string): boolean {
  if (job.stalled) return true;
  const nowMs = ms(now);
  if (nowMs === null) return false;
  if (job.status === "queued") {
    const since = ms(job.updated_at);
    return since !== null && nowMs - since > QUEUED_EXPIRY_MS;
  }
  if (job.status === "rendering") {
    const started = ms(latestAttempt(job)?.started_at) ?? ms(job.updated_at);
    return started !== null && nowMs - started > LEASE_MS;
  }
  return false;
}

function reasonOf(code: keyof typeof EXPORT_ERRORS): string {
  return EXPORT_ERRORS[code].reason_en;
}

/** "NudgeBee run 019e8cde, approved by lead" or "Started by Mira", without the full stop. */
function startedPhrase(attempt: ExportAttemptLogEntry): string | null {
  if (attempt.trigger === "nudgebee") {
    const run = attempt.nudgebee_execution_id ? `NudgeBee run ${nudgebeeRunLabel(attempt.nudgebee_execution_id)}` : "NudgeBee";
    return attempt.approver ? `${run}, approved by ${approverLabel(attempt.approver)}` : run;
  }
  return attempt.started_by ? `Started by ${attempt.started_by}` : null;
}

/** One line per attempt (2.7): "Attempt 1 failed at 1:42 pm: renderer timeout (deliberate drill). Started by Mira." */
export function attemptLine(attempt: ExportAttemptLogEntry, job: ExportJobView): string {
  const fallback = attempt.renderer === "og" ? " with the fallback renderer" : "";
  const started = startedPhrase(attempt);
  const tail = started ? ` ${started}.` : "";
  const n = attempt.attempt_no;
  switch (attempt.status) {
    case "succeeded": {
      const at = attempt.finished_at ?? job.updated_at;
      return `Attempt ${n} ready at ${istTime(at)}${fallback}.${tail}`;
    }
    case "failed": {
      const at = attempt.finished_at ?? job.last_error?.at ?? job.updated_at;
      const code = attempt.error_code ?? job.last_error?.code ?? null;
      const reason = code ? `: ${reasonOf(code)}${code === "DRILL_INJECTED" ? DRILL_SUFFIX.en : ""}` : "";
      return `Attempt ${n} failed at ${istTime(at)}${reason}${fallback}.${tail}`;
    }
    case "rendering": {
      const since = attempt.started_at ? ` since ${istTime(attempt.started_at)}` : "";
      return `Attempt ${n} rendering${since}${fallback}.${tail}`;
    }
    default:
      return `Attempt ${n} queued.${tail}`;
  }
}

/** When the card was made: the succeeded attempt's finish, else the job's creation. */
function madeAt(job: ExportJobView): string {
  const done = job.attempt_log.filter((attempt) => attempt.status === "succeeded" && attempt.finished_at);
  return done.length > 0 ? (done[done.length - 1].finished_at as string) : job.created_at;
}

/** The panel's state for one job (export 2.7). */
export function panelState(job: ExportJobView, opts: PanelOptions): PanelState {
  const isOwner = opts.role === "owner";
  const attempts = [...job.attempt_log].sort((a, b) => a.attempt_no - b.attempt_no);
  const attempt_lines = attempts.map((attempt) => attemptLine(attempt, job));
  const chip = job.synthetic ? DRILL_CHIP_TEXT : null;
  const outOfDate = job.out_of_date || (opts.published_revision !== null && job.revision < opts.published_revision);

  if (outOfDate) {
    const buttons: PanelButton[] = [];
    if (job.status === "succeeded" && job.download_url) buttons.push("download_secondary");
    if (isOwnerOrManager(opts.role) && !opts.has_current_job) buttons.push("export_new");
    const made = PANEL_TEXT.madeFor(madeAt(job), job.revision);
    const note = opts.out_of_date_note ? ` ${opts.out_of_date_note}` : "";
    return { status_label: "Out of date", chip, lines: [OUT_OF_DATE_TEXT, `${made}${note}`], buttons, attempt_lines };
  }

  const stalled = isStalled(job, opts.now);
  const attemptsLeft = job.attempts < job.max_attempts;
  const canRetry = isOwner && (job.can_retry || (stalled && attemptsLeft));

  if (stalled && (job.status === "queued" || job.status === "rendering")) {
    const lines: string[] = [PANEL_TEXT.stalled];
    if (!isOwner && attemptsLeft) lines.push(PANEL_TEXT.managerRetry);
    return {
      status_label: "Rendering",
      chip: chip ?? STALLED_TEXT,
      lines,
      buttons: canRetry ? ["retry"] : [],
      attempt_lines,
    };
  }

  switch (job.status) {
    case "succeeded": {
      const at = madeAt(job);
      return {
        status_label: exportJobLabel(job.status, job.attempts),
        chip,
        lines: [PANEL_TEXT.ready(at, Math.max(job.attempts, 1), job.max_attempts)],
        buttons: job.download_url ? ["download"] : [],
        attempt_lines,
      };
    }
    case "failed": {
      if (!attemptsLeft) {
        return { status_label: "Failed", chip, lines: [PANEL_TEXT.maxAttempts(job.max_attempts)], buttons: [], attempt_lines };
      }
      const lines: string[] = [];
      const at = job.last_error?.at ?? job.updated_at;
      const reason = job.last_error ? capitalise(reasonOf(job.last_error.code)) : "The export failed";
      const notified = ms(job.notified_at);
      const nowMs = ms(opts.now);
      if (notified !== null && nowMs !== null && nowMs - notified >= APPROVAL_WINDOW_MS) {
        lines.push(PANEL_TEXT.noApproval);
      } else if (notified !== null) {
        lines.push(`${reason}, ${istTime(at)}. ${PANEL_TEXT.sentToNudgebee}`);
      } else {
        lines.push(`${reason}, ${istTime(at)}. ${PANEL_TEXT.notNotified}`);
      }
      if (!isOwner) lines.push(PANEL_TEXT.managerRetry);
      return { status_label: "Failed", chip, lines, buttons: canRetry ? ["retry"] : [], attempt_lines };
    }
    case "rendering":
    case "queued": {
      const label = exportJobLabel(job.status, job.attempts);
      const latest = latestAttempt(job);
      if (latest && latest.attempt_no >= 2) {
        const started = startedPhrase(latest);
        const line =
          latest.trigger === "nudgebee"
            ? `Approved by ${latest.approver ? approverLabel(latest.approver) : "an operator"} in NudgeBee run ${latest.nudgebee_execution_id ? nudgebeeRunLabel(latest.nudgebee_execution_id) : "unknown"}.`
            : started
              ? `${started}.`
              : PANEL_TEXT.rendering;
        return { status_label: label, chip, lines: [line], buttons: [], attempt_lines };
      }
      if (job.status === "queued") {
        return {
          status_label: label,
          chip,
          lines: [PANEL_TEXT.queued(latest?.started_by ?? null, job.created_at)],
          buttons: [],
          attempt_lines,
        };
      }
      return { status_label: label, chip, lines: [PANEL_TEXT.rendering], buttons: [], attempt_lines };
    }
  }
}

function isOwnerOrManager(role: MemberRole): boolean {
  return role === "owner" || role === "manager";
}

/** No job for the latest revision yet, and no older card either. */
export function emptyState(published_revision: number | null): { lines: string[]; can_export: boolean } {
  if (published_revision === null) return { lines: [PANEL_TEXT.nothingPublished], can_export: false };
  return { lines: [PANEL_TEXT.noCard(published_revision)], can_export: true };
}
