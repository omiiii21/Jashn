"use client";

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
 * The one poller per tab (architecture 2.4). Contracts stub: it renders nothing and
 * polls nothing. Lane A ships the real poller in the 10:45 batch (poll while visible,
 * `router.refresh()` when the number moves and on focus, back off to 30 s after a 429),
 * keeping these props.
 */
export function LiveRefresh(props: LiveRefreshProps): null {
  void props;
  return null;
}
