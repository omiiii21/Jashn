import "server-only";

import type { CardPhoto } from "@/components/invite/card-model";
import type { AssetId, PublicationSnapshot, WeddingId } from "@/contracts/domain";
import { STORAGE_BUCKETS, type SigningHelpers } from "@/contracts/services";
import type { Tx } from "@/db/client";
import { appendActivity } from "@/server/activity/append";
import { isLiveAuth } from "@/server/auth/session";
import { readEnvironmentFlags } from "@/server/flags";
import { bumpVersion } from "@/server/live/version";
import { signingHelpers, storage } from "@/server/storage";

import { createDrizzleJobStore } from "./drizzle-store";
import type { JobDeps } from "./handlers";
import { renderJob } from "./render-job";
import { sendFirstFailureWebhook, type WebhookDeps } from "./webhook";
import type { WorkerDeps } from "./worker";

/**
 * The single switch point to Lane A's pieces (D58, D102): the store on Lane A's schema, the
 * activity and version helpers, the Storage adapter and its signing helpers. It never
 * imports `services` (that would close a cycle through the dispatcher's registry, which
 * imports these deps); the ops routes' deps, which dispatch, live in `ops-deps.ts`.
 */

/**
 * The same switch as `services` (live auth and a database): the job reads, `/run` and the ops
 * routes never read real rows while commands still go to the fixture dispatcher.
 */
export const JOBS_WIRED = isLiveAuth();

/** Lane A's signing helpers (the download link). */
export const signing: Pick<SigningHelpers, "exportDownloadUrl"> = signingHelpers;

function log(message: string, fields: Record<string, string | number> = {}): void {
  const tail = Object.entries(fields)
    .map(([key, value]) => `${key}=${value}`)
    .join(" ");
  console.info(`[export] ${message}${tail ? ` ${tail}` : ""}`);
}

export const jobDeps: JobDeps<Tx> = {
  store: createDrizzleJobStore(),
  appendActivity,
  bumpVersion,
  readFlags: readEnvironmentFlags,
  drillEnv: () => process.env.EXPORT_FAILURE_DRILL,
  log,
};

/**
 * The published couple photo for the card (export 1.3), signed for the render page. Null
 * when there is none, its file is missing or Storage isn't configured: the card then uses
 * its no-photo layout (D107).
 */
export async function cardPhotoFor(wedding_id: WeddingId, snapshot: PublicationSnapshot): Promise<CardPhoto | null> {
  const asset_id = snapshot.invite_style.photo_asset_id;
  if (!asset_id) return null;
  const asset = await jobDeps.store.readAsset(null, wedding_id, asset_id as AssetId);
  if (!asset) return null;
  const url = await signingHelpers.couplePhotoUrl(asset, "member");
  if (!url) return null;
  const { bride_name, groom_name } = snapshot.wedding;
  return { url, alt: `${bride_name} and ${groom_name}` };
}

/** Step 12: upsert the fixed key, then check the stored size (Lane A's adapter, D41). */
async function uploadExport(object_key: string, png: Uint8Array): Promise<{ bytes: number }> {
  await storage.upload(STORAGE_BUCKETS.exports, object_key, png, { content_type: "image/png", upsert: true });
  const stored = await storage.stat(STORAGE_BUCKETS.exports, object_key);
  return { bytes: stored?.bytes ?? -1 };
}

export const webhookDeps: WebhookDeps<Tx> = {
  store: jobDeps.store,
  bumpVersion,
  url: () => process.env.NUDGEBEE_EXPORT_WEBHOOK_URL,
  fetch: (input, init) => fetch(input, init),
  now: () => new Date(),
  log,
};

export const workerDeps: WorkerDeps<Tx> = {
  ...jobDeps,
  now: () => new Date(),
  render: (job, renderer, cap_ms) => renderJob({ store: jobDeps.store, photo: cardPhotoFor }, job, renderer, cap_ms),
  upload: uploadExport,
  notifyFailure: async (job_id) => {
    await sendFirstFailureWebhook(webhookDeps, job_id);
  },
};
