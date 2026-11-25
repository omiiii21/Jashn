import "server-only";

import type { IsoDate } from "@/contracts/domain";
import { HINDI_NUMBER_WORDS } from "@/contracts/money";

import { latinDigits, normalizeForMatch } from "./normalize";

/**
 * Phrase-first re-reading (voice.md 3.1 to 3.4): code reads every amount, count, date and
 * time from the words the model says it heard, and compares its reading with the model's
 * value. Nothing here trusts the model; everything is plain table-driven code.
 */

// ---------------------------------------------------------------------------
// Word tables (3.2)
// ---------------------------------------------------------------------------

/**
 * Latin words are matched after folding long vowels (aa → a, ee → i, oo → u), w to v,
 * doubled letters to one, chh to ch and a final "ah" to "a", so chaalis, chalis and
 * chaalees are one word, and baarah, barah and bara too.
 */
export function foldLatin(word: string): string {
  return word
    .replace(/a{2,}/g, "a")
    .replace(/e{2,}/g, "i")
    .replace(/o{2,}/g, "u")
    .replace(/w/g, "v")
    .replace(/([a-z])\1+/g, "$1")
    .replace(/chh/g, "ch")
    .replace(/ah$/, "a");
}

/** 3.2's Latin column, index = number (1 to 99). */
const HINDI_LATIN_WORDS: readonly string[] = [
  "", "ek", "do", "teen", "chaar", "paanch", "chhah", "saat", "aath", "nau",
  "das", "gyaarah", "baarah", "terah", "chaudah", "pandrah", "solah", "satrah", "athaarah", "unnees",
  "bees", "ikkees", "baaees", "teyees", "chaubees", "pachchees", "chhabbees", "sattaees", "atthaees", "untees",
  "tees", "iktees", "battees", "taintees", "chauntees", "paintees", "chhattees", "saintees", "adtees", "untaalees",
  "chaalees", "iktaalees", "bayaalees", "taintaalees", "chavaalees", "paintaalees", "chhiyaalees", "saintaalees", "adtaalees", "unchaas",
  "pachaas", "ikyaavan", "baavan", "tirepan", "chauvan", "pachpan", "chhappan", "sattaavan", "atthaavan", "unsath",
  "saath", "iksath", "baasath", "tirsath", "chaunsath", "painsath", "chhiyaasath", "sadsath", "adsath", "unhattar",
  "sattar", "ikhattar", "bahattar", "tihattar", "chauhattar", "pachhattar", "chhihattar", "sathattar", "athhattar", "unyaasi",
  "assi", "ikyaasi", "bayaasi", "tiraasi", "chauraasi", "pachaasi", "chhiyaasi", "sattaasi", "atthaasi", "navaasi",
  "nabbe", "ikyaanve", "baanve", "tiraanve", "chauraanve", "pachaanve", "chhiyaanve", "sattaanve", "atthaanve", "ninyaanve",
];

/** "Also accepted" (3.2), plus common spellings of the same words. */
const EXTRA_NUMBER_WORDS: ReadonlyArray<[string, number]> = [
  ["छः", 6], ["छह", 6], ["chhe", 6], ["che", 6], ["chhey", 6], ["cheh", 6],
  ["पचीस", 25], ["pachees", 25], ["pachis", 25],
  ["उनासी", 79], ["चौवालीस", 44], ["तिरपन", 53],
  ["tin", 3], ["char", 4], ["gyara", 11], ["chaudha", 14], ["unis", 19], ["bais", 22], ["teis", 23], ["chobis", 24],
  ["chalis", 40], ["chaalis", 40], ["pachas", 50], ["ikyavan", 51], ["ikyaawan", 51], ["ekyavan", 51],
  ["sath", 60], ["satar", 70], ["asi", 80], ["nabe", 90],
];

const ENGLISH_ONES: readonly string[] = [
  "", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen",
];
const ENGLISH_TENS: readonly string[] = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

type NumWord = { v: number; src: "hi" | "en"; tens: boolean };

const DEVANAGARI_NUMBERS = new Map<string, number>();
const LATIN_NUMBERS = new Map<string, NumWord>();

function addLatin(word: string, entry: NumWord): void {
  const key = foldLatin(normalizeForMatch(word));
  if (!LATIN_NUMBERS.has(key)) LATIN_NUMBERS.set(key, entry);
}

for (let n = 1; n <= 99; n += 1) {
  DEVANAGARI_NUMBERS.set(normalizeForMatch(HINDI_NUMBER_WORDS[n]), n);
}
for (let n = 1; n < 20; n += 1) addLatin(ENGLISH_ONES[n], { v: n, src: "en", tens: false });
for (let t = 2; t <= 9; t += 1) addLatin(ENGLISH_TENS[t], { v: t * 10, src: "en", tens: true });
addLatin("fourty", { v: 40, src: "en", tens: true });
for (let n = 1; n <= 99; n += 1) addLatin(HINDI_LATIN_WORDS[n], { v: n, src: "hi", tens: false });
for (const [word, n] of EXTRA_NUMBER_WORDS) {
  if (/[ऀ-ॿ]/.test(word)) DEVANAGARI_NUMBERS.set(normalizeForMatch(word), n);
  else addLatin(word, { v: n, src: "hi", tens: false });
}

/** Scale words (3.2). */
const SCALES = new Map<string, number>();
for (const [words, value] of [
  [["सौ", "sau", "hundred", "so"], 100],
  [["हज़ार", "हजार", "hazaar", "hazar", "hajar", "hajaar", "hazzar", "thousand", "k"], 1_000],
  [["लाख", "lakh", "lac", "laakh", "lakhs", "lacs", "lakhs", "l"], 100_000],
  [["million"], 1_000_000],
  [["करोड़", "करोड", "crore", "crores", "karod", "karor", "karore", "cr"], 10_000_000],
] as Array<[string[], number]>) {
  for (const w of words) {
    const n = normalizeForMatch(w);
    SCALES.set(/[ऀ-ॿ]/.test(n) ? n : foldLatin(n), value);
  }
}
// "so" is too common a word to be a scale in Latin text; keep "sau" only.
SCALES.delete("so");

type Fraction = "dedh" | "dhai" | "sava" | "saade" | "paune";
const FRACTIONS = new Map<string, Fraction>();
for (const [words, f] of [
  [["डेढ़", "डेढ", "dedh", "derh", "dhedh", "dedha"], "dedh"],
  [["ढाई", "अढ़ाई", "अढाई", "dhai", "adhai", "arhai", "dhaai", "dhaee", "dhaayi"], "dhai"],
  [["सवा", "sava", "savva", "sawa"], "sava"],
  [["साढ़े", "साढे", "saade", "sade", "sadhe", "saadhe", "saarhe"], "saade"],
  [["पौने", "paune", "pone", "paune", "paunay"], "paune"],
] as Array<[string[], Fraction]>) {
  for (const w of words) {
    const n = normalizeForMatch(w);
    FRACTIONS.set(/[ऀ-ॿ]/.test(n) ? n : foldLatin(n), f);
  }
}

function keySet(words: string[]): Set<string> {
  const out = new Set<string>();
  for (const w of words) {
    const n = normalizeForMatch(w);
    out.add(n);
    if (!/[ऀ-ॿ]/.test(n)) out.add(foldLatin(n));
  }
  return out;
}

