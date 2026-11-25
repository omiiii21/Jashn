import { describe, expect, it } from "vitest";

import type { CommandSuccess } from "@/contracts/commands";
import type { SessionActor, SharingSettings } from "@/contracts/domain";
import { fixtureSessionActor } from "@/contracts/fixtures";
import { checkCommandActor } from "@/server/authz/guard";

import {
  INVITE_INVALID_BODY,
  INVITE_TTL_MS,
  appBaseUrl,
  describeSharingChanges,
  diffSharing,
  inviteRevokedActivity,
  inviteState,
  invitedActivity,
  joinUrlFor,
  joinedActivity,
  joinedDisplayName,
  memberHandlers,
  memberRemovedActivity,
  roleWord,
  sharingActivity,
} from "./members";
import { stripResponseForReceipt } from "./receipts";

const WEDDING_ID = "0b7c5a52-1f43-4d2e-9a77-3f0d8c1e2b10";
const TOKEN = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_AbCdE"; // 43 base64url characters

const SEEDED: SharingSettings = {
  managers_can_see_vendor_dues: true,
  managers_can_see_budget: false,
  managers_can_see_guest_contacts: false,
};

describe("memberHandlers", () => {
  it("covers exactly the five sharing and member commands of 3.1", () => {
    expect(Object.keys(memberHandlers).sort()).toEqual(
      ["accept_member_invite", "invite_member", "remove_member", "revoke_member_invite", "set_sharing"].sort(),
    );
  });
});

describe("diffSharing and describeSharingChanges", () => {
  it("keeps only the flags that differ, in SHARING_FLAGS order", () => {
    expect(diffSharing(SEEDED, { managers_can_see_budget: true, managers_can_see_vendor_dues: false })).toEqual([
      { flag: "managers_can_see_vendor_dues", from: true, to: false },
      { flag: "managers_can_see_budget", from: false, to: true },
    ]);
    expect(diffSharing(SEEDED, { managers_can_see_vendor_dues: true })).toEqual([]);
  });

  it("words {changes} in English and Hindi", () => {
    const changes = diffSharing(SEEDED, { managers_can_see_vendor_dues: false, managers_can_see_guest_contacts: true });
    expect(describeSharingChanges(changes, "en")).toBe("vendors and dues off, guest contacts on");
    expect(describeSharingChanges(changes, "hi")).toBe("वेंडर और बकाया बंद, मेहमानों के संपर्क चालू");
  });
});

describe("inviteState", () => {
  const created = new Date("2026-11-25T08:00:00Z");
  const expires_at = new Date(created.getTime() + INVITE_TTL_MS);

  it("is pending until 48 hours have passed, then expired", () => {
    expect(INVITE_TTL_MS).toBe(48 * 3600 * 1000);
    expect(inviteState({ accepted_at: null, revoked_at: null, expires_at }, new Date(expires_at.getTime() - 1))).toBe("pending");
    expect(inviteState({ accepted_at: null, revoked_at: null, expires_at }, expires_at)).toBe("expired");
  });

  it("reports accepted and revoked ahead of expiry", () => {
    const later = new Date(expires_at.getTime() + 1);
    expect(inviteState({ accepted_at: created, revoked_at: null, expires_at }, later)).toBe("accepted");
    expect(inviteState({ accepted_at: null, revoked_at: created, expires_at }, later)).toBe("revoked");
  });
});

describe("join URLs", () => {
  it("uses APP_BASE_URL, then the production host, else a site-relative path", () => {
    expect(appBaseUrl({ APP_BASE_URL: "http://localhost:3001/" })).toBe("http://localhost:3001");
    expect(appBaseUrl({ VERCEL_PROJECT_PRODUCTION_URL: "jashn.example.app" })).toBe("https://jashn.example.app");
    expect(appBaseUrl({ VERCEL_URL: "preview.example.app" })).toBe("");
    expect(joinUrlFor(TOKEN, { APP_BASE_URL: "http://localhost:3001" })).toBe(`http://localhost:3001/join/${TOKEN}`);
    expect(joinUrlFor(TOKEN, {})).toBe(`/join/${TOKEN}`);
  });

  it("never reaches a stored receipt: the replay says token_already_issued", () => {
    for (const join_url of [joinUrlFor(TOKEN, { APP_BASE_URL: "http://localhost:3001" }), joinUrlFor(TOKEN, {})]) {
      const response = {
        ok: true,
        outcome: "applied",
        command: "invite_member",
        result: { member_invite_id: "6f1d2b3c-0000-4000-8000-000000000001", join_url },
        activity_entry_id: null,
        version: 2,
        warnings: [],
      } as CommandSuccess<"invite_member">;
      const stored = stripResponseForReceipt(response);
      expect(stored.result).toEqual({ member_invite_id: "6f1d2b3c-0000-4000-8000-000000000001", token_already_issued: true });
      expect(JSON.stringify(stored)).not.toContain(TOKEN);
    }
  });
});

