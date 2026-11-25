import "server-only";

import type { CommandName } from "@/contracts/commands";
import type { JsonObject, SessionActor } from "@/contracts/domain";
import type { VoiceDockFlags, VoiceGateResult } from "@/contracts/flags";

import { readEnvironmentFlagsFresh, type UserFlagEvaluation } from "./evaluate";
import { isInternalUser } from "./identity";
import { chipKeyForReason, voiceChip } from "./reasons";

/**
 * Gates (flagsmith 3.1, 3.2, 6.9): the dispatcher's voice gate, the dock fields and the record
 * each voice turn stores.
 */

function logRefusal(command: CommandName, cause: "switch off" | "flags unreadable"): void {
  // One line per refusal, naming the command and the cause; no user data (3.2).
  console.info(`voice-gate paused command=${command} cause=${cause}`);
}

/**
 * The voice gate (domain 3.0 step 4): reads `voice_writes_enabled` fresh from environment
 * flags for every voice command. Fails closed: a fallback (unreadable or missing) answers
 * paused/unreadable, disabled answers paused/switch_off. Never throws.
 */
export async function checkVoiceGate(command: CommandName): Promise<VoiceGateResult> {
  try {
    const flags = await readEnvironmentFlagsFresh();
    const flag = flags.voice_writes_enabled;
    if (!flag || flag.fallback) {
      logRefusal(command, "flags unreadable");
      return { status: "paused", cause: "unreadable" };
    }
    if (!flag.enabled) {
      logRefusal(command, "switch off");
      return { status: "paused", cause: "switch_off" };
    }
    return { status: "enabled" };
  } catch {
    logRefusal(command, "flags unreadable");
    return { status: "paused", cause: "unreadable" };
  }
}

/**
 * The five dock fields (6.9) for VoiceDock's props and every voice response. The chip is null
 * when voice is off; `safe_mode` when the evaluation fell back for an internal account; else
 * from `voice_pilot`'s reason. `writes_enabled` false means the dock adds "Questions only".
 */
export function dockFlags(
  evaluation: UserFlagEvaluation,
  actor: Pick<SessionActor, "email" | "is_internal">,
): VoiceDockFlags {
  const pilot = evaluation.flags.voice_pilot;
  const writes = evaluation.flags.voice_writes_enabled;
  const voice_available = !!pilot?.enabled;
  let chip: VoiceDockFlags["chip"] = null;
  if (voice_available) {
    chip =
      evaluation.fallback && isInternalUser(actor) ? voiceChip("safe_mode") : voiceChip(chipKeyForReason(pilot.reason));
  }
  return {
    voice_available,
    writes_enabled: !!writes?.enabled && !writes.fallback,
    spoken_replies: !!evaluation.flags.spoken_replies?.enabled,
    chip,
    fallback: evaluation.fallback,
  };
}

/** What `voice_turns.flags` stores for a turn (flagsmith 10.1 item 7). */
export function voiceFlagsRecord(evaluation: UserFlagEvaluation): JsonObject {
  const writes = evaluation.flags.voice_writes_enabled;
  return {
    voice_pilot: !!evaluation.flags.voice_pilot?.enabled,
    voice_writes_enabled: !!writes?.enabled && !writes.fallback,
    spoken_replies: !!evaluation.flags.spoken_replies?.enabled,
    env_label: evaluation.env_label,
    fallback: evaluation.fallback,
  };
}
