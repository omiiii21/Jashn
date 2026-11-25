import { describe, expect, it } from "vitest";

import { getDemoFixture, SEED_KEYS } from "../contracts/fixtures";
import type { PublicationSnapshot } from "../contracts/domain";
import { seededId } from "./ids";
import {
  buildItinerarySnapshot,
  DEFAULT_INVITE_STYLE,
  diffSnapshots,
  SNAPSHOT_EVENT_FIELDS,
  SNAPSHOT_INVITE_STYLE_FIELDS,
  SNAPSHOT_VENUE_FIELDS,
  SNAPSHOT_WEDDING_FIELDS,
  SnapshotInputError,
  snapshotsEqual,
  toIsoDate,
  toIsoTime,
  type ItinerarySnapshotInput,
  type SnapshotEventRow,
  type SnapshotVenueRow,
} from "./itinerary-snapshot";
import type { events, inviteStyles, venues, weddings } from "./schema";

// Compile-time check: rows from `db.select().from(...)` fit the builder as they come.
type SchemaRowsFit = {
  wedding: typeof weddings.$inferSelect extends ItinerarySnapshotInput["wedding"] ? true : false;
  invite_style: typeof inviteStyles.$inferSelect extends NonNullable<ItinerarySnapshotInput["invite_style"]> ? true : false;
  event: typeof events.$inferSelect extends SnapshotEventRow ? true : false;
  venue: typeof venues.$inferSelect extends SnapshotVenueRow ? true : false;
};
const schemaRowsFit: SchemaRowsFit = { wedding: true, invite_style: true, event: true, venue: true };
void schemaRowsFit;

// ---------------------------------------------------------------------------
// The D0 draft, as schema rows (demo-data 2, 3 and 11.1; open question 16's description),
// with the extra columns a `select()` returns, so the test proves they never leak.
// ---------------------------------------------------------------------------

const copy = "demo" as const;
const id = (table: string, key: string) => seededId(copy, table, key);
const weddingId = id("weddings", SEED_KEYS.wedding);
const photoId = id("assets", SEED_KEYS.couple_photo);
const venueId = (key: keyof typeof SEED_KEYS.venues) => id("venues", SEED_KEYS.venues[key]);
const eventId = (key: string) => id("events", key);

const MALLIGE = { place_name: "Mallige Gardens", locality: "Whitefield", address: "Mallige Gardens, Whitefield, Bengaluru" };

function venueRow(key: keyof typeof SEED_KEYS.venues, name: string, capacity: number, place = MALLIGE) {
  return {
    id: venueId(key),
    wedding_id: weddingId,
    seed_key: SEED_KEYS.venues[key],
    created_at: new Date("2026-11-20T04:30:00Z"),
    updated_at: new Date("2026-11-20T04:30:00Z"),
    name,
    ...place,
    capacity,
    map_url: null,
  };
}

const D0_VENUES = [
  venueRow("terrace", "Terrace", 60, {
    place_name: "Deshpande family home",
    locality: "Jayanagar",
    address: "Fictional address, Jayanagar, Bengaluru",
  }),
  venueRow("courtyard", "Courtyard Lawn", 80),
  venueRow("garden", "Garden Hall", 180),
  venueRow("mandap", "Mandap Lawn", 250),
  venueRow("banyan", "Banyan Hall", 220),
  venueRow("lotus", "Lotus Hall", 300),
];

type EventSeed = {
  key: string;
  kind: SnapshotEventRow["event_kind"];
  title: string;
  title_hi: string;
  date: string;
  start: string;
  end: string;
  muhurat: string | null;
  venue: keyof typeof SEED_KEYS.venues;
  dress: string;
  lead: string;
  expected: number;
  description: string;
  sort_order: number;
};

