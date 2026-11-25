import { describe, expect, it } from "vitest";

import { CommandFailure } from "@/contracts/commands";

import {
  bumpsDraftVersion,
  createdActivity,
  describeProfileChanges,
  diffWeddingProfile,
  formatWeddingDate,
  ownerDisplayName,
  parseCreateInput,
  updatedActivity,
  weddingProfileHandlers,
  type WeddingProfileValues,
} from "./wedding-profile";

const WEDDING_ID = "0b7c5a52-1f43-4d2e-9a77-3f0d8c1e2b10";

const current: WeddingProfileValues = {
  bride_name: "Mira",
  groom_name: "Kabir",
  wedding_date: "2026-12-14",
  city: "Bengaluru",
  budget_inr: 1_200_000,
  expected_guests: 250,
};

describe("formatWeddingDate", () => {
  it("prints the IST calendar date with its weekday", () => {
    expect(formatWeddingDate("2026-12-14")).toBe("Mon 14 Dec 2026");
    expect(formatWeddingDate("2026-12-13")).toBe("Sun 13 Dec 2026");
    expect(formatWeddingDate("2027-01-01")).toBe("Fri 1 Jan 2027");
  });
});

describe("diffWeddingProfile", () => {
  it("keeps only the given fields that differ", () => {
    const changes = diffWeddingProfile(current, { bride_name: "Mira", city: "Mysuru", budget_inr: 1_500_000 });
    expect(changes).toEqual([
      { field: "city", from: "Bengaluru", to: "Mysuru" },
      { field: "budget_inr", from: 1_200_000, to: 1_500_000 },
    ]);
  });

  it("is empty when nothing differs", () => {
    expect(diffWeddingProfile(current, { bride_name: "Mira", wedding_date: "2026-12-14", expected_guests: 250 })).toEqual([]);
    expect(diffWeddingProfile(current, {})).toEqual([]);
  });

  it("reports a first value against null", () => {
    expect(diffWeddingProfile({ ...current, city: null }, { city: "Mysuru" })).toEqual([{ field: "city", from: null, to: "Mysuru" }]);
  });
});

describe("bumpsDraftVersion (P1, P2)", () => {
  it("is true for names, city and date only", () => {
    expect(bumpsDraftVersion([{ field: "city", from: "Bengaluru", to: "Mysuru" }])).toBe(true);
    expect(bumpsDraftVersion([{ field: "wedding_date", from: "2026-12-14", to: "2026-12-15" }])).toBe(true);
    expect(bumpsDraftVersion([{ field: "budget_inr", from: 1, to: 2 }])).toBe(false);
    expect(bumpsDraftVersion([{ field: "expected_guests", from: 250, to: 300 }])).toBe(false);
  });
});

describe("createdActivity (3.1)", () => {
  it("is a members entry without a budget", () => {
    const entry = createdActivity({
      actor_label: "Mira",
      wedding_id: WEDDING_ID,
      profile: { bride_name: "Mira", groom_name: "Kabir", wedding_date: "2026-12-14", city: "Bengaluru", expected_guests: 250 },
    });
    expect(entry).toMatchObject({
      topic: "wedding.created",
      entity_type: "wedding",
      entity_id: WEDDING_ID,
      visibility: "members",
      before: null,
      after: { bride_name: "Mira", groom_name: "Kabir", wedding_date: "2026-12-14", city: "Bengaluru", expected_guests: 250 },
    });
    expect(entry.summary_en).toBe("Mira created the wedding of Mira and Kabir, Mon 14 Dec 2026, Bengaluru.");
    expect(entry.summary_hi).toBe("Mira ने Mira और Kabir की शादी जोड़ी: Mon 14 Dec 2026, Bengaluru।");
  });

  it("is owners when a budget was given, even zero (L5a item 1)", () => {
    const withBudget = createdActivity({
      actor_label: "Mira",
      wedding_id: WEDDING_ID,
      profile: { bride_name: "Mira", groom_name: "Kabir", wedding_date: "2026-12-14", budget_inr: 1_200_000 },
    });
    expect(withBudget.visibility).toBe("owners");
    expect(withBudget.after).toMatchObject({ budget_inr: 1_200_000 });
    const zero = createdActivity({
      actor_label: "Mira",
      wedding_id: WEDDING_ID,
      profile: { bride_name: "Mira", groom_name: "Kabir", wedding_date: "2026-12-14", budget_inr: 0 },
    });
    expect(zero.visibility).toBe("owners");
  });

  it("drops the city clause when no city was given", () => {
    const entry = createdActivity({
      actor_label: "Mira",
      wedding_id: WEDDING_ID,
      profile: { bride_name: "Mira", groom_name: "Kabir", wedding_date: "2026-12-14" },
    });
    expect(entry.summary_en).toBe("Mira created the wedding of Mira and Kabir, Mon 14 Dec 2026.");
    expect(entry.summary_hi).toBe("Mira ने Mira और Kabir की शादी जोड़ी: Mon 14 Dec 2026।");
  });
});

