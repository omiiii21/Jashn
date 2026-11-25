/**
 * Lane B's spec: the planner shell, the landing view and Annapoorna Caterers' vendor page.
 *
 * Runs in the "desktop" and "mobile" projects, against rehearsal copy `b` only. It never
 * depends on the demo set-up and never reads `e2e/.auth/`: each test opens its own context,
 * and when a page sends it to /login it signs in as Mira on copy `b` through the login page.
 * On the fixture services there is no login and the pages open directly.
 *
 *   E2E_BASE_URL=http://localhost:3002 npx playwright test e2e/lane-b.spec.ts
 */
import { expect, test, type Page } from "@playwright/test";

import { routes } from "../src/contracts/routes";

/** Rehearsal copy `b` and its caterer (demo-data; the fixture ids). */
const WEDDING_ID = "3e546e78-a307-5757-a6e2-2b08e26c0a76";
const CATERER_ID = "7cfd20aa-ff4c-5e4b-9fc9-468eb0914704";
const OWNER_EMAIL = "mira.b@example.com";

/** Acceptance 6.4: every planner screen at these widths. */
const WIDTHS = [360, 390, 768, 1280, 1440] as const;

/** Every planner screen AT-2.12 names, with the vendor page as its own entry. */
const SCREENS = [
  { name: "Overview", path: routes.overview(WEDDING_ID) },
  { name: "Events", path: routes.events(WEDDING_ID) },
  { name: "Guests", path: routes.guests(WEDDING_ID) },
  { name: "Money", path: routes.money(WEDDING_ID) },
  { name: "Vendors", path: routes.vendors(WEDDING_ID) },
  { name: "Annapoorna Caterers", path: routes.vendor(WEDDING_ID, CATERER_ID) },
  { name: "Activity", path: routes.activity(WEDDING_ID) },
  { name: "Shagun", path: routes.shagun(WEDDING_ID) },
  { name: "Invite", path: routes.invite(WEDDING_ID) },
] as const;

/** Anything that looks like a mic or a speak bar, by its accessible name or placeholder. */
const MIC_LIKE = String.raw`micro?phone|\bmic\b|\bvoice\b|\bspeak\b|push to talk|hold to talk|type a request`;

function heightFor(width: number): number {
  if (width <= 430) return 844;
  if (width < 1024) return 1024;
  return 900;
}

/** Signs in as Mira on copy `b`, when the real auth sends us to /login. */
async function signIn(page: Page): Promise<void> {
  const password = process.env.SEED_PASSWORD;
  test.skip(!password, "SEED_PASSWORD is not set, so the spec cannot sign in");
  await page.getByLabel(/email/i).fill(OWNER_EMAIL);
  await page.getByLabel(/password/i).fill(password ?? "");
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await page.waitForURL((url) => url.pathname !== routes.login(), { timeout: 30_000 });
}

/** Opens a planner path, signing in first if the app asks for it. */
async function open(page: Page, path: string): Promise<void> {
  let response = await page.goto(path);
  if (new URL(page.url()).pathname === routes.login()) {
    await signIn(page);
    response = await page.goto(path);
  }
  expect(response?.status(), `${path} answers`).toBeLessThan(400);
  await expect(page.getByRole("banner")).toBeVisible();
}

/** Next's router in dev, exposed as `window.nd.router`; absent in a production build. */
type DevRouter = { refresh(): void; push(href: string, options?: { scroll?: boolean }): void };

/**
 * Refreshes the router the way the poll will: through Next's dev handle when there is one
 * (true), else by the focus and visibility events the real LiveRefresh answers (false).
 */
async function refreshRouter(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const router = (window as unknown as { nd?: { router?: DevRouter } }).nd?.router;
    if (router) {
      router.refresh();
      return true;
    }
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
    return false;
  });
}

/** Two animation frames, so a resize has been laid out. */
async function settle(page: Page): Promise<void> {
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  );
}

type MicReport = {
  slots: number;
  micName: string | null;
  micCenterX: number | null;
  micTop: number | null;
  viewportWidth: number;
  scrollWidth: number;
  /** Mic-like controls outside the header's voice slot. */
  stray: string[];
  /** Mic-like controls in the bottom 120 px of the viewport. */
  bottom: string[];
};

