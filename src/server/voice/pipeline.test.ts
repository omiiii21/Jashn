import { beforeEach, describe, expect, it } from "vitest";

import type { CommandEnvelope, CommandResponse, VoicePrefillEntry } from "@/contracts/commands";
import type { JsonObject, SessionActor } from "@/contracts/domain";
import { FIXTURE_TODAY, fixtureIds, fixtureSessionActor } from "@/contracts/fixtures";
import type { FlagKey } from "@/contracts/flags";

import { handleCancel } from "./cancel";
import { handleConfirm } from "./confirm";
import type { FlagEvaluation, VoiceDeps } from "./deps";
import { loadFixture } from "./fixture-mode";
import { readNdjson } from "./ndjson";
import { createMemoryRateLimiter } from "./rate-limit";
import { createMemoryVoiceTurnStore } from "./store";
import { fixedReply } from "./templates";
import { handleTurn, isEmptySpeech } from "./turn";
import type { ResolveContext, ResolveOutcome, ResolvedAction, Snapshot, ToolArguments, VoiceTurnStore } from "./types";

const mira = fixtureSessionActor("mira", "demo");
const diya = fixtureSessionActor("diya", "demo");
const ids = fixtureIds("demo");
const WEDDING = ids.wedding_id;
const T0 = Date.parse("2026-11-25T09:40:00+05:30");

const M03_ARGS: ToolArguments = {
  intent: "act",
  reply_language: "hinglish",
  missing_fields: [],
  reply: "",
  actions: [
    {
      kind: "correct_payment",
      vendor_id: "VEN-CAT",
      payment_kind: "advance",
      amount_inr: 40000,
      heard: [{ field: "amount_inr", phrase: "चालीस हज़ार" }],
    },
  ],
};

function evaluation(opts: { voice_pilot?: boolean; writes?: boolean; spoken?: boolean } = {}): FlagEvaluation {
  const flag = (enabled: boolean, value: string | null = null) => ({ enabled, value, fallback: false, reason: null });
  const flags = {
    voice_pilot: flag(opts.voice_pilot ?? true),
    voice_writes_enabled: flag(opts.writes ?? true),
    spoken_replies: flag(opts.spoken ?? true),
    setup_entry: flag(true, "form_first"),
    setup_entry_synthetic: flag(true, "form_first"),
    env_label: flag(true, "development"),
    export_failure_drill: flag(false, ""),
    card_renderer: flag(true, "chromium"),
  } satisfies Record<FlagKey, unknown>;
  return { identity: "u_test", flags, fallback: false, env_label: "development", latency_ms: 3 };
}

function resolvedFor(tool: ToolArguments): ResolvedAction[] {
  return tool.actions.map((raw, index) => ({
    index,
    kind: raw.kind,
    command: raw.kind === "correct_payment" ? "correct_payment" : "add_requirement",
    input: (raw.kind === "correct_payment"
      ? { payment_id: ids.advance_payment_id, amount_inr: 40000, expected_version: 1 }
      : { event_id: ids.reception_event_id, text: "Jain food", quantity: 12, requirement_category: "catering" }) as JsonObject,
    labels: { amount_inr: "Amount" },
    heard: raw.heard ?? [],
    entity_ref: raw.kind === "correct_payment" ? "PAY-01" : "EVT-REC",
    preview: { kind: raw.kind, command: "correct_payment", fields: [], after_saving: [], warnings: [] },
    missing_fields: [],
    raw,
  }));
}

type State = {
  session: SessionActor | null;
  now: number;
  evaluation: FlagEvaluation;
  fixtureMode: boolean;
  calls: { transcribe: number; callModel: number; snapshot: number; resolve: number; prefillFor: number };
  dispatched: CommandEnvelope[];
  dispatchResponse: (envelope: CommandEnvelope) => CommandResponse;
  resolve: (ctx: ResolveContext) => ResolveOutcome;
  store: VoiceTurnStore;
  rateLimiter: ReturnType<typeof createMemoryRateLimiter>;
};

