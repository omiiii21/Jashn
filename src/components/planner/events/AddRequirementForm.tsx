"use client";

import { Microphone } from "@phosphor-icons/react";
import { useState } from "react";

import type { VoicePrefillEntry } from "@/contracts/commands";
import { REQUIREMENT_CATEGORIES, type RequirementCategory, type WeddingId } from "@/contracts/domain";

import { formatTime } from "../format";
import { SaveError } from "../kit/SaveError";
import { commandErrorText, type Dispatch } from "../forms/command";
import { useCommand } from "../forms/useCommand";
import { INPUT, SECONDARY } from "../money/form-parts";

const CATEGORY_LABELS: Record<RequirementCategory, string> = {
  catering: "Catering",
  decor: "Decor",
  music: "Music",
  ritual: "Ritual",
  logistics: "Logistics",
  attire: "Attire",
  other: "Other",
};


export type AddRequirementFormProps = {
  wedding_id: WeddingId;
  event_id: string;
  /** The function's name, for the form's label: "Add a requirement to the reception". */
  function_title: string;
  dispatch: Dispatch;
  member_name: string;
  /** Lane C's voice prefill (D121): `add_requirement` with text, quantity and category. */
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

/** AT-2.7's typed save: add a requirement to one function (add_requirement). */
export function AddRequirementForm({ wedding_id, event_id, function_title, dispatch, member_name, prefill }: AddRequirementFormProps) {
  const voice = prefill && prefill.command === "add_requirement" ? prefill.input : null;
  const [text, setText] = useState(typeof voice?.text === "string" ? voice.text : "");
  const [quantity, setQuantity] = useState(typeof voice?.quantity === "number" ? String(voice.quantity) : "");
  const [category, setCategory] = useState<string>(
    typeof voice?.requirement_category === "string" ? voice.requirement_category : "",
  );
  const [localError, setLocalError] = useState<{ field: string; message: string } | null>(null);
  const { state, submit, reset, saving } = useCommand(dispatch);

  const base = `req-${event_id}`;
  const error = state.status === "error" ? state.error : null;
  const errorFor = (field: string) => {
    if (localError?.field === field) return localError.message;
    if (error && error.code === "validation_failed" && error.field === field) return commandErrorText(error);
    return null;
  };
  const formError =
    error && !(error.code === "validation_failed" && (error.field === "text" || error.field === "quantity"))
      ? commandErrorText(error)
      : null;

  return (
    <form
      noValidate
      aria-labelledby={`${base}-heading`}
      className="flex flex-col gap-3"
      onSubmit={async (event) => {
        event.preventDefault();
        setLocalError(null);
        const trimmed = text.trim();
        if (trimmed === "") {
          setLocalError({ field: "text", message: "Write what the function needs, like 'Sugar-free dessert option'." });
          return;
        }
        let qty: number | undefined;
        if (quantity.trim() !== "") {
          if (!/^\d+$/.test(quantity.trim())) {
            setLocalError({ field: "quantity", message: "Use a whole number, like 30." });
            return;
          }
          qty = Number(quantity.trim());
        }
        const response = await submit({
          wedding_id,
          command: "add_requirement",
          input: {
            event_id,
            text: trimmed,
            ...(qty === undefined ? {} : { quantity: qty }),
            ...(category === "" ? {} : { requirement_category: category }),
          },
          source: "ui",
        } as never);
        if (response.ok) {
          setText("");
          setQuantity("");
          setCategory("");
        }
      }}
    >
      <h3 id={`${base}-heading`} className="text-heading text-ink">
        Add a requirement to the {function_title.toLowerCase()}
      </h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_8rem_10rem]">
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor={`${base}-text`} className="text-meta text-ink-2">
            What is needed
          </label>
          <input
            id={`${base}-text`}
            className={INPUT}
            value={text}
            maxLength={200}
            onChange={(event) => {
              setText(event.target.value);
              if (state.status === "saved") reset();
            }}
            aria-invalid={Boolean(errorFor("text"))}
            aria-describedby={errorFor("text") ? `${base}-text-error` : undefined}
          />
          {typeof voice?.text === "string" ? <FromVoice /> : null}
          {errorFor("text") ? <SaveError id={`${base}-text-error`} message={errorFor("text") ?? ""} /> : null}
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor={`${base}-qty`} className="text-meta text-ink-2">
            Quantity (optional)
          </label>
          <input
            id={`${base}-qty`}
            inputMode="numeric"
            className={INPUT}
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            aria-invalid={Boolean(errorFor("quantity"))}
            aria-describedby={errorFor("quantity") ? `${base}-qty-error` : undefined}
          />
          {typeof voice?.quantity === "number" ? <FromVoice /> : null}
          {errorFor("quantity") ? <SaveError id={`${base}-qty-error`} message={errorFor("quantity") ?? ""} /> : null}
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor={`${base}-cat`} className="text-meta text-ink-2">
            Category
          </label>
          <select id={`${base}-cat`} className={INPUT} value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="">Not set</option>
            {REQUIREMENT_CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {CATEGORY_LABELS[value]}
              </option>
            ))}
          </select>
          {typeof voice?.requirement_category === "string" ? <FromVoice /> : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className={SECONDARY}
        >
          {saving ? "Adding…" : "Add requirement"}
        </button>
        <div aria-live="polite">
          {state.status === "saved" ? (
            <p className="text-meta text-ink-2">
              Added by {member_name}, <span className="tabular-nums">{formatTime(new Date().toISOString())}</span>.
            </p>
          ) : null}
        </div>
      </div>
      {formError ? <SaveError message={formError} /> : null}
    </form>
  );
}
