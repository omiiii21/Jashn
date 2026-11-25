import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import { fixtureIds } from "../src/contracts/fixtures";

/**
 * Lane C: the flags summary and the voice routes, through HTTP only (no browser).
 *
 * Run it against a dev server in fixture mode, so no Sarvam call is made:
 *   VOICE_FIXTURE_MODE=on npm run dev -- --port 3003
 *   E2E_BASE_URL=http://localhost:3003 npx playwright test e2e/lane-c.spec.ts --project=desktop
 *
 * It signs nobody in: until Lane A's real session lands, `getSession()` is the fixture member
 * (Mira, owner of the demo copy). Once sign-in is real, these requests need a storage state of
 * an `@example.com` account on rehearsal copy `c`.
 */

const WEDDING_ID = fixtureIds("demo").wedding_id;

/** Keys of `FlagsSelfCheck` (src/contracts/flags.ts). */
const SELF_CHECK_KEYS = [
  "ok",
  "expected_env",
  "env_label",
  "key_type",
  "fallback_flags",
  "not_created",
  "events_probe_status",
  "experiment_events",
  "latency_ms",
  "sdk",
  "checked_at",
];

type StreamEvent = { type: string; voice_turn_id?: string; [key: string]: unknown };

function parseNdjson(body: string): StreamEvent[] {
  return body
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as StreamEvent);
}

test.describe("lane C: flags and voice routes", () => {
  test("GET /api/health carries the Flagsmith self-check summary", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.status()).toBe(200);
    const body = (await response.json()) as { flags?: Record<string, unknown> };
    expect(body.flags).toBeTruthy();
    const flags = body.flags as Record<string, unknown>;
    for (const key of SELF_CHECK_KEYS) expect(flags, `flags.${key}`).toHaveProperty(key);
    expect(typeof flags.ok).toBe("boolean");
    expect(["server", "client", "missing"]).toContain(flags.key_type);
    expect(Array.isArray(flags.fallback_flags)).toBe(true);
    expect(flags.sdk).toBe("@flagsmith/nodejs 9.5.0");
    // Never a key in the summary.
    expect(JSON.stringify(body)).not.toMatch(/ser\.[A-Za-z0-9]/);
  });

  test("a typed O-01 fixture turn streams heard, then answer, then done", async ({ request }) => {
    const response = await request.post("/api/voice/turn", {
      multipart: {
        text: "Caterer को अब कितना देना है?",
        fixture_id: "O-01",
        wedding_id: WEDDING_ID,
        client_turn_id: randomUUID(),
        ui_language: "en",
      },
    });
    expect(response.status(), "needs a dev server with VOICE_FIXTURE_MODE=on").toBe(200);
    expect(response.headers()["content-type"]).toContain("application/x-ndjson");
    const events = parseNdjson(await response.text());
    expect(events.map((event) => event.type)).toEqual(["heard", "answer", "done"]);
    const [heard, answer, done] = events;
    expect(heard.input_mode).toBe("fixture");
    expect(heard.voice_turn_id).toBeTruthy();
    expect(answer.voice_turn_id).toBe(heard.voice_turn_id);
    expect(done.voice_turn_id).toBe(heard.voice_turn_id);
    const reply = answer.reply as { display_text: string };
    expect(reply.display_text).toBe("एक लाख पचास हज़ार रुपये बाकी हैं।");
    const cards = answer.cards as { title: string; figure: string; link: string }[];
    expect(cards).toHaveLength(1);
    expect(cards[0].title).toBe("Still owed to Annapoorna Caterers");
    expect(cards[0].figure).toBe("₹1,50,000");
    expect(cards[0].link).toContain("highlight=outstanding_inr");
    // Every voice response carries the dock's voice block (flagsmith 6.9).
    expect(done.voice).toBeTruthy();
  });

  test("a turn with no audio and no text is refused with 422", async ({ request }) => {
    const response = await request.post("/api/voice/turn", {
      multipart: { wedding_id: WEDDING_ID, client_turn_id: randomUUID(), ui_language: "en" },
    });
    expect(response.status()).toBe(422);
    const body = (await response.json()) as { ok: boolean; error: { code: string } };
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("validation_failed");
  });

  test("confirming an unknown voice turn is 403 forbidden", async ({ request }) => {
    const response = await request.post("/api/voice/confirm", { data: { voice_turn_id: randomUUID() } });
    expect(response.status()).toBe(403);
    const body = (await response.json()) as { ok: boolean; error: { code: string } };
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("forbidden");
  });
});

test.describe("lane C: the setup screen", () => {
  test("GET /setup renders the setup screen, or sends a signed-out visitor to /login", async ({ request }) => {
    const response = await request.get("/setup", { maxRedirects: 0 });
    if (response.status() >= 300 && response.status() < 400) {
      expect(response.headers()["location"] ?? "").toMatch(/\/login/);
      return;
    }
    expect(response.status()).toBe(200);
    const html = await response.text();
    expect(html).toContain("Set up your wedding");
    // An arm is always assigned; fixture Mira is internal, so she is never exposed (FV13 b is a unit test).
    expect(html).toMatch(/data-setup-arm="(voice_first|form_first)"/);
    expect(html).not.toMatch(/ser\.[A-Za-z0-9]/);
  });

  test("a fixture setup turn (S-01) with no wedding streams a terminal event", async ({ request }) => {
    const response = await request.post("/api/voice/turn", {
      multipart: {
        text: "x",
        wedding_id: "",
        client_turn_id: randomUUID(),
        ui_language: "en",
        setup_opened_at: new Date().toISOString(),
        fixture_id: "S-01",
      },
    });
    if (response.status() === 401 || response.status() === 403) return; // signed out, or voice off for this account
    expect(response.status()).toBe(200);
    const events = parseNdjson(await response.text());
    expect(events[0]?.type).toBe("heard");
    // Flagsmith on fallbacks: writes are refused early with the prefill (AT-1.6); else a draft preview.
    const terminal = events.find((event) => event.type === "refused" || event.type === "preview");
    expect(terminal).toBeTruthy();
  });
});
