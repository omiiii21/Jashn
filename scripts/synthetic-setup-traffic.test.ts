import { beforeEach, describe, expect, it, vi } from "vitest";

// The real SDK must never be constructed by these tests: every client is a fake or this spy.
const sdk = vi.hoisted(() => ({ constructed: vi.fn() }));
vi.mock("@flagsmith/nodejs", () => ({
  Flagsmith: class {
    constructor(config: unknown) {
      sdk.constructed(config);
    }
  },
}));

import {
  EXPOSURE_TO_CONVERSION_MS,
  PLANTED_RATES,
  SEED,
  armFor,
  clampSeconds,
  convertsFor,
  defaultDeps,
  drawPlan,
  dryIdentities,
  envLabelRefusal,
  experimentRefusal,
  isEntryPoint,
  keyRefusal,
  mulberry32,
  parseArgs,
  plannedSaves,
  runSyntheticTraffic,
  sdkTraits,
  summaryLines,
  syntheticIdentifier,
  syntheticIdentities,
  syntheticTraits,
  tallyingFetch,
  type EvaluatedFlag,
  type SyntheticClient,
  type SyntheticDeps,
} from "./synthetic-setup-traffic";

const FAKE_KEY = "ser.fake-synthetic-key-for-tests";
const ENV = { FLAGSMITH_SERVER_KEY_SYNTHETIC: FAKE_KEY };

type Call = { kind: "exposure" | "event"; name: string; identifier: string; value: unknown; metadata?: unknown };

function fakeClient(opts: {
  env_label?: EvaluatedFlag;
  flagFor?: (identifier: string) => EvaluatedFlag;
}) {
  const calls: Call[] = [];
  const evaluated: string[] = [];
  const client = {
    getEnvironmentFlags: vi.fn(async () => ({
      getFlag: (name: string): EvaluatedFlag =>
        name === "env_label"
          ? (opts.env_label ?? { enabled: true, value: "synthetic", isDefault: false })
          : { enabled: false, value: undefined, isDefault: true },
    })),
    getIdentityFlags: vi.fn(async (identifier: string) => {
      evaluated.push(identifier);
      return {
        getFlag: (name: string): EvaluatedFlag =>
          name === "setup_entry_synthetic" && opts.flagFor
            ? opts.flagFor(identifier)
            : { enabled: false, value: undefined, isDefault: true },
      };
    }),
    trackExposureEvent: vi.fn((name: string, o: { identifier: string; value?: unknown; metadata?: unknown }) => {
      calls.push({ kind: "exposure", name, identifier: o.identifier, value: o.value, metadata: o.metadata });
    }),
    trackEvent: vi.fn((name: string, o?: { identifier?: string; value?: unknown }) => {
      calls.push({ kind: "event", name, identifier: o?.identifier ?? "", value: o?.value });
    }),
    flushEvents: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
  } satisfies SyntheticClient;
  return { client, calls, evaluated };
}

/** Variant by identity number: odd voice_first, even the control. Every identity is enrolled. */
function enrolledFlag(identifier: string): EvaluatedFlag {
  const n = Number(identifier.slice(identifier.lastIndexOf("-") + 1));
  return {
    enabled: true,
    value: n % 2 === 1 ? "voice_first" : "form_first",
    isDefault: false,
    variant: n % 2 === 1 ? "voice_first" : "form_first",
    experiment: { id: 42, name: "SYNTHETIC DATA: setup entry", inExperiment: true },
  };
}

function testDeps(client: SyntheticClient | null) {
  const lines: string[] = [];
  const fetchSpy = vi.fn(async () => new Response("{}", { status: 200 }));
  let clock = Date.UTC(2026, 10, 25, 5, 25, 0);
  const deps: SyntheticDeps = {
    createClient: vi.fn(() => {
      if (!client) throw new Error("no client in this test");
      return client;
    }),
    fetch: fetchSpy as unknown as typeof fetch,
    sleep: vi.fn(async (ms: number) => {
      clock += ms;
    }),
    now: () => (clock += 1),
    log: (line: string) => lines.push(line),
  };
  return { deps, lines, fetchSpy };
}

beforeEach(() => {
  sdk.constructed.mockClear();
});

