import { jobDeps, opsDeps } from "@/server/jobs/deps";
import { opsRetry } from "@/server/jobs/ops";
import { opsError } from "@/server/jobs/ops-http";

/** POST /api/ops/export-jobs/[job_id]/retry?wait= (export-and-recovery 5.3, 5.4). */

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: RouteContext<"/api/ops/export-jobs/[job_id]/retry">) {
  const { job_id } = await context.params;
  try {
    return await opsRetry(opsDeps, request, job_id);
  } catch (error) {
    jobDeps.log("ops retry failed", { error: error instanceof Error ? error.name : "error" });
    return opsError("internal_error", "The retry could not be recorded.");
  }
}
