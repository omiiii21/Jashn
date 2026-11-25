import { describe, expect, it } from "vitest";

import { FIXTURE_TODAY, fixtureIds, fixtureSessionActor, type FixturePerson } from "@/contracts/fixtures";
import type { ActivityFeed, Itinerary, MoneySummary, WeddingNotes } from "@/contracts/read-models";
import { fixtureServices, type Services } from "@/contracts/services";

import { confirmedReply, prefillFor, applyEdits } from "./confirm-reply";
import { mergeOption, resolveTurn } from "./resolve";
import { buildSnapshot } from "./snapshot";
import { fixedReply, type FixedReplyKey } from "./templates";
import type { ReplyRegister } from "@/contracts/api";
import type { ResolveContext, ToolAction, ToolArguments } from "./types";

const ids = fixtureIds("demo");
const WEDDING = ids.wedding_id;

function tool(actions: ToolAction[], intent: ToolArguments["intent"] = "act", missing_fields: string[] = []): ToolArguments {
  return { intent, actions, missing_fields, reply: "", reply_language: "hinglish" };
}

async function ctxFor(
  args: ToolArguments,
  transcript: string,
  opts: { person?: FixturePerson; register?: ReplyRegister; writes?: boolean; services?: Services } = {},
): Promise<ResolveContext> {
  const actor = fixtureSessionActor(opts.person ?? "mira");
  const snapshot = await buildSnapshot(
    { actor, wedding_id: WEDDING, context: null, attached_asset_id: null, today: FIXTURE_TODAY },
    opts.services ? { services: opts.services } : undefined,
  );
  return {
    actor,
    wedding_id: WEDDING,
    tool: args,
    snapshot,
    transcript,
    register: opts.register ?? "hinglish",
    ui_language: "en",
    writes_enabled: opts.writes ?? true,
    context: null,
    page: null,
    setup_opened_at: null,
  };
}

/** Fixture services with some read models swapped (later demo states). */
function servicesWith(patch: (name: string, value: unknown) => unknown): Services {
  return {
    ...fixtureServices,
    async read(name, request) {
      const value = await fixtureServices.read(name, request);
      return patch(name, structuredClone(value)) as never;
    },
  };
}

/** D4-ish: the reception at Lotus Hall (published), the caterer owing ₹1,60,000. */
const d4 = servicesWith((name, value) => {
  if (name === "itinerary") {
    const it = value as Itinerary;
    const lotus = it.venues.find((v) => v.name === "Lotus Hall")!;
    for (const fn of it.functions) {
      if (fn.event_kind !== "reception") continue;
      fn.venue_id = lotus.venue_id;
      fn.venue = { venue_id: lotus.venue_id, name: "Lotus Hall", place_name: lotus.place_name, locality: null, address: null, capacity: lotus.capacity, map_url: null };
      if (fn.published?.venue) fn.published.venue = { ...fn.published.venue, venue_id: lotus.venue_id, name: "Lotus Hall" };
    }
    return it;
  }
  if (name === "money_summary") {
    const money = value as MoneySummary;
    for (const row of money.vendors ?? []) {
      if (row.seed_key === "VEN-CAT") {
        row.paid_inr = 40_000;
        row.outstanding_inr = 160_000;
      }
    }
    return money;
  }
  return value;
});

