import "server-only";

import type {
  AssetId,
  EventKind,
  InviteLayout,
  InviteTheme,
  InviteTypeface,
  MemberId,
  PhotoFrame,
  PublicationId,
  PublicationSnapshot,
  SnapshotChange,
  WeddingId,
} from "@/contracts/domain";

/**
 * The tables Lane D's invite handlers read and write, as a port (architecture 4.2 rule 2:
 * Lane D reads Lane A's tables from its own `src/server/` module; domain writes run inside
 * the dispatcher's transaction, passed in as `tx`). The Drizzle implementation is
 * `drizzle-store.ts`; tests use an in-memory one.
 *
 * Row shapes follow `src/db/schema.ts` (snake_case, `id` as the key, `time` as `HH:MM:SS`,
 * dates as `YYYY-MM-DD`), so they feed Lane A's snapshot builder as they are.
 */

export type InviteWeddingRow = {
  id: WeddingId;
  bride_name: string;
  groom_name: string;
  city: string | null;
  wedding_date: string;
  is_sample: boolean;
  draft_version: number;
  published_revision: number | null;
};

export type InviteStyleRow = {
  wedding_id: WeddingId;
  theme: InviteTheme;
  typeface: InviteTypeface;
  layout: InviteLayout;
  photo_frame: PhotoFrame;
  photo_asset_id: AssetId | null;
  heading_hi: string;
  wording_en: string | null;
  wording_hi: string | null;
  blessing_line: string | null;
};

export type InviteEventRow = {
  id: string;
  wedding_id: WeddingId;
  event_kind: EventKind;
  title: string;
  title_hi: string;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  muhurat_time: string | null;
  venue_id: string | null;
  dress_code: string | null;
  description: string | null;
  sort_order: number;
  deleted_at: Date | null;
};

export type InviteVenueRow = {
  id: string;
  wedding_id: WeddingId;
  name: string;
  place_name: string | null;
  locality: string | null;
  address: string | null;
  map_url: string | null;
};

export type InvitePublicationRow = {
  id: PublicationId;
  wedding_id: WeddingId;
  revision: number;
  snapshot: PublicationSnapshot;
  draft_version: number;
  changes: SnapshotChange[];
  note: string | null;
  published_by_member_id: MemberId;
  published_at: Date;
};

export type NewPublication = Omit<InvitePublicationRow, "id">;

/** The style columns `update_invite_style` may write. */
export type InviteStylePatch = Partial<Omit<InviteStyleRow, "wedding_id">>;

export interface InviteStore<Tx> {
  /** The wedding row, or null when it doesn't exist. The dispatcher already holds its lock. */
  readWedding(tx: Tx, wedding_id: WeddingId): Promise<InviteWeddingRow | null>;
  /** The style row, or null when the wedding has none yet (the snapshot then uses the table defaults). */
  readInviteStyle(tx: Tx, wedding_id: WeddingId): Promise<InviteStyleRow | null>;
  /** Every function row of the wedding, deleted ones included (the builder leaves them out). */
  readEvents(tx: Tx, wedding_id: WeddingId): Promise<InviteEventRow[]>;
  readVenues(tx: Tx, wedding_id: WeddingId): Promise<InviteVenueRow[]>;
  readPublication(tx: Tx, wedding_id: WeddingId, revision: number): Promise<InvitePublicationRow | null>;
  insertPublication(tx: Tx, row: NewPublication): Promise<{ id: PublicationId }>;
  setPublishedRevision(tx: Tx, wedding_id: WeddingId, revision: number, now: Date): Promise<void>;
  /** Creates the row with the table defaults when it is missing, then applies the patch. */
  writeInviteStyle(tx: Tx, wedding_id: WeddingId, patch: InviteStylePatch, by: MemberId | null, now: Date): Promise<void>;
  /** True when `asset_id` is a `couple_photo` asset of this wedding. */
  isCouplePhoto(tx: Tx, wedding_id: WeddingId, asset_id: AssetId): Promise<boolean>;
}
