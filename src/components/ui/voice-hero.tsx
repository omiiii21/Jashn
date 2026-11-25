"use client";

import { MicrophoneIcon, MicrophoneSlashIcon, StopIcon } from "@phosphor-icons/react";
import { cn } from "cn";
import { useEffect, useState } from "react";

import {
  isVoiceDockState,
  VOICE_STATE_EVENT,
  VOICE_STATE_REQUEST_EVENT,
  VOICE_TOGGLE_EVENT,
  type VoiceDockState,
} from "./voice-events";

type VoiceHeroProps = {
  /** Example lines in the person's own words, shown under the prompt. */
  examples?: readonly string[];
  className?: string;
};

const STATUS: Record<VoiceDockState | "waiting", string> = {
  waiting: "Getting voice ready…",
  idle: "Tap and speak. Tap again when you're done.",
  listening: "Listening… tap to send",
  busy: "Interpreting…",
  off: "Voice is switched off right now. You can type or edit directly.",
};

/**
 * The voice-first landing card (Lane E; DESIGN.md "Voice-first landing"). It is a second door
 * to the header voice dock, never a second recorder: a tap sends `VOICE_TOGGLE_EVENT` inside the
 * click, so the dock opens the mic inside the user's gesture, and the dock's review card shows
 * what was heard. The card mirrors the dock's state from `VOICE_STATE_EVENT`.
 */
export function VoiceHero({ examples = [], className }: VoiceHeroProps) {
  const [state, setState] = useState<VoiceDockState | "waiting">("waiting");

  useEffect(() => {
    const onState = (e: Event) => {
      const detail = (e as CustomEvent<unknown>).detail;
      if (isVoiceDockState(detail)) setState(detail);
    };
    window.addEventListener(VOICE_STATE_EVENT, onState);
    window.dispatchEvent(new Event(VOICE_STATE_REQUEST_EVENT));
    return () => window.removeEventListener(VOICE_STATE_EVENT, onState);
  }, []);

  const listening = state === "listening";
  const disabled = state === "off" || state === "busy" || state === "waiting";
  const label = listening ? "Stop and send" : state === "off" ? STATUS.off : "Speak to Jashn";

  return (
    <section
      aria-labelledby="voice-hero-heading"
      className={cn("flex flex-col gap-5 rounded-sheet border border-line bg-paper p-5 sm:flex-row sm:items-start sm:gap-7 lg:p-7", className)}
    >
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event(VOICE_TOGGLE_EVENT))}
        disabled={disabled}
        aria-label={label}
        aria-pressed={listening}
        className={cn(
          "grid size-24 shrink-0 place-items-center self-center rounded-full ring-1 ring-gold transition-[box-shadow,background-color] duration-150 sm:self-start",
          "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring",
          "disabled:cursor-not-allowed disabled:opacity-60",
          listening ? "shadow-[0_0_0_10px_color-mix(in_srgb,var(--jashn-gold)_22%,transparent)]" : "",
        )}
      >
        <span
          className={cn(
            "grid size-20 place-items-center rounded-full",
            listening ? "bg-maroon text-ivory" : state === "busy" ? "bg-maroon-deep text-ivory" : "bg-gold text-maroon-deep",
          )}
        >
          {state === "off" ? (
            <MicrophoneSlashIcon size={32} aria-hidden="true" />
          ) : listening ? (
            <StopIcon size={28} weight="fill" aria-hidden="true" />
          ) : state === "busy" ? (
            <span className="size-7 animate-pulse rounded-full bg-ivory/50" aria-hidden="true" />
          ) : (
            <MicrophoneIcon size={32} weight="fill" aria-hidden="true" />
          )}
        </span>
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <h2 id="voice-hero-heading" className="font-title text-2xl font-normal text-ink">
          Tell me what changed
        </h2>
        <p className={cn("text-body", listening ? "font-semibold text-maroon" : "text-ink-2")} aria-live="polite">
          {STATUS[state]}
        </p>
        {examples.length > 0 ? (
          <ul className="flex flex-col gap-1.5" aria-label="Things you can say">
            {examples.map((line) => (
              <li key={line} className="text-table text-ink-2">
                <span className="inline-block rounded-chip bg-ivory px-2 py-0.5">&ldquo;{line}&rdquo;</span>
              </li>
            ))}
          </ul>
        ) : null}
        <p className="border-t border-line pt-3 text-meta text-ink-3">
          English, <span lang="hi">हिंदी</span> or Hinglish. Nothing is saved until you confirm. You can also type in the voice panel.
        </p>
      </div>
    </section>
  );
}
