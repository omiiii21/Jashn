import { describe, expect, it } from "vitest";

import {
  changesGuestVisible,
  checkMergedTimes,
  createdEventActivity,
  diffEventValues,
  formatClock12,
  formatWhen,
  matchVenueName,
  normaliseName,
  requirementActivity,
  requirementItem,
  requirementTextKey,
  updatedEventActivity,
  warningsFor,
  type EventValues,
} from "./events";

const VENUES = [
  { venue_id: "v-terrace", name: "Terrace", place_name: "Deshpande family home" },
  { venue_id: "v-courtyard", name: "Courtyard Lawn", place_name: "Mallige Gardens" },
  { venue_id: "v-garden", name: "Garden Hall", place_name: "Mallige Gardens" },
  { venue_id: "v-mandap", name: "Mandap Lawn", place_name: "Mallige Gardens" },
  { venue_id: "v-banyan", name: "Banyan Hall", place_name: "Mallige Gardens" },
  { venue_id: "v-lotus", name: "Lotus Hall", place_name: "Mallige Gardens" },
];

describe("matchVenueName (domain 3.2, voice 2.5)", () => {
  it("matches the name, ignoring case, spaces and punctuation", () => {
    expect(matchVenueName("Lotus Hall", VENUES)).toEqual({ kind: "match", venue: VENUES[5] });
    expect(matchVenueName("  lotus   HALL! ", VENUES)).toEqual({ kind: "match", venue: VENUES[5] });
  });

  it('matches "{name}, {place}" and "{name} at {place}" (E-04)', () => {
    expect(matchVenueName("Lotus Hall, Mallige Gardens", VENUES)).toMatchObject({ kind: "match", venue: { venue_id: "v-lotus" } });
    expect(matchVenueName("Lotus Hall at Mallige Gardens", VENUES)).toMatchObject({ kind: "match", venue: { venue_id: "v-lotus" } });
  });

  it("matches one distinctive word, never a shared one", () => {
    expect(matchVenueName("Lotus", VENUES)).toMatchObject({ kind: "match", venue: { venue_id: "v-lotus" } });
    expect(matchVenueName("the banyan one", VENUES)).toMatchObject({ kind: "match", venue: { venue_id: "v-banyan" } });
    expect(matchVenueName("Lotus wala hall", VENUES)).toMatchObject({ kind: "match", venue: { venue_id: "v-lotus" } });
    expect(matchVenueName("Lotus Hall Mallige Gardens", VENUES)).toMatchObject({ kind: "match", venue: { venue_id: "v-lotus" } });
    // Other words don't stop a distinctive-word match (3.2, voice 2.5): no stray new venue.
    expect(matchVenueName("Lotus Hall, Whitefield", VENUES)).toMatchObject({ kind: "match", venue: { venue_id: "v-lotus" } });
    expect(matchVenueName("Lotus Hall, Mallige Gardens, Whitefield", VENUES)).toMatchObject({ kind: "match", venue: { venue_id: "v-lotus" } });
    expect(matchVenueName("Skyline Terrace Bar", VENUES)).toMatchObject({ kind: "match", venue: { venue_id: "v-terrace" } });
    expect(matchVenueName("Skyline Bar", VENUES)).toEqual({ kind: "none" });
    // "Hall" is in three names and "Lawn" in two: not distinctive.
    expect(matchVenueName("Hall", VENUES)).toEqual({ kind: "none" });
    expect(matchVenueName("Lawn", VENUES)).toEqual({ kind: "none" });
  });

  it("asks when words of several venues are named", () => {
    const result = matchVenueName("Lotus or Banyan", VENUES);
    expect(result.kind).toBe("ambiguous");
    if (result.kind === "ambiguous") expect(result.venues.map((venue) => venue.venue_id).sort()).toEqual(["v-banyan", "v-lotus"]);
  });

  it("asks when two venues share the name, unless the place is given", () => {
    const twins = [
      { venue_id: "a", name: "Garden Hall", place_name: "Mallige Gardens" },
      { venue_id: "b", name: "Garden Hall", place_name: "Palace Grounds" },
    ];
    expect(matchVenueName("Garden Hall", twins).kind).toBe("ambiguous");
    expect(matchVenueName("Garden Hall, Palace Grounds", twins)).toMatchObject({ kind: "match", venue: { venue_id: "b" } });
  });

  it("finds nothing for an unknown name or empty text (a new venue)", () => {
    expect(matchVenueName("Taj West End", VENUES)).toEqual({ kind: "none" });
    expect(matchVenueName(" , ", VENUES)).toEqual({ kind: "none" });
  });

  it("normalises & and punctuation", () => {
    expect(normaliseName("Frame & Phera Studio")).toBe("frame and phera studio");
    expect(normaliseName("Lotus-Hall,  Mallige")).toBe("lotus hall mallige");
  });
});