/** Ignored words (3.2): currency, units, approximations, and only, sirf, total, kul. */
const IGNORED_AMOUNT_WORDS = keySet([
  "₹", "rs", "inr", "rupaye", "rupaiye", "rupees", "rupee", "rupaya", "rupiya", "rupay", "rupye", "रुपये", "रुपए", "रुपया", "रुपयों", "रु",
  "people", "persons", "person", "guests", "guest", "log", "logon", "logo", "लोग", "लोगों",
  "plates", "plate", "covers", "cover", "per", "head", "heads",
  "about", "around", "roughly", "approx", "approximately", "lagbhag", "लगभग", "kareeb", "karib", "क़रीब", "करीब", "करीबन", "takreeban", "takriban",
  "only", "sirf", "सिर्फ़", "सिर्फ", "total", "kul", "कुल",
]);

/** Postpositions dropped at the edges of a heard phrase ("₹50,000 ka", "barah logon ke liye"). */
const EDGE_WORDS = keySet(["ka", "ki", "ke", "ko", "का", "की", "के", "को", "for", "liye", "लिए", "ke", "se", "से"]);

const NEG_HI = keySet(["नहीं", "nahin", "nahi", "nai", "नही", "nahee"]);
const NEG_NO = keySet(["no", "nope"]);
const NEG_NOT = keySet(["not"]);
const BOUNDARY_WORDS = keySet(["but", "balki", "बल्कि", "lekin", "लेकिन", "par", "पर"]);

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

type Tok =
  | { t: "num"; v: number; src: "digits" | "hi" | "en"; tens: boolean; decimal: boolean; raw: string }
  | { t: "scale"; v: number; raw: string }
  | { t: "frac"; f: Fraction; raw: string }
  | { t: "a" | "half" | "quarter" | "and" | "of" | "ignored" | "sep" | "boundary" | "edge"; raw: string }
  | { t: "neg"; n: "hi" | "no" | "not"; raw: string }
  | { t: "word"; raw: string };

function isDevanagari(word: string): boolean {
  return /[ऀ-ॿ]/.test(word);
}

/** Splits a normalised clause into words, with digits and letters apart: "40k" → 40, k. */
function wordsOf(text: string): string[] {
  return normalizeForMatch(text)
    .replace(/(\d)(\p{L})/gu, "$1 $2")
    .replace(/(\p{L}|\p{M})(\d)/gu, "$1 $2")
    .split(" ")
    .filter(Boolean);
}

function classify(word: string): Tok {
  if (/^\d+(\.\d+)?$/.test(word)) {
    return { t: "num", v: Number(word), src: "digits", tens: false, decimal: word.includes("."), raw: word };
  }
  const folded = isDevanagari(word) ? word : foldLatin(word);
  if (IGNORED_AMOUNT_WORDS.has(word) || IGNORED_AMOUNT_WORDS.has(folded)) return { t: "ignored", raw: word };
  if (NEG_HI.has(word) || NEG_HI.has(folded)) return { t: "neg", n: "hi", raw: word };
  if (word === "no" || NEG_NO.has(word)) return { t: "neg", n: "no", raw: word };
  if (NEG_NOT.has(word)) return { t: "neg", n: "not", raw: word };
  if (word === "a" || word === "an") return { t: "a", raw: word };
  if (word === "half") return { t: "half", raw: word };
  if (word === "quarter") return { t: "quarter", raw: word };
  if (word === "and") return { t: "and", raw: word };
  if (word === "of") return { t: "of", raw: word };
  if (BOUNDARY_WORDS.has(word) || BOUNDARY_WORDS.has(folded)) return { t: "boundary", raw: word };
  if (isDevanagari(word)) {
    const n = DEVANAGARI_NUMBERS.get(word);
    if (n !== undefined) return { t: "num", v: n, src: "hi", tens: false, decimal: false, raw: word };
    const s = SCALES.get(word);
    if (s !== undefined) return { t: "scale", v: s, raw: word };
    const f = FRACTIONS.get(word);
    if (f !== undefined) return { t: "frac", f, raw: word };
  } else {
    const s = SCALES.get(folded) ?? SCALES.get(word);
    if (s !== undefined) return { t: "scale", v: s, raw: word };
    const n = LATIN_NUMBERS.get(folded);
    if (n !== undefined) return { t: "num", v: n.v, src: n.src, tens: n.tens, decimal: false, raw: word };
    const f = FRACTIONS.get(folded);
    if (f !== undefined) return { t: "frac", f, raw: word };
  }
  if (EDGE_WORDS.has(word) || EDGE_WORDS.has(folded)) return { t: "edge", raw: word };
  return { t: "word", raw: word };
}

/** A grouping that is neither Indian (1,50,000) nor Western (150,000) makes the value uncertain (3.2). */
export function hasValidDigitGrouping(phrase: string): boolean {
  const groups = latinDigits(phrase).match(/\d+(?:,\d+)+/g) ?? [];
  return groups.every((g) => /^\d{1,2}(,\d{2})*,\d{3}$/.test(g) || /^\d{1,3}(,\d{3})+$/.test(g));
}

/** Tokens of a phrase, with clause breaks (commas, dandas, full stops) kept as `sep`. */
function lex(phrase: string): Tok[] {
  const raw = latinDigits(phrase.normalize("NFC")).replace(/(\d)[,，](?=\d)/g, "$1");
  const clauses = raw.split(/[,;!?।॥|，]|\.(?!\d)|(?<!\d)\./);
  const out: Tok[] = [];
  clauses.forEach((clause, i) => {
    if (i > 0) out.push({ t: "sep", raw: "," });
    for (const w of wordsOf(clause)) out.push(classify(w));
  });
  return out;
}

/** Drops postpositions and clause breaks at the edges of a heard phrase. */
function stripEdges(toks: Tok[]): Tok[] {
  let s = 0;
  let e = toks.length;
  while (s < e && (toks[s].t === "edge" || toks[s].t === "sep")) s += 1;
  while (e > s && (toks[e - 1].t === "edge" || toks[e - 1].t === "sep")) e -= 1;
  return toks.slice(s, e);
}

// ---------------------------------------------------------------------------
// Reading an amount or a count (3.2's "How code reads a phrase")
// ---------------------------------------------------------------------------

type Item =
  | { k: "count"; v: number; needsScale: boolean }
  | { k: "scale"; v: number }
  | { k: "frac"; f: Fraction };

type Parsed = {
  value: number;
  /** Rule 5: a bare count right after a lakh or crore group. */
  ambiguous: boolean;
  /** The reading with the next scale down ("do lakh pachaas" → 2,50,000). */
  suggestion: number | null;
  /** The largest scale word in the phrase (1 when there is none). */
  top_scale: number;
};