let state: State;
let idCounter = 0;

function defaultResolve(ctx: ResolveContext): ResolveOutcome {
  const first = ctx.tool.actions[0];
  if (first && first.kind.startsWith("query_")) {
    return { kind: "answer", cards: [], reply: { display_text: "एक लाख पचास हज़ार रुपये बाकी हैं।", speech_text: "एक लाख पचास हज़ार रुपये बाकी हैं।", language: "hi" } };
  }
  return {
    kind: "preview",
    title: "Correction, not a new payment",
    button_label: "Save correction",
    actions: resolvedFor(ctx.tool),
    missing_fields: [],
    confirm_enabled: true,
    disabled_reason: null,
    reply: { display_text: "Correction, not a new payment: ₹50,000 → ₹40,000.", speech_text: null, language: ctx.register },
  };
}

function okResponse(envelope: CommandEnvelope): CommandResponse {
  return {
    ok: true,
    outcome: "applied",
    command: envelope.command,
    result: { vendor_id: ids.caterer_vendor_id, vendor_totals: { committed_inr: 200000, paid_inr: 40000, outstanding_inr: 160000, overpaid_inr: 0 } },
    activity_entry_id: "c9a0c9a0-0000-4000-8000-000000000001",
    version: 2,
    warnings: [],
  } as unknown as CommandResponse;
}

function deps(): Partial<VoiceDeps> {
  return {
    now: () => state.now,
    newId: () => {
      idCounter += 1;
      return `a41f0000-0000-4000-8000-${String(idCounter).padStart(12, "0")}`;
    },
    store: state.store,
    rateLimiter: state.rateLimiter,
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
    voiceFlagsRecord: (e) => ({
      voice_pilot: e.flags.voice_pilot.enabled,
      voice_writes_enabled: e.flags.voice_writes_enabled.enabled,
      spoken_replies: e.flags.spoken_replies.enabled,
      env_label: e.env_label,
      fallback: e.fallback,
    }),
    fixtureMode: () => state.fixtureMode,
    loadFixture: (row_id) => loadFixture(row_id),
    transcribe: async () => {
      state.calls.transcribe += 1;
      return { ok: true, transcript: "Caterer को चालीस हज़ार advance दिया था", language_code: "hi-IN", request_id: "req-stt", attempts: 1, ms: 5 };
    },
    callModel: async () => {
      state.calls.callModel += 1;
      return { ok: true, args: M03_ARGS, raw_arguments: JSON.stringify(M03_ARGS), request_ids: ["req-llm"], attempts: 1, reasoning_tokens: 0, ms: 7 };
    },
    buildMessages: () => [{ role: "user", content: "x" }],
    promptVersion: () => "test",
    buildSnapshot: async (): Promise<Snapshot> => {
      state.calls.snapshot += 1;
      return { text: "", ref_map: { "PAY-01": ids.advance_payment_id }, keyterms: ["Annapoorna"], today: FIXTURE_TODAY, data: {}, hidden: [] };
    },
    resolveTurn: async (ctx) => {
      state.calls.resolve += 1;
      return state.resolve(ctx);
    },
    matchPhrase: (t) => (["haan save karo", "हाँ, save करो"].includes(t) ? "confirm" : ["नहीं, रहने दो।", "cancel"].includes(t) ? "cancel" : null),
    registerFor: (t) => (/[ऀ-ॿ]/.test(t) ? "hinglish" : "en"),
    normalizeForMatch: (t) => t.toLowerCase(),
    speechFor: (reply) => (reply.speech_text ? { parts: [reply.speech_text], language_code: "hi-IN", speaker: "simran_enhi_customer" } : null),
    fixedReply: (key, register) => fixedReply(key, register),
    confirmedReply: async (input) => ({
      reply: { display_text: "एक लाख साठ हज़ार रुपये बाकी हैं।", speech_text: "एक लाख साठ हज़ार रुपये बाकी हैं।", language: input.register },
      navigate_path: `/w/${WEDDING}/vendors?vendor_id=${ids.caterer_vendor_id}&highlight=outstanding_inr`,
    }),
    prefillFor: (actions): VoicePrefillEntry[] => {
      state.calls.prefillFor += 1;
      return actions.map((action) => ({ command: action.command, input: action.input, labels: action.labels }));
    },
    applyEdits: (actions) => ({ ok: true, actions }),
    dispatch: async (_actor, envelope) => {
      state.dispatched.push(envelope);
      return state.dispatchResponse(envelope);
    },
    log: () => {},
  };
}

