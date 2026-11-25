import { cx } from "../kit/cx";

/** The first user-perceived character, so a Devanagari name keeps its matra. */
function firstGrapheme(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) return "";
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segments = new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(trimmed);
    for (const { segment } of segments) return segment.toLocaleUpperCase("en-IN");
  }
  return Array.from(trimmed)[0]?.toLocaleUpperCase("en-IN") ?? "";
}

type SealProps = {
  bride_name: string;
  groom_name: string;
  /** "rail" for the desktop rail (56 px), "header" for the phone header (44 px, so the initials clear the inner ring). */
  size?: "rail" | "header";
  className?: string;
};

/**
 * The seal (design-direction 6.1): the couple's initials in Eczar 600 inside two
 * concentric gold rings, gold on maroon. Decorative: the wedding name always sits beside
 * it as text, so it is hidden from assistive technology.
 */
export function Seal({ bride_name, groom_name, size = "rail", className }: SealProps) {
  const initials = `${firstGrapheme(bride_name)}${firstGrapheme(groom_name)}`;
  const rail = size === "rail";
  return (
    <span
      aria-hidden="true"
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-full border border-gold",
        rail ? "size-14 p-1" : "size-11 p-1",
        className,
      )}
    >
      <span
        className={cx(
          "flex size-full items-center justify-center rounded-full border border-gold font-serif font-semibold text-gold",
          rail ? "text-heading" : "text-meta",
        )}
      >
        {initials}
      </span>
    </span>
  );
}
