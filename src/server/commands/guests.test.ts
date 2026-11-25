import { describe, expect, it } from "vitest";

import { CommandFailure } from "@/contracts/commands";

import {
  GUEST_NOT_FOUND_MESSAGE,
  RSVP_WORDS,
  addGuestActivity,
  answerChanged,
  createLinksActivity,
  describeInvitationChanges,
  eventWord,
  guestHandlers,
  householdNameFor,
  joinEnglish,
  normalizeName,
  resolvePlusOnes,
  revokeLinkActivity,
  setDietaryActivity,
  setRsvpActivity,
  submitRsvpActivity,
  type SubmittedAnswer,
} from "./guests";

const RECEPTION = { event_id: "e5d1aaaa-0000-4000-8000-000000000001", event_kind: "reception" as const, title: "Reception", title_hi: "रिसेप्शन" };
const SANGEET = { event_id: "e5d1aaaa-0000-4000-8000-000000000002", event_kind: "sangeet" as const, title: "Sangeet", title_hi: "संगीत" };
const MEHENDI = { event_id: "e5d1aaaa-0000-4000-8000-000000000003", event_kind: "mehendi" as const, title: "Mehendi", title_hi: "मेहंदी" };

function failureOf(run: () => unknown): CommandFailure {
  try {
    run();
  } catch (error) {
    if (error instanceof CommandFailure) return error;
    throw error;
  }
  throw new Error("expected a CommandFailure");
}

describe("resolvePlusOnes (R2, R3)", () => {
  it("forces 0 unless attending, whatever was asked", () => {
    expect(resolvePlusOnes("declined", 2, 0)).toBe(0);
    expect(resolvePlusOnes("pending", 5, 10)).toBe(0);
    expect(resolvePlusOnes("declined", undefined, 3, { keep: 2 })).toBe(0);
  });

  it("defaults to 0 for an attending answer", () => {
    expect(resolvePlusOnes("attending", undefined, 0)).toBe(0);
    expect(resolvePlusOnes("attending", undefined, 3)).toBe(0);
  });

  it("accepts 0 up to max_plus_ones", () => {
    expect(resolvePlusOnes("attending", 0, 0)).toBe(0);
    expect(resolvePlusOnes("attending", 2, 2)).toBe(2);
    expect(resolvePlusOnes("attending", 10, 10)).toBe(10);
  });

  it("refuses more than max_plus_ones with plus_ones_exceeds_limit (AT-4.6)", () => {
    const failure = failureOf(() => resolvePlusOnes("attending", 1, 0));
    expect(failure.body.code).toBe("plus_ones_exceeds_limit");
    expect(failure.http_status).toBe(422);
    expect(failure.body.field).toBe("plus_ones");
    const nested = failureOf(() => resolvePlusOnes("attending", 3, 2, { field: "responses.0.plus_ones" }));
    expect(nested.body.code).toBe("plus_ones_exceeds_limit");
    expect(nested.body.field).toBe("responses.0.plus_ones");
  });

  it("keeps the stored value for a several-guest set_rsvp when none is sent", () => {
    expect(resolvePlusOnes("attending", undefined, 3, { keep: 2 })).toBe(2);
    expect(resolvePlusOnes("attending", 1, 3, { keep: 2 })).toBe(1);
  });

  it("refuses a negative or fractional value", () => {
    expect(failureOf(() => resolvePlusOnes("attending", -1, 3)).body.code).toBe("validation_failed");
    expect(failureOf(() => resolvePlusOnes("attending", 1.5, 3)).body.code).toBe("validation_failed");
  });
});

describe("answerChanged (R6, R7)", () => {
  it("is false for the stored answer, true for any difference", () => {
    expect(answerChanged({ rsvp_status: "attending", plus_ones: 0 }, { rsvp_status: "attending", plus_ones: 0 })).toBe(false);
    expect(answerChanged({ rsvp_status: "pending", plus_ones: 0 }, { rsvp_status: "attending", plus_ones: 0 })).toBe(true);
    expect(answerChanged({ rsvp_status: "attending", plus_ones: 1 }, { rsvp_status: "attending", plus_ones: 0 })).toBe(true);
  });
});

