import "server-only";

import { safeNextPath, NEXT_PARAM } from "./redirects";

/** Next's `searchParams` value for a page. */
export type PageSearchParams = Record<string, string | string[] | undefined>;

/** The safe `next` path from a login or sign-up page's search params, or null. */
export function nextFromSearchParams(params: PageSearchParams): string | null {
  const raw = params[NEXT_PARAM];
  return safeNextPath(Array.isArray(raw) ? raw[0] : raw);
}

/** An auth page's link to the other one, keeping `next`. */
export function withNextParam(path: string, next: string | null): string {
  return next ? `${path}?${NEXT_PARAM}=${encodeURIComponent(next)}` : path;
}
