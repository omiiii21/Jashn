import { describe, expect, it } from "vitest";

import { GUEST_VIEW_HAS_NO_MONEY_FIELDS, type GuestInvitationView, type PublicationSnapshot } from "@/contracts/domain";
import { FIXTURE_TARA_TOKEN, getDemoFixture, type DemoFixture } from "@/contracts/fixtures";
import { fixtureServices } from "@/contracts/services";

import { projectGuestInvitationView, snapshotPhotoAssetId, type GuestViewSource } from "./guest-view";

/**
 * Architecture 3.3's guest-view unit tests, on the fixture's D0 data (Tara, H16, REV-2):
 * the type has no money fields, only the allowlist keys come out, an uninvited function is
 * absent, a draft change is invisible (the view reads only the snapshot it is given) and
 * another household's ids give nothing.
 */

const ALLOWED = {
  top: ["functions", "household", "revision", "wedding"],
  wedding: [
    "blessing_line",
    "bride_name",
    "city",
    "groom_name",
    "heading_hi",
    "layout",
    "photo_frame",
    "theme",
    "typeface",
    "wedding_date",
    "wording_en",
    "wording_hi",
  ],
  household: ["guests", "name"],
  guest: ["dietary_note", "full_name", "guest_id"],
  fn: [
    "description",
    "dress_code",
    "ends_at",
    "event_id",
    "event_kind",
    "muhurat_at",
    "responses",
    "starts_at",
    "title",
    "title_hi",
    "venue",
  ],
  venue: ["address", "locality", "map_url", "name", "place_name"],
  response: ["guest_id", "max_plus_ones", "plus_ones", "rsvp_status"],
};

const keys = (value: object) => Object.keys(value).sort();

function allKeys(value: unknown, into: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach((item) => allKeys(item, into));
  else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      into.push(key);
      allKeys(child, into);
    }
  }
  return into;
}

function latestSnapshot(fixture: DemoFixture): { revision: number; snapshot: PublicationSnapshot } {
  const latest = [...fixture.publications].sort((a, b) => b.revision - a.revision)[0];
  return { revision: latest.revision, snapshot: latest.snapshot };
}

/** The view's sources for one household of the fixture, as the database reads would return them. */
function sourceFor(fixture: DemoFixture, household_key: string, overrides: Partial<GuestViewSource> = {}): GuestViewSource {
  const household = fixture.households.find((row) => row.seed_key === household_key);
  if (!household) throw new Error(`no household ${household_key}`);
  const members = fixture.guests.filter((guest) => guest.household_id === household.household_id);
  const ids = new Set(members.map((guest) => guest.guest_id));
  const { revision, snapshot } = latestSnapshot(fixture);
  return {
    revision,
    snapshot,
    household: { name: household.name },
    guests: members.map((guest) => ({ guest_id: guest.guest_id, full_name: guest.full_name, dietary_note: guest.dietary_note })),
    invitations: fixture.invitations
      .filter((invitation) => ids.has(invitation.guest_id) && !invitation.revoked_at)
      .map((invitation) => ({
        guest_id: invitation.guest_id,
        event_id: invitation.event_id,
        rsvp_status: invitation.rsvp_status,
        plus_ones: invitation.plus_ones,
        max_plus_ones: invitation.max_plus_ones,
      })),
    photo_url: null,
    ...overrides,
  };
}

const fixture = getDemoFixture("demo");
const eventKey = (view: GuestInvitationView) =>
  view.functions.map((fn) => fixture.events.find((event) => event.event_id === fn.event_id)?.seed_key);

