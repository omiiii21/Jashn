import "server-only";

import {
  VOICE_AUDIO_MAX_BYTES,
  VOICE_AUDIO_MAX_MS,
  VOICE_TEXT_MAX,
  VOICE_TURN_TTL_MS,
  type ReplyRegister,
  type VoiceInputMode,
  type VoiceStreamEvent,
} from "@/contracts/api";
import type { VoiceRefusalCode } from "@/contracts/commands";
import { APP_LANGUAGES, type AppLanguage, type JsonObject, type SessionActor, type WeddingId } from "@/contracts/domain";

import { membershipFor, readSession } from "./auth";
import { cancelReply, cancelTurn } from "./cancel";
import { confirmTurn } from "./confirm";
import { resolveDeps, type FixedReplyKey, type VoiceDeps } from "./deps";
import type { VoiceFixture } from "./fixture-mode";
import { flagsForRequest, type RequestFlags } from "./flags-for-request";
import {
  ERROR_MESSAGES,
  ndjsonResponse,
  speechIfOn,
  toVoiceReply,
  VOICE_OFF_BLOCK,
  voiceErrorResponse,
  type NdjsonWriter,
} from "./ndjson";
import type {
  ReplySpeech,
  ReplyText,
  ResolveOutcome,
  ResolvedAction,
  Snapshot,
  StoredOption,
  StoredTurn,
  ToolAction,
  ToolArguments,
  ToolIntent,
} from "./types";

/**
 * `POST /api/voice/turn` (voice.md 1.4, 1.5, 1.8, 1.11). Checks 1 to 6 run before any Sarvam
 * call; then the route streams NDJSON: `heard`, exactly one terminal event, then `done`.
 * The model only proposes: nothing is written here except the voice_turns row (and, on a
 * confirm phrase, the confirm through the one dispatcher, exactly as a tap).
 */

export type TurnDeps = VoiceDeps;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PHRASE_REPLAY_MS = 2 * 60_000;
const FILLERS = new Set(["hmm", "hm", "umm", "um", "uh", "acha", "accha", "achha", "ok", "okay", "हम्म", "अच्छा", "अचछा", "ओके"]);

type TurnInput =
  | { kind: "audio"; audio: Blob; filename: string; mime: string }
  | { kind: "text"; text: string }
  | { kind: "option"; value: string; option: StoredOption; context: StoredTurn };

type ParsedTurn = {
  wedding_id: WeddingId | null;
  client_turn_id: string;
  ui_language: AppLanguage;
  speech_language: "hi-IN" | "en-IN";
  context: StoredTurn | null;
  duration_ms: number | null;
  attached_asset_id: string | null;
  page: string | null;
  setup_opened_at: string | null;
  fixture: VoiceFixture | null;
  input: TurnInput;
};

type FieldError = { field: string; message: "required" | "too_long" | "unknown_value" };

function str(form: FormData | null, name: string): string | null {
  const value = form?.get(name);
  return typeof value === "string" ? value : null;
}

function baseMime(blob: Blob, filename: string): string {
  const type = (blob.type || "").split(";")[0]?.trim().toLowerCase() ?? "";
  if (type) return type;
  if (filename.endsWith(".m4a") || filename.endsWith(".mp4")) return "audio/mp4";
  if (filename.endsWith(".ogg")) return "audio/ogg";
  if (filename.endsWith(".wav")) return "audio/wav";
  return "audio/webm";
}

function isUsableContext(turn: StoredTurn | null, actor: SessionActor, wedding_id: WeddingId | null, now: number): turn is StoredTurn {
  if (!turn) return false;
  if (turn.user_id !== actor.user_id) return false;
  if ((turn.wedding_id ?? null) !== wedding_id) return false;
  const created = Date.parse(turn.created_at);
  return !Number.isNaN(created) && now - created <= VOICE_TURN_TTL_MS;
}