describe("the live 8", () => {
  it("O-01: the caterer's balance, the fixed Hindi line and a highlighted card", async () => {
    const ctx = await ctxFor(tool([{ kind: "query_balance", scope: "vendor", vendor_id: "VEN-CAT" }], "ask"), "Caterer को अब कितना देना है?");
    const out = await resolveTurn(ctx);
    expect(out.kind).toBe("answer");
    if (out.kind !== "answer") return;
    expect(out.reply.display_text).toBe("एक लाख पचास हज़ार रुपये बाकी हैं।");
    expect(out.reply.speech_text).toBe("एक लाख पचास हज़ार रुपये बाकी हैं।");
    expect(out.cards).toHaveLength(1);
    expect(out.cards[0].title).toBe("Still owed to Annapoorna Caterers");
    expect(out.cards[0].figure).toBe("₹1,50,000");
    expect(out.cards[0].link).toContain(`vendor_id=${ids.caterer_vendor_id}`);
    expect(out.cards[0].link).toContain("highlight=outstanding_inr");
  });

  it("O-01 also resolves the role word 'caterer'", async () => {
    const ctx = await ctxFor(tool([{ kind: "query_balance", scope: "vendor", vendor_id: "caterer" }], "ask"), "Caterer को अब कितना देना है?");
    const out = await resolveTurn(ctx);
    expect(out.kind === "answer" && out.reply.display_text).toBe("एक लाख पचास हज़ार रुपये बाकी हैं।");
  });

  it("M-03: a correction card for PAY-01, silent, with the server-filled version", async () => {
    for (const [transcript, phrase] of [
      ["Caterer को चालीस हज़ार advance दिया था", "चालीस हज़ार"],
      ["Caterer को 40000 advance दिया था", "40000"],
    ]) {
      const ctx = await ctxFor(
        tool([{ kind: "correct_payment", vendor_id: "VEN-CAT", payment_kind: "advance", amount_inr: 40000, heard: [{ field: "amount_inr", phrase }] }]),
        transcript,
      );
      const out = await resolveTurn(ctx);
      expect(out.kind, transcript).toBe("preview");
      if (out.kind !== "preview") return;
      expect(out.title).toBe("Correction, not a new payment");
      expect(out.button_label).toBe("Save correction");
      expect(out.confirm_enabled).toBe(true);
      expect(out.reply.speech_text).toBeNull();
      expect(out.reply.display_text).toBe("Correction, not a new payment: ₹50,000 → ₹40,000.");
      const action = out.actions[0];
      expect(action.command).toBe("correct_payment");
      expect(action.entity_ref).toBe("PAY-01");
      expect(action.input).toMatchObject({ payment_id: ids.advance_payment_id, expected_version: 1, amount_inr: 40000, change_reason: "Advance was ₹40,000, not ₹50,000." });
      const amount = action.preview.fields.find((f) => f.field === "amount_inr")!;
      expect(amount).toMatchObject({ old: "₹50,000", new: "₹40,000", heard: phrase, state: "ok" });
      expect(action.preview.after_saving).toEqual([{ label: "Still owed", old: "₹1,50,000", new: "₹1,60,000" }]);
    }
  });

  it("M-03: a number that doesn't re-read becomes a question with the code's reading", async () => {
    const ctx = await ctxFor(
      tool([{ kind: "correct_payment", vendor_id: "VEN-CAT", amount_inr: 45000, heard: [{ field: "amount_inr", phrase: "चालीस हज़ार" }] }]),
      "Caterer को चालीस हज़ार advance दिया था",
    );
    const out = await resolveTurn(ctx);
    expect(out.kind).toBe("clarify");
    if (out.kind !== "clarify") return;
    expect(out.question.display_text).toBe("₹40,000 sahi hai? Maine 'चालीस हज़ार' suna.");
    expect(out.options?.[0]).toMatchObject({ label: "₹40,000", default: true });
  });

  it("C-01: the reply after the correction comes from vendor_totals", async () => {
    const ctx = await ctxFor(
      tool([{ kind: "correct_payment", vendor_id: "VEN-CAT", payment_kind: "advance", amount_inr: 40000, heard: [{ field: "amount_inr", phrase: "चालीस हज़ार" }] }]),
      "Caterer को चालीस हज़ार advance दिया था",
    );
    const out = await resolveTurn(ctx);
    if (out.kind !== "preview") throw new Error("expected a preview");
    const built = await confirmedReply({
      actor: ctx.actor,
      wedding_id: WEDDING,
      actions: out.actions,
      results: [{ index: 0, command: "correct_payment", outcome: "applied", idempotency_key: "t:0", entity_ref: "PAY-01", activity_entry_id: null, vendor_totals: { committed_inr: 200000, paid_inr: 40000, outstanding_inr: 160000 } }],
      register: "hinglish",
      partial: null,
    });
    expect(built.reply.display_text).toBe("एक लाख साठ हज़ार रुपये बाकी हैं।");
    expect(built.reply.speech_text).toBe("एक लाख साठ हज़ार रुपये बाकी हैं।");
    expect(built.navigate_path).toBe(`/w/${WEDDING}/vendors?vendor_id=${ids.caterer_vendor_id}&highlight=outstanding_inr`);
    const en = await confirmedReply({ actor: ctx.actor, wedding_id: WEDDING, actions: out.actions, results: [{ index: 0, command: "correct_payment", outcome: "applied", idempotency_key: "t:0", entity_ref: "PAY-01", activity_entry_id: null, vendor_totals: { committed_inr: 200000, paid_inr: 40000, outstanding_inr: 160000 } }], register: "en", partial: null });
    expect(en.reply.display_text).toBe("Corrected the caterer's advance to ₹40,000. ₹1,60,000 is outstanding.");
  });

  it("E-04: Diya moves the reception to Lotus Hall in the draft", async () => {
    const ctx = await ctxFor(tool([{ kind: "update_event", event_id: "EVT-REC", venue_name: "Lotus Hall" }]), "Reception Lotus Hall में shift कर दो", { person: "diya" });
    const out = await resolveTurn(ctx);
    expect(out.kind).toBe("preview");
    if (out.kind !== "preview") return;
    expect(out.button_label).toBe("Save draft");
    expect(out.confirm_enabled).toBe(true);
    expect(out.actions[0].command).toBe("update_event");
    expect(out.actions[0].input).toMatchObject({ event_id: ids.reception_event_id, venue_id: ids.lotus_venue_id });
    expect(typeof out.actions[0].input.expected_version).toBe("number");
    const venue = out.actions[0].preview.fields[0];
    expect(venue.old).toBe("Banyan Hall");
    expect(venue.new).toContain("Lotus Hall");
    const lines = out.actions[0].preview.after_saving.map((row) => row.label);
    expect(lines).toContain("Guests still see Banyan Hall until an owner publishes.");
    const built = await confirmedReply({ actor: ctx.actor, wedding_id: WEDDING, actions: out.actions, results: [{ index: 0, command: "update_event", outcome: "applied", idempotency_key: "t:0", entity_ref: "EVT-REC", activity_entry_id: null }], register: "hinglish", partial: null });
    expect(built.reply.display_text).toBe("Draft mein reception ab Lotus Hall mein hai. Guests ko publish ke baad dikhega.");
    expect(built.reply.speech_text).toBe("Draft में reception अब Lotus Hall में है। Guests को publish के बाद दिखेगा।");
    expect(built.navigate_path).toContain("highlight=venue");
  });

  it("O-02: what Diya changed, the latest entry", async () => {
    const services = servicesWith((name, value) => {
      if (name !== "activity_feed") return value;
      const feed = value as ActivityFeed;
      feed.entries = [
        {
          id: "00000000-0000-4000-8000-000000000007",
          seed_key: "ACT-07",
          seq: 7,
          occurred_at: "2026-11-25T15:14:00+05:30",
          actor_type: "member",
          actor_label: "Diya",
          command: "update_event",
          topic: "event.updated",
          entity_type: "event",
          entity_id: ids.reception_event_id,
          summary_en: "Diya moved the reception from Banyan Hall to Lotus Hall.",
          summary_hi: "Diya ने रिसेप्शन का स्थान Banyan Hall से बदलकर Lotus Hall किया।",
          before: { venue_name: "Banyan Hall" },
          after: { venue_name: "Lotus Hall" },
          source: "voice",
          voice_turn_id: null,
          spoken_text: null,
          proposal_id: null,
          awaiting_publish: true,
        },
      ];
      return feed;
    });
    const ctx = await ctxFor(tool([{ kind: "query_changes", actor_member_id: "MEM-DIYA", latest: true }], "ask"), "Diya ने क्या बदला?", { services });
    const out = await resolveTurn(ctx, { services });
    expect(out.kind).toBe("answer");
    if (out.kind !== "answer") return;
    expect(out.reply.display_text).toBe("Diya ne reception Banyan Hall se Lotus Hall mein shift kiya. Yeh abhi draft hai, guests ko Banyan Hall hi dikh raha hai.");
    expect(out.reply.speech_text).toBe("Diya ने reception Banyan Hall से Lotus Hall में shift किया। यह अभी draft है, guests को Banyan Hall ही दिख रहा है।");
    expect(out.cards).toHaveLength(1);
  });

  it("E-05: publish alone; nothing new at D0; Publish revision 3 with a draft change", async () => {
    const d0 = await resolveTurn(await ctxFor(tool([{ kind: "publish_itinerary" }]), "Schedule publish कर दो"));
    expect(d0.kind).toBe("answer");
    const services = servicesWith((name, value) => {
      if (name !== "itinerary") return value;
      const it = value as Itinerary;
      it.unpublished_changes = [{ entity: "event", entity_id: ids.reception_event_id, field: "venue_name", published_value: "Banyan Hall", draft_value: "Lotus Hall", changed_by: "Diya", changed_at: null }];
      it.draft_version = 7;
      it.published_revision = 2;
      return it;
    });
    const ctx = await ctxFor(tool([{ kind: "publish_itinerary" }]), "Schedule publish कर दो", { services });
    const out = await resolveTurn(ctx, { services });
    expect(out.kind).toBe("preview");
    if (out.kind !== "preview") return;
    expect(out.title).toBe("Publish revision 3");
    expect(out.button_label).toBe("Publish revision 3");
    expect(out.actions[0].input).toEqual({ expected_draft_version: 7 });
    const built = await confirmedReply({ actor: ctx.actor, wedding_id: WEDDING, actions: out.actions, results: [{ index: 0, command: "publish_itinerary", outcome: "applied", idempotency_key: "t:0", entity_ref: null, activity_entry_id: null }], register: "hinglish", partial: null });
    expect(built.reply.display_text).toBe("Schedule publish ho gaya. Guests ko ab Lotus Hall dikhega.");
    expect(built.reply.speech_text).toBe("Schedule publish हो गया। Guests को अब Lotus Hall दिखेगा।");
    expect(built.navigate_path).toBe(`/w/${WEDDING}/events`);
  });

  it("V11: publishing with another action is a question with nothing to confirm", async () => {
    const ctx = await ctxFor(tool([{ kind: "publish_itinerary" }, { kind: "update_event", event_id: "EVT-REC", venue_name: "Lotus Hall" }]), "Reception Lotus Hall karo aur publish kar do");
    const out = await resolveTurn(ctx);
    expect(out.kind).toBe("clarify");
    if (out.kind !== "clarify") return;
    expect(out.actions).toEqual([]);
    expect(out.question.display_text).toBe("Ek baar mein ek kaam: publish alag se kijiye.");
  });

  it("O-03: two questions, two cards, one combined reply (demo-data §14 at D4)", async () => {
    const ctx = await ctxFor(
      tool([{ kind: "query_event", event_id: "EVT-REC", detail: "venue" }, { kind: "query_balance", scope: "vendor", vendor_id: "VEN-CAT" }], "ask"),
      "Reception का venue क्या है, और caterer का कितना बाकी है?",
      { services: d4 },
    );
    const out = await resolveTurn(ctx, { services: d4 });
    expect(out.kind).toBe("answer");
    if (out.kind !== "answer") return;
    expect(out.cards).toHaveLength(2);
    expect(out.reply.display_text).toBe("Reception: Lotus Hall. एक लाख साठ हज़ार रुपये बाकी हैं।");
    expect(out.reply.speech_text).toBe("Reception: Lotus Hall. एक लाख साठ हज़ार रुपये बाकी हैं।");
  });

  it("R-03: voice writes off: refused early with the fixed line and the prefill", async () => {
    const ctx = await ctxFor(
      tool([{ kind: "add_requirement", event_id: "EVT-REC", text: "Jain food", quantity: 12, requirement_category: "catering", heard: [{ field: "quantity", phrase: "बारह" }] }]),
      "Reception में बारह लोगों के लिए Jain खाना add करो",
      { writes: false },
    );
    const out = await resolveTurn(ctx);
    expect(out.kind).toBe("refused");
    if (out.kind !== "refused") return;
    expect(out.code).toBe("voice_writes_paused");
    expect(out.reply.display_text).toBe("Abhi voice se badlav band hain. Aap type karke save kar sakte hain.");
    expect(out.reply.speech_text).toBe("अभी voice से बदलाव बंद हैं। आप type करके save कर सकते हैं।");
    expect(out.prefill).toHaveLength(1);
    expect(out.prefill[0].command).toBe("add_requirement");
    expect(out.prefill[0].input).toEqual({ event_id: ids.reception_event_id, text: "Jain food", quantity: 12, requirement_category: "catering", vendor_id: ids.caterer_vendor_id });
    expect(out.prefill[0].labels).toMatchObject({ event_id: "Function", text: "What's needed", quantity: "How many", requirement_category: "Category", vendor_id: "Vendor" });
    expect(prefillFor(out.actions)).toEqual(out.prefill);
  });

  it("R-03 with writes on: a requirement card with the suggested caterer", async () => {
    const ctx = await ctxFor(
      tool([{ kind: "add_requirement", event_id: "EVT-REC", text: "Jain food", quantity: 12, requirement_category: "catering", heard: [{ field: "quantity", phrase: "बारह" }] }]),
      "Reception में बारह लोगों के लिए Jain खाना add करो",
    );
    const out = await resolveTurn(ctx);
    expect(out.kind).toBe("preview");
    if (out.kind !== "preview") return;
    expect(out.button_label).toBe("Save requirement");
    expect(out.actions[0].preview.fields.find((f) => f.field === "vendor_id")?.new).toBe("Annapoorna Caterers (suggested)");
  });
});

