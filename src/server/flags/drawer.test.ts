import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FLAG_EVENTS, FLAG_KEYS, PROBE_IDENTITY_COUNT, SELFCHECK_IDENTITY } from "@/contracts/flags";
import type { StoredTurn } from "@/server/voice/types";

const sdkHolder = vi.hoisted(() => ({ sdk: null as unknown }));

vi.mock("./client", async (importOriginal) => {
  const original = await importOriginal<typeof import("./client")>();
  return { ...original, getFlagsmithSdk: () => sdkHolder.sdk };
});

import {
  resetFlagsmithClientForTests,
  setFlagsmithClientFactoryForTests,
  type FlagsmithClientLike,
  type SdkFlagLike,
  type SdkFlagsLike,
} from "./client";
import {
  buildDrawerSession,
  PROBE_TRAITS,
  probeIdentities,
  runFullCheck,
  runProbes,
  sentByJashn,
  voiceTurnCounts,
} from "./drawer";
import { setDrawerCountsSourceForTests } from "./drawer-counts";
import { evaluateUserFlags } from "./evaluate";
import { resetSelfCheckForTests } from "./selfcheck";
import { getVoiceTurnStore } from "@/server/voice/store";

function sdkFlag(enabled: boolean, value: unknown = null, extra: Partial<SdkFlagLike> = {}): SdkFlagLike {
  return { enabled, value, isDefault: false, ...extra };
}

/** A probe's flags: identities 01–05 fall inside the rollout split, every probe is in the experiment. */
function probeFlags(identity: string): SdkFlagsLike {
  const n = Number(identity.slice(-2));
  const inSplit = n <= 5;
  return {
    flags: {
      voice_pilot: sdkFlag(inSplit, null, { reason: inSplit ? "TARGETING_MATCH; segment=voice_rollout" : "DEFAULT" }),
      voice_writes_enabled: sdkFlag(true),
      spoken_replies: sdkFlag(true),
      setup_entry: sdkFlag(true, n % 2 === 0 ? "voice_first" : "form_first", {
        variant: n % 2 === 0 ? "voice_first" : "form_first",
        experiment: { id: 7, name: "Setup entry", inExperiment: true },
      }),
      setup_entry_synthetic: sdkFlag(true, "form_first"),
      env_label: sdkFlag(true, "development"),
      export_failure_drill: sdkFlag(false, ""),
      card_renderer: sdkFlag(true, "chromium"),
    },
  };
}

type EventSpies = {
  getEnvironmentFlags: ReturnType<typeof vi.fn>;
  getIdentityFlags: ReturnType<typeof vi.fn>;
  getExperimentFlag: ReturnType<typeof vi.fn>;
  trackEvent: ReturnType<typeof vi.fn>;
  trackExposureEvent: ReturnType<typeof vi.fn>;
  flushEvents: ReturnType<typeof vi.fn>;
};

function installFake(): EventSpies {
  const fake: EventSpies = {
    getEnvironmentFlags: vi.fn(async () => probeFlags("probe-99")),
    getIdentityFlags: vi.fn(async (identity: string) => probeFlags(identity)),
    getExperimentFlag: vi.fn(),
    trackEvent: vi.fn(),
    trackExposureEvent: vi.fn(),
    flushEvents: vi.fn(async () => undefined),
  };
  setFlagsmithClientFactoryForTests(() => fake as unknown as FlagsmithClientLike);
  sdkHolder.sdk = fake;
  vi.stubEnv("FLAGSMITH_SERVER_KEY", "ser.test-environment-key");
  vi.stubEnv("FLAGSMITH_ID_SALT", "test-salt-value");
  return fake;
}

beforeEach(() => {
  vi.stubEnv("FLAGSMITH_SERVER_KEY", "");
  vi.stubEnv("FLAGSMITH_ID_SALT", "");
  vi.stubEnv("INTERNAL_USER_EMAILS", "");
  vi.stubEnv("NEXT_PUBLIC_FLAGSMITH_ENVIRONMENT_ID", "");
  vi.stubEnv("DATABASE_URL", "");
  sdkHolder.sdk = null;
  setFlagsmithClientFactoryForTests(null);
  resetFlagsmithClientForTests();
  resetSelfCheckForTests();
  setDrawerCountsSourceForTests(null);
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(null, { status: 202 })),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  sdkHolder.sdk = null;
  setFlagsmithClientFactoryForTests(null);
  resetFlagsmithClientForTests();
  resetSelfCheckForTests();
  setDrawerCountsSourceForTests(null);
});