describe("text helpers", () => {
  it("names a function by its kind, or an other function by its title", () => {
    expect(eventWord(RECEPTION)).toBe("reception");
    expect(eventWord({ event_kind: "other", title: "Cocktail night" })).toBe("Cocktail night");
  });

  it("joins English lists with commas and a final and", () => {
    expect(joinEnglish([])).toBe("");
    expect(joinEnglish(["the sangeet"])).toBe("the sangeet");
    expect(joinEnglish(["the sangeet", "the reception"])).toBe("the sangeet and the reception");
    expect(joinEnglish(["the haldi", "the sangeet", "the reception"])).toBe("the haldi, the sangeet and the reception");
  });

  it("names a new household after the guest's last name", () => {
    expect(householdNameFor("Tara Bhat")).toBe("Bhat");
    expect(householdNameFor("  Kamla ")).toBe("Kamla");
    expect(householdNameFor("Leena  D'Souza")).toBe("D'Souza");
  });

  it("compares names ignoring case and spacing", () => {
    expect(normalizeName("  Tara   BHAT ")).toBe(normalizeName("tara bhat"));
  });

  it("uses the set_rsvp response words", () => {
    expect(RSVP_WORDS.attending).toEqual({ en: "attending", hi: "आएँगे" });
    expect(RSVP_WORDS.declined).toEqual({ en: "not attending", hi: "नहीं आएँगे" });
    expect(RSVP_WORDS.pending).toEqual({ en: "not replied", hi: "जवाब बाकी" });
  });
});

function answer(overrides: Partial<SubmittedAnswer> = {}): SubmittedAnswer {
  return {
    invitation_id: "11111111-0000-4000-8000-000000000001",
    guest_id: "9a3f0000-0000-4000-8000-000000000040",
    full_name: "Tara Bhat",
    event: RECEPTION,
    before: { rsvp_status: "pending", plus_ones: 0 },
    rsvp_status: "attending",
    plus_ones: 0,
    ...overrides,
  };
}

describe("submit_rsvp activity", () => {
  it("reads ACT-09 for Tara's one answer, with Tara as the actor", () => {
    const entry = submitRsvpActivity({ household_id: "h16", household_name: "Bhat", changed: [answer()] });
    expect(entry.summary_en).toBe("Tara Bhat is attending the reception.");
    expect(entry.summary_hi).toBe("Tara Bhat रिसेप्शन में आएँगे।");
    expect(entry.topic).toBe("rsvp.submitted");
    expect(entry.visibility).toBe("members");
    expect(entry.entity_type).toBe("invitation");
    expect(entry.actor_label).toBe("Tara Bhat");
    expect(entry.actor_guest_id).toBe(answer().guest_id);
    expect(entry.before).toMatchObject({ rsvp_status: "pending", plus_ones: 0 });
    expect(entry.after).toMatchObject({ rsvp_status: "attending", plus_ones: 0 });
  });

  it("reads the can't-attend line (AT-4.5)", () => {
    const entry = submitRsvpActivity({
      household_id: "h16",
      household_name: "Bhat",
      changed: [answer({ rsvp_status: "declined", before: { rsvp_status: "attending", plus_ones: 0 } })],
    });
    expect(entry.summary_en).toBe("Tara Bhat can't attend the reception.");
    expect(entry.summary_hi).toBe("Tara Bhat रिसेप्शन में नहीं आ पाएँगे।");
  });

  it("reads the household line for several answers", () => {
    const entry = submitRsvpActivity({
      household_id: "h01",
      household_name: "Deshpande",
      changed: [
        answer({ full_name: "Anil Deshpande", guest_id: "g1", event: SANGEET }),
        answer({ full_name: "Sunita Deshpande", guest_id: "g2", event: SANGEET, rsvp_status: "declined" }),
      ],
    });
    expect(entry.summary_en).toBe(
      "The Deshpande household replied: Anil Deshpande is attending the sangeet, Sunita Deshpande can't attend the sangeet.",
    );
    expect(entry.summary_hi).toBe("Deshpande परिवार ने जवाब भेजा: Anil Deshpande संगीत में आएँगे, Sunita Deshpande संगीत में नहीं आ पाएँगे।");
    expect(entry.entity_type).toBe("household");
    expect(entry.actor_label).toBe("Deshpande");
  });
});

describe("set_rsvp activity", () => {
  const row = (full_name: string, guest_id: string) => ({
    invitation_id: `inv-${guest_id}`,
    guest_id,
    full_name,
    before: { rsvp_status: "pending" as const, plus_ones: 0 },
    plus_ones: 0,
  });

  it("names both guests for a several-guest reply (AT-4.7)", () => {
    const entry = setRsvpActivity({
      actor_label: "Mira",
      event: RECEPTION,
      status: "attending",
      changed: [row("Nikhil Jain", "g27"), row("Prachi Jain", "g28")],
    });
    expect(entry.summary_en).toBe("Mira marked 2 guests as attending for the reception: Nikhil Jain, Prachi Jain.");
    expect(entry.summary_hi).toBe("Mira ने रिसेप्शन के लिए 2 मेहमानों का जवाब दर्ज किया: आएँगे (Nikhil Jain, Prachi Jain)।");
    expect(entry.topic).toBe("rsvp.updated");
    expect(entry.visibility).toBe("members");
  });

  it("reads the one-guest line", () => {
    const entry = setRsvpActivity({ actor_label: "Diya", event: MEHENDI, status: "declined", changed: [row("Tara Bhat", "g40")] });
    expect(entry.summary_en).toBe("Diya marked Tara Bhat as not attending for the mehendi.");
    expect(entry.summary_hi).toBe("Diya ने मेहंदी के लिए Tara Bhat का जवाब दर्ज किया: नहीं आएँगे।");
    expect(entry.entity_type).toBe("invitation");
  });
});

