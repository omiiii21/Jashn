import { describe, expect, it } from "vitest";

import { FLAG_KEYS, type EnvironmentFlags, type FlagValue, type SetupSavedInput } from "@/contracts/flags";
import type { SessionActor } from "@/contracts/domain";

import { createMemoryExposureStore } from "./exposures";
import type { ExperimentEventsSdk } from "./setup-render";
import { handleSetupSaved, secondsToSave, type SetupSavedDeps } from "./setup-saved";

const actor: SessionActor = {
  kind: "member",
  user_id: "66666666-6666-4666-8666-666666666666",
  email: "nonint-c-1405@example.net",
  display_name: "Tester",
  wedding_id: null,
  member_id: null,
  role: null,
  is_internal: false,
  is_first_wedding: true,
  preferred_language: "en",
};

const WEDDING = "77777777-7777-4777-8777-777777777777";

function envFlags(patch: Partial<EnvironmentFlags> = {}): EnvironmentFlags {
  const served: FlagValue = { enabled: true, value: null, fallback: false };
  const all = Object.fromEntries(FLAG_KEYS.map((key) => [key, served])) as EnvironmentFlags;
  return { ...all, env_label: { enabled: true, value: "development", fallback: false }, ...patch };
}

function saved(patch: Partial<SetupSavedInput> = {}): SetupSavedInput {
  return {
    actor,
    outcome: "applied",
    is_create: true,
    wedding_id: WEDDING,
    setup_opened_at: "2026-11-25T09:00:00.000Z",
    committed_at: "2026-11-25T09:02:05.500Z",
    ...patch,
  };
}

function fakeSdk() {
  const sdk: ExperimentEventsSdk & { events: unknown[]; flushes: number } = {
    events: [],
    flushes: 0,
    trackExposureEvent() {},
    trackEvent(event, opts) {
      this.events.push({ event, ...opts });
    },
    async flushEvents() {
      this.flushes += 1;
    },
  };
  return sdk;
}

function deps(patch: Partial<SetupSavedDeps> = {}) {
  const sdk = fakeSdk();
  const store = createMemoryExposureStore();
  const all: SetupSavedDeps = {
    readEnvironment: async () => envFlags(),
    sdk,
    store,
    ownedWeddings: async () => 1,
    node_env: "development",
    identity: () => "u_ffffffffffffffffffffffffffffffff",
    log: () => {},
    ...patch,
  };
  return { all, sdk, store };
}

describe("secondsToSave", () => {
  it("clamps to 0–3600 and leaves out a missing or future start", () => {
    expect(secondsToSave("2026-11-25T09:00:00Z", "2026-11-25T09:00:59.900Z")).toBe(59);
    expect(secondsToSave("2026-11-25T07:00:00Z", "2026-11-25T09:00:00Z")).toBe(3600);
    expect(secondsToSave("2026-11-25T09:00:00Z", "2026-11-25T09:00:00Z")).toBe(0);
    expect(secondsToSave(null, "2026-11-25T09:00:00Z")).toBeNull();
    expect(secondsToSave("2026-11-25T09:10:00Z", "2026-11-25T09:00:00Z")).toBeNull();
    expect(secondsToSave("not a time", "2026-11-25T09:00:00Z")).toBeNull();
  });
});

describe("the setup-saved hook (flagsmith 5.4)", () => {
  it("sends setup_saved with the seconds from setup_opened_at when there is no row, then flushes", async () => {
    const { all, sdk } = deps();
    await expect(handleSetupSaved(saved(), all)).resolves.toBe("sent");
    expect(sdk.events).toEqual([{ event: "setup_saved", identifier: "u_ffffffffffffffffffffffffffffffff", value: 125 }]);
    expect(sdk.flushes).toBe(1);
  });

  it("measures from the exposure row's exposed_at and marks the row converted", async () => {
    const { all, sdk, store } = deps();
    await store.insertIfAbsent({
      user_id: actor.user_id,
      experiment: "setup_entry",
      flagsmith_env: "development",
      flagsmith_experiment_id: "42",
      identity_key: "u_ffffffffffffffffffffffffffffffff",
      variant: "voice_first",
      exposed_at: "2026-11-25T08:58:00.000Z",
    });
    await handleSetupSaved(saved(), all);
    expect(sdk.events).toEqual([{ event: "setup_saved", identifier: "u_ffffffffffffffffffffffffffffffff", value: 245 }]);
    const row = await store.get({ user_id: actor.user_id, experiment: "setup_entry", flagsmith_env: "development" });
    expect(row).toMatchObject({ converted_at: "2026-11-25T09:02:05.500Z", seconds_to_save: 245, wedding_id: WEDDING });
    expect((await store.countsByArm("setup_entry", "development")).voice_first).toEqual({ exposures: 1, saves: 1 });
  });

  it("omits the value when there is no start time", async () => {
    const { all, sdk } = deps();
    await handleSetupSaved(saved({ setup_opened_at: null }), all);
    expect(sdk.events).toEqual([{ event: "setup_saved", identifier: "u_ffffffffffffffffffffffffffffffff" }]);
  });

  it("does nothing for a replay, an unchanged save or an update", async () => {
    for (const patch of [{ outcome: "replayed" as const }, { outcome: "unchanged" as const }, { is_create: false }, { wedding_id: null }]) {
      const { all, sdk } = deps();
      await expect(handleSetupSaved(saved(patch), all)).resolves.toBe("skip_not_create");
      expect(sdk.events).toEqual([]);
      expect(sdk.flushes).toBe(0);
    }
  });

  it("does nothing for an internal account", async () => {
    const { all, sdk } = deps();
    await expect(handleSetupSaved(saved({ actor: { ...actor, email: "setup-c-1400@example.com" } }), all)).resolves.toBe("skip_internal");
    expect(sdk.events).toEqual([]);
  });

  it("does nothing unless the user now owns exactly one wedding", async () => {
    const { all, sdk } = deps({ ownedWeddings: async () => 2 });
    await expect(handleSetupSaved(saved(), all)).resolves.toBe("skip_not_first_wedding");
    expect(sdk.events).toEqual([]);
  });

  it("does nothing when a flag fell back or env_label doesn't match", async () => {
    const fallback = deps({ readEnvironment: async () => envFlags({ voice_pilot: { enabled: false, value: null, fallback: true } }) });
    await expect(handleSetupSaved(saved(), fallback.all)).resolves.toBe("skip_fallback");
    expect(fallback.sdk.events).toEqual([]);

    const mismatch = deps({ readEnvironment: async () => envFlags({ env_label: { enabled: true, value: "production", fallback: false } }) });
    await expect(handleSetupSaved(saved(), mismatch.all)).resolves.toBe("skip_env_mismatch");
    expect(mismatch.sdk.events).toEqual([]);
  });

  it("never throws", async () => {
    const { all } = deps({
      readEnvironment: async () => {
        throw new Error("down");
      },
    });
    await expect(handleSetupSaved(saved(), all)).resolves.toBe("failed");
  });
});