describe("activity templates (3.1), every one owners-only (L5)", () => {
  it("set_sharing", () => {
    const entry = sharingActivity({
      actor_label: "Mira",
      wedding_id: WEDDING_ID,
      changes: diffSharing(SEEDED, { managers_can_see_vendor_dues: false }),
    });
    expect(entry).toMatchObject({
      topic: "sharing.updated",
      entity_type: "wedding",
      entity_id: WEDDING_ID,
      summary_en: "Mira changed what managers can see: vendors and dues off.",
      summary_hi: "Mira ने बदला कि मैनेजर क्या देख सकते हैं: वेंडर और बकाया बंद।",
      before: { managers_can_see_vendor_dues: true },
      after: { managers_can_see_vendor_dues: false },
      visibility: "owners",
    });
  });

  it("invite_member, accept_member_invite, revoke_member_invite and remove_member", () => {
    const invited = invitedActivity({
      actor_label: "Mira",
      member_invite_id: "i1",
      email: "new.manager@example.com",
      role: "manager",
      display_name: null,
      expires_at: "2026-11-27T08:00:00.000Z",
    });
    expect(invited).toMatchObject({
      topic: "member.invited",
      entity_type: "member_invite",
      summary_en: "Mira invited new.manager@example.com as manager.",
      summary_hi: "Mira ने new.manager@example.com को इवेंट मैनेजर के रूप में बुलाया।",
      visibility: "owners",
    });

    const joined = joinedActivity({ member_id: "m1", member_invite_id: "i1", email: "new.manager@example.com", role: "manager", display_name: "Asha" });
    expect(joined).toMatchObject({
      topic: "member.joined",
      entity_type: "member",
      entity_id: "m1",
      summary_en: "new.manager@example.com accepted the invite as manager.",
      summary_hi: "new.manager@example.com ने इवेंट मैनेजर के रूप में न्योता स्वीकार किया।",
      visibility: "owners",
      actor_label: "Asha",
    });

    const revoked = inviteRevokedActivity({ actor_label: "Mira", member_invite_id: "i2", email: "second@example.com", revoked_at: "x" });
    expect(revoked).toMatchObject({
      topic: "member.invite_revoked",
      entity_type: "member_invite",
      entity_id: "i2",
      summary_en: "Mira cancelled the invite to second@example.com.",
      summary_hi: "Mira ने second@example.com का न्योता रद्द किया।",
      visibility: "owners",
    });

    const removed = memberRemovedActivity({ actor_label: "Mira", member_id: "m1", member_label: "Asha", role: "manager", removed_at: "x" });
    expect(removed).toMatchObject({
      topic: "member.removed",
      entity_type: "member",
      summary_en: "Mira removed Asha from the wedding.",
      summary_hi: "Mira ने Asha को शादी से हटाया।",
      visibility: "owners",
    });
  });

  it("names the roles as AT-8.1 and 3.1 do", () => {
    expect(roleWord("owner", "en")).toBe("owner");
    expect(roleWord("manager", "en")).toBe("manager");
    expect(roleWord("owner", "hi")).toBe("मालिक");
    expect(roleWord("manager", "hi")).toBe("इवेंट मैनेजर");
  });
});

describe("joinedDisplayName", () => {
  it("prefers the invite's name, then an earlier membership's, then the actor's", () => {
    expect(joinedDisplayName("Asha", "Old", "asha.k")).toBe("Asha");
    expect(joinedDisplayName(null, "Old", "asha.k")).toBe("Old");
    expect(joinedDisplayName(null, null, "asha.k")).toBe("asha.k");
    expect(joinedDisplayName("  ", null, "")).toBe("Member");
  });
});

describe("one invite_invalid body (3.1)", () => {
  it("is a 404-coded body that names no cause and no field", () => {
    expect(INVITE_INVALID_BODY).toEqual({ code: "invite_invalid", message: "This invite link isn't valid any more.", field: null });
  });
});

describe("the role matrix for these commands (6.1, A3, AT-8.1, AT-9.6)", () => {
  const mira = fixtureSessionActor("mira", "a");
  const diya = fixtureSessionActor("diya", "a");
  const context = { wedding_id: mira.wedding_id, sharing: SEEDED };
  const ownerOnly = ["set_sharing", "invite_member", "revoke_member_invite", "remove_member"] as const;

  it("lets owners run the owner-only four and refuses managers with 403 forbidden", () => {
    for (const command of ownerOnly) {
      expect(checkCommandActor(mira, command, context)).toBeNull();
      expect(checkCommandActor(diya, command, context)).toMatchObject({ code: "forbidden" });
    }
  });

  it("lets any signed-in user send accept_member_invite with no wedding", () => {
    const stranger: SessionActor = { ...diya, wedding_id: null, member_id: null, role: null, user_id: "8d7c6b5a-0000-4000-8000-00000000abcd" };
    expect(checkCommandActor(stranger, "accept_member_invite", { wedding_id: null, sharing: null })).toBeNull();
    expect(checkCommandActor({ ...stranger, user_id: "" }, "accept_member_invite", { wedding_id: null, sharing: null })).toMatchObject({
      code: "unauthenticated",
    });
  });

  it("never lets a non-member run an owner command, whatever role the actor claims", () => {
    const elsewhere: SessionActor = { ...mira, wedding_id: "11111111-2222-4333-8444-555555555555" };
    for (const command of ownerOnly) expect(checkCommandActor(elsewhere, command, context)).toMatchObject({ code: "forbidden" });
  });
});
