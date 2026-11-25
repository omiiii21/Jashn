import { postExport } from "@/server/jobs/member-routes";

/** POST: the exports panel's "Export card" (`request_card_export`). */

export const maxDuration = 30;
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: RouteContext<"/api/w/[wedding_id]/exports">) {
  const { wedding_id } = await context.params;
  return postExport(request, wedding_id);
}
