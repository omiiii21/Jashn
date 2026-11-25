"use client";

import { useCallback, useState, type ReactNode } from "react";
import { KeyboardIcon, MicrophoneIcon } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { useVoicePrefill } from "@/components/voice/prefill-store";
import type { CommandEnvelope, CommandResponse } from "@/contracts/commands";
import type { SetupEntryVariant } from "@/contracts/flags";
import { VOICE_OFF_TEXT } from "@/contracts/flags";

import { SetupForm } from "./SetupForm";

export type SetupScreenProps = {
  /** The assigned arm (flagsmith 3.4). Switching input never changes it. */
  arm: SetupEntryVariant;
  /** False when voice is off for this user (AT-1.7): the screen opens on the form. */
  voice_available: boolean;
  setup_opened_at: string;
  dispatchCommand: (envelope: CommandEnvelope) => Promise<CommandResponse>;
  /** The header mic: the VoiceDock server component, rendered by the page. */
  dock: ReactNode;
};

/**
 * The setup screen (flagsmith 3.4; voice.md 1.15). Voice-first opens on the mic with "Type
 * instead"; form-first opens on the form with the mic in the header. Input mode is client
 * state only: the arm stays as assigned. No poller and no focus refresh here (D79).
 */
export function SetupScreen({ arm, voice_available, setup_opened_at, dispatchCommand, dock }: SetupScreenProps) {
  const startsOnVoice = arm === "voice_first" && voice_available;
  const [typing, setTyping] = useState(!startsOnVoice);
  // A voice refusal's prefill (the kill switch, AT-1.6) opens the form, which takes it.
  const prefill = useVoicePrefill("set_wedding_profile");
  const showForm = typing || prefill !== null;
  const onPrefilled = useCallback(() => setTyping(true), []);

  return (
    <div className="flex min-h-dvh flex-col bg-ivory" data-setup-arm={arm}>
      <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-paper px-4 py-2 sm:px-6">
        <p className="font-serif text-rail-name text-maroon">
          Jashn{" "}
          <span lang="hi" className="tracking-normal">
            जश्न
          </span>
        </p>
        <div className="flex items-center gap-2">{dock}</div>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
        <div className="flex flex-col gap-2">
          <h1 className="font-serif text-title text-ink">Set up your wedding</h1>
          <p className="text-body text-ink-2">
            {showForm
              ? "Add the couple's names and the full date. City, budget and guests can come later."
              : "Hold the mic at the top and say the date, the city, the budget and roughly how many guests. You'll check everything before it's saved."}
          </p>
        </div>

        {showForm ? (
          <section className="rounded-sheet border border-line bg-paper p-4 sm:p-6">
            <SetupForm setup_opened_at={setup_opened_at} dispatchCommand={dispatchCommand} onPrefilled={onPrefilled} />
            {voice_available ? (
              <p className="mt-4 flex items-center gap-2 text-meta text-ink-2">
                <MicrophoneIcon size={16} aria-hidden="true" />
                Or hold the mic at the top and say it.
              </p>
            ) : (
              <p className="mt-4 text-meta text-ink-2">{VOICE_OFF_TEXT}</p>
            )}
          </section>
        ) : (
          <section className="flex flex-col items-start gap-4 rounded-sheet border border-line bg-paper p-4 sm:p-6">
            <div className="flex items-center gap-3 text-ink">
              <span className="inline-flex size-11 items-center justify-center rounded-full bg-maroon text-paper">
                <MicrophoneIcon size={24} aria-hidden="true" />
              </span>
              <p className="text-body">
                Try: &ldquo;Our wedding is on 14 December 2026 in Bengaluru. Budget is twelve lakh, roughly 250 guests.&rdquo;
              </p>
            </div>
            <Button type="button" variant="link" className="px-0" onClick={() => setTyping(true)}>
              <KeyboardIcon size={16} aria-hidden="true" />
              Type instead
            </Button>
          </section>
        )}
      </main>
    </div>
  );
}