/** Check 5 (and the fixture rule of 6.4). */
async function validateTurn(
  form: FormData | null,
  deps: VoiceDeps,
  actor: SessionActor,
  wedding_id: WeddingId | null,
  fixtureMode: boolean,
): Promise<{ ok: true; parsed: ParsedTurn } | { ok: false; error: FieldError }> {
  if (!form) return { ok: false, error: { field: "audio", message: "required" } };
  const now = deps.now();

  const present = (["audio", "text", "option"] as const).filter((name) => form.has(name));
  if (present.length === 0) return { ok: false, error: { field: "audio", message: "required" } };
  if (present.length > 1) return { ok: false, error: { field: present[1] ?? "text", message: "unknown_value" } };

  const client_turn_id = str(form, "client_turn_id");
  if (!client_turn_id) return { ok: false, error: { field: "client_turn_id", message: "required" } };
  if (!UUID_PATTERN.test(client_turn_id)) return { ok: false, error: { field: "client_turn_id", message: "unknown_value" } };

  const uiRaw = str(form, "ui_language");
  const ui_language = (uiRaw && uiRaw.length > 0 ? uiRaw : actor.preferred_language) as AppLanguage;
  if (!(APP_LANGUAGES as readonly string[]).includes(ui_language)) return { ok: false, error: { field: "ui_language", message: "unknown_value" } };

  const speechRaw = str(form, "speech_language");
  const speech_language = speechRaw && speechRaw.length > 0 ? speechRaw : "hi-IN";
  if (speech_language !== "hi-IN" && speech_language !== "en-IN") return { ok: false, error: { field: "speech_language", message: "unknown_value" } };

  const durationRaw = str(form, "duration_ms");
  const duration_ms = durationRaw && /^\d+$/.test(durationRaw) ? Number(durationRaw) : null;

  const contextId = str(form, "context_turn_id");
  const contextRaw = contextId && UUID_PATTERN.test(contextId) ? await deps.store.get(contextId) : null;
  const context = isUsableContext(contextRaw, actor, wedding_id, now) ? contextRaw : null;

  let input: TurnInput;
  const name = present[0];
  if (name === "audio") {
    const audio = form.get("audio");
    if (!(audio instanceof Blob)) return { ok: false, error: { field: "audio", message: "unknown_value" } };
    if (audio.size === 0) return { ok: false, error: { field: "audio", message: "required" } };
    if (audio.size > VOICE_AUDIO_MAX_BYTES) return { ok: false, error: { field: "audio", message: "too_long" } };
    if (duration_ms !== null && duration_ms > VOICE_AUDIO_MAX_MS) return { ok: false, error: { field: "audio", message: "too_long" } };
    const filename = typeof (audio as File).name === "string" && (audio as File).name ? (audio as File).name : "clip.webm";
    const mime = baseMime(audio, filename);
    if (!mime.startsWith("audio/")) return { ok: false, error: { field: "audio", message: "unknown_value" } };
    input = { kind: "audio", audio, filename, mime };
  } else if (name === "text") {
    const text = (str(form, "text") ?? "").trim();
    if (text.length === 0) return { ok: false, error: { field: "text", message: "required" } };
    if (text.length > VOICE_TEXT_MAX) return { ok: false, error: { field: "text", message: "too_long" } };
    input = { kind: "text", text };
  } else {
    const value = (str(form, "option") ?? "").trim();
    if (value.length === 0) return { ok: false, error: { field: "option", message: "required" } };
    if (!contextId) return { ok: false, error: { field: "option", message: "required" } };
    const option = context?.options?.find((entry) => entry.value === value) ?? null;
    if (!context || !option) return { ok: false, error: { field: "option", message: "unknown_value" } };
    input = { kind: "option", value, option, context };
  }

  let fixture: VoiceFixture | null = null;
  if (fixtureMode && input.kind !== "option") {
    const fixture_id = str(form, "fixture_id");
    if (!fixture_id) return { ok: false, error: { field: "fixture_id", message: "required" } };
    fixture = await deps.loadFixture(fixture_id);
    if (!fixture) return { ok: false, error: { field: "fixture_id", message: "unknown_value" } };
  }

  const page = str(form, "page");
  const asset = str(form, "attached_asset_id");
  const opened = str(form, "setup_opened_at");
  return {
    ok: true,
    parsed: {
      wedding_id,
      client_turn_id,
      ui_language,
      speech_language,
      context,
      duration_ms,
      attached_asset_id: asset && UUID_PATTERN.test(asset) ? asset : null,
      page: page && page.length <= 500 ? page : null,
      setup_opened_at: wedding_id === null && opened && !Number.isNaN(Date.parse(opened)) ? opened : null,
      fixture,
      input,
    },
  };
}

/** 6.1 row 6: empty, only punctuation, or only fillers. */
export function isEmptySpeech(transcript: string): boolean {
  const words = transcript
    .normalize("NFC")
    .toLowerCase()
    .replace(/[\p{P}\p{S}]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length > 0);
  return words.length === 0 || words.every((word) => FILLERS.has(word));
}

function isoAt(ms: number): string {
  return new Date(ms).toISOString();
}

// ---------------------------------------------------------------------------
// The pipeline
// ---------------------------------------------------------------------------

type Terminal = {
  event: VoiceStreamEvent;
  status: StoredTurn["status"];
  intent: StoredTurn["intent"];
  refusal_code: VoiceRefusalCode | null;
  actions: ResolvedAction[];
  missing_fields: string[];
  options: StoredOption[] | null;
  reply: ReplyText | null;
  speech: ReplySpeech | null;
  reply_language: ReplyRegister;
  context_turn_id?: string | null;
  error_code?: string | null;
  /** True when this turn is a new request that closes the speaker's older open turn (1.4). */
  closes_open: boolean;
};

type Run = {
  deps: VoiceDeps;
  actor: SessionActor;
  flags: RequestFlags;
  parsed: ParsedTurn;
  fixtureMode: boolean;
  route_started_ms: number;
  voice_turn_id: string;
  abort: AbortController;
  timings: Record<string, number>;
  trace: JsonObject;
  transcript: string;
  language_code: string | null;
  chip: ReplyRegister;
  input_mode: VoiceInputMode;
  heard: VoiceStreamEvent | null;
  snapshot: Promise<Snapshot>;
};

