"use client";

import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent } from "react";
import { classifyPoll, createPoller } from "./poll-policy";

/** Final props (architecture 2.4, decision D97). Only the lead changes them. */
export type LiveRefreshProps = {
  /**
   * The poll endpoint: `/api/w/{wedding_id}/version` on planner screens, or
   * `/api/i/{token}/revision` on the guest page. Build it with `src/contracts/routes.ts`.
   */
  endpoint: string;
  /** Milliseconds between polls while the tab is visible: 2500 on planner screens, 10000 on the guest page. */
  interval_ms: number;
};

/**
 * The one poller per tab (architecture 2.4; decisions D37, D90). It renders nothing.
 *
 * - Polls `endpoint` every `interval_ms` while the tab is visible, and stops while it's hidden.
 * - Calls `router.refresh()` when the number moves, and once whenever the tab becomes visible
 *   or the window regains focus, whatever the number. A refresh keeps client state, so open
 *   forms and review cards survive it.
 * - After a 429 it waits 30 s and keeps the content on screen. A 401 stops it and refreshes
 *   once (through the proxy); a 403 or 404 stops it quietly.
 *
 * The rules live in `poll-policy.ts`. Mounting is the screens' job: once in the planner shell
 * (Lane B) and once on the guest page (Lane D). **Never mount it on `/setup`** (decision D79):
 * setup runs no poll and no focus refresh, so the experiment exposure isn't recorded again
 * and the draft isn't disturbed (flagsmith 5.3). Nor on `/login`, `/signup`, `/join/[token]`
 * or the render page.
 */
export function LiveRefresh({ endpoint, interval_ms }: LiveRefreshProps): null {
  const router = useRouter();
  const refresh = useEffectEvent(() => {
    router.refresh();
  });

  useEffect(() => {
    const poller = createPoller(interval_ms, {
      fetchOutcome: async (signal) => {
        const response = await fetch(endpoint, {
          cache: "no-store",
          headers: { accept: "application/json" },
          signal,
        });
        const body: unknown = response.ok ? await response.json().catch(() => null) : null;
        return classifyPoll(response.status, body);
      },
      refresh: () => refresh(),
      isVisible: () => document.visibilityState === "visible",
      now: () => performance.now(),
    });

    const onVisibilityChange = () => poller.onVisibilityChange();
    const onFocus = () => poller.onFocus();
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onFocus);
    poller.start();

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onFocus);
      poller.dispose();
    };
  }, [endpoint, interval_ms]);

  return null;
}
