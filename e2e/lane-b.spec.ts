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
/** fixtureIds("b").reception_event_id: the reception, EVT-REC. */
const RECEPTION_ID = "692a852e-0a73-5cbd-b4bf-46c2ad3a803e";
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
    // The mic itself, not the reason chips the dock may render before it (D121).
    const TALK = /hold to talk|push to talk|tap to talk|micro?phone|\bmic\b/i;
    const buttons = slot ? [...slot.querySelectorAll("button")].filter(visible) : [];
    const mic = buttons.find((button) => TALK.test(nameOf(button))) ?? buttons[0] ?? null;
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

    // The ₹ comes from the app's own faces (Geist, then Anek, per Lane E's pick under D132) with
    // tabular figures, never a system fallback face (design-direction 9, ban 11).
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
        (face) => /geist|anek/i.test(face.family) && face.status === "loaded" && covers20b9(face.unicodeRange),
      );
      return {
        family: style.fontFamily,
        numeric: style.fontVariantNumeric,
        rupeeFaceLoaded: rupeeFaces.length > 0,
      };
    });
    expect(type.family.split(",")[0]).toMatch(/geist|anek/i);
    expect(type.numeric).toContain("tabular-nums");
    expect(type.rupeeFaceLoaded, "a Geist or Anek face covering U+20B9 has loaded").toBe(true);
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
        // Mira is an owner: her menu stays at every width for "Team and sharing" (D64, D109).
        await expect(page.getByRole("button", { name: "Wedding menu" })).toBeVisible();
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

/** No horizontal page scroll at the current viewport (acceptance 6.4). */
async function expectNoSideways(page: Page, at: string): Promise<void> {
  await settle(page);
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth, `${at}: no horizontal page scroll`).toBeLessThanOrEqual(innerWidth);
}

test.describe("Money at D0 (AT-5.1, AT-5.2)", () => {
  test("the four figures, Not yet committed, Catering, Mallige Gardens due soon and PRP-01", async ({ page }) => {
    await open(page, routes.money(WEDDING_ID));
    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { level: 1 })).toHaveText("Money");
    await expect(page).toHaveTitle("Money, Mira & Kabir");

    // Budget, Committed, Paid and Still owed, each on its own, then Not yet committed.
    const totals = main.locator("section").filter({ has: page.getByRole("heading", { name: "Budget and spending" }) });
    const rows = totals.locator("dl");
    await expect(rows.locator('[data-field="budget_inr"]')).toHaveText("₹12,00,000");
    await expect(rows.locator('[data-field="total_committed_inr"]')).toHaveText("₹9,27,000");
    await expect(rows.locator('[data-field="total_paid_inr"]')).toHaveText("₹3,97,000");
    await expect(rows.locator('[data-field="total_outstanding_inr"]')).toHaveText("₹5,30,000");
    await expect(rows.locator('[data-field="uncommitted_inr"]')).toHaveText("₹2,73,000");
    await expect(rows).toContainText("Still owed");
    await expect(rows).toContainText("Not yet committed");
    await expect(totals).toContainText(
      "Of the ₹12,00,000 budget, ₹9,27,000 is committed and ₹3,97,000 is paid, so ₹5,30,000 is still owed.",
    );
    await expect(main).not.toContainText("Outstanding");

    // The Catering line of the category table.
    const catering = main.locator('tr[data-category="catering"]');
    await expect(catering).toHaveCount(1);
    await expect(catering).toContainText("Catering");
    await expect(catering.locator('[data-field="categories.planned_inr"]')).toHaveText("₹2,40,000");
    await expect(catering.locator('[data-field="categories.committed_inr"]')).toHaveText("₹2,00,000");
    await expect(catering.locator('[data-field="categories.paid_inr"]')).toHaveText("₹50,000");
    await expect(catering.locator('[data-field="categories.outstanding_inr"]')).toHaveText("₹1,50,000");
    await expect(catering.locator('[data-field="categories.uncommitted_inr"]')).toHaveText("₹40,000");

    // Mallige Gardens' balance is due soon: amber, with an icon and words.
    const vendors = main.locator("section").filter({ has: page.getByRole("heading", { name: "Vendors", exact: true }) });
    const mallige = vendors.locator("tr").filter({ has: page.getByRole("link", { name: "Mallige Gardens" }) });
    await expect(mallige).toHaveCount(1);
    await expect(mallige.locator('[data-field="outstanding_inr"]')).toHaveText("₹1,40,000");
    await expect(mallige.locator('[data-status="due"]')).toHaveText(/^Due Tue 1 Dec/);
    await expect(
      vendors.locator("tr").filter({ has: page.getByRole("link", { name: "Annapoorna Caterers" }) }),
    ).toContainText("₹1,50,000");

    // PRP-01: a peacock "Proposed" row, its own figure never in a total, Approve and Decline.
    const approvals = main.locator("section").filter({ has: page.getByRole("heading", { name: "Waiting for your approval" }) });
    const proposal = approvals.locator('li[data-proposal="PRP-01"]');
    await expect(proposal).toHaveCount(1);
    await expect(proposal.locator('[data-status="proposed"]')).toHaveText("Proposed");
    await expect(proposal).toContainText("Diya proposed an expense of ₹15,000 to Dhol player (Music and entertainment)");
    await expect(proposal.locator('[data-field="committed_delta_inr"]')).toHaveText("+₹15,000");
    await expect(proposal.getByRole("button", { name: "Approve" })).toBeVisible();
    await expect(proposal.getByRole("button", { name: "Decline" })).toBeVisible();
    await expect(approvals.locator('[data-field="if_approved_committed_inr"]')).toHaveText("₹9,42,000");
  });
});