function baseTurn(run: Run): StoredTurn {
  const created_at = isoAt(run.route_started_ms);
  return {
    voice_turn_id: run.voice_turn_id,
    user_id: run.actor.user_id,
    member_id: run.actor.member_id,
    wedding_id: run.parsed.wedding_id,
    client_turn_id: run.parsed.client_turn_id,
    input_mode: run.input_mode,
    speech_language: run.parsed.input.kind === "audio" ? run.parsed.speech_language : null,
    transcript: run.transcript,
    language_code: run.language_code,
    chip: run.chip,
    reply_language: run.chip,
    intent: null,
    status: "failed",
    refusal_code: null,
    actions: [],
    missing_fields: [],
    options: null,
    reply_text: null,
    reply_speech: null,
    ref_map: {},
    flags: run.flags.record,
    events: [],
    results: null,
    confirmed_at: null,
    confirmed_via: null,
    superseded_by_turn_id: null,
    context_turn_id: run.parsed.context?.voice_turn_id ?? null,
    setup_opened_at: run.parsed.setup_opened_at,
    fixture_id: run.parsed.fixture?.row_id ?? null,
    trace: run.trace,
    timings_ms: run.timings,
    created_at,
    updated_at: created_at,
  };
}

function sameTarget(a: ResolvedAction[], b: ResolvedAction[]): boolean {
  return a.some((x) => b.some((y) => x.kind === y.kind && (x.entity_ref ?? null) === (y.entity_ref ?? null)));
}

/** One open turn per speaker (1.4): close the older open turn, superseded or cancelled. */
async function closeOlderOpenTurns(deps: VoiceDeps, turn: StoredTurn): Promise<void> {
  const since = isoAt(deps.now() - VOICE_TURN_TTL_MS * 2);
  const recent = await deps.store.recentForSpeaker(turn.user_id, turn.wedding_id, since);
  for (const older of recent) {
    if (older.voice_turn_id === turn.voice_turn_id || older.status !== "proposed") continue;
    // Superseded only when the new turn completes or changes the older one (the same kind and
    // target, or a context merge into its missing fields); any other new turn cancels it.
    const merged =
      turn.context_turn_id === older.voice_turn_id &&
      older.missing_fields.length > 0 &&
      turn.actions.some((action) => older.actions.some((o) => o.kind === action.kind));
    const supersedes = merged || sameTarget(turn.actions, older.actions);
    await deps.store.update(
      older.voice_turn_id,
      supersedes ? { status: "superseded", superseded_by_turn_id: turn.voice_turn_id } : { status: "cancelled" },
    );
  }
}

async function fixed(run: Run, key: FixedReplyKey, register: ReplyRegister, fallback: string): Promise<ReplyText> {
  try {
    return await run.deps.fixedReply(key, register);
  } catch {
    return { display_text: fallback, speech_text: null, language: register };
  }
}

/** Stores the turn, closes the older open turn, then sends the terminal event and `done`. */
async function finish(run: Run, writer: NdjsonWriter, terminal: Terminal): Promise<void> {
  const { deps } = run;
  if (run.abort.signal.aborted || writer.closed) {
    await storeCancelled(run);
    return;
  }
  run.timings.server_total = deps.now() - run.route_started_ms;
  run.trace.input_mode = run.input_mode;
  if (terminal.error_code) run.trace.error_code = terminal.error_code;
  const turn: StoredTurn = {
    ...baseTurn(run),
    intent: terminal.intent,
    status: terminal.status,
    refusal_code: terminal.refusal_code,
    actions: terminal.actions,
    missing_fields: terminal.missing_fields,
    options: terminal.options,
    reply_text: terminal.reply?.display_text ?? null,
    reply_speech: terminal.speech,
    reply_language: terminal.reply_language,
    context_turn_id: terminal.context_turn_id !== undefined ? terminal.context_turn_id : (run.parsed.context?.voice_turn_id ?? null),
    ref_map: (await run.snapshot.catch(() => null))?.ref_map ?? {},
    events: [...(run.heard ? [run.heard] : []), terminal.event] as unknown as JsonObject[],
  };
  try {
    await deps.store.insert(turn);
    if (terminal.closes_open) await closeOlderOpenTurns(deps, turn);
  } catch {
    // The stream still answers; a store failure must not hide the result from the speaker.
    deps.log("voice turn store write failed");
  }
  writer.write(terminal.event);
  writer.write({ type: "done", voice_turn_id: run.voice_turn_id, timings_ms: run.timings, voice: run.flags.voice });
}

async function storeCancelled(run: Run): Promise<void> {
  run.timings.server_total = run.deps.now() - run.route_started_ms;
  try {
    await run.deps.store.insert({
      ...baseTurn(run),
      status: "cancelled",
      events: run.heard ? ([run.heard] as unknown as JsonObject[]) : [],
    });
  } catch {
    // nothing else to do: the browser is gone
  }
}

function errorTerminal(
  run: Run,
  code: "no_speech" | "audio_unreadable" | "stt_unavailable" | "llm_unavailable" | "llm_no_action" | "internal_error",
  stage: "stt" | "llm" | "server",
  message: string,
  retryable: boolean,
): Terminal {
  return {
    event: { type: "error", voice_turn_id: run.voice_turn_id, code, stage, message, retryable },
    // Empty speech is `answered`; only real failures are `failed` (section 9).
    status: code === "no_speech" ? "answered" : "failed",
    intent: null,
    refusal_code: null,
    actions: [],
    missing_fields: [],
    options: null,
    reply: null,
    speech: null,
    reply_language: run.chip,
    error_code: code,
    closes_open: false,
  };
}

