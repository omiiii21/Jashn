import "server-only";

import type { InviteTheme, InviteTypeface } from "@/contracts/domain";

/**
 * Pure layout helpers for the next/og fallback card (export-and-recovery 3.7). Satori can't
 * report a measured height before it draws, so the og renderer estimates each block from
 * the committed fonts' advance widths and applies the same fit rule as the Chromium guard
 * (1.3): the photo down to 240 px, then the gaps down to half, then one line per function.
 */

/** The card stock's content box: 1000 × 1270 stock, 64 px side and 52 px top/bottom insets (1.3). */
export const OG_BODY_WIDTH_PX = 872;
export const OG_BODY_HEIGHT_PX = 1166;

/** The photo box's largest size (1.3). */
export const OG_PHOTO_MAX_WIDTH_PX = 560;
export const OG_PHOTO_MAX_HEIGHT_PX = 380;
export const OG_PHOTO_MIN_HEIGHT_PX = 240;

/** The card colours per theme, from the invite tokens in globals.css (Satori can't read CSS variables). */
export type OgPalette = { ground: string; stock: string; name: string; foil: string; blessing: string; ink: string };

export const OG_PALETTES: Record<InviteTheme, OgPalette> = {
  maroon_gold: { ground: "#4E0C1A", stock: "#F7EFDF", name: "#6A1224", foil: "#C9A24E", blessing: "#7D5B17", ink: "#2B1D1A" },
  peacock_gold: { ground: "#0D3A45", stock: "#F7EFDF", name: "#14505E", foil: "#C9A24E", blessing: "#7D5B17", ink: "#2B1D1A" },
};

/** The committed Latin faces: Eczar 400, 500 and 600, and Anek Devanagari 400. */
export type OgFace = "eczar_400" | "eczar_500" | "eczar_600" | "anek_400";

// Advance widths in em for U+0020 to U+007E, read from the committed TTF files' hmtx tables.
// prettier-ignore
const ADVANCES: Record<OgFace, readonly number[]> = {
  eczar_400: [0.265,0.297,0.343,0.622,0.533,0.823,0.666,0.169,0.275,0.274,0.369,0.571,0.244,0.353,0.2,0.403,0.564,0.407,0.545,0.531,0.566,0.547,0.529,0.459,0.505,0.502,0.218,0.245,0.573,0.592,0.573,0.582,1.036,0.696,0.619,0.558,0.655,0.563,0.552,0.675,0.751,0.335,0.347,0.651,0.548,0.901,0.745,0.652,0.581,0.691,0.638,0.533,0.597,0.7,0.68,0.919,0.67,0.597,0.574,0.346,0.388,0.35,0.539,0.532,0.285,0.507,0.52,0.415,0.541,0.451,0.326,0.546,0.588,0.283,0.272,0.564,0.298,0.878,0.59,0.491,0.55,0.528,0.427,0.419,0.343,0.568,0.505,0.738,0.54,0.503,0.482,0.419,0.293,0.425,0.599],
  eczar_500: [0.265,0.314,0.376,0.622,0.555,0.826,0.678,0.175,0.303,0.302,0.385,0.571,0.265,0.39,0.23,0.409,0.577,0.423,0.563,0.551,0.582,0.556,0.547,0.476,0.527,0.525,0.241,0.267,0.574,0.588,0.574,0.602,1.052,0.707,0.644,0.572,0.681,0.59,0.579,0.687,0.777,0.358,0.367,0.685,0.572,0.928,0.759,0.664,0.606,0.702,0.665,0.555,0.621,0.718,0.695,0.95,0.684,0.623,0.603,0.37,0.395,0.373,0.525,0.532,0.29,0.526,0.537,0.431,0.558,0.467,0.347,0.557,0.605,0.304,0.291,0.584,0.316,0.901,0.609,0.503,0.567,0.544,0.45,0.432,0.363,0.59,0.52,0.754,0.556,0.523,0.496,0.456,0.303,0.461,0.601],
  eczar_600: [0.265,0.332,0.409,0.622,0.578,0.828,0.689,0.181,0.331,0.33,0.402,0.57,0.287,0.427,0.26,0.416,0.589,0.438,0.581,0.571,0.598,0.565,0.564,0.493,0.548,0.547,0.264,0.29,0.576,0.584,0.576,0.622,1.067,0.719,0.668,0.585,0.706,0.617,0.606,0.698,0.803,0.382,0.386,0.719,0.596,0.955,0.774,0.675,0.631,0.713,0.692,0.578,0.645,0.737,0.709,0.98,0.699,0.65,0.632,0.393,0.403,0.395,0.511,0.532,0.294,0.544,0.555,0.447,0.575,0.484,0.367,0.569,0.623,0.325,0.309,0.605,0.335,0.923,0.628,0.515,0.584,0.561,0.472,0.446,0.382,0.612,0.535,0.77,0.571,0.544,0.51,0.492,0.313,0.496,0.603],
  anek_400: [0.212,0.232,0.344,0.591,0.521,0.741,0.628,0.179,0.292,0.292,0.383,0.5,0.188,0.407,0.191,0.416,0.566,0.336,0.469,0.491,0.522,0.521,0.54,0.46,0.555,0.54,0.2,0.199,0.516,0.516,0.516,0.447,0.835,0.581,0.581,0.507,0.592,0.523,0.5,0.59,0.62,0.236,0.412,0.567,0.487,0.747,0.62,0.599,0.56,0.599,0.576,0.521,0.531,0.61,0.57,0.818,0.566,0.548,0.518,0.306,0.416,0.306,0.421,0.453,0.284,0.494,0.537,0.434,0.537,0.499,0.376,0.512,0.533,0.216,0.231,0.494,0.217,0.816,0.533,0.52,0.537,0.537,0.373,0.441,0.396,0.533,0.494,0.749,0.487,0.494,0.452,0.338,0.243,0.338,0.54],
};

