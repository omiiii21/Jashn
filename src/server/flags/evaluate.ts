import "server-only";

import { cache } from "react";

import {
  ENV_LABELS,
  FLAG_FALLBACKS,
  FLAG_KEYS,
  type EnvironmentFlags,
  type EnvLabelValue,
  type FlagKey,
  type FlagValue,
} from "@/contracts/flags";
import type { AppLanguage, SessionActor, WeddingId } from "@/contracts/domain";

import { callFlagsmith, type SdkFlagLike, type SdkFlagsLike } from "./client";
import { exportFailureDrillEnv } from "./env";
import { isInternalUser, sdkTraits, userIdentity, userTraitsFor } from "./identity";

/**
 * Evaluation (flagsmith 6.4, 6.8): the user evaluation (one identity request, every flag), the
 * per-render cached copy for server components, and the environment flags for callers with no
 * identity. No evaluation is cached across requests, so a flipped switch applies at once.
 */

/** The experiment part of a flag (identity evaluations only; `setup_entry` reads it). */
export type FlagExperiment = { id: number; name: string; in_experiment: boolean };

/** One flag of a user evaluation: enabled, value, fallback, the reason, and the variant. */
export type EvaluatedFlag = FlagValue & {
  reason: string | null;
  /** The variant key this identity was bucketed into (multivariate flags only). */
  variant?: string | null;
  experiment?: FlagExperiment | null;
};

export type UserFlagEvaluation = {
  /** The `u_…` identity key, or null when the salt is missing (nobody identified). */
  identity: string | null;
  flags: Record<FlagKey, EvaluatedFlag>;
  /** True when any flag came from the default handler (Flagsmith unreadable or a flag missing). */
  fallback: boolean;
  env_label: EnvLabelValue;
  latency_ms: number;
};

/** The contract fallback for one flag; `voice_pilot` is on only for internal accounts (6.8). */
export function fallbackFlag(key: FlagKey, internal: boolean): FlagValue {
  const fallback = FLAG_FALLBACKS[key];
  if (!fallback) return { enabled: false, value: null, fallback: true };
  const enabled = fallback.enabled_for_internal !== undefined && internal ? fallback.enabled_for_internal : fallback.enabled;
  return { enabled, value: fallback.value, fallback: true };
}

function stringValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return typeof value === "string" ? value : String(value);
}

function fromSdk(flag: SdkFlagLike | undefined, key: FlagKey, internal: boolean): EvaluatedFlag {
  if (!flag || flag.isDefault) return { ...fallbackFlag(key, internal), reason: null, variant: null, experiment: null };
  return {
    enabled: !!flag.enabled,
    value: stringValue(flag.value),
    fallback: false,
    reason: flag.reason ?? null,
    variant: flag.variant ?? null,
    experiment: flag.experiment
      ? { id: flag.experiment.id, name: flag.experiment.name, in_experiment: !!flag.experiment.inExperiment }
      : null,
  };
}

function allFallbacks(internal: boolean): Record<FlagKey, EvaluatedFlag> {
  return Object.fromEntries(
    FLAG_KEYS.map((key) => [key, { ...fallbackFlag(key, internal), reason: null, variant: null, experiment: null }]),
  ) as Record<FlagKey, EvaluatedFlag>;
}

/** Every contract flag from one SDK result (null: all fallbacks). Also used by the drawer's probes. */
export function fromSdkFlags(flags: SdkFlagsLike | null, internal: boolean): Record<FlagKey, EvaluatedFlag> {
  if (!flags) return allFallbacks(internal);
  return Object.fromEntries(FLAG_KEYS.map((key) => [key, fromSdk(flags.flags[key], key, internal)])) as Record<
    FlagKey,
    EvaluatedFlag
  >;
}

/** `env_label`'s value when it is one of the three labels and Flagsmith served it; else `unknown`. */
export function envLabelOf(flag: FlagValue): EnvLabelValue {
  if (flag.fallback || !flag.enabled) return "unknown";
  return (ENV_LABELS as readonly string[]).includes(flag.value ?? "") ? (flag.value as EnvLabelValue) : "unknown";
}

/**
 * The user's flags for one request: one identity evaluation with the user traits. Route
 * handlers call it once at their start; server components use getRenderFlags. Never throws.
 */
