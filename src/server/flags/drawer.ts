import "server-only";

import { after } from "next/server";

import {
  expectedEnvLabel,
  FLAG_EVENTS,
  FLAG_KEYS,
  PROBE_IDENTITY_COUNT,
  PROBE_IDENTITY_PREFIX,
  SELFCHECK_IDENTITY,
  type UserTraits,
} from "@/contracts/flags";
import type {
  DrawerFlagRow,
  DrawerFullCheck,
  DrawerProbeRow,
  DrawerProbes,
  DrawerSdkProbe,
  DrawerSentCounts,
  DrawerSessionPart,
  DrawerVoiceTurnCounts,
} from "@/components/voice/drawer-types";

import { callFlagsmith, getFlagsmithSdk } from "./client";
import { getDrawerCountsSource } from "./drawer-counts";
import { fromSdkFlags, type EvaluatedFlag, type UserFlagEvaluation } from "./evaluate";
import { sdkTraits } from "./identity";
import { rememberSelfCheck, runSelfCheckWithFlags } from "./selfcheck";

/**
 * The flags drawer's data builders (flagsmith 5.9, 6.7). Internal accounts only: the server
 * actions in drawer-actions.ts check the caller before calling any of these, and VoiceDock
 * builds the session part only for internal users. Nothing here returns a key, an email, a
 * name or a single exposure row; never throws into a caller.
 */

const IST = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kolkata",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** A time of day in Asia/Kolkata, for example "14:05:12 IST" (AGENTS.md rule 9). */
export function istLabel(at: number = Date.now()): string {
  return `${IST.format(new Date(at))} IST`;
}

function rowFor(key: string, flag: EvaluatedFlag): DrawerFlagRow {
  return {
    key,
    enabled: flag.enabled,
    value: flag.value,
    variant: flag.variant ?? null,
    reason: flag.reason,
    fallback: flag.fallback,
  };
}

/** The last four characters of the environment's client-side key (not secret), or null. */
export function environmentIdLast4(): string | null {
  const raw = (process.env.NEXT_PUBLIC_FLAGSMITH_ENVIRONMENT_ID ?? "").trim();
  return raw.length >= 4 ? raw.slice(-4) : null;
}

/**
 * Part 1, "This session", from VoiceDock's own render evaluation (no extra request): the
 * identity key, env_label with the key's last four characters, and every flag.
 */
export function buildDrawerSession(evaluation: UserFlagEvaluation, at: number = Date.now()): DrawerSessionPart {
  return {
    identity: evaluation.identity,
    env_label: evaluation.env_label,
    expected_env: expectedEnvLabel(process.env.NODE_ENV),
    environment_id_last4: environmentIdLast4(),
    fallback: evaluation.fallback,
    flags: FLAG_KEYS.map((key) => rowFor(key, evaluation.flags[key])),
    evaluated_label: istLabel(at),
  };
}

/** Item 6: an SDK `trackEvent` of `jashn_selfcheck_sdk` for `probe-selfcheck`, flushed in `after()`. */
function sdkProbe(): DrawerSdkProbe {
  const sdk = getFlagsmithSdk();
  if (!sdk) return { status: "skipped", note: "No Flagsmith server key on this server, so the SDK sent nothing." };
  try {
    sdk.trackEvent(FLAG_EVENTS.selfcheck_sdk, { identifier: SELFCHECK_IDENTITY });
  } catch {
    return { status: "failed", note: "The SDK refused the probe event." };
  }
  const flush = async () => {
    try {
      await sdk.flushEvents();
    } catch {
      console.warn("flagsmith-selfcheck sdk probe flush failed");
    }
  };
  try {
    after(flush);
  } catch {
    // Outside a request (a test or a script): flush now instead.
    void flush();
  }
  return { status: "queued", note: "Queued in the SDK and flushed after this response. Check the warehouse card." };
}

/** "Run check again": items 1–5 fresh (bypassing the 60 s cache) plus item 6. Never throws. */
export async function runFullCheck(): Promise<DrawerFullCheck> {
  const { summary, environment } = await runSelfCheckWithFlags();
  rememberSelfCheck(summary);
  const sdk_probe = sdkProbe();
  const flags = environment?.flags ?? fromSdkFlags(null, false);
  return {
    summary,
    sdk_probe,
    environment_flags: FLAG_KEYS.map((key) => rowFor(key, flags[key])),
  };
}