const EVENT_SEEDS: EventSeed[] = [
  { key: "EVT-HAL", kind: "haldi", title: "Haldi", title_hi: "हल्दी", date: "2026-12-13", start: "09:30:00", end: "11:30:00", muhurat: null, venue: "courtyard", dress: "Yellow; clothes that can get stained", lead: "Neelam Arora", expected: 30, description: "Joint haldi for both families. Turmeric paste from Sunita's family recipe.", sort_order: 1 },
  { key: "EVT-MEH", kind: "mehendi", title: "Mehendi", title_hi: "मेहंदी", date: "2026-12-13", start: "15:00:00", end: "19:30:00", muhurat: null, venue: "terrace", dress: "Green and pink, festive casual", lead: "Sunita Deshpande", expected: 60, description: "Henna for the bride and family. Music and chai.", sort_order: 2 },
  { key: "EVT-SAN", kind: "sangeet", title: "Sangeet", title_hi: "संगीत", date: "2026-12-13", start: "19:00:00", end: "23:00:00", muhurat: null, venue: "garden", dress: "Indo-western, some sparkle", lead: "Diya Fernandes", expected: 150, description: "Family dance performances, then the DJ.", sort_order: 3 },
  { key: "EVT-WED", kind: "wedding", title: "Wedding", title_hi: "विवाह", date: "2026-12-14", start: "10:30:00", end: "13:30:00", muhurat: "11:15:00", venue: "mandap", dress: "Traditional: sarees, kurtas, sherwanis; pastels", lead: "Anil Deshpande", expected: 180, description: "Pheras at the muhurat, then lunch.", sort_order: 4 },
  { key: "EVT-REC", kind: "reception", title: "Reception", title_hi: "रिसेप्शन", date: "2026-12-14", start: "19:30:00", end: "23:00:00", muhurat: null, venue: "banyan", dress: "Formal evening", lead: "Diya Fernandes", expected: 250, description: "Dinner follows.", sort_order: 5 },
];

function eventRow(seed: EventSeed) {
  return {
    id: eventId(seed.key),
    wedding_id: weddingId,
    seed_key: seed.key,
    created_at: new Date("2026-11-20T04:30:00Z"),
    updated_at: new Date("2026-11-20T04:30:00Z"),
    event_kind: seed.kind,
    title: seed.title,
    title_hi: seed.title_hi,
    event_date: seed.date,
    start_time: seed.start,
    end_time: seed.end,
    muhurat_time: seed.muhurat,
    venue_id: venueId(seed.venue),
    dress_code: seed.dress,
    description: seed.description,
    lead_name: seed.lead,
    expected_headcount: seed.expected,
    sort_order: seed.sort_order,
    version: 1,
    deleted_at: null,
  };
}

const WEDDING_ROW = {
  id: weddingId,
  seed_key: SEED_KEYS.wedding,
  bride_name: "Mira",
  groom_name: "Kabir",
  city: "Bengaluru",
  wedding_date: "2026-12-14",
  expected_guests: 250,
  timezone: "Asia/Kolkata",
  is_sample: true,
  managers_can_see_vendor_dues: true,
  managers_can_see_budget: false,
  managers_can_see_guest_contacts: false,
  version: 40,
  draft_version: 12,
  published_revision: 2,
  created_by_user_id: "00000000-0000-4000-8000-000000000001",
};

const STYLE_ROW = {
  wedding_id: weddingId,
  seed_key: SEED_KEYS.wedding,
  theme: "maroon_gold" as const,
  typeface: "eczar" as const,
  layout: "card_with_inserts" as const,
  photo_frame: "mounted" as const,
  photo_asset_id: photoId,
  heading_hi: "शुभ विवाह",
  // export-and-recovery 1.2: two paragraphs, the first above the names and the second below.
  wording_en: "With the blessings of our families\n\ninvite you to celebrate their wedding",
  wording_hi: "आपकी उपस्थिति से हमें अत्यंत प्रसन्नता होगी।",
  blessing_line: null,
  updated_by_member_id: null,
};

/** The D0 function rows, typed as schema rows (with `seed_key`). */
const d0Events = () => EVENT_SEEDS.map(eventRow);

function d0Input(): ItinerarySnapshotInput {
  return { wedding: WEDDING_ROW, invite_style: STYLE_ROW, events: d0Events(), venues: D0_VENUES };
}

