import { jobDeps } from "@/server/jobs/deps";
import { opsDeps } from "@/server/jobs/ops-deps";
import { opsGetStatus } from "@/server/jobs/ops";
import { opsError } from "@/server/jobs/ops-http";

/** GET /api/ops/export-jobs/[job_id]?wait=&expect= (export-and-recovery 5.1, 5.2). */

export const maxDuration = 15;
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: RouteContext<"/api/ops/export-jobs/[job_id]">) {
  const { job_id } = await context.params;
  try {
    return await opsGetStatus(opsDeps, request, job_id);
  } catch (error) {
    jobDeps.log("ops read failed", { error: error instanceof Error ? error.name : "error" });
    return opsError("internal_error", "The job could not be read.");
  }
}
