/**
 * Per-device dock settings and browser facts, read through useSyncExternalStore so the server
 * render and hydration agree (the server snapshot is the default). Storage access is wrapped:
 * a private window or blocked storage keeps the default.
 */
import { useSyncExternalStore } from "react";

import { browserRecorderChoice, type RecorderChoice } from "./recorder";

type StorageKind = "local" | "session";

function storageOf(kind: StorageKind): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

function createSetting<T extends string>(kind: StorageKind, key: string, allowed: (value: string) => value is T, fallback: T) {
  const listeners = new Set<() => void>();
  let cached: T | null = null;
  const read = (): T => {
    if (cached !== null) return cached;
    let value: T = fallback;
    try {
      const raw = storageOf(kind)?.getItem(key);
      if (raw !== null && raw !== undefined && allowed(raw)) value = raw;
    } catch {
      value = fallback;
    }
    cached = value;
    return value;
  };
  return {
    get: read,
    set(value: T) {
      cached = value;
      try {
        const store = storageOf(kind);
        if (value === fallback) store?.removeItem(key);
        else store?.setItem(key, value);
      } catch {
        // The in-memory value still applies for this page.
      }
      for (const listener of listeners) listener();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    server: () => fallback,
  };
}

export type SpeechLanguage = "hi-IN" | "en-IN";

/** voice.md 1.4: `hi-IN` by default, `en-IN` for "English only", remembered per device. */
export const speechLanguageSetting = createSetting<SpeechLanguage>(
  "local",
  "jashn.voice.speech_language",
  (v): v is SpeechLanguage => v === "hi-IN" || v === "en-IN",
  "hi-IN",
);

/** The fixture row picked for this tab (fixture mode only, voice.md 6.4). "" means none. */
export const fixtureRowSetting = createSetting<string>("session", "jashn.voice.fixture_row", (v): v is string => typeof v === "string", "");

export function useSpeechLanguage(): SpeechLanguage {
  return useSyncExternalStore(speechLanguageSetting.subscribe, speechLanguageSetting.get, speechLanguageSetting.server);
}

export function useFixtureRow(): string {
  return useSyncExternalStore(fixtureRowSetting.subscribe, fixtureRowSetting.get, fixtureRowSetting.server);
}

function subscribeOnline(listener: () => void): () => void {
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => {
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
  };
}

/** False while the browser reports offline (voice.md 6.1 row 4). */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine !== false,
    () => true,
  );
}

let recorderChoice: RecorderChoice | null | undefined;
const noopSubscribe = () => () => undefined;

/**
 * The recorder type this browser uses (1.3), null when it can't record (6.1 row 3), and
 * undefined on the server and during hydration.
 */
export function useRecorderChoice(): RecorderChoice | null | undefined {
  return useSyncExternalStore(
    noopSubscribe,
    () => {
      if (recorderChoice === undefined) recorderChoice = browserRecorderChoice();
      return recorderChoice;
    },
    () => undefined,
  );
}

/** True when the person asked for less motion. */
export function prefersReducedMotion(): boolean {
  try {
    return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}
