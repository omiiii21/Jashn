import { describe, expect, it } from "vitest";

import { fixtureIds, fixtureSessionActor } from "@/contracts/fixtures";

import { resolveTurn, soleAmount } from "./resolve";
import { buildSnapshot } from "./snapshot";
import { cleanToolArguments } from "./tool-schema";
import type { ToolArguments } from "./types";

const TRANSCRIPT = "Caterer ko chaalis hazaar advance diya tha.";

// The live sarvam-105b tool calls for M-03 (LIVE #2) on 25 Nov 2026, captured at 15:38 IST.
const NO_AMOUNT: ToolArguments = {
  intent: "act",
  actions: [{ kind: "correct_payment", vendor_id: "VEN-CAT", payment_kind: "advance", previous_inr: 50000, heard: [{ field: "previous_inr", phrase: "chaalis hazaar" }] }],
  missing_fields: [],
  reply: "The caterer's advance has been corrected to forty thousand rupees.",
  reply_language: "hinglish",
};
const OTHER_SCRIPT_AND_SIBLING: ToolArguments = {
  intent: "act",
  actions: [
    { kind: "correct_payment", vendor_id: "VEN-CAT", payment_kind: "advance", previous_inr: 50000, user_claim_inr: 40000, heard: [{ field: "previous_inr", phrase: "चालीस hazaar" }, { field: "user_claim_inr", phrase: "चालीस hazaar" }] },
    { kind: "query_balance", scope: "vendor", user_claim_inr: 40000, date_text: "25 Nov 2026", heard: [{ field: "user_claim_inr", phrase: "चालीस hazaar" }] },
  ],
  missing_fields: [],
  reply: "The app will check and update the advance payment for the caterer.",
  reply_language: "hinglish",
};
const SIBLING_CLAIM: ToolArguments = {
  intent: "act",
  actions: [
    { kind: "correct_payment", vendor_id: "VEN-CAT", payment_kind: "advance", previous_inr: 50000, user_claim_inr: 40000, heard: [{ field: "previous_inr", phrase: "₹50,000" }, { field: "user_claim_inr", phrase: "chaalis hazaar" }] },
    { kind: "query_balance", scope: "vendor", user_claim_inr: 40000, heard: [{ field: "user_claim_inr", phrase: "chaalis hazaar" }] },
  ],
  missing_fields: [],
  reply: "Aapne caterer ko chaalis hazaar advance diya tha.",
  reply_language: "hinglish",
};

const SPLIT_INTO_A_NEW_PAYMENT: ToolArguments = {
  intent: "act",
  actions: [
    { kind: "correct_payment", vendor_id: "VEN-CAT", payment_kind: "advance", previous_inr: 50000, heard: [{ field: "previous_inr", phrase: "चालीस हज़ार" }, { field: "payment_kind", phrase: "advance" }] },
    { kind: "record_payment", vendor_id: "VEN-CAT", amount_inr: 40000, payment_kind: "advance", note: "Caterer ko advance diya gaya", heard: [{ field: "amount_inr", phrase: "चालीस हज़ार" }, { field: "payment_kind", phrase: "advance" }] },
  ],
  missing_fields: [],
  reply: "Caterer ko advance chaalis hazaar diya gaya hai.",
  reply_language: "hinglish",
};

const CORRECTED_TWICE: ToolArguments = {
  intent: "act",
  actions: [
    { kind: "correct_payment", vendor_id: "VEN-CAT", payment_id: "PAY-01", previous_inr: 50000, user_claim_inr: 40000, heard: [{ field: "previous_inr", phrase: "pachaas hazaar" }, { field: "user_claim_inr", phrase: "chaalis hazaar" }] },
    { kind: "correct_payment", vendor_id: "VEN-CAT", payment_id: "PAY-01", payment_kind: "advance", method: "upi", note: "Caterer advance corrected from 50000 to 40000", heard: [{ field: "payment_kind", phrase: "advance" }, { field: "method", phrase: "upi" }] },
  ],
  missing_fields: [],
  reply: "Caterer ka advance sahi kar diya.",
  reply_language: "hinglish",
};

describe("soleAmount", () => {
  it("reads the one amount a sentence says", () => {
    expect(soleAmount(TRANSCRIPT, null)).toEqual({ value: 40000, phrase: "chaalis hazaar" });
    expect(soleAmount("Caterer को 40,000 advance दिया था।", null)).toEqual({ value: 40000, phrase: "40,000" });
    expect(soleAmount("Caterer ko चालीस हज़ार advance diya tha", null)?.value).toBe(40000);
  });
  it("leaves out the old amount, and gives up on two different amounts or none", () => {
    expect(soleAmount("pachaas hazaar nahi, chaalis hazaar diya tha", 50000)?.value).toBe(40000);
    expect(soleAmount("bees hazaar aur tees hazaar diye", null)).toBeNull();
    expect(soleAmount("Caterer ko advance diya tha", null)).toBeNull();
  });
});

describe("M-03 from the live tool calls", () => {
  it("gives one correction card when the same payment is corrected twice", async () => {
    const actor = { ...fixtureSessionActor("mira", "demo"), wedding_id: fixtureIds("demo").wedding_id };
    const snapshot = await buildSnapshot({ actor, wedding_id: actor.wedding_id, context: null, attached_asset_id: null });
    const outcome = await resolveTurn({ actor, wedding_id: actor.wedding_id, tool: cleanToolArguments(structuredClone(CORRECTED_TWICE)), snapshot, transcript: "Caterer ka advance pachaas hazaar nahi, chaalis hazaar tha.", register: "hinglish", ui_language: "en", writes_enabled: true, context: null, page: null, setup_opened_at: null });
    expect(outcome.kind).toBe("preview");
    if (outcome.kind !== "preview") return;
    expect(outcome.actions).toHaveLength(1);
    expect(outcome.actions[0].input.amount_inr).toBe(40000);
  });

  for (const [name, tool] of [["no amount", NO_AMOUNT], ["heard words in another script, and a sibling claim", OTHER_SCRIPT_AND_SIBLING], ["a sibling claim", SIBLING_CLAIM], ["a correction split into a new payment", SPLIT_INTO_A_NEW_PAYMENT]] as const) {
    it(`gives the correction card for ${name}`, async () => {
      const actor = { ...fixtureSessionActor("mira", "demo"), wedding_id: fixtureIds("demo").wedding_id };
      const snapshot = await buildSnapshot({ actor, wedding_id: actor.wedding_id, context: null, attached_asset_id: null });
      const outcome = await resolveTurn({
        actor,
        wedding_id: actor.wedding_id,
        tool: cleanToolArguments(structuredClone(tool)),
        snapshot,
        transcript: TRANSCRIPT,
        register: "hinglish",
        ui_language: "en",
        writes_enabled: true,
        context: null,
        page: null,
        setup_opened_at: null,
      });
      expect(outcome.kind).toBe("preview");
      if (outcome.kind !== "preview") return;
      expect(outcome.title).toBe("Correction, not a new payment");
      expect(outcome.confirm_enabled).toBe(true);
      expect(outcome.actions).toHaveLength(1);
      expect(outcome.actions[0].command).toBe("correct_payment");
      expect(outcome.actions[0].input.amount_inr).toBe(40000);
      expect(outcome.reply.display_text).not.toMatch(/baaki hai/);
    });
  }
});
