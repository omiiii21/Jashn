import "server-only";

import { and, asc, eq, inArray, isNull, ne, sql } from "drizzle-orm";

import {
  CommandFailure,
  type CommandErrorCode,
  type CommandName,
  type CommandResult,
  type CommandWarning,
  type GatedCommand,
  type MoneyCommandResult,
  type ParsedCommandInput,
  type PaymentCommandResult,
} from "@/contracts/commands";
import {
  BUDGET_CATEGORY_LABELS,
  PAYMENT_KIND_LABELS,
  PAYMENT_METHOD_LABELS,
  type BudgetCategory,
  type CommandSource,
  type CommitmentPricing,
  type CommitmentUnit,
  type IsoDate,
  type JsonObject,
  type JsonValue,
  type PaymentKind,
  type PaymentMethod,
  type SessionActor,
  type VendorStatus,
  type WeddingId,
} from "@/contracts/domain";
import { MAX_AMOUNT_INR, formatInr, groupIndian } from "@/contracts/money";
import type {
  ActivityEntryDraft,
  CommandHandler,
  CommandHandlerContext,
  CommandHandlerResult,
  HandlerMap,
} from "@/contracts/services";
import type { Tx } from "@/db/client";
import { istToday } from "@/db/ist";
import {
  budgetLines,
  commitmentVersions,
  commitments,
  events,
  members,
  paymentVersions,
  payments,
  quotes,
  vendorEvents,
  vendors,
  voiceTurns,
} from "@/db/schema";
import { moneyWarnings, vendorTotals } from "@/server/read-models/ledger-math";

import { formatWeddingDate } from "./wedding-profile";

/**
 * A3's vendor and money commands (domain-and-data 3.3, rules M1–M8, C1–C10, E1) and the
 * planning layer the proposal commands share (3.5, A1–A6).
 *
 * The dispatcher has already resolved the actor, applied the role matrix (a manager's gated
 * command is 403 `approval_required` before it gets here), parsed the input, run the voice
 * gate, checked the receipt and locked the `weddings` row. Each handler here locks the rows
 * it changes, checks that every referenced id belongs to the wedding (an id from another
 * wedding is 404 `not_found`), applies the rules and returns the finished activity entry.
 * It never writes activity, versions of `weddings` or receipts itself.
 *
 * The seven gated commands (A1) are split into a plan and an apply step, so that
 * `propose_change` validates a manager's input exactly as the command would (types, ids, M3)
 * and computes the deltas without writing, and `approve_proposal` runs the same plan, under
 * row locks, as the approving owner (`src/server/commands/proposals.ts`).
 *
 * Versions (C1–C3, C10): a correction locks the identity row, sets `superseded_at` on
 * version n, inserts version n+1, then sets `superseded_by_version_id` on version n and
 * `current_version_no` on the identity, in that order (the one-current-version index is a
 * partial unique index checked row by row). Identical values answer `unchanged` (C8).
 */

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

function failure(code: CommandErrorCode, message: string, field: string | null = null, current?: JsonValue): CommandFailure {
  return new CommandFailure(current === undefined ? { code, message, field } : { code, message, field, current });
}

const notFound = (field: string) => failure("not_found", "Not found.", field);
const invalid = (field: string, message: string, current?: JsonValue) => failure("validation_failed", message, field, current);

// ---------------------------------------------------------------------------
// Pure parts (unit-tested in ledger.test.ts)
// ---------------------------------------------------------------------------

export type Language = "en" | "hi";
export type Text = { en: string; hi: string };

export type PricingInput = {
  pricing: CommitmentPricing;
  unit?: CommitmentUnit | null;
  unit_price_inr?: number | null;
  quantity?: number | null;
  amount_inr?: number | null;
};

export type PricingValues = {
  pricing: CommitmentPricing;
  unit: CommitmentUnit | null;
  unit_price_inr: number | null;
  quantity: number | null;
  amount_inr: number;
};

/**
 * M2 and M3. `per_unit`: `amount_inr` is computed as `unit_price_inr` × `quantity`; a sent
 * amount is only a check and a different one fails with `amount_mismatch`; the product may
 * not pass ₹100 crore. `lump_sum`: `amount_inr` is required and the unit fields are dropped.
 */
export function resolvePricing(input: PricingInput): PricingValues {
  if (input.pricing === "per_unit") {
    const unit = input.unit ?? null;
    const unit_price_inr = input.unit_price_inr ?? null;
    const quantity = input.quantity ?? null;
    if (unit === null) throw invalid("unit", "required");
    if (unit_price_inr === null) throw invalid("unit_price_inr", "required");
    if (quantity === null) throw invalid("quantity", "required");
    const amount_inr = unit_price_inr * quantity;
    if (!Number.isSafeInteger(amount_inr) || amount_inr > MAX_AMOUNT_INR) throw invalid("quantity", "out_of_range");
    if (input.amount_inr !== undefined && input.amount_inr !== null && input.amount_inr !== amount_inr) {
      throw failure(
        "amount_mismatch",
        `The amount must be ${groupIndian(quantity)} × ${formatInr(unit_price_inr)} = ${formatInr(amount_inr)}.`,
        "amount_inr",
        { amount_inr, unit_price_inr, quantity },
      );
    }
    return { pricing: "per_unit", unit, unit_price_inr, quantity, amount_inr };
  }
  if (input.amount_inr === undefined || input.amount_inr === null) throw invalid("amount_inr", "required");
  return { pricing: "lump_sum", unit: null, unit_price_inr: null, quantity: null, amount_inr: input.amount_inr };
}

/** One commitment version's values (C10). */
export type CommitmentValues = PricingValues & {
  event_id: string | null;
  description: string | null;
  agreed_on: IsoDate | null;
  due_on: IsoDate | null;
};

export const COMMITMENT_VALUE_FIELDS = [
  "pricing",
  "unit",
  "unit_price_inr",
  "quantity",
  "amount_inr",
  "event_id",
  "description",
  "agreed_on",
  "due_on",
] as const;

export type CommitmentPatch = {
  pricing?: CommitmentPricing;
  unit?: CommitmentUnit;
  unit_price_inr?: number;
  quantity?: number;
  amount_inr?: number;
  event_id?: string | null;
  description?: string | null;
  agreed_on?: IsoDate | null;
  due_on?: IsoDate | null;
};

/**
 * `update_commitment`: the current version with the sent fields replaced, with M3 applied
 * to the result. For `per_unit` the amount is recomputed and a sent amount is only a check;
 * a `lump_sum` keeps its amount unless one is sent.
 */
export function mergeCommitment(current: CommitmentValues, patch: CommitmentPatch): CommitmentValues {
  const pricing = patch.pricing ?? current.pricing;
  const priced = resolvePricing({
    pricing,
    unit: patch.unit ?? current.unit,
    unit_price_inr: patch.unit_price_inr ?? current.unit_price_inr,
    quantity: patch.quantity ?? current.quantity,
    amount_inr: patch.amount_inr ?? (pricing === "lump_sum" ? current.amount_inr : null),
  });
  return {
    ...priced,
    event_id: patch.event_id !== undefined ? patch.event_id : current.event_id,
    description: patch.description !== undefined ? patch.description : current.description,
    agreed_on: patch.agreed_on !== undefined ? patch.agreed_on : current.agreed_on,
    due_on: patch.due_on !== undefined ? patch.due_on : current.due_on,
  };
}

/** One payment version's values (C1). */
export type PaymentValues = {
  amount_inr: number;
  paid_on: IsoDate | null;
  method: PaymentMethod | null;
  note: string | null;
};

export const PAYMENT_VALUE_FIELDS = ["amount_inr", "paid_on", "method", "note"] as const;

export type PaymentPatch = {
  amount_inr?: number;
  paid_on?: IsoDate | null;
  method?: PaymentMethod;
  note?: string;
};

/** `correct_payment`: the current version with the sent fields replaced (`paid_on` null clears it). */
export function mergePayment(current: PaymentValues, patch: PaymentPatch): PaymentValues {
  return {
    amount_inr: patch.amount_inr ?? current.amount_inr,
    paid_on: patch.paid_on !== undefined ? patch.paid_on : current.paid_on,
    method: patch.method ?? current.method,
    note: patch.note ?? current.note,
  };
}

export type FieldChange = { field: string; from: JsonValue; to: JsonValue };

function sameValue(a: JsonValue | undefined, b: JsonValue | undefined): boolean {
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((value, index) => value === b[index]);
  return (a ?? null) === (b ?? null);
}

/** The fields whose value differs, in `fields` order (C8: none means `unchanged`). */
export function diffValues<T extends { [K in F]: JsonValue }, F extends string>(
  current: T,
  next: T,
  fields: readonly F[],
): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const field of fields) {
    if (!sameValue(current[field], next[field])) changes.push({ field, from: current[field] ?? null, to: next[field] ?? null });
  }
  return changes;
}

/** `before` and `after` of an activity entry: the changed fields only (L2). */
export function beforeAfter(changes: readonly FieldChange[], omit: readonly string[] = []): { before: JsonObject; after: JsonObject } {
  const before: JsonObject = {};
  const after: JsonObject = {};
  for (const change of changes) {
    if (omit.includes(change.field)) continue;
    before[change.field] = change.from;
    after[change.field] = change.to;
  }
  return { before, after };
}

