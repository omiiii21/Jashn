import { describe, expect, it } from "vitest";

import { fixtureSessionActor, getDemoFixture } from "@/contracts/fixtures";
import { fixtureServices } from "@/contracts/services";

import { collapsedSyntheticRow, linkStateOf, syntheticRowLabel } from "./rsvp-guest-list";
import { eventStartsAt, rsvpTotalsRow, safeCount, tallyRsvpCounts, type ActiveEventRow, type RsvpCountGroup } from "./rsvp-totals";

const E1 = "00000000-0000-4000-8000-000000000001";
const E2 = "00000000-0000-4000-8000-000000000002";

function event(event_id: string, overrides: Partial<ActiveEventRow> = {}): ActiveEventRow {
  return {
    event_id,
    seed_key: null,
    event_kind: "reception",
    title: "Reception",
    title_hi: "रिसेप्शन",
    event_date: "2026-12-14",
    start_time: "19:30:00",
    expected_headcount: 250,
    ...overrides,
  };
}

/** The SQL groups the fixture's invitations would give (count and sum of 1 + plus_ones). */
function groupsFromFixture(): RsvpCountGroup[] {
  const fixture = getDemoFixture("demo");
  const synthetic = new Set(fixture.guests.filter((guest) => guest.is_synthetic).map((guest) => guest.guest_id));
  const groups = new Map<string, RsvpCountGroup>();
  for (const invitation of fixture.invitations) {
    if (invitation.revoked_at) continue;
    const is_synthetic = synthetic.has(invitation.guest_id);
    const key = `${invitation.event_id}|${is_synthetic}|${invitation.rsvp_status}`;
    const group = groups.get(key) ?? { event_id: invitation.event_id, is_synthetic, rsvp_status: invitation.rsvp_status, invitations: 0, headcount: 0 };
    group.invitations = Number(group.invitations) + 1;
    group.headcount = Number(group.headcount) + 1 + invitation.plus_ones;
    groups.set(key, group);
  }
  return [...groups.values()];
}