describe("identities", () => {
  it("names synthetic-0001 to synthetic-0800 and the five dry identities", () => {
    const ids = syntheticIdentities(1, 800);
    expect(ids).toHaveLength(800);
    expect(ids[0]).toBe("synthetic-0001");
    expect(ids[99]).toBe("synthetic-0100");
    expect(ids[799]).toBe("synthetic-0800");
    expect(new Set(ids).size).toBe(800);
    expect(syntheticIdentifier(801)).toBe("synthetic-0801");
    expect(dryIdentities()).toEqual([
      "synthetic-dry-01",
      "synthetic-dry-02",
      "synthetic-dry-03",
      "synthetic-dry-04",
      "synthetic-dry-05",
    ]);
  });

  it("sends a real new owner's traits plus traffic, with role, is_internal and is_first_wedding transient", () => {
    expect(syntheticTraits(1)).toEqual({
      preferred_language: "en",
      role: "owner",
      is_internal: false,
      is_first_wedding: true,
      traffic: "synthetic",
    });
    expect(syntheticTraits(2).preferred_language).toBe("hi");
    expect(sdkTraits(syntheticTraits(2))).toEqual({
      preferred_language: "hi",
      role: { value: "owner", transient: true },
      is_internal: { value: false, transient: true },
      is_first_wedding: { value: true, transient: true },
      traffic: "synthetic",
    });
  });
});

describe("the seeded draw", () => {
  it("is deterministic, with known first values for seed 20261125", () => {
    const a = mulberry32(SEED);
    const b = mulberry32(SEED);
    const first = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(first);
    expect(first[0]).toBeCloseTo(0.27387164323590696, 12);
    expect(first[1]).toBeCloseTo(0.34019215404987335, 12);
    expect(first[2]).toBeCloseTo(0.7095697165932506, 12);
    expect(mulberry32(SEED + 1)()).not.toBeCloseTo(first[0], 6);
  });

  it("gives each identity the same draws whatever the start", () => {
    const whole = drawPlan({ seed: SEED, start: 1, count: 1600 });
    const rerun = drawPlan({ seed: SEED, start: 801, count: 800 });
    expect(rerun).toEqual(whole.slice(800));
    expect(rerun[0].identifier).toBe("synthetic-0801");
    const plan = drawPlan({ seed: SEED, start: 1, count: 3 });
    expect(plan.map((d) => [d.identifier, d.seconds])).toEqual([
      ["synthetic-0001", 141],
      ["synthetic-0002", 113],
      ["synthetic-0003", 165],
    ]);
  });

  it("keeps seconds whole, from 60 to 300, and clamps to 0-3600", () => {
    const plan = drawPlan({ seed: SEED, start: 1, count: 800 });
    for (const d of plan) {
      expect(Number.isInteger(d.seconds)).toBe(true);
      expect(d.seconds).toBeGreaterThanOrEqual(60);
      expect(d.seconds).toBeLessThanOrEqual(300);
    }
    expect(clampSeconds(-5)).toBe(0);
    expect(clampSeconds(5000)).toBe(3600);
    expect(clampSeconds(12.9)).toBe(12);
  });

  it("converts each arm near its planted rate over 800 identities", () => {
    const plan = drawPlan({ seed: SEED, start: 1, count: 800 });
    const voice = plan.filter((d) => d.number % 2 === 1);
    const form = plan.filter((d) => d.number % 2 === 0);
    const voiceRate = voice.filter((d) => convertsFor("voice_first", d.conversion_draw)).length / voice.length;
    const formRate = form.filter((d) => convertsFor("form_first", d.conversion_draw)).length / form.length;
    expect(Math.abs(voiceRate - PLANTED_RATES.voice_first)).toBeLessThan(0.06);
    expect(Math.abs(formRate - PLANTED_RATES.form_first)).toBeLessThan(0.06);
    expect(voiceRate).toBeGreaterThan(formRate);
    // The whole plan, as if every identity were in one arm.
    expect(plannedSaves(plan, "voice_first") / 800).toBeCloseTo(0.6, 1);
    expect(plannedSaves(plan, "form_first") / 800).toBeCloseTo(0.5, 1);
  });

  it("branches on the variant key: only voice_first is the treatment", () => {
    expect(armFor("voice_first")).toBe("voice_first");
    expect(armFor("form_first")).toBe("form_first");
    expect(armFor("control")).toBe("form_first");
    expect(armFor(undefined)).toBe("form_first");
  });
});

