import "server-only";

import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import { getSupabasePublicEnv } from "./env";

/**
 * The `@supabase/ssr` server client for this request (architecture 3.5), built from
 * `await cookies()` with the default cookie options. Create one per request; never share it.
 *
 * Server components can't write cookies, so `setAll` swallows that error there: the proxy
 * refreshes the session on the next navigation. Server actions and route handlers can write
 * them, which is how sign-in and sign-out set and clear the session.
 *
 * Only `src/server/auth/` calls this (architecture 3.5: the two places that touch Supabase Auth).
 */
export async function createSupabaseServerClient(): Promise<SupabaseClient> {
  const env = getSupabasePublicEnv();
  if (!env) throw new Error("Supabase Auth is not configured (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY)");

  const cookieStore = await cookies();
  return createServerClient(env.url, env.anon_key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a server component: the proxy refreshes the session instead.
        }
      },
    },
  });
}