describe("formatting (domain 3.0 placeholders)", () => {
  it("formats {when} as 'Mon 14 Dec, 7:30 PM'", () => {
    expect(formatWhen("2026-12-14", "19:30")).toBe("Mon 14 Dec, 7:30 PM");
    expect(formatWhen("2026-12-13", "09:30:00")).toBe("Sun 13 Dec, 9:30 AM");
    expect(formatWhen("2026-12-13", null)).toBe("Sun 13 Dec");
    expect(formatClock12("00:15")).toBe("12:15 AM");
    expect(formatClock12("12:00")).toBe("12:00 PM");
  });

  it("builds {item} with the quantity (ACT-10)", () => {
    expect(requirementItem("Jain food", 12)).toBe("Jain food for 12");
    expect(requirementItem("Jain food", null)).toBe("Jain food");
  });

  it("keys requirement text ignoring case and spaces (3.4 duplicates)", () => {
    expect(requirementTextKey(" Jain  Food ")).toBe(requirementTextKey("jain food"));
    expect(requirementTextKey("Jain food")).not.toBe(requirementTextKey("Jain foods"));
  });
});

const RECEPTION: EventValues = {
  title: "Reception",
  title_hi: "रिसेप्शन",
  event_date: "2026-12-14",
  start_time: "19:30:00",
  end_time: "23:00:00",
  muhurat_time: null,
  venue_id: "v-banyan",
  dress_code: "Formal evening",
  description: "Dinner follows.",
  lead_name: "Diya Fernandes",
  expected_headcount: 250,
};
const LABEL = { event_kind: "reception" as const, title: "Reception", title_hi: "रिसेप्शन" };

describe("diffEventValues and P1", () => {
  it("lists only changed fields, comparing times as HH:MM", () => {
    expect(diffEventValues(RECEPTION, { ...RECEPTION, start_time: "19:30" })).toEqual([]);
    expect(diffEventValues(RECEPTION, { ...RECEPTION, venue_id: "v-lotus" })).toEqual([
      { field: "venue_id", from: "v-banyan", to: "v-lotus" },
    ]);
  });

  it("bumps draft_version only for guest-visible fields", () => {
    expect(changesGuestVisible(diffEventValues(RECEPTION, { ...RECEPTION, lead_name: "Anil" }))).toBe(false);
    expect(changesGuestVisible(diffEventValues(RECEPTION, { ...RECEPTION, expected_headcount: 260 }))).toBe(false);
    expect(changesGuestVisible(diffEventValues(RECEPTION, { ...RECEPTION, dress_code: "Black tie" }))).toBe(true);
  });

  it("checks merged times: end after start, muhurat inside (AT-3.8)", () => {
    expect(checkMergedTimes({ start_time: "19:30", end_time: "19:00", muhurat_time: null })).toBe("end_time");
    expect(checkMergedTimes({ start_time: "19:30", end_time: "23:00", muhurat_time: "23:30" })).toBe("muhurat_time");
    expect(checkMergedTimes({ start_time: "19:30", end_time: "23:00", muhurat_time: "20:00" })).toBeNull();
    expect(checkMergedTimes({ start_time: "19:30", end_time: null, muhurat_time: "05:00" })).toBeNull();
  });
});