function toItems(toks: Tok[]): Item[] | null {
  const items: Item[] = [];
  for (let i = 0; i < toks.length; i += 1) {
    const tok = toks[i];
    const next = toks[i + 1];
    switch (tok.t) {
      case "ignored":
      case "sep":
      case "and":
        break;
      case "num": {
        let v = tok.v;
        let needsScale = tok.decimal;
        if (tok.tens && next?.t === "num" && next.src === "en" && next.v >= 1 && next.v <= 9) {
          v += next.v;
          i += 1;
        }
        if (toks[i + 1]?.t === "and" && toks[i + 2]?.t === "a" && toks[i + 3]?.t === "half") {
          v += 0.5;
          needsScale = true;
          i += 3;
        }
        items.push({ k: "count", v, needsScale });
        break;
      }
      case "a":
        if (next?.t === "half") {
          items.push({ k: "count", v: 0.5, needsScale: true });
          i += 1;
        } else if (next?.t === "quarter") {
          items.push({ k: "count", v: 0.25, needsScale: true });
          i += 1;
          if (toks[i + 1]?.t === "of") i += 1;
          if (toks[i + 1]?.t === "a") i += 1;
        } else if (next?.t === "scale") {
          items.push({ k: "count", v: 1, needsScale: false });
        } else if (next?.t === "num" && i === 0) {
          // "a fifty-thousand advance": the article before a number says nothing.
          break;
        } else {
          return null;
        }
        break;
      case "half":
        items.push({ k: "count", v: 0.5, needsScale: true });
        if (next?.t === "a") i += 1;
        break;
      case "quarter":
        items.push({ k: "count", v: 0.25, needsScale: true });
        if (toks[i + 1]?.t === "of") i += 1;
        if (toks[i + 1]?.t === "a") i += 1;
        break;
      case "scale":
        items.push({ k: "scale", v: tok.v });
        break;
      case "frac":
        items.push({ k: "frac", f: tok.f });
        break;
      default:
        return null;
    }
  }
  return items;
}

type Group = { frac: Fraction | null; count: { v: number; needsScale: boolean } | null; scale: number | null };

function groupBase(g: Group): number | null {
  const count = g.count;
  if (g.frac) {
    if (g.scale === null) return null;
    if (count && count.needsScale) return null;
    switch (g.frac) {
      case "dedh":
        return count ? null : 1.5;
      case "dhai":
        return count ? null : 2.5;
      case "sava":
        return (count?.v ?? 1) + 0.25;
      case "saade":
        return count && count.v >= 3 ? count.v + 0.5 : null;
      case "paune":
        return (count?.v ?? 1) - 0.25;
    }
  }
  if (count) {
    if (count.needsScale && g.scale === null) return null;
    return count.v;
  }
  return 1;
}

function parseTokens(toks: Tok[]): Parsed | null {
  const items = toItems(toks);
  if (!items || items.length === 0) return null;
  const groups: Group[] = [];
  let j = 0;
  while (j < items.length) {
    const g: Group = { frac: null, count: null, scale: null };
    const start = j;
    const a = items[j];
    if (a?.k === "frac") {
      g.frac = a.f;
      j += 1;
    }
    const b = items[j];
    if (b?.k === "count") {
      g.count = { v: b.v, needsScale: b.needsScale };
      j += 1;
    }
    const c = items[j];
    if (c?.k === "scale") {
      g.scale = c.v;
      j += 1;
    }
    if (j === start) return null;
    groups.push(g);
  }

  let total = 0;
  let chunk = 0;
  let chunkHundred = false;
  let chunkBare = false;
  let lastBig = Number.POSITIVE_INFINITY;
  let topScale = 1;
  let ambiguous = false;
  let suggestion: number | null = null;

  for (let idx = 0; idx < groups.length; idx += 1) {
    const g = groups[idx];
    const base = groupBase(g);
    if (base === null) return null;
    const scale = g.scale ?? 1;
    topScale = Math.max(topScale, scale);
    if (scale >= 1000) {
      if (scale >= lastBig) return null;
      let mult: number;
      if (chunk > 0) {
        // English nesting: "two hundred fifty thousand" is (200 + 50) × 1,000.
        if (!chunkHundred || g.frac) return null;
        mult = chunk + (g.count ? base : 0);
      } else {
        mult = base;
      }
      const value = mult * scale;
      if (total > 0 && value >= lastBig) return null;
      total += value;
      chunk = 0;
      chunkHundred = false;
      chunkBare = false;
      lastBig = scale;
    } else if (scale === 100) {
      if (chunkHundred || chunkBare) return null;
      chunk = base * 100;
      chunkHundred = true;
    } else {
      if (chunkBare) return null;
      if (!Number.isInteger(base)) return null;
      chunk += base;
      chunkBare = true;
      const prev = groups[idx - 1];
      if (!chunkHundred && prev && (prev.scale === 100_000 || prev.scale === 10_000_000) && idx === groups.length - 1) {
        ambiguous = true;
        const down = prev.scale === 100_000 ? 1_000 : 100_000;
        const s = total + base * down;
        suggestion = base * down < prev.scale ? s : null;
      }
    }
  }
  if (Number.isFinite(lastBig) && chunk >= lastBig) return null;
  const value = total + chunk;
  if (!Number.isFinite(value) || value < 0) return null;
  if (Math.abs(value - Math.round(value)) > 1e-6) return null;
  return { value: Math.round(value), ambiguous, suggestion, top_scale: topScale };
}

export type AmountReading =
  | { status: "ok"; value: number; top_scale: number; correction: CorrectionPair | null }
  | { status: "ambiguous"; value: null; suggestion: number | null }
  | { status: "unreadable"; value: null };

export type CorrectionPair = { previous_inr: number; amount_inr: number };

function isBreak(t: Tok): boolean {
  return t.t === "sep" || t.t === "neg" || t.t === "boundary";
}

function longestPrefix(toks: Tok[], from: number): { parsed: Parsed; end: number } | null {
  let start = from;
  while (start < toks.length && (toks[start].t === "sep" || toks[start].t === "boundary")) start += 1;
  let limit = start;
  while (limit < toks.length && !isBreak(toks[limit])) limit += 1;
  for (let end = limit; end > start; end -= 1) {
    const parsed = parseTokens(toks.slice(start, end));
    if (parsed && !parsed.ambiguous) return { parsed, end };
  }
  return null;
}

function longestSuffix(toks: Tok[], to: number): { parsed: Parsed; start: number } | null {
  let end = to;
  while (end > 0 && (toks[end - 1].t === "sep" || toks[end - 1].t === "boundary")) end -= 1;
  let limit = end;
  while (limit > 0 && !isBreak(toks[limit - 1])) limit -= 1;
  for (let start = limit; start < end; start += 1) {
    const parsed = parseTokens(toks.slice(start, end));
    if (parsed && !parsed.ambiguous) return { parsed, start };
  }
  return null;
}

function borrowScale(x: Parsed, y: Parsed): CorrectionPair {
  const previous = x.top_scale === 1 && y.top_scale > 1 ? x.value * y.top_scale : x.value;
  const amount = y.top_scale === 1 && x.top_scale > 1 ? y.value * x.top_scale : y.value;
  return { previous_inr: previous, amount_inr: amount };
}

