import "server-only";

import type { ReplyRegister, VoiceAnswerCard } from "@/contracts/api";
import type { CommandName } from "@/contracts/commands";
import type { Services } from "@/contracts/services";

import { answerQuestion, type AnswerResult } from "./answers";
import { prefillFor } from "./confirm-reply";
import { previewWrite, SERVER_FACTS_KEY, type WriteResult } from "./preview";
import { latinDigits, normalizeForMatch } from "./normalize";
import { readAmount, readCount } from "./numbers";
import { createReadAccess, EVENT_KIND_WORDS, hasWords, VENDOR_ROLE_WORDS, type ReadAccess, type VendorRef } from "./resolve/support";
import {
  budgetAndShagunNotShared,
  budgetNotShared,
  firstSentenceOf,
  fixedReply,
  genericQuestion,
  guestInviteForbidden,
  joinReplies,
  publishForbidden,
  reply,
  shagunNotSetUp,
  shagunNotShared,
  silent,
  totalNotShared,
  vendorPaymentsNotShared,
  weddingDetailsForbidden,
  withoutRepeatedSentences,
} from "./templates";
import {
  ASK_KINDS,
  WRITE_KINDS,
  type ActionKind,
  type ReplyText,
  type ResolveContext,
  type ResolvedAction,
  type ResolveOutcome,
  type StoredOption,
  type StoredTurn,
  type ToolAction,
  type ToolArguments,
} from "./types";

/**
 * The server's checks and the turn's decision (voice.md 1.11): structure, role per action
 * (manager limits and V11), references, numbers re-read from the heard phrases, kind rules,
 * validation like typing, missing and uncertain fields, the step 8 table and the early kill
 * switch. The model only proposed; nothing here writes.
 */

export type ResolveOverrides = { services?: Services; access?: ReadAccess };

const A1_KINDS = new Set<ActionKind>(["record_commitment", "update_commitment", "record_payment", "correct_payment"]);

export function isAskKind(kind: string): boolean {
  return (ASK_KINDS as readonly string[]).includes(kind);
}

export function isWriteKind(kind: string): boolean {
  return (WRITE_KINDS as readonly string[]).includes(kind);
}

/** A stored stand-in for a question, so an option can complete it (6.2). Never confirmable. */
function askPlaceholder(action: ToolAction, index: number): ResolvedAction {
  const command = action.kind as unknown as CommandName;
  return {
    index,
    kind: action.kind,
    command,
    input: {},
    labels: {},
    heard: action.heard ?? [],
    entity_ref: null,
    preview: { kind: action.kind, command, fields: [], after_saving: [], warnings: [] },
    missing_fields: [],
    raw: action,
  };
}

/** 4.1's guard on the model's own reply: short, no numbers, the register's script. */
export function passesReplyGuard(text: string, register: ReplyRegister): boolean {
  const t = text.trim();
  if (t.length === 0 || t.length > 140) return false;
  if ((t.match(/[.?!।]/g) ?? []).length > 2) return false;
  if (/[0-9०-९₹]/.test(t)) return false;
  const deva = /[ऀ-ॿ]/.test(t);
  if (register === "hi") return deva;
  return !deva;
}

const UNSUPPORTED_WORDS = /\b(void|delete|remove|budget line|invite (a )?member|sharing|share with|reset|approve|reject|withdraw|invitation link|thank(ed)? (them|her|him))\b/i;

type Refusal = { index: number; code: "forbidden" | "not_shared"; what: "publish" | "guest" | "details" | "vendor_money" | "budget" | "total" | "shagun" };

function refusalReply(refusals: Refusal[], register: ReplyRegister, owners: string): ReplyText {
  const whats = new Set(refusals.map((item) => item.what));
  if (whats.has("publish")) return publishForbidden(register, owners);
  if (whats.has("guest")) return guestInviteForbidden(register, owners);
  if (whats.has("details")) return weddingDetailsForbidden(register, owners);
  if (whats.has("budget") && whats.has("shagun")) return budgetAndShagunNotShared(register);
  const parts: ReplyText[] = [];
  if (whats.has("budget")) parts.push(budgetNotShared(register));
  if (whats.has("total")) parts.push(totalNotShared(register));
  if (whats.has("vendor_money")) parts.push(vendorPaymentsNotShared(register));
  if (whats.has("shagun")) parts.push(shagunNotShared(register));
  if (parts.length === 1) return parts[0];
  return joinReplies(register, parts.map(firstSentenceOf));
}

