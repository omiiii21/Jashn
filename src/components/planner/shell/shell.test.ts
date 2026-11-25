import { describe, expect, it } from "vitest";

import { fixtureSessionActor } from "@/contracts/fixtures";
import { routes } from "@/contracts/routes";
import { fixtureServices } from "@/contracts/services";

import { memberLabel } from "./member-label";
import { PRIMARY_SECTIONS, SECONDARY_SECTIONS, activeSection, sectionHref } from "./nav-items";

const COPY_B_WEDDING = "3e546e78-a307-5757-a6e2-2b08e26c0a76";

describe("planner nav", () => {
  it("has the six sections in order, then Activity, and no Shagun item (D131)", () => {
    expect(PRIMARY_SECTIONS).toEqual(["overview", "events", "guests", "money", "vendors", "invite"]);
    expect(SECONDARY_SECTIONS).toEqual(["activity"]);
    expect([...PRIMARY_SECTIONS, ...SECONDARY_SECTIONS]).not.toContain("shagun");
  });

  it("builds every href with routes.ts, Invite included (D121)", () => {
    expect(sectionHref(COPY_B_WEDDING, "overview")).toBe(routes.overview(COPY_B_WEDDING));
    expect(sectionHref(COPY_B_WEDDING, "invite")).toBe(routes.invite(COPY_B_WEDDING));
    expect(sectionHref(COPY_B_WEDDING, "money")).toBe(`/w/${COPY_B_WEDDING}/money`);
  });

  it("finds the active section from the pathname", () => {
    const base = routes.wedding(COPY_B_WEDDING);
    expect(activeSection(base, COPY_B_WEDDING)).toBe("overview");
    expect(activeSection(`${base}/`, COPY_B_WEDDING)).toBe("overview");
    expect(activeSection(`${base}/money`, COPY_B_WEDDING)).toBe("money");
    expect(activeSection(`${base}/vendors`, COPY_B_WEDDING)).toBe("vendors");
    expect(activeSection(`${base}/invite`, COPY_B_WEDDING)).toBe("invite");
    expect(activeSection(`${base}/activity`, COPY_B_WEDDING)).toBe("activity");
    expect(activeSection(`${base}/unknown`, COPY_B_WEDDING)).toBeNull();
    expect(activeSection(`${base}/overview`, COPY_B_WEDDING)).toBeNull();
    expect(activeSection("/w/another-wedding/money", COPY_B_WEDDING)).toBeNull();
    expect(activeSection(`${base}money`, COPY_B_WEDDING)).toBeNull();
    expect(activeSection(null, COPY_B_WEDDING)).toBeNull();
  });
});

describe("what the shell and landing view read (wedding_profile, D99)", () => {
  it("gives Mira the budget and the owner label", async () => {
    const profile = await fixtureServices.read("wedding_profile", {
      actor: fixtureSessionActor("mira", "b"),
      wedding_id: COPY_B_WEDDING,
    });
    expect(profile.display_name).toBe("Mira & Kabir");
    expect(profile.is_sample).toBe(true);
    expect(profile.hidden).not.toContain("budget");
    expect(profile.budget_inr).toBe(1_200_000);
    expect(memberLabel(profile.member)).toBe("Mira, owner");
  });

  it("hides the budget from Diya without budget sharing, as a hidden block", async () => {
    const profile = await fixtureServices.read("wedding_profile", {
      actor: fixtureSessionActor("diya", "b"),
      wedding_id: COPY_B_WEDDING,
    });
    expect(profile.member.role).toBe("manager");
    expect(profile.hidden).toContain("budget");
    expect(profile.budget_inr).toBeUndefined();
    expect(memberLabel(profile.member)).toBe("Diya, event manager");
  });
});