describe("probe mode (flagsmith 6.7)", () => {
  it("evaluates probe-01 to probe-50 and never sends an event", async () => {
    const fake = installFake();
    const probes = await runProbes();

    expect(fake.getIdentityFlags).toHaveBeenCalledTimes(PROBE_IDENTITY_COUNT);
    const identities = fake.getIdentityFlags.mock.calls.map((call) => call[0]).sort();
    expect(identities).toEqual(probeIdentities());
    expect(identities[0]).toBe("probe-01");
    expect(identities[49]).toBe("probe-50");

    expect(fake.trackEvent).not.toHaveBeenCalled();
    expect(fake.trackExposureEvent).not.toHaveBeenCalled();
    expect(fake.getExperimentFlag).not.toHaveBeenCalled();
    expect(fake.flushEvents).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();

    expect(probes.rows).toHaveLength(50);
    expect(probes.voice_pilot_on).toBe(5);
    expect(probes.voice_pilot_rollout).toBe(5);
    expect(probes.in_experiment).toBe(50);
    expect(probes.variants).toEqual({ voice_first: 25, form_first: 25 });
    expect(probes.fallback).toBe(0);
    expect(probes.rows[0]).toEqual({
      identity: "probe-01",
      voice_pilot: { enabled: true, reason: "TARGETING_MATCH; segment=voice_rollout", fallback: false },
      setup_entry: { variant: "form_first", in_experiment: true, fallback: false },
    });
  });

  it("sends exactly the fixed non-internal owner traits for every probe", async () => {
    const fake = installFake();
    await runProbes();
    expect(PROBE_TRAITS).toEqual({
      role: "owner",
      preferred_language: "hi",
      is_internal: false,
      is_first_wedding: true,
    });
    for (const call of fake.getIdentityFlags.mock.calls) {
      expect(call[1]).toEqual({
        preferred_language: "hi",
        role: { value: "owner", transient: true },
        is_internal: { value: false, transient: true },
        is_first_wedding: { value: true, transient: true },
      });
    }
  });

  it("with no key, makes no request and marks every probe as a fallback", async () => {
    const probes = await runProbes();
    expect(probes.rows).toHaveLength(50);
    expect(probes.fallback).toBe(50);
    expect(probes.voice_pilot_on).toBe(0);
    expect(probes.rows.every((row) => row.voice_pilot.fallback && row.setup_entry.fallback)).toBe(true);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe("the full check (6.7 items 1-6)", () => {
  it("adds the SDK probe: one trackEvent of jashn_selfcheck_sdk for probe-selfcheck, then a flush", async () => {
    const fake = installFake();
    const result = await runFullCheck();
    expect(fake.trackEvent).toHaveBeenCalledTimes(1);
    expect(fake.trackEvent).toHaveBeenCalledWith(FLAG_EVENTS.selfcheck_sdk, { identifier: SELFCHECK_IDENTITY });
    expect(fake.trackExposureEvent).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(fake.flushEvents).toHaveBeenCalledTimes(1));
    expect(result.sdk_probe.status).toBe("queued");
    expect(result.environment_flags.map((row) => row.key)).toEqual([...FLAG_KEYS]);
    expect(result.environment_flags.find((row) => row.key === "card_renderer")).toMatchObject({
      value: "chromium",
      fallback: false,
    });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1); // item 5, the direct events probe
  });

  it("with no key, skips the SDK probe and reports every flag as a fallback", async () => {
    const result = await runFullCheck();
    expect(result.summary.ok).toBe(false);
    expect(result.summary.key_type).toBe("missing");
    expect(result.summary.fallback_flags).toEqual([...FLAG_KEYS]);
    expect(result.sdk_probe.status).toBe("skipped");
    expect(result.environment_flags.every((row) => row.fallback)).toBe(true);
  });
});

describe("This session (5.9 part 1, AT-1.9)", () => {
  it("marks every flag fallback when Flagsmith can't be read", async () => {
    const evaluation = await evaluateUserFlags({
      kind: "member",
      user_id: "11111111-1111-4111-8111-111111111111",
      email: "mira.c@example.com",
      display_name: "Mira",
      wedding_id: "22222222-2222-4222-8222-222222222222",
      member_id: "33333333-3333-4333-8333-333333333333",
      role: "owner",
      is_internal: false,
      is_first_wedding: false,
      preferred_language: "hi",
    });
    const session = buildDrawerSession(evaluation);
    expect(session.fallback).toBe(true);
    expect(session.flags.map((row) => row.key)).toEqual([...FLAG_KEYS]);
    expect(session.flags.every((row) => row.fallback)).toBe(true);
    expect(session.identity).toBeNull();
    expect(session.env_label).toBe("unknown");
    expect(session.environment_id_last4).toBeNull();
    expect(session.evaluated_label).toMatch(/^\d{2}:\d{2}:\d{2} IST$/);
  });

  it("shows only the last four characters of the client-side environment key", async () => {
    vi.stubEnv("NEXT_PUBLIC_FLAGSMITH_ENVIRONMENT_ID", "abcdefghWXYZ");
    const fake = installFake();
    const evaluation = await evaluateUserFlags({
      kind: "member",
      user_id: "11111111-1111-4111-8111-111111111111",
      email: "mira.c@example.com",
      display_name: "Mira",
      wedding_id: null,
      member_id: null,
      role: null,
      is_internal: false,
      is_first_wedding: true,
      preferred_language: "en",
    });
    const session = buildDrawerSession(evaluation);
    expect(fake.getIdentityFlags).toHaveBeenCalledTimes(1);
    expect(session.environment_id_last4).toBe("WXYZ");
    expect(JSON.stringify(session)).not.toContain("abcdefgh");
    expect(JSON.stringify(session)).not.toContain("example.com");
    expect(session.identity).toMatch(/^u_[0-9a-f]{32}$/);
    expect(session.flags.find((row) => row.key === "voice_pilot")).toMatchObject({
      enabled: false,
      reason: "DEFAULT",
      fallback: false,
    });
  });
});

describe("Sent by Jashn and the voice-turn counts (5.9 parts 2 and 4)", () => {
  it("reads Production exposure counts through the counts source, with an IST as-of time", async () => {
    const exposureCounts = vi.fn(async () => ({
      arms: [
        { variant: "form_first" as const, exposures: 3, saves: 1 },
        { variant: "voice_first" as const, exposures: 2, saves: 2 },
      ],
      source: "database" as const,
      note: null,
    }));
    setDrawerCountsSourceForTests({ exposureCounts, voiceTurnCounts: vi.fn() });
    const sent = await sentByJashn();
    expect(exposureCounts).toHaveBeenCalledWith("production");
    expect(sent.arms).toEqual([
      { variant: "form_first", exposures: 3, saves: 1 },
      { variant: "voice_first", exposures: 2, saves: 2 },
    ]);
    expect(sent.as_of_label).toMatch(/ IST$/);
  });

  it("with no database, shows zero exposures and says why", async () => {
    const sent = await sentByJashn();
    expect(sent.source).toBe("none");
    expect(sent.arms.every((arm) => arm.exposures === 0 && arm.saves === 0)).toBe(true);
    expect(sent.note).toContain("experiment_exposures");
  });

  it("counts only Production turns of the last two hours from the in-memory store", async () => {
    const store = getVoiceTurnStore();
    const now = Date.now();
    const turn = (id: string, minutesAgo: number, env_label: string, status: StoredTurn["status"]) =>
      ({
        voice_turn_id: id,
        user_id: `user-${id}`,
        client_turn_id: `client-${id}`,
        wedding_id: null,
        status,
        flags: { env_label },
        created_at: new Date(now - minutesAgo * 60_000).toISOString(),
        updated_at: new Date(now - minutesAgo * 60_000).toISOString(),
      }) as unknown as StoredTurn;
    const tag = `drawer-${now}`;
    await store.insert(turn(`${tag}-1`, 5, "production", "answered"));
    await store.insert(turn(`${tag}-2`, 30, "production", "failed"));
    await store.insert(turn(`${tag}-3`, 60, "production", "paused"));
    await store.insert(turn(`${tag}-4`, 10, "development", "failed"));
    await store.insert(turn(`${tag}-5`, 150, "production", "failed"));
    const counts = await voiceTurnCounts(now);
    expect(counts).toMatchObject({ env: "production", window_hours: 2, total: 3, failed: 1, paused: 1, source: "memory" });
  });
});