export async function resolveTurn(input: ResolveContext, overrides: ResolveOverrides = {}): Promise<ResolveOutcome> {
  // A clarifying context turn keeps its partial actions: the new turn's values win (1.11 end).
  const merged: ResolveContext =
    input.context && input.context.missing_fields.length > 0 ? { ...input, tool: mergeWithContext(input.tool, input.context) } : input;
  const services = overrides.services ?? (await import("@/server/services")).services;
  const baseAccess = overrides.access ?? createReadAccess(merged, services);
  const ctx: ResolveContext = { ...merged, tool: await fillRefsFromTranscript(merged, baseAccess) };
  const access = baseAccess;
  const r = ctx.register;
  const actions = ctx.tool.actions;

  // 1. Structure.
  if (actions.length > 4) {
    return { kind: "clarify", question: fixedReply("too_many_actions", r), missing_fields: [], actions: [] };
  }
  if (actions.length === 0) {
    if (UNSUPPORTED_WORDS.test(ctx.transcript)) return { kind: "clarify", question: fixedReply("cant_by_voice", r), missing_fields: [], actions: [] };
    const modelReply = passesReplyGuard(ctx.tool.reply, r) ? reply(r, ctx.tool.reply.trim()) : null;
    return { kind: "clarify", question: modelReply ?? (ctx.tool.intent === "clarify" && ctx.tool.missing_fields.length === 0 ? fixedReply("cant_by_voice", r) : genericQuestion(r)), missing_fields: ctx.tool.missing_fields, actions: [] };
  }

  const profile = ctx.wedding_id ? await access.profile() : null;
  const owners = profile ? `${profile.bride_name} or ${profile.groom_name}` : "an owner";
  const first_owner = profile?.bride_name ?? "an owner";

  // 2. V11: publishing stands alone.
  if (actions.some((a) => a.kind === "publish_itinerary") && actions.length > 1) {
    return { kind: "clarify", question: fixedReply("publish_alone", r), missing_fields: [], actions: [] };
  }

  // 2. Role, per action.
  const manager = ctx.wedding_id !== null && (ctx.actor.role === "manager" || profile?.member.role === "manager");
  const refusals: Refusal[] = [];
  if (manager) {
    const money = await access.money();
    const dues = !ctx.snapshot.hidden.includes("money") && !(money?.hidden ?? []).includes("vendor_money") && money?.vendors !== undefined;
    const budget = !ctx.snapshot.hidden.includes("budget") && !(money?.hidden ?? []).includes("budget") && money?.totals !== undefined;
    actions.forEach((action, index) => {
      switch (action.kind) {
        case "publish_itinerary":
          refusals.push({ index, code: "forbidden", what: "publish" });
          break;
        case "query_balance": {
          const total = action.scope === "wedding" || (!action.vendor_id && !(ctx.page ?? "").includes("vendor_id="));
          if (total && !budget) refusals.push({ index, code: "not_shared", what: "total" });
          else if (!total && !dues) refusals.push({ index, code: "not_shared", what: "vendor_money" });
          break;
        }
        case "query_catering":
          if (!dues) refusals.push({ index, code: "not_shared", what: "vendor_money" });
          break;
        case "query_budget":
          if (!budget) refusals.push({ index, code: "not_shared", what: "budget" });
          break;
        case "query_shagun":
        case "record_shagun":
          refusals.push({ index, code: "not_shared", what: "shagun" });
          break;
        case "add_guest": {
          const invites = Array.isArray(action.event_ids) ? action.event_ids.length > 0 : action.event_ids !== undefined;
          if (invites || action.max_plus_ones !== undefined || householdHasLink(ctx, action)) refusals.push({ index, code: "forbidden", what: "guest" });
          break;
        }
        case "set_wedding_profile":
          refusals.push({ index, code: "forbidden", what: "details" });
          break;
        default:
          if (A1_KINDS.has(action.kind) && !dues) refusals.push({ index, code: "not_shared", what: "vendor_money" });
      }
    });
  }
  if (refusals.length > 0) {
    const refused = new Set(refusals.map((item) => item.index));
    const cards: VoiceAnswerCard[] = [];
    for (const [index, action] of actions.entries()) {
      if (refused.has(index) || !isAskKind(action.kind)) continue;
      const answer = await answerQuestion(ctx, action, index, { access });
      if (answer.kind === "answer") cards.push(...answer.cards);
    }
    return {
      kind: "refused",
      code: refusals.some((item) => item.code === "forbidden") ? "forbidden" : "not_shared",
      reply: refusalReply(refusals, r, owners),
      prefill: [],
      cards: uniqueCards(cards),
      actions: [],
    };
  }

  // 3–7. References, numbers, kind rules, validation, missing fields.
  const answers: { index: number; result: AnswerResult }[] = [];
  const writes: { index: number; result: WriteResult }[] = [];
  const shagun: number[] = [];
  for (const [index, action] of actions.entries()) {
    if (action.kind === "record_shagun") {
      shagun.push(index);
      continue;
    }
    if (isAskKind(action.kind)) answers.push({ index, result: await answerQuestion(ctx, action, index, { access }) });
    else if (isWriteKind(action.kind)) writes.push({ index, result: await previewWrite(ctx, action, index, { access, owners, first_owner }) });
  }
  if (shagun.length > 0 && writes.length === 0 && answers.length === 0) {
    return { kind: "clarify", question: shagunNotSetUp(r), missing_fields: [], actions: [] };
  }
  const writeActions = writes.map((w) => w.result.action);
  const allActions = (): ResolvedAction[] =>
    actions.map((action, index) => writes.find((w) => w.index === index)?.result.action ?? askPlaceholder(action, index));

  const answerCards = uniqueCards(answers.flatMap((a) => (a.result.kind === "answer" ? a.result.cards : [])));
  const answerReplies = answers.filter((a) => a.result.kind === "answer").map((a) => (a.result as Extract<AnswerResult, { kind: "answer" }>).reply);

  // 9. Kill switch, the early check (questions are still answered, 4.3).
  if (writes.length > 0 && !ctx.writes_enabled) {
    const refusal = fixedReply("voice_writes_paused", r);
    const replyText = answerReplies.length > 0 ? joinReplies(r, [...answerReplies.slice(0, 2).map(firstSentenceOf), firstSentenceOf(refusal)]) : refusal;
    return { kind: "refused", code: "voice_writes_paused", reply: replyText, prefill: prefillFor(writeActions), cards: answerCards, actions: writeActions };
  }

  // 8. Decide what the turn is.
  const writeClarify = writes.find((w) => w.result.kind === "clarify");
  if (writeClarify && writeClarify.result.kind === "clarify") {
    return {
      kind: "clarify",
      question: writeClarify.result.question,
      missing_fields: writeClarify.result.missing_fields,
      options: writeClarify.result.options.length > 0 ? writeClarify.result.options : undefined,
      cards: answerCards.length > 0 ? answerCards : undefined,
      actions: allActions(),
    };
  }
  const askClarify = answers.find((a) => a.result.kind === "clarify");
  if (askClarify && askClarify.result.kind === "clarify") {
    return {
      kind: "clarify",
      question: askClarify.result.question,
      missing_fields: askClarify.result.missing_fields,
      options: askClarify.result.options.length > 0 ? askClarify.result.options : undefined,
      cards: answerCards.length > 0 ? answerCards : undefined,
      actions: allActions(),
    };
  }

  const ready = writes.filter((w) => w.result.kind === "ready");
  const writeAnswers = writes.filter((w) => w.result.kind === "answer").map((w) => (w.result as Extract<WriteResult, { kind: "answer" }>).reply);

  if (ready.length === 0) {
    // Only questions (or writes that would change nothing: "It's already ₹40,000.").
    const replies = [...answerReplies, ...writeAnswers];
    if (shagun.length > 0) replies.push(shagunNotSetUp(r));
    let replyText: ReplyText;
    if (replies.length === 0) replyText = genericQuestion(r);
    else if (replies.length === 1) replyText = replies[0];
    else {
      replyText = joinReplies(r, replies.slice(0, 2).map(firstSentenceOf));
      if (replies.length > 2) replyText = { ...replyText, display_text: `${replyText.display_text} ${r === "en" ? "Ask me the rest one at a time." : "Baaki ek-ek karke poochiye."}` };
    }
    return { kind: "answer", cards: answerCards, reply: withoutRepeatedSentences(replyText) };
  }

  const readyResults = ready.map((w) => w.result as Extract<WriteResult, { kind: "ready" }>);
  const resolvedActions = allActions().filter((a) => isWriteKind(a.kind));
  const missing = resolvedActions.flatMap((a) => a.missing_fields);
  const disabled = readyResults.map((w) => w.disabled_reason).find((reason) => reason !== null) ?? (missing.length > 0 ? "Check the marked fields to save." : null);
  const title = readyResults.length === 1 ? readyResults[0].title : readyResults.map((w) => w.title).join(" + ");
  const button = readyResults.length === 1 ? readyResults[0].button : readyResults.length === 2 ? "Save both" : "Save all";
  const question = readyResults.map((w) => w.question).find((q) => q !== null) ?? null;
  let replyText: ReplyText;
  if (question) replyText = question;
  else if (answerReplies.length > 0) replyText = firstSentenceOf(answerReplies[0]);
  else replyText = silent(r, readyResults.map((w) => w.summary).join(" "));
  return {
    kind: "preview",
    title,
    button_label: button,
    actions: resolvedActions,
    missing_fields: missing,
    confirm_enabled: disabled === null && missing.length === 0,
    disabled_reason: disabled,
    reply: replyText,
  };
}