describe("activity templates (3.2, 3.4)", () => {
  it("writes ACT-07 for the venue move", () => {
    const next = { ...RECEPTION, venue_id: "v-lotus" };
    const entry = updatedEventActivity({
      actor_label: "Diya",
      event_id: "e-rec",
      event: LABEL,
      current: RECEPTION,
      next,
      changes: diffEventValues(RECEPTION, next),
      venues: { from: { name: "Banyan Hall", place_name: "Mallige Gardens" }, to: { name: "Lotus Hall", place_name: "Mallige Gardens" } },
    });
    expect(entry.summary_en).toBe("Diya moved the reception from Banyan Hall to Lotus Hall.");
    expect(entry.summary_hi).toBe("Diya ने रिसेप्शन का स्थान Banyan Hall से बदलकर Lotus Hall किया।");
    expect(entry.topic).toBe("event.updated");
    expect(entry.visibility).toBe("members");
    expect(entry.before).toEqual({ venue_id: "v-banyan", venue: "Banyan Hall" });
    expect(entry.after).toEqual({ venue_id: "v-lotus", venue: "Lotus Hall" });
  });

  it("the venue line wins over the time line; before/after carry every field", () => {
    const next = { ...RECEPTION, venue_id: "v-lotus", start_time: "20:00" };
    const entry = updatedEventActivity({
      actor_label: "Mira",
      event_id: "e-rec",
      event: LABEL,
      current: RECEPTION,
      next,
      changes: diffEventValues(RECEPTION, next),
      venues: { from: { name: "Banyan Hall", place_name: null }, to: { name: "Lotus Hall", place_name: null } },
    });
    expect(entry.summary_en).toBe("Mira moved the reception from Banyan Hall to Lotus Hall.");
    expect(entry.after).toEqual({ start_time: "20:00", venue_id: "v-lotus", venue: "Lotus Hall" });
  });

  it("writes the time line like ACT-02", () => {
    const mehendi: EventValues = { ...RECEPTION, title: "Mehendi", title_hi: "मेहंदी", event_date: "2026-12-13", start_time: "15:00", end_time: "18:00" };
    const next = { ...mehendi, end_time: "19:30" };
    const entry = updatedEventActivity({
      actor_label: "Diya",
      event_id: "e-meh",
      event: { event_kind: "mehendi", title: "Mehendi", title_hi: "मेहंदी" },
      current: mehendi,
      next,
      changes: diffEventValues(mehendi, next),
      venues: { from: null, to: null },
    });
    expect(entry.summary_en).toBe("Diya changed the mehendi time from Sun 13 Dec, 6:00 PM to Sun 13 Dec, 7:30 PM.");
    expect(entry.summary_hi).toBe("Diya ने मेहंदी का समय Sun 13 Dec, 6:00 PM से बदलकर Sun 13 Dec, 7:30 PM किया।");
    expect(entry.before).toEqual({ end_time: "18:00" });
  });

  it("writes the generic line for other fields", () => {
    const next = { ...RECEPTION, dress_code: "Black tie", lead_name: null };
    const entry = updatedEventActivity({
      actor_label: "Mira",
      event_id: "e-rec",
      event: LABEL,
      current: RECEPTION,
      next,
      changes: diffEventValues(RECEPTION, next),
      venues: { from: null, to: null },
    });
    expect(entry.summary_en).toBe("Mira changed the reception: dress code Formal evening to Black tie, lead removed.");
    expect(entry.summary_hi).toBe("Mira ने रिसेप्शन में बदलाव किया: ड्रेस कोड Formal evening से Black tie, ज़िम्मेदार हटाया।");
  });

  it("writes create_event's lines with and without a venue", () => {
    const withVenue = createdEventActivity({
      actor_label: "Mira",
      event_id: "e-san",
      event: { event_kind: "sangeet", title: "Sangeet", title_hi: "संगीत" },
      event_date: "2026-12-13",
      start_time: "19:00",
      venue: { name: "Garden Hall", place_name: null },
      after: {},
    });
    expect(withVenue.summary_en).toBe("Mira added the sangeet on Sun 13 Dec, 7:00 PM at Garden Hall.");
    expect(withVenue.summary_hi).toBe("Mira ने संगीत जोड़ा: Sun 13 Dec, 7:00 PM, Garden Hall।");
    expect(withVenue.topic).toBe("event.created");
    const bare = createdEventActivity({
      actor_label: "Mira",
      event_id: "e-x",
      event: { event_kind: "other", title: "Cocktail night", title_hi: "Cocktail night" },
      event_date: "2026-12-12",
      start_time: null,
      venue: null,
      after: {},
    });
    expect(bare.summary_en).toBe("Mira added the Cocktail night on Sat 12 Dec.");
    expect(bare.summary_hi).toBe("Mira ने Cocktail night जोड़ा: Sat 12 Dec।");
  });

  it("writes ACT-10 for a requirement", () => {
    const entry = requirementActivity({ actor_label: "Mira", requirement_id: "r", event: LABEL, item: "Jain food for 12", after: {} });
    expect(entry.summary_en).toBe('Mira added "Jain food for 12" to the reception.');
    expect(entry.summary_hi).toBe("Mira ने रिसेप्शन में ज़रूरत जोड़ी: Jain food for 12।");
    expect(entry.visibility).toBe("members");
    expect(entry.topic).toBe("requirement.added");
  });

  it("turns the conflicts that involve a function into warnings", () => {
    const warnings = warningsFor(
      [
        { kind: "overlap", event_ids: ["a", "b"], overlap_minutes: 30, text: "x" },
        { kind: "over_capacity", event_ids: ["c"], venue_id: "v", capacity: 1, confirmed_headcount: 2, text: "y" },
      ],
      "b",
    );
    expect(warnings).toEqual([{ kind: "overlap", message: "x", entity_ids: ["a", "b"] }]);
  });
});
