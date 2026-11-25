import { describe, expect, it } from "vitest";

import {
  emailLocalPart,
  isFirstWedding,
  isInternalEmail,
  memberActorFrom,
  userActorFrom,
  type ActiveMembership,
  type SignedInUser,
} from "./actor";

const user: SignedInUser = { user_id: "11111111-1111-4111-8111-111111111111", email: "mira.a@example.com" };

const managerOfB: ActiveMembership = {
  member_id: "22222222-2222-4222-8222-222222222222",
  wedding_id: "33333333-3333-4333-8333-333333333333",
  role: "manager",
  display_name: "Mira (helping)",
  preferred_language: "hi",
};

const ownerOfA: ActiveMembership = {
  member_id: "44444444-4444-4444-8444-444444444444",
  wedding_id: "55555555-5555-4555-8555-555555555555",
  role: "owner",
  display_name: "Mira",
  preferred_language: "en",
};

describe("isInternalEmail (flagsmith.md 2.3)", () => {
  it("treats every @example.com account as internal, ignoring case", () => {
    expect(isInternalEmail("mira.a@example.com", "")).toBe(true);
    expect(isInternalEmail("Diya.E2E@Example.COM", "")).toBe(true);
    expect(isInternalEmail("  setup-a-1305@example.com ", "")).toBe(true);
  });

  it("treats a listed address as internal, ignoring case and spaces", () => {
    expect(isInternalEmail("Teammate@Gmail.com", "someone@x.in, teammate@gmail.com")).toBe(true);
  });

  it("treats anyone else as external", () => {
    expect(isInternalEmail("newowner@gmail.com", "teammate@gmail.com")).toBe(false);
    expect(isInternalEmail("newowner@gmail.com", undefined)).toBe(false);
    expect(isInternalEmail("someone@example.com.evil.test", "")).toBe(false);
    expect(isInternalEmail("", "")).toBe(false);
  });

  it("never matches an empty list entry", () => {
    expect(isInternalEmail("a@b.in", " , ,")).toBe(false);
  });
});

describe("emailLocalPart", () => {
  it("takes the part before the @", () => {
    expect(emailLocalPart("mira.a@example.com")).toBe("mira.a");
    expect(emailLocalPart("noat")).toBe("noat");
  });
});

describe("isFirstWedding", () => {
  it("is true while the user owns no wedding", () => {
    expect(isFirstWedding([])).toBe(true);
    expect(isFirstWedding([managerOfB])).toBe(true);
    expect(isFirstWedding([managerOfB, ownerOfA])).toBe(false);
  });
});

describe("memberActorFrom", () => {
  it("fills the actor from the membership and the user", () => {
    const actor = memberActorFrom(user, managerOfB, [managerOfB], "");
    expect(actor).toEqual({
      kind: "member",
      user_id: user.user_id,
      email: user.email,
      display_name: "Mira (helping)",
      wedding_id: managerOfB.wedding_id,
      member_id: managerOfB.member_id,
      role: "manager",
      is_internal: true,
      is_first_wedding: true,
      preferred_language: "hi",
    });
  });

  it("is not a first wedding once the user owns one", () => {
    expect(memberActorFrom(user, ownerOfA, [ownerOfA], "").is_first_wedding).toBe(false);
    expect(memberActorFrom(user, managerOfB, [managerOfB, ownerOfA], "").is_first_wedding).toBe(false);
  });

  it("marks an outside email as external", () => {
    const outsider = { ...user, email: "owner@gmail.com" };
    expect(memberActorFrom(outsider, ownerOfA, [ownerOfA], "").is_internal).toBe(false);
  });
});

describe("userActorFrom", () => {
  it("has no wedding, member or role", () => {
    const actor = userActorFrom(user, [ownerOfA, managerOfB], "");
    expect(actor.wedding_id).toBeNull();
    expect(actor.member_id).toBeNull();
    expect(actor.role).toBeNull();
    expect(actor.display_name).toBe("Mira");
    expect(actor.preferred_language).toBe("en");
    expect(actor.is_first_wedding).toBe(false);
  });

  it("falls back to the email's local part and English for a brand-new user", () => {
    const fresh = { user_id: user.user_id, email: "setup-a-1305@example.com" };
    const actor = userActorFrom(fresh, [], "");
    expect(actor.display_name).toBe("setup-a-1305");
    expect(actor.preferred_language).toBe("en");
    expect(actor.is_first_wedding).toBe(true);
    expect(actor.is_internal).toBe(true);
  });
});
