"use client";

import { Plus } from "@phosphor-icons/react";
import { useId, useState, type FormEvent } from "react";

import { parseAmountInput, type Dispatch } from "@/components/planner/forms/command";
import { useCommand } from "@/components/planner/forms/useCommand";
import { formatTime } from "@/components/planner/format";
import type { VoicePrefillEntry } from "@/contracts/commands";
import {
  PAYMENT_KINDS,
  PAYMENT_KIND_LABELS,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  type MemberRole,
  type PaymentKind,
  type PaymentMethod,
  type WeddingId,
} from "@/contracts/domain";
import { formatInr } from "@/contracts/money";

import { Field, FormError, INPUT, PRIMARY, QUIET, Receipt, SECONDARY } from "./form-parts";
import { moneyEnvelope, saveModeFor } from "./gated";

export type RecordPaymentFormProps = {
  wedding_id: WeddingId;
  vendor_id: string;
  vendor_name: string;
  /** The active commitment the payment is attached to, when there is one. */
  commitment_id: string | null;
  role: MemberRole;
  actor_name: string;
  dispatch: Dispatch;
  prefill?: VoicePrefillEntry;
};

function text(input: VoicePrefillEntry["input"] | undefined, key: string): string | null {
  const value = input?.[key];
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return null;
}

/**
 * Record payment (3.3): amount, kind, paid on, method and a note, attached to the vendor's
 * contract. Never optimistic. The receipt stays with Undo, which voids the new payment
 * (design-direction 8, rule 3). A manager's save goes out for approval.
 */
export function RecordPaymentForm({
  wedding_id,
  vendor_id,
  vendor_name,
  commitment_id,
  role,
  actor_name,
  dispatch,
  prefill,
}: RecordPaymentFormProps) {
  const id = useId();
  const voice = prefill?.command === "record_payment" ? prefill.input : undefined;
  const [open, setOpen] = useState(voice !== undefined);
  const [amountText, setAmountText] = useState(text(voice, "amount_inr") ?? "");
  const [kind, setKind] = useState<PaymentKind>((text(voice, "payment_kind") as PaymentKind | null) ?? "advance");
  const [paidOn, setPaidOn] = useState(text(voice, "paid_on") ?? "");
  const [method, setMethod] = useState<PaymentMethod | "">((text(voice, "method") as PaymentMethod | null) ?? "");
  const [note, setNote] = useState(text(voice, "note") ?? "");
  const [amountError, setAmountError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ text: string; undo: { payment_id: string; version_no: number } | null } | null>(
    null,
  );
  const save = useCommand(dispatch);
  const undo = useCommand(dispatch);

  const mode = saveModeFor("record_payment", role);
  if (mode === "none") return null;
  const proposal = mode === "proposal";

  function start() {
    setOpen(true);
    setReceipt(null);
    save.reset();
    undo.reset();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseAmountInput(amountText);
    if (!parsed.ok) {
      setAmountError(parsed.message);
      return;
    }
    setAmountError(null);
    const response = await save.submit(
      moneyEnvelope(wedding_id, mode, "record_payment", {
        vendor_id,
        amount_inr: parsed.value,
        payment_kind: kind,
        ...(paidOn ? { paid_on: paidOn } : {}),
        ...(method ? { method } : {}),
        ...(commitment_id ? { commitment_id } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      }),
    );
    if (!response.ok) return;
    setOpen(false);
    setAmountText("");
    setNote("");
    const time = formatTime(new Date().toISOString());
    if (response.outcome === "proposed") {
      setReceipt({ text: "Sent to the owner for approval. The ledger hasn't changed.", undo: null });
    } else if (response.command === "record_payment") {
      setReceipt({
        text: `${formatInr(response.result.amount_inr)} to ${vendor_name} saved by ${actor_name}, ${time}.`,
        undo: { payment_id: response.result.payment_id, version_no: response.result.version_no },
      });
    } else {
      setReceipt({ text: `Saved by ${actor_name}, ${time}.`, undo: null });
    }
  }

  async function undoPayment() {
    if (!receipt?.undo) return;
    const response = await undo.submit(
      moneyEnvelope(wedding_id, saveModeFor("void_payment", role), "void_payment", {
        payment_id: receipt.undo.payment_id,
        expected_version: receipt.undo.version_no,
        void_reason: "Undo",
      }),
    );
    if (response.ok) {
      setReceipt({
        text: `Voided by ${actor_name}, ${formatTime(new Date().toISOString())}. It stays listed, struck through.`,
        undo: null,
      });
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {!open ? (
        <div>
          <button type="button" className={SECONDARY} onClick={start}>
            <Plus size={16} aria-hidden="true" />
            Record payment
          </button>
        </div>
      ) : (
        <form onSubmit={submit} noValidate aria-label="Record payment" className="flex flex-col gap-3 rounded-paper bg-ivory p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id={`${id}-amount`} label="Amount" error={amountError} fromVoice={text(voice, "amount_inr") !== null}>
              <input
                id={`${id}-amount`}
                name="amount"
                inputMode="numeric"
                autoComplete="off"
                placeholder="40,000"
                value={amountText}
                onChange={(event) => setAmountText(event.target.value)}
                aria-invalid={amountError ? true : undefined}
                aria-describedby={amountError ? `${id}-amount-error` : undefined}
                className={INPUT}
              />
            </Field>
            <Field id={`${id}-kind`} label="Kind" fromVoice={text(voice, "payment_kind") !== null}>
              <select id={`${id}-kind`} value={kind} onChange={(event) => setKind(event.target.value as PaymentKind)} className={INPUT}>
                {PAYMENT_KINDS.map((value) => (
                  <option key={value} value={value}>
                    {PAYMENT_KIND_LABELS[value].en}
                  </option>
                ))}
              </select>
            </Field>
            <Field id={`${id}-paid-on`} label="Paid on (optional)" fromVoice={text(voice, "paid_on") !== null}>
              <input
                id={`${id}-paid-on`}
                type="date"
                value={paidOn}
                onChange={(event) => setPaidOn(event.target.value)}
                className={INPUT}
              />
            </Field>
            <Field id={`${id}-method`} label="Method (optional)" fromVoice={text(voice, "method") !== null}>
              <select
                id={`${id}-method`}
                value={method}
                onChange={(event) => setMethod(event.target.value as PaymentMethod | "")}
                className={INPUT}
              >
                <option value="">Not given</option>
                {PAYMENT_METHODS.map((value) => (
                  <option key={value} value={value}>
                    {PAYMENT_METHOD_LABELS[value]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field id={`${id}-note`} label="Note (optional)" fromVoice={text(voice, "note") !== null}>
            <input id={`${id}-note`} maxLength={200} value={note} onChange={(event) => setNote(event.target.value)} className={INPUT} />
          </Field>
          <FormError state={save.state} />
          <div className="flex flex-wrap gap-2">
            <button type="submit" className={PRIMARY} disabled={save.saving}>
              {save.saving ? "Saving…" : proposal ? "Send for approval" : "Save payment"}
            </button>
            <button type="button" className={SECONDARY} onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
      {receipt ? (
        <Receipt
          action={
            receipt.undo ? (
              <button type="button" className={QUIET} onClick={undoPayment} disabled={undo.saving}>
                {undo.saving ? "Undoing…" : "Undo"}
              </button>
            ) : null
          }
        >
          {receipt.text}
        </Receipt>
      ) : null}
      <FormError state={undo.state} />
    </div>
  );
}
