import "server-only";

import { PROPOSE_ACTIONS_RESPONSE_FORMAT, PROPOSE_ACTIONS_TOOL, parseToolArguments } from "./tool-schema";
import type { ToolArguments } from "./types";

/**
 * The three Sarvam calls (voice.md 1.6, 1.10, 1.14; RS 3). Sarvam is called only from
 * src/server/voice/. Plain fetch for all three: chat needs `reasoning_effort: null`, which
 * the SDK can't type (RS B13); speech uses the documented multipart fields directly so the
 * retry and timeout rules stay in one place.
 *
 * Never log the key, a transcript or a reply. Error messages carry Sarvam's status and
 * error code only.
 */

const SARVAM_BASE = "https://api.sarvam.ai";
const STT_URL = `${SARVAM_BASE}/speech-to-text`;
const CHAT_URL = `${SARVAM_BASE}/v1/chat/completions`;
const TTS_URL = `${SARVAM_BASE}/text-to-speech/stream`;

export const STT_MODEL = "saaras:v4";
export const CHAT_MODEL = "sarvam-105b";
export const TTS_MODEL = "bulbul:v4-flash";

const STT_ATTEMPT_MS = 10_000;
/** STT retries only while the route has run less than this (1.6). */
const STT_RETRY_WINDOW_MS = 15_000;
const CHAT_FIRST_MS = 12_000;
const CHAT_RETRY_MS = 20_000;
/** No new Sarvam attempt starts after this much route time (1.10). */
const ROUTE_SARVAM_WINDOW_MS = 30_000;
/** Below this much time left, an attempt isn't worth starting. */
const MIN_ATTEMPT_MS = 1_000;
const TTS_FIRST_BYTE_MS = 8_000;
const RETRY_AFTER_CAP_MS = 2_000;
const RETRY_DEFAULT_MS = 250;

const KEYTERM_MAX = 50;
const KEYTERM_LENGTH_MAX = 64;

/** Injected in tests; production uses the globals. */
export type SarvamDeps = {
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
};

const defaultDeps: SarvamDeps = {
  fetch: (...args) => fetch(...args),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => Date.now(),
};

function depsWith(overrides?: Partial<SarvamDeps>): SarvamDeps {
  return { ...defaultDeps, ...overrides };
}

function apiKey(): string | null {
  const key = process.env.SARVAM_API_KEY?.trim();
  return key ? key : null;
}