/** REV-1's draft (demo-data 3.2): no haldi yet, mehendi 15:00–18:00. */
function rev1Input(): ItinerarySnapshotInput {
  const events = EVENT_SEEDS.filter((seed) => seed.key !== "EVT-HAL").map((seed) =>
    seed.key === "EVT-MEH" ? eventRow({ ...seed, end: "18:00:00" }) : eventRow(seed),
  );
  return { ...d0Input(), events };
}

/** D2 (demo-data 9.3): Diya moved the reception to Lotus Hall in the draft. */
function d2Input(): ItinerarySnapshotInput {
  const events = EVENT_SEEDS.map((seed) => (seed.key === "EVT-REC" ? eventRow({ ...seed, venue: "lotus" }) : eventRow(seed)));
  return { ...d0Input(), events };
}

function shuffled<T>(rows: readonly T[]): T[] {
  // A fixed permutation, so the test is deterministic.
  return [rows[3], rows[0], rows[4], rows[2], rows[1], ...rows.slice(5)].filter((row) => row !== undefined);
}

// ---------------------------------------------------------------------------

describe("buildItinerarySnapshot", () => {
  it("builds the D0 draft with exactly P2's fields, HH:MM times and the functions in order", () => {
    const snapshot = buildItinerarySnapshot(d0Input());

    expect(Object.keys(snapshot)).toEqual(["wedding", "invite_style", "events"]);
    expect(Object.keys(snapshot.wedding)).toEqual([...SNAPSHOT_WEDDING_FIELDS]);
    expect(Object.keys(snapshot.invite_style)).toEqual([...SNAPSHOT_INVITE_STYLE_FIELDS]);
    expect(snapshot.wedding).toEqual({ bride_name: "Mira", groom_name: "Kabir", city: "Bengaluru", wedding_date: "2026-12-14" });

    expect(snapshot.events.map((event) => event.title)).toEqual(["Haldi", "Mehendi", "Sangeet", "Wedding", "Reception"]);
    for (const event of snapshot.events) {
      expect(Object.keys(event)).toEqual([...SNAPSHOT_EVENT_FIELDS]);
      expect(event.venue && Object.keys(event.venue)).toEqual([...SNAPSHOT_VENUE_FIELDS]);
      for (const time of [event.start_time, event.end_time, event.muhurat_time]) {
        if (time !== null) expect(time).toMatch(/^\d{2}:\d{2}$/);
      }
    }

    const reception = snapshot.events[4];
    expect(reception).toEqual({
      event_id: eventId("EVT-REC"),
      event_kind: "reception",
      title: "Reception",
      title_hi: "रिसेप्शन",
      event_date: "2026-12-14",
      start_time: "19:30",
      end_time: "23:00",
      muhurat_time: null,
      dress_code: "Formal evening",
      description: "Dinner follows.",
      venue: {
        venue_id: venueId("banyan"),
        name: "Banyan Hall",
        place_name: "Mallige Gardens",
        locality: "Whitefield",
        address: "Mallige Gardens, Whitefield, Bengaluru",
        map_url: null,
      },
    });
    expect(snapshot.events[3].muhurat_time).toBe("11:15");

    // Planner-only columns never reach guests (G rules).
    const json = JSON.stringify(snapshot);
    for (const leaked of ["lead_name", "expected_headcount", "capacity", "seed_key", "sort_order", "version", "Neelam Arora", "created_at"]) {
      expect(json).not.toContain(leaked);
    }
  });

  it("builds REV-2 from the D0 draft field for field as the fixtures expect", () => {
    const fixture = getDemoFixture(copy);
    const rev2 = fixture.publications.find((publication) => publication.seed_key === "REV-2");
    const rev1 = fixture.publications.find((publication) => publication.seed_key === "REV-1");
    expect(rev2 && rev1).toBeTruthy();

    expect(buildItinerarySnapshot(d0Input())).toEqual(rev2!.snapshot);
    expect(buildItinerarySnapshot(rev1Input())).toEqual(rev1!.snapshot);

    // The contract DTOs (event_id / venue_id keys) build the same snapshot.
    const fromDtos = buildItinerarySnapshot({
      wedding: fixture.wedding,
      invite_style: fixture.invite_style,
      events: fixture.events,
      venues: fixture.venues,
    });
    expect(fromDtos).toEqual(rev2!.snapshot);
  });

  it("is idempotent and independent of row order", () => {
    const first = buildItinerarySnapshot(d0Input());
    const second = buildItinerarySnapshot(d0Input());
    expect(second).toEqual(first);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));

    const reordered = buildItinerarySnapshot({ ...d0Input(), events: shuffled(d0Input().events), venues: shuffled(D0_VENUES) });
    expect(JSON.stringify(reordered)).toBe(JSON.stringify(first));
  });

  it("orders by date, then start time with untimed functions last, then sort_order, and drops deleted functions", () => {
    const base = eventRow(EVENT_SEEDS[0]);
    const rows = [
      { ...base, id: "e-untimed", title: "Untimed", event_date: "2026-12-13", start_time: null, end_time: null, sort_order: 0 },
      { ...base, id: "e-b", title: "B", event_date: "2026-12-13", start_time: "09:00:00", sort_order: 2 },
      { ...base, id: "e-a", title: "A", event_date: "2026-12-13", start_time: "09:00", sort_order: 1 },
      { ...base, id: "e-early-day", title: "Early day", event_date: "2026-12-12", start_time: "22:00:00", sort_order: 9 },
      { ...base, id: "e-gone", title: "Gone", event_date: "2026-12-11", deleted_at: new Date("2026-11-24T00:00:00Z") },
      { ...base, id: "e-tie-2", title: "Tie 2", event_date: "2026-12-14", start_time: "10:00", sort_order: 1 },
      { ...base, id: "e-tie-1", title: "Tie 1", event_date: "2026-12-14", start_time: "10:00", sort_order: 1 },
    ];
    const snapshot = buildItinerarySnapshot({ ...d0Input(), events: rows });
    expect(snapshot.events.map((event) => event.title)).toEqual(["Early day", "A", "B", "Untimed", "Tie 1", "Tie 2"]);
  });

  it("fills a missing style row with the table defaults and missing values with null", () => {
    const venue: SnapshotVenueRow = { id: "v-1", name: "Hall" };
    const snapshot = buildItinerarySnapshot({
      wedding: { bride_name: "A", groom_name: "B", wedding_date: new Date("2027-01-05T00:00:00Z") },
      invite_style: null,
      events: [{ id: "e-1", event_kind: "other", title: "Lunch", title_hi: "Lunch", event_date: "2027-01-05", venue_id: "v-1" }],
      venues: [venue],
    });
    expect(snapshot.invite_style).toEqual(DEFAULT_INVITE_STYLE);
    expect(snapshot.wedding).toEqual({ bride_name: "A", groom_name: "B", city: null, wedding_date: "2027-01-05" });
    expect(snapshot.events[0]).toMatchObject({ start_time: null, end_time: null, muhurat_time: null, dress_code: null, description: null });
    expect(snapshot.events[0].venue).toEqual({ venue_id: "v-1", name: "Hall", place_name: null, locality: null, address: null, map_url: null });
  });

  it("refuses a missing venue and rows of another wedding", () => {
    const input = d0Input();
    expect(() => buildItinerarySnapshot({ ...input, venues: D0_VENUES.slice(0, 4) })).toThrow(SnapshotInputError);
    const foreign = { ...D0_VENUES[4], wedding_id: id("weddings", "OTHER") };
    expect(() => buildItinerarySnapshot({ ...input, venues: [...D0_VENUES.slice(0, 4), foreign, D0_VENUES[5]] })).toThrow(/another wedding/);
    const foreignEvent = { ...eventRow(EVENT_SEEDS[0]), wedding_id: id("weddings", "OTHER") };
    expect(() => buildItinerarySnapshot({ ...input, events: [foreignEvent] })).toThrow(/another wedding/);
  });
});

