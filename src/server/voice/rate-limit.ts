import "server-only";

/**
 * The voice rate limit (domain V10, voice.md 1.4 check 4): at most 12 turns a minute and
 * 300 a day per user, before any Sarvam call, answering 429 `rate_limited`.
 *
 * In memory per instance today. V10 counts the user's voice_turns rows; once Lane A's store
 * lands, the counts can come from the table instead behind this same interface.
 * A hit is recorded only when a turn is accepted (after the validation and replay checks),
 * the same rows V10 would count.
 */

export const VOICE_TURNS_PER_MINUTE = 12;
export const VOICE_TURNS_PER_DAY = 300;

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

export type RateLimitDecision = { ok: true } | { ok: false; retry_after_s: number };

export interface VoiceRateLimiter {
  check(user_id: string, now_ms?: number): RateLimitDecision;
  record(user_id: string, now_ms?: number): void;
}

type State = Map<string, number[]>;

export function createMemoryRateLimiter(
  limits: { per_minute?: number; per_day?: number } = {},
  state: State = new Map(),
): VoiceRateLimiter {
  const perMinute = limits.per_minute ?? VOICE_TURNS_PER_MINUTE;
  const perDay = limits.per_day ?? VOICE_TURNS_PER_DAY;

  const hitsFor = (user_id: string, now: number) => {
    const kept = (state.get(user_id) ?? []).filter((at) => now - at < DAY_MS);
    state.set(user_id, kept);
    return kept;
  };

  return {
    check(user_id, now_ms = Date.now()) {
      const hits = hitsFor(user_id, now_ms);
      const lastMinute = hits.filter((at) => now_ms - at < MINUTE_MS);
      if (lastMinute.length >= perMinute) {
        const oldest = Math.min(...lastMinute);
        return { ok: false, retry_after_s: Math.max(1, Math.ceil((oldest + MINUTE_MS - now_ms) / 1000)) };
      }
      if (hits.length >= perDay) {
        const oldest = Math.min(...hits);
        return { ok: false, retry_after_s: Math.max(1, Math.ceil((oldest + DAY_MS - now_ms) / 1000)) };
      }
      return { ok: true };
    },
    record(user_id, now_ms = Date.now()) {
      hitsFor(user_id, now_ms).push(now_ms);
    },
  };
}

const GLOBAL_KEY = "__jashn_voice_rate_limit__";

/** The app's limiter, kept on globalThis so dev hot reloads keep the counts. */
export function getVoiceRateLimiter(): VoiceRateLimiter {
  const holder = globalThis as unknown as Record<string, State | undefined>;
  let state = holder[GLOBAL_KEY];
  if (!state) {
    state = new Map();
    holder[GLOBAL_KEY] = state;
  }
  return createMemoryRateLimiter({}, state);
}
