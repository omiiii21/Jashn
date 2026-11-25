import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getSupabasePublicEnv } from "./env";

/** Supabase's auth cookies are named `sb-<project-ref>-auth-token` (chunked as `.0`, `.1`, …). */
function hasSupabaseAuthCookie(request: NextRequest): boolean {
  return request.cookies.getAll().some(({ name }) => name.startsWith("sb-") && name.includes("-auth-token"));
}

/**
 * Refreshes the Supabase session for one request and returns the response that carries any
 * rewritten cookies (the `@supabase/ssr` proxy pattern, architecture 3.5). Session refresh
 * only: it never redirects, and the pages and the guard decide who may see what.
 *
 * Passes the request through untouched when Supabase isn't configured, when the request has
 * no auth cookie, or when the refresh itself fails (the server helpers then treat the user as
 * signed out, rather than every page failing).
 */
export async function refreshSupabaseSession(request: NextRequest): Promise<NextResponse> {
  const env = getSupabasePublicEnv();
  if (!env || !hasSupabaseAuthCookie(request)) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const supabase = createServerClient(env.url, env.anon_key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        // Responses that set auth cookies must not be cached (the library's no-store headers).
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
      },
    },
  });

  try {
    // Nothing may run between creating the client and this call: it refreshes an expired
    // access token and writes the new cookies through setAll.
    await supabase.auth.getClaims();
  } catch {
    return NextResponse.next({ request });
  }
  return response;
}
