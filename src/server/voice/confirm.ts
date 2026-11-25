import "server-only";

import {
  VOICE_TURN_TTL_MS,
  type VoiceConfirmErrorBody,
  type VoiceConfirmResponse,
  type VoiceConfirmResult,
} from "@/contracts/api";
import {
  COMMAND_ERROR_HTTP_STATUS,
  type CommandEnvelope,
  type CommandErrorBody,
  type CommandOutcome,
  type CommandResponse,
} from "@/contracts/commands";
import type { SessionActor, VoiceTurnStatus } from "@/contracts/domain";
import { routes } from "@/contracts/routes";

import { membershipFor, readSession } from "./auth";
import { resolveDeps, type ConfirmEdit, type VoiceDeps } from "./deps";
import { flagsForRequest, type RequestFlags } from "./flags-for-request";
import { ERROR_MESSAGES, jsonResponse, speechIfOn, toVoiceReply, VOICE_OFF_BLOCK, voiceErrorResponse } from "./ndjson";
import { WRITE_KINDS, type ReplySpeech, type ReplyText, type ResolvedAction, type StoredResult, type StoredTurn } from "./types";

/**
 * `POST /api/voice/confirm` (voice.md 1.13). The phrase path in the turn route reaches the
 * same `confirmTurn` with `via` `phrase` (1.8). Nothing is written except through the one
 * dispatcher, per action in order, with the key `{voice_turn_id}:{index}` and source `voice`;
 * the dispatcher's guard calls the voice gate (the authoritative kill-switch check).
 */

const CLOSED_STATUSES: readonly VoiceTurnStatus[] = ["cancelled", "superseded", "answered", "paused", "failed", "expired"];
const REPLAY_STATUSES: readonly VoiceTurnStatus[] = ["confirmed", "partially_saved"];

export type ConfirmTurnInput = {
  deps: VoiceDeps;
  /** The speaker, as a member of the turn's wedding (or the setup actor). */
  actor: SessionActor;
  /** Already checked to belong to `actor` (check 2). */
  turn: StoredTurn;
  edits: ConfirmEdit[];
  via: "tap" | "phrase";
  flags: RequestFlags;
};

export type ConfirmTurnOutcome =
  | {
      kind: "saved";
      status: 200 | 202;
      body: VoiceConfirmResponse;
      reply: ReplyText;
      speech: ReplySpeech | null;
      replayed: boolean;
    }
  | { kind: "error"; status: number; body: VoiceConfirmErrorBody; reply: ReplyText | null; speech: ReplySpeech | null };

/** Plain words for a command error on the card (6.1 row 23). */
export function plainCommandError(error: CommandErrorBody): string {
  switch (error.code) {
    case "duplicate_requirement":
      return "That requirement is already on the function.";
    case "duplicate_vendor":
      return "That vendor is already on your list.";
    case "not_invited":
      return "That guest isn't invited to this function.";
    case "plus_ones_exceeds_limit":
      return "That's more plus-ones than allowed.";
    case "amount_mismatch":
      return "The total doesn't match the rate and count. Edit one of them.";
    case "validation_failed":
      return error.field ? `${error.field}: ${error.message}` : "A value needs fixing.";
    case "payment_void":
    case "commitment_void":
      return "That record was voided meanwhile. Nothing was saved.";
    case "nothing_published":
      return "Publish the schedule first. There's no card to make yet.";
    case "stale_version":
    case "draft_changed":
      return "It changed meanwhile.";
    case "voice_writes_paused":
      return "voice changes are paused";
    case "forbidden":
    case "approval_required":
      return "That isn't allowed for your role.";
    default:
      return "Something went wrong. Nothing was saved. Try again or use the form.";
  }
}

function toConfirmResult(result: StoredResult, outcome?: CommandOutcome): VoiceConfirmResult {
  const out: VoiceConfirmResult = {
    index: result.index,
    command: result.command,
    outcome: outcome ?? (result.outcome as CommandOutcome),
    idempotency_key: result.idempotency_key,
    entity_ref: result.entity_ref,
    activity_entry_id: result.activity_entry_id,
  };
  if (result.vendor_totals) out.vendor_totals = result.vendor_totals;
  if (result.proposal_id) out.proposal_id = result.proposal_id;
  return out;
}

