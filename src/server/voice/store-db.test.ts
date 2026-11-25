import { describe, expect, it } from "vitest";

import { __test } from "./store-db";
import type { StoredTurn } from "./types";

const { toInsert, fromRow, tableIntent } = __test;

function turn(overrides: Partial<StoredTurn> = {}): StoredTurn {
  return {
    voice_turn_id: "6a0b1c2d-3e4f-4a5b-8c6d-7e8f90a1b2c3",
    user_id: "1b2c3d4e-5f60-4718-a9b0-c1d2e3f40516",
    member_id: null,
    wedding_id: null,
    client_turn_id: "2c3d4e5f-6071-4829-bac1-d2e3f4051627",
    input_mode: "typed",
    speech_language: "hi-IN",
    transcript: "Caterer को चालीस हज़ार advance दिया था",
    language_code: "hi-IN",
    chip: "hinglish",
    reply_language: "hinglish",
    intent: "confirm",
    status: "answered",
    refusal_code: null,
    actions: [],
    missing_fields: [],
    options: null,
    reply_text: "Saved.",
    reply_speech: null,
    ref_map: { "PAY-01": "3d4e5f60-7182-493a-8bd2-e3f405162738" },
    flags: { voice_pilot: true },
    events: [{ type: "answer" }],
    results: null,
    confirmed_at: null,
    confirmed_via: null,
    superseded_by_turn_id: null,
    context_turn_id: null,
    setup_opened_at: "2026-11-25T08:00:00.000Z",
    fixture_id: null,
    trace: { prompt_version: "v1" },
    timings_ms: { server_total: 10 },
    created_at: "2026-11-25T08:10:00.000Z",
    updated_at: "2026-11-25T08:10:00.000Z",
    ...overrides,
  };
}

describe("the voice_turns row mapping", () => {
  it("stores a phrase turn's intent as ask, the table's only allowed values", () => {
    expect(tableIntent("confirm")).toBe("ask");
    expect(tableIntent("cancel")).toBe("ask");
    expect(tableIntent("act")).toBe("act");
    expect(tableIntent(null)).toBeNull();
  });

  it("round-trips the fields the table has no column for through trace.replay", () => {
    const original = turn();
    const insert = toInsert(original);
    expect(insert.intent).toBe("ask");
    expect(insert.expires_at?.toISOString()).toBe("2026-11-25T08:20:00.000Z");
    const back = fromRow({ ...insert, seed_key: null } as unknown as Parameters<typeof fromRow>[0]);
    expect(back.chip).toBe("hinglish");
    expect(back.events).toEqual([{ type: "answer" }]);
    expect(back.setup_opened_at).toBe("2026-11-25T08:00:00.000Z");
    expect(back.intent).toBe("confirm");
    expect(back.trace).toEqual({ prompt_version: "v1" });
    expect(back.ref_map).toEqual(original.ref_map);
  });

  it("has no audio anywhere in the row", () => {
    const insert = toInsert(turn());
    expect(Object.keys(insert).some((key) => key.includes("audio"))).toBe(false);
  });
});
