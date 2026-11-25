import "server-only";

import type { VoiceErrorBody, VoiceReply } from "@/contracts/api";
import { COMMAND_ERROR_HTTP_STATUS, type CommandErrorBody, type CommandErrorCode } from "@/contracts/commands";
import type { VoiceDockFlags } from "@/contracts/flags";

import type { VoiceDeps } from "./deps";
import type { ReplySpeech, ReplyText } from "./types";

/**
 * Response helpers for the voice routes (voice.md 1.5, 1.15): every JSON body carries the
 * voice block and `Cache-Control: no-store`; the turn route streams NDJSON.
 */

export const NDJSON_CONTENT_TYPE = "application/x-ndjson; charset=utf-8";
export const NO_STORE = { "Cache-Control": "no-store" } as const;

/** The voice block for a caller with no usable evaluation (signed out, or not a member). */
export const VOICE_OFF_BLOCK: VoiceDockFlags = {
  voice_available: false,
  writes_enabled: false,
  spoken_replies: false,
  chip: null,
  fallback: false,
};

export function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { ...NO_STORE, ...headers } });
}

/** A check failure before the stream starts: the domain error envelope plus the voice block. */
export function voiceErrorResponse(
  code: CommandErrorCode,
  message: string,
  voice: VoiceDockFlags,
  extra: Partial<Omit<CommandErrorBody, "code" | "message">> & { status?: number; headers?: Record<string, string> } = {},
): Response {
  const { status, headers, ...rest } = extra;
  const error: CommandErrorBody = { code, message, ...rest };
  const body: VoiceErrorBody = { ok: false, error, voice };
  return jsonResponse(body, status ?? COMMAND_ERROR_HTTP_STATUS[code], headers ?? {});
}

export const ERROR_MESSAGES = {
  unauthenticated: "Sign in to use voice.",
  forbidden: "This request belongs to someone else.",
  not_member: "You are not an owner or manager of this wedding.",
  voice_unavailable: "Voice is switched off right now. You can type or edit directly.",
  rate_limited: "Too many requests in a row. Wait a moment, or type.",
  closed: "This request is closed.",
  expired: "This request expired. Say it again.",
  paused: "Voice changes are paused. You can type it instead.",
} as const;

/** A reply object as it leaves the server (1.5): never the speech text itself. */
export function toVoiceReply(reply: ReplyText, speech: ReplySpeech | null): VoiceReply {
  const parts = speech?.parts.length ?? 0;
  return { display_text: reply.display_text, language: reply.language, speak: parts > 0, parts };
}

/** The speech parts for a reply, only when `spoken_replies` is on and the reply is spoken (1.14). */
export async function speechIfOn(
  deps: Pick<VoiceDeps, "speechFor">,
  spoken_replies: boolean,
  reply: ReplyText,
): Promise<ReplySpeech | null> {
  if (!spoken_replies || reply.speech_text === null || reply.speech_text.trim() === "") return null;
  try {
    const speech = await deps.speechFor(reply);
    return speech && speech.parts.length > 0 ? speech : null;
  } catch {
    return null;
  }
}

/** One NDJSON line. */
export function ndjsonLine(event: unknown): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(event)}\n`);
}

export type NdjsonWriter = {
  write(event: unknown): void;
  close(): void;
  /** True once the reader went away (the browser disconnected) or the stream was closed. */
  readonly closed: boolean;
};

/**
 * A streamed NDJSON response. `run` gets a writer and runs to completion; the stream closes
 * when it returns. `on_cancel` fires when the reader goes away before then.
 */
export function ndjsonResponse(run: (writer: NdjsonWriter) => Promise<void>, on_cancel: () => void): Response {
  let closed = false;
  let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null;
  const writer: NdjsonWriter = {
    write(event) {
      if (closed || !controllerRef) return;
      try {
        controllerRef.enqueue(ndjsonLine(event));
      } catch {
        closed = true;
      }
    },
    close() {
      if (closed || !controllerRef) return;
      closed = true;
      try {
        controllerRef.close();
      } catch {
        // already closed
      }
    },
    get closed() {
      return closed;
    },
  };
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controllerRef = controller;
      void run(writer).finally(() => writer.close());
    },
    cancel() {
      closed = true;
      on_cancel();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { ...NO_STORE, "Content-Type": NDJSON_CONTENT_TYPE, "X-Accel-Buffering": "no" },
  });
}

/** Reads a whole NDJSON body into events (tests and scripts). */
export async function readNdjson(response: Response): Promise<Record<string, unknown>[]> {
  const text = await response.text();
  return text
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}
