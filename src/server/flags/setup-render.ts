import "server-only";

import { EXPERIMENT_FLAG, EXPERIMENT_KEY, type SetupEntryVariant } from "@/contracts/flags";
import type { IsoInstant, SessionActor } from "@/contracts/domain";

import { getFlagsmithSdk } from "./client";
import type { UserFlagEvaluation } from "./evaluate";
import { getExposureStore, type ExposureStore } from "./exposures";
import { isInternalUser } from "./identity";
import { entryDecision, entryDecisionLogLine, type EntryDecision } from "./setup-entry";

/**
 * The setup screen's server render, flags part (flagsmith 3.4, 5.3): the entry decision from
 * the render's one evaluation, the one log line, `setup_opened_at`, and, on row 7 only, the
 * exposure job the page schedules with `after()`. Never in a layout, a poll or a voice route.
 */

/** The SDK calls the experiment paths make (`@flagsmith/nodejs`'s `Flagsmith` fits). */
export type ExperimentEventsSdk = {
  trackExposureEvent(featureName: string, opts: { identifier: string; value?: string; metadata?: Record<string, unknown> }): void;
  trackEvent(event: string, opts?: { identifier?: string; value?: number; metadata?: Record<string, unknown> }): void;
  flushEvents(): Promise<void>;
};

/** Plain values only: what the `after()` callback receives (5.3 step 4). */
export type ExposureJob = {
  user_id: string;
  identity_key: string;
  /** The variant key Flagsmith served (sent as the exposure value). */
  variant: string;
  /** The arm the row records (`voice_first` or `form_first`). */
  arm: SetupEntryVariant;
  experiment_id: string | null;
  flagsmith_env: string;
  at: IsoInstant;
};

export type SetupRender = {
  decision: EntryDecision;
  /** For an enrolled owner, the row's first `exposed_at` when it exists; otherwise the render time. */
  setup_opened_at: IsoInstant;
  /** Row 7 only: the exposure to record after the response. */
  exposure: ExposureJob | null;
};

export type SetupRenderDeps = {
  store?: ExposureStore;
  now?: () => Date;
  node_env?: string | undefined;
  log?: (line: string) => void;
};

export async function prepareSetupRender(
  actor: SessionActor,
  evaluation: UserFlagEvaluation,
  deps: SetupRenderDeps = {},
): Promise<SetupRender> {
  const now = (deps.now ?? (() => new Date()))().toISOString();
  const log = deps.log ?? ((line: string) => console.info(line));
  const decision = entryDecision({
    flags: evaluation.flags,
    fallback: evaluation.fallback,
    env_label: evaluation.env_label,
    node_env: "node_env" in deps ? deps.node_env : process.env.NODE_ENV,
    is_first_wedding: actor.is_first_wedding,
    is_internal: isInternalUser(actor),
  });
  log(entryDecisionLogLine(decision));

  if (!decision.record_exposure || !evaluation.identity || !decision.variant) {
    return { decision, setup_opened_at: now, exposure: null };
  }

  let setup_opened_at = now;
  try {
    const store = deps.store ?? getExposureStore();
    const existing = await store.get({ user_id: actor.user_id, experiment: EXPERIMENT_KEY, flagsmith_env: evaluation.env_label });
    if (existing) setup_opened_at = existing.exposed_at;
  } catch {
    console.warn("setup-entry exposure lookup failed; using the render time");
  }
  return {
    decision,
    setup_opened_at,
    exposure: {
      user_id: actor.user_id,
      identity_key: evaluation.identity,
      variant: decision.variant,
      arm: decision.arm,
      experiment_id: decision.experiment_id,
      flagsmith_env: evaluation.env_label,
      at: now,
    },
  };
}

export type RecordExposureDeps = {
  store?: ExposureStore;
  sdk?: ExperimentEventsSdk | null;
};

/**
 * The `after()` part of 5.3: insert the row if absent (an existing row keeps its first variant
 * and time), send the exposure for `setup_entry` with the variant key, then flush. Every
 * enrolled render sends it again; Flagsmith deduplicates. Never throws.
 */
export async function recordSetupExposure(job: ExposureJob, deps: RecordExposureDeps = {}): Promise<void> {
  try {
    const store = deps.store ?? getExposureStore();
    await store.insertIfAbsent({
      user_id: job.user_id,
      experiment: EXPERIMENT_KEY,
      flagsmith_env: job.flagsmith_env,
      flagsmith_experiment_id: job.experiment_id,
      identity_key: job.identity_key,
      variant: job.arm,
      exposed_at: job.at,
    });
  } catch {
    console.warn("setup-entry exposure row not written");
  }
  try {
    const sdk = deps.sdk !== undefined ? deps.sdk : getFlagsmithSdk();
    if (!sdk) return;
    sdk.trackExposureEvent(EXPERIMENT_FLAG, {
      identifier: job.identity_key,
      value: job.variant,
      ...(job.experiment_id ? { metadata: { experiment_id: Number(job.experiment_id) } } : {}),
    });
    await sdk.flushEvents();
  } catch {
    console.warn("setup-entry exposure event not sent");
  }
}