const ERROR_TEXT = {
  no_speech: { en: "I didn't hear anything. Hold the mic and speak, or type.", hi: "मुझे कुछ सुनाई नहीं दिया। माइक दबाकर बोलिए, या टाइप कीजिए।" },
  audio_unreadable: { en: "Couldn't read that recording. Try again or type.", hi: "रिकॉर्डिंग पढ़ी नहीं जा सकी। फिर कोशिश करें या टाइप करें।" },
  stt_unavailable: {
    en: "Couldn't reach the speech service. Nothing was saved. Try again or type.",
    hi: "स्पीच सेवा से संपर्क नहीं हो पाया। कुछ सेव नहीं हुआ। फिर कोशिश करें या टाइप करें।",
  },
  llm_unavailable: {
    en: "Couldn't reach the assistant. Nothing was saved. Edit what I heard, or type it.",
    hi: "असिस्टेंट से संपर्क नहीं हो पाया। कुछ सेव नहीं हुआ। सुनी हुई बात बदलें, या टाइप करें।",
  },
  llm_no_action: {
    en: "Couldn't work out what to do. Nothing was saved. Edit what I heard, or type it.",
    hi: "समझ नहीं आया कि क्या करना है। कुछ सेव नहीं हुआ। सुनी हुई बात बदलें, या टाइप करें।",
  },
  internal_error: {
    en: "Something went wrong. Nothing was saved. Try again or type.",
    hi: "कुछ गड़बड़ हो गई। कुछ सेव नहीं हुआ। फिर कोशिश करें या टाइप करें।",
  },
} as const;

/** Failure messages are shown in the screen language, never spoken (6.1). */
function errorText(run: Run, code: keyof typeof ERROR_TEXT): string {
  return ERROR_TEXT[code][run.parsed.ui_language === "hi" ? "hi" : "en"];
}

/** Maps the resolver's decision to the terminal event and the stored turn's fields (1.11 step 8). */
async function terminalFor(run: Run, outcome: ResolveOutcome, intent: ToolIntent | null, register: ReplyRegister): Promise<Terminal> {
  const { deps, flags, voice_turn_id } = run;
  const base = { intent, reply_language: register, closes_open: true } as const;
  if (outcome.kind === "preview") {
    const speech = await speechIfOn(deps, flags.spoken_replies, outcome.reply);
    return {
      ...base,
      event: {
        type: "preview",
        voice_turn_id,
        status: "proposed",
        title: outcome.title,
        button_label: outcome.button_label,
        actions: outcome.actions.map((action) => ({ ...action.preview, index: action.index })),
        missing_fields: outcome.missing_fields,
        confirm_enabled: outcome.confirm_enabled,
        disabled_reason: outcome.disabled_reason,
        reply: toVoiceReply(outcome.reply, speech),
        expires_at: isoAt(run.route_started_ms + VOICE_TURN_TTL_MS),
      },
      status: "proposed",
      refusal_code: null,
      actions: outcome.actions,
      missing_fields: outcome.missing_fields,
      options: null,
      reply: outcome.reply,
      speech,
    };
  }
  if (outcome.kind === "answer") {
    const speech = await speechIfOn(deps, flags.spoken_replies, outcome.reply);
    return {
      ...base,
      intent: intent ?? "ask",
      event: { type: "answer", voice_turn_id, cards: outcome.cards, reply: toVoiceReply(outcome.reply, speech) },
      status: "answered",
      refusal_code: null,
      actions: [],
      missing_fields: [],
      options: null,
      reply: outcome.reply,
      speech,
    };
  }
  if (outcome.kind === "clarify") {
    const speech = await speechIfOn(deps, flags.spoken_replies, outcome.question);
    // The resolver may attach what each option stands for (`apply`, a StoredOption); keep it.
    const stored: StoredOption[] | null = outcome.options
      ? outcome.options.map((option) => ({ ...option, apply: (option as Partial<StoredOption>).apply ?? [] }))
      : null;
    const event: VoiceStreamEvent = {
      type: "clarify",
      voice_turn_id,
      question: toVoiceReply(outcome.question, speech),
      missing_fields: outcome.missing_fields,
    };
    if (outcome.options) {
      event.options = outcome.options.map((option) => ({
        label: option.label,
        value: option.value,
        ...(option.default !== undefined ? { default: option.default } : {}),
      }));
    }
    if (outcome.cards) event.cards = outcome.cards;
    return {
      ...base,
      intent: intent ?? "clarify",
      event,
      status: "answered",
      refusal_code: null,
      actions: outcome.actions,
      missing_fields: outcome.missing_fields,
      options: stored,
      reply: outcome.question,
      speech,
    };
  }
  // refused
  const speech = await speechIfOn(deps, flags.spoken_replies, outcome.reply);
  if (outcome.code === "voice_writes_paused") {
    const commands = [...new Set(outcome.actions.map((action) => action.command))].join(", ") || "write";
    deps.log(`voice turn refused: ${commands}, voice writes paused (${flags.evaluation.fallback ? "flags unreadable" : "switch off"})`);
  }
  return {
    ...base,
    event: {
      type: "refused",
      voice_turn_id,
      code: outcome.code,
      reply: toVoiceReply(outcome.reply, speech),
      prefill: outcome.prefill,
      cards: outcome.cards,
    },
    status: outcome.code === "voice_writes_paused" ? "paused" : "answered",
    refusal_code: outcome.code,
    actions: outcome.actions,
    missing_fields: [],
    options: null,
    reply: outcome.reply,
    speech,
  };
}

