import { describe, expect, it } from "vitest";

import { groupHouseholds, replyFormGuests } from "@/components/planner/guests/households";
import { fixtureSessionActor } from "@/contracts/fixtures";
import { fixtureServices } from "@/contracts/services";

/** Copy b (Lane B's rehearsal copy), at D0. */
const WEDDING_ID = "3e546e78-a307-5757-a6e2-2b08e26c0a76";
const mira = fixtureSessionActor("mira", "b");
const diya = fixtureSessionActor("diya", "b");

describe("the reply table at D0 (AT-4.8)", () => {
  it("reads each function's counts and the planning number from rsvp_totals", async () => {
    const totals = await fixtureServices.read("rsvp_totals", {
      actor: mira,
      wedding_id: WEDDING_ID,
    });
    const rows = totals.functions.map((row) => [
      row.title,
      row.invited,
      row.attending,
      row.declined,
      row.pending,
      row.expected_headcount,
    ]);
    expect(rows).toEqual([
      ["Haldi", 30, 25, 2, 3, 30],
      ["Mehendi", 60, 50, 6, 4, 60],
      ["Sangeet", 150, 136, 8, 6, 150],
      ["Wedding", 180, 165, 6, 9, 180],
      ["Reception", 250, 229, 9, 12, 250],
    ]);
    expect(totals.functions.find((row) => row.title === "Reception")?.title_hi).toBe("रिसेप्शन");
  });

  it("shows Diya the same counts", async () => {
    const totals = await fixtureServices.read("rsvp_totals", {
      actor: diya,
      wedding_id: WEDDING_ID,
    });
    const reception = totals.functions.find((row) => row.title === "Reception");
    expect([reception?.invited, reception?.attending, reception?.declined, reception?.pending]).toEqual([
      250, 229, 9, 12,
    ]);
  });
});

describe("households and invitations at D0 (AT-4.8, G7)", () => {
  it("groups Mira's named guests by household and shows Tara's phone", async () => {
    const list = await fixtureServices.read("rsvp_guest_list", {
      actor: mira,
      wedding_id: WEDDING_ID,
    });
    expect(list.hidden).not.toContain("guest_contacts");

    const households = groupHouseholds(list);
    expect(households).toHaveLength(16);
    expect(households.flatMap((household) => household.guests)).toHaveLength(40);

    const tara = households.flatMap((household) => household.guests).find((guest) => guest.full_name === "Tara Bhat");
    expect(tara?.phone).toBe("+91 90000 01601");
    // Tara is invited to the sangeet and the reception (demo-data guest 40), each with its reply.
    expect(tara?.replies.map((reply) => [reply.title, reply.rsvp_status])).toEqual([
      ["Sangeet", "attending"],
      ["Reception", "pending"],
    ]);
  });

  it("gives Diya the same names, replies and dietary notes, and no contact field at all", async () => {
    const list = await fixtureServices.read("rsvp_guest_list", {
      actor: diya,
      wedding_id: WEDDING_ID,
    });
    expect(list.hidden).toContain("guest_contacts");

    const guests = groupHouseholds(list).flatMap((household) => household.guests);
    expect(guests).toHaveLength(40);
    for (const guest of guests) {
      expect("phone" in guest).toBe(false);
      expect("email" in guest).toBe(false);
    }
    expect(guests.find((guest) => guest.full_name === "Kamla Arora")?.dietary_note).toBe(
      "Diabetic: sugar-free dessert",
    );
  });

  it("never hands contacts to the reply form", async () => {
    const list = await fixtureServices.read("rsvp_guest_list", {
      actor: mira,
      wedding_id: WEDDING_ID,
    });
    const form = groupHouseholds(list).flatMap(replyFormGuests);
    expect(form.some((guest) => "phone" in guest || "email" in guest)).toBe(false);
  });

  it("collapses the imported guests with the read model's label", async () => {
    const list = await fixtureServices.read("rsvp_guest_list", {
      actor: mira,
      wedding_id: WEDDING_ID,
    });
    const reception = list.functions.find((fn) => fn.title === "Reception");
    expect(reception?.synthetic?.label).toBe("210 imported guests (synthetic placeholders)");
  });

  it("filters to one function with event_id", async () => {
    const totals = await fixtureServices.read("rsvp_totals", {
      actor: mira,
      wedding_id: WEDDING_ID,
    });
    const haldi = totals.functions.find((row) => row.title === "Haldi");
    const list = await fixtureServices.read("rsvp_guest_list", {
      actor: mira,
      wedding_id: WEDDING_ID,
      params: { event_id: haldi?.event_id },
    });
    expect(list.functions.map((fn) => fn.title)).toEqual(["Haldi"]);
  });
});
