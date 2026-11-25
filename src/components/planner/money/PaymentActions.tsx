"use client";

import { useId, useState, type FormEvent } from "react";

import { parseAmountInput, type Dispatch } from "@/components/planner/forms/command";
import { useCommand } from "@/components/planner/forms/useCommand";
import { formatTime } from "@/components/planner/format";
import type { VoicePrefillEntry } from "@/contracts/commands";
import type { MemberRole, WeddingId } from "@/contracts/domain";
import { formatInr } from "@/contracts/money";
import type { PaymentView } from "@/contracts/read-models";

import { Field, FormError, INPUT, PRIMARY, QUIET, Receipt, SECONDARY } from "./form-parts";
import { moneyEnvelope, saveModeFor } from "./gated";

export type PaymentActionsProps = {
  wedding_id: WeddingId;
  /** The id of the row's own text (kind and amount), so each repeated button names its row. */
  described_by?: string;
  payment: PaymentView;
  role: MemberRole;
  /** The signed-in member's display name, for the receipt. */
  actor_name: string;
  dispatch: Dispatch;
  /** A voice prefill for `correct_payment` on this payment (voice.md 6.3). */
  prefill?: VoicePrefillEntry;
};

type Panel = "none" | "correct" | "void";

function prefillAmount(prefill: VoicePrefillEntry | undefined): string | null {
  const value = prefill?.input.amount_inr;
  return typeof value === "number" ? String(value) : null;
}

/**
 * The controls on one payment row (C1–C9): Correct payment (new amount and reason, the old
 * amount struck through in the form) and Void payment (behind a confirm). Saves wait for the
 * server; the receipt stays under the row, with Undo after a correction (another correction
 * back to the old amount). A manager's save goes out for approval instead.
 */
