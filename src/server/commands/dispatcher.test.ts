import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import type { CommandEnvelope } from "@/contracts/commands";
import type { SessionActor } from "@/contracts/domain";
import type { Db } from "@/db/client";

import { createDispatcher, defaultVoiceTurnCheck, voiceActionsMembersSafe } from "./dispatcher";
import { actorKeyOf } from "./receipts";

/**
 * The dispatcher's checks that answer before any transaction, with a fake database: the
 * validation words (AT-5.6), a proposal's inner input, the voice-turn check (V2, voice.md
 * 1.13) and the receipt actor key. The transaction paths are in dispatcher.db.test.ts.
 */

/** A query-builder stand-in: every `select … from … where … limit` answers `rows`. */
function fakeDb(rows: unknown[]): Db {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.from = () => chain;
  chain.where = () => chain;
  chain.limit = async () => rows;
  chain.transaction = async () => {
    throw new Error("no transaction expected in this test");
  };
  return chain as unknown as Db;
}

function user(overrides: Partial<SessionActor> = {}): SessionActor {
  return {
    kind: "member",
    user_id: randomUUID(),
    email: "tess@example.com",
    display_name: "Tess",
    wedding_id: null,
    member_id: null,
    role: null,
    is_internal: true,
    is_first_wedding: true,
    preferred_language: "en",
    ...overrides,
  };
}

const quiet = { log: () => {}, schedule: () => {} };

function create(input: Record<string, unknown>): CommandEnvelope<"set_wedding_profile"> {
  return { wedding_id: null, command: "set_wedding_profile", input, idempotency_key: randomUUID(), source: "ui" } as CommandEnvelope<"set_wedding_profile">;
}

describe("validation words", () => {
  const dispatcher = createDispatcher({ ...quiet, db: () => fakeDb([]) });

  it("answers not_integer for an amount sent as a string (AT-5.6)", async () => {
    const response = await dispatcher.runCommand(user(), create({ budget_inr: "40000" }));
    expect(response).toEqual({ ok: false, error: { code: "validation_failed", message: "not_integer", field: "budget_inr" } });
  });

  it("answers not_integer for a fraction and unknown_value for another wrong type", async () => {
    const fraction = await dispatcher.runCommand(user(), create({ budget_inr: 40000.5 }));
    expect(fraction).toMatchObject({ ok: false, error: { message: "not_integer", field: "budget_inr" } });
    const wrong = await dispatcher.runCommand(user(), create({ bride_name: 5 }));
    expect(wrong).toMatchObject({ ok: false, error: { message: "unknown_value", field: "bride_name" } });
  });

  it("answers required for a missing envelope field, never a UUID check on the key (I1)", async () => {
    const missing = await dispatcher.runCommand(user(), { command: "set_wedding_profile", source: "ui" } as unknown as CommandEnvelope);
    expect(missing).toMatchObject({ ok: false, error: { code: "validation_failed", message: "required", field: "input" } });
    const shortKey = await dispatcher.runCommand(user(), { ...create({ city: "Goa" }), idempotency_key: "short" });
    expect(shortKey).toMatchObject({ ok: false, error: { code: "validation_failed", field: "idempotency_key" } });
  });

  it("validates a proposal's inner input like the direct command (3.5)", async () => {
    const wedding_id = randomUUID();
    const sharing = {
      id: wedding_id,
      version: 3,
      managers_can_see_vendor_dues: true,
      managers_can_see_budget: false,
      managers_can_see_guest_contacts: false,
    };
    const withWedding = createDispatcher({ ...quiet, db: () => fakeDb([sharing]) });
    const manager = user({ wedding_id, member_id: randomUUID(), role: "manager", display_name: "Diya" });
    const response = await withWedding.runCommand(manager, {
      wedding_id,
      command: "propose_change",
      input: { command: "record_payment", input: { vendor_id: randomUUID(), amount_inr: "20000" } },
      idempotency_key: randomUUID(),
      source: "ui",
    } as unknown as CommandEnvelope);
    expect(response).toMatchObject({ ok: false, error: { code: "validation_failed", message: "not_integer", field: "amount_inr" } });
  });
});

describe("voice turns (V2)", () => {
  const speaker = user({ wedding_id: randomUUID(), member_id: randomUUID(), role: "owner" });
  const now = new Date("2026-11-25T08:00:00Z");
  const turn = (overrides: Record<string, unknown> = {}) => ({
    user_id: speaker.user_id,
    wedding_id: speaker.wedding_id,
    status: "proposed",
    expires_at: new Date(now.getTime() + 60_000),
    confirmed_at: null,
    transcript: "Reception ka venue Lotus Hall kar do",
    actions: [{ kind: "update_event", event_id: randomUUID(), venue_name: "Lotus Hall" }],
    ...overrides,
  });
  const check = (row: unknown | null) =>
    defaultVoiceTurnCheck(fakeDb(row ? [row] : []), speaker, { voice_turn_id: randomUUID(), wedding_id: speaker.wedding_id, now });

  it("accepts the speaker's open turn and reads voice.md 2.2's action shape", async () => {
    expect(await check(turn())).toEqual({ ok: true, transcript: "Reception ka venue Lotus Hall kar do", members_safe: true });
  });

  it("answers 403 forbidden for an unknown turn, another user's or another wedding's", async () => {
    for (const row of [null, turn({ user_id: randomUUID() }), turn({ wedding_id: randomUUID() })]) {
      expect(await check(row)).toMatchObject({ ok: false, error: { code: "forbidden" } });
    }
  });

  it("answers 410 for a late or closed turn, but lets a confirmed turn replay", async () => {
    expect(await check(turn({ expires_at: new Date(now.getTime() - 1) }))).toMatchObject({ ok: false, error: { code: "voice_turn_expired" } });
    for (const status of ["cancelled", "superseded", "answered", "paused", "failed", "expired"]) {
      expect(await check(turn({ status }))).toMatchObject({ ok: false, error: { code: "voice_turn_expired" } });
    }
    const late = turn({ status: "partially_saved", confirmed_at: now, expires_at: new Date(now.getTime() - 1) });
    expect(await check(late)).toMatchObject({ ok: true });
  });

  it("keeps spoken text off members entries when any action is money or carries a contact (L5a)", () => {
    expect(voiceActionsMembersSafe([{ kind: "create_event", title: "Haldi" }])).toBe(true);
    expect(voiceActionsMembersSafe([{ command: "set_rsvp", input: { guest_id: "g" } }])).toBe(true);
    expect(voiceActionsMembersSafe([{ kind: "create_event" }, { kind: "record_payment", amount_inr: 20000 }])).toBe(false);
    expect(voiceActionsMembersSafe([{ kind: "set_wedding_profile", budget_inr: 2500000 }])).toBe(false);
    expect(voiceActionsMembersSafe([{ kind: "add_guest", full_name: "Tara", phone: "+91 98450 00000" }])).toBe(false);
    expect(voiceActionsMembersSafe([{ kind: "add_vendor", name: "Lights", contact_phone: "98450" }])).toBe(false);
    expect(voiceActionsMembersSafe([])).toBe(false);
  });
});

describe("receipt actor key", () => {
  it("keys a command with no wedding on the user, so a retry after the create still replays", () => {
    const before = user();
    const after = { ...before, wedding_id: randomUUID(), member_id: randomUUID(), role: "owner" as const };
    expect(actorKeyOf(before, null)).toBe(`member:${before.user_id}`);
    expect(actorKeyOf(after, null)).toBe(`member:${before.user_id}`);
    expect(actorKeyOf(after, after.wedding_id)).toBe(`member:${after.member_id}`);
  });
});