describe("updatedActivity (3.1)", () => {
  it("a budget-only change is budget.updated, owners", () => {
    const entry = updatedActivity({
      actor_label: "Mira",
      wedding_id: WEDDING_ID,
      changes: [{ field: "budget_inr", from: 1_200_000, to: 1_500_000 }],
    });
    expect(entry).toMatchObject({
      topic: "budget.updated",
      entity_type: "budget",
      visibility: "owners",
      before: { budget_inr: 1_200_000 },
      after: { budget_inr: 1_500_000 },
    });
    expect(entry.summary_en).toBe("Mira changed the budget from ₹12,00,000 to ₹15,00,000.");
    expect(entry.summary_hi).toBe("Mira ने बजट ₹12,00,000 से बदलकर ₹15,00,000 किया।");
  });

  it("a details change is wedding.updated, members, changed fields only", () => {
    const entry = updatedActivity({
      actor_label: "Mira",
      wedding_id: WEDDING_ID,
      changes: [
        { field: "wedding_date", from: "2026-12-14", to: "2026-12-15" },
        { field: "city", from: "Bengaluru", to: "Mysuru" },
      ],
    });
    expect(entry).toMatchObject({
      topic: "wedding.updated",
      entity_type: "wedding",
      visibility: "members",
      before: { wedding_date: "2026-12-14", city: "Bengaluru" },
      after: { wedding_date: "2026-12-15", city: "Mysuru" },
    });
    expect(entry.summary_en).toBe("Mira changed the wedding details: date Mon 14 Dec 2026 to Tue 15 Dec 2026, city Bengaluru to Mysuru.");
    expect(entry.summary_hi).toBe("Mira ने शादी की जानकारी बदली: तारीख Mon 14 Dec 2026 से Tue 15 Dec 2026, शहर Bengaluru से Mysuru।");
  });

  it("is still one entry, but owners, when the budget changes with other fields", () => {
    const entry = updatedActivity({
      actor_label: "Mira",
      wedding_id: WEDDING_ID,
      changes: [
        { field: "city", from: "Bengaluru", to: "Mysuru" },
        { field: "budget_inr", from: 1_200_000, to: 1_500_000 },
      ],
    });
    expect(entry.topic).toBe("wedding.updated");
    expect(entry.visibility).toBe("owners");
    expect(entry.summary_en).toBe("Mira changed the wedding details: city Bengaluru to Mysuru, budget ₹12,00,000 to ₹15,00,000.");
  });

  it("formats guest counts with Indian grouping and a first value with 'set to'", () => {
    expect(describeProfileChanges([{ field: "expected_guests", from: 250, to: 1200 }], "en")).toBe("expected guests 250 to 1,200");
    expect(describeProfileChanges([{ field: "city", from: null, to: "Mysuru" }], "en")).toBe("city set to Mysuru");
    expect(describeProfileChanges([{ field: "city", from: null, to: "Mysuru" }], "hi")).toBe("शहर Mysuru");
  });
});

describe("parseCreateInput", () => {
  it("accepts the create form", () => {
    expect(parseCreateInput({ bride_name: "Mira", groom_name: "Kabir", wedding_date: "2026-12-14", budget_inr: 1_200_000 })).toEqual({
      bride_name: "Mira",
      groom_name: "Kabir",
      wedding_date: "2026-12-14",
      budget_inr: 1_200_000,
    });
  });

  it("answers year_required for a missing date (AT-1.4)", () => {
    try {
      parseCreateInput({ bride_name: "Mira", groom_name: "Kabir", city: "Bengaluru" });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(CommandFailure);
      expect((error as CommandFailure).body).toMatchObject({ code: "validation_failed", field: "wedding_date", message: "year_required" });
      expect((error as CommandFailure).http_status).toBe(422);
    }
  });

  it("names the missing date before missing names (S-01's draft, AT-1.4)", () => {
    try {
      parseCreateInput({ city: "Bengaluru", budget_inr: 1_200_000, expected_guests: 250 });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(CommandFailure);
      expect((error as CommandFailure).body).toMatchObject({ code: "validation_failed", field: "wedding_date", message: "year_required" });
    }
  });

  it("answers out_of_range outside 2026 to 2030 and required for a missing name", () => {
    const failureOf = (input: unknown) => {
      try {
        parseCreateInput(input);
      } catch (error) {
        if (error instanceof CommandFailure) return error.body;
        throw error;
      }
      throw new Error("expected a CommandFailure");
    };
    expect(failureOf({ bride_name: "Mira", groom_name: "Kabir", wedding_date: "2031-01-01" })).toMatchObject({
      field: "wedding_date",
      message: "out_of_range",
    });
    expect(failureOf({ groom_name: "Kabir", wedding_date: "2026-12-14" })).toMatchObject({ field: "bride_name", message: "required" });
  });
});

describe("ownerDisplayName", () => {
  it("uses the actor's name, else the email's local part", () => {
    expect(ownerDisplayName({ display_name: " Mira ", email: "mira.a@example.com" })).toBe("Mira");
    expect(ownerDisplayName({ display_name: "", email: "setup-a-1312@example.com" })).toBe("setup-a-1312");
  });
});

describe("weddingProfileHandlers", () => {
  it("registers set_wedding_profile", () => {
    expect(typeof weddingProfileHandlers.set_wedding_profile).toBe("function");
  });
});
