/**
 * Lane A's own spec (architecture 4.1, 6.7; D46, D120). It signs in Lane A's rehearsal accounts
 * on copy `a` through the login page, with its own storage state, and never touches the `e2e`
 * copy or e2e/.auth/. It checks only what Lane A's open PRs deliver: sign-in, the version poll
 * and the command route's idempotency.
 *
 * Run: E2E_BASE_URL=http://localhost:3001 npx playwright test e2e/lane-a.spec.ts --project=desktop
 */
import { expect, test, type Page } from "@playwright/test";

import { seededId } from "../src/db/ids";

const WEDDING_A = seededId("a", "weddings", "WEDDING");
const PASSWORD = process.env.SEED_PASSWORD ?? "";

test.skip(!PASSWORD, "SEED_PASSWORD is not set, so the seeded accounts can't sign in");

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

test.describe("signed out", () => {
  test("the version poll answers 401", async ({ request }) => {
    const response = await request.get(`/api/w/${WEDDING_A}/version`);
    expect(response.status()).toBe(401);
  });

  test("the planner sends you to the login page", async ({ page }) => {
    await page.goto(`/w/${WEDDING_A}`);
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("Mira on copy a", () => {
  test("signs in and reads the version", async ({ page }) => {
    await signIn(page, "mira.a@example.com");
    await expect(page).toHaveURL(new RegExp(`/w/${WEDDING_A}`));
    const response = await page.request.get(`/api/w/${WEDDING_A}/version`);
    expect(response.status()).toBe(200);
    const body = (await response.json()) as { version: number };
    expect(Number.isSafeInteger(body.version)).toBe(true);
  });

  test("one idempotency key sent twice replays", async ({ page }) => {
    await signIn(page, "mira.a@example.com");
    const key = `lane-a-e2e-${Date.now()}`;
    const send = () =>
      page.request.post(`/api/w/${WEDDING_A}/commands/set_wedding_profile`, {
        headers: { "Idempotency-Key": key, "Content-Type": "application/json" },
        data: {
          command: "set_wedding_profile",
          wedding_id: WEDDING_A,
          idempotency_key: key,
          source: "ui",
          input: { city: "Bengaluru" },
        },
      });
    const first = await send();
    expect([200, 201]).toContain(first.status());
    const firstBody = (await first.json()) as { ok: boolean; outcome: string };
    expect(firstBody.ok).toBe(true);
    expect(["applied", "unchanged"]).toContain(firstBody.outcome);
    const second = await send();
    const secondBody = (await second.json()) as { ok: boolean; outcome: string };
    expect(secondBody.ok).toBe(true);
    expect(secondBody.outcome).toBe("replayed");
  });
});
