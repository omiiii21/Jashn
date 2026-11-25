import "server-only";

import { buildCardModel, type CardPhoto } from "@/components/invite/card-model";
import type { PublicationSnapshot, WeddingId } from "@/contracts/domain";
import type { ExportRenderer } from "@/contracts/jobs";
import { routes } from "@/contracts/routes";
import { RenderError, renderCardPng, renderErrorMessage } from "@/server/export/chromium";
import { renderCardOg } from "@/server/export/og-renderer";
import { mintRenderToken } from "@/server/export/render-token";

import { selfBaseUrl } from "./base-url";
import type { ExportJobRow, JobStore } from "./store";
import { JobRenderFailure } from "./worker";

/**
 * Steps 7 to 10 for one job (export-and-recovery 3.3, 3.7). Chromium screenshots the render
 * page; `og` builds the same card model in memory with next/og. Every failure becomes a
 * JobRenderFailure with a fixed message, never a URL.
 */
export type RenderJobDeps<Tx> = {
  store: JobStore<Tx>;
  photo: (wedding_id: WeddingId, snapshot: PublicationSnapshot) => Promise<CardPhoto | null>;
};

function failure(error: unknown): JobRenderFailure {
  if (error instanceof JobRenderFailure) return error;
  if (error instanceof RenderError) return new JobRenderFailure(error.code, renderErrorMessage(error));
  return new JobRenderFailure("RENDER_FAILED", "The renderer failed");
}

export async function renderJob<Tx>(
  deps: RenderJobDeps<Tx>,
  job: ExportJobRow,
  renderer: ExportRenderer,
  cap_ms: number,
): Promise<{ png: Uint8Array; timings: Record<string, number | string> }> {
  try {
    if (renderer === "og") {
      const started = Date.now();
      const publication = await deps.store.readPublicationById(null, job.publication_id);
      const wedding = await deps.store.readWedding(null, job.wedding_id);
      if (!publication || !wedding) throw new JobRenderFailure("RENDER_FAILED", "render page returned 404");
      const model = buildCardModel({
        snapshot: publication.snapshot,
        card_event_ids: job.card_event_ids,
        is_sample: wedding.is_sample,
        photo: await deps.photo(job.wedding_id, publication.snapshot),
      });
      const png = await renderCardOg(model);
      return { png, timings: { total_ms: Date.now() - started, capture_ms: Date.now() - started } };
    }
    const url = `${selfBaseUrl()}${routes.renderCard(job.id, mintRenderToken(job.id))}`;
    const { png, timings } = await renderCardPng({ url, cap_ms });
    return { png, timings: { ...timings } };
  } catch (error) {
    throw failure(error);
  }
}
