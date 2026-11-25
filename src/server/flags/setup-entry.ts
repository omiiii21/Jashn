import "server-only";

import {
  expectedEnvLabel,
  SETUP_ENTRY_CONTROL,
  SETUP_ENTRY_TREATMENT,
  type EnvLabelValue,
  type FlagKey,
  type SetupEntryVariant,
} from "@/contracts/flags";

import type { EvaluatedFlag } from "./evaluate";

/**
 * The setup screen's entry decision (flagsmith 3.4): rows 1 to 7, top to bottom, first match
 * wins. Pure, so every row has a unit test. Only row 7 records an exposure (5.2, 5.3).
 */

export type SetupArm = SetupEntryVariant;
export type EntryRow = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type EntryDecisionInput = {
  /** The render's one user evaluation (6.4): every flag, plus whether any fell back. */
  flags: Pick<Record<FlagKey, EvaluatedFlag>, "setup_entry" | "voice_pilot" | "voice_writes_enabled">;
  fallback: boolean;
  env_label: EnvLabelValue;
  /** The process's NODE_ENV (row 2 compares `env_label` with expectedEnvLabel of it). */
  node_env: string | undefined;
  /** True when the user owns no wedding yet (the `is_first_wedding` trait). */
  is_first_wedding: boolean;
  /** The internal-account rule (2.3). */
  is_internal: boolean;
};

export type EntryDecision = {
  row: EntryRow;
  arm: SetupArm;
  /** True only on row 7: an eligible, enrolled first-time owner. */
  record_exposure: boolean;
  /** The variant key Flagsmith bucketed this identity into (row 7 only). */
  variant: string | null;
  /** Flagsmith's experiment id from the evaluated flag (row 7 only), as text. */
  experiment_id: string | null;
};

function formFirst(row: EntryRow): EntryDecision {
  return { row, arm: SETUP_ENTRY_CONTROL, record_exposure: false, variant: null, experiment_id: null };
}

/** True when this user has voice: `voice_pilot` on and `voice_writes_enabled` on, both served. */
function hasVoice(flags: EntryDecisionInput["flags"]): boolean {
  const pilot = flags.voice_pilot;
  const writes = flags.voice_writes_enabled;
  return !!pilot && !!writes && pilot.enabled && !pilot.fallback && writes.enabled && !writes.fallback;
}

export function entryDecision(input: EntryDecisionInput): EntryDecision {
  const entry = input.flags.setup_entry;

  // 1. Flagsmith couldn't be read, or `setup_entry` is a fallback value.
  if (input.fallback || !entry || entry.fallback) return formFirst(1);

  // 2. `env_label` doesn't match this process (3.5).
  if (input.env_label !== expectedEnvLabel(input.node_env)) return formFirst(2);

  // 3. The user already owns a wedding.
  if (!input.is_first_wedding) return formFirst(3);

  // 4. Internal account: voice-first if this user has voice, never exposed.
  if (input.is_internal) {
    return hasVoice(input.flags)
      ? { row: 4, arm: SETUP_ENTRY_TREATMENT, record_exposure: false, variant: null, experiment_id: null }
      : formFirst(4);
  }

  // 5. `voice_pilot` is off for this user, or `voice_writes_enabled` is off.
  if (!hasVoice(input.flags)) return formFirst(5);

  // 6. Disabled, no experiment, not in the experiment, or no variant.
  const variant = typeof entry.variant === "string" && entry.variant !== "" ? entry.variant : null;
  if (!entry.enabled || !entry.experiment || !entry.experiment.in_experiment || !variant) return formFirst(6);

  // 7. An eligible, enrolled first-time owner: branch on the variant key, not the value.
  return {
    row: 7,
    arm: variant === SETUP_ENTRY_TREATMENT ? SETUP_ENTRY_TREATMENT : SETUP_ENTRY_CONTROL,
    record_exposure: true,
    variant,
    experiment_id: String(entry.experiment.id),
  };
}

/** The one log line per render (3.4, FV13): the row and the arm, no user data. */
export function entryDecisionLogLine(decision: EntryDecision): string {
  return `setup-entry row=${decision.row} arm=${decision.arm} exposure=${decision.record_exposure ? "yes" : "no"}`;
}
