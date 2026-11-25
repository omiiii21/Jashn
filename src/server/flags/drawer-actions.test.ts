import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SessionActor } from "@/contracts/domain";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  runFullCheck: vi.fn(async () => ({ full: true })),
  runProbes: vi.fn(async () => ({ probes: true })),
  sentByJashn: vi.fn(async () => ({ sent: true })),
  voiceTurnCounts: vi.fn(async () => ({ turns: true })),
  getCachedSelfCheck: vi.fn(async () => ({ check: true })),
}));

vi.mock("@/server/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("./drawer", () => ({
  runFullCheck: mocks.runFullCheck,
  runProbes: mocks.runProbes,
  sentByJashn: mocks.sentByJashn,
  voiceTurnCounts: mocks.voiceTurnCounts,
}));
vi.mock("./selfcheck", () => ({ getCachedSelfCheck: mocks.getCachedSelfCheck }));

import {
  drawerLatestCheck,
  drawerRunFullCheck,
  drawerRunProbes,
  drawerSentByJashn,
  drawerVoiceTurnCounts,
} from "./drawer-actions";

const outsider: SessionActor = {
  kind: "member",
  user_id: "44444444-4444-4444-8444-444444444444",
  email: "nonint-c-1400@example.net",
  display_name: "Tester",
  wedding_id: "22222222-2222-4222-8222-222222222222",
  member_id: "33333333-3333-4333-8333-333333333333",
  role: "owner",
  is_internal: false,
  is_first_wedding: true,
  preferred_language: "en",
};

const insider: SessionActor = { ...outsider, user_id: "11111111-1111-4111-8111-111111111111", email: "mira.c@example.com" };

const ACTIONS = [
  { name: "drawerLatestCheck", run: drawerLatestCheck, inner: mocks.getCachedSelfCheck, data: { check: true } },
  { name: "drawerRunFullCheck", run: drawerRunFullCheck, inner: mocks.runFullCheck, data: { full: true } },
  { name: "drawerRunProbes", run: drawerRunProbes, inner: mocks.runProbes, data: { probes: true } },
  { name: "drawerSentByJashn", run: drawerSentByJashn, inner: mocks.sentByJashn, data: { sent: true } },
  { name: "drawerVoiceTurnCounts", run: drawerVoiceTurnCounts, inner: mocks.voiceTurnCounts, data: { turns: true } },
] as const;

beforeEach(() => {
  vi.stubEnv("INTERNAL_USER_EMAILS", "");
  for (const action of ACTIONS) action.inner.mockClear();
  mocks.getSession.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("every drawer action checks the caller again (flagsmith 5.9)", () => {
  for (const action of ACTIONS) {
    it(`${action.name} refuses a non-internal caller with no data`, async () => {
      mocks.getSession.mockResolvedValue(outsider);
      await expect(action.run()).resolves.toEqual({ ok: false });
      expect(action.inner).not.toHaveBeenCalled();
    });

    it(`${action.name} refuses a signed-out caller`, async () => {
      mocks.getSession.mockResolvedValue(null);
      await expect(action.run()).resolves.toEqual({ ok: false });
      expect(action.inner).not.toHaveBeenCalled();
    });

    it(`${action.name} refuses when the session lookup throws`, async () => {
      mocks.getSession.mockRejectedValue(new Error("no session"));
      await expect(action.run()).resolves.toEqual({ ok: false });
      expect(action.inner).not.toHaveBeenCalled();
    });

    it(`${action.name} answers an internal caller`, async () => {
      mocks.getSession.mockResolvedValue(insider);
      await expect(action.run()).resolves.toEqual({ ok: true, data: action.data });
      expect(action.inner).toHaveBeenCalledTimes(1);
    });
  }

  it("treats an email listed in INTERNAL_USER_EMAILS as internal", async () => {
    vi.stubEnv("INTERNAL_USER_EMAILS", "nonint-c-1400@example.net");
    mocks.getSession.mockResolvedValue(outsider);
    await expect(drawerRunProbes()).resolves.toEqual({ ok: true, data: { probes: true } });
  });
});