export type FieldSpec = {
  en: string;
  hi: string;
  /** How a value reads in the sentence. */
  show?: (value: JsonValue, language: Language) => string;
  /** Long text or contact values: the sentence says only that the field changed. */
  quiet?: boolean;
};

/** `{changes}`: "due date Sat 12 Dec 2026 to Tue 15 Dec 2026, method UPI to Cash" (en) / "… से …" (hi). */
export function describeChanges(changes: readonly FieldChange[], specs: Record<string, FieldSpec>, language: Language): string {
  return changes
    .map((change) => {
      const spec = specs[change.field] ?? { en: change.field, hi: change.field };
      const label = spec[language];
      if (spec.quiet) return language === "en" ? `${label} changed` : `${label} बदला`;
      const show = (value: JsonValue) => (spec.show ? spec.show(value, language) : String(value));
      if (change.to === null) return language === "en" ? `${label} cleared` : `${label} हटाया`;
      if (change.from === null) return language === "en" ? `${label} set to ${show(change.to)}` : `${label} ${show(change.to)}`;
      return language === "en" ? `${label} ${show(change.from)} to ${show(change.to)}` : `${label} ${show(change.from)} से ${show(change.to)}`;
    })
    .join(", ");
}

const showInr = (value: JsonValue) => formatInr(Number(value));
const showDate = (value: JsonValue) => formatWeddingDate(String(value));

const PRICING_WORDS: Record<CommitmentPricing, Text> = {
  lump_sum: { en: "lump sum", hi: "एकमुश्त" },
  per_unit: { en: "per unit", hi: "प्रति इकाई" },
};

const UNIT_WORDS: Record<CommitmentUnit, Text> = {
  plate: { en: "plate", hi: "प्लेट" },
  person: { en: "person", hi: "व्यक्ति" },
  item: { en: "item", hi: "आइटम" },
  hour: { en: "hour", hi: "घंटा" },
  day: { en: "day", hi: "दिन" },
};

const VENDOR_STATUS_WORDS: Record<VendorStatus, Text> = {
  considering: { en: "considering", hi: "विचार में" },
  booked: { en: "booked", hi: "बुक" },
  cancelled: { en: "cancelled", hi: "रद्द" },
};

/** The commitment fields as `{changes}` names them; `event_titles` maps function ids to titles. */
export function commitmentFieldSpecs(event_titles: ReadonlyMap<string, Text> = new Map()): Record<string, FieldSpec> {
  return {
    pricing: { en: "pricing", hi: "कीमत का तरीका", show: (value, language) => PRICING_WORDS[value as CommitmentPricing]?.[language] ?? String(value) },
    unit: { en: "unit", hi: "इकाई", show: (value, language) => UNIT_WORDS[value as CommitmentUnit]?.[language] ?? String(value) },
    unit_price_inr: { en: "rate", hi: "दर", show: showInr },
    quantity: { en: "quantity", hi: "संख्या", show: (value) => groupIndian(Number(value)) },
    amount_inr: { en: "amount", hi: "रकम", show: showInr },
    event_id: { en: "function", hi: "कार्यक्रम", show: (value, language) => event_titles.get(String(value))?.[language] ?? String(value) },
    description: { en: "basis", hi: "विवरण", quiet: true },
    agreed_on: { en: "agreed on", hi: "तय होने की तारीख", show: showDate },
    due_on: { en: "balance due", hi: "बाकी रकम की तारीख", show: showDate },
  };
}

export const PAYMENT_FIELD_SPECS: Record<string, FieldSpec> = {
  amount_inr: { en: "amount", hi: "रकम", show: showInr },
  paid_on: { en: "date", hi: "तारीख", show: showDate },
  method: { en: "method", hi: "तरीका", show: (value) => PAYMENT_METHOD_LABELS[value as PaymentMethod] ?? String(value) },
  note: { en: "note", hi: "नोट", quiet: true },
};

export const VENDOR_FIELD_SPECS: Record<string, FieldSpec> = {
  name: { en: "name", hi: "नाम" },
  vendor_category: {
    en: "category",
    hi: "श्रेणी",
    show: (value, language) => BUDGET_CATEGORY_LABELS[value as BudgetCategory]?.[language] ?? String(value),
  },
  status: { en: "status", hi: "स्थिति", show: (value, language) => VENDOR_STATUS_WORDS[value as VendorStatus]?.[language] ?? String(value) },
  contact_name: { en: "contact", hi: "संपर्क" },
  contact_phone: { en: "phone", hi: "फ़ोन", quiet: true },
  event_ids: { en: "functions", hi: "कार्यक्रम", quiet: true },
  notes: { en: "notes", hi: "नोट", quiet: true },
};

/** `{kind}` / `{kind_hi}` (3.0): advance/एडवांस, instalment/किस्त, final payment/आख़िरी भुगतान. */
export function kindWords(kind: PaymentKind): Text {
  return { en: PAYMENT_KIND_LABELS[kind].in_sentence, hi: PAYMENT_KIND_LABELS[kind].hi };
}

/** "an advance", "an instalment", "a final payment" (3.3, `record_payment`). */
export function kindWithArticle(kind: PaymentKind): string {
  return `${kind === "final" ? "a" : "an"} ${kindWords(kind).en}`;
}

function categoryWords(category: BudgetCategory): Text {
  return BUDGET_CATEGORY_LABELS[category];
}

// The activity templates of 3.3, filled in code (L3).

export function vendorAddedText(actor: string, vendor: string, category: BudgetCategory): Text {
  const words = categoryWords(category);
  return {
    en: `${actor} added the vendor ${vendor} (${words.en}).`,
    hi: `${actor} ने वेंडर ${vendor} जोड़ा (${words.hi})।`,
  };
}

export function vendorUpdatedText(actor: string, vendor: string, changes: readonly FieldChange[]): Text {
  return {
    en: `${actor} updated the vendor ${vendor}: ${describeChanges(changes, VENDOR_FIELD_SPECS, "en")}.`,
    hi: `${actor} ने वेंडर ${vendor} की जानकारी बदली: ${describeChanges(changes, VENDOR_FIELD_SPECS, "hi")}।`,
  };
}

export function quoteAddedText(actor: string, vendor: string, amount_inr: number): Text {
  const amount = formatInr(amount_inr);
  return { en: `${actor} added a quote from ${vendor}: ${amount}.`, hi: `${actor} ने ${vendor} का कोटेशन जोड़ा: ${amount}।` };
}

export function commitmentRecordedText(actor: string, vendor: string, values: PricingValues): Text {
  const amount = formatInr(values.amount_inr);
  if (values.pricing === "per_unit" && values.unit && values.quantity !== null && values.unit_price_inr !== null) {
    const quantity = groupIndian(values.quantity);
    const unitWord = values.quantity === 1 ? values.unit : `${values.unit}s`;
    const price = formatInr(values.unit_price_inr);
    return {
      en: `${actor} agreed ${amount} with ${vendor} (${quantity} ${unitWord} × ${price}).`,
      hi: `${actor} ने ${vendor} के साथ ${amount} तय किया (${quantity} × ${price})।`,
    };
  }
  return { en: `${actor} agreed ${amount} with ${vendor}.`, hi: `${actor} ने ${vendor} के साथ ${amount} तय किया।` };
}

export function commitmentUpdatedText(actor: string, vendor: string, changes: readonly FieldChange[], specs: Record<string, FieldSpec>): Text {
  const amount = changes.find((change) => change.field === "amount_inr");
  if (amount) {
    const from = formatInr(Number(amount.from));
    const to = formatInr(Number(amount.to));
    return {
      en: `${actor} changed the agreed amount with ${vendor} from ${from} to ${to}.`,
      hi: `${actor} ने ${vendor} के साथ तय रकम ${from} से बदलकर ${to} की।`,
    };
  }
  return {
    en: `${actor} changed the commitment with ${vendor}: ${describeChanges(changes, specs, "en")}.`,
    hi: `${actor} ने ${vendor} के साथ तय शर्तें बदलीं: ${describeChanges(changes, specs, "hi")}।`,
  };
}

export function commitmentVoidedText(actor: string, vendor: string, amount_inr: number): Text {
  const amount = formatInr(amount_inr);
  return {
    en: `${actor} cancelled the ${amount} commitment with ${vendor}.`,
    hi: `${actor} ने ${vendor} के साथ तय ${amount} रद्द किया।`,
  };
}

export function paymentRecordedText(actor: string, vendor: string, kind: PaymentKind, amount_inr: number): Text {
  const amount = formatInr(amount_inr);
  return {
    en: `${actor} recorded ${kindWithArticle(kind)} of ${amount} to ${vendor}.`,
    hi: `${actor} ने ${vendor} को ${amount} का ${kindWords(kind).hi} दर्ज किया।`,
  };
}

export function paymentCorrectedText(actor: string, vendor: string, kind: PaymentKind, changes: readonly FieldChange[]): Text {
  const words = kindWords(kind);
  const amount = changes.find((change) => change.field === "amount_inr");
  if (amount) {
    const from = formatInr(Number(amount.from));
    const to = formatInr(Number(amount.to));
    return {
      en: `${actor} corrected the ${words.en} to ${vendor} from ${from} to ${to}.`,
      hi: `${actor} ने ${vendor} का ${words.hi} ${from} से बदलकर ${to} किया।`,
    };
  }
  return {
    en: `${actor} corrected the ${words.en} to ${vendor}: ${describeChanges(changes, PAYMENT_FIELD_SPECS, "en")}.`,
    hi: `${actor} ने ${vendor} के ${words.hi} में सुधार किया: ${describeChanges(changes, PAYMENT_FIELD_SPECS, "hi")}।`,
  };
}

