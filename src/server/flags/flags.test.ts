import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SessionActor } from "@/contracts/domain";
import {
  CHIP_LABELS,
  FLAG_KEYS,
  FLAGSMITH_BREAKER_MS,
  FLAGSMITH_EVENTS_URL,
  FLAGSMITH_SDK_LABEL,
  SELFCHECK_CACHE_MS,
  USER_IDENTITY_PATTERN,
} from "@/contracts/flags";

import {
  resetFlagsmithClientForTests,
  setFlagsmithClientFactoryForTests,
  type FlagsmithClientLike,
  type SdkFlagLike,
  type SdkFlagsLike,
} from "./client";
import { identityKeyFor } from "./identity";
import {
  chipKeyForReason,
  dockFlags,
  evaluateUserFlags,
  getFlagsSummary,
  getRenderFlags,
  isInternalUser,
  onSetupSaved,
  readEnvironmentFlags,
  voiceFlagsRecord,
  voiceGate,
  type UserFlagEvaluation,
} from "./index";
import { resetSelfCheckForTests } from "./selfcheck";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const internalActor: SessionActor = {
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
};

const outsideActor: SessionActor = {
  ...internalActor,
  user_id: "44444444-4444-4444-8444-444444444444",
  email: "nonint-c-1200@example.net",
  role: "manager",
  is_internal: false,
  is_first_wedding: true,
  preferred_language: "en",
};

function sdkFlag(enabled: boolean, value: unknown = null, extra: Partial<SdkFlagLike> = {}): SdkFlagLike {
  return { enabled, value, isDefault: false, ...extra };
}

function healthyFlags(overrides: Record<string, SdkFlagLike | undefined> = {}): SdkFlagsLike {
  const flags: Record<string, SdkFlagLike | undefined> = {
    voice_pilot: sdkFlag(true, null, { reason: "TARGETING_MATCH; segment=internal_team" }),
    voice_writes_enabled: sdkFlag(true),
    spoken_replies: sdkFlag(true),
    setup_entry: sdkFlag(true, "form_first", {
      variant: "form_first",
      experiment: { id: 7, name: "Setup entry", inExperiment: false },
    }),
    setup_entry_synthetic: sdkFlag(true, "form_first"),
    env_label: sdkFlag(true, "development"),
    export_failure_drill: sdkFlag(false, ""),
    card_renderer: sdkFlag(true, "chromium"),
    ...overrides,
  };
  const present = Object.fromEntries(Object.entries(flags).filter(([, flag]) => flag !== undefined)) as Record<
    string,
    SdkFlagLike
  >;
  return { flags: present };
}

type FakeClient = {
  getEnvironmentFlags: ReturnType<typeof vi.fn>;
  getIdentityFlags: ReturnType<typeof vi.fn>;
};

function installClient(
  impl: Partial<{ env: () => Promise<SdkFlagsLike>; identity: (id: string, traits?: unknown) => Promise<SdkFlagsLike> }> = {},
  key = "ser.test-environment-key",
): FakeClient {
  const client: FakeClient = {
    getEnvironmentFlags: vi.fn(impl.env ?? (async () => healthyFlags())),
    getIdentityFlags: vi.fn(impl.identity ?? (async () => healthyFlags())),
  };
  setFlagsmithClientFactoryForTests(() => client as unknown as FlagsmithClientLike);
  vi.stubEnv("FLAGSMITH_SERVER_KEY", key);
  vi.stubEnv("FLAGSMITH_ID_SALT", "test-salt-value");
  return client;
}

beforeEach(() => {
  vi.stubEnv("FLAGSMITH_SERVER_KEY", "");
  vi.stubEnv("FLAGSMITH_ID_SALT", "");
  vi.stubEnv("INTERNAL_USER_EMAILS", "");
  vi.stubEnv("EXPORT_FAILURE_DRILL", "");
  setFlagsmithClientFactoryForTests(null);
  resetFlagsmithClientForTests();
  resetSelfCheckForTests();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  vi.restoreAllMocks();
  setFlagsmithClientFactoryForTests(null);
  resetFlagsmithClientForTests();
  resetSelfCheckForTests();
});

