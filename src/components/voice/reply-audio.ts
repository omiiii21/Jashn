/**
 * Spoken replies in the browser (voice.md 1.14). One <audio> element for the whole session;
 * the release, Stop, Send and Save handlers call `unlockReplyAudio()` synchronously, before any
 * await, so iOS lets the same element play the reply later. The browser never sends text to
 * speak: it fetches the stored parts by number.
 */
import { routes } from "@/contracts/routes";

/** A 0.1 s silent 8 kHz mono 8-bit WAV, built once. */
export function silentClipDataUri(): string {
  const samples = 800;
  const bytes = new Uint8Array(44 + samples);
  const view = new DataView(bytes.buffer);
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) bytes[offset + i] = text.charCodeAt(i);
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + samples, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, 8000, true);
  view.setUint32(28, 8000, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  ascii(36, "data");
  view.setUint32(40, samples, true);
  bytes.fill(128, 44);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
  return `data:audio/wav;base64,${btoa(binary)}`;
}

let element: HTMLAudioElement | null = null;
let silent: string | null = null;

function sessionAudio(): HTMLAudioElement | null {
  if (typeof window === "undefined" || typeof Audio === "undefined") return null;
  if (!element) {
    element = new Audio();
    element.preload = "auto";
    element.setAttribute("playsinline", "");
  }
  return element;
}

/**
 * Plays the silent clip on the session element. Call it synchronously inside the gesture
 * handler, before any await: WebKit drops the gesture after an await.
 */
export function unlockReplyAudio(): void {
  const audio = sessionAudio();
  if (!audio) return;
  if (!audio.paused && audio.src && !audio.src.startsWith("data:")) return; // a reply is playing
  try {
    silent ??= silentClipDataUri();
    audio.src = silent;
    const played = audio.play();
    if (played) played.catch(() => undefined);
  } catch {
    // Unlocking is best effort; a later NotAllowedError shows "Play reply".
  }
}

export type ReplyAudioState = "loading" | "playing" | "blocked" | "unavailable" | "ended" | "stopped" | "silent";

export type ReplyPlayback = {
  /** Stops the audio now. */
  stop(): void;
  /** Plays again after a NotAllowedError, from a tap on "Play reply". */
  resume(): void;
};

type Part = { status: "ok"; url: string } | { status: "none" } | { status: "failed" };

async function fetchPart(voice_turn_id: string, part: number, signal: AbortSignal): Promise<Part> {
  try {
    const response = await fetch(routes.api.voiceReplyAudio(voice_turn_id, part), { signal, credentials: "same-origin" });
    // 204: spoken replies are off for this user, text only (flagsmith 3.3).
    if (response.status === 204) return { status: "none" };
    const type = response.headers.get("content-type") ?? "";
    if (!response.ok || !type.startsWith("audio/")) return { status: "failed" };
    const blob = await response.blob();
    if (blob.size === 0) return { status: "failed" };
    return { status: "ok", url: URL.createObjectURL(blob) };
  } catch {
    return { status: "failed" };
  }
}

let current: { stop: () => void } | null = null;

/** Stops whatever reply is playing (pressing the mic stops the reply, 1.2). */
export function stopReplyAudio(): void {
  current?.stop();
  current = null;
}

/**
 * Fetches and plays parts 1..n of a turn's reply on the session element, fetching part n+1
 * while part n plays. Reports each state change; never throws.
 */
export function playReply(input: { voice_turn_id: string; parts: number; onState: (state: ReplyAudioState) => void }): ReplyPlayback {
  stopReplyAudio();
  const audio = sessionAudio();
  const controller = new AbortController();
  const urls: string[] = [];
  let stopped = false;
  let pendingPlay: ((outcome: Promise<"ok" | "blocked" | "failed">) => void) | null = null;

  const cleanup = () => {
    for (const url of urls) URL.revokeObjectURL(url);
    urls.length = 0;
  };

  const stop = () => {
    if (stopped) return;
    stopped = true;
    controller.abort();
    if (audio) {
      audio.pause();
      audio.onended = null;
      audio.onerror = null;
    }
    cleanup();
    input.onState("stopped");
  };
  current = { stop };

  if (!audio || input.parts < 1) {
    input.onState("silent");
    return { stop, resume: () => undefined };
  }

  const playCurrent = (): Promise<"ok" | "blocked" | "failed"> =>
    new Promise((resolve) => {
      let started: Promise<void> | undefined;
      try {
        started = audio.play();
      } catch {
        resolve("failed");
        return;
      }
      if (!started) {
        resolve("ok");
        return;
      }
      started.then(
        () => resolve("ok"),
        (error: unknown) => {
          const name = typeof error === "object" && error !== null && "name" in error ? String((error as { name: unknown }).name) : "";
          resolve(name === "NotAllowedError" ? "blocked" : "failed");
        },
      );
    });

  const waitEnd = () =>
    new Promise<boolean>((resolve) => {
      audio.onended = () => resolve(true);
      audio.onerror = () => resolve(false);
    });

  const run = async () => {
    input.onState("loading");
    let next: Promise<Part> = fetchPart(input.voice_turn_id, 1, controller.signal);
    for (let part = 1; part <= input.parts; part += 1) {
      const got = await next;
      if (stopped) return;
      if (got.status === "none") {
        input.onState("silent");
        return;
      }
      if (got.status === "failed") {
        input.onState(part === 1 ? "unavailable" : "ended");
        return;
      }
      urls.push(got.url);
      // Fetch the next part while this one plays.
      if (part < input.parts) next = fetchPart(input.voice_turn_id, part + 1, controller.signal);
      const ended = waitEnd();
      audio.src = got.url;
      let outcome = await playCurrent();
      if (stopped) return;
      if (outcome === "blocked") {
        input.onState("blocked");
        // Wait for a tap on "Play reply", which calls play() inside its own gesture.
        outcome = await new Promise<"ok" | "blocked" | "failed">((resolve) => {
          pendingPlay = (played) => void played.then(resolve);
        });
        if (stopped) return;
      }
      if (outcome === "failed") {
        input.onState("unavailable");
        return;
      }
      input.onState("playing");
      const ok = await ended;
      if (stopped) return;
      if (!ok) {
        input.onState("unavailable");
        return;
      }
    }
    cleanup();
    if (current?.stop === stop) current = null;
    input.onState("ended");
  };

  void run();

  return {
    stop,
    resume: () => {
      const go = pendingPlay;
      pendingPlay = null;
      // play() runs synchronously here, inside the tap's gesture.
      go?.(playCurrent());
    },
  };
}
