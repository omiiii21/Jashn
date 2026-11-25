import "server-only";

import { CommandFailure } from "@/contracts/commands";
import type { CommandActor, MemberRole, SystemActor, WeddingId } from "@/contracts/domain";
import type { EnvironmentFlags } from "@/contracts/flags";
import { EXPORT_ERRORS, MAX_ATTEMPTS, exportKey, type RetryOutcome } from "@/contracts/jobs";
import type { ExportJobView } from "@/contracts/read-models";
import type { AppendActivity, BumpVersion, CommandHandler } from "@/contracts/services";

import { failedEntry, requestedEntry, retriedByNudgebeeEntry, retriedByOwnerEntry } from "./activity";
import { computeCardEventIds, decideRetryOutcome, drillArmed, drillCandidate, lazyExpiry } from "./state";
import type { ExportJobRow, JobStore } from "./store";
import { toJobView } from "./view";

/**
 * `request_card_export` and `retry_card_export` (domain-and-data 3.7; export-and-recovery
 * 2.1, 2.3, 4.1, 5.3), run inside the dispatcher's transaction with the wedding locked.
 * The kick to `/run` happens after commit (after-commit.ts).
 */

export type JobDeps<Tx> = {
  store: JobStore<Tx>;
  appendActivity: AppendActivity<Tx>;
  bumpVersion: BumpVersion<Tx>;
  readFlags: () => Promise<EnvironmentFlags>;
  /** `EXPORT_FAILURE_DRILL`, read only when Flagsmith can't be (flagsmith 3.6). */
  drillEnv: () => string | undefined;
  log: (message: string, fields?: Record<string, string | number>) => void;
};

/** The actor of entries the worker and lazy expiry write. */
export const JASHN_SYSTEM: SystemActor = { kind: "system", label: "Jashn" };

/** The retry result: the job view plus the 5.3 outcome and attempt, so an ops replay reports the stored ones. */
export type RetryResult = ExportJobView & { retry_outcome: RetryOutcome; attempt: number };

function roleOf(actor: CommandActor): MemberRole | null {
  return actor.kind === "guest" || actor.kind === "system" ? null : actor.role;
}

/**
 * Fails a job that stopped without reporting back (2.1 rows 5 and 6). Runs in a transaction
 * that holds the wedding lock. Writes the failure entry and moves the version; never sends
 * the webhook (the member routes do, after commit).
 */
export async function expireIfDue<Tx>(deps: JobDeps<Tx>, tx: Tx, job: ExportJobRow, now: Date): Promise<ExportJobRow> {
  const code = lazyExpiry(job, now);
  if (!code) return job;
  // A queued job's waiting attempt is attempts + 1; it counts once it has failed (one row per number).
  const attempt_no = code === "NOT_STARTED" ? job.attempts + 1 : job.attempts;
  const updated = await deps.store.updateJob(
    tx,
    job.id,
    { status: job.status, attempts: job.attempts },
    {
      status: "failed",
      attempts: attempt_no,
      lease_until: null,
      last_error_code: code,
      last_error_message: EXPORT_ERRORS[code].message,
      last_error_at: now,
      // An armed drill belongs to attempt 1; once that attempt fails it is spent (4.2).
      ...(job.fail_injection === "once" ? { fail_injection: "consumed" as const } : {}),
    },
    now,
  );
  if (!updated) return (await deps.store.readJob(tx, job.id)) ?? job;
  await deps.store.updateAttempt(tx, job.id, attempt_no, { status: "failed", error_code: code, finished_at: now }, now);
  await deps.appendActivity(tx, {
    ...failedEntry({ job_id: job.id, revision: job.revision }, code, false),
    wedding_id: job.wedding_id,
    actor: JASHN_SYSTEM,
    command: "request_card_export",
    occurred_at: now.toISOString(),
  });
  await deps.bumpVersion(tx, job.wedding_id);
  deps.log("lazy expiry", { job: job.id, error: code });
  return updated;
}

async function viewOf<Tx>(deps: JobDeps<Tx>, tx: Tx, job: ExportJobRow, role: MemberRole | null, now: Date): Promise<ExportJobView> {
  const wedding = await deps.store.readWedding(tx, job.wedding_id);
  const publication = await deps.store.readPublicationById(tx, job.publication_id);
  const attempts = await deps.store.listAttempts(tx, job.id);
  const member_names = await deps.store.readMemberNames(tx, job.wedding_id);
  return toJobView(job, attempts, {
    snapshot: publication?.snapshot ?? null,
    is_sample: wedding?.is_sample ?? false,
    published_revision: wedding?.published_revision ?? null,
    role,
    member_names,
    now,
    // Command results land in receipts: never a signed link there.
    download_url: null,
  });
}

function weddingOf(wedding_id: WeddingId | null): WeddingId {
  if (!wedding_id) throw new CommandFailure({ code: "not_found", message: "Not found." });
  return wedding_id;
}