// ---------------------------------------------------------------------------
// FV8: fallbacks with no key
// ---------------------------------------------------------------------------

describe("fallbacks with no Flagsmith key (FV8, 6.8)", () => {
  it("serves every contract fallback to an internal account, with voice on", async () => {
    const evaluation = await evaluateUserFlags(internalActor);
    expect(evaluation.fallback).toBe(true);
    expect(evaluation.identity).toBeNull();
    expect(evaluation.env_label).toBe("unknown");
    expect(evaluation.flags.voice_pilot).toMatchObject({ enabled: true, fallback: true });
    expect(evaluation.flags.voice_writes_enabled).toMatchObject({ enabled: false, fallback: true });
    expect(evaluation.flags.spoken_replies).toMatchObject({ enabled: true, fallback: true });
    expect(evaluation.flags.setup_entry).toMatchObject({ enabled: true, value: "form_first", fallback: true });
    expect(evaluation.flags.card_renderer).toMatchObject({ enabled: true, value: "chromium", fallback: true });
    expect(evaluation.flags.export_failure_drill).toMatchObject({ enabled: false, fallback: true });
    expect(evaluation.flags.setup_entry_synthetic).toMatchObject({ enabled: false, value: null, fallback: true });
  });

  it("turns voice off for a non-internal account", async () => {
    const evaluation = await evaluateUserFlags(outsideActor);
    expect(evaluation.flags.voice_pilot).toMatchObject({ enabled: false, fallback: true });
    expect(dockFlags(evaluation, outsideActor)).toEqual({
      voice_available: false,
      writes_enabled: false,
      spoken_replies: true,
      chip: null,
      fallback: true,
    });
  });

  it("gives an internal account the safe-mode chip and no voice writes", async () => {
    const evaluation = await evaluateUserFlags(internalActor);
    const dock = dockFlags(evaluation, internalActor);
    expect(dock.voice_available).toBe(true);
    expect(dock.writes_enabled).toBe(false);
    expect(dock.chip).toEqual({
      key: "safe_mode",
      label_en: CHIP_LABELS.safe_mode.label_en,
      label_hi: CHIP_LABELS.safe_mode.label_hi,
    });
  });

  it("makes no call and identifies nobody without the salt, even with a key", async () => {
    const client = installClient();
    vi.stubEnv("FLAGSMITH_ID_SALT", "");
    const evaluation = await evaluateUserFlags(internalActor);
    expect(evaluation.identity).toBeNull();
    expect(evaluation.fallback).toBe(true);
    expect(client.getIdentityFlags).not.toHaveBeenCalled();
  });

  it("reads environment fallbacks: drill disabled, renderer chromium, switch off", async () => {
    const flags = await readEnvironmentFlags();
    expect(Object.keys(flags).sort()).toEqual([...FLAG_KEYS].sort());
    expect(flags.export_failure_drill).toEqual({ enabled: false, value: "", fallback: true });
    expect(flags.card_renderer).toEqual({ enabled: true, value: "chromium", fallback: true });
    expect(flags.voice_writes_enabled).toEqual({ enabled: false, value: null, fallback: true });
    expect(flags.voice_pilot.enabled).toBe(false);
  });

  it("uses EXPORT_FAILURE_DRILL only when Flagsmith can't be read (3.6)", async () => {
    vi.stubEnv("EXPORT_FAILURE_DRILL", "wedding-sample-c");
    const unreadable = await readEnvironmentFlags();
    expect(unreadable.export_failure_drill).toEqual({ enabled: true, value: "wedding-sample-c", fallback: true });

    installClient();
    const answered = await readEnvironmentFlags();
    expect(answered.export_failure_drill).toEqual({ enabled: false, value: "", fallback: false });
  });

  it("passes an armed drill through from Flagsmith", async () => {
    installClient({ env: async () => healthyFlags({ export_failure_drill: sdkFlag(true, "wedding-sample-c") }) });
    const flags = await readEnvironmentFlags();
    expect(flags.export_failure_drill).toEqual({ enabled: true, value: "wedding-sample-c", fallback: false });
  });

  it("leaves the setup-saved hook a no-op that never throws", async () => {
    await expect(
      onSetupSaved({
        actor: internalActor,
        outcome: "applied",
        is_create: true,
        wedding_id: null,
        setup_opened_at: null,
        committed_at: "2026-11-25T13:00:00+05:30",
      }),
    ).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// The voice gate (3.2)
// ---------------------------------------------------------------------------

describe("voiceGate (fails closed, D47)", () => {
  it("answers paused/unreadable with no key", async () => {
    await expect(voiceGate("record_payment")).resolves.toEqual({ status: "paused", cause: "unreadable" });
  });

  it("answers paused/switch_off when the switch is disabled", async () => {
    installClient({ env: async () => healthyFlags({ voice_writes_enabled: sdkFlag(false) }) });
    await expect(voiceGate("record_payment")).resolves.toEqual({ status: "paused", cause: "switch_off" });
  });

  it("answers enabled when the switch is on", async () => {
    installClient();
    await expect(voiceGate("record_payment")).resolves.toEqual({ status: "enabled" });
  });

  it("answers paused/unreadable when the flag is missing", async () => {
    installClient({ env: async () => healthyFlags({ voice_writes_enabled: undefined }) });
    await expect(voiceGate("record_payment")).resolves.toEqual({ status: "paused", cause: "unreadable" });
  });

  it("never throws when the client throws", async () => {
    installClient({
      env: async () => {
        throw new Error("boom");
      },
    });
    await expect(voiceGate("publish_itinerary")).resolves.toEqual({ status: "paused", cause: "unreadable" });
  });

  it("reads the switch fresh on every command", async () => {
    let on = true;
    const client = installClient({ env: async () => healthyFlags({ voice_writes_enabled: sdkFlag(on) }) });
    await expect(voiceGate("record_payment")).resolves.toEqual({ status: "enabled" });
    on = false;
    await expect(voiceGate("record_payment")).resolves.toEqual({ status: "paused", cause: "switch_off" });
    expect(client.getEnvironmentFlags).toHaveBeenCalledTimes(2);
  });

  it("logs one line per refusal with the command and the cause, no user data", async () => {
    installClient({ env: async () => healthyFlags({ voice_writes_enabled: sdkFlag(false) }) });
    await voiceGate("record_payment");
    expect(console.info).toHaveBeenCalledWith("voice-gate paused command=record_payment cause=switch off");
  });
});

// ---------------------------------------------------------------------------
// The breaker (6.3)
// ---------------------------------------------------------------------------

describe("the 30 s breaker", () => {
  it("serves fallbacks without calling Flagsmith for 30 s after a failure", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-25T07:30:00Z"));
    let fail = true;
    const client = installClient({
      env: async () => {
        if (fail) throw new Error("timeout");
        return healthyFlags();
      },
    });

    expect((await readEnvironmentFlags()).voice_writes_enabled.fallback).toBe(true);
    expect(client.getEnvironmentFlags).toHaveBeenCalledTimes(1);

    fail = false;
    vi.setSystemTime(new Date(Date.now() + FLAGSMITH_BREAKER_MS - 1_000));
    expect((await readEnvironmentFlags()).voice_writes_enabled.fallback).toBe(true);
    expect(await voiceGate("record_payment")).toEqual({ status: "paused", cause: "unreadable" });
    expect(client.getEnvironmentFlags).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date(Date.now() + 2_000));
    expect((await readEnvironmentFlags()).voice_writes_enabled).toEqual({ enabled: true, value: null, fallback: false });
    expect(client.getEnvironmentFlags).toHaveBeenCalledTimes(2);
  });

  it("opens on an empty answer (the SDK's default handler swallowing a 5xx)", async () => {
    const client = installClient({ env: async () => ({ flags: {} }) });
    await readEnvironmentFlags();
    await readEnvironmentFlags();
    expect(client.getEnvironmentFlags).toHaveBeenCalledTimes(1);
  });

  it("also covers user evaluations", async () => {
    const client = installClient({
      identity: async () => {
        throw new Error("network");
      },
    });
    const first = await evaluateUserFlags(internalActor);
    const second = await evaluateUserFlags(internalActor);
    expect(first.fallback && second.fallback).toBe(true);
    expect(client.getIdentityFlags).toHaveBeenCalledTimes(1);
    expect(first.identity).toMatch(USER_IDENTITY_PATTERN);
  });
});

// ---------------------------------------------------------------------------
// Identity and traits (2.2, 2.3)
// ---------------------------------------------------------------------------

describe("identity and traits", () => {
  it("makes a stable u_ key from the salt and user id", () => {
    const key = identityKeyFor(internalActor.user_id, "salt-a");
    expect(key).toMatch(USER_IDENTITY_PATTERN);
    expect(identityKeyFor(internalActor.user_id, "salt-a")).toBe(key);
    expect(identityKeyFor(outsideActor.user_id, "salt-a")).not.toBe(key);
    expect(identityKeyFor(internalActor.user_id, "salt-b")).not.toBe(key);
    expect(key).not.toContain(internalActor.user_id);
  });

  it("sends the identity and traits, transient except preferred_language, and no email", async () => {
    const client = installClient();
    await evaluateUserFlags(outsideActor);
    expect(client.getIdentityFlags).toHaveBeenCalledTimes(1);
    const [identity, traits] = client.getIdentityFlags.mock.calls[0];
    expect(identity).toBe(identityKeyFor(outsideActor.user_id, "test-salt-value"));
    expect(traits).toEqual({
      preferred_language: "en",
      role: { value: "manager", transient: true },
      is_internal: { value: false, transient: true },
      is_first_wedding: { value: true, transient: true },
    });
    expect(JSON.stringify(traits)).not.toContain("@");
  });

  it("sends role owner and the UI language on /setup", async () => {
    const client = installClient();
    await evaluateUserFlags(outsideActor, { wedding_id: null, ui_language: "hi" });
    const [, traits] = client.getIdentityFlags.mock.calls[0];
    expect(traits).toMatchObject({ preferred_language: "hi", role: { value: "owner", transient: true } });
  });

  it("computes is_internal from the email rules", async () => {
    const client = installClient();
    await evaluateUserFlags({ ...internalActor, is_internal: false });
    const [, traits] = client.getIdentityFlags.mock.calls[0];
    expect(traits).toMatchObject({ is_internal: { value: true, transient: true } });
  });

  describe("isInternalUser", () => {
    it("accepts the session flag", () => {
      expect(isInternalUser({ email: "someone@gmail.com", is_internal: true })).toBe(true);
    });
    it("accepts @example.com in any case", () => {
      expect(isInternalUser({ email: "Diya.C@Example.COM", is_internal: false })).toBe(true);
    });
    it("accepts INTERNAL_USER_EMAILS, ignoring case and spaces", () => {
      vi.stubEnv("INTERNAL_USER_EMAILS", "first@team.test, Second@Team.test");
      expect(isInternalUser({ email: "second@team.TEST", is_internal: false })).toBe(true);
      expect(isInternalUser({ email: "first@team.test", is_internal: false })).toBe(true);
    });
    it("refuses everyone else", () => {
      vi.stubEnv("INTERNAL_USER_EMAILS", "first@team.test");
      expect(isInternalUser({ email: "nonint-c-1200@example.net", is_internal: false })).toBe(false);
      expect(isInternalUser({ email: "x@example.com.evil.net", is_internal: false })).toBe(false);
      expect(isInternalUser({ email: "", is_internal: false })).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// Evaluation, the reason chip and the dock fields (3.1, 6.9)
// ---------------------------------------------------------------------------

describe("evaluation and the reason chip", () => {
  it("reads every flag from Flagsmith with its reason and variant", async () => {
    installClient({
      identity: async () =>
        healthyFlags({
          setup_entry: sdkFlag(true, "voice_first", {
            variant: "voice_first",
            reason: "SPLIT; weight=50",
            experiment: { id: 7, name: "Setup entry", inExperiment: true },
          }),
        }),
    });
    const evaluation = await evaluateUserFlags(outsideActor);
    expect(evaluation.fallback).toBe(false);
    expect(evaluation.env_label).toBe("development");
    expect(evaluation.flags.voice_pilot).toMatchObject({
      enabled: true,
      fallback: false,
      reason: "TARGETING_MATCH; segment=internal_team",
    });
    expect(evaluation.flags.setup_entry).toMatchObject({
      value: "voice_first",
      variant: "voice_first",
      experiment: { id: 7, name: "Setup entry", in_experiment: true },
    });
  });

  it("marks only the missing flag as a fallback, and the evaluation as a fallback", async () => {
    installClient({ identity: async () => healthyFlags({ card_renderer: undefined }) });
    const evaluation = await evaluateUserFlags(internalActor);
    expect(evaluation.flags.card_renderer).toMatchObject({ value: "chromium", fallback: true });
    expect(evaluation.flags.voice_pilot.fallback).toBe(false);
    expect(evaluation.fallback).toBe(true);
  });

  it("reports an unknown env_label value as unknown", async () => {
    installClient({ identity: async () => healthyFlags({ env_label: sdkFlag(true, "staging") }) });
    expect((await evaluateUserFlags(internalActor)).env_label).toBe("unknown");
  });

  it("maps reasons to chip keys", () => {
    expect(chipKeyForReason("TARGETING_MATCH; segment=internal_team")).toBe("internal_team");
    expect(chipKeyForReason("TARGETING_MATCH; segment=voice_rollout")).toBe("voice_rollout");
    expect(chipKeyForReason("STATIC")).toBe("voice_on");
    expect(chipKeyForReason("DEFAULT")).toBe("voice_on");
    expect(chipKeyForReason(null)).toBe("voice_on");
  });

  function evaluationWith(overrides: Partial<UserFlagEvaluation["flags"]>, fallback = false): UserFlagEvaluation {
    const base = Object.fromEntries(
      FLAG_KEYS.map((key) => [key, { enabled: true, value: null, fallback: false, reason: null }]),
    ) as UserFlagEvaluation["flags"];
    return { identity: "u_x", flags: { ...base, ...overrides }, fallback, env_label: "development", latency_ms: 3 };
  }

  it("builds the dock fields for each chip", () => {
    const rollout = evaluationWith({
      voice_pilot: { enabled: true, value: null, fallback: false, reason: "TARGETING_MATCH; segment=voice_rollout" },
    });
    expect(dockFlags(rollout, outsideActor).chip?.key).toBe("voice_rollout");

    const everyone = evaluationWith({ voice_pilot: { enabled: true, value: null, fallback: false, reason: "STATIC" } });
    expect(dockFlags(everyone, outsideActor)).toEqual({
      voice_available: true,
      writes_enabled: true,
      spoken_replies: true,
      chip: { key: "voice_on", label_en: "Voice · on", label_hi: "वॉइस · चालू" },
      fallback: false,
    });

    const team = evaluationWith({
      voice_pilot: { enabled: true, value: null, fallback: false, reason: "TARGETING_MATCH; segment=internal_team" },
    });
    expect(dockFlags(team, internalActor).chip).toEqual({
      key: "internal_team",
      label_en: "Voice · team preview",
      label_hi: "वॉइस · टीम प्रीव्यू",
    });

    const off = evaluationWith({ voice_pilot: { enabled: false, value: null, fallback: false, reason: "DEFAULT" } });
    expect(dockFlags(off, internalActor).chip).toBeNull();
    expect(dockFlags(off, internalActor).voice_available).toBe(false);

    const switchOff = evaluationWith({ voice_writes_enabled: { enabled: false, value: null, fallback: false, reason: null } });
    expect(dockFlags(switchOff, internalActor).writes_enabled).toBe(false);

    const safe = evaluationWith({ card_renderer: { enabled: true, value: "chromium", fallback: true, reason: null } }, true);
    expect(dockFlags(safe, internalActor).chip?.key).toBe("safe_mode");
    expect(dockFlags(safe, outsideActor).chip?.key).toBe("voice_on");
  });

  it("records the turn flags", () => {
    const evaluation = evaluationWith({ spoken_replies: { enabled: false, value: null, fallback: false, reason: null } });
    expect(voiceFlagsRecord(evaluation)).toEqual({
      voice_pilot: true,
      voice_writes_enabled: true,
      spoken_replies: false,
      env_label: "development",
      fallback: false,
    });
  });

  it("evaluates once per call outside a render (no cross-request cache)", async () => {
    const client = installClient();
    await getRenderFlags(internalActor, internalActor.wedding_id);
    await getRenderFlags(internalActor, internalActor.wedding_id);
    expect(client.getIdentityFlags).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// The self-check and the /api/health summary (6.7)
// ---------------------------------------------------------------------------

describe("getFlagsSummary", () => {
  it("reports ok false with no key, every flag a fallback, and no probe", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const summary = await getFlagsSummary();
    expect(summary).toMatchObject({
      ok: false,
      expected_env: "development",
      env_label: "unknown",
      key_type: "missing",
      events_probe_status: null,
      experiment_events: "off",
      latency_ms: null,
      sdk: FLAGSMITH_SDK_LABEL,
    });
    expect([...summary.fallback_flags].sort()).toEqual([...FLAG_KEYS].sort());
    expect(summary.not_created).toEqual(["image_extraction_provider"]);
    expect(summary.note).toBeUndefined();
    expect(summary.checked_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+05:30$/);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(expect.stringMatching(/^flagsmith-selfcheck FAILED 1:/));
  });

  it("reports ok true with a healthy client and a 202 probe", async () => {
    installClient();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 202 }));
    const summary = await getFlagsSummary();
    expect(summary).toMatchObject({
      ok: true,
      expected_env: "development",
      env_label: "development",
      key_type: "server",
      fallback_flags: [],
      events_probe_status: 202,
      experiment_events: "enabled",
      sdk: FLAGSMITH_SDK_LABEL,
    });
    expect(typeof summary.latency_ms).toBe("number");
    expect(console.info).toHaveBeenCalledWith("flagsmith-selfcheck ok");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe(FLAGSMITH_EVENTS_URL);
    expect((init?.headers as Record<string, string>)["X-Environment-Key"]).toBe("ser.test-environment-key");
    const body = JSON.parse(String(init?.body));
    expect(body.events).toHaveLength(1);
    expect(body.events[0]).toMatchObject({
      event: "jashn_selfcheck",
      feature_name: null,
      identifier: "probe-selfcheck",
      value: null,
      traits: null,
      metadata: null,
    });
    expect(typeof body.events[0].timestamp).toBe("number");
  });

  it("goes red on an env_label mismatch, a 401 probe, or a client key", async () => {
    installClient({ env: async () => healthyFlags({ env_label: sdkFlag(true, "production") }) });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 202 }));
    const mismatch = await getFlagsSummary();
    expect(mismatch).toMatchObject({ ok: false, env_label: "production", experiment_events: "off" });

    resetSelfCheckForTests();
    resetFlagsmithClientForTests();
    installClient();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 401 }));
    expect(await getFlagsSummary()).toMatchObject({ ok: false, events_probe_status: 401, experiment_events: "enabled" });

    resetSelfCheckForTests();
    resetFlagsmithClientForTests();
    installClient({}, "client-side-key");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 202 }));
    expect(await getFlagsSummary()).toMatchObject({ ok: false, key_type: "client" });
  });

  it("serves the cached result for 60 s and shares concurrent runs", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-25T07:30:00Z"));
    const client = installClient();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(null, { status: 202 }));

    const [a, b] = await Promise.all([getFlagsSummary(), getFlagsSummary()]);
    expect(a).toBe(b);
    expect(client.getEnvironmentFlags).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date(Date.now() + SELFCHECK_CACHE_MS - 1_000));
    expect(await getFlagsSummary()).toBe(a);
    expect(client.getEnvironmentFlags).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date(Date.now() + 2_000));
    const fresh = await getFlagsSummary();
    expect(fresh).not.toBe(a);
    expect(client.getEnvironmentFlags).toHaveBeenCalledTimes(2);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("lists a created image_extraction_provider as created", async () => {
    installClient({ env: async () => healthyFlags({ image_extraction_provider: sdkFlag(true, "off") }) });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 202 }));
    expect((await getFlagsSummary()).not_created).toEqual([]);
  });
});
