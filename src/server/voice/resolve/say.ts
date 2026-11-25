import "server-only";

import type { ReplyRegister } from "@/contracts/api";
import { formatInr, hindiNumberWords, inrToEnglishWords, inrToHindiWords } from "@/contracts/money";

import type { ReplyText } from "../types";

/**
 * Speech helpers (3.5). Amounts in speech are words built in code, never डेढ़, ढाई, सवा,
 * साढ़े or पौने: the words come from money.ts's Indian split, which never produces them.
 */

export function inrWords(amount_inr: number, lang: "hi" | "en"): string {
  return lang === "hi" ? inrToHindiWords(amount_inr) : inrToEnglishWords(amount_inr);
}

export function countHi(n: number): string {
  return hindiNumberWords(n);
}

const HINGLISH_COUNTS = ["", "ek", "do", "teen", "char", "paanch", "chhah", "saat", "aath", "nau", "das", "gyarah", "barah"];

/** Small counts as Latin Hindi words for a Hinglish display ("teen badlav"). */
export function countHinglish(n: number): string {
  return HINGLISH_COUNTS[n] ?? String(n);
}

/** Hinglish clock words in Latin for a reply line (4.10): "shaam saat baje", "shaam saade paanch baje". */
export function clockHinglishWords(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const daypart = h < 12 ? "subah" : h < 16 ? "dopahar" : h < 20 ? "shaam" : "raat";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  if (m === 0) return `${daypart} ${countHinglish(hour12)} baje`;
  if (m === 30) return `${daypart} saade ${countHinglish(hour12)} baje`;
  if (m === 15) return `${daypart} sawa ${countHinglish(hour12)} baje`;
  if (m === 45) return `${daypart} paune ${countHinglish(hour12 === 12 ? 1 : hour12 + 1)} baje`;
  return clockHinglish(time);
}

/** A ₹ figure: grouped digits only, so a comma after the figure stays in the sentence. */
export const RUPEE_FIGURE_SOURCE = "₹([0-9](?:[0-9,]*[0-9])?)";
const RUPEE_FIGURE = new RegExp(RUPEE_FIGURE_SOURCE, "g");

/** Replaces every ₹ figure in a display text with its words, for speech. */
export function speakAmounts(text: string, lang: "hi" | "en"): string {
  return text.replace(RUPEE_FIGURE, (_m, digits: string) => inrWords(Number(digits.replace(/,/g, "")), lang));
}

/** A reply whose speech is the display with ₹ figures in words (hi words for hi and hinglish). */
export function spoken(register: ReplyRegister, display: string, speechBase?: string): ReplyText {
  const base = speechBase ?? display;
  return { display_text: display, speech_text: speakAmounts(base, register === "en" ? "en" : "hi"), language: register };
}

export { formatInr };

/** The Hindi daypart word and 12-hour clock words for an HH:MM time (3.5): "शाम सात बजे", "शाम साढ़े पाँच बजे". */
export function clockHi(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const daypart = h < 12 ? "सुबह" : h < 16 ? "दोपहर" : h < 20 ? "शाम" : "रात";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  const hourWord = countHi(hour12);
  if (m === 0) return `${daypart} ${hourWord} बजे`;
  if (m === 30) return `${daypart} साढ़े ${hourWord} बजे`;
  if (m === 15) return `${daypart} सवा ${hourWord} बजे`;
  if (m === 45) return `${daypart} पौने ${countHi(hour12 === 12 ? 1 : hour12 + 1)} बजे`;
  return `${daypart} ${hourWord} बजकर ${countHi(m)} मिनट`;
}

/** Hinglish clock words in Latin: "shaam 7 baje", "shaam saade paanch baje". */
export function clockHinglish(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const daypart = h < 12 ? "subah" : h < 16 ? "dopahar" : h < 20 ? "shaam" : "raat";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  if (m === 0) return `${daypart} ${hour12} baje`;
  if (m === 30) return `${daypart} ${hour12}:30 baje`;
  return `${daypart} ${hour12}:${String(m).padStart(2, "0")} baje`;
}
