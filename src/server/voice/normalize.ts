import "server-only";

import type { ReplyRegister } from "@/contracts/api";

/**
 * Normalising for matching (voice.md 1.6), never for display: Unicode NFC, the nukta
 * removed, chandrabindu read as anusvara, Latin lowercased, punctuation (the danda and
 * the commas inside numbers included) removed, spaces collapsed. Phrase checks (3.1),
 * confirm and cancel phrases (1.8) and alias matching (2.5) all use this form.
 *
 * Two small additions keep numbers readable after normalising, and apply to both sides
 * of every comparison alike: Devanagari digits become Latin digits, and a `.`, `:`, `/`
 * or `-` between two digits stays ("1.5", "7:30", "13/12", "2026-12-13"). The ₹ sign
 * stays as a word of its own ("₹1.5L" → "₹ 1.5l").
 */

const NUKTA = /\u093C/g;
const CHANDRABINDU = /\u0901/g;
const ANUSVARA = "\u0902";
const ZERO_WIDTH = /[\u200B-\u200D\u2060\uFEFF]/g;
const DEVANAGARI_DIGIT = /[\u0966-\u096F]/g;

/** Turns Devanagari digits (० to ९) into Latin digits. */
export function latinDigits(text: string): string {
  return text.replace(DEVANAGARI_DIGIT, (d) => String(d.charCodeAt(0) - 0x0966));
}

const PROTECTED: Record<string, string> = { ".": "\uE000", ":": "\uE001", "/": "\uE002", "-": "\uE003" };
const UNPROTECT: Record<string, string> = { "\uE000": ".", "\uE001": ":", "\uE002": "/", "\uE003": "-" };

export function normalizeForMatch(text: string): string {
  let s = text.normalize("NFC");
  // NFC decomposes the precomposed nukta letters (क़ U+0958 … य़ U+095F) into base + nukta.
  s = s.replace(NUKTA, "").replace(CHANDRABINDU, ANUSVARA).replace(ZERO_WIDTH, "");
  s = latinDigits(s).toLowerCase();
  // Commas inside numbers go: "40,000" → "40000", "1,50,000" → "150000".
  s = s.replace(/(\d)[,\uFF0C](?=\d)/g, "$1");
  // A . : / or - between two digits stays part of the number ("1.5", "7:30", "13/12").
  s = s.replace(/(\d)([.:/-])(?=\d)/g, (_m, d: string, p: string) => d + PROTECTED[p]);
  // Apostrophes join ("who's" → "whos"); the ₹ sign becomes a word of its own.
  s = s.replace(/['\u2019\u2018`\u00B4]/g, "").replace(/₹/g, " ₹ ");
  // Everything else that isn't a letter, a mark or a digit is a space (the danda included).
  s = s.replace(/[^\p{L}\p{M}\p{N}₹\uE000-\uE003]+/gu, " ");
  s = s.replace(/[\uE000-\uE003]/g, (c) => UNPROTECT[c]);
  return s.replace(/\s+/g, " ").trim();
}

/** True when the text holds a Devanagari letter or sign (digits and dandas don't count). */
export function hasDevanagariLetter(text: string): boolean {
  return /[\u0900-\u0963\u0971-\u097F]/.test(text);
}

/**
 * The word counts behind the language chip (1.6): D = words that contain Devanagari
 * letters, L = words in Latin letters only. Digits and the ₹ sign are ignored, so "40000"
 * and "₹" are not words; "₹1.5L" counts as one Latin word ("L").
 */
export function scriptCounts(transcript: string): { devanagari: number; latin: number } {
  let devanagari = 0;
  let latin = 0;
  const words = transcript.normalize("NFC").split(/\s+/);
  for (const raw of words) {
    // Drop digits (both scripts), ₹, punctuation and symbols; what is left is the word's letters.
    const word = raw.replace(/[\p{N}₹]/gu, "").replace(/[^\p{L}\p{M}]/gu, "");
    if (word.length === 0) continue;
    if (hasDevanagariLetter(word)) devanagari += 1;
    else if (/^[A-Za-z\u00C0-\u024F]+$/.test(word)) latin += 1;
  }
  return { devanagari, latin };
}

/**
 * The reply register from the transcript's script (1.6), never from Saaras's
 * `language_code`:
 * - D is 0: `en`, unless the model's `reply_language` is `hinglish` or `hi`, then `hinglish`;
 * - L is 0 (Devanagari only): `hi`;
 * - both, the model says `en` and D is 1 (one stray loanword): `en`;
 * - both, otherwise: `hinglish`.
 */
export function registerFor(transcript: string, model_reply_language: ReplyRegister | null): ReplyRegister {
  const { devanagari: d, latin: l } = scriptCounts(transcript);
  if (d === 0) {
    return model_reply_language === "hinglish" || model_reply_language === "hi" ? "hinglish" : "en";
  }
  if (l === 0) return "hi";
  if (model_reply_language === "en" && d === 1) return "en";
  return "hinglish";
}

/** The chip label for a register (1.6): English, Hinglish or हिंदी. */
export function chipLabel(register: ReplyRegister): string {
  return register === "en" ? "English" : register === "hi" ? "हिंदी" : "Hinglish";
}
