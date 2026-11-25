import "server-only";

import type { SessionActor } from "@/contracts/domain";
import type { ExportJobView, ReadModelParams, ReadModelResult } from "@/contracts/read-models";
import { seededId } from "@/db/ids";

/**
 * The fixture export view at D0 (demo-data 2.3, decision D15): JOB-EXP-R2-PNG, the REV-2
 * card exported on Tue 24 Nov at 21:05 IST, Ready, still showing Banyan Hall. No signed
 * download URL: the stub signs nothing.
 */
function fixtureJobs(wedding_id: string): ExportJobView[] {
  return [
    {
      job_id: seededId("demo", "export_jobs", "JOB-EXP-R2-PNG"),
      seed_key: "JOB-EXP-R2-PNG",
      job_label: "JOB-EXP-R2-PNG",
      export_key: `export:${wedding_id}:rev2:png`,
      revision: 2,
      format: "png",
      status: "succeeded",
      label: "Ready",
      synthetic: false,
      attempts: 1,
      max_attempts: 3,
      renderer: "chromium",
      card_summary: "Mira & Kabir, Reception, Monday, 14 December 2026, Banyan Hall",
      card_functions: ["Reception"],
      last_error: null,
      notified_at: null,
      stalled: false,
      can_retry: false,
      out_of_date: false,
      download_url: null,
      created_at: "2026-11-24T15:34:00Z",
      updated_at: "2026-11-24T15:35:00Z",
      attempt_log: [
        {
          attempt_no: 1,
          trigger: "request",
          status: "succeeded",
          started_at: "2026-11-24T15:34:10Z",
          finished_at: "2026-11-24T15:35:00Z",
          error_code: null,
          renderer: "chromium",
          nudgebee_execution_id: null,
          approver: null,
          started_by: "Mira",
        },
      ],
    },
  ];
}

/**
 * The `export_job_status` read model (domain 4.8), Lane D's because its computed fields
 * (stalled, can_retry, card_summary) are job logic (D16). Lane A's read-model index
 * re-exports it. Contracts stub: the fixture export view (D52); Lane D replaces the body
 * in lane-d-export-jobs in the 11:40 batch. It never writes.
 */
export async function export_job_status(
  actor: SessionActor,
  params: ReadModelParams<"export_job_status"> = {},
): Promise<ReadModelResult<"export_job_status">> {
  const wedding_id = actor.wedding_id ?? seededId("demo", "weddings", "WED");
  const jobs = fixtureJobs(wedding_id).filter((job) => !params.job_id || job.job_id === params.job_id);
  return { version: 1, hidden: [], jobs, published_revision: 2 };
}
