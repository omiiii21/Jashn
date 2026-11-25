import { beforeEach, describe, expect, it } from "vitest";

import type { SessionActor } from "@/contracts/domain";
import { fixtureIds, fixtureSessionActor } from "@/contracts/fixtures";
import type { FlagKey } from "@/contracts/flags";

import type { FlagEvaluation, VoiceDeps } from "./deps";
import type { VoiceFixture } from "./fixture-mode";
import { handleReplyAudio, type ReplyAudioDeps, type SynthesizeResult } from "./reply-audio";
import { createMemoryVoiceTurnStore } from "./store";
import type { StoredTurn, VoiceTurnStore } from "./types";

const mira = fixtureSessionActor("mira", "demo");
const diya = fixtureSessionActor("diya", "demo");
const WEDDING = fixtureIds("demo").wedding_id;
const TURN_ID = "6a0b1c2d-3e4f-4a5b-8c6d-7e8f90a1b2c3";
const SPEECH = { parts: ["एक लाख साठ हज़ार रुपये बाकी हैं।", "दूसरा हिस्सा।"], language_code: "hi-IN" as const, speaker: "simran_enhi_customer" };

function evaluation(opts: { voice_pilot?: boolean; spoken?: boolean } = {}): FlagEvaluation {
  const flag = (enabled: boolean, value: string | null = null) => ({ enabled, value, fallback: false, reason: null });
  const flags = {
    voice_pilot: flag(opts.voice_pilot ?? true),
    voice_writes_enabled: flag(false),
    spoken_replies: flag(opts.spoken ?? true),
    setup_entry: flag(true, "form_first"),
    setup_entry_synthetic: flag(true, "form_first"),
    env_label: flag(true, "development"),
    export_failure_drill: flag(false, ""),
    card_renderer: flag(true, "chromium"),
  } satisfies Record<FlagKey, unknown>;
  return { identity: "u_test", flags, fallback: false, env_label: "development", latency_ms: 1 };
}

function storedTurn(overrides: Partial<StoredTurn> = {}): StoredTurn {
  const at = "2026-11-25T08:10:00.000Z";
  return {
    voice_turn_id: TURN_ID,
    user_id: mira.user_id,
    member_id: null,
    wedding_id: WEDDING,
    client_turn_id: "2c3d4e5f-6071-4829-bac1-d2e3f4051627",
    input_mode: "typed",
    speech_language: "hi-IN",
    transcript: "Caterer ka kitna baaki hai?",
    language_code: "hi-IN",
    chip: "hinglish",
    reply_language: "hinglish",
    intent: "ask",
    status: "answered",
    refusal_code: null,
    actions: [],
    missing_fields: [],
    options: null,
    reply_text: "एक लाख साठ हज़ार रुपये बाकी हैं।",
    reply_speech: SPEECH,
    ref_map: {},
    flags: {},
    events: [],
    results: null,
    confirmed_at: null,
    confirmed_via: null,
    superseded_by_turn_id: null,
    context_turn_id: null,
    setup_opened_at: null,
    fixture_id: null,
    trace: {},
    timings_ms: {},
    created_at: at,
    updated_at: at,
    ...overrides,
  };
}

type State = {
  session: SessionActor | null;
  evaluation: FlagEvaluation;
  fixtureMode: boolean;
  store: VoiceTurnStore;
  synthCalls: { text: string; language_code: string; speaker: string }[];
  synthResult: SynthesizeResult;
  fixture: VoiceFixture | null;
};

let state: State;

function deps(): Partial<ReplyAudioDeps> {
  const base: Partial<VoiceDeps> = {
    store: state.store,
    readSession: async () => state.session,
    readMember: async (wedding_id) => {
      if (!state.session || wedding_id !== WEDDING) throw new Error("NEXT_NOT_FOUND");
      return { ...state.session, wedding_id };
    },
    evaluateFlags: async () => state.evaluation,
    dockFlags: (e) => ({
      voice_available: e.flags.voice_pilot.enabled,
      writes_enabled: false,
      spoken_replies: e.flags.spoken_replies.enabled,
      chip: null,
      fallback: e.fallback,
    }),
    voiceFlagsRecord: () => ({}),
    fixtureMode: () => state.fixtureMode,
    loadFixture: async () => state.fixture,
    log: () => {},
  };
  return {
    ...base,
    synthesize: async (input) => {
      state.synthCalls.push({ text: input.text, language_code: input.language_code, speaker: input.speaker });
      return state.synthResult;
    },
    readFixtureAudio: async (row_id) => (row_id === "O-01" ? new Uint8Array([1, 2, 3]) : null),
  };
}

