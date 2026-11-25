import "server-only";

import type { ReplyRegister, VoicePreviewField } from "@/contracts/api";
import { commandSchemas, setWeddingProfileCreateSchema, type CommandName } from "@/contracts/commands";
import { BUDGET_CATEGORY_LABELS, PAYMENT_KIND_LABELS, PAYMENT_METHOD_LABELS, type JsonObject, type PaymentKind } from "@/contracts/domain";
import type { Itinerary, PaymentView, RsvpGuestList, RsvpGuestRow, VendorLedger } from "@/contracts/read-models";

import { functionList, functionOptions, refOf } from "./answers";
import { readDate } from "./numbers";
import { normalizeForMatch } from "./normalize";
import { clockHi, countHi, formatInr, inrWords } from "./resolve/say";
import {
  checkValue,
  fold,
  formatDate,
  formatLongDate,
  formatShortDate,
  formatTime,
  formatWeekdayDateHi,
  hasWords,
  heardFor,
  modelMissing,
  monthName,
  resolveEvent,
  resolveVendor,
  resolveVenue,
  roleOrName,
  ROLE_WORD,
  speakTimeEn,
  type ReadAccess,
  type ValueCheck,
  type VendorRef,
} from "./resolve/support";
import { dateSpeech } from "./speech";
import { reply } from "./templates";
import type { ReplyText, ResolveContext, ResolvedAction, StoredOption, ToolAction } from "./types";

/**
 * Write kinds (voice.md 2.6, section 5): references mapped to UUIDs, values re-read, the
 * kind rules, validation like typing (V5), and the card's rows. Nothing here writes.
 */

/** Facts the confirm reply needs later (vendor, function, venue), stored with the action. */
export type ServerFacts = {
  vendor_id?: string;
  vendor_name?: string;
  role_en?: string;
  role_hi?: string;
  role_is_unique?: boolean;
  event_id?: string;
  event_title?: string;
  event_title_hi?: string;
  venue_name?: string;
  published_venue?: string;
  payment_kind?: PaymentKind;
  old_amount_inr?: number;
  new_amount_inr?: number;
  revision?: number;
  heard_text?: string;
  changed_fields?: string[];
  owners?: string;
  first_owner?: string;
  /** request_card_export: an older revision's card was downloaded before (4.10 I-02). */
  older_card?: boolean;
  /** request_card_export: the newest published change was a venue move (4.10). */
  venue_published_change?: boolean;
  /** update_event: the function a time change stops clashing with (4.10 E-03). */
  clash_cleared_with?: string;
  clash_cleared_with_hi?: string;
  /** set_rsvp: the guests' names as stored, the new status, and the function's count after saving (4.10 G-02). */
  guest_names?: string[];
  rsvp_status?: string;
  attending_after?: number;
  /** update_commitment: how far the budget line goes over, and its label (4.10 M-08). */
  over_budget_inr?: number;
  over_budget_label_en?: string;
  over_budget_label_hi?: string;
};

export const SERVER_FACTS_KEY = "__server";

export function factsOf(action: ResolvedAction): ServerFacts {
  const facts = (action.raw as Record<string, unknown>)[SERVER_FACTS_KEY];
  return facts && typeof facts === "object" ? (facts as ServerFacts) : {};
}

export type WriteResult =
  | {
      kind: "ready";
      action: ResolvedAction;
      title: string;
      button: string;
      /** The silent preview's display line. */
      summary: string;
      /** Set when Confirm must stay disabled; the question is spoken. */
      disabled_reason: string | null;
      question: ReplyText | null;
    }
  | { kind: "clarify"; action: ResolvedAction; question: ReplyText; options: StoredOption[]; missing_fields: string[] }
  | { kind: "answer"; reply: ReplyText; action: ResolvedAction };

export type WriteDeps = { access: ReadAccess; owners: string; first_owner: string };

// ---------------------------------------------------------------------------
// Form labels (the prefill's field-key → label map, D121)
// ---------------------------------------------------------------------------

const LABELS: Record<string, string> = {
  bride_name: "Bride's name",
  groom_name: "Groom's name",
  wedding_date: "Wedding date",
  city: "City",
  budget_inr: "Budget",
  expected_guests: "Guests",
  setup_opened_at: "Setup opened",
  event_kind: "Function",
  event_id: "Function",
  event_ids: "Functions",
  title: "Title",
  event_date: "Date",
  start_time: "Starts",
  end_time: "Ends",
  muhurat_time: "Muhurat",
  venue_id: "Venue",
  venue_name: "Venue",
  dress_code: "Dress code",
  lead_name: "Lead",
  expected_headcount: "Expected guests",
  expected_version: "Version",
  expected_draft_version: "Draft version",
  theme: "Theme",
  typeface: "Typeface",
  layout: "Layout",
  photo_frame: "Photo frame",
  photo_asset_id: "Photo",
  name: "Name",
  vendor_category: "Category",
  status: "Status",
  contact_name: "Contact",
  notes: "Notes",
  vendor_id: "Vendor",
  pricing: "Pricing",
  unit: "Unit",
  unit_price_inr: "Rate",
  quantity: "How many",
  amount_inr: "Amount",
  description: "Description",
  due_on: "Due on",
  commitment_id: "Agreed amount",
  payment_id: "Payment",
  payment_kind: "Type",
  paid_on: "Paid on",
  method: "Method",
  note: "Note",
  change_reason: "Reason",
  text: "What's needed",
  requirement_category: "Category",
  full_name: "Name",
  household_id: "Household",
  household_name: "Household",
  relation: "Relation",
  max_plus_ones: "Plus-ones allowed",
  dietary_note: "Dietary note",
  guest_ids: "Guests",
  guest_id: "Guest",
  rsvp_status: "RSVP",
  plus_ones: "Plus-ones",
  format: "Format",
  giver_name: "From",
  received_on: "Received on",
  how: "How",
  command: "Command",
  input: "Details",
};

export function labelsFor(input: JsonObject): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of Object.keys(input)) out[key] = LABELS[key] ?? key;
  return out;
}