let clientCounter = 0;
function clientTurnId(): string {
  clientCounter += 1;
  return `c0000000-0000-4000-8000-${String(clientCounter).padStart(12, "0")}`;
}

function turnRequest(fields: Record<string, string | Blob>): Request {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value instanceof Blob) form.append(key, value, "clip.webm");
    else form.append(key, value);
  }
  return new Request("http://localhost/api/voice/turn", { method: "POST", body: form });
}

function typed(text: string, extra: Record<string, string> = {}): Request {
  return turnRequest({ text, wedding_id: WEDDING, client_turn_id: clientTurnId(), ui_language: "en", ...extra });
}

function jsonRequest(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
}

async function previewTurn(text = "Caterer ko chaalis hazaar advance diya tha"): Promise<string> {
  const events = await readNdjson(await handleTurn(typed(text), deps()));
  const preview = events.find((event) => event.type === "preview");
  if (!preview) throw new Error(`no preview: ${JSON.stringify(events)}`);
  return preview.voice_turn_id as string;
}

beforeEach(() => {
  state = {
    session: mira,
    now: T0,
    evaluation: evaluation(),
    fixtureMode: false,
    calls: { transcribe: 0, callModel: 0, snapshot: 0, resolve: 0, prefillFor: 0 },
    dispatched: [],
    dispatchResponse: okResponse,
    resolve: defaultResolve,
    store: createMemoryVoiceTurnStore(),
    rateLimiter: createMemoryRateLimiter(),
  };
});

