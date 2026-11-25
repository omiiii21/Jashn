import "server-only";

import { EXPORT_FAILED_WEBHOOK_TYPE, WEBHOOK_TIMEOUT_MS, type ExportErrorCode, type ExportFailedWebhook } from "@/contracts/jobs";

import type { JobStore } from "./store";
import { utcSeconds } from "./state";

/**
 * The first-failure webhook (export-and-recovery 2.8, 5.5): at most once per job, after the
 * commit that first fails it, from the worker or Lane D's member routes; never from an ops
 * route. No retry; `notified_at` is set only on a 2xx. The URL carries a token, so it is
 * never logged.
 */
export type WebhookDeps<Tx> = {
  store: JobStore<Tx>;
  url: () => string | undefined;
  fetch: typeof fetch;
  now: () => Date;
  log: (message: string, fields?: Record<string, string | number>) => void;
};

export async function sendFirstFailureWebhook<Tx>(deps: WebhookDeps<Tx>, job_id: string): Promise<boolean> {
  const url = deps.url();
  if (!url) return false;
  const job = await deps.store.readJob(null, job_id);
  if (!job || job.status !== "failed" || job.notified_at || !job.last_error_code) return false;
  const attempts = await deps.store.listAttempts(null, job_id);
  const earlierFailure = attempts.some((attempt) => attempt.status === "failed" && attempt.attempt_no < job.attempts);
  if (earlierFailure) return false;

  const body: ExportFailedWebhook = {
    type: EXPORT_FAILED_WEBHOOK_TYPE,
    job_id: job.id,
    export_key: job.export_key,
    error_code: job.last_error_code as ExportErrorCode,
    failed_at: utcSeconds(job.last_error_at),
    synthetic: job.synthetic ? "true" : "false",
  };
  let status = 0;
  try {
    const response = await deps.fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
      redirect: "error",
    });
    status = response.status;
  } catch (error) {
    deps.log("webhook failed", { job: job.id, error: error instanceof Error ? error.name : "error" });
    return false;
  }
  if (status < 200 || status >= 300) {
    deps.log("webhook refused", { job: job.id, status });
    return false;
  }
  const now = deps.now();
  await deps.store.transaction(async (tx) => {
    await deps.store.lockWedding(tx, job.wedding_id);
    await deps.store.updateJob(tx, job.id, { status: "failed", attempts: job.attempts }, { notified_at: now }, now);
  });
  deps.log("webhook sent", { job: job.id, status });
  return true;
}
