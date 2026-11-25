import "server-only";

import { readEnvironmentFlags } from "@/server/flags";
import type { PublicationSnapshot, WeddingId } from "@/contracts/domain";
import type { AppendActivity, BumpVersion, SigningHelpers } from "@/contracts/services";
import type { CardPhoto } from "@/components/invite/card-model";

import type { JobDeps } from "./handlers";
import type { JobStore } from "./store";
import { sendFirstFailureWebhook, type WebhookDeps } from "./webhook";
import { renderJob } from "./render-job";
import type { WorkerDeps } from "./worker";

/**
 * The single switch point from Lane D's temporary pieces to Lane A's (D58, D102). It never
 * imports `services` (that would close a cycle through the dispatcher's registry, which
 * imports these deps); the ops routes' deps, which dispatch, live in `ops-deps.ts`. The
 * store (Lane A's schema, 14:00), the activity and version helpers, the Storage adapter
 * and the JOBS_API_TOKEN verifier (14:45). Until each lands, its placeholder refuses
 * loudly; the fixture dispatcher never reaches these handlers.
 */

/** False until the store and helpers point at Lane A's: the read model then serves the fixture view. */
export const JOBS_WIRED = false;

/** Lane A's signing helpers (download links); null until they land. */
export const signing: Pick<SigningHelpers, "exportDownloadUrl"> | null = null;

/**
 * The published couple photo for the card (export 1.3), signed for the render page. Until
 * Lane A's signing helpers land the card renders without it, which the layout allows (D107).
 */
export async function cardPhotoFor(wedding_id: WeddingId, snapshot: PublicationSnapshot): Promise<CardPhoto | null> {
  void wedding_id;
  void snapshot;
  return null;
}

function notWired(what: string): never {
  throw new Error(`${what} is not wired yet: it lands with Lane A's batch.`);
}

const placeholderStore = new Proxy({} as JobStore<unknown>, {
  get: (_target, property) => () => notWired(`The export store (${String(property)})`),
});
const appendActivity: AppendActivity<unknown> = async () => notWired("The activity helper");
const bumpVersion: BumpVersion<unknown> = async () => notWired("The version helper");
async function uploadExport(object_key: string, png: Uint8Array): Promise<{ bytes: number }> {
  void object_key;
  void png;
  return notWired("The Storage adapter");
}

function log(message: string, fields: Record<string, string | number> = {}): void {
  const tail = Object.entries(fields)
    .map(([key, value]) => `${key}=${value}`)
    .join(" ");
  console.info(`[export] ${message}${tail ? ` ${tail}` : ""}`);
}

export const jobDeps: JobDeps<unknown> = {
  store: placeholderStore,
  appendActivity,
  bumpVersion,
  readFlags: readEnvironmentFlags,
  drillEnv: () => process.env.EXPORT_FAILURE_DRILL,
  log,
};

export const webhookDeps: WebhookDeps<unknown> = {
  store: jobDeps.store,
  url: () => process.env.NUDGEBEE_EXPORT_WEBHOOK_URL,
  fetch: (input, init) => fetch(input, init),
  now: () => new Date(),
  log,
};

export const workerDeps: WorkerDeps<unknown> = {
  ...jobDeps,
  now: () => new Date(),
  render: (job, renderer, cap_ms) => renderJob({ store: jobDeps.store, photo: cardPhotoFor }, job, renderer, cap_ms),
  upload: uploadExport,
  notifyFailure: async (job_id) => {
    await sendFirstFailureWebhook(webhookDeps, job_id);
  },
};
