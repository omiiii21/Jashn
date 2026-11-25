/**
 * The studio's workspace control classes, from Lane E's role tokens (DESIGN.md "Buttons and
 * chips", "Containers and fields"): 44 px controls, 8 px corners, paper fields with a
 * line-strong border, maroon only on the primary action. Focus rings come from the base
 * layer (2 px ring at 2 px offset).
 *
 * Plain class strings on native elements: the shared primitives merge classes with `cn`,
 * which reads the custom size tokens (`text-body`, `rounded-control`) as colours or
 * unknown values, so overrides through them drop or double up.
 */
export const FIELD_CLASS =
  "block w-full min-w-0 rounded-control border border-line-strong bg-paper px-3 text-body text-ink placeholder:text-ink-3 aria-invalid:border-overdue";

export const PRIMARY_BUTTON_CLASS =
  "inline-flex h-11 min-w-32 items-center justify-center gap-2 rounded-control bg-maroon px-4 text-body font-medium text-paper hover:bg-maroon-deep disabled:cursor-not-allowed disabled:bg-ivory-deep disabled:text-ink-3";

export const SECONDARY_BUTTON_CLASS =
  "inline-flex h-11 items-center justify-center gap-2 rounded-control border border-line-strong bg-paper px-4 text-body font-medium text-ink hover:bg-ivory disabled:cursor-not-allowed disabled:bg-ivory-deep disabled:text-ink-3";

export const GHOST_BUTTON_CLASS =
  "inline-flex h-11 items-center justify-center gap-2 rounded-control px-4 text-body font-medium text-ink-2 hover:bg-ivory disabled:cursor-not-allowed disabled:text-ink-3";
