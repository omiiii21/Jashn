import "server-only";

/**
 * The base URL for self-calls: the kick and Chromium opening the render page (architecture
 * 2.2; export-and-recovery 3.3 step 8). Production uses `https://` plus
 * VERCEL_PROJECT_PRODUCTION_URL, never VERCEL_URL (deployment protection covers it).
 * Locally, APP_BASE_URL (`http://localhost:3004` or the tunnel URL).
 */
export function selfBaseUrl(env: Readonly<Record<string, string | undefined>> = process.env): string {
  const production = env.VERCEL_PROJECT_PRODUCTION_URL;
  if (env.VERCEL_ENV === "production" && production) {
    return `https://${production.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;
  }
  const local = env.APP_BASE_URL;
  if (local) return local.replace(/\/+$/, "");
  if (production) return `https://${production.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;
  return `http://localhost:${env.PORT ?? "3000"}`;
}
