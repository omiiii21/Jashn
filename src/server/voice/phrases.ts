import "server-only";

import { normalizeForMatch } from "./normalize";

/**
 * Confirm and cancel phrases (voice.md 1.8, domain 3.8), checked on the normalised
 * transcript right after speech to text and before any model call. The WHOLE utterance
 * must be a phrase: anything longer goes to the model, so "नहीं, पचास नहीं, चालीस हज़ार
 * दिए थे" (M-04) is never a cancel.
 */

/** Two-word forms that count as one canonical word (1.8's table), matched first. */
const PAIR_EQUIVALENTS: ReadonlyArray<[string, string, string]> = [
  ["kar", "do", "karo"],
  ["कर", "दो", "karo"],
  ["kar", "दो", "karo"],
  ["कर", "do", "karo"],
];

/** Single words that count as the same (1.8's table), keyed by their normalised form. */
const WORD_EQUIVALENTS: Record<string, string> = buildWordTable({
  haan: ["haan", "हाँ", "हां", "han", "haa", "ha", "haaan"],
  save: ["save", "सेव"],
  karo: ["karo", "करो", "kardo", "kar do"],
  theek: ["theek", "ठीक", "thik", "theekh", "thick", "theak"],
  hai: ["hai", "है", "he", "hain"],
  yes: ["yes", "yeah", "yep", "yea"],
  ji: ["ji", "जी", "jee"],
  nahin: ["nahin", "नहीं", "nahi", "nai", "नही", "nahee", "nahii"],
  rehne: ["rehne", "रहने", "rahne", "rehene"],
  do: ["do", "दो"],
  cancel: ["cancel", "कैंसल", "कैन्सल", "कॅन्सल"],
  no: ["no", "nope"],
});

function buildWordTable(table: Record<string, string[]>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [canonical, forms] of Object.entries(table)) {
    for (const form of forms) {
      const key = normalizeForMatch(form);
      if (!key.includes(" ")) out[key] = canonical;
    }
  }
  return out;
}

/** domain 3.8's list plus voice.md 1.8's added equivalents, after the word mapping. */
export const CONFIRM_PHRASES: readonly string[] = [
  "haan",
  "haan save karo",
  "yes save",
  "theek hai save",
  "haan ji",
  "yes",
  "save karo",
  "theek hai save karo",
];

export const CANCEL_PHRASES: readonly string[] = [
  "nahin rehne do",
  "cancel",
  "nahin",
  "rehne do",
  "no",
  "cancel karo",
];

const CONFIRM_SET = new Set(CONFIRM_PHRASES);
const CANCEL_SET = new Set(CANCEL_PHRASES);

/** The utterance in canonical words: normalised, two-word forms joined, each word mapped. */
export function canonicalPhrase(transcript: string): string {
  const words = normalizeForMatch(transcript).split(" ").filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < words.length; i += 1) {
    const pair = PAIR_EQUIVALENTS.find(([a, b]) => words[i] === normalizeForMatch(a) && words[i + 1] === normalizeForMatch(b));
    if (pair) {
      out.push(pair[2]);
      i += 1;
      continue;
    }
    out.push(WORD_EQUIVALENTS[words[i]] ?? words[i]);
  }
  return out.join(" ");
}

/**
 * "confirm" when the whole utterance is a confirm phrase, "cancel" when it is a cancel
 * phrase, otherwise null (the turn goes to the model). "हाँ, save करो" → confirm;
 * "नहीं, रहने दो।" → cancel; "नहीं, पचास नहीं, चालीस हज़ार दिए थे" → null.
 */
export function matchPhrase(transcript: string): "confirm" | "cancel" | null {
  const phrase = canonicalPhrase(transcript);
  if (phrase.length === 0) return null;
  if (CONFIRM_SET.has(phrase)) return "confirm";
  if (CANCEL_SET.has(phrase)) return "cancel";
  return null;
}
