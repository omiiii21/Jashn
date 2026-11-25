/**
 * Money: whole rupees as integers in fields ending `_inr` (M1–M8).
 * Display only through these helpers (M7). Arithmetic happens in read models.
 */

/** M2: a single amount (payment, commitment, quote, expense, shagun). ₹100 crore. */
export const MAX_AMOUNT_INR = 1_000_000_000;
/** M2: `unit_price_inr`. */
export const MAX_UNIT_PRICE_INR = 1_000_000;
/** M2: `quantity`. */
export const MAX_QUANTITY = 100_000;
/** M2: budget totals and lines. */
export const MAX_BUDGET_INR = 10_000_000_000;

/** True for a whole number of rupees that is a safe integer (M1). */
export function isInr(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

/** Indian digit grouping of a non-negative integer: 1200000 → "12,00,000". */
export function groupIndian(value: number): string {
  const digits = Math.trunc(Math.abs(value)).toString();
  if (digits.length <= 3) return digits;
  const last3 = digits.slice(-3);
  let rest = digits.slice(0, -3);
  const groups: string[] = [];
  while (rest.length > 2) {
    groups.unshift(rest.slice(-2));
    rest = rest.slice(0, -2);
  }
  if (rest.length > 0) groups.unshift(rest);
  return `${groups.join(",")},${last3}`;
}

/**
 * M7: the rupee sign, Indian grouping, no decimals, no space: ₹1,60,000.
 * Owed amounts are never negative on screen; a negative input (a proposal's delta)
 * gets a leading minus sign.
 */
export function formatInr(amount_inr: number): string {
  const sign = amount_inr < 0 ? "-" : "";
  return `${sign}₹${groupIndian(amount_inr)}`;
}

/** "Overpaid ₹5,000" (M7), never a negative balance. */
export function formatOverpaid(overpaid_inr: number): string {
  return `Overpaid ${formatInr(Math.abs(overpaid_inr))}`;
}

/** The per-unit formula text: "250 plates × ₹800 = ₹2,00,000" (4.2). */
export function formatPerUnitFormula(quantity: number, unit: string, unit_price_inr: number): string {
  const unitWord = quantity === 1 ? unit : `${unit}s`;
  return `${groupIndian(quantity)} ${unitWord} × ${formatInr(unit_price_inr)} = ${formatInr(quantity * unit_price_inr)}`;
}

// ---------------------------------------------------------------------------
// Amount words (voice.md 3.2 and 3.5). Never डेढ़, ढाई, सवा, साढ़े or पौने for money.
// ---------------------------------------------------------------------------

/** Hindi number words 0–99, voice.md 3.2's table (index = number). */
export const HINDI_NUMBER_WORDS: readonly string[] = [
  "शून्य", "एक", "दो", "तीन", "चार", "पाँच", "छह", "सात", "आठ", "नौ",
  "दस", "ग्यारह", "बारह", "तेरह", "चौदह", "पंद्रह", "सोलह", "सत्रह", "अठारह", "उन्नीस",
  "बीस", "इक्कीस", "बाईस", "तेईस", "चौबीस", "पच्चीस", "छब्बीस", "सत्ताईस", "अट्ठाईस", "उनतीस",
  "तीस", "इकतीस", "बत्तीस", "तैंतीस", "चौंतीस", "पैंतीस", "छत्तीस", "सैंतीस", "अड़तीस", "उनतालीस",
  "चालीस", "इकतालीस", "बयालीस", "तैंतालीस", "चवालीस", "पैंतालीस", "छियालीस", "सैंतालीस", "अड़तालीस", "उनचास",
  "पचास", "इक्यावन", "बावन", "तिरेपन", "चौवन", "पचपन", "छप्पन", "सत्तावन", "अट्ठावन", "उनसठ",
  "साठ", "इकसठ", "बासठ", "तिरसठ", "चौंसठ", "पैंसठ", "छियासठ", "सड़सठ", "अड़सठ", "उनहत्तर",
  "सत्तर", "इकहत्तर", "बहत्तर", "तिहत्तर", "चौहत्तर", "पचहत्तर", "छिहत्तर", "सतहत्तर", "अठहत्तर", "उन्यासी",
  "अस्सी", "इक्यासी", "बयासी", "तिरासी", "चौरासी", "पचासी", "छियासी", "सत्तासी", "अट्ठासी", "नवासी",
  "नब्बे", "इक्यानवे", "बानवे", "तिरानवे", "चौरानवे", "पचानवे", "छियानवे", "सत्तानवे", "अट्ठानवे", "निन्यानवे",
];

const ENGLISH_ONES = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen",
];
const ENGLISH_TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function englishBelow100(n: number): string {
  if (n < 20) return ENGLISH_ONES[n];
  const tens = ENGLISH_TENS[Math.floor(n / 10)];
  const ones = n % 10;
  return ones === 0 ? tens : `${tens}-${ENGLISH_ONES[ones]}`;
}

