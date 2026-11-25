import type { HealthBody } from "@/contracts/api";
import type { FlagsSelfCheck } from "@/contracts/flags";

/** Reads only VERCEL_GIT_COMMIT_SHA, VERCEL_ENV and NODE_ENV; `process.env` fits this shape. */
export type HealthEnv = Readonly<Record<string, string | undefined>>;

/** Liveness plus Lane C's flags self-check; no database or other sponsor calls (decision D12). */
export function healthResponse(flags: FlagsSelfCheck, env: HealthEnv = process.env): HealthBody {
  return {
    ok: true,
    sha: env.VERCEL_GIT_COMMIT_SHA ?? "local",
    env: env.VERCEL_ENV ?? env.NODE_ENV ?? "development",
    flags,
  };
}