async function resolveWith(run: Run, tool: ToolArguments, transcript: string, register: ReplyRegister, context: StoredTurn | null): Promise<ResolveOutcome> {
  const snapshot = await run.snapshot;
  const started = run.deps.now();
  try {
    return await run.deps.resolveTurn({
      actor: run.actor,
      wedding_id: run.parsed.wedding_id,
      tool,
      snapshot,
      transcript,
      register,
      ui_language: run.parsed.ui_language,
      writes_enabled: run.flags.writes_enabled,
      context,
      page: run.parsed.page,
      setup_opened_at: run.parsed.setup_opened_at ?? context?.setup_opened_at ?? null,
    });
  } finally {
    run.timings.resolve = run.deps.now() - started;
  }
}

const VALUE_FIELD = /(_inr|_date|_on|_time|quantity|expected_guests|expected_headcount|plus_ones|month|day|year)$/;

/**
 * An option tapped (or taken by "haan") on a question (6.2): its values merge into the context
 * turn's stored partial actions and 1.11's checks run again, with no speech to text and no
 * model. A numeric or date value carries the option's label as its heard phrase, so the
 * re-read accepts it.
 */
export function toolWithOption(context: StoredTurn, option: StoredOption): ToolArguments {
  const raws: ToolAction[] = context.actions.map((action) => structuredClone(action.raw));
  const applied = new Set<string>();
  for (const entry of option.apply) {
    const position = context.actions.findIndex((action) => action.index === entry.action_index);
    const raw = raws[position >= 0 ? position : entry.action_index];
    if (!raw) continue;
    raw[entry.field] = entry.value;
    applied.add(entry.field);
    applied.add(`${entry.action_index}:${entry.field}`);
    const heard = (raw.heard ?? []).filter((item) => item.field !== entry.field);
    if (VALUE_FIELD.test(entry.field) && (typeof entry.value === "number" || typeof entry.value === "string")) {
      heard.push({ field: entry.field, phrase: option.label });
    }
    raw.heard = heard;
  }
  return {
    intent: "act",
    actions: raws,
    missing_fields: context.missing_fields.filter((field) => !applied.has(field)),
    reply: "",
    reply_language: context.reply_language,
  };
}

async function runOption(run: Run, writer: NdjsonWriter, context: StoredTurn, option: StoredOption): Promise<void> {
  const tool = toolWithOption(context, option);
  const outcome = await resolveWith(run, tool, `${context.transcript} ${option.label}`.trim(), context.reply_language, null);
  const terminal = await terminalFor(run, outcome, "act", context.reply_language);
  await finish(run, writer, { ...terminal, context_turn_id: context.voice_turn_id });
}

function storedEvent(turn: StoredTurn, type: string): Record<string, unknown> | null {
  const found = (turn.events as unknown as Record<string, unknown>[]).find((event) => event.type === type);
  return found ?? null;
}

