import "server-only";

import type { Browser, HTTPRequest, Page } from "puppeteer-core";
import { RENDER_CAP_MS } from "@/contracts/jobs";
import { GUARD_SCRIPT, type GuardResult } from "./guard-script";
import { CARD_HEIGHT_PX, CARD_WIDTH_PX } from "@/components/invite/card-model";

/**
 * The Chromium renderer (export-and-recovery 3.1 to 3.4). Imported only by the `/run`
 * route; puppeteer-core and @sparticuz/chromium load by dynamic import, here only.
 *
 * - One browser per server instance, behind a module-level promise, so launches never
 *   overlap (the `spawn ETXTBSY` trap). A launch failure clears it so the next attempt
 *   relaunches.
 * - One render slot per instance: one page at a time.
 * - The 45 s cap runs from taking the slot.
 * - Locally the Chrome at CHROME_EXECUTABLE_PATH; on Vercel, Sparticuz in headless shell
 *   mode with graphics off.
 */

export type RenderErrorCode = "RENDER_TIMEOUT" | "FONT_NOT_LOADED" | "RENDER_FAILED";

export class RenderError extends Error {
  readonly code: RenderErrorCode;
  /** The short cause or the faces; never a URL, token, path or stack. */
  readonly detail: string;
  readonly timings: RenderTimings;
  constructor(code: RenderErrorCode, detail: string, timings: RenderTimings) {
    super(`${code}: ${detail}`);
    this.name = "RenderError";
    this.code = code;
    this.detail = detail;
    this.timings = timings;
  }
}

export type RenderTimings = {
  /** Time waiting for this instance's render slot. */
  slot_ms: number;
  launch_ms: number;
  navigate_ms: number;
  fonts_ms: number;
  capture_ms: number;
  total_ms: number;
  /** `cold` when this render launched the browser. */
  instance: "cold" | "warm";
  /** The fit-rule steps the guard took, for the log line. */
  fit: string;
};

/**
 * Test-only modes, refused in production (export-and-recovery 8.1, EX-07 and EX-17).
 * `broken_fallbacks` makes next/font's local() fallback faces fail to load, as they do on
 * Vercel where Sparticuz ships only Open Sans: the card must still pass the guard.
 */
export type RenderTestMode = "block_fonts" | "hang" | "broken_fallbacks";

/** Adds a failing local() face under every fallback family name, before the guard runs. */
const BREAK_FALLBACKS_SCRIPT = `(() => {
  const added = [];
  for (const face of Array.from(document.fonts)) {
    if (!/fallback/i.test(face.family)) continue;
    const broken = new FontFace(face.family, "local('No Such Font For Jashn Tests')", { style: face.style, weight: face.weight });
    document.fonts.add(broken);
    added.push(broken.load().catch(() => null));
  }
  return Promise.all(added).then(() => added.length);
})()`;

export type RenderCardOptions = {
  /** The full render page URL, token included. Never logged. */
  url: string;
  cap_ms?: number;
  test_mode?: RenderTestMode | null;
};

/** Navigation (guard step 1) and the font steps (2 and 3) each get this budget. */
const NAVIGATION_BUDGET_MS = 20_000;
const FONTS_BUDGET_MS = 8_000;

let browserPromise: Promise<Browser> | null = null;
let slot: Promise<void> = Promise.resolve();

function emptyTimings(): RenderTimings {
  return { slot_ms: 0, launch_ms: 0, navigate_ms: 0, fonts_ms: 0, capture_ms: 0, total_ms: 0, instance: "warm", fit: "" };
}

/** Runs `task` when this instance's single render slot is free. */
export async function withRenderSlot<T>(task: () => Promise<T>): Promise<T> {
  const previous = slot;
  let release!: () => void;
  slot = new Promise<void>((resolve) => {
    release = resolve;
  });
  try {
    await previous;
    return await task();
  } finally {
    release();
  }
}

async function launchBrowser(): Promise<Browser> {
  const { default: puppeteer } = await import("puppeteer-core");
  const localChrome = process.env.CHROME_EXECUTABLE_PATH;
  if (localChrome && process.env.VERCEL !== "1") {
    return puppeteer.launch({
      executablePath: localChrome,
      headless: true,
      args: ["--no-first-run", "--no-default-browser-check", "--hide-scrollbars", "--disable-extensions"],
      defaultViewport: { width: CARD_WIDTH_PX, height: CARD_HEIGHT_PX, deviceScaleFactor: 1 },
    });
  }
  const { default: chromium } = await import("@sparticuz/chromium");
  chromium.setGraphicsMode = false;
  return puppeteer.launch({
    args: await puppeteer.defaultArgs({ args: chromium.args, headless: "shell" }),
    executablePath: await chromium.executablePath(),
    headless: "shell",
    defaultViewport: { width: CARD_WIDTH_PX, height: CARD_HEIGHT_PX, deviceScaleFactor: 1 },
  });
}

/** The instance's browser, launched once. `cold` is true when this call launched it. */
async function getBrowser(): Promise<{ browser: Browser; cold: boolean }> {
  if (browserPromise) {
    const browser = await browserPromise;
    if (browser.connected) return { browser, cold: false };
    browserPromise = null;
  }
  const launching = launchBrowser();
  browserPromise = launching;
  try {
    const browser = await launching;
    browser.once("disconnected", () => {
      if (browserPromise === launching) browserPromise = null;
    });
    return { browser, cold: true };
  } catch (error) {
    if (browserPromise === launching) browserPromise = null;
    // For diagnosing P1 from the runtime logs. A launch error carries no render URL or
    // token; scrub anything URL-like anyway and keep it short.
    const name = error instanceof Error ? error.name : "Error";
    const message = (error instanceof Error ? error.message : String(error))
      .replace(/https?:\/\/\S+/g, "<url>")
      .replace(/\s+/g, " ")
      .slice(0, 300);
    console.error(`[export] browser launch failed: ${name}: ${message}`);
    throw error;
  }
}