test.describe("correcting PAY-01 on the vendor page (AT-5.6)", () => {
  test("Correct payment refuses 40k next to the field and saves 40,000 with a receipt", async ({ page }) => {
    await open(page, routes.vendor(WEDDING_ID, CATERER_ID));
    const main = page.getByRole("main");
    const advance = main.getByRole("listitem").filter({ hasText: "PAY-01" });
    await expect(advance).toHaveCount(1);

    await advance.getByRole("button", { name: "Correct payment" }).click();
    const amount = advance.getByLabel("Correct amount");
    await expect(amount).toBeVisible();
    await expectNoSideways(page, "the open correction form");

    // Refused next to the field, before anything is sent.
    await amount.fill("40k");
    await advance.getByRole("button", { name: "Save correction" }).click();
    await expect(amount).toHaveAttribute("aria-invalid", "true");
    await expect(amount).toHaveAccessibleDescription(/digits only, like 40,000 or 40000/);
    await expect(main.getByRole("status").filter({ hasText: "Saved by" })).toHaveCount(0);

    // Accepted with Indian grouping; the fixture answers "applied" and the receipt line stays.
    await amount.fill("40,000");
    await advance.getByRole("button", { name: "Save correction" }).click();
    const receipt = advance.getByRole("status").filter({ hasText: /^Saved by Mira, \d{1,2}:\d{2} (am|pm)\./ });
    await expect(receipt).toBeVisible({ timeout: 15_000 });
    await expect(receipt.getByRole("button", { name: "Undo" })).toBeVisible();
    await expect(amount).toBeHidden();
  });
});

test.describe("Events at D0 (AT-3.1)", () => {
  test("five functions over two days, the two warnings and revision 2", async ({ page }) => {
    await open(page, routes.events(WEDDING_ID));
    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { level: 1 })).toHaveText("Events");
    await expect(page).toHaveTitle("Events, Mira & Kabir");
    await expect(main).toContainText("No unpublished changes.");
    await expect(main).toContainText("Published as revision 2");

    const days = main.locator('section[aria-labelledby^="day-"]');
    await expect(days).toHaveCount(2);
    await expect(days.nth(0).getByRole("heading")).toHaveText("Sun 13 Dec 2026");
    await expect(days.nth(1).getByRole("heading")).toHaveText("Mon 14 Dec 2026");
    const first = days.nth(0).getByRole("listitem");
    const second = days.nth(1).getByRole("listitem");
    await expect(first).toHaveCount(3);
    await expect(second).toHaveCount(2);
    for (const [index, title] of ["Haldi", "Mehendi", "Sangeet"].entries()) await expect(first.nth(index)).toContainText(title);
    for (const [index, title] of ["Wedding", "Reception"].entries()) await expect(second.nth(index)).toContainText(title);

    // The two warnings, in their rows: the overlap on both functions, the capacity on the reception.
    const overlap = main.locator("p").filter({ hasText: "The Mehendi ends at 19:30 but the Sangeet starts at 19:00" });
    await expect(overlap).toHaveCount(2);
    await expect(first.nth(1)).toContainText("30 minutes overlap");
    await expect(first.nth(2)).toContainText("30 minutes overlap");
    await expect(second.nth(1)).toContainText("Banyan Hall seats 220; 229 are attending the reception.");
    await expect(main.locator("p").filter({ hasText: "Banyan Hall seats 220" })).toHaveCount(1);
  });

  test("the reception's detail has the Venue select and Save draft", async ({ page }) => {
    await open(page, routes.events(WEDDING_ID, RECEPTION_ID));
    const main = page.getByRole("main");
    await expect(page).toHaveTitle("Reception, Mira & Kabir");
    const detail = main.getByRole("article").filter({ has: page.getByRole("heading", { name: /^Reception/ }) });
    await expect(detail).toBeVisible();
    await expect(detail).toContainText("Banyan Hall seats 220; 229 are attending the reception.");

    const venue = detail.getByLabel("Venue", { exact: true });
    await expect(venue).toBeVisible();
    await expect(venue.locator("option:checked")).toHaveText(/^Banyan Hall, Mallige Gardens, seats 220/);
    await expect(venue.locator("option")).toContainText([/^Lotus Hall/]);
    await expect(detail.getByRole("button", { name: "Save draft" })).toBeVisible();
    await expect(detail.getByRole("button", { name: "Add requirement" })).toBeVisible();
    await expectNoSideways(page, "the reception's detail");
  });
});

