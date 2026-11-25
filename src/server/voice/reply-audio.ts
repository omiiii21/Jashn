import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import { readSession } from "./auth";
import { speakerTurn } from "./confirm";
import { resolveDeps, type VoiceDeps } from "./deps";
import { ERROR_MESSAGES, VOICE_OFF_BLOCK, voiceErrorResponse } from "./ndjson";
import type { ReplySpeech } from "./types";

/**
 * `GET /api/voice/turns/{voice_turn_id}/reply-audio?part={n}` (voice.md 1.14, 6.4).
 *
 * Checks in order: a session (401), the speaker's own turn (403 `forbidden`, also for an
 * unknown id), `voice_pilot` (403 `voice_unavailable`), then `spoken_replies` (204 and no
 * Bulbul call). It reads only the stored speech part n of the turn's latest reply; the
 * browser never sends text to speak. No rate limit of its own (D121): the parts are capped by
 * the stored speech parts. No retry: the text is already on screen.
 */

export type SynthesizeResult = { ok: true; body: ReadableStream<Uint8Array> } | { ok: false; status: number; message: string };

export type ReplyAudioDeps = VoiceDeps & {
  synthesize: (input: { text: string; language_code: "hi-IN" | "en-IN"; speaker: string; signal?: AbortSignal }) => Promise<SynthesizeResult>;
  /** The fixture's recorded reply (public/voice-fixtures/{row_id}.mp3), or null when absent. */
  readFixtureAudio: (row_id: string) => Promise<Uint8Array | null>;
};

const FIXTURE_ROW_ID = /^[A-Z]{1,3}-\d{2}$/;

async function defaultReadFixtureAudio(row_id: string): Promise<Uint8Array | null> {
  if (!FIXTURE_ROW_ID.test(row_id)) return null;
  try {
    return new Uint8Array(await readFile(path.join(process.cwd(), "public", "voice-fixtures", `${row_id}.mp3`)));
  } catch {
    return null;
  }
}

function resolveAudioDeps(overrides: Partial<ReplyAudioDeps>): ReplyAudioDeps {
  return {
    ...resolveDeps(overrides),
    synthesize: overrides.synthesize ?? (async (input) => (await import("./sarvam")).synthesizeStream(input)),
    readFixtureAudio: overrides.readFixtureAudio ?? defaultReadFixtureAudio,
  };
}

function noContent(): Response {
  return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
}

function audioResponse(body: ReadableStream<Uint8Array> | Uint8Array): Response {
  return new Response(body as BodyInit, {
    status: 200,
    headers: { "content-type": "audio/mpeg", "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}

function partNumber(url: string): number | null {
  const raw = new URL(url).searchParams.get("part");
  if (raw === null || !/^\d{1,2}$/.test(raw)) return null;
  const n = Number(raw);
  return n >= 1 ? n : null;
}

export async function handleReplyAudio(request: Request, voice_turn_id: string, overrides: Partial<ReplyAudioDeps> = {}): Promise<Response> {
  const deps = resolveAudioDeps(overrides);

  // 1. Session.
  const session = await readSession(deps.readSession);
  if (!session) return voiceErrorResponse("unauthenticated", ERROR_MESSAGES.unauthenticated, VOICE_OFF_BLOCK);

  // 2 and 3. The speaker's own turn (an unknown id is forbidden too), then voice_pilot.
  const found = await speakerTurn(deps, voice_turn_id, session);
  if (!found.ok) return found.response;
  const { turn, flags } = found;

  // 4. spoken_replies off: no audio and no Bulbul request (flagsmith 3.3).
  if (!flags.spoken_replies) return noContent();

  const part = partNumber(request.url);
  if (part === null) return voiceErrorResponse("validation_failed", "unknown_value", flags.voice, { field: "part" });
  const speech = turn.reply_speech as ReplySpeech | null;
  const text = speech?.parts[part - 1];
  if (!speech || typeof text !== "string" || text.trim().length === 0) return noContent();

  // Fixture mode (6.4): the recorded clip when this part is the fixture's audio text, else text only.
  if (deps.fixtureMode()) {
    const fixture = turn.fixture_id ? await deps.loadFixture(turn.fixture_id).catch(() => null) : null;
    if (!fixture || fixture.audio_text === null || fixture.audio_text.trim() !== text.trim()) return noContent();
    const clip = await deps.readFixtureAudio(fixture.row_id);
    return clip ? audioResponse(clip) : noContent();
  }

  let result: SynthesizeResult;
  try {
    result = await deps.synthesize({ text, language_code: speech.language_code, speaker: speech.speaker, signal: request.signal });
  } catch {
    result = { ok: false, status: 500, message: "synthesis threw" };
  }
  if (!result.ok) {
    deps.log(`voice reply audio failed: status ${result.status}`);
    return voiceErrorResponse("internal_error", "Audio unavailable.", flags.voice, { status: 500 });
  }
  return audioResponse(result.body);
}
