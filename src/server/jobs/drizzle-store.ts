import "server-only";

import { and, asc, eq, isNull } from "drizzle-orm";

import type { AssetId, PublicationSnapshot, SeedKey, WeddingId } from "@/contracts/domain";
import type { ExportJobStatus, ExportRenderer, ExportTrigger, FailInjection } from "@/contracts/jobs";
import { getDb, type Db, type DbOrTx, type Tx } from "@/db/client";
import { assets, events, exportAttempts, exportJobs, guests, invitations, members, publications, weddings } from "@/db/schema";

import type { ExportAttemptRow, ExportJobRow, JobGuard, JobStore } from "./store";

/**
 * The export tables through Drizzle's core builder (architecture 4.2 rule 2). Commands pass
 * the dispatcher's transaction; the worker and the ops routes open their own and lock the
 * wedding row first, then the job, the dispatcher's order.
 */

type JobRecord = typeof exportJobs.$inferSelect;
type AttemptRecord = typeof exportAttempts.$inferSelect;

function toJob(row: JobRecord): ExportJobRow {
  return {
    id: row.id,
    wedding_id: row.wedding_id,
    publication_id: row.publication_id,
    revision: row.revision,
    format: row.format,
    export_key: row.export_key,
    status: row.status as ExportJobStatus,
    card_event_ids: row.card_event_ids,
    attempts: row.attempts,
    max_attempts: row.max_attempts,
    lease_until: row.lease_until,
    fail_injection: row.fail_injection as FailInjection,
    synthetic: row.synthetic,
    last_error_code: row.last_error_code,
    last_error_message: row.last_error_message,
    last_error_at: row.last_error_at,
    artifact_path: row.artifact_path,
    artifact_sha256: row.artifact_sha256,
    artifact_bytes: row.artifact_bytes,
    artifact_created_at: row.artifact_created_at,
    notified_at: row.notified_at,
    requested_by_member_id: row.requested_by_member_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    seed_key: row.seed_key,
  };
}

function toAttempt(row: AttemptRecord): ExportAttemptRow {
  return {
    id: row.id,
    wedding_id: row.wedding_id,
    job_id: row.job_id,
    attempt_no: row.attempt_no,
    trigger: row.trigger as ExportTrigger,
    idempotency_key: row.idempotency_key,
    nudgebee_workflow_id: row.nudgebee_workflow_id,
    nudgebee_execution_id: row.nudgebee_execution_id,
    approver: row.approver,
    status: row.status as ExportJobStatus,
    renderer: (row.renderer as ExportRenderer | null) ?? null,
    error_code: row.error_code,
    started_at: row.started_at,
    finished_at: row.finished_at,
    created_at: row.created_at,
  };
}

const weddingColumns = {
  id: weddings.id,
  is_sample: weddings.is_sample,
  published_revision: weddings.published_revision,
  version: weddings.version,
};

function guardOf(guard: JobGuard) {
  const parts = [];
  if (guard.status !== undefined) parts.push(eq(exportJobs.status, guard.status));
  if (guard.attempts !== undefined) parts.push(eq(exportJobs.attempts, guard.attempts));
  return parts;
}