async function micReport(page: Page): Promise<MicReport> {
  return page.evaluate((pattern) => {
    const MIC = new RegExp(pattern, "i");
    const visible = (element: Element) => {
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return box.width > 0 && box.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    };
    const nameOf = (element: Element) =>
      (element.getAttribute("aria-label") ?? element.getAttribute("title") ?? element.textContent ?? "").trim();
    const micLike = (element: Element) =>
      MIC.test(nameOf(element)) || MIC.test(element.getAttribute("placeholder") ?? "");

    const slots = [...document.querySelectorAll('[data-slot="voice"]')];
    const slot = slots.find(visible) ?? null;
    const mic = slot?.querySelector("button") ?? null;
    const box = mic?.getBoundingClientRect() ?? null;

    const controls = [...document.querySelectorAll('button, [role="button"], a[href], input, textarea')].filter(visible);
    const stray = controls.filter((element) => !slot?.contains(element) && micLike(element)).map(nameOf);
    const bottom = controls
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return micLike(element) && rect.bottom > window.innerHeight - 120 && rect.top < window.innerHeight;
      })
      .map(nameOf);

    return {
      slots: slots.length,
      micName: mic ? nameOf(mic) : null,
      micCenterX: box ? box.left + box.width / 2 : null,
      micTop: box ? box.top : null,
      viewportWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      stray,
      bottom,
    };
  }, MIC_LIKE);
}

test.describe("the planner shell (AT-2.12, acceptance 6.4)", () => {
  for (const screen of SCREENS) {
    test(`${screen.name}: one header mic, no bottom speak bar, no sideways scroll, the badge`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.setViewportSize({ width: WIDTHS[0], height: heightFor(WIDTHS[0]) });
      await open(page, screen.path);

      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: heightFor(width) });
        await page.evaluate(() => window.scrollTo(0, 0));
        await settle(page);
        const at = `${screen.name} at ${width} px`;

        // Exactly one voice slot, inside the page's banner header (D20, D121).
        await expect(page.getByRole("banner").locator('[data-slot="voice"]'), at).toHaveCount(1);
        await expect(page.getByRole("banner").locator('[data-slot="voice"] button').first(), at).toBeVisible();

        const report = await micReport(page);
        expect(report.slots, `${at}: voice slots on the page`).toBe(1);
        expect(report.micName, `${at}: the mic has an accessible name`).toBeTruthy();
        expect(report.micCenterX, `${at}: the mic sits in the header's right half`).toBeGreaterThan(report.viewportWidth / 2);
        expect(report.micTop, `${at}: the mic sits at the top of the screen`).toBeLessThan(100);
        expect(report.stray, `${at}: no second mic`).toEqual([]);
        expect(report.bottom, `${at}: nothing mic-like in the bottom 120 px`).toEqual([]);

        // Acceptance 6.4: no horizontal page scroll.
        expect(report.scrollWidth, `${at}: no horizontal page scroll`).toBeLessThanOrEqual(report.viewportWidth);

        // Decision D21: the badge on every planner screen.
        await expect(page.getByText("Fictional demo data", { exact: true }), at).toBeVisible();
      }
    });
  }
});

test.describe("the landing view (D60, D99)", () => {
  test("shows the saved name, dates, city and budget", async ({ page }) => {
    await open(page, routes.overview(WEDDING_ID));
    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { level: 1 })).toHaveText("Mira & Kabir");
    await expect(main).toContainText("13–14 Dec 2026");
    await expect(main).toContainText("Bengaluru");
    await expect(main.locator('[data-field="budget_inr"]')).toHaveText("₹12,00,000");
    await expect(page.getByText("Fictional demo data", { exact: true })).toBeVisible();
    // A title of its own, so the route announcer speaks each move (acceptance 6.5).
    await expect(page).toHaveTitle("Mira & Kabir");
  });
});