describe("role refusals and manager limits", () => {
  it("E-06: a manager's publish is forbidden", async () => {
    const ctx = await ctxFor(tool([{ kind: "publish_itinerary" }]), "Schedule publish kar do.", { person: "diya" });
    const out = await resolveTurn(ctx);
    expect(out.kind).toBe("refused");
    if (out.kind !== "refused") return;
    expect(out.code).toBe("forbidden");
    expect(out.reply.display_text).toBe("Publish sirf Mira ya Kabir kar sakte hain. Aapka badlav draft mein safe hai.");
  });

  it("M-14: budget and shagun questions from a manager are not shared, joined into one line", async () => {
    const ctx = await ctxFor(tool([{ kind: "query_budget" }, { kind: "query_shagun" }], "ask"), "What's our total budget, and how much shagun came in?", { person: "diya", register: "en" });
    const out = await resolveTurn(ctx);
    expect(out.kind).toBe("refused");
    if (out.kind !== "refused") return;
    expect(out.code).toBe("not_shared");
    expect(out.reply.display_text).toBe("The budget and the Shagun register haven't been shared with you. I can help with vendor dues.");
    expect(out.prefill).toEqual([]);
  });

  it("M-12: a manager's payment goes as propose_change while vendor dues are shared", async () => {
    const ctx = await ctxFor(
      tool([{ kind: "record_payment", vendor_id: "VEN-DEC", amount_inr: 20000, heard: [{ field: "amount_inr", phrase: "bees hazaar" }] }]),
      "Decorator ko bees hazaar de diye.",
      { person: "diya" },
    );
    const out = await resolveTurn(ctx);
    expect(out.kind).toBe("preview");
    if (out.kind !== "preview") return;
    expect(out.title).toBe("Payment, sent for approval");
    expect(out.button_label).toBe("Send for approval");
    expect(out.actions[0].command).toBe("propose_change");
    expect(out.actions[0].input).toMatchObject({ command: "record_payment", input: { amount_inr: 20000 } });
    expect(prefillFor(out.actions)[0].command).toBe("record_payment");
  });

  it("A manager's A1 command without vendor-dues sharing is not shared", async () => {
    const services = servicesWith((name, value) => {
      if (name !== "money_summary") return value;
      const money = value as MoneySummary;
      delete money.vendors;
      money.hidden = [...money.hidden, "vendor_money"];
      return money;
    });
    const ctx = await ctxFor(
      tool([{ kind: "record_payment", vendor_id: "VEN-DEC", amount_inr: 20000, heard: [{ field: "amount_inr", phrase: "bees hazaar" }] }]),
      "Decorator ko bees hazaar de diye.",
      { person: "diya", services, register: "en" },
    );
    const out = await resolveTurn(ctx, { services });
    expect(out.kind).toBe("refused");
    if (out.kind !== "refused") return;
    expect(out.code).toBe("not_shared");
    expect(out.reply.display_text).toBe("Vendor payments haven't been shared with you.");
  });

  it("A manager's add_guest with invitations or plus-ones is forbidden", async () => {
    for (const extra of [{ event_ids: ["EVT-REC"] }, { max_plus_ones: 1 }]) {
      const ctx = await ctxFor(tool([{ kind: "add_guest", full_name: "Asha Rao", ...extra }]), "Asha Rao ko add karo", { person: "diya", register: "en" });
      const out = await resolveTurn(ctx);
      expect(out.kind).toBe("refused");
      if (out.kind !== "refused") return;
      expect(out.code).toBe("forbidden");
      expect(out.reply.display_text).toBe("Only Mira or Kabir can invite guests to functions.");
    }
  });

  it("More than 4 actions asks for one or two things at a time", async () => {
    // Five different asks: the same ask repeated is one action (a duplicate, not a structure error).
    const many: ToolAction[] = [
      { kind: "query_balance", vendor_id: "VEN-CAT" },
      { kind: "query_event", event_id: "EVT-REC", detail: "venue" },
      { kind: "query_event", event_id: "EVT-SAN", detail: "time" },
      { kind: "query_rsvp", event_id: "EVT-REC" },
      { kind: "query_catering", vendor_id: "VEN-CAT" },
    ];
    const out = await resolveTurn(await ctxFor(tool(many, "ask"), "lots", { register: "en" }));
    expect(out.kind === "clarify" && out.question.display_text).toBe("One or two things at a time, please.");
  });

  it("M-05: a correction with no vendor asks which vendor, one option each", async () => {
    const ctx = await ctxFor(tool([{ kind: "correct_payment", payment_kind: "advance", amount_inr: 40000, heard: [{ field: "amount_inr", phrase: "chaalis hazaar" }] }]), "Advance chaalis hazaar tha.");
    const out = await resolveTurn(ctx);
    expect(out.kind).toBe("clarify");
    if (out.kind !== "clarify") return;
    expect(out.question.display_text).toBe("Kis vendor ka advance? Caterer, venue, decorator, photographer, mehendi artist ya DJ?");
    expect(out.options).toHaveLength(6);
    const merged = mergeOption({ actions: out.actions, options: out.options as never, intent: "act", reply_language: "hinglish", missing_fields: out.missing_fields }, "o1");
    expect(merged?.actions[0].vendor_id).toBe("VEN-CAT");
  });
});

