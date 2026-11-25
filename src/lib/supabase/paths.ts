/**
 * Which requests the proxy refreshes the Supabase session on (architecture 2.1). Pure, so it
 * is unit-tested; `src/proxy.ts` keeps the same exclusions in its literal `config.matcher`
 * (Next reads that statically) and calls this as a second check.
 *
 * Skipped: static assets, the guest site `/i/*` and its API `/api/i/*`, the render page
 * `/render/*`, the ops API `/api/ops/*`, `/api/health` and the version poll
 * `/api/w/{wedding_id}/version`. Those routes do their own checks, and the 2.5 s poll must
 * not pay for a session refresh.
 */

/** Path prefixes (with their trailing slash) that never get a session refresh. */
const SKIPPED_PREFIXES = ["/_next/static/", "/_next/image", "/i/", "/api/i/", "/render/", "/api/ops/"] as const;

/** Exact paths (a trailing slash allowed) that never get a session refresh. */
const SKIPPED_EXACT = ["/favicon.ico", "/api/health"] as const;

/** The version poll: `/api/w/{wedding_id}/version`. */
const VERSION_POLL = /^\/api\/w\/[^/]+\/version\/?$/;

/** Files served from `public/` or the build: images, fonts, source maps, text. */
const STATIC_FILE = /\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|txt|xml|webmanifest|woff2?|ttf|otf|map|mp3|wav|webm|pdf)$/i;

/** True when the proxy should refresh the session for this pathname. */
export function shouldRefreshSession(pathname: string): boolean {
  const path = pathname || "/";
  if (SKIPPED_PREFIXES.some((prefix) => path.startsWith(prefix))) return false;
  const trimmed = path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
  if ((SKIPPED_EXACT as readonly string[]).includes(trimmed)) return false;
  if (VERSION_POLL.test(path)) return false;
  if (STATIC_FILE.test(path)) return false;
  return true;
}
