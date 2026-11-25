/**
 * The public Supabase settings (architecture 5.1). Only `NEXT_PUBLIC_` names live here, so the
 * proxy, the server client and (later) the browser upload client can all read them. The service
 * role key is read only in `admin.ts`, which is server-only.
 *
 * Until the sponsor keys land these are empty, and every caller falls back to fixture mode:
 * the proxy passes requests through untouched and the session helper returns the fixture member.
 */

export type SupabasePublicEnv = {
  url: string;
  anon_key: string;
};

function clean(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** The project URL and the browser key, or null while either is missing. */
export function getSupabasePublicEnv(): SupabasePublicEnv | null {
  // Literal property access, so Next inlines the values at build time.
  const url = clean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anon_key = clean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  if (!url || !anon_key) return null;
  return { url, anon_key };
}

/** True when Supabase Auth can run: the project URL and the browser key are both set. */
export function isSupabaseAuthConfigured(): boolean {
  return getSupabasePublicEnv() !== null;
}
