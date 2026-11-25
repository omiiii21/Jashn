import { describe, expect, it, vi } from "vitest";

import { FLAG_KEYS, type FlagKey } from "@/contracts/flags";
import type { SessionActor } from "@/contracts/domain";

import type { EvaluatedFlag, UserFlagEvaluation } from "./evaluate";
import { createMemoryExposureStore } from "./exposures";
import { entryDecision, entryDecisionLogLine, type EntryDecisionInput } from "./setup-entry";
import { prepareSetupRender, recordSetupExposure, type ExperimentEventsSdk } from "./setup-render";

const on = (value: string | null = null): EvaluatedFlag => ({ enabled: true, value, fallback: false, reason: "DEFAULT" });
const off = (): EvaluatedFlag => ({ enabled: false, value: null, fallback: false, reason: "DEFAULT" });
const fellBack = (enabled = false, value: string | null = null): EvaluatedFlag => ({ enabled, value, fallback: true, reason: null });

function enrolled(variant: string | null = "voice_first"): EvaluatedFlag {
  return { ...on(variant ?? "form_first"), variant, experiment: { id: 42, name: "Setup entry", in_experiment: true } };
}

function input(patch: Partial<EntryDecisionInput> = {}, flags: Partial<EntryDecisionInput["flags"]> = {}): EntryDecisionInput {
  return {
    flags: { setup_entry: enrolled(), voice_pilot: on(), voice_writes_enabled: on(), ...flags },
    fallback: false,
    env_label: "development",
    node_env: "development",
    is_first_wedding: true,
    is_internal: false,
    ...patch,
  };
}

describe("the entry decision (flagsmith 3.4)", () => {
  it("row 1: a fallback evaluation or a fallback setup_entry opens form-first, no exposure", () => {
    expect(entryDecision(input({ fallback: true }))).toMatchObject({ row: 1, arm: "form_first", record_exposure: false });
    expect(entryDecision(input({}, { setup_entry: fellBack(true, "form_first") }))).toMatchObject({ row: 1, arm: "form_first", record_exposure: false });
  });

  it("row 2: env_label must equal the process's expected label", () => {
    expect(entryDecision(input({ env_label: "production", node_env: "development" }))).toMatchObject({ row: 2, record_exposure: false });
    expect(entryDecision(input({ env_label: "unknown" }))).toMatchObject({ row: 2, arm: "form_first" });
    expect(entryDecision(input({ env_label: "production", node_env: "production" })).row).toBe(7);
  });

  it("row 3: a user who already owns a wedding opens form-first", () => {
    expect(entryDecision(input({ is_first_wedding: false }))).toMatchObject({ row: 3, arm: "form_first", record_exposure: false });
  });

  it("row 4: internal accounts are voice-first only with voice and writes on, never exposed", () => {
    expect(entryDecision(input({ is_internal: true }))).toMatchObject({ row: 4, arm: "voice_first", record_exposure: false, variant: null });
    expect(entryDecision(input({ is_internal: true }, { voice_writes_enabled: off() }))).toMatchObject({ row: 4, arm: "form_first", record_exposure: false });
    expect(entryDecision(input({ is_internal: true }, { voice_pilot: off() }))).toMatchObject({ row: 4, arm: "form_first" });
  });

  it("row 5: voice_pilot off or voice_writes_enabled off opens form-first", () => {
    expect(entryDecision(input({}, { voice_pilot: off() }))).toMatchObject({ row: 5, arm: "form_first", record_exposure: false });
    expect(entryDecision(input({}, { voice_writes_enabled: off() }))).toMatchObject({ row: 5, record_exposure: false });
  });

  it("row 6: disabled, no experiment, not in the experiment, or no variant", () => {
    expect(entryDecision(input({}, { setup_entry: { ...enrolled(), enabled: false } })).row).toBe(6);
    expect(entryDecision(input({}, { setup_entry: { ...enrolled(), experiment: null } })).row).toBe(6);
    expect(entryDecision(input({}, { setup_entry: { ...enrolled(), experiment: { id: 42, name: "x", in_experiment: false } } })).row).toBe(6);
    expect(entryDecision(input({}, { setup_entry: enrolled(null) }))).toMatchObject({ row: 6, arm: "form_first", record_exposure: false });
  });

  it("row 7: branches on the variant key, records the exposure", () => {
    expect(entryDecision(input())).toEqual({ row: 7, arm: "voice_first", record_exposure: true, variant: "voice_first", experiment_id: "42" });
    expect(entryDecision(input({}, { setup_entry: enrolled("form_first") }))).toMatchObject({ row: 7, arm: "form_first", record_exposure: true });
    // An unknown key (or a value that says voice_first under another key) is form-first.
    expect(entryDecision(input({}, { setup_entry: { ...enrolled("control"), value: "voice_first" } }))).toMatchObject({ row: 7, arm: "form_first", variant: "control" });
  });

  it("logs the row and the arm with no user data", () => {
    expect(entryDecisionLogLine(entryDecision(input()))).toBe("setup-entry row=7 arm=voice_first exposure=yes");
  });
});

