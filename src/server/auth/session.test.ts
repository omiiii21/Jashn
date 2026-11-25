import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fixtureSessionActor } from "@/contracts/fixtures";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { buildUserActor, getSession, getSignedInUser, isLiveAuth, loadMemberActor, requireMember } from "./session";

vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: vi.fn() }));

const OTHER_WEDDING = "0f9a2c1e-1111-4111-8111-111111111111";
const USER_ID = "7d3c1b2a-2222-4222-8222-222222222222";

describe("session helper in fixture mode (no Supabase keys yet)", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const mira = fixtureSessionActor("mira", "demo");

  it("is not live", () => {
    expect(isLiveAuth()).toBe(false);
  });

  it("returns the fixture member from getSession", async () => {
    await expect(getSession()).resolves.toEqual(mira);
  });

  it("re-points requireMember and loadMemberActor at the requested wedding", async () => {
    await expect(requireMember(OTHER_WEDDING)).resolves.toEqual({ ...mira, wedding_id: OTHER_WEDDING });
    const user = await getSignedInUser();
    expect(user).toEqual({ user_id: mira.user_id, email: mira.email });
    await expect(loadMemberActor(user!, OTHER_WEDDING)).resolves.toEqual({ ...mira, wedding_id: OTHER_WEDDING });
  });

  it("builds the no-wedding actor with null wedding, member and role", async () => {
    const actor = await buildUserActor({ user_id: mira.user_id, email: mira.email });
    expect(actor).toMatchObject({ wedding_id: null, member_id: null, role: null, user_id: mira.user_id });
  });
});

describe("getSignedInUser in live mode (getClaims mocked)", () => {
  const mockedClient = vi.mocked(createSupabaseServerClient);

  function claimsResult(result: unknown) {
    mockedClient.mockResolvedValue({ auth: { getClaims: vi.fn().mockResolvedValue(result) } } as never);
  }

  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://session-unit.invalid");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "session-unit-anon-key");
    vi.stubEnv("DATABASE_URL", "postgresql://unused@127.0.0.1:1/unused");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    mockedClient.mockReset();
  });

  it("is live", () => {
    expect(isLiveAuth()).toBe(true);
  });

  it("returns sub and the lowercased email", async () => {
    claimsResult({ data: { claims: { sub: USER_ID, email: " Mira.A@Example.com " } }, error: null });
    await expect(getSignedInUser()).resolves.toEqual({ user_id: USER_ID, email: "mira.a@example.com" });
  });

  it.each([
    ["no session", { data: null, error: null }],
    ["an auth error", { data: null, error: { name: "AuthApiError", status: 401 } }],
    ["an anonymous user", { data: { claims: { sub: USER_ID, is_anonymous: true } }, error: null }],
    ["a sub that isn't a uuid", { data: { claims: { sub: "service_role" } }, error: null }],
  ])("reads %s as signed out", async (_label, result) => {
    claimsResult(result);
    await expect(getSignedInUser()).resolves.toBeNull();
  });

  it("reads a Supabase failure as signed out, never a crash", async () => {
    mockedClient.mockRejectedValue(new Error("network down"));
    await expect(getSignedInUser()).resolves.toBeNull();
  });

  it("sends a signed-out visitor from requireMember to /login", async () => {
    claimsResult({ data: null, error: null });
    await expect(requireMember(OTHER_WEDDING)).rejects.toMatchObject({ digest: expect.stringContaining(";/login;") });
  });

  it("returns null from getSession when signed out", async () => {
    claimsResult({ data: null, error: null });
    await expect(getSession()).resolves.toBeNull();
  });
});
