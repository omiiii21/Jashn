import "server-only";

import { services } from "@/server/services";

import { jobDeps } from "./deps";
import type { JobDeps } from "./handlers";
import { kickRun } from "./kick";
import type { OpsDeps } from "./ops";
import { verifyOpsBearer } from "./ops-auth";

/**
 * The ops routes' deps (export-and-recovery 5.1 to 5.4). Separate from `deps.ts` because
 * they dispatch through `services`, and the dispatcher's registry imports `deps.ts`.
 */
/** The transaction type the job deps were built with. */
type DepsTx = typeof jobDeps extends JobDeps<infer T> ? T : never;

export const opsDeps: OpsDeps<DepsTx> = {
  ...jobDeps,
  verify: (authorization) => verifyOpsBearer(authorization),
  dispatch: (actor, envelope) => services.dispatch(actor, envelope),
  kick: (job_id) => void kickRun(job_id, { wait: false }),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => new Date(),
};
