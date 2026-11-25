/**
 * Joins class names without merging them. The shared `cn` helper (tailwind-merge rules)
 * treats the design tokens `text-meta`, `text-table`, `text-body`, `text-heading`,
 * `text-panel` and `text-title` as colours, so `cn("text-meta text-ink-3")` drops the
 * size. The kit never passes both through `cn`; it joins them plainly instead.
 */
export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