describe("toIsoTime and toIsoDate", () => {
  it("trims Postgres times to HH:MM and rejects anything else", () => {
    expect(toIsoTime("19:30:00")).toBe("19:30");
    expect(toIsoTime("07:05:00.000000")).toBe("07:05");
    expect(toIsoTime("9:05")).toBe("09:05");
    expect(toIsoTime("24:00:00")).toBe("24:00");
    expect(toIsoTime(null)).toBeNull();
    expect(toIsoTime(undefined)).toBeNull();
    for (const bad of ["7pm", "25:00", "19:60", "24:30", ""]) expect(() => toIsoTime(bad)).toThrow(SnapshotInputError);
  });

  it("reads dates as YYYY-MM-DD, and a Date as its IST calendar date", () => {
    expect(toIsoDate("2026-12-14")).toBe("2026-12-14");
    expect(toIsoDate(new Date("2026-12-14T00:00:00Z"))).toBe("2026-12-14");
    // IST midnight is 18:30 UTC the day before; the IST date is still the 14th.
    expect(toIsoDate(new Date("2026-12-13T18:30:00Z"))).toBe("2026-12-14");
    for (const bad of ["14/12/2026", "2026-02-30", "2026-13-01", "2026-12-14T00:00:00Z", "2026-12-145", ""]) {
      expect(() => toIsoDate(bad)).toThrow(SnapshotInputError);
    }
    expect(() => toIsoDate(new Date("nope"))).toThrow(SnapshotInputError);
  });
});

