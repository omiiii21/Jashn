/**
 * Shared plumbing for planner forms. Every write goes through `dispatchCommand` (D98), which a
 * server page passes down as the `dispatch` prop; this file never imports `src/server/`.
 * Money saves are never optimistic: the form waits for the server and then refreshes the page.
 */
import type { CommandEnvelope, CommandErrorBody, CommandResponse } from "@/contracts/commands";
import { MAX_AMOUNT_INR } from "@/contracts/money";

/** The `dispatchCommand` server action as a client prop. */
export type Dispatch = (envelope: CommandEnvelope) => Promise<CommandResponse>;

/** I1: an opaque key, made when the confirmation appears and reused on a retry or double tap. */
export function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export type AmountParse = { ok: true; value: number } | { ok: false; message: string };

/**
 * AT-5.6's form rule: digits, with or without Indian commas ("40,000", "40000", "1,50,000").
 * Anything else ("40k", "40,000.50", "forty thousand", "-5,000") is refused next to the field.
 * Parsing the typed text is not arithmetic on a figure; it turns the field into whole rupees.
 */
export function parseAmountInput(raw: string): AmountParse {
  const text = raw.trim().replace(/^₹\s?/, "");
  if (text.length === 0) return { ok: false, message: "Enter an amount in rupees, like 40,000." };
  const plain = /^\d+$/.test(text);
  const indian = /^\d{1,2}(,\d{2})*,\d{3}$/.test(text) || /^\d{1,3},\d{3}$/.test(text);
  if (!plain && !indian) {
    return { ok: false, message: "Use digits only, like 40,000 or 40000. No decimals, words or letters." };
  }
  const value = Number(text.replace(/,/g, ""));
  if (!Number.isSafeInteger(value) || value <= 0) return { ok: false, message: "The amount must be more than ₹0." };
  if (value > MAX_AMOUNT_INR) return { ok: false, message: "That is more than ₹100 crore. Check the amount." };
  return { ok: true, value };
}

/** The words for a refused command, shown beside the form (never a toast). */
export function commandErrorText(error: CommandErrorBody): string {
  switch (error.code) {
    case "stale_version":
      return "Someone changed this while you were editing. The current value is shown; check it and save again.";
    case "idempotency_key_reused":
      return "This was already saved. Refresh to see it before changing it again.";
    case "proposal_changed":
      return "The record changed after this proposal was made, so it stays pending. Ask for a fresh proposal.";
    case "approval_required":
      return "This change needs an owner's approval. Send it for approval instead.";
    case "forbidden":
      return "Only an owner can do this.";
    case "unauthenticated":
      return "Your session ended. Sign in again to save.";
    case "voice_writes_paused":
      return "Voice changes are switched off right now. You can type the change and save it.";
    case "draft_changed":
      return "The draft changed after you opened this. Review the latest changes and try again.";
    case "not_invited":
      return error.message || "That guest isn't invited to this function.";
    case "amount_mismatch":
      return "The amount doesn't match quantity × price. Check both.";
    case "payment_void":
      return "This payment is void, so it can't be changed.";
    case "proposal_not_pending":
      return "This proposal was already decided.";
    case "duplicate_requirement":
      return "That requirement is already on this function.";
    case "rate_limited":
      return "Too many saves at once. Wait a few seconds and try again.";
    case "validation_failed":
      return error.message && !/^[a-z_]+$/.test(error.message)
        ? error.message
        : `Check ${error.field ? `the ${error.field.replace(/_/g, " ")} field` : "the form"}: ${humanValidation(error.message)}.`;
    default:
      return error.message || "That didn't save. Try again.";
  }
}

function humanValidation(word: string): string {
  switch (word) {
    case "out_of_range":
      return "the value is out of range";
    case "not_integer":
      return "use whole rupees";
    case "too_long":
      return "it is too long";
    case "time_order":
      return "the end must be after the start";
    case "required":
      return "it is required";
    default:
      return word.replace(/_/g, " ");
  }
}

export type SubmitState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved"; response: Extract<CommandResponse, { ok: true }> }
  | { status: "error"; error: CommandErrorBody };
