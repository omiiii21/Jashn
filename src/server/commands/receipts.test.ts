import { describe, expect, it } from "vitest";

import type { CommandSuccess } from "@/contracts/commands";
import { fixtureGuestActor, fixtureSessionActor } from "@/contracts/fixtures";

import { actorKeyOf, canonicalJson, matchReceipt, requestHash, stripResponseForReceipt, type StoredReceipt } from "./receipts";

const WEDDING = "0b7c6e1a-1111-4111-8111-111111111111";

describe("canonical JSON and the request hash (I2)", () => {
  it("sorts keys at every depth and drops undefined members", () => {
    expect(canonicalJson({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: undefined } })).toBe('{"a":{"d":[3,{"y":2,"z":1}]},"b":1}');
  });

  it("hashes the same request the same, whatever the key order", () => {
    const one = requestHash("correct_payment", WEDDING, { payment_id: "p", expected_version: 1, amount_inr: 40000 });
    const two = requestHash("correct_payment", WEDDING, { amount_inr: 40000, expected_version: 1, payment_id: "p", note: undefined });
    expect(one).toBe(two);
    expect(one).toMatch(/^[0-9a-f]{64}$/);
  });

  it("hashes a different value, command or wedding differently", () => {
    const base = requestHash("correct_payment", WEDDING, { amount_inr: 40000 });
    expect(requestHash("correct_payment", WEDDING, { amount_inr: 40001 })).not.toBe(base);
    expect(requestHash("record_payment", WEDDING, { amount_inr: 40000 })).not.toBe(base);
    expect(requestHash("correct_payment", null, { amount_inr: 40000 })).not.toBe(base);
  });
});

describe("actor keys", () => {
  it("uses member:{id}, household:{id} and ops", () => {
    const mira = fixtureSessionActor("mira", "a");
    expect(actorKeyOf(mira)).toBe(`member:${mira.member_id}`);
    expect(actorKeyOf({ ...mira, member_id: null })).toBe(`member:${mira.user_id}`);
    const guest = fixtureGuestActor("demo");
    expect(actorKeyOf(guest)).toBe(`household:${guest.household_id}`);
    expect(actorKeyOf({ kind: "system", label: "NudgeBee" })).toBe("ops");
  });
});

function success(command: CommandSuccess["command"], result: unknown): CommandSuccess {
  return { ok: true, outcome: "applied", command, result, activity_entry_id: null, version: 3, warnings: [] } as CommandSuccess;
}

describe("stripping tokens and signed URLs (5.1)", () => {
  it("removes invitation link URLs and marks the tokens as issued", () => {
    const stored = stripResponseForReceipt(
      success("create_invitation_links", {
        links: [{ household_id: "h1", url: "https://jashn.example/i/AbCdEfGhIjKlMnOpQrStUvWxYz0123456789abcdefg" }],
        skipped: [],
      }),
    );
    expect(stored.result).toEqual({ links: [{ household_id: "h1" }], skipped: [], tokens_already_issued: true });
  });

  it("removes a member invite's join URL", () => {
    const stored = stripResponseForReceipt(success("invite_member", { member_invite_id: "m1", join_url: "https://x/join/abc" }));
    expect(stored.result).toEqual({ member_invite_id: "m1", token_already_issued: true });
  });

  it("nulls signed download URLs and any string that is a signed URL", () => {
    const stored = stripResponseForReceipt(
      success("request_card_export", {
        job_id: "j1",
        download_url: "https://p.supabase.co/storage/v1/object/sign/exports/w/card-rev2.png?token=abc",
        note: "https://p.supabase.co/storage/v1/object/sign/uploads/w/a.jpg?token=xyz",
        map_url: "https://maps.example/?q=Banyan+Hall",
      }),
    );
    expect(stored.result).toEqual({ job_id: "j1", download_url: null, note: null, map_url: "https://maps.example/?q=Banyan+Hall" });
  });

  it("leaves ordinary results untouched", () => {
    const result = { payment_id: "p1", version_no: 2, amount_inr: 40000, vendor_totals: { committed_inr: 1, paid_inr: 2, outstanding_inr: 0, overpaid_inr: 1 } };
    expect(stripResponseForReceipt(success("correct_payment", result)).result).toEqual(result);
  });
});

describe("matching a stored receipt", () => {
  const receipt: StoredReceipt = {
    idempotency_key: "key-12345",
    command: "correct_payment",
    wedding_id: WEDDING,
    actor_key: "member:m1",
    request_hash: "h",
    outcome: "applied",
    http_status: 200,
    response: success("correct_payment", { payment_id: "p" }) as never,
  };
  const request = { command: "correct_payment" as const, actor_key: "member:m1", request_hash: "h", wedding_id: WEDDING };

  it("replays the same request with outcome replayed", () => {
    const match = matchReceipt(receipt, request);
    expect(match.kind).toBe("replay");
    if (match.kind === "replay") expect(match.response.outcome).toBe("replayed");
  });

  it("reports reuse for another input, actor, command or wedding", () => {
    expect(matchReceipt(receipt, { ...request, request_hash: "other" }).kind).toBe("reused");
    expect(matchReceipt(receipt, { ...request, actor_key: "member:m2" }).kind).toBe("reused");
    expect(matchReceipt(receipt, { ...request, command: "record_payment" }).kind).toBe("reused");
    expect(matchReceipt(receipt, { ...request, wedding_id: "0b7c6e1a-2222-4222-8222-222222222222" }).kind).toBe("reused");
  });

  it("lets a create (no envelope wedding) replay against the new wedding's receipt", () => {
    expect(matchReceipt(receipt, { ...request, wedding_id: null }).kind).toBe("replay");
  });
});
