import "server-only";

import type { ReplyRegister, VoiceAnswerCard } from "@/contracts/api";
import { EVENT_KINDS, type EventKind } from "@/contracts/domain";
import type { ActivityFeedEntry, Itinerary, ItineraryFunction } from "@/contracts/read-models";
import { routes, withHighlight } from "@/contracts/routes";

import { checkValue, createReadAccess, fold, formatLongDate, formatTime, formatWeekdayDate, formatWeekdayDateHi, hasWords, resolveEvent, resolveMember, resolveVendor, roleOrName, speakTimeEn, type ReadAccess, type VendorRef } from "./resolve/support";
import { clockHi, clockHinglish, clockHinglishWords, countHi, countHinglish, formatInr, inrWords, spoken } from "./resolve/say";
import { fixedReply, reply, shagunNotSetUp } from "./templates";
import type { ReplyText, ResolveContext, Snapshot, StoredOption, ToolAction } from "./types";

/**
 * Answers to questions from saved records (voice.md section 4). Code computes nothing but
 * what a template states; every figure comes from a read model (M8, V9).
 */

export type AnswerResult =
  | { kind: "answer"; cards: VoiceAnswerCard[]; reply: ReplyText }
  | { kind: "clarify"; question: ReplyText; options: StoredOption[]; missing_fields: string[] };

export type AnswerDeps = { access: ReadAccess };

/** The reference a snapshot gives a record's UUID (ref_map is reference → UUID). */
export function refOf(snapshot: Snapshot, id: string): string | null {
  for (const [ref, value] of Object.entries(snapshot.ref_map)) if (value === id) return ref;
  return null;
}

const KIND_SAY: Record<Exclude<EventKind, "other">, { en: string; hinglish: string; hi: string }> = {
  mehendi: { en: "mehendi", hinglish: "mehendi", hi: "मेहंदी" },
  haldi: { en: "haldi", hinglish: "haldi", hi: "हल्दी" },
  sangeet: { en: "sangeet", hinglish: "sangeet", hi: "संगीत" },
  wedding: { en: "wedding", hinglish: "shaadi", hi: "शादी" },
  reception: { en: "reception", hinglish: "reception", hi: "रिसेप्शन" },
};

function capital(text: string): string {
  return text.length === 0 ? text : text.charAt(0).toUpperCase() + text.slice(1);
}

/** "Mehendi, haldi, sangeet, shaadi ya reception" in event_kind order (E-07). */
export function functionList(itinerary: Itinerary | null, register: ReplyRegister): { text: string; functions: ItineraryFunction[] } {
  const functions = [...(itinerary?.functions ?? [])].sort(
    (a, b) => EVENT_KINDS.indexOf(a.event_kind) - EVENT_KINDS.indexOf(b.event_kind),
  );
  const words = functions.map((fn) => (fn.event_kind === "other" ? fn.title : KIND_SAY[fn.event_kind][register]));
  const joiner = register === "en" ? " or " : register === "hinglish" ? " ya " : " या ";
  const text = words.length <= 1 ? words.join("") : `${words.slice(0, -1).join(", ")}${joiner}${words[words.length - 1]}`;
  return { text: capital(text), functions };
}

/** Options for "which function?" (no default: a list of records, 6.2). */
export function functionOptions(snapshot: Snapshot, functions: ItineraryFunction[], action_index: number): StoredOption[] {
  return functions.slice(0, 6).map((fn, i) => ({
    label: fn.title,
    value: `o${i + 1}`,
    apply: [{ action_index, field: "event_id", value: fn.seed_key ?? refOf(snapshot, fn.event_id) ?? fn.event_id }],
  }));
}

function whichFunction(kind: "rsvp" | "venue" | "event", itinerary: Itinerary | null, register: ReplyRegister): ReplyText {
  const list = functionList(itinerary, register).text;
  if (register === "en") {
    const lead = kind === "venue" ? "Which function's venue?" : "Which function?";
    return reply(register, `${lead} ${list}?`);
  }
  if (register === "hinglish") {
    const lead = kind === "venue" ? "Kis function ka venue?" : "Kis function ke liye?";
    const leadDev = kind === "venue" ? "किस function का venue?" : "किस function के लिए?";
    return reply(register, `${lead} ${list}?`, `${leadDev} ${functionList(itinerary, "hi").text}?`);
  }
  const lead = kind === "venue" ? "किस कार्यक्रम का स्थान?" : "किस कार्यक्रम के लिए?";
  return reply(register, `${lead} ${list}?`);
}

function eventTitle(fn: ItineraryFunction, register: ReplyRegister): string {
  if (register === "hi") return fn.title_hi || fn.title;
  return fn.title;
}

