export type HealthResponse = {
  ok: true;
  sha: string;
  env: string;
};

/** Reads only VERCEL_GIT_COMMIT_SHA and VERCEL_ENV; `process.env` fits this shape. */
export type HealthEnv = Readonly<Record<string, string | undefined>>;

/** Liveness only: no database or sponsor calls (decision D12). */
export function healthResponse(env: HealthEnv = process.env): HealthResponse {
  return {
    ok: true,
    sha: env.VERCEL_GIT_COMMIT_SHA ?? "local",
    env: env.VERCEL_ENV ?? "development",
  };
}
