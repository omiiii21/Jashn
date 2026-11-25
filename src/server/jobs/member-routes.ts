import "server-only";

import { after } from "next/server";

import type { CommandEnvelope, CommandResponse } from "@/contracts/commands";
import type { WeddingId } from "@/contracts/domain";
import { httpStatusOf } from "@/contracts/services";
import { isUuidShaped } from "@/db/ids";
import { requireMemberForApi } from "@/server/authz/guard";
import { services } from "@/server/services";

import { webhookDeps } from "./deps";
import { sendFirstFailureWebhook } from "./webhook";

/**
 * The exports panel's two routes (export-and-recovery 5.6; domain 3.0 transports): members
 * only, through the dispatcher. A guest link, the ops token or no session gets 401 (EX-20).
 */

const NO_STORE = { "Cache-Control": "no-store" };

function json(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: NO_STORE });
}

const NOT_FOUND = { ok: false, error: { code: "not_found", message: "Not found." } };
const BAD_BODY = { ok: false, error: { code: "validation_failed", message: "required", field: "idempotency_key" } };

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    return typeof body === "object" && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function keyOf(body: Record<string, unknown> | null): string | null {
  const key = body?.idempotency_key;
  return typeof key === "string" && /^[\x20-\x7E]{8,200}$/.test(key) ? key : null;
}

/**
 * A member's request found a lazy failure: the first-failure webhook goes out after the
 * answer (2.8), only for a failure committed during this request.
 */
function webhookIfFirstFailure(response: CommandResponse, found_since: Date): void {
  if (!response.ok || response.outcome === "replayed") return;
  const result = response.result as { job_id?: unknown; status?: unknown; notified_at?: unknown } | null;
  if (result && typeof result.job_id === "string" && result.status === "failed" && !result.notified_at) {
    const job_id = result.job_id;
    after(async () => {
      await sendFirstFailureWebhook(webhookDeps, job_id, { found_since }).catch(() => false);
    });
  }
}

export async function postExport(request: Request, wedding_id: WeddingId): Promise<Response> {
  const started = new Date();
  const member = await requireMemberForApi(wedding_id);
  if (!member.ok) return member.response;
  const actor = member.actor;
  const body = await readBody(request);
  const idempotency_key = keyOf(body);
  if (!idempotency_key) return json(BAD_BODY, 422);
  const input = (body?.input ?? {}) as { format?: unknown };
  const envelope: CommandEnvelope<"request_card_export"> = {
    wedding_id,
    command: "request_card_export",
    input: { format: input.format === undefined ? "png" : (input.format as "png") },
    idempotency_key,
    source: "ui",
  };
  const response = await services.dispatch(actor, envelope);
  webhookIfFirstFailure(response, started);
  return json(response, httpStatusOf(response));
}

export async function postExportRetry(request: Request, wedding_id: WeddingId, job_id: string): Promise<Response> {
  const started = new Date();
  const member = await requireMemberForApi(wedding_id);
  if (!member.ok) return member.response;
  const actor = member.actor;
  if (!isUuidShaped(job_id)) return json(NOT_FOUND, 404);
  const idempotency_key = keyOf(await readBody(request));
  if (!idempotency_key) return json(BAD_BODY, 422);
  // The job's own key is the expected one, so the server leaves it out; `wait` is never sent.
  const response = await services.dispatch(actor, {
    wedding_id,
    command: "retry_card_export",
    input: { job_id },
    idempotency_key,
    source: "ui",
  });
  webhookIfFirstFailure(response, started);
  return json(response, httpStatusOf(response));
}