test.describe("Annapoorna Caterers at D0 (AT-6.1)", () => {
  test("the contract, the estimate box, the payment and the balance", async ({ page }) => {
    await open(page, routes.vendor(WEDDING_ID, CATERER_ID));
    const main = page.getByRole("main");

    await expect(main.getByRole("heading", { level: 1 })).toHaveText("Annapoorna Caterers");
    await expect(page).toHaveTitle("Annapoorna Caterers, Mira & Kabir");

    // The answer first (design-direction 10.4): Still owed and its due line head the sheet.
    const lead = main.locator("section").filter({ has: page.getByRole("heading", { name: /^Still owed/ }) });
    await expect(lead).toHaveCount(1);
    await expect(lead.locator('[data-field="outstanding_inr"]')).toHaveText("₹1,50,000");
    await expect(lead).toContainText("Balance due Sat 12 Dec");
    await expect(lead.locator('[data-field="outstanding_inr"]')).toBeInViewport();

    await expect(main.locator('[data-field="commitments.amount_inr"]')).toHaveText("250 plates × ₹800 = ₹2,00,000");

    const estimate = main.locator("section").filter({ has: page.locator('[data-field="estimate_inr"]') });
    await expect(estimate).toHaveCount(1);
    await expect(estimate).toContainText("Estimate, not the contract");
    await expect(estimate.locator('[data-field="estimate_inr"]')).toHaveText("₹1,83,200");
    await expect(estimate.locator('p:has([data-field="estimate_inr"])')).toContainText(/^≈/);
    await expect(estimate.locator('[data-field="formula_text"]')).toContainText("229 attending × ₹800");
    await expect(estimate).toContainText("₹16,800 below the contract. The contract changes only if you renegotiate it.");
    await expect(estimate.locator('[data-field="expected_headcount"]')).toHaveText("250");
    await expect(estimate.locator('[data-field="confirmed_headcount"]')).toHaveText("229");

    const advance = main.getByRole("listitem").filter({ hasText: "PAY-01" });
    await expect(advance).toHaveCount(1);
    await expect(advance).toContainText("Advance");
    await expect(advance.locator('[data-field="payments.amount_inr"]')).toHaveText("₹50,000");

    // The balance at the foot: Committed, Paid and Still owed (AT-6.1).
    const balance = main.locator("section").filter({ has: page.getByRole("heading", { name: "Balance" }) });
    await expect(balance.locator('[data-field="committed_inr"]')).toHaveText("₹2,00,000");
    await expect(balance.locator('[data-field="paid_inr"]')).toHaveText("₹50,000");
    await expect(balance.locator('[data-field="outstanding_inr"]')).toHaveText("₹1,50,000");
    await expect(balance.getByText("Still owed", { exact: true })).toBeVisible();
    await expect(main.locator('[data-field="outstanding_inr"]')).toHaveText(["₹1,50,000", "₹1,50,000"]);
    await expect(main).not.toContainText("Outstanding");
    const owed = lead.locator('[data-field="outstanding_inr"]');

    // The ₹ comes from Anek with tabular figures, never a fallback face (design-direction 9, ban 11).
    const type = await owed.evaluate(async (element) => {
      await document.fonts.ready;
      const style = getComputedStyle(element);
      const covers20b9 = (range: string) =>
        range.split(",").some((part) => {
          const [start, end] = part.trim().replace(/^U\+/i, "").split("-");
          const low = parseInt(start.replace(/\?/g, "0"), 16);
          const high = parseInt((end ?? start).replace(/\?/g, "F"), 16);
          return low <= 0x20b9 && 0x20b9 <= high;
        });
      const rupeeFaces = [...document.fonts].filter(
        (face) => /anek/i.test(face.family) && face.status === "loaded" && covers20b9(face.unicodeRange),
      );
      return {
        family: style.fontFamily,
        numeric: style.fontVariantNumeric,
        rupeeFaceLoaded: rupeeFaces.length > 0,
      };
    });
    expect(type.family.split(",")[0]).toMatch(/anek/i);
    expect(type.numeric).toContain("tabular-nums");
    expect(type.rupeeFaceLoaded, "an Anek face covering U+20B9 has loaded").toBe(true);
  });
});