/** Splits a whole number the Indian way: crore, lakh, hazaar, sau and the rest below 100. */
export function splitIndian(value: number): { crore: number; lakh: number; thousand: number; hundred: number; rest: number } {
  const n = Math.trunc(Math.abs(value));
  return {
    crore: Math.floor(n / 10_000_000),
    lakh: Math.floor((n % 10_000_000) / 100_000),
    thousand: Math.floor((n % 100_000) / 1000),
    hundred: Math.floor((n % 1000) / 100),
    rest: n % 100,
  };
}

/** Hindi words for a count (no रुपये): 229 → "दो सौ उनतीस". A crore count above 99 recurses. */
export function hindiNumberWords(value: number): string {
  const n = Math.trunc(Math.abs(value));
  if (n === 0) return HINDI_NUMBER_WORDS[0];
  const parts = splitIndian(n);
  const words: string[] = [];
  if (parts.crore > 0) words.push(`${parts.crore < 100 ? HINDI_NUMBER_WORDS[parts.crore] : hindiNumberWords(parts.crore)} करोड़`);
  if (parts.lakh > 0) words.push(`${HINDI_NUMBER_WORDS[parts.lakh]} लाख`);
  if (parts.thousand > 0) words.push(`${HINDI_NUMBER_WORDS[parts.thousand]} हज़ार`);
  if (parts.hundred > 0) words.push(`${HINDI_NUMBER_WORDS[parts.hundred]} सौ`);
  if (parts.rest > 0) words.push(HINDI_NUMBER_WORDS[parts.rest]);
  return words.join(" ");
}

/** English words for a count: 184000 → "one lakh eighty-four thousand". No "and". */
export function englishNumberWords(value: number): string {
  const n = Math.trunc(Math.abs(value));
  if (n === 0) return ENGLISH_ONES[0];
  const parts = splitIndian(n);
  const words: string[] = [];
  if (parts.crore > 0) words.push(`${parts.crore < 100 ? englishBelow100(parts.crore) : englishNumberWords(parts.crore)} crore`);
  if (parts.lakh > 0) words.push(`${englishBelow100(parts.lakh)} lakh`);
  if (parts.thousand > 0) words.push(`${englishBelow100(parts.thousand)} thousand`);
  if (parts.hundred > 0) words.push(`${englishBelow100(parts.hundred)} hundred`);
  if (parts.rest > 0) words.push(englishBelow100(parts.rest));
  return words.join(" ");
}

/** "एक लाख साठ हज़ार रुपये" (रुपया for exactly one rupee). */
export function inrToHindiWords(amount_inr: number): string {
  const n = Math.trunc(Math.abs(amount_inr));
  return `${hindiNumberWords(n)} ${n === 1 ? "रुपया" : "रुपये"}`;
}

/** "one lakh sixty thousand rupees" ("rupee" for exactly one). */
export function inrToEnglishWords(amount_inr: number): string {
  const n = Math.trunc(Math.abs(amount_inr));
  return `${englishNumberWords(n)} ${n === 1 ? "rupee" : "rupees"}`;
}
