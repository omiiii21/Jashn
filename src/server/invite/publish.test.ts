import { describe, expect, it } from "vitest";

import { CommandFailure, type CommandEnvelope } from "@/contracts/commands";
import type { PublicationSnapshot, SnapshotChange } from "@/contracts/domain";
import { fixtureIds, fixtureSessionActor, getDemoFixture } from "@/contracts/fixtures";
import type { CommandHandlerContext } from "@/contracts/services";
import { fixtureServices, httpStatusOf } from "@/contracts/services";

import { createMemoryInviteStore, memoryStateFromFixture } from "./memory-store";
import { createPublishItineraryHandler } from "./publish";
import type { SnapshotTools } from "./snapshot";

/**
 * AT-3.4 to AT-3.6 on injected data (D104). The snapshot builder is Lane A's (D95): these
 * tests never build one, they hand the handler canned REV-2 and REV-3 snapshots.
 */

const fixture = getDemoFixture("d");
const ids = fixtureIds("d");
const rev2 = fixture.publications.find((publication) => publication.revision === 2)!;
const banyan = fixture.venues.find((venue) => venue.venue_id === ids.banyan_venue_id)!;
const lotus = fixture.venues.find((venue) => venue.venue_id === ids.lotus_venue_id)!;

const rev3Snapshot: PublicationSnapshot = {
  ...rev2.snapshot,
  events: rev2.snapshot.events.map((event) =>
    event.event_id === ids.reception_event_id
      ? {
          ...event,
          venue: {
            venue_id: lotus.venue_id,
            name: lotus.name,
            place_name: lotus.place_name,
            locality: lotus.locality,
            address: lotus.address,
            map_url: lotus.map_url,
          },
        }
      : event,
  ),
};
const venueChange: SnapshotChange = {
  entity: "event",
  entity_id: ids.reception_event_id,
  field: "venue",
  from: banyan.name,
  to: lotus.name,
};

/** Canned tools: the draft is REV-3 when the reception sits at Lotus Hall, else REV-2. */
function cannedTools(): SnapshotTools {
  return {
    build: ({ events }) =>
      events.some((event) => event.id === ids.reception_event_id && event.venue_id === ids.lotus_venue_id) ? rev3Snapshot : rev2.snapshot,
    diff: (previous, next) => (previous === null || JSON.stringify(previous) === JSON.stringify(next) ? [] : [venueChange]),
    equal: (a, b) => JSON.stringify(a) === JSON.stringify(b),
  };
}

function setup(options: { move_reception?: boolean } = {}) {
  const state = memoryStateFromFixture(fixture);
  if (options.move_reception) {
    const reception = state.events.find((event) => event.id === ids.reception_event_id)!;
    reception.venue_id = ids.lotus_venue_id;
    state.weddings.get(ids.wedding_id)!.draft_version += 1;
  }
  const handler = createPublishItineraryHandler({ store: createMemoryInviteStore(state), snapshot: cannedTools() });
  return { state, handler };
}

function context(person: "mira" | "diya", expected_draft_version: number): CommandHandlerContext<"publish_itinerary", unknown> {
  const envelope: CommandEnvelope<"publish_itinerary"> = {
    wedding_id: ids.wedding_id,
    command: "publish_itinerary",
    input: { expected_draft_version },
    idempotency_key: "publish-test-key-0001",
    source: "ui",
  };
  return {
    command: "publish_itinerary",
    actor: fixtureSessionActor(person, "d"),
    wedding_id: ids.wedding_id,
    input: { expected_draft_version },
    envelope,
    tx: null,
    now: "2026-11-25T08:00:00.000Z",
  };
}

describe("publish_itinerary", () => {
  it("AT-3.4: Diya's venue move plus Mira's publish gives REV-3 with one change", async () => {
    const { state, handler } = setup({ move_reception: true });
    const draft_version = state.weddings.get(ids.wedding_id)!.draft_version;
    const result = await handler(context("mira", draft_version));

    expect(result.outcome).toBe("applied");
    expect(result.result.revision).toBe(3);
    expect(result.result.changes).toEqual([venueChange]);
    expect(result.bumps_draft_version).toBeUndefined();
    expect(state.publications.filter((publication) => publication.revision === 3)).toHaveLength(1);
    expect(state.weddings.get(ids.wedding_id)!.published_revision).toBe(3);
    const stored = state.publications.find((publication) => publication.revision === 3)!;
    expect(stored.draft_version).toBe(draft_version);
    expect(stored.snapshot).toEqual(rev3Snapshot);
    expect(result.activity?.topic).toBe("itinerary.published");
    expect(result.activity?.entity_type).toBe("publication");
    expect(result.activity?.entity_id).toBe(result.result.publication_id);
    expect(result.activity?.summary_en).toBe("Mira published the schedule, revision 3: reception venue Banyan Hall to Lotus Hall.");
    expect(result.activity?.summary_hi).toBe("Mira ने कार्यक्रम प्रकाशित किया, संस्करण 3: रिसेप्शन का स्थान Banyan Hall से Lotus Hall।");
    expect(result.activity?.before).toEqual({ published_revision: 2 });
    expect(result.activity?.after).toEqual({ published_revision: 3 });
  });

  it("AT-3.5: a manager is refused by the guard (403) and by the handler", async () => {
    const response = await fixtureServices.dispatch(fixtureSessionActor("diya", "d"), {
      wedding_id: ids.wedding_id,
      command: "publish_itinerary",
      input: { expected_draft_version: fixture.wedding.draft_version },
      idempotency_key: "publish-test-key-0002",
      source: "ui",
    });
    expect(httpStatusOf(response)).toBe(403);
    expect(response.ok === false && response.error.code).toBe("forbidden");

    const { state, handler } = setup({ move_reception: true });
    await expect(handler(context("diya", state.weddings.get(ids.wedding_id)!.draft_version))).rejects.toMatchObject({
      body: { code: "forbidden" },
    });
    expect(state.weddings.get(ids.wedding_id)!.published_revision).toBe(2);
  });

  it("AT-3.6: a stale draft version answers 409 draft_changed with the current list, and writes nothing", async () => {
    const { state, handler } = setup({ move_reception: true });
    const current = state.weddings.get(ids.wedding_id)!.draft_version;
    const error = await handler(context("mira", current - 1)).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(CommandFailure);
    const failure = error as CommandFailure;
    expect(failure.body.code).toBe("draft_changed");
    expect(failure.http_status).toBe(409);
    expect(failure.body.current).toEqual({ draft_version: current, changes: [venueChange] });
    expect(state.publications).toHaveLength(fixture.publications.length);
    expect(state.weddings.get(ids.wedding_id)!.published_revision).toBe(2);
  });

  it("AT-3.6: publishing a draft equal to the latest snapshot is unchanged and makes no revision", async () => {
    const { state, handler } = setup();
    const result = await handler(context("mira", state.weddings.get(ids.wedding_id)!.draft_version));
    expect(result.outcome).toBe("unchanged");
    expect(result.activity).toBeNull();
    expect(result.result).toEqual({ publication_id: rev2.publication_id, revision: 2, changes: [] });
    expect(state.publications).toHaveLength(fixture.publications.length);
  });
});