describe("diffSnapshots", () => {
  const d0 = () => buildItinerarySnapshot(d0Input());

  it("gives exactly the reception venue change from D0 to D2 (REV-3's changes)", () => {
    const changes = diffSnapshots(d0(), buildItinerarySnapshot(d2Input()), { wedding_id: weddingId });
    expect(changes).toEqual([{ entity: "event", entity_id: eventId("EVT-REC"), field: "venue", from: "Banyan Hall", to: "Lotus Hall" }]);
  });

  it("gives REV-2's changes from REV-1 as the fixtures expect", () => {
    const fixture = getDemoFixture(copy);
    const rev2 = fixture.publications.find((publication) => publication.seed_key === "REV-2")!;
    expect(diffSnapshots(buildItinerarySnapshot(rev1Input()), d0())).toEqual(rev2.changes);
  });

  it("is empty for the first publish, for a snapshot against itself and after a rebuild", () => {
    expect(diffSnapshots(null, d0())).toEqual([]);
    const snapshot = d0();
    expect(diffSnapshots(snapshot, snapshot)).toEqual([]);
    expect(diffSnapshots(snapshot, buildItinerarySnapshot({ ...d0Input(), events: shuffled(d0Input().events) }))).toEqual([]);
    // A snapshot that went through jsonb (a JSON round trip) still matches the draft.
    const stored = JSON.parse(JSON.stringify(snapshot)) as PublicationSnapshot;
    expect(snapshotsEqual(stored, d0())).toBe(true);
    expect(snapshotsEqual(stored, buildItinerarySnapshot(d2Input()))).toBe(false);
    expect(snapshotsEqual(null, d0())).toBe(false);
    expect(snapshotsEqual(null, null)).toBe(true);
  });

  it("reads a key missing from a stored snapshot as null, never as an undefined from or to", () => {
    const draft = d0();
    const stored = JSON.parse(JSON.stringify(draft)) as PublicationSnapshot;
    // An older stored snapshot without the blessing line, the reception description or a venue map link.
    delete (stored.invite_style as Partial<PublicationSnapshot["invite_style"]>).blessing_line;
    delete (stored.events[4] as Partial<(typeof stored.events)[number]>).description;
    delete (stored.events[4].venue as Partial<NonNullable<(typeof stored.events)[number]["venue"]>>).map_url;

    const receptionWithoutDescription = d0Events().map((row) => (row.seed_key === "EVT-REC" ? { ...row, description: null } : row));
    const equalDraft = buildItinerarySnapshot({
      ...d0Input(),
      invite_style: { ...STYLE_ROW, blessing_line: null },
      events: receptionWithoutDescription,
    });
    expect(diffSnapshots(stored, equalDraft)).toEqual([]);
    expect(snapshotsEqual(stored, equalDraft)).toBe(true);

    const changes = diffSnapshots(stored, draft, { wedding_id: weddingId });
    expect(changes).toEqual([
      { entity: "event", entity_id: eventId("EVT-REC"), field: "description", from: null, to: "Dinner follows." },
    ]);
    for (const change of changes) {
      expect(change.from === undefined || change.to === undefined).toBe(false);
    }
  });

  it("gives no changes for a first publish, but the draft still differs from no revision (P7 uses snapshotsEqual)", () => {
    expect(diffSnapshots(null, d0())).toEqual([]);
    expect(snapshotsEqual(null, d0())).toBe(false);
  });

  it("lists every function as added against an empty schedule (the itinerary before a first publish)", () => {
    const snapshot = d0();
    const changes = diffSnapshots({ ...snapshot, events: [] }, snapshot);
    expect(changes.map((change) => [change.field, change.to])).toEqual([
      ["added", "Haldi"],
      ["added", "Mehendi"],
      ["added", "Sangeet"],
      ["added", "Wedding"],
      ["added", "Reception"],
    ]);
  });

  it("reports wedding, field, removal, venue and style changes in order", () => {
    const before = d0();
    const events = d0Events()
      .filter((row) => row.seed_key !== "EVT-HAL")
      .map((row) => (row.seed_key === "EVT-SAN" ? { ...row, start_time: "19:45:00", dress_code: null } : row));
    const venues = D0_VENUES.map((row) => (row.seed_key === SEED_KEYS.venues.garden ? { ...row, address: "Gate 2, Mallige Gardens" } : row));
    const after = buildItinerarySnapshot({
      wedding: { ...WEDDING_ROW, city: "Mysuru" },
      invite_style: { ...STYLE_ROW, theme: "peacock_gold", photo_asset_id: null },
      events,
      venues,
    });

    expect(diffSnapshots(before, after, { wedding_id: weddingId })).toEqual([
      { entity: "wedding", entity_id: weddingId, field: "city", from: "Bengaluru", to: "Mysuru" },
      { entity: "event", entity_id: eventId("EVT-SAN"), field: "start_time", from: "19:00", to: "19:45" },
      { entity: "event", entity_id: eventId("EVT-SAN"), field: "dress_code", from: "Indo-western, some sparkle", to: null },
      { entity: "event", entity_id: eventId("EVT-HAL"), field: "removed", from: "Haldi", to: null },
      { entity: "venue", entity_id: venueId("garden"), field: "address", from: "Mallige Gardens, Whitefield, Bengaluru", to: "Gate 2, Mallige Gardens" },
      { entity: "invite_style", entity_id: weddingId, field: "theme", from: "maroon_gold", to: "peacock_gold" },
      { entity: "invite_style", entity_id: weddingId, field: "photo_asset_id", from: photoId, to: null },
    ]);
  });

  it("reports a venue edit once even when two functions use it, and labels same-named venues with their place", () => {
    const input = d0Input();
    // Both evening functions at Banyan Hall, then Banyan Hall gets a map link.
    const sharing = d0Events().map((row) => (row.seed_key === "EVT-SAN" ? { ...row, venue_id: venueId("banyan") } : row));
    const before = buildItinerarySnapshot({ ...input, events: sharing });
    const after = buildItinerarySnapshot({
      ...input,
      events: sharing,
      venues: D0_VENUES.map((row) => (row.seed_key === SEED_KEYS.venues.banyan ? { ...row, map_url: "https://maps.example.com/banyan" } : row)),
    });
    expect(diffSnapshots(before, after)).toEqual([
      { entity: "venue", entity_id: venueId("banyan"), field: "map_url", from: null, to: "https://maps.example.com/banyan" },
    ]);

    const twin = { ...D0_VENUES[5], id: "v-twin", name: "Banyan Hall", place_name: "Another Garden" };
    const moved = buildItinerarySnapshot({
      ...input,
      events: d0Events().map((row) => (row.seed_key === "EVT-REC" ? { ...row, venue_id: "v-twin" } : row)),
      venues: [...D0_VENUES, twin],
    });
    expect(diffSnapshots(d0(), moved)).toEqual([
      { entity: "event", entity_id: eventId("EVT-REC"), field: "venue", from: "Banyan Hall, Mallige Gardens", to: "Banyan Hall, Another Garden" },
    ]);
  });
});
