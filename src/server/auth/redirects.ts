import "server-only";

import type { SessionActor } from "@/contracts/domain";
import { routes } from "@/contracts/routes";

/** The query parameter the login and sign-up pages read to return a user where they were going. */
export const NEXT_PARAM = "next";

/**
 * Where the root page sends someone (architecture 4.1): signed out → /login; a member → their
 * first wedding's home; signed in with no wedding → /setup.
 */
export function homePathFor(actor: Pick<SessionActor, "wedding_id"> | null): string {
  if (!actor) return routes.login();
  if (actor.wedding_id) return routes.wedding(actor.wedding_id);
  return routes.setup();
}

/**
 * A safe same-site path from a `next` value, or null. Only an absolute path on this site is
 * kept ("/join/abc"); anything that could leave the site ("//evil.test", "https://…",
 * "/\\evil") or loop back to the auth pages is dropped.
 */
export function safeNextPath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (value.length === 0 || value.length > 512) return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return null;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    // Control characters and backslashes: browsers may read "/\evil" as "//evil".
    if (code < 0x20 || code === 0x7f || code === 0x5c) return null;
  }
  let parsed: URL;
  try {
    parsed = new URL(value, "http://jashn.invalid");
  } catch {
    return null;
  }
  if (parsed.origin !== "http://jashn.invalid") return null;
  const path = parsed.pathname;
  // Dot segments collapse during parsing: "/.//evil.test" and "/%2e%2e//evil.test" both
  // become "//evil.test", which a browser reads as another host.
  if (path.startsWith("//")) return null;
  if (path === routes.login() || path === routes.signup()) return null;
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

/** The login page's URL, carrying where to go after signing in. */
export function loginPathWithNext(next: string | null | undefined): string {
  const safe = safeNextPath(next);
  return safe ? `${routes.login()}?${NEXT_PARAM}=${encodeURIComponent(safe)}` : routes.login();
}
