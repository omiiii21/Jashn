import "server-only";

import { DefaultFlag, Flagsmith } from "@flagsmith/nodejs";

import {
  FLAG_FALLBACKS,
  FLAGSMITH_BREAKER_MS,
  FLAGSMITH_RETRIES,
  FLAGSMITH_TIMEOUT_SECONDS,
  type FlagKey,
} from "@/contracts/flags";

import { flagsmithServerKey } from "./env";

/**
 * The single Flagsmith client per server instance (flagsmith 6.3): created lazily from
 * FLAGSMITH_SERVER_KEY, 2 s timeout, 1 retry, events on, a default flag handler returning the
 * contract fallbacks, and a 30 s breaker. Nothing here ever throws into a caller.
 */

/** One flag as the SDK returns it (the SDK's `Flag` and `DefaultFlag` both fit). */
export type SdkFlagLike = {
  enabled: boolean;
  value: unknown;
  isDefault?: boolean;
  reason?: string;
  variant?: string;
  experiment?: { id: number; name: string; inExperiment: boolean };
};

/** The SDK's `Flags`: every flag the environment returned, by feature name. */
export type SdkFlagsLike = { flags: Record<string, SdkFlagLike> };

export type SdkTraitValue = string | number | boolean | null;
export type SdkTraits = Record<string, SdkTraitValue | { value: SdkTraitValue; transient?: boolean }>;

/** The part of `@flagsmith/nodejs`'s `Flagsmith` this module uses; tests inject a fake. */
export interface FlagsmithClientLike {
  getEnvironmentFlags(): Promise<SdkFlagsLike>;
  getIdentityFlags(identifier: string, traits?: SdkTraits): Promise<SdkFlagsLike>;
}

export type FlagsmithClientFactory = (environment_key: string) => FlagsmithClientLike;

/** A short pause before the one retry, so an outage costs about 4 s, not 5 (6.3). */
const RETRY_DELAY_MS = 250;

function contractDefaultFlag(key: string): DefaultFlag {
  const fallback = FLAG_FALLBACKS[key as FlagKey] ?? null;
  return new DefaultFlag(fallback?.value ?? null, fallback?.enabled ?? false);
}

const sdkFactory: FlagsmithClientFactory = (environment_key) =>
  new Flagsmith({
    environmentKey: environment_key,
    requestTimeoutSeconds: FLAGSMITH_TIMEOUT_SECONDS,
    retries: FLAGSMITH_RETRIES,
    requestRetryDelayMilliseconds: RETRY_DELAY_MS,
    enableEvents: true,
    defaultFlagHandler: contractDefaultFlag,
  });

let factory: FlagsmithClientFactory = sdkFactory;
let instance: { key: string; client: FlagsmithClientLike } | null = null;
let breakerOpenUntil = 0;

/**
 * The client for the current key, or null when FLAGSMITH_SERVER_KEY is missing (every flag is
 * then a fallback). A changed key gets a new client.
 */
export function getFlagsmithClient(): FlagsmithClientLike | null {
  const key = flagsmithServerKey();
  if (!key) return null;
  if (instance && instance.key === key) return instance.client;
  try {
    instance = { key, client: factory(key) };
    return instance.client;
  } catch {
    console.warn("flagsmith client could not be created; serving fallbacks");
    return null;
  }
}

/**
 * The raw SDK instance (for the 14:45 experiment events: getExperimentFlag, trackEvent,
 * flushEvents). Null without a key, or when a test factory replaced the SDK.
 */
export function getFlagsmithSdk(): Flagsmith | null {
  const client = getFlagsmithClient();
  return client instanceof Flagsmith ? client : null;
}

export function breakerIsOpen(now: number = Date.now()): boolean {
  return now < breakerOpenUntil;
}

/** After a timeout, a network error, a 5xx or any SDK throw: fallbacks for 30 s (6.3). */
export function tripBreaker(): void {
  const wasOpen = breakerIsOpen();
  breakerOpenUntil = Date.now() + FLAGSMITH_BREAKER_MS;
  if (!wasOpen) console.warn("flagsmith unreachable: serving fallbacks for 30 s");
}

export type FlagsmithCallResult =
  | { ok: true; flags: SdkFlagsLike; latency_ms: number }
  | { ok: false; reason: "no_key" | "breaker_open" | "unreachable"; latency_ms: number };

/**
 * Runs one Flagsmith call behind the breaker. With the SDK's default flag handler, a failed
 * request comes back as an empty `Flags` rather than a throw, so an empty result (no flag at
 * all) counts as unreachable too; a real environment always holds the contract's flags.
 */
export async function callFlagsmith(
  run: (client: FlagsmithClientLike) => Promise<SdkFlagsLike>,
): Promise<FlagsmithCallResult> {
  const started = Date.now();
  const client = getFlagsmithClient();
  if (!client) return { ok: false, reason: "no_key", latency_ms: 0 };
  if (breakerIsOpen(started)) return { ok: false, reason: "breaker_open", latency_ms: 0 };
  try {
    const flags = await run(client);
    const latency_ms = Date.now() - started;
    if (!flags || typeof flags !== "object" || !flags.flags || Object.keys(flags.flags).length === 0) {
      tripBreaker();
      return { ok: false, reason: "unreachable", latency_ms };
    }
    return { ok: true, flags, latency_ms };
  } catch {
    tripBreaker();
    return { ok: false, reason: "unreachable", latency_ms: Date.now() - started };
  }
}

// ---------------------------------------------------------------------------
// Test hooks
// ---------------------------------------------------------------------------

/** Replaces the SDK with a fake (null restores the SDK). Also drops the cached client. */
export function setFlagsmithClientFactoryForTests(next: FlagsmithClientFactory | null): void {
  factory = next ?? sdkFactory;
  instance = null;
}

/** Drops the cached client and closes the breaker. */
export function resetFlagsmithClientForTests(): void {
  instance = null;
  breakerOpenUntil = 0;
}
