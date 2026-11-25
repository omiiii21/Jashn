import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  classifyPoll,
  createPoller,
  FOCUS_DEBOUNCE_MS,
  MIN_POLL_INTERVAL_MS,
  nextPollStep,
  POLL_TIMEOUT_MS,
  pollInterval,
  RATE_LIMIT_BACKOFF_MS,
  readPollNumber,
  shouldFocusRefresh,
  type PollOutcome,
} from "./poll-policy";

const PLANNER = 2_500;
const GUEST = 10_000;

describe("readPollNumber", () => {
  it("reads the planner version and the guest revision", () => {
    expect(readPollNumber({ version: 1043 })).toBe(1043);
    expect(readPollNumber({ revision: 3 })).toBe(3);
    expect(readPollNumber({ version: 0 })).toBe(0);
  });

  it("rejects anything that isn't a non-negative safe integer", () => {
    for (const body of [null, undefined, "7", 7, {}, { version: "7" }, { version: 1.5 }, { version: -1 }, { revision: Number.NaN }, { version: 2 ** 60 }]) {
      expect(readPollNumber(body)).toBeNull();
    }
  });
});

describe("classifyPoll", () => {
  it("classifies each status", () => {
    expect(classifyPoll(200, { version: 5 })).toEqual({ kind: "number", value: 5 });
    expect(classifyPoll(200, { nope: true })).toEqual({ kind: "error" });
    expect(classifyPoll(429, null)).toEqual({ kind: "rate_limited" });
    expect(classifyPoll(401, null)).toEqual({ kind: "unauthenticated" });
    expect(classifyPoll(403, null)).toEqual({ kind: "forbidden" });
    expect(classifyPoll(404, null)).toEqual({ kind: "forbidden" });
    for (const status of [0, 304, 400, 500, 502, 503]) {
      expect(classifyPoll(status, { version: 5 })).toEqual({ kind: "error" });
    }
  });
});

describe("pollInterval", () => {
  it("keeps sane intervals and floors bad ones", () => {
    expect(pollInterval(PLANNER)).toBe(PLANNER);
    expect(pollInterval(GUEST)).toBe(GUEST);
    expect(pollInterval(0)).toBe(MIN_POLL_INTERVAL_MS);
    expect(pollInterval(-5)).toBe(MIN_POLL_INTERVAL_MS);
    expect(pollInterval(Number.NaN)).toBe(PLANNER);
  });
});

describe("nextPollStep", () => {
  const num = (value: number): PollOutcome => ({ kind: "number", value });

  it("takes the first number as the baseline without refreshing", () => {
    expect(nextPollStep(null, num(7), PLANNER)).toEqual({ baseline: 7, refresh: false, next_delay_ms: PLANNER });
  });

  it("refreshes only when the number moves, either way", () => {
    expect(nextPollStep(7, num(7), PLANNER)).toEqual({ baseline: 7, refresh: false, next_delay_ms: PLANNER });
    expect(nextPollStep(7, num(8), PLANNER)).toEqual({ baseline: 8, refresh: true, next_delay_ms: PLANNER });
    expect(nextPollStep(8, num(2), PLANNER)).toEqual({ baseline: 2, refresh: true, next_delay_ms: PLANNER });
  });

  it("backs off to 30 s on a 429 and keeps the baseline (D90)", () => {
    expect(RATE_LIMIT_BACKOFF_MS).toBe(30_000);
    expect(nextPollStep(3, { kind: "rate_limited" }, GUEST)).toEqual({ baseline: 3, refresh: false, next_delay_ms: 30_000 });
    // Never shorter than the normal interval.
    expect(nextPollStep(3, { kind: "rate_limited" }, 60_000).next_delay_ms).toBe(60_000);
  });

  it("returns to the interval after a good poll", () => {
    expect(nextPollStep(3, num(3), GUEST).next_delay_ms).toBe(GUEST);
  });

  it("stops on 401 with one refresh, and on 403 or 404 quietly", () => {
    expect(nextPollStep(3, { kind: "unauthenticated" }, PLANNER)).toEqual({ baseline: 3, refresh: true, next_delay_ms: null });
    expect(nextPollStep(3, { kind: "forbidden" }, PLANNER)).toEqual({ baseline: 3, refresh: false, next_delay_ms: null });
  });

  it("keeps trying at the interval after an error", () => {
    expect(nextPollStep(null, { kind: "error" }, PLANNER)).toEqual({ baseline: null, refresh: false, next_delay_ms: PLANNER });
  });
});

