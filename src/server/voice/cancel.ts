import "server-only";

import type { ReplyRegister, VoiceCancelResponse } from "@/contracts/api";

import { readSession } from "./auth";
import { speakerTurn } from "./confirm";
import { resolveDeps, type VoiceDeps } from "./deps";
import type { RequestFlags } from "./flags-for-request";
import { ERROR_MESSAGES, jsonResponse, speechIfOn, toVoiceReply, VOICE_OFF_BLOCK, voiceErrorResponse } from "./ndjson";
import type { ReplySpeech, ReplyText, StoredTurn } from "./types";

/**
 * `POST /api/voice/cancel` (voice.md 1.13, last paragraph): checks 1 to 4, then the turn is
 * `cancelled` and nothing is written. Cancelling a closed turn is not an error: it returns the
 * same reply and leaves the turn as it is.
 */

export async function cancelReply(deps: VoiceDeps, register: ReplyRegister): Promise<ReplyText> {
  try {
    return await deps.fixedReply("cancelled", register);
  } catch {
    return register === "en"
      ? { display_text: "OK, nothing was changed.", speech_text: "OK, nothing was changed.", language: "en" }
      : { display_text: "ठीक है, कुछ नहीं बदला।", speech_text: "ठीक है, कुछ नहीं बदला।", language: register };
  }
}

/** Cancels the speaker's own turn (already checked). Used by the route and by the cancel phrase. */
export async function cancelTurn(
  deps: VoiceDeps,
  turn: StoredTurn,
  flags: RequestFlags,
  /** The cancel phrase's own register; a tap uses the turn's. */
  register: ReplyRegister = turn.reply_language,
): Promise<{ body: VoiceCancelResponse; reply: ReplyText; speech: ReplySpeech | null; was_open: boolean }> {
  const reply = await cancelReply(deps, register);
  const speech = await speechIfOn(deps, flags.spoken_replies, reply);
  const was_open = turn.status === "proposed";
  if (was_open) {
    await deps.store.update(turn.voice_turn_id, { status: "cancelled", reply_text: reply.display_text, reply_speech: speech });
  }
  const body: VoiceCancelResponse = {
    ok: true,
    voice_turn_id: turn.voice_turn_id,
    status: "cancelled",
    reply: toVoiceReply(reply, was_open ? speech : null),
    voice: flags.voice,
  };
  return { body, reply, speech, was_open };
}

export async function handleCancel(request: Request, overrides: Partial<VoiceDeps> = {}): Promise<Response> {
  const deps = resolveDeps(overrides);

  const session = await readSession(deps.readSession);
  if (!session) return voiceErrorResponse("unauthenticated", ERROR_MESSAGES.unauthenticated, VOICE_OFF_BLOCK);

  let raw: unknown = null;
  try {
    raw = await request.json();
  } catch {
    raw = null;
  }
  const voice_turn_id =
    typeof raw === "object" && raw !== null && typeof (raw as Record<string, unknown>).voice_turn_id === "string"
      ? ((raw as Record<string, unknown>).voice_turn_id as string)
      : null;
  if (!voice_turn_id) return voiceErrorResponse("forbidden", ERROR_MESSAGES.forbidden, VOICE_OFF_BLOCK);

  const found = await speakerTurn(deps, voice_turn_id, session);
  if (!found.ok) return found.response;

  const { body } = await cancelTurn(deps, found.turn, found.flags);
  return jsonResponse(body, 200);
}
