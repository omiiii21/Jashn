import "server-only";

import type { ReplyRegister } from "@/contracts/api";
import { commandSchemas, isCommandName, type CommandName, type VoicePrefillEntry } from "@/contracts/commands";
import { PAYMENT_KIND_LABELS, type JsonObject, type JsonValue, type SessionActor, type WeddingId } from "@/contracts/domain";
import { routes, withHighlight } from "@/contracts/routes";

import { factsOf, labelsFor, labelOf, SERVER_FACTS_KEY } from "./preview";
import { clockHinglishWords, countHi, formatInr, inrWords } from "./resolve/say";
import { AMOUNT_FIELDS, COUNT_FIELDS, formatDate, formatLongDate, formatTime, speakTimeEn } from "./resolve/support";
import { clockHi } from "./resolve/say";
import { firstSentenceOf, joinReplies, reply } from "./templates";
import { WRITE_KINDS, type ReplyText, type ResolvedAction, type StoredResult } from "./types";

/**
 * After the commit (voice.md 1.13, 4.10, 5.4): the reply is filled from the command results
 * (`vendor_totals`) and the facts stored with the preview, never from the model (M8, V9).
 * Also the prefill list for both refusals (D61, D121) and the card's edits (1.12).
 */

export type ConfirmedReplyInput = {
  actor: SessionActor;
  wedding_id: WeddingId | null;
  actions: ResolvedAction[];
  results: StoredResult[];
  register: ReplyRegister;
  partial: { failed_index: number; reason: string } | null;
};

function isWrite(action: ResolvedAction): boolean {
  return (WRITE_KINDS as readonly string[]).includes(action.kind);
}

/** The command and input a typed form takes: a manager's propose_change unwrapped. */
function innerOf(action: ResolvedAction): { command: CommandName; input: JsonObject } {
  if (action.command === "propose_change") {
    const inner = action.input as { command?: unknown; input?: unknown };
    if (typeof inner.command === "string" && isCommandName(inner.command) && inner.input && typeof inner.input === "object") {
      return { command: inner.command, input: inner.input as JsonObject };
    }
  }
  return { command: action.command, input: action.input };
}

/** One `{command, input, labels}` entry per write action, for the early refusal and the 423 (D121). */
export function prefillFor(actions: ResolvedAction[]): VoicePrefillEntry[] {
  return actions.filter(isWrite).map((action) => {
    const { command, input } = innerOf(action);
    return { command, input, labels: Object.keys(action.labels).length > 0 ? { ...labelsFor(input), ...action.labels } : labelsFor(input) };
  });
}

// ---------------------------------------------------------------------------
// Edits (1.12): validated like any typed input
// ---------------------------------------------------------------------------

function parseEditValue(field: string, value: string): JsonValue | undefined {
  const v = value.trim();
  if (AMOUNT_FIELDS.has(field) || COUNT_FIELDS.has(field)) {
    const digits = v.replace(/[₹,\s]/g, "").replace(/^rs\.?/i, "");
    if (!/^\d+$/.test(digits)) return undefined;
    return Number(digits);
  }
  if (v === "") return undefined;
  return v;
}