export function createDrizzleJobStore(db: () => Db = getDb): JobStore<Tx> {
  const on = (tx: Tx | null): DbOrTx => tx ?? db();
  return {
    async transaction(work) {
      return db().transaction((tx) => work(tx));
    },
    async lockWedding(tx, wedding_id) {
      const [row] = await tx.select(weddingColumns).from(weddings).where(eq(weddings.id, wedding_id)).for("update");
      return row ? { ...row, id: row.id as WeddingId } : null;
    },
    async readWedding(tx, wedding_id) {
      const [row] = await on(tx).select(weddingColumns).from(weddings).where(eq(weddings.id, wedding_id));
      return row ? { ...row, id: row.id as WeddingId } : null;
    },
    async readPublication(tx, wedding_id, revision) {
      const [row] = await on(tx)
        .select({ id: publications.id, revision: publications.revision, snapshot: publications.snapshot })
        .from(publications)
        .where(and(eq(publications.wedding_id, wedding_id), eq(publications.revision, revision)));
      return row ? { id: row.id, revision: row.revision, snapshot: row.snapshot as unknown as PublicationSnapshot } : null;
    },
    async readPublicationById(tx, publication_id) {
      const [row] = await on(tx)
        .select({ id: publications.id, revision: publications.revision, snapshot: publications.snapshot })
        .from(publications)
        .where(eq(publications.id, publication_id));
      return row ? { id: row.id, revision: row.revision, snapshot: row.snapshot as unknown as PublicationSnapshot } : null;
    },
    async readActiveInvitations(tx, wedding_id) {
      return on(tx)
        .select({ guest_id: invitations.guest_id, event_id: invitations.event_id })
        .from(invitations)
        .innerJoin(guests, eq(guests.id, invitations.guest_id))
        .innerJoin(events, eq(events.id, invitations.event_id))
        .where(
          and(
            eq(invitations.wedding_id, wedding_id),
            isNull(invitations.revoked_at),
            isNull(guests.deleted_at),
            isNull(events.deleted_at),
          ),
        );
    },
    async readMemberNames(tx, wedding_id) {
      const rows = await on(tx)
        .select({ id: members.id, display_name: members.display_name })
        .from(members)
        .where(eq(members.wedding_id, wedding_id));
      return Object.fromEntries(rows.map((row) => [row.id, row.display_name]));
    },
    async readAsset(tx, wedding_id, asset_id) {
      const [row] = await on(tx)
        .select()
        .from(assets)
        .where(and(eq(assets.id, asset_id), eq(assets.wedding_id, wedding_id)));
      if (!row) return null;
      return {
        asset_id: row.id as AssetId,
        seed_key: row.seed_key as SeedKey | null,
        asset_kind: row.asset_kind,
        storage_path: row.storage_path,
        mime_type: row.mime_type,
        bytes: row.bytes,
        width: row.width,
        height: row.height,
      };
    },
    async readJob(tx, job_id) {
      const [row] = await on(tx).select().from(exportJobs).where(eq(exportJobs.id, job_id));
      return row ? toJob(row) : null;
    },
    async lockJob(tx, job_id) {
      const [row] = await tx.select().from(exportJobs).where(eq(exportJobs.id, job_id)).for("update");
      return row ? toJob(row) : null;
    },
    async findJobByKey(tx, export_key) {
      const [row] = await on(tx).select().from(exportJobs).where(eq(exportJobs.export_key, export_key));
      return row ? toJob(row) : null;
    },
    async listJobs(tx, wedding_id) {
      const rows = await on(tx).select().from(exportJobs).where(eq(exportJobs.wedding_id, wedding_id)).orderBy(asc(exportJobs.created_at));
      return rows.map(toJob);
    },
    async insertJob(tx, row, now) {
      const [inserted] = await tx
        .insert(exportJobs)
        .values({ ...row, created_at: now, updated_at: now })
        .onConflictDoNothing({ target: exportJobs.export_key })
        .returning();
      return inserted ? toJob(inserted) : null;
    },
    async updateJob(tx, job_id, guard, patch, now) {
      const [updated] = await tx
        .update(exportJobs)
        .set({ ...patch, updated_at: now })
        .where(and(eq(exportJobs.id, job_id), ...guardOf(guard)))
        .returning();
      return updated ? toJob(updated) : null;
    },
    async listAttempts(tx, job_id) {
      const rows = await on(tx).select().from(exportAttempts).where(eq(exportAttempts.job_id, job_id)).orderBy(asc(exportAttempts.attempt_no));
      return rows.map(toAttempt);
    },
    async insertAttempt(tx, row, now) {
      const [inserted] = await tx
        .insert(exportAttempts)
        .values({ ...row, created_at: now, updated_at: now })
        .returning();
      return toAttempt(inserted);
    },
    async updateAttempt(tx, job_id, attempt_no, patch, now) {
      await tx
        .update(exportAttempts)
        .set({ ...patch, updated_at: now })
        .where(and(eq(exportAttempts.job_id, job_id), eq(exportAttempts.attempt_no, attempt_no)));
    },
  };
}
