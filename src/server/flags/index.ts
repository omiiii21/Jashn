import "server-only";

import type { AppLanguage, SessionActor, WeddingId } from "@/contracts/domain";
import type { EnvironmentFlagReader, FlagsSelfCheck, SetupSavedHook, VoiceGate } from "@/contracts/flags";

import { evaluateUserFlags as evaluateUser, getRenderFlags as renderFlags, readEnvironmentFlagsFresh } from "./evaluate";
import type { UserFlagEvaluation } from "./evaluate";
import { checkVoiceGate } from "./gates";
import { getCachedSelfCheck, scheduleStartupSelfCheck } from "./selfcheck";

/**
 * Lane C's flags module: the only surface other lanes import (flagsmith.md 6.2). Server only;
 * nothing here ever throws into a caller, and no flag evaluation is cached across requests.
 */

export type { EvaluatedFlag, FlagExperiment, UserFlagEvaluation } from "./evaluate";
export { fallbackFlag } from "./evaluate";
export { dockFlags, voiceFlagsRecord } from "./gates";
export { isInternalUser, userIdentity } from "./identity";
export { chipKeyForReason, voiceChip } from "./reasons";

/**
 * The voice gate the dispatcher calls for every voice command (domain 3.0 step 4): reads
 * `voice_writes_enabled` fresh from environment flags and fails closed (D47).
 */
export const voiceGate: VoiceGate = async (command) => {
  scheduleStartupSelfCheck();
  return checkVoiceGate(command);
};

/**
 * Environment flags (no identity), fresh on every call: the voice gate, Lane D's export
 * handler (`export_failure_drill`) and worker (`card_renderer`), and the self-check.
 */
export const readEnvironmentFlags: EnvironmentFlagReader = async () => {
  scheduleStartupSelfCheck();
  return readEnvironmentFlagsFresh();
};

/**
 * The user's flags for one request (route handlers call it once at their start). On /setup
 * pass `wedding_id: null` and the UI language. Never throws.
 */
export async function evaluateUserFlags(
  actor: SessionActor,
  opts?: { wedding_id?: WeddingId | null; ui_language?: AppLanguage },
): Promise<UserFlagEvaluation> {
  scheduleStartupSelfCheck();
  return evaluateUser(actor, opts);
}

/** The per-render cached user evaluation for server components (key: user id + wedding id). */
export function getRenderFlags(
  actor: SessionActor,
  wedding_id: WeddingId | null,
  opts?: { ui_language?: AppLanguage },
): Promise<UserFlagEvaluation> {
  scheduleStartupSelfCheck();
  return renderFlags(actor, wedding_id, opts);
}

/**
 * The setup-saved hook the dispatcher calls in `after()` after `set_wedding_profile` (5.4).
 * Still a no-op: the conversion lands with the setup experiment (14:45 batch, D39). Never throws.
 */
export const onSetupSaved: SetupSavedHook = async () => {
  // No conversion event until lane-c-setup-experiment.
};

/**
 * The `flags` summary `/api/health` returns (6.7): the instance's latest self-check while
 * under 60 s old, else a fresh run of items 1–5. No secrets, no user data.
 */
export async function getFlagsSummary(): Promise<FlagsSelfCheck> {
  scheduleStartupSelfCheck();
  return getCachedSelfCheck();
}
