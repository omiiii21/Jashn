/**
 * The studio preview's card, from the draft (design-direction 10.7; AT-7.1, AT-7.2).
 * Pure. `draftSnapshot` is a display-only projection in the snapshot's shape: it is never
 * stored, diffed or published. Publishing builds its snapshot with Lane A's
 * `src/db/itinerary-snapshot.ts` (D95).
 */
import type { PublicationSnapshot, SnapshotEvent } from "@/contracts/domain";
import type { ItineraryFunction } from "@/contracts/read-models";
import { buildCardModel, type CardModel } from "../card-model";
import type { StudioStyle } from "./studio-types";

/** One draft function as the card reads it (drops capacity, requirements and versions). */
export function toSnapshotEvent(fn: ItineraryFunction): SnapshotEvent {
  return {
    event_id: fn.event_id,
    event_kind: fn.event_kind,
    title: fn.title,
    title_hi: fn.title_hi,
    event_date: fn.event_date,
    start_time: fn.start_time,
    end_time: fn.end_time,
    muhurat_time: fn.muhurat_time,
    dress_code: fn.dress_code,
    description: fn.description,
    venue: fn.venue
      ? {
          venue_id: fn.venue.venue_id,
          name: fn.venue.name,
          place_name: fn.venue.place_name,
          locality: fn.venue.locality,
          address: fn.venue.address,
          map_url: fn.venue.map_url,
        }
      : null,
  };
}

export function draftSnapshot(
  wedding: PublicationSnapshot["wedding"],
  style: StudioStyle,
  events: readonly SnapshotEvent[],
): PublicationSnapshot {
  return { wedding: { ...wedding }, invite_style: { ...style }, events: [...events] };
}

export function couplePhotoAlt(wedding: PublicationSnapshot["wedding"]): string {
  return `Couple photo of ${wedding.bride_name} and ${wedding.groom_name}`;
}

export type DraftCardInput = {
  wedding: PublicationSnapshot["wedding"];
  style: StudioStyle;
  events: readonly SnapshotEvent[];
  is_sample: boolean;
  /** The photo to show: a signed URL or a local object URL; null for the no-photo layout (D107). */
  photo_url: string | null;
};

/**
 * The main card, as the guest page shows it: no function block, the wedding date and city
 * instead (`card_event_ids: []`). The exported card lists the functions every invited
 * guest is invited to, which only the export job computes (export-and-recovery 1.1).
 */
export function draftCardModel({ wedding, style, events, is_sample, photo_url }: DraftCardInput): CardModel {
  return buildCardModel({
    snapshot: draftSnapshot(wedding, style, events),
    card_event_ids: [],
    is_sample,
    photo: photo_url ? { url: photo_url, alt: couplePhotoAlt(wedding) } : null,
  });
}
