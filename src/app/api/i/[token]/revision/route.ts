import { guestRoutes } from "@/server/invite/guest-deps";

/** `GET /api/i/{token}/revision`: `{ revision }`, polled every 10 s by the guest page (architecture 2.4). */
export const dynamic = "force-dynamic";
export const maxDuration = 10;

export async function GET(request: Request, context: RouteContext<"/api/i/[token]/revision">) {
  const { token } = await context.params;
  return guestRoutes.revision(request, token);
}
