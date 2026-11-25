import { describe, expect, it } from "vitest";

import { CommandFailure } from "@/contracts/commands";
import { FIXTURE_TODAY, fixtureIds, fixtureSessionActor } from "@/contracts/fixtures";
import { fixtureServices, type Services } from "@/contracts/services";

import { buildMessages, contextSummary, PROMPT_VERSION } from "./instructions";
import { buildSnapshot, formatDay, sanitizeText, snapshotData } from "./snapshot";
import type { ResolvedAction, StoredTurn } from "./types";

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const EMAIL = /[^\s@]+@[^\s@]+\.[a-z]{2,}/i;
const PHONE = /\+?\d(?:[ -]?\d){9,}/;

function expectClean(text: string) {
  expect(text).not.toMatch(UUID);
  expect(text).not.toMatch(EMAIL);
  expect(text).not.toMatch(PHONE);
  expect(text).not.toMatch(/https?:\/\//);
}

function expectKeyterms(keyterms: string[]) {
  expect(keyterms.length).toBeGreaterThan(0);
  expect(keyterms.length).toBeLessThanOrEqual(50);
  for (const term of keyterms) expect(term.length).toBeLessThanOrEqual(64);
  expect(new Set(keyterms.map((term) => term.toLowerCase())).size).toBe(keyterms.length);
}

describe("buildSnapshot, owner", () => {
  it("names Mira's records by seed key and maps them to UUIDs", async () => {
    const ids = fixtureIds();
    const snapshot = await buildSnapshot({
      actor: fixtureSessionActor("mira"),
      wedding_id: ids.wedding_id,
      context: null,
      attached_asset_id: null,
      today: FIXTURE_TODAY,
    });
    expect(snapshot.today).toBe(FIXTURE_TODAY);
    expect(snapshot.ref_map["PAY-01"]).toBe(ids.advance_payment_id);
    expect(snapshot.ref_map["VEN-CAT"]).toBe(ids.caterer_vendor_id);
    expect(snapshot.ref_map["EVT-REC"]).toBe(ids.reception_event_id);
    expect(snapshot.ref_map["COM-01"]).toBe(ids.caterer_commitment_id);
    expect(snapshot.ref_map["MEM-DIYA"]).toBeDefined();
    expect(snapshot.ref_map.H05).toBeDefined();
    expect(snapshot.ref_map.G40).toBe(ids.tara_guest_id);
    for (const id of Object.values(snapshot.ref_map)) expect(id).toMatch(UUID);

    expect(snapshot.text).toContain("Today: Wed 25 Nov 2026 (2026-11-25)");
    expect(snapshot.text).toMatch(/^PAY-01 \| VEN-CAT Annapoorna Caterers \| advance \| ₹50,000/m);
    expect(snapshot.text).toMatch(/^VEN-CAT \| Annapoorna Caterers \| catering \("caterer"\) \| booked \| EVT-REC$/m);
    expect(snapshot.text).toMatch(/^EVT-REC \| reception \| Reception \| Mon 14 Dec 2026/m);
    expect(snapshot.text).toContain("Budget: total ₹12,00,000");
    expect(snapshot.text).toContain("Plus 210 imported placeholder guests");
    expect(snapshot.hidden).toEqual([]);
    expectClean(snapshot.text);
    expectKeyterms(snapshot.keyterms);
    expect(snapshot.keyterms.slice(0, 5)).toEqual(["Mehendi", "Haldi", "Sangeet", "Reception", "Baraat"]);
    expect(snapshot.keyterms).toContain("Annapoorna Caterers");
    expect(snapshot.keyterms).toContain("Lotus Hall");
    expect(snapshot.keyterms).toContain("Diya");

    const data = snapshotData(snapshot);
    expect(data.money_summary?.vendors?.length).toBeGreaterThan(0);
    expect(data.vendor_ledger?.[ids.caterer_vendor_id]?.payments?.[0]?.payment_id).toBe(ids.advance_payment_id);
    expect(data.itinerary?.functions.length).toBe(5);
    expect(data.ref_by_id?.[ids.advance_payment_id]).toBe("PAY-01");
  });

  it("maps an attached photo to ASSET-NEW", async () => {
    const ids = fixtureIds();
    const asset = "0b6f7e0e-1111-4c2a-9a55-5a5a5a5a5a5a";
    const snapshot = await buildSnapshot({
      actor: fixtureSessionActor("mira"),
      wedding_id: ids.wedding_id,
      context: null,
      attached_asset_id: asset,
      today: FIXTURE_TODAY,
    });
    expect(snapshot.ref_map["ASSET-NEW"]).toBe(asset);
    expect(snapshot.text).toContain("Attached photo: ASSET-NEW");
    expectClean(snapshot.text);
  });
});

describe("buildSnapshot, manager", () => {
  it("gives Diya vendor money (shared) but no budget or shagun", async () => {
    const ids = fixtureIds();
    const snapshot = await buildSnapshot({
      actor: fixtureSessionActor("diya"),
      wedding_id: ids.wedding_id,
      context: null,
      attached_asset_id: null,
      today: FIXTURE_TODAY,
    });
    // The demo wedding shares vendor dues with managers, not the budget (demo-data).
    expect(snapshot.ref_map["PAY-01"]).toBe(ids.advance_payment_id);
    expect(snapshot.text).not.toContain("Budget:");
    expect(snapshot.text).toContain("Speaker: Diya, manager");
    expect(snapshot.hidden).toEqual(["budget", "shagun"]);
    expectClean(snapshot.text);
    expectKeyterms(snapshot.keyterms);
    // Owner-only activity (Diya's proposal, ACT-03) never reaches a manager's snapshot.
    expect(snapshot.text).not.toContain("It needs an owner's approval");
  });

  it("leaves the money block out when vendor dues aren't shared", async () => {
    const ids = fixtureIds();
    const noDues: Pick<Services, "read"> = {
      async read(name, request) {
        if (name === "vendor_ledger" || name === "catering_estimate") {
          throw new CommandFailure({ code: "forbidden", message: "Not shared with you." });
        }
        const result = await fixtureServices.read(name, request);
        if (name === "money_summary") {
          const rest = { ...(result as { vendors?: unknown; hidden: string[] }) };
          delete rest.vendors;
          return { ...rest, hidden: [...rest.hidden, "vendor_money"] } as typeof result;
        }
        return result;
      },
    };
    const snapshot = await buildSnapshot(
      { actor: fixtureSessionActor("diya"), wedding_id: ids.wedding_id, context: null, attached_asset_id: null, today: FIXTURE_TODAY },
      { services: noDues },
    );
    expect(snapshot.ref_map["PAY-01"]).toBeUndefined();
    expect(snapshot.text).not.toContain("Payments");
    expect(snapshot.text).not.toContain("₹50,000");
    expect(snapshot.hidden).toContain("money");
    expect(snapshot.hidden).toContain("budget");
    expect(snapshotData(snapshot).vendor_ledger).toBeUndefined();
    expect(snapshotData(snapshot).read_errors).toContain("catering_estimate:forbidden");
    expectClean(snapshot.text);
  });
});

function setupTurn(): StoredTurn {
  const action: ResolvedAction = {
    index: 0,
    kind: "set_wedding_profile",
    command: "set_wedding_profile",
    input: { city: "Bengaluru", budget_inr: 1_200_000, expected_guests: 250 },
    labels: {},
    heard: [{ field: "budget_inr", phrase: "twelve lakh" }],
    entity_ref: null,
    preview: { kind: "set_wedding_profile", command: "set_wedding_profile", fields: [], after_saving: [], warnings: [] } as unknown as ResolvedAction["preview"],
    missing_fields: ["year", "bride_name", "groom_name"],
    raw: { kind: "set_wedding_profile", date_text: "14 December", city: "Bengaluru", budget_inr: 1_200_000, expected_guests: 250 },
  };
  return {
    voice_turn_id: "9d1c7b1e-0000-4000-8000-000000000001",
    user_id: "u1",
    member_id: null,
    wedding_id: null,
    client_turn_id: "c1",
    input_mode: "speech",
    speech_language: "hi-IN",
    transcript: "Our wedding is on 14 December in Bengaluru. Budget is twelve lakh, roughly 250 guests.",
    language_code: "hi-IN",
    chip: "en",
    reply_language: "en",
    intent: "act",
    status: "proposed",
    refusal_code: null,
    actions: [action],
    missing_fields: ["year", "bride_name", "groom_name"],
    options: null,
    reply_text: "Which year is it, and what are the couple's names?",
    reply_speech: null,
    ref_map: {},
    flags: {},
    events: [],
    results: null,
    confirmed_at: null,
    confirmed_via: null,
    superseded_by_turn_id: null,
    context_turn_id: null,
    setup_opened_at: null,
    fixture_id: null,
    trace: {},
    timings_ms: {},
    created_at: "2026-11-25T12:00:00+05:30",
    updated_at: "2026-11-25T12:00:00+05:30",
  };
}

describe("buildSnapshot, setup", () => {
  it("sends today, the speaker, the draft and only the setup keyterms", async () => {
    const actor = { ...fixtureSessionActor("mira"), wedding_id: null, member_id: null, role: null, email: "setup-c-1300@example.com" };
    const snapshot = await buildSnapshot({ actor, wedding_id: null, context: setupTurn(), attached_asset_id: null, today: FIXTURE_TODAY });
    expect(snapshot.text).toContain("No wedding exists yet");
    expect(snapshot.text).toContain("Setup draft (from the previous turn): date_text 14 December | city Bengaluru | budget_inr 1200000 | expected_guests 250.");
    expect(snapshot.text).toContain("Still missing: year, bride_name, groom_name.");
    expect(snapshot.keyterms).toEqual(["Mehendi", "Haldi", "Sangeet", "Reception", "Baraat", "lakh", "hazaar", "advance", "shagun", "Bengaluru"]);
    expect(snapshot.ref_map).toEqual({});
    expectClean(snapshot.text);
  });
});

describe("text helpers", () => {
  it("strips phones, emails, links and UUIDs from free text", () => {
    expect(sanitizeText("Call +91 90000 02001 or mail a@b.co, see https://x.test/y, id 0b6f7e0e-1111-4c2a-9a55-5a5a5a5a5a5a")).toBe(
      "Call [phone removed] or mail [email removed], see [link removed] id [id removed]",
    );
    expect(sanitizeText("Sun 13 Dec, 9:30 AM, 2026-12-13")).toBe("Sun 13 Dec, 9:30 AM, 2026-12-13");
  });

  it("computes weekdays in code", () => {
    expect(formatDay("2026-12-14")).toBe("Mon 14 Dec 2026 (2026-12-14)");
    expect(formatDay(null)).toBe("-");
  });
});

describe("buildMessages", () => {
  it("puts instructions and the snapshot first, context as plain text, the transcript last", async () => {
    const ids = fixtureIds();
    const snapshot = await buildSnapshot({
      actor: fixtureSessionActor("mira"),
      wedding_id: ids.wedding_id,
      context: null,
      attached_asset_id: null,
      today: FIXTURE_TODAY,
    });
    const earlier: StoredTurn = {
      ...setupTurn(),
      wedding_id: ids.wedding_id,
      transcript: "Caterer को चालीस हज़ार advance दिया था",
      reply_text: "Correction, not a new payment: ₹50,000 → ₹40,000.",
      missing_fields: [],
      actions: [
        {
          ...setupTurn().actions[0],
          kind: "correct_payment",
          command: "correct_payment",
          input: { payment_id: ids.advance_payment_id, amount_inr: 40000 },
          entity_ref: "PAY-01",
          raw: { kind: "correct_payment", vendor_id: "VEN-CAT", amount_inr: 40000, heard: [{ field: "amount_inr", phrase: "चालीस हज़ार" }] },
        },
      ],
    };
    const messages = buildMessages({ snapshot, transcript: "  nahin, pachaas hi tha  ", context_turns: [earlier] });
    expect(messages.map((message) => message.role)).toEqual(["system", "user", "assistant", "user"]);
    expect(messages[0].content).toContain("Always call the tool");
    expect(messages[0].content).toContain("--- Snapshot ---");
    expect(messages[0].content).toContain("PAY-01 | VEN-CAT");
    expect(messages[2].content).toContain("Proposed: correct_payment PAY-01 vendor_id VEN-CAT amount_inr 40000");
    expect(messages[2].content).not.toMatch(UUID);
    expect(messages[3].content).toBe("nahin, pachaas hi tha");
    expect(PROMPT_VERSION).toMatch(/\S/);
  });

  it("keeps at most two context turns", () => {
    const turns = [1, 2, 3].map((n) => ({ ...setupTurn(), transcript: `turn ${n}`, created_at: `2026-11-25T12:0${n}:00+05:30` }));
    const messages = buildMessages({
      snapshot: { text: "Today", ref_map: {}, keyterms: [], today: FIXTURE_TODAY, data: {}, hidden: [] },
      transcript: "now",
      context_turns: turns,
    });
    expect(messages.filter((message) => message.role === "user").map((message) => message.content)).toEqual(["turn 2", "turn 3", "now"]);
    expect(contextSummary(turns[0])).toContain("Still missing: year, bride_name, groom_name");
  });
});
