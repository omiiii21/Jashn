/**
 * The dock's recorder (voice.md 1.2 and 1.3). Pure helpers at the top (tested in node), the
 * browser parts below them. Nothing here runs at import time, so the module is safe to import
 * from a test. The mic opens on press and every track is stopped after each clip (AT-2.13).
 */

// ---------------------------------------------------------------------------
// Limits and gestures (1.2)
// ---------------------------------------------------------------------------

/** A press shorter than this is a tap, which locks the recording. */
export const TAP_MS = 300;
/** Drag distance that cancels (left) or locks (up) while holding. */
export const DRAG_PX = 40;
/** The timer turns amber here. */
export const AMBER_MS = 20_000;
/** The recorder stops by itself here and sends what it has. */
export const AUTO_STOP_MS = 25_000;
/** With no Permissions API answer, a stream slower than this means the browser asked. */
export const PERMISSION_SLOW_MS = 800;

export type DragGesture = "cancel" | "lock" | null;

/** What a drag while holding means: 40 px left cancels, 40 px up locks. Left wins a tie. */
export function gestureFromDrag(dx: number, dy: number): DragGesture {
  if (dx <= -DRAG_PX) return "cancel";
  if (dy <= -DRAG_PX) return "lock";
  return null;
}

export type ReleaseDecision = "lock" | "send";

/**
 * What a release does (1.2): a press under 300 ms is a tap and locks; a recording that hasn't
 * started yet, or has run under 300 ms, locks too, so every sent clip is at least 300 ms.
 */
export function decideRelease(input: { press_ms: number; recorded_ms: number | null }): ReleaseDecision {
  if (input.press_ms < TAP_MS) return "lock";
  if (input.recorded_ms === null || input.recorded_ms < TAP_MS) return "lock";
  return "send";
}

