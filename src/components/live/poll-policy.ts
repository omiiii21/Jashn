/**
 * The timing rules behind `LiveRefresh` (architecture 2.4; domain-and-data 5.6; decisions D37,
 * D79, D90), kept free of React and the DOM so they run in Node under Vitest.
 *
 * - Poll the endpoint every `interval_ms` while the tab is visible, one request at a time.
 * - Remember the first number seen; when a later poll answers a different one, refresh.
 * - A 429 backs the next poll off to 30 s and keeps the page as it is; the first good poll
 *   returns to `interval_ms`.
 * - A 401 stops polling and refreshes once, which goes through the proxy, so the session is
 *   renewed or the user is sent to `/login`. A 403 or 404 stops polling quietly. A later
 *   focus or visibility change (a user action, so never a loop) lifts the stop.
 * - Network errors, timeouts, 5xx answers and unreadable bodies keep polling at the interval.
 * - The tab becoming visible, or the window regaining focus, refreshes once whatever the
 *   number, which is how flag flips reach an open page (flagsmith 6.9). The two events
 *   usually fire together, so they share a one-second debounce.
 */
import { GUEST_POLL_BACKOFF_MS, PLANNER_POLL_MS } from "@/contracts/api";

/** The delay after a 429 (D90). */
export const RATE_LIMIT_BACKOFF_MS = GUEST_POLL_BACKOFF_MS;
/** `visibilitychange` and `focus` within this window give one refresh. */
export const FOCUS_DEBOUNCE_MS = 1_000;
/** A poll that hasn't answered by then is aborted and counted as a network error. */
export const POLL_TIMEOUT_MS = 10_000;
/** The floor for a bad `interval_ms` prop, so a typo can't flood the server. */
export const MIN_POLL_INTERVAL_MS = 1_000;

/** What one poll came back with, already classified. */
export type PollOutcome =
  | { kind: "number"; value: number }
  | { kind: "rate_limited" }
  | { kind: "unauthenticated" }
  | { kind: "forbidden" }
  | { kind: "error" };