/** The same card twice is one card (a second guard after the duplicate-action check). */
function uniqueCards(cards: VoiceAnswerCard[]): VoiceAnswerCard[] {
  const seen = new Set<string>();
  return cards.filter((card) => {
    const key = JSON.stringify([card.title, card.figure, card.link]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Kinds that name one vendor, and the field that would name the record instead. */
const VENDOR_KINDS: Partial<Record<ActionKind, string | null>> = {
  query_balance: null,
  query_catering: null,
  record_payment: null,
  correct_payment: "payment_id",
  record_commitment: null,
  update_commitment: "commitment_id",
};

/** Kinds that name one function. */
const EVENT_KINDS = new Set<ActionKind>(["query_event", "query_rsvp", "update_event", "add_requirement"]);

function said(value: unknown): boolean {
  return typeof value === "string" ? value.trim().length > 0 : value !== undefined && value !== null;
}

/**
 * Voice.md 2.5's role and kind words, read from the transcript when the model left the
 * reference out (V5): "Caterer को अब कितना देना है?" with no vendor_id names VEN-CAT, because
 * exactly one vendor has that role. Only a single unambiguous match fills a field; anything
 * else stays missing, and the usual question follows.
 */
async function fillRefsFromTranscript(ctx: ResolveContext, access: ReadAccess): Promise<ToolArguments> {
  const tool = ctx.tool;
  if (tool.actions.length === 0) return tool;
  const transcript = ctx.transcript;
  const digits = latinDigits(transcript).replace(/[,\s]/g, "");
  const needsVendor = ctx.wedding_id !== null && tool.actions.some(
    (a) => a.kind in VENDOR_KINDS && !said(a.vendor_id) && !(a.kind === "query_balance" && a.scope === "wedding") && !said(a[VENDOR_KINDS[a.kind] ?? ""]),
  );
  const needsEvent = ctx.wedding_id !== null && tool.actions.some((a) => EVENT_KINDS.has(a.kind) && !said(a.event_id) && a.next_event !== true);

  let vendorRef: string | null = null;
  if (needsVendor) {
    const vendors: VendorRef[] = await access.vendors().catch(() => []);
    // "venue" in a turn that also asks about a function's venue is that function's venue.
    const asksVenue = tool.actions.some((a) => a.kind === "query_event" || a.kind === "update_event");
    const matches = new Map<string, VendorRef>();
    for (const [category, words] of Object.entries(VENDOR_ROLE_WORDS)) {
      if (category === "venue" && asksVenue) continue;
      if (!words?.some((word) => hasWords(transcript, word))) continue;
      const rows = vendors.filter((row) => row.vendor_category === category && !row.is_one_off);
      if (rows.length === 1) matches.set(rows[0].vendor_id, rows[0]);
      else if (rows.length > 1) rows.forEach((row) => matches.set(`${row.vendor_id}:ambiguous`, row));
    }
    for (const row of vendors) if (hasWords(transcript, row.name)) matches.set(row.vendor_id, row);
    if (matches.size === 1) {
      const [vendor] = [...matches.values()];
      vendorRef = (ctx.snapshot.data as { ref_by_id?: Record<string, string> }).ref_by_id?.[vendor.vendor_id] ?? vendor.seed_key ?? vendor.vendor_id;
    }
  }

  let eventRef: string | null = null;
  if (needsEvent) {
    const itinerary = await access.itinerary().catch(() => null);
    const functions = itinerary?.functions ?? [];
    const kinds = Object.entries(EVENT_KIND_WORDS).filter(([, words]) => words.some((word) => hasWords(transcript, word)));
    if (kinds.length === 1) {
      const rows = functions.filter((fn) => fn.event_kind === kinds[0][0]);
      if (rows.length === 1) {
        eventRef = (ctx.snapshot.data as { ref_by_id?: Record<string, string> }).ref_by_id?.[rows[0].event_id] ?? rows[0].seed_key ?? rows[0].event_id;
      }
    }
  }
  const filled: string[] = [];
  const actions = tool.actions.map((action, index) => {
    const next: ToolAction = { ...action };
    const vendorKind = action.kind in VENDOR_KINDS;
    if (vendorRef && vendorKind && !said(action.vendor_id) && !(action.kind === "query_balance" && action.scope === "wedding") && !said(action[VENDOR_KINDS[action.kind] ?? ""])) {
      next.vendor_id = vendorRef;
      if (action.kind === "query_balance" && action.scope === undefined) next.scope = "vendor";
      filled.push(`${index}:vendor_id`, "vendor_id");
    }
    if (eventRef && EVENT_KINDS.has(action.kind) && !said(action.event_id) && action.next_event !== true) {
      next.event_id = eventRef;
      filled.push(`${index}:event_id`, "event_id");
    }
    // "What did Diya change?" is the latest entry; a day only when one was said (4, query_changes).
    if (action.kind === "query_changes" && said(action.actor_member_id) && !said(action.day) && action.latest !== true && !TODAY_WORDS.some((word) => hasWords(transcript, word))) {
      next.latest = true;
    }
    // A requirement's count said as "बारह लोगों के लिए", read by code from the words (3.1).
    if (action.kind === "add_requirement" && !said(action.quantity)) {
      const count = countBeforeHeadWord(transcript);
      if (count) {
        next.quantity = count.value;
        next.heard = [...(action.heard ?? []).filter((h) => h.field !== "quantity"), { field: "quantity", phrase: count.phrase }];
        filled.push(`${index}:quantity`, "quantity");
      }
    }
    // A count the model filled with no heard words and that isn't in the transcript was copied
    // from the snapshot, not said ("expected_headcount 250" on E-04): drop it rather than ask.
    for (const field of UNSAID_COUNT_FIELDS) {
      const value = next[field];
      if (typeof value !== "number" || (field === "quantity" && filled.includes(`${index}:quantity`))) continue;
      const heard = (next.heard ?? []).some((h) => h.field === field);
      if (!heard && !digits.includes(String(value)) && !spanReading(transcript, value, readCount)) delete next[field];
    }
    // Heard words with no value (V-T4, M-03: heard "चालीस हज़ार" for amount_inr, no amount_inr):
    // code reads the words, as it would to check a value, when they are in the transcript.
    for (const item of next.heard ?? []) {
      const read = HEARD_FALLBACK.find(([field]) => field === item.field)?.[1];
      if (!read || typeof next[item.field] === "number") continue;
      if (!normalizeForMatch(transcript).includes(normalizeForMatch(item.phrase))) continue;
      const value = read(item.phrase);
      if (value !== null && value > 0) next[item.field] = value;
    }
    // Heard words in another script than the transcript (live M-03: heard "चालीस hazaar" for
    // the typed "chaalis hazaar"): the words code finds in the transcript for that value replace them.
    const heardBefore = next.heard ?? [];
    heardBefore.forEach((item, position) => {
      const read = HEARD_FALLBACK.find(([field]) => field === item.field)?.[1];
      const value = next[item.field];
      if (!read || typeof value !== "number") return;
      if (normalizeForMatch(transcript).includes(normalizeForMatch(item.phrase))) return;
      const phrase = spanReading(transcript, value, read);
      if (phrase) next.heard = (next.heard ?? heardBefore).map((h, i) => (i === position ? { ...h, phrase } : h));
    });
    // A payment with no amount (live M-03, 3 of 5 calls: correct_payment with only previous_inr):
    // code reads the one amount the sentence says, other than the old one (3.1 step 1).
    if (PAYMENT_KINDS.has(action.kind) && typeof next.amount_inr !== "number") {
      const found = soleAmount(transcript, typeof next.previous_inr === "number" ? next.previous_inr : null);
      if (found) {
        next.amount_inr = found.value;
        next.heard = [...(next.heard ?? []).filter((h) => h.field !== "amount_inr"), { field: "amount_inr", phrase: found.phrase }];
        filled.push(`${index}:amount_inr`, "amount_inr");
      }
    }
    // A number with no heard words: code looks for the words in the transcript itself (3.1
    // step 1). Only a span that reads as exactly that value counts; otherwise 3.1's
    // "no phrase given" rule stands and the field stays uncertain.
    for (const [field, read] of HEARD_FALLBACK) {
      const value = next[field];
      if (typeof value !== "number" || (next.heard ?? []).some((h) => h.field === field)) continue;
      const phrase = spanReading(transcript, value, read);
      if (phrase) next.heard = [...(next.heard ?? []), { field, phrase }];
      else if (field === "previous_inr" || field === "user_claim_inr") delete next[field];
    }
    return next;
  });
  // A correction the model split in two (live M-03: correct_payment with only previous_inr, plus
  // a record_payment of the said amount to the same vendor): one sentence is one correction, never
  // a new payment as well. The payment's amount goes to the correction, and the payment goes.
  const splitPayments = new Set<number>();
  for (const correction of actions) {
    if (correction.kind !== "correct_payment" || !said(correction.vendor_id)) continue;
    for (const [pi, payment] of actions.entries()) {
      if (payment.kind !== "record_payment" || payment.vendor_id !== correction.vendor_id || typeof payment.amount_inr !== "number") continue;
      if (typeof correction.amount_inr !== "number") {
        correction.amount_inr = payment.amount_inr;
        const heardAmount = (payment.heard ?? []).find((h) => h.field === "amount_inr");
        if (heardAmount) correction.heard = [...(correction.heard ?? []).filter((h) => h.field !== "amount_inr"), heardAmount];
      }
      if (correction.amount_inr === payment.amount_inr) splitPayments.add(pi);
    }
  }
  // The same payment corrected twice (live, "pachaas hazaar nahi, chaalis hazaar tha": a second
  // correct_payment of PAY-01 with only invented fields): the first one stands.
  actions.forEach((later, li) => {
    if (later.kind !== "correct_payment") return;
    const first = actions.findIndex((a, fi) => fi < li && a.kind === "correct_payment" && !splitPayments.has(fi) &&
      (said(a.payment_id) && said(later.payment_id) ? a.payment_id === later.payment_id : said(a.vendor_id) && a.vendor_id === later.vendor_id));
    if (first < 0) return;
    if (typeof later.amount_inr !== "number" || later.amount_inr === actions[first].amount_inr) splitPayments.add(li);
  });
  // A claim the model also put on a sibling balance question (live M-03: query_balance
  // user_claim_inr 40000 beside the correct_payment of 40000) is the payment's amount, not a claim
  // to check: the question goes, and with it the "Nahi, … baaki hai" rebuttal.
  const paidAmounts = new Set(
    actions.filter((a) => PAYMENT_KINDS.has(a.kind) && typeof a.amount_inr === "number").map((a) => a.amount_inr as number),
  );
  // A question nobody asked (V-T4, O-01: a query_budget next to "Caterer को अब कितना देना है?").
  const keep = actions.map((action) => {
    if (action.kind === "query_balance" && typeof action.user_claim_inr === "number" && paidAmounts.has(action.user_claim_inr)) return false;
    if (splitPayments.has(actions.indexOf(action))) return false;
    const cues = ASK_CUES[action.kind];
    return !cues || cues.some((word) => hasWords(transcript, word));
  });
  const anyKept = keep.some(Boolean);
  const newIndex = new Map<number, number>();
  actions.forEach((_, index) => {
    if (!anyKept || keep[index]) newIndex.set(index, newIndex.size);
  });
  // The same action twice (live, "Caterer ka kitna baaki hai?": query_balance VEN-CAT twice)
  // is one action: one answer line, one card, never two payments for one sentence.
  const seen = new Set<string>();
  for (const [index, action] of actions.entries()) {
    if (!newIndex.has(index)) continue;
    const key = actionKey(action, ctx);
    if (seen.has(key)) newIndex.delete(index);
    else seen.add(key);
  }
  [...newIndex.keys()].forEach((index, position) => newIndex.set(index, position));
  const missing_fields = tool.missing_fields
    .filter((entry) => !filled.includes(entry))
    .flatMap((entry) => {
      const match = /^(\d+):(.+)$/.exec(entry);
      if (!match) return [entry];
      const moved = newIndex.get(Number(match[1]));
      return moved === undefined ? [] : [`${moved}:${match[2]}`];
    });
  return { ...tool, actions: actions.filter((_, index) => newIndex.has(index)), missing_fields: [...new Set(missing_fields)] };
}

/** Fields that never make two actions different: what was heard, and how sure the model was. */
const KEY_IGNORED_FIELDS = new Set(["heard", "confidence"]);

/**
 * An action's identity: its kind and its input after reference mapping (a seed key, a
 * `{PREFIX}-L{n}` reference and the UUID they stand for are the same record), with empty
 * fields dropped, strings trimmed and lower-cased, and lists sorted.
 */
export function actionKey(action: ToolAction, ctx: Pick<ResolveContext, "snapshot">): string {
  const refMap = ctx.snapshot.ref_map ?? {};
  const norm = (value: unknown): unknown => {
    if (typeof value === "string") {
      const trimmed = value.trim();
      return (refMap[trimmed] ?? trimmed).toLowerCase();
    }
    if (Array.isArray(value)) return value.map(norm).map((item) => JSON.stringify(item)).sort();
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .filter(([, v]) => v !== undefined && v !== null && v !== "")
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => [k, norm(v)]),
      );
    }
    return value;
  };
  const fields: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(action)) {
    if (KEY_IGNORED_FIELDS.has(field) || value === undefined || value === null || value === "") continue;
    fields[field] = value;
  }
  // A vendor's balance with no scope is that vendor's balance.
  if (action.kind === "query_balance" && fields.scope === undefined && said(fields.vendor_id)) fields.scope = "vendor";
  return JSON.stringify(norm(fields));
}