function findCorrectionPair(toks: Tok[]): CorrectionPair | null {
  for (let k = 0; k < toks.length; k += 1) {
    const tok = toks[k];
    if (tok.t !== "neg") continue;
    if (tok.n === "hi" || tok.n === "no") {
      // "पचास नहीं, चालीस हज़ार" · "fifty, no, forty thousand": X before the word, Y after it.
      const x = longestSuffix(toks, k);
      if (!x) continue;
      const y = longestPrefix(toks, k + 1) ?? longestSuffix(toks, x.start);
      if (!y) continue;
      return borrowScale(x.parsed, y.parsed);
    }
    // "not fifty, forty thousand" · "forty thousand, not fifty"
    const after = longestPrefix(toks, k + 1);
    if (!after) continue;
    const before = longestSuffix(toks, k);
    if (before) return borrowScale(after.parsed, before.parsed);
    const y = longestPrefix(toks, after.end);
    if (!y) continue;
    return borrowScale(after.parsed, y.parsed);
  }
  return null;
}

/**
 * The correction pair in a sentence (3.2 rule 7): "पचास नहीं, चालीस हज़ार दिए थे" gives
 * 50,000 and 40,000, because a bare count borrows its partner's scale (M-04). Null when the
 * sentence holds no "X nahin, Y", "X, no, Y" or "not X, Y".
 */
export function readCorrectionPair(text: string): CorrectionPair | null {
  if (!hasValidDigitGrouping(text)) return null;
  return findCorrectionPair(lex(text));
}

/** The full reading of an amount phrase: ok, ambiguous (rule 5, with its suggestion) or unreadable. */
export function readAmountDetailed(phrase: string): AmountReading {
  if (!phrase || !hasValidDigitGrouping(phrase)) return { status: "unreadable", value: null };
  const toks = stripEdges(lex(phrase));
  if (toks.length === 0) return { status: "unreadable", value: null };
  if (toks.some((t) => t.t === "neg")) {
    const pair = findCorrectionPair(toks);
    if (pair) return { status: "ok", value: pair.amount_inr, top_scale: 1, correction: pair };
    return { status: "unreadable", value: null };
  }
  const parsed = parseTokens(toks);
  if (!parsed) return { status: "unreadable", value: null };
  if (parsed.ambiguous) return { status: "ambiguous", value: null, suggestion: parsed.suggestion };
  return { status: "ok", value: parsed.value, top_scale: parsed.top_scale, correction: null };
}

/**
 * An amount in whole rupees from a heard phrase, or null when it isn't readable as one
 * whole value: "चालीस हज़ार" 40,000; "dedh lakh" 1,50,000; "₹1.5L" 1,50,000; "ikyavan sau"
 * 5,100; "do lakh pachaas" null (rule 5, see readAmountDetailed); "dedh" alone null.
 */
export function readAmount(phrase: string): number | null {
  const reading = readAmountDetailed(phrase);
  return reading.status === "ok" ? reading.value : null;
}

/** A count from a heard phrase: "बारह" 12, "twelve" 12, "250", "terah" 13, "roughly 250 guests" 250. */
export function readCount(phrase: string): number | null {
  if (!phrase || !hasValidDigitGrouping(phrase)) return null;
  const toks = stripEdges(lex(phrase));
  if (toks.length === 0 || toks.some((t) => t.t === "neg")) return null;
  const parsed = parseTokens(toks);
  if (!parsed || parsed.ambiguous) return null;
  return parsed.value;
}

// ---------------------------------------------------------------------------
// Ranges (3.6)
// ---------------------------------------------------------------------------

/** 3.6's allowed range for a field, or null for a field with no range. */
export function rangeFor(field: string, kind?: string): { min: number; max: number } | null {
  switch (field) {
    case "amount_inr":
    case "previous_inr":
    case "user_claim_inr":
      return { min: 1, max: 1_000_000_000 };
    case "unit_price_inr":
      return { min: 1, max: 1_000_000 };
    case "quantity":
      return kind === "add_requirement" ? { min: 1, max: 10_000 } : { min: 1, max: 100_000 };
    case "budget_inr":
      return { min: 0, max: 10_000_000_000 };
    case "expected_guests":
    case "expected_headcount":
      return { min: 0, max: 5_000 };
    case "max_plus_ones":
      return { min: 0, max: 10 };
    case "plus_ones":
      return { min: 0, max: 10 };
    default:
      return null;
  }
}

/** True when the value sits in 3.6's range for the field (fields with no range always pass). */
export function inRange(field: string, value: number, kind?: string): boolean {
  const r = rangeFor(field, kind);
  if (!r) return true;
  return Number.isSafeInteger(value) && value >= r.min && value <= r.max;
}

/** 3.6, voice only: vendor money under ₹100 is uncertain ("₹40, or ₹40,000?"). Not shagun. */
export function isSmallVendorAmount(value: number): boolean {
  return value > 0 && value < 100;
}

// ---------------------------------------------------------------------------
// Dates (3.3)
// ---------------------------------------------------------------------------

const MONTHS = new Map<string, number>();
for (const [words, m] of [
  [["january", "jan", "जनवरी"], 1],
  [["february", "feb", "फ़रवरी", "फरवरी"], 2],
  [["march", "mar", "मार्च"], 3],
  [["april", "apr", "अप्रैल", "अप्रेल"], 4],
  [["may", "मई"], 5],
  [["june", "jun", "जून"], 6],
  [["july", "jul", "जुलाई"], 7],
  [["august", "aug", "अगस्त"], 8],
  [["september", "sep", "sept", "सितंबर", "सितम्बर"], 9],
  [["october", "oct", "अक्टूबर", "अक्तूबर"], 10],
  [["november", "nov", "नवंबर", "नवम्बर"], 11],
  [["december", "dec", "दिसंबर", "दिसम्बर"], 12],
] as Array<[string[], number]>) {
  for (const w of words) MONTHS.set(normalizeForMatch(w), m);
}

const WEEKDAYS_EXACT = new Map<string, number>();
const WEEKDAYS_FOLDED = new Map<string, number>();
for (const [english, hindi, d] of [
  [["sunday", "sun"], ["ravivaar", "itvaar", "रविवार", "इतवार"], 0],
  [["monday", "mon"], ["somvaar", "सोमवार"], 1],
  [["tuesday", "tue", "tues"], ["mangalvaar", "मंगलवार"], 2],
  [["wednesday", "wed"], ["budhvaar", "बुधवार"], 3],
  [["thursday", "thu", "thurs"], ["guruvaar", "veervaar", "गुरुवार", "वीरवार"], 4],
  [["friday", "fri"], ["shukravaar", "शुक्रवार"], 5],
  [["saturday", "sat"], ["shanivaar", "शनिवार"], 6],
] as Array<[string[], string[], number]>) {
  for (const w of english) WEEKDAYS_EXACT.set(w, d);
  for (const w of hindi) {
    const n = normalizeForMatch(w);
    if (isDevanagari(n)) WEEKDAYS_EXACT.set(n, d);
    else WEEKDAYS_FOLDED.set(foldLatin(n), d);
  }
}

const ORDINAL_UNITS: readonly string[] = [
  "", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth",
  "tenth", "eleventh", "twelfth", "thirteenth", "fourteenth", "fifteenth", "sixteenth", "seventeenth", "eighteenth", "nineteenth",
];
const ORDINALS = new Map<string, number>();
ORDINAL_UNITS.forEach((w, i) => {
  if (w) ORDINALS.set(w, i);
});
ORDINALS.set("twentieth", 20);
ORDINALS.set("thirtieth", 30);

