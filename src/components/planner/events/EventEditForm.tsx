"use client";

import { Microphone } from "@phosphor-icons/react";
import { useState, type ReactNode } from "react";

import type { CommandErrorBody, VoicePrefillEntry } from "@/contracts/commands";
import type { WeddingId } from "@/contracts/domain";
import type { ItineraryFunction, ItineraryVenue } from "@/contracts/read-models";

import { formatTime } from "../format";
import { SaveError } from "../kit/SaveError";
import { commandErrorText, type Dispatch } from "../forms/command";
import { useCommand } from "../forms/useCommand";
import { INPUT } from "../money/form-parts";
import { venueOptionLabel } from "./event-text";

type Fields = {
  title: string;
  event_date: string;
  start_time: string;
  end_time: string;
  muhurat_time: string;
  venue_id: string;
  dress_code: string;
};

const FIELD_KEYS: (keyof Fields)[] = ["title", "event_date", "start_time", "end_time", "muhurat_time", "venue_id", "dress_code"];

function hhmm(value: string | null): string {
  return value ? value.slice(0, 5) : "";
}

function fieldsOf(fn: ItineraryFunction): Fields {
  return {
    title: fn.title,
    event_date: fn.event_date,
    start_time: hhmm(fn.start_time),
    end_time: hhmm(fn.end_time),
    muhurat_time: hhmm(fn.muhurat_time),
    venue_id: fn.venue_id ?? "",
    dress_code: fn.dress_code ?? "",
  };
}

function prefilled(base: Fields, prefill?: VoicePrefillEntry): { fields: Fields; fromVoice: Set<string> } {
  const fromVoice = new Set<string>();
  if (!prefill || prefill.command !== "update_event") return { fields: base, fromVoice };
  const next = { ...base };
  for (const key of FIELD_KEYS) {
    const value = prefill.input[key];
    if (typeof value === "string") {
      next[key] = key.endsWith("_time") ? value.slice(0, 5) : value;
      fromVoice.add(key);
    }
  }
  return { fields: next, fromVoice };
}

/**
 * Only the fields that differ from the baseline (the function as it was when the form opened,
 * or after its last save), so the change stays minimal and a remote change is never reverted.
 */
function changedInput(base: Fields, fields: Fields): Record<string, string | null> {
  const input: Record<string, string | null> = {};
  for (const key of FIELD_KEYS) {
    if (fields[key] === base[key]) continue;
    const value = fields[key].trim();
    const optional = key === "end_time" || key === "muhurat_time" || key === "venue_id" || key === "dress_code";
    input[key] = value === "" && optional ? null : value;
  }
  return input;
}

export type EventEditFormProps = {
  wedding_id: WeddingId;
  fn: ItineraryFunction;
  venues: ItineraryVenue[];
  dispatch: Dispatch;
  /** The member's display name, for the receipt line. */
  member_name: string;
  /** Lane C's voice prefill (D121), when voice opened this form. */
  prefill?: VoicePrefillEntry;
};


function FromVoice() {
  return (
    <span className="flex items-center gap-1 text-meta text-ink-2">
      <Microphone size={16} aria-hidden="true" />
      From voice, please check
    </span>
  );
}

function Field({
  id,
  label,
  error,
  voice,
  children,
}: {
  id: string;
  label: string;
  error: string | null;
  voice: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-meta text-ink-2">
        {label}
      </label>
      {children}
      {voice ? <FromVoice /> : null}
      {error ? <SaveError id={`${id}-error`} message={error} /> : null}
    </div>
  );
}

/**
 * The function's edit form (update_event, brief B3). Saves to the draft: guests keep the
 * published schedule until an owner publishes. Never optimistic; a 409 keeps what was typed
 * and offers "Keep yours" and "Use theirs" (design-direction 7.2). Typed state survives the
 * 2.5 s refresh because the form keeps its own state and reads `fn` only for the baseline.
 */