describe("references read from the transcript (2.5, V5)", () => {
  it("O-01 with no vendor_id: the role word in the transcript names the caterer", async () => {
    const ctx = await ctxFor(tool([{ kind: "query_balance", scope: "vendor" }], "ask", ["vendor_id"]), "Caterer को अब कितना देना है?");
    const out = await resolveTurn(ctx);
    expect(out.kind).toBe("answer");
    if (out.kind !== "answer") return;
    expect(out.reply.display_text).toBe("एक लाख पचास हज़ार रुपये बाकी हैं।");
    expect(out.cards[0].link).toContain(`vendor_id=${ids.caterer_vendor_id}`);
  });

  it("O-03 with no references: 'venue' is the function's, 'caterer' the vendor", async () => {
    const ctx = await ctxFor(tool([{ kind: "query_event", detail: "venue" }, { kind: "query_balance" }], "ask"), "Reception का venue क्या है, और caterer का कितना बाकी है?");
    const out = await resolveTurn(ctx);
    expect(out.kind).toBe("answer");
    if (out.kind !== "answer") return;
    expect(out.cards).toHaveLength(2);
    expect(out.cards[0].title).toBe("Reception venue");
    expect(out.cards[1].title).toBe("Still owed to Annapoorna Caterers");
  });

  it("M-05 stays a question: no role word, no guess", async () => {
    const ctx = await ctxFor(tool([{ kind: "correct_payment", payment_kind: "advance", amount_inr: 40000, heard: [{ field: "amount_inr", phrase: "chaalis hazaar" }] }]), "Advance chaalis hazaar tha.");
    const out = await resolveTurn(ctx);
    expect(out.kind).toBe("clarify");
  });

  it("a whole-wedding balance is never narrowed to a vendor", async () => {
    const ctx = await ctxFor(tool([{ kind: "query_balance", scope: "wedding" }], "ask"), "Caterer aur baaki sab milake kul kitna baaki hai?");
    const out = await resolveTurn(ctx);
    expect(out.kind).toBe("answer");
    if (out.kind !== "answer") return;
    expect(out.cards[0].title).not.toContain("Annapoorna");
  });
});