describe("POST /api/voice/turn checks", () => {
  it("answers 401 with no session, with the voice block", async () => {
    state.session = null;
    const response = await handleTurn(typed("hello"), deps());
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error.code).toBe("unauthenticated");
    expect(body.voice.voice_available).toBe(false);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("answers 403 forbidden for a wedding the user isn't a member of", async () => {
    const response = await handleTurn(typed("hello", { wedding_id: "00000000-0000-4000-8000-000000000000" }), deps());
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("forbidden");
  });

  it("answers 403 voice_unavailable with voice_pilot off, before any Sarvam call (AT-1.7)", async () => {
    state.evaluation = evaluation({ voice_pilot: false });
    const audio = new Blob([new Uint8Array(2000)], { type: "audio/webm" });
    const response = await handleTurn(
      turnRequest({ audio, wedding_id: WEDDING, client_turn_id: clientTurnId(), ui_language: "en", duration_ms: "3000" }),
      deps(),
    );
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("voice_unavailable");
    expect(body.voice.voice_available).toBe(false);
    expect(state.calls.transcribe).toBe(0);
    expect(state.calls.callModel).toBe(0);
    expect(state.calls.snapshot).toBe(0);
  });

  it("answers 422 for both audio and text, empty text and text over 500 characters", async () => {
    const audio = new Blob([new Uint8Array(10)], { type: "audio/webm" });
    const both = await handleTurn(turnRequest({ audio, text: "hi", wedding_id: WEDDING, client_turn_id: clientTurnId(), ui_language: "en" }), deps());
    expect(both.status).toBe(422);
    expect((await both.json()).error).toMatchObject({ code: "validation_failed", field: "text" });

    const empty = await handleTurn(typed("   "), deps());
    expect(empty.status).toBe(422);
    expect((await empty.json()).error).toMatchObject({ code: "validation_failed", field: "text", message: "required" });

    const long = await handleTurn(typed("a".repeat(501)), deps());
    expect(long.status).toBe(422);
    expect((await long.json()).error).toMatchObject({ field: "text", message: "too_long" });

    const none = await handleTurn(turnRequest({ wedding_id: WEDDING, client_turn_id: clientTurnId() }), deps());
    expect((await none.json()).error).toMatchObject({ field: "audio", message: "required" });
    expect(state.calls.callModel).toBe(0);
  });

  it("asks for a test row in fixture mode (6.4)", async () => {
    state.fixtureMode = true;
    const response = await handleTurn(typed("anything"), deps());
    expect(response.status).toBe(422);
    expect((await response.json()).error).toMatchObject({ code: "validation_failed", field: "fixture_id", message: "required" });
  });

  it("answers 429 after 12 turns in a minute", async () => {
    for (let i = 0; i < 12; i += 1) {
      const response = await handleTurn(typed(`turn ${i}`), deps());
      expect(response.status).toBe(200);
      await response.text();
    }
    const response = await handleTurn(typed("one more"), deps());
    expect(response.status).toBe(429);
    expect((await response.json()).error.code).toBe("rate_limited");
    expect(response.headers.get("retry-after")).not.toBeNull();
  });
});

describe("the turn stream", () => {
  it("streams heard, preview, done for a typed M-03 in fixture mode", async () => {
    state.fixtureMode = true;
    const response = await handleTurn(typed("Caterer ko chaalis hazaar advance diya tha", { fixture_id: "M-03" }), deps());
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/x-ndjson");
    const events = await readNdjson(response);
    expect(events.map((event) => event.type)).toEqual(["heard", "preview", "done"]);
    const [heard, preview, done] = events;
    expect(heard).toMatchObject({ transcript: "Caterer को चालीस हज़ार advance दिया था", input_mode: "fixture", chip: "hinglish" });
    expect(heard?.voice).toMatchObject({ voice_available: true });
    expect(preview).toMatchObject({ status: "proposed", confirm_enabled: true, reply: { speak: false, parts: 0 } });
    expect(typeof preview?.expires_at).toBe("string");
    expect(done?.voice).toBeDefined();
    expect(state.calls.callModel).toBe(0);
    expect(state.calls.transcribe).toBe(0);

    const stored = await state.store.get(preview?.voice_turn_id as string);
    expect(stored).toMatchObject({ status: "proposed", input_mode: "fixture", fixture_id: "M-03" });
    expect(stored?.flags).toMatchObject({ voice_pilot: true, voice_writes_enabled: true });
    expect(stored?.ref_map).toMatchObject({ "PAY-01": ids.advance_payment_id });
    expect(JSON.stringify(stored?.events)).not.toContain("speech_text");
  });

  it("transcribes audio, then calls the model, and stores no audio", async () => {
    const audio = new Blob([new Uint8Array(4096)], { type: "audio/webm;codecs=opus" });
    const response = await handleTurn(
      turnRequest({ audio, wedding_id: WEDDING, client_turn_id: clientTurnId(), ui_language: "en", duration_ms: "3900" }),
      deps(),
    );
    const events = await readNdjson(response);
    expect(events.map((event) => event.type)).toEqual(["heard", "preview", "done"]);
    expect(events[0]).toMatchObject({ input_mode: "speech" });
    expect(state.calls.transcribe).toBe(1);
    expect(state.calls.callModel).toBe(1);
    const stored = await state.store.get(events[1]?.voice_turn_id as string);
    expect(stored?.trace).toMatchObject({ stt: { audio: { type: "audio/webm", bytes: 4096, ms: 3900 } } });
  });

  it("turns a speech-to-text failure into an error event with nothing written", async () => {
    const audio = new Blob([new Uint8Array(4096)], { type: "audio/webm" });
    const response = await handleTurn(
      turnRequest({ audio, wedding_id: WEDDING, client_turn_id: clientTurnId(), ui_language: "en", duration_ms: "1000" }),
      {
        ...deps(),
        transcribe: async () => ({ ok: false, code: "stt_unavailable", http_status: 503, message: "x", retryable: true, attempts: 2, ms: 10 }),
      },
    );
    const events = await readNdjson(response);
    expect(events.map((event) => event.type)).toEqual(["error", "done"]);
    expect(events[0]).toMatchObject({ code: "stt_unavailable", stage: "stt", retryable: true });
    expect(state.calls.callModel).toBe(0);
    expect(state.dispatched).toHaveLength(0);
    const stored = await state.store.get(events[0]?.voice_turn_id as string);
    expect(stored?.status).toBe("failed");
  });

  it("replays a repeated client_turn_id without a second model call", async () => {
    const client_turn_id = clientTurnId();
    const first = await readNdjson(await handleTurn(typed("Caterer ko chaalis hazaar advance diya tha", { client_turn_id }), deps()));
    const second = await readNdjson(await handleTurn(typed("Caterer ko chaalis hazaar advance diya tha", { client_turn_id }), deps()));
    expect(state.calls.callModel).toBe(1);
    expect(second.map((event) => event.type)).toEqual(["heard", "preview", "done"]);
    expect(second[1]).toEqual(first[1]);
  });

  it("stores a kill-switch refusal as paused (R-03)", async () => {
    state.evaluation = evaluation({ writes: false });
    let seenWrites: boolean | null = null;
    state.resolve = (ctx) => {
      seenWrites = ctx.writes_enabled;
      const actions = resolvedFor({ ...M03_ARGS, actions: [{ kind: "add_requirement", event_id: "EVT-REC", text: "Jain food", quantity: 12 }] });
      return {
        kind: "refused",
        code: "voice_writes_paused",
        reply: { display_text: "Abhi voice se badlav band hain. Aap type karke save kar sakte hain.", speech_text: "अभी voice से बदलाव बंद हैं।", language: "hinglish" },
        prefill: actions.map((action) => ({ command: action.command, input: action.input, labels: action.labels })),
        cards: [],
        actions,
      };
    };
    const events = await readNdjson(await handleTurn(typed("Reception mein barah logon ke liye Jain khana add karo"), deps()));
    expect(seenWrites).toBe(false);
    expect(events.map((event) => event.type)).toEqual(["heard", "refused", "done"]);
    expect(events[1]).toMatchObject({ code: "voice_writes_paused", reply: { speak: true, parts: 1 } });
    expect((events[1]?.prefill as unknown[]).length).toBe(1);
    const stored = await state.store.get(events[1]?.voice_turn_id as string);
    expect(stored).toMatchObject({ status: "paused", refusal_code: "voice_writes_paused" });
    expect(stored?.reply_speech?.parts).toHaveLength(1);
  });

  it("closes the older open turn when a new request arrives", async () => {
    const first = await previewTurn();
    const second = await previewTurn();
    expect((await state.store.get(first))?.status).toBe("superseded");
    expect((await state.store.get(first))?.superseded_by_turn_id).toBe(second);
    expect((await state.store.get(second))?.status).toBe("proposed");
  });

  it("treats fillers as empty speech", () => {
    expect(isEmptySpeech("hmm, ok.")).toBe(true);
    expect(isEmptySpeech("।")).toBe(true);
    expect(isEmptySpeech("Caterer को")).toBe(false);
  });
});

describe("POST /api/voice/confirm", () => {
  it("confirms through the dispatcher with key {id}:0 and source voice", async () => {
    const voice_turn_id = await previewTurn();
    const response = await handleConfirm(jsonRequest("/api/voice/confirm", { voice_turn_id, via: "tap" }), deps());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ ok: true, status: "confirmed", confirmed_via: "tap" });
    expect(body.results[0]).toMatchObject({ outcome: "applied", idempotency_key: `${voice_turn_id}:0`, entity_ref: "PAY-01" });
    expect(body.results[0].vendor_totals.outstanding_inr).toBe(160000);
    expect(body.navigate.path).toContain("highlight=outstanding_inr");
    expect(body.reply).toMatchObject({ speak: true, parts: 1 });
    expect(body.voice).toBeDefined();
    expect(state.dispatched).toHaveLength(1);
    expect(state.dispatched[0]).toMatchObject({
      command: "correct_payment",
      idempotency_key: `${voice_turn_id}:0`,
      source: "voice",
      voice_turn_id,
      wedding_id: WEDDING,
    });
    const stored = await state.store.get(voice_turn_id);
    expect(stored).toMatchObject({ status: "confirmed", confirmed_via: "tap" });
    expect(stored?.confirmed_at).not.toBeNull();
  });

  it("replays a second confirm and dispatches nothing new (X-01)", async () => {
    const voice_turn_id = await previewTurn();
    await (await handleConfirm(jsonRequest("/api/voice/confirm", { voice_turn_id, via: "tap" }), deps())).json();
    const again = await handleConfirm(jsonRequest("/api/voice/confirm", { voice_turn_id, via: "tap" }), deps());
    expect(again.status).toBe(200);
    const body = await again.json();
    expect(body.results[0].outcome).toBe("replayed");
    expect(state.dispatched).toHaveLength(1);
  });

  it("answers 202 when every action was proposed (a manager's money)", async () => {
    state.session = diya;
    state.dispatchResponse = (envelope) =>
      ({ ok: true, outcome: "proposed", command: envelope.command, result: { proposal_id: "p" }, activity_entry_id: null, version: 1, warnings: [], proposal_id: "p" }) as unknown as CommandResponse;
    const voice_turn_id = await previewTurn();
    const response = await handleConfirm(jsonRequest("/api/voice/confirm", { voice_turn_id, via: "tap" }), deps());
    expect(response.status).toBe(202);
    expect((await response.json()).results[0]).toMatchObject({ outcome: "proposed", proposal_id: "p" });
  });

  it("pauses the turn on a 423 and rebuilds the prefill with one entry per action", async () => {
    state.resolve = (ctx) => {
      const tool: ToolArguments = {
        ...ctx.tool,
        actions: [
          { kind: "add_requirement", event_id: "EVT-REC", text: "Jain food", quantity: 12 },
          { kind: "add_requirement", event_id: "EVT-REC", text: "Sugar-free dessert", quantity: 20 },
        ],
      };
      return { ...(defaultResolve({ ...ctx, tool }) as Extract<ResolveOutcome, { kind: "preview" }>), actions: resolvedFor(tool) };
    };
    state.dispatchResponse = (envelope) => ({
      ok: false,
      error: { code: "voice_writes_paused", message: "Voice changes are paused.", prefill: [{ command: envelope.command, input: envelope.input as never, labels: {} }] },
    });
    const voice_turn_id = await previewTurn();
    const response = await handleConfirm(jsonRequest("/api/voice/confirm", { voice_turn_id, via: "tap" }), deps());
    expect(response.status).toBe(423);
    const body = await response.json();
    expect(body.error.code).toBe("voice_writes_paused");
    expect(body.error.prefill).toHaveLength(2);
    expect(body.voice).toBeDefined();
    expect(state.calls.prefillFor).toBe(1);
    expect(state.dispatched).toHaveLength(1);
    const stored = await state.store.get(voice_turn_id);
    expect(stored).toMatchObject({ status: "paused", refusal_code: "voice_writes_paused" });
  });

  it("answers 409 with the current error and keeps the turn proposed", async () => {
    state.dispatchResponse = () => ({ ok: false, error: { code: "stale_version", message: "Changed meanwhile.", current: { version: 3 } } });
    const voice_turn_id = await previewTurn();
    const response = await handleConfirm(jsonRequest("/api/voice/confirm", { voice_turn_id, via: "tap" }), deps());
    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatchObject({ code: "stale_version", current: { version: 3 } });
    expect((await state.store.get(voice_turn_id))?.status).toBe("proposed");
  });

  it("re-resolves a 409 against the current record, stores the refreshed preview and saves on the next tap (1.13)", async () => {
    let version = 1;
    state.resolve = (ctx) => {
      const preview = defaultResolve(ctx) as Extract<ResolveOutcome, { kind: "preview" }>;
      return {
        ...preview,
        actions: preview.actions.map((action) => ({ ...action, input: { ...action.input, expected_version: version } })),
      };
    };
    const voice_turn_id = await previewTurn();
    const callsBefore = state.calls.callModel;
    version = 2;
    state.dispatchResponse = (envelope) =>
      (envelope.input as { expected_version?: number }).expected_version === 2
        ? okResponse(envelope)
        : { ok: false, error: { code: "stale_version", message: "Changed meanwhile.", current: { version: 2 } } };
    const first = await handleConfirm(jsonRequest("/api/voice/confirm", { voice_turn_id, via: "tap" }), deps());
    expect(first.status).toBe(409);
    const body = await first.json();
    expect(body.preview).toMatchObject({ type: "preview", voice_turn_id, status: "proposed" });
    const stored = await state.store.get(voice_turn_id);
    expect(stored?.status).toBe("proposed");
    expect(stored?.actions[0]?.input.expected_version).toBe(2);
    expect(state.calls.callModel).toBe(callsBefore);
    const second = await handleConfirm(jsonRequest("/api/voice/confirm", { voice_turn_id, via: "tap" }), deps());
    expect(second.status).toBe(200);
    expect(state.dispatched).toHaveLength(2);
  });

  it("answers 403 forbidden for someone else's turn and for an unknown id (AT-2.8)", async () => {
    const voice_turn_id = await previewTurn();
    state.session = diya;
    const other = await handleConfirm(jsonRequest("/api/voice/confirm", { voice_turn_id, via: "tap" }), deps());
    expect(other.status).toBe(403);
    expect((await other.json()).error.code).toBe("forbidden");
    const unknown = await handleConfirm(jsonRequest("/api/voice/confirm", { voice_turn_id: "00000000-0000-4000-8000-000000000009", via: "tap" }), deps());
    expect(unknown.status).toBe(403);
    expect(state.dispatched).toHaveLength(0);
  });

  it("answers 403 voice_unavailable when voice_pilot went off", async () => {
    const voice_turn_id = await previewTurn();
    state.evaluation = evaluation({ voice_pilot: false });
    const response = await handleConfirm(jsonRequest("/api/voice/confirm", { voice_turn_id, via: "tap" }), deps());
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("voice_unavailable");
  });

  it("answers 410 after 10 minutes and marks the turn expired", async () => {
    const voice_turn_id = await previewTurn();
    state.now = T0 + 11 * 60_000;
    const response = await handleConfirm(jsonRequest("/api/voice/confirm", { voice_turn_id, via: "tap" }), deps());
    expect(response.status).toBe(410);
    expect((await response.json()).error.code).toBe("voice_turn_expired");
    expect((await state.store.get(voice_turn_id))?.status).toBe("expired");
    expect(state.dispatched).toHaveLength(0);
  });

  it("answers 401 with no session", async () => {
    state.session = null;
    const response = await handleConfirm(jsonRequest("/api/voice/confirm", { voice_turn_id: "x", via: "tap" }), deps());
    expect(response.status).toBe(401);
  });
});

