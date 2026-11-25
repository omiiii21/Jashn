import "server-only";

import type { ExportFormat, MemberId, PublicationId, PublicationSnapshot, WeddingId } from "@/contracts/domain";
import type { ExportJobStatus, ExportRenderer, ExportTrigger, FailInjection } from "@/contracts/jobs";

/**
 * The export tables as a port (architecture 4.2 rule 2). Row shapes follow
 * `src/db/schema.ts` (`export_jobs`, `export_attempts`): `id` keys, timestamps as Date.
 * The Drizzle implementation is `drizzle-store.ts`; unit tests use `memory-store.ts`.
 *
 * Lock order everywhere: the `weddings` row first, then the job (the dispatcher's order),
 * so the worker and the ops routes never deadlock with a command.
 */

export type ExportJobRow = {
  id: string;
  wedding_id: WeddingId;
  publication_id: PublicationId;
  revision: number;
  format: ExportFormat;
  export_key: string;
  status: ExportJobStatus;
  card_event_ids: string[];
  attempts: number;
  max_attempts: number;
  lease_until: Date | null;
  fail_injection: FailInjection;
  synthetic: boolean;
  last_error_code: string | null;
  last_error_message: string | null;
  last_error_at: Date | null;
  artifact_path: string | null;
  artifact_sha256: string | null;
  artifact_bytes: number | null;
  artifact_created_at: Date | null;
  notified_at: Date | null;
  requested_by_member_id: MemberId;
  created_at: Date;
  updated_at: Date;
  seed_key: string | null;
};

export type ExportAttemptRow = {
  id: string;
  wedding_id: WeddingId;
  job_id: string;
  attempt_no: number;
  trigger: ExportTrigger;
  idempotency_key: string | null;
  nudgebee_workflow_id: string | null;
  nudgebee_execution_id: string | null;
  approver: string | null;
  status: ExportJobStatus;
  renderer: ExportRenderer | null;
  error_code: string | null;
  started_at: Date | null;
  finished_at: Date | null;
  created_at: Date;
};

export type JobWeddingRow = {
  id: WeddingId;
  is_sample: boolean;
  published_revision: number | null;
  /** `weddings.version`, for the read model's `version`. */
  version: number;
};

export type JobPublicationRow = {
  id: PublicationId;
  revision: number;
  snapshot: PublicationSnapshot;
};

export type NewExportJob = Omit<ExportJobRow, "id" | "created_at" | "updated_at" | "seed_key">;
export type NewExportAttempt = Omit<ExportAttemptRow, "id" | "created_at">;
export type ExportJobPatch = Partial<Omit<ExportJobRow, "id" | "wedding_id" | "export_key" | "created_at" | "seed_key">>;
export type ExportAttemptPatch = Partial<Pick<ExportAttemptRow, "status" | "renderer" | "error_code" | "started_at" | "finished_at">>;

/** Compare-and-set guard on the job: every listed field must still hold. */
export type JobGuard = Partial<Pick<ExportJobRow, "status" | "attempts">>;

export interface JobStore<Tx> {
  /** Runs `work` in one transaction (the worker and the ops routes; commands get the dispatcher's). */
  transaction<T>(work: (tx: Tx) => Promise<T>): Promise<T>;
  /** Locks and reads the wedding row (FOR UPDATE). */
  lockWedding(tx: Tx, wedding_id: WeddingId): Promise<JobWeddingRow | null>;
  readWedding(tx: Tx | null, wedding_id: WeddingId): Promise<JobWeddingRow | null>;
  readPublication(tx: Tx | null, wedding_id: WeddingId, revision: number): Promise<JobPublicationRow | null>;
  readPublicationById(tx: Tx | null, publication_id: PublicationId): Promise<JobPublicationRow | null>;
  /** Active invitations (not revoked, guest not deleted) as guest and event pairs. */
  readActiveInvitations(tx: Tx | null, wedding_id: WeddingId): Promise<{ guest_id: string; event_id: string }[]>;
  /** Display names by member id, for the attempt log. */
  readMemberNames(tx: Tx | null, wedding_id: WeddingId): Promise<Record<string, string>>;

  readJob(tx: Tx | null, job_id: string): Promise<ExportJobRow | null>;
  /** Reads the job with a row lock (FOR UPDATE). */
  lockJob(tx: Tx, job_id: string): Promise<ExportJobRow | null>;
  findJobByKey(tx: Tx | null, export_key: string): Promise<ExportJobRow | null>;
  listJobs(tx: Tx | null, wedding_id: WeddingId): Promise<ExportJobRow[]>;
  /** INSERT … ON CONFLICT (export_key) DO NOTHING: null when a twin won the race. */
  insertJob(tx: Tx, row: NewExportJob, now: Date): Promise<ExportJobRow | null>;
  /** Applies the patch only when the guard still holds; null when it didn't (a lost race). */
  updateJob(tx: Tx, job_id: string, guard: JobGuard, patch: ExportJobPatch, now: Date): Promise<ExportJobRow | null>;

  listAttempts(tx: Tx | null, job_id: string): Promise<ExportAttemptRow[]>;
  insertAttempt(tx: Tx, row: NewExportAttempt, now: Date): Promise<ExportAttemptRow>;
  updateAttempt(tx: Tx, job_id: string, attempt_no: number, patch: ExportAttemptPatch, now: Date): Promise<void>;
}
