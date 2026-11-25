/**
 * The bridge between the voice-first landing card and the header voice dock (Lane E, D20).
 * The dock stays the only recorder: the card sends `VOICE_TOGGLE_EVENT` from inside its
 * click (so the mic still opens inside a user gesture), and the dock answers with
 * `VOICE_STATE_EVENT` whenever its state changes, or when asked with `VOICE_STATE_REQUEST_EVENT`.
 */
export const VOICE_TOGGLE_EVENT = "jashn:voice-toggle";
export const VOICE_STATE_EVENT = "jashn:voice-state";
export const VOICE_STATE_REQUEST_EVENT = "jashn:voice-state-request";

/** What the dock is doing, as the landing card shows it. */
export type VoiceDockState = "idle" | "listening" | "busy" | "off";

export function isVoiceDockState(value: unknown): value is VoiceDockState {
  return value === "idle" || value === "listening" || value === "busy" || value === "off";
}
