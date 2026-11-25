import { cx } from "../kit/cx";

/** The exact badge text (acceptance 0.2; decision D21). */
export const SAMPLE_BADGE_TEXT = "Fictional demo data";

/**
 * The sample-data badge, shown in the shell header on every planner screen while the
 * wedding is a sample copy (`wedding_profile.is_sample`). A quiet chip on the maroon
 * cover: on-maroon-2 text and a 1 px border, never gold text.
 */
export function SampleBadge({ className }: { className?: string }) {
  return (
    <span
      className={cx(
        "inline-flex w-fit shrink-0 items-center whitespace-nowrap rounded-chip border border-on-maroon-2/50 px-2 text-meta text-on-maroon-2",
        className,
      )}
    >
      {SAMPLE_BADGE_TEXT}
    </span>
  );
}