export function paymentVoidedText(actor: string, vendor: string, kind: PaymentKind, amount_inr: number): Text {
  const amount = formatInr(amount_inr);
  const words = kindWords(kind);
  return {
    en: `${actor} voided the ${amount} ${words.en} to ${vendor}.`,
    hi: `${actor} ने ${vendor} को दिया गया ${amount} का ${words.hi} रद्द किया।`,
  };
}

export function expenseRecordedText(actor: string, vendor: string, amount_inr: number, category: BudgetCategory): Text {
  const amount = formatInr(amount_inr);
  const words = categoryWords(category);
  return {
    en: `${actor} recorded an expense of ${amount} to ${vendor} (${words.en}).`,
    hi: `${actor} ने ${vendor} को ${amount} का खर्च दर्ज किया (${words.hi})।`,
  };
}

export function budgetLineText(actor: string, category: BudgetCategory, old_inr: number | null, new_inr: number): Text {
  const words = categoryWords(category);
  const to = formatInr(new_inr);
  return {
    en: `${actor} set the ${words.en} budget to ${to} (was ${old_inr === null ? "not set" : formatInr(old_inr)}).`,
    hi: `${actor} ने ${words.hi} का बजट ${old_inr === null ? "तय नहीं" : formatInr(old_inr)} से बदलकर ${to} किया।`,
  };
}

// The `{summary}` / `{summary_hi}` table of 3.5.

/** `{paid_state}`: "paid in full" / "पूरा भुगतान हो चुका", or "not yet paid" / "भुगतान बाकी". */
export function paidStateWords(paid_in_full: boolean): Text {
  return paid_in_full ? { en: "paid in full", hi: "पूरा भुगतान हो चुका" } : { en: "not yet paid", hi: "भुगतान बाकी" };
}

export const proposalSummaries = {
  record_commitment(vendor: string, amount_inr: number): Text {
    const amount = formatInr(amount_inr);
    return { en: `a commitment of ${amount} with ${vendor}`, hi: `${vendor} के साथ ${amount} तय करना` };
  },
  update_commitment(vendor: string, changes: readonly FieldChange[], specs: Record<string, FieldSpec>): Text {
    const amount = changes.find((change) => change.field === "amount_inr");
    if (amount) {
      const from = formatInr(Number(amount.from));
      const to = formatInr(Number(amount.to));
      return {
        en: `changing the agreed amount with ${vendor} from ${from} to ${to}`,
        hi: `${vendor} के साथ तय रकम ${from} से ${to} करना`,
      };
    }
    // 3.5 names only the amount form; other fields follow update_commitment's own wording.
    return {
      en: `changing the commitment with ${vendor}: ${describeChanges(changes, specs, "en")}`,
      hi: `${vendor} के साथ तय शर्तें बदलना: ${describeChanges(changes, specs, "hi")}`,
    };
  },
  void_commitment(vendor: string, amount_inr: number): Text {
    const amount = formatInr(amount_inr);
    return { en: `cancelling the ${amount} commitment with ${vendor}`, hi: `${vendor} के साथ तय ${amount} रद्द करना` };
  },
  record_payment(vendor: string, amount_inr: number): Text {
    const amount = formatInr(amount_inr);
    return { en: `a payment of ${amount} to ${vendor}`, hi: `${vendor} को ${amount} का भुगतान` };
  },
  correct_payment(vendor: string, kind: PaymentKind, changes: readonly FieldChange[]): Text {
    const words = kindWords(kind);
    const amount = changes.find((change) => change.field === "amount_inr");
    if (amount) {
      const from = formatInr(Number(amount.from));
      const to = formatInr(Number(amount.to));
      return {
        en: `correcting the ${words.en} to ${vendor} from ${from} to ${to}`,
        hi: `${vendor} का ${words.hi} ${from} से ${to} करना`,
      };
    }
    // 3.5 names only the amount form; other fields follow correct_payment's own wording.
    return {
      en: `correcting the ${words.en} to ${vendor}: ${describeChanges(changes, PAYMENT_FIELD_SPECS, "en")}`,
      hi: `${vendor} के ${words.hi} में सुधार: ${describeChanges(changes, PAYMENT_FIELD_SPECS, "hi")}`,
    };
  },
  void_payment(vendor: string, kind: PaymentKind, amount_inr: number): Text {
    const amount = formatInr(amount_inr);
    const words = kindWords(kind);
    return { en: `voiding the ${amount} ${words.en} to ${vendor}`, hi: `${vendor} को दिया ${amount} का ${words.hi} रद्द करना` };
  },
  record_expense(vendor: string, amount_inr: number, category: BudgetCategory, paid_in_full: boolean): Text {
    const amount = formatInr(amount_inr);
    const words = categoryWords(category);
    const state = paidStateWords(paid_in_full);
    return {
      en: `an expense of ${amount} to ${vendor} (${words.en}), ${state.en}`,
      hi: `${vendor} को ${amount} का खर्च (${words.hi}), ${state.hi}`,
    };
  },
};

/** E1: per plate or per person needs a function, so the estimate has a headcount. */
export function needsEventForEstimate(values: Pick<PricingValues, "pricing" | "unit">): boolean {
  return values.pricing === "per_unit" && (values.unit === "plate" || values.unit === "person");
}

/** Whether `paid_on` is after today in IST (validation: "not after today"). */
export function isAfterToday(paid_on: IsoDate | null | undefined, today: IsoDate): boolean {
  return Boolean(paid_on) && String(paid_on) > today;
}

// ---------------------------------------------------------------------------
// The command context: who, when, from where
// ---------------------------------------------------------------------------

export type LedgerActor = SessionActor & { member_id: string; wedding_id: WeddingId };

export type LedgerContext = {
  tx: Tx;
  wedding_id: WeddingId;
  actor: LedgerActor;
  now: Date;
  /** IST calendar date of `now` (paid_on "not after today", default dates). */
  today: IsoDate;
  /** Stored on every version (C7): `ui` or `voice`. */
  source: CommandSource;
  voice_turn_id: string | null;
  /** The turn's transcript, stored on versions for voice (C7, M-03). */
  spoken_text: string | null;
};

/** The member running a money command (the approving owner, for a proposal). */
export async function ledgerContextFor<C extends CommandName>(context: CommandHandlerContext<C, Tx>): Promise<LedgerContext> {
  const actor = context.actor;
  if (actor.kind === "guest" || actor.kind === "system" || !actor.member_id || !context.wedding_id || actor.wedding_id !== context.wedding_id) {
    throw failure("forbidden", "You are not a member of this wedding.");
  }
  const now = new Date(context.now);
  const source: CommandSource = context.envelope.source === "voice" ? "voice" : "ui";
  const voice_turn_id = source === "voice" ? (context.envelope.voice_turn_id ?? null) : null;
  let spoken_text: string | null = null;
  if (voice_turn_id) {
    const rows = await context.tx
      .select({ transcript: voiceTurns.transcript })
      .from(voiceTurns)
      .where(and(eq(voiceTurns.id, voice_turn_id), eq(voiceTurns.wedding_id, context.wedding_id)))
      .limit(1);
    spoken_text = rows[0]?.transcript ?? null;
  }
  return {
    tx: context.tx,
    wedding_id: context.wedding_id,
    actor: { ...actor, member_id: actor.member_id, wedding_id: context.wedding_id },
    now,
    today: istToday(now),
    source,
    voice_turn_id,
    spoken_text,
  };
}

// ---------------------------------------------------------------------------
// Row loaders. Every id is selected with the wedding id too (domain 5.0): an id from
// another wedding reads as missing, so it answers 404 like an unknown id.
// ---------------------------------------------------------------------------

export type VendorRow = {
  id: string;
  name: string;
  vendor_category: BudgetCategory;
  status: VendorStatus;
  is_one_off: boolean;
  contact_name: string | null;
  contact_phone: string | null;
  notes: string | null;
};

const vendorColumns = {
  id: vendors.id,
  name: vendors.name,
  vendor_category: vendors.vendor_category,
  status: vendors.status,
  is_one_off: vendors.is_one_off,
  contact_name: vendors.contact_name,
  contact_phone: vendors.contact_phone,
  notes: vendors.notes,
};

function vendorJson(vendor: VendorRow): JsonObject {
  return { vendor_id: vendor.id, name: vendor.name, vendor_category: vendor.vendor_category, status: vendor.status, is_one_off: vendor.is_one_off };
}

export async function loadVendor(lc: LedgerContext, vendor_id: string, options: { lock?: boolean; field?: string } = {}): Promise<VendorRow> {
  const query = lc.tx
    .select(vendorColumns)
    .from(vendors)
    .where(and(eq(vendors.id, vendor_id), eq(vendors.wedding_id, lc.wedding_id), isNull(vendors.deleted_at)))
    .limit(1);
  const rows = options.lock ? await query.for("update") : await query;
  const vendor = rows[0];
  if (!vendor) throw notFound(options.field ?? "vendor_id");
  return vendor;
}