/** Ask kinds the person has to name: without one of these words the model made the question up. */
const ASK_CUES: Partial<Record<ActionKind, string[]>> = {
  query_budget: ["budget", "बजट", "bajat"],
  query_shagun: ["shagun", "शगुन", "shaguns"],
};

const TODAY_WORDS = ["today", "aaj", "aj", "आज"];

/** Numeric fields code can find words for, and how each is read (3.2). */
const HEARD_FALLBACK: [string, (phrase: string) => number | null][] = [
  ["amount_inr", readAmount],
  ["previous_inr", readAmount],
  ["user_claim_inr", readAmount],
  ["unit_price_inr", readAmount],
  ["budget_inr", readAmount],
  ["quantity", readCount],
  ["expected_guests", readCount],
  ["expected_headcount", readCount],
  ["max_plus_ones", readCount],
  ["plus_ones", readCount],
];

/**
 * The shortest run of 1 to 4 words in the transcript that reads as exactly `value`, if only
 * one run of that length does ("चालीस हज़ार" for 40000; two different runs mean no answer).
 */
function spanReading(transcript: string, value: number, read: (phrase: string) => number | null): string | null {
  const words = transcript.replace(/[,?!।]/g, " ").replace(/\.(?!\d)/g, " ").split(/\s+/).filter(Boolean);
  for (let size = 1; size <= Math.min(4, words.length); size += 1) {
    const hits = new Set<string>();
    for (let start = 0; start + size <= words.length; start += 1) {
      const phrase = words.slice(start, start + size).join(" ");
      if (read(phrase) === value) hits.add(phrase);
    }
    if (hits.size === 1) return [...hits][0];
    if (hits.size > 1) return null;
  }
  return null;
}

