import { guestRoutes } from "@/server/invite/guest-deps";

/**
 * `GET /api/i/{token}/photo`: the published couple photo from the app's own origin, so the
 * guest page loads nothing from another origin (AT-9.5, G6). The same 404 as the page for a
 * bad token or no photo.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function GET(request: Request, context: RouteContext<"/api/i/[token]/photo">) {
  const { token } = await context.params;
  return guestRoutes.photo(request, token);
}
