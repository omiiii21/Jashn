/**
 * Export jobs (export-and-recovery.md 10.5; lifecycle 2.1–2.8, HTTP 5.1–5.6).
 * Owned by Lane D; changes go through a lead PR.
 */
import type { ExportFormat, IsoInstant, WeddingId } from "./domain";

export { EXPORT_TRIGGERS, FAIL_INJECTIONS, type ExportTrigger, type FailInjection } from "./domain";

// ---------------------------------------------------------------------------
// Statuses and panel labels (2.1, 2.7)
// ---------------------------------------------------------------------------

export const EXPORT_JOB_STATUSES = ["queued", "rendering", "succeeded", "failed"] as const;
export type ExportJobStatus = (typeof EXPORT_JOB_STATUSES)[number];

export const EXPORT_JOB_STATUS_LABELS: Record<ExportJobStatus, string> = {
  queued: "Queued",
  rendering: "Rendering",
  succeeded: "Ready",
  failed: "Failed",
};

/** "Rendering" reads "Retrying" from attempt 2. */
export const RETRYING_LABEL = "Retrying";
export const STALLED_TEXT = "Stopped responding";
export const OUT_OF_DATE_TEXT = "Out of date. Export a new card.";
export const DRILL_CHIP_TEXT = "Deliberate drill";

export function exportJobLabel(status: ExportJobStatus, attempts: number): string {
  if (status === "rendering" && attempts >= 2) return RETRYING_LABEL;
  if (status === "queued" && attempts >= 1) return RETRYING_LABEL;
  return EXPORT_JOB_STATUS_LABELS[status];
}

// ---------------------------------------------------------------------------
// Identity (2.3, 2.6)
// ---------------------------------------------------------------------------

export const MAX_ATTEMPTS = 3;

/** The reserved job id: `/run` renders a fixture and writes nothing; GET and retry answer 404. */
export const PROBE_JOB_ID = "probe";

/** `export:{wedding_id}:rev{revision}:{format}`: one job per revision and format. */
export function exportKey(wedding_id: WeddingId, revision: number, format: ExportFormat): string {
  return `export:${wedding_id}:rev${revision}:${format}`;
}

export const EXPORT_KEY_PATTERN = /^export:[0-9a-f-]{36}:rev(\d+):([a-z]+)$/;

/** `JOB-EXP-R{revision}-{FORMAT}`, computed, never stored. */
export function jobLabel(revision: number, format: ExportFormat): string {
  return `JOB-EXP-R${revision}-${format.toUpperCase()}`;
}

/** The object key in bucket `exports` (no bucket name): `{wedding_id}/card-rev{revision}.png`. */
export function exportObjectKey(wedding_id: WeddingId, revision: number, format: ExportFormat): string {
  return `${wedding_id}/card-rev${revision}.${format}`;
}

/** `artifact_id` is the file name: `card-rev3.png`. */
export function artifactId(revision: number, format: ExportFormat): string {
  return `card-rev${revision}.${format}`;
}

/** The signed download's file name: `jashn-card-rev{n}.png`. */
export function downloadName(revision: number, format: ExportFormat): string {
  return `jashn-card-rev${revision}.${format}`;
}

// ---------------------------------------------------------------------------
// Timers (2.2)
// ---------------------------------------------------------------------------

export const RENDER_CAP_MS = 45_000;
export const LEASE_MS = 120_000;
export const QUEUED_EXPIRY_MS = 60_000;
export const RUN_MAX_DURATION_S = 120;
export const RETRY_WAIT_S = { min: 0, max: 25, default: 25 } as const;
export const GET_WAIT_S = { min: 0, max: 10, default: 0 } as const;
/** The retry route reads the job row this often while it waits. */
export const WAIT_POLL_MS = 500;
/** The after-commit kick waits this long for `/run`'s answer, then logs a failure. */
export const KICK_TIMEOUT_MS = 5_000;
export const WEBHOOK_TIMEOUT_MS = 5_000;
/** The download URL in the member view. */
export const DOWNLOAD_URL_TTL_S = 600;
/** The render token's expiry, at most 5 minutes ahead (6.4). */
export const RENDER_TOKEN_TTL_S = 300;

// ---------------------------------------------------------------------------
// Failure codes (2.5)
// ---------------------------------------------------------------------------

