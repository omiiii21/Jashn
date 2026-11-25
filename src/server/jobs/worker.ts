import "server-only";

import { createHash } from "node:crypto";

import type { ExportRenderer } from "@/contracts/jobs";
import { EXPORT_ERRORS, RENDER_CAP_MS, exportObjectKey, type ExportErrorCode, type ExportJobStatus } from "@/contracts/jobs";

import { failedEntry, readyEntry } from "./activity";
import { JASHN_SYSTEM, type JobDeps } from "./handlers";
import { leaseUntil, rendererFrom } from "./state";
import type { ExportJobRow } from "./store";

/**
 * The worker (export-and-recovery 3.3, steps 3 to 14): the claim with its drill, then the
 * render, the upload and the commit. `/run` answers after the claim and finishes the rest
 * in `after()`.
 */

export class JobRenderFailure extends Error {
  readonly code: ExportErrorCode;
  /** The message the job records (2.5): fixed text plus a short detail, never a URL. */
  readonly detail_message: string;
  constructor(code: ExportErrorCode, detail_message: string) {
    super(code);
    this.name = "JobRenderFailure";
    this.code = code;
    this.detail_message = detail_message;
  }
}

export type WorkerDeps<Tx> = JobDeps<Tx> & {
  now: () => Date;
  /** Renders the job's card. Throws JobRenderFailure. */
  render: (job: ExportJobRow, renderer: ExportRenderer, cap_ms: number) => Promise<{ png: Uint8Array; timings: Record<string, number | string> }>;
  /** Writes the object (upsert) and returns the stored size. */
  upload: (object_key: string, png: Uint8Array) => Promise<{ bytes: number }>;
  /** The first-failure webhook (2.8); runs after the failure commits. */
  notifyFailure: (job_id: string) => Promise<void>;
};

export type ClaimResult =
  | { kind: "not_found" }
  | { kind: "not_started"; status: ExportJobStatus }
  | { kind: "drill_failed"; job: ExportJobRow }
  | { kind: "started"; job: ExportJobRow; attempt: number; renderer: ExportRenderer };

/** Steps 3 to 6: the compare-and-set claim, with the drill consumed in the claim write (4.2). */
export async function claimJob<Tx>(deps: WorkerDeps<Tx>, job_id: string): Promise<ClaimResult> {
  const first = await deps.store.readJob(null, job_id);
  if (!first) return { kind: "not_found" };
  if (first.status !== "queued") return { kind: "not_started", status: first.status };
  // An unreadable flag reader never blocks a claim: Chromium stays the renderer.
  const renderer = await deps.readFlags().then(rendererFrom, () => "chromium" as const);

  return deps.store.transaction(async (tx): Promise<ClaimResult> => {
    await deps.store.lockWedding(tx, first.wedding_id);
    const job = await deps.store.lockJob(tx, job_id);
    if (!job) return { kind: "not_found" };
    if (job.status !== "queued") return { kind: "not_started", status: job.status };
    const now = deps.now();
    const attempt = job.attempts + 1;
    // The drill fails attempt 1 only (2.5, 4.2); a later attempt always renders.
    const drill = job.fail_injection === "once" && attempt === 1;
    const claimed = await deps.store.updateJob(
      tx,
      job.id,
      { status: "queued", attempts: job.attempts },
      { status: "rendering", attempts: attempt, lease_until: leaseUntil(now), fail_injection: job.fail_injection === "once" ? "consumed" : job.fail_injection },
      now,
    );
    if (!claimed) return { kind: "not_started", status: job.status };
    await deps.store.updateAttempt(tx, job.id, attempt, { status: "rendering", started_at: now, renderer }, now);

    if (drill) {
      // The deliberate drill fails before any browser starts (4.2).
      const failed = await deps.store.updateJob(
        tx,
        job.id,
        { status: "rendering", attempts: attempt },
        {
          status: "failed",
          lease_until: null,
          last_error_code: "DRILL_INJECTED",
          last_error_message: EXPORT_ERRORS.DRILL_INJECTED.message,
          last_error_at: now,
        },
        now,
      );
      await deps.store.updateAttempt(tx, job.id, attempt, { status: "failed", error_code: "DRILL_INJECTED", finished_at: now }, now);
      await deps.appendActivity(tx, {
        ...failedEntry({ job_id: job.id, revision: job.revision }, "DRILL_INJECTED", true),
        wedding_id: job.wedding_id,
        actor: JASHN_SYSTEM,
        command: "request_card_export",
        occurred_at: now.toISOString(),
      });
      await deps.bumpVersion(tx, job.wedding_id);
      return { kind: "drill_failed", job: failed ?? claimed };
    }

    await deps.bumpVersion(tx, job.wedding_id);
    return { kind: "started", job: claimed, attempt, renderer };
  });
}