function vendorTotalsOf(response: CommandResponse): StoredResult["vendor_totals"] | undefined {
  if (!response.ok) return undefined;
  const result = response.result as unknown;
  if (typeof result !== "object" || result === null) return undefined;
  const totals = (result as { vendor_totals?: unknown }).vendor_totals;
  if (typeof totals !== "object" || totals === null) return undefined;
  const t = totals as Record<string, unknown>;
  if (typeof t.committed_inr !== "number" || typeof t.paid_inr !== "number" || typeof t.outstanding_inr !== "number") return undefined;
  return {
    committed_inr: t.committed_inr,
    paid_inr: t.paid_inr,
    outstanding_inr: t.outstanding_inr,
    ...(typeof t.overpaid_inr === "number" ? { overpaid_inr: t.overpaid_inr } : {}),
  };
}

function createdWeddingIdOf(response: CommandResponse): string | null {
  if (!response.ok || response.command !== "set_wedding_profile") return null;
  const result = response.result as unknown;
  if (typeof result !== "object" || result === null) return null;
  const id = (result as { wedding_id?: unknown }).wedding_id;
  return typeof id === "string" ? id : null;
}

function missingAfterEdits(actions: ResolvedAction[], turn: StoredTurn, edited: boolean): string | null {
  for (const action of actions) {
    if (action.missing_fields.length > 0) return action.missing_fields[0] ?? null;
  }
  if (!edited && turn.missing_fields.length > 0) return turn.missing_fields[0] ?? null;
  return null;
}

async function safeFixedReply(deps: VoiceDeps, key: Parameters<VoiceDeps["fixedReply"]>[0], turn: StoredTurn, fallback: string): Promise<ReplyText> {
  try {
    return await deps.fixedReply(key, turn.reply_language);
  } catch {
    return { display_text: fallback, speech_text: null, language: turn.reply_language };
  }
}

function errorOutcome(
  status: number,
  error: CommandErrorBody,
  flags: RequestFlags,
  extra: { preview?: VoiceConfirmErrorBody["preview"]; reply?: ReplyText | null; speech?: ReplySpeech | null } = {},
): ConfirmTurnOutcome {
  const body: VoiceConfirmErrorBody = { ok: false, error, voice: flags.voice };
  if (extra.preview) body.preview = extra.preview;
  return { kind: "error", status, body, reply: extra.reply ?? null, speech: extra.speech ?? null };
}

/**
 * Checks 4 to 7 of 1.13 for a turn that already passed checks 1 to 3 (session, ownership,
 * `voice_pilot`). Writes only through `deps.dispatch`.
 */
