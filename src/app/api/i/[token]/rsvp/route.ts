import { guestRoutes } from "@/server/invite/guest-deps";

/** `POST /api/i/{token}/rsvp`: `submit_rsvp` as the household's guest actor (domain 3.4, 7.3). */
export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function POST(request: Request, context: RouteContext<"/api/i/[token]/rsvp">) {
  const { token } = await context.params;
  return guestRoutes.rsvp(request, token);
}
