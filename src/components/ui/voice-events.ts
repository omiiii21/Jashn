/**
 * The bridge between the voice-first landing card and the header voice dock (Lane E, D20).
 * The dock stays the only recorder: the card sends `VOICE_TOGGLE_EVENT` (or
 * `VOICE_TYPE_EVENT`) from inside its click, so the mic still opens inside a user gesture,
 * and the dock answers with `VOICE_STATE_EVENT` whenever its state or the heard words change,
 * or when asked with `VOICE_STATE_REQUEST_EVENT`.
 */
export const VOICE_TOGGLE_EVENT = "jashn:voice-toggle";
export const VOICE_TYPE_EVENT = "jashn:voice-type";
export const VOICE_STATE_EVENT = "jashn:voice-state";
export const VOICE_STATE_REQUEST_EVENT = "jashn:voice-state-request";

/** What the dock is doing, as the landing card shows it. */
export type VoiceDockState = "idle" | "listening" | "busy" | "off";

/** The dock's broadcast: its state and the words of the latest turn, after release. */
export type VoiceDockBroadcast = { state: VoiceDockState; heard: string | null };

export function isVoiceDockBroadcast(value: unknown): value is VoiceDockBroadcast {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  const stateOk = v.state === "idle" || v.state === "listening" || v.state === "busy" || v.state === "off";
  return stateOk && (v.heard === null || typeof v.heard === "string");
}
