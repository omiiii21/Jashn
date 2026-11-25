import "server-only";

import type { AppLanguage, JsonObject, SessionActor, WeddingId } from "@/contracts/domain";
import { FLAG_FALLBACKS, type FlagKey, type VoiceDockFlags } from "@/contracts/flags";

import type { FlagEvaluation, VoiceDeps } from "./deps";

/**
 * One flag evaluation per voice request (voice.md 1.15, flagsmith 3.1): the evaluation, the
 * voice block every response carries, and the record stored in voice_turns.flags.
 */
export type RequestFlags = {
  evaluation: FlagEvaluation;
  voice: VoiceDockFlags;
  record: JsonObject;
  voice_pilot: boolean;
  writes_enabled: boolean;
  spoken_replies: boolean;
};

const FLAG_KEYS = Object.keys(FLAG_FALLBACKS) as FlagKey[];

/**
 * The evaluation the routes use if the flags module itself throws (it shouldn't: it never
 * throws). Fallbacks, so the kill switch stays closed (D47).
 */
export function fallbackEvaluation(actor: Pick<SessionActor, "is_internal">): FlagEvaluation {
  const flags = Object.fromEntries(
    FLAG_KEYS.map((key) => {
      const fallback = FLAG_FALLBACKS[key];
      const enabled = key === "voice_pilot" ? actor.is_internal && fallback?.enabled_for_internal === true : (fallback?.enabled ?? false);
      return [key, { enabled, value: fallback?.value ?? null, fallback: true, reason: null }];
    }),
  ) as FlagEvaluation["flags"];
  return { identity: null, flags, fallback: true, env_label: "unknown", latency_ms: 0 };
}

export async function flagsForRequest(
  deps: Pick<VoiceDeps, "evaluateFlags" | "dockFlags" | "voiceFlagsRecord">,
  actor: SessionActor,
  opts: { wedding_id: WeddingId | null; ui_language?: AppLanguage },
): Promise<RequestFlags> {
  let evaluation: FlagEvaluation;
  try {
    evaluation = await deps.evaluateFlags(actor, opts);
  } catch {
    evaluation = fallbackEvaluation(actor);
  }
  const voice_pilot = evaluation.flags.voice_pilot?.enabled === true;
  const writes_enabled = evaluation.flags.voice_writes_enabled?.enabled === true && !evaluation.flags.voice_writes_enabled.fallback;
  const spoken_replies = evaluation.flags.spoken_replies?.enabled === true;

  let voice: VoiceDockFlags;
  try {
    voice = await deps.dockFlags(evaluation, actor);
  } catch {
    voice = { voice_available: voice_pilot, writes_enabled: voice_pilot && writes_enabled, spoken_replies, chip: null, fallback: evaluation.fallback };
  }

  let record: JsonObject;
  try {
    record = await deps.voiceFlagsRecord(evaluation);
  } catch {
    record = { voice_pilot, voice_writes_enabled: writes_enabled, spoken_replies, env_label: evaluation.env_label, fallback: evaluation.fallback };
  }
  if (opts.wedding_id === null && evaluation.flags.setup_entry) {
    // The setup variant on a setup turn, copied from the same evaluation (voice.md 1.15).
    record = { ...record, setup_entry: evaluation.flags.setup_entry.value };
  }

  return { evaluation, voice, record, voice_pilot, writes_enabled, spoken_replies };
}