// ---------------------------------------------------------------------------
// The render and the exposure (5.3, FV13 b)
// ---------------------------------------------------------------------------

const owner: SessionActor = {
  kind: "member",
  user_id: "55555555-5555-4555-8555-555555555555",
  email: "nonint-c-1400@example.net",
  display_name: "Tester",
  wedding_id: null,
  member_id: null,
  role: null,
  is_internal: false,
  is_first_wedding: true,
  preferred_language: "en",
};

function evaluation(flags: Partial<Record<FlagKey, EvaluatedFlag>> = {}): UserFlagEvaluation {
  const all = Object.fromEntries(FLAG_KEYS.map((key) => [key, on()])) as Record<FlagKey, EvaluatedFlag>;
  return {
    identity: "u_0123456789abcdef0123456789abcdef",
    flags: { ...all, env_label: on("development"), setup_entry: enrolled(), ...flags },
    fallback: false,
    env_label: "development",
    latency_ms: 5,
  };
}

function fakeSdk() {
  const sdk: ExperimentEventsSdk & { exposures: unknown[]; events: unknown[]; flushes: number } = {
    exposures: [],
    events: [],
    flushes: 0,
    trackExposureEvent(feature, opts) {
      this.exposures.push({ feature, ...opts });
    },
    trackEvent(event, opts) {
      this.events.push({ event, ...opts });
    },
    async flushEvents() {
      this.flushes += 1;
    },
  };
  return sdk;
}

describe("the setup render's exposure", () => {
  it("an enrolled render: one exposure call, one row, then a flush; a re-render keeps the first time", async () => {
    const store = createMemoryExposureStore();
    const sdk = fakeSdk();
    const lines: string[] = [];
    const first = await prepareSetupRender(owner, evaluation(), { store, node_env: "development", now: () => new Date("2026-11-25T09:00:00Z"), log: (l) => lines.push(l) });
    expect(first.decision.row).toBe(7);
    expect(first.setup_opened_at).toBe("2026-11-25T09:00:00.000Z");
    expect(first.exposure).not.toBeNull();
    await recordSetupExposure(first.exposure!, { store, sdk });
    expect(sdk.exposures).toEqual([
      { feature: "setup_entry", identifier: "u_0123456789abcdef0123456789abcdef", value: "voice_first", metadata: { experiment_id: 42 } },
    ]);
    expect(sdk.flushes).toBe(1);
    expect(lines).toEqual(["setup-entry row=7 arm=voice_first exposure=yes"]);

    // A refresh: setup_opened_at comes from the row; the row stays one, the event is resent.
    const again = await prepareSetupRender(owner, evaluation(), { store, node_env: "development", now: () => new Date("2026-11-25T09:05:00Z"), log: () => {} });
    expect(again.setup_opened_at).toBe("2026-11-25T09:00:00.000Z");
    await recordSetupExposure(again.exposure!, { store, sdk });
    expect(sdk.exposures).toHaveLength(2);
    const counts = await store.countsByArm("setup_entry", "development");
    expect(counts.voice_first.exposures).toBe(1);
    expect(counts.form_first.exposures).toBe(0);
  });

  it("an internal account's render records nothing (FV13)", async () => {
    const store = createMemoryExposureStore();
    const spy = vi.spyOn(store, "get");
    const render = await prepareSetupRender({ ...owner, email: "mira.c@example.com" }, evaluation(), { store, node_env: "development", log: () => {} });
    expect(render.decision).toMatchObject({ row: 4, arm: "voice_first", record_exposure: false });
    expect(render.exposure).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it("a fallback render opens form-first with no exposure (FV8)", async () => {
    const render = await prepareSetupRender(owner, { ...evaluation(), fallback: true }, { node_env: "development", log: () => {} });
    expect(render.decision).toMatchObject({ row: 1, arm: "form_first" });
    expect(render.exposure).toBeNull();
  });

  it("never throws when the store or the SDK fails", async () => {
    const broken = createMemoryExposureStore();
    broken.insertIfAbsent = async () => {
      throw new Error("db down");
    };
    const sdk = fakeSdk();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const render = await prepareSetupRender(owner, evaluation(), { store: broken, node_env: "development", log: () => {} });
    await expect(recordSetupExposure(render.exposure!, { store: broken, sdk })).resolves.toBeUndefined();
    expect(sdk.exposures).toHaveLength(1);
    warn.mockRestore();
  });
});
