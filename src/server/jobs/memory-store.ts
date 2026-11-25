import type { PublicationSnapshot, WeddingId } from "@/contracts/domain";

import type { ExportAttemptRow, ExportJobRow, JobPublicationRow, JobStore, JobWeddingRow } from "./store";

/**
 * An in-memory JobStore for unit tests. Every method runs synchronously up to its single
 * await point, so each compare-and-set is atomic, as a row lock makes it in Postgres.
 */
export type MemoryJobState = {
  weddings: Map<WeddingId, JobWeddingRow>;
  publications: (JobPublicationRow & { wedding_id: WeddingId })[];
  invitations: { wedding_id: WeddingId; guest_id: string; event_id: string }[];
  member_names: Record<string, string>;
  jobs: ExportJobRow[];
  attempts: ExportAttemptRow[];
};

export function emptyJobState(): MemoryJobState {
  return { weddings: new Map(), publications: [], invitations: [], member_names: {}, jobs: [], attempts: [] };
}

export function addPublication(state: MemoryJobState, wedding_id: WeddingId, id: string, revision: number, snapshot: PublicationSnapshot): void {
  state.publications.push({ id, wedding_id, revision, snapshot });
}

function uuid(prefix: number, n: number): string {
  return `00000000-0000-4000-${String(8000 + prefix)}-${String(n).padStart(12, "0")}`;
}

export function createMemoryJobStore(state: MemoryJobState): JobStore<unknown> {
  let jobSeq = 1;
  let attemptSeq = 1;
  const clone = <T>(row: T): T => ({ ...row });
  return {
    async transaction(work) {
      return work(null);
    },
    async lockWedding(_tx, wedding_id) {
      const row = state.weddings.get(wedding_id);
      return row ? clone(row) : null;
    },
    async readWedding(_tx, wedding_id) {
      const row = state.weddings.get(wedding_id);
      return row ? clone(row) : null;
    },
    async readPublication(_tx, wedding_id, revision) {
      const row = state.publications.find((entry) => entry.wedding_id === wedding_id && entry.revision === revision);
      return row ? { id: row.id, revision: row.revision, snapshot: row.snapshot } : null;
    },
    async readPublicationById(_tx, publication_id) {
      const row = state.publications.find((entry) => entry.id === publication_id);
      return row ? { id: row.id, revision: row.revision, snapshot: row.snapshot } : null;
    },
    async readActiveInvitations(_tx, wedding_id) {
      return state.invitations.filter((row) => row.wedding_id === wedding_id).map(({ guest_id, event_id }) => ({ guest_id, event_id }));
    },
    async readMemberNames() {
      return { ...state.member_names };
    },
    async readJob(_tx, job_id) {
      const row = state.jobs.find((job) => job.id === job_id);
      return row ? clone(row) : null;
    },
    async lockJob(_tx, job_id) {
      const row = state.jobs.find((job) => job.id === job_id);
      return row ? clone(row) : null;
    },
    async findJobByKey(_tx, export_key) {
      const row = state.jobs.find((job) => job.export_key === export_key);
      return row ? clone(row) : null;
    },
    async listJobs(_tx, wedding_id) {
      return state.jobs.filter((job) => job.wedding_id === wedding_id).map(clone);
    },
    async insertJob(_tx, row, now) {
      if (state.jobs.some((job) => job.export_key === row.export_key)) return null;
      const job: ExportJobRow = { ...row, id: uuid(1, jobSeq++), created_at: now, updated_at: now, seed_key: null };
      state.jobs.push(job);
      return clone(job);
    },
    async updateJob(_tx, job_id, guard, patch, now) {
      const job = state.jobs.find((entry) => entry.id === job_id);
      if (!job) return null;
      if (guard.status !== undefined && job.status !== guard.status) return null;
      if (guard.attempts !== undefined && job.attempts !== guard.attempts) return null;
      Object.assign(job, patch, { updated_at: now });
      return clone(job);
    },
    async listAttempts(_tx, job_id) {
      return state.attempts.filter((attempt) => attempt.job_id === job_id).map(clone);
    },
    async insertAttempt(_tx, row, now) {
      if (state.attempts.some((attempt) => attempt.job_id === row.job_id && attempt.attempt_no === row.attempt_no)) {
        throw new Error("duplicate attempt number");
      }
      if (row.idempotency_key && state.attempts.some((attempt) => attempt.idempotency_key === row.idempotency_key)) {
        throw new Error("duplicate attempt idempotency key");
      }
      const attempt: ExportAttemptRow = { ...row, id: uuid(2, attemptSeq++), created_at: now };
      state.attempts.push(attempt);
      return clone(attempt);
    },
    async updateAttempt(_tx, job_id, attempt_no, patch) {
      const attempt = state.attempts.find((entry) => entry.job_id === job_id && entry.attempt_no === attempt_no);
      if (attempt) Object.assign(attempt, patch);
    },
  };
}
