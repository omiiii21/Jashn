import { describe, expect, it, vi } from "vitest";

import { COMMAND_NAMES, GATED_COMMANDS, type CommandName } from "@/contracts/commands";
import type { SharingSettings } from "@/contracts/domain";
import { fixtureGuestActor, fixtureSessionActor } from "@/contracts/fixtures";
import { OWNER_ONLY_COMMANDS } from "@/contracts/permissions";
import { READ_MODEL_NAMES } from "@/contracts/read-models";

vi.mock("@/server/auth/session", () => ({
  getSignedInUser: vi.fn(async () => null),
  loadMemberActor: vi.fn(async () => null),
}));

import { assertReadModelAccess, checkCommandActor, checkMemberInput, memberDecision, requireMemberForApi } from "./guard";

const SHARED: SharingSettings = {
  managers_can_see_vendor_dues: true,
  managers_can_see_budget: false,
  managers_can_see_guest_contacts: false,
};
const NOTHING_SHARED: SharingSettings = { ...SHARED, managers_can_see_vendor_dues: false };

const mira = fixtureSessionActor("mira", "a");
const diya = fixtureSessionActor("diya", "a");
const wedding_id = mira.wedding_id!;

describe("member command decisions (domain 6.1, A1–A3)", () => {
  it("answers approval_required for a manager's gated money command", () => {
    for (const command of GATED_COMMANDS) {
      expect(memberDecision(command, "manager", SHARED, wedding_id)).toBe("approval_required");
      expect(checkCommandActor(diya, command, { wedding_id, sharing: SHARED })?.code).toBe("approval_required");
      expect(checkCommandActor(mira, command, { wedding_id, sharing: SHARED })).toBeNull();
    }
  });

  it("refuses every owner-only command to a manager with 403 forbidden", () => {
    for (const command of OWNER_ONLY_COMMANDS) {
      const error = checkCommandActor(diya, command, { wedding_id, sharing: SHARED });
      expect(error?.code, command).toBe("forbidden");
      expect(checkCommandActor(mira, command, { wedding_id, sharing: SHARED }), command).toBeNull();
    }
  });

  it("refuses Diya's set_invitations with 403, beside X-04's approval_required", () => {
    expect(checkCommandActor(diya, "set_invitations", { wedding_id, sharing: SHARED })).toMatchObject({ code: "forbidden" });
    expect(checkCommandActor(diya, "record_payment", { wedding_id, sharing: SHARED })).toMatchObject({ code: "approval_required" });
  });

  it("opens add_quote to a manager only while vendor dues are shared", () => {
    expect(checkCommandActor(diya, "add_quote", { wedding_id, sharing: SHARED })).toBeNull();
    expect(checkCommandActor(diya, "add_quote", { wedding_id, sharing: NOTHING_SHARED })?.code).toBe("forbidden");
  });

  it("lets an owner run propose_change only as forbidden, and a manager propose", () => {
    expect(checkCommandActor(mira, "propose_change", { wedding_id, sharing: SHARED })?.code).toBe("forbidden");
    expect(checkCommandActor(diya, "propose_change", { wedding_id, sharing: SHARED })).toBeNull();
  });

  it("lets any signed-in user create a wedding and accept an invite, but only owners update", () => {
    const newcomer = { ...mira, wedding_id: null, member_id: null, role: null };
    expect(checkCommandActor(newcomer, "set_wedding_profile", { wedding_id: null, sharing: null })).toBeNull();
    expect(checkCommandActor(newcomer, "accept_member_invite", { wedding_id: null, sharing: null })).toBeNull();
    expect(checkCommandActor(diya, "set_wedding_profile", { wedding_id, sharing: SHARED })?.code).toBe("forbidden");
    expect(checkCommandActor(mira, "set_wedding_profile", { wedding_id, sharing: SHARED })).toBeNull();
  });

  it("refuses a member acting on another wedding", () => {
    const other = fixtureSessionActor("mira", "b").wedding_id!;
    expect(checkCommandActor(mira, "create_event", { wedding_id: other, sharing: SHARED })?.code).toBe("forbidden");
  });

  it("covers every command for both roles without throwing", () => {
    for (const command of COMMAND_NAMES as readonly CommandName[]) {
      expect(["allow", "approval_required", "forbidden"]).toContain(memberDecision(command, "owner", SHARED, wedding_id));
      expect(["allow", "approval_required", "forbidden"]).toContain(memberDecision(command, "manager", SHARED, wedding_id));
    }
  });
});

