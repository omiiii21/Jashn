import "server-only";

import { RenderError, renderCardPng, renderErrorMessage } from "@/server/export/chromium";
import { mintRenderToken } from "@/server/export/render-token";
import { readEnvironmentFlags } from "@/server/flags";
import { services } from "@/server/services";
import { routes } from "@/contracts/routes";
import type { PublicationSnapshot, WeddingId } from "@/contracts/domain";
import type { AppendActivity, BumpVersion, SigningHelpers } from "@/contracts/services";
import type { CardPhoto } from "@/components/invite/card-model";

import { selfBaseUrl } from "./base-url";
import type { JobDeps } from "./handlers";
import { kickRun } from "./kick";
import type { OpsDeps } from "./ops";
import { verifyOpsBearer } from "./ops-auth";
import type { JobStore } from "./store";
import { sendFirstFailureWebhook, type WebhookDeps } from "./webhook";
import { JobRenderFailure, type WorkerDeps } from "./worker";

/**
 * The single switch point from Lane D's temporary pieces to Lane A's (D58, D102): the
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
  async render(job, renderer, cap_ms) {
    void renderer; // The og fallback joins from lane-d-og-fallback; Chromium stays selected.
    const url = `${selfBaseUrl()}${routes.renderCard(job.id, mintRenderToken(job.id))}`;
    try {
      const { png, timings } = await renderCardPng({ url, cap_ms });
      return { png, timings: { ...timings } };
    } catch (error) {
      if (error instanceof RenderError) throw new JobRenderFailure(error.code, renderErrorMessage(error));
      throw new JobRenderFailure("RENDER_FAILED", "The renderer failed");
    }
  },
  upload: uploadExport,
  notifyFailure: async (job_id) => {
    await sendFirstFailureWebhook(webhookDeps, job_id);
  },
};

export const opsDeps: OpsDeps<unknown> = {
  ...jobDeps,
  verify: (authorization) => verifyOpsBearer(authorization),
  dispatch: (actor, envelope) => services.dispatch(actor, envelope),
  kick: (job_id) => void kickRun(job_id, { wait: false }),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => new Date(),
};
