import { describe, expect, it } from "vitest";

import { fixtureSessionActor } from "@/contracts/fixtures";
import { fixtureServices } from "@/contracts/services";

import { changedByLine, draftLine, groupByDay, publishedLine, timeRange, venueOptionLabel, wasLine } from "./event-text";

/** Copy b, Lane B's rehearsal copy. */
const WEDDING_ID = "3e546e78-a307-5757-a6e2-2b08e26c0a76";
const people = { mira: fixtureSessionActor("mira", "b"), diya: fixtureSessionActor("diya", "b") };

function read(person: keyof typeof people) {
  return fixtureServices.read("itinerary", { actor: people[person], wedding_id: WEDDING_ID, params: {} as never });
}

describe.each(["mira", "diya"] as const)("the itinerary at D0 (AT-3.1), %s", (person) => {
  it("lists five functions over two days, two conflicts, nothing unpublished, revision 2", async () => {
    const itinerary = await read(person);
    expect(itinerary.functions.map((fn) => fn.title)).toEqual(["Haldi", "Mehendi", "Sangeet", "Wedding", "Reception"]);
    const days = groupByDay(itinerary.functions);
    expect(days.map((day) => [day.date, day.functions.length])).toEqual([
      ["2026-12-13", 3],
      ["2026-12-14", 2],
    ]);
    expect(itinerary.conflicts).toHaveLength(2);
    for (const conflict of itinerary.conflicts) expect(conflict.text.length).toBeGreaterThan(0);
    expect(itinerary.unpublished_changes).toEqual([]);
    expect(draftLine(itinerary.unpublished_changes)).toBeNull();
    expect(itinerary.published_revision).toBe(2);
    expect(publishedLine(itinerary)).toMatch(/^Published as revision 2, /);
    expect(itinerary.venues.length).toBeGreaterThan(0);
  });
});

describe("event text", () => {
  it("formats times, venues and the draft lines", () => {
    expect(timeRange({ start_time: "09:30", end_time: "11:30" })).toBe("9:30 am to 11:30 am");
    expect(timeRange({ start_time: "19:00", end_time: null })).toBe("7:00 pm");
    expect(timeRange({ start_time: null, end_time: null })).toBeNull();
    expect(venueOptionLabel({ venue_id: "v", seed_key: null, name: "Lotus Hall", place_name: "Mallige Gardens", capacity: 300 })).toBe(
      "Lotus Hall, Mallige Gardens, seats 300",
    );
    const change = {
      entity: "event" as const,
      entity_id: "e",
      field: "venue_id",
      published_value: "Banyan Hall",
      draft_value: "Lotus Hall",
      changed_by: "Diya",
      changed_at: "2026-11-25T08:12:00.000Z",
    };
    expect(draftLine([change])).toBe("1 change not published. Guests see the published schedule.");
    expect(draftLine([change, change])).toBe("2 changes not published. Guests see the published schedule.");
    expect(wasLine(change)).toBe("was Banyan Hall");
    expect(changedByLine(change)).toBe("Changed by Diya, 1:42 pm");
  });
});