export function labelOf(field: string): string {
  return LABELS[field] ?? field;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function baseAction(index: number, action: ToolAction, command: CommandName, input: JsonObject, facts: ServerFacts): ResolvedAction {
  return {
    index,
    kind: action.kind,
    command,
    input,
    labels: labelsFor(input),
    heard: action.heard ?? [],
    entity_ref: null,
    preview: { kind: action.kind, command, fields: [], after_saving: [], warnings: [] },
    missing_fields: [],
    raw: { ...action, [SERVER_FACTS_KEY]: facts },
  };
}

function setFacts(action: ResolvedAction, facts: ServerFacts): void {
  (action.raw as Record<string, unknown>)[SERVER_FACTS_KEY] = { ...factsOf(action), ...facts };
}

function field(fieldKey: string, label: string, oldValue: string | null, newValue: string | null, heard: string | null, state: VoicePreviewField["state"] = "ok"): VoicePreviewField {
  return { field: fieldKey, label, old: oldValue, new: newValue, heard, state };
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/** V5: the command's own schema, without running it. Returns the first failing field. */
export function validateLikeTyping(command: CommandName, input: JsonObject, create = false): { ok: true } | { ok: false; field: string; message: string } {
  const schema = command === "set_wedding_profile" && create ? setWeddingProfileCreateSchema : commandSchemas[command];
  const parsed = schema.safeParse(input);
  if (parsed.success) return { ok: true };
  const issue = parsed.error.issues[0];
  return { ok: false, field: String(issue?.path?.[0] ?? ""), message: issue?.message ?? "unknown_value" };
}

/** "Is it ₹40,000? I heard 'चालीस हज़ार'." (4.10) with the code's reading as the default option. */
function numberQuestion(r: ReplyRegister, index: number, fieldKey: string, check: Extract<ValueCheck, { state: "uncertain" }>, modelValue: unknown): { question: ReplyText; options: StoredOption[] } {
  const phrase = check.phrase ?? "";
  const reading = check.code_value;
  if (check.reason === "small" && typeof modelValue === "number") {
    const big = modelValue * 1000;
    const q =
      r === "en"
        ? reply(r, `${formatInr(modelValue)}, or ${formatInr(big)}?`, `${inrWords(modelValue, "en")}, or ${inrWords(big, "en")}?`)
        : r === "hinglish"
          ? reply(r, `${formatInr(modelValue)} ya ${formatInr(big)}?`, `${inrWords(modelValue, "hi")} या ${inrWords(big, "hi")}?`)
          : reply(r, `${inrWords(modelValue, "hi")} या ${inrWords(big, "hi")}?`);
    return {
      question: q,
      options: [
        { label: formatInr(modelValue), value: "o1", apply: [{ action_index: index, field: fieldKey, value: modelValue }] },
        { label: formatInr(big), value: "o2", apply: [{ action_index: index, field: fieldKey, value: big }] },
      ],
    };
  }
  if (reading !== null && reading > 0) {
    const shown = formatInr(reading);
    const q =
      r === "en"
        ? reply(r, `Is it ${shown}? I heard '${phrase}'.`, `Is it ${inrWords(reading, "en")}? I heard '${phrase}'.`)
        : r === "hinglish"
          ? reply(r, `${shown} sahi hai? Maine '${phrase}' suna.`, `${inrWords(reading, "hi")} सही है? मैंने '${phrase}' सुना।`)
          : reply(r, `क्या ${inrWords(reading, "hi")} सही है? मैंने '${phrase}' सुना।`);
    return { question: q, options: [{ label: shown, value: "o1", default: true, apply: [{ action_index: index, field: fieldKey, value: reading }] }] };
  }
  const label = labelOf(fieldKey);
  const q =
    r === "en"
      ? reply(r, phrase ? `${label}: I heard '${phrase}'. Can you say it again?` : `What's the ${label.toLowerCase()}?`)
      : r === "hinglish"
        ? reply(r, phrase ? `Maine '${phrase}' suna. Phir se boliye?` : `${label} kya hai?`, phrase ? `मैंने '${phrase}' सुना। फिर से बोलिए?` : `${label} क्या है?`)
        : reply(r, phrase ? `मैंने '${phrase}' सुना। फिर से बोलिए?` : `${label} क्या है?`);
  return { question: q, options: [] };
}

function couldNotFindVendor(r: ReplyRegister, heard: string): ReplyText {
  return r === "hi" ? reply(r, `आपके वेंडरों में ${heard} नहीं मिला।`) : r === "hinglish" ? reply(r, `${heard} vendors mein nahi mila.`, `${heard} vendors में नहीं मिला।`) : reply(r, `I couldn't find ${heard} among your vendors.`);
}

function whichFunctionQuestion(r: ReplyRegister, itinerary: Itinerary | null): ReplyText {
  const list = functionList(itinerary, r).text;
  if (r === "en") return reply(r, `Which function? ${list}?`);
  if (r === "hinglish") return reply(r, `Kaunsa function? ${list}?`, `कौन सा function? ${functionList(itinerary, "hi").text}?`);
  return reply(r, `कौन सा कार्यक्रम? ${list}?`);
}

function roleList(vendors: VendorRef[], r: ReplyRegister): string {
  const words = vendors.map((v) => {
    const role = roleOrName(v, vendors);
    return r === "hi" ? role.hi : role.en;
  });
  const joiner = r === "en" ? " or " : r === "hinglish" ? " ya " : " या ";
  const text = words.length <= 1 ? words.join("") : `${words.slice(0, -1).join(", ")}${joiner}${words[words.length - 1]}`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function vendorOptions(vendors: VendorRef[], index: number): StoredOption[] {
  return vendors.slice(0, 6).map((v, i) => {
    const role = roleOrName(v, vendors);
    const label = role.is_role ? role.en.charAt(0).toUpperCase() + role.en.slice(1) : v.name;
    return { label, value: `o${i + 1}`, apply: [{ action_index: index, field: "vendor_id", value: v.seed_key ?? v.vendor_id }] };
  });
}

function ownersOf(profileOwners: string): string {
  return profileOwners || "an owner";
}

/** Asks for proposal: an A1 command from a manager goes as propose_change (V8). */
function wrapForManager(ctx: ResolveContext, command: CommandName, input: JsonObject): { command: CommandName; input: JsonObject; proposed: boolean } {
  if (ctx.actor.role === "manager" && ["record_commitment", "update_commitment", "record_payment", "correct_payment"].includes(command)) {
    return { command: "propose_change", input: { command, input }, proposed: true };
  }
  return { command, input, proposed: false };
}

const CORRECTION_CUES = ["था", "थी", "थे", "tha", "thi", "was", "were", "actually", "asal mein", "असल में", "galat", "गलत", "wrong", "sahi karo", "theek karo", "ठीक करो", "correct", "fix"];
const NEW_PAYMENT_CUES = ["aur", "और", "ek aur", "phir se", "फिर से", "another", "more", "again", "extra"];

function hasCue(transcript: string, cues: string[]): boolean {
  const t = ` ${normalizeForMatch(transcript)} `;
  if (cues.some((cue) => t.includes(` ${normalizeForMatch(cue)} `))) return true;
  if (cues === CORRECTION_CUES) {
    if (/\b(diya|diye|kiya|kiye|liya|liye) the\b/.test(t)) return true;
    if (/(नही|नहीं|nahin|nahi|not)\s*\S+/.test(t) && /\S+ (नही|नहीं|nahin|nahi)\b/.test(t)) return true;
  }
  return false;
}

function stillOwedRow(r: ReplyRegister, figures: { committed_inr: number; paid_inr: number; outstanding_inr: number }, newPaid: number) {
  const newOutstanding = figures.committed_inr - newPaid;
  const label = r === "hi" ? "बाकी" : "Still owed";
  if (newOutstanding < 0) return { label, old: formatInr(figures.outstanding_inr), new: `Overpaid ${formatInr(-newOutstanding)}` };
  return { label, old: formatInr(figures.outstanding_inr), new: formatInr(newOutstanding) };
}

function paymentLine(p: PaymentView, vendorName: string, r: ReplyRegister): string {
  const kind = PAYMENT_KIND_LABELS[p.payment_kind];
  const date = p.paid_on ? formatShortDate(p.paid_on) : r === "en" ? "with no date" : "bina date ka";
  return r === "hi" ? `${vendorName} को ${kind.hi}, ${date}` : `${kind.en} to ${vendorName}, ${date}`;
}

// ---------------------------------------------------------------------------
// correct_payment and record_payment (section 5, 2.6)
// ---------------------------------------------------------------------------

async function allPayments(access: ReadAccess, vendors: VendorRef[]): Promise<{ vendor: VendorRef; ledger: VendorLedger; payment: PaymentView }[]> {
  const out: { vendor: VendorRef; ledger: VendorLedger; payment: PaymentView }[] = [];
  for (const vendor of vendors) {
    const ledger = await access.ledger(vendor.vendor_id);
    for (const payment of ledger?.payments ?? []) out.push({ vendor, ledger: ledger as VendorLedger, payment });
  }
  return out;
}

async function buildCorrectPayment(ctx: ResolveContext, action: ToolAction, index: number, deps: WriteDeps): Promise<WriteResult> {
  const r = ctx.register;
  const ui = ctx.ui_language;
  const vendors = await deps.access.vendors();
  const draft = baseAction(index, action, "correct_payment", {}, {});
  const all = await allPayments(deps.access, vendors);
  let candidates = all.filter((row) => !row.payment.voided);

  // 1. A reference.
  const ref = text(action.payment_id);
  let target: (typeof all)[number] | null = null;
  if (ref) {
    const id = ctx.snapshot.ref_map[ref] ?? ref;
    const found = all.find((row) => row.payment.payment_id === id);
    if (found?.payment.voided) {
      return {
        kind: "answer",
        action: draft,
        reply:
          r === "en"
            ? reply(r, "That payment is void. Record it again on the vendor page.")
            : r === "hinglish"
              ? reply(r, "Yeh payment void hai. Vendor page par phir se record kijiye.", "यह payment void है। Vendor page पर फिर से record कीजिए।")
              : reply(r, "यह भुगतान रद्द है। वेंडर पेज पर फिर से दर्ज कीजिए।"),
      };
    }
    if (found) target = found;
  }

  // 2. The vendor.
  if (!target) {
    const vendorFound = resolveVendor(action, ctx.snapshot, vendors);
    let vendorId: string | null = vendorFound.ok ? vendorFound.value.vendor_id : null;
    if (!vendorFound.ok && vendorFound.reason === "unknown" && vendorFound.heard) {
      return { kind: "clarify", action: draft, question: couldNotFindVendor(r, vendorFound.heard), options: [], missing_fields: [`${index}:vendor_id`] };
    }
    if (!vendorId && ctx.context) {
      const saved = (ctx.context.results ?? []).find((res) => res.command === "record_payment" || res.command === "correct_payment");
      const savedId = saved?.entity_ref ? ctx.context.ref_map[saved.entity_ref] : undefined;
      const savedPayment = savedId ? all.find((row) => row.payment.payment_id === savedId) : undefined;
      if (savedPayment) target = savedPayment;
      const contextVendor = ctx.context.actions.map((a) => factsOf(a).vendor_id).find(Boolean);
      if (!target && contextVendor) vendorId = contextVendor;
    }
    if (!target && !vendorId && candidates.length === 1) target = candidates[0];
    if (!target && !vendorId) {
      const kind = text(action.payment_kind) as PaymentKind | null;
      const withCandidate = vendors.filter((v) => candidates.some((row) => row.vendor.vendor_id === v.vendor_id && (!kind || row.payment.payment_kind === kind)));
      const kindWord = kind ? PAYMENT_KIND_LABELS[kind] : null;
      const list = roleList(withCandidate, r);
      const listHi = roleList(withCandidate, "hi");
      const q =
        r === "en"
          ? reply(r, `Which vendor's ${kindWord ? kindWord.in_sentence : "payment"}? ${list}?`)
          : r === "hinglish"
            ? reply(r, `Kis vendor ka ${kindWord ? kindWord.in_sentence : "payment"}? ${list}?`, `किस vendor का ${kindWord ? kindWord.in_sentence : "payment"}? ${listHi}?`)
            : reply(r, `किस वेंडर का ${kindWord ? kindWord.hi : "भुगतान"}? ${listHi}?`);
      return { kind: "clarify", action: draft, question: q, options: vendorOptions(withCandidate, index), missing_fields: [`${index}:vendor_id`] };
    }
    if (!target && vendorId) {
      candidates = candidates.filter((row) => row.vendor.vendor_id === vendorId);
      const vendor = vendors.find((v) => v.vendor_id === vendorId) as VendorRef;
      if (candidates.length === 0) {
        // Nothing to correct: the card becomes a new payment (5.2).
        const asNew = await buildRecordPayment(ctx, { ...action, kind: "record_payment", vendor_id: vendor.seed_key ?? vendor.vendor_id }, index, deps);
        if (asNew.kind === "ready") asNew.action.preview.warnings.push(`No payment to ${vendor.name} is recorded yet, so this adds one.`);
        return asNew;
      }
      // 3. The kind.
      const kind = text(action.payment_kind) as PaymentKind | null;
      if (kind) {
        const ofKind = candidates.filter((row) => row.payment.payment_kind === kind);
        if (ofKind.length === 0) {
          return {
            kind: "clarify",
            action: draft,
            question:
              r === "en"
                ? reply(r, "A payment's type and vendor can't be changed. Void it on the vendor page and record it again.")
                : r === "hinglish"
                  ? reply(r, "Payment ka type aur vendor badal nahi sakte. Vendor page par use void karke phir se record kijiye.", "Payment का type और vendor बदल नहीं सकते। Vendor page पर उसे void करके फिर से record कीजिए।")
                  : reply(r, "भुगतान का प्रकार और वेंडर नहीं बदले जा सकते। वेंडर पेज पर उसे रद्द करके फिर से दर्ज कीजिए।"),
            options: [],
            missing_fields: [`${index}:payment_id`],
          };
        }
        candidates = ofKind;
      }
      // 4. The old amount.
      const previous = num(action.previous_inr);
      if (previous !== null && heardFor(action, "previous_inr")) {
        const equal = candidates.filter((row) => row.payment.amount_inr === previous);
        if (equal.length > 0) candidates = equal;
        else draft.preview.warnings.push(`You said ${formatInr(previous)}; the record shows ${formatInr(candidates[0].payment.amount_inr)}.`);
      }
      if (candidates.length === 1) target = candidates[0];
      else {
        const listed = [...candidates].sort((a, b) => (b.payment.paid_on ?? "").localeCompare(a.payment.paid_on ?? "")).slice(0, 3);
        const items = listed.map((row) => `the ${formatInr(row.payment.amount_inr)} ${PAYMENT_KIND_LABELS[row.payment.payment_kind].in_sentence} on ${row.payment.paid_on ? formatShortDate(row.payment.paid_on) : "no date"}`);
        return {
          kind: "clarify",
          action: draft,
          question: reply(r, `Which one: ${items.join(", or ")}?`),
          options: listed.map((row, i) => ({
            label: `${formatInr(row.payment.amount_inr)} ${PAYMENT_KIND_LABELS[row.payment.payment_kind].en}${row.payment.paid_on ? `, ${formatShortDate(row.payment.paid_on)}` : ""}`,
            value: `o${i + 1}`,
            apply: [{ action_index: index, field: "payment_id", value: row.payment.seed_key ?? refOf(ctx.snapshot, row.payment.payment_id) ?? row.payment.payment_id }],
          })),
          missing_fields: [`${index}:payment_id`],
        };
      }
    }
  }

  const { vendor, ledger, payment } = target as (typeof all)[number];
  const facts: ServerFacts = {
    vendor_id: vendor.vendor_id,
    vendor_name: vendor.name,
    ...(() => {
      const role = roleOrName(vendor, vendors);
      return { role_en: role.en, role_hi: role.hi, role_is_unique: role.is_role };
    })(),
    payment_kind: payment.payment_kind,
    old_amount_inr: payment.amount_inr,
    first_owner: deps.first_owner,
  };
  setFacts(draft, facts);
  draft.entity_ref = payment.seed_key ?? refOf(ctx.snapshot, payment.payment_id);

  const input: JsonObject = { payment_id: payment.payment_id, expected_version: payment.version_no };
  const fields: VoicePreviewField[] = [field("payment_id", ui === "hi" ? "रिकॉर्ड" : "Record", null, `${paymentLine(payment, vendor.name, ui === "hi" ? "hi" : "en")}${draft.entity_ref ? ` · ${draft.entity_ref}` : ""}`, null)];
  const reasons: string[] = [];
  const missing: string[] = [];
  let primaryUncertain: { field: string; check: Extract<ValueCheck, { state: "uncertain" }>; value: unknown } | null = null;
  const single = ctx.tool.actions.length === 1;

  const amount = num(action.amount_inr);
  if (amount !== null) {
    let check = checkValue(ctx, action, "amount_inr", amount, null);
    if (check.state === "ok" && amount < 100) check = { state: "uncertain", phrase: check.phrase, code_value: null, reason: "small" };
    if (check.state === "ok" && modelMissing(ctx.tool.missing_fields, index, "amount_inr", single)) check = { state: "uncertain", phrase: check.phrase, code_value: null, reason: "mismatch" };
    if (check.state === "uncertain") {
      primaryUncertain = { field: "amount_inr", check, value: amount };
    } else if (amount === payment.amount_inr) {
      return {
        kind: "answer",
        action: draft,
        reply: r === "en" ? reply(r, `It's already ${formatInr(amount)}.`) : r === "hinglish" ? reply(r, `Yeh pehle se ${formatInr(amount)} hai.`, `यह पहले से ${inrWords(amount, "hi")} है।`) : reply(r, `यह पहले से ${inrWords(amount, "hi")} है।`),
      };
    } else {
      input.amount_inr = amount;
      facts.new_amount_inr = amount;
      fields.push(field("amount_inr", ui === "hi" ? "रकम" : "Amount", formatInr(payment.amount_inr), formatInr(amount), check.phrase));
      reasons.push(`${PAYMENT_KIND_LABELS[payment.payment_kind].en} was ${formatInr(amount)}, not ${formatInr(payment.amount_inr)}.`);
    }
  }
  const paidOn = text(action.paid_on);
  if (paidOn) {
    const check = checkValue(ctx, action, "paid_on", paidOn, null);
    if (check.state === "ok" && paidOn !== payment.paid_on) {
      input.paid_on = paidOn;
      fields.push(field("paid_on", "Paid on", payment.paid_on ? formatShortDate(payment.paid_on) : null, formatShortDate(paidOn), check.phrase));
      reasons.push(`Paid on ${formatShortDate(paidOn)}, not ${payment.paid_on ? formatShortDate(payment.paid_on) : "no date"}.`);
    } else if (check.state === "uncertain" && !primaryUncertain) primaryUncertain = { field: "paid_on", check, value: paidOn };
  }
  const method = text(action.method);
  if (method && method !== payment.method) {
    input.method = method;
    fields.push(field("method", "Method", payment.method ? PAYMENT_METHOD_LABELS[payment.method] : null, PAYMENT_METHOD_LABELS[method as keyof typeof PAYMENT_METHOD_LABELS] ?? method, heardFor(action, "method")));
    reasons.push(`Paid by ${(PAYMENT_METHOD_LABELS[method as keyof typeof PAYMENT_METHOD_LABELS] ?? method).toLowerCase()}, not ${payment.method ? PAYMENT_METHOD_LABELS[payment.method].toLowerCase() : "unknown"}.`);
  }

  if (primaryUncertain) {
    const q = numberQuestion(r, index, primaryUncertain.field, primaryUncertain.check, primaryUncertain.value);
    draft.input = input;
    return { kind: "clarify", action: draft, question: q.question, options: q.options, missing_fields: [`${index}:${primaryUncertain.field}`] };
  }
  if (reasons.length === 0) {
    return { kind: "clarify", action: draft, question: r === "en" ? reply(r, "What should it be corrected to?") : reply(r, "Kya sahi karna hai?", "क्या सही करना है?"), options: [], missing_fields: [`${index}:amount_inr`] };
  }
  input.change_reason = reasons.join(" ").slice(0, 200);

  const figures = ledger.figures;
  const after = figures && amount !== null && input.amount_inr !== undefined ? [stillOwedRow(ui === "hi" ? "hi" : "en", figures, figures.paid_inr - payment.amount_inr + amount)] : [];

  const wrapped = wrapForManager(ctx, "correct_payment", input);
  const resolved: ResolvedAction = {
    ...draft,
    command: wrapped.command,
    input: wrapped.input,
    labels: labelsFor(input),
    preview: {
      kind: action.kind,
      command: wrapped.command,
      fields,
      after_saving: after,
      warnings: [
        ...draft.preview.warnings,
        wrapped.proposed ? `The ledger won't change until ${deps.first_owner} approves.` : ui === "hi" ? "भुगतान एक ही रहेगा। पुरानी रकम इतिहास में रहेगी।" : "Still one payment. The old amount stays in History.",
      ],
    },
    missing_fields: missing,
  };
  if (wrapped.proposed) resolved.preview.after_saving = after.map((row) => ({ ...row, label: "After approval" }));
  setFacts(resolved, facts);
  const title = wrapped.proposed ? "Correction, sent for approval" : ui === "hi" ? "सुधार, नया भुगतान नहीं" : "Correction, not a new payment";
  const button = wrapped.proposed ? "Send for approval" : ui === "hi" ? "सुधार सेव करें" : "Save correction";
  const summary = amount !== null && input.amount_inr !== undefined ? `${title}: ${formatInr(payment.amount_inr)} → ${formatInr(amount)}.` : `${title}.`;
  return { kind: "ready", action: resolved, title, button, summary, disabled_reason: null, question: null };
}

async function buildRecordPayment(ctx: ResolveContext, action: ToolAction, index: number, deps: WriteDeps): Promise<WriteResult> {
  const r = ctx.register;
  const vendors = await deps.access.vendors();
  const draft = baseAction(index, action, "record_payment", {}, {});
  const found = resolveVendor(action, ctx.snapshot, vendors);
  if (!found.ok) {
    if (found.reason === "unknown" && found.heard) return { kind: "clarify", action: draft, question: couldNotFindVendor(r, found.heard), options: [], missing_fields: [`${index}:vendor_id`] };
    const list = found.reason === "ambiguous" ? found.candidates : vendors.filter((v) => !v.is_one_off);
    const q = r === "en" ? reply(r, `Which vendor? ${roleList(list, r)}?`) : r === "hinglish" ? reply(r, `Kis vendor ko? ${roleList(list, r)}?`, `किस vendor को? ${roleList(list, "hi")}?`) : reply(r, `किस वेंडर को? ${roleList(list, "hi")}?`);
    return { kind: "clarify", action: draft, question: q, options: vendorOptions(list, index), missing_fields: [`${index}:vendor_id`] };
  }
  const vendor = found.value;
  const ledger = await deps.access.ledger(vendor.vendor_id);
  const payments = (ledger?.payments ?? []).filter((p) => !p.voided);
  const role = roleOrName(vendor, vendors);
  const facts: ServerFacts = { vendor_id: vendor.vendor_id, vendor_name: vendor.name, role_en: role.en, role_hi: role.hi, role_is_unique: role.is_role, first_owner: deps.first_owner };
  setFacts(draft, facts);

  // 5.1: a correction cue with no new-payment cue, and the vendor already has a payment.
  const paymentActions = ctx.tool.actions.filter((a) => a.kind === "record_payment" || a.kind === "correct_payment");
  if (paymentActions.length === 1 && payments.length > 0 && hasCue(ctx.transcript, CORRECTION_CUES) && !hasCue(ctx.transcript, NEW_PAYMENT_CUES)) {
    const p = payments[0];
    const when = p.paid_on ? formatShortDate(p.paid_on) : "no date";
    const q =
      r === "en"
        ? reply(r, `Is this a new payment, or a correction of the ${formatInr(p.amount_inr)} ${PAYMENT_KIND_LABELS[p.payment_kind].in_sentence} on ${when}?`)
        : r === "hinglish"
          ? reply(r, `Yeh naya payment hai, ya ${when} wale ${formatInr(p.amount_inr)} ${PAYMENT_KIND_LABELS[p.payment_kind].in_sentence} ki correction?`)
          : reply(r, `यह नया भुगतान है, या ${when} के ${inrWords(p.amount_inr, "hi")} के ${PAYMENT_KIND_LABELS[p.payment_kind].hi} में सुधार?`);
    return {
      kind: "clarify",
      action: draft,
      question: q,
      options: [
        { label: "New payment", value: "o1", apply: [{ action_index: index, field: "kind", value: "record_payment" }, { action_index: index, field: "__new_payment", value: true }] },
        { label: "Correction", value: "o2", apply: [{ action_index: index, field: "kind", value: "correct_payment" }] },
      ],
      missing_fields: [],
    };
  }

  const amount = num(action.amount_inr);
  const kindSaid = text(action.payment_kind) as PaymentKind | null;
  if (amount === null) {
    const existing = payments.find((p) => !kindSaid || p.payment_kind === kindSaid);
    const q =
      existing && r === "en"
        ? reply(r, `How much? A ${formatInr(existing.amount_inr)} ${PAYMENT_KIND_LABELS[existing.payment_kind].in_sentence} is already recorded, so is this a new payment?`)
        : existing && r === "hinglish"
          ? reply(r, `Kitna diya? ${formatInr(existing.amount_inr)} ka ${PAYMENT_KIND_LABELS[existing.payment_kind].in_sentence} pehle se likha hai, kya yeh naya payment hai?`, `कितना दिया? ${inrWords(existing.amount_inr, "hi")} का ${PAYMENT_KIND_LABELS[existing.payment_kind].in_sentence} पहले से लिखा है, क्या यह नया payment है?`)
          : existing
            ? reply(r, `कितना दिया? ${inrWords(existing.amount_inr, "hi")} का ${PAYMENT_KIND_LABELS[existing.payment_kind].hi} पहले से लिखा है, क्या यह नया भुगतान है?`)
            : r === "en"
              ? reply(r, "How much?")
              : reply(r, "Kitna diya?", "कितना दिया?");
    return { kind: "clarify", action: draft, question: q, options: [], missing_fields: [`${index}:amount_inr`] };
  }
  const single = ctx.tool.actions.length === 1;
  let check = checkValue(ctx, action, "amount_inr", amount, null);
  if (check.state === "ok" && amount < 100) check = { state: "uncertain", phrase: check.phrase, code_value: null, reason: "small" };
  if (check.state === "ok" && modelMissing(ctx.tool.missing_fields, index, "amount_inr", single)) check = { state: "uncertain", phrase: check.phrase, code_value: null, reason: "mismatch" };
  if (check.state === "uncertain") {
    const q = numberQuestion(r, index, "amount_inr", check, amount);
    return { kind: "clarify", action: draft, question: q.question, options: q.options, missing_fields: [`${index}:amount_inr`] };
  }
  const payment_kind: PaymentKind = kindSaid ?? (payments.length === 0 ? "advance" : "instalment");
  const input: JsonObject = { vendor_id: vendor.vendor_id, amount_inr: amount, payment_kind };
  const fields: VoicePreviewField[] = [
    field("vendor_id", "Vendor", null, vendor.name, heardFor(action, "vendor_id")),
    field("amount_inr", "Amount", null, formatInr(amount), check.phrase),
    field("payment_kind", "Type", null, `${PAYMENT_KIND_LABELS[payment_kind].en}${kindSaid ? "" : " (suggested)"}`, heardFor(action, "payment_kind")),
  ];
  const missing: string[] = [];
  const paidOn = text(action.paid_on);
  if (paidOn) {
    const c = checkValue(ctx, action, "paid_on", paidOn, null);
    if (c.state === "ok") {
      input.paid_on = paidOn;
      fields.push(field("paid_on", "Paid on", null, formatShortDate(paidOn), c.phrase));
    } else {
      fields.push(field("paid_on", "Paid on", null, formatShortDate(paidOn), c.phrase, "uncertain"));
      missing.push(`${index}:paid_on`);
    }
  } else fields.push(field("paid_on", "Paid on", null, "Date not given", null));
  const method = text(action.method);
  if (method) {
    input.method = method;
    fields.push(field("method", "Method", null, PAYMENT_METHOD_LABELS[method as keyof typeof PAYMENT_METHOD_LABELS] ?? method, heardFor(action, "method")));
  }
  const note = text(action.note);
  if (note) input.note = note;
  const active = (ledger?.commitments ?? []).filter((c) => !c.voided);
  if (active.length === 1) input.commitment_id = active[0].commitment_id;

  const warnings: string[] = [];
  const dup = payments.find((p) => p.amount_inr === amount && p.payment_kind === payment_kind && (p.paid_on ?? null) === (paidOn ?? null));
  if (dup) warnings.push(`Looks like the ${formatInr(dup.amount_inr)} ${PAYMENT_KIND_LABELS[dup.payment_kind].in_sentence} already recorded${dup.paid_on ? ` on ${formatShortDate(dup.paid_on)}` : ""}. Save another?`);
  const figures = ledger?.figures;
  const after = figures ? [stillOwedRow("en", figures, figures.paid_inr + amount)] : [];
  if (figures && figures.paid_inr + amount > figures.committed_inr && figures.committed_inr > 0) warnings.push(`Overpaid ${formatInr(figures.paid_inr + amount - figures.committed_inr)}`);

  const v = validateLikeTyping("record_payment", input);
  if (!v.ok) missing.push(`${index}:${v.field}`);
  const wrapped = wrapForManager(ctx, "record_payment", input);
  if (wrapped.proposed) warnings.push(`The ledger won't change until ${deps.first_owner} approves.`);
  const resolved: ResolvedAction = {
    ...draft,
    command: wrapped.command,
    input: wrapped.input,
    labels: labelsFor(input),
    preview: { kind: action.kind, command: wrapped.command, fields, after_saving: wrapped.proposed ? after.map((row) => ({ ...row, label: "After approval" })) : after, warnings },
    missing_fields: missing,
  };
  setFacts(resolved, { ...facts, new_amount_inr: amount, payment_kind });
  const title = wrapped.proposed ? "Payment, sent for approval" : "New payment";
  const button = wrapped.proposed ? "Send for approval" : "Save payment";
  return { kind: "ready", action: resolved, title, button, summary: `${title}: ${formatInr(amount)} to ${vendor.name}.`, disabled_reason: missing.length ? "Check the marked fields to save." : null, question: null };
}

// ---------------------------------------------------------------------------
// update_commitment (M-08) and record_commitment (M-01)
// ---------------------------------------------------------------------------

async function buildUpdateCommitment(ctx: ResolveContext, action: ToolAction, index: number, deps: WriteDeps): Promise<WriteResult> {
  const r = ctx.register;
  const vendors = await deps.access.vendors();
  const draft = baseAction(index, action, "update_commitment", {}, {});
  let vendor: VendorRef | null = null;
  const commitmentRef = text(action.commitment_id);
  const commitmentId = commitmentRef ? (ctx.snapshot.ref_map[commitmentRef] ?? null) : null;
  if (commitmentId) {
    for (const v of vendors) {
      const ledger = await deps.access.ledger(v.vendor_id);
      if (ledger?.commitments?.some((c) => c.commitment_id === commitmentId)) vendor = v;
    }
  }
  if (!vendor) {
    const found = resolveVendor(action, ctx.snapshot, vendors);
    if (!found.ok) {
      const list = vendors.filter((v) => !v.is_one_off);
      return { kind: "clarify", action: draft, question: r === "en" ? reply(r, `Which vendor? ${roleList(list, r)}?`) : reply(r, `Kis vendor ka? ${roleList(list, r)}?`, `किस vendor का? ${roleList(list, "hi")}?`), options: vendorOptions(list, index), missing_fields: [`${index}:commitment_id`] };
    }
    vendor = found.value;
  }
  const ledger = await deps.access.ledger(vendor.vendor_id);
  const active = (ledger?.commitments ?? []).filter((c) => !c.voided && (!commitmentId || c.commitment_id === commitmentId));
  if (active.length === 0) {
    return { kind: "clarify", action: draft, question: reply(r, `Nothing is agreed with ${vendor.name} yet. Shall I record a new amount?`), options: [], missing_fields: [`${index}:commitment_id`] };
  }
  if (active.length > 1) {
    return {
      kind: "clarify",
      action: draft,
      question: reply(r, `Which one: ${active.map((c) => formatInr(c.amount_inr)).join(", or ")}?`),
      options: active.slice(0, 6).map((c, i) => ({ label: formatInr(c.amount_inr), value: `o${i + 1}`, apply: [{ action_index: index, field: "commitment_id", value: c.seed_key ?? c.commitment_id }] })),
      missing_fields: [`${index}:commitment_id`],
    };
  }
  const commitment = active[0];
  const role = roleOrName(vendor, vendors);
  const facts: ServerFacts = { vendor_id: vendor.vendor_id, vendor_name: vendor.name, role_en: role.en, role_hi: role.hi, role_is_unique: role.is_role, old_amount_inr: commitment.amount_inr, first_owner: deps.first_owner };
  draft.entity_ref = commitment.seed_key ?? refOf(ctx.snapshot, commitment.commitment_id);
  const input: JsonObject = { commitment_id: commitment.commitment_id, expected_version: commitment.version_no };
  const amount = num(action.amount_inr);
  if (amount === null) return { kind: "clarify", action: draft, question: reply(r, r === "en" ? "What's the new amount?" : "Naya amount kitna hai?", r === "en" ? undefined : "नया amount कितना है?"), options: [], missing_fields: [`${index}:amount_inr`] };
  if (commitment.pricing === "per_unit") {
    return { kind: "clarify", action: draft, question: reply(r, "Is that a new rate or a new count?"), options: [], missing_fields: [`${index}:amount_inr`] };
  }
  const check = checkValue(ctx, action, "amount_inr", amount, null);
  if (check.state === "uncertain") {
    const q = numberQuestion(r, index, "amount_inr", check, amount);
    return { kind: "clarify", action: draft, question: q.question, options: q.options, missing_fields: [`${index}:amount_inr`] };
  }
  if (amount === commitment.amount_inr) {
    return { kind: "answer", action: draft, reply: r === "en" ? reply(r, `It's already ${formatInr(amount)}.`) : reply(r, `Yeh pehle se ${formatInr(amount)} hai.`, `यह पहले से ${inrWords(amount, "hi")} है।`) };
  }
  input.amount_inr = amount;
  const warnings: string[] = [];
  const previous = num(action.previous_inr);
  if (previous !== null && heardFor(action, "previous_inr") && previous !== commitment.amount_inr) warnings.push(`You said ${formatInr(previous)}; the record shows ${formatInr(commitment.amount_inr)}.`);
  const after: { label: string; old: string; new: string }[] = [];
  if (ledger?.figures) {
    const newCommitted = ledger.figures.committed_inr - commitment.amount_inr + amount;
    after.push({ label: "Still owed", old: formatInr(ledger.figures.outstanding_inr), new: formatInr(Math.max(0, newCommitted - ledger.figures.paid_inr)) });
  }
  const money = await deps.access.money();
  const line = money?.categories?.find((c) => c.budget_category === vendor?.vendor_category);
  const overFacts: ServerFacts = {};
  if (line && line.planned_inr !== null) {
    const newLine = line.committed_inr - commitment.amount_inr + amount;
    if (newLine > line.planned_inr) {
      warnings.push(`${BUDGET_CATEGORY_LABELS[line.budget_category].en.split(" ")[0]} ${formatInr(newLine - line.planned_inr)} over its ${formatInr(line.planned_inr)} budget`);
      overFacts.over_budget_inr = newLine - line.planned_inr;
      overFacts.over_budget_label_en = BUDGET_CATEGORY_LABELS[line.budget_category].en.split(" ")[0]?.toLowerCase();
      overFacts.over_budget_label_hi = BUDGET_CATEGORY_LABELS[line.budget_category].hi;
    }
  }
  const wrapped = wrapForManager(ctx, "update_commitment", input);
  const resolved: ResolvedAction = {
    ...draft,
    command: wrapped.command,
    input: wrapped.input,
    labels: labelsFor(input),
    preview: { kind: action.kind, command: wrapped.command, fields: [field("amount_inr", vendor.name, formatInr(commitment.amount_inr), formatInr(amount), check.phrase)], after_saving: after, warnings },
  };
  setFacts(resolved, { ...facts, new_amount_inr: amount, ...overFacts });
  const title = wrapped.proposed ? "Agreed amount, sent for approval" : "Agreed amount";
  return { kind: "ready", action: resolved, title, button: wrapped.proposed ? "Send for approval" : "Save new amount", summary: `${title}: ${formatInr(commitment.amount_inr)} → ${formatInr(amount)}.`, disabled_reason: null, question: null };
}

async function buildRecordCommitment(ctx: ResolveContext, action: ToolAction, index: number, deps: WriteDeps): Promise<WriteResult> {
  const r = ctx.register;
  const vendors = await deps.access.vendors();
  const draft = baseAction(index, action, "record_commitment", {}, {});
  const found = resolveVendor(action, ctx.snapshot, vendors);
  if (!found.ok) {
    const list = vendors.filter((v) => !v.is_one_off);
    return { kind: "clarify", action: draft, question: reply(r, r === "en" ? `Which vendor? ${roleList(list, r)}?` : `Kis vendor ka? ${roleList(list, r)}?`), options: vendorOptions(list, index), missing_fields: [`${index}:vendor_id`] };
  }
  const vendor = found.value;
  const role = roleOrName(vendor, vendors);
  setFacts(draft, { vendor_id: vendor.vendor_id, vendor_name: vendor.name, role_en: role.en, role_hi: role.hi, role_is_unique: role.is_role, first_owner: deps.first_owner });
  const ledger = await deps.access.ledger(vendor.vendor_id);
  const rate = num(action.unit_price_inr);
  const qty = num(action.quantity);
  const pricing = rate !== null && qty !== null ? "per_unit" : "lump_sum";
  const input: JsonObject = { vendor_id: vendor.vendor_id, pricing };
  const fields: VoicePreviewField[] = [field("vendor_id", "Vendor", null, vendor.name, null)];
  let total: number | null = null;
  if (pricing === "per_unit") {
    for (const [key, value] of [["unit_price_inr", rate], ["quantity", qty]] as const) {
      const check = checkValue(ctx, action, key, value, null);
      if (check.state === "uncertain") {
        const q = numberQuestion(r, index, key, check, value);
        return { kind: "clarify", action: draft, question: q.question, options: q.options, missing_fields: [`${index}:${key}`] };
      }
    }
    const unit = text(action.unit) ?? (vendor.vendor_category === "catering" ? "plate" : "person");
    total = (rate as number) * (qty as number);
    Object.assign(input, { unit, unit_price_inr: rate, quantity: qty, amount_inr: total, description: `${qty} ${unit}s × ${formatInr(rate as number)}${text(action.description) ? `, ${text(action.description)}` : ""}`.slice(0, 200) });
    fields.push(field("unit_price_inr", "Rate", null, `${formatInr(rate as number)} per ${unit}${text(action.unit) ? "" : " (suggested)"}`, heardFor(action, "unit_price_inr")));
    fields.push(field("quantity", "How many", null, String(qty), heardFor(action, "quantity")));
    fields.push(field("amount_inr", "Total", null, formatInr(total), null));
    const said = num(action.amount_inr);
    if (said !== null && said !== total) {
      return { kind: "clarify", action: draft, question: reply(r, `${qty} × ${formatInr(rate as number)} is ${formatInr(total)}, but I heard ${formatInr(said)}. Which is right?`), options: [], missing_fields: [`${index}:amount_inr`] };
    }
    const linked = ledger?.vendor.functions ?? [];
    const ev = text(action.event_id);
    if (ev) {
      const itinerary = await deps.access.itinerary();
      const e = resolveEvent(action, ctx.snapshot, itinerary);
      if (e.ok) input.event_id = e.value.event_id;
    } else if (linked.length === 1) {
      input.event_id = linked[0].event_id;
      fields.push(field("event_id", "Function", null, linked[0].title, null));
    }
    const openQuotes = (ledger?.quotes ?? []).filter((q) => q.status === "open");
    if (openQuotes.length === 1) {
      input.quote_id = openQuotes[0].quote_id;
      draft.preview.warnings.push(`Accepts quote: ${openQuotes[0].unit_price_inr ? `${formatInr(openQuotes[0].unit_price_inr)} × ${openQuotes[0].quantity}` : formatInr(openQuotes[0].amount_inr)}`);
    }
  } else {
    const amount = num(action.amount_inr);
    if (amount === null) return { kind: "clarify", action: draft, question: reply(r, r === "en" ? "How much is agreed?" : "Kitna tay hua?"), options: [], missing_fields: [`${index}:amount_inr`] };
    const check = checkValue(ctx, action, "amount_inr", amount, null);
    if (check.state === "uncertain") {
      const q = numberQuestion(r, index, "amount_inr", check, amount);
      return { kind: "clarify", action: draft, question: q.question, options: q.options, missing_fields: [`${index}:amount_inr`] };
    }
    total = amount;
    input.amount_inr = amount;
    fields.push(field("amount_inr", "Amount", null, formatInr(amount), check.phrase));
  }
  const after = ledger?.figures && total !== null ? [{ label: "Still owed", old: formatInr(ledger.figures.outstanding_inr), new: formatInr(Math.max(0, ledger.figures.committed_inr + total - ledger.figures.paid_inr)) }] : [];
  const wrapped = wrapForManager(ctx, "record_commitment", input);
  const resolved: ResolvedAction = { ...draft, command: wrapped.command, input: wrapped.input, labels: labelsFor(input), preview: { ...draft.preview, command: wrapped.command, fields, after_saving: after } };
  setFacts(resolved, { new_amount_inr: total ?? undefined });
  return { kind: "ready", action: resolved, title: wrapped.proposed ? "Agreed amount, sent for approval" : "Agreed amount", button: wrapped.proposed ? "Send for approval" : "Save agreed amount", summary: `Agreed amount: ${formatInr(total ?? 0)} with ${vendor.name}.`, disabled_reason: null, question: null };
}

// ---------------------------------------------------------------------------
// update_event (E-03, E-04, E-08) and create_event (E-01, E-02)
// ---------------------------------------------------------------------------

const EVENT_VALUE_FIELDS = ["title", "event_date", "start_time", "end_time", "muhurat_time", "venue_name", "dress_code", "lead_name", "expected_headcount"] as const;

function eventFieldDisplay(fieldKey: string, value: unknown): string {
  if (value === null || value === undefined) return "-";
  if (fieldKey === "event_date" && typeof value === "string") return formatDate(value);
  if ((fieldKey === "start_time" || fieldKey === "end_time" || fieldKey === "muhurat_time") && typeof value === "string") return formatTime(value);
  return String(value);
}

function eventFieldLabel(fn: { title: string }, fieldKey: string): string {
  switch (fieldKey) {
    case "venue_name":
      return `${fn.title} venue`;
    case "end_time":
      return `${fn.title} ends`;
    case "start_time":
      return `${fn.title} starts`;
    case "event_date":
      return `${fn.title} date`;
    default:
      return `${fn.title} ${labelOf(fieldKey).toLowerCase()}`;
  }
}

function minutesOf(time: string | null): number | null {
  if (!time) return null;
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

async function buildUpdateEvent(ctx: ResolveContext, action: ToolAction, index: number, deps: WriteDeps): Promise<WriteResult> {
  const r = ctx.register;
  const itinerary = await deps.access.itinerary();
  const draft = baseAction(index, action, "update_event", {}, {});
  const found = resolveEvent(action, ctx.snapshot, itinerary);
  if (!found.ok) {
    const list = found.reason === "ambiguous" ? found.candidates : functionList(itinerary, r).functions;
    return { kind: "clarify", action: draft, question: whichFunctionQuestion(r, itinerary), options: functionOptions(ctx.snapshot, list, index), missing_fields: [`${index}:event_id`] };
  }
  const fn = found.value;
  draft.entity_ref = fn.seed_key ?? refOf(ctx.snapshot, fn.event_id);
  const facts: ServerFacts = { event_id: fn.event_id, event_title: fn.title, event_title_hi: fn.title_hi, published_venue: fn.published?.venue?.name ?? fn.venue?.name ?? undefined, owners: deps.owners };
  const input: JsonObject = { event_id: fn.event_id, expected_version: fn.version };
  const fields: VoicePreviewField[] = [];
  const after: { label: string; old: string; new: string }[] = [];
  const changed: string[] = [];
  const missing: string[] = [];
  let clashCleared: { en: string; hi: string } | null = null;
  let sameCount = 0;
  let sameValue = "";
  const single = ctx.tool.actions.length === 1;
  const weddingDate = (await deps.access.profile())?.wedding_date ?? null;

  for (const key of EVENT_VALUE_FIELDS) {
    const value = action[key];
    if (value === undefined || value === null || value === "") continue;
    if (key === "venue_name") {
      const venue = resolveVenue(String(value), itinerary?.venues ?? []);
      if (venue.ok) {
        if (venue.value.venue_id === fn.venue_id) {
          sameCount += 1;
          sameValue = venue.value.name;
          continue;
        }
        input.venue_id = venue.value.venue_id;
        facts.venue_name = venue.value.name;
        const place = venue.value.place_name ? `${venue.value.place_name}, ` : "";
        fields.push(field("venue_id", eventFieldLabel(fn, "venue_name"), fn.venue?.name ?? null, `${venue.value.name}${venue.value.capacity || place ? ` (${place}seats ${venue.value.capacity ?? "?"})` : ""}`, heardFor(action, "venue_name")));
        changed.push("venue");
        const over = (itinerary?.conflicts ?? []).find((c) => c.kind === "over_capacity" && c.event_ids.includes(fn.event_id));
        if (over && over.kind === "over_capacity" && (venue.value.capacity ?? 0) >= over.confirmed_headcount) after.push({ label: "The over-capacity warning goes away.", old: "", new: "" });
      } else if (venue.reason === "ambiguous") {
        return {
          kind: "clarify",
          action: draft,
          question: reply(r, r === "en" ? `Which one: ${venue.candidates.map((v) => v.name).join(", or ")}?` : `Kaunsa: ${venue.candidates.map((v) => v.name).join(", ya ")}?`),
          options: venue.candidates.slice(0, 6).map((v, i) => ({ label: v.name, value: `o${i + 1}`, apply: [{ action_index: index, field: "venue_name", value: v.name }] })),
          missing_fields: [`${index}:venue_name`],
        };
      } else {
        input.venue_name = String(value);
        facts.venue_name = String(value);
        fields.push(field("venue_name", eventFieldLabel(fn, "venue_name"), fn.venue?.name ?? null, `${String(value)} (New venue)`, heardFor(action, "venue_name")));
        changed.push("venue");
      }
      continue;
    }
    if (key === "event_date") {
      const phrase = heardFor(action, "event_date");
      const read = phrase ? safeReadDate(phrase, ctx.snapshot.today, weddingDate) : null;
      if (read?.relative) {
        const resolvedDate = read.date ?? String(value);
        const dShort = formatLongDate(resolvedDate, false);
        const currentShort = formatLongDate(fn.event_date, false);
        const daypart = fn.start_time && Number(fn.start_time.slice(0, 2)) < 12 ? { en: "in the morning", hl: "subah", hi: "सुबह" } : { en: "", hl: "", hi: "" };
        const word = phrase ?? "kal";
        const q =
          r === "en"
            ? reply(r, `Do you mean ${read.relative}, ${dShort}? The ${fn.title.toLowerCase()} is on ${currentShort}${daypart.en ? ` ${daypart.en}` : ""}, so which date should I use?`)
            : r === "hinglish"
              ? reply(
                  r,
                  `${capitalize(word)} matlab ${dShort}? ${fn.title} abhi ${currentShort}${daypart.hl ? ` ${daypart.hl}` : ""} hai, kaunsi tareekh rakhun?`,
                  `${relativeWordSpeech(word)} मतलब ${dateSpeech(resolvedDate, "hinglish")}? ${fn.title} अभी ${dateSpeech(fn.event_date, "hinglish")}${daypart.hi ? ` ${daypart.hi}` : ""} है, कौन सी तारीख़ रखूँ?`,
                )
              : reply(
                  r,
                  `कल यानी ${shortDateHi(resolvedDate)}? ${fn.title_hi} अभी ${shortDateHi(fn.event_date)}${daypart.hi ? ` ${daypart.hi}` : ""} है, कौन सी तारीख़ रखूँ?`,
                  `कल यानी ${dateSpeech(resolvedDate, "hi")}? ${fn.title_hi} अभी ${dateSpeech(fn.event_date, "hi")}${daypart.hi ? ` ${daypart.hi}` : ""} है, कौन सी तारीख़ रखूँ?`,
                );
        return {
          kind: "clarify",
          action: draft,
          question: q,
          options: [
            { label: dShort, value: "o1", default: true, apply: [{ action_index: index, field: "event_date", value: resolvedDate }, { action_index: index, field: "__date_confirmed", value: true }] },
            { label: `Keep ${currentShort}`, value: "o2", apply: [{ action_index: index, field: "event_date", value: fn.event_date }, { action_index: index, field: "__date_confirmed", value: true }] },
          ],
          missing_fields: [`${index}:event_date`],
        };
      }
    }
    let check = checkValue(ctx, action, key, value, weddingDate, { event_times: { start_time: fn.start_time, end_time: fn.end_time, muhurat_time: fn.muhurat_time, ...pickTimes(action) } });
    if (check.state === "uncertain" && action.__date_confirmed === true && key === "event_date") check = { state: "ok", phrase: check.phrase };
    if (check.state === "ok" && modelMissing(ctx.tool.missing_fields, index, key, single)) check = { state: "uncertain", phrase: check.phrase, code_value: null, reason: "mismatch" };
    const stored = (fn as unknown as Record<string, unknown>)[key];
    if (check.state === "uncertain") {
      if (changed.length === 0 && EVENT_VALUE_FIELDS.filter((k) => action[k] !== undefined).length === 1) {
        if (key === "start_time" || key === "end_time" || key === "muhurat_time") {
          const h = Number(String(value).slice(0, 2)) % 12 || 12;
          const q = r === "en" ? reply(r, `${h} in the morning or the evening?`) : r === "hinglish" ? reply(r, `Subah ${h} ya shaam ${h}?`, `सुबह ${countHi(h)} या शाम ${countHi(h)}?`) : reply(r, `सुबह ${countHi(h)} या शाम ${countHi(h)}?`);
          const am = `${String(h % 12).padStart(2, "0")}:${String(value).slice(3, 5)}`;
          const pm = `${String((h % 12) + 12).padStart(2, "0")}:${String(value).slice(3, 5)}`;
          return { kind: "clarify", action: draft, question: q, options: [{ label: formatTime(am), value: "o1", apply: [{ action_index: index, field: key, value: am }] }, { label: formatTime(pm), value: "o2", apply: [{ action_index: index, field: key, value: pm }] }], missing_fields: [`${index}:${key}`] };
        }
        const q = numberQuestion(r, index, key, check, value);
        return { kind: "clarify", action: draft, question: q.question, options: q.options, missing_fields: [`${index}:${key}`] };
      }
      fields.push(field(key, eventFieldLabel(fn, key), eventFieldDisplay(key, stored), eventFieldDisplay(key, value), check.phrase, "uncertain"));
      missing.push(`${index}:${key}`);
      input[key] = value as string;
      continue;
    }
    if (stored === value) {
      sameCount += 1;
      sameValue = eventFieldDisplay(key, value);
      continue;
    }
    input[key] = value as string | number;
    changed.push(key);
    fields.push(field(key, eventFieldLabel(fn, key), eventFieldDisplay(key, stored), eventFieldDisplay(key, value), check.phrase));
    if (key === "end_time" || key === "start_time") {
      const newStart = minutesOf(key === "start_time" ? String(value) : fn.start_time);
      const newEnd = minutesOf(key === "end_time" ? String(value) : fn.end_time);
      for (const c of itinerary?.conflicts ?? []) {
        if (c.kind !== "overlap" || !c.event_ids.includes(fn.event_id)) continue;
        const otherId = c.event_ids.find((id) => id !== fn.event_id);
        const other = itinerary?.functions.find((f) => f.event_id === otherId);
        if (!other || other.event_date !== fn.event_date) continue;
        const oStart = minutesOf(other.start_time);
        const oEnd = minutesOf(other.end_time);
        if (newStart !== null && newEnd !== null && oStart !== null && oEnd !== null && (newEnd <= oStart || newStart >= oEnd)) {
          after.push({ label: `The overlap with the ${other.title} goes away.`, old: "", new: "" });
          clashCleared = { en: other.title, hi: other.title_hi };
        }
      }
    }
  }

  if (changed.length === 0 && missing.length === 0) {
    if (sameCount > 0) {
      return { kind: "answer", action: draft, reply: r === "en" ? reply(r, `It's already ${sameValue}.`) : r === "hinglish" ? reply(r, `Yeh pehle se ${sameValue} hai.`, `यह पहले से ${sameValue} है।`) : reply(r, `यह पहले से ${sameValue} है।`) };
    }
    return { kind: "clarify", action: draft, question: r === "en" ? reply(r, `What should change for the ${fn.title.toLowerCase()}?`) : reply(r, `${fn.title} mein kya badalna hai?`, `${fn.title} में क्या बदलना है?`), options: [], missing_fields: [`${index}:venue_name`] };
  }

  if (changed.includes("venue") && fn.published?.venue?.name) after.push({ label: `Guests still see ${fn.published.venue.name} until an owner publishes.`, old: "", new: "" });
  else if (fn.published && changed.length > 0) after.push({ label: "Guests see the change once an owner publishes.", old: "", new: "" });

  const v = validateLikeTyping("update_event", input);
  if (!v.ok) missing.push(`${index}:${v.field}`);
  const resolved: ResolvedAction = { ...draft, input, labels: labelsFor(input), preview: { kind: action.kind, command: "update_event", fields, after_saving: after, warnings: [] }, missing_fields: missing };
  setFacts(resolved, {
    ...facts,
    changed_fields: changed,
    ...(clashCleared ? { clash_cleared_with: clashCleared.en, clash_cleared_with_hi: clashCleared.hi } : {}),
  });
  const title = changed.length === 1 ? eventFieldLabel(fn, changed[0] === "venue" ? "venue_name" : changed[0]) : `${fn.title} changes`;
  const first = fields[0];
  const summary = first ? `${title}: ${first.old ?? "-"} → ${(first.new ?? "").replace(/ \(.*\)$/, "")}.` : `${title}.`;
  return { kind: "ready", action: resolved, title, button: "Save draft", summary, disabled_reason: missing.length ? "Check the marked fields to save." : null, question: null };
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The times said in this action, which settle a daypart-less time beside them (3.4). */
function pickTimes(action: ToolAction): { start_time?: string; end_time?: string; muhurat_time?: string } {
  const out: { start_time?: string; end_time?: string; muhurat_time?: string } = {};
  for (const key of ["start_time", "end_time", "muhurat_time"] as const) {
    const value = text(action[key]);
    if (value) out[key] = value;
  }
  return out;
}

function safeReadDate(phrase: string, today: string, wedding_date: string | null): ReturnType<typeof readDate> | null {
  try {
    return readDate(phrase, { today, wedding_date });
  } catch {
    return null;
  }
}

async function buildCreateEvent(ctx: ResolveContext, action: ToolAction, index: number, deps: WriteDeps): Promise<WriteResult> {
  const r = ctx.register;
  const itinerary = await deps.access.itinerary();
  const draft = baseAction(index, action, "create_event", {}, {});
  const kind = text(action.event_kind);
  if (!kind) {
    return { kind: "clarify", action: draft, question: r === "en" ? reply(r, "Which function?") : reply(r, "Kaunsa function?", "कौन सा function?"), options: [], missing_fields: [`${index}:event_kind`] };
  }
  const weddingDate = (await deps.access.profile())?.wedding_date ?? null;
  const input: JsonObject = { event_kind: kind };
  const title = text(action.title);
  if (title) input.title = title;
  const name = title ?? capitalize(kind);
  const fields: VoicePreviewField[] = [];
  const missing: string[] = [];
  const date = text(action.event_date);
  if (!date) return { kind: "clarify", action: draft, question: r === "en" ? reply(r, "On which date?") : reply(r, "Kis tareekh ko?", "किस तारीख़ को?"), options: [], missing_fields: [`${index}:event_date`] };
  const phrase = heardFor(action, "event_date");
  const read = phrase ? safeReadDate(phrase, ctx.snapshot.today, weddingDate) : null;
  if (read?.relative && action.__date_confirmed !== true) {
    const resolvedDate = read.date ?? date;
    return {
      kind: "clarify",
      action: draft,
      question:
        r === "en"
          ? reply(r, `Do you mean ${read.relative}, ${formatLongDate(resolvedDate, false)}?`)
          : r === "hinglish"
            ? reply(r, `${capitalize(phrase ?? "kal")} matlab ${formatLongDate(resolvedDate, false)}?`, `${relativeWordSpeech(phrase ?? "kal")} मतलब ${dateSpeech(resolvedDate, "hinglish")}?`)
            : reply(r, `कल यानी ${shortDateHi(resolvedDate)}?`, `कल यानी ${dateSpeech(resolvedDate, "hi")}?`),
      options: [{ label: formatLongDate(resolvedDate, false), value: "o1", default: true, apply: [{ action_index: index, field: "event_date", value: resolvedDate }, { action_index: index, field: "__date_confirmed", value: true }] }],
      missing_fields: [`${index}:event_date`],
    };
  }
  const dateCheck = action.__date_confirmed === true ? ({ state: "ok", phrase } as ValueCheck) : checkValue(ctx, action, "event_date", date, weddingDate);
  if (dateCheck.state === "uncertain") {
    const q = numberQuestion(r, index, "event_date", dateCheck, date);
    return { kind: "clarify", action: draft, question: q.question, options: q.options, missing_fields: [`${index}:event_date`] };
  }
  input.event_date = date;
  const fromMonth = read?.from_wedding_month === true;
  fields.push(field("event_date", "Date", null, `${formatDate(date)}${fromMonth ? " (from the wedding month)" : ""}`, phrase));
  for (const key of ["start_time", "end_time", "muhurat_time"] as const) {
    const value = text(action[key]);
    if (!value) continue;
    const check = checkValue(ctx, action, key, value, weddingDate);
    input[key] = value;
    fields.push(field(key, labelOf(key), null, formatTime(value), check.phrase, check.state === "ok" ? "ok" : "uncertain"));
    if (check.state !== "ok") missing.push(`${index}:${key}`);
  }
  const venueName = text(action.venue_name);
  let venueShown: string | null = null;
  if (venueName) {
    const venue = resolveVenue(venueName, itinerary?.venues ?? []);
    if (venue.ok) {
      input.venue_id = venue.value.venue_id;
      venueShown = venue.value.name;
      fields.push(field("venue_id", "Venue", null, venue.value.name, heardFor(action, "venue_name")));
    } else {
      input.venue_name = venueName;
      venueShown = venueName;
      fields.push(field("venue_name", "Venue", null, `${venueName} (New venue)`, heardFor(action, "venue_name")));
    }
  }
  for (const key of ["dress_code", "lead_name"] as const) {
    const value = text(action[key]);
    if (value) {
      input[key] = value;
      fields.push(field(key, labelOf(key), null, value, null));
    }
  }
  const headcount = num(action.expected_headcount);
  if (headcount !== null) {
    const check = checkValue(ctx, action, "expected_headcount", headcount, weddingDate);
    input.expected_headcount = headcount;
    fields.push(field("expected_headcount", labelOf("expected_headcount"), null, String(headcount), check.phrase, check.state === "ok" ? "ok" : "uncertain"));
    if (check.state !== "ok") missing.push(`${index}:expected_headcount`);
  }
  const warnings: string[] = [];
  const existing = kind !== "other" ? itinerary?.functions.find((f) => f.event_kind === kind) : undefined;
  if (existing) warnings.push(`There's already a ${kind} on ${formatDate(existing.event_date).slice(0, -5)}.`);
  const v = validateLikeTyping("create_event", input);
  if (!v.ok) missing.push(`${index}:${v.field}`);
  const resolved: ResolvedAction = { ...draft, input, labels: labelsFor(input), preview: { kind: action.kind, command: "create_event", fields, after_saving: [], warnings }, missing_fields: missing };
  setFacts(resolved, { event_title: name, venue_name: venueShown ?? undefined });
  const t = `Add ${kind === "other" ? name : kind}`;
  return { kind: "ready", action: resolved, title: t, button: t, summary: `${t}: ${formatDate(date)}${input.start_time ? `, ${formatTime(String(input.start_time))}` : ""}${venueShown ? `, ${venueShown}` : ""}.`, disabled_reason: missing.length ? "Check the marked fields to save." : null, question: null };
}

// ---------------------------------------------------------------------------
// add_requirement (R-01, R-02, R-03)
// ---------------------------------------------------------------------------

const REQUIREMENT_WORDS: [string, string[]][] = [
  ["catering", ["food", "khana", "खाना", "plates", "dessert", "menu", "jain"]],
  ["decor", ["flowers", "phool", "फूल", "decor", "canopy", "lights"]],
  ["music", ["dj", "music", "songs", "gaana", "गाना"]],
  ["ritual", ["pandit", "puja", "पूजा", "mandap"]],
  ["logistics", ["chairs", "seating", "transport", "parking"]],
  ["attire", ["clothes", "kapde", "कपड़े"]],
];

async function buildAddRequirement(ctx: ResolveContext, action: ToolAction, index: number, deps: WriteDeps): Promise<WriteResult> {
  const r = ctx.register;
  const itinerary = await deps.access.itinerary();
  const draft = baseAction(index, action, "add_requirement", {}, {});
  const found = resolveEvent(action, ctx.snapshot, itinerary);
  if (!found.ok) {
    const list = found.reason === "ambiguous" ? found.candidates : functionList(itinerary, r).functions;
    return { kind: "clarify", action: draft, question: whichFunctionQuestion(r, itinerary), options: functionOptions(ctx.snapshot, list, index), missing_fields: [`${index}:event_id`] };
  }
  const fn = found.value;
  const itemText = text(action.text);
  if (!itemText) return { kind: "clarify", action: draft, question: r === "en" ? reply(r, `What's needed at the ${fn.title.toLowerCase()}?`) : reply(r, `${fn.title} mein kya chahiye?`, `${fn.title} में क्या चाहिए?`), options: [], missing_fields: [`${index}:text`] };
  const input: JsonObject = { event_id: fn.event_id, text: itemText };
  const fields: VoicePreviewField[] = [field("event_id", "Function", null, fn.title, null), field("text", "What's needed", null, itemText, heardFor(action, "text"))];
  const missing: string[] = [];
  const quantity = num(action.quantity);
  if (quantity !== null) {
    const check = checkValue(ctx, action, "quantity", quantity, null);
    input.quantity = quantity;
    fields.push(field("quantity", "How many", null, String(quantity), check.phrase, check.state === "ok" ? "ok" : "uncertain"));
    if (check.state !== "ok") missing.push(`${index}:quantity`);
  }
  let category = text(action.requirement_category);
  if (!category) category = REQUIREMENT_WORDS.find(([, words]) => words.some((w) => hasWords(itemText, w) || hasWords(ctx.transcript, w)))?.[0] ?? "other";
  input.requirement_category = category;
  fields.push(field("requirement_category", "Category", null, capitalize(category), null));
  const vendors = await deps.access.vendors();
  let vendor: VendorRef | null = null;
  let suggested = false;
  if (text(action.vendor_id)) {
    const v = resolveVendor(action, ctx.snapshot, vendors);
    if (v.ok) vendor = v.value;
  }
  if (!vendor && ["catering", "decor", "music", "attire"].includes(category)) {
    const ofCategory = vendors.filter((v) => v.vendor_category === category && !v.is_one_off);
    let serving = ofCategory;
    if (ofCategory.length > 1) {
      serving = [];
      for (const v of ofCategory) {
        const ledger = await deps.access.ledger(v.vendor_id);
        if (ledger?.vendor.functions.some((f) => f.event_id === fn.event_id)) serving.push(v);
      }
    }
    if (serving.length === 1) {
      vendor = serving[0];
      suggested = true;
    }
  }
  if (vendor) {
    input.vendor_id = vendor.vendor_id;
    fields.push(field("vendor_id", "Vendor", null, `${vendor.name}${suggested ? " (suggested)" : ""}`, null));
  }
  // Duplicate (R-02): same function, same text ignoring case and spaces, same quantity.
  const label = quantity !== null ? `${itemText} for ${quantity}` : itemText;
  const dup = fn.requirements.find((req) => fold(req.label) === fold(label));
  const heardText = heardFor(action, "text");
  const facts: ServerFacts = { event_id: fn.event_id, event_title: fn.title, event_title_hi: fn.title_hi, vendor_id: vendor?.vendor_id, vendor_name: vendor?.name, heard_text: heardText && /[ऀ-ॿ]/.test(heardText) ? heardText : undefined };
  if (vendor) {
    const role = roleOrName(vendor, vendors);
    Object.assign(facts, { role_en: role.en, role_hi: role.hi, role_is_unique: role.is_role });
  }
  setFacts(draft, facts);
  draft.input = input;
  draft.labels = labelsFor(input);
  if (dup) {
    const q = quantity !== null
      ? r === "en"
        ? reply(r, `${itemText} for ${quantity} is already on the ${fn.title.toLowerCase()}.`)
        : r === "hinglish"
          ? reply(r, `${fn.title} mein ${quantity} logon ke liye ${itemText} pehle se hai.`, `${fn.title} में ${countHi(quantity)} लोगों के लिए ${itemText} पहले से है।`)
          : reply(r, `${fn.title_hi} में ${countHi(quantity)} लोगों के लिए ${facts.heard_text ?? itemText} पहले से है।`)
      : reply(r, `${itemText} is already on the ${fn.title.toLowerCase()}.`);
    return { kind: "clarify", action: draft, question: q, options: [], missing_fields: [] };
  }
  const v = validateLikeTyping("add_requirement", input);
  if (!v.ok) missing.push(`${index}:${v.field}`);
  const resolved: ResolvedAction = { ...draft, input, labels: labelsFor(input), entity_ref: fn.seed_key ?? null, preview: { kind: action.kind, command: "add_requirement", fields, after_saving: [], warnings: [] }, missing_fields: missing };
  return { kind: "ready", action: resolved, title: "Add requirement", button: "Save requirement", summary: `Add requirement: ${label} at the ${fn.title.toLowerCase()}.`, disabled_reason: missing.length ? "Check the marked fields to save." : null, question: null };
}

// ---------------------------------------------------------------------------
// publish_itinerary (E-05) and request_card_export (I-02)
// ---------------------------------------------------------------------------

async function buildPublish(ctx: ResolveContext, action: ToolAction, index: number, deps: WriteDeps): Promise<WriteResult> {
  const r = ctx.register;
  const itinerary = await deps.access.itinerary();
  const draft = baseAction(index, action, "publish_itinerary", {}, {});
  const changes = itinerary?.unpublished_changes ?? [];
  if (!itinerary || changes.length === 0) {
    return { kind: "answer", action: draft, reply: r === "en" ? reply(r, "There's nothing new to publish.") : r === "hinglish" ? reply(r, "Publish karne ke liye kuch naya nahi hai.", "Publish करने के लिए कुछ नया नहीं है।") : reply(r, "प्रकाशित करने के लिए कुछ नया नहीं है।") };
  }
  const revision = (itinerary.published_revision ?? 0) + 1;
  const input: JsonObject = { expected_draft_version: itinerary.draft_version };
  const fields: VoicePreviewField[] = changes.map((change) => {
    const fn = itinerary.functions.find((f) => f.event_id === change.entity_id);
    const label = fn ? `${fn.title} ${change.field.replace(/_id$/, "").replace(/_name$/, "").replace(/_/g, " ")}` : change.field.replace(/_/g, " ");
    return field(change.field, capitalize(label), change.published_value === null ? null : String(change.published_value), change.draft_value === null ? null : String(change.draft_value), null);
  });
  const venueChange = changes.find((c) => c.field.startsWith("venue"));
  const venueName = venueChange && venueChange.field !== "venue_id" && typeof venueChange.draft_value === "string" ? venueChange.draft_value : undefined;
  const fn = venueChange ? itinerary.functions.find((f) => f.event_id === venueChange.entity_id) : undefined;
  const resolved: ResolvedAction = { ...draft, input, labels: labelsFor(input), preview: { kind: action.kind, command: "publish_itinerary", fields, after_saving: [], warnings: [] } };
  setFacts(resolved, { revision, venue_name: venueName ?? fn?.venue?.name, event_title: fn?.title });
  const n = changes.length;
  const title = `Publish revision ${revision}`;
  return { kind: "ready", action: resolved, title, button: title, summary: `${title} · ${n} change${n === 1 ? "" : "s"}: ${fields.map((f) => f.label).join(", ")}`, disabled_reason: null, question: null };
}

async function buildExport(ctx: ResolveContext, action: ToolAction, index: number, deps: WriteDeps): Promise<WriteResult> {
  const r = ctx.register;
  const draft = baseAction(index, action, "request_card_export", {}, {});
  const status = await deps.access.exports();
  const itinerary = await deps.access.itinerary();
  const published = status?.published_revision ?? itinerary?.published_revision ?? null;
  if (!published) {
    return { kind: "answer", action: draft, reply: r === "en" ? reply(r, "Publish the schedule first. There's no card to make yet.") : reply(r, "Pehle schedule publish kijiye. Abhi card banane ke liye kuch nahi hai.", "पहले schedule publish कीजिए। अभी card बनाने के लिए कुछ नहीं है।") };
  }
  const job = status?.jobs.find((j) => j.revision === published && j.format === "png");
  if (job && (job.status === "succeeded" || job.status === "queued" || job.status === "rendering")) {
    const ready = job.status === "succeeded";
    return { kind: "answer", action: draft, reply: r === "en" ? reply(r, `The card for revision ${published} is already ${ready ? "ready" : "being made"}.`) : reply(r, `Revision ${published} ka card ${ready ? "pehle se taiyaar hai" : "abhi ban raha hai"}.`, `Revision ${published} का card ${ready ? "पहले से तैयार है" : "अभी बन रहा है"}।`) };
  }
  const input: JsonObject = { format: "png" };
  const older = (status?.jobs ?? []).some((j) => j.revision < published && j.status === "succeeded");
  const resolved: ResolvedAction = { ...draft, input, labels: labelsFor(input), preview: { kind: action.kind, command: "request_card_export", fields: [field("format", "Card", null, `Revision ${published} · PNG`, null)], after_saving: [], warnings: older ? ["The card downloaded before is out of date."] : [] } };
  setFacts(resolved, { revision: published, older_card: older, venue_name: (itinerary?.functions.find((f) => f.event_kind === "reception")?.published?.venue?.name) ?? undefined });
  return { kind: "ready", action: resolved, title: "Export card", button: "Export card", summary: `Export card · revision ${published}`, disabled_reason: null, question: null };
}

// ---------------------------------------------------------------------------
// set_wedding_profile (S-01, S-02, S-03)
// ---------------------------------------------------------------------------

const PROFILE_FIELDS = ["bride_name", "groom_name", "wedding_date", "city", "budget_inr", "expected_guests", "date_text", "month"] as const;

function mergeDraft(ctx: ResolveContext, action: ToolAction): ToolAction {
  const stored = ctx.context?.actions.find((a) => a.kind === "set_wedding_profile");
  const fromSnapshot = (ctx.snapshot.data as { setup_draft?: Record<string, unknown> }).setup_draft ?? {};
  const merged: ToolAction = { ...action };
  const base: Record<string, unknown> = { ...fromSnapshot, ...(stored ? { ...stored.raw, ...stored.input } : {}) };
  for (const key of PROFILE_FIELDS) {
    if ((merged[key] === undefined || merged[key] === null || merged[key] === "") && base[key] !== undefined) (merged as Record<string, unknown>)[key] = base[key];
  }
  const heard = [...((stored?.heard ?? []) as { field: string; phrase: string }[]).filter((h) => !(action.heard ?? []).some((n) => n.field === h.field)), ...(action.heard ?? [])];
  merged.heard = heard;
  return merged;
}

async function buildWeddingProfile(ctx: ResolveContext, rawAction: ToolAction, index: number): Promise<WriteResult> {
  const r = ctx.register;
  const creating = ctx.wedding_id === null;
  const action = creating ? mergeDraft(ctx, rawAction) : rawAction;
  const draft = baseAction(index, action, "set_wedding_profile", {}, {});
  const input: JsonObject = {};
  const fields: VoicePreviewField[] = [];
  const missing: string[] = [];
  const noted: { en: string[]; hi: string[]; hl: string[] } = { en: [], hi: [], hl: [] };
  const today = ctx.snapshot.today;
  const contextTranscript = ctx.context?.transcript ?? "";
  const checkCtx = { ...ctx, transcript: `${ctx.transcript} ${contextTranscript}` };

  for (const key of ["bride_name", "groom_name"] as const) {
    const value = text(action[key]);
    if (value) {
      input[key] = value;
      fields.push(field(key, labelOf(key), null, value, null));
    } else if (creating) {
      fields.push(field(key, labelOf(key), null, null, null, "missing"));
      missing.push(key);
    }
  }
  // The wedding date: a year is never filled in (AT-1.4).
  let date = text(action.wedding_date);
  const dateText = text(action.date_text);
  if (!date && dateText) {
    const year = (ctx.transcript.match(/\b(202[6-9]|2030)\b/) ?? [])[1];
    if (year) {
      const read = safeReadDate(`${dateText} ${year}`, today, null);
      if (read?.date) date = read.date;
    }
  }
  if (date) {
    const phrase = heardFor(action, "wedding_date");
    let ok = true;
    if (phrase) ok = checkValue(checkCtx, action, "wedding_date", date, null, { draft_date_text: dateText, draft_month: num(action.month) }).state === "ok";
    else ok = new RegExp(`\\b${date.slice(0, 4)}\\b`).test(`${ctx.transcript} ${contextTranscript}`);
    if (!ok && dateText && new RegExp(`\\b${date.slice(0, 4)}\\b`).test(ctx.transcript)) ok = true;
    if (ok) {
      input.wedding_date = date;
      fields.push(field("wedding_date", labelOf("wedding_date"), null, formatDate(date), phrase));
    } else {
      fields.push(field("wedding_date", labelOf("wedding_date"), null, formatDate(date), phrase, "uncertain"));
      missing.push("wedding_date");
    }
  } else if (dateText) {
    fields.push(field("wedding_date", labelOf("wedding_date"), null, `${dateText}, year?`, heardFor(action, "date_text"), "missing"));
    missing.push("year");
    noted.en.push(dateText);
  } else if (num(action.month)) {
    const m = num(action.month) as number;
    fields.push(field("wedding_date", labelOf("wedding_date"), null, `${monthName(m)}, day and year?`, heardFor(action, "month"), "missing"));
    missing.push("day", "year");
  } else if (creating) {
    fields.push(field("wedding_date", labelOf("wedding_date"), null, null, null, "missing"));
    missing.push("day", "month", "year");
  }
  const city = text(action.city);
  if (city) {
    input.city = city;
    fields.push(field("city", labelOf("city"), null, city, null));
  }
  for (const key of ["budget_inr", "expected_guests"] as const) {
    const value = num(action[key]);
    if (value === null) continue;
    const check = checkValue(checkCtx, action, key, value, null);
    if (check.state === "ok") {
      input[key] = value;
      fields.push(field(key, labelOf(key), null, key === "budget_inr" ? formatInr(value) : String(value), check.phrase));
    } else {
      fields.push(field(key, labelOf(key), null, key === "budget_inr" ? formatInr(value) : String(value), check.phrase, "uncertain"));
      missing.push(key);
    }
  }
  if (creating && ctx.setup_opened_at) input.setup_opened_at = ctx.setup_opened_at;
  for (const entry of ctx.tool.missing_fields) {
    const key = entry.includes(":") ? entry.split(":")[1] : entry;
    if (["bride_name", "groom_name", "year", "day", "month"].includes(key) && !missing.includes(key) && !(key === "year" && input.wedding_date) && !((key === "bride_name" || key === "groom_name") && input[key])) {
      if (!(key === "day" || key === "month") || !input.wedding_date) missing.push(key);
    }
  }
  const resolved: ResolvedAction = { ...draft, input, labels: labelsFor(input), preview: { kind: "set_wedding_profile", command: "set_wedding_profile", fields, after_saving: [], warnings: [] }, missing_fields: missing };
  setFacts(resolved, {});
  const v = validateLikeTyping("set_wedding_profile", input, creating);
  if (!v.ok && !missing.includes(v.field)) missing.push(v.field);
  if (!creating && missing.length > 0) {
    return { kind: "clarify", action: resolved, question: genericMissing(r), options: [], missing_fields: missing };
  }

  // The question (4.10, S-01 / S-03): what was noted, then day, year, names.
  let question: ReplyText | null = null;
  let disabled: string | null = null;
  if (missing.length > 0) {
    const needDay = missing.includes("day");
    const needYear = missing.includes("year");
    const needNames = missing.includes("bride_name") || missing.includes("groom_name");
    const parts: string[] = [];
    if (needYear) parts.push("the year");
    if (needNames) parts.push("the couple's names");
    if (needDay) parts.unshift("the day");
    disabled = `Add ${parts.join(" and ")} to save.`;
    const budget = num(input.budget_inr);
    const guests = num(input.expected_guests);
    if (r === "en") {
      const notedBits = [dateText ? `${dateText}${city ? ` in ${city}` : ""}` : city ? `in ${city}` : null, budget !== null ? formatInr(budget) : null, guests !== null ? `about ${guests} guests` : null].filter(Boolean);
      const asks: string[] = [];
      if (needDay) asks.push("which day is it");
      if (needYear) asks.push(needDay ? "which year" : "which year is it");
      if (needNames) asks.push("what are the couple's names");
      const ask = asks.length ? `${capitalize(asks.join(", and ").replace(/, and (?=.*, and)/, ", "))}?` : "";
      const display = `${notedBits.length ? `Got it: ${notedBits.join(", ")}. ` : ""}${ask}`.trim();
      question = { display_text: display, speech_text: display.replace(/₹[0-9](?:[0-9,]*[0-9])?/g, (m) => inrWords(Number(m.slice(1).replace(/,/g, "")), "en")), language: r };
    } else {
      const month = num(action.month) ?? (dateText ? safeReadDate(dateText, today, null)?.month ?? null : null);
      const monthWord = month ? monthName(month) : null;
      const asksHl: string[] = [];
      const asksHi: string[] = [];
      if (needDay) {
        asksHl.push(`${monthWord ? `${monthWord} mein ` : ""}kaunsi tareekh`);
        asksHi.push(`${monthWord ? `${r === "hi" ? hiMonth(month as number) : monthWord} में ` : ""}कौन सी तारीख़`);
      }
      if (needYear) {
        asksHl.push("kaunsa saal");
        asksHi.push("कौन सा साल");
      }
      if (needNames) {
        asksHl.push("dulha-dulhan ke naam");
        asksHi.push("दूल्हा-दुल्हन के नाम");
      }
      const joinHl = asksHl.length > 1 ? `${asksHl.slice(0, -1).join(", ")}, aur ${asksHl[asksHl.length - 1]}` : asksHl.join("");
      const joinHi = asksHi.length > 1 ? `${asksHi.slice(0, -1).join(", ")}, और ${asksHi[asksHi.length - 1]}` : asksHi.join("");
      const notedHl = budget !== null ? `${formatInr(budget)} note kar liya. ` : "";
      const notedDev = budget !== null ? `${inrWords(budget, "hi")} ${r === "hi" ? "नोट" : "note"} कर लिया। ` : "";
      if (r === "hinglish") question = { display_text: `${notedHl}${capitalize(joinHl)}?`, speech_text: `${notedDev}${joinHi}?`, language: r };
      else question = { display_text: `${notedDev}${joinHi}?`, speech_text: `${notedDev}${joinHi}?`, language: r };
    }
  }
  const title = creating ? "Your wedding" : "Wedding details";
  const summary = creating
    ? `${[input.bride_name && input.groom_name ? `${input.bride_name} & ${input.groom_name}` : null, input.wedding_date ? formatDate(String(input.wedding_date)) : null, city, num(input.budget_inr) !== null ? formatInr(num(input.budget_inr) as number) : null, num(input.expected_guests) !== null ? `${input.expected_guests} guests` : null].filter(Boolean).join(" · ")}`
    : "Wedding details";
  return { kind: "ready", action: resolved, title, button: creating ? "Save wedding" : "Save", summary, disabled_reason: disabled, question };
}

function hiMonth(month: number): string {
  return ["जनवरी", "फ़रवरी", "मार्च", "अप्रैल", "मई", "जून", "जुलाई", "अगस्त", "सितंबर", "अक्टूबर", "नवंबर", "दिसंबर"][month - 1] ?? "";
}

function genericMissing(r: ReplyRegister): ReplyText {
  return r === "en" ? reply(r, "What should it be?") : reply(r, "Kya rakhna hai?", "क्या रखना है?");
}

// ---------------------------------------------------------------------------
// The other kinds: references mapped, the schema checked (V5)
// ---------------------------------------------------------------------------

const PASS_FIELDS: Record<string, string[]> = {
  update_invite_style: ["theme", "typeface", "layout", "photo_frame", "photo_asset_id"],
  add_vendor: ["name", "vendor_category", "status", "contact_name", "event_ids", "notes"],
  add_guest: ["full_name", "household_id", "household_name", "relation", "event_ids", "max_plus_ones", "dietary_note"],
  set_rsvp: ["guest_ids", "event_id", "rsvp_status", "plus_ones"],
  set_dietary: ["guest_id", "dietary_note"],
};

const GENERIC_TITLES: Record<string, { title: string; button: string }> = {
  update_invite_style: { title: "Invite style", button: "Save draft" },
  add_vendor: { title: "Add vendor", button: "Save vendor" },
  add_guest: { title: "Add guest", button: "Save guest" },
  set_rsvp: { title: "RSVP", button: "Save RSVP" },
  set_dietary: { title: "Dietary note", button: "Save" },
};

async function buildGeneric(ctx: ResolveContext, action: ToolAction, index: number, deps: WriteDeps): Promise<WriteResult> {
  const r = ctx.register;
  const command = action.kind as CommandName;
  const draft = baseAction(index, action, command, {}, {});
  const input: JsonObject = {};
  const fields: VoicePreviewField[] = [];
  const missing: string[] = [];
  const itinerary = await deps.access.itinerary();
  const mapRef = (value: string): string | null => ctx.snapshot.ref_map[value] ?? null;
  for (const key of PASS_FIELDS[command] ?? []) {
    const value = action[key];
    if (value === undefined || value === null || value === "") continue;
    if (key === "event_id") {
      const e = resolveEvent(action, ctx.snapshot, itinerary);
      if (e.ok) {
        input.event_id = e.value.event_id;
        fields.push(field("event_id", "Function", null, e.value.title, null));
      } else {
        const list = functionList(itinerary, r).functions;
        return { kind: "clarify", action: draft, question: whichFunctionQuestion(r, itinerary), options: functionOptions(ctx.snapshot, list, index), missing_fields: [`${index}:event_id`] };
      }
      continue;
    }
    if (key.endsWith("_ids") && Array.isArray(value)) {
      const ids: string[] = [];
      for (const item of value) {
        const id = typeof item === "string" ? mapRef(item) : null;
        if (id) ids.push(id);
        else if (key === "event_ids" && typeof item === "string") {
          const e = resolveEvent({ kind: action.kind, event_id: item }, ctx.snapshot, itinerary);
          if (e.ok) ids.push(e.value.event_id);
          else missing.push(`${index}:${key}`);
        } else missing.push(`${index}:${key}`);
      }
      input[key] = ids;
      fields.push(field(key, labelOf(key), null, value.map(String).join(", "), null, missing.includes(`${index}:${key}`) ? "missing" : "ok"));
      continue;
    }
    if (key.endsWith("_id") && typeof value === "string") {
      const id = mapRef(value);
      if (!id) {
        if (key === "photo_asset_id") {
          return { kind: "clarify", action: draft, question: reply(r, "Attach the photo with the paperclip first."), options: [], missing_fields: [`${index}:${key}`] };
        }
        missing.push(`${index}:${key}`);
        fields.push(field(key, labelOf(key), null, value, null, "missing"));
        continue;
      }
      input[key] = id;
      fields.push(field(key, labelOf(key), null, value, null));
      continue;
    }
    if (typeof value === "number") {
      const check = checkValue(ctx, action, key, value, null);
      input[key] = value;
      fields.push(field(key, labelOf(key), null, String(value), check.phrase, check.state === "ok" ? "ok" : "uncertain"));
      if (check.state !== "ok") missing.push(`${index}:${key}`);
      continue;
    }
    input[key] = value as string;
    fields.push(field(key, labelOf(key), null, String(value), heardFor(action, key)));
  }
  // A manager's add_guest limits are checked before this (1.11 step 2).
  const v = validateLikeTyping(command, input);
  if (!v.ok) {
    const primary = command === "set_rsvp" ? ["guest_ids", "event_id", "rsvp_status"] : command === "set_dietary" ? ["guest_id", "dietary_note"] : command === "add_vendor" ? ["name", "vendor_category"] : command === "add_guest" ? ["full_name"] : [];
    if (primary.includes(v.field) || v.field === "") {
      return { kind: "clarify", action: { ...draft, input }, question: genericMissing(r), options: [], missing_fields: [`${index}:${v.field || "input"}`] };
    }
    missing.push(`${index}:${v.field}`);
  }
  const titles = GENERIC_TITLES[command] ?? { title: capitalize(command.replace(/_/g, " ")), button: "Save" };
  const resolved: ResolvedAction = { ...draft, input, labels: labelsFor(input), preview: { kind: action.kind, command, fields, after_saving: [], warnings: [] }, missing_fields: missing };
  return { kind: "ready", action: resolved, title: titles.title, button: titles.button, summary: `${titles.title}.`, disabled_reason: missing.length ? "Check the marked fields to save." : null, question: null };
}

// ---------------------------------------------------------------------------
// set_rsvp (G-02): guests named as stored, the function's counts after saving
// ---------------------------------------------------------------------------

const RSVP_STATUS_LABEL: Record<string, string> = { attending: "Attending", declined: "Declined", pending: "Not replied" };

function guestsById(list: RsvpGuestList | undefined): Map<string, RsvpGuestRow> {
  const rows = new Map<string, RsvpGuestRow>();
  for (const fn of list?.functions ?? []) for (const guest of fn.guests) if (!rows.has(guest.guest_id)) rows.set(guest.guest_id, guest);
  return rows;
}

/** A guest the model named by name instead of by reference: the full name, or a unique first name. */
function guestRefByName(ctx: ResolveContext, list: RsvpGuestList | undefined, name: string): string | null {
  const wanted = normalizeForMatch(name);
  if (!wanted) return null;
  const all = [...guestsById(list).values()];
  let hits = all.filter((guest) => normalizeForMatch(guest.full_name) === wanted);
  if (hits.length === 0) hits = all.filter((guest) => normalizeForMatch(guest.full_name.split(" ")[0] ?? "") === wanted);
  if (hits.length !== 1) return null;
  const guest = hits[0];
  const refById = (ctx.snapshot.data as { ref_by_id?: Record<string, string> }).ref_by_id ?? {};
  const ref = refById[guest.guest_id] ?? guest.seed_key;
  return ref && ctx.snapshot.ref_map[ref] ? ref : null;
}

async function buildSetRsvp(ctx: ResolveContext, action: ToolAction, index: number, deps: WriteDeps): Promise<WriteResult> {
  const list = (ctx.snapshot.data as { rsvp_guest_list?: RsvpGuestList }).rsvp_guest_list;
  const named = Array.isArray(action.guest_ids)
    ? action.guest_ids.map((item) => (typeof item === "string" && !ctx.snapshot.ref_map[item] ? (guestRefByName(ctx, list, item) ?? item) : item))
    : action.guest_ids;
  const base = await buildGeneric(ctx, { ...action, guest_ids: named }, index, deps);
  if (base.kind !== "ready") return base;
  const input = base.action.input;
  const guestIds = Array.isArray(input.guest_ids) ? input.guest_ids.filter((id): id is string => typeof id === "string") : [];
  const eventId = typeof input.event_id === "string" ? input.event_id : null;
  const status = typeof input.rsvp_status === "string" ? input.rsvp_status : null;
  const fn = list?.functions.find((row) => row.event_id === eventId) ?? null;
  const everyone = guestsById(list);
  const rows = guestIds.map((id) => fn?.guests.find((guest) => guest.guest_id === id) ?? everyone.get(id) ?? null);
  const names = rows.length > 0 && rows.every((row) => row !== null) ? (rows as RsvpGuestRow[]).map((row) => row.full_name) : null;
  // The card names the guests as stored, never by reference.
  const fields = base.action.preview.fields.map((f) => (f.field === "guest_ids" && names ? { ...f, new: names.join(", ") } : f));

  const totals = eventId ? await deps.access.rsvp(eventId).catch(() => null) : null;
  const counts = totals?.functions.find((row) => row.event_id === eventId) ?? null;
  const after_saving: { label: string; old: string; new: string }[] = [];
  let attendingAfter: number | undefined;
  const current = fn ? guestIds.map((id) => fn.guests.find((guest) => guest.guest_id === id)?.rsvp_status ?? null) : [];
  if (counts && status && fn && current.length > 0 && current.every((was) => was !== null)) {
    const change = (kind: string) => (status === kind ? current.filter((was) => was !== kind).length : -current.filter((was) => was === kind).length);
    attendingAfter = counts.attending + change("attending");
    after_saving.push({ label: "Attending", old: String(counts.attending), new: String(attendingAfter) });
    after_saving.push({ label: "Not replied", old: String(counts.pending), new: String(counts.pending + change("pending")) });
    // Everyone already has that answer (4, set_rsvp): no card.
    if (current.every((was) => was === status)) {
      const already =
        ctx.register === "en"
          ? reply("en", `They're already marked ${(RSVP_STATUS_LABEL[status] ?? status).toLowerCase()}.`)
          : ctx.register === "hinglish"
            ? reply("hinglish", "Unka jawab pehle se yahi likha hai.", "उनका जवाब पहले से यही लिखा है।")
            : reply("hi", "उनका जवाब पहले से यही लिखा है।");
      return { kind: "answer", reply: already, action: base.action };
    }
  }
  const facts: ServerFacts = {
    ...factsOf(base.action),
    ...(eventId ? { event_id: eventId } : {}),
    ...(fn ? { event_title: fn.title, event_title_hi: fn.title_hi } : {}),
    ...(names ? { guest_names: names } : {}),
    ...(status ? { rsvp_status: status } : {}),
    ...(attendingAfter !== undefined ? { attending_after: attendingAfter } : {}),
  };
  const raw = { ...base.action.raw, [SERVER_FACTS_KEY]: facts } as ToolAction;
  const fnTitle = (fn?.title ?? "").toLowerCase();
  const cardTitle = names && fnTitle && status ? `RSVP for the ${fnTitle}: ${names.join(", ")} → ${RSVP_STATUS_LABEL[status] ?? status}` : base.title;
  return {
    ...base,
    title: cardTitle,
    summary: `${cardTitle}.`,
    action: { ...base.action, raw, preview: { ...base.action.preview, fields, after_saving } },
  };
}

// ---------------------------------------------------------------------------
// The entry point
// ---------------------------------------------------------------------------

/** "26 नवंबर": a short date in Hindi display (4.10 E-08). */
function shortDateHi(date: string): string {
  return formatWeekdayDateHi(date).split(", ")[1] ?? date;
}

/** Relative day words said in Latin, in Devanagari for Hindi speech ("kal" → "कल", 3.5, E-08). */
const RELATIVE_WORDS_HI: Record<string, string> = { kal: "कल", aaj: "आज", aj: "आज", parso: "परसों", parson: "परसों", parsoon: "परसों", subah: "सुबह", shaam: "शाम", sham: "शाम", raat: "रात", dopahar: "दोपहर", agle: "अगले", hafte: "हफ़्ते", ko: "को" };

function relativeWordSpeech(phrase: string): string {
  return phrase
    .trim()
    .split(/\s+/)
    .map((word) => RELATIVE_WORDS_HI[word.toLowerCase()] ?? word)
    .join(" ");
}

export async function previewWrite(ctx: ResolveContext, action: ToolAction, index: number, deps: WriteDeps): Promise<WriteResult> {
  switch (action.kind) {
    case "correct_payment":
      return buildCorrectPayment(ctx, action, index, deps);
    case "record_payment":
      return buildRecordPayment(ctx, action, index, deps);
    case "update_commitment":
      return buildUpdateCommitment(ctx, action, index, deps);
    case "record_commitment":
      return buildRecordCommitment(ctx, action, index, deps);
    case "update_event":
      return buildUpdateEvent(ctx, action, index, deps);
    case "create_event":
      return buildCreateEvent(ctx, action, index, deps);
    case "add_requirement":
      return buildAddRequirement(ctx, action, index, deps);
    case "publish_itinerary":
      return buildPublish(ctx, action, index, deps);
    case "request_card_export":
      return buildExport(ctx, action, index, deps);
    case "set_wedding_profile":
      return buildWeddingProfile(ctx, action, index);
    case "set_rsvp":
      return buildSetRsvp(ctx, action, index, deps);
    default:
      return buildGeneric(ctx, action, index, deps);
  }
}

export { ownersOf, ROLE_WORD, speakTimeEn, clockHi };
