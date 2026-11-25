"use client";

import { cn } from "cn";
import { useEffect, useState } from "react";

import {
  isVoiceDockBroadcast,
  VOICE_STATE_EVENT,
  VOICE_STATE_REQUEST_EVENT,
  VOICE_TOGGLE_EVENT,
  VOICE_TYPE_EVENT,
  type VoiceDockBroadcast,
} from "./voice-events";

type VoiceHeroProps = {
  /** A line in the person's own words, shown in the transcript area before anything is heard. */
  example?: string;
  className?: string;
};

type HeroState = VoiceDockBroadcast["state"] | "waiting";

const STATUS: Record<HeroState, { label: string; hint: string }> = {
  waiting: { label: "Getting ready", hint: "" },
  idle: { label: "Ready", hint: "tap to talk" },
  listening: { label: "Listening", hint: "tap to send" },
  busy: { label: "Interpreting", hint: "" },
  off: { label: "Voice off", hint: "" },
};

const BAR_HEIGHTS = [6, 12, 8, 14, 5, 11, 7, 13, 6] as const;

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * The voice-first listening card (Lane E), matched to the Doop frame "Planner · Overview,
 * voice-first": the orb on the left; a status row, the words and a footer on the right. It is a
 * second door to the header voice dock, never a second recorder (D20): a tap sends
 * `VOICE_TOGGLE_EVENT` inside the click, so the dock opens the mic inside the gesture. It is
 * push-to-talk, so the words appear after release (voice.md 1.7), and the dock's review card
 * shows what was understood.
 */
export function VoiceHero({ example, className }: VoiceHeroProps) {
  const [dock, setDock] = useState<VoiceDockBroadcast | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const onState = (e: Event) => {
      const detail = (e as CustomEvent<unknown>).detail;
      if (isVoiceDockBroadcast(detail)) setDock(detail);
    };
    window.addEventListener(VOICE_STATE_EVENT, onState);
    window.dispatchEvent(new Event(VOICE_STATE_REQUEST_EVENT));
    return () => window.removeEventListener(VOICE_STATE_EVENT, onState);
  }, []);

  const state: HeroState = dock?.state ?? "waiting";
  const listening = state === "listening";

  // The timer runs while listening, from the moment the dock says so. State only changes from
  // timer callbacks, never synchronously inside the effect.
  useEffect(() => {
    if (!listening) return;
    const at = Date.now();
    const reset = window.setTimeout(() => setElapsed(0), 0);
    const tick = window.setInterval(() => setElapsed(Date.now() - at), 250);
    return () => {
      window.clearTimeout(reset);
      window.clearInterval(tick);
    };
  }, [listening]);

  const disabled = state === "off" || state === "busy" || state === "waiting";
  const status = STATUS[state];
  const heard = dock?.heard ?? null;

  return (
    <section
      aria-labelledby="voice-hero-status"
      className={cn(
        "flex flex-col items-center gap-6 rounded-[16px] border border-line bg-paper px-5 py-6 sm:flex-row sm:items-start sm:gap-7 sm:px-8 sm:py-7",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event(VOICE_TOGGLE_EVENT))}
        disabled={disabled}
        aria-label={listening ? "Stop and send" : state === "off" ? "Voice is switched off right now" : "Speak to Jashn"}
        aria-pressed={listening}
        className={cn(
          "grid size-24 shrink-0 place-items-center rounded-full p-2 ring-1 ring-gold transition-shadow duration-150",
          "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring",
          "disabled:cursor-not-allowed disabled:opacity-60",
          listening ? "shadow-[0_0_0_10px_color-mix(in_srgb,var(--jashn-gold)_22%,transparent)]" : "",
        )}
      >
        <span className={cn("grid size-20 place-items-center rounded-full", listening || state === "busy" ? "bg-maroon" : "bg-gold")}>
          {listening ? (
            <span className="size-[22px] rounded-[4px] bg-ivory" aria-hidden="true" />
          ) : state === "busy" ? (
            <span className="size-7 animate-pulse rounded-full bg-ivory/50" aria-hidden="true" />
          ) : (
            // The mic, drawn in maroon-deep on the gold disc (the Doop orb).
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="9" y="2" width="6" height="12" rx="3" stroke="var(--jashn-maroon-deep)" strokeWidth="2" />
              <path d="M5 10a7 7 0 0 0 14 0M12 17v4M8 21h8" stroke="var(--jashn-maroon-deep)" strokeWidth="2" strokeLinecap="round" />
            </svg>
          )}
        </span>
      </button>

      <div className="flex w-full min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-3">
          <span id="voice-hero-status" className="text-meta font-bold tracking-[0.04em] text-maroon uppercase">
            {status.label}
          </span>
          {listening ? (
            <span className="inline-flex h-3.5 items-center gap-[3px]" aria-hidden="true">
              {BAR_HEIGHTS.map((h, i) => (
                <i
                  key={i}
                  className="w-[3px] rounded-[2px] bg-maroon motion-safe:animate-pulse"
                  style={{ height: h, animationDelay: `${i * 90}ms` }}
                />
              ))}
            </span>
          ) : null}
          <span className="ml-auto text-meta text-ink-3 tabular-nums" aria-live="polite">
            {listening ? `${formatElapsed(elapsed)} · ` : ""}
            {status.hint}
          </span>
        </div>

        <p className="mt-3 text-[20px] leading-8 text-ink">
          {state === "off" ? (
            <span className="text-ink-2">Voice is switched off right now. You can type or edit directly.</span>
          ) : heard ? (
            <>&ldquo;{heard}&rdquo;</>
          ) : listening ? (
            <span className="text-ink-3">Speak now. Your words appear when you tap to send.</span>
          ) : (
            <span className="text-ink-3">
              Tell me what changed. Try &ldquo;{example ?? "Caterer ko chaalis hazaar advance diya tha"}&rdquo;
            </span>
          )}
        </p>

        <div className="mt-[18px] flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-line pt-3.5 text-meta text-ink-3">
          <span>
            English, <span lang="hi">हिंदी</span> or Hinglish
          </span>
          <span>Nothing is saved until you confirm</span>
          <span className="sm:ml-auto">
            or{" "}
            <button
              type="button"
              onClick={() => window.dispatchEvent(new Event(VOICE_TYPE_EVENT))}
              className="font-medium text-maroon underline underline-offset-[3px] hover:text-maroon-deep"
            >
              type instead
            </button>
          </span>
        </div>
      </div>
    </section>
  );
}
