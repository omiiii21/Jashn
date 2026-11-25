import { MicrophoneSlashIcon } from "@phosphor-icons/react/ssr";

import type { WeddingId } from "@/contracts/domain";
import { VOICE_OFF_TEXT, type VoiceDockFlags } from "@/contracts/flags";
import { dispatchCommand } from "@/server/actions/dispatch";
import { getSession } from "@/server/auth/session";
import { dockFlags, getRenderFlags, isInternalUser } from "@/server/flags";
import { FIXTURE_ROW_IDS, isFixtureMode } from "@/server/voice/fixture-mode";

import { VoiceDockClient } from "./VoiceDockClient";

/**
 * Final props (voice.md 0.2 and 1.15, decision D97). Only the lead changes them.
 * Lane B's shell passes `wedding_id` alone; the setup screen passes `wedding_id` null
 * plus the two setup-only props. VoiceDock reads everything else on the server.
 */
export type VoiceDockProps = {
  /** The wedding the dock acts on; null on `/setup`. */
  wedding_id: WeddingId | null;
  /**
   * Setup screen only: when the setup screen opened (ISO 8601), passed through the turn
   * to `set_wedding_profile` for Flagsmith's seconds-to-save value (voice.md 1.4).
   */
  setup_opened_at?: string;
  /** Setup screen only: true while the render's `image_extraction_provider` isn't `off` (voice.md 7.3 I-03). */
  show_printed_card?: boolean;
};

function DisabledMic() {
  return (
    <button
      type="button"
      disabled
      aria-label={VOICE_OFF_TEXT}
      title={VOICE_OFF_TEXT}
      className="inline-flex h-11 min-w-11 shrink-0 items-center justify-center rounded-full bg-maroon/50 px-3 text-paper opacity-60 ring-1 ring-gold/60 disabled:cursor-not-allowed"
    >
      <MicrophoneSlashIcon size={24} aria-hidden="true" />
    </button>
  );
}

/**
 * The voice dock, a server component (flagsmith.md 6.2, voice.md 1.15). It reads the session,
 * the per-render flag evaluation (cached per user and wedding) and fixture mode, and hands its
 * client part plain props only: the five dock fields, never the SDK, a key, the identity or
 * traits (flagsmith 6.9). A navigation, a `router.refresh()` or the focus refresh re-renders it
 * with a fresh evaluation. Render it only from server components.
 */
export async function VoiceDock(props: VoiceDockProps) {
  const actor = await getSession();
  if (!actor) return <DisabledMic />;

  let flags: VoiceDockFlags;
  try {
    const evaluation = await getRenderFlags(actor, props.wedding_id);
    flags = dockFlags(evaluation, actor);
  } catch {
    // The evaluation never throws; if it somehow does, voice fails closed (D47).
    return <DisabledMic />;
  }
  if (!flags.voice_available) return <DisabledMic />;

  const fixture_mode = isFixtureMode();

  return (
    <VoiceDockClient
      wedding_id={props.wedding_id}
      setup_opened_at={props.setup_opened_at ?? null}
      show_printed_card={props.show_printed_card === true}
      flags={flags}
      ui_language={actor.preferred_language}
      fixture_mode={fixture_mode}
      fixture_rows={fixture_mode ? [...FIXTURE_ROW_IDS] : []}
      display_name={actor.display_name}
      is_internal={isInternalUser(actor)}
      dispatchCommand={dispatchCommand}
    />
  );
}