function capped<T>(promise: Promise<T>, deadline: number, onTimeout: () => Error): Promise<T> {
  const remaining = Math.max(0, deadline - Date.now());
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(onTimeout()), remaining);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function causeOf(error: unknown): string {
  // Only a short, fixed cause leaves this module: never the message, which can hold a URL.
  if (error instanceof RenderError) return error.detail;
  return "the renderer failed";
}

/**
 * Renders the card page at `url` to a 1080 × 1350 PNG. Takes the render slot, launches or
 * reuses the browser, runs the readiness guard and the fit rule, and captures.
 * Throws RenderError with a code from 2.5 on any failure.
 */
export async function renderCardPng(options: RenderCardOptions): Promise<{ png: Uint8Array; timings: RenderTimings }> {
  const queued = Date.now();
  return withRenderSlot(async () => {
    const timings = emptyTimings();
    const started = Date.now();
    timings.slot_ms = started - queued;
    const deadline = started + (options.cap_ms ?? RENDER_CAP_MS);
    const timeoutError = () => {
      timings.total_ms = Date.now() - started;
      return new RenderError("RENDER_TIMEOUT", "the render took longer than the cap", { ...timings });
    };
    let page: Page | null = null;
    try {
      const launchStarted = Date.now();
      let browser: Browser;
      try {
        const got = await capped(getBrowser(), deadline, timeoutError);
        browser = got.browser;
        timings.instance = got.cold ? "cold" : "warm";
      } catch (error) {
        if (error instanceof RenderError) throw error;
        throw new RenderError("RENDER_FAILED", "browser launch failed", { ...timings, launch_ms: Date.now() - launchStarted });
      }
      timings.launch_ms = Date.now() - launchStarted;

      page = await capped(browser.newPage(), deadline, timeoutError);
      await page.setViewport({ width: CARD_WIDTH_PX, height: CARD_HEIGHT_PX, deviceScaleFactor: 1 });
      if (options.test_mode === "block_fonts") {
        await page.setRequestInterception(true);
        page.on("request", (request: HTTPRequest) => {
          if (request.resourceType() === "font") void request.abort("blockedbyclient");
          else void request.continue();
        });
      }

      const navigateStarted = Date.now();
      let status = 0;
      try {
        const response = await capped(
          page.goto(options.url, { waitUntil: "networkidle0", timeout: NAVIGATION_BUDGET_MS }),
          deadline,
          timeoutError,
        );
        status = response?.status() ?? 0;
      } catch (error) {
        if (error instanceof RenderError) throw error;
        throw new RenderError("RENDER_FAILED", "render page did not load", { ...timings, navigate_ms: Date.now() - navigateStarted });
      }
      timings.navigate_ms = Date.now() - navigateStarted;
      if (status !== 200) {
        throw new RenderError("RENDER_FAILED", `render page returned ${status || "no answer"}`, { ...timings });
      }

      if (options.test_mode === "broken_fallbacks") {
        await capped(page.evaluate(BREAK_FALLBACKS_SCRIPT) as Promise<number>, deadline, timeoutError);
      }

      if (options.test_mode === "hang") {
        await capped(new Promise<never>(() => {}), deadline, timeoutError);
      }

      const guard = (await capped(
        page.evaluate(`(${GUARD_SCRIPT})(${FONTS_BUDGET_MS})`) as Promise<GuardResult>,
        deadline,
        timeoutError,
      )) as GuardResult;
      timings.fonts_ms = guard.fonts_ms;
      if (!guard.ok) {
        const detail = guard.code === "FONT_NOT_LOADED" ? guard.faces.join(", ") : guard.cause;
        throw new RenderError(guard.code, detail, { ...timings, total_ms: Date.now() - started });
      }
      timings.fit = guard.fit;

      const captureStarted = Date.now();
      const png = await capped(
        page.screenshot({ type: "png", clip: { x: 0, y: 0, width: CARD_WIDTH_PX, height: CARD_HEIGHT_PX } }),
        deadline,
        timeoutError,
      );
      timings.capture_ms = Date.now() - captureStarted;
      timings.total_ms = Date.now() - started;
      return { png, timings };
    } catch (error) {
      if (error instanceof RenderError) throw error;
      throw new RenderError("RENDER_FAILED", causeOf(error), { ...timings, total_ms: Date.now() - started });
    } finally {
      if (page) {
        // Close the page, keep the browser (3.3 step 10).
        const closing = page.close().catch(() => undefined);
        await Promise.race([closing, new Promise((resolve) => setTimeout(resolve, 3_000))]);
      }
    }
  });
}

/** The failure message NudgeBee and the panel see (2.5): fixed text plus the short detail. */
export function renderErrorMessage(error: RenderError): string {
  switch (error.code) {
    case "FONT_NOT_LOADED":
      return `Web fonts did not load: ${error.detail}`;
    case "RENDER_TIMEOUT":
      return "The render took longer than 45 s";
    default:
      return error.detail;
  }
}