const DATE_FILLER = keySet([
  "the", "on", "of", "at", "in", "ko", "को", "ki", "की", "ka", "का", "ke", "के", "tareekh", "tarikh", "tareek", "tarik", "तारीख़", "तारीख", "तारिख",
  "date", "din", "दिन", "saal", "साल", "year", "hai", "है", "mein", "में", "me", "se", "से", "wala", "wali", "vala", "vali", "वाला", "वाली",
  "st", "nd", "rd", "th", "is", "this", "it", "was", "will", "be",
  "subah", "सुबह", "morning", "shaam", "शाम", "evening", "dopahar", "दोपहर", "afternoon", "raat", "रात", "night",
]);

const NEXT_WORDS = keySet(["next", "agle", "agla", "अगले", "अगला", "coming", "aane", "आने", "wale", "वाले"]);

type Relative = { word: string; days: number; by_tense: boolean };

function relativeOf(words: string[], i: number): { rel: Relative; used: number } | null {
  const w = words[i];
  const f = isDevanagari(w) ? w : foldLatin(w);
  const join = words.slice(i, i + 4).join(" ");
  if (join.startsWith("day after tomorrow")) return { rel: { word: "day after tomorrow", days: 2, by_tense: false }, used: 3 };
  if (join.startsWith("day before yesterday")) return { rel: { word: "day before yesterday", days: -2, by_tense: false }, used: 3 };
  if (w === "today" || f === "aj" || w === "आज") return { rel: { word: "aaj", days: 0, by_tense: false }, used: 1 };
  if (w === "tomorrow") return { rel: { word: "tomorrow", days: 1, by_tense: false }, used: 1 };
  if (w === "yesterday") return { rel: { word: "yesterday", days: -1, by_tense: false }, used: 1 };
  if (f === "kal" || w === "कल") return { rel: { word: "kal", days: 1, by_tense: true }, used: 1 };
  if (f === "parson" || f === "parso" || f === "parsun" || w === "परसों" || w === "परसो") {
    return { rel: { word: "parson", days: 2, by_tense: true }, used: 1 };
  }
  return null;
}

function weekdayOf(word: string): number | null {
  const exact = WEEKDAYS_EXACT.get(word);
  if (exact !== undefined) return exact;
  if (isDevanagari(word)) return null;
  return WEEKDAYS_FOLDED.get(foldLatin(word)) ?? null;
}

type DateParts = {
  day: number | null;
  month: number | null;
  year: number | null;
  rel: Relative | null;
  weekday: number | null;
  /** "next Sunday", "agle ravivaar": the weekday after today. */
  next_weekday: boolean;
};

function readNumberRun(words: string[]): number | null {
  const toks = words.map(classify);
  const parsed = parseTokens(toks);
  if (parsed && !parsed.ambiguous) return parsed.value;
  // "twenty twenty-six" → 20 · 26 → 2026.
  for (let cut = 1; cut < words.length; cut += 1) {
    const a = parseTokens(toks.slice(0, cut));
    const b = parseTokens(toks.slice(cut));
    if (a && b && !a.ambiguous && !b.ambiguous && a.value >= 10 && a.value <= 99 && b.value >= 0 && b.value <= 99) {
      return a.value * 100 + b.value;
    }
  }
  return null;
}