test.describe("the nav", () => {
  for (const width of [1280, 390] as const) {
    test(`every nav link at ${width} px opens a page, and Invite is Lane D's route`, async ({ page }) => {
      await page.setViewportSize({ width, height: heightFor(width) });
      await open(page, routes.overview(WEDDING_ID));

      const nav = page.getByRole("navigation", { name: "Wedding sections" });
      await expect(nav).toHaveCount(1);
      const links = nav.getByRole("link");
      const hrefs = await links.evaluateAll((anchors) => anchors.map((anchor) => anchor.getAttribute("href") ?? ""));

      const expected = [
        routes.overview(WEDDING_ID),
        routes.events(WEDDING_ID),
        routes.guests(WEDDING_ID),
        routes.money(WEDDING_ID),
        routes.vendors(WEDDING_ID),
        routes.invite(WEDDING_ID),
      ];
      for (const href of expected) expect(hrefs, `the nav links to ${href}`).toContain(href);
      await expect(nav.getByRole("link", { name: "Invite" })).toHaveAttribute("href", routes.invite(WEDDING_ID));
      await expect(nav.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");

      // Activity sits in the rail from 1024 px, and in the wedding menu below it.
      if (width >= 1024) {
        await expect(nav.getByRole("link", { name: "Activity" })).toHaveAttribute("href", routes.activity(WEDDING_ID));
        await expect(page.getByRole("button", { name: "Wedding menu" })).toBeHidden();
      } else {
        await page.getByRole("button", { name: "Wedding menu" }).click();
        const activity = page.getByRole("menuitem", { name: "Activity" });
        await expect(activity).toHaveAttribute("href", routes.activity(WEDDING_ID));
        await page.keyboard.press("Escape");
      }

      for (const href of new Set([...hrefs, routes.activity(WEDDING_ID)])) {
        const response = await page.request.get(href);
        expect(response.status(), `${href} answers`).toBeLessThan(400);
      }
    });
  }
});

test.describe("the highlight (D121)", () => {
  test("washes Still owed once and drops the highlight parameter", async ({ page }) => {
    const path = `${routes.vendor(WEDDING_ID, CATERER_ID)}&highlight=outstanding_inr`;
    await open(page, path);
    // Still owed at the head of the sheet, the one on screen (the foot washes with it).
    const owed = page.getByRole("main").locator('[data-field="outstanding_inr"]').first();

    await expect(owed).toHaveClass(/\banimate-wash\b/, { timeout: 10_000 });
    await expect(page).not.toHaveURL(/[?&]highlight=/);
    expect(new URL(page.url()).searchParams.get("vendor_id")).toBe(CATERER_ID);

    // 120 ms in, 1.6 s hold, 1.2 s fade: then it stays off.
    await expect(owed).not.toHaveClass(/\banimate-wash\b/, { timeout: 6_000 });
    await page.waitForTimeout(1_500);
    await expect(owed).not.toHaveClass(/\banimate-wash\b/);

    // The router's own URL is clean too: a refresh (the poll, or a refresh on focus) must
    // not write the parameter back. In dev, Next exposes its router as window.nd.
    const viaRouter = await refreshRouter(page);
    await page.waitForTimeout(1_500);
    await expect(page).not.toHaveURL(/[?&]highlight=/);

    // The clean URL never washes again.
    await page.reload();
    await expect(owed).toHaveText("₹1,50,000");
    await page.waitForTimeout(2_000);
    await expect(owed).not.toHaveClass(/\banimate-wash\b/);

    // Asking the same question again washes again (a client navigation, as voice makes it).
    if (viaRouter) {
      await page.evaluate(
        (target) => (window as unknown as { nd?: { router?: DevRouter } }).nd?.router?.push(target, { scroll: false }),
        path,
      );
      await expect(owed).toHaveClass(/\banimate-wash\b/, { timeout: 10_000 });
      await expect(page).not.toHaveURL(/[?&]highlight=/);
    }
  });
});

test.describe("focus after a route change (acceptance 6.5)", () => {
  test("opening a vendor from the list, and going back, moves focus to the main content", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: heightFor(1280) });
    await open(page, routes.vendors(WEDDING_ID));
    await expect(page).toHaveTitle("Vendors, Mira & Kabir");

    await page.getByRole("main").getByRole("link", { name: "Annapoorna Caterers" }).focus();
    await page.keyboard.press("Enter");
    await page.waitForURL((url) => url.searchParams.get("vendor_id") === CATERER_ID);
    await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe("main");

    await page.getByRole("link", { name: "All vendors" }).focus();
    await page.keyboard.press("Enter");
    await page.waitForURL((url) => !url.searchParams.has("vendor_id"));
    await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe("main");
  });
});