describe("fixed replies", () => {
  const KEYS: FixedReplyKey[] = ["already_saved", "nothing_to_confirm", "cancelled", "nothing_to_cancel", "voice_writes_paused", "replaced", "publish_alone", "cant_by_voice", "no_context", "no_context_rest", "too_many_actions", "request_closed", "expired", "no_speech", "stt_failed", "llm_failed", "too_long"];
  it("has every key in every register", () => {
    for (const key of KEYS) for (const r of ["en", "hinglish", "hi"] as const) expect(fixedReply(key, r).display_text.length, `${key} ${r}`).toBeGreaterThan(0);
  });
  it("C-02's cancel line", () => {
    expect(fixedReply("cancelled", "hi").display_text).toBe("ठीक है, कुछ नहीं बदला।");
    expect(fixedReply("cancelled", "hinglish").display_text).toBe("ठीक है, कुछ नहीं बदला।");
    expect(fixedReply("cancelled", "en").display_text).toBe("OK, nothing was changed.");
  });
});

describe("questions the plan doesn't answer", () => {
  const withReply = (args: ToolArguments, text: string): ToolArguments => ({ ...args, reply: text });

  it("an out-of-plan question gets the fixed line, never the model's guess", async () => {
    const args = withReply(tool([], "ask", ["context"]), "Parking is behind the main gate");
    const out = await resolveTurn(await ctxFor(args, "Venue पर parking कितनी गाड़ियों की है?"));
    expect(out.kind).toBe("clarify");
    if (out.kind !== "clarify") return;
    expect(out.question).toEqual(fixedReply("no_context", "hinglish"));
    expect(out.question.display_text).not.toContain("gate");
    expect(out.actions).toEqual([]);
  });

  it("an ask with no matching kind is the same line, in English too", async () => {
    const args = withReply(tool([], "ask"), "It will be sunny that day.");
    const out = await resolveTurn(await ctxFor(args, "What will the weather be on the wedding day?", { register: "en" }));
    if (out.kind !== "clarify") throw new Error("expected a question back");
    expect(out.question.display_text).toBe("I don't have that in your plan yet, so I won't guess. Tell me and I'll save it as a note.");
    expect(out.missing_fields).toEqual(["context"]);
  });

  it("a question the model calls clarify, with nothing missing, is still not guessed", async () => {
    const out = await resolveTurn(await ctxFor(tool([], "clarify"), "Where will the guests park?", { register: "en" }));
    if (out.kind !== "clarify") throw new Error("expected a question back");
    expect(out.question).toEqual(fixedReply("no_context", "en"));
  });

  it("a request phrased as a question stays 'can't do that by voice'", async () => {
    const out = await resolveTurn(await ctxFor(tool([], "clarify"), "Can you send the invite to Tara on WhatsApp?", { register: "en" }));
    if (out.kind !== "clarify") throw new Error("expected a question back");
    expect(out.question).toEqual(fixedReply("cant_by_voice", "en"));
  });

  it("a question half in the plan answers that half and says the rest isn't there", async () => {
    const args = tool([{ kind: "query_event", event_id: "EVT-SAN", detail: "time" }], "ask", ["context"]);
    const out = await resolveTurn(await ctxFor(args, "Sangeet kab hai, aur ghodi kaun la raha hai?"));
    if (out.kind !== "answer") throw new Error("expected an answer");
    expect(out.reply.display_text.endsWith(fixedReply("no_context_rest", "hinglish").display_text)).toBe(true);
    expect(out.cards.length).toBeGreaterThan(0);
  });

  it("the model's words are kept only as a question back about a missing field", async () => {
    const asked = await resolveTurn(await ctxFor(withReply(tool([], "act", ["vendor_id"]), "Kis vendor ki baat hai?"), "Advance de diya"));
    if (asked.kind !== "clarify") throw new Error("expected a question back");
    expect(asked.question.display_text).toBe("Kis vendor ki baat hai?");
    expect(asked.missing_fields).toEqual(["vendor_id"]);

    const stated = await resolveTurn(await ctxFor(withReply(tool([], "act", ["vendor_id"]), "DJ ka advance ho gaya."), "Advance de diya"));
    if (stated.kind !== "clarify") throw new Error("expected a question back");
    expect(stated.question.display_text).not.toContain("DJ");
  });
});