/** The wedding's vendor with this name, ignoring case (names are trimmed by the schema). */
export async function findVendorByName(
  lc: LedgerContext,
  name: string,
  options: { lock?: boolean; exclude_id?: string } = {},
): Promise<VendorRow | null> {
  const conditions = [eq(vendors.wedding_id, lc.wedding_id), isNull(vendors.deleted_at), sql`lower(${vendors.name}) = lower(${name.trim()})`];
  if (options.exclude_id) conditions.push(ne(vendors.id, options.exclude_id));
  const query = lc.tx.select(vendorColumns).from(vendors).where(and(...conditions)).limit(1);
  const rows = options.lock ? await query.for("update") : await query;
  return rows[0] ?? null;
}

async function loadEvent(lc: LedgerContext, event_id: string, field: string): Promise<{ id: string; title: string; title_hi: string }> {
  const rows = await lc.tx
    .select({ id: events.id, title: events.title, title_hi: events.title_hi })
    .from(events)
    .where(and(eq(events.id, event_id), eq(events.wedding_id, lc.wedding_id), isNull(events.deleted_at)))
    .limit(1);
  if (!rows[0]) throw notFound(field);
  return rows[0];
}

async function eventTitles(lc: LedgerContext, ids: readonly (string | null)[]): Promise<Map<string, Text>> {
  const wanted = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (wanted.length === 0) return new Map();
  const rows = await lc.tx
    .select({ id: events.id, title: events.title, title_hi: events.title_hi })
    .from(events)
    .where(and(eq(events.wedding_id, lc.wedding_id), inArray(events.id, wanted)));
  return new Map(rows.map((row) => [row.id, { en: row.title, hi: row.title_hi }]));
}

/** Validates a list of function ids (deduplicated, each of this wedding). */
async function checkEventIds(lc: LedgerContext, ids: readonly string[]): Promise<string[]> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];
  const rows = await lc.tx
    .select({ id: events.id })
    .from(events)
    .where(and(eq(events.wedding_id, lc.wedding_id), isNull(events.deleted_at), inArray(events.id, unique)));
  if (rows.length !== unique.length) throw notFound("event_ids");
  return unique.sort();
}

/** E1's fill rule: the vendor's only function in `vendor_events`, else null. */
async function onlyVendorEvent(lc: LedgerContext, vendor_id: string): Promise<string | null> {
  const rows = await lc.tx
    .select({ event_id: vendorEvents.event_id })
    .from(vendorEvents)
    .innerJoin(events, and(eq(events.id, vendorEvents.event_id), eq(events.wedding_id, vendorEvents.wedding_id)))
    .where(and(eq(vendorEvents.vendor_id, vendor_id), eq(vendorEvents.wedding_id, lc.wedding_id), isNull(events.deleted_at)));
  return rows.length === 1 ? rows[0].event_id : null;
}

async function memberName(lc: LedgerContext, member_id: string | null): Promise<string | null> {
  if (!member_id) return null;
  const rows = await lc.tx
    .select({ display_name: members.display_name })
    .from(members)
    .where(and(eq(members.id, member_id), eq(members.wedding_id, lc.wedding_id)))
    .limit(1);
  return rows[0]?.display_name ?? null;
}

type CommitmentRow = { id: string; vendor_id: string; current_version_no: number; voided_at: Date | null };

async function loadCommitment(lc: LedgerContext, commitment_id: string, lock: boolean, field = "commitment_id"): Promise<CommitmentRow> {
  const query = lc.tx
    .select({ id: commitments.id, vendor_id: commitments.vendor_id, current_version_no: commitments.current_version_no, voided_at: commitments.voided_at })
    .from(commitments)
    .where(and(eq(commitments.id, commitment_id), eq(commitments.wedding_id, lc.wedding_id)))
    .limit(1);
  const rows = lock ? await query.for("update") : await query;
  if (!rows[0]) throw notFound(field);
  return rows[0];
}

type CurrentCommitmentVersion = {
  id: string;
  version_no: number;
  values: CommitmentValues;
  created_by_member_id: string | null;
  created_at: Date;
};