/** "0:06" from milliseconds. */
export function formatTimer(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Recorder type order (1.3)
// ---------------------------------------------------------------------------

export type RecorderChoice = {
  /** The type handed to MediaRecorder. */
  recorder_type: string;
  /** The multipart part type: the base type without `;codecs=`. */
  upload_type: string;
  file_name: string;
};

export const RECORDER_TYPE_ORDER = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"] as const;

/** `audio/webm;codecs=opus` → `audio/webm`. */
export function baseMimeType(mime: string): string {
  return mime.split(";")[0]!.trim().toLowerCase();
}

/** The upload file name for a base type (1.3). */
export function clipFileName(upload_type: string): string {
  switch (baseMimeType(upload_type)) {
    case "audio/mp4":
      return "clip.m4a";
    case "audio/ogg":
      return "clip.ogg";
    case "audio/wav":
      return "clip.wav";
    default:
      return "clip.webm";
  }
}

/** The first supported type in 1.3's order, or null (row 5: the mic is disabled). */
export function pickRecorderType(isTypeSupported: ((type: string) => boolean) | null | undefined): RecorderChoice | null {
  if (!isTypeSupported) return null;
  for (const type of RECORDER_TYPE_ORDER) {
    let ok = false;
    try {
      ok = isTypeSupported(type);
    } catch {
      ok = false;
    }
    if (ok) {
      const upload_type = baseMimeType(type);
      return { recorder_type: type, upload_type, file_name: clipFileName(upload_type) };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Mic errors (voice.md 6.1 rows 1 to 3)
// ---------------------------------------------------------------------------

export type MicProblem = "denied" | "unavailable" | "unsupported" | "other";

/** Maps a getUserMedia or MediaRecorder error to 6.1's rows. */
export function classifyMicError(error: unknown): MicProblem {
  const name = typeof error === "object" && error !== null && "name" in error ? String((error as { name: unknown }).name) : "";
  if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError") return "denied";
  if (name === "NotFoundError" || name === "NotReadableError" || name === "OverconstrainedError" || name === "DevicesNotFoundError") {
    return "unavailable";
  }
  if (name === "NotSupportedError" || name === "TypeError") return "unsupported";
  return "other";
}

// ---------------------------------------------------------------------------
// Browser parts
// ---------------------------------------------------------------------------

/** True when this page can record at all: a secure context, getUserMedia and a recorder type. */
export function browserRecorderChoice(): RecorderChoice | null {
  if (typeof window === "undefined") return null;
  if (!window.isSecureContext) return null;
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return null;
  if (typeof MediaRecorder === "undefined") return null;
  return pickRecorderType((type) => MediaRecorder.isTypeSupported(type));
}

export type MicPermission = "granted" | "prompt" | "denied" | "unknown";

/** The Permissions API's answer for the mic, or "unknown" when the browser has none (Safari before 16). */
export async function queryMicPermission(): Promise<MicPermission> {
  try {
    if (typeof navigator === "undefined" || !navigator.permissions?.query) return "unknown";
    const status = await navigator.permissions.query({ name: "microphone" as PermissionName });
    if (status.state === "granted" || status.state === "prompt" || status.state === "denied") return status.state;
    return "unknown";
  } catch {
    return "unknown";
  }
}

/** Opens the mic: mono, echo cancellation, noise suppression and automatic gain on (1.2). */
export function openMic(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });
}

/** Stops every track so the browser's recording indicator goes off. */
export function stopStream(stream: MediaStream | null | undefined): void {
  if (!stream) return;
  for (const track of stream.getTracks()) {
    try {
      track.stop();
    } catch {
      // A track that already ended is fine.
    }
  }
}

type AudioContextCtor = typeof AudioContext;

/**
 * Makes an AudioContext inside the press gesture (iOS starts it only from a gesture), or null.
 * The level meter is display only, never a speech detector.
 */
export function createLevelContext(): AudioContext | null {
  try {
    const Ctor: AudioContextCtor | undefined =
      typeof window === "undefined"
        ? undefined
        : (window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext);
    if (!Ctor) return null;
    const ctx = new Ctor();
    void ctx.resume().catch(() => undefined);
    return ctx;
  } catch {
    return null;
  }
}

export type FinishedClip = { blob: Blob; duration_ms: number; choice: RecorderChoice };

export type ActiveRecording = {
  choice: RecorderChoice;
  /** performance.now() when the recorder fired `start`, or null before it. */
  startedAt(): number | null;
  /** The smoothed mic level, 0 to 1. */
  level(): number;
  /** Stops the recorder, collects the single final blob and closes the mic. */
  stop(): Promise<FinishedClip>;
  /** Stops and drops everything; nothing is sent. */
  cancel(): void;
};

/**
 * Starts the recorder with no timeslice (1.3), so the final `dataavailable` carries one blob.
 * The stream is stopped on stop, cancel or error, and the level context is closed.
 */
export function startRecording(input: {
  stream: MediaStream;
  choice: RecorderChoice;
  levelContext: AudioContext | null;
  onStart: () => void;
  onError: (error: unknown) => void;
}): ActiveRecording {
  const { stream, choice, levelContext } = input;
  const chunks: Blob[] = [];
  let started: number | null = null;
  let stopped: number | null = null;
  let closed = false;
  let smoothed = 0;
  let analyser: AnalyserNode | null = null;
  let samples: Uint8Array<ArrayBuffer> | null = null;

  if (levelContext) {
    try {
      const source = levelContext.createMediaStreamSource(stream);
      analyser = levelContext.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      samples = new Uint8Array(new ArrayBuffer(analyser.fftSize));
    } catch {
      analyser = null;
    }
  }

  const close = () => {
    if (closed) return;
    closed = true;
    stopStream(stream);
    if (levelContext) void levelContext.close().catch(() => undefined);
  };

  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, { mimeType: choice.recorder_type });
  } catch (error) {
    close();
    queueMicrotask(() => input.onError(error));
    return {
      choice,
      startedAt: () => null,
      level: () => 0,
      stop: () => Promise.reject(error),
      cancel: () => undefined,
    };
  }

  let resolveStop: ((clip: FinishedClip) => void) | null = null;
  let rejectStop: ((error: unknown) => void) | null = null;
  let cancelled = false;

  recorder.ondataavailable = (event: BlobEvent) => {
    if (event.data && event.data.size > 0) chunks.push(event.data);
  };
  recorder.onstart = () => {
    started = performance.now();
    input.onStart();
  };
  recorder.onerror = (event: Event) => {
    close();
    const error = (event as unknown as { error?: unknown }).error ?? event;
    if (rejectStop) rejectStop(error);
    else input.onError(error);
  };
  recorder.onstop = () => {
    close();
    if (cancelled) return;
    const end = stopped ?? performance.now();
    const duration_ms = started === null ? 0 : Math.max(0, Math.round(end - started));
    // The part type is the base type only (1.3): a `;codecs=` part type gives 400 at Saaras.
    const blob = new Blob(chunks, { type: choice.upload_type });
    resolveStop?.({ blob, duration_ms, choice });
  };

  try {
    recorder.start();
  } catch (error) {
    close();
    queueMicrotask(() => input.onError(error));
  }

  return {
    choice,
    startedAt: () => started,
    level: () => {
      if (!analyser || !samples) return 0;
      analyser.getByteTimeDomainData(samples);
      let peak = 0;
      for (let i = 0; i < samples.length; i += 1) {
        const v = Math.abs(samples[i]! - 128) / 128;
        if (v > peak) peak = v;
      }
      // About 80 ms of smoothing at 60 frames a second.
      smoothed = smoothed * 0.8 + Math.min(1, peak * 1.6) * 0.2;
      return smoothed;
    },
    stop: () =>
      new Promise<FinishedClip>((resolve, reject) => {
        resolveStop = resolve;
        rejectStop = reject;
        stopped = performance.now();
        if (recorder.state === "inactive") {
          close();
          resolve({ blob: new Blob(chunks, { type: choice.upload_type }), duration_ms: 0, choice });
          return;
        }
        try {
          recorder.stop();
        } catch (error) {
          close();
          reject(error);
        }
      }),
    cancel: () => {
      cancelled = true;
      try {
        if (recorder.state !== "inactive") recorder.stop();
      } catch {
        // Already stopped.
      }
      close();
      chunks.length = 0;
    },
  };
}
