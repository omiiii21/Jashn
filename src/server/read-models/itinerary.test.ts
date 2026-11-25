import { describe, expect, it } from "vitest";

import type { PublicationSnapshot } from "@/contracts/domain";
import { buildItinerarySnapshot } from "@/db/itinerary-snapshot";

import {
  detectConflicts,
  detectOverCapacity,
  detectOverlaps,
  eventWord,
  unpublishedChangesFrom,
  type AttributionEntry,
  type ConflictEvent,
} from "./itinerary";

const D0_EVENTS: ConflictEvent[] = [
  { event_id: "rec", event_kind: "reception", title: "Reception", event_date: "2026-12-14", start_time: "19:30:00", end_time: "23:00:00", venue_id: "banyan" },
  { event_id: "hal", event_kind: "haldi", title: "Haldi", event_date: "2026-12-13", start_time: "09:30:00", end_time: "11:30:00", venue_id: "courtyard" },
  { event_id: "san", event_kind: "sangeet", title: "Sangeet", event_date: "2026-12-13", start_time: "19:00:00", end_time: "23:00:00", venue_id: "garden" },
  { event_id: "meh", event_kind: "mehendi", title: "Mehendi", event_date: "2026-12-13", start_time: "15:00:00", end_time: "19:30:00", venue_id: "terrace" },
  { event_id: "wed", event_kind: "wedding", title: "Wedding", event_date: "2026-12-14", start_time: "10:30:00", end_time: "13:30:00", venue_id: "mandap" },
];
const D0_VENUES = [
  { venue_id: "terrace", name: "Terrace", capacity: 60 },
  { venue_id: "courtyard", name: "Courtyard Lawn", capacity: 80 },
  { venue_id: "garden", name: "Garden Hall", capacity: 180 },
  { venue_id: "mandap", name: "Mandap Lawn", capacity: 250 },
  { venue_id: "banyan", name: "Banyan Hall", capacity: 220 },
  { venue_id: "lotus", name: "Lotus Hall", capacity: 300 },
];
const D0_HEADCOUNT = new Map([
  ["rec", 229],
  ["san", 136],
  ["wed", 170],
  ["hal", 30],
  ["meh", 40],
]);

describe("draft conflicts (domain 4.3, AT-3.1)", () => {
  it("finds exactly the D0 pair: the mehendi overlap and the reception over capacity", () => {
    const conflicts = detectConflicts(D0_EVENTS, D0_VENUES, D0_HEADCOUNT);
    expect(conflicts).toEqual([
      {
        kind: "overlap",
        event_ids: ["meh", "san"],
        overlap_minutes: 30,
        text: "The Mehendi ends at 19:30 but the Sangeet starts at 19:00: 30 minutes overlap.",
      },
      {
        kind: "over_capacity",
        event_ids: ["rec"],
        venue_id: "banyan",
        capacity: 220,
        confirmed_headcount: 229,
        text: "Banyan Hall seats 220; 229 are attending the reception.",
      },
    ]);
  });

  it("drops the over-capacity warning once the reception moves to Lotus Hall (D2)", () => {
    const moved = D0_EVENTS.map((event) => (event.event_id === "rec" ? { ...event, venue_id: "lotus" } : event));
    const conflicts = detectConflicts(moved, D0_VENUES, D0_HEADCOUNT);
    expect(conflicts.map((conflict) => conflict.kind)).toEqual(["overlap"]);
  });

  it("drops the overlap when the mehendi ends at 17:30 (E-03)", () => {
    const fixed = D0_EVENTS.map((event) => (event.event_id === "meh" ? { ...event, end_time: "17:30" } : event));
    expect(detectOverlaps(fixed)).toEqual([]);
  });

  it("takes 3 hours when the end time is empty", () => {
    const rows: ConflictEvent[] = [
      { event_id: "a", event_kind: "other", title: "Cocktails", event_date: "2026-12-12", start_time: "18:00", end_time: null, venue_id: null },
      { event_id: "b", event_kind: "other", title: "Dinner", event_date: "2026-12-12", start_time: "20:30", end_time: "22:00", venue_id: null },
    ];
    expect(detectOverlaps(rows)).toEqual([
      { kind: "overlap", event_ids: ["a", "b"], overlap_minutes: 30, text: "The Cocktails ends at 21:00 but the Dinner starts at 20:30: 30 minutes overlap." },
    ]);
  });

  it("ignores back-to-back functions, other days and untimed functions", () => {
    const rows: ConflictEvent[] = [
      { event_id: "a", event_kind: "haldi", title: "Haldi", event_date: "2026-12-13", start_time: "09:00", end_time: "11:00", venue_id: null },
      { event_id: "b", event_kind: "mehendi", title: "Mehendi", event_date: "2026-12-13", start_time: "11:00", end_time: "13:00", venue_id: null },
      { event_id: "c", event_kind: "sangeet", title: "Sangeet", event_date: "2026-12-14", start_time: "09:30", end_time: "12:00", venue_id: null },
      { event_id: "d", event_kind: "other", title: "Puja", event_date: "2026-12-13", start_time: null, end_time: null, venue_id: null },
    ];
    expect(detectOverlaps(rows)).toEqual([]);
  });

  it("never warns for a venue without a capacity, or at capacity", () => {
    expect(detectOverCapacity(D0_EVENTS, [{ venue_id: "banyan", name: "Banyan Hall", capacity: null }], D0_HEADCOUNT)).toEqual([]);
    expect(detectOverCapacity(D0_EVENTS, D0_VENUES, new Map([["rec", 220]]))).toEqual([]);
  });

  it("uses the in-sentence function word", () => {
    expect(eventWord("reception", "Reception")).toBe("reception");
    expect(eventWord("other", "Cocktail night")).toBe("Cocktail night");
  });
});

