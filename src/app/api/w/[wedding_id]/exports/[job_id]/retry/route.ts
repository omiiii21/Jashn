import { postExportRetry } from "@/server/jobs/member-routes";

/** POST: the owner's "Retry here" (`retry_card_export`). */

export const maxDuration = 30;
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: RouteContext<"/api/w/[wedding_id]/exports/[job_id]/retry">) {
  const { wedding_id, job_id } = await context.params;
  return postExportRetry(request, wedding_id, job_id);
}
