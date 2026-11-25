import "server-only";

import { CHIP_LABELS, type ChipKey, type VoiceChip } from "@/contracts/flags";

/**
 * Reason labels (flagsmith 3.1): maps `voice_pilot`'s evaluation reason to a chip key. The
 * remote-evaluation reason strings are unconfirmed (U10), so this matches on the segment name
 * inside the string (for example `TARGETING_MATCH; segment=internal_team`) and falls back to
 * the neutral `voice_on`.
 */
export function chipKeyForReason(reason: string | null | undefined): Extract<ChipKey, "internal_team" | "voice_rollout" | "voice_on"> {
  const text = (reason ?? "").toLowerCase();
  if (text.includes("internal_team")) return "internal_team";
  if (text.includes("voice_rollout")) return "voice_rollout";
  return "voice_on";
}

/** The chip with both labels, as VoiceDock and every voice response carry it. */
export function voiceChip(key: ChipKey): VoiceChip {
  const labels = CHIP_LABELS[key];
  return { key, label_en: labels.label_en, label_hi: labels.label_hi };
}