export async function evaluateUserFlags(
  actor: SessionActor,
  opts?: { wedding_id?: WeddingId | null; ui_language?: AppLanguage },
): Promise<UserFlagEvaluation> {
  let internal = false;
  try {
    internal = isInternalUser(actor);
    const wedding_id = opts && opts.wedding_id !== undefined ? opts.wedding_id : actor.wedding_id;
    const identity = userIdentity(actor.user_id);
    if (!identity) {
      return { identity: null, flags: allFallbacks(internal), fallback: true, env_label: "unknown", latency_ms: 0 };
    }
    const traits = sdkTraits(userTraitsFor(actor, { setup: wedding_id === null, ui_language: opts?.ui_language }));
    const result = await callFlagsmith((client) => client.getIdentityFlags(identity, traits));
    const flags = fromSdkFlags(result.ok ? result.flags : null, internal);
    return {
      identity,
      flags,
      fallback: FLAG_KEYS.some((key) => flags[key].fallback),
      env_label: envLabelOf(flags.env_label),
      latency_ms: result.latency_ms,
    };
  } catch {
    return { identity: null, flags: allFallbacks(internal), fallback: true, env_label: "unknown", latency_ms: 0 };
  }
}

/** One map per React render (server components); outside a render `cache` doesn't memoise. */
const renderMemo = cache(() => new Map<string, Promise<UserFlagEvaluation>>());

/**
 * The user evaluation for server components, shared by VoiceDock, the page and the drawer
 * within one render. Keyed by user id plus wedding id ("none" on /setup), as strings.
 */
export function getRenderFlags(
  actor: SessionActor,
  wedding_id: WeddingId | null,
  opts?: { ui_language?: AppLanguage },
): Promise<UserFlagEvaluation> {
  const key = `${actor.user_id}|${wedding_id ?? "none"}|${opts?.ui_language ?? ""}`;
  let memo: Map<string, Promise<UserFlagEvaluation>> | null = null;
  try {
    memo = renderMemo();
  } catch {
    memo = null;
  }
  const existing = memo?.get(key);
  if (existing) return existing;
  const pending = evaluateUserFlags(actor, { wedding_id, ui_language: opts?.ui_language });
  memo?.set(key, pending);
  return pending;
}

/** The environment flags with the details the self-check needs. */
export type EnvironmentEvaluation = {
  flags: Record<FlagKey, EvaluatedFlag>;
  /** True when the request succeeded (items 2 and 3 still look at each flag). */
  reached: boolean;
  /** Every feature name the environment returned, including flags outside the contract. */
  returned_keys: string[];
  latency_ms: number;
};

/** Environment flags, fresh on every call (no identity). Never throws. */
export async function evaluateEnvironment(): Promise<EnvironmentEvaluation> {
  try {
    const result = await callFlagsmith((client) => client.getEnvironmentFlags());
    const flags = fromSdkFlags(result.ok ? result.flags : null, false);
    const drill = flags.export_failure_drill;
    if (drill.fallback) {
      // 3.6: disabled. Only when Flagsmith can't be read does EXPORT_FAILURE_DRILL (a wedding
      // id), if set, stand in for the value; whenever Flagsmith answers, the env var is ignored.
      const env_drill = result.ok ? null : exportFailureDrillEnv();
      flags.export_failure_drill = env_drill
        ? { ...drill, enabled: true, value: env_drill }
        : { ...drill, enabled: false, value: FLAG_FALLBACKS.export_failure_drill?.value ?? "" };
    }
    return {
      flags,
      reached: result.ok,
      returned_keys: result.ok ? Object.keys(result.flags.flags) : [],
      latency_ms: result.latency_ms,
    };
  } catch {
    return { flags: allFallbacks(false), reached: false, returned_keys: [], latency_ms: 0 };
  }
}

/** The environment-flag reader for the voice gate, Lane D's export handler and worker (6.2). */
export async function readEnvironmentFlagsFresh(): Promise<EnvironmentFlags> {
  const { flags } = await evaluateEnvironment();
  return Object.fromEntries(
    FLAG_KEYS.map((key) => [key, { enabled: flags[key].enabled, value: flags[key].value, fallback: flags[key].fallback }]),
  ) as EnvironmentFlags;
}
