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

/** A request through Node's fetch, so no header ever lands in a Playwright log or trace. */
async function opsCall(method: "GET" | "POST", path: string, headers: Record<string, string> = {}, body?: string): Promise<OpsAnswer> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, { method, headers, body, signal: AbortSignal.timeout(80_000) });
  } catch (error) {
    // Report the failure without the request (and so without its headers).
    throw new Error(`${method} ${path} failed: ${error instanceof Error ? error.name : "error"}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  return { status: response.status, headers: response.headers, text: bytes.toString("utf8"), bytes };
}

const opsPost = (path: string, headers: Record<string, string> = {}) => opsCall("POST", path, headers);

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

/**
 * The guest site (domain 4.6, 7.3; acceptance AT-4.1 to AT-4.9, AT-9.4, AT-9.5), on the
 * phone project at 390 × 844 with touch. Before the 14:45 merge it runs on the fixture
 * services with Tara's fixture link. On copy d, set E2E_GUEST_TOKEN (never committed);
 * traces then hold that token, so keep them local (acceptance 8.2 item 3).
 * AT-9.5's same-origin check ignores the dev server's `/_next/webpack-hmr` socket.
 */
test.describe("guest site", () => {
  test.skip(({ isMobile }) => !isMobile, "the guest page is checked on the phone project");

  const FIXTURE_TOKEN = `fixture-tara-h16-${"A".repeat(26)}`;
  const GUEST_TOKEN = process.env.E2E_GUEST_TOKEN ?? FIXTURE_TOKEN;
  const SITE = `/i/${GUEST_TOKEN}`;
  const BAD_TOKEN = `fixture-tara-h16-${"B".repeat(26)}`;

  type Sent = { url: string; body: Record<string, unknown> };

  function collectPosts(page: import("@playwright/test").Page, path: string): Sent[] {
    const sent: Sent[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST" && request.url().includes(path)) {
        sent.push({ url: request.url(), body: JSON.parse(request.postData() ?? "{}") });
      }
    });
    return sent;
  }

  test("AT-4.1: exactly two inserts, Sangeet then Reception, and nothing private", async ({ page }) => {
    const response = await page.goto(SITE);
    expect(response?.status()).toBe(200);
    const inserts = page.locator("[data-insert]");
    await expect(inserts).toHaveCount(2);
    await expect(inserts.nth(0).locator("h2")).toHaveText("Sangeet");
    await expect(inserts.nth(1).locator("h2")).toHaveText("Reception");

    const sangeet = (await inserts.nth(0).innerText()).replace(/\s+/g, " ");
    for (const expected of ["संगीत", "Sun 13 Dec 2026, 7:00 pm", "Garden Hall, Mallige Gardens, Whitefield", "Indo-western, some sparkle", "Directions"]) {
      expect(sangeet).toContain(expected);
    }
    const reception = (await inserts.nth(1).innerText()).replace(/\s+/g, " ");
    for (const expected of ["रिसेप्शन", "Mon 14 Dec 2026, 7:30 pm", "Mallige Gardens, Whitefield", "Formal evening", "Dinner follows."]) {
      expect(reception).toContain(expected);
    }

    const text = (await page.locator("main").innerText()).replace(/\s+/g, " ");
    for (const expected of [
      "शुभ विवाह",
      "With the blessings of our families",
      "Mira & Kabir",
      "invite you to celebrate their wedding",
      "Mira & Kabir · 14 December 2026 · Bengaluru",
      "Fictional demo data",
      "Yes, attending",
      "Can't come",
      "Food preferences (optional)",
      "Send reply to the families",
      "You can change your reply later from this link.",
    ]) {
      expect(text).toContain(expected);
    }
    for (const banned of ["₹", "Mehendi", "मेहंदी", "Haldi", "हल्दी", "Lotus Hall", "Annapoorna", "Nikhil", "celebrations"]) {
      expect(text).not.toContain(banned);
    }
    await expect(page.locator("[data-insert] h2", { hasText: "Wedding" })).toHaveCount(0);

    for (const choice of await page.locator("[data-rsvp-choice]").all()) {
      expect((await choice.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(48);
    }
    const directions = page.getByRole("link", { name: "Directions" });
    await expect(directions).toHaveCount(2);
    for (const link of await directions.all()) {
      await expect(link).toHaveAttribute("rel", /noreferrer/);
      await expect(link).toHaveAttribute("target", "_blank");
    }
    // No horizontal scroll at 390 px (acceptance 6.4).
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });

  test("AT-4.1: the हिंदी toggle switches the strings and marks the page Hindi", async ({ page }) => {
    await page.goto(SITE);
    await page.getByRole("link", { name: "हिंदी" }).click();
    await expect(page).toHaveURL(/\?lang=hi$/);
    await expect(page.locator("main[lang=hi]")).toHaveCount(1);
    await expect(page.getByRole("button", { name: "परिवारों को जवाब भेजें" })).toBeVisible();
    await expect(page.getByText("हाँ, आएँगे").first()).toBeVisible();
    await page.getByRole("link", { name: "English" }).click();
    await expect(page.locator("main[lang=en]")).toHaveCount(1);
  });

  test("AT-4.2 / AT-4.3: a double tap sends the same key twice and the second is replayed", async ({ page }) => {
    await page.goto(SITE);
    const sent = collectPosts(page, "/rsvp");
    const outcomes: string[] = [];
    page.on("response", async (response) => {
      if (response.request().method() === "POST" && response.url().includes("/rsvp")) {
        outcomes.push(((await response.json()) as { outcome?: string }).outcome ?? `status ${response.status()}`);
      }
    });

    const reception = page.locator("[data-insert]").nth(1);
    await reception.locator('[data-rsvp-choice="attending"]').tap();
    await expect(reception.getByRole("radio", { name: "Yes, attending" })).toBeChecked();
    await page.getByRole("button", { name: "Send reply to the families" }).dblclick();

    await expect(page.getByText("Thank you, Tara. The families have your reply")).toBeVisible();
    await expect(page.getByRole("button", { name: "Change reply" })).toBeVisible();
    await expect.poll(() => outcomes.length).toBe(2);

    expect(sent).toHaveLength(2);
    expect(sent[0].body.idempotency_key).toEqual(sent[1].body.idempotency_key);
    expect(sent[0].body).toEqual(sent[1].body);
    const responses = sent[0].body.responses as Record<string, unknown>[];
    expect(responses).toHaveLength(1);
    expect(responses[0]).toMatchObject({ rsvp_status: "attending", plus_ones: 0 });
    expect(Object.keys(responses[0]).sort()).toEqual(["event_id", "guest_id", "plus_ones", "rsvp_status"]);
    expect([...outcomes].sort()).toEqual(["applied", "replayed"]);
  });

  test("AT-4.9: a food preference sends a dietary request", async ({ page }) => {
    await page.goto(SITE);
    const sent = collectPosts(page, "/dietary");
    await page.getByRole("textbox", { name: "Food preferences (optional)" }).fill("Mushroom allergy");
    await page.getByRole("button", { name: "Send reply to the families" }).tap();
    await expect(page.getByText("Thank you, Tara.")).toBeVisible();
    expect(sent).toHaveLength(1);
    expect(sent[0].body.dietary_note).toBe("Mushroom allergy");
    expect(typeof sent[0].body.idempotency_key).toBe("string");
  });

  test("AT-9.4: every bad token gets the 404, and the API bodies are identical", async ({ page, request }) => {
    for (const token of [BAD_TOKEN, "A".repeat(42), "abc%25def"]) {
      expect((await page.goto(`/i/${token}`))?.status(), token).toBe(404);
    }
    const bodies: string[] = [];
    for (const token of [BAD_TOKEN, "A".repeat(42)]) {
      const revision = await request.get(`/api/i/${token}/revision`);
      expect(revision.status()).toBe(404);
      bodies.push(await revision.text());
      const rsvp = await request.post(`/api/i/${token}/rsvp`, { data: { idempotency_key: "e2e-bad-token-key", responses: [] } });
      expect(rsvp.status()).toBe(404);
      bodies.push(await rsvp.text());
    }
    expect(new Set(bodies).size).toBe(1);
    expect(JSON.parse(bodies[0])).toEqual({ ok: false, error: { code: "not_found", message: "This page could not be found." } });
  });

  test("AT-9.5: privacy headers, no cookies, and only same-origin requests", async ({ page, request }) => {
    const origin = new URL(BASE_URL).origin;
    const foreign: string[] = [];
    page.on("request", (req) => {
      const url = req.url();
      if (url.startsWith("data:") || url.includes("/_next/webpack-hmr")) return;
      if (new URL(url).origin !== origin) foreign.push(new URL(url).origin);
    });
    const pageResponse = await page.goto(SITE);
    await page.waitForLoadState("networkidle");
    const apiResponse = await request.get(`/api/i/${GUEST_TOKEN}/revision`);
    for (const headers of [pageResponse?.headers() ?? {}, apiResponse.headers()]) {
      expect(headers["referrer-policy"]).toBe("no-referrer");
      expect(headers["x-robots-tag"]).toContain("noindex");
      expect(headers["cache-control"]).toContain("no-store");
      expect(headers["set-cookie"]).toBeUndefined();
    }
    expect(foreign).toEqual([]);
    expect(await page.context().cookies()).toEqual([]);
  });
});

test.describe("ops routes", () => {
  test.skip(({ isMobile }) => isMobile, "API checks run once, on the desktop project");
  test.skip(!JOBS_TOKEN, "JOBS_API_TOKEN must be in .env.local");

  const status = (id: string) => `/api/ops/export-jobs/${id}`;
  const retry = (id: string) => `/api/ops/export-jobs/${id}/retry`;
  const json = { "Content-Type": "application/json" };
  const retryBody = JSON.stringify({ expected_export_key: "export:x:rev3:png" });

  test("EX-05: the status read and the retry refuse every bad bearer with the same 401", async () => {
    const variants: Record<string, string>[] = [{}, { Authorization: "Bearer not-the-token" }, { Authorization: `Bearer  ${JOBS_TOKEN}` }];
    for (const headers of variants) {
      expectUnauthenticated(await opsCall("GET", status(REAL_JOB), headers));
      expectUnauthenticated(await opsCall("POST", retry(REAL_JOB), { ...headers, ...json, "Idempotency-Key": "nb-e2e-0001" }, retryBody));
    }
  });

  test("an unknown job answers the same 404 for a UUID and for anything else", async () => {
    const uuid = await opsCall("GET", status(REAL_JOB), withToken());
    const other = await opsCall("GET", status("not-a-uuid"), withToken());
    expect(uuid.status).toBe(404);
    expect(other.status).toBe(404);
    expect(uuid.text).toBe(other.text);
    expect(JSON.parse(uuid.text)).toMatchObject({ ok: false, error: { code: "not_found" } });
  });

  test("the retry needs an Idempotency-Key and a JSON body, checked before the job is looked up", async () => {
    const noKey = await opsCall("POST", retry(REAL_JOB), { ...withToken(), ...json }, retryBody);
    expect(noKey.status).toBe(400);
    expect(JSON.parse(noKey.text)).toMatchObject({ error: { code: "validation_failed", field: "idempotency_key" } });
    const noBody = await opsCall("POST", retry(REAL_JOB), { ...withToken(), ...json, "Idempotency-Key": "nb-e2e-0002" }, "{");
    expect(noBody.status).toBe(400);
    expect(JSON.parse(noBody.text)).toMatchObject({ error: { code: "validation_failed", field: "body" } });
    const badWait = await opsCall("GET", `${status(REAL_JOB)}?wait=99`, withToken());
    expect([400, 404]).toContain(badWait.status);
  });
});

test.describe("Invite page", () => {
  test.skip(isRemote, "fixture mode only: production needs a signed-in member");

  test("the owner sees the publish control and the card export panel", async ({ page }) => {
    const wedding = "3f71c430-a498-531f-a2ed-12e2267e7ccf";
    const response = await page.goto(`/w/${wedding}/invite`);
    test.skip(response?.status() !== 200, "the fixture member isn't served here (live auth is on)");
    await expect(page.getByRole("heading", { name: "Invitation" })).toBeVisible();
    await expect(page.getByTestId("invite-status")).toContainText("Published revision 2");
    await expect(page.getByRole("button", { name: "Review and publish" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Card export" })).toBeVisible();
    await expect(page.getByText("Ready", { exact: true }).first()).toBeVisible();
    // The page's own content stays inside the viewport (the planner header is the shell's).
    const viewport = page.viewportSize()!.width;
    const overflowing = await page.locator("main").evaluate((main, limit) => {
      return Array.from(main.querySelectorAll("*")).filter((el) => el.getBoundingClientRect().right > limit + 1).length;
    }, viewport);
    expect(overflowing).toBe(0);
  });
});