describe("rsvp_totals counting (R4, R5, domain 4.4)", () => {
  it("counts plus-ones into the headcount of attending rows only, split named and synthetic", () => {
    const tallies = tallyRsvpCounts([
      { event_id: E1, is_synthetic: false, rsvp_status: "attending", invitations: 3, headcount: 5 }, // 3 rows, 2 plus-ones
      { event_id: E1, is_synthetic: false, rsvp_status: "declined", invitations: 1, headcount: 1 },
      { event_id: E1, is_synthetic: false, rsvp_status: "pending", invitations: 2, headcount: 2 },
      { event_id: E1, is_synthetic: true, rsvp_status: "attending", invitations: "10", headcount: "10" },
      { event_id: E1, is_synthetic: true, rsvp_status: "pending", invitations: 4, headcount: 4 },
      { event_id: E2, is_synthetic: false, rsvp_status: "declined", invitations: 2, headcount: 2 },
    ]);
    expect(tallies.get(E1)).toEqual({
      total: { invited: 20, attending: 13, declined: 1, pending: 6, confirmed_headcount: 15 },
      named: { invited: 6, attending: 3, declined: 1, pending: 2, confirmed_headcount: 5 },
      synthetic: { invited: 14, attending: 10, declined: 0, pending: 4, confirmed_headcount: 10 },
    });
    expect(tallies.get(E2)?.total).toEqual({ invited: 2, attending: 0, declined: 2, pending: 0, confirmed_headcount: 0 });
  });

  it("gives zero rows for a function with no invitations and keeps expected_headcount apart (E7)", () => {
    const row = rsvpTotalsRow(event(E1), undefined);
    expect(row).toMatchObject({ invited: 0, attending: 0, declined: 0, pending: 0, confirmed_headcount: 0, expected_headcount: 250 });
    expect(row.starts_at).toBe("2026-12-14T19:30:00+05:30");
  });

  it("reads the reception 250 / 229 / 9 / 12 with headcount 229 at D0, and the sangeet 150 / 136 / 8 / 6", async () => {
    const fixture = getDemoFixture("demo");
    const tallies = tallyRsvpCounts(groupsFromFixture());
    const byKey = (key: string) => {
      const found = fixture.events.find((row) => row.seed_key === key);
      if (!found) throw new Error(key);
      return rsvpTotalsRow(
        event(found.event_id, { seed_key: key, event_date: found.event_date, start_time: found.start_time, expected_headcount: found.expected_headcount }),
        tallies.get(found.event_id),
      );
    };
    const reception = byKey("EVT-REC");
    expect([reception.invited, reception.attending, reception.declined, reception.pending]).toEqual([250, 229, 9, 12]);
    expect(reception.confirmed_headcount).toBe(229);
    expect(reception.named.invited + reception.synthetic.invited).toBe(250);
    expect(reception.named.attending + reception.synthetic.attending).toBe(229);
    const sangeet = byKey("EVT-SAN");
    expect([sangeet.invited, sangeet.attending, sangeet.declined, sangeet.pending]).toEqual([150, 136, 8, 6]);

    // The same figures as the fixture service, function by function.
    const expected = await fixtureServices.read("rsvp_totals", { actor: fixtureSessionActor("mira"), wedding_id: fixture.wedding.wedding_id });
    const reception_fixture = expected.functions.find((row) => row.seed_key === "EVT-REC");
    expect(reception_fixture).toMatchObject({
      invited: reception.invited,
      attending: reception.attending,
      declined: reception.declined,
      pending: reception.pending,
      confirmed_headcount: reception.confirmed_headcount,
      named: reception.named,
      synthetic: reception.synthetic,
    });
  });

  it("refuses counts that aren't safe integers", () => {
    expect(() => safeCount("x", "9007199254740993")).toThrow();
    expect(() => safeCount("x", -1)).toThrow();
    expect(() => safeCount("x", 1.5)).toThrow();
    expect(safeCount("x", "42")).toBe(42);
  });

  it("has no start instant without a start time", () => {
    expect(eventStartsAt("2026-12-14", null)).toBeNull();
    expect(eventStartsAt("2026-12-13", "19:00:00")).toBe("2026-12-13T19:00:00+05:30");
  });
});

describe("rsvp_guest_list helpers (4.4, D99)", () => {
  it("collapses the synthetic guests into one labelled row", () => {
    const tallies = tallyRsvpCounts([
      { event_id: E1, is_synthetic: true, rsvp_status: "attending", invitations: 197, headcount: 197 },
      { event_id: E1, is_synthetic: true, rsvp_status: "pending", invitations: 13, headcount: 13 },
    ]);
    expect(collapsedSyntheticRow(tallies.get(E1))).toEqual({
      invited: 210,
      attending: 197,
      declined: 0,
      pending: 13,
      confirmed_headcount: 197,
      label: "210 imported guests (synthetic placeholders)",
    });
    expect(collapsedSyntheticRow(undefined)).toBeNull();
    expect(syntheticRowLabel(1)).toBe("1 imported guest (synthetic placeholder)");
  });

  it("derives link_status and last_rotated_at from the household's links", () => {
    const H = "00000000-0000-4000-8000-0000000000a1";
    const first = new Date("2026-11-24T10:00:00Z");
    const second = new Date("2026-11-25T06:00:00Z");
    expect(linkStateOf([])).toEqual({ link_status: "none", last_rotated_at: null });
    expect(linkStateOf([{ household_id: H, created_at: first, revoked_at: null }])).toEqual({ link_status: "active", last_rotated_at: null });
    expect(linkStateOf([{ household_id: H, created_at: first, revoked_at: second }])).toEqual({ link_status: "revoked", last_rotated_at: null });
    expect(
      linkStateOf([
        { household_id: H, created_at: second, revoked_at: null },
        { household_id: H, created_at: first, revoked_at: second },
      ]),
    ).toEqual({ link_status: "active", last_rotated_at: "2026-11-25T11:30:00+05:30" });
  });
});
