/**
 * The data the Invite studio renders from (design-direction 10.7). Pure types, so the
 * server loader (`src/server/invite/studio-draft.ts`) and the client studio share them
 * without the client importing `src/server` (AGENTS.md rule 5).
 */
import type { AssetId, InviteStyleDto, MemberRole, PublicationSnapshot, SnapshotEvent, WeddingId } from "@/contracts/domain";

/** The draft style without its seed key: exactly what a snapshot stores (domain 5.3). */
export type StudioStyle = Omit<InviteStyleDto, "seed_key">;

/** The draft's couple photo. `url` is a member signed URL (10 minutes), null while no file exists (D126). */
export type StudioPhoto = { asset_id: AssetId; url: string | null };

/** Everything the studio needs from the server, read for one member. */
export type InviteStudioDraft = {
  wedding_id: WeddingId;
  /** The draft wedding fields the card prints. */
  wedding: PublicationSnapshot["wedding"];
  /** The draft invite style (`invite_styles`), never the published one. */
  style: StudioStyle;
  /** The draft functions, as snapshot events (display only; never stored or diffed). */
  events: SnapshotEvent[];
  /** The draft style's photo, or null when `photo_asset_id` is null. */
  photo: StudioPhoto | null;
  /** Every couple photo of this wedding, oldest first, for the photo picker (signed thumbnails). */
  photos: StudioPhoto[];
  is_sample: boolean;
  /** The signed-in member: managers edit the draft too; only owners publish. */
  member: { display_name: string; role: MemberRole };
};
