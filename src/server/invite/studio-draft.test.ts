import { describe, expect, it } from "vitest";
import { getDemoFixture, fixtureSessionActor } from "@/contracts/fixtures";
import { seededId } from "@/db/ids";
import { getInviteStudioDraft } from "./studio-draft";

describe("getInviteStudioDraft on fixtures", () => {
  it("reads copy d's draft style, wedding and functions", async () => {
    const wedding_id = seededId("d", "weddings", "WEDDING");
    const actor = { ...fixtureSessionActor("mira", "d"), wedding_id };
    const fixture = getDemoFixture("d");
    const draft = await getInviteStudioDraft(actor, wedding_id);

    const { seed_key: _seedKey, ...style } = fixture.invite_style;
    void _seedKey;
    expect(draft.wedding_id).toBe(wedding_id);
    expect(draft.style).toEqual(style);
    expect(draft.style).not.toHaveProperty("seed_key");
    expect(draft.wedding).toEqual({
      bride_name: fixture.wedding.bride_name,
      groom_name: fixture.wedding.groom_name,
      city: fixture.wedding.city,
      wedding_date: fixture.wedding.wedding_date,
    });
    expect(draft.events.length).toBeGreaterThan(0);
    expect(draft.events[0]).not.toHaveProperty("capacity");
    expect(draft.is_sample).toBe(true);
    expect(draft.member.role).toBe("owner");
  });

  it("has the seeded photo row but no URL while its file is missing (D126)", async () => {
    const wedding_id = seededId("d", "weddings", "WEDDING");
    const actor = { ...fixtureSessionActor("mira", "d"), wedding_id };
    const draft = await getInviteStudioDraft(actor, wedding_id);
    expect(draft.photo).toEqual({ asset_id: getDemoFixture("d").invite_style.photo_asset_id, url: null });
  });

  it("refuses an unknown wedding with not_found", async () => {
    const wedding_id = "00000000-0000-4000-8000-000000000000";
    const actor = { ...fixtureSessionActor("mira", "d"), wedding_id };
    await expect(getInviteStudioDraft(actor, wedding_id)).rejects.toMatchObject({ body: { code: "not_found" } });
  });
});
