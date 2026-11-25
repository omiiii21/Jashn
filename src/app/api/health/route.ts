import { getFlagsSummary } from "@/server/flags";
import { healthResponse } from "./health";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(healthResponse(await getFlagsSummary()), {
    headers: { "Cache-Control": "no-store" },
  });
}
