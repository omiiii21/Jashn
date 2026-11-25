/**
 * The dock's network layer (voice.md 1.4, 1.5, 1.13): the multipart turn request, the NDJSON
 * reader for its stream, and the JSON confirm and cancel calls. Every body parse handles
 * `VoiceErrorBody`, so the dock can take the voice block from an error too (1.15).
 * DOM-free apart from fetch, FormData and TextDecoder, which node has too.
 */
import type {
  VoiceCancelRequest,
  VoiceCancelResponse,
  VoiceConfirmErrorBody,
  VoiceConfirmRequest,
  VoiceConfirmResponse,
  VoiceErrorBody,
  VoiceStreamEvent,
} from "@/contracts/api";
import type { AppLanguage } from "@/contracts/domain";
import type { VoiceDockFlags } from "@/contracts/flags";
import { routes } from "@/contracts/routes";

// ---------------------------------------------------------------------------
// NDJSON (1.5)
// ---------------------------------------------------------------------------

const EVENT_TYPES = new Set(["heard", "preview", "answer", "clarify", "refused", "saved", "cancelled", "error", "done"]);

export function isVoiceStreamEvent(value: unknown): value is VoiceStreamEvent {
  if (typeof value !== "object" || value === null) return false;
  const v = value as { type?: unknown; voice_turn_id?: unknown };
  return typeof v.type === "string" && EVENT_TYPES.has(v.type) && typeof v.voice_turn_id === "string";
}

export type NdjsonParser = {
  /** Feeds a decoded chunk; complete lines become events. */
  push(chunk: string): void;
  /** Flushes the last line (a stream may end without a trailing newline). */
  end(): void;
};

/**
 * A line splitter for `application/x-ndjson`. Blank lines are skipped; a line that isn't JSON
 * or isn't a voice event goes to `onBadLine` and never stops the stream.
 */
export function createNdjsonParser(onEvent: (event: VoiceStreamEvent) => void, onBadLine?: (line: string) => void): NdjsonParser {
  let buffer = "";
  const handle = (raw: string) => {
    const line = raw.trim();
    if (line.length === 0) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      onBadLine?.(line);
      return;
    }
    if (isVoiceStreamEvent(parsed)) onEvent(parsed);
    else onBadLine?.(line);
  };
  return {
    push(chunk: string) {
      buffer += chunk;
      let at = buffer.indexOf("\n");
      while (at !== -1) {
        handle(buffer.slice(0, at));
        buffer = buffer.slice(at + 1);
        at = buffer.indexOf("\n");
      }
    },
    end() {
      const rest = buffer;
      buffer = "";
      handle(rest);
    },
  };
}

/** Reads a turn response body to its end, calling `onEvent` per line as it arrives. */
export async function readTurnStream(body: ReadableStream<Uint8Array>, onEvent: (event: VoiceStreamEvent) => void): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const parser = createNdjsonParser(onEvent);
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) parser.push(decoder.decode(value, { stream: true }));
    }
    parser.push(decoder.decode());
    parser.end();
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // The reader may already be released after an abort.
    }
  }
}

// ---------------------------------------------------------------------------
// Error bodies
// ---------------------------------------------------------------------------

export function isVoiceDockFlags(value: unknown): value is VoiceDockFlags {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.voice_available === "boolean" && typeof v.writes_enabled === "boolean";
}

/** True for `{ok: false, error: {code, message}, voice?}` (the voice block may be absent on a proxy error). */
export function isVoiceErrorBody(value: unknown): value is VoiceErrorBody {
  if (typeof value !== "object" || value === null) return false;
  const v = value as { ok?: unknown; error?: unknown };
  if (v.ok !== false || typeof v.error !== "object" || v.error === null) return false;
  const e = v.error as { code?: unknown; message?: unknown };
  return typeof e.code === "string" && typeof e.message === "string";
}