function vendorFromPage(page: string | null): string | null {
  if (!page) return null;
  const match = page.match(/[?&]vendor_id=([^&#]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function eventFromPage(page: string | null): string | null {
  if (!page) return null;
  const match = page.match(/[?&]event_id=([^&#]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

// ---------------------------------------------------------------------------
// query_balance (4.2, 4.4, 4.5)
// ---------------------------------------------------------------------------

async function answerBalance(ctx: ResolveContext, action: ToolAction, index: number, deps: AnswerDeps): Promise<AnswerResult> {
  const r = ctx.register;
  const wedding_id = ctx.wedding_id as string;
  const money = await deps.access.money();
  const vendors = await deps.access.vendors();
  let vendorId: string | null = null;
  const wantsTotal = action.scope === "wedding";
  if (!wantsTotal) {
    const found = resolveVendor(action, ctx.snapshot, vendors);
    if (found.ok) vendorId = found.value.vendor_id;
    else if (found.reason !== "missing") {
      const heard = found.heard ?? "";
      if (found.reason === "ambiguous") {
        return {
          kind: "clarify",
          question: reply(r, r === "en" ? `Which one: ${found.candidates.map((v) => v.name).join(", ")}?` : `Kaunsa vendor: ${found.candidates.map((v) => v.name).join(", ")}?`),
          options: found.candidates.slice(0, 6).map((v, i) => ({ label: v.name, value: `o${i + 1}`, apply: [{ action_index: index, field: "vendor_id", value: v.seed_key ?? v.vendor_id }] })),
          missing_fields: [`${index}:vendor_id`],
        };
      }
      return {
        kind: "clarify",
        question: reply(r, r === "hi" ? `आपके वेंडरों में ${heard} नहीं मिला।` : `I couldn't find ${heard} among your vendors.`),
        options: [],
        missing_fields: [`${index}:vendor_id`],
      };
    } else if (action.scope !== "wedding") {
      vendorId = vendorFromPage(ctx.page);
    }
  }

  if (!vendorId) {
    const totals = money?.totals;
    if (!totals) return { kind: "answer", cards: [], reply: reply(r, r === "en" ? "There's nothing to show yet." : "Abhi dikhane ke liye kuch nahi hai.") };
    const owed = (money?.vendors ?? []).filter((v) => v.outstanding_inr > 0).sort((a, b) => b.outstanding_inr - a.outstanding_inr);
    const total = totals.total_outstanding_inr;
    let en = `You still owe ${formatInr(total)}.`;
    if (owed.length > 1) {
      const top = owed[0];
      const role = roleOrName(vendorRefOf(top), vendors);
      en = `You still owe ${formatInr(total)}, including ${formatInr(top.outstanding_inr)} to ${role.is_role ? `the ${role.en}` : role.en}.`;
    }
    const card: VoiceAnswerCard = {
      title: r === "hi" ? "कुल बाकी" : "Still owed in total",
      figure: formatInr(total),
      link: withHighlight(routes.money(wedding_id), ["total_outstanding_inr"]),
    };
    if (r === "en") return { kind: "answer", cards: [card], reply: spoken(r, en) };
    const line = `कुल ${inrWords(total, "hi")} बाकी हैं।`;
    return { kind: "answer", cards: [card], reply: reply(r, line) };
  }

  const row = money?.vendors?.find((v) => v.vendor_id === vendorId);
  const vendorRef = vendors.find((v) => v.vendor_id === vendorId);
  const name = row?.name ?? vendorRef?.name ?? "";
  const link = withHighlight(routes.vendor(wedding_id, vendorId), ["outstanding_inr"]);
  if (!row) return { kind: "answer", cards: [], reply: reply(r, r === "en" ? `I can't see ${name}'s figures.` : `${name} ke figures nahi dikh rahe.`) };
  const card: VoiceAnswerCard = {
    title: r === "hi" ? `${name} का बाकी` : `Still owed to ${name}`,
    figure: formatInr(row.outstanding_inr),
    link,
  };
  const role = roleOrName(vendorRefOf(row), vendors);

  // A claim (M-09, 4.4): compared in code, never repeated as if true.
  const claim = typeof action.user_claim_inr === "number" ? action.user_claim_inr : null;
  if (claim !== null) {
    const check = checkValue(ctx, action, "user_claim_inr", claim, null);
    const claimed = check.state === "ok" ? claim : (check.code_value ?? claim);
    const owed = formatInr(row.outstanding_inr);
    if (claimed !== row.outstanding_inr) {
      const paid = formatInr(row.paid_inr);
      const committed = formatInr(row.committed_inr);
      if (r === "en") return { kind: "answer", cards: [card], reply: spoken(r, `No, ${owed} is still owed to ${name}. ${paid} of ${committed} has been paid.`) };
      if (r === "hinglish") {
        return {
          kind: "answer",
          cards: [card],
          reply: reply(
            r,
            `Nahi, ${role.en} ka ${owed} baaki hai. ${committed} mein se ${paid} diye ja chuke hain.`,
            `नहीं, ${role.en} का ${inrWords(row.outstanding_inr, "hi")} बाकी है। ${inrWords(row.committed_inr, "hi")} में से ${inrWords(row.paid_inr, "hi")} दिए जा चुके हैं।`,
          ),
        };
      }
      return {
        kind: "answer",
        cards: [card],
        reply: reply(r, `नहीं, ${name} के ${inrWords(row.outstanding_inr, "hi")} बाकी हैं। ${inrWords(row.committed_inr, "hi")} में से ${inrWords(row.paid_inr, "hi")} दिए जा चुके हैं।`),
      };
    }
    if (r === "en") return { kind: "answer", cards: [card], reply: spoken(r, `Yes, ${owed} is still owed to ${name}.`) };
    if (r === "hinglish") return { kind: "answer", cards: [card], reply: reply(r, `Haan, ${role.en} ka ${owed} baaki hai.`, `हाँ, ${role.en} का ${inrWords(row.outstanding_inr, "hi")} बाकी है।`) };
    return { kind: "answer", cards: [card], reply: reply(r, `हाँ, ${inrWords(row.outstanding_inr, "hi")} बाकी हैं।`) };
  }

  if (row.committed_inr === 0) {
    const paid = formatInr(row.paid_inr);
    if (r === "en") return { kind: "answer", cards: [card], reply: spoken(r, `Nothing is agreed with ${name} yet. ${paid} has been paid.`) };
    if (r === "hinglish") return { kind: "answer", cards: [card], reply: spoken(r, `${name} ke saath abhi kuch tay nahi hua. ${paid} diye gaye hain.`, `${name} के साथ अभी कुछ तय नहीं हुआ। ${paid} दिए गए हैं।`) };
    return { kind: "answer", cards: [card], reply: reply(r, `${name} के साथ अभी कुछ तय नहीं हुआ। ${inrWords(row.paid_inr, "hi")} दिए गए हैं।`) };
  }
  if (row.overpaid_inr > 0) {
    const over = formatInr(row.overpaid_inr);
    if (r === "en") return { kind: "answer", cards: [card], reply: spoken(r, `${name} has been overpaid by ${over}.`) };
    if (r === "hinglish") return { kind: "answer", cards: [card], reply: spoken(r, `${name} ko ${over} zyada diye gaye hain.`, `${name} को ${over} ज़्यादा दिए गए हैं।`) };
    return { kind: "answer", cards: [card], reply: reply(r, `${name} को ${inrWords(row.overpaid_inr, "hi")} ज़्यादा दिए गए हैं।`) };
  }
  if (row.outstanding_inr === 0) {
    if (r === "en") return { kind: "answer", cards: [card], reply: reply(r, `${name} is paid in full.`) };
    if (r === "hinglish") return { kind: "answer", cards: [card], reply: reply(r, `${name} ka poora payment ho chuka hai.`, `${name} का पूरा payment हो चुका है।`) };
    return { kind: "answer", cards: [card], reply: reply(r, `${name} का पूरा भुगतान हो चुका है।`) };
  }
  // O-01: the fixed balance line, shared by hi and hinglish (4.9, demo-data §14).
  if (r === "en") return { kind: "answer", cards: [card], reply: spoken(r, `${formatInr(row.outstanding_inr)} is still owed to ${name}.`) };
  return { kind: "answer", cards: [card], reply: reply(r, `${inrWords(row.outstanding_inr, "hi")} बाकी हैं।`) };
}

function vendorRefOf(row: { vendor_id: string; seed_key: string | null; name: string; vendor_category: VendorRef["vendor_category"]; is_one_off: boolean }): VendorRef {
  return { vendor_id: row.vendor_id, seed_key: row.seed_key, name: row.name, vendor_category: row.vendor_category, is_one_off: row.is_one_off };
}

// ---------------------------------------------------------------------------
// query_budget
// ---------------------------------------------------------------------------

async function answerBudget(ctx: ResolveContext, action: ToolAction, deps: AnswerDeps): Promise<AnswerResult> {
  const r = ctx.register;
  const money = await deps.access.money();
  const totals = money?.totals;
  const link = withHighlight(routes.money(ctx.wedding_id as string), ["budget_inr"]);
  if (!totals) return { kind: "answer", cards: [], reply: reply(r, "There's no budget yet.") };
  const category = typeof action.budget_category === "string" ? action.budget_category : null;
  const line = category ? money?.categories?.find((c) => c.budget_category === category) : undefined;
  if (line && line.planned_inr !== null) {
    const label = r === "hi" ? line.label_hi : line.label;
    const card: VoiceAnswerCard = { title: label, figure: `${formatInr(line.committed_inr)} / ${formatInr(line.planned_inr)}`, link };
    if (line.over_budget_inr > 0) {
      if (r === "en") return { kind: "answer", cards: [card], reply: spoken(r, `${line.label} is ${formatInr(line.over_budget_inr)} over its ${formatInr(line.planned_inr)} budget.`) };
      if (r === "hinglish") return { kind: "answer", cards: [card], reply: spoken(r, `${line.label} budget se ${formatInr(line.over_budget_inr)} upar hai.`, `${line.label} budget से ${formatInr(line.over_budget_inr)} ऊपर है।`) };
      return { kind: "answer", cards: [card], reply: reply(r, `${line.label_hi} बजट से ${inrWords(line.over_budget_inr, "hi")} ऊपर है।`) };
    }
    if (r === "en") return { kind: "answer", cards: [card], reply: spoken(r, `${line.label}: ${formatInr(line.committed_inr)} committed of a ${formatInr(line.planned_inr)} budget.`) };
    if (r === "hinglish") return { kind: "answer", cards: [card], reply: spoken(r, `${line.label} ka budget ${formatInr(line.planned_inr)} hai, ${formatInr(line.committed_inr)} tay hai.`, `${line.label} का budget ${formatInr(line.planned_inr)} है, ${formatInr(line.committed_inr)} तय है।`) };
    return { kind: "answer", cards: [card], reply: reply(r, `${line.label_hi} का बजट ${inrWords(line.planned_inr, "hi")} है, ${inrWords(line.committed_inr, "hi")} तय हैं।`) };
  }
  const card: VoiceAnswerCard = { title: r === "hi" ? "बजट" : "Budget", figure: formatInr(totals.budget_inr), link };
  const b = formatInr(totals.budget_inr);
  const c = formatInr(totals.total_committed_inr);
  const u = formatInr(totals.uncommitted_inr);
  if (r === "en") return { kind: "answer", cards: [card], reply: spoken(r, `The budget is ${b}. ${c} is committed and ${u} is still open.`) };
  if (r === "hinglish") return { kind: "answer", cards: [card], reply: spoken(r, `Budget ${b} hai. ${c} tay ho chuka hai, ${u} abhi khula hai.`, `Budget ${b} है। ${c} तय हो चुका है, ${u} अभी खुला है।`) };
  return {
    kind: "answer",
    cards: [card],
    reply: reply(r, `बजट ${inrWords(totals.budget_inr, "hi")} है। ${inrWords(totals.total_committed_inr, "hi")} तय हो चुके हैं, ${inrWords(totals.uncommitted_inr, "hi")} अभी खुले हैं।`),
  };
}

// ---------------------------------------------------------------------------
// query_rsvp (G-01)
// ---------------------------------------------------------------------------

async function pickEvent(ctx: ResolveContext, action: ToolAction, index: number, itinerary: Itinerary | null, kind: "rsvp" | "venue" | "event"): Promise<{ ok: true; fn: ItineraryFunction } | { ok: false; result: AnswerResult }> {
  const found = resolveEvent(action, ctx.snapshot, itinerary);
  if (found.ok) return { ok: true, fn: found.value };
  if (found.reason === "missing") {
    const fromPage = eventFromPage(ctx.page);
    const fn = fromPage ? itinerary?.functions.find((row) => row.event_id === fromPage) : undefined;
    if (fn) return { ok: true, fn };
  }
  const list = found.reason === "ambiguous" ? found.candidates : functionList(itinerary, ctx.register).functions;
  return {
    ok: false,
    result: {
      kind: "clarify",
      question: whichFunction(kind, itinerary, ctx.register),
      options: functionOptions(ctx.snapshot, list, index),
      missing_fields: [`${index}:event_id`],
    },
  };
}

async function answerRsvp(ctx: ResolveContext, action: ToolAction, index: number, deps: AnswerDeps): Promise<AnswerResult> {
  const r = ctx.register;
  const itinerary = await deps.access.itinerary();
  const picked = await pickEvent(ctx, action, index, itinerary, "rsvp");
  if (!picked.ok) return picked.result;
  const fn = picked.fn;
  const totals = await deps.access.rsvp();
  const row = totals?.functions.find((f) => f.event_id === fn.event_id);
  if (!row) return { kind: "answer", cards: [], reply: reply(r, r === "en" ? "No RSVPs yet." : "Abhi koi RSVP nahi.") };
  const card: VoiceAnswerCard = {
    title: r === "hi" ? `${fn.title_hi}: आ रहे हैं` : `Attending the ${fn.title.toLowerCase()}`,
    figure: `${row.attending} of ${row.invited}`,
    link: withHighlight(routes.guests(ctx.wedding_id as string, fn.event_id), ["attending"]),
  };
  const t = fn.title.toLowerCase();
  if (r === "en") {
    return { kind: "answer", cards: [card], reply: reply(r, `${row.attending} of ${row.invited} have confirmed for the ${t}. ${row.declined} declined and ${row.pending} haven't replied yet.`) };
  }
  if (r === "hinglish") {
    return {
      kind: "answer",
      cards: [card],
      reply: reply(
        r,
        `${fn.title} ke liye ${row.invited} mein se ${row.attending} ne confirm kiya hai. ${row.declined} ne mana kiya, ${row.pending} ka jawab baaki hai.`,
        `${fn.title} के लिए ${countHi(row.invited)} में से ${countHi(row.attending)} ने confirm किया है। ${countHi(row.declined)} ने मना किया, ${countHi(row.pending)} का जवाब बाकी है।`,
      ),
    };
  }
  return {
    kind: "answer",
    cards: [card],
    reply: reply(
      r,
      `${fn.title_hi} के लिए ${row.invited} में से ${row.attending} लोग आ रहे हैं। ${row.declined} नहीं आएँगे, ${row.pending} का जवाब बाकी है।`,
      `${fn.title_hi} के लिए ${countHi(row.invited)} में से ${countHi(row.attending)} लोग आ रहे हैं। ${countHi(row.declined)} नहीं आएँगे, ${countHi(row.pending)} का जवाब बाकी है।`,
    ),
  };
}

// ---------------------------------------------------------------------------
// query_event (O-03 venue, E-07)
// ---------------------------------------------------------------------------

function nextFunction(itinerary: Itinerary | null, today: string): ItineraryFunction | null {
  const upcoming = (itinerary?.functions ?? [])
    .filter((fn) => fn.event_date >= today)
    .sort((a, b) => `${a.event_date}${a.start_time ?? ""}`.localeCompare(`${b.event_date}${b.start_time ?? ""}`));
  return upcoming[0] ?? null;
}

function venueSentence(fn: ItineraryFunction, r: ReplyRegister): ReplyText {
  const draft = fn.venue?.name ?? null;
  const published = fn.published?.venue?.name ?? null;
  const title = eventTitle(fn, r);
  if (!draft) return reply(r, r === "en" ? `No venue is set for the ${fn.title.toLowerCase()} yet.` : `${title}: venue abhi tay nahi hai.`);
  const differs = published !== null && published !== draft;
  if (r === "en") {
    if (differs) return reply(r, `In the draft the ${fn.title.toLowerCase()} is at ${draft}. Guests still see ${published}.`);
    const place = fn.venue?.place_name ? `, ${fn.venue.place_name}` : "";
    return reply(r, `The ${fn.title.toLowerCase()} is at ${draft}${place}.`);
  }
  if (differs) {
    if (r === "hinglish") {
      return reply(r, `${fn.title}: ${draft}, abhi draft mein. Guests ko ${published} dikh raha hai.`, `${fn.title}: ${draft}, अभी draft में। Guests को ${published} दिख रहा है।`);
    }
    return reply(r, `${fn.title_hi}: ${draft}, अभी ड्राफ़्ट में। मेहमानों को ${published} दिख रहा है।`);
  }
  // The venue answer is a fixed live line: hi and hinglish share "Reception: Lotus Hall." (4.9 #7).
  return reply(r, `${fn.title}: ${draft}.`);
}

function timeSentence(fn: ItineraryFunction, r: ReplyRegister): ReplyText {
  const start = fn.start_time;
  const end = fn.end_time;
  if (r === "en") {
    const range = start ? (end ? `, ${speakTimeEn(start)} to ${speakTimeEn(end)}` : `, ${speakTimeEn(start)}`) : "";
    return reply(r, `The ${fn.title.toLowerCase()} is on ${formatWeekdayDate(fn.event_date)}${range}.`);
  }
  if (r === "hinglish") {
    const range = start ? (end ? ` ${clockHinglish(start)} se ${clockHinglish(end)} tak` : ` ${clockHinglish(start)}`) : "";
    const rangeDev = start ? (end ? ` ${clockHi(start)} से ${clockHi(end)} तक` : ` ${clockHi(start)}`) : "";
    return reply(r, `${fn.title} ${formatWeekdayDate(fn.event_date)} ko${range} hai.`, `${fn.title} ${formatWeekdayDate(fn.event_date)} को${rangeDev} है।`);
  }
  const rangeDev = start ? (end ? ` ${clockHi(start)} से ${clockHi(end)} तक` : ` ${clockHi(start)}`) : "";
  return reply(r, `${fn.title_hi} ${formatWeekdayDateHi(fn.event_date)} को${rangeDev} है।`);
}

async function answerEvent(ctx: ResolveContext, action: ToolAction, index: number, deps: AnswerDeps): Promise<AnswerResult> {
  const r = ctx.register;
  const itinerary = await deps.access.itinerary();
  const wedding_id = ctx.wedding_id as string;
  let fn: ItineraryFunction | null = null;
  if (action.next_event === true) fn = nextFunction(itinerary, ctx.snapshot.today);
  const detail = typeof action.detail === "string" ? action.detail : "all";
  if (!fn) {
    const picked = await pickEvent(ctx, action, index, itinerary, detail === "venue" ? "venue" : "event");
    if (!picked.ok) return picked.result;
    fn = picked.fn;
  }
  const link = withHighlight(routes.events(wedding_id, fn.event_id), [detail === "all" ? "venue" : detail]);
  let sentence: ReplyText;
  let card: VoiceAnswerCard;
  switch (detail) {
    case "time":
      sentence = timeSentence(fn, r);
      card = { title: r === "hi" ? `${fn.title_hi}: समय` : `${fn.title} time`, figure: `${formatTime(fn.start_time)}${fn.end_time ? ` – ${formatTime(fn.end_time)}` : ""}`, link };
      break;
    case "date":
      sentence =
        r === "en"
          ? reply(r, `The ${fn.title.toLowerCase()} is on ${formatWeekdayDate(fn.event_date)} ${fn.event_date.slice(0, 4)}.`)
          : r === "hinglish"
            ? reply(r, `${fn.title} ${formatWeekdayDate(fn.event_date)} ko hai.`, `${fn.title} ${formatWeekdayDate(fn.event_date)} को है।`)
            : reply(r, `${fn.title_hi} ${formatWeekdayDateHi(fn.event_date)} को है।`);
      card = { title: r === "hi" ? `${fn.title_hi}: तारीख़` : `${fn.title} date`, figure: formatLongDate(fn.event_date), link };
      break;
    case "dress_code": {
      const code = fn.dress_code ?? "-";
      sentence =
        r === "en"
          ? reply(r, `Dress code for the ${fn.title.toLowerCase()}: ${code}.`)
          : r === "hinglish"
            ? reply(r, `${fn.title} ka dress code: ${code}.`, `${fn.title} का dress code: ${code}।`)
            : reply(r, `${fn.title_hi} का ड्रेस कोड: ${code}।`);
      card = { title: r === "hi" ? `${fn.title_hi}: ड्रेस कोड` : `${fn.title} dress code`, figure: code, link };
      break;
    }
    case "venue":
      sentence = venueSentence(fn, r);
      card = { title: r === "hi" ? `${fn.title_hi}: स्थान` : `${fn.title} venue`, figure: fn.venue?.name ?? "-", link };
      break;
    default: {
      const venue = venueSentence(fn, r);
      const time = timeSentence(fn, r);
      sentence = {
        display_text: `${venue.display_text} ${time.display_text}`,
        speech_text: `${venue.speech_text ?? venue.display_text} ${time.speech_text ?? time.display_text}`,
        language: r,
      };
      card = { title: fn.title, figure: `${formatTime(fn.start_time)} · ${fn.venue?.name ?? "-"}`, link };
    }
  }
  return { kind: "answer", cards: [card], reply: sentence };
}

// ---------------------------------------------------------------------------
// query_changes (O-02, O-04, M-10)
// ---------------------------------------------------------------------------

function str(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  if (value && typeof value === "object" && typeof (value as { name?: unknown }).name === "string") return (value as { name: string }).name;
  return null;
}

function venueChange(entry: ActivityFeedEntry): { from: string; to: string } | null {
  if (!entry.topic.startsWith("event.")) return null;
  const before = entry.before ?? {};
  const after = entry.after ?? {};
  const from = str(before.venue_name) ?? str(before.venue);
  const to = str(after.venue_name) ?? str(after.venue);
  if (from && to && from !== to) return { from, to };
  return null;
}

const EN_COUNTS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];

function countEn(n: number): string {
  return EN_COUNTS[n] ?? String(n);
}

/** The function an entry belongs to: the event itself, or the function holding the requirement. */
function functionOf(entry: ActivityFeedEntry, itinerary: Itinerary | null): ItineraryFunction | undefined {
  if (!itinerary) return undefined;
  if (entry.entity_type === "requirement") {
    return itinerary.functions.find((f) => f.requirements.some((q) => q.requirement_id === entry.entity_id));
  }
  return itinerary.functions.find((f) => f.event_id === entry.entity_id);
}

/** A requirement's text up to its first comma, starting lowercase (4.2 O-04). */
function noteItem(entry: ActivityFeedEntry, fn: ItineraryFunction | undefined): string {
  const fromAfter = typeof entry.after?.text === "string" ? entry.after.text : null;
  const fromItinerary = fn?.requirements.find((q) => q.requirement_id === entry.entity_id)?.label ?? null;
  const text = (fromAfter ?? fromItinerary ?? "").split(",")[0]?.trim() ?? "";
  return text.length > 0 ? text.charAt(0).toLowerCase() + text.slice(1) : text;
}

function timeChange(entry: ActivityFeedEntry): { which: "start" | "end"; time: string } | null {
  if (entry.topic !== "event.updated") return null;
  const after = entry.after ?? {};
  if (typeof after.end_time === "string") return { which: "end", time: after.end_time.slice(0, 5) };
  if (typeof after.start_time === "string") return { which: "start", time: after.start_time.slice(0, 5) };
  return null;
}

function amountOf(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

/** Hinglish's own phrasing for the demo's topics (4.2): Latin display, Devanagari speech. */
function hinglishEntry(entry: ActivityFeedEntry, fn: ItineraryFunction | undefined, actor: string): ReplyText | null {
  const r: ReplyRegister = "hinglish";
  const t = fn?.title.toLowerCase() ?? null;
  const tHi = fn?.title_hi ?? null;
  const time = timeChange(entry);
  if (time && t && tHi) {
    const verb = time.which === "end" ? ["khatam hogi", "ख़त्म होगी"] : ["shuru hogi", "शुरू होगी"];
    return reply(r, `${actor} ne ${t} ka time badla: ab ${clockHinglishWords(time.time)} ${verb[0]}.`, `${actor} ने ${tHi} का time बदला: अब ${clockHi(time.time)} ${verb[1]}।`);
  }
  if (entry.topic === "payment.corrected") {
    const from = amountOf(entry.before?.amount_inr);
    const to = amountOf(entry.after?.amount_inr);
    if (from !== null && to !== null) {
      return reply(r, `${actor} ne payment ${formatInr(from)} se ${formatInr(to)} kiya.`, `${actor} ने payment ${inrWords(from, "hi")} से ${inrWords(to, "hi")} किया।`);
    }
  }
  if (entry.topic === "requirement.added" && t && tHi) {
    const item = noteItem(entry, fn);
    return reply(r, `${actor} ne ${t} mein note joda: ${item}.`, `${actor} ने ${tHi} में note जोड़ा: ${item}।`);
  }
  if (entry.topic === "itinerary.published") {
    return reply(r, `${actor} ne schedule publish kiya.`, `${actor} ने schedule publish किया।`);
  }
  return null;
}

/** The top entry as a phrase for the three-or-more line (4.2 M-10), with where it stands. */
function gerundOf(entry: ActivityFeedEntry, fn: ItineraryFunction | undefined, r: ReplyRegister): { display: string; speech: string } {
  const t = fn?.title.toLowerCase() ?? "function";
  const tHi = fn?.title_hi ?? t;
  const moved = venueChange(entry);
  const stands = entry.topic.startsWith("event.")
    ? entry.awaiting_publish
      ? { en: ", still a draft", hinglish: [", jo abhi draft hai", ", जो अभी draft है"], hi: ", जो अभी ड्राफ़्ट है" }
      : { en: ", which is now published", hinglish: [", jo ab publish ho chuka hai", ", जो अब publish हो चुका है"], hi: ", जो अब प्रकाशित हो चुका है" }
    : { en: "", hinglish: ["", ""], hi: "" };
  let en: string;
  let hinglish: [string, string];
  let hi: string;
  if (moved) {
    en = `moving the ${t} to ${moved.to}`;
    hinglish = [`${t} ko ${moved.to} mein shift karna`, `${t} को ${moved.to} में shift करना`];
    hi = `${tHi} को ${moved.to} में ले जाना`;
  } else if (timeChange(entry)) {
    en = `changing the ${t} time`;
    hinglish = [`${t} ka time badalna`, `${t} का time बदलना`];
    hi = `${tHi} का समय बदलना`;
  } else if (entry.topic === "itinerary.published") {
    en = "publishing the schedule";
    hinglish = ["schedule publish karna", "schedule publish करना"];
    hi = "कार्यक्रम प्रकाशित करना";
  } else if (entry.topic === "payment.corrected") {
    en = "correcting a payment";
    hinglish = ["ek payment theek karna", "एक payment ठीक करना"];
    hi = "एक भुगतान ठीक करना";
  } else if (entry.topic.startsWith("payment.")) {
    en = "recording a payment";
    hinglish = ["ek payment record karna", "एक payment record करना"];
    hi = "एक भुगतान दर्ज करना";
  } else if (entry.topic.startsWith("commitment.")) {
    en = "changing a vendor's agreed amount";
    hinglish = ["ek vendor ka contract badalna", "एक vendor का contract बदलना"];
    hi = "एक वेंडर की तय रकम बदलना";
  } else if (entry.topic === "requirement.added") {
    en = `adding a note to the ${t}`;
    hinglish = [`${t} mein note jodna`, `${t} में note जोड़ना`];
    hi = `${tHi} में नोट जोड़ना`;
  } else if (entry.topic.startsWith("event.")) {
    en = `changing the ${t}`;
    hinglish = [`${t} mein badlav`, `${t} में बदलाव`];
    hi = `${tHi} में बदलाव`;
  } else {
    en = "a change on the planner";
    hinglish = ["planner mein ek badlav", "planner में एक बदलाव"];
    hi = "प्लानर में एक बदलाव";
  }
  if (r === "en") return { display: `${en}${stands.en}`, speech: `${en}${stands.en}` };
  if (r === "hinglish") return { display: `${hinglish[0]}${stands.hinglish[0]}`, speech: `${hinglish[1]}${stands.hinglish[1]}` };
  return { display: `${hi}${stands.hi}`, speech: `${hi}${stands.hi}` };
}

/** Two notes of one topic (4.2 O-04), or the 4.8 short form past 140 characters. */
function twoNotes(entries: ActivityFeedEntry[], itinerary: Itinerary | null, actor: string, r: ReplyRegister): ReplyText {
  const items = [...entries].reverse().map((entry) => {
    const fn = functionOf(entry, itinerary);
    return { item: noteItem(entry, fn), t: fn?.title.toLowerCase() ?? "", tHi: fn?.title_hi ?? fn?.title ?? "" };
  });
  const [a, b] = items as [(typeof items)[number], (typeof items)[number]];
  if (r === "en") {
    const full = `Today ${actor} added two notes: ${a.item} at the ${a.t}, and ${b.item} at the ${b.t}.`;
    return reply(r, full.length <= 140 ? full : `Today ${actor} added two notes, at the ${a.t} and the ${b.t}.`);
  }
  if (r === "hinglish") {
    const full = `Aaj ${actor} ne do notes jode: ${a.t} mein ${a.item}, aur ${b.t} mein ${b.item}.`;
    const fullSpeech = `आज ${actor} ने दो notes जोड़े: ${a.tHi} में ${a.item}, और ${b.tHi} में ${b.item}।`;
    if (full.length <= 140) return reply(r, full, fullSpeech);
    return reply(r, `Aaj ${actor} ne do notes jode, ${a.t} aur ${b.t} mein.`, `आज ${actor} ने दो notes जोड़े, ${a.tHi} और ${b.tHi} में।`);
  }
  const full = `आज ${actor} ने दो नोट जोड़े: ${a.tHi} में ${a.item}, और ${b.tHi} में ${b.item}।`;
  return reply(r, full.length <= 140 ? full : `आज ${actor} ने दो नोट जोड़े, ${a.tHi} और ${b.tHi} में।`);
}

function entrySentence(entry: ActivityFeedEntry, itinerary: Itinerary | null, r: ReplyRegister): ReplyText {
  const fn = itinerary?.functions.find((f) => f.event_id === entry.entity_id);
  const actor = entry.actor_label;
  if (r === "hinglish" && !venueChange(entry)) {
    const own = hinglishEntry(entry, functionOf(entry, itinerary), actor);
    if (own) {
      if (!entry.awaiting_publish) return own;
      return reply(r, `${own.display_text} Yeh abhi draft hai.`, `${own.speech_text ?? own.display_text} यह अभी draft है।`);
    }
  }
  const moved = venueChange(entry);
  if (moved && fn) {
    const t = fn.title.toLowerCase();
    if (r === "en") {
      const tail = entry.awaiting_publish ? ` It's still a draft; guests still see ${moved.from}.` : " It's published now.";
      return reply(r, `${actor} moved the ${t} from ${moved.from} to ${moved.to}.${tail}`);
    }
    if (r === "hinglish") {
      const tail = entry.awaiting_publish ? ` Yeh abhi draft hai, guests ko ${moved.from} hi dikh raha hai.` : " Yeh publish ho chuka hai.";
      const tailDev = entry.awaiting_publish ? ` यह अभी draft है, guests को ${moved.from} ही दिख रहा है।` : " यह publish हो चुका है।";
      return reply(r, `${actor} ne ${t} ${moved.from} se ${moved.to} mein shift kiya.${tail}`, `${actor} ने ${t} ${moved.from} से ${moved.to} में shift किया।${tailDev}`);
    }
    const tail = entry.awaiting_publish ? ` यह अभी ड्राफ़्ट है, मेहमानों को ${moved.from} ही दिख रहा है।` : " यह प्रकाशित हो चुका है।";
    return reply(r, `${entry.summary_hi}${tail}`);
  }
  if (r === "en") return reply(r, entry.summary_en);
  const tail = entry.awaiting_publish ? (r === "hi" ? " यह अभी ड्राफ़्ट है।" : " Yeh abhi draft hai.") : "";
  const tailDev = entry.awaiting_publish ? " यह अभी draft है।" : "";
  return reply(r, `${entry.summary_hi}${tail}`, `${entry.summary_hi}${r === "hi" ? tail : tailDev}`);
}

function importance(entry: ActivityFeedEntry): number {
  if (entry.topic.startsWith("event.") || entry.topic.startsWith("itinerary.")) return 0;
  if (/^(payment|commitment|expense|budget)\./.test(entry.topic)) return 1;
  return 2;
}

function entryLink(wedding_id: string, entry: ActivityFeedEntry, itinerary: Itinerary | null): string {
  switch (entry.entity_type) {
    case "event":
      return withHighlight(routes.events(wedding_id, entry.entity_id), [timeChange(entry) ? (timeChange(entry)?.which === "end" ? "end_time" : "start_time") : "venue"]);
    case "vendor":
      return routes.vendor(wedding_id, entry.entity_id);
    case "requirement": {
      const fn = functionOf(entry, itinerary);
      return fn ? withHighlight(routes.events(wedding_id, fn.event_id), ["requirements"]) : routes.events(wedding_id);
    }
    default:
      return routes.activity(wedding_id);
  }
}

async function answerChanges(ctx: ResolveContext, action: ToolAction, deps: AnswerDeps): Promise<AnswerResult> {
  const r = ctx.register;
  const wedding_id = ctx.wedding_id as string;
  const members = await deps.access.members();
  const actorRef = typeof action.actor_member_id === "string" ? action.actor_member_id : null;
  const member = resolveMember(actorRef, ctx.snapshot, members);
  const latest = action.latest === true;
  const dayRaw = typeof action.day === "string" ? action.day : null;
  const day = dayRaw === "today" || dayRaw === null ? (latest ? undefined : "today") : dayRaw;
  const feed = await deps.access.activity({
    ...(member ? { actor_member_id: member.member_id } : {}),
    ...(day ? { day: day as "today" } : {}),
    limit: 50,
  });
  const all = feed?.entries ?? [];
  let entries = all;
  if (!member) {
    const others = entries.filter((e) => e.actor_label !== ctx.actor.display_name);
    if (others.length > 0) entries = others;
  }
  if (latest) entries = entries.slice(0, 1);
  // The speaker's own entries stay on the card, linked but not spoken (4.2, AT-8.3).
  const ownEntries = !member && !latest && entries !== all ? all.filter((e) => e.actor_label === ctx.actor.display_name) : [];
  const itinerary = await deps.access.itinerary();
  const ownTitle = r === "hi" ? "आपके आज के बदलाव" : r === "hinglish" ? "Aapke aaj ke badlav" : "Your changes today";
  const cards: VoiceAnswerCard[] = [
    ...entries.slice(0, 6).map((entry) => ({
      title: r === "hi" ? entry.summary_hi : entry.summary_en,
      figure: formatTime(entry.occurred_at.slice(11, 16)),
      link: entryLink(wedding_id, entry, itinerary),
    })),
    ...ownEntries.slice(0, 6).map((entry) => ({
      title: `${ownTitle}: ${r === "hi" ? entry.summary_hi : entry.summary_en}`,
      figure: formatTime(entry.occurred_at.slice(11, 16)),
      link: entryLink(wedding_id, entry, itinerary),
    })),
  ];
  if (entries.length === 0) {
    if (r === "en") return { kind: "answer", cards, reply: reply(r, "Nothing has changed today.") };
    if (r === "hinglish") return { kind: "answer", cards, reply: reply(r, "Aaj kuch nahi badla.", "आज कुछ नहीं बदला।") };
    return { kind: "answer", cards, reply: reply(r, "आज कुछ नहीं बदला।") };
  }
  if (entries.length === 1) return { kind: "answer", cards, reply: entrySentence(entries[0], itinerary, r) };
  const actor = member?.display_name ?? entries[0].actor_label;
  if (entries.length === 2 && entries[0].topic === entries[1].topic && entries[0].topic === "requirement.added") {
    return { kind: "answer", cards, reply: twoNotes(entries, itinerary, actor, r) };
  }
  if (entries.length === 2 && entries[0].topic === entries[1].topic) {
    const pair = [...entries].reverse().map((entry) => entrySentence(entry, itinerary, r));
    return {
      kind: "answer",
      cards,
      reply: reply(r, pair.map((p) => p.display_text).join(" "), pair.map((p) => p.speech_text ?? p.display_text).join(" ")),
    };
  }
  const top = [...entries].sort((a, b) => importance(a) - importance(b) || b.seq - a.seq)[0];
  const n = entries.length;
  const phrase = gerundOf(top, functionOf(top, itinerary), r);
  const today = day === "today" || day === undefined;
  if (r === "en") {
    return { kind: "answer", cards, reply: reply(r, `${actor} made ${countEn(n)} changes${today ? " today" : ""}, including ${phrase.display}.`) };
  }
  if (r === "hinglish") {
    return {
      kind: "answer",
      cards,
      reply: reply(r, `${today ? "Aaj " : ""}${actor} ne ${countHinglish(n)} badlav kiye, jaise ${phrase.display}.`, `${today ? "आज " : ""}${actor} ने ${countHi(n)} बदलाव किए, जैसे ${phrase.speech}।`),
    };
  }
  return { kind: "answer", cards, reply: reply(r, `${today ? "आज " : ""}${actor} ने ${countHi(n)} बदलाव किए, जैसे ${phrase.display}।`) };
}

// ---------------------------------------------------------------------------
// query_catering (V-01)
// ---------------------------------------------------------------------------

async function answerCatering(ctx: ResolveContext, action: ToolAction, deps: AnswerDeps): Promise<AnswerResult> {
  const r = ctx.register;
  const estimate = await deps.access.catering();
  const vendors = await deps.access.vendors();
  const found = resolveVendor(action, ctx.snapshot, vendors);
  const rows = (estimate?.rows ?? []).filter((row) => !found.ok || row.vendor_id === found.value.vendor_id);
  const row = rows[0];
  if (!row) {
    if (r === "en") return { kind: "answer", cards: [], reply: reply(r, "There's no per-plate contract to estimate from.") };
    if (r === "hinglish") return { kind: "answer", cards: [], reply: reply(r, "Estimate ke liye per-plate contract nahi hai.", "Estimate के लिए per-plate contract नहीं है।") };
    return { kind: "answer", cards: [], reply: reply(r, "अंदाज़े के लिए प्रति-प्लेट कॉन्ट्रैक्ट नहीं है।") };
  }
  const card: VoiceAnswerCard = {
    title: r === "hi" ? row.label_hi : row.label,
    figure: `${row.formula_text} = ${formatInr(row.estimate_inr)} · Contract ${formatInr(row.contract_amount_inr)}`,
    link: withHighlight(routes.vendor(ctx.wedding_id as string, row.vendor_id), ["estimate_inr"]),
  };
  const est = formatInr(row.estimate_inr);
  const contract = formatInr(row.contract_amount_inr);
  if (r === "en") {
    return { kind: "answer", cards: [card], reply: spoken(r, `At ${formatInr(row.unit_price_inr)} a plate for ${row.confirmed_headcount} confirmed guests, the estimate is ${est}. The contract stays fixed at ${contract}.`) };
  }
  if (r === "hinglish") {
    return {
      kind: "answer",
      cards: [card],
      reply: spoken(r, `Confirmed guests ke hisaab se estimate ${est} hai. Contract fixed ${contract} ka hi hai.`, `Confirmed guests के हिसाब से estimate ${est} है। Contract fixed ${contract} का ही है।`),
    };
  }
  return { kind: "answer", cards: [card], reply: reply(r, `आने वाले मेहमानों के हिसाब से अंदाज़ा ${inrWords(row.estimate_inr, "hi")} है। कॉन्ट्रैक्ट ${inrWords(row.contract_amount_inr, "hi")} पर तय है।`) };
}

// ---------------------------------------------------------------------------
// query_note: a saved note, word for word
// ---------------------------------------------------------------------------

/** The note asked about: by reference, else the one note with that topic. Never a guess. */
async function answerNote(ctx: ResolveContext, action: ToolAction, deps: AnswerDeps): Promise<AnswerResult> {
  const r = ctx.register;
  const notes = (await deps.access.notes())?.notes ?? [];
  const id = typeof action.note_id === "string" ? ctx.snapshot.ref_map[action.note_id] : undefined;
  let note = id ? notes.find((row) => row.note_id === id) : undefined;
  if (!note && typeof action.topic === "string" && action.topic.trim()) {
    const wanted = fold(action.topic);
    const hits = notes.filter((row) => fold(row.topic) === wanted);
    if (hits.length === 1) note = hits[0];
  }
  if (!note) return { kind: "answer", cards: [], reply: fixedReply("no_context", r) };
  const card: VoiceAnswerCard = { title: `Note: ${note.topic}`, figure: note.note_text, link: null };
  const lead = r === "en" ? "From your notes:" : r === "hinglish" ? "Aapke notes mein:" : "आपके नोट्स में:";
  const speechLead = r === "hinglish" ? "आपके notes में:" : lead;
  return { kind: "answer", cards: [card], reply: spoken(r, `${lead} ${note.note_text}`, `${speechLead} ${note.note_text}`) };
}

// ---------------------------------------------------------------------------
// The entry point
// ---------------------------------------------------------------------------

/** Answers one ask action. Role refusals are decided before this (1.11 step 2). */
export async function answerQuestion(ctx: ResolveContext, action: ToolAction, index: number, deps?: Partial<AnswerDeps>): Promise<AnswerResult> {
  const access = deps?.access ?? createReadAccess(ctx, (await import("@/server/services")).services);
  const full: AnswerDeps = { access };
  if (!ctx.wedding_id) return { kind: "answer", cards: [], reply: reply(ctx.register, ctx.register === "en" ? "Set up the wedding first." : "Pehle wedding set up kijiye.") };
  switch (action.kind) {
    case "query_balance":
      return answerBalance(ctx, action, index, full);
    case "query_budget":
      return answerBudget(ctx, action, full);
    case "query_rsvp":
      return answerRsvp(ctx, action, index, full);
    case "query_event":
      return answerEvent(ctx, action, index, full);
    case "query_changes":
      return answerChanges(ctx, action, full);
    case "query_catering":
      return answerCatering(ctx, action, full);
    case "query_shagun":
      return { kind: "answer", cards: [], reply: shagunNotSetUp(ctx.register) };
    case "query_note":
      return answerNote(ctx, action, full);
    default:
      return { kind: "answer", cards: [], reply: reply(ctx.register, "") };
  }
}

export { fold, hasWords };