describe("input-dependent limits", () => {
  it("needs vendor dues for a manager's propose_change of an A1 command other than record_expense", () => {
    const payment = { command: "record_payment", input: {} };
    expect(checkMemberInput("propose_change", payment, "manager", NOTHING_SHARED)?.code).toBe("forbidden");
    expect(checkMemberInput("propose_change", payment, "manager", SHARED)).toBeNull();
    const expense = { command: "record_expense", input: {} };
    expect(checkMemberInput("propose_change", expense, "manager", NOTHING_SHARED)).toBeNull();
  });

  it("refuses a manager's add_guest with event_ids or max_plus_ones", () => {
    expect(checkMemberInput("add_guest", { full_name: "A", event_ids: [] }, "manager", SHARED)).toMatchObject({ code: "forbidden", field: "event_ids" });
    expect(checkMemberInput("add_guest", { full_name: "A", max_plus_ones: 1 }, "manager", SHARED)?.code).toBe("forbidden");
    expect(checkMemberInput("add_guest", { full_name: "A" }, "manager", SHARED)).toBeNull();
    expect(checkMemberInput("add_guest", { full_name: "A", event_ids: [] }, "owner", SHARED)).toBeNull();
  });
});

describe("guest and system actors", () => {
  it("accepts a guest only for its own wedding's RSVP and dietary commands, else 404", () => {
    const guest = fixtureGuestActor("demo");
    expect(checkCommandActor(guest, "submit_rsvp", { wedding_id: guest.wedding_id, sharing: null })).toBeNull();
    expect(checkCommandActor(guest, "set_dietary", { wedding_id: guest.wedding_id, sharing: null })).toBeNull();
    expect(checkCommandActor(guest, "record_payment", { wedding_id: guest.wedding_id, sharing: null })?.code).toBe("not_found");
    expect(checkCommandActor(guest, "submit_rsvp", { wedding_id, sharing: null })?.code).toBe("not_found");
  });

  it("accepts the ops token only for retry_card_export", () => {
    const system = { kind: "system" as const, label: "NudgeBee" as const };
    expect(checkCommandActor(system, "retry_card_export", { wedding_id, sharing: null })).toBeNull();
    expect(checkCommandActor(system, "reset_demo", { wedding_id, sharing: null })?.code).toBe("forbidden");
  });
});

describe("read-model access", () => {
  it("refuses shagun to a manager and the ledger while vendor dues are hidden", () => {
    expect(() => assertReadModelAccess("shagun_register", diya, wedding_id, SHARED)).toThrow();
    expect(() => assertReadModelAccess("vendor_ledger", diya, wedding_id, NOTHING_SHARED)).toThrow();
    expect(assertReadModelAccess("vendor_ledger", diya, wedding_id, SHARED)).toBe("manager");
  });

  it("lets an owner read every member read model, and nobody read another wedding's", () => {
    for (const name of READ_MODEL_NAMES) expect(assertReadModelAccess(name, mira, wedding_id, SHARED)).toBe("owner");
    expect(() => assertReadModelAccess("wedding_profile", mira, fixtureSessionActor("mira", "b").wedding_id!, SHARED)).toThrow();
  });
});

describe("requireMemberForApi", () => {
  it("answers 401 when signed out", async () => {
    const result = await requireMemberForApi(wedding_id);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
      expect(await result.response.json()).toMatchObject({ ok: false, error: { code: "unauthenticated" } });
    }
  });

  it("answers 403 for a signed-in non-member", async () => {
    const session = await import("@/server/auth/session");
    vi.mocked(session.getSignedInUser).mockResolvedValueOnce({ user_id: mira.user_id, email: mira.email });
    const result = await requireMemberForApi(wedding_id);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });
});