/** 1.8: a confirm or cancel phrase, matched in code with no model call. */
async function runPhrase(run: Run, writer: NdjsonWriter, phrase: "confirm" | "cancel"): Promise<void> {
  const { deps, actor, flags, voice_turn_id } = run;
  const now = deps.now();
  const recent = await deps.store.recentForSpeaker(actor.user_id, run.parsed.wedding_id, isoAt(now - VOICE_TURN_TTL_MS));
  const fresh = recent.filter((turn) => now - Date.parse(turn.created_at) <= VOICE_TURN_TTL_MS);
  const open = fresh.find((turn) => turn.status === "proposed") ?? null;
  const latest = fresh[0] ?? null;
  const latestQuestion = latest && storedEvent(latest, "clarify") ? latest : null;
  const register = run.chip;

  const phraseTerminal = (event: VoiceStreamEvent, reply: ReplyText | null, speech: ReplySpeech | null, link: string | null, extra: Partial<Terminal> = {}): Terminal => ({
    event,
    status: "answered",
    intent: "ask",
    refusal_code: null,
    actions: [],
    missing_fields: [],
    options: null,
    reply,
    speech,
    reply_language: reply?.language ?? register,
    context_turn_id: link,
    closes_open: false,
    ...extra,
  });

  if (phrase === "cancel") {
    if (open) {
      const { reply, speech } = await cancelTurn(deps, open, flags, register);
      await finish(run, writer, phraseTerminal({ type: "cancelled", voice_turn_id, reply: toVoiceReply(reply, speech) }, reply, speech, open.voice_turn_id));
      return;
    }
    if (latestQuestion) {
      const reply = await cancelReply(deps, register);
      const speech = await speechIfOn(deps, flags.spoken_replies, reply);
      await finish(run, writer, phraseTerminal({ type: "cancelled", voice_turn_id, reply: toVoiceReply(reply, speech) }, reply, speech, latestQuestion.voice_turn_id));
      return;
    }
    const reply = await fixed(run, "nothing_to_cancel", register, "There's nothing to cancel.");
    const speech = await speechIfOn(deps, flags.spoken_replies, reply);
    await finish(run, writer, phraseTerminal({ type: "answer", voice_turn_id, cards: [], reply: toVoiceReply(reply, speech) }, reply, speech, null));
    return;
  }

  // Confirm phrase.
  if (open) {
    const outcome = await confirmTurn({ deps, actor, turn: open, edits: [], via: "phrase", flags });
    if (outcome.kind === "saved") {
      await finish(run, writer, phraseTerminal({ type: "saved", voice_turn_id, body: outcome.body }, outcome.reply, outcome.speech, open.voice_turn_id));
      return;
    }
    const error = outcome.body.error;
    if (error.code === "voice_writes_paused") {
      const reply = outcome.reply ?? (await fixed(run, "voice_writes_paused", register, ERROR_MESSAGES.paused));
      const speech = outcome.speech;
      await finish(
        run,
        writer,
        phraseTerminal(
          { type: "refused", voice_turn_id, code: "voice_writes_paused", reply: toVoiceReply(reply, speech), prefill: error.prefill ?? [], cards: [] },
          reply,
          speech,
          open.voice_turn_id,
          { refusal_code: "voice_writes_paused" },
        ),
      );
      return;
    }
    // The card stays: the open turn's preview (refreshed on a 409, 1.13) is sent again under
    // its own id, and this phrase turn keeps its partial actions so a follow-up still merges.
    const keepCard = (preview: Extract<VoiceStreamEvent, { type: "preview" }>, speech: ReplySpeech | null) =>
      finish(
        run,
        writer,
        phraseTerminal(
          preview,
          { display_text: preview.reply.display_text, speech_text: null, language: preview.reply.language },
          speech,
          open.voice_turn_id,
          { actions: open.actions, missing_fields: open.missing_fields },
        ),
      );
    const refreshed = outcome.body.preview ?? null;
    if (refreshed) {
      await keepCard(refreshed, null);
      return;
    }
    const openPreview = storedEvent(open, "preview") as Extract<VoiceStreamEvent, { type: "preview" }> | null;
    if (error.code === "validation_failed" && openPreview) {
      await keepCard(openPreview, open.reply_speech);
      return;
    }
    if (error.code === "validation_failed") {
      // Confirm is still disabled (a "?" left): ask the open card's question again.
      const preview = storedEvent(open, "preview");
      const question = (preview?.reply as ReturnType<typeof toVoiceReply> | undefined) ?? {
        display_text: open.reply_text ?? "",
        language: open.reply_language,
        speak: false,
        parts: 0,
      };
      await finish(
        run,
        writer,
        phraseTerminal(
          { type: "clarify", voice_turn_id, question: { ...question, speak: question.speak && !!open.reply_speech }, missing_fields: open.missing_fields },
          { display_text: question.display_text, speech_text: null, language: question.language },
          open.reply_speech,
          open.voice_turn_id,
        ),
      );
      return;
    }
    const message = error.message || ERROR_MESSAGES.closed;
    const reply: ReplyText = { display_text: message, speech_text: null, language: register };
    await finish(
      run,
      writer,
      phraseTerminal({ type: "clarify", voice_turn_id, question: toVoiceReply(reply, null), missing_fields: [] }, reply, null, open.voice_turn_id),
    );
    return;
  }

  if (latestQuestion) {
    const fallbackOption = latestQuestion.options?.find((option) => option.default === true) ?? null;
    if (fallbackOption) {
      await runOption(run, writer, latestQuestion, fallbackOption);
      return;
    }
    const clarify = storedEvent(latestQuestion, "clarify") as Extract<VoiceStreamEvent, { type: "clarify" }> | null;
    if (clarify) {
      await finish(
        run,
        writer,
        phraseTerminal(
          { ...clarify, voice_turn_id },
          { display_text: clarify.question.display_text, speech_text: null, language: clarify.question.language },
          latestQuestion.reply_speech,
          latestQuestion.voice_turn_id,
          // The repeated question carries the question's own state, so its options stay live
          // and a follow-up merges into its partial actions (1.8, 6.2).
          { actions: latestQuestion.actions, missing_fields: latestQuestion.missing_fields, options: latestQuestion.options },
        ),
      );
      return;
    }
  }

  const replayable = fresh.find(
    (turn) =>
      (turn.status === "confirmed" || turn.status === "partially_saved") &&
      turn.confirmed_at !== null &&
      now - Date.parse(turn.confirmed_at) <= PHRASE_REPLAY_MS,
  );
  if (replayable) {
    const outcome = await confirmTurn({ deps, actor, turn: replayable, edits: [], via: "phrase", flags });
    if (outcome.kind === "saved") {
      await finish(run, writer, phraseTerminal({ type: "saved", voice_turn_id, body: outcome.body }, outcome.reply, outcome.speech, replayable.voice_turn_id));
      return;
    }
  }

  const reply = await fixed(run, "nothing_to_confirm", register, "There's nothing to confirm right now.");
  const speech = await speechIfOn(deps, flags.spoken_replies, reply);
  await finish(run, writer, phraseTerminal({ type: "answer", voice_turn_id, cards: [], reply: toVoiceReply(reply, speech) }, reply, speech, null));
}

