import { loadEnvConfig } from "@next/env";
import { defineConfig, devices } from "@playwright/test";

// Specs read .env.local the way Next does (decision D120).
loadEnvConfig(process.cwd());

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const remote = baseURL.startsWith("https://");

export default defineConfig({
  testDir: "e2e",
  retries: remote ? 1 : 0,
  use: {
    baseURL,
    channel: "chrome",
    trace: "on-first-retry",
  },
  projects: [
    // The lead's demo path only: its set-up signs in and resets the e2e copy (architecture 6.7).
    { name: "demo-setup", testMatch: /demo-path\.setup\.ts/ },
    {
      name: "demo-owner",
      testMatch: /demo-path\.spec\.ts/,
      dependencies: ["demo-setup"],
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
    },
    // Lane specs never depend on the demo set-up.
    {
      name: "desktop",
      testIgnore: /demo-path\./,
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
    },
    {
      name: "mobile",
      testIgnore: /demo-path\./,
      use: { channel: "chrome", viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true },
    },
  ],
});