/** True when a Sarvam key is configured (fixture mode turns on without one, 6.4). */
export function sarvamKeyPresent(): boolean {
  return apiKey() !== null;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

type AttemptFailure =
  | { kind: "http"; status: number; code: string | null; message: string; retry_after_ms: number | null }
  | { kind: "network"; message: string }
  | { kind: "timeout"; message: string }
  | { kind: "aborted"; message: string };

/** A signal that aborts on the caller's signal or after `ms`. */
function timeoutSignal(ms: number, outer?: AbortSignal): { signal: AbortSignal; timedOut: () => boolean; clear: () => void } {
  const controller = new AbortController();
  let fired = false;
  const timer = setTimeout(() => {
    fired = true;
    controller.abort(new Error("timeout"));
  }, ms);
  const onOuter = () => controller.abort(outer?.reason ?? new Error("aborted"));
  if (outer) {
    if (outer.aborted) onOuter();
    else outer.addEventListener("abort", onOuter, { once: true });
  }
  return {
    signal: controller.signal,
    timedOut: () => fired,
    clear: () => {
      clearTimeout(timer);
      outer?.removeEventListener("abort", onOuter);
    },
  };
}

function retryAfterMs(headers: Headers): number | null {
  const value = headers.get("retry-after");
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const at = Date.parse(value);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : null;
}

/** Sarvam's error envelope `{error:{message,code,request_id}}`, or `{detail}` (RS 3.0). */
async function readError(response: Response): Promise<{ code: string | null; message: string }> {
  let body = "";
  try {
    body = await response.text();
  } catch {
    // The body is gone; the status is enough.
  }
  try {
    const json = JSON.parse(body) as { error?: { code?: unknown; message?: unknown }; detail?: unknown };
    const code = typeof json.error?.code === "string" ? json.error.code : null;
    const raw = typeof json.error?.message === "string" ? json.error.message : typeof json.detail === "string" ? json.detail : "";
    return { code, message: raw.slice(0, 200) };
  } catch {
    return { code: null, message: body.slice(0, 200) };
  }
}

function isTransient(failure: AttemptFailure): boolean {
  if (failure.kind === "network" || failure.kind === "timeout") return true;
  if (failure.kind !== "http") return false;
  if (failure.status === 429) return failure.code !== "seat_budget_exhausted_error";
  return failure.status === 500 || failure.status === 502 || failure.status === 503;
}

function describe(failure: AttemptFailure): string {
  if (failure.kind === "http") return `HTTP ${failure.status}${failure.code ? ` ${failure.code}` : ""}${failure.message ? `: ${failure.message}` : ""}`;
  return failure.message;
}

function retryDelay(failure: AttemptFailure): number {
  const after = failure.kind === "http" ? failure.retry_after_ms : null;
  return Math.min(after ?? RETRY_DEFAULT_MS, RETRY_AFTER_CAP_MS);
}

function requestIdOf(response: Response, body?: { id?: unknown; request_id?: unknown }): string | null {
  const fromBody = typeof body?.request_id === "string" ? body.request_id : typeof body?.id === "string" ? body.id : null;
  return fromBody ?? response.headers.get("x-request-id") ?? response.headers.get("request-id");
}

// ---------------------------------------------------------------------------
// Speech to text (1.6)
// ---------------------------------------------------------------------------

export type SttResult =
  | { ok: true; transcript: string; language_code: string | null; request_id: string | null; attempts: number; ms: number }
  | {
      ok: false;
      code: "audio_unreadable" | "stt_unavailable" | "no_speech";
      http_status: number | null;
      message: string;
      retryable: boolean;
      attempts: number;
      ms: number;
    };

/** "audio/webm;codecs=opus" → "audio/webm" (1.3: upload the base type only). */
export function baseMime(mime: string): string {
  const base = (mime || "").split(";")[0].trim().toLowerCase();
  return base || "audio/webm";
}

/** The file name voice.md 1.3 gives each base type. */
export function clipFilename(mime: string): string {
  const base = baseMime(mime);
  if (base.includes("mp4") || base.includes("m4a") || base.includes("aac")) return "clip.m4a";
  if (base.includes("ogg")) return "clip.ogg";
  if (base.includes("wav")) return "clip.wav";
  if (base.includes("mpeg") || base.includes("mp3")) return "clip.mp3";
  return "clip.webm";
}

/** At most 50 distinct terms (ignoring case) of at most 64 characters (1.6, RS B3). */
export function cleanKeyterms(terms: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const term of terms) {
    const trimmed = term.replace(/\s+/g, " ").trim();
    if (!trimmed || trimmed.length > KEYTERM_LENGTH_MAX) continue;
    const key = trimmed.toLocaleLowerCase("en-IN");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
    if (out.length >= KEYTERM_MAX) break;
  }
  return out;
}

/** Only punctuation, danda or whitespace: no speech at all. */
function isBlankTranscript(transcript: string): boolean {
  return transcript.replace(/[\s\p{P}\p{S}।॥]/gu, "") === "";
}

const FILLERS = new Set(["hmm", "hm", "umm", "um", "uh", "acha", "accha", "ok", "okay", "हम्म", "अच्छा", "ओके"]);