describe("phrases", () => {
  it("confirms the open turn with confirmed_via phrase (C-01), with no model call", async () => {
    const voice_turn_id = await previewTurn();
    expect(state.calls.callModel).toBe(1);
    const events = await readNdjson(await handleTurn(typed("haan save karo"), deps()));
    expect(events.map((event) => event.type)).toEqual(["heard", "saved", "done"]);
    const saved = events[1] as { body: { confirmed_via: string; voice_turn_id: string; results: { outcome: string; idempotency_key: string }[] } };
    expect(saved.body).toMatchObject({ confirmed_via: "phrase", voice_turn_id });
    expect(saved.body.results[0]).toMatchObject({ outcome: "applied", idempotency_key: `${voice_turn_id}:0` });
    expect(state.calls.callModel).toBe(1);
    expect(state.dispatched).toHaveLength(1);
    expect((await state.store.get(voice_turn_id))).toMatchObject({ status: "confirmed", confirmed_via: "phrase" });
  });

  it("confirms by the C-01 fixture in fixture mode, then replays a second haan (X-01)", async () => {
    state.fixtureMode = true;
    const first = await readNdjson(await handleTurn(typed("x", { fixture_id: "M-03" }), deps()));
    const voice_turn_id = first[1]?.voice_turn_id as string;
    const c01 = await readNdjson(await handleTurn(typed("x", { fixture_id: "C-01" }), deps()));
    expect(c01.map((event) => event.type)).toEqual(["heard", "saved", "done"]);
    expect(c01[0]).toMatchObject({ transcript: "हाँ, save करो", input_mode: "fixture" });
    const again = await readNdjson(await handleTurn(typed("x", { fixture_id: "C-01" }), deps()));
    expect(again.map((event) => event.type)).toEqual(["heard", "saved", "done"]);
    const body = (again[1] as { body: { voice_turn_id: string; results: { outcome: string }[]; reply: { display_text: string } } }).body;
    expect(body.voice_turn_id).toBe(voice_turn_id);
    expect(body.results[0]?.outcome).toBe("replayed");
    expect(body.reply.display_text).toBe(fixedReply("already_saved", "hinglish").display_text);
    expect(state.dispatched).toHaveLength(1);
  });

  it("says there is nothing to confirm when nothing is open", async () => {
    const events = await readNdjson(await handleTurn(typed("haan save karo"), deps()));
    expect(events.map((event) => event.type)).toEqual(["heard", "answer", "done"]);
    expect(state.dispatched).toHaveLength(0);
  });

  it("cancels the open turn with the C-02 reply", async () => {
    const voice_turn_id = await previewTurn();
    const events = await readNdjson(await handleTurn(typed("नहीं, रहने दो।"), deps()));
    expect(events.map((event) => event.type)).toEqual(["heard", "cancelled", "done"]);
    expect((events[1]?.reply as { display_text: string }).display_text).toBe("ठीक है, कुछ नहीं बदला।");
    expect((await state.store.get(voice_turn_id))?.status).toBe("cancelled");
    expect(state.dispatched).toHaveLength(0);
  });
});