function audioRequest(part: number | string = 1, id = TURN_ID): Request {
  return new Request(`http://localhost/api/voice/turns/${id}/reply-audio?part=${part}`);
}

beforeEach(async () => {
  state = {
    session: mira,
    evaluation: evaluation(),
    fixtureMode: false,
    store: createMemoryVoiceTurnStore(),
    synthCalls: [],
    synthResult: { ok: true, body: new Blob([new Uint8Array([0xff, 0xf3])]).stream() },
    fixture: null,
  };
  await state.store.insert(storedTurn());
});

describe("GET /api/voice/turns/[voice_turn_id]/reply-audio (1.14)", () => {
  it("answers 401 with no session", async () => {
    state.session = null;
    const response = await handleReplyAudio(audioRequest(), TURN_ID, deps());
    expect(response.status).toBe(401);
    expect(state.synthCalls).toHaveLength(0);
  });

  it("answers 403 forbidden for someone else's turn and for an unknown id", async () => {
    state.session = diya;
    expect((await handleReplyAudio(audioRequest(), TURN_ID, deps())).status).toBe(403);
    state.session = mira;
    const unknown = "00000000-0000-4000-8000-000000000009";
    const response = await handleReplyAudio(audioRequest(1, unknown), unknown, deps());
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("forbidden");
    expect(state.synthCalls).toHaveLength(0);
  });

  it("answers 403 voice_unavailable with voice_pilot off, and 204 with spoken_replies off, never calling Bulbul", async () => {
    state.evaluation = evaluation({ voice_pilot: false });
    const off = await handleReplyAudio(audioRequest(), TURN_ID, deps());
    expect(off.status).toBe(403);
    expect((await off.json()).error.code).toBe("voice_unavailable");
    state.evaluation = evaluation({ spoken: false });
    expect((await handleReplyAudio(audioRequest(), TURN_ID, deps())).status).toBe(204);
    expect(state.synthCalls).toHaveLength(0);
  });

  it("speaks only the stored part n; 204 past the last part; 422 for a bad part", async () => {
    const response = await handleReplyAudio(audioRequest(2), TURN_ID, deps());
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("audio/mpeg");
    expect(state.synthCalls).toEqual([{ text: "दूसरा हिस्सा।", language_code: "hi-IN", speaker: "simran_enhi_customer" }]);
    expect((await handleReplyAudio(audioRequest(3), TURN_ID, deps())).status).toBe(204);
    expect((await handleReplyAudio(audioRequest("x"), TURN_ID, deps())).status).toBe(422);
  });

  it("answers 500 internal_error when Bulbul fails", async () => {
    state.synthResult = { ok: false, status: 504, message: "no first byte" };
    const response = await handleReplyAudio(audioRequest(), TURN_ID, deps());
    expect(response.status).toBe(500);
    expect((await response.json()).error.code).toBe("internal_error");
  });

  it("in fixture mode serves the clip only for the fixture's audio text, and never calls Bulbul", async () => {
    state.fixtureMode = true;
    await state.store.update(TURN_ID, { fixture_id: "O-01" });
    state.fixture = { row_id: "O-01", start_state: "D0", source: "test", stt: { transcript: "x", language_code: "hi-IN" }, llm: null, audio_text: SPEECH.parts[0]! };
    const first = await handleReplyAudio(audioRequest(1), TURN_ID, deps());
    expect(first.status).toBe(200);
    expect(new Uint8Array(await first.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect((await handleReplyAudio(audioRequest(2), TURN_ID, deps())).status).toBe(204);
    expect(state.synthCalls).toHaveLength(0);
  });
});