/** 6.1 row 6: empty, only punctuation, or only fillers. For the route's no-speech check. */
export function isEmptySpeech(transcript: string): boolean {
  if (isBlankTranscript(transcript)) return true;
  const words = transcript
    .normalize("NFC")
    .toLowerCase()
    .replace(/[\p{P}\p{S}।॥]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  return words.length > 0 && words.every((word) => FILLERS.has(word));
}

function sttUnreadable(status: number, message: string): boolean {
  return status === 400 && /failed to read the file|invalid file type/i.test(message);
}

/**
 * Saaras: `saaras:v4`, `codemix`, the language hint, keyterms as one JSON field. 10 s per
 * attempt; one retry on 429 (not seat budget), 500, 502, 503, a network error or a
 * timeout, after Retry-After (up to 2 s), only while the route has run under 15 s.
 */
export async function transcribe(
  input: {
    audio: Blob;
    filename: string;
    mime: string;
    speech_language: "hi-IN" | "en-IN";
    keyterms: string[];
    signal?: AbortSignal;
    route_started_ms: number;
  },
  overrides?: Partial<SarvamDeps>,
): Promise<SttResult> {
  const deps = depsWith(overrides);
  const started = deps.now();
  const elapsed = () => deps.now() - started;
  const key = apiKey();
  if (!key) {
    return { ok: false, code: "stt_unavailable", http_status: null, message: "SARVAM_API_KEY is not set", retryable: true, attempts: 0, ms: 0 };
  }
  if (input.audio.size === 0) {
    return { ok: false, code: "audio_unreadable", http_status: null, message: "empty recording", retryable: true, attempts: 0, ms: 0 };
  }

  const mime = baseMime(input.mime || input.audio.type);
  const filename = input.filename || clipFilename(mime);
  const keyterms = cleanKeyterms(input.keyterms);
  const bytes = await input.audio.arrayBuffer();

  let attempts = 0;
  let last: AttemptFailure | null = null;
  while (attempts < 2) {
    if (attempts > 0) {
      if (!last || !isTransient(last)) break;
      if (deps.now() - input.route_started_ms >= STT_RETRY_WINDOW_MS) break;
      await deps.sleep(retryDelay(last));
      if (input.signal?.aborted) break;
    }
    attempts += 1;
    const form = new FormData();
    form.append("file", new Blob([bytes], { type: mime }), filename);
    form.append("model", STT_MODEL);
    form.append("mode", "codemix");
    form.append("language_code", input.speech_language);
    if (keyterms.length > 0) form.append("keyterms", JSON.stringify(keyterms));

    const timer = timeoutSignal(STT_ATTEMPT_MS, input.signal);
    try {
      const response = await deps.fetch(STT_URL, {
        method: "POST",
        headers: { "api-subscription-key": key },
        body: form,
        signal: timer.signal,
      });
      if (!response.ok) {
        const error = await readError(response);
        last = { kind: "http", status: response.status, code: error.code, message: error.message, retry_after_ms: retryAfterMs(response.headers) };
        if (sttUnreadable(response.status, error.message)) {
          return { ok: false, code: "audio_unreadable", http_status: response.status, message: describe(last), retryable: true, attempts, ms: elapsed() };
        }
        continue;
      }
      const body = (await response.json()) as { request_id?: unknown; transcript?: unknown; language_code?: unknown };
      const transcript = typeof body.transcript === "string" ? body.transcript.trim() : "";
      if (isBlankTranscript(transcript)) {
        return { ok: false, code: "no_speech", http_status: response.status, message: "empty transcript", retryable: false, attempts, ms: elapsed() };
      }
      return {
        ok: true,
        transcript,
        language_code: typeof body.language_code === "string" ? body.language_code : null,
        request_id: requestIdOf(response, body),
        attempts,
        ms: elapsed(),
      };
    } catch (error) {
      if (input.signal?.aborted) last = { kind: "aborted", message: "request aborted" };
      else if (timer.timedOut()) last = { kind: "timeout", message: `speech to text timed out after ${STT_ATTEMPT_MS} ms` };
      else last = { kind: "network", message: `network error: ${error instanceof Error ? error.name : "unknown"}` };
    } finally {
      timer.clear();
    }
  }

  const failure = last ?? { kind: "network" as const, message: "no attempt made" };
  return {
    ok: false,
    code: "stt_unavailable",
    http_status: failure.kind === "http" ? failure.status : null,
    message: describe(failure),
    retryable: failure.kind !== "aborted",
    attempts,
    ms: elapsed(),
  };
}

// ---------------------------------------------------------------------------
// The model call (1.10)
// ---------------------------------------------------------------------------

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type LlmResult =
  | { ok: true; args: ToolArguments; raw_arguments: string; request_ids: string[]; attempts: number; reasoning_tokens: number | null; ms: number }
  | { ok: false; code: "llm_unavailable" | "llm_no_action"; message: string; retryable: boolean; attempts: number; ms: number; request_ids: string[] };

/**
 * `tool` is the forced `propose_actions` call; `json_schema` is RS 3.2's strict
 * response-format variant, for the first call if T4 fails (1.10).
 */
export type ChatVariant = "tool" | "json_schema";

type ChatAttemptOutcome =
  | { kind: "ok"; args: ToolArguments; raw: string; request_id: string | null; reasoning_tokens: number | null }
  | { kind: "no_action"; reason: string; request_id: string | null }
  | { kind: "failure"; failure: AttemptFailure };

function chatBody(messages: ChatMessage[], variant: ChatVariant, retryLow: boolean): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: CHAT_MODEL,
    // v1 turns reasoning off with null; "none" is v2 only (RS verdict 1).
    reasoning_effort: retryLow ? "low" : null,
    temperature: 0.2,
    max_tokens: retryLow ? 3000 : 1200,
    messages,
  };
  if (variant === "tool") {
    body.tools = [PROPOSE_ACTIONS_TOOL];
    body.tool_choice = { type: "function", function: { name: "propose_actions" } };
  } else {
    body.response_format = PROPOSE_ACTIONS_RESPONSE_FORMAT;
  }
  return body;
}