/** Payment writes whose amount_inr is the money the sentence says was paid. */
const PAYMENT_KINDS = new Set<string>(["record_payment", "correct_payment"]);

/**
 * The one amount a sentence says, other than `previous` ("Caterer ko chaalis hazaar advance diya
 * tha" → 40000, heard "chaalis hazaar"). Null when it says none, or two different amounts.
 */
export function soleAmount(transcript: string, previous: number | null): { value: number; phrase: string } | null {
  const words = transcript.replace(/[?!।]/g, " ").replace(/,(?!\d)/g, " ").replace(/\.(?!\d)/g, " ").split(/\s+/).filter(Boolean);
  const spans: { start: number; end: number; value: number; phrase: string }[] = [];
  for (let size = 1; size <= Math.min(4, words.length); size += 1) {
    for (let start = 0; start + size <= words.length; start += 1) {
      const phrase = words.slice(start, start + size).join(" ");
      const value = readAmount(phrase);
      if (value !== null && value >= 100) spans.push({ start, end: start + size, value, phrase });
    }
  }
  const candidates = spans.filter((span) => span.value !== previous);
  if (candidates.length === 0) return null;
  const best = Math.max(...candidates.map((span) => span.value));
  // Words inside the best amount, or inside the old amount, are part of those: "hazaar" alone
  // is not a second amount. Any other amount anywhere else makes the sentence ambiguous.
  const covered = new Set<number>();
  for (const span of spans) {
    if (span.value !== best && span.value !== previous) continue;
    for (let i = span.start; i < span.end; i += 1) covered.add(i);
  }
  const other = spans.some((span) => span.value !== best && span.value !== previous && Array.from({ length: span.end - span.start }, (_, k) => span.start + k).some((i) => !covered.has(i)));
  if (other) return null;
  const shortest = candidates.filter((span) => span.value === best).sort((a, b) => a.end - a.start - (b.end - b.start) || a.start - b.start)[0];
  return { value: best, phrase: shortest.phrase };
}