describe("unpublishedChangesFrom (P8)", () => {
  const wedding = { id: "w", bride_name: "Mira", groom_name: "Kabir", city: "Bengaluru", wedding_date: "2026-12-14" };
  const venues = [
    { id: "banyan", wedding_id: "w", name: "Banyan Hall", place_name: "Mallige Gardens" },
    { id: "lotus", wedding_id: "w", name: "Lotus Hall", place_name: "Mallige Gardens" },
  ];
  const reception = {
    id: "rec",
    wedding_id: "w",
    event_kind: "reception" as const,
    title: "Reception",
    title_hi: "रिसेप्शन",
    event_date: "2026-12-14",
    start_time: "19:30:00",
    end_time: "23:00:00",
    venue_id: "banyan",
    description: "Dinner follows.",
  };
  const published: PublicationSnapshot = buildItinerarySnapshot({ wedding, invite_style: null, events: [reception], venues });

  it("is empty when the draft equals the latest snapshot", () => {
    const draft = buildItinerarySnapshot({ wedding, invite_style: null, events: [reception], venues });
    expect(unpublishedChangesFrom(published, draft, "w", [])).toEqual([]);
  });

  it("lists the venue move once, attributed to the latest entry that touched it", () => {
    const draft = buildItinerarySnapshot({ wedding, invite_style: null, events: [{ ...reception, venue_id: "lotus" }], venues });
    const at = new Date("2026-11-25T05:00:00Z");
    const entries: AttributionEntry[] = [
      { entity_id: "rec", topic: "event.updated", actor_label: "Mira", occurred_at: new Date("2026-11-25T06:00:00Z"), before: { lead_name: "x" }, after: { lead_name: "y" } },
      { entity_id: "rec", topic: "event.updated", actor_label: "Diya", occurred_at: at, before: { venue_id: "banyan", venue: "Banyan Hall" }, after: { venue_id: "lotus", venue: "Lotus Hall" } },
    ];
    expect(unpublishedChangesFrom(published, draft, "w", entries)).toEqual([
      {
        entity: "event",
        entity_id: "rec",
        field: "venue",
        published_value: "Banyan Hall",
        draft_value: "Lotus Hall",
        changed_by: "Diya",
        changed_at: "2026-11-25T10:30:00+05:30",
      },
    ]);
  });

  it("lists every function as added before the first publish", () => {
    const draft = buildItinerarySnapshot({ wedding, invite_style: null, events: [reception], venues });
    const changes = unpublishedChangesFrom(null, draft, "w", []);
    expect(changes).toEqual([
      { entity: "event", entity_id: "rec", field: "added", published_value: null, draft_value: "Reception", changed_by: null, changed_at: null },
    ]);
  });
});
