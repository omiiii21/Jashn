import "server-only";

import { CommandFailure } from "@/contracts/commands";
import type { SessionActor, WeddingId } from "@/contracts/domain";
import type { ExportJobView, ReadModelParams, ReadModelResult } from "@/contracts/read-models";
import type { SigningHelpers } from "@/contracts/services";
import { seededId } from "@/db/ids";

import { JOBS_WIRED, jobDeps, signing } from "./deps";
import type { JobStore } from "./store";
import { toJobView } from "./view";

/**
 * The `export_job_status` read model (domain 4.8; export 11 item 16), Lane D's because its
 * computed fields (stalled, can_retry, card_summary) are job logic (D16). Lane A's
 * read-model index re-exports it. It never writes: a job lazy expiry would fail shows as
 * `stalled`, and only the ops routes, the retry paths and a new request write the expiry.
 */
export async function export_job_status(
  actor: SessionActor,
  params: ReadModelParams<"export_job_status"> = {},
): Promise<ReadModelResult<"export_job_status">> {
  const wedding_id = actor.wedding_id;
  if (!wedding_id) throw new CommandFailure({ code: "not_found", message: "Not found." });
  if (!JOBS_WIRED) return fixtureModel(wedding_id, params);
  return buildExportJobStatus(jobDeps.store, signing, actor, wedding_id, params, new Date());
}

export async function buildExportJobStatus<Tx>(
  store: JobStore<Tx>,
  sign: Pick<SigningHelpers, "exportDownloadUrl"> | null,
  actor: SessionActor,
  wedding_id: WeddingId,
  params: ReadModelParams<"export_job_status">,
  now: Date,
): Promise<ReadModelResult<"export_job_status">> {
  const wedding = await store.readWedding(null, wedding_id);
  if (!wedding) throw new CommandFailure({ code: "not_found", message: "Not found." });
  const member_names = await store.readMemberNames(null, wedding_id);
  const rows = (await store.listJobs(null, wedding_id))
    .filter((job) => !params.job_id || job.id === params.job_id)
    .sort((a, b) => b.revision - a.revision || b.created_at.getTime() - a.created_at.getTime());

  const jobs: ExportJobView[] = [];
  for (const job of rows) {
    const publication = await store.readPublicationById(null, job.publication_id);
    const attempts = await store.listAttempts(null, job.id);
    let download_url: string | null = null;
    if (sign && job.status === "succeeded" && job.artifact_path) {
      try {
        download_url = await sign.exportDownloadUrl({ wedding_id, revision: job.revision, format: "png" });
      } catch {
        // A seeded Ready job may have no file yet (D15): no link, never an error.
        download_url = null;
      }
    }
    jobs.push(
      toJobView(job, attempts, {
        snapshot: publication?.snapshot ?? null,
        is_sample: wedding.is_sample,
        published_revision: wedding.published_revision,
        role: actor.role,
        member_names,
        now,
        download_url,
      }),
    );
  }
  return { version: wedding.version, hidden: [], jobs, published_revision: wedding.published_revision };
}

/** The fixture view at D0 (demo-data 2.3, D15), until the store is wired: JOB-EXP-R2-PNG, Ready. */
function fixtureModel(wedding_id: WeddingId, params: ReadModelParams<"export_job_status">): ReadModelResult<"export_job_status"> {
  const job: ExportJobView = {
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
    created_at: "2026-11-24T21:04:00+05:30",
    updated_at: "2026-11-24T21:05:00+05:30",
    attempt_log: [
      {
        attempt_no: 1,
        trigger: "request",
        status: "succeeded",
        started_at: "2026-11-24T21:04:10+05:30",
        finished_at: "2026-11-24T21:05:00+05:30",
        error_code: null,
        renderer: "chromium",
        nudgebee_execution_id: null,
        approver: null,
        started_by: "Mira",
      },
    ],
  };
  const jobs = [job].filter((entry) => !params.job_id || entry.job_id === params.job_id);
  return { version: 1, hidden: [], jobs, published_revision: 2 };
}
