import { Anek_Devanagari, Eczar, Tiro_Devanagari_Hindi } from "next/font/google";

/**
 * The three typefaces (design-direction §4; architecture 4.1). Each one sets a CSS
 * variable on the element that carries its `.variable` class, so put `fontVariables`
 * on <html> and map the variables onto Tailwind's font tokens in globals.css.
 *
 * Subsets and axes were checked against next@16.4.6's
 * dist/compiled/@next/font/dist/google/font-data.json: Anek Devanagari is there,
 * so Mukta (the fallback, export-and-recovery.md 1.5) isn't needed.
 */

/** Display serif for names, function names, wording and page titles. Variable weight 400 to 800. */
export const displayFont = Eczar({
  subsets: ["latin", "latin-ext", "devanagari"],
  variable: "--font-display",
  display: "swap",
});

/** The UI sans for English, Hindi and Hinglish. Variable weight 100 to 800, plus the width axis (75 to 125). */
export const bodyFont = Anek_Devanagari({
  subsets: ["latin", "latin-ext", "devanagari"],
  axes: ["wdth"],
  variable: "--font-body",
  display: "swap",
});

/** The optional Hindi text face for the invitation studio. Static 400, upright and italic; not preloaded. */
export const hindiFont = Tiro_Devanagari_Hindi({
  subsets: ["latin", "latin-ext", "devanagari"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-hindi",
  display: "swap",
  preload: false,
});

/** The CSS variable each face sets, for globals.css and inline styles. */
export const FONT_CSS_VARIABLES = {
  display: "--font-display",
  body: "--font-body",
  hindi: "--font-hindi",
} as const;

/** Class names that define all three variables. Put them on <html>. */
export const fontVariables = `${displayFont.variable} ${bodyFont.variable} ${hindiFont.variable}`;