export function EventEditForm({ wedding_id, fn, venues, dispatch, member_name, prefill }: EventEditFormProps) {
  const initial = prefilled(fieldsOf(fn), prefill);
  const [fields, setFields] = useState<Fields>(initial.fields);
  // The version and values this form edits from. A 2.5 s refresh changes `fn` but not the
  // baseline, so a remote change answers 409 stale_version instead of being overwritten.
  const [baseline, setBaseline] = useState<{ fields: Fields; version: number }>(() => ({ fields: fieldsOf(fn), version: fn.version }));
  const [fromVoice] = useState<Set<string>>(initial.fromVoice);
  const [conflict, setConflict] = useState<{ version: number; current: Fields | null; by: string | null } | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const { state, submit, reset, saving } = useCommand(dispatch);

  const error: CommandErrorBody | null = state.status === "error" ? state.error : null;
  const fieldError = (key: string) =>
    error && error.code === "validation_failed" && error.field === key ? commandErrorText(error) : null;
  const formError =
    error && !(error.code === "validation_failed" && error.field && FIELD_KEYS.includes(error.field as keyof Fields)) && error.code !== "stale_version"
      ? commandErrorText(error)
      : null;

  const id = (key: string) => `ev-${fn.event_id}-${key}`;
  const set = (key: keyof Fields) => (event: { target: { value: string } }) => {
    setFields((prev) => ({ ...prev, [key]: event.target.value }));
    if (state.status === "saved") reset();
  };

  async function save(expected_version: number) {
    setLocalError(null);
    const input = changedInput(baseline.fields, fields);
    if (Object.keys(input).length === 0) {
      setLocalError("Nothing has changed yet. Edit a field, then save the draft.");
      return;
    }
    const response = await submit({
      wedding_id,
      command: "update_event",
      input: { event_id: fn.event_id, expected_version, ...input },
      source: "ui",
    } as never);
    if (response.ok) {
      const result = response.result as { version?: unknown };
      if (typeof result.version === "number") setBaseline({ fields, version: result.version });
      setConflict(null);
    } else if (response.error.code === "stale_version") {
      const current = response.error.current as Partial<ItineraryFunction> & { changed_by?: string | null } | undefined;
      setConflict({
        version: typeof current?.version === "number" ? current.version : fn.version,
        current:
          current && typeof current.title === "string" && typeof current.event_date === "string"
            ? fieldsOf(current as ItineraryFunction)
            : null,
        by: (current?.changed_by as string | null | undefined) ?? null,
      });
    } else {
      setConflict(null);
    }
  }

  const who = conflict?.by ?? "Someone";

  return (
    <form
      noValidate
      aria-labelledby={id("heading")}
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void save(baseline.version);
      }}
    >
      <h3 id={id("heading")} className="text-heading text-ink">
        Edit this function
      </h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field id={id("title")} label="Name" error={fieldError("title")} voice={fromVoice.has("title")}>
          <input id={id("title")} className={INPUT} value={fields.title} onChange={set("title")} maxLength={40} aria-invalid={Boolean(fieldError("title"))} aria-describedby={fieldError("title") ? `${id("title")}-error` : undefined} />
        </Field>
        <Field id={id("date")} label="Date" error={fieldError("event_date")} voice={fromVoice.has("event_date")}>
          <input id={id("date")} type="date" className={INPUT} value={fields.event_date} onChange={set("event_date")} aria-invalid={Boolean(fieldError("event_date"))} aria-describedby={fieldError("event_date") ? `${id("date")}-error` : undefined} />
        </Field>
        <Field id={id("start")} label="Start" error={fieldError("start_time")} voice={fromVoice.has("start_time")}>
          <input id={id("start")} type="time" className={INPUT} value={fields.start_time} onChange={set("start_time")} aria-invalid={Boolean(fieldError("start_time"))} aria-describedby={fieldError("start_time") ? `${id("start")}-error` : undefined} />
        </Field>
        <Field id={id("end")} label="End" error={fieldError("end_time")} voice={fromVoice.has("end_time")}>
          <input id={id("end")} type="time" className={INPUT} value={fields.end_time} onChange={set("end_time")} aria-invalid={Boolean(fieldError("end_time"))} aria-describedby={fieldError("end_time") ? `${id("end")}-error` : undefined} />
        </Field>
        <Field id={id("muhurat")} label="Muhurat (optional)" error={fieldError("muhurat_time")} voice={fromVoice.has("muhurat_time")}>
          <input id={id("muhurat")} type="time" className={INPUT} value={fields.muhurat_time} onChange={set("muhurat_time")} aria-invalid={Boolean(fieldError("muhurat_time"))} aria-describedby={fieldError("muhurat_time") ? `${id("muhurat")}-error` : undefined} />
        </Field>
        {/* Full width: the options carry the place and the capacity. */}
        <div className="sm:col-span-2">
          <Field id={id("venue")} label="Venue" error={fieldError("venue_id")} voice={fromVoice.has("venue_id")}>
            <select id={id("venue")} className={INPUT} value={fields.venue_id} onChange={set("venue_id")} aria-invalid={Boolean(fieldError("venue_id"))} aria-describedby={fieldError("venue_id") ? `${id("venue")}-error` : undefined}>
              <option value="">No venue yet</option>
              {venues.map((venue) => (
                <option key={venue.venue_id} value={venue.venue_id}>
                  {venueOptionLabel(venue)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field id={id("dress")} label="Dress code" error={fieldError("dress_code")} voice={fromVoice.has("dress_code")}>
            <input id={id("dress")} className={INPUT} value={fields.dress_code} onChange={set("dress_code")} maxLength={120} aria-invalid={Boolean(fieldError("dress_code"))} aria-describedby={fieldError("dress_code") ? `${id("dress")}-error` : undefined} />
          </Field>
        </div>
      </div>

      {conflict ? (
        <div role="alert" className="flex flex-col gap-3 rounded-paper border border-due bg-due-tint p-3">
          <p className="text-body text-ink">
            {who} changed the {fn.title.toLowerCase()} while you were editing. Your typed values are kept below.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => void save(conflict.version)}
              className="inline-flex h-11 items-center rounded-control bg-maroon px-4 text-body text-ivory hover:bg-maroon-deep disabled:opacity-60"
            >
              Keep yours
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                if (conflict.current) {
                  setFields(conflict.current);
                  setBaseline({ fields: conflict.current, version: conflict.version });
                }
                setConflict(null);
                reset();
              }}
              className="inline-flex h-11 items-center rounded-control border border-line-strong bg-paper px-4 text-body text-ink hover:bg-ivory-deep"
            >
              {conflict.by ? `Use ${conflict.by}'s` : "Use theirs"}
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex h-11 items-center rounded-control bg-maroon px-4 text-body text-ivory hover:bg-maroon-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-maroon disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save draft"}
        </button>
        <p className="text-meta text-ink-3">Guests see this only after an owner publishes.</p>
      </div>
      <div aria-live="polite" className="min-h-0">
        {state.status === "saved" ? (
          <p className="text-meta text-ink-2">
            {state.response.outcome === "proposed" ? "Sent for approval" : "Saved to the draft"} by {member_name},{" "}
            <span className="tabular-nums">{formatTime(new Date().toISOString())}</span>.
          </p>
        ) : null}
      </div>
      {localError ? <SaveError message={localError} /> : null}
      {formError ? <SaveError message={formError} /> : null}
    </form>
  );
}