describe("add_guest activity", () => {
  it("lists the functions, and never carries a contact (L5a)", () => {
    const entry = addGuestActivity({
      actor_label: "Mira",
      guest_id: "g",
      full_name: "Asha Rao",
      household_id: "h",
      invited: [SANGEET, RECEPTION],
      after: { full_name: "Asha Rao", contact_added: true },
    });
    expect(entry.summary_en).toBe("Mira added the guest Asha Rao, invited to the sangeet and the reception.");
    expect(entry.summary_hi).toBe("Mira ने मेहमान Asha Rao को जोड़ा, न्योता: संगीत, रिसेप्शन।");
    expect(entry.topic).toBe("guest.added");
    expect(entry.visibility).toBe("members");
    expect(JSON.stringify(entry)).not.toMatch(/phone|email|\+91/);
  });

  it("has a short form with no functions", () => {
    const entry = addGuestActivity({ actor_label: "Diya", guest_id: "g", full_name: "Asha Rao", household_id: "h", invited: [], after: {} });
    expect(entry.summary_en).toBe("Diya added the guest Asha Rao.");
    expect(entry.summary_hi).toBe("Diya ने मेहमान Asha Rao को जोड़ा।");
  });
});

describe("set_invitations changes", () => {
  it("describes added and removed functions and a new plus-ones limit", () => {
    expect(describeInvitationChanges({ added: [MEHENDI], removed: [SANGEET], max_plus_ones: null })).toEqual({
      en: "added the mehendi; removed the sangeet",
      hi: "जोड़ा: मेहंदी; हटाया: संगीत",
    });
    expect(describeInvitationChanges({ added: [], removed: [], max_plus_ones: 2 }).en).toBe("plus-ones limit set to 2");
  });
});

describe("dietary and link activity", () => {
  it("reads the dietary line, and clears it", () => {
    const entry = setDietaryActivity({ actor_label: "Tara Bhat", guest_id: "g", full_name: "Tara Bhat", before: null, after: "Mushroom allergy" });
    expect(entry.summary_en).toBe("Tara Bhat updated Tara Bhat's dietary note: Mushroom allergy.");
    expect(entry.summary_hi).toBe("Tara Bhat ने Tara Bhat के खाने की जानकारी बदली: Mushroom allergy।");
    expect(entry.topic).toBe("dietary.updated");
    expect(entry.visibility).toBe("members");
    const cleared = setDietaryActivity({ actor_label: "Mira", guest_id: "g", full_name: "Tara Bhat", before: "x", after: null });
    expect(cleared.summary_en).toBe("Mira cleared Tara Bhat's dietary note.");
  });

  it("keeps link entries for owners, with no token", () => {
    const created = createLinksActivity({ actor_label: "Mira", first_link_id: "l1", household_ids: ["h1"], rotated_household_ids: ["h1"] });
    expect(created.summary_en).toBe("Mira created invitation links for 1 household.");
    expect(created.summary_hi).toBe("Mira ने 1 परिवार के लिए न्योते के लिंक बनाए।");
    expect(created.visibility).toBe("owners");
    const many = createLinksActivity({ actor_label: "Mira", first_link_id: "l1", household_ids: ["h1", "h2"], rotated_household_ids: [] });
    expect(many.summary_en).toBe("Mira created invitation links for 2 households.");
    expect(many.summary_hi).toBe("Mira ने 2 परिवारों के लिए न्योते के लिंक बनाए।");

    const revoked = revokeLinkActivity({ actor_label: "Mira", link_id: "l1", household_id: "h16", household_name: "Bhat", revoked_at: "2026-11-25T10:00:00.000Z" });
    expect(revoked.summary_en).toBe("Mira turned off the invitation link for the Bhat household.");
    expect(revoked.summary_hi).toBe("Mira ने Bhat परिवार के न्योते का लिंक बंद किया।");
    expect(revoked.topic).toBe("invitation_link.revoked");
    expect(revoked.visibility).toBe("owners");
  });
});

describe("guestHandlers", () => {
  it("covers the seven guest commands", () => {
    expect(Object.keys(guestHandlers).sort()).toEqual(
      ["add_guest", "create_invitation_links", "revoke_invitation_link", "set_dietary", "set_invitations", "set_rsvp", "submit_rsvp"].sort(),
    );
  });

  it("answers guests with the guard's one 404 message", () => {
    expect(GUEST_NOT_FOUND_MESSAGE).toBe("Not found.");
  });
});
