import { after } from "next/server";

import type { OpsRunBody } from "@/contracts/api";
import { PROBE_JOB_ID } from "@/contracts/jobs";
import { isUuidShaped } from "@/db/ids";
import { RenderError, renderErrorMessage, type RenderTestMode } from "@/server/export/chromium";
import { RenderTokenSecretMissing } from "@/server/export/render-token";
import { renderProbe, renderTimingHeaders } from "@/server/export/probe";
import { verifyOpsBearer } from "@/server/jobs/ops-auth";
import { workerDeps } from "@/server/jobs/deps";
import { OPS_HEADERS, opsError, opsJson, opsNotFound, opsUnauthenticated } from "@/server/jobs/ops-http";
import { claimJob, finishJob } from "@/server/jobs/worker";

/**
 * The worker route (export-and-recovery 3.2 and 3.3), the only route that runs Chromium.
 * The reserved id `probe` renders the sample card and answers with the PNG and the timing
 * headers. A real job is claimed (with its drill), answered 202, and finished in `after()`.
 */

export const maxDuration = 120;
export const dynamic = "force-dynamic";

const TEST_MODES: readonly RenderTestMode[] = ["block_fonts", "hang", "broken_fallbacks"];

/** Test-only modes (EX-07, EX-17) are refused in production builds and on Vercel. */
function testMode(request: Request): RenderTestMode | null | "refused" {
  const value = new URL(request.url).searchParams.get("test_mode");
  if (!value) return null;
  if (process.env.NODE_ENV === "production" || process.env.VERCEL === "1") return "refused";
  return (TEST_MODES as readonly string[]).includes(value) ? (value as RenderTestMode) : "refused";
}

function logLine(fields: Record<string, string | number>): void {
  // One line per render (3.3 step 14). Never the token, the render token or a URL.
  console.info(`[export] ${Object.entries(fields).map(([key, value]) => `${key}=${value}`).join(" ")}`);
}

export async function POST(request: Request, context: RouteContext<"/api/ops/export-jobs/[job_id]/run">) {
  if (!(await verifyOpsBearer(request.headers.get("authorization")))) return opsUnauthenticated();

  const { job_id } = await context.params;
  if (job_id !== PROBE_JOB_ID) return runJob(job_id);

  const mode = testMode(request);
  if (mode === "refused") {
    return opsError("validation_failed", "test_mode is not accepted here.", { field: "test_mode" });
  }

  try {
    const { png, timings } = await renderProbe({ test_mode: mode });
    logLine({
      job: PROBE_JOB_ID,
      status: "succeeded",
      renderer: "chromium",
      instance: timings.instance,
      slot_ms: timings.slot_ms,
      launch_ms: timings.launch_ms,
      navigate_ms: timings.navigate_ms,
      fonts_ms: timings.fonts_ms,
      capture_ms: timings.capture_ms,
      total_ms: timings.total_ms,
      fit: timings.fit || "none",
      bytes: png.byteLength,
    });
    return new Response(Buffer.from(png), {
      status: 200,
      headers: {
        ...OPS_HEADERS,
        "Content-Type": "image/png",
        "Content-Length": String(png.byteLength),
        ...renderTimingHeaders(timings),
      },
    });
  } catch (error) {
    if (error instanceof RenderError) {
      logLine({ job: PROBE_JOB_ID, status: "failed", error: error.code, renderer: "chromium", total_ms: error.timings.total_ms });
      return opsError("internal_error", "The probe render failed.", {
        current: { error_code: error.code, message: renderErrorMessage(error) },
        headers: renderTimingHeaders(error.timings),
      });
    }
    if (error instanceof RenderTokenSecretMissing) {
      logLine({ job: PROBE_JOB_ID, status: "failed", error: "RENDER_TOKEN_SECRET_UNSET" });
      return opsError("internal_error", "The probe render failed.", {
        current: { error_code: "RENDER_FAILED", message: "render token secret is not set" },
      });
    }
    logLine({ job: PROBE_JOB_ID, status: "failed", error: "RENDER_FAILED" });
    return opsError("internal_error", "The probe render failed.", {
      current: { error_code: "RENDER_FAILED", message: "the renderer failed" },
    });
  }
}

/** Steps 3 to 5 now, 6 to 14 in `after()` (export-and-recovery 3.3). */
async function runJob(job_id: string): Promise<Response> {
  if (!isUuidShaped(job_id)) return opsNotFound();
  try {
    const claim = await claimJob(workerDeps, job_id);
    if (claim.kind === "not_found") return opsNotFound();
    if (claim.kind === "not_started") {
      const body: OpsRunBody = { started: "false", status: claim.status };
      return opsJson(body, 200);
    }
    if (claim.kind === "drill_failed") {
      // The drill's failure is a first failure: the webhook goes out after the answer (2.8).
      after(async () => {
        await workerDeps.notifyFailure(job_id).catch(() => undefined);
      });
      const body: OpsRunBody = { started: "false", status: "failed" };
      return opsJson(body, 200);
    }
    after(async () => {
      try {
        await finishJob(workerDeps, claim);
      } catch (error) {
        logLine({ job: job_id, status: "failed", error: "WORKER_CRASHED", name: error instanceof Error ? error.name : "error" });
      }
    });
    const body: OpsRunBody = { started: "true", attempt: String(claim.attempt) };
    return opsJson(body, 202);
  } catch (error) {
    logLine({ job: job_id, status: "failed", error: "CLAIM_FAILED", name: error instanceof Error ? error.name : "error" });
    return opsError("internal_error", "The job could not be started.");
  }
}
