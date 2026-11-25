import "server-only";

import { and, eq } from "drizzle-orm";

import type { AssetId, MemberId, PublicationSnapshot, SnapshotChange, WeddingId } from "@/contracts/domain";
import type { JsonValue } from "@/contracts/domain";
import type { Tx } from "@/db/client";
import { assets, events, inviteStyles, publications, venues, weddings } from "@/db/schema";

import type { InviteStore } from "./store";

/**
 * Lane D's invite handlers' tables through Drizzle's core builder. Every call runs inside
 * the dispatcher's transaction, which already holds the wedding row's lock.
 */
export function createDrizzleInviteStore(): InviteStore<Tx> {
  return {
    async readWedding(tx, wedding_id) {
      const [row] = await tx
        .select({
          id: weddings.id,
          bride_name: weddings.bride_name,
          groom_name: weddings.groom_name,
          city: weddings.city,
          wedding_date: weddings.wedding_date,
          is_sample: weddings.is_sample,
          draft_version: weddings.draft_version,
          published_revision: weddings.published_revision,
        })
        .from(weddings)
        .where(eq(weddings.id, wedding_id));
      return row ? { ...row, id: row.id as WeddingId } : null;
    },
    async readInviteStyle(tx, wedding_id) {
      const [row] = await tx
        .select({
          wedding_id: inviteStyles.wedding_id,
          theme: inviteStyles.theme,
          typeface: inviteStyles.typeface,
          layout: inviteStyles.layout,
          photo_frame: inviteStyles.photo_frame,
          photo_asset_id: inviteStyles.photo_asset_id,
          heading_hi: inviteStyles.heading_hi,
          wording_en: inviteStyles.wording_en,
          wording_hi: inviteStyles.wording_hi,
          blessing_line: inviteStyles.blessing_line,
        })
        .from(inviteStyles)
        .where(eq(inviteStyles.wedding_id, wedding_id));
      return row ? { ...row, wedding_id: row.wedding_id as WeddingId, photo_asset_id: row.photo_asset_id as AssetId | null } : null;
    },
    async readEvents(tx, wedding_id) {
      const rows = await tx
        .select({
          id: events.id,
          wedding_id: events.wedding_id,
          event_kind: events.event_kind,
          title: events.title,
          title_hi: events.title_hi,
          event_date: events.event_date,
          start_time: events.start_time,
          end_time: events.end_time,
          muhurat_time: events.muhurat_time,
          venue_id: events.venue_id,
          dress_code: events.dress_code,
          description: events.description,
          sort_order: events.sort_order,
          deleted_at: events.deleted_at,
        })
        .from(events)
        .where(eq(events.wedding_id, wedding_id));
      return rows.map((row) => ({ ...row, wedding_id: row.wedding_id as WeddingId }));
    },
    async readVenues(tx, wedding_id) {
      const rows = await tx
        .select({
          id: venues.id,
          wedding_id: venues.wedding_id,
          name: venues.name,
          place_name: venues.place_name,
          locality: venues.locality,
          address: venues.address,
          map_url: venues.map_url,
        })
        .from(venues)
        .where(eq(venues.wedding_id, wedding_id));
      return rows.map((row) => ({ ...row, wedding_id: row.wedding_id as WeddingId }));
    },
    async readPublication(tx, wedding_id, revision) {
      const [row] = await tx
        .select()
        .from(publications)
        .where(and(eq(publications.wedding_id, wedding_id), eq(publications.revision, revision)));
      if (!row) return null;
      return {
        id: row.id,
        wedding_id: row.wedding_id as WeddingId,
        revision: row.revision,
        snapshot: row.snapshot as unknown as PublicationSnapshot,
        draft_version: row.draft_version,
        changes: row.changes as unknown as SnapshotChange[],
        note: row.note,
        published_by_member_id: row.published_by_member_id as MemberId,
        published_at: row.published_at,
      };
    },
    async insertPublication(tx, row) {
      const [inserted] = await tx
        .insert(publications)
        .values({
          wedding_id: row.wedding_id,
          revision: row.revision,
          snapshot: row.snapshot as unknown as JsonValue,
          draft_version: row.draft_version,
          changes: row.changes as unknown as JsonValue,
          note: row.note,
          published_by_member_id: row.published_by_member_id,
          published_at: row.published_at,
          created_at: row.published_at,
        })
        .returning({ id: publications.id });
      return { id: inserted.id };
    },
    async setPublishedRevision(tx, wedding_id, revision, now) {
      await tx.update(weddings).set({ published_revision: revision, updated_at: now }).where(eq(weddings.id, wedding_id));
    },
    async writeInviteStyle(tx, wedding_id, patch, by, now) {
      await tx
        .insert(inviteStyles)
        .values({ wedding_id, ...patch, updated_by_member_id: by, created_at: now, updated_at: now })
        .onConflictDoUpdate({
          target: inviteStyles.wedding_id,
          set: { ...patch, updated_by_member_id: by, updated_at: now },
        });
    },
    async isCouplePhoto(tx, wedding_id, asset_id) {
      const [row] = await tx
        .select({ id: assets.id })
        .from(assets)
        .where(and(eq(assets.id, asset_id), eq(assets.wedding_id, wedding_id), eq(assets.asset_kind, "couple_photo")));
      return Boolean(row);
    },
  };
}
