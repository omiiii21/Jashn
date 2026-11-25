import "server-only";

import { after } from "next/server";

import {
  expectedEnvLabel,
  FLAG_EVENTS,
  FLAG_KEYS,
  FLAGSMITH_EVENTS_URL,
  FLAGSMITH_SDK_LABEL,
  FLAGSMITH_TIMEOUT_SECONDS,
  SELFCHECK_CACHE_MS,
  SELFCHECK_IDENTITY,
  type FlagsSelfCheck,
} from "@/contracts/flags";

import { flagsmithIdSalt, flagsmithServerKey } from "./env";
import { envLabelOf, evaluateEnvironment, type EnvironmentEvaluation } from "./evaluate";

/**
 * The self-check (flagsmith 6.7): items 1–5, the 60 s cached summary `/api/health` returns,
 * and the once-per-instance run on first use (inside `after()`). Never logs a key.
 */

/** Flags the spec names that aren't created today; listed without failing the check (6.7 item 3). */
export const NOT_CREATED_FLAGS = ["image_extraction_provider"] as const;

/** An instant in IST, for example 2026-11-25T10:41:07+05:30 (AGENTS.md rule 9). */
export function nowInKolkata(now: number = Date.now()): string {
  const shifted = new Date(now + 330 * 60_000);
  return `${shifted.toISOString().slice(0, 19)}+05:30`;
}

export function keyType(key: string | null): FlagsSelfCheck["key_type"] {
  if (!key) return "missing";
  return key.startsWith("ser.") ? "server" : "client";
}

/** Item 5: one direct POST of `jashn_selfcheck` to the events API; the status, or null. */
async function eventsProbe(key: string): Promise<number | null> {
  try {
    const response = await fetch(FLAGSMITH_EVENTS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8", "X-Environment-Key": key },
      body: JSON.stringify({
        events: [
          {
            event: FLAG_EVENTS.selfcheck,
            feature_name: null,
            identifier: SELFCHECK_IDENTITY,
            value: null,
            traits: null,
            metadata: null,
            timestamp: Date.now(),
          },
        ],
      }),
      signal: AbortSignal.timeout(FLAGSMITH_TIMEOUT_SECONDS * 1000),
    });
    return response.status;
  } catch {
    return null;
  }
}

const ITEM_NAMES: Record<number, string> = {
  1: "key-and-salt",
  2: "environment-flags",
  3: "every-flag-from-flagsmith",
  4: "env-label",
  5: "events-probe",
};

/** Runs items 1–5 once. Never throws. */
export async function runSelfCheck(): Promise<FlagsSelfCheck> {
  return (await runSelfCheckWithFlags()).summary;
}

/**
 * Items 1–5 plus the environment evaluation they read (the drawer's full check shows each
 * flag's value and reason from it, at no extra request). Never throws.
 */
export async function runSelfCheckWithFlags(): Promise<{ summary: FlagsSelfCheck; environment: EnvironmentEvaluation | null }> {
  const expected_env = expectedEnvLabel(process.env.NODE_ENV);
  const key = flagsmithServerKey();
  const salt = flagsmithIdSalt();
  const key_type = keyType(key);
  try {
    const [environment, events_probe_status] = await Promise.all([
      evaluateEnvironment(),
      key ? eventsProbe(key) : Promise.resolve(null),
    ]);
    const fallback_flags = FLAG_KEYS.filter((flag) => environment.flags[flag].fallback);
    const env_label = envLabelOf(environment.flags.env_label);
    const not_created = NOT_CREATED_FLAGS.filter((flag) => !environment.returned_keys.includes(flag));

    const failed: number[] = [];
    if (!key || !salt || key_type !== "server") failed.push(1);
    if (!environment.reached) failed.push(2);
    if (fallback_flags.length > 0) failed.push(3);
    if (env_label !== expected_env) failed.push(4);
    if (events_probe_status === null || events_probe_status < 200 || events_probe_status > 299) failed.push(5);

    const ok = failed.length === 0;
    logResult(failed);
    const summary: FlagsSelfCheck = {
      ok,
      expected_env,
      env_label,
      key_type,
      fallback_flags,
      not_created,
      events_probe_status,
      experiment_events: env_label === expected_env && fallback_flags.length === 0 ? "enabled" : "off",
      latency_ms: environment.reached ? environment.latency_ms : null,
      sdk: FLAGSMITH_SDK_LABEL,
      checked_at: nowInKolkata(),
    };
    return { summary, environment };
  } catch {
    logResult([1, 2, 3, 4, 5]);
    const summary: FlagsSelfCheck = {
      ok: false,
      expected_env,
      env_label: "unknown",
      key_type,
      fallback_flags: [...FLAG_KEYS],
      not_created: [...NOT_CREATED_FLAGS],
      events_probe_status: null,
      experiment_events: "off",
      latency_ms: null,
      sdk: FLAGSMITH_SDK_LABEL,
      checked_at: nowInKolkata(),
    };
    return { summary, environment: null };
  }
}

function logResult(failed: number[]): void {
  if (failed.length === 0) {
    console.info("flagsmith-selfcheck ok");
    return;
  }
  console.warn(`flagsmith-selfcheck FAILED ${failed.map((item) => `${item}:${ITEM_NAMES[item]}`).join(" ")}`);
}

let cached: { at: number; summary: FlagsSelfCheck } | null = null;
let inflight: Promise<FlagsSelfCheck> | null = null;

/**
 * The `flags` summary for `/api/health`: the instance's latest result while under 60 s old,
 * otherwise a fresh run of items 1–5. Concurrent calls share one run.
 */
export function getCachedSelfCheck(): Promise<FlagsSelfCheck> {
  if (cached && Date.now() - cached.at < SELFCHECK_CACHE_MS) return Promise.resolve(cached.summary);
  if (inflight) return inflight;
  const run = runSelfCheck()
    .then((summary) => {
      cached = { at: Date.now(), summary };
      return summary;
    })
    .finally(() => {
      inflight = null;
    });
  inflight = run;
  return run;
}

/** Keeps a fresh run (the drawer's "Run check again") as the instance's latest result. */
export function rememberSelfCheck(summary: FlagsSelfCheck): void {
  cached = { at: Date.now(), summary };
}

let startupScheduled = false;

/**
 * The once-per-instance check on the module's first use, inside `after()` so it never delays a
 * response. Outside a request `after()` throws; the check then waits for the next in-request use.
 */
export function scheduleStartupSelfCheck(): void {
  if (startupScheduled) return;
  try {
    after(async () => {
      await getCachedSelfCheck();
    });
    startupScheduled = true;
  } catch {
    // Not inside a request (a test, a script or the build): try again on the next use.
  }
}

/** Drops the cached summary and the startup flag. */
export function resetSelfCheckForTests(): void {
  cached = null;
  inflight = null;
  startupScheduled = false;
}
