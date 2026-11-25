import "server-only";

import type { CommandResponse } from "@/contracts/commands";
import type { CommandActor } from "@/contracts/domain";
import type { OpsJobStatusBody, OpsRetryResponseBody } from "@/contracts/api";
import {
  EXPORT_ERROR_CODES,
  GET_WAIT_S,
  IDEMPOTENCY_KEY_HEADER,
  RETRY_WAIT_S,
  WAIT_POLL_MS,
  artifactId,
  isValidIdempotencyKey,
  jobLabel,
  type ExportErrorCode,
} from "@/contracts/jobs";
import type { Services } from "@/contracts/services";
import { isUuidShaped } from "@/db/ids";

import { expireIfDue, type JobDeps, type RetryResult } from "./handlers";
import { opsError, opsJson, opsNotFound, opsUnauthenticated } from "./ops-http";
import { isRetryable, utcSeconds } from "./state";
import type { ExportAttemptRow, ExportJobRow, JobStore } from "./store";
import { cardFacts } from "./view";

/**
 * The ops API NudgeBee calls (export-and-recovery 5.1 to 5.4). Every business state answers
 * 200; 412 comes only with `expect`. Every scalar is a string and nothing is null. No URL,
 * path, token or signed link ever appears in a body.
 */

export type OpsDeps<Tx> = JobDeps<Tx> & {
  /** The bearer check: true for the jobs token. */
  verify: (authorization: string | null) => Promise<boolean>;
  dispatch: Services["dispatch"];
  /** Starts `/run` without waiting (D53). */
  kick: (job_id: string) => void;
  sleep: (ms: number) => Promise<void>;
  now: () => Date;
};

export const NUDGEBEE_ACTOR: CommandActor = { kind: "system", label: "NudgeBee" };

const ACTIVE = new Set(["queued", "rendering"]);