async function currentCommitmentVersion(lc: LedgerContext, commitment_id: string): Promise<CurrentCommitmentVersion> {
  const rows = await lc.tx
    .select({
      id: commitmentVersions.id,
      version_no: commitmentVersions.version_no,
      pricing: commitmentVersions.pricing,
      unit: commitmentVersions.unit,
      unit_price_inr: commitmentVersions.unit_price_inr,
      quantity: commitmentVersions.quantity,
      amount_inr: commitmentVersions.amount_inr,
      event_id: commitmentVersions.event_id,
      description: commitmentVersions.description,
      agreed_on: commitmentVersions.agreed_on,
      due_on: commitmentVersions.due_on,
      created_by_member_id: commitmentVersions.created_by_member_id,
      created_at: commitmentVersions.created_at,
    })
    .from(commitmentVersions)
    .where(
      and(
        eq(commitmentVersions.commitment_id, commitment_id),
        eq(commitmentVersions.wedding_id, lc.wedding_id),
        isNull(commitmentVersions.superseded_at),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) throw new Error("commitment has no current version");
  const { id, version_no, created_by_member_id, created_at, ...values } = row;
  return { id, version_no, values, created_by_member_id, created_at };
}

type PaymentRow = { id: string; vendor_id: string; payment_kind: PaymentKind; current_version_no: number; voided_at: Date | null };

async function loadPayment(lc: LedgerContext, payment_id: string, lock: boolean): Promise<PaymentRow> {
  const query = lc.tx
    .select({
      id: payments.id,
      vendor_id: payments.vendor_id,
      payment_kind: payments.payment_kind,
      current_version_no: payments.current_version_no,
      voided_at: payments.voided_at,
    })
    .from(payments)
    .where(and(eq(payments.id, payment_id), eq(payments.wedding_id, lc.wedding_id)))
    .limit(1);
  const rows = lock ? await query.for("update") : await query;
  if (!rows[0]) throw notFound("payment_id");
  return rows[0];
}

type CurrentPaymentVersion = {
  id: string;
  version_no: number;
  values: PaymentValues;
  created_by_member_id: string | null;
  created_at: Date;
};

async function currentPaymentVersion(lc: LedgerContext, payment_id: string): Promise<CurrentPaymentVersion> {
  const rows = await lc.tx
    .select({
      id: paymentVersions.id,
      version_no: paymentVersions.version_no,
      amount_inr: paymentVersions.amount_inr,
      paid_on: paymentVersions.paid_on,
      method: paymentVersions.method,
      note: paymentVersions.note,
      created_by_member_id: paymentVersions.created_by_member_id,
      created_at: paymentVersions.created_at,
    })
    .from(paymentVersions)
    .where(and(eq(paymentVersions.payment_id, payment_id), eq(paymentVersions.wedding_id, lc.wedding_id), isNull(paymentVersions.superseded_at)))
    .limit(1);
  const row = rows[0];
  if (!row) throw new Error("payment has no current version");
  const { id, version_no, created_by_member_id, created_at, ...values } = row;
  return { id, version_no, values, created_by_member_id, created_at };
}

/** Every version of a payment, oldest first (the `correct_payment` result, C7). */
async function paymentVersionList(lc: LedgerContext, payment_id: string): Promise<JsonObject[]> {
  const rows = await lc.tx
    .select({
      version_no: paymentVersions.version_no,
      amount_inr: paymentVersions.amount_inr,
      paid_on: paymentVersions.paid_on,
      method: paymentVersions.method,
      note: paymentVersions.note,
      change_reason: paymentVersions.change_reason,
      source: paymentVersions.source,
      created_by_member_id: paymentVersions.created_by_member_id,
      created_at: paymentVersions.created_at,
      superseded_at: paymentVersions.superseded_at,
    })
    .from(paymentVersions)
    .where(and(eq(paymentVersions.payment_id, payment_id), eq(paymentVersions.wedding_id, lc.wedding_id)))
    .orderBy(asc(paymentVersions.version_no));
  return rows.map((row) => ({
    ...row,
    created_at: row.created_at.toISOString(),
    superseded_at: row.superseded_at ? row.superseded_at.toISOString() : null,
  }));
}

/** C4: the fresh record a `stale_version` carries in `current`, with who set it. */
async function staleVersion(
  lc: LedgerContext,
  entity: { field: "payment_id" | "commitment_id"; id: string; current_version_no: number },
  version: { values: PaymentValues | CommitmentValues; created_by_member_id: string | null; created_at: Date },
): Promise<CommandFailure> {
  const set_by = await memberName(lc, version.created_by_member_id);
  return failure("stale_version", "This record changed since you opened it.", "expected_version", {
    [entity.field]: entity.id,
    current_version_no: entity.current_version_no,
    ...version.values,
    set_by,
    set_at: version.created_at.toISOString(),
  });
}

/** C2 steps 2–4 for one identity, in that order (the partial unique index allows no overlap). */
async function appendPaymentVersion(
  lc: LedgerContext,
  payment: PaymentRow,
  current: CurrentPaymentVersion,
  values: PaymentValues,
  change_reason: string | null,
): Promise<number> {
  const { tx } = lc;
  const version_no = current.version_no + 1;
  await tx.update(paymentVersions).set({ superseded_at: lc.now }).where(eq(paymentVersions.id, current.id));
  const [inserted] = await tx
    .insert(paymentVersions)
    .values({
      wedding_id: lc.wedding_id,
      payment_id: payment.id,
      version_no,
      ...values,
      change_reason,
      source: lc.source,
      voice_turn_id: lc.voice_turn_id,
      spoken_text: lc.spoken_text,
      created_by_member_id: lc.actor.member_id,
      created_at: lc.now,
    })
    .returning({ id: paymentVersions.id });
  await tx.update(paymentVersions).set({ superseded_by_version_id: inserted.id }).where(eq(paymentVersions.id, current.id));
  await tx.update(payments).set({ current_version_no: version_no, updated_at: lc.now }).where(eq(payments.id, payment.id));
  return version_no;
}

async function appendCommitmentVersion(
  lc: LedgerContext,
  commitment: CommitmentRow,
  current: CurrentCommitmentVersion,
  values: CommitmentValues,
): Promise<number> {
  const { tx } = lc;
  const version_no = current.version_no + 1;
  await tx.update(commitmentVersions).set({ superseded_at: lc.now }).where(eq(commitmentVersions.id, current.id));
  const [inserted] = await tx
    .insert(commitmentVersions)
    .values({
      wedding_id: lc.wedding_id,
      commitment_id: commitment.id,
      version_no,
      ...values,
      change_reason: null,
      source: lc.source,
      voice_turn_id: lc.voice_turn_id,
      spoken_text: lc.spoken_text,
      created_by_member_id: lc.actor.member_id,
      created_at: lc.now,
    })
    .returning({ id: commitmentVersions.id });
  await tx.update(commitmentVersions).set({ superseded_by_version_id: inserted.id }).where(eq(commitmentVersions.id, current.id));
  await tx.update(commitments).set({ current_version_no: version_no, updated_at: lc.now }).where(eq(commitments.id, commitment.id));
  return version_no;
}

/** Inserts a commitment identity and its version 1. */
async function insertCommitment(
  lc: LedgerContext,
  args: { vendor_id: string; quote_id: string | null; values: CommitmentValues },
): Promise<string> {
  const [commitment] = await lc.tx
    .insert(commitments)
    .values({
      wedding_id: lc.wedding_id,
      vendor_id: args.vendor_id,
      quote_id: args.quote_id,
      current_version_no: 1,
      created_by_member_id: lc.actor.member_id,
      created_at: lc.now,
      updated_at: lc.now,
    })
    .returning({ id: commitments.id });
  await lc.tx.insert(commitmentVersions).values({
    wedding_id: lc.wedding_id,
    commitment_id: commitment.id,
    version_no: 1,
    ...args.values,
    change_reason: null,
    source: lc.source,
    voice_turn_id: lc.voice_turn_id,
    spoken_text: lc.spoken_text,
    created_by_member_id: lc.actor.member_id,
    created_at: lc.now,
  });
  return commitment.id;
}

/** Inserts a payment identity and its version 1. */
async function insertPayment(
  lc: LedgerContext,
  args: { vendor_id: string; commitment_id: string | null; payment_kind: PaymentKind; values: PaymentValues },
): Promise<string> {
  const [payment] = await lc.tx
    .insert(payments)
    .values({
      wedding_id: lc.wedding_id,
      vendor_id: args.vendor_id,
      commitment_id: args.commitment_id,
      payment_kind: args.payment_kind,
      current_version_no: 1,
      created_by_member_id: lc.actor.member_id,
      created_at: lc.now,
      updated_at: lc.now,
    })
    .returning({ id: payments.id });
  await lc.tx.insert(paymentVersions).values({
    wedding_id: lc.wedding_id,
    payment_id: payment.id,
    version_no: 1,
    ...args.values,
    change_reason: null,
    source: lc.source,
    voice_turn_id: lc.voice_turn_id,
    spoken_text: lc.spoken_text,
    created_by_member_id: lc.actor.member_id,
    created_at: lc.now,
  });
  return payment.id;
}

/** A vendor with money (an active commitment or a non-void payment) keeps its category (3.3). */
async function vendorHasMoney(lc: LedgerContext, vendor_id: string): Promise<boolean> {
  const [commitmentRows, paymentRows] = await Promise.all([
    lc.tx
      .select({ id: commitments.id })
      .from(commitments)
      .where(and(eq(commitments.vendor_id, vendor_id), eq(commitments.wedding_id, lc.wedding_id), isNull(commitments.voided_at)))
      .limit(1),
    lc.tx
      .select({ id: payments.id })
      .from(payments)
      .where(and(eq(payments.vendor_id, vendor_id), eq(payments.wedding_id, lc.wedding_id), isNull(payments.voided_at)))
      .limit(1),
  ]);
  return commitmentRows.length > 0 || paymentRows.length > 0;
}

async function bookVendor(lc: LedgerContext, vendor: VendorRow): Promise<void> {
  if (vendor.status !== "considering") return;
  await lc.tx.update(vendors).set({ status: "booked", updated_at: lc.now }).where(eq(vendors.id, vendor.id));
}

function moneyEntry(args: {
  topic: ActivityEntryDraft["topic"];
  entity_type: ActivityEntryDraft["entity_type"];
  entity_id: string;
  text: Text;
  before: JsonObject | null;
  after: JsonObject | null;
}): ActivityEntryDraft {
  return {
    topic: args.topic,
    entity_type: args.entity_type,
    entity_id: args.entity_id,
    summary_en: args.text.en,
    summary_hi: args.text.hi,
    before: args.before,
    after: args.after,
    // L5: money entries are for owners only.
    visibility: "owners",
  };
}

// ---------------------------------------------------------------------------
// The gated commands (A1): plan, then apply
// ---------------------------------------------------------------------------

export type GatedOutcome = {
  outcome: "applied" | "unchanged";
  result: JsonObject;
  activity: ActivityEntryDraft | null;
  warnings: CommandWarning[];
  /** What the command created or changed (`proposals.result_entity_id`). */
  entity_id: string;
};

/** A validated gated command, ready to run; `propose_change` reads it without applying it. */
export type GatedPlan = {
  command: GatedCommand;
  /** The vendor the money belongs to; null only for a `record_expense` to a new payee. */
  vendor_id: string | null;
  vendor_name: string;
  budget_category: BudgetCategory;
  /** 3.5: how much committed and paid would rise (negative for a void). */
  committed_delta_inr: number;
  paid_delta_inr: number;
  /** The 3.5 summary of this change (`{summary}` / `{summary_hi}`). */
  summary: Text;
  /** C8: the values equal the current version, so applying writes nothing. */
  unchanged: boolean;
  apply(): Promise<GatedOutcome>;
};

export type PlanOptions = {
  /** Lock the rows the command changes (true when it will apply; false for a proposal's dry run). */
  lock: boolean;
  /**
   * `approve_proposal`: a `record_expense` runs against the stored `proposals.vendor_id`,
   * never a fresh name lookup (3.5). Undefined means a direct run with a name lookup.
   */
  expense_vendor?: { vendor_id: string | null };
};

const proposalChanged = (message = "This proposal no longer matches the ledger. Review it again.") =>
  failure("proposal_changed", message, "proposal_id");

async function moneyResult(lc: LedgerContext, vendor_id: string): Promise<MoneyCommandResult> {
  return { vendor_id, vendor_totals: await vendorTotals(lc.tx, lc.wedding_id, vendor_id) };
}

async function planRecordCommitment(lc: LedgerContext, input: ParsedCommandInput<"record_commitment">, options: PlanOptions): Promise<GatedPlan> {
  const vendor = await loadVendor(lc, input.vendor_id, { lock: options.lock });
  const priced = resolvePricing(input);
  let quote: { id: string; vendor_id: string; event_id: string | null; status: string } | null = null;
  if (input.quote_id) {
    const query = lc.tx
      .select({ id: quotes.id, vendor_id: quotes.vendor_id, event_id: quotes.event_id, status: quotes.status })
      .from(quotes)
      .where(and(eq(quotes.id, input.quote_id), eq(quotes.wedding_id, lc.wedding_id)))
      .limit(1);
    const rows = options.lock ? await query.for("update") : await query;
    quote = rows[0] ?? null;
    if (!quote) throw notFound("quote_id");
    if (quote.vendor_id !== vendor.id || quote.status !== "open") throw invalid("quote_id", "unknown_value");
  }
  // E1's fill rule: the sent function, else the linked quote's, else the vendor's only one.
  let event_id: string | null = input.event_id ?? null;
  if (event_id) await loadEvent(lc, event_id, "event_id");
  else event_id = quote?.event_id ?? (await onlyVendorEvent(lc, vendor.id));
  if (needsEventForEstimate(priced) && !event_id) throw invalid("event_id", "required");

  const values: CommitmentValues = {
    ...priced,
    event_id,
    description: input.description ?? null,
    agreed_on: input.agreed_on ?? lc.today,
    due_on: input.due_on ?? null,
  };
  return {
    command: "record_commitment",
    vendor_id: vendor.id,
    vendor_name: vendor.name,
    budget_category: vendor.vendor_category,
    committed_delta_inr: values.amount_inr,
    paid_delta_inr: 0,
    summary: proposalSummaries.record_commitment(vendor.name, values.amount_inr),
    unchanged: false,
    async apply() {
      const commitment_id = await insertCommitment(lc, { vendor_id: vendor.id, quote_id: quote?.id ?? null, values });
      if (quote) await lc.tx.update(quotes).set({ status: "accepted", updated_at: lc.now }).where(eq(quotes.id, quote.id));
      await bookVendor(lc, vendor);
      const result: CommandResult<"record_commitment"> = { ...(await moneyResult(lc, vendor.id)), commitment_id, version_no: 1 };
      return {
        outcome: "applied",
        result,
        activity: moneyEntry({
          topic: "commitment.recorded",
          entity_type: "commitment",
          entity_id: commitment_id,
          text: commitmentRecordedText(lc.actor.display_name, vendor.name, values),
          before: null,
          after: { vendor_id: vendor.id, quote_id: quote?.id ?? null, version_no: 1, ...values },
        }),
        warnings: await moneyWarnings(lc.tx, lc.wedding_id, vendor.id, { kinds: ["over_budget"] }),
        entity_id: commitment_id,
      };
    },
  };
}

async function planUpdateCommitment(lc: LedgerContext, input: ParsedCommandInput<"update_commitment">, options: PlanOptions): Promise<GatedPlan> {
  const commitment = await loadCommitment(lc, input.commitment_id, options.lock);
  if (commitment.voided_at) throw failure("commitment_void", "This commitment is cancelled.", "commitment_id");
  const current = await currentCommitmentVersion(lc, commitment.id);
  if (commitment.current_version_no !== input.expected_version) {
    throw await staleVersion(lc, { field: "commitment_id", id: commitment.id, current_version_no: commitment.current_version_no }, current);
  }
  const vendor = await loadVendor(lc, commitment.vendor_id, { field: "commitment_id" });
  const { commitment_id: _id, expected_version: _expected, ...patch } = input;
  void _id;
  void _expected;
  const next = mergeCommitment(current.values, patch);
  if (patch.event_id) await loadEvent(lc, patch.event_id, "event_id");
  const touchesEstimate = patch.pricing !== undefined || patch.unit !== undefined || patch.event_id !== undefined;
  if (touchesEstimate && needsEventForEstimate(next) && !next.event_id) throw invalid("event_id", "required");

  const changes = diffValues(current.values, next, COMMITMENT_VALUE_FIELDS);
  const specs = commitmentFieldSpecs(await eventTitles(lc, [current.values.event_id, next.event_id]));
  return {
    command: "update_commitment",
    vendor_id: vendor.id,
    vendor_name: vendor.name,
    budget_category: vendor.vendor_category,
    committed_delta_inr: next.amount_inr - current.values.amount_inr,
    paid_delta_inr: 0,
    summary: proposalSummaries.update_commitment(vendor.name, changes, specs),
    unchanged: changes.length === 0,
    async apply() {
      if (changes.length === 0) {
        const result: CommandResult<"update_commitment"> = {
          ...(await moneyResult(lc, vendor.id)),
          commitment_id: commitment.id,
          version_no: current.version_no,
        };
        return { outcome: "unchanged", result, activity: null, warnings: [], entity_id: commitment.id };
      }
      const version_no = await appendCommitmentVersion(lc, commitment, current, next);
      const result: CommandResult<"update_commitment"> = { ...(await moneyResult(lc, vendor.id)), commitment_id: commitment.id, version_no };
      return {
        outcome: "applied",
        result,
        activity: moneyEntry({
          topic: "commitment.updated",
          entity_type: "commitment",
          entity_id: commitment.id,
          text: commitmentUpdatedText(lc.actor.display_name, vendor.name, changes, specs),
          ...beforeAfter(changes),
        }),
        warnings: await moneyWarnings(lc.tx, lc.wedding_id, vendor.id),
        entity_id: commitment.id,
      };
    },
  };
}

async function planVoidCommitment(lc: LedgerContext, input: ParsedCommandInput<"void_commitment">, options: PlanOptions): Promise<GatedPlan> {
  const commitment = await loadCommitment(lc, input.commitment_id, options.lock);
  if (commitment.voided_at) throw failure("commitment_void", "This commitment is already cancelled.", "commitment_id");
  const current = await currentCommitmentVersion(lc, commitment.id);
  if (commitment.current_version_no !== input.expected_version) {
    throw await staleVersion(lc, { field: "commitment_id", id: commitment.id, current_version_no: commitment.current_version_no }, current);
  }
  const vendor = await loadVendor(lc, commitment.vendor_id, { field: "commitment_id" });
  const amount = current.values.amount_inr;
  return {
    command: "void_commitment",
    vendor_id: vendor.id,
    vendor_name: vendor.name,
    budget_category: vendor.vendor_category,
    committed_delta_inr: -amount,
    paid_delta_inr: 0,
    summary: proposalSummaries.void_commitment(vendor.name, amount),
    unchanged: false,
    async apply() {
      const void_reason = input.void_reason ?? null;
      await lc.tx
        .update(commitments)
        .set({ voided_at: lc.now, voided_by_member_id: lc.actor.member_id, void_reason, updated_at: lc.now })
        .where(eq(commitments.id, commitment.id));
      const result: CommandResult<"void_commitment"> = { ...(await moneyResult(lc, vendor.id)), commitment_id: commitment.id };
      return {
        outcome: "applied",
        result,
        activity: moneyEntry({
          topic: "commitment.voided",
          entity_type: "commitment",
          entity_id: commitment.id,
          text: commitmentVoidedText(lc.actor.display_name, vendor.name, amount),
          before: { voided: false },
          after: { voided: true, amount_inr: amount, void_reason },
        }),
        // Its payments stay and still count, so the vendor may now be overpaid (3.3).
        warnings: await moneyWarnings(lc.tx, lc.wedding_id, vendor.id, { kinds: ["overpaid"] }),
        entity_id: commitment.id,
      };
    },
  };
}

async function planRecordPayment(lc: LedgerContext, input: ParsedCommandInput<"record_payment">, options: PlanOptions): Promise<GatedPlan> {
  void options;
  const vendor = await loadVendor(lc, input.vendor_id);
  if (isAfterToday(input.paid_on, lc.today)) throw invalid("paid_on", "out_of_range");
  let commitment_id: string | null = null;
  if (input.commitment_id) {
    const commitment = await loadCommitment(lc, input.commitment_id, false);
    if (commitment.vendor_id !== vendor.id || commitment.voided_at) throw invalid("commitment_id", "unknown_value");
    commitment_id = commitment.id;
  } else {
    // The vendor's only active commitment is linked when none is named (3.3).
    const active = await lc.tx
      .select({ id: commitments.id })
      .from(commitments)
      .where(and(eq(commitments.vendor_id, vendor.id), eq(commitments.wedding_id, lc.wedding_id), isNull(commitments.voided_at)))
      .limit(2);
    commitment_id = active.length === 1 ? active[0].id : null;
  }
  const values: PaymentValues = {
    amount_inr: input.amount_inr,
    paid_on: input.paid_on ?? null,
    method: input.method ?? null,
    note: input.note ?? null,
  };
  return {
    command: "record_payment",
    vendor_id: vendor.id,
    vendor_name: vendor.name,
    budget_category: vendor.vendor_category,
    committed_delta_inr: 0,
    paid_delta_inr: values.amount_inr,
    summary: proposalSummaries.record_payment(vendor.name, values.amount_inr),
    unchanged: false,
    async apply() {
      const payment_id = await insertPayment(lc, { vendor_id: vendor.id, commitment_id, payment_kind: input.payment_kind, values });
      const result: CommandResult<"record_payment"> = {
        ...(await moneyResult(lc, vendor.id)),
        payment_id,
        version_no: 1,
        amount_inr: values.amount_inr,
      };
      return {
        outcome: "applied",
        result,
        activity: moneyEntry({
          topic: "payment.recorded",
          entity_type: "payment",
          entity_id: payment_id,
          text: paymentRecordedText(lc.actor.display_name, vendor.name, input.payment_kind, values.amount_inr),
          before: null,
          after: { vendor_id: vendor.id, commitment_id, payment_kind: input.payment_kind, version_no: 1, ...values },
        }),
        // Jashn records what happened: an overpayment saves, with a warning (3.3).
        warnings: await moneyWarnings(lc.tx, lc.wedding_id, vendor.id, { kinds: ["overpaid"] }),
        entity_id: payment_id,
      };
    },
  };
}

async function planCorrectPayment(lc: LedgerContext, input: ParsedCommandInput<"correct_payment">, options: PlanOptions): Promise<GatedPlan> {
  const payment = await loadPayment(lc, input.payment_id, options.lock);
  if (payment.voided_at) throw failure("payment_void", "This payment is void.", "payment_id");
  const current = await currentPaymentVersion(lc, payment.id);
  if (payment.current_version_no !== input.expected_version) {
    throw await staleVersion(lc, { field: "payment_id", id: payment.id, current_version_no: payment.current_version_no }, current);
  }
  const vendor = await loadVendor(lc, payment.vendor_id, { field: "payment_id" });
  if (isAfterToday(input.paid_on, lc.today)) throw invalid("paid_on", "out_of_range");
  const next = mergePayment(current.values, input);
  const changes = diffValues(current.values, next, PAYMENT_VALUE_FIELDS);
  const kind = payment.payment_kind;

  async function paymentResult(version_no: number, amount_inr: number): Promise<CommandResult<"correct_payment">> {
    const base: PaymentCommandResult = { ...(await moneyResult(lc, vendor.id)), payment_id: payment.id, version_no, amount_inr };
    // The result carries every version too (3.3), oldest first.
    const withVersions: PaymentCommandResult & { versions: JsonObject[] } = { ...base, versions: await paymentVersionList(lc, payment.id) };
    return withVersions;
  }

  return {
    command: "correct_payment",
    vendor_id: vendor.id,
    vendor_name: vendor.name,
    budget_category: vendor.vendor_category,
    committed_delta_inr: 0,
    paid_delta_inr: next.amount_inr - current.values.amount_inr,
    summary: proposalSummaries.correct_payment(vendor.name, kind, changes),
    unchanged: changes.length === 0,
    async apply() {
      if (changes.length === 0) {
        return {
          outcome: "unchanged",
          result: await paymentResult(current.version_no, current.values.amount_inr),
          activity: null,
          warnings: [],
          entity_id: payment.id,
        };
      }
      const version_no = await appendPaymentVersion(lc, payment, current, next, input.change_reason ?? null);
      return {
        outcome: "applied",
        result: await paymentResult(version_no, next.amount_inr),
        activity: moneyEntry({
          topic: "payment.corrected",
          entity_type: "payment",
          entity_id: payment.id,
          text: paymentCorrectedText(lc.actor.display_name, vendor.name, kind, changes),
          ...beforeAfter(changes),
        }),
        warnings: await moneyWarnings(lc.tx, lc.wedding_id, vendor.id, { kinds: ["overpaid"] }),
        entity_id: payment.id,
      };
    },
  };
}

async function planVoidPayment(lc: LedgerContext, input: ParsedCommandInput<"void_payment">, options: PlanOptions): Promise<GatedPlan> {
  const payment = await loadPayment(lc, input.payment_id, options.lock);
  if (payment.voided_at) throw failure("payment_void", "This payment is already void.", "payment_id");
  const current = await currentPaymentVersion(lc, payment.id);
  if (payment.current_version_no !== input.expected_version) {
    throw await staleVersion(lc, { field: "payment_id", id: payment.id, current_version_no: payment.current_version_no }, current);
  }
  const vendor = await loadVendor(lc, payment.vendor_id, { field: "payment_id" });
  const amount = current.values.amount_inr;
  return {
    command: "void_payment",
    vendor_id: vendor.id,
    vendor_name: vendor.name,
    budget_category: vendor.vendor_category,
    committed_delta_inr: 0,
    paid_delta_inr: -amount,
    summary: proposalSummaries.void_payment(vendor.name, payment.payment_kind, amount),
    unchanged: false,
    async apply() {
      const void_reason = input.void_reason ?? null;
      // C9: the payment stays listed; its versions are untouched.
      await lc.tx
        .update(payments)
        .set({ voided_at: lc.now, voided_by_member_id: lc.actor.member_id, void_reason, updated_at: lc.now })
        .where(eq(payments.id, payment.id));
      const result: CommandResult<"void_payment"> = { ...(await moneyResult(lc, vendor.id)), payment_id: payment.id };
      return {
        outcome: "applied",
        result,
        activity: moneyEntry({
          topic: "payment.voided",
          entity_type: "payment",
          entity_id: payment.id,
          text: paymentVoidedText(lc.actor.display_name, vendor.name, payment.payment_kind, amount),
          before: { voided: false },
          after: { voided: true, amount_inr: amount, void_reason },
        }),
        warnings: [],
        entity_id: payment.id,
      };
    },
  };
}

async function planRecordExpense(lc: LedgerContext, input: ParsedCommandInput<"record_expense">, options: PlanOptions): Promise<GatedPlan> {
  const paid_in_full = input.paid_in_full ?? true;
  let vendor: VendorRow | null;
  if (options.expense_vendor) {
    // Approval: the stored payee, never a fresh lookup (3.5).
    const stored = options.expense_vendor.vendor_id;
    if (stored) {
      const rows = await lc.tx
        .select(vendorColumns)
        .from(vendors)
        .where(and(eq(vendors.id, stored), eq(vendors.wedding_id, lc.wedding_id), isNull(vendors.deleted_at)))
        .limit(1)
        .for("update");
      vendor = rows[0] ?? null;
      if (!vendor || vendor.name.trim().toLowerCase() !== input.payee_name.trim().toLowerCase()) throw proposalChanged();
      if (vendor.vendor_category !== input.budget_category) throw proposalChanged();
    } else {
      if (await findVendorByName(lc, input.payee_name)) throw proposalChanged();
      vendor = null;
    }
  } else {
    vendor = await findVendorByName(lc, input.payee_name, { lock: options.lock });
    if (vendor && vendor.vendor_category !== input.budget_category) {
      throw invalid("budget_category", "unknown_value", vendorJson(vendor));
    }
  }
  if (input.event_id) await loadEvent(lc, input.event_id, "event_id");
  const paid_on = paid_in_full ? (input.paid_on ?? null) : null;
  if (isAfterToday(paid_on, lc.today)) throw invalid("paid_on", "out_of_range");
  const vendor_name = vendor?.name ?? input.payee_name;
  const amount = input.amount_inr;
  const category = input.budget_category;

  return {
    command: "record_expense",
    vendor_id: vendor?.id ?? null,
    vendor_name,
    budget_category: category,
    committed_delta_inr: amount,
    paid_delta_inr: paid_in_full ? amount : 0,
    summary: proposalSummaries.record_expense(vendor_name, amount, category, paid_in_full),
    unchanged: false,
    async apply() {
      let vendor_id: string;
      if (vendor) {
        vendor_id = vendor.id;
        await bookVendor(lc, vendor);
      } else {
        const [created] = await lc.tx
          .insert(vendors)
          .values({
            wedding_id: lc.wedding_id,
            name: input.payee_name,
            vendor_category: category,
            status: "booked",
            is_one_off: true,
            created_at: lc.now,
            updated_at: lc.now,
          })
          .returning({ id: vendors.id });
        vendor_id = created.id;
      }
      const commitment_id = await insertCommitment(lc, {
        vendor_id,
        quote_id: null,
        values: {
          pricing: "lump_sum",
          unit: null,
          unit_price_inr: null,
          quantity: null,
          amount_inr: amount,
          event_id: input.event_id ?? null,
          description: input.description ?? null,
          agreed_on: paid_on ?? lc.today,
          due_on: null,
        },
      });
      const payment_id = paid_in_full
        ? await insertPayment(lc, {
            vendor_id,
            commitment_id,
            payment_kind: "final",
            values: { amount_inr: amount, paid_on, method: input.method ?? null, note: null },
          })
        : null;
      const result: CommandResult<"record_expense"> = { ...(await moneyResult(lc, vendor_id)), commitment_id, payment_id };
      return {
        outcome: "applied",
        result,
        activity: moneyEntry({
          topic: "expense.recorded",
          entity_type: "commitment",
          entity_id: commitment_id,
          text: expenseRecordedText(lc.actor.display_name, vendor_name, amount, category),
          before: null,
          after: {
            vendor_id,
            payee_name: vendor_name,
            budget_category: category,
            amount_inr: amount,
            paid_in_full,
            paid_on,
            method: paid_in_full ? (input.method ?? null) : null,
            payment_id,
          },
        }),
        warnings: await moneyWarnings(lc.tx, lc.wedding_id, vendor_id, { kinds: ["over_budget"] }),
        entity_id: commitment_id,
      };
    },
  };
}

/** Validates a gated command against the current state and returns its plan (A1, 3.5). */
export async function planGated(lc: LedgerContext, command: GatedCommand, input: unknown, options: PlanOptions): Promise<GatedPlan> {
  switch (command) {
    case "record_commitment":
      return planRecordCommitment(lc, input as ParsedCommandInput<"record_commitment">, options);
    case "update_commitment":
      return planUpdateCommitment(lc, input as ParsedCommandInput<"update_commitment">, options);
    case "void_commitment":
      return planVoidCommitment(lc, input as ParsedCommandInput<"void_commitment">, options);
    case "record_payment":
      return planRecordPayment(lc, input as ParsedCommandInput<"record_payment">, options);
    case "correct_payment":
      return planCorrectPayment(lc, input as ParsedCommandInput<"correct_payment">, options);
    case "void_payment":
      return planVoidPayment(lc, input as ParsedCommandInput<"void_payment">, options);
    case "record_expense":
      return planRecordExpense(lc, input as ParsedCommandInput<"record_expense">, options);
  }
}

function gatedHandler<G extends GatedCommand>(command: G): CommandHandler<G, Tx> {
  return async (context) => {
    const lc = await ledgerContextFor(context);
    // A1: the guard sends a manager to propose_change; an owner runs directly.
    if (lc.actor.role !== "owner") throw failure("approval_required", "This change needs an owner's approval. Send it as a proposal.");
    const plan = await planGated(lc, command, context.input, { lock: true });
    const done = await plan.apply();
    return {
      outcome: done.outcome,
      result: done.result as unknown as CommandResult<G>,
      activity: done.activity,
      warnings: done.warnings,
    };
  };
}

// ---------------------------------------------------------------------------
// The other money commands
// ---------------------------------------------------------------------------

type Handler<C extends CommandName> = CommandHandler<C, Tx>;
type Result<C extends CommandName> = CommandHandlerResult<C>;

function duplicateVendor(vendor: VendorRow): CommandFailure {
  return failure("duplicate_vendor", `${vendor.name} is already a vendor.`, "name", vendorJson(vendor));
}

export const addVendorHandler: Handler<"add_vendor"> = async (context): Promise<Result<"add_vendor">> => {
  const lc = await ledgerContextFor(context);
  const input = context.input;
  const existing = await findVendorByName(lc, input.name);
  if (existing) throw duplicateVendor(existing);
  const event_ids = await checkEventIds(lc, input.event_ids ?? []);
  const status = input.status ?? "considering";
  const [vendor] = await lc.tx
    .insert(vendors)
    .values({
      wedding_id: lc.wedding_id,
      name: input.name,
      vendor_category: input.vendor_category,
      status,
      is_one_off: false,
      contact_name: input.contact_name ?? null,
      contact_phone: input.contact_phone ?? null,
      notes: input.notes ?? null,
      created_at: lc.now,
      updated_at: lc.now,
    })
    .returning({ id: vendors.id });
  if (event_ids.length > 0) {
    await lc.tx
      .insert(vendorEvents)
      .values(event_ids.map((event_id) => ({ vendor_id: vendor.id, event_id, wedding_id: lc.wedding_id, created_at: lc.now })));
  }
  const text = vendorAddedText(lc.actor.display_name, input.name, input.vendor_category);
  return {
    outcome: "applied",
    result: { vendor_id: vendor.id },
    activity: {
      topic: "vendor.added",
      entity_type: "vendor",
      entity_id: vendor.id,
      summary_en: text.en,
      summary_hi: text.hi,
      before: null,
      // No contact phone in the history: the entry is for members (L5a, as for guest contacts).
      after: { name: input.name, vendor_category: input.vendor_category, status, contact_name: input.contact_name ?? null, event_ids },
      visibility: "members",
    },
  };
};

export const updateVendorHandler: Handler<"update_vendor"> = async (context): Promise<Result<"update_vendor">> => {
  const lc = await ledgerContextFor(context);
  const input = context.input;
  const vendor = await loadVendor(lc, input.vendor_id, { lock: true });

  if (input.name !== undefined && input.name.toLowerCase() !== vendor.name.toLowerCase()) {
    const clash = await findVendorByName(lc, input.name, { exclude_id: vendor.id });
    if (clash) throw duplicateVendor(clash);
  }
  if (input.vendor_category !== undefined && input.vendor_category !== vendor.vendor_category && (await vendorHasMoney(lc, vendor.id))) {
    // Committed money never moves between budget lines without an owner (3.3).
    throw invalid("vendor_category", "unknown_value");
  }

  const currentValues = {
    name: vendor.name,
    vendor_category: vendor.vendor_category,
    status: vendor.status,
    contact_name: vendor.contact_name,
    contact_phone: vendor.contact_phone,
    notes: vendor.notes,
  };
  const nextValues = {
    name: input.name ?? vendor.name,
    vendor_category: input.vendor_category ?? vendor.vendor_category,
    status: input.status ?? vendor.status,
    contact_name: input.contact_name ?? vendor.contact_name,
    contact_phone: input.contact_phone ?? vendor.contact_phone,
    notes: input.notes ?? vendor.notes,
  };
  const changes = diffValues(currentValues, nextValues, ["name", "vendor_category", "status", "contact_name", "contact_phone", "notes"] as const);

  let nextEvents: string[] | null = null;
  if (input.event_ids !== undefined) {
    const wanted = await checkEventIds(lc, input.event_ids);
    const currentRows = await lc.tx
      .select({ event_id: vendorEvents.event_id })
      .from(vendorEvents)
      .where(and(eq(vendorEvents.vendor_id, vendor.id), eq(vendorEvents.wedding_id, lc.wedding_id)));
    const currentEvents = currentRows.map((row) => row.event_id).sort();
    if (!sameValue(currentEvents, wanted)) {
      nextEvents = wanted;
      changes.push({ field: "event_ids", from: currentEvents, to: wanted });
    }
  }

  if (changes.length === 0) return { outcome: "unchanged", result: { vendor_id: vendor.id }, activity: null };

  const columnChanges = changes.filter((change) => change.field !== "event_ids");
  if (columnChanges.length > 0) {
    await lc.tx
      .update(vendors)
      .set({ ...Object.fromEntries(columnChanges.map((change) => [change.field, change.to])), updated_at: lc.now })
      .where(eq(vendors.id, vendor.id));
  }
  if (nextEvents) {
    await lc.tx.delete(vendorEvents).where(and(eq(vendorEvents.vendor_id, vendor.id), eq(vendorEvents.wedding_id, lc.wedding_id)));
    if (nextEvents.length > 0) {
      await lc.tx
        .insert(vendorEvents)
        .values(nextEvents.map((event_id) => ({ vendor_id: vendor.id, event_id, wedding_id: lc.wedding_id, created_at: lc.now })));
    }
  }

  const text = vendorUpdatedText(lc.actor.display_name, vendor.name, changes);
  return {
    outcome: "applied",
    result: { vendor_id: vendor.id, changed_fields: changes.map((change) => change.field) },
    activity: {
      topic: "vendor.updated",
      entity_type: "vendor",
      entity_id: vendor.id,
      summary_en: text.en,
      summary_hi: text.hi,
      ...beforeAfter(changes, ["contact_phone"]),
      visibility: "members",
    },
  };
};

export const addQuoteHandler: Handler<"add_quote"> = async (context): Promise<Result<"add_quote">> => {
  const lc = await ledgerContextFor(context);
  const input = context.input;
  const vendor = await loadVendor(lc, input.vendor_id);
  const priced = resolvePricing(input);
  if (input.event_id) await loadEvent(lc, input.event_id, "event_id");
  const quoted_on = input.quoted_on ?? lc.today;
  const [quote] = await lc.tx
    .insert(quotes)
    .values({
      wedding_id: lc.wedding_id,
      vendor_id: vendor.id,
      event_id: input.event_id ?? null,
      ...priced,
      description: input.description ?? null,
      quoted_on,
      valid_until: input.valid_until ?? null,
      status: "open",
      created_by_member_id: lc.actor.member_id,
      created_at: lc.now,
      updated_at: lc.now,
    })
    .returning({ id: quotes.id });
  return {
    outcome: "applied",
    result: { ...(await moneyResult(lc, vendor.id)), quote_id: quote.id, amount_inr: priced.amount_inr },
    activity: moneyEntry({
      topic: "quote.added",
      entity_type: "quote",
      entity_id: quote.id,
      text: quoteAddedText(lc.actor.display_name, vendor.name, priced.amount_inr),
      before: null,
      after: { vendor_id: vendor.id, ...priced, event_id: input.event_id ?? null, quoted_on, valid_until: input.valid_until ?? null },
    }),
  };
};

export const setBudgetLineHandler: Handler<"set_budget_line"> = async (context): Promise<Result<"set_budget_line">> => {
  const lc = await ledgerContextFor(context);
  if (lc.actor.role !== "owner") throw failure("forbidden", "Not allowed for your role.");
  const { budget_category, planned_inr } = context.input;
  const rows = await lc.tx
    .select({ id: budgetLines.id, planned_inr: budgetLines.planned_inr })
    .from(budgetLines)
    .where(and(eq(budgetLines.wedding_id, lc.wedding_id), eq(budgetLines.budget_category, budget_category)))
    .limit(1)
    .for("update");
  const existing = rows[0] ?? null;
  if (existing && existing.planned_inr === planned_inr) {
    return { outcome: "unchanged", result: { budget_line_id: existing.id, budget_category, planned_inr }, activity: null };
  }
  let budget_line_id: string;
  if (existing) {
    await lc.tx.update(budgetLines).set({ planned_inr, updated_at: lc.now }).where(eq(budgetLines.id, existing.id));
    budget_line_id = existing.id;
  } else {
    const [inserted] = await lc.tx
      .insert(budgetLines)
      .values({ wedding_id: lc.wedding_id, budget_category, planned_inr, created_at: lc.now, updated_at: lc.now })
      .returning({ id: budgetLines.id });
    budget_line_id = inserted.id;
  }
  return {
    outcome: "applied",
    result: { budget_line_id, budget_category, planned_inr },
    activity: moneyEntry({
      topic: "budget.updated",
      entity_type: "budget",
      entity_id: budget_line_id,
      text: budgetLineText(lc.actor.display_name, budget_category, existing?.planned_inr ?? null, planned_inr),
      before: { budget_category, planned_inr: existing?.planned_inr ?? null },
      after: { budget_category, planned_inr },
    }),
  };
};

export const recordCommitmentHandler = gatedHandler("record_commitment");
export const updateCommitmentHandler = gatedHandler("update_commitment");
export const voidCommitmentHandler = gatedHandler("void_commitment");
export const recordPaymentHandler = gatedHandler("record_payment");
export const correctPaymentHandler = gatedHandler("correct_payment");
export const voidPaymentHandler = gatedHandler("void_payment");
export const recordExpenseHandler = gatedHandler("record_expense");

/** A3's vendor and money handlers (domain 3.3 and `set_budget_line`), for the registry. */
export const ledgerHandlers: HandlerMap = {
  set_budget_line: setBudgetLineHandler,
  add_vendor: addVendorHandler,
  update_vendor: updateVendorHandler,
  add_quote: addQuoteHandler,
  record_commitment: recordCommitmentHandler,
  update_commitment: updateCommitmentHandler,
  void_commitment: voidCommitmentHandler,
  record_payment: recordPaymentHandler,
  correct_payment: correctPaymentHandler,
  void_payment: voidPaymentHandler,
  record_expense: recordExpenseHandler,
};
