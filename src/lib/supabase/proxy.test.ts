import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { proxy } from "@/proxy";

import { refreshSupabaseSession } from "./proxy";

/** NextResponse.next() marks its response with this header. */
const PASS_THROUGH = "x-middleware-next";

describe("refreshSupabaseSession", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("passes the request through untouched without the Supabase env vars", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    const response = await refreshSupabaseSession(new NextRequest("http://localhost:3001/login"));
    expect(response.headers.get(PASS_THROUGH)).toBe("1");
    expect(response.cookies.getAll()).toEqual([]);
  });

  it("makes no network call when the request carries no auth cookie", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://proxy-test.invalid");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "proxy-test-anon-key");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const response = await refreshSupabaseSession(new NextRequest("http://localhost:3001/w/x"));
    expect(response.headers.get(PASS_THROUGH)).toBe("1");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("proxy", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("skips the version poll even if the matcher let it through", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://proxy-test.invalid");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "proxy-test-anon-key");
    const request = new NextRequest("http://localhost:3001/api/w/abc/version", {
      headers: { cookie: "sb-proxytest-auth-token=base64-garbage" },
    });
    const response = await proxy(request);
    expect(response.headers.get(PASS_THROUGH)).toBe("1");
    expect(response.cookies.getAll()).toEqual([]);
  });
});