describe("notes (add_note, query_note)", () => {
  const PARKING = "Valet parking है, सौ गाड़ियों की";
  const withNotes = servicesWith((name, value) => {
    if (name !== "wedding_notes") return value;
    const notes = value as WeddingNotes;
    notes.notes = [
      { note_id: "00000000-0000-4000-8000-0000000000a1", seed_key: null, topic: "parking", note_text: PARKING, created_at: "2026-11-25T12:00:00.000Z", created_by_name: "Mira" },
    ];
    return notes;
  });

  it("add_note is a review card with the topic and the words as said, then a short saved line", async () => {
    const ctx = await ctxFor(tool([{ kind: "add_note", topic: "parking", note_text: PARKING }]), PARKING);
    const out = await resolveTurn(ctx);
    if (out.kind !== "preview") throw new Error(`expected a preview, got ${out.kind}`);
    expect(out.button_label).toBe("Save note");
    expect(out.confirm_enabled).toBe(true);
    expect(out.actions[0].command).toBe("add_note");
    expect(out.actions[0].input).toEqual({ topic: "parking", note_text: PARKING });
    const built = await confirmedReply({ actor: ctx.actor, wedding_id: WEDDING, actions: out.actions, results: [{ index: 0, command: "add_note", outcome: "applied", idempotency_key: "t:0", entity_ref: null, activity_entry_id: null }], register: "en", partial: null });
    expect(built.reply.display_text).toBe("Saved the note about parking. I'll answer from it next time.");
    expect(built.navigate_path).toBeNull();
  });

  it("an add_note with no text asks for it", async () => {
    const out = await resolveTurn(await ctxFor(tool([{ kind: "add_note", topic: "parking" }]), "Parking note kar lo"));
    expect(out.kind).toBe("clarify");
  });

  it("the snapshot lists saved notes, and query_note answers with the note word for word", async () => {
    const ctx = await ctxFor(tool([]), "Parking ka kya scene hai?", { services: withNotes });
    expect(ctx.snapshot.text).toContain(`Notes the planner saved, newest first (reference | topic | text):\nNOTE-L1 | parking | ${PARKING}`);
    const out = await resolveTurn({ ...ctx, tool: tool([{ kind: "query_note", note_id: "NOTE-L1" }], "ask") }, { services: withNotes });
    if (out.kind !== "answer") throw new Error(`expected an answer, got ${out.kind}`);
    expect(out.cards[0]).toEqual({ title: "Note: parking", figure: PARKING, link: null });
    expect(out.reply.display_text).toBe(`Aapke notes mein: ${PARKING}`);
  });

  it("query_note finds a note by its topic when the reference is missing", async () => {
    const ctx = await ctxFor(tool([{ kind: "query_note", topic: "Parking" }], "ask"), "Parking?", { services: withNotes, register: "en" });
    const out = await resolveTurn(ctx, { services: withNotes });
    if (out.kind !== "answer") throw new Error(`expected an answer, got ${out.kind}`);
    expect(out.reply.display_text).toBe(`From your notes: ${PARKING}`);
  });

  it("query_note with no matching note says it isn't in the plan, never a guess", async () => {
    const ctx = await ctxFor(tool([{ kind: "query_note", topic: "hotel" }], "ask"), "Which hotel?", { services: withNotes, register: "en" });
    const out = await resolveTurn(ctx, { services: withNotes });
    if (out.kind !== "answer") throw new Error(`expected an answer, got ${out.kind}`);
    expect(out.cards).toEqual([]);
    expect(out.reply).toEqual(fixedReply("no_context", "en"));
  });
});