describe("POST /api/voice/cancel", () => {
  it("cancels the turn and returns the C-02 reply; a closed turn gets the same reply", async () => {
    const voice_turn_id = await previewTurn("Caterer को चालीस हज़ार advance दिया था");
    const response = await handleCancel(jsonRequest("/api/voice/cancel", { voice_turn_id }), deps());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ ok: true, status: "cancelled", voice_turn_id });
    expect(body.reply.display_text).toBe("ठीक है, कुछ नहीं बदला।");
    expect(body.voice).toBeDefined();
    expect((await state.store.get(voice_turn_id))?.status).toBe("cancelled");

    const again = await handleCancel(jsonRequest("/api/voice/cancel", { voice_turn_id }), deps());
    expect(again.status).toBe(200);
    expect((await again.json()).reply.display_text).toBe("ठीक है, कुछ नहीं बदला।");

    const confirm = await handleConfirm(jsonRequest("/api/voice/confirm", { voice_turn_id, via: "tap" }), deps());
    expect(confirm.status).toBe(410);
    expect((await confirm.json()).error.message).toBe("This request is closed.");
  });

  it("answers 403 for someone else's turn", async () => {
    const voice_turn_id = await previewTurn();
    state.session = diya;
    const response = await handleCancel(jsonRequest("/api/voice/cancel", { voice_turn_id }), deps());
    expect(response.status).toBe(403);
    expect((await state.store.get(voice_turn_id))?.status).toBe("proposed");
  });
});