type ChatResponseBody = {
  id?: unknown;
  request_id?: unknown;
  choices?: {
    finish_reason?: unknown;
    message?: {
      content?: unknown;
      tool_calls?: { function?: { name?: unknown; arguments?: unknown } }[];
    };
  }[];
  usage?: { completion_tokens_details?: { reasoning_tokens?: unknown } | null } | null;
};

function readChatResponse(body: ChatResponseBody, variant: ChatVariant, request_id: string | null): ChatAttemptOutcome {
  const choice = body.choices?.[0];
  const reasoning = body.usage?.completion_tokens_details?.reasoning_tokens;
  const reasoning_tokens = typeof reasoning === "number" ? reasoning : null;
  let raw: string | null = null;
  if (variant === "tool") {
    const call = choice?.message?.tool_calls?.[0]?.function;
    if (!call) {
      const finish = typeof choice?.finish_reason === "string" ? choice.finish_reason : "none";
      return { kind: "no_action", reason: finish === "length" ? "finish_reason length" : `no tool call (finish_reason ${finish})`, request_id };
    }
    if (call.name !== "propose_actions") return { kind: "no_action", reason: "wrong tool name", request_id };
    raw = typeof call.arguments === "string" ? call.arguments : call.arguments && typeof call.arguments === "object" ? JSON.stringify(call.arguments) : null;
  } else {
    raw = typeof choice?.message?.content === "string" ? choice.message.content : null;
  }
  if (choice?.finish_reason === "length") return { kind: "no_action", reason: "finish_reason length", request_id };
  if (raw === null) return { kind: "no_action", reason: "no arguments", request_id };
  const parsed = parseToolArguments(raw);
  if (!parsed.ok) return { kind: "no_action", reason: parsed.reason, request_id };
  return { kind: "ok", args: parsed.value, raw, request_id, reasoning_tokens };
}

/**
 * sarvam-105b with one forced tool, reasoning off, at most one retry per turn: a transport
 * failure retries the same request after Retry-After (up to 2 s); a missing or broken tool
 * call retries with `reasoning_effort` "low" and `max_tokens` 3000. 400, 401, 402, 403,
 * 422 and `seat_budget_exhausted_error` are never retried. Timeouts 12 s, then 20 s.
 */
export async function callModel(
  input: { messages: ChatMessage[]; signal?: AbortSignal; route_started_ms: number; variant?: ChatVariant },
  overrides?: Partial<SarvamDeps>,
): Promise<LlmResult> {
  const deps = depsWith(overrides);
  const started = deps.now();
  const elapsed = () => deps.now() - started;
  const request_ids: string[] = [];
  const key = apiKey();
  if (!key) {
    return { ok: false, code: "llm_unavailable", message: "SARVAM_API_KEY is not set", retryable: true, attempts: 0, ms: 0, request_ids };
  }
  const variant = input.variant ?? "tool";

  let attempts = 0;
  let retryLow = false;
  let lastOutcome: ChatAttemptOutcome | null = null;
  while (attempts < 2) {
    if (attempts > 0) {
      if (!lastOutcome) break;
      if (lastOutcome.kind === "failure") {
        if (!isTransient(lastOutcome.failure)) break;
        await deps.sleep(retryDelay(lastOutcome.failure));
      } else {
        retryLow = true;
      }
      if (input.signal?.aborted) break;
    }
    const remaining = ROUTE_SARVAM_WINDOW_MS - (deps.now() - input.route_started_ms);
    if (remaining < MIN_ATTEMPT_MS) {
      if (!lastOutcome) lastOutcome = { kind: "failure", failure: { kind: "timeout", message: "no time left for a model call" } };
      break;
    }
    attempts += 1;
    const limit = Math.min(attempts === 1 ? CHAT_FIRST_MS : CHAT_RETRY_MS, remaining);
    const timer = timeoutSignal(limit, input.signal);
    try {
      const response = await deps.fetch(CHAT_URL, {
        method: "POST",
        headers: { "api-subscription-key": key, "content-type": "application/json" },
        body: JSON.stringify(chatBody(input.messages, variant, retryLow)),
        signal: timer.signal,
      });
      if (!response.ok) {
        const error = await readError(response);
        const id = requestIdOf(response);
        if (id) request_ids.push(id);
        lastOutcome = {
          kind: "failure",
          failure: { kind: "http", status: response.status, code: error.code, message: error.message, retry_after_ms: retryAfterMs(response.headers) },
        };
        continue;
      }
      const body = (await response.json()) as ChatResponseBody;
      const id = requestIdOf(response, body);
      if (id) request_ids.push(id);
      lastOutcome = readChatResponse(body, variant, id);
      if (lastOutcome.kind === "ok") {
        return {
          ok: true,
          args: lastOutcome.args,
          raw_arguments: lastOutcome.raw,
          request_ids,
          attempts,
          reasoning_tokens: lastOutcome.reasoning_tokens,
          ms: elapsed(),
        };
      }
    } catch (error) {
      if (input.signal?.aborted) lastOutcome = { kind: "failure", failure: { kind: "aborted", message: "request aborted" } };
      else if (timer.timedOut()) lastOutcome = { kind: "failure", failure: { kind: "timeout", message: `model call timed out after ${limit} ms` } };
      else lastOutcome = { kind: "failure", failure: { kind: "network", message: `network error: ${error instanceof Error ? error.name : "unknown"}` } };
    } finally {
      timer.clear();
    }
  }

  if (lastOutcome?.kind === "no_action") {
    return { ok: false, code: "llm_no_action", message: lastOutcome.reason, retryable: false, attempts, ms: elapsed(), request_ids };
  }
  const failure = lastOutcome?.kind === "failure" ? lastOutcome.failure : { kind: "network" as const, message: "no attempt made" };
  return {
    ok: false,
    code: "llm_unavailable",
    message: describe(failure),
    retryable: failure.kind !== "aborted",
    attempts,
    ms: elapsed(),
    request_ids,
  };
}

