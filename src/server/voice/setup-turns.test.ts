import { beforeEach, describe, expect, it } from "vitest";

import type { CommandEnvelope, CommandResponse } from "@/contracts/commands";
import type { SessionActor } from "@/contracts/domain";
import { fixtureSessionActor } from "@/contracts/fixtures";
import type { FlagKey } from "@/contracts/flags";
import { routes } from "@/contracts/routes";

import { handleConfirm } from "./confirm";
import type { FlagEvaluation, VoiceDeps } from "./deps";
import { readNdjson } from "./ndjson";
import { createMemoryRateLimiter } from "./rate-limit";
import { createMemoryVoiceTurnStore } from "./store";
import { handleTurn } from "./turn";
import type { VoiceTurnStore } from "./types";

/**
 * Voice setup on fixtures (voice.md 7.2 S-01 to S-03, acceptance AT-1.1 and AT-1.6): the
 * real snapshot, resolver and fixture rows, with a setup actor (no wedding yet) and an
 * injected evaluation so the preview path runs with writes on.
 */

const setupActor: SessionActor = { ...fixtureSessionActor("mira", "demo"), wedding_id: null, member_id: null, role: null, is_first_wedding: true };
const NEW_WEDDING = "9b9b9b9b-0000-4000-8000-000000000001";
const OPENED = "2026-11-25T08:30:00.000Z";

function evaluation(writes: boolean): FlagEvaluation {
  const flag = (enabled: boolean, value: string | null = null) => ({ enabled, value, fallback: false, reason: null });
  const flags = {
    voice_pilot: flag(true),
    voice_writes_enabled: flag(writes),
    spoken_replies: flag(true),
    setup_entry: flag(true, "form_first"),
    setup_entry_synthetic: flag(true, "form_first"),
    env_label: flag(true, "development"),
    export_failure_drill: flag(false, ""),
    card_renderer: flag(true, "chromium"),
  } satisfies Record<FlagKey, unknown>;
  return { identity: "u_test", flags, fallback: false, env_label: "development", latency_ms: 3 };
}

let store: VoiceTurnStore;
let writes = true;
let dispatched: CommandEnvelope[] = [];
let ids = 0;
let clients = 0;

function deps(): Partial<VoiceDeps> {
  return {
    now: () => Date.parse("2026-11-25T09:00:00.000Z"),
    newId: () => `a41f0000-0000-4000-8000-${String(++ids).padStart(12, "0")}`,
    store,
    rateLimiter: createMemoryRateLimiter(),
    readSession: async () => setupActor,
    evaluateFlags: async () => evaluation(writes),
    fixtureMode: () => true,
    dispatch: async (_actor, envelope) => {
      dispatched.push(envelope);
      return {
        ok: true,
        outcome: "applied",
        command: "set_wedding_profile",
        result: { wedding_id: NEW_WEDDING, member_id: "9b9b9b9b-0000-4000-8000-000000000002", created: true },
        activity_entry_id: null,
        version: 1,
        warnings: [],
      } as unknown as CommandResponse;
    },
    log: () => {},
  };
}

function setupTurn(fixture_id: string, extra: Record<string, string> = {}): Request {
  const form = new FormData();
  form.append("text", "x");
  form.append("wedding_id", "");
  form.append("client_turn_id", `c0000000-0000-4000-8000-${String(++clients).padStart(12, "0")}`);
  form.append("ui_language", "en");
  form.append("setup_opened_at", OPENED);
  form.append("fixture_id", fixture_id);
  for (const [key, value] of Object.entries(extra)) form.append(key, value);
  return new Request("http://localhost/api/voice/turn", { method: "POST", body: form });
}

async function run(fixture_id: string, extra: Record<string, string> = {}) {
  const events = await readNdjson(await handleTurn(setupTurn(fixture_id, extra), deps()));
  const terminal = events.find((event) => ["preview", "refused", "question", "answer", "error"].includes(String(event.type))) ?? events[events.length - 1];
  return { events, terminal };
}

beforeEach(() => {
  store = createMemoryVoiceTurnStore();
  writes = true;
  dispatched = [];
});

describe("voice setup (S-01 to S-03)", () => {
  it("S-01: a draft card with Save wedding disabled and the spoken question; no year filled in", async () => {
    const { terminal } = await run("S-01");
    expect(terminal.type).toBe("preview");
    expect(terminal.confirm_enabled).toBe(false);
    expect(terminal.disabled_reason).toBe("Add the year and the couple's names to save.");
    expect(terminal.reply.display_text).toBe(
      "Got it: 14 December in Bengaluru, ₹12,00,000, about 250 guests. Which year is it, and what are the couple's names?",
    );
    expect(terminal.reply.speak).toBe(true);
    const stored = await store.get(terminal.voice_turn_id as string);
    expect((stored?.reply_speech?.parts ?? []).join(" ")).toContain("twelve lakh rupees");
    const input = stored!.actions[0].input;
    expect(input).toMatchObject({ city: "Bengaluru", budget_inr: 1_200_000, expected_guests: 250, setup_opened_at: OPENED });
    expect(input.wedding_date).toBeUndefined();
  });

  it("S-02 after S-01: merges into a full draft, Save wedding enabled, S-01 superseded; confirm creates and navigates", async () => {
    const first = await run("S-01");
    const s01 = first.terminal.voice_turn_id as string;
    const second = await run("S-02", { context_turn_id: s01 });
    const t = second.terminal;
    expect(t.type).toBe("preview");
    expect(t.confirm_enabled).toBe(true);
    expect(t.button_label).toBe("Save wedding");
    expect((await store.get(t.voice_turn_id as string))!.actions[0].input).toMatchObject({
      bride_name: "Mira",
      groom_name: "Kabir",
      wedding_date: "2026-12-14",
      city: "Bengaluru",
      budget_inr: 1_200_000,
      expected_guests: 250,
      setup_opened_at: OPENED,
    });
    expect((await store.get(s01))?.status).toBe("superseded");

    const confirm = await handleConfirm(
      new Request("http://localhost/api/voice/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ voice_turn_id: t.voice_turn_id }),
      }),
      deps(),
    );
    const body = await confirm.json();
    expect(confirm.status).toBe(200);
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]).toMatchObject({ wedding_id: null, command: "set_wedding_profile", source: "voice" });
    expect(body.navigate?.path).toBe(routes.wedding(NEW_WEDDING));
  });

  it("S-03: a month alone gives a draft with day, year and the names missing", async () => {
    const { terminal } = await run("S-03");
    expect(terminal.type).toBe("preview");
    expect(terminal.confirm_enabled).toBe(false);
    expect(terminal.missing_fields).toEqual(expect.arrayContaining(["day", "year", "bride_name", "groom_name"]));
    expect(terminal.reply.display_text).toBe("₹12,00,000 note kar liya. December mein kaunsi tareekh, kaunsa saal, aur dulha-dulhan ke naam?");
    expect((await store.get(terminal.voice_turn_id as string))!.actions[0].input.wedding_date).toBeUndefined();
  });

  it("with writes off: refused, with a set_wedding_profile prefill for the typed form (AT-1.6)", async () => {
    writes = false;
    const { terminal } = await run("S-01");
    expect(terminal.type).toBe("refused");
    expect(terminal.code).toBe("voice_writes_paused");
    expect(terminal.prefill).toEqual([
      expect.objectContaining({ command: "set_wedding_profile", input: expect.objectContaining({ city: "Bengaluru", budget_inr: 1_200_000, expected_guests: 250 }) }),
    ]);
  });
});