describe("edits", () => {
  it("re-validates an edited amount and updates the reason", async () => {
    const ctx = await ctxFor(
      tool([{ kind: "correct_payment", vendor_id: "VEN-CAT", amount_inr: 40000, heard: [{ field: "amount_inr", phrase: "चालीस हज़ार" }] }]),
      "Caterer को चालीस हज़ार advance दिया था",
    );
    const out = await resolveTurn(ctx);
    if (out.kind !== "preview") throw new Error("expected a preview");
    const edited = applyEdits(out.actions, [{ action_index: 0, field: "amount_inr", value: "₹45,000" }]);
    expect(edited.ok).toBe(true);
    if (!edited.ok) return;
    expect(edited.actions[0].input).toMatchObject({ amount_inr: 45000, change_reason: "Advance was ₹45,000, not ₹50,000." });
    expect(applyEdits(out.actions, [{ action_index: 0, field: "amount_inr", value: "abc" }]).ok).toBe(false);
    expect(applyEdits(out.actions, [{ action_index: 0, field: "amount_inr", value: "0" }]).ok).toBe(false);
  });
});

describe("V-T4 repairs read from the transcript", () => {
  it("O-02: 'Diya ने क्या बदला?' is the latest entry when no day was said", async () => {
    const ctx = await ctxFor(tool([{ kind: "query_changes", actor_member_id: "MEM-DIYA" }], "ask"), "Diya ने क्या बदला?");
    const out = await resolveTurn(ctx);
    expect(out.kind).toBe("answer");
    if (out.kind !== "answer") return;
    expect(out.cards).toHaveLength(1);
  });

  it("R-03: the count before 'लोगों' fills the requirement's quantity", async () => {
    const ctx = await ctxFor(
      tool([{ kind: "add_requirement", event_id: "EVT-REC", text: "Jain food", requirement_category: "catering" }]),
      "Reception में बारह लोगों के लिए Jain खाना add करो",
      { writes: false },
    );
    const out = await resolveTurn(ctx);
    expect(out.kind).toBe("refused");
    if (out.kind !== "refused") return;
    expect(out.prefill[0].input).toMatchObject({ text: "Jain food", quantity: 12, requirement_category: "catering", vendor_id: ids.caterer_vendor_id });
  });

  it("E-04: a headcount copied from the snapshot, with no heard words, is dropped", async () => {
    const ctx = await ctxFor(tool([{ kind: "update_event", event_id: "EVT-REC", venue_name: "Lotus Hall", expected_headcount: 250 }]), "Reception Lotus Hall में shift कर दो");
    const out = await resolveTurn(ctx);
    expect(out.kind).toBe("preview");
    if (out.kind !== "preview") return;
    expect(out.confirm_enabled).toBe(true);
    expect(out.actions[0].input).not.toHaveProperty("expected_headcount");
  });
});