/** Counts the model may only fill from words it heard; money keeps 3.1's uncertain rule. */
const UNSAID_COUNT_FIELDS = ["expected_headcount", "expected_guests", "quantity"] as const;

const HEAD_WORDS = ["लोगों", "लोग", "logon", "logo", "log", "people", "guests", "mehmaan", "मेहमान", "plates", "plate", "persons"];

/** "बारह लोगों के लिए" → 12, heard "बारह"; only one such count in the sentence. */
function countBeforeHeadWord(transcript: string): { value: number; phrase: string } | null {
  const words = transcript.replace(/[,.?!।]/g, " ").split(/\s+/).filter(Boolean);
  const found: { value: number; phrase: string }[] = [];
  words.forEach((word, i) => {
    if (!HEAD_WORDS.includes(word.toLowerCase()) || i === 0) return;
    for (const span of [2, 1]) {
      if (i - span < 0) continue;
      const phrase = words.slice(i - span, i).join(" ");
      const value = readCount(phrase);
      if (value !== null && value > 0) {
        found.push({ value, phrase });
        return;
      }
    }
  });
  return found.length === 1 ? found[0] : null;
}

function householdHasLink(ctx: ResolveContext, action: ToolAction): boolean {
  const ref = typeof action.household_id === "string" ? action.household_id : null;
  if (!ref) return false;
  const households = (ctx.snapshot.data as { households?: { household_id: string; seed_key: string | null; link_status?: string; has_active_link?: boolean }[] }).households ?? [];
  const id = ctx.snapshot.ref_map[ref] ?? ref;
  const row = households.find((h) => h.household_id === id || h.seed_key === ref);
  return Boolean(row && (row.has_active_link === true || row.link_status === "active"));
}