export function PaymentActions({ wedding_id, described_by, payment, role, actor_name, dispatch, prefill }: PaymentActionsProps) {
  const id = useId();
  const fromVoice = prefill?.command === "correct_payment";
  const [panel, setPanel] = useState<Panel>(fromVoice ? "correct" : "none");
  const [amountText, setAmountText] = useState(fromVoice ? (prefillAmount(prefill) ?? "") : "");
  const [reason, setReason] = useState(
    fromVoice && typeof prefill?.input.change_reason === "string" ? prefill.input.change_reason : "",
  );
  const [voidReason, setVoidReason] = useState("");
  const [amountError, setAmountError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ text: string; undo: { from: number; version_no: number } | null } | null>(null);

  const correct = useCommand(dispatch);
  const voider = useCommand(dispatch);
  const undo = useCommand(dispatch);

  const correctMode = saveModeFor("correct_payment", role);
  const voidMode = saveModeFor("void_payment", role);
  if (correctMode === "none") return null;
  // After a void the refresh brings `voided`; the receipt stays, the controls go.
  if (payment.voided) return receipt ? <Receipt>{receipt.text}</Receipt> : null;

  const proposal = correctMode === "proposal";
  const time = () => formatTime(new Date().toISOString());

  function open(next: Panel) {
    setPanel(next);
    setReceipt(null);
    setAmountError(null);
    correct.reset();
    voider.reset();
    undo.reset();
  }

  async function saveCorrection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseAmountInput(amountText);
    if (!parsed.ok) {
      setAmountError(parsed.message);
      return;
    }
    setAmountError(null);
    const old = payment.amount_inr;
    const response = await correct.submit(
      moneyEnvelope(wedding_id, correctMode, "correct_payment", {
        payment_id: payment.payment_id,
        expected_version: payment.version_no,
        amount_inr: parsed.value,
        ...(reason.trim() ? { change_reason: reason.trim() } : {}),
      }),
    );
    if (!response.ok) return;
    setPanel("none");
    setAmountText("");
    setReason("");
    if (response.outcome === "proposed") {
      setReceipt({ text: "Sent to the owner for approval. The ledger hasn't changed.", undo: null });
      return;
    }
    const version_no = response.command === "correct_payment" ? response.result.version_no : payment.version_no;
    setReceipt({ text: `Saved by ${actor_name}, ${time()}.`, undo: { from: old, version_no } });
  }

  async function saveVoid(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await voider.submit(
      moneyEnvelope(wedding_id, voidMode, "void_payment", {
        payment_id: payment.payment_id,
        expected_version: payment.version_no,
        ...(voidReason.trim() ? { void_reason: voidReason.trim() } : {}),
      }),
    );
    if (!response.ok) return;
    setPanel("none");
    setVoidReason("");
    setReceipt({
      text:
        response.outcome === "proposed"
          ? "Sent to the owner for approval. The ledger hasn't changed."
          : `Voided by ${actor_name}, ${time()}. It stays listed, struck through.`,
      undo: null,
    });
  }

  async function undoCorrection() {
    if (!receipt?.undo) return;
    const response = await undo.submit(
      moneyEnvelope(wedding_id, correctMode, "correct_payment", {
        payment_id: payment.payment_id,
        expected_version: receipt.undo.version_no,
        amount_inr: receipt.undo.from,
        change_reason: "Undo",
      }),
    );
    if (response.ok) setReceipt({ text: `Changed back to ${formatInr(receipt.undo.from)} by ${actor_name}, ${time()}.`, undo: null });
  }

  return (
    <div className="flex flex-col gap-2">
      {panel === "none" ? (
        <div className="-ml-2 flex flex-wrap gap-2">
          <button type="button" className={QUIET} aria-describedby={described_by} onClick={() => open("correct")}>
            Correct payment
          </button>
          {voidMode !== "none" ? (
            <button type="button" className={QUIET} aria-describedby={described_by} onClick={() => open("void")}>
              Void payment
            </button>
          ) : null}
        </div>
      ) : null}

      {panel === "correct" ? (
        <form onSubmit={saveCorrection} noValidate className="flex w-full max-w-md flex-col gap-3 rounded-paper bg-ivory p-3">
          <p className="text-table text-ink-2">
            Replacing{" "}
            <del className="font-medium text-ink-3 tabular-nums decoration-ink-3 decoration-[1.5px]">
              {formatInr(payment.amount_inr)}
            </del>
          </p>
          <Field id={`${id}-amount`} label="Correct amount" error={amountError} fromVoice={fromVoice && prefillAmount(prefill) !== null}>
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
          <Field id={`${id}-reason`} label="Reason (optional)">
            <input
              id={`${id}-reason`}
              name="reason"
              maxLength={200}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className={INPUT}
            />
          </Field>
          <FormError state={correct.state} />
          <div className="flex flex-wrap gap-2">
            <button type="submit" className={PRIMARY} disabled={correct.saving}>
              {correct.saving ? "Saving…" : proposal ? "Send for approval" : "Save correction"}
            </button>
            <button type="button" className={SECONDARY} onClick={() => open("none")}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {panel === "void" ? (
        <form onSubmit={saveVoid} noValidate className="flex w-full max-w-md flex-col gap-3 rounded-paper bg-ivory p-3">
          <p className="text-table text-ink">
            Void this {formatInr(payment.amount_inr)} payment? It stays listed, struck through, and leaves the totals.
          </p>
          <Field id={`${id}-void-reason`} label="Reason (optional)">
            <input
              id={`${id}-void-reason`}
              name="void_reason"
              maxLength={200}
              value={voidReason}
              onChange={(event) => setVoidReason(event.target.value)}
              className={INPUT}
            />
          </Field>
          <FormError state={voider.state} />
          <div className="flex flex-wrap gap-2">
            <button type="submit" className={PRIMARY} disabled={voider.saving}>
              {voider.saving ? "Saving…" : voidMode === "proposal" ? "Send for approval" : "Void payment"}
            </button>
            <button type="button" className={SECONDARY} onClick={() => open("none")}>
              Keep it
            </button>
          </div>
        </form>
      ) : null}

      {receipt ? (
        <Receipt
          action={
            receipt.undo ? (
              <button type="button" className={QUIET} onClick={undoCorrection} disabled={undo.saving}>
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
