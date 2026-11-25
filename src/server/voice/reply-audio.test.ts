import { beforeEach, describe, expect, it } from "vitest";

import type { SessionActor } from "@/contracts/domain";
import { fixtureIds, fixtureSessionActor } from "@/contracts/fixtures";
import type { FlagKey } from "@/contracts/flags";

import type { FlagEvaluation } from "./deps";
import { handleReplyAudio, type ReplyAudioDeps } from "./reply-audio";
import { createMemoryVoiceTurnStore } from "./store";
import type { StoredTurn, VoiceTurnStore } from "./types";

const mira = fixtureSessionActor("mira", "demo");
const diya = fixtureSessionActor("diya", "demo");
const WEDDING = fixtureIds("demo").wedding_id;
const TURN_ID = "a41f0000-0000-4000-8000-000000000101";

function evaluation(opts: { voice_pilot?: boolean; spoken?: boolean } = {}): FlagEvaluation {
  const flag = (enabled: boolean, value: string | null = null) => ({ enabled, value, fallback: false, reason: null });
  const flags = {
    voice_pilot: flag(opts.voice_pilot ?? true),
    voice_writes_enabled: flag(true),
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
  const now = new Date().toISOString();
  return {
    voice_turn_id: TURN_ID,
    user_id: mira.user_id,
    member_id: null,
    wedding_id: WEDDING,
    client_turn_id: "c0000000-0000-4000-8000-000000000101",
    input_mode: "typed",
    speech_language: "hi-IN",
    transcript: "Caterer का कितना बाकी है?",
    language_code: "hi-IN",
    chip: "hinglish",
    reply_language: "hinglish",
    intent: "ask",
    status: "answered",
    refusal_code: null,
    actions: [],
    missing_fields: [],
    options: null,
    reply_text: "एक लाख पचास हज़ार रुपये बाकी हैं।",
    reply_speech: { parts: ["एक लाख पचास हज़ार रुपये बाकी हैं।"], language_code: "hi-IN", speaker: "simran_enhi_customer" },
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
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

type State = {
  session: SessionActor | null;
  evaluation: FlagEvaluation;
  fixtureMode: boolean;
  store: VoiceTurnStore;
  synthCalls: { text: string; language_code: string; speaker: string }[];
  synthOk: boolean;
};

let state: State;

beforeEach(async () => {
  state = { session: mira, evaluation: evaluation(), fixtureMode: false, store: createMemoryVoiceTurnStore(), synthCalls: [], synthOk: true };
  await state.store.insert(storedTurn());
});

function deps(): Partial<ReplyAudioDeps> {
  return {
    store: state.store,
    readSession: async () => state.session,
    readMember: async (wedding_id) => {
      if (!state.session || wedding_id !== WEDDING) throw new Error("NEXT_NOT_FOUND");
      return { ...state.session, wedding_id };
    },
    evaluateFlags: async () => state.evaluation,
    dockFlags: (e) => ({
      voice_available: e.flags.voice_pilot.enabled,
      writes_enabled: e.flags.voice_pilot.enabled && e.flags.voice_writes_enabled.enabled,
      spoken_replies: e.flags.spoken_replies.enabled,
      chip: null,
      fallback: e.fallback,
    }),
    voiceFlagsRecord: () => ({}),
    fixtureMode: () => state.fixtureMode,
    loadFixture: async (row_id) =>
      ({ row_id, start_state: "D0", source: "fixture", audio_text: "एक लाख पचास हज़ार रुपये बाकी हैं।" }) as unknown as Awaited<ReturnType<ReplyAudioDeps["loadFixture"]>>,
    readFixtureAudio: async () => new Uint8Array([0xff, 0xfb, 0x90]),
    synthesize: async (input) => {
      state.synthCalls.push({ text: input.text, language_code: input.language_code, speaker: input.speaker });
      if (!state.synthOk) return { ok: false, status: 502, message: "content-type application/json" };
      return { ok: true, body: new Blob([new Uint8Array([0xff, 0xfb])]).stream() };
    },
    log: () => {},
  };
}

function get(part: string | number = 1, id = TURN_ID): Promise<Response> {
  return handleReplyAudio(new Request(`http://localhost/api/voice/turns/${id}/reply-audio?part=${part}`), id, deps());
}

describe("GET /api/voice/turns/[voice_turn_id]/reply-audio (1.14)", () => {
  it("streams the stored part as audio/mpeg, with the stored voice", async () => {
    const response = await get(1);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("audio/mpeg");
    expect(state.synthCalls).toEqual([{ text: "एक लाख पचास हज़ार रुपये बाकी हैं।", language_code: "hi-IN", speaker: "simran_enhi_customer" }]);
  });

  it("answers 401 with no session", async () => {
    state.session = null;
    expect((await get()).status).toBe(401);
    expect(state.synthCalls).toHaveLength(0);
  });

  it("answers 403 forbidden for someone else's turn and for an unknown id", async () => {
    state.session = diya;
    const other = await get();
    expect(other.status).toBe(403);
    expect((await other.json()).error.code).toBe("forbidden");
    state.session = mira;
    const unknown = await get(1, "00000000-0000-4000-8000-000000000999");
    expect(unknown.status).toBe(403);
    expect(state.synthCalls).toHaveLength(0);
  });

  it("answers 403 voice_unavailable when voice_pilot is off", async () => {
    state.evaluation = evaluation({ voice_pilot: false });
    const response = await get();
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("voice_unavailable");
    expect(state.synthCalls).toHaveLength(0);
  });

  it("answers 204 with no Bulbul call when spoken_replies is off", async () => {
    state.evaluation = evaluation({ spoken: false });
    expect((await get()).status).toBe(204);
    expect(state.synthCalls).toHaveLength(0);
  });

  it("answers 204 for a part past the stored parts and 422 for a bad part", async () => {
    expect((await get(2)).status).toBe(204);
    expect((await get("x")).status).toBe(422);
    expect(state.synthCalls).toHaveLength(0);
  });

  it("answers 500 internal_error when Bulbul fails, with no retry", async () => {
    state.synthOk = false;
    const response = await get();
    expect(response.status).toBe(500);
    expect((await response.json()).error.code).toBe("internal_error");
    expect(state.synthCalls).toHaveLength(1);
  });

  it("fixture mode serves the recorded clip only when the part is the fixture's audio text", async () => {
    state.fixtureMode = true;
    await state.store.update(TURN_ID, { fixture_id: "O-01" });
    const clip = await get();
    expect(clip.status).toBe(200);
    expect(clip.headers.get("content-type")).toBe("audio/mpeg");
    await state.store.update(TURN_ID, { reply_speech: { parts: ["कुछ और"], language_code: "hi-IN", speaker: "simran_enhi_customer" } });
    expect((await get()).status).toBe(204);
    expect(state.synthCalls).toHaveLength(0);
  });
});