describe("shouldFocusRefresh", () => {
  it("debounces focus refreshes", () => {
    expect(shouldFocusRefresh(null, 0)).toBe(true);
    expect(shouldFocusRefresh(1_000, 1_000)).toBe(false);
    expect(shouldFocusRefresh(1_000, 1_000 + FOCUS_DEBOUNCE_MS - 1)).toBe(false);
    expect(shouldFocusRefresh(1_000, 1_000 + FOCUS_DEBOUNCE_MS)).toBe(true);
    expect(shouldFocusRefresh(5_000, 1_000)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The poller, on fake timers
// ---------------------------------------------------------------------------

type Pending = { resolve: (o: PollOutcome) => void; reject: (e: Error) => void; signal: AbortSignal };

function harness(interval_ms: number) {
  let visible = true;
  const pending: Pending[] = [];
  const refresh = vi.fn();
  const fetchOutcome = vi.fn(
    (signal: AbortSignal) =>
      new Promise<PollOutcome>((resolve, reject) => {
        pending.push({ resolve, reject, signal });
        signal.addEventListener("abort", () => reject(new Error("aborted")));
      }),
  );
  const poller = createPoller(interval_ms, {
    fetchOutcome,
    refresh,
    isVisible: () => visible,
    now: () => Date.now(),
  });
  /** Answers the oldest unanswered request and lets the poller react. */
  async function answer(outcome: PollOutcome) {
    const next = pending.shift();
    if (!next) throw new Error("no request in flight");
    next.resolve(outcome);
    await vi.advanceTimersByTimeAsync(0);
  }
  function setVisible(value: boolean) {
    visible = value;
    poller.onVisibilityChange();
  }
  return { poller, refresh, fetchOutcome, pending, answer, setVisible };
}

const n = (value: number): PollOutcome => ({ kind: "number", value });

describe("createPoller", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("polls at once, keeps the first number, and refreshes when it moves", async () => {
    const h = harness(PLANNER);
    h.poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.fetchOutcome).toHaveBeenCalledTimes(1);
    await h.answer(n(10));
    expect(h.refresh).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(PLANNER - 1);
    expect(h.fetchOutcome).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(h.fetchOutcome).toHaveBeenCalledTimes(2);
    await h.answer(n(10));
    expect(h.refresh).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(PLANNER);
    await h.answer(n(11));
    expect(h.refresh).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(PLANNER);
    await h.answer(n(11));
    expect(h.refresh).toHaveBeenCalledTimes(1);
    h.poller.dispose();
  });

  it("waits 30 s after a 429, then goes back to the interval", async () => {
    const h = harness(GUEST);
    h.poller.start();
    await vi.advanceTimersByTimeAsync(0);
    await h.answer(n(3));
    await vi.advanceTimersByTimeAsync(GUEST);
    await h.answer({ kind: "rate_limited" });
    expect(h.refresh).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(RATE_LIMIT_BACKOFF_MS - 1);
    expect(h.fetchOutcome).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(h.fetchOutcome).toHaveBeenCalledTimes(3);
    await h.answer(n(3));

    await vi.advanceTimersByTimeAsync(GUEST);
    expect(h.fetchOutcome).toHaveBeenCalledTimes(4);
    h.poller.dispose();
  });

  it("stops after a 401 with one refresh, and no loop", async () => {
    const h = harness(PLANNER);
    h.poller.start();
    await vi.advanceTimersByTimeAsync(0);
    await h.answer({ kind: "unauthenticated" });
    expect(h.refresh).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(PLANNER * 20);
    expect(h.fetchOutcome).toHaveBeenCalledTimes(1);
    expect(h.refresh).toHaveBeenCalledTimes(1);
    h.poller.dispose();
  });

  it.each([403, 404])("stops quietly after a %i", async (status) => {
    const h = harness(GUEST);
    h.poller.start();
    await vi.advanceTimersByTimeAsync(0);
    await h.answer(classifyPoll(status, null));
    await vi.advanceTimersByTimeAsync(GUEST * 20);
    expect(h.fetchOutcome).toHaveBeenCalledTimes(1);
    expect(h.refresh).not.toHaveBeenCalled();
    h.poller.dispose();
  });

  it("lifts a stop on the next focus", async () => {
    const h = harness(PLANNER);
    h.poller.start();
    await vi.advanceTimersByTimeAsync(0);
    await h.answer(n(4));
    await vi.advanceTimersByTimeAsync(PLANNER);
    await h.answer({ kind: "forbidden" });
    await vi.advanceTimersByTimeAsync(PLANNER * 4);
    expect(h.fetchOutcome).toHaveBeenCalledTimes(2);

    h.poller.onFocus();
    expect(h.refresh).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(PLANNER);
    expect(h.fetchOutcome).toHaveBeenCalledTimes(3);
    await h.answer(n(4));
    expect(h.refresh).toHaveBeenCalledTimes(1);
    h.poller.dispose();
  });

  it("keeps trying at the interval after network errors", async () => {
    const h = harness(PLANNER);
    h.poller.start();
    await vi.advanceTimersByTimeAsync(0);
    await h.answer({ kind: "error" });
    await vi.advanceTimersByTimeAsync(PLANNER);
    expect(h.fetchOutcome).toHaveBeenCalledTimes(2);
    // A rejected fetch is a network error too.
    h.pending.shift()?.reject(new TypeError("Failed to fetch"));
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(PLANNER);
    expect(h.fetchOutcome).toHaveBeenCalledTimes(3);
    h.poller.dispose();
  });

  it("aborts a hung request after the timeout and polls again", async () => {
    const h = harness(PLANNER);
    h.poller.start();
    await vi.advanceTimersByTimeAsync(0);
    const first = h.pending[0];
    await vi.advanceTimersByTimeAsync(POLL_TIMEOUT_MS);
    expect(first?.signal.aborted).toBe(true);
    h.pending.shift();
    await vi.advanceTimersByTimeAsync(PLANNER);
    expect(h.fetchOutcome).toHaveBeenCalledTimes(2);
    h.poller.dispose();
  });

  it("keeps one request in flight at a time", async () => {
    const h = harness(PLANNER);
    h.poller.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(FOCUS_DEBOUNCE_MS);
    h.poller.onFocus();
    h.poller.onFocus();
    await vi.advanceTimersByTimeAsync(PLANNER * 3);
    expect(h.fetchOutcome).toHaveBeenCalledTimes(1);
    expect(h.pending).toHaveLength(1);
    h.poller.dispose();
  });

  it("stops while hidden and refreshes once on return, even with focus too", async () => {
    const h = harness(PLANNER);
    h.poller.start();
    await vi.advanceTimersByTimeAsync(0);
    await h.answer(n(1));

    h.setVisible(false);
    await vi.advanceTimersByTimeAsync(PLANNER * 10);
    expect(h.fetchOutcome).toHaveBeenCalledTimes(1);

    h.setVisible(true);
    h.poller.onFocus();
    expect(h.refresh).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(PLANNER);
    expect(h.fetchOutcome).toHaveBeenCalledTimes(2);
    await h.answer(n(1));
    expect(h.refresh).toHaveBeenCalledTimes(1);

    // A later, separate focus refreshes again, whatever the number.
    await vi.advanceTimersByTimeAsync(FOCUS_DEBOUNCE_MS);
    h.poller.onFocus();
    expect(h.refresh).toHaveBeenCalledTimes(2);
    h.poller.dispose();
  });

  it("aborts the request in flight when the tab hides, without a refresh", async () => {
    const h = harness(PLANNER);
    h.poller.start();
    await vi.advanceTimersByTimeAsync(0);
    const first = h.pending[0];
    h.setVisible(false);
    expect(first?.signal.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(PLANNER * 4);
    expect(h.fetchOutcome).toHaveBeenCalledTimes(1);
    expect(h.refresh).not.toHaveBeenCalled();
    h.poller.dispose();
  });

  it("doesn't focus-refresh right after mount", async () => {
    const h = harness(PLANNER);
    h.poller.start();
    h.poller.onFocus();
    expect(h.refresh).not.toHaveBeenCalled();
    h.poller.dispose();
  });

  it("does nothing after dispose", async () => {
    const h = harness(PLANNER);
    h.poller.start();
    await vi.advanceTimersByTimeAsync(0);
    const first = h.pending[0];
    h.poller.dispose();
    expect(first?.signal.aborted).toBe(true);
    h.poller.onFocus();
    h.setVisible(true);
    await vi.advanceTimersByTimeAsync(PLANNER * 4);
    expect(h.fetchOutcome).toHaveBeenCalledTimes(1);
    expect(h.refresh).not.toHaveBeenCalled();
  });

  it("starting hidden polls nothing until the tab shows", async () => {
    const h = harness(GUEST);
    h.setVisible(false);
    h.poller.start();
    await vi.advanceTimersByTimeAsync(GUEST * 3);
    expect(h.fetchOutcome).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(FOCUS_DEBOUNCE_MS);
    h.setVisible(true);
    expect(h.refresh).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(GUEST);
    expect(h.fetchOutcome).toHaveBeenCalledTimes(1);
    h.poller.dispose();
  });
});
