import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getSupabasePublicEnv } from "./env";

/**
 * The admin Supabase client, with `SUPABASE_SERVICE_ROLE_KEY` (architecture 3.5, 5.1). Server
 * only: admin user lookups, buckets and Storage URL signing. It never holds a user session and
 * is never imported by a client component, `src/db/` or a script.
 */

type AdminEnv = { url: string; service_role_key: string };

function getAdminEnv(): AdminEnv | null {
  const publicEnv = getSupabasePublicEnv();
  const service_role_key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!publicEnv || !service_role_key) return null;
  return { url: publicEnv.url, service_role_key };
}

/** True when the admin client can be built (the project URL and the service role key are set). */
export function isSupabaseAdminConfigured(): boolean {
  return getAdminEnv() !== null;
}

const globalForAdmin = globalThis as unknown as { __jashnSupabaseAdmin?: SupabaseClient };

/** The admin client, one per server instance. Throws when the keys are missing. */
export function getSupabaseAdmin(): SupabaseClient {
  if (globalForAdmin.__jashnSupabaseAdmin) return globalForAdmin.__jashnSupabaseAdmin;
  const env = getAdminEnv();
  if (!env) throw new Error("Supabase admin is not configured (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)");
  const client = createClient(env.url, env.service_role_key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  globalForAdmin.__jashnSupabaseAdmin = client;
  return client;
}
