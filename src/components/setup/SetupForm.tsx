"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FROM_VOICE_NOTE, takeVoicePrefill, useVoicePrefill } from "@/components/voice/prefill-store";
import type { CommandEnvelope, CommandResponse } from "@/contracts/commands";
import type { WeddingId } from "@/contracts/domain";
import { routes } from "@/contracts/routes";

import {
  buildCreateInput,
  EMPTY_SETUP_VALUES,
  valuesFromPrefill,
  weddingIdFromResult,
  type SetupErrors,
  type SetupField,
  type SetupValues,
} from "./setup-form-values";

export type SetupFormProps = {
  /** When the setup screen opened, sent with the create for the seconds-to-save value. */
  setup_opened_at: string;
  dispatchCommand: (envelope: CommandEnvelope) => Promise<CommandResponse>;
  /** Called when a voice prefill fills the form, so the screen can show it. */
  onPrefilled?: () => void;
};

type FieldSpec = { key: SetupField; label: string; inputMode?: "numeric" | "text"; autoComplete?: string; placeholder?: string };

const NAME_FIELDS: FieldSpec[] = [
  { key: "bride_name", label: "Bride", autoComplete: "off" },
  { key: "groom_name", label: "Groom", autoComplete: "off" },
];
const DATE_FIELDS: FieldSpec[] = [
  { key: "day", label: "Day", inputMode: "numeric", placeholder: "14" },
  { key: "month", label: "Month", inputMode: "numeric", placeholder: "12" },
  { key: "year", label: "Year", inputMode: "numeric", placeholder: "2026" },
];
const REST_FIELDS: FieldSpec[] = [
  { key: "city", label: "City", autoComplete: "address-level2" },
  { key: "budget", label: "Budget (₹)", inputMode: "numeric", placeholder: "12,00,000" },
  { key: "guests", label: "Guests", inputMode: "numeric", placeholder: "250" },
];

/**
 * The typed setup form (domain 3.1). Both arms show it: form-first opens on it, voice-first
 * behind "Type instead". It saves through the `dispatchCommand` prop with one idempotency key
 * per form instance, kept across double taps and retries (I2), and takes a voice prefill for
 * `set_wedding_profile`, marking each filled field "from voice, please check" (AT-1.6).
 */
export function SetupForm({ setup_opened_at, dispatchCommand, onPrefilled }: SetupFormProps) {
  const router = useRouter();
  const [values, setValues] = useState<SetupValues>(EMPTY_SETUP_VALUES);
  const [errors, setErrors] = useState<SetupErrors>({});
  const [fromVoice, setFromVoice] = useState<ReadonlySet<SetupField>>(new Set());
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const idempotencyKey = useRef<string | null>(null);
  const submitting = useRef(false);

  // The voice prefill (6.3): take it once when it appears and fill the matching fields.
  const prefill = useVoicePrefill("set_wedding_profile");
  useEffect(() => {
    if (!prefill) return;
    const hit = takeVoicePrefill("set_wedding_profile");
    if (!hit) return;
    const { values: filled, filled: keys } = valuesFromPrefill(hit.entry.input);
    if (keys.length === 0) return;
    // Syncing from the external prefill store into the form is this effect's job.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setValues((current) => ({ ...current, ...filled }));
    setFromVoice(new Set(keys));
    onPrefilled?.();
  }, [prefill, onPrefilled]);

  function update(key: SetupField, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
    setFromVoice((current) => {
      if (!current.has(key)) return current;
      const next = new Set(current);
      next.delete(key);
      return next;
    });
    if (errors[key] || ((key === "day" || key === "month" || key === "year") && errors.date)) {
      setErrors((current) => ({ ...current, [key]: undefined, ...(key === "day" || key === "month" || key === "year" ? { date: undefined } : {}) }));
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    setFailure(null);
    const built = buildCreateInput(values, setup_opened_at);
    if (!built.ok) {
      setErrors(built.errors);
      return;
    }
    setErrors({});
    submitting.current = true;
    setPending(true);
    idempotencyKey.current ??= crypto.randomUUID();
    try {
      const response = await dispatchCommand({
        wedding_id: null,
        command: "set_wedding_profile",
        input: built.input,
        idempotency_key: idempotencyKey.current,
        source: "ui",
      });
      if (response.ok) {
        const wedding_id = weddingIdFromResult(response.result);
        router.push(wedding_id ? routes.wedding(wedding_id as WeddingId) : routes.home());
        return;
      }
      const field = response.error.field;
      if (field === "bride_name" || field === "groom_name" || field === "city") setErrors({ [field]: response.error.message });
      setFailure(response.error.message || "Couldn't save the wedding. Try again.");
    } catch {
      setFailure("Couldn't reach Jashn. Check your connection and try again.");
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  function renderField(spec: FieldSpec, className = "") {
    const id = `setup-${spec.key}`;
    const error = errors[spec.key];
    const voiced = fromVoice.has(spec.key);
    const noteId = `${id}-note`;
    return (
      <div key={spec.key} className={`flex flex-col gap-1.5 ${className}`}>
        <Label htmlFor={id} className="text-ink">
          {spec.label}
        </Label>
        <Input
          id={id}
          name={spec.key}
          value={values[spec.key]}
          onChange={(e) => update(spec.key, e.target.value)}
          inputMode={spec.inputMode}
          autoComplete={spec.autoComplete ?? "off"}
          placeholder={spec.placeholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || voiced ? noteId : undefined}
          className={voiced ? "border-dashed border-gold" : undefined}
        />
        {error ? (
          <p id={noteId} className="text-meta text-destructive">
            {error}
          </p>
        ) : voiced ? (
          <p id={noteId} className="text-meta text-ink-2">
            {FROM_VOICE_NOTE}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5" aria-label="Wedding details">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{NAME_FIELDS.map((spec) => renderField(spec))}</div>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-sm font-medium text-ink">Wedding date</legend>
        <div className="grid grid-cols-3 gap-3">{DATE_FIELDS.map((spec) => renderField(spec))}</div>
        {errors.date ? <p className="text-meta text-destructive">{errors.date}</p> : null}
      </fieldset>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">{REST_FIELDS.map((spec) => renderField(spec))}</div>
      {failure ? (
        <p role="alert" className="text-body text-destructive">
          {failure}
        </p>
      ) : null}
      <div>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Saving…" : "Save wedding"}
        </Button>
      </div>
    </form>
  );
}