export const EXPORT_ERROR_CODES = [
  "DRILL_INJECTED",
  "RENDER_TIMEOUT",
  "FONT_NOT_LOADED",
  "RENDER_FAILED",
  "UPLOAD_FAILED",
  "LEASE_EXPIRED",
  "NOT_STARTED",
] as const;
export type ExportErrorCode = (typeof EXPORT_ERROR_CODES)[number];

/**
 * The message NudgeBee and the panel see, and the `{reason}` phrase of the activity line.
 * `FONT_NOT_LOADED` appends the faces; `RENDER_FAILED` uses a short cause. Never URLs,
 * tokens, paths or stack traces.
 */
export const EXPORT_ERRORS: Record<ExportErrorCode, { message: string; reason_en: string; reason_hi: string }> = {
  DRILL_INJECTED: {
    message: "Injected fault (deliberate): renderer timeout",
    reason_en: "renderer timeout",
    reason_hi: "रेंडरर टाइमआउट",
  },
  RENDER_TIMEOUT: {
    message: "The render took longer than 45 s",
    reason_en: "the render took too long",
    reason_hi: "कार्ड बनने में बहुत देर लगी",
  },
  FONT_NOT_LOADED: {
    message: "Web fonts did not load",
    reason_en: "the fonts did not load",
    reason_hi: "फ़ॉन्ट लोड नहीं हुए",
  },
  RENDER_FAILED: {
    message: "The renderer failed",
    reason_en: "the renderer failed",
    reason_hi: "रेंडरर नहीं चल पाया",
  },
  UPLOAD_FAILED: {
    message: "Could not save the card file",
    reason_en: "the file could not be saved",
    reason_hi: "फ़ाइल सेव नहीं हो पाई",
  },
  LEASE_EXPIRED: {
    message: "The render stopped without reporting back",
    reason_en: "the render stopped",
    reason_hi: "रेंडर बीच में रुक गया",
  },
  NOT_STARTED: {
    message: "The render never started",
    reason_en: "the render never started",
    reason_hi: "रेंडर शुरू नहीं हुआ",
  },
};

/** The short causes `RENDER_FAILED` may carry (2.5). */
export const RENDER_FAILED_CAUSES = [
  "browser launch failed",
  "render page returned 404",
  "photo not loaded",
  "layout overflow",
] as const;

export const DRILL_SUFFIX = { en: " (deliberate drill)", hi: " (जानबूझकर किया गया अभ्यास)" } as const;

// ---------------------------------------------------------------------------
// Values (5.3) and renderers (3.7)
// ---------------------------------------------------------------------------

export const RETRY_OUTCOMES = ["retried", "already_succeeded", "in_progress", "not_retryable", "stale_revision"] as const;
export type RetryOutcome = (typeof RETRY_OUTCOMES)[number];

export const EXPORT_RENDERERS = ["chromium", "og"] as const;
export type ExportRenderer = (typeof EXPORT_RENDERERS)[number];

// ---------------------------------------------------------------------------
// The webhook (2.8, 5.5) and the Idempotency-Key rule (5.3)
// ---------------------------------------------------------------------------

export const EXPORT_FAILED_WEBHOOK_TYPE = "invitation_export.failed";

/** Every value is a string; `synthetic` is "true" or "false". NudgeBee uses only `job_id`. */
export type ExportFailedWebhook = {
  type: typeof EXPORT_FAILED_WEBHOOK_TYPE;
  job_id: string;
  export_key: string;
  error_code: ExportErrorCode;
  failed_at: IsoInstant;
  synthetic: "true" | "false";
};

/** 8 to 200 printable ASCII characters. NudgeBee sends `nb-{execution_id}-{job_id}`; the panel a UUID per press. */
export const IDEMPOTENCY_KEY_HEADER = "Idempotency-Key";
export const IDEMPOTENCY_KEY_RULE = /^[\x20-\x7E]{8,200}$/;

export function isValidIdempotencyKey(value: string | null | undefined): value is string {
  return typeof value === "string" && IDEMPOTENCY_KEY_RULE.test(value);
}

export function nudgebeeIdempotencyKey(execution_id: string, job_id: string): string {
  return `nb-${execution_id}-${job_id}`;
}

/** `{run}` in the retried activity line: the first 8 characters of the execution id. */
export function nudgebeeRunLabel(execution_id: string): string {
  return execution_id.slice(0, 8);
}

/** `{approver}` is cut at "@" when it is an email. */
export function approverLabel(approver: string): string {
  const at = approver.indexOf("@");
  return at === -1 ? approver : approver.slice(0, at);
}
