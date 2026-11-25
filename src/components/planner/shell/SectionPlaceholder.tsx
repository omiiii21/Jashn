import type { ReactNode } from "react";

/**
 * A section that isn't built yet: its h1 and one plain sentence about what will be here,
 * so every nav link opens a real page (brief B1). Server-safe.
 */
export function SectionPlaceholder({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <h1 className="font-serif text-title text-ink">{title}</h1>
      <p className="max-w-prose text-body text-ink-2">{children}</p>
    </div>
  );
}
