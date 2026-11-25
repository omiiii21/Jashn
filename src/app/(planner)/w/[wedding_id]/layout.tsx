import type { ReactNode } from "react";

import { LiveRefresh } from "@/components/live/LiveRefresh";
import { VoiceDock } from "@/components/voice/VoiceDock";

/** Final props (architecture 4.3, decision D97): Next's `children` and `params`. */
type WeddingShellLayoutProps = {
  children: ReactNode;
  params: Promise<{ wedding_id: string }>;
};

/** Planner screens poll the version every 2.5 s while visible (architecture 2.4). */
const VERSION_POLL_MS = 2500;

/**
 * The planner shell for one wedding. Contracts stub: a bare shell that renders the page,
 * the voice dock in the header slot and the version poller. Lane B replaces it with the
 * real shell in the 10:45 batch, keeping these props.
 */
export default async function WeddingShellLayout({ children, params }: WeddingShellLayoutProps) {
  const { wedding_id } = await params;

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="flex items-center justify-end gap-2 px-4 py-3">
        <VoiceDock wedding_id={wedding_id} />
      </header>
      <main className="flex-1">{children}</main>
      <LiveRefresh endpoint={`/api/w/${encodeURIComponent(wedding_id)}/version`} interval_ms={VERSION_POLL_MS} />
    </div>
  );
}
