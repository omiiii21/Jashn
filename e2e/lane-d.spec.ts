import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";

/**
 * Lane D's spec. This first part covers the render probe (export-and-recovery 3.6, 8.1):
 * `/run` with the reserved id `probe`, the render page's token and headers, and the font
 * guard. It needs no seeded data and no login (decision D54). Run against the local dev
 * server: E2E_BASE_URL=http://localhost:3004. Secrets come from .env.local and are never
 * printed: every request that carries JOBS_API_TOKEN goes through Node's fetch, because
 * Playwright's request API writes all request headers into its call log, which a failed
 * call prints and a trace stores.
 */

const JOBS_TOKEN = process.env.JOBS_API_TOKEN ?? "";
const RENDER_SECRET = process.env.RENDER_TOKEN_SECRET ?? "";
const RUN = "/api/ops/export-jobs/probe/run";
const REAL_JOB = "5b1e0c2a-7d3f-4c1e-9a52-0f6c2d8e4b17";
const BASE_URL = (process.env.E2E_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const isRemote = BASE_URL.startsWith("https://");

type OpsAnswer = { status: number; headers: Headers; text: string; bytes: Buffer };

/** A POST through Node's fetch, so no header ever lands in a Playwright log or trace. */
async function opsPost(path: string, headers: Record<string, string> = {}): Promise<OpsAnswer> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, { method: "POST", headers, signal: AbortSignal.timeout(80_000) });
  } catch (error) {
    // Report the failure without the request (and so without its headers).
    throw new Error(`POST ${path} failed: ${error instanceof Error ? error.name : "error"}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  return { status: response.status, headers: response.headers, text: bytes.toString("utf8"), bytes };
}

const withToken = () => ({ Authorization: `Bearer ${JOBS_TOKEN}` });

function renderToken(job_id: string, expiresInS = 120): string {
  const expiry = Math.floor(Date.now() / 1000) + expiresInS;
  const mac = createHmac("sha256", RENDER_SECRET).update(`render-card:${job_id}:${expiry}`).digest("base64url");
  return `${expiry}.${mac}`;
}

function pngSize(bytes: Buffer): { width: number; height: number } {
  expect(bytes.subarray(1, 4).toString("ascii")).toBe("PNG");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function expectUnauthenticated(answer: OpsAnswer) {
  expect(answer.status).toBe(401);
  const text = answer.text;
  expect(JSON.parse(text)).toEqual({
    ok: false,
    error: { code: "unauthenticated", message: "Missing or invalid bearer token.", field: "", current: {} },
  });
  // A boolean check: the token itself never reaches an assertion message.
  expect(JOBS_TOKEN !== "" && text.includes(JOBS_TOKEN)).toBe(false);
}

test.describe("render probe", () => {
  test.describe.configure({ mode: "serial", timeout: 90_000 });
  test.skip(({ isMobile }) => isMobile, "API checks run once, on the desktop project");
  test.skip(!JOBS_TOKEN || !RENDER_SECRET, "JOBS_API_TOKEN and RENDER_TOKEN_SECRET must be in .env.local");

  test("P1 shape: /run probe answers a 1080 × 1350 PNG with the timing headers", async () => {
    for (const call of [1, 2]) {
      const answer = await opsPost(RUN, withToken());
      expect(answer.status, `call ${call}`).toBe(200);
      const headers = answer.headers;
      expect(headers.get("content-type")).toBe("image/png");
      expect(headers.get("cache-control")).toBe("no-store");
      for (const name of ["launch", "navigate", "fonts", "capture", "total"]) {
        expect(headers.get(`x-render-${name}-ms`), name).toMatch(/^\d+$/);
      }
      expect(["cold", "warm"]).toContain(headers.get("x-render-instance"));
      if (call === 2) expect(headers.get("x-render-instance")).toBe("warm");
      expect(pngSize(answer.bytes)).toEqual({ width: 1080, height: 1350 });
    }
  });

  test("EX-05: every bad-token variant gets 401 with no detail", async () => {
    const variants: Record<string, string>[] = [
      {},
      { Authorization: `Basic ${JOBS_TOKEN}` },
      { Authorization: "Bearer not-the-token" },
      { Authorization: `Bearer  ${JOBS_TOKEN}` },
      { Authorization: "Bearer" },
      { Authorization: `bearer ${JOBS_TOKEN}` },
      { Authorization: "Bearer jobs-token-old-value-that-was-rotated-out" },
      { Cookie: "sb-access-token=member-session-cookie" },
    ];
    for (const headers of variants) {
      expectUnauthenticated(await opsPost(RUN, headers));
      expectUnauthenticated(await opsPost(`/api/ops/export-jobs/${REAL_JOB}/run`, headers));
    }
  });

  test("a job id other than probe answers 404, with identical bodies for UUIDs and others", async () => {
    const uuid = await opsPost(`/api/ops/export-jobs/${REAL_JOB}/run`, withToken());
    const other = await opsPost("/api/ops/export-jobs/not-a-uuid/run", withToken());
    expect(uuid.status).toBe(404);
    expect(other.status).toBe(404);
    expect(uuid.text).toBe(other.text);
  });

  test("the guard passes when next/font's local fallback faces fail, as on Vercel", async () => {
    test.skip(isRemote, "test modes are refused in production");
    const answer = await opsPost(`${RUN}?test_mode=broken_fallbacks`, withToken());
    expect(answer.status, answer.status === 200 ? "" : answer.text).toBe(200);
    expect(pngSize(answer.bytes)).toEqual({ width: 1080, height: 1350 });
  });

  test("test modes are refused on production", async () => {
    test.skip(!isRemote, "only meaningful against the production URL");
    const answer = await opsPost(`${RUN}?test_mode=block_fonts`, withToken());
    expect(answer.status).toBe(400);
  });

  test("EX-17: with the web fonts blocked the guard fails with FONT_NOT_LOADED", async () => {
    test.skip(isRemote, "test modes are refused in production");
    const answer = await opsPost(`${RUN}?test_mode=block_fonts`, withToken());
    expect(answer.status).toBe(500);
    const body = JSON.parse(answer.text);
    expect(body.error.current.error_code).toBe("FONT_NOT_LOADED");
    expect(body.error.current.message).toMatch(/^Web fonts did not load: .*Devanagari/);
    expect(JSON.stringify(body)).not.toMatch(/https?:|\/render\/|t=/);
  });

  test("EX-18: the render page refuses bad tokens and sends the privacy headers", async ({ request }) => {
    const expired = renderToken("probe", -10);
    const otherJob = renderToken(REAL_JOB);
    for (const query of ["", "?t=", "?t=abc", `?t=${expired}`, `?t=${renderToken("probe", 3_600)}`]) {
      expect((await request.get(`/render/card/probe${query}`)).status(), query || "no token").toBe(404);
    }
    expect((await request.get(`/render/card/probe?t=${otherJob}`)).status()).toBe(404);
    expect((await request.get(`/render/card/${REAL_JOB}?t=${otherJob}`)).status()).toBe(404);

    const ok = await request.get(`/render/card/probe?t=${renderToken("probe")}`);
    expect(ok.status()).toBe(200);
    const headers = ok.headers();
    expect(headers["x-robots-tag"]).toContain("noindex");
    expect(headers["cache-control"]).toContain("no-store");
    expect(headers["referrer-policy"]).toBe("no-referrer");
    expect(headers["access-control-allow-origin"]).toBeUndefined();
  });

  test("EX-18: the probe card shows the sample card and nothing private", async ({ page }) => {
    await page.setViewportSize({ width: 1080, height: 1350 });
    await page.goto(`/render/card/probe?t=${renderToken("probe")}`);
    const card = page.locator("[data-card-root]");
    await expect(card).toBeVisible();
    expect(await card.boundingBox()).toMatchObject({ x: 0, y: 0, width: 1080, height: 1350 });
    const text = (await card.innerText()).replace(/\s+/g, " ");
    for (const expected of ["Mira & Kabir", "शुभ विवाह", "Reception", "Monday, 14 December 2026", "7:30 PM onwards", "Lotus Hall, Mallige Gardens, Whitefield, Bengaluru", "आपकी उपस्थिति से हमें अत्यंत प्रसन्नता होगी।", "Fictional demo data."]) {
      expect(text).toContain(expected);
    }
    for (const banned of ["₹", "Annapoorna", "Tara", "229", "250", "Banyan", "Haldi", "Mehendi", "http", "!"]) {
      expect(text).not.toContain(banned);
    }
    await expect(page.locator('[lang="hi"]')).toHaveCount(4);
    await expect(page.locator("meta[name=robots]")).toHaveAttribute("content", /noindex/);
  });
});
