import { NextResponse, type NextRequest } from "next/server";

import { shouldRefreshSession } from "@/lib/supabase/paths";
import { refreshSupabaseSession } from "@/lib/supabase/proxy";

/**
 * Supabase session refresh, nothing else (architecture 2.1, 3.5). It never redirects: the
 * `(planner)` layout sends signed-out users to /login, and the guard checks every command.
 * Without the Supabase env vars it passes every request through untouched.
 */
export async function proxy(request: NextRequest) {
  if (!shouldRefreshSession(request.nextUrl.pathname)) return NextResponse.next();
  return refreshSupabaseSession(request);
}

export const config = {
  // Skips static assets, /i/*, /api/i/*, /render/*, /api/ops/*, /api/health and the version
  // poll /api/w/{wedding_id}/version. Keep in step with src/lib/supabase/paths.ts (a test
  // compiles this with Next's own parser and compares the two).
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|i/|api/i/|render/|api/ops/|api/health(?:/|$)|api/w/[^/]+/version(?:/|$)|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|txt|xml|webmanifest|woff2?|ttf|otf|map|mp3|wav|webm|pdf)$).*)",
  ],
};