function withCap<T>(promise: Promise<T>, ms: number, code: ExportErrorCode, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new JobRenderFailure(code, message)), Math.max(1_000, ms));
    }),
  ]).finally(() => clearTimeout(timer));
}

/** Steps 7 to 14: render, re-check the claim, upload, commit, and the webhook on a first failure. */
export async function finishJob<Tx>(deps: WorkerDeps<Tx>, claim: Extract<ClaimResult, { kind: "started" }>): Promise<void> {
  const { job, attempt, renderer } = claim;
  const started = Date.now();
  let artifact: { path: string; sha256: string; bytes: number } | null = null;
  let failure: JobRenderFailure | null = null;
  let timings: Record<string, number | string> = {};

  try {
    const rendered = await deps.render(job, renderer, RENDER_CAP_MS);
    timings = rendered.timings;
    const current = await deps.store.readJob(null, job.id);
    if (!current || current.status !== "rendering" || current.attempts !== attempt) {
      deps.log("claim lost before upload", { job: job.id, attempt });
      return;
    }
    const path = exportObjectKey(job.wedding_id, job.revision, job.format);
    const uploadStarted = Date.now();
    const stored = await withCap(
      deps.upload(path, rendered.png).catch(() => {
        throw new JobRenderFailure("UPLOAD_FAILED", EXPORT_ERRORS.UPLOAD_FAILED.message);
      }),
      RENDER_CAP_MS - (Date.now() - started),
      "RENDER_TIMEOUT",
      EXPORT_ERRORS.RENDER_TIMEOUT.message,
    );
    timings.upload_ms = Date.now() - uploadStarted;
    if (stored.bytes !== rendered.png.byteLength) throw new JobRenderFailure("UPLOAD_FAILED", EXPORT_ERRORS.UPLOAD_FAILED.message);
    artifact = { path, sha256: createHash("sha256").update(rendered.png).digest("hex"), bytes: rendered.png.byteLength };
  } catch (error) {
    failure = error instanceof JobRenderFailure ? error : new JobRenderFailure("RENDER_FAILED", EXPORT_ERRORS.RENDER_FAILED.message);
  }

  const committed = await deps.store.transaction(async (tx) => {
    await deps.store.lockWedding(tx, job.wedding_id);
    const now = deps.now();
    const guard = { status: "rendering" as const, attempts: attempt };
    if (artifact) {
      const done = await deps.store.updateJob(
        tx,
        job.id,
        guard,
        {
          status: "succeeded",
          lease_until: null,
          artifact_path: artifact.path,
          artifact_sha256: artifact.sha256,
          artifact_bytes: artifact.bytes,
          artifact_created_at: now,
        },
        now,
      );
      if (!done) return false;
      await deps.store.updateAttempt(tx, job.id, attempt, { status: "succeeded", finished_at: now }, now);
      await deps.appendActivity(tx, {
        ...readyEntry({ job_id: job.id, revision: job.revision }),
        wedding_id: job.wedding_id,
        actor: JASHN_SYSTEM,
        command: "request_card_export",
        occurred_at: now.toISOString(),
      });
    } else {
      const code = failure?.code ?? "RENDER_FAILED";
      const done = await deps.store.updateJob(
        tx,
        job.id,
        guard,
        { status: "failed", lease_until: null, last_error_code: code, last_error_message: failure?.detail_message ?? EXPORT_ERRORS[code].message, last_error_at: now },
        now,
      );
      if (!done) return false;
      await deps.store.updateAttempt(tx, job.id, attempt, { status: "failed", error_code: code, finished_at: now }, now);
      await deps.appendActivity(tx, {
        ...failedEntry({ job_id: job.id, revision: job.revision }, code, job.synthetic && code === "DRILL_INJECTED"),
        wedding_id: job.wedding_id,
        actor: JASHN_SYSTEM,
        command: "request_card_export",
        occurred_at: now.toISOString(),
      });
    }
    await deps.bumpVersion(tx, job.wedding_id);
    return true;
  });

  // One line per attempt (3.3 step 14): never a token, a URL or a signed link.
  deps.log("attempt finished", {
    job: job.id,
    attempt,
    status: artifact ? "succeeded" : "failed",
    error: failure?.code ?? "",
    renderer,
    committed: committed ? "yes" : "lost",
    total_ms: Date.now() - started,
    ...Object.fromEntries(Object.entries(timings).filter(([key]) => /_ms$|^instance$|^fit$/.test(key))),
  });

  if (committed && !artifact) await deps.notifyFailure(job.id);
}
