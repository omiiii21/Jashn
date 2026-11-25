import type { DemoFixture } from "@/contracts/fixtures";
import type { WeddingId } from "@/contracts/domain";

import type {
  InviteEventRow,
  InvitePublicationRow,
  InviteStore,
  InviteStyleRow,
  InviteVenueRow,
  InviteWeddingRow,
} from "./store";

/**
 * An in-memory InviteStore for unit tests (no database). Seeded from a demo fixture copy,
 * so ids match the fixture read models. `tx` is ignored.
 */
export type MemoryInviteState = {
  weddings: Map<WeddingId, InviteWeddingRow>;
  styles: Map<WeddingId, InviteStyleRow>;
  events: InviteEventRow[];
  venues: InviteVenueRow[];
  publications: InvitePublicationRow[];
  couple_photos: Set<string>;
};

export function memoryStateFromFixture(fixture: DemoFixture): MemoryInviteState {
  const wedding_id = fixture.wedding.wedding_id;
  return {
    weddings: new Map([
      [
        wedding_id,
        {
          id: wedding_id,
          bride_name: fixture.wedding.bride_name,
          groom_name: fixture.wedding.groom_name,
          city: fixture.wedding.city,
          wedding_date: fixture.wedding.wedding_date,
          is_sample: fixture.wedding.is_sample,
          draft_version: fixture.wedding.draft_version,
          published_revision: fixture.wedding.published_revision,
        },
      ],
    ]),
    styles: new Map([[wedding_id, { wedding_id, ...stripSeed(fixture.invite_style) }]]),
    events: fixture.events.map((event) => ({
      id: event.event_id,
      wedding_id,
      event_kind: event.event_kind,
      title: event.title,
      title_hi: event.title_hi,
      event_date: event.event_date,
      start_time: event.start_time,
      end_time: event.end_time,
      muhurat_time: event.muhurat_time,
      venue_id: event.venue_id,
      dress_code: event.dress_code,
      description: event.description,
      sort_order: event.sort_order,
      deleted_at: null,
    })),
    venues: fixture.venues.map((venue) => ({
      id: venue.venue_id,
      wedding_id,
      name: venue.name,
      place_name: venue.place_name,
      locality: venue.locality,
      address: venue.address,
      map_url: venue.map_url,
    })),
    publications: fixture.publications.map((publication) => ({
      id: publication.publication_id,
      wedding_id,
      revision: publication.revision,
      snapshot: publication.snapshot,
      draft_version: publication.draft_version,
      changes: publication.changes,
      note: publication.note,
      published_by_member_id: publication.published_by_member_id,
      published_at: new Date(publication.published_at),
    })),
    couple_photos: new Set(fixture.assets.filter((asset) => asset.asset_kind === "couple_photo").map((asset) => asset.asset_id)),
  };
}

function stripSeed<T extends { seed_key: unknown }>(row: T): Omit<T, "seed_key"> {
  const { seed_key, ...rest } = row;
  void seed_key;
  return rest;
}

export function createMemoryInviteStore(state: MemoryInviteState): InviteStore<unknown> {
  let nextId = 1;
  return {
    async readWedding(_tx, wedding_id) {
      const row = state.weddings.get(wedding_id);
      return row ? { ...row } : null;
    },
    async readInviteStyle(_tx, wedding_id) {
      const row = state.styles.get(wedding_id);
      return row ? { ...row } : null;
    },
    async readEvents(_tx, wedding_id) {
      return state.events.filter((event) => event.wedding_id === wedding_id).map((event) => ({ ...event }));
    },
    async readVenues(_tx, wedding_id) {
      return state.venues.filter((venue) => venue.wedding_id === wedding_id).map((venue) => ({ ...venue }));
    },
    async readPublication(_tx, wedding_id, revision) {
      const row = state.publications.find((entry) => entry.wedding_id === wedding_id && entry.revision === revision);
      return row ? { ...row } : null;
    },
    async insertPublication(_tx, row) {
      if (state.publications.some((entry) => entry.wedding_id === row.wedding_id && entry.revision === row.revision)) {
        throw new Error("duplicate revision");
      }
      const id = `00000000-0000-4000-8000-${String(nextId++).padStart(12, "0")}`;
      state.publications.push({ ...row, id });
      return { id };
    },
    async setPublishedRevision(_tx, wedding_id, revision) {
      const row = state.weddings.get(wedding_id);
      if (row) row.published_revision = revision;
    },
    async writeInviteStyle(_tx, wedding_id, patch) {
      const row = state.styles.get(wedding_id);
      if (!row) throw new Error("style row missing in the memory store");
      Object.assign(row, patch);
    },
    async isCouplePhoto(_tx, _wedding_id, asset_id) {
      return state.couple_photos.has(asset_id);
    },
  };
}