/** Wider than any Latin letter but M and W in these faces, for characters outside ASCII. */
const FALLBACK_ADVANCE_EM = 0.75;
/** Kerning and rounding headroom, so the estimate errs towards wrapping. */
const WIDTH_SAFETY = 1.03;

/**
 * Characters the committed faces set, read from their cmaps: Eczar's Latin subset (Basic
 * Latin, Latin-1, most of Latin Extended-A, and the common punctuation and spaces) plus the
 * few spaces only Anek has. Satori falls back between the faces it was given, so a line in
 * Anek can borrow an Eczar glyph. Anything else would make next/og fetch a Google font at
 * render time (sending the text with it) or draw nothing; Devanagari would need shaping.
 * So it never reaches the og card. Regenerate this list if the font files change.
 */
// prettier-ignore
const LATIN_ONLY =
  /^[\t\n\r\u0020-\u007E\u00A0-\u0107\u010C-\u0113\u0116-\u011B\u011E-\u011F\u0122-\u0123\u012A-\u012B\u012E-\u0131\u0136-\u0137\u0139-\u013E\u0141-\u0148\u014C-\u014D\u0150-\u015B\u015E-\u0165\u016A-\u016B\u016E-\u0173\u0178-\u017E\u2002-\u2003\u2007-\u200D\u2013-\u2014\u2018-\u201A\u201C-\u201E\u2020-\u2022\u2026\u2030\u2039-\u203A\u2044\u20AC\u2122]*$/;

export function isLatinText(text: string): boolean {
  return LATIN_ONLY.test(text);
}

/** The text, or null when it holds anything the og card can't set correctly. */
export function latinOrNull(text: string | null | undefined): string | null {
  if (text == null) return null;
  const trimmed = text.trim();
  if (trimmed === "") return null;
  return isLatinText(trimmed) ? trimmed : null;
}

/** Estimated advance width of `text` in px. */
export function measureTextPx(text: string, face: OgFace, size_px: number, letter_spacing_px = 0): number {
  const table = ADVANCES[face];
  let em = 0;
  let count = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    em += code >= 0x20 && code <= 0x7e ? (table[code - 0x20] ?? FALLBACK_ADVANCE_EM) : FALLBACK_ADVANCE_EM;
    count += 1;
  }
  return (em * size_px + letter_spacing_px * count) * WIDTH_SAFETY;
}

