import "server-only";

import { KICK_TIMEOUT_MS } from "@/contracts/jobs";
import { routes } from "@/contracts/routes";

import { selfBaseUrl } from "./base-url";

/**
 * The kick (export-and-recovery 3.2; architecture 2.3): a POST to this deployment's own
 * `/run` with the jobs bearer. `wait` true waits up to 5 s for `/run`'s answer (after
 * commit); false fires and forgets (the ops retry, D53). Never throws, never logs the token.
 */
export async function kickRun(job_id: string, options: { wait: boolean }): Promise<void> {
  const token = process.env.JOBS_API_TOKEN;
  if (!token) {
    console.error("[export] kick skipped: JOBS_API_TOKEN is not set");
    return;
  }
  const request = fetch(`${selfBaseUrl()}${routes.api.opsExportJobRun(job_id)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(KICK_TIMEOUT_MS),
    redirect: "error",
    cache: "no-store",
  })
    .then((response) => {
      if (response.status !== 202 && response.status !== 200) console.error(`[export] kick answered ${response.status} job=${job_id}`);
    })
    .catch((error: unknown) => {
      // A timeout is expected while /run renders; anything else is worth a line.
      const name = error instanceof Error ? error.name : "error";
      if (name !== "TimeoutError" && name !== "AbortError") console.error(`[export] kick failed: ${name} job=${job_id}`);
    });
  if (options.wait) await request;
}