export async function confirmTurn(input: ConfirmTurnInput): Promise<ConfirmTurnOutcome> {
  const { deps, actor, turn, edits, via, flags } = input;
  const { store } = deps;

  // 4. Replay or closed.
  if (REPLAY_STATUSES.includes(turn.status)) {
    const reply = await safeFixedReply(deps, "already_saved", turn, "That's already saved.");
    const speech = via === "phrase" ? await speechIfOn(deps, flags.spoken_replies, reply) : null;
    const body: VoiceConfirmResponse = {
      ok: true,
      voice_turn_id: turn.voice_turn_id,
      status: turn.status === "partially_saved" ? "partially_saved" : "confirmed",
      confirmed_via: turn.confirmed_via ?? via,
      results: (turn.results ?? []).map((result) => toConfirmResult(result, "replayed")),
      reply: toVoiceReply(reply, speech),
      voice: flags.voice,
    };
    const navigate = typeof turn.trace.navigate_path === "string" ? turn.trace.navigate_path : null;
    if (navigate) body.navigate = { path: navigate };
    return { kind: "saved", status: 200, body, reply, speech, replayed: true };
  }
  if (CLOSED_STATUSES.includes(turn.status) || turn.status !== "proposed") {
    return errorOutcome(410, { code: "voice_turn_expired", message: ERROR_MESSAGES.closed }, flags);
  }

  // 5. The 10-minute window (V2).
  const createdMs = Date.parse(turn.created_at);
  if (!Number.isNaN(createdMs) && deps.now() - createdMs > VOICE_TURN_TTL_MS) {
    await store.update(turn.voice_turn_id, { status: "expired" });
    return errorOutcome(410, { code: "voice_turn_expired", message: ERROR_MESSAGES.expired }, flags);
  }

  // 6. Edits, then nothing missing or uncertain.
  let actions = turn.actions;
  if (edits.length > 0) {
    const applied = await deps.applyEdits(actions, edits);
    if (!applied.ok) {
      return errorOutcome(422, { code: "validation_failed", message: applied.message, field: applied.field }, flags);
    }
    actions = applied.actions;
  }
  // Only write kinds are ever dispatched: a question's stored stand-in is never confirmable.
  actions = actions.filter((action) => (WRITE_KINDS as readonly string[]).includes(action.kind));
  const missing = missingAfterEdits(actions, turn, edits.length > 0);
  if (missing) return errorOutcome(422, { code: "validation_failed", message: "required", field: missing }, flags);
  if (actions.length === 0) return errorOutcome(410, { code: "voice_turn_expired", message: ERROR_MESSAGES.closed }, flags);

  const confirmed_at = new Date(deps.now()).toISOString();
  await store.update(turn.voice_turn_id, { confirmed_at, confirmed_via: via, actions });

  // 7. Per action, in order, through the dispatcher.
  const dispatchStarted = deps.now();
  const results: StoredResult[] = [];
  let partial: { failed_index: number; reason: string } | null = null;
  let createdWeddingId: string | null = null;

  for (const action of actions) {
    const idempotency_key = `${turn.voice_turn_id}:${action.index}`;
    const envelope = {
      wedding_id: turn.wedding_id,
      command: action.command,
      input: action.input,
      idempotency_key,
      source: "voice",
      voice_turn_id: turn.voice_turn_id,
    } as unknown as CommandEnvelope;

    let response: CommandResponse;
    try {
      response = await deps.dispatch(actor, envelope);
    } catch {
      response = { ok: false, error: { code: "internal_error", message: "Something went wrong. Nothing was saved." } };
    }

    if (response.ok) {
      createdWeddingId ??= createdWeddingIdOf(response);
      const stored: StoredResult = {
        index: action.index,
        command: action.command,
        outcome: response.outcome,
        idempotency_key,
        entity_ref: action.entity_ref,
        activity_entry_id: response.activity_entry_id ?? null,
        gate: "enabled",
      };
      const totals = vendorTotalsOf(response);
      if (totals) stored.vendor_totals = totals;
      if (response.proposal_id) stored.proposal_id = response.proposal_id;
      results.push(stored);
      continue;
    }

    const error = response.error;
    if (results.length === 0) {
      // Nothing was written by this confirm.
      if (error.code === "voice_writes_paused") {
        deps.log(`voice confirm refused: ${action.command}, voice writes paused`);
        let prefill = error.prefill ?? [];
        try {
          prefill = await deps.prefillFor(actions);
        } catch {
          // keep the dispatcher's entry
        }
        const reply = await safeFixedReply(deps, "voice_writes_paused", turn, "Voice changes are paused. You can type it instead.");
        const speech = await speechIfOn(deps, flags.spoken_replies, reply);
        await store.update(turn.voice_turn_id, {
          status: "paused",
          refusal_code: "voice_writes_paused",
          results: [{ index: action.index, command: action.command, outcome: "refused", idempotency_key, entity_ref: action.entity_ref, activity_entry_id: null, gate: "paused", error_code: error.code }],
          reply_text: reply.display_text,
          reply_speech: speech,
        });
        return errorOutcome(423, { code: "voice_writes_paused", message: error.message || ERROR_MESSAGES.paused, prefill }, flags, { reply, speech });
      }
      // 409 stale_version / draft_changed, or any other command error: the turn stays proposed.
      const status = COMMAND_ERROR_HTTP_STATUS[error.code] ?? 500;
      await store.update(turn.voice_turn_id, {
        trace: { ...turn.trace, last_confirm_error: error.code },
      });
      return errorOutcome(status, { ...error, message: error.message || plainCommandError(error) }, flags);
    }

    // A later action failed: the earlier ones stay saved (V7).
    partial = { failed_index: action.index, reason: plainCommandError(error) };
    break;
  }

  const dispatchMs = deps.now() - dispatchStarted;
  const status: "confirmed" | "partially_saved" = partial ? "partially_saved" : "confirmed";

  const replyStarted = deps.now();
  let reply: ReplyText;
  let navigate_path: string | null = null;
  try {
    const built = await deps.confirmedReply({
      actor,
      wedding_id: turn.wedding_id,
      actions,
      results,
      register: turn.reply_language,
      partial,
    });
    reply = built.reply;
    navigate_path = built.navigate_path;
  } catch {
    reply = { display_text: partial ? "Saved part of it." : "Saved.", speech_text: null, language: turn.reply_language };
  }
  if (!navigate_path && createdWeddingId) navigate_path = routes.wedding(createdWeddingId);
  const speech = await speechIfOn(deps, flags.spoken_replies, reply);

  await store.update(turn.voice_turn_id, {
    status,
    results,
    reply_text: reply.display_text,
    reply_speech: speech,
    trace: { ...turn.trace, navigate_path, ...(createdWeddingId ? { created_wedding_id: createdWeddingId } : {}) },
    timings_ms: { ...turn.timings_ms, dispatch: dispatchMs, reply: deps.now() - replyStarted },
  });

  const body: VoiceConfirmResponse = {
    ok: true,
    voice_turn_id: turn.voice_turn_id,
    status,
    confirmed_via: via,
    results: results.map((result) => toConfirmResult(result)),
    reply: toVoiceReply(reply, speech),
    voice: flags.voice,
  };
  if (navigate_path) body.navigate = { path: navigate_path };
  const allProposed = !partial && results.length > 0 && results.every((result) => result.outcome === "proposed");
  return { kind: "saved", status: allProposed ? 202 : 200, body, reply, speech, replayed: false };
}

