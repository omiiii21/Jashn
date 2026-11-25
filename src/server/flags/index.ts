import "server-only";

import {
  expectedEnvLabel,
  FLAG_FALLBACKS,
  type EnvironmentFlagReader,
  type EnvironmentFlags,
  type FlagKey,
  type FlagsSelfCheck,
  type SetupSavedHook,
  type VoiceGate,
  type VoiceGateResult,
} from "@/contracts/flags";

/**
 * Lane C's flags module: the only surface other lanes import (flagsmith.md 6.2).
 * Contracts stub. Lane C replaces the bodies in lane-c-voice (10:45) and makes the
 * setup-saved hook real in the 11:40 batch (D39); the exported names and types stay.
 */

const PAUSED_UNREADABLE: VoiceGateResult = { status: "paused", cause: "unreadable" };

/**
 * The voice gate the dispatcher calls for every voice command (domain 3.0 step 4).
 * Fails closed: it refuses every voice write and never answers "enabled" (D47).
 */
export const voiceGate: VoiceGate = async () => PAUSED_UNREADABLE;

const FLAG_KEYS = Object.keys(FLAG_FALLBACKS) as FlagKey[];

/** The fallbacks as environment flags, each marked as answered by the default handler (6.8). */
const FALLBACK_ENVIRONMENT_FLAGS = Object.fromEntries(
  FLAG_KEYS.map((key) => {
    const fallback = FLAG_FALLBACKS[key];
    return [key, { enabled: fallback?.enabled ?? false, value: fallback?.value ?? null, fallback: true }];
  }),
) as EnvironmentFlags;

/**
 * Environment flags (no identity), for export jobs, the worker and the self-check.
 * Stub: always the fallbacks, so `export_failure_drill` is off and `card_renderer` is `chromium`.
 */
export const readEnvironmentFlags: EnvironmentFlagReader = async () => FALLBACK_ENVIRONMENT_FLAGS;

/**
 * The setup-saved hook the dispatcher calls in `after()` after `set_wedding_profile` (5.4).
 * Stub: does nothing (D39). It never throws.
 */
export const onSetupSaved: SetupSavedHook = async () => {
  // No conversion event until Lane C's real hook lands in the 11:40 batch.
};

/** An instant in IST, for example 2026-11-25T10:41:07+05:30 (AGENTS.md rule 9). */
function nowInKolkata(): string {
  const shifted = new Date(Date.now() + 330 * 60_000);
  return `${shifted.toISOString().slice(0, 19)}+05:30`;
}

function keyType(key: string | undefined): FlagsSelfCheck["key_type"] {
  if (!key) return "missing";
  return key.startsWith("ser.") ? "server" : "client";
}

/**
 * The `flags` summary `/api/health` returns (6.7). Stub: "not built yet", with `ok` false
 * until lane-c-voice merges (D12). It makes no Flagsmith call and holds no secrets.
 */
export async function getFlagsSummary(): Promise<FlagsSelfCheck> {
  return {
    ok: false,
    expected_env: expectedEnvLabel(process.env.NODE_ENV),
    env_label: "unknown",
    key_type: keyType(process.env.FLAGSMITH_SERVER_KEY),
    fallback_flags: [...FLAG_KEYS],
    not_created: [],
    events_probe_status: null,
    experiment_events: "off",
    latency_ms: null,
    sdk: "none",
    checked_at: nowInKolkata(),
    note: "not built yet",
  };
}