async function runTurn(run: Run, writer: NdjsonWriter): Promise<void> {
  const { deps, parsed } = run;
  const aborted = () => run.abort.signal.aborted || writer.closed;

  // Option tapped on a question: no speech to text, no model (6.2).
  if (parsed.input.kind === "option") {
    run.transcript = parsed.input.option.label;
    run.chip = parsed.input.context.chip;
    run.input_mode = "tap";
    run.heard = heardEvent(run);
    writer.write(run.heard);
    await runOption(run, writer, parsed.input.context, parsed.input.option);
    return;
  }

  // Speech to text, a typed request, or a fixture.
  if (parsed.fixture) {
    run.transcript = parsed.fixture.stt.transcript;
    run.language_code = parsed.fixture.stt.language_code;
    run.input_mode = "fixture";
    run.trace.stt = parsed.input.kind === "audio" ? { ...audioFacts(run), request_id: "fixture", model: "fixture", ms: 0 } : null;
  } else if (parsed.input.kind === "text") {
    run.transcript = parsed.input.text;
    run.input_mode = "typed";
  } else {
    const keytermsStarted = deps.now();
    const snapshot = await run.snapshot.catch(() => null);
    run.timings.keyterms = deps.now() - keytermsStarted;
    const keyterms = snapshot?.keyterms ?? [];
    if (aborted()) return storeCancelled(run);
    const sttStarted = deps.now();
    const stt = await deps.transcribe({
      audio: parsed.input.audio,
      filename: parsed.input.filename,
      mime: parsed.input.mime,
      speech_language: parsed.speech_language,
      keyterms,
      signal: run.abort.signal,
      route_started_ms: run.route_started_ms,
    });
    run.timings.stt = deps.now() - sttStarted;
    run.trace.stt = {
      ...audioFacts(run),
      model: "saaras:v4",
      mode: "codemix",
      language_code_sent: parsed.speech_language,
      keyterms: keyterms.length,
      attempts: stt.attempts,
      ms: stt.ms,
      request_id: stt.ok ? stt.request_id : null,
    };
    if (aborted()) return storeCancelled(run);
    if (!stt.ok) {
      const code = stt.code;
      await finish(run, writer, errorTerminal(run, code, "stt", errorText(run, code), code === "no_speech" ? false : stt.retryable || code === "audio_unreadable"));
      return;
    }
    run.transcript = stt.transcript;
    run.language_code = stt.language_code;
    run.input_mode = "speech";
  }

  if (parsed.input.kind === "audio" && isEmptySpeech(run.transcript)) {
    await finish(run, writer, errorTerminal(run, "no_speech", "stt", errorText(run, "no_speech"), false));
    return;
  }

  // Heard, at once (1.7).
  try {
    run.chip = await deps.registerFor(run.transcript, null);
  } catch {
    run.chip = "en";
  }
  run.heard = heardEvent(run);
  writer.write(run.heard);
  if (aborted()) return storeCancelled(run);

  // Confirm and cancel phrases (1.8), before any model call.
  let phrase: "confirm" | "cancel" | null = null;
  try {
    phrase = await deps.matchPhrase(run.transcript);
  } catch {
    phrase = null;
  }
  if (phrase) {
    await runPhrase(run, writer, phrase);
    return;
  }

  // The model (or the fixture's arguments).
  let tool: ToolArguments;
  const promptVersion = await Promise.resolve(deps.promptVersion()).catch(() => "unknown");
  if (parsed.fixture) {
    if (!parsed.fixture.llm) {
      await finish(run, writer, errorTerminal(run, "llm_no_action", "llm", errorText(run, "llm_no_action"), false));
      return;
    }
    tool = parsed.fixture.llm;
    run.trace.llm = { model: "fixture", prompt_version: promptVersion, attempts: 0, request_ids: ["fixture"], ms: 0, reasoning_tokens: 0, raw_arguments: JSON.stringify(tool) };
  } else {
    const snapshot = await run.snapshot;
    const context_turns = parsed.context ? [parsed.context] : [];
    const messages = await deps.buildMessages({ snapshot, transcript: run.transcript, context_turns });
    if (aborted()) return storeCancelled(run);
    const llmStarted = deps.now();
    const llm = await deps.callModel({ messages, signal: run.abort.signal, route_started_ms: run.route_started_ms });
    run.timings.llm = deps.now() - llmStarted;
    run.trace.llm = {
      model: "sarvam-105b",
      prompt_version: promptVersion,
      attempts: llm.attempts,
      request_ids: llm.request_ids,
      ms: llm.ms,
      reasoning_tokens: llm.ok ? llm.reasoning_tokens : null,
      raw_arguments: llm.ok ? llm.raw_arguments : null,
    };
    if (aborted()) return storeCancelled(run);
    if (!llm.ok) {
      await finish(run, writer, errorTerminal(run, llm.code, "llm", errorText(run, llm.code), llm.code === "llm_unavailable"));
      return;
    }
    tool = llm.args;
  }

  let register: ReplyRegister = run.chip;
  try {
    register = await deps.registerFor(run.transcript, tool.reply_language);
  } catch {
    register = run.chip;
  }
  const outcome = await resolveWith(run, tool, run.transcript, register, parsed.context);
  await finish(run, writer, await terminalFor(run, outcome, tool.intent, register));
}

function audioFacts(run: Run): JsonObject {
  const input = run.parsed.input;
  if (input.kind !== "audio") return {};
  return { audio: { type: input.mime, ms: run.parsed.duration_ms, bytes: input.audio.size } };
}

function heardEvent(run: Run): VoiceStreamEvent {
  return {
    type: "heard",
    voice_turn_id: run.voice_turn_id,
    transcript: run.transcript,
    language_code: run.language_code,
    chip: run.chip,
    input_mode: run.input_mode,
    voice: run.flags.voice,
  };
}

