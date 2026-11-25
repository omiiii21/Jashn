import "server-only";

import { cleanKeyterms } from "./sarvam";

/**
 * Saaras keyterms for one turn (voice.md 1.6), in priority order. Duplicates are removed
 * ignoring case, anything over 64 characters is dropped, and the list stops at 50.
 */

export const FUNCTION_WORDS = ["Mehendi", "Haldi", "Sangeet", "Reception", "Baraat"] as const;
export const VENDOR_ROLE_WORDS = ["caterer", "decorator", "photographer", "DJ"] as const;
export const MONEY_WORDS = ["lakh", "hazaar", "advance", "shagun"] as const;
/** A setup turn (no wedding yet) sends lists 1 and 5 plus this. */
export const SETUP_CITY = "Bengaluru";

export type KeytermSource = {
  /** Titles of `other` functions (list 1). */
  other_function_titles: string[];
  /** The bride's and groom's full names; only the first names are sent (list 2). */
  couple_names: string[];
  /** Every member's display name (list 2). */
  member_names: string[];
  /** Venue names and place names (list 3). */
  venue_names: string[];
  /** Vendor names, in the order they were added (list 4). */
  vendor_names: string[];
  /** Household surnames (list 6). */
  household_names: string[];
  /** Named guests, pending invitations first (list 7). */
  guests: { full_name: string; pending: boolean }[];
};

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? "";

/** Setup turns: function words, money words and the city. */
export function setupKeyterms(): string[] {
  return cleanKeyterms([...FUNCTION_WORDS, ...MONEY_WORDS, SETUP_CITY]);
}

/** A wedding's keyterms, lists 1 to 7 of 1.6. */
export function weddingKeyterms(source: KeytermSource): string[] {
  const pendingFirst = [...source.guests].sort((a, b) => Number(b.pending) - Number(a.pending));
  return cleanKeyterms([
    ...FUNCTION_WORDS,
    ...source.other_function_titles,
    ...source.couple_names.map(firstName),
    ...source.member_names,
    ...source.venue_names,
    ...source.vendor_names,
    ...VENDOR_ROLE_WORDS,
    ...MONEY_WORDS,
    ...source.household_names,
    ...pendingFirst.map((guest) => guest.full_name),
  ]);
}
