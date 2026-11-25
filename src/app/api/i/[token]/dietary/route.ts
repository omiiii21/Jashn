import { guestRoutes } from "@/server/invite/guest-deps";

/** `POST /api/i/{token}/dietary`: `set_dietary` for a guest of the household (domain 3.4, AT-4.9). */
export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function POST(request: Request, context: RouteContext<"/api/i/[token]/dietary">) {
  const { token } = await context.params;
  return guestRoutes.dietary(request, token);
}
