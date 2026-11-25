import { describe, expect, it } from "vitest";

import type { ReplyRegister } from "@/contracts/api";
import { FIXTURE_TODAY, fixtureIds, fixtureSessionActor } from "@/contracts/fixtures";

import { confirmedReply } from "./confirm-reply";
import { resolveTurn } from "./resolve";
import { buildSnapshot } from "./snapshot";
import type { ResolveContext, ToolAction, ToolArguments } from "./types";

const ids = fixtureIds("demo");
const WEDDING = ids.wedding_id;

function tool(actions: ToolAction[]): ToolArguments {
  return { intent: "act", actions, missing_fields: [], reply: "", reply_language: "hinglish" };
}

async function ctxFor(args: ToolArguments, transcript: string, register: ReplyRegister): Promise<ResolveContext> {
  const actor = fixtureSessionActor("mira");
  const snapshot = await buildSnapshot({ actor, wedding_id: WEDDING, context: null, attached_asset_id: null, today: FIXTURE_TODAY });
  return { actor, wedding_id: WEDDING, tool: args, snapshot, transcript, register, ui_language: "en", writes_enabled: true, context: null, page: null, setup_opened_at: null };
}

const G02 = "Nikhil aur Prachi Jain reception mein aa rahe hain.";

async function g02(register: ReplyRegister, guest_ids: string[] = ["Nikhil Jain", "Prachi Jain"]) {
  const ctx = await ctxFor(tool([{ kind: "set_rsvp", guest_ids, event_id: "EVT-REC", rsvp_status: "attending" }]), G02, register);
  const out = await resolveTurn(ctx);
  if (out.kind !== "preview") throw new Error(`expected a preview, got ${out.kind}`);
  const built = await confirmedReply({
    actor: ctx.actor,
    wedding_id: WEDDING,
    actions: out.actions,
    results: [{ index: 0, command: "set_rsvp", outcome: "applied", idempotency_key: "t:0", entity_ref: null, activity_entry_id: null }],
    register,
    partial: null,
  });
  return { out, built, ctx };
}

describe("G-02: an RSVP by voice names the guests and the new count", () => {
  it("the card names the guests as stored, never by reference, with the counts after saving", async () => {
    const { out } = await g02("hinglish");
    expect(out.title).toBe("RSVP for the reception: Nikhil Jain, Prachi Jain → Attending");
    expect(out.button_label).toBe("Save RSVP");
    expect(out.confirm_enabled).toBe(true);
    const guests = out.actions[0].preview.fields.find((f) => f.field === "guest_ids")!;
    expect(guests.new).toBe("Nikhil Jain, Prachi Jain");
    expect(out.actions[0].input.guest_ids).toHaveLength(2);
    expect(out.actions[0].input.event_id).toBe(ids.reception_event_id);
    expect(out.actions[0].preview.after_saving).toEqual([
      { label: "Attending", old: "229", new: "231" },
      { label: "Not replied", old: "12", new: "10" },
    ]);
  });

  it("hinglish: voice-test-set G-02 word for word, with the count in words in speech", async () => {
    const { built } = await g02("hinglish");
    expect(built.reply.display_text).toBe("Nikhil aur Prachi reception ke liye confirm ho gaye. Ab 231 log aa rahe hain.");
    expect(built.reply.speech_text).toBe("Nikhil और Prachi reception के लिए confirm हो गए। अब दो सौ इकतीस लोग आ रहे हैं।");
    expect(built.navigate_path).toContain(`/w/${WEDDING}/guests`);
  });

  it("en and hi follow voice.md 4.10", async () => {
    const en = await g02("en");
    expect(en.built.reply.display_text).toBe("Nikhil and Prachi are confirmed for the reception. 231 are now coming.");
    const hi = await g02("hi");
    expect(hi.built.reply.display_text).toBe("Nikhil और Prachi रिसेप्शन के लिए कन्फ़र्म हो गए। अब दो सौ इकतीस लोग आ रहे हैं।");
    expect(hi.built.reply.speech_text).toBe(hi.built.reply.display_text);
  });

  it("snapshot references work the same as names", async () => {
    const ctx = await ctxFor(tool([]), G02, "hinglish");
    const refById = (ctx.snapshot.data as { ref_by_id?: Record<string, string> }).ref_by_id ?? {};
    const { out } = await g02("hinglish", ["Nikhil Jain", "Prachi Jain"]);
    const uuids = out.actions[0].input.guest_ids as string[];
    const refs = uuids.map((id) => refById[id]);
    expect(refs.every((ref) => typeof ref === "string" && ctx.snapshot.ref_map[ref] !== undefined)).toBe(true);
    const byRef = await g02("hinglish", refs);
    expect(byRef.built.reply.display_text).toBe("Nikhil aur Prachi reception ke liye confirm ho gaye. Ab 231 log aa rahe hain.");
  });
});