function parseDateParts(phrase: string): DateParts | null {
  const words = wordsOf(phrase);
  if (words.length === 0) return null;
  const parts: DateParts = { day: null, month: null, year: null, rel: null, weekday: null, next_weekday: false };
  let run: string[] = [];

  const flush = (): boolean => {
    if (run.length === 0) return true;
    const value = readNumberRun(run);
    run = [];
    if (value === null) return false;
    if (parts.day === null && value >= 1 && value <= 31) parts.day = value;
    else if (parts.year === null && value >= 1900 && value <= 2100) parts.year = value;
    else if (parts.year === null && parts.day !== null && parts.month !== null && value >= 0 && value <= 99) parts.year = 2000 + value;
    else return false;
    return true;
  };

  for (let i = 0; i < words.length; i += 1) {
    const w = words[i];
    let m: RegExpMatchArray | null;
    if ((m = w.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) {
      if (!flush()) return null;
      parts.year = Number(m[1]);
      parts.month = Number(m[2]);
      parts.day = Number(m[3]);
      continue;
    }
    if ((m = w.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?$/))) {
      if (!flush()) return null;
      parts.day = Number(m[1]);
      parts.month = Number(m[2]);
      if (m[3]) parts.year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
      continue;
    }
    const rel = relativeOf(words, i);
    if (rel) {
      if (!flush()) return null;
      parts.rel = rel.rel;
      i += rel.used - 1;
      continue;
    }
    const month = MONTHS.get(w);
    if (month !== undefined) {
      if (!flush()) return null;
      parts.month = month;
      continue;
    }
    const weekday = weekdayOf(w);
    if (weekday !== null) {
      if (!flush()) return null;
      parts.weekday = weekday;
      continue;
    }
    if (NEXT_WORDS.has(w) || NEXT_WORDS.has(foldLatin(w))) {
      if (!flush()) return null;
      parts.next_weekday = true;
      continue;
    }
    const ord = ORDINALS.get(w);
    if (ord !== undefined) {
      // "twenty first", "thirty first": a tens word in the run before an ordinal unit.
      let value = ord;
      if (run.length === 1 && ord < 10) {
        const tens = LATIN_NUMBERS.get(foldLatin(run[0]));
        if (tens && tens.tens && (tens.v === 20 || tens.v === 30)) {
          value = tens.v + ord;
          run = [];
        }
      }
      if (!flush()) return null;
      if (parts.day !== null) return null;
      parts.day = value;
      continue;
    }
    const tok = classify(w);
    if (tok.t === "num" || tok.t === "scale" || (tok.t === "and" && run.length > 0)) {
      if (tok.t !== "and") run.push(w);
      continue;
    }
    if (DATE_FILLER.has(w) || DATE_FILLER.has(foldLatin(w))) {
      if (!flush()) return null;
      continue;
    }
    return null;
  }
  if (!flush()) return null;
  if (parts.next_weekday && parts.weekday === null) return null;
  if (parts.month !== null && (parts.month < 1 || parts.month > 12)) return null;
  if (parts.day === null && parts.month === null && parts.year === null && parts.rel === null && parts.weekday === null) return null;
  return parts;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** A real calendar date as YYYY-MM-DD, or null (31 November is null). */
export function composeDate(year: number, month: number, day: number): IsoDate | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function toUtc(date: IsoDate): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const d = toUtc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 0 for Sunday … 6 for Saturday. */
export function weekdayOfDate(date: IsoDate): number {
  return toUtc(date).getUTCDay();
}

function daysBetween(a: IsoDate, b: IsoDate): number {
  return Math.round((toUtc(b).getTime() - toUtc(a).getTime()) / 86_400_000);
}

function partsOf(date: IsoDate): { year: number; month: number; day: number } {
  const [year, month, day] = date.split("-").map(Number);
  return { year, month, day };
}

/** `event_date`, day and month said: the one year that puts it 120 days before to 30 days after the wedding. */
function eventYear(day: number, month: number, wedding_date: IsoDate): IsoDate | null {
  const wy = partsOf(wedding_date).year;
  const fits: IsoDate[] = [];
  for (const y of [wy - 1, wy, wy + 1]) {
    const date = composeDate(y, month, day);
    if (!date) continue;
    const offset = daysBetween(wedding_date, date);
    if (offset >= -120 && offset <= 30) fits.push(date);
  }
  return fits.length === 1 ? fits[0] : null;
}

export type DateReading = {
  /** The resolved date, or null when the phrase doesn't settle one. */
  date: IsoDate | null;
  /** What was said: the day, month and year (null when not said). */
  day: number | null;
  month: number | null;
  year: number | null;
  /** aaj/today → "today"; kal/tomorrow → "tomorrow" (kal is read forward here; see relative_days). */
  relative: "today" | "tomorrow" | null;
  /** The relative word's offset from today, read forward (kal +1, parson +2, yesterday −1). */
  relative_days: number | null;
  /** True for kal and parson, whose direction comes from the verb's tense and the field (3.3). */
  tense_dependent: boolean;
  /** The weekday said (0 Sunday … 6 Saturday), a check only. */
  weekday: number | null;
  /** False when a weekday was said and the date falls on another day ("Monday 13 December"). */
  weekday_matches: boolean | null;
  /** True when only a day was said and the wedding's month and year filled it in (E-01, E-02). */
  from_wedding_month: boolean;
};

const EMPTY_DATE: DateReading = {
  date: null,
  day: null,
  month: null,
  year: null,
  relative: null,
  relative_days: null,
  tense_dependent: false,
  weekday: null,
  weekday_matches: null,
  from_wedding_month: false,
};

function nextWeekdayAfter(today: IsoDate, weekday: number): IsoDate {
  const diff = (weekday - weekdayOfDate(today) + 7) % 7 || 7;
  return addDays(today, diff);
}

/**
 * Reads a date phrase with the `event_date` defaults of 3.3: a day alone takes the
 * wedding's month and year; a day and month take the year inside the wedding window; a
 * relative word resolves from today (kal forward). "14 December" with no wedding date gives
 * day 14, month 12, year null, date null. ISO dates pass through.
 */
export function readDate(phrase: string, ctx: { today: IsoDate; wedding_date: IsoDate | null }): DateReading {
  const parts = parseDateParts(phrase);
  if (!parts) return { ...EMPTY_DATE };
  const out: DateReading = { ...EMPTY_DATE, day: parts.day, month: parts.month, year: parts.year, weekday: parts.weekday };
  if (parts.rel) {
    out.relative_days = parts.rel.days;
    out.tense_dependent = parts.rel.by_tense;
    out.relative = parts.rel.days === 0 ? "today" : parts.rel.days === 1 ? "tomorrow" : null;
    out.date = addDays(ctx.today, parts.rel.days);
  } else if (parts.next_weekday && parts.weekday !== null && parts.day === null) {
    out.date = nextWeekdayAfter(ctx.today, parts.weekday);
    out.relative_days = daysBetween(ctx.today, out.date);
  } else if (parts.day !== null && parts.month !== null && parts.year !== null) {
    out.date = composeDate(parts.year, parts.month, parts.day);
  } else if (parts.day !== null && parts.month !== null) {
    out.date = ctx.wedding_date ? eventYear(parts.day, parts.month, ctx.wedding_date) : null;
  } else if (parts.day !== null && parts.month === null && parts.year === null && ctx.wedding_date) {
    const w = partsOf(ctx.wedding_date);
    out.date = composeDate(w.year, w.month, parts.day);
    out.from_wedding_month = out.date !== null;
  }
  if (out.date && parts.weekday !== null) out.weekday_matches = weekdayOfDate(out.date) === parts.weekday;
  return out;
}

export type DateField = "wedding_date" | "event_date" | "paid_on" | "received_on" | "due_on" | "day";

export const DATE_FIELDS: readonly DateField[] = ["wedding_date", "event_date", "paid_on", "received_on", "due_on", "day"];

export type FieldDate = {
  /** ok: the date is settled · asked: a relative word for a function, offer `date` and ask (E-08) ·
   * partial: some parts are missing (the year for a wedding date) · weekday_mismatch · unreadable. */
  status: "ok" | "asked" | "partial" | "weekday_mismatch" | "unreadable";
  /** The settled or offered date; for `day`, "today" stays "today". */
  date: string | null;
  reading: DateReading;
};

export type DateContext = {
  today: IsoDate;
  wedding_date: IsoDate | null;
  /** set_wedding_profile follow-ups (S-02): the draft's `date_text` ("14 December") and `month` (S-03). */
  draft_date_text?: string | null;
  draft_month?: number | null;
};

/** 3.3's per-field rules for filling in what wasn't said. */
export function resolveDate(field: DateField, phrase: string, ctx: DateContext): FieldDate {
  const reading = readDate(phrase, ctx);
  const fail = (status: FieldDate["status"] = "unreadable", date: string | null = null): FieldDate => ({ status, date, reading });
  const parts = parseDateParts(phrase);
  if (!parts) return fail();
  const today = partsOf(ctx.today);
  const weekdayCheck = (date: IsoDate | null): FieldDate => {
    if (!date) return fail();
    if (parts.weekday !== null && weekdayOfDate(date) !== parts.weekday) return fail("weekday_mismatch", date);
    return { status: "ok", date, reading };
  };

  if (field === "wedding_date") {
    if (parts.rel || parts.next_weekday) return fail("asked", reading.date);
    let { day, month, year } = parts;
    if (ctx.draft_date_text) {
      const draft = parseDateParts(ctx.draft_date_text);
      day = day ?? draft?.day ?? null;
      month = month ?? draft?.month ?? null;
      year = year ?? draft?.year ?? null;
    }
    month = month ?? ctx.draft_month ?? null;
    if (day === null || month === null || year === null) return fail("partial");
    return weekdayCheck(composeDate(year, month, day));
  }

  if (field === "event_date") {
    if (parts.rel || parts.next_weekday) return fail("asked", reading.date);
    if (parts.year !== null && (parts.year < 2026 || parts.year > 2030)) return fail();
    if (parts.day !== null && parts.month !== null && parts.year !== null) return weekdayCheck(composeDate(parts.year, parts.month, parts.day));
    if (parts.day === null) return fail("partial");
    if (!ctx.wedding_date) return fail("partial");
    if (parts.month !== null) {
      const date = eventYear(parts.day, parts.month, ctx.wedding_date);
      return date ? weekdayCheck(date) : fail("asked");
    }
    return weekdayCheck(reading.date);
  }

  const past = field === "paid_on" || field === "received_on" || field === "day";
  if (parts.rel) {
    const days = parts.rel.by_tense ? (past ? -Math.abs(parts.rel.days) : Math.abs(parts.rel.days)) : parts.rel.days;
    const date = addDays(ctx.today, days);
    if (past && days > 0) return fail();
    if (!past && days < 0) return fail();
    if (field === "day" && days === 0) return { status: "ok", date: "today", reading };
    return { status: "ok", date, reading };
  }
  if (parts.next_weekday) {
    if (past) return fail();
    return weekdayCheck(reading.date);
  }
  if (parts.day === null) return fail("partial");

  if (parts.year !== null) {
    if (parts.month === null) return fail("partial");
    const date = composeDate(parts.year, parts.month, parts.day);
    if (!date) return fail();
    if (past && date > ctx.today) return fail();
    return weekdayCheck(date);
  }

  if (past) {
    if (parts.month !== null) {
      let date = composeDate(today.year, parts.month, parts.day);
      if (date && date > ctx.today) date = composeDate(today.year - 1, parts.month, parts.day);
      return weekdayCheck(date);
    }
    // Day only: this month, or last month if the day hasn't come yet.
    let date = composeDate(today.year, today.month, parts.day);
    if (!date || date > ctx.today) {
      const lm = today.month === 1 ? { y: today.year - 1, m: 12 } : { y: today.year, m: today.month - 1 };
      date = composeDate(lm.y, lm.m, parts.day);
    }
    return weekdayCheck(date);
  }

  // due_on
  if (parts.month !== null) {
    let date = composeDate(today.year, parts.month, parts.day);
    if (date && date < ctx.today) date = composeDate(today.year + 1, parts.month, parts.day);
    return weekdayCheck(date);
  }
  let date = composeDate(today.year, today.month, parts.day);
  if (!date || date < ctx.today) {
    const nm = today.month === 12 ? { y: today.year + 1, m: 1 } : { y: today.year, m: today.month + 1 };
    date = composeDate(nm.y, nm.m, parts.day);
  }
  return weekdayCheck(date);
}

/** A month said alone (S-03, `set_wedding_profile.month`): "December mein" → 12. */
export function readMonth(phrase: string): number | null {
  const parts = parseDateParts(phrase);
  if (!parts || parts.month === null || parts.day !== null || parts.rel) return null;
  return parts.month;
}

// ---------------------------------------------------------------------------
// Times (3.4)
// ---------------------------------------------------------------------------

export type Daypart = "morning" | "afternoon" | "evening" | "night";

const DAYPARTS = new Map<string, Daypart>();
for (const [words, d] of [
  [["subah", "सुबह", "morning", "savere", "सवेरे"], "morning"],
  [["dopahar", "दोपहर", "afternoon", "dupahar", "dophar"], "afternoon"],
  [["shaam", "शाम", "evening", "sham"], "evening"],
  [["raat", "रात", "night", "rat"], "night"],
] as Array<[string[], Daypart]>) {
  for (const w of words) {
    const n = normalizeForMatch(w);
    DAYPARTS.set(isDevanagari(n) ? n : foldLatin(n), d);
  }
}

const TIME_FILLER = keySet([
  "baje", "बजे", "bajey", "tak", "तक", "at", "in", "the", "o", "clock", "oclock", "ko", "को", "ke", "के", "by", "till", "until",
  "around", "about", "lagbhag", "लगभग", "se", "से", "from", "of", "hrs", "hours", "h", "ki", "की", "ka", "का", "mein", "में", "hai", "है",
]);

export type TimeReading = {
  /** "HH:MM", 24-hour. With `daypart_missing`, the hour as said on a 12-hour clock (07:00). */
  time: string | null;
  /** True when the hour is 1 to 12 and no daypart, AM or PM was said ("saat baje"). */
  daypart_missing: boolean;
  /** The daypart said, if any ("subah" alone gives morning and no time). */
  daypart: Daypart | null;
  /** With `daypart_missing`: both readings, morning first ("07:00", "19:00"). */
  alternatives: string[];
};

function hm(h: number, m: number): string {
  return `${pad2(h)}:${pad2(m)}`;
}

function applyDaypart(hour: number, minute: number, daypart: Daypart | "am" | "pm"): string | null {
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  if (hour >= 13 || hour === 0) return hm(hour, minute);
  switch (daypart) {
    case "am":
      return hm(hour === 12 ? 0 : hour, minute);
    case "pm":
      return hm(hour === 12 ? 12 : hour + 12, minute);
    case "morning":
      return hour === 12 ? null : hm(hour, minute);
    case "afternoon":
      return hour === 12 ? hm(12, minute) : hour <= 6 ? hm(hour + 12, minute) : hm(hour, minute);
    case "evening":
      return hour === 12 ? null : hm(hour + 12, minute);
    case "night":
      return hour === 12 ? hm(0, minute) : hour >= 6 ? hm(hour + 12, minute) : hm(hour, minute);
  }
}

function hourWord(word: string): number | null {
  if (/^\d{1,2}$/.test(word)) return Number(word);
  const tok = classify(word);
  if (tok.t === "num" && Number.isInteger(tok.v) && tok.v >= 1 && tok.v <= 23 && tok.src !== "digits") return tok.v;
  return null;
}

function minuteWords(words: string[], i: number): { minute: number; used: number } | null {
  const a = words[i];
  if (a === undefined) return null;
  if (/^\d{1,2}$/.test(a)) {
    const n = Number(a);
    return n <= 59 ? { minute: n, used: 1 } : null;
  }
  const ta = classify(a);
  if (ta.t !== "num" || ta.src === "digits") return null;
  let minute = ta.v;
  let used = 1;
  const b = words[i + 1];
  if (ta.tens && b !== undefined) {
    const tb = classify(b);
    if (tb.t === "num" && tb.src === "en" && tb.v >= 1 && tb.v <= 9) {
      minute += tb.v;
      used = 2;
    }
  }
  return minute <= 59 ? { minute, used } : null;
}

/**
 * Reads a time phrase (3.4): "shaam saat baje" 19:00; "seven in the evening" 19:00; "7 PM"
 * 19:00; "शाम साढ़े पाँच बजे" 17:30; "19:00" as said; a bare "saat baje" gives 07:00 with
 * `daypart_missing` and both readings; "subah" alone gives the morning and no time.
 */
export function readTime(phrase: string): TimeReading {
  const empty: TimeReading = { time: null, daypart_missing: false, daypart: null, alternatives: [] };
  const words = wordsOf(phrase).flatMap((w) => (w === "a" || w === "p" ? [w] : [w]));
  if (words.length === 0) return empty;

  let hour: number | null = null;
  let minute = 0;
  let explicit24 = false;
  let daypart: Daypart | null = null;
  let ampm: "am" | "pm" | null = null;

  for (let i = 0; i < words.length; i += 1) {
    const w = words[i];
    const f = isDevanagari(w) ? w : foldLatin(w);
    let m: RegExpMatchArray | null;
    if ((m = w.match(/^(\d{1,2})[:.](\d{2})$/))) {
      if (hour !== null) return empty;
      hour = Number(m[1]);
      minute = Number(m[2]);
      if (m[1].length === 2 && m[1].startsWith("0")) explicit24 = true;
      continue;
    }
    if (w === "am" || w === "pm") {
      ampm = w;
      continue;
    }
    if ((w === "a" || w === "p") && words[i + 1] === "m") {
      ampm = w === "a" ? "am" : "pm";
      i += 1;
      continue;
    }
    if (w === "noon" || w === "midday") {
      if (hour !== null && hour !== 12) return empty;
      hour = 12;
      ampm = "pm";
      continue;
    }
    if (w === "midnight") {
      hour = 0;
      explicit24 = true;
      continue;
    }
    const dp = DAYPARTS.get(f);
    if (dp) {
      daypart = dp;
      continue;
    }
    if (w === "half" && words[i + 1] === "past") {
      const h = hourWord(words[i + 2] ?? "");
      if (h === null || hour !== null) return empty;
      hour = h;
      minute = 30;
      i += 2;
      continue;
    }
    if (w === "quarter" && (words[i + 1] === "past" || words[i + 1] === "to")) {
      const h = hourWord(words[i + 2] ?? "");
      if (h === null || hour !== null) return empty;
      if (words[i + 1] === "past") {
        hour = h;
        minute = 15;
      } else {
        hour = h === 1 ? 12 : h - 1;
        minute = 45;
      }
      i += 2;
      continue;
    }
    const tok = classify(w);
    if (tok.t === "frac") {
      if (hour !== null) return empty;
      if (tok.f === "dedh" || tok.f === "dhai") {
        hour = tok.f === "dedh" ? 1 : 2;
        minute = 30;
        continue;
      }
      const h = hourWord(words[i + 1] ?? "");
      if (h === null || h > 12) return empty;
      i += 1;
      if (tok.f === "saade") {
        hour = h;
        minute = 30;
      } else if (tok.f === "sava") {
        hour = h;
        minute = 15;
      } else {
        hour = h === 1 ? 12 : h - 1;
        minute = 45;
      }
      continue;
    }
    const h = hourWord(w);
    if (h !== null && hour === null) {
      hour = h;
      if (/^\d{2}$/.test(w) && w.startsWith("0")) explicit24 = true;
      // "seven thirty", "saat bajkar tees minute"
      let k = i + 1;
      if (words[k] === "bajkar" || words[k] === "बजकर") k += 1;
      const mins = minuteWords(words, k);
      if (mins && (k > i + 1 || classify(words[i + 1] ?? "").t === "num")) {
        minute = mins.minute;
        i = k + mins.used - 1;
        if (words[i + 1] === "minute" || words[i + 1] === "minat" || words[i + 1] === "मिनट" || words[i + 1] === "minutes") i += 1;
      }
      continue;
    }
    if (TIME_FILLER.has(w) || TIME_FILLER.has(f)) continue;
    return empty;
  }

  if (hour === null) {
    return { ...empty, daypart };
  }
  if (hour > 23 || minute > 59) return empty;
  if (explicit24 || hour >= 13 || hour === 0) {
    return { time: hm(hour, minute), daypart_missing: false, daypart, alternatives: [] };
  }
  const part = ampm ?? daypart;
  if (part) {
    const time = applyDaypart(hour, minute, part);
    return time ? { time, daypart_missing: false, daypart, alternatives: [] } : empty;
  }
  const morning = hour === 12 ? hm(0, minute) : hm(hour, minute);
  const evening = hour === 12 ? hm(12, minute) : hm(hour + 12, minute);
  return {
    time: hm(hour, minute),
    daypart_missing: true,
    daypart: null,
    alternatives: hour === 12 ? [evening, morning] : [morning, evening],
  };
}

// ---------------------------------------------------------------------------
// Re-reading a field (3.1)
// ---------------------------------------------------------------------------

export const COUNT_FIELDS: readonly string[] = ["quantity", "expected_guests", "expected_headcount", "plus_ones", "max_plus_ones"];
export const TIME_FIELDS: readonly string[] = ["start_time", "end_time", "muhurat_time"];

export type RereadContext = {
  today: IsoDate;
  wedding_date: IsoDate | null;
  /** The whole transcript, so a bare count can borrow its partner's scale (3.2 rule 7, M-04). */
  transcript?: string | null;
  /** The function's other stored times, for a time said without a daypart (3.4). */
  event_times?: { start_time?: string | null; end_time?: string | null; muhurat_time?: string | null } | null;
  draft_date_text?: string | null;
  draft_month?: number | null;
};

function timeFits(field: string, candidate: string, times: NonNullable<RereadContext["event_times"]>): boolean {
  const start = times.start_time ?? null;
  const end = times.end_time ?? null;
  if (field === "end_time") return start !== null && candidate > start;
  if (field === "start_time") return end !== null && candidate < end;
  if (field === "muhurat_time") return start !== null && end !== null && candidate >= start && candidate <= end;
  return false;
}

/** The one reading of a daypart-less time that fits the function's other times (3.4), or null. */
export function pickTimeReading(field: string, reading: TimeReading, times: RereadContext["event_times"]): string | null {
  if (!reading.daypart_missing) return reading.time;
  if (!times) return null;
  const fits = reading.alternatives.filter((alt) => timeFits(field, alt, times));
  return fits.length === 1 ? fits[0] : null;
}

function sameValue(a: unknown, b: number): boolean {
  return typeof a === "number" ? a === b : typeof a === "string" && a.trim() !== "" && Number(a) === b;
}

/**
 * Re-reads one field's heard phrase and compares it with the model's value (3.1):
 * "match", "mismatch" (code read a different value; offer code's reading) or "unreadable"
 * (no single value: uncertain). `*_inr` fields use readAmount, counts readCount, dates 3.3's
 * field rules, times 3.4. A weekday that contradicts the date, a relative word for a
 * function, a wedding date without a said year and a time without a daypart (with no other
 * time to settle it) are all "unreadable".
 */
export function rereadField(
  field: string,
  value: unknown,
  phrase: string,
  ctx: { today: IsoDate; wedding_date: IsoDate | null } & Partial<RereadContext>,
): "match" | "mismatch" | "unreadable" {
  if (typeof phrase !== "string" || phrase.trim() === "") return "unreadable";

  if (field.endsWith("_inr")) {
    const reading = readAmountDetailed(phrase);
    let read: number | null = reading.status === "ok" ? reading.value : null;
    if (reading.status === "ok" && reading.correction && field === "previous_inr") read = reading.correction.previous_inr;
    if (field === "previous_inr" || field === "amount_inr") {
      const pair = ctx.transcript ? readCorrectionPair(ctx.transcript) : null;
      if (pair && read !== null && reading.status === "ok" && reading.top_scale === 1 && !reading.correction) {
        // A bare count in a correction pair borrows its partner's scale.
        const partner = field === "previous_inr" ? pair.previous_inr : pair.amount_inr;
        if (read > 0 && [100, 1_000, 100_000, 10_000_000].includes(partner / read)) read = partner;
      }
    }
    if (read === null) return "unreadable";
    return sameValue(value, read) ? "match" : "mismatch";
  }

  if (COUNT_FIELDS.includes(field)) {
    const read = readCount(phrase);
    if (read === null) return "unreadable";
    return sameValue(value, read) ? "match" : "mismatch";
  }

  if ((DATE_FIELDS as readonly string[]).includes(field)) {
    const resolved = resolveDate(field as DateField, phrase, ctx);
    if (resolved.status !== "ok" || resolved.date === null) return "unreadable";
    return typeof value === "string" && value === resolved.date ? "match" : "mismatch";
  }

  if (TIME_FIELDS.includes(field)) {
    const reading = readTime(phrase);
    if (reading.time === null) return "unreadable";
    const read = pickTimeReading(field, reading, ctx.event_times ?? null);
    if (read === null) return "unreadable";
    return typeof value === "string" && value === read ? "match" : "mismatch";
  }

  if (field === "month") {
    const read = readMonth(phrase);
    if (read === null) return "unreadable";
    return sameValue(value, read) ? "match" : "mismatch";
  }

  if (typeof value === "string" || typeof value === "number") {
    return normalizeForMatch(String(value)) === normalizeForMatch(phrase) ? "match" : "mismatch";
  }
  return "unreadable";
}