export function createRequestCardExportHandler<Tx>(deps: JobDeps<Tx>): CommandHandler<"request_card_export", Tx> {
  return async (context) => {
    const { tx, actor, envelope } = context;
    const wedding_id = weddingOf(context.wedding_id);
    if (actor.kind === "guest" || actor.kind === "system" || !actor.member_id) {
      throw new CommandFailure({ code: "forbidden", message: "Only members can export the card." });
    }
    const now = new Date(context.now);
    const wedding = await deps.store.readWedding(tx, wedding_id);
    if (!wedding) throw new CommandFailure({ code: "not_found", message: "Not found." });
    if (wedding.published_revision === null) {
      throw new CommandFailure({ code: "nothing_published", message: "Publish the schedule first. There's no card to make yet." });
    }
    const revision = wedding.published_revision;
    const key = exportKey(wedding_id, revision, "png");

    const existing = await deps.store.findJobByKey(tx, key);
    if (existing) {
      const job = await expireIfDue(deps, tx, existing, now);
      return { outcome: "unchanged", result: await viewOf(deps, tx, job, actor.role, now), activity: null };
    }

    const publication = await deps.store.readPublication(tx, wedding_id, revision);
    if (!publication) throw new CommandFailure({ code: "nothing_published", message: "Publish the schedule first. There's no card to make yet." });
    const card_event_ids = computeCardEventIds(publication.snapshot, await deps.store.readActiveInvitations(tx, wedding_id));

    // The drill is read once, here, and armed only for this sample wedding's own id (4.1).
    const candidate = drillCandidate(await deps.readFlags(), deps.drillEnv());
    const armed = drillArmed(candidate, wedding);
    if (candidate && !armed) deps.log("drill ignored", { wedding: wedding_id });

    const inserted = await deps.store.insertJob(
      tx,
      {
        wedding_id,
        publication_id: publication.id,
        revision,
        format: "png",
        export_key: key,
        status: "queued",
        card_event_ids,
        attempts: 0,
        max_attempts: MAX_ATTEMPTS,
        lease_until: null,
        fail_injection: armed ? "once" : "none",
        synthetic: armed,
        last_error_code: null,
        last_error_message: null,
        last_error_at: null,
        artifact_path: null,
        artifact_sha256: null,
        artifact_bytes: null,
        artifact_created_at: null,
        notified_at: null,
        requested_by_member_id: actor.member_id,
      },
      now,
    );
    if (!inserted) {
      // A double click raced us to the key: answer with the twin, never a 500 (2.3).
      const twin = await deps.store.findJobByKey(tx, key);
      if (!twin) throw new Error("export job vanished after a key conflict");
      return { outcome: "unchanged", result: await viewOf(deps, tx, twin, actor.role, now), activity: null };
    }
    await deps.store.insertAttempt(
      tx,
      {
        wedding_id,
        job_id: inserted.id,
        attempt_no: 1,
        trigger: "request",
        idempotency_key: envelope.idempotency_key ?? null,
        nudgebee_workflow_id: null,
        nudgebee_execution_id: null,
        approver: null,
        status: "queued",
        renderer: null,
        error_code: null,
        started_at: null,
        finished_at: null,
      },
      now,
    );
    return {
      outcome: "applied",
      result: await viewOf(deps, tx, inserted, actor.role, now),
      activity: requestedEntry({ job_id: inserted.id, revision }, actor.display_name),
    };
  };
}

export function createRetryCardExportHandler<Tx>(deps: JobDeps<Tx>): CommandHandler<"retry_card_export", Tx> {
  return async (context) => {
    const { tx, actor, input, envelope } = context;
    const wedding_id = weddingOf(context.wedding_id);
    const isSystem = actor.kind === "system";
    if (actor.kind === "guest" || (!isSystem && actor.role !== "owner")) {
      throw new CommandFailure({ code: "forbidden", message: "Only an owner or NudgeBee can retry the export." });
    }
    const now = new Date(context.now);
    const locked = await deps.store.lockJob(tx, input.job_id);
    if (!locked || locked.wedding_id !== wedding_id) throw new CommandFailure({ code: "not_found", message: "Not found." });
    const job = await expireIfDue(deps, tx, locked, now);
    const wedding = await deps.store.readWedding(tx, wedding_id);
    const role = roleOf(actor);

    const outcome = decideRetryOutcome(job, { expected_export_key: input.expected_export_key }, wedding?.published_revision ?? null, now);
    if (outcome !== "retried") {
      const result: RetryResult = { ...(await viewOf(deps, tx, job, role, now)), retry_outcome: outcome, attempt: job.attempts };
      return { outcome: "unchanged", result, activity: null };
    }

    const attempt_no = job.attempts + 1;
    const queued = await deps.store.updateJob(tx, job.id, { status: "failed", attempts: job.attempts }, { status: "queued", lease_until: null }, now);
    if (!queued) throw new Error("export job changed under its row lock");
    const nudgebee = input.nudgebee ?? {};
    await deps.store.insertAttempt(
      tx,
      {
        wedding_id,
        job_id: job.id,
        attempt_no,
        trigger: isSystem ? "nudgebee" : "owner_retry",
        idempotency_key: envelope.idempotency_key ?? null,
        nudgebee_workflow_id: isSystem ? (nudgebee.workflow_id ?? null) : null,
        nudgebee_execution_id: isSystem ? (nudgebee.execution_id ?? null) : null,
        approver: isSystem ? (nudgebee.approver ?? null) : null,
        status: "queued",
        renderer: null,
        error_code: null,
        started_at: null,
        finished_at: null,
      },
      now,
    );
    const ref = { job_id: job.id, revision: job.revision };
    const activity =
      actor.kind === "system"
        ? retriedByNudgebeeEntry(ref, nudgebee.execution_id ?? "", nudgebee.approver ?? "")
        : retriedByOwnerEntry(ref, actor.display_name);
    const result: RetryResult = { ...(await viewOf(deps, tx, queued, role, now)), retry_outcome: "retried", attempt: attempt_no };
    return { outcome: "applied", result, activity };
  };
}