/** Check 6: a repeated client_turn_id replays the stored events and calls nothing. */
function replayResponse(turn: StoredTurn, flags: RequestFlags): Response {
  return ndjsonResponse(
    async (writer) => {
      const events = turn.events as unknown as Record<string, unknown>[];
      if (events.length === 0 || !events.some((event) => event.type !== "heard")) {
        writer.write({
          type: "error",
          voice_turn_id: turn.voice_turn_id,
          code: "internal_error",
          stage: "server",
          message: "That request didn't finish. Nothing was saved. Try again or type.",
          retryable: true,
        });
      } else {
        for (const event of events) writer.write(event.type === "heard" ? { ...event, voice: flags.voice } : event);
      }
      writer.write({ type: "done", voice_turn_id: turn.voice_turn_id, timings_ms: { ...turn.timings_ms, replayed: 1 }, voice: flags.voice });
    },
    () => {},
  );
}

// ---------------------------------------------------------------------------
// The route
// ---------------------------------------------------------------------------

export async function handleTurn(request: Request, overrides: Partial<TurnDeps> = {}): Promise<Response> {
  const deps = resolveDeps(overrides);
  const route_started_ms = deps.now();
  const timings: Record<string, number> = {};

  // The body is read while the session is checked.
  const formPromise: Promise<FormData | null> = request.formData().then(
    (form) => form,
    () => null,
  );

  // 1. A signed-in session.
  const session = await readSession(deps.readSession);
  if (!session) return voiceErrorResponse("unauthenticated", ERROR_MESSAGES.unauthenticated, VOICE_OFF_BLOCK);

  const form = await formPromise;
  const weddingRaw = str(form, "wedding_id");
  const wedding_id = weddingRaw && weddingRaw.length > 0 ? weddingRaw : null;

  // 2. An owner or manager of the wedding (setup: any signed-in user).
  const speaker = await membershipFor(session, wedding_id, deps.readMember);
  if (!speaker.ok) return voiceErrorResponse("forbidden", ERROR_MESSAGES.not_member, VOICE_OFF_BLOCK);
  const actor = speaker.actor;

  // 3. voice_pilot, from one evaluation for this request (flagsmith 3.1, AT-1.7).
  const uiRaw = str(form, "ui_language");
  const ui_language: AppLanguage = uiRaw === "hi" || uiRaw === "en" ? uiRaw : actor.preferred_language;
  const flagsStarted = deps.now();
  const flags = await flagsForRequest(deps, actor, { wedding_id, ui_language });
  timings.flags = deps.now() - flagsStarted;
  if (!flags.voice_pilot) return voiceErrorResponse("voice_unavailable", ERROR_MESSAGES.voice_unavailable, flags.voice);

  // 4. The rate limit (V10).
  const rate = deps.rateLimiter.check(actor.user_id, deps.now());
  if (!rate.ok) {
    return voiceErrorResponse("rate_limited", ERROR_MESSAGES.rate_limited, flags.voice, {
      headers: { "Retry-After": String(rate.retry_after_s) },
    });
  }

  // 5. The body.
  const fixtureMode = deps.fixtureMode();
  const validated = await validateTurn(form, deps, actor, wedding_id, fixtureMode);
  if (!validated.ok) {
    const message = validated.error.field === "fixture_id" && validated.error.message === "required" ? "required" : validated.error.message;
    return voiceErrorResponse("validation_failed", message, flags.voice, { field: validated.error.field });
  }
  const parsed = validated.parsed;

  // 6. A repeated client_turn_id replays the stored turn.
  const existing = await deps.store.byClientTurnId(actor.user_id, parsed.client_turn_id).catch(() => null);
  if (existing) return replayResponse(existing, flags);

  deps.rateLimiter.record(actor.user_id, deps.now());

  const abort = new AbortController();
  const onRequestAbort = () => abort.abort();
  if (request.signal.aborted) abort.abort();
  else request.signal.addEventListener("abort", onRequestAbort, { once: true });

  const voice_turn_id = deps.newId();
  const snapshotStarted = deps.now();
  const snapshot = deps
    .buildSnapshot({ actor, wedding_id, context: parsed.context, attached_asset_id: parsed.attached_asset_id })
    .finally(() => {
      timings.snapshot = deps.now() - snapshotStarted;
    });
  snapshot.catch(() => {});

  const run: Run = {
    deps,
    actor,
    flags,
    parsed,
    fixtureMode,
    route_started_ms,
    voice_turn_id,
    abort,
    timings,
    trace: {
      input_mode: parsed.input.kind,
      fixture: fixtureMode,
      fixture_id: parsed.fixture?.row_id ?? null,
      stt: null,
      llm: null,
      error_code: null,
    },
    transcript: "",
    language_code: null,
    chip: "en",
    input_mode: parsed.input.kind === "text" ? "typed" : parsed.input.kind === "option" ? "tap" : "speech",
    heard: null,
    snapshot,
  };

  return ndjsonResponse(
    async (writer) => {
      try {
        await runTurn(run, writer);
      } catch (error) {
        // The error's own words only (code, not user data), for the server log.
        deps.log(`voice turn failed: ${error instanceof Error ? `${error.name}: ${error.message}`.slice(0, 200) : "unknown error"}`);
        if (!writer.closed && !abort.signal.aborted) {
          await finish(run, writer, errorTerminal(run, "internal_error", "server", errorText(run, "internal_error"), true));
        } else {
          await storeCancelled(run);
        }
      } finally {
        request.signal.removeEventListener("abort", onRequestAbort);
      }
    },
    () => abort.abort(),
  );
}