/** The `version` of a planner poll or the `revision` of a guest poll; null when neither is valid. */
export function readPollNumber(body: unknown): number | null {
  if (typeof body !== "object" || body === null) return null;
  const record = body as Record<string, unknown>;
  const value = "version" in record ? record.version : record.revision;
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

/** Turns an HTTP status and parsed body into an outcome. `body` matters only on a 2xx. */
export function classifyPoll(status: number, body: unknown): PollOutcome {
  if (status === 429) return { kind: "rate_limited" };
  if (status === 401) return { kind: "unauthenticated" };
  if (status === 403 || status === 404) return { kind: "forbidden" };
  if (status >= 200 && status < 300) {
    const value = readPollNumber(body);
    return value === null ? { kind: "error" } : { kind: "number", value };
  }
  return { kind: "error" };
}

/** The interval actually used: the prop when sane, else the planner default, never under 1 s. */
export function pollInterval(interval_ms: number): number {
  if (!Number.isFinite(interval_ms)) return PLANNER_POLL_MS;
  return Math.max(MIN_POLL_INTERVAL_MS, Math.round(interval_ms));
}

export type PollStep = {
  /** The number later polls compare against. */
  baseline: number | null;
  /** Call `router.refresh()` now. */
  refresh: boolean;
  /** Milliseconds until the next poll, or null to stop until the next focus. */
  next_delay_ms: number | null;
};

/** What to do after one poll. `interval_ms` should already have gone through `pollInterval`. */
export function nextPollStep(baseline: number | null, outcome: PollOutcome, interval_ms: number): PollStep {
  switch (outcome.kind) {
    case "number":
      return {
        baseline: outcome.value,
        refresh: baseline !== null && outcome.value !== baseline,
        next_delay_ms: interval_ms,
      };
    case "rate_limited":
      return { baseline, refresh: false, next_delay_ms: Math.max(RATE_LIMIT_BACKOFF_MS, interval_ms) };
    case "unauthenticated":
      return { baseline, refresh: true, next_delay_ms: null };
    case "forbidden":
      return { baseline, refresh: false, next_delay_ms: null };
    case "error":
      return { baseline, refresh: false, next_delay_ms: interval_ms };
  }
}

/** Whether a focus or visibility event should refresh, given the last focus refresh's time. */
export function shouldFocusRefresh(last_at: number | null, now: number, debounce_ms = FOCUS_DEBOUNCE_MS): boolean {
  if (last_at === null) return true;
  // A clock that went backwards counts as "long enough ago".
  return now < last_at || now - last_at >= debounce_ms;
}

// ---------------------------------------------------------------------------
// The poller: the rules above wired to timers, with the DOM and fetch injected
// ---------------------------------------------------------------------------

export type PollerDeps = {
  /** One request to the endpoint, honouring `signal`. A rejection counts as a network error. */
  fetchOutcome: (signal: AbortSignal) => Promise<PollOutcome>;
  /** `router.refresh()`. */
  refresh: () => void;
  /** `document.visibilityState === "visible"`. */
  isVisible: () => boolean;
  /** A monotonic clock in milliseconds, such as `performance.now()`. */
  now: () => number;
};

export type Poller = {
  /** Polls at once when visible. The page was just rendered, so it doesn't refresh. */
  start: () => void;
  /** Hidden: stop and abort. Visible: refresh once (debounced) and resume. */
  onVisibilityChange: () => void;
  /** Window focus: refresh once (debounced) and resume. */
  onFocus: () => void;
  /** Unmount: stop and abort the request in flight. */
  dispose: () => void;
};

export function createPoller(interval_ms: number, deps: PollerDeps): Poller {
  const interval = pollInterval(interval_ms);
  let baseline: number | null = null;
  let delay = interval;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inflight: AbortController | null = null;
  let stopped = false;
  let disposed = false;
  let lastFocusRefreshAt: number | null = null;

  function clearTimer(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function cancelInflight(): void {
    const controller = inflight;
    inflight = null;
    controller?.abort();
  }

  function schedule(ms: number): void {
    clearTimer();
    if (disposed || stopped || !deps.isVisible()) return;
    timer = setTimeout(() => {
      timer = null;
      void poll();
    }, ms);
  }

  async function poll(): Promise<void> {
    if (disposed || stopped || inflight !== null || !deps.isVisible()) return;
    const controller = new AbortController();
    inflight = controller;
    const timeout = setTimeout(() => controller.abort(), POLL_TIMEOUT_MS);
    let outcome: PollOutcome;
    try {
      outcome = await deps.fetchOutcome(controller.signal);
    } catch {
      outcome = { kind: "error" };
    } finally {
      clearTimeout(timeout);
    }
    // Cancelled by a hide or an unmount: whoever cancelled it decides what happens next.
    if (inflight !== controller) return;
    inflight = null;
    if (disposed) return;

    const step = nextPollStep(baseline, outcome, interval);
    baseline = step.baseline;
    if (step.refresh) deps.refresh();
    if (step.next_delay_ms === null) {
      stopped = true;
      clearTimer();
      return;
    }
    delay = step.next_delay_ms;
    schedule(delay);
  }

  function focusRefresh(): void {
    const now = deps.now();
    if (!shouldFocusRefresh(lastFocusRefreshAt, now)) return;
    lastFocusRefreshAt = now;
    deps.refresh();
  }

  function resume(): void {
    // A focus lifts a stop: after a 401 the refresh has renewed the session or left the page.
    stopped = false;
    if (timer === null && inflight === null) schedule(delay);
  }

  return {
    start() {
      if (disposed) return;
      lastFocusRefreshAt = deps.now();
      schedule(0);
    },
    onVisibilityChange() {
      if (disposed) return;
      if (deps.isVisible()) {
        focusRefresh();
        resume();
      } else {
        clearTimer();
        cancelInflight();
      }
    },
    onFocus() {
      if (disposed || !deps.isVisible()) return;
      focusRefresh();
      resume();
    },
    dispose() {
      disposed = true;
      clearTimer();
      cancelInflight();
    },
  };
}
