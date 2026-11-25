import "server-only";

import type { InviteTheme, InviteTypeface } from "@/contracts/domain";
import { hindiFaceOf } from "./og-layout";

/**
 * The og card's two Hindi lines (export-and-recovery 3.7). Satori can't shape Devanagari,
 * so the default heading and Hindi line are transparent 2× PNGs in `public/card/`,
 * captured in local Chrome from the card's own faces, sizes and colours (1.3). A line is
 * drawn only when the wedding's text equals the captured text exactly; any other text is
 * omitted, never set wrong.
 *
 * Each PNG holds the text's line box plus `pad_css_px` on every side, so marks above and
 * below the line box aren't clipped. The card places it with a negative margin of the
 * same size, so the line takes the same room as the Chromium card's line box.
 */

/** design-direction §5 and demo-data §11: the defaults the studio starts from. */
export const OG_HEADING_HI_TEXT = "शुभ विवाह";
export const OG_WORDING_HI_TEXT = "आपकी उपस्थिति से हमें अत्यंत प्रसन्नता होगी।";

export type OgHindiLineId =
  | "heading-hi-eczar-maroon"
  | "heading-hi-eczar-peacock"
  | "heading-hi-tiro-maroon"
  | "heading-hi-tiro-peacock"
  | "wording-hi-eczar"
  | "wording-hi-tiro";

export type OgHindiLine = {
  id: OgHindiLineId;
  /** Size in CSS px, half the PNG's pixel size. */
  width_css_px: number;
  height_css_px: number;
  /** Transparent margin around the line box on every side. */
  pad_css_px: number;
};

const PAD = 16;

/** PNG sizes from the capture (2× device pixels, halved). */
export const OG_HINDI_LINES: Record<OgHindiLineId, OgHindiLine> = {
  "heading-hi-eczar-maroon": { id: "heading-hi-eczar-maroon", width_css_px: 248, height_css_px: 102, pad_css_px: PAD },
  "heading-hi-eczar-peacock": { id: "heading-hi-eczar-peacock", width_css_px: 248, height_css_px: 102, pad_css_px: PAD },
  "heading-hi-tiro-maroon": { id: "heading-hi-tiro-maroon", width_css_px: 245, height_css_px: 102, pad_css_px: PAD },
  "heading-hi-tiro-peacock": { id: "heading-hi-tiro-peacock", width_css_px: 245, height_css_px: 102, pad_css_px: PAD },
  "wording-hi-eczar": { id: "wording-hi-eczar", width_css_px: 488, height_css_px: 74, pad_css_px: PAD },
  "wording-hi-tiro": { id: "wording-hi-tiro", width_css_px: 489, height_css_px: 74, pad_css_px: PAD },
};

function same(a: string | null | undefined, b: string): boolean {
  return typeof a === "string" && a.trim().normalize("NFC") === b.normalize("NFC");
}

/** The heading PNG for this card, or null when the heading isn't the captured text. */
export function headingLineFor(
  heading_hi: string | null | undefined,
  theme: InviteTheme,
  typeface: InviteTypeface,
): OgHindiLine | null {
  if (!same(heading_hi, OG_HEADING_HI_TEXT)) return null;
  const colour = theme === "peacock_gold" ? "peacock" : "maroon";
  return OG_HINDI_LINES[`heading-hi-${hindiFaceOf(typeface)}-${colour}`];
}

/** The Hindi-line PNG for this card, or null when the line isn't the captured text. */
export function wordingLineFor(wording_hi: string | null | undefined, typeface: InviteTypeface): OgHindiLine | null {
  if (!same(wording_hi, OG_WORDING_HI_TEXT)) return null;
  return OG_HINDI_LINES[`wording-hi-${hindiFaceOf(typeface)}`];
}