// ---------------------------------------------------------------------------
// The route
// ---------------------------------------------------------------------------

type ConfirmBody = { voice_turn_id: string; edits: ConfirmEdit[]; via: "tap" };

function parseConfirmBody(raw: unknown): ConfirmBody | { error: string } {
  if (typeof raw !== "object" || raw === null) return { error: "voice_turn_id" };
  const body = raw as Record<string, unknown>;
  if (typeof body.voice_turn_id !== "string" || body.voice_turn_id.length === 0) return { error: "voice_turn_id" };
  const edits: ConfirmEdit[] = [];
  if (body.edits !== undefined && body.edits !== null) {
    if (!Array.isArray(body.edits) || body.edits.length > 50) return { error: "edits" };
    for (const entry of body.edits) {
      if (typeof entry !== "object" || entry === null) return { error: "edits" };
      const e = entry as Record<string, unknown>;
      if (typeof e.action_index !== "number" || !Number.isInteger(e.action_index) || typeof e.field !== "string") return { error: "edits" };
      edits.push({ action_index: e.action_index, field: e.field, value: typeof e.value === "string" ? e.value : String(e.value ?? "") });
    }
  }
  return { voice_turn_id: body.voice_turn_id, edits, via: "tap" };
}

/** Checks 1 to 3 shared by confirm and cancel: session, the speaker's own turn, membership, `voice_pilot`. */
export async function speakerTurn(
  deps: VoiceDeps,
  voice_turn_id: string,
  session: SessionActor,
): Promise<{ ok: true; turn: StoredTurn; actor: SessionActor; flags: RequestFlags } | { ok: false; response: Response }> {
  const turn = await deps.store.get(voice_turn_id).catch(() => null);
  if (!turn || turn.user_id !== session.user_id) {
    const flags = await flagsForRequest(deps, session, { wedding_id: null, ui_language: session.preferred_language });
    return { ok: false, response: voiceErrorResponse("forbidden", ERROR_MESSAGES.forbidden, flags.voice) };
  }
  const membership = await membershipFor(session, turn.wedding_id, deps.readMember);
  if (!membership.ok) {
    return { ok: false, response: voiceErrorResponse("forbidden", ERROR_MESSAGES.not_member, VOICE_OFF_BLOCK) };
  }
  const flags = await flagsForRequest(deps, membership.actor, {
    wedding_id: turn.wedding_id,
    ui_language: membership.actor.preferred_language,
  });
  if (!flags.voice_pilot) {
    return { ok: false, response: voiceErrorResponse("voice_unavailable", ERROR_MESSAGES.voice_unavailable, flags.voice) };
  }
  return { ok: true, turn, actor: membership.actor, flags };
}

export async function handleConfirm(request: Request, overrides: Partial<VoiceDeps> = {}): Promise<Response> {
  const deps = resolveDeps(overrides);

  // 1. Session.
  const session = await readSession(deps.readSession);
  if (!session) return voiceErrorResponse("unauthenticated", ERROR_MESSAGES.unauthenticated, VOICE_OFF_BLOCK);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    raw = null;
  }
  const parsed = parseConfirmBody(raw);
  if ("error" in parsed) {
    const flags = await flagsForRequest(deps, session, { wedding_id: null, ui_language: session.preferred_language });
    return voiceErrorResponse("validation_failed", "required", flags.voice, { field: parsed.error });
  }

  // 2 and 3. The speaker's own turn, then voice_pilot.
  const found = await speakerTurn(deps, parsed.voice_turn_id, session);
  if (!found.ok) return found.response;

  // 4 to 7.
  const outcome = await confirmTurn({
    deps,
    actor: found.actor,
    turn: found.turn,
    edits: parsed.edits,
    via: "tap",
    flags: found.flags,
  });
  return jsonResponse(outcome.body, outcome.status);
}
