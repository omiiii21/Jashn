import { describe, expect, it } from "vitest";

import { fixtureIds } from "@/contracts/fixtures";

import type { CommandResponse } from "@/contracts/commands";
import { evaluateUserFlags } from "@/server/flags";

import type { VoiceDeps } from "./deps";
import { LIVE_EIGHT_ROW_IDS } from "./fixture-mode";
import { readNdjson } from "./ndjson";
import { createMemoryRateLimiter } from "./rate-limit";
import { createMemoryVoiceTurnStore } from "./store";
import { handleTurn } from "./turn";

/**
 * The live 8 through the real modules (flags, snapshot, resolver, templates, the fixture
 * services) in fixture mode: only the store, the limiter and the fixture switch are injected.
 * Checks the stream's shape for every row: optional heard, exactly one terminal event, done.
 */
const WEDDING = fixtureIds("demo").wedding_id;
const TERMINAL = ["preview", "answer", "clarify", "refused", "saved", "cancelled", "error"];

async function runRows(rows: readonly string[], overrides: Partial<VoiceDeps>, startAt: number) {
  const store = createMemoryVoiceTurnStore();
  const rateLimiter = createMemoryRateLimiter({ per_minute: 100 });
  const results: { row_id: string; types: string[]; terminal: Record<string, unknown> | undefined }[] = [];
  let n = startAt;
  for (const row_id of rows) {
    n += 1;
    const form = new FormData();
    form.append("text", "fixture");
    form.append("wedding_id", WEDDING);
    form.append("client_turn_id", `e0000000-0000-4000-8000-${String(n).padStart(12, "0")}`);
    form.append("ui_language", "en");
    form.append("fixture_id", row_id);
    const response = await handleTurn(new Request("http://localhost/api/voice/turn", { method: "POST", body: form }), {
      store,
      rateLimiter,
      fixtureMode: () => true,
      log: () => {},
      ...overrides,
    });
    const events = await readNdjson(response);
    results.push({
      row_id,
      types: events.map((event) => String(event.type)),
      terminal: events.find((entry) => TERMINAL.includes(String(entry.type))),
    });
  }
  return results;
}

describe("the live 8 through the real pipeline (fixture mode)", () => {
  it("previews M-03 and saves it with C-01 when voice writes are on", async () => {
    const dispatched: string[] = [];
    const results = await runRows(["M-03", "C-01"], {
      evaluateFlags: async (actor, opts) => {
        const evaluation = await evaluateUserFlags(actor, opts);
        return {
          ...evaluation,
          flags: { ...evaluation.flags, voice_writes_enabled: { ...evaluation.flags.voice_writes_enabled, enabled: true, fallback: false } },
        };
      },
      dispatch: async (_actor, envelope) => {
        dispatched.push(`${envelope.command} ${envelope.idempotency_key} ${envelope.source}`);
        return {
          ok: true,
          outcome: "applied",
          command: envelope.command,
          result: { vendor_id: "v", vendor_totals: { committed_inr: 200000, paid_inr: 40000, outstanding_inr: 160000, overpaid_inr: 0 } },
          activity_entry_id: null,
          version: 2,
          warnings: [],
        } as unknown as CommandResponse;
      },
    }, 100);
    expect(results.map((r) => r.terminal?.type), JSON.stringify(results)).toEqual(["preview", "saved"]);
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]).toMatch(/^correct_payment .+:0 voice$/);
  });

  it("streams one terminal event per row and never an internal error", async () => {
    const store = createMemoryVoiceTurnStore();
    const rateLimiter = createMemoryRateLimiter({ per_minute: 100 });
    const outcomes: string[] = [];
    const logs: string[] = [];
    let n = 0;
    for (const row_id of LIVE_EIGHT_ROW_IDS) {
      n += 1;
      const form = new FormData();
      form.append("text", "fixture");
      form.append("wedding_id", WEDDING);
      form.append("client_turn_id", `d0000000-0000-4000-8000-${String(n).padStart(12, "0")}`);
      form.append("ui_language", "en");
      form.append("fixture_id", row_id);
      const response = await handleTurn(new Request("http://localhost/api/voice/turn", { method: "POST", body: form }), {
        store,
        rateLimiter,
        fixtureMode: () => true,
        log: (line) => logs.push(line),
      });
      expect(response.status, row_id).toBe(200);
      const events = await readNdjson(response);
      const types = events.map((event) => String(event.type));
      expect(types.at(-1), row_id).toBe("done");
      const terminal = types.filter((type) => TERMINAL.includes(type));
      expect(terminal, row_id).toHaveLength(1);
      const event = events.find((entry) => TERMINAL.includes(String(entry.type)));
      outcomes.push(`${row_id}: ${types.join(" > ")} ${event?.type === "error" ? String(event.code) : ""}`);
      expect(event?.code, `${row_id} ${JSON.stringify(event)} ${logs.join(' | ')}`).not.toBe("internal_error");
    }
    console.info(outcomes.join("\n"));
  });
});