/** Every scalar a string, nothing null (5.1). Throws on a violation: for tests and a final guard. */
export function assertStrings(value: unknown, path = "body"): void {
  if (typeof value === "string") return;
  if (value === null || value === undefined || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path} is not a string`);
  }
  for (const [key, inner] of Object.entries(value)) assertStrings(inner, `${path}.${key}`);
}

function lastRecovery(attempts: readonly ExportAttemptRow[]): OpsJobStatusBody["last_recovery"] {
  const latest = [...attempts].filter((attempt) => attempt.trigger === "nudgebee").sort((a, b) => b.attempt_no - a.attempt_no)[0];
  return {
    nudgebee_execution_id: latest?.nudgebee_execution_id ?? "",
    approver: latest?.approver ?? "",
    attempt: latest ? String(latest.attempt_no) : "",
  };
}

function errorCodeOf(value: string | null): ExportErrorCode | "" {
  return value && (EXPORT_ERROR_CODES as readonly string[]).includes(value) ? (value as ExportErrorCode) : "";
}

function artifactOf(job: ExportJobRow): OpsJobStatusBody["artifact"] {
  const done = job.status === "succeeded" && job.artifact_path;
  return {
    artifact_id: done ? artifactId(job.revision, job.format) : "",
    sha256: done ? (job.artifact_sha256 ?? "") : "",
    bytes: done && job.artifact_bytes !== null ? String(job.artifact_bytes) : "",
    created_at: done ? utcSeconds(job.artifact_created_at) : "",
  };
}

export function toOpsJobStatus(
  job: ExportJobRow,
  attempts: readonly ExportAttemptRow[],
  latest_revision: number | null,
  card_summary: string,
): OpsJobStatusBody {
  const body: OpsJobStatusBody = {
    job_id: job.id,
    job_label: jobLabel(job.revision, job.format),
    export_key: job.export_key,
    wedding_id: job.wedding_id,
    revision: String(job.revision),
    latest_revision: latest_revision === null ? "" : String(latest_revision),
    format: job.format,
    status: job.status,
    retryable: isRetryable(job, latest_revision) ? "true" : "false",
    attempts: String(job.attempts),
    max_attempts: String(job.max_attempts),
    synthetic: job.synthetic ? "true" : "false",
    last_error: {
      code: errorCodeOf(job.last_error_code),
      message: job.last_error_code ? (job.last_error_message ?? "") : "",
      at: job.last_error_code ? utcSeconds(job.last_error_at) : "",
    },
    artifact: artifactOf(job),
    last_recovery: lastRecovery(attempts),
    card_summary,
    updated_at: utcSeconds(job.updated_at),
  };
  return body;
}

function intParam(raw: string | null, range: { min: number; max: number; default: number }): number | null {
  if (raw === null || raw === "") return range.default;
  if (!/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return value >= range.min && value <= range.max ? value : null;
}

async function waitWhileActive<Tx>(deps: OpsDeps<Tx>, job: ExportJobRow, wait_s: number): Promise<ExportJobRow> {
  let current = job;
  const deadline = Date.now() + wait_s * 1000;
  while (ACTIVE.has(current.status) && Date.now() + WAIT_POLL_MS <= deadline) {
    await deps.sleep(WAIT_POLL_MS);
    current = (await deps.store.readJob(null, current.id)) ?? current;
  }
  return current;
}

async function existingJob<Tx>(store: JobStore<Tx>, job_id: string): Promise<ExportJobRow | null> {
  if (!isUuidShaped(job_id)) return null;
  return store.readJob(null, job_id);
}

/** Lazy expiry under the wedding lock, with no webhook (5.1). */
async function expired<Tx>(deps: OpsDeps<Tx>, job: ExportJobRow): Promise<ExportJobRow> {
  return deps.store.transaction(async (tx) => {
    await deps.store.lockWedding(tx, job.wedding_id);
    const locked = await deps.store.lockJob(tx, job.id);
    return locked ? expireIfDue(deps, tx, locked, deps.now()) : job;
  });
}

async function statusBody<Tx>(deps: OpsDeps<Tx>, job: ExportJobRow): Promise<OpsJobStatusBody> {
  const wedding = await deps.store.readWedding(null, job.wedding_id);
  const publication = await deps.store.readPublicationById(null, job.publication_id);
  const attempts = await deps.store.listAttempts(null, job.id);
  const facts = cardFacts(publication?.snapshot ?? null, job.card_event_ids, wedding?.is_sample ?? false);
  return toOpsJobStatus(job, attempts, wedding?.published_revision ?? null, facts.summary);
}

/** GET /api/ops/export-jobs/[job_id] (5.1, 5.2). */
export async function opsGetStatus<Tx>(deps: OpsDeps<Tx>, request: Request, job_id: string): Promise<Response> {
  if (!(await deps.verify(request.headers.get("authorization")))) return opsUnauthenticated();
  const job = await existingJob(deps.store, job_id);
  if (!job) return opsNotFound();

  const params = new URL(request.url).searchParams;
  const wait = intParam(params.get("wait"), GET_WAIT_S);
  if (wait === null) return opsError("validation_failed", `wait must be a whole number from ${GET_WAIT_S.min} to ${GET_WAIT_S.max}.`, { field: "wait" });
  const expect = params.get("expect");
  if (expect !== null && expect !== "succeeded") return opsError("validation_failed", "expect accepts only succeeded.", { field: "expect" });

  const settled = await waitWhileActive(deps, await expired(deps, job), wait);
  if (expect === "succeeded" && settled.status !== "succeeded") {
    return opsError("expectation_failed", `Job is ${settled.status}; expected succeeded.`, {
      field: "expect",
      current: { status: settled.status, attempts: String(settled.attempts) },
    });
  }
  const body = await statusBody(deps, settled);
  assertStrings(body);
  return opsJson(body);
}

type ParsedRetryBody = { expected_export_key: string; nudgebee?: { workflow_id?: string; execution_id?: string; approver?: string } };

function parseRetryBody(raw: unknown): ParsedRetryBody | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const body = raw as Record<string, unknown>;
  if (typeof body.expected_export_key !== "string" || body.expected_export_key.length === 0 || body.expected_export_key.length > 200) return null;
  if (body.nudgebee === undefined) return { expected_export_key: body.expected_export_key };
  if (typeof body.nudgebee !== "object" || body.nudgebee === null || Array.isArray(body.nudgebee)) return null;
  const nb = body.nudgebee as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const key of ["workflow_id", "execution_id", "approver"] as const) {
    if (nb[key] === undefined) continue;
    if (typeof nb[key] !== "string" || (nb[key] as string).length > 100) return null;
    out[key] = nb[key] as string;
  }
  return { expected_export_key: body.expected_export_key, nudgebee: out };
}

function retryFailure(response: Extract<CommandResponse<"retry_card_export">, { ok: false }>): Response {
  const { code, message, field } = response.error;
  if (code === "idempotency_key_reused") return opsError("idempotency_key_reused", "Idempotency-Key was used for a different request.", { field: "idempotency_key" });
  if (code === "validation_failed") return opsError("validation_failed", message, { field: field ?? "body" });
  if (code === "not_found") return opsNotFound();
  return opsError("internal_error", "The retry could not be recorded.");
}

/** POST /api/ops/export-jobs/[job_id]/retry (5.3, 5.4). */
export async function opsRetry<Tx>(deps: OpsDeps<Tx>, request: Request, job_id: string): Promise<Response> {
  if (!(await deps.verify(request.headers.get("authorization")))) return opsUnauthenticated();
  const idempotency_key = request.headers.get(IDEMPOTENCY_KEY_HEADER);
  if (!isValidIdempotencyKey(idempotency_key)) {
    return opsError("validation_failed", "Idempotency-Key header is required (8 to 200 characters).", { field: "idempotency_key" });
  }
  let parsed: ParsedRetryBody | null = null;
  try {
    parsed = parseRetryBody(await request.json());
  } catch {
    parsed = null;
  }
  if (!parsed) return opsError("validation_failed", "Body must be JSON with expected_export_key.", { field: "body" });
  const wait = intParam(new URL(request.url).searchParams.get("wait"), RETRY_WAIT_S);
  if (wait === null) return opsError("validation_failed", `wait must be a whole number from ${RETRY_WAIT_S.min} to ${RETRY_WAIT_S.max}.`, { field: "wait" });
  const job = await existingJob(deps.store, job_id);
  if (!job) return opsNotFound();

  const response = await deps.dispatch(NUDGEBEE_ACTOR, {
    wedding_id: job.wedding_id,
    command: "retry_card_export",
    input: { job_id: job.id, expected_export_key: parsed.expected_export_key, ...(parsed.nudgebee ? { nudgebee: parsed.nudgebee } : {}) },
    idempotency_key,
    source: "nudgebee",
  });
  if (!response.ok) return retryFailure(response);

  const result = response.result as Partial<RetryResult>;
  const outcome = result.retry_outcome ?? "in_progress";
  const replayed = response.outcome === "replayed";
  // D53: a fresh retry starts /run at once; the dispatcher's own after-commit kick is a harmless twin.
  if (!replayed && outcome === "retried") deps.kick(job.id);

  const settled = await waitWhileActive(deps, (await deps.store.readJob(null, job.id)) ?? job, wait);
  const wedding = await deps.store.readWedding(null, settled.wedding_id);
  const latest_revision = wedding?.published_revision ?? null;
  const artifact = artifactOf(settled);
  const body: OpsRetryResponseBody = {
    job_id: settled.id,
    export_key: settled.export_key,
    outcome,
    replayed: replayed ? "true" : "false",
    attempt: String(result.attempt ?? settled.attempts),
    status: settled.status,
    retryable: isRetryable(settled, latest_revision) ? "true" : "false",
    revision: String(settled.revision),
    latest_revision: latest_revision === null ? "" : String(latest_revision),
    artifact: { artifact_id: artifact.artifact_id, sha256: artifact.sha256, bytes: artifact.bytes },
    idempotency_key,
  };
  assertStrings(body);
  return opsJson(body);
}
