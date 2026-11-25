import "server-only";

import { PROBE_JOB_ID } from "@/contracts/jobs";
import { routes } from "@/contracts/routes";
import { selfBaseUrl } from "@/server/jobs/base-url";
import { renderCardPng, type RenderTestMode, type RenderTimings } from "./chromium";
import { mintRenderToken } from "./render-token";

/**
 * The production smoke test and warm-up (export-and-recovery 3.3 step 2, 3.6): render the
 * built-in sample card through the same page, browser and slot as real jobs. No database,
 * no upload, no activity.
 */
export async function renderProbe(options: { test_mode?: RenderTestMode | null } = {}): Promise<{
  png: Uint8Array;
  timings: RenderTimings;
}> {
  const token = mintRenderToken(PROBE_JOB_ID);
  const url = `${selfBaseUrl()}${routes.renderCard(PROBE_JOB_ID, token)}`;
  return renderCardPng({ url, test_mode: options.test_mode ?? null });
}

/** The six timing headers the probe answers with (3.4). */
export function renderTimingHeaders(timings: RenderTimings): Record<string, string> {
  return {
    "X-Render-Launch-Ms": String(timings.launch_ms),
    "X-Render-Navigate-Ms": String(timings.navigate_ms),
    "X-Render-Fonts-Ms": String(timings.fonts_ms),
    "X-Render-Capture-Ms": String(timings.capture_ms),
    "X-Render-Total-Ms": String(timings.total_ms),
    "X-Render-Instance": timings.instance,
  };
}