/** The voice block of any voice JSON body, or null. */
export function voiceBlockOf(value: unknown): VoiceDockFlags | null {
  if (typeof value !== "object" || value === null) return null;
  const voice = (value as { voice?: unknown }).voice;
  return isVoiceDockFlags(voice) ? voice : null;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// The turn request (1.4)
// ---------------------------------------------------------------------------

export type TurnInput =
  | { kind: "audio"; blob: Blob; file_name: string; upload_type: string; duration_ms: number }
  | { kind: "text"; text: string }
  | { kind: "option"; value: string };

export type TurnFields = {
  input: TurnInput;
  wedding_id: string | null;
  client_turn_id: string;
  ui_language: AppLanguage;
  speech_language: "hi-IN" | "en-IN";
  context_turn_id: string | null;
  page: string | null;
  setup_opened_at: string | null;
  fixture_id: string | null;
  attached_asset_id?: string | null;
};

/** The multipart body of `POST /api/voice/turn`, with 1.4's field names. */
export function buildTurnForm(fields: TurnFields): FormData {
  const form = new FormData();
  const { input } = fields;
  if (input.kind === "audio") {
    // Re-wrap so the part type is the base type, never `;codecs=` (1.3).
    const part = input.blob.type === input.upload_type ? input.blob : new Blob([input.blob], { type: input.upload_type });
    form.append("audio", part, input.file_name);
    form.append("duration_ms", String(Math.round(input.duration_ms)));
  } else if (input.kind === "text") {
    form.append("text", input.text);
  } else {
    form.append("option", input.value);
  }
  form.append("wedding_id", fields.wedding_id ?? "");
  form.append("client_turn_id", fields.client_turn_id);
  form.append("ui_language", fields.ui_language);
  form.append("speech_language", fields.speech_language);
  if (fields.context_turn_id) form.append("context_turn_id", fields.context_turn_id);
  if (fields.page) form.append("page", fields.page);
  if (fields.setup_opened_at) form.append("setup_opened_at", fields.setup_opened_at);
  if (fields.fixture_id) form.append("fixture_id", fields.fixture_id);
  if (fields.attached_asset_id) form.append("attached_asset_id", fields.attached_asset_id);
  return form;
}

export type TurnResult =
  /** The stream ran to its end (or was cut; `complete` says whether `done` arrived). */
  | { kind: "stream"; complete: boolean }
  /** A check failed before the stream (401, 403, 422, 429). */
  | { kind: "error"; status: number; body: VoiceErrorBody | null }
  /** No response at all: offline, DNS, a reset connection. */
  | { kind: "network" }
  | { kind: "aborted" };

/** Sends one turn and streams its events into `onEvent`. Never throws. */
export async function sendTurn(form: FormData, onEvent: (event: VoiceStreamEvent) => void, signal: AbortSignal): Promise<TurnResult> {
  let response: Response;
  try {
    response = await fetch(routes.api.voiceTurn(), { method: "POST", body: form, signal, credentials: "same-origin" });
  } catch {
    return signal.aborted ? { kind: "aborted" } : { kind: "network" };
  }
  const type = response.headers.get("content-type") ?? "";
  if (!response.ok || !type.includes("ndjson") || !response.body) {
    const body = await readJson(response);
    return { kind: "error", status: response.status, body: isVoiceErrorBody(body) ? body : null };
  }
  let complete = false;
  try {
    await readTurnStream(response.body, (event) => {
      if (event.type === "done") complete = true;
      onEvent(event);
    });
  } catch {
    if (signal.aborted) return { kind: "aborted" };
  }
  return { kind: "stream", complete };
}

// ---------------------------------------------------------------------------
// Confirm and cancel (1.13)
// ---------------------------------------------------------------------------

export type ConfirmResult =
  | { kind: "ok"; status: number; body: VoiceConfirmResponse }
  | { kind: "error"; status: number; body: VoiceConfirmErrorBody | null }
  | { kind: "network" };

export async function postConfirm(request: VoiceConfirmRequest): Promise<ConfirmResult> {
  let response: Response;
  try {
    response = await fetch(routes.api.voiceConfirm(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
      credentials: "same-origin",
    });
  } catch {
    return { kind: "network" };
  }
  const body = await readJson(response);
  if (response.ok && typeof body === "object" && body !== null && (body as { ok?: unknown }).ok === true) {
    return { kind: "ok", status: response.status, body: body as VoiceConfirmResponse };
  }
  return { kind: "error", status: response.status, body: isVoiceErrorBody(body) ? (body as VoiceConfirmErrorBody) : null };
}

export type CancelResult =
  | { kind: "ok"; body: VoiceCancelResponse }
  | { kind: "error"; status: number; body: VoiceErrorBody | null }
  | { kind: "network" };

export async function postCancel(request: VoiceCancelRequest): Promise<CancelResult> {
  let response: Response;
  try {
    response = await fetch(routes.api.voiceCancel(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
      credentials: "same-origin",
      keepalive: true,
    });
  } catch {
    return { kind: "network" };
  }
  const body = await readJson(response);
  if (response.ok && typeof body === "object" && body !== null && (body as { ok?: unknown }).ok === true) {
    return { kind: "ok", body: body as VoiceCancelResponse };
  }
  return { kind: "error", status: response.status, body: isVoiceErrorBody(body) ? body : null };
}