describe("arguments", () => {
  it("needs --dry-run or --start, and bounds the count", () => {
    expect(parseArgs([]).ok).toBe(false);
    expect(parseArgs(["--dry-run"])).toEqual({
      ok: true,
      args: { mode: "dry", start: 1, count: 800, also_seconds_event: false },
    });
    expect(parseArgs(["--start", "1", "--count", "800"])).toEqual({
      ok: true,
      args: { mode: "real", start: 1, count: 800, also_seconds_event: false },
    });
    expect(parseArgs(["--start=801"])).toMatchObject({ ok: true, args: { mode: "real", start: 801, count: 800 } });
    expect(parseArgs(["--start", "1", "--also-seconds-event"])).toMatchObject({ ok: true, args: { also_seconds_event: true } });
    expect(parseArgs(["--start", "1", "--count", "801"]).ok).toBe(false);
    expect(parseArgs(["--start", "0"]).ok).toBe(false);
    expect(parseArgs(["--start", "x"]).ok).toBe(false);
    expect(parseArgs(["--start", "9500", "--count", "800"]).ok).toBe(false);
    expect(parseArgs(["--go"]).ok).toBe(false);
  });
});

describe("guards", () => {
  it("refuse a missing or client-side key", () => {
    expect(keyRefusal({})).toMatch(/FLAGSMITH_SERVER_KEY_SYNTHETIC is not set/);
    expect(keyRefusal({ FLAGSMITH_SERVER_KEY_SYNTHETIC: "  " })).toMatch(/not set/);
    expect(keyRefusal({ FLAGSMITH_SERVER_KEY_SYNTHETIC: "abc123" })).toMatch(/server-side key/);
    // The Development key's name is never read.
    expect(keyRefusal({ FLAGSMITH_SERVER_KEY: FAKE_KEY })).toMatch(/not set/);
    expect(keyRefusal(ENV)).toBeNull();
  });

  it("refuse an env_label that is a fallback or not synthetic", () => {
    expect(envLabelRefusal(null)).toMatch(/fallback/);
    expect(envLabelRefusal({ enabled: true, value: "synthetic", isDefault: true })).toMatch(/fallback/);
    expect(envLabelRefusal({ enabled: true, value: "development", isDefault: false })).toMatch(/"development"/);
    expect(envLabelRefusal({ enabled: true, value: "synthetic", isDefault: false })).toBeNull();
  });

  it("refuse a setup_entry_synthetic that is a fallback, disabled or has no experiment", () => {
    expect(experimentRefusal(null, "synthetic-0001")).toMatch(/no fallback/);
    expect(experimentRefusal({ enabled: true, value: "form_first", isDefault: true }, "synthetic-0001")).toMatch(/fallback/);
    expect(experimentRefusal({ enabled: false, value: "form_first", isDefault: false }, "synthetic-0001")).toMatch(/disabled/);
    expect(experimentRefusal({ enabled: true, value: "form_first", isDefault: false, variant: "form_first" }, "synthetic-0001")).toMatch(
      /no experiment/,
    );
    expect(experimentRefusal(enrolledFlag("synthetic-0001"), "synthetic-0001")).toBeNull();
  });

  it("stops with no key: the SDK is never constructed and nothing is fetched", async () => {
    const lines: string[] = [];
    const fetchSpy = vi.fn();
    const deps: SyntheticDeps = { ...defaultDeps(), fetch: fetchSpy as unknown as typeof fetch, log: (l) => lines.push(l) };
    for (const argv of [["--start", "1", "--count", "800"], ["--dry-run"]]) {
      const report = await runSyntheticTraffic(argv, {}, deps);
      expect(report.exit_code).toBe(1);
      expect(report.client_created).toBe(false);
      expect(report.stopped).toMatch(/not set\. Nothing was sent/);
    }
    expect(sdk.constructed).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(lines.join("\n")).toMatch(/STOPPED: FLAGSMITH_SERVER_KEY_SYNTHETIC is not set/);
  });

  it("stops on a usage error before reading the key", async () => {
    const { deps } = testDeps(null);
    const report = await runSyntheticTraffic([], ENV, deps);
    expect(report.exit_code).toBe(2);
    expect(deps.createClient).not.toHaveBeenCalled();
    expect(sdk.constructed).not.toHaveBeenCalled();
  });

  it("stops on the wrong env_label: no identity evaluated, no event, close() once", async () => {
    const fake = fakeClient({ env_label: { enabled: true, value: "development", isDefault: false }, flagFor: enrolledFlag });
    const { deps, lines } = testDeps(fake.client);
    const report = await runSyntheticTraffic(["--start", "1", "--count", "800"], ENV, deps);
    expect(report.exit_code).toBe(1);
    expect(report.stopped).toMatch(/not "synthetic"/);
    expect(fake.client.getIdentityFlags).not.toHaveBeenCalled();
    expect(fake.calls).toEqual([]);
    expect(fake.client.close).toHaveBeenCalledTimes(1);
    expect(lines.join("\n")).not.toContain(FAKE_KEY);
  });

  it("stops when env_label can't be read at all", async () => {
    const fake = fakeClient({ flagFor: enrolledFlag });
    fake.client.getEnvironmentFlags.mockRejectedValueOnce(new Error(`status 401 for ${FAKE_KEY}`));
    const { deps, lines } = testDeps(fake.client);
    const report = await runSyntheticTraffic(["--start", "1"], ENV, deps);
    expect(report.exit_code).toBe(1);
    expect(report.stopped).toMatch(/could not be read/);
    expect(fake.calls).toEqual([]);
    expect(fake.client.close).toHaveBeenCalledTimes(1);
    expect(lines.join("\n")).not.toContain(FAKE_KEY);
  });

  it("stops when the first identity's flag carries no experiment, sending nothing", async () => {
    const fake = fakeClient({
      flagFor: () => ({ enabled: true, value: "form_first", isDefault: false, variant: "form_first" }),
    });
    const { deps } = testDeps(fake.client);
    const report = await runSyntheticTraffic(["--start", "1", "--count", "800"], ENV, deps);
    expect(report.exit_code).toBe(1);
    expect(report.stopped).toMatch(/no experiment/);
    expect(fake.evaluated).toEqual(["synthetic-0001"]);
    expect(fake.calls).toEqual([]);
    expect(fake.client.close).toHaveBeenCalledTimes(1);
  });
});