// ---------------------------------------------------------------------------
// Text to speech (1.14)
// ---------------------------------------------------------------------------

/**
 * Bulbul's stream endpoint. `model` and `language_code` are always sent (RS B14, B17). The
 * status and `audio/mpeg` are checked before the body is passed on, because errors come
 * back as JSON (RS B19). First-byte timeout 8 s; no retry (the text is already on screen).
 */
export async function synthesizeStream(
  input: { text: string; language_code: "hi-IN" | "en-IN"; speaker: string; signal?: AbortSignal },
  overrides?: Partial<SarvamDeps>,
): Promise<{ ok: true; body: ReadableStream<Uint8Array> } | { ok: false; status: number; message: string }> {
  const deps = depsWith(overrides);
  const key = apiKey();
  if (!key) return { ok: false, status: 500, message: "SARVAM_API_KEY is not set" };
  if (!input.text.trim()) return { ok: false, status: 400, message: "nothing to speak" };

  // The first-byte timer is cleared once headers arrive, so it never cuts the stream itself.
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new Error("timeout"));
  }, TTS_FIRST_BYTE_MS);
  const onOuter = () => controller.abort(input.signal?.reason ?? new Error("aborted"));
  if (input.signal) {
    if (input.signal.aborted) onOuter();
    else input.signal.addEventListener("abort", onOuter, { once: true });
  }

  let response: Response;
  try {
    response = await deps.fetch(TTS_URL, {
      method: "POST",
      headers: { "api-subscription-key": key, "content-type": "application/json" },
      body: JSON.stringify({
        text: input.text,
        language_code: input.language_code,
        model: TTS_MODEL,
        speaker: input.speaker,
        enable_preprocessing: true,
        output_audio_codec: "mp3",
      }),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timer);
    if (timedOut) return { ok: false, status: 504, message: `no first byte within ${TTS_FIRST_BYTE_MS} ms` };
    return { ok: false, status: 502, message: `network error: ${error instanceof Error ? error.name : "unknown"}` };
  } finally {
    clearTimeout(timer);
  }

  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
  const isAudio = contentType.startsWith("audio/mpeg") || contentType.startsWith("audio/mp3");
  if (!response.ok || !isAudio || !response.body) {
    const error = await readError(response);
    const reason = !response.ok ? `HTTP ${response.status}` : !isAudio ? `content-type ${contentType || "missing"}` : "empty body";
    return {
      ok: false,
      status: response.ok ? 502 : response.status,
      message: `${reason}${error.code ? ` ${error.code}` : ""}${error.message ? `: ${error.message}` : ""}`,
    };
  }
  return { ok: true, body: response.body };
}
