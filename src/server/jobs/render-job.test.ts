import { describe, expect, it } from "vitest";

import type { WeddingId } from "@/contracts/domain";
import { probeSnapshot } from "@/server/export/probe-fixture";

import { addPublication, createMemoryJobStore, emptyJobState } from "./memory-store";
import { renderJob } from "./render-job";
import type { ExportJobRow } from "./store";
import { JobRenderFailure } from "./worker";

/** AT-7.3's renderer branch (export 3.7): a job renders through next/og with no browser. */

const WEDDING = "3f71c430-a498-531f-a2ed-12e2267e7ccf" as WeddingId;
const PUBLICATION = "00000000-0000-4000-8000-0000000000a3";

function job(): ExportJobRow {
  const now = new Date("2026-11-25T09:00:00Z");
  return {
    id: "00000000-0000-4000-8001-000000000001",
    wedding_id: WEDDING,
    publication_id: PUBLICATION,
    revision: 3,
    format: "png",
    export_key: `export:${WEDDING}:rev3:png`,
    status: "rendering",
    card_event_ids: probeSnapshot("rev3").events.map((event) => event.event_id),
    attempts: 1,
    max_attempts: 3,
    lease_until: null,
    fail_injection: "none",
    synthetic: false,
    last_error_code: null,
    last_error_message: null,
    last_error_at: null,
    artifact_path: null,
    artifact_sha256: null,
    artifact_bytes: null,
    artifact_created_at: null,
    notified_at: null,
    requested_by_member_id: "00000000-0000-4000-8000-0000000000m1",
    created_at: now,
    updated_at: now,
    seed_key: null,
  };
}

describe("renderJob", () => {
  it("renders a 1080 × 1350 PNG with og, without a browser", async () => {
    const state = emptyJobState();
    state.weddings.set(WEDDING, { id: WEDDING, is_sample: true, published_revision: 3, version: 1 });
    addPublication(state, WEDDING, PUBLICATION, 3, probeSnapshot("rev3"));
    const { png } = await renderJob({ store: createMemoryJobStore(state), photo: async () => null }, job(), "og", 45_000);
    const bytes = Buffer.from(png);
    expect(bytes.subarray(1, 4).toString("ascii")).toBe("PNG");
    expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([1080, 1350]);
  }, 30_000);

  it("fails RENDER_FAILED when the job's publication is gone", async () => {
    const state = emptyJobState();
    state.weddings.set(WEDDING, { id: WEDDING, is_sample: true, published_revision: 3, version: 1 });
    await expect(renderJob({ store: createMemoryJobStore(state), photo: async () => null }, job(), "og", 45_000)).rejects.toBeInstanceOf(JobRenderFailure);
  });
});
