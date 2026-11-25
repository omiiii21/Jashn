import { describe, expect, it } from "vitest";

import { FIXTURE_TODAY, fixtureIds, fixtureSessionActor } from "@/contracts/fixtures";

import { actionKey, resolveTurn } from "./resolve";
import { buildSnapshot } from "./snapshot";
import { joinReplies, reply, withoutRepeatedSentences } from "./templates";
import type { ResolveContext, ToolAction, ToolArguments } from "./types";

const ids = fixtureIds("demo");
const WEDDING = ids.wedding_id;

function tool(actions: ToolAction[], intent: ToolArguments["intent"] = "act", missing_fields: string[] = []): ToolArguments {
  return { intent, actions, missing_fields, reply: "", reply_language: "hinglish" };
}

async function ctxFor(args: ToolArguments, transcript: string): Promise<ResolveContext> {
  const actor = fixtureSessionActor("mira");
  const snapshot = await buildSnapshot({ actor, wedding_id: WEDDING, context: null, attached_asset_id: null, today: FIXTURE_TODAY });
  return {
    actor,
    wedding_id: WEDDING,
    tool: args,
    snapshot,
    transcript,
    register: "hinglish",
    ui_language: "en",
    writes_enabled: true,
    context: null,
    page: null,
    setup_opened_at: null,
  };
}

const LINE = "एक लाख पचास हज़ार रुपये बाकी हैं।";

describe("one line per answer: duplicate actions", () => {
  it("the same query_balance twice is one answer line and one card (live, 14:24)", async () => {
    const ask: ToolAction = { kind: "query_balance", scope: "vendor", vendor_id: "VEN-CAT" };
    const out = await resolveTurn(await ctxFor(tool([ask, { ...ask }], "ask"), "Caterer ka kitna baaki hai?"));
    expect(out.kind).toBe("answer");
    if (out.kind !== "answer") return;
    expect(out.reply.display_text).toBe(LINE);
    expect(out.reply.speech_text).toBe(LINE);
    expect(out.cards).toHaveLength(1);
  });

  it("a seed key and its UUID name the same record; a missing scope is the vendor's", async () => {
    const out = await resolveTurn(
      await ctxFor(
        tool([{ kind: "query_balance", scope: "vendor", vendor_id: "VEN-CAT" }, { kind: "query_balance", vendor_id: ids.caterer_vendor_id }], "ask"),
        "Caterer ko ab kitna dena hai?",
      ),
    );
    expect(out.kind === "answer" && out.reply.display_text).toBe(LINE);
    expect(out.kind === "answer" && out.cards).toHaveLength(1);
  });

  it("O-03's two different asks stay two (query_event + query_balance)", async () => {
    const out = await resolveTurn(
      await ctxFor(
        tool([{ kind: "query_event", event_id: "EVT-REC", detail: "venue" }, { kind: "query_balance", scope: "vendor", vendor_id: "VEN-CAT" }], "ask"),
        "Reception का venue क्या है, और caterer का कितना बाकी है?",
      ),
    );
    expect(out.kind).toBe("answer");
    if (out.kind !== "answer") return;
    expect(out.cards).toHaveLength(2);
    expect(out.reply.display_text.endsWith(LINE)).toBe(true);
    expect(out.reply.display_text).not.toBe(LINE);
  });

  it("two identical corrections are one action on the card, never two writes", async () => {
    const write: ToolAction = {
      kind: "correct_payment",
      vendor_id: "VEN-CAT",
      payment_kind: "advance",
      amount_inr: 40000,
      heard: [{ field: "amount_inr", phrase: "चालीस हज़ार" }],
    };
    const out = await resolveTurn(
      await ctxFor(tool([write, { ...write, vendor_id: ids.caterer_vendor_id, heard: [] }]), "Caterer को चालीस हज़ार advance दिया था"),
    );
    expect(out.kind).toBe("preview");
    if (out.kind !== "preview") return;
    expect(out.actions).toHaveLength(1);
    expect(out.actions[0].index).toBe(0);
    expect(out.button_label).toBe("Save correction");
    expect(out.title).toBe("Correction, not a new payment");
  });

  it("two payments of different amounts are both kept", () => {
    const a: ToolAction = { kind: "record_payment", vendor_id: "VEN-CAT", amount_inr: 40000 };
    const b: ToolAction = { kind: "record_payment", vendor_id: "VEN-CAT", amount_inr: 30000 };
    const ctx = { snapshot: { ref_map: { "VEN-CAT": ids.caterer_vendor_id } } } as unknown as Pick<ResolveContext, "snapshot">;
    expect(actionKey(a, ctx)).not.toBe(actionKey(b, ctx));
    expect(actionKey(a, ctx)).toBe(actionKey({ ...a, vendor_id: ids.caterer_vendor_id, heard: [{ field: "amount_inr", phrase: "चालीस हज़ार" }] }, ctx));
  });

  it("missing fields move with the kept actions", async () => {
    const ask: ToolAction = { kind: "query_balance", scope: "vendor", vendor_id: "VEN-CAT" };
    const out = await resolveTurn(
      await ctxFor(tool([ask, { ...ask }, { kind: "correct_payment", payment_kind: "advance" }], "act", ["2:vendor_id", "2:amount_inr"]), "advance badalna hai"),
    );
    expect(out.kind).toBe("clarify");
    if (out.kind !== "clarify") return;
    expect(out.actions.map((a) => a.index)).toEqual([0, 1]);
    expect(out.missing_fields.every((f) => !f.startsWith("2:"))).toBe(true);
  });
});

describe("one line per answer: repeated sentences", () => {
  it("joining two identical replies says it once, in display and speech", () => {
    const one = reply("hi", LINE);
    const joined = joinReplies("hi", [one, one]);
    expect(joined.display_text).toBe(LINE);
    expect(joined.speech_text).toBe(LINE);
  });

  it("different sentences are kept, and a text with no repeat is unchanged", () => {
    const value = reply("hinglish", "Reception: Lotus Hall.  एक लाख साठ हज़ार रुपये बाकी हैं।");
    expect(withoutRepeatedSentences(value)).toEqual(value);
    const twice = withoutRepeatedSentences(reply("en", "₹1.5 lakh is still owed. ₹1.5 lakh is still owed."));
    expect(twice.display_text).toBe("₹1.5 lakh is still owed.");
  });
});
