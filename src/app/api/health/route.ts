import { healthResponse } from "./health";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(healthResponse(), {
    headers: { "Cache-Control": "no-store" },
  });
}