export function applyEdits(
  actions: ResolvedAction[],
  edits: { action_index: number; field: string; value: string }[],
): { ok: true; actions: ResolvedAction[] } | { ok: false; field: string; message: string } {
  const out = actions.map((action) => ({
    ...action,
    input: structuredClone(action.input),
    labels: { ...action.labels },
    preview: { ...action.preview, fields: action.preview.fields.map((f) => ({ ...f })), after_saving: [...action.preview.after_saving], warnings: [...action.preview.warnings] },
    missing_fields: [...action.missing_fields],
    raw: { ...action.raw },
  }));
  for (const edit of edits) {
    const action = out.find((a) => a.index === edit.action_index) ?? out[edit.action_index];
    if (!action || !isWrite(action)) return { ok: false, field: edit.field, message: "unknown_value" };
    const parsed = parseEditValue(edit.field, edit.value);
    if (parsed === undefined) return { ok: false, field: edit.field, message: AMOUNT_FIELDS.has(edit.field) || COUNT_FIELDS.has(edit.field) ? "not_integer" : "required" };
    const wrapped = action.command === "propose_change";
    const target: JsonObject = wrapped ? ((action.input.input as JsonObject) ?? {}) : action.input;
    target[edit.field] = parsed;
    // A correction's reason is a server template (5.4).
    const facts = factsOf(action);
    if (innerOf(action).command === "correct_payment" && edit.field === "amount_inr" && facts.old_amount_inr !== undefined && typeof parsed === "number") {
      const kind = facts.payment_kind ? PAYMENT_KIND_LABELS[facts.payment_kind].en : "Payment";
      target.change_reason = `${kind} was ${formatInr(parsed)}, not ${formatInr(facts.old_amount_inr)}.`;
      (action.raw as Record<string, unknown>)[SERVER_FACTS_KEY] = { ...facts, new_amount_inr: parsed };
    }
    if (wrapped) action.input = { ...action.input, input: target };
    const { command, input } = innerOf(action);
    const schema = commandSchemas[command];
    const check = schema.safeParse(input);
    if (!check.success) {
      const issue = check.error.issues.find((i) => String(i.path[0] ?? "") === edit.field) ?? check.error.issues[0];
      return { ok: false, field: String(issue?.path?.[0] ?? edit.field), message: issue?.message ?? "unknown_value" };
    }
    action.labels[edit.field] = action.labels[edit.field] ?? labelOf(edit.field);
    const row = action.preview.fields.find((f) => f.field === edit.field);
    const shown = typeof parsed === "number" && AMOUNT_FIELDS.has(edit.field) ? formatInr(parsed) : String(parsed);
    if (row) {
      row.new = shown;
      row.state = "changed";
    } else {
      action.preview.fields.push({ field: edit.field, label: labelOf(edit.field), old: null, new: shown, heard: null, state: "changed" });
    }
    action.missing_fields = action.missing_fields.filter((m) => m !== edit.field && m !== `${action.index}:${edit.field}`);
  }
  return { ok: true, actions: out };
}

// ---------------------------------------------------------------------------
// The reply after saving
// ---------------------------------------------------------------------------

type Built = { reply: ReplyText; navigate_path: string | null };

function owedLine(r: ReplyRegister, outstanding: number): ReplyText {
  return reply(r, `${inrWords(outstanding, "hi")} बाकी हैं।`);
}