describe("guest_invitation_view projection (domain 4.6, G2, G3)", () => {
  it("has no money fields in its type (compile-time G3 check)", () => {
    expect(GUEST_VIEW_HAS_NO_MONEY_FIELDS).toBe(true);
  });

  it("shows Tara her household's published functions and nothing else (AT-4.1 records)", () => {
    const view = projectGuestInvitationView(sourceFor(fixture, "H16"));
    expect(view.revision).toBe(2);
    expect(view.household.name).toBe("Bhat");
    expect(view.household.guests.map((guest) => guest.full_name)).toEqual(["Tara Bhat"]);
    expect(eventKey(view)).toEqual(["EVT-SAN", "EVT-REC"]);
    const [sangeet, reception] = view.functions;
    expect(sangeet.starts_at).toBe("2026-12-13T19:00:00+05:30");
    expect(sangeet.venue?.name).toBe("Garden Hall");
    expect(sangeet.responses).toEqual([expect.objectContaining({ rsvp_status: "attending", plus_ones: 0, max_plus_ones: 0 })]);
    expect(reception.starts_at).toBe("2026-12-14T19:30:00+05:30");
    expect(reception.venue?.name).toBe("Banyan Hall");
    expect(reception.description).toBe("Dinner follows.");
    expect(reception.responses[0].rsvp_status).toBe("pending");
    expect(view.wedding).toMatchObject({ bride_name: "Mira", groom_name: "Kabir", city: "Bengaluru", wedding_date: "2026-12-14" });
    expect(view.wedding.photo_url).toBeUndefined();
  });

  it("matches the fixture service's guest view field for field", async () => {
    const expected = await fixtureServices.guestInvitationView(FIXTURE_TARA_TOKEN);
    expect(projectGuestInvitationView(sourceFor(fixture, "H16"))).toEqual(expected);
  });

  it("copies only the allowlist keys, at every depth, even from a snapshot carrying extra fields", () => {
    const { snapshot } = latestSnapshot(fixture);
    const polluted = {
      ...snapshot,
      budget_inr: 3_000_000,
      vendors: [{ name: "Annapoorna Caterers", amount_inr: 200_000 }],
      wedding: { ...snapshot.wedding, total_inr: 1, managers_can_see_budget: true, seed_key: "WEDDING" },
      invite_style: { ...snapshot.invite_style, seed_key: "STYLE", updated_by_member_id: "x" },
      events: snapshot.events.map((event) => ({
        ...event,
        lead_name: "Diya Fernandes",
        expected_headcount: 250,
        estimate_inr: 184_000,
        seed_key: "EVT",
        venue: event.venue ? { ...event.venue, capacity: 220, seed_key: "VNU" } : null,
      })),
    };
    const view = projectGuestInvitationView(sourceFor(fixture, "H16", { snapshot: polluted, photo_url: "https://signed.example/photo" }));
    expect(keys(view)).toEqual(ALLOWED.top);
    expect(keys(view.wedding)).toEqual([...ALLOWED.wedding, "photo_url"].sort());
    expect(keys(view.household)).toEqual(ALLOWED.household);
    view.household.guests.forEach((guest) => expect(keys(guest)).toEqual(ALLOWED.guest));
    expect(view.functions.length).toBe(2);
    for (const fn of view.functions) {
      expect(keys(fn)).toEqual(ALLOWED.fn);
      if (fn.venue) expect(keys(fn.venue)).toEqual(ALLOWED.venue);
      fn.responses.forEach((response) => expect(keys(response)).toEqual(ALLOWED.response));
    }
    const every = allKeys(view);
    expect(every.filter((key) => key.endsWith("_inr"))).toEqual([]);
    expect(every).not.toContain("seed_key");
    expect(every).not.toContain("venue_id");
    expect(every).not.toContain("photo_asset_id");
    expect(JSON.stringify(view)).not.toContain("₹");
    expect(JSON.stringify(view)).not.toContain("Annapoorna");
  });

  it("leaves out functions the household isn't invited to, not even a count (G2, P10)", () => {
    const view = projectGuestInvitationView(sourceFor(fixture, "H16"));
    const titles = view.functions.map((fn) => fn.title);
    expect(titles).not.toContain("Mehendi");
    expect(titles).not.toContain("Haldi");
    expect(titles).not.toContain("Wedding");
    expect(JSON.stringify(view)).not.toMatch(/Mehendi|Haldi|मेहंदी|हल्दी/);
  });

  it("ignores another household's ids handed to it: no other guest, no extra function", () => {
    const tara = sourceFor(fixture, "H16");
    const other = sourceFor(fixture, "H13");
    const view = projectGuestInvitationView({ ...tara, invitations: [...tara.invitations, ...other.invitations] });
    expect(view.household.guests.length).toBe(1);
    expect(eventKey(view)).toEqual(["EVT-SAN", "EVT-REC"]);
    const otherIds = new Set(other.guests.map((guest) => guest.guest_id));
    expect(view.functions.flatMap((fn) => fn.responses).some((response) => otherIds.has(response.guest_id))).toBe(false);
  });

  it("never shows a function that isn't in the snapshot, even with a live invitation (draft-only function)", () => {
    const tara = sourceFor(fixture, "H16");
    const draftOnly = "00000000-0000-4000-8000-0000000000aa";
    const view = projectGuestInvitationView({
      ...tara,
      invitations: [
        ...tara.invitations,
        { guest_id: tara.guests[0].guest_id, event_id: draftOnly, rsvp_status: "pending", plus_ones: 0, max_plus_ones: 0 },
      ],
    });
    expect(view.functions.map((fn) => fn.event_id)).not.toContain(draftOnly);
  });

  it("reads only the snapshot it is given: a draft venue move is invisible until a new revision (AT-9.3)", () => {
    // D2: the draft moved the reception to Lotus Hall, but the latest publication is still REV-2.
    const draftFixture = structuredClone(getDemoFixture("demo"));
    const lotus = draftFixture.venues.find((venue) => venue.name === "Lotus Hall");
    const reception = draftFixture.events.find((event) => event.seed_key === "EVT-REC");
    if (!lotus || !reception) throw new Error("fixture");
    reception.venue_id = lotus.venue_id;
    const view = projectGuestInvitationView(sourceFor(draftFixture, "H16"));
    expect(view.revision).toBe(2);
    expect(view.functions[1].venue?.name).toBe("Banyan Hall");
    expect(JSON.stringify(view)).not.toContain("Lotus Hall");

    // D3: a REV-3 snapshot with Lotus Hall is now the latest.
    const { snapshot } = latestSnapshot(fixture);
    const rev3: PublicationSnapshot = {
      ...snapshot,
      events: snapshot.events.map((event) =>
        event.event_id === reception.event_id && event.venue
          ? { ...event, venue: { ...event.venue, venue_id: lotus.venue_id, name: "Lotus Hall" } }
          : event,
      ),
    };
    const published = projectGuestInvitationView(sourceFor(fixture, "H16", { revision: 3, snapshot: rev3 }));
    expect(published.revision).toBe(3);
    expect(published.functions[1].venue?.name).toBe("Lotus Hall");
  });

  it("adds photo_url only when a signed URL exists", () => {
    expect("photo_url" in projectGuestInvitationView(sourceFor(fixture, "H16")).wedding).toBe(false);
    const signed = projectGuestInvitationView(sourceFor(fixture, "H16", { photo_url: "https://signed.example/p.jpg?token=1" }));
    expect(signed.wedding.photo_url).toBe("https://signed.example/p.jpg?token=1");
  });

  it("survives a malformed snapshot without inventing data", () => {
    const view = projectGuestInvitationView(sourceFor(fixture, "H16", { snapshot: { events: "nope" } }));
    expect(view.functions).toEqual([]);
    expect(view.wedding.theme).toBe("maroon_gold");
    expect(view.wedding.heading_hi).toBe("शुभ विवाह");
  });

  it("reads the photo asset id from the snapshot, only when it is a uuid", () => {
    expect(snapshotPhotoAssetId({ invite_style: { photo_asset_id: "c0a80000-0000-4000-8000-000000000001" } })).toBe(
      "c0a80000-0000-4000-8000-000000000001",
    );
    expect(snapshotPhotoAssetId({ invite_style: { photo_asset_id: "../../etc" } })).toBeNull();
    expect(snapshotPhotoAssetId(null)).toBeNull();
  });
});