/** The fixed probe traits (6.7): a first-time, non-internal owner speaking Hindi. */
export const PROBE_TRAITS: UserTraits = Object.freeze({
  role: "owner",
  preferred_language: "hi",
  is_internal: false,
  is_first_wedding: true,
});

/** `probe-01` to `probe-50`. */
export function probeIdentities(): string[] {
  return Array.from(
    { length: PROBE_IDENTITY_COUNT },
    (_, index) => `${PROBE_IDENTITY_PREFIX}${String(index + 1).padStart(2, "0")}`,
  );
}

/** At most this many probe requests in flight at once. */
const PROBE_CONCURRENCY = 10;

async function probeOne(identity: string): Promise<DrawerProbeRow> {
  const result = await callFlagsmith((client) => client.getIdentityFlags(identity, sdkTraits(PROBE_TRAITS)));
  const flags = fromSdkFlags(result.ok ? result.flags : null, false);
  const pilot = flags.voice_pilot;
  const entry = flags.setup_entry;
  return {
    identity,
    voice_pilot: { enabled: pilot.enabled, reason: pilot.reason, fallback: pilot.fallback },
    setup_entry: {
      variant: entry.variant ?? entry.value,
      in_experiment: entry.experiment ? entry.experiment.in_experiment : null,
      fallback: entry.fallback,
    },
  };
}

/**
 * "Run 50 probes" (6.7 probe mode): evaluates probe-01 to probe-50 with the fixed traits. It
 * only ever calls `getIdentityFlags`: never `getExperimentFlag`, `trackEvent` or
 * `trackExposureEvent`, so no probe is ever exposed. 50 requests per press. Never throws.
 */
export async function runProbes(): Promise<DrawerProbes> {
  const identities = probeIdentities();
  const rows: DrawerProbeRow[] = new Array(identities.length);
  let next = 0;
  const worker = async () => {
    while (next < identities.length) {
      const index = next++;
      const identity = identities[index];
      try {
        rows[index] = await probeOne(identity);
      } catch {
        rows[index] = {
          identity,
          voice_pilot: { enabled: false, reason: null, fallback: true },
          setup_entry: { variant: null, in_experiment: null, fallback: true },
        };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(PROBE_CONCURRENCY, identities.length) }, worker));

  const variants: Record<string, number> = {};
  for (const row of rows) {
    const key = row.setup_entry.variant ?? "none";
    variants[key] = (variants[key] ?? 0) + 1;
  }
  return {
    rows,
    voice_pilot_on: rows.filter((row) => row.voice_pilot.enabled).length,
    voice_pilot_rollout: rows.filter(
      (row) => row.voice_pilot.enabled && (row.voice_pilot.reason ?? "").toLowerCase().includes("voice_rollout"),
    ).length,
    in_experiment: rows.filter((row) => row.setup_entry.in_experiment === true).length,
    variants,
    fallback: rows.filter((row) => row.voice_pilot.fallback || row.setup_entry.fallback).length,
    ran_label: istLabel(),
  };
}

/** Part 2: exposures and saves per arm from `experiment_exposures`, Production rows only. */
export async function sentByJashn(): Promise<DrawerSentCounts> {
  const at = Date.now();
  try {
    const counts = await getDrawerCountsSource().exposureCounts("production");
    return { env: "production", arms: counts.arms, as_of_label: istLabel(at), source: counts.source, note: counts.note };
  } catch {
    return {
      env: "production",
      arms: [
        { variant: "form_first", exposures: 0, saves: 0 },
        { variant: "voice_first", exposures: 0, saves: 0 },
      ],
      as_of_label: istLabel(at),
      source: "none",
      note: "The counts couldn't be read just now.",
    };
  }
}

export const VOICE_TURN_WINDOW_HOURS = 2;

/** Part 4: Production voice turns in the last two hours (total, failed, paused), the gate's quick view (4.3). */
export async function voiceTurnCounts(now: number = Date.now()): Promise<DrawerVoiceTurnCounts> {
  const since = new Date(now - VOICE_TURN_WINDOW_HOURS * 3_600_000).toISOString();
  try {
    const counts = await getDrawerCountsSource().voiceTurnCounts("production", since);
    return { env: "production", window_hours: VOICE_TURN_WINDOW_HOURS, ...counts, as_of_label: istLabel(now) };
  } catch {
    return {
      env: "production",
      window_hours: VOICE_TURN_WINDOW_HOURS,
      total: 0,
      failed: 0,
      paused: 0,
      source: "memory",
      note: "The counts couldn't be read just now.",
      as_of_label: istLabel(now),
    };
  }
}