/**
 * Rebuilds the tool arguments of a stored clarifying turn with a tapped option applied (6.2),
 * so the turn route can run `resolveTurn` again without a model call. Null for an unknown option.
 */
export function mergeOption(turn: Pick<StoredTurn, "actions" | "options" | "intent" | "reply_language" | "missing_fields">, option_value: string): ToolArguments | null {
  const option = (turn.options ?? []).find((item: StoredOption) => item.value === option_value);
  if (!option) return null;
  const actions: ToolAction[] = turn.actions.map((action) => {
    const raw = { ...(action.raw as Record<string, unknown>) };
    delete raw[SERVER_FACTS_KEY];
    return raw as ToolAction;
  });
  for (const apply of option.apply) {
    const target = actions[apply.action_index];
    if (target) (target as Record<string, unknown>)[apply.field] = apply.value;
  }
  const fields = new Set(option.apply.map((apply) => `${apply.action_index}:${apply.field}`));
  return {
    intent: turn.intent === "ask" ? "ask" : "act",
    actions,
    missing_fields: (turn.missing_fields ?? []).filter((entry) => !fields.has(entry)),
    reply: "",
    reply_language: turn.reply_language,
  };
}

/**
 * Merges a follow-up turn's tool arguments into the stored partial actions (1.11 end): values
 * from the new turn win, the stored turn fills the gaps. Used when the new turn names no kind
 * of its own for an action of the same kind.
 */
export function mergeWithContext(tool: ToolArguments, context: StoredTurn | null): ToolArguments {
  if (!context || context.actions.length === 0) return tool;
  const actions = tool.actions.map((action) => {
    const stored = context.actions.find((a) => a.kind === action.kind);
    if (!stored) return action;
    const raw = { ...(stored.raw as Record<string, unknown>) };
    delete raw[SERVER_FACTS_KEY];
    const merged: Record<string, unknown> = { ...raw };
    for (const [key, value] of Object.entries(action)) if (value !== undefined && value !== null && value !== "") merged[key] = value;
    merged.heard = [...((raw.heard as unknown[]) ?? []), ...(action.heard ?? [])];
    return merged as ToolAction;
  });
  return { ...tool, actions };
}
