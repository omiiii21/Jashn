import { describe, expect, it } from "vitest";

import type { ReplyRegister } from "@/contracts/api";
import type { CommandName } from "@/contracts/commands";
import type { JsonObject } from "@/contracts/domain";
import { FIXTURE_TODAY, fixtureIds, fixtureSessionActor } from "@/contracts/fixtures";

import { confirmedReply } from "./confirm-reply";
import { SERVER_FACTS_KEY, type ServerFacts } from "./preview";
import { resolveTurn } from "./resolve";
import { buildSnapshot } from "./snapshot";
import type { ActionKind, ResolveContext, ResolvedAction, ToolAction } from "./types";

const ids = fixtureIds("demo");
const WEDDING = ids.wedding_id;
const FRACTIONS = /डेढ़|ढाई|सवा|साढ़े|पौने/;

function action(command: CommandName, input: JsonObject, facts: ServerFacts = {}): ResolvedAction {
  return {
    index: 0,
    kind: command as ActionKind,
    command,
    input,
    labels: {},
    heard: [],
    entity_ref: null,
    preview: { kind: command as ActionKind, command, fields: [], after_saving: [], warnings: [] },
    missing_fields: [],
    raw: { kind: command as ActionKind, [SERVER_FACTS_KEY]: facts } as ToolAction,
  };
}

async function saved(a: ResolvedAction, register: ReplyRegister, wedding_id: string | null = WEDDING) {
  return confirmedReply({
    actor: fixtureSessionActor("mira"),
    wedding_id,
    actions: [a],
    results: [{ index: 0, command: a.command, outcome: "applied", idempotency_key: "t:0", entity_ref: null, activity_entry_id: null }],
    register,
    partial: null,
  });
}

describe("dates and years in Hindi speech are words (3.5)", () => {
  const profile = action("set_wedding_profile", { bride_name: "Mira", groom_name: "Kabir", wedding_date: "2026-12-14", city: "Bengaluru" });

  it("S-02 hinglish: display as voice.md 4.10, speech with the day and the year in words", async () => {
    const { reply } = await saved(profile, "hinglish", null);
    expect(reply.display_text).toBe("Mira aur Kabir ki shaadi, 14 December 2026, Bengaluru. Save ho gayi.");
    expect(reply.speech_text).toBe("Mira और Kabir की शादी, चौदह December दो हज़ार छब्बीस, Bengaluru। Save हो गई।");
  });

  it("S-02 hi: digits in display, words in speech", async () => {
    const { reply } = await saved(profile, "hi", null);
    expect(reply.display_text).toBe("Mira और Kabir की शादी, 14 दिसंबर 2026, Bengaluru। सेव हो गई।");
    expect(reply.speech_text).toBe("Mira और Kabir की शादी, चौदह दिसंबर दो हज़ार छब्बीस, Bengaluru। सेव हो गई।");
  });

  const sangeet = action(
    "create_event",
    { event_kind: "sangeet", event_date: "2026-12-13", start_time: "19:00" },
    { event_title: "Sangeet", event_title_hi: "संगीत", venue_name: "Garden Hall" },
  );

  it("E-02 hinglish: the clock in words in display, the day in words in speech", async () => {
    const { reply } = await saved(sangeet, "hinglish");
    expect(reply.display_text).toBe("Sangeet 13 December, shaam saat baje, Garden Hall mein add ho gaya.");
    expect(reply.speech_text).toBe("Sangeet तेरह December, शाम सात बजे, Garden Hall में add हो गया।");
    expect(reply.speech_text).not.toMatch(/[0-9]/);
  });

  it("E-02 hi: voice.md 4.10's display, and the day in words in speech", async () => {
    const { reply } = await saved(sangeet, "hi");
    expect(reply.display_text).toBe("संगीत रविवार, 13 दिसंबर को शाम सात बजे, Garden Hall में जोड़ दिया।");
    expect(reply.speech_text).toBe("संगीत रविवार, तेरह दिसंबर को शाम सात बजे, Garden Hall में जोड़ दिया।");
  });

  it("E-02 en keeps digits, which Bulbul reads", async () => {
    const { reply } = await saved(sangeet, "en");
    expect(reply.display_text).toBe("Sangeet added for Sunday 13 December at 7 PM, Garden Hall.");
  });

  async function e08(register: ReplyRegister) {
    const actor = fixtureSessionActor("mira");
    const snapshot = await buildSnapshot({ actor, wedding_id: WEDDING, context: null, attached_asset_id: null, today: FIXTURE_TODAY });
    const ctx: ResolveContext = {
      actor,
      wedding_id: WEDDING,
      tool: {
        intent: "act",
        actions: [{ kind: "update_event", event_id: "EVT-HAL", event_date: "2026-11-26", heard: [{ field: "event_date", phrase: "kal" }] }],
        missing_fields: [],
        reply: "",
        reply_language: register,
      },
      snapshot,
      transcript: "Haldi kal subah rakhte hain.",
      register,
      ui_language: "en",
      writes_enabled: true,
      context: null,
      page: null,
      setup_opened_at: null,
    };
    const out = await resolveTurn(ctx);
    if (out.kind !== "clarify") throw new Error(`expected a question, got ${out.kind}`);
    return out.question;
  }

  it("E-08 hinglish: 'kal' is कल in Devanagari speech, the days in words", async () => {
    const q = await e08("hinglish");
    expect(q.display_text).toBe("Kal matlab 26 November? Haldi abhi 13 December subah hai, kaunsi tareekh rakhun?");
    expect(q.speech_text).toBe("कल मतलब छब्बीस November? Haldi अभी तेरह December सुबह है, कौन सी तारीख़ रखूँ?");
    expect(q.speech_text).not.toMatch(/[0-9]|\bkal\b/i);
  });

  it("E-08 hi: voice.md 4.10's display, words in speech", async () => {
    const q = await e08("hi");
    expect(q.display_text).toBe("कल यानी 26 नवंबर? हल्दी अभी 13 दिसंबर सुबह है, कौन सी तारीख़ रखूँ?");
    expect(q.speech_text).toBe("कल यानी छब्बीस नवंबर? हल्दी अभी तेरह दिसंबर सुबह है, कौन सी तारीख़ रखूँ?");
  });

  it("never a money fraction word in these replies", async () => {
    for (const register of ["hi", "hinglish"] as const) {
      for (const a of [profile, sangeet]) {
        const { reply } = await saved(a, register);
        expect(reply.speech_text ?? "").not.toMatch(FRACTIONS);
      }
    }
  });
});
