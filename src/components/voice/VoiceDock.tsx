import { MicrophoneIcon } from "@phosphor-icons/react/ssr";

import type { WeddingId } from "@/contracts/domain";

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

const OFF_TEXT = "Voice is switched off right now. You can type or edit directly.";

/**
 * The voice dock, a server component (flagsmith.md 6.2). Contracts stub: a disabled
 * microphone, because the voice gate fails closed until Lane C's real one merges
 * (decision D47). Lane C replaces the body in `lane-c-voice`, keeping these props.
 * Render it only from server components.
 */
export async function VoiceDock(props: VoiceDockProps) {
  void props;
  return (
    <button
      type="button"
      disabled
      aria-label={OFF_TEXT}
      title={OFF_TEXT}
      className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-current opacity-50 disabled:cursor-not-allowed"
    >
      <MicrophoneIcon size={20} aria-hidden="true" />
    </button>
  );
}