describe("heard words found by code (3.1 step 1)", () => {
  it("M-03 with no heard item: 'चालीस हज़ार' in the transcript re-reads the amount, and the card is ready", async () => {
    const ctx = await ctxFor(
      tool([{ kind: "correct_payment", vendor_id: "VEN-CAT", payment_kind: "advance", amount_inr: 40000, previous_inr: 50000 }]),
      "Caterer को चालीस हज़ार advance दिया था",
    );
    const out = await resolveTurn(ctx);
    expect(out.kind).toBe("preview");
    if (out.kind !== "preview") return;
    expect(out.confirm_enabled).toBe(true);
    expect(out.actions[0].input).toMatchObject({ payment_id: ids.advance_payment_id, amount_inr: 40000 });
  });

  it("an amount nobody said stays uncertain", async () => {
    const ctx = await ctxFor(tool([{ kind: "correct_payment", vendor_id: "VEN-CAT", payment_kind: "advance", amount_inr: 45000 }]), "Caterer को चालीस हज़ार advance दिया था");
    const out = await resolveTurn(ctx);
    expect(out.kind === "preview" && out.confirm_enabled).toBeFalsy();
  });
});

describe("query_changes templates (4.2)", () => {
  it("O-04: two notes of one topic, each card linked to its function", async () => {
    const ctx = await ctxFor(tool([{ kind: "query_changes", actor_member_id: "MEM-DIYA", day: "today" }], "ask"), "What did Diya add today?", { register: "en" });
    const out = await resolveTurn(ctx);
    expect(out.kind).toBe("answer");
    if (out.kind !== "answer") return;
    expect(out.reply.display_text).toBe(
      "Today Diya added two notes: sugar-free dessert option at the reception, and marigold and fairy-light canopy over the stage at the sangeet.",
    );
    expect(out.cards).toHaveLength(2);
    for (const card of out.cards) expect(card.link).toContain("highlight=requirements");
  });

  it("O-04 in hinglish keeps Latin display and Devanagari speech", async () => {
    const ctx = await ctxFor(tool([{ kind: "query_changes", actor_member_id: "MEM-DIYA", day: "today" }], "ask"), "Diya ne aaj kya joda?");
    const out = await resolveTurn(ctx);
    if (out.kind !== "answer") throw new Error(out.kind);
    expect(out.reply.display_text).toBe(
      "Aaj Diya ne do notes jode: reception mein sugar-free dessert option, aur sangeet mein marigold and fairy-light canopy over the stage.",
    );
    expect(out.reply.speech_text).toContain("आज Diya ने दो notes जोड़े");
  });

  it("M-10: three or more says the count in words, today, and where the top change stands", async () => {
    const services = servicesWith((name, value) => {
      if (name !== "activity_feed") return value;
      const feed = value as ActivityFeed;
      const template = feed.entries[0]!;
      const entry = (seq: number, actor: string, patch: Partial<typeof template>) => ({ ...template, seq, actor_label: actor, seed_key: `ACT-0${seq}`, ...patch });
      feed.entries = [
        entry(8, "Mira", { topic: "itinerary.published", entity_type: "itinerary" as never, summary_en: "Mira published revision 3." }),
        entry(7, "Diya", { topic: "requirement.added", entity_type: "requirement", summary_en: "Diya added a note." }),
        entry(6, "Mira", { topic: "payment.recorded", entity_type: "payment" as never, summary_en: "Mira recorded a payment." }),
        entry(5, "Diya", { topic: "commitment.updated", entity_type: "commitment" as never, summary_en: "Diya changed an amount." }),
        entry(4, "Diya", {
          topic: "event.updated",
          entity_type: "event",
          entity_id: ids.reception_event_id,
          summary_en: "Diya moved the reception from Banyan Hall to Lotus Hall.",
          before: { venue_name: "Banyan Hall" },
          after: { venue_name: "Lotus Hall" },
          awaiting_publish: false,
        }),
      ];
      return feed;
    });
    const ctx = await ctxFor(tool([{ kind: "query_changes", day: "today" }], "ask"), "What changed today?", { register: "en", services });
    const out = await resolveTurn(ctx, { services });
    if (out.kind !== "answer") throw new Error(out.kind);
    expect(out.reply.display_text).toBe("Diya made three changes today, including moving the reception to Lotus Hall, which is now published.");
    expect(out.cards).toHaveLength(5);
    expect(out.cards.filter((card) => card.title.startsWith("Your changes today"))).toHaveLength(2);
  });
});
