"use client";

import { Plus } from "@phosphor-icons/react";
import { useId, useState, type FormEvent } from "react";

import { parseAmountInput, type Dispatch } from "@/components/planner/forms/command";
import { useCommand } from "@/components/planner/forms/useCommand";
import { formatTime } from "@/components/planner/format";
import type { VoicePrefillEntry } from "@/contracts/commands";
import { COMMITMENT_UNITS, type CommitmentPricing, type CommitmentUnit, type MemberRole, type WeddingId } from "@/contracts/domain";
import { formatPerUnitFormula } from "@/contracts/money";
import type { CommitmentView } from "@/contracts/read-models";

import { Field, FormError, INPUT, PRIMARY, QUIET, Receipt, SECONDARY } from "./form-parts";
import { moneyEnvelope, saveModeFor } from "./gated";

export type CommitmentFormProps = {
  wedding_id: WeddingId;
  vendor_id: string;
  /** Given: Update commitment on this contract. Left out: Record commitment. */
  commitment?: CommitmentView;
  role: MemberRole;
  actor_name: string;
  dispatch: Dispatch;
  prefill?: VoicePrefillEntry;
};

/** A whole count from the field: digits only, more than 0. */
function parseCount(raw: string): number | null {
  const text = raw.trim().replace(/,/g, "");
  if (!/^\d+$/.test(text)) return null;
  const value = Number(text);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function str(input: VoicePrefillEntry["input"] | undefined, key: string): string | null {
  const value = input?.[key];
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return null;
}

/** The unit select's words, sentence case. */
const UNIT_OPTION_LABELS: Record<CommitmentUnit, string> = {
  plate: "Per plate",
  person: "Per person",
  item: "Per item",
  hour: "Per hour",
  day: "Per day",
};

/**
 * Record commitment and Update commitment (3.3, M3): flat or per unit. Per unit shows
 * "quantity × price = amount" through the contract's own formatter, and sends only the
 * quantity and price (the server works out the amount). Never optimistic; the receipt stays.
 */
export function CommitmentForm({ wedding_id, vendor_id, commitment, role, actor_name, dispatch, prefill }: CommitmentFormProps) {
  const id = useId();
  const command = commitment ? "update_commitment" : "record_commitment";
  const voice = prefill?.command === command ? prefill.input : undefined;
  const [open, setOpen] = useState(voice !== undefined);
  const [pricing, setPricing] = useState<CommitmentPricing>(
    (str(voice, "pricing") as CommitmentPricing | null) ?? commitment?.pricing ?? "per_unit",
  );
  const [amountText, setAmountText] = useState(
    str(voice, "amount_inr") ?? (commitment?.pricing === "lump_sum" ? String(commitment.amount_inr) : ""),
  );
  const [unit, setUnit] = useState<CommitmentUnit>((str(voice, "unit") as CommitmentUnit | null) ?? commitment?.unit ?? "plate");
  const [quantityText, setQuantityText] = useState(str(voice, "quantity") ?? (commitment?.quantity ? String(commitment.quantity) : ""));
  const [priceText, setPriceText] = useState(
    str(voice, "unit_price_inr") ?? (commitment?.unit_price_inr ? String(commitment.unit_price_inr) : ""),
  );
  const [dueOn, setDueOn] = useState(str(voice, "due_on") ?? commitment?.due_on ?? "");
  const [description, setDescription] = useState(str(voice, "description") ?? commitment?.description ?? "");
  const [errors, setErrors] = useState<{ amount?: string; quantity?: string; price?: string }>({});
  const [receipt, setReceipt] = useState<string | null>(null);
  // The version this form edits from, captured when it opens: a remote change made while it
  // is open answers 409 stale_version instead of being overwritten by the refreshed prop.
  const [baseVersion, setBaseVersion] = useState<number | null>(commitment?.version_no ?? null);
  const save = useCommand(dispatch);

  const mode = saveModeFor(command, role);
  if (mode === "none" || commitment?.voided) return null;
  const proposal = mode === "proposal";
  const label = commitment ? "Update commitment" : "Record commitment";

  const quantity = parseCount(quantityText);
  const price = parseAmountInput(priceText);
  const formula = pricing === "per_unit" && quantity !== null && price.ok ? formatPerUnitFormula(quantity, unit, price.value) : null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    let input: Record<string, unknown>;
    if (pricing === "lump_sum") {
      const amount = parseAmountInput(amountText);
      if (!amount.ok) {
        setErrors({ amount: amount.message });
        return;
      }
      input = { pricing, amount_inr: amount.value };
    } else {
      const next: typeof errors = {};
      if (quantity === null) next.quantity = "Enter a whole number, like 250.";
      if (!price.ok) next.price = price.message;
      if (next.quantity || next.price) {
        setErrors(next);
        return;
      }
      input = { pricing, unit, quantity, unit_price_inr: price.ok ? price.value : undefined };
    }
    setErrors({});
    const body = commitment
      ? {
          commitment_id: commitment.commitment_id,
          expected_version: baseVersion ?? commitment.version_no,
          ...input,
          due_on: dueOn || null,
          description: description.trim() || null,
        }
      : { vendor_id, ...input, ...(dueOn ? { due_on: dueOn } : {}), ...(description.trim() ? { description: description.trim() } : {}) };
    const response = await save.submit(moneyEnvelope(wedding_id, mode, command, body));
    if (!response.ok) return;
    setOpen(false);
    setReceipt(
      response.outcome === "proposed"
        ? "Sent to the owner for approval. The ledger hasn't changed."
        : `Saved by ${actor_name}, ${formatTime(new Date().toISOString())}.`,
    );
  }

  if (!open) {
    return (
      <div className="flex flex-col gap-2">
        <div className={commitment ? "-ml-2" : undefined}>
          <button
            type="button"
            className={commitment ? QUIET : SECONDARY}
            onClick={() => {
              // Open from the commitment as it reads now, with its current version.
              if (commitment) {
                setPricing(commitment.pricing);
                setAmountText(commitment.pricing === "lump_sum" ? String(commitment.amount_inr) : "");
                setUnit(commitment.unit ?? "plate");
                setQuantityText(commitment.quantity ? String(commitment.quantity) : "");
                setPriceText(commitment.unit_price_inr ? String(commitment.unit_price_inr) : "");
                setDueOn(commitment.due_on ?? "");
                setDescription(commitment.description ?? "");
                setBaseVersion(commitment.version_no);
              }
              setOpen(true);
              setReceipt(null);
              save.reset();
            }}
          >
            {commitment ? null : <Plus size={16} aria-hidden="true" />}
            {label}
          </button>
        </div>
        {receipt ? <Receipt>{receipt}</Receipt> : null}
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate aria-label={label} className="flex flex-col gap-3 rounded-paper bg-ivory p-3">
      <fieldset className="flex flex-wrap gap-2">
        <legend className="mb-1 text-table font-medium text-ink">Pricing</legend>
        {(["per_unit", "lump_sum"] as const).map((value) => (
          <label key={value} className="inline-flex min-h-11 items-center gap-2 pr-4 text-body text-ink">
            <input
              type="radio"
              name={`${id}-pricing`}
              value={value}
              checked={pricing === value}
              onChange={() => setPricing(value)}
              className="size-4 accent-maroon"
            />
            {value === "per_unit" ? "Per unit" : "Flat amount"}
          </label>
        ))}
      </fieldset>
      {pricing === "lump_sum" ? (
        <Field id={`${id}-amount`} label="Amount" error={errors.amount} fromVoice={str(voice, "amount_inr") !== null}>
          <input
            id={`${id}-amount`}
            inputMode="numeric"
            autoComplete="off"
            placeholder="2,00,000"
            value={amountText}
            onChange={(event) => setAmountText(event.target.value)}
            aria-invalid={errors.amount ? true : undefined}
            aria-describedby={errors.amount ? `${id}-amount-error` : undefined}
            className={INPUT}
          />
        </Field>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field id={`${id}-quantity`} label="Quantity" error={errors.quantity} fromVoice={str(voice, "quantity") !== null}>
            <input
              id={`${id}-quantity`}
              inputMode="numeric"
              autoComplete="off"
              placeholder="250"
              value={quantityText}
              onChange={(event) => setQuantityText(event.target.value)}
              aria-invalid={errors.quantity ? true : undefined}
              aria-describedby={errors.quantity ? `${id}-quantity-error` : undefined}
              className={INPUT}
            />
          </Field>
          <Field id={`${id}-unit`} label="Unit" fromVoice={str(voice, "unit") !== null}>
            <select id={`${id}-unit`} value={unit} onChange={(event) => setUnit(event.target.value as CommitmentUnit)} className={INPUT}>
              {COMMITMENT_UNITS.map((value) => (
                <option key={value} value={value}>
                  {UNIT_OPTION_LABELS[value]}
                </option>
              ))}
            </select>
          </Field>
          <Field id={`${id}-price`} label="Price per unit" error={errors.price} fromVoice={str(voice, "unit_price_inr") !== null}>
            <input
              id={`${id}-price`}
              inputMode="numeric"
              autoComplete="off"
              placeholder="800"
              value={priceText}
              onChange={(event) => setPriceText(event.target.value)}
              aria-invalid={errors.price ? true : undefined}
              aria-describedby={errors.price ? `${id}-price-error` : undefined}
              className={INPUT}
            />
          </Field>
        </div>
      )}
      {formula ? (
        <p className="text-body text-ink tabular-nums" aria-live="polite">
          {formula}
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id={`${id}-due`} label="Balance due (optional)" fromVoice={str(voice, "due_on") !== null}>
          <input id={`${id}-due`} type="date" value={dueOn} onChange={(event) => setDueOn(event.target.value)} className={INPUT} />
        </Field>
        <Field id={`${id}-description`} label="Description (optional)" fromVoice={str(voice, "description") !== null}>
          <input
            id={`${id}-description`}
            maxLength={200}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className={INPUT}
          />
        </Field>
      </div>
      <FormError state={save.state} />
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={PRIMARY} disabled={save.saving}>
          {save.saving ? "Saving…" : proposal ? "Send for approval" : commitment ? "Save contract" : "Save commitment"}
        </button>
        <button type="button" className={SECONDARY} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