describe("the dry run", () => {
  it("evaluates the five dry identities, prints their variants and sends no events", async () => {
    const fake = fakeClient({ flagFor: enrolledFlag });
    const { deps, lines } = testDeps(fake.client);
    const report = await runSyntheticTraffic(["--dry-run"], ENV, deps);
    expect(report.exit_code).toBe(0);
    expect(fake.evaluated).toEqual(dryIdentities());
    expect(fake.calls).toEqual([]);
    expect(fake.client.trackEvent).not.toHaveBeenCalled();
    expect(fake.client.trackExposureEvent).not.toHaveBeenCalled();
    expect(fake.client.flushEvents).not.toHaveBeenCalled();
    expect(fake.client.close).toHaveBeenCalledTimes(1);
    const out = lines.join("\n");
    expect(out).toMatch(/synthetic-dry-01: variant voice_first, in_experiment true/);
    expect(out).toMatch(/synthetic-dry-02: variant form_first, in_experiment true/);
    expect(out).toMatch(/synthetic-0001 to synthetic-0800 \(800 identities\), seed 20261125/);
    expect(out).toMatch(/474 of 800 would save if all were voice_first, 378 if all were form_first/);
    expect(out).toMatch(/READY/);
    expect(out).not.toContain(FAKE_KEY);
  });

  it("says NOT READY when the flag has no experiment yet", async () => {
    const fake = fakeClient({ flagFor: () => ({ enabled: true, value: "form_first", isDefault: false, variant: "form_first" }) });
    const { deps, lines } = testDeps(fake.client);
    const report = await runSyntheticTraffic(["--dry-run"], ENV, deps);
    expect(report.exit_code).toBe(1);
    expect(fake.calls).toEqual([]);
    expect(lines.join("\n")).toMatch(/NOT READY/);
  });
});

