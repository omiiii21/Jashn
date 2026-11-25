import "server-only";

import {
  HINDI_NUMBER_WORDS,
  englishNumberWords,
  hindiNumberWords,
  inrToEnglishWords,
  inrToHindiWords,
} from "@/contracts/money";

import { hasDevanagariLetter } from "./normalize";
import type { ReplySpeech, ReplyText } from "./types";

/**
 * Saying numbers, dates and times (voice.md 3.5) and the speech parts and voice of a
 * spoken reply (1.14). Every amount in speech is words built here, never डेढ़, ढाई, सवा,
 * साढ़े or पौने (M7); हज़ार keeps its nukta and पाँच its chandrabindu, as demo-data §14.
 */

/**
 * The two Bulbul voices (1.14), chosen from the speech text's script. The audition may
 * swap either; this is the one constant to change (decision D78).
 */
export const BULBUL_VOICES = {
  hi: { language_code: "hi-IN", speaker: "simran_enhi_customer" },
  en: { language_code: "en-IN", speaker: "simran_en_customer" },
} as const;

/** The Bulbul model, always sent: omitting it routes to v3, which rejects v4 voices (1.14). */
export const BULBUL_MODEL = "bulbul:v4-flash";

/** At most 140 characters per speech part (1.14, 4.8). */
export const SPEECH_PART_MAX = 140;

/** An amount in words: "एक लाख साठ हज़ार रुपये" · "one lakh sixty thousand rupees". */
export function amountWords(inr: number, lang: "hi" | "en"): string {
  return lang === "hi" ? inrToHindiWords(inr) : inrToEnglishWords(inr);
}

/** A count in words, without रुपये: 229 → "दो सौ उनतीस" · "two hundred twenty-nine". */
export function countWords(n: number, lang: "hi" | "en"): string {
  return lang === "hi" ? hindiNumberWords(n) : englishNumberWords(n);
}

const HINDI_MONTHS = ["", "जनवरी", "फ़रवरी", "मार्च", "अप्रैल", "मई", "जून", "जुलाई", "अगस्त", "सितंबर", "अक्टूबर", "नवंबर", "दिसंबर"];
const ENGLISH_MONTHS = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const HINDI_WEEKDAYS = ["रविवार", "सोमवार", "मंगलवार", "बुधवार", "गुरुवार", "शुक्रवार", "शनिवार"];
const ENGLISH_WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * A date for speech (3.5): hi "तेरह दिसंबर", hinglish "तेरह December", en "13 December".
 * `with_year` adds the year ("दो हज़ार छब्बीस" in Hindi); `with_weekday` puts the day first.
 */
export function dateSpeech(
  date: string,
  register: "hi" | "hinglish" | "en",
  opts: { with_year?: boolean; with_weekday?: boolean } = {},
): string {
  const [y, m, d] = date.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const parts: string[] = [];
  if (register === "en") {
    if (opts.with_weekday) parts.push(ENGLISH_WEEKDAYS[weekday]);
    parts.push(String(d), ENGLISH_MONTHS[m]);
    if (opts.with_year) parts.push(String(y));
  } else {
    if (opts.with_weekday) parts.push(HINDI_WEEKDAYS[weekday]);
    parts.push(hindiNumberWords(d), register === "hi" ? HINDI_MONTHS[m] : ENGLISH_MONTHS[m]);
    if (opts.with_year) parts.push(hindiNumberWords(y));
  }
  return parts.join(" ");
}

function hindiDaypart(hour24: number): string {
  if (hour24 >= 4 && hour24 < 12) return "सुबह";
  if (hour24 >= 12 && hour24 < 16) return "दोपहर";
  if (hour24 >= 16 && hour24 < 20) return "शाम";
  return "रात";
}

/**
 * A clock time for speech (3.5): hi and hinglish use clock words, where fractions are fine
 * ("शाम सात बजे", "शाम साढ़े पाँच बजे", "सुबह साढ़े नौ बजे"); en gives "7 PM", "5:30 PM".
 */
export function timeSpeech(time: string, register: "hi" | "hinglish" | "en"): string {
  const [h, m] = time.split(":").map(Number);
  if (register === "en") {
    const suffix = h < 12 ? "AM" : "PM";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return m === 0 ? `${h12} ${suffix}` : `${h12}:${m < 10 ? `0${m}` : m} ${suffix}`;
  }
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const next12 = (h12 % 12) + 1;
  const daypart = hindiDaypart(h);
  let clock: string;
  if (m === 0) clock = `${HINDI_NUMBER_WORDS[h12]} बजे`;
  else if (m === 30) clock = h12 === 1 ? "डेढ़ बजे" : h12 === 2 ? "ढाई बजे" : `साढ़े ${HINDI_NUMBER_WORDS[h12]} बजे`;
  else if (m === 15) clock = `सवा ${HINDI_NUMBER_WORDS[h12]} बजे`;
  else if (m === 45) clock = `पौने ${HINDI_NUMBER_WORDS[next12]} बजे`;
  else clock = `${HINDI_NUMBER_WORDS[h12]} बजकर ${HINDI_NUMBER_WORDS[m]} मिनट`;
  return `${daypart} ${clock}`;
}

/** Splits at a long part's last comma or space before `max`, so no part passes it. */
function hardSplit(sentence: string, max: number): string[] {
  const out: string[] = [];
  let rest = sentence.trim();
  while (rest.length > max) {
    const window = rest.slice(0, max + 1);
    let cut = Math.max(window.lastIndexOf(", "), window.lastIndexOf("، "));
    if (cut > 0) cut += 1;
    else cut = window.lastIndexOf(" ");
    if (cut <= 0) cut = max;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest.length > 0) out.push(rest);
  return out;
}

/**
 * The speech parts of a reply (1.14): split at sentence ends (। . ?), then sentences are
 * packed into parts of at most `max` characters, so most replies are one part. A sentence
 * longer than `max` is cut at a comma or a space. A full stop inside a number ("1.5") or
 * before a non-space is not a sentence end.
 */
export function splitSpeechParts(text: string, max: number = SPEECH_PART_MAX): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length === 0) return [];
  const sentences = clean
    .split(/(?<=[।?!])\s*|(?<=\.)\s+/u)
    .map((s) => s.trim())
    .filter(Boolean);
  const parts: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    const pieces = sentence.length > max ? hardSplit(sentence, max) : [sentence];
    for (const piece of pieces) {
      const joined = current ? `${current} ${piece}` : piece;
      if (joined.length <= max) current = joined;
      else {
        if (current) parts.push(current);
        current = piece;
      }
    }
  }
  if (current) parts.push(current);
  return parts;
}

/** The voice from the speech text's script (1.14): Devanagari → hi-IN, Latin only → en-IN. */
export function voiceForSpeech(text: string): { language_code: "hi-IN" | "en-IN"; speaker: string } {
  const voice = hasDevanagariLetter(text) ? BULBUL_VOICES.hi : BULBUL_VOICES.en;
  return { language_code: voice.language_code, speaker: voice.speaker };
}

/** What voice_turns.reply_speech stores for a reply; null when the reply is never spoken. */
export function speechFor(reply: ReplyText): ReplySpeech | null {
  if (reply.speech_text === null) return null;
  const parts = splitSpeechParts(reply.speech_text);
  if (parts.length === 0) return null;
  return { parts, ...voiceForSpeech(reply.speech_text) };
}
