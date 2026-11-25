import { Microphone } from "@phosphor-icons/react";
import type { ReactNode } from "react";

import { SaveError } from "@/components/planner/kit/SaveError";
import { commandErrorText, type SubmitState } from "@/components/planner/forms/command";
import { formatInr } from "@/contracts/money";

import { staleCurrentText } from "./gated";

/** Shared pieces of the money forms: one look for inputs, buttons, voice marks and receipts. */

export const INPUT =
  "h-11 w-full rounded-control border border-line-strong bg-paper px-3 text-body text-ink tabular-nums placeholder:text-ink-3 focus-visible:border-maroon focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-maroon aria-invalid:border-overdue";
export const PRIMARY =
  "inline-flex h-11 items-center justify-center gap-2 rounded-control bg-maroon px-4 text-body font-medium text-paper transition-colors duration-150 hover:bg-maroon-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-maroon disabled:cursor-not-allowed disabled:opacity-60";
export const SECONDARY =
  "inline-flex h-11 items-center justify-center gap-2 rounded-control border border-line-strong bg-paper px-4 text-body text-ink transition-colors duration-150 hover:bg-ivory-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-maroon disabled:cursor-not-allowed disabled:opacity-60";
export const QUIET =
  "inline-flex min-h-11 items-center gap-2 rounded-control px-2 text-table text-maroon underline-offset-4 hover:bg-ivory-deep hover:text-maroon-deep hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-maroon";

export function Field({
  id,
  label,
  children,
  error,
  fromVoice,
}: {
  id: string;
  label: string;
  children: ReactNode;
  error?: string | null;
  fromVoice?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-table font-medium text-ink">
        {label}
      </label>
      {children}
      {fromVoice ? <VoiceMark /> : null}
      {error ? <SaveError id={`${id}-error`} message={error} /> : null}
    </div>
  );
}

/** "From voice, please check" beside a field the voice prefill filled (voice.md 6.3). */
export function VoiceMark() {
  return (
    <span className="inline-flex items-center gap-1 text-meta text-ink-2">
      <Microphone size={16} aria-hidden="true" />
      From voice, please check
    </span>
  );
}

/** A refused save, beside the form: the reason and, for a 409, the fresh value and who set it. */
export function FormError({ state }: { state: SubmitState }) {
  if (state.status !== "error") return null;
  const current = state.error.code === "stale_version" ? staleCurrentText(state.error.current, formatInr) : null;
  return <SaveError message={commandErrorText(state.error)} next={current ?? undefined} />;
}

/** The receipt that stays after a money save (never a toast). */
export function Receipt({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <p role="status" className="flex flex-wrap items-center gap-x-2 text-table text-ink-2">
      <span>{children}</span>
      {action}
    </p>
  );
}