/** Lines `text` takes when wrapped at word boundaries to `max_width_px`. */
export function lineCount(
  text: string,
  face: OgFace,
  size_px: number,
  max_width_px: number,
  letter_spacing_px = 0,
): number {
  const words = text.split(/\s+/).filter((word) => word !== "");
  if (words.length === 0) return 0;
  const space = measureTextPx(" ", face, size_px, letter_spacing_px);
  let lines = 1;
  let current = 0;
  for (const word of words) {
    const width = measureTextPx(word, face, size_px, letter_spacing_px);
    if (width > max_width_px) {
      // A word wider than the line breaks across lines on its own.
      if (current > 0) lines += 1;
      const pieces = Math.ceil(width / max_width_px);
      lines += pieces - 1;
      current = width - (pieces - 1) * max_width_px;
      continue;
    }
    if (current === 0) {
      current = width;
    } else if (current + space + width <= max_width_px) {
      current += space + width;
    } else {
      lines += 1;
      current = width;
    }
  }
  return lines;
}

/** Height of a text block in px: lines × size × line height. */
export function textBlockPx(
  text: string,
  face: OgFace,
  size_px: number,
  line_height: number,
  letter_spacing_px = 0,
  max_width_px = OG_BODY_WIDTH_PX,
): number {
  return lineCount(text, face, size_px, max_width_px, letter_spacing_px) * size_px * line_height;
}

/** The photo box's image size: the photo's own ratio, never enlarged, within 560 × `max_height_px` (1.3). */
export function photoDisplaySize(
  natural: { width: number; height: number },
  max_height_px: number,
): { width: number; height: number } {
  const scale = Math.min(1, OG_PHOTO_MAX_WIDTH_PX / natural.width, max_height_px / natural.height);
  // Clamp float overshoot, so the box never passes its caps by a rounding error.
  return {
    width: Math.min(natural.width * scale, OG_PHOTO_MAX_WIDTH_PX),
    height: Math.min(natural.height * scale, max_height_px),
  };
}

/** One fit-rule state: the photo's height cap, the gap scale and the compact function block. */
export type OgFit = { photo_max_h: number; gap: number; compact: boolean };

/**
 * The fit-rule states in the Chromium guard's order (1.3): full size; the photo cap from
 * 360 to 240 px in 20 px steps (only with a photo); the gaps from 0.9 to 0.5; then compact.
 */
export function fitSequence(has_photo: boolean): OgFit[] {
  const states: OgFit[] = [{ photo_max_h: OG_PHOTO_MAX_HEIGHT_PX, gap: 1, compact: false }];
  let photo_max_h = OG_PHOTO_MAX_HEIGHT_PX;
  if (has_photo) {
    for (let h = 360; h >= OG_PHOTO_MIN_HEIGHT_PX; h -= 20) {
      photo_max_h = h;
      states.push({ photo_max_h, gap: 1, compact: false });
    }
  }
  let gap = 1;
  for (let step = 9; step >= 5; step -= 1) {
    gap = step / 10;
    states.push({ photo_max_h, gap, compact: false });
  }
  states.push({ photo_max_h, gap, compact: true });
  return states;
}

/** A short label for the log line, in the guard's style ("photo:300,gap:0.8"). */
export function fitLabel(fit: OgFit, has_photo: boolean): string {
  const steps: string[] = [];
  if (has_photo && fit.photo_max_h < OG_PHOTO_MAX_HEIGHT_PX) steps.push(`photo:${fit.photo_max_h}`);
  if (fit.gap < 1) steps.push(`gap:${fit.gap.toFixed(1)}`);
  if (fit.compact) steps.push("compact");
  return steps.join(",");
}

/** The Hindi face the card uses for its typeface setting (1.3). */
export function hindiFaceOf(typeface: InviteTypeface): "eczar" | "tiro" {
  return typeface === "tiro_devanagari" ? "tiro" : "eczar";
}