test.describe("Activity at D0 (AT-8.5)", () => {
  test("the seeded entries, newest first, in the read model's words", async ({ page }) => {
    await open(page, routes.activity(WEDDING_ID));
    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { level: 1 })).toHaveText("Activity");
    await expect(page.getByRole("navigation", { name: "Filter the activity" })).toBeVisible();

    const entries = main.locator("li[data-seq]");
    await expect(entries).toHaveCount(5);
    const seqs = (await entries.evaluateAll((items) => items.map((item) => Number(item.getAttribute("data-seq"))))).filter(
      (seq) => Number.isFinite(seq),
    );
    expect(seqs, "newest first").toEqual([...seqs].sort((a, b) => b - a));
    await expect(main).toContainText(
      "Diya proposed an expense of ₹15,000 to Dhol player (Music and entertainment), not yet paid. It needs an owner's approval.",
    );
    await expect(main).toContainText("Diya added a requirement to the reception: Sugar-free dessert option, for Kamla Arora.");
  });
});

test.describe("Guests at D0 (AT-4.2, AT-4.8, AT-9.6)", () => {
  test("the reply table, the imported guests and Tara's phone for Mira", async ({ page }) => {
    await open(page, routes.guests(WEDDING_ID));
    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { level: 1 })).toHaveText("Guests");

    const replies = main.locator("section").filter({ has: page.getByRole("heading", { name: "Replies by function" }) });
    await expect(replies.getByRole("columnheader", { name: "Expected (planning)" })).toHaveCount(1);
    const reception = replies.locator(`tr[data-event-id="${RECEPTION_ID}"]`);
    await expect(reception).toHaveCount(1);
    await expect(reception.locator('[data-field="invited"]')).toHaveText("250");
    await expect(reception.locator('[data-field="attending"]')).toHaveText("229");
    await expect(reception.locator('[data-field="declined"]')).toHaveText("9");
    await expect(reception.locator('[data-field="pending"]')).toHaveText("12");
    await expect(reception.locator('[data-field="expected_headcount"]')).toHaveText("250");

    await expect(main.getByText("210 imported guests (synthetic placeholders)", { exact: true })).toBeVisible();
    await expect(main.locator("[data-household-id]")).toHaveCount(16);
    await expect(main.locator("[data-guest-id]")).toHaveCount(40);

    const tara = main.locator("[data-guest-id]").filter({ hasText: "Tara Bhat" });
    await expect(tara).toHaveCount(1);
    await expect(tara.locator('[data-field="phone"]')).toHaveText("+91 90000 01601");
    await expectNoSideways(page, "Guests");
  });
});

test.describe("Guests: the owner's controls (AT-4.8, AT-4.9)", () => {
  test("Mira sees Add a guest, Edit invitations and New invite link", async ({ page }) => {
    await open(page, routes.guests(WEDDING_ID));
    const main = page.getByRole("main");
    await main.getByRole("button", { name: "Add a guest", exact: true }).click();
    const form = main.getByRole("form", { name: "Add a guest" });
    await expect(form.getByLabel("Full name")).toBeVisible();
    await expect(form.getByRole("group", { name: "Invite to" })).toBeVisible();
    await expect(form.getByRole("button", { name: "Add guest", exact: true })).toBeVisible();
    await expect(main.getByRole("button", { name: "Edit invitations for Tara Bhat" })).toHaveCount(1);
    await expect(main.getByRole("button", { name: /^New invite link for the .+ household$/ })).toHaveCount(16);
  });

  test("no sideways scroll at 390 px with the add form and a link confirmation open", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: heightFor(390) });
    await open(page, routes.guests(WEDDING_ID));
    const main = page.getByRole("main");
    await main.getByRole("button", { name: "Add a guest", exact: true }).click();
    await main.getByRole("button", { name: /^New invite link for the .+ household$/ }).first().click();
    await expect(main.getByText("Any earlier link for this household will stop working.")).toBeVisible();
    await expectNoSideways(page, "Guests at 390 px");
  });
});

test.describe("Team and sharing (D64, D109)", () => {
  test("the wedding menu opens the sheet with Send invite, and Escape closes it", async ({ page }) => {
    await open(page, routes.overview(WEDDING_ID));
    const trigger = page.getByRole("banner").getByRole("button", { name: "Wedding menu" });
    await trigger.click();
    await page.getByRole("menuitem", { name: "Team and sharing" }).click();
    const sheet = page.getByRole("dialog", { name: "Team and sharing" });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("button", { name: "Send invite" })).toBeVisible();
    await expect(sheet.getByRole("group", { name: "Budget" })).toBeVisible();
    // The menu's close animation must finish first, or its layer takes the Escape.
    await expect(page.getByRole("menu")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });
});
