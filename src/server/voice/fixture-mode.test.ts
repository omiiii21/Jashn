import { describe, expect, it } from "vitest";

import { FIXTURE_ROW_IDS, isFixtureMode, LIVE_EIGHT_ROW_IDS, loadFixture } from "./fixture-mode";
import { createMemoryRateLimiter } from "./rate-limit";
import { createMemoryVoiceTurnStore } from "./store";
import { parseToolArguments } from "./tool-schema";
import type { StoredTurn } from "./types";

describe("fixture mode", () => {
  it("turns on without a Sarvam key or with VOICE_FIXTURE_MODE=on, never in production", () => {
    expect(isFixtureMode({ NODE_ENV: "development" })).toBe(true);
    expect(isFixtureMode({ NODE_ENV: "development", SARVAM_API_KEY: "k" })).toBe(false);
    expect(isFixtureMode({ NODE_ENV: "development", SARVAM_API_KEY: "k", VOICE_FIXTURE_MODE: "on" })).toBe(true);
    expect(isFixtureMode({ NODE_ENV: "production", VOICE_FIXTURE_MODE: "on" })).toBe(false);
    expect(isFixtureMode({ NODE_ENV: "production" })).toBe(false);
  });

  it("lists the live 8 first, in order", () => {
    expect(FIXTURE_ROW_IDS.slice(0, 8)).toEqual([...LIVE_EIGHT_ROW_IDS]);
    expect(LIVE_EIGHT_ROW_IDS).toEqual(["O-01", "M-03", "C-01", "E-04", "O-02", "E-05", "O-03", "R-03"]);
  });

  it("refuses row ids that aren't row ids", async () => {
    expect(await loadFixture("../../etc/passwd")).toBeNull();
    expect(await loadFixture("Z-99")).toBeNull();
  });

  it.each(FIXTURE_ROW_IDS)("loads %s and its tool arguments pass the propose_actions schema", async (row_id) => {
    const fixture = await loadFixture(row_id);
    expect(fixture).not.toBeNull();
    expect(fixture?.row_id).toBe(row_id);
    expect(fixture?.stt.transcript.length).toBeGreaterThan(0);
    if (row_id === "C-01" || row_id === "C-02") {
      expect(fixture?.llm).toBeNull();
      return;
    }
    const parsed = parseToolArguments(JSON.stringify(fixture?.llm));
    expect(parsed.ok ? "ok" : parsed.reason).toBe("ok");
  });
});

describe("the rate limit", () => {
  it("allows 12 a minute and 300 a day", () => {
    const limiter = createMemoryRateLimiter();
    const t0 = 1_000_000;
    for (let i = 0; i < 12; i += 1) {
      expect(limiter.check("u", t0 + i).ok).toBe(true);
      limiter.record("u", t0 + i);
    }
    expect(limiter.check("u", t0 + 20).ok).toBe(false);
    expect(limiter.check("other", t0 + 20).ok).toBe(true);
    expect(limiter.check("u", t0 + 61_000).ok).toBe(true);

    const daily = createMemoryRateLimiter({ per_minute: 1000 });
    for (let i = 0; i < 300; i += 1) daily.record("u", t0 + i * 1000);
    expect(daily.check("u", t0 + 400_000).ok).toBe(false);
  });
});

describe("the memory store", () => {
  const turn = (id: string, client: string, at: string): StoredTurn =>
    ({
      voice_turn_id: id,
      user_id: "u1",
      member_id: null,
      wedding_id: "w1",
      client_turn_id: client,
      created_at: at,
      updated_at: at,
      status: "proposed",
      actions: [],
      events: [],
      trace: {},
      timings_ms: {},
    }) as unknown as StoredTurn;

  it("inserts, finds by client_turn_id, lists newest first and refuses a repeated client_turn_id", async () => {
    const store = createMemoryVoiceTurnStore();
    await store.insert(turn("t1", "c1", "2026-11-25T04:00:00.000Z"));
    await store.insert(turn("t2", "c2", "2026-11-25T04:01:00.000Z"));
    await expect(store.insert(turn("t3", "c1", "2026-11-25T04:02:00.000Z"))).rejects.toThrow();
    expect((await store.byClientTurnId("u1", "c2"))?.voice_turn_id).toBe("t2");
    expect(await store.byClientTurnId("u2", "c2")).toBeNull();
    const recent = await store.recentForSpeaker("u1", "w1", "2026-11-25T03:59:00.000Z");
    expect(recent.map((row) => row.voice_turn_id)).toEqual(["t2", "t1"]);
    expect(await store.recentForSpeaker("u1", null, "2026-11-25T03:59:00.000Z")).toEqual([]);
  });

  it("returns copies, so callers can't change the stored row by accident", async () => {
    const store = createMemoryVoiceTurnStore();
    await store.insert(turn("t1", "c1", "2026-11-25T04:00:00.000Z"));
    const copy = await store.get("t1");
    if (copy) copy.status = "confirmed";
    expect((await store.get("t1"))?.status).toBe("proposed");
    const updated = await store.update("t1", { status: "cancelled" });
    expect(updated?.status).toBe("cancelled");
    expect(await store.update("missing", { status: "cancelled" })).toBeNull();
  });
});