describe("the real run (fake client)", () => {
  it("sends one exposure per enrolled identity and the planted conversions, flushing every 100", async () => {
    const fake = fakeClient({ flagFor: enrolledFlag });
    const { deps, lines } = testDeps(fake.client);
    const report = await runSyntheticTraffic(["--start", "1", "--count", "800"], ENV, deps);
    expect(report.exit_code).toBe(0);
    expect(report.stopped).toBeNull();
    expect(fake.evaluated).toEqual(syntheticIdentities(1, 800));

    const plan = drawPlan({ seed: SEED, start: 1, count: 800 });
    const expectedVoice = plan.filter((d) => d.number % 2 === 1 && convertsFor("voice_first", d.conversion_draw)).length;
    const expectedForm = plan.filter((d) => d.number % 2 === 0 && convertsFor("form_first", d.conversion_draw)).length;
    expect(report.arms.voice_first).toEqual({ identities: 400, exposures_sent: 400, conversions_sent: expectedVoice });
    expect(report.arms.form_first).toEqual({ identities: 400, exposures_sent: 400, conversions_sent: expectedForm });

    const exposures = fake.calls.filter((c) => c.kind === "exposure");
    const conversions = fake.calls.filter((c) => c.kind === "event");
    expect(exposures).toHaveLength(800);
    expect(exposures[0]).toEqual({
      kind: "exposure",
      name: "setup_entry_synthetic",
      identifier: "synthetic-0001",
      value: "voice_first",
      metadata: { experiment_id: 42 },
    });
    expect(conversions).toHaveLength(expectedVoice + expectedForm);
    for (const c of conversions) {
      expect(c.name).toBe("setup_saved");
      expect(c.value).toBeGreaterThanOrEqual(60);
      expect(c.value).toBeLessThanOrEqual(300);
      // Every conversion comes after its identity's exposure.
      const exposureAt = fake.calls.findIndex((e) => e.kind === "exposure" && e.identifier === c.identifier);
      expect(exposureAt).toBeGreaterThanOrEqual(0);
      expect(exposureAt).toBeLessThan(fake.calls.indexOf(c));
    }
    expect(fake.client.flushEvents).toHaveBeenCalledTimes(8);
    expect(fake.client.close).toHaveBeenCalledTimes(1);
    // Paced: every conversion waits at least the exposure-to-conversion gap.
    expect(deps.sleep).toHaveBeenCalled();
    for (const [ms] of (deps.sleep as ReturnType<typeof vi.fn>).mock.calls) expect(ms).toBeGreaterThan(0);
    expect(Math.min(...(deps.sleep as ReturnType<typeof vi.fn>).mock.calls.map(([ms]) => ms as number))).toBeGreaterThan(0);
    expect(EXPOSURE_TO_CONVERSION_MS).toBeGreaterThan(0);

    const summary = summaryLines(report).join("\n");
    expect(summary).toMatch(/Seed 20261125\. Identities synthetic-0001 to synthetic-0800; 800 evaluated/);
    expect(summary).toMatch(/not results/);
    expect([...lines, summary].join("\n")).not.toContain(FAKE_KEY);
  });

  it("also sends setup_save_seconds only when asked", async () => {
    const fake = fakeClient({ flagFor: enrolledFlag });
    const { deps } = testDeps(fake.client);
    const report = await runSyntheticTraffic(["--start", "1", "--count", "10", "--also-seconds-event"], ENV, deps);
    const saved = fake.calls.filter((c) => c.name === "setup_saved");
    const seconds = fake.calls.filter((c) => c.name === "setup_save_seconds");
    expect(saved.length).toBeGreaterThan(0);
    expect(seconds.map((c) => [c.identifier, c.value])).toEqual(saved.map((c) => [c.identifier, c.value]));
    expect(report.arms.voice_first.conversions_sent + report.arms.form_first.conversions_sent).toBe(saved.length);
  });

  it("sends nothing for identities that aren't enrolled", async () => {
    const fake = fakeClient({
      flagFor: (id) => ({ ...enrolledFlag(id), experiment: { id: 42, name: "x", inExperiment: id === "synthetic-0001" } }),
    });
    const { deps } = testDeps(fake.client);
    const report = await runSyntheticTraffic(["--start", "1", "--count", "4"], ENV, deps);
    expect(report.exit_code).toBe(0);
    expect(report.not_enrolled).toBe(3);
    expect(fake.calls.every((c) => c.identifier === "synthetic-0001")).toBe(true);
  });
});

describe("helpers", () => {
  it("tallies what the events API accepted and passes other requests through", async () => {
    const base = vi.fn(async () => new Response("{}", { status: 202 }));
    const { fetch: wrapped, tally } = tallyingFetch(base as unknown as typeof fetch);
    await wrapped("https://events.api.flagsmith.com/v1/events", {
      method: "POST",
      body: JSON.stringify({ events: [{ event: "$flag_exposure" }, { event: "setup_saved" }, { event: "$flag_exposure" }] }),
    });
    await wrapped("https://edge.api.flagsmith.com/api/v1/identities/", { method: "POST", body: "{}" });
    expect(base).toHaveBeenCalledTimes(2);
    expect(tally).toEqual({ posts: 1, by_status: { "202": 1 }, accepted: { $flag_exposure: 2, setup_saved: 1 }, network_errors: 0 });
  });

  it("knows when it is the entry point", () => {
    expect(isEntryPoint("/x/jashn-c/scripts/synthetic-setup-traffic.ts")).toBe(true);
    expect(isEntryPoint("/x/node_modules/vitest/vitest.mjs")).toBe(false);
    expect(isEntryPoint(undefined)).toBe(false);
  });
});