function vendorPath(wedding_id: WeddingId | null, facts: ReturnType<typeof factsOf>): string | null {
  if (!wedding_id || !facts.vendor_id) return null;
  return withHighlight(routes.vendor(wedding_id, facts.vendor_id), ["outstanding_inr"]);
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function proposedReply(action: ResolvedAction, r: ReplyRegister, wedding_id: WeddingId | null): Built {
  const facts = factsOf(action);
  const owner = facts.first_owner ?? "the owner";
  const { command, input } = innerOf(action);
  const amount = typeof input.amount_inr === "number" ? input.amount_inr : null;
  const path = vendorPath(wedding_id, facts);
  if (command === "correct_payment") {
    if (r === "en") return { reply: reply(r, `Sent the correction to ${owner} for approval. The ledger hasn't changed.`), navigate_path: path };
    if (r === "hinglish") return { reply: reply(r, `Correction ${owner} ki approval ke liye bhej di. Ledger abhi nahi badla.`, `Correction ${owner} की approval के लिए भेज दी। Ledger अभी नहीं बदला।`), navigate_path: path };
    return { reply: reply(r, `सुधार ${owner} की मंज़ूरी के लिए भेज दिया। लेजर अभी नहीं बदला।`), navigate_path: path };
  }
  const what = amount !== null ? formatInr(amount) : "";
  if (r === "en") return { reply: reply(r, `Sent the ${what} payment to ${owner} for approval. The ledger hasn't changed.`.replace("the  payment", "the payment"), `Sent the ${amount !== null ? inrWords(amount, "en") : ""} payment to ${owner} for approval. The ledger hasn't changed.`), navigate_path: path };
  if (r === "hinglish") {
    return {
      reply: reply(r, `Yeh ${what} ka payment ${owner} ki approval ke liye bhej diya. Ledger abhi nahi badla.`, `यह ${amount !== null ? inrWords(amount, "hi") : ""} का payment ${owner} की approval के लिए भेज दिया। Ledger अभी नहीं बदला।`),
      navigate_path: path,
    };
  }
  return { reply: reply(r, `${amount !== null ? `${inrWords(amount, "hi")} का ` : ""}भुगतान ${owner} की मंज़ूरी के लिए भेज दिया। लेजर अभी नहीं बदला।`), navigate_path: path };
}

function oneReply(action: ResolvedAction, result: StoredResult | undefined, r: ReplyRegister, wedding_id: WeddingId | null): Built {
  if (action.command === "propose_change" || result?.outcome === "proposed") return proposedReply(action, r, wedding_id);
  const facts = factsOf(action);
  const input = action.input;
  const totals = result?.vendor_totals;
  switch (action.command) {
    case "correct_payment": {
      const path = vendorPath(wedding_id, facts);
      const outstanding = totals?.outstanding_inr ?? null;
      const amount = typeof input.amount_inr === "number" ? input.amount_inr : facts.new_amount_inr;
      if (r !== "en" && outstanding !== null) return { reply: owedLine(r, outstanding), navigate_path: path };
      const kind = facts.payment_kind ? PAYMENT_KIND_LABELS[facts.payment_kind].in_sentence : "payment";
      const who = facts.role_is_unique ? `the ${facts.role_en}'s` : `${facts.vendor_name}'s`;
      const display = `Corrected ${who} ${kind}${amount !== undefined ? ` to ${formatInr(amount)}` : ""}.${outstanding !== null ? ` ${formatInr(outstanding)} is outstanding.` : ""}`;
      return { reply: reply(r === "en" ? r : r, display, display.replace(/₹[0-9](?:[0-9,]*[0-9])?/g, (m) => inrWords(Number(m.slice(1).replace(/,/g, "")), "en"))), navigate_path: path };
    }
    case "record_payment": {
      const path = vendorPath(wedding_id, facts);
      const amount = typeof input.amount_inr === "number" ? input.amount_inr : 0;
      const outstanding = totals?.outstanding_inr ?? null;
      const committed = totals?.committed_inr ?? 0;
      const sirf = outstanding !== null && committed > 0 && outstanding < committed / 10;
      const kind = typeof input.payment_kind === "string" ? PAYMENT_KIND_LABELS[input.payment_kind as keyof typeof PAYMENT_KIND_LABELS].in_sentence : "payment";
      if (r === "en") {
        const tail = outstanding === null ? "" : outstanding === 0 ? ` ${facts.vendor_name} is paid in full.` : ` ${formatInr(outstanding)} is still owed.`;
        const display = `Saved a ${formatInr(amount)} ${kind} to ${facts.vendor_name}.${tail}`;
        return { reply: reply(r, display, display.replace(/₹[0-9](?:[0-9,]*[0-9])?/g, (m) => inrWords(Number(m.slice(1).replace(/,/g, "")), "en"))), navigate_path: path };
      }
      const who = facts.role_is_unique ? capitalize(facts.role_en ?? "") : (facts.vendor_name ?? "");
      if (r === "hinglish") {
        const tail = outstanding === null ? "" : ` Ab ${sirf ? "sirf " : ""}${formatInr(outstanding)} baaki hai.`;
        const tailDev = outstanding === null ? "" : ` अब ${sirf ? "सिर्फ़ " : ""}${inrWords(outstanding, "hi")} बाकी है।`;
        return { reply: reply(r, `${who} ko ${formatInr(amount)} ka payment save hua.${tail}`, `${who} को ${inrWords(amount, "hi")} का payment save हुआ।${tailDev}`), navigate_path: path };
      }
      const tail = outstanding === null ? "" : ` अब ${sirf ? "सिर्फ़ " : ""}${inrWords(outstanding, "hi")} बाकी हैं।`;
      return { reply: reply(r, `${facts.vendor_name} को ${inrWords(amount, "hi")} का भुगतान सेव हो गया।${tail}`), navigate_path: path };
    }
    case "update_commitment": {
      const path = vendorPath(wedding_id, facts);
      const amount = typeof input.amount_inr === "number" ? input.amount_inr : 0;
      const outstanding = totals?.outstanding_inr ?? null;
      // M-08 (4.10): the over-budget clause the preview already warned about.
      const over = typeof facts.over_budget_inr === "number" && facts.over_budget_inr > 0 ? facts.over_budget_inr : null;
      const label = facts.over_budget_label_en ?? "the category";
      const labelHi = facts.over_budget_label_hi ?? label;
      if (r === "en") {
        const owed = outstanding !== null ? ` ${formatInr(outstanding)} is still owed${over !== null ? `, and ${label} is ${formatInr(over)} over budget` : ""}.` : "";
        const display = `The agreed amount with ${facts.vendor_name} is now ${formatInr(amount)}.${owed}`;
        return { reply: reply(r, display, display.replace(/₹[0-9](?:[0-9,]*[0-9])?/g, (m) => inrWords(Number(m.slice(1).replace(/,/g, "")), "en"))), navigate_path: path };
      }
      const who = facts.role_is_unique ? capitalize(facts.role_en ?? "") : (facts.vendor_name ?? "");
      if (r === "hinglish") {
        const owed = outstanding !== null ? ` ${formatInr(outstanding)} baaki hai${over !== null ? `, aur ${label} budget se ${formatInr(over)} upar hai` : ""}.` : "";
        const owedDev = outstanding !== null ? ` ${inrWords(outstanding, "hi")} बाकी है${over !== null ? `, और ${label} budget से ${inrWords(over, "hi")} ऊपर है` : ""}।` : "";
        return {
          reply: reply(r, `${who} ka contract ${formatInr(amount)} ho gaya.${owed}`, `${who} का contract ${inrWords(amount, "hi")} हो गया।${owedDev}`),
          navigate_path: path,
        };
      }
      const owedHi = outstanding !== null ? ` ${inrWords(outstanding, "hi")} बाकी हैं${over !== null ? `, और ${labelHi} बजट से ${inrWords(over, "hi")} ऊपर है` : ""}।` : "";
      return { reply: reply(r, `${facts.vendor_name} के साथ तय रकम अब ${inrWords(amount, "hi")} है।${owedHi}`), navigate_path: path };
    }
    case "record_commitment": {
      const path = vendorPath(wedding_id, facts);
      const amount = typeof input.amount_inr === "number" ? input.amount_inr : 0;
      const outstanding = totals?.outstanding_inr ?? null;
      const display = r === "en" ? `Saved a ${formatInr(amount)} commitment with ${facts.vendor_name}.${outstanding !== null ? ` ${formatInr(outstanding)} is outstanding.` : ""}` : `${formatInr(amount)} ka contract save ho gaya.${outstanding !== null ? ` ${formatInr(outstanding)} baaki hai.` : ""}`;
      return { reply: reply(r, display, display.replace(/₹[0-9](?:[0-9,]*[0-9])?/g, (m) => inrWords(Number(m.slice(1).replace(/,/g, "")), r === "en" ? "en" : "hi"))), navigate_path: path };
    }
    case "update_event": {
      const changed = facts.changed_fields ?? [];
      const title = facts.event_title ?? "";
      const t = title.toLowerCase();
      const path = wedding_id && facts.event_id ? withHighlight(routes.events(wedding_id, facts.event_id), changed.length ? changed : ["venue"]) : null;
      if (changed.includes("venue") && facts.venue_name) {
        const v = facts.venue_name;
        if (r === "en") return { reply: reply(r, `The ${t} is at ${v} in the draft. Guests see it once it's published.`), navigate_path: path };
        if (r === "hinglish") return { reply: reply(r, `Draft mein ${t} ab ${v} mein hai. Guests ko publish ke baad dikhega.`, `Draft में ${t} अब ${v} में है। Guests को publish के बाद दिखेगा।`), navigate_path: path };
        return { reply: reply(r, `ड्राफ़्ट में ${facts.event_title_hi ?? title} अब ${v} में है। मेहमानों को पब्लिश के बाद दिखेगा।`), navigate_path: path };
      }
      const end = typeof input.end_time === "string" ? input.end_time : null;
      const start = typeof input.start_time === "string" ? input.start_time : null;
      if (end || start) {
        const time = (end ?? start) as string;
        const verbEn = end ? "now ends" : "now starts";
        // E-03 (4.10): the second sentence when the overlap goes away.
        const other = facts.clash_cleared_with ?? null;
        const otherHi = facts.clash_cleared_with_hi ?? other;
        if (r === "en") return { reply: reply(r, `The ${t} ${verbEn} at ${speakTimeEn(time)}.${other ? ` The clash with the ${other.toLowerCase()} is gone.` : ""}`), navigate_path: path };
        if (r === "hinglish") {
          return {
            reply: reply(
              r,
              `${title} ab ${clockHinglishWords(time)} ${end ? "khatam hogi" : "shuru hogi"}.${other ? ` ${other} se takraav hat gaya.` : ""}`,
              `${title} अब ${clockHi(time)} ${end ? "ख़त्म होगी" : "शुरू होगी"}।${other ? ` ${otherHi} से टकराव हट गया।` : ""}`,
            ),
            navigate_path: path,
          };
        }
        return { reply: reply(r, `${facts.event_title_hi ?? title} अब ${clockHi(time)} ${end ? "ख़त्म होगी" : "शुरू होगी"}।${other ? ` ${otherHi} से टकराव हट गया।` : ""}`), navigate_path: path };
      }
      if (r === "en") return { reply: reply(r, `Saved the ${t} in the draft. Guests see it once it's published.`), navigate_path: path };
      return { reply: reply(r, `${title} draft mein save ho gaya. Guests ko publish ke baad dikhega.`, `${title} draft में save हो गया। Guests को publish के बाद दिखेगा।`), navigate_path: path };
    }
    case "create_event": {
      const path = wedding_id ? routes.events(wedding_id) : null;
      const date = typeof input.event_date === "string" ? input.event_date : null;
      const start = typeof input.start_time === "string" ? input.start_time : null;
      const kind = String(input.event_kind ?? "");
      const name = facts.event_title ?? capitalize(kind);
      const venue = facts.venue_name ? `, ${facts.venue_name}` : "";
      if (r === "en") {
        const when = date ? ` for ${formatDate(date).replace(/^(\w+) (\d+) (\w+) \d+$/, (_m, wd: string, d: string, mo: string) => `${weekdayLong(wd)} ${d} ${monthLong(mo)}`)}` : "";
        return { reply: reply(r, `${name} added${when}${start ? ` at ${speakTimeEn(start)}` : ""}${venue}.`), navigate_path: path };
      }
      const dateText = date ? formatLongDate(date, false) : "";
      if (r === "hinglish") {
        return { reply: reply(r, `${name} ${dateText}${start ? `, ${start >= "16:00" && start < "20:00" ? "shaam" : ""} ${formatTime(start)}` : ""}${facts.venue_name ? `, ${facts.venue_name} mein` : ""} add ho gaya.`.replace(/\s+/g, " "), `${name} ${dateText}${start ? `, ${clockHi(start)}` : ""}${facts.venue_name ? `, ${facts.venue_name} में` : ""} add हो गया।`), navigate_path: path };
      }
      return { reply: reply(r, `${name} ${dateText}${start ? ` को ${clockHi(start)}` : ""}${facts.venue_name ? `, ${facts.venue_name} में` : ""} जोड़ दिया।`), navigate_path: path };
    }
    case "publish_itinerary": {
      const path = wedding_id ? routes.events(wedding_id) : null;
      const v = facts.venue_name;
      if (r === "en") return { reply: reply(r, `Published revision ${facts.revision ?? ""}.${v ? ` Guests now see ${v} for the ${(facts.event_title ?? "reception").toLowerCase()}.` : ""}`.replace("revision .", "the schedule.")), navigate_path: path };
      if (r === "hinglish") return { reply: reply(r, `Schedule publish ho gaya.${v ? ` Guests ko ab ${v} dikhega.` : ""}`, `Schedule publish हो गया।${v ? ` Guests को अब ${v} दिखेगा।` : ""}`), navigate_path: path };
      return { reply: reply(r, `कार्यक्रम प्रकाशित हो गया।${v ? ` मेहमानों को अब ${v} दिखेगा।` : ""}`), navigate_path: path };
    }
    case "request_card_export": {
      const path = wedding_id ? routes.invite(wedding_id) : null;
      const rev = facts.revision;
      // I-02 (4.10): the second sentence when a card was downloaded before.
      const older = facts.older_card === true;
      if (r === "en") {
        return { reply: reply(r, `Making the card for revision ${rev ?? ""}.${older ? " The card downloaded before is out of date." : ""}`.replace("revision .", "the latest revision.")), navigate_path: path };
      }
      if (r === "hinglish") {
        const tail = older ? " Pehle download kiya card purana hai." : "";
        const tailDev = older ? " पहले download किया card पुराना है।" : "";
        return facts.venue_name
          ? { reply: reply(r, `${facts.venue_name} wala naya card ban raha hai.${tail}`, `${facts.venue_name} वाला नया card बन रहा है।${tailDev}`), navigate_path: path }
          : { reply: reply(r, `Revision ${rev ?? ""} ka naya card ban raha hai.${tail}`, `Revision ${rev !== undefined ? countHi(rev) : ""} का नया card बन रहा है।${tailDev}`), navigate_path: path };
      }
      return { reply: reply(r, `संस्करण ${rev !== undefined ? countHi(rev) : ""} का नया कार्ड बन रहा है।${older ? " पहले डाउनलोड किया कार्ड पुराना है।" : ""}`), navigate_path: path };
    }
    case "add_requirement": {
      const path = wedding_id && facts.event_id ? withHighlight(routes.events(wedding_id, facts.event_id), ["requirements"]) : null;
      const itemText = String(input.text ?? "");
      const qty = typeof input.quantity === "number" ? input.quantity : null;
      const t = (facts.event_title ?? "").toLowerCase();
      if (r === "en") {
        const tail = facts.vendor_id ? ` It doesn't change what you owe ${facts.role_is_unique ? `the ${facts.role_en}` : facts.vendor_name}.` : "";
        return { reply: reply(r, `Added ${itemText}${qty !== null ? ` for ${qty}` : ""} at the ${t}.${tail}`), navigate_path: path };
      }
      if (r === "hinglish") {
        return { reply: reply(r, `${facts.event_title} mein ${qty !== null ? `${qty} logon ke liye ` : ""}${itemText} jod diya.`, `${facts.event_title} में ${qty !== null ? `${countHi(qty)} लोगों के लिए ` : ""}${itemText} जोड़ दिया।`), navigate_path: path };
      }
      return { reply: reply(r, `${facts.event_title_hi ?? facts.event_title} में ${qty !== null ? `${countHi(qty)} लोगों के लिए ` : ""}${facts.heard_text ?? itemText} जोड़ दिया।`), navigate_path: path };
    }
    case "set_wedding_profile": {
      const bride = String(input.bride_name ?? "");
      const groom = String(input.groom_name ?? "");
      const date = typeof input.wedding_date === "string" ? input.wedding_date : null;
      const city = typeof input.city === "string" ? `, ${input.city}` : "";
      const dateText = date ? formatLongDate(date) : "";
      if (bride && groom && date) {
        if (r === "en") return { reply: reply(r, `Saved: ${bride} and ${groom}'s wedding, ${dateText}${city}.`), navigate_path: null };
        if (r === "hinglish") return { reply: reply(r, `${bride} aur ${groom} ki shaadi, ${dateText}${city}. Save ho gayi.`, `${bride} और ${groom} की शादी, ${dateText}${city}। Save हो गई।`), navigate_path: null };
        return { reply: reply(r, `${bride} और ${groom} की शादी, ${date ? hiDate(date) : ""}${city}। सेव हो गई।`), navigate_path: null };
      }
      return { reply: reply(r, r === "en" ? "Saved the wedding details." : "Wedding details save ho gayi.", r === "en" ? undefined : "Wedding details save हो गईं।"), navigate_path: wedding_id ? routes.wedding(wedding_id) : null };
    }
    case "set_rsvp": {
      const path = wedding_id ? routes.guests(wedding_id, typeof input.event_id === "string" ? input.event_id : undefined) : null;
      return { reply: reply(r, r === "en" ? "Saved the RSVP." : "RSVP save ho gaya.", r === "en" ? undefined : "RSVP save हो गया।"), navigate_path: path };
    }
    default:
      return { reply: reply(r, r === "en" ? "Saved." : r === "hinglish" ? "Save ho gaya." : "सेव हो गया।", r === "hinglish" ? "Save हो गया।" : undefined), navigate_path: wedding_id ? routes.wedding(wedding_id) : null };
  }
}

const WEEKDAY_LONG: Record<string, string> = { Sun: "Sunday", Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday" };
const MONTH_LONG: Record<string, string> = { Jan: "January", Feb: "February", Mar: "March", Apr: "April", May: "May", Jun: "June", Jul: "July", Aug: "August", Sep: "September", Oct: "October", Nov: "November", Dec: "December" };
function weekdayLong(short: string): string {
  return WEEKDAY_LONG[short] ?? short;
}
function monthLong(short: string): string {
  return MONTH_LONG[short] ?? short;
}
function hiDate(date: string): string {
  const months = ["जनवरी", "फ़रवरी", "मार्च", "अप्रैल", "मई", "जून", "जुलाई", "अगस्त", "सितंबर", "अक्टूबर", "नवंबर", "दिसंबर"];
  const [y, m, d] = date.split("-").map(Number);
  return `${d} ${months[m - 1]} ${y}`;
}

/** M-01: a commitment and a payment saved together. */
function commitmentAndPayment(actions: ResolvedAction[], results: StoredResult[], r: ReplyRegister, wedding_id: WeddingId | null): Built | null {
  if (actions.length !== 2) return null;
  const [a, b] = actions;
  if (a.command !== "record_commitment" || b.command !== "record_payment") return null;
  const total = typeof a.input.amount_inr === "number" ? a.input.amount_inr : null;
  const paid = typeof b.input.amount_inr === "number" ? b.input.amount_inr : null;
  const outstanding = results.find((res) => res.index === b.index)?.vendor_totals?.outstanding_inr ?? null;
  if (total === null || paid === null) return null;
  const facts = factsOf(a);
  const kind = typeof b.input.payment_kind === "string" ? PAYMENT_KIND_LABELS[b.input.payment_kind as keyof typeof PAYMENT_KIND_LABELS].in_sentence : "payment";
  const path = vendorPath(wedding_id, facts);
  const category = facts.role_en === "caterer" ? "catering" : "";
  if (r === "en") {
    const display = `Saved a ${formatInr(total)}${category ? ` ${category}` : ""} commitment and a ${formatInr(paid)} ${kind}.${outstanding !== null ? ` ${formatInr(outstanding)} is outstanding.` : ""}`;
    return { reply: reply(r, display, display.replace(/₹[0-9](?:[0-9,]*[0-9])?/g, (m) => inrWords(Number(m.slice(1).replace(/,/g, "")), "en"))), navigate_path: path };
  }
  if (r === "hinglish") {
    const display = `${formatInr(total)} ka${category ? ` ${category}` : ""} contract aur ${formatInr(paid)} ka ${kind} save ho gaya.${outstanding !== null ? ` ${formatInr(outstanding)} baaki hai.` : ""}`;
    return { reply: reply(r, display, `${inrWords(total, "hi")} का${category ? ` ${category}` : ""} contract और ${inrWords(paid, "hi")} का ${kind} save हो गया।${outstanding !== null ? ` ${inrWords(outstanding, "hi")} बाकी है।` : ""}`), navigate_path: path };
  }
  return { reply: reply(r, `${inrWords(total, "hi")} का कॉन्ट्रैक्ट और ${inrWords(paid, "hi")} का एडवांस सेव हो गया।${outstanding !== null ? ` ${inrWords(outstanding, "hi")} बाकी हैं।` : ""}`), navigate_path: path };
}

const NOUN: Partial<Record<CommandName, string>> = {
  record_commitment: "commitment",
  update_commitment: "agreed amount",
  record_payment: "payment",
  correct_payment: "correction",
  create_event: "function",
  update_event: "change",
  add_requirement: "requirement",
  add_vendor: "vendor",
  add_guest: "guest",
  set_rsvp: "RSVP",
  set_dietary: "dietary note",
  update_invite_style: "invite style",
};

export async function confirmedReply(input: ConfirmedReplyInput): Promise<Built> {
  const r = input.register;
  const writes = input.actions.filter(isWrite);
  if (input.partial) {
    const failed = writes.find((a) => a.index === input.partial?.failed_index);
    const savedActions = writes.filter((a) => input.results.some((res) => res.index === a.index && res.outcome !== "failed" && !res.error_code));
    const savedNoun = savedActions.map((a) => NOUN[innerOf(a).command] ?? "change").join(" and ") || "change";
    const failedNoun = failed ? (failed.kind === "record_payment" ? PAYMENT_KIND_LABELS[(innerOf(failed).input.payment_kind as keyof typeof PAYMENT_KIND_LABELS) ?? "advance"]?.in_sentence ?? "payment" : (NOUN[innerOf(failed).command] ?? "change")) : "rest";
    const first = savedActions[0];
    const path = first ? oneReply(first, input.results.find((res) => res.index === first.index), r, input.wedding_id).navigate_path : null;
    const display = r === "en"
      ? `Saved the ${savedNoun}, but not the ${failedNoun}: ${input.partial.reason}. You can add it on the form.`
      : `${capitalize(savedNoun)} save ho gaya, par ${failedNoun} nahi: ${input.partial.reason}. Form par add kar sakte hain.`;
    return { reply: { display_text: display, speech_text: r === "en" ? display : `${capitalize(savedNoun)} save हो गया, पर ${failedNoun} नहीं। Form पर add कर सकते हैं।`, language: r }, navigate_path: path };
  }
  if (writes.length === 0) return { reply: reply(r, r === "en" ? "Saved." : "Save ho gaya.", r === "en" ? undefined : "Save हो गया।"), navigate_path: null };
  const combo = commitmentAndPayment(writes, input.results, r, input.wedding_id);
  if (combo) return combo;
  const built = writes.map((action) => oneReply(action, input.results.find((res) => res.index === action.index), r, input.wedding_id));
  if (built.length === 1) return built[0];
  return { reply: joinReplies(r, built.slice(0, 2).map((b) => firstSentenceOf(b.reply))), navigate_path: built.find((b) => b.navigate_path)?.navigate_path ?? null };
}
