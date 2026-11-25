/**
 * The synthetic run (flagsmith.md 5.8): scripted owners in the Synthetic Flagsmith environment,
 * with save rates planted at 0.60 (voice_first) and 0.50 (form_first). It tests the experiment's
 * wiring, not the product, and its numbers are never shown in Jashn (flagsmith.md 1.2 rule 4).
 *
 * Run it from Lane C's worktree, after F1 and the lead's go-ahead (flagsmith.md 7.5 command 3):
 *
 *   node --env-file=.env.local --import tsx scripts/synthetic-setup-traffic.ts --dry-run
 *   node --env-file=.env.local --import tsx scripts/synthetic-setup-traffic.ts --start 1 --count 800
 *
 * The dry run evaluates synthetic-dry-01 to -05 and sends no events. Read its output first.
 *
 * Guards: it reads only FLAGSMITH_SERVER_KEY_SYNTHETIC (never FLAGSMITH_SERVER_KEY) and stops,
 * sending nothing, when that key is missing, when `env_label` isn't `synthetic`, or when the
 * first identity's `setup_entry_synthetic` is a fallback or carries no experiment. The key is
 * never printed.
 *
 * It imports only src/contracts/flags.ts and the SDK (architecture 7.1 trap 11): never src/server/.
 */
import { Flagsmith } from "@flagsmith/nodejs";
import type { FlagsmithConfig, TraitConfig } from "@flagsmith/nodejs";
import {
  FLAG_EVENTS,
  FLAGSMITH_EVENTS_URL,
  SETUP_ENTRY_CONTROL,
  SETUP_ENTRY_TREATMENT,
  SETUP_SECONDS_MAX,
  SYNTHETIC_DRY_IDENTITY_PREFIX,
  SYNTHETIC_EXPERIMENT_FLAG,
  SYNTHETIC_IDENTITY_COUNT,
  SYNTHETIC_IDENTITY_PREFIX,
  TRAIT_KEYS,
  TRANSIENT_TRAITS,
  traitsFor,
  type EnvLabel,
  type SetupEntryVariant,
  type SyntheticTraits,
} from "../src/contracts/flags";

// ---------------------------------------------------------------------------
// Constants (5.8)
// ---------------------------------------------------------------------------

/** The only key this script reads (flagsmith.md 6.10). */
export const SYNTHETIC_KEY_ENV = "FLAGSMITH_SERVER_KEY_SYNTHETIC";
export const EXPECTED_ENV_LABEL: EnvLabel = "synthetic";
export const SEED = 20261125;
/** Convert when the draw is below this rate for the identity's arm. */
export const PLANTED_RATES: Record<SetupEntryVariant, number> = {
  voice_first: 0.6,
  form_first: 0.5,
};
/** Seconds to save: 60 plus a seeded whole number from 0 to 240, the same in both arms. */
export const SECONDS_BASE = 60;
export const SECONDS_SPREAD = 240;
export const DRY_RUN_COUNT = 5;
export const FLUSH_EVERY = 100;
/** At most about 10 identities a second. */
export const MIN_MS_PER_IDENTITY = 100;
/** A conversion is buffered at least this long after its exposure, so its timestamp is later. */
export const EXPOSURE_TO_CONVERSION_MS = 20;
/** Stop the run after this many evaluations fail in a row (Flagsmith down or the key refused). */
export const MAX_CONSECUTIVE_FAILURES = 5;
/** The highest identity number the four-digit names allow. */
export const MAX_IDENTITY_NUMBER = 9999;
/** How long close() may take to send the last buffered events. */
export const CLOSE_TIMEOUT_MS = 60_000;

// ---------------------------------------------------------------------------
// The seeded generator and the per-identity draws
// ---------------------------------------------------------------------------

/** mulberry32: a small, fast, seeded generator returning values in [0, 1). */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Whole seconds, clamped to 0–3600 (flagsmith.md 5.4). */
export function clampSeconds(seconds: number): number {
  if (!Number.isFinite(seconds)) return 0;
  return Math.min(SETUP_SECONDS_MAX, Math.max(0, Math.floor(seconds)));
}

/** Seconds to save from a draw in [0, 1): 60 to 300. */
export function secondsFromDraw(draw: number): number {
  return clampSeconds(SECONDS_BASE + Math.floor(draw * (SECONDS_SPREAD + 1)));
}

/** The arm an evaluated variant key means: only `voice_first` is the treatment (3.4). */
export function armFor(variant: string | null | undefined): SetupEntryVariant {
  return variant === SETUP_ENTRY_TREATMENT ? SETUP_ENTRY_TREATMENT : SETUP_ENTRY_CONTROL;
}

/** The planted conversion: below 0.60 for voice_first, below 0.50 for the control. */
export function convertsFor(arm: SetupEntryVariant, draw: number): boolean {
  return draw < PLANTED_RATES[arm];
}

export type IdentityDraw = {
  /** The identity number: 1 is synthetic-0001. */
  number: number;
  identifier: string;
  /** Compared with the arm's planted rate. */
  conversion_draw: number;
  /** Sent as the `setup_saved` value if the identity converts. */
  seconds: number;
};

/**
 * The draws for identities `start` to `start + count - 1`. Identity n always gets the stream's
 * values 2n-1 and 2n, whatever the start, so a re-run from 801 continues the same sequence.
 * The draws don't depend on Flagsmith's answers, so the plan is the same on every run.
 */
export function drawPlan(opts: { seed: number; start: number; count: number }): IdentityDraw[] {
  const next = mulberry32(opts.seed);
  const plan: IdentityDraw[] = [];
  const last = opts.start + opts.count - 1;
  for (let n = 1; n <= last; n++) {
    const conversion_draw = next();
    const seconds_draw = next();
    if (n < opts.start) continue;
    plan.push({ number: n, identifier: syntheticIdentifier(n), conversion_draw, seconds: secondsFromDraw(seconds_draw) });
  }
  return plan;
}

/** How many of the plan's identities would save if every one were in the given arm. */
export function plannedSaves(plan: IdentityDraw[], arm: SetupEntryVariant): number {
  return plan.filter((draw) => convertsFor(arm, draw.conversion_draw)).length;
}

// ---------------------------------------------------------------------------
// Identities and traits (2.1, 2.3)
// ---------------------------------------------------------------------------

/** `synthetic-0001` onwards. */
export function syntheticIdentifier(n: number): string {
  return `${SYNTHETIC_IDENTITY_PREFIX}${String(n).padStart(4, "0")}`;
}

/** `synthetic-dry-01` to `synthetic-dry-05`. */
export function dryIdentifier(n: number): string {
  return `${SYNTHETIC_DRY_IDENTITY_PREFIX}${String(n).padStart(2, "0")}`;
}

export function syntheticIdentities(start: number, count: number): string[] {
  return Array.from({ length: count }, (_, i) => syntheticIdentifier(start + i));
}

export function dryIdentities(): string[] {
  return Array.from({ length: DRY_RUN_COUNT }, (_, i) => dryIdentifier(i + 1));
}

/** Exactly a real new owner's traits, plus `traffic`; `preferred_language` alternates en, hi. */
export function syntheticTraits(n: number): SyntheticTraits {
  return {
    ...traitsFor({
      preferred_language: n % 2 === 1 ? "en" : "hi",
      role: "owner",
      is_internal: false,
      is_first_wedding: true,
    }),
    traffic: "synthetic",
  };
}

export type TraitInput = TraitConfig | string | number | boolean;

/** The SDK's trait map: `role`, `is_internal` and `is_first_wedding` transient, the rest persisted. */
export function sdkTraits(traits: SyntheticTraits): Record<string, TraitInput> {
  const out: Record<string, TraitInput> = {};
  for (const key of TRAIT_KEYS) {
    const value = traits[key];
    out[key] = TRANSIENT_TRAITS.includes(key) ? { value, transient: true } : value;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

export type RunArgs = {
  mode: "dry" | "real";
  start: number;
  count: number;
  /** Also send `setup_save_seconds` (only if the wizard won't put two metrics on one event, U11). */
  also_seconds_event: boolean;
};

export type ParsedArgs = { ok: true; args: RunArgs } | { ok: false; message: string };

export const USAGE = [
  "Usage:",
  "  node --env-file=.env.local --import tsx scripts/synthetic-setup-traffic.ts --dry-run",
  "  node --env-file=.env.local --import tsx scripts/synthetic-setup-traffic.ts --start 1 --count 800",
  "Options: --also-seconds-event also sends setup_save_seconds (only if the wizard needs it, U11).",
].join("\n");

function readInteger(raw: string | undefined, name: string): number | string {
  if (raw === undefined || !/^\d+$/.test(raw)) return `${name} needs a whole number.`;
  return Number(raw);
}

/** A real run needs `--start`; `--count` defaults to 800. No arguments is a usage error. */
export function parseArgs(argv: string[]): ParsedArgs {
  let dry = false;
  let also_seconds_event = false;
  let start: number | null = null;
  let count: number | null = null;
  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = argv[i].split("=", 2) as [string, string | undefined];
    if (flag === "--dry-run") {
      dry = true;
    } else if (flag === "--also-seconds-event") {
      also_seconds_event = true;
    } else if (flag === "--start" || flag === "--count") {
      const raw = inline ?? argv[++i];
      const value = readInteger(raw, flag);
      if (typeof value === "string") return { ok: false, message: value };
      if (flag === "--start") start = value;
      else count = value;
    } else if (flag === "--help" || flag === "-h") {
      return { ok: false, message: USAGE };
    } else {
      return { ok: false, message: `Unknown option ${flag}.\n${USAGE}` };
    }
  }
  if (!dry && start === null) {
    return { ok: false, message: `Choose --dry-run, or a real run with --start.\n${USAGE}` };
  }
  const resolvedStart = start ?? 1;
  const resolvedCount = count ?? SYNTHETIC_IDENTITY_COUNT;
  if (resolvedStart < 1) return { ok: false, message: "--start must be 1 or more." };
  if (resolvedCount < 1 || resolvedCount > SYNTHETIC_IDENTITY_COUNT) {
    return { ok: false, message: `--count must be from 1 to ${SYNTHETIC_IDENTITY_COUNT}.` };
  }
  if (resolvedStart + resolvedCount - 1 > MAX_IDENTITY_NUMBER) {
    return { ok: false, message: `The last identity would pass ${syntheticIdentifier(MAX_IDENTITY_NUMBER)}.` };
  }
  return {
    ok: true,
    args: { mode: dry ? "dry" : "real", start: resolvedStart, count: resolvedCount, also_seconds_event },
  };
}

// ---------------------------------------------------------------------------
// Guards: each returns why the run must stop, or null
// ---------------------------------------------------------------------------

/** Stop, before any client exists, when the Synthetic key is missing or isn't a server key. */
export function keyRefusal(env: Record<string, string | undefined>): string | null {
  const key = env[SYNTHETIC_KEY_ENV]?.trim();
  if (!key) return `${SYNTHETIC_KEY_ENV} is not set. Nothing was sent.`;
  if (!key.startsWith("ser.")) return `${SYNTHETIC_KEY_ENV} is not a server-side key (it should start with "ser."). Nothing was sent.`;
  return null;
}

/** A flag as an evaluation returns it; structural, so tests can fake it. */
export type EvaluatedFlag = {
  enabled: boolean;
  value: unknown;
  isDefault: boolean;
  variant?: string | null;
  experiment?: { id: number; name: string; inExperiment: boolean };
};

export type FlagsLike = { getFlag(featureName: string): EvaluatedFlag };

/** Stop unless Flagsmith itself served `env_label` = `synthetic`. */
export function envLabelRefusal(flag: EvaluatedFlag | null): string | null {
  if (!flag || flag.isDefault) return "env_label could not be read from Flagsmith (fallback). Nothing was sent.";
  if (flag.value !== EXPECTED_ENV_LABEL) {
    return `env_label is "${String(flag.value)}", not "${EXPECTED_ENV_LABEL}": this key isn't the Synthetic environment's. Nothing was sent.`;
  }
  return null;
}

/** Stop when `setup_entry_synthetic` is missing, a fallback, disabled, or carries no experiment. */
export function experimentRefusal(flag: EvaluatedFlag | null, identifier: string): string | null {
  if (!flag || flag.isDefault) return `${SYNTHETIC_EXPERIMENT_FLAG} is missing or a fallback for ${identifier}. It has no fallback, so the run stops.`;
  if (!flag.enabled) return `${SYNTHETIC_EXPERIMENT_FLAG} is disabled for ${identifier}.`;
  if (!flag.experiment) return `${SYNTHETIC_EXPERIMENT_FLAG} carries no experiment for ${identifier}: launch the Synthetic experiment (F1) first.`;
  return null;
}

/** Enrolled: in the experiment, with a variant (the SDK's own exposure rule). */
export function isEnrolled(flag: EvaluatedFlag): boolean {
  return !flag.isDefault && flag.enabled && !!flag.experiment?.inExperiment && flag.variant != null;
}

// ---------------------------------------------------------------------------
// The events tally: counts what the events API accepted, from its responses
// ---------------------------------------------------------------------------

export type EventsTally = {
  posts: number;
  by_status: Record<string, number>;
  /** Events in posts the API answered 2xx, by event name. */
  accepted: Record<string, number>;
  network_errors: number;
};

/** Wraps fetch so the run can report what the events API accepted. Never reads headers. */
export function tallyingFetch(base: typeof fetch): { fetch: typeof fetch; tally: EventsTally } {
  const tally: EventsTally = { posts: 0, by_status: {}, accepted: {}, network_errors: 0 };
  const wrapped: typeof fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith(FLAGSMITH_EVENTS_URL)) return base(input, init);
    tally.posts += 1;
    let response: Response;
    try {
      response = await base(input, init);
    } catch (error) {
      tally.network_errors += 1;
      throw error;
    }
    const status = String(response.status);
    tally.by_status[status] = (tally.by_status[status] ?? 0) + 1;
    if (response.status >= 200 && response.status < 300 && typeof init?.body === "string") {
      try {
        const body = JSON.parse(init.body) as { events?: { event?: unknown }[] };
        for (const event of body.events ?? []) {
          const name = String(event.event);
          tally.accepted[name] = (tally.accepted[name] ?? 0) + 1;
        }
      } catch {
        // A body we can't read is still counted under by_status.
      }
    }
    return response;
  };
  return { fetch: wrapped, tally };
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

/** The SDK surface the run uses; the real Flagsmith client satisfies it. */
export interface SyntheticClient {
  getEnvironmentFlags(): Promise<FlagsLike>;
  getIdentityFlags(identifier: string, traits?: Record<string, TraitInput>): Promise<FlagsLike>;
  trackExposureEvent(
    featureName: string,
    opts: { identifier: string; value?: string | number | boolean | null; metadata?: Record<string, unknown> },
  ): void;
  trackEvent(event: string, opts?: { identifier?: string; value?: string | number | boolean | null }): void;
  flushEvents(): Promise<void>;
  close(timeoutMs?: number): Promise<void>;
}

export type SyntheticDeps = {
  createClient: (config: FlagsmithConfig) => SyntheticClient;
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  log: (line: string) => void;
};

export function defaultDeps(): SyntheticDeps {
  return {
    createClient: (config) => new Flagsmith(config),
    fetch: (input, init) => globalThis.fetch(input, init),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: () => Date.now(),
    log: (line) => console.log(line),
  };
}

export type ArmCounts = { identities: number; exposures_sent: number; conversions_sent: number };

export type RunReport = {
  mode: "dry" | "real";
  exit_code: number;
  /** Why the run stopped early, or null. */
  stopped: string | null;
  seed: number;
  first_identifier: string;
  last_identifier: string;
  processed: number;
  arms: Record<SetupEntryVariant, ArmCounts>;
  not_enrolled: number;
  no_variant: number;
  evaluation_failures: number;
  variant_keys: Record<string, number>;
  events: EventsTally | null;
  client_created: boolean;
  started_at: number;
  finished_at: number;
};

function emptyArms(): Record<SetupEntryVariant, ArmCounts> {
  return {
    voice_first: { identities: 0, exposures_sent: 0, conversions_sent: 0 },
    form_first: { identities: 0, exposures_sent: 0, conversions_sent: 0 },
  };
}

function errorText(error: unknown, secret: string): string {
  const text = error instanceof Error ? error.message : String(error);
  return secret ? text.split(secret).join("[key]") : text;
}

function istTime(ms: number): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(ms));
}

function describeFlag(flag: EvaluatedFlag): string {
  if (flag.isDefault) return "fallback (not served by Flagsmith)";
  const parts = [
    `variant ${flag.variant ?? "none"}`,
    `in_experiment ${flag.experiment ? String(flag.experiment.inExperiment) : "no experiment"}`,
    `enabled ${String(flag.enabled)}`,
  ];
  if (flag.experiment) parts.push(`experiment "${flag.experiment.name}" (id ${flag.experiment.id})`);
  return parts.join(", ");
}

/** Runs the dry run or the real run. Returns the report; the exit code is in it. */
export async function runSyntheticTraffic(
  argv: string[],
  env: Record<string, string | undefined>,
  deps: SyntheticDeps = defaultDeps(),
): Promise<RunReport> {
  const started_at = deps.now();
  const parsed = parseArgs(argv);
  const report: RunReport = {
    mode: parsed.ok ? parsed.args.mode : "dry",
    exit_code: 0,
    stopped: null,
    seed: SEED,
    first_identifier: "",
    last_identifier: "",
    processed: 0,
    arms: emptyArms(),
    not_enrolled: 0,
    no_variant: 0,
    evaluation_failures: 0,
    variant_keys: {},
    events: null,
    client_created: false,
    started_at,
    finished_at: started_at,
  };
  const stop = (reason: string, exit_code: number): RunReport => {
    report.stopped = reason;
    report.exit_code = exit_code;
    report.finished_at = deps.now();
    deps.log(`STOPPED: ${reason}`);
    return report;
  };

  if (!parsed.ok) return stop(parsed.message, 2);
  const args = parsed.args;
  const identities = args.mode === "dry" ? dryIdentities() : syntheticIdentities(args.start, args.count);
  report.first_identifier = identities[0];
  report.last_identifier = identities[identities.length - 1];

  // Guard 1: the key, before anything is constructed or sent.
  const keyProblem = keyRefusal(env);
  if (keyProblem) return stop(keyProblem, 1);
  const key = env[SYNTHETIC_KEY_ENV]!.trim();

  const events = tallyingFetch(deps.fetch);
  report.events = events.tally;
  const client = deps.createClient({
    environmentKey: key,
    enableEvents: true,
    requestTimeoutSeconds: 5,
    retries: 2,
    fetch: events.fetch,
    // Flushes happen only where this script asks: every 100 identities, then close().
    eventProcessorConfig: { flushInterval: 0 },
  });
  report.client_created = true;

  let closed = false;
  const closeOnce = async () => {
    if (closed) return;
    closed = true;
    try {
      await client.close(CLOSE_TIMEOUT_MS);
    } catch (error) {
      deps.log(`close() failed: ${errorText(error, key)}`);
    }
  };

  try {
    // Guard 2: env_label must be `synthetic`, served by Flagsmith.
    let envFlag: EvaluatedFlag | null = null;
    try {
      envFlag = (await client.getEnvironmentFlags()).getFlag("env_label");
    } catch (error) {
      return stop(`env_label could not be read from Flagsmith (${errorText(error, key)}). Nothing was sent.`, 1);
    }
    const labelProblem = envLabelRefusal(envFlag);
    if (labelProblem) return stop(labelProblem, 1);
    deps.log(`env_label is "${EXPECTED_ENV_LABEL}": this is the Synthetic environment.`);

    if (args.mode === "dry") return await dryRun(client, args, report, deps, key);
    return await realRun(client, args, identities, report, deps, key);
  } finally {
    await closeOnce();
    report.finished_at = deps.now();
  }
}

async function dryRun(
  client: SyntheticClient,
  args: RunArgs,
  report: RunReport,
  deps: SyntheticDeps,
  key: string,
): Promise<RunReport> {
  deps.log("Dry run: evaluating synthetic-dry-01 to synthetic-dry-05. No events are sent.");
  let firstFlag: EvaluatedFlag | null = null;
  let notEnrolled = 0;
  const ids = dryIdentities();
  for (let i = 0; i < ids.length; i++) {
    const identifier = ids[i];
    let flag: EvaluatedFlag | null = null;
    try {
      flag = (await client.getIdentityFlags(identifier, sdkTraits(syntheticTraits(i + 1)))).getFlag(SYNTHETIC_EXPERIMENT_FLAG);
    } catch (error) {
      report.evaluation_failures += 1;
      deps.log(`${identifier}: evaluation failed (${errorText(error, key)})`);
      continue;
    }
    report.processed += 1;
    if (i === 0) firstFlag = flag;
    if (!isEnrolled(flag)) notEnrolled += 1;
    if (flag.variant != null) report.variant_keys[flag.variant] = (report.variant_keys[flag.variant] ?? 0) + 1;
    deps.log(`${identifier}: ${describeFlag(flag)}`);
  }

  const plan = drawPlan({ seed: SEED, start: args.start, count: args.count });
  const voiceSaves = plannedSaves(plan, SETUP_ENTRY_TREATMENT);
  const formSaves = plannedSaves(plan, SETUP_ENTRY_CONTROL);
  deps.log("");
  deps.log(
    `Planned real run: ${plan[0].identifier} to ${plan[plan.length - 1].identifier} (${plan.length} identities), seed ${SEED}, a flush every ${FLUSH_EVERY}, close() once at the end.`,
  );
  deps.log(
    `Planted save rates: ${SETUP_ENTRY_TREATMENT} ${PLANTED_RATES.voice_first.toFixed(2)}, ${SETUP_ENTRY_CONTROL} ${PLANTED_RATES.form_first.toFixed(2)}. Seconds to save: ${SECONDS_BASE} to ${SECONDS_BASE + SECONDS_SPREAD}, the same in both arms.`,
  );
  deps.log(
    `From the seeded draws: ${voiceSaves} of ${plan.length} would save if all were ${SETUP_ENTRY_TREATMENT}, ${formSaves} if all were ${SETUP_ENTRY_CONTROL}. Flagsmith's split decides the arms.`,
  );
  deps.log(`Events sent by this dry run: 0.`);

  if (report.evaluation_failures > 0 && !firstFlag) {
    report.exit_code = 1;
    report.stopped = "No dry identity could be evaluated.";
    deps.log(`NOT READY: ${report.stopped}`);
    return report;
  }
  const problem = experimentRefusal(firstFlag, ids[0]);
  if (problem) {
    report.exit_code = 1;
    report.stopped = problem;
    deps.log(`NOT READY: the real run's guard would stop: ${problem}`);
    return report;
  }
  if (notEnrolled > 0) {
    deps.log(`Check: ${notEnrolled} of ${report.processed} dry identities are not enrolled. The rollout should be 100%.`);
  }
  deps.log("READY: the guards pass. Read the lines above, then start the real run.");
  return report;
}

async function realRun(
  client: SyntheticClient,
  args: RunArgs,
  identities: string[],
  report: RunReport,
  deps: SyntheticDeps,
  key: string,
): Promise<RunReport> {
  const plan = drawPlan({ seed: SEED, start: args.start, count: args.count });
  deps.log(`Real run: ${identities[0]} to ${identities[identities.length - 1]}, seed ${SEED}.`);
  let consecutiveFailures = 0;

  for (let i = 0; i < plan.length; i++) {
    const draw = plan[i];
    const iterationStart = deps.now();
    let flag: EvaluatedFlag;
    try {
      flag = (await client.getIdentityFlags(draw.identifier, sdkTraits(syntheticTraits(draw.number)))).getFlag(
        SYNTHETIC_EXPERIMENT_FLAG,
      );
      consecutiveFailures = 0;
    } catch (error) {
      report.evaluation_failures += 1;
      consecutiveFailures += 1;
      deps.log(`${draw.identifier}: evaluation failed (${errorText(error, key)})`);
      if (i === 0) return finish(report, deps, `The first identity, ${draw.identifier}, could not be evaluated. Nothing was sent.`, 1);
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        return finish(report, deps, `${MAX_CONSECUTIVE_FAILURES} evaluations failed in a row; stopped after ${report.processed} identities.`, 1);
      }
      continue;
    }

    // Guard 3: the first identity's flag must carry the experiment.
    if (i === 0) {
      const problem = experimentRefusal(flag, draw.identifier);
      if (problem) return finish(report, deps, `${problem} Nothing was sent.`, 1);
    }

    report.processed += 1;
    let converted = false;
    if (flag.variant == null) {
      report.no_variant += 1;
    } else {
      const arm = armFor(flag.variant);
      report.variant_keys[flag.variant] = (report.variant_keys[flag.variant] ?? 0) + 1;
      report.arms[arm].identities += 1;
      if (isEnrolled(flag)) {
        // The same call shape as the app's exposure (5.3): the variant key as the value.
        client.trackExposureEvent(SYNTHETIC_EXPERIMENT_FLAG, {
          identifier: draw.identifier,
          value: flag.variant,
          metadata: { experiment_id: flag.experiment!.id },
        });
        report.arms[arm].exposures_sent += 1;
        if (convertsFor(arm, draw.conversion_draw)) {
          await deps.sleep(Math.max(EXPOSURE_TO_CONVERSION_MS, MIN_MS_PER_IDENTITY - (deps.now() - iterationStart)));
          client.trackEvent(FLAG_EVENTS.setup_saved, { identifier: draw.identifier, value: draw.seconds });
          if (args.also_seconds_event) {
            client.trackEvent(FLAG_EVENTS.setup_save_seconds, { identifier: draw.identifier, value: draw.seconds });
          }
          report.arms[arm].conversions_sent += 1;
          converted = true;
        }
      } else {
        report.not_enrolled += 1;
      }
    }

    if ((i + 1) % FLUSH_EVERY === 0) {
      await client.flushEvents();
      deps.log(`${i + 1} of ${plan.length} identities done; flushed.`);
    }
    if (!converted) {
      const remaining = MIN_MS_PER_IDENTITY - (deps.now() - iterationStart);
      if (remaining > 0) await deps.sleep(remaining);
    }
  }
  return finish(report, deps, null, 0);
}

function finish(report: RunReport, deps: SyntheticDeps, stopped: string | null, exit_code: number): RunReport {
  report.stopped = stopped;
  report.exit_code = exit_code;
  report.finished_at = deps.now();
  if (stopped) deps.log(`STOPPED: ${stopped}`);
  return report;
}

/** The lines printed after the real run (5.8 Output and Record), for the README. */
export function summaryLines(report: RunReport): string[] {
  const seconds = Math.round((report.finished_at - report.started_at) / 1000);
  const lines = [
    "",
    `Synthetic run ${report.stopped ? "stopped" : "finished"} (Synthetic environment, env_label synthetic).`,
    `Started ${new Date(report.started_at).toISOString()} (${istTime(report.started_at)} IST), finished ${new Date(report.finished_at).toISOString()} (${istTime(report.finished_at)} IST), ${Math.floor(seconds / 60)} min ${seconds % 60} s.`,
    `Seed ${report.seed}. Identities ${report.first_identifier} to ${report.last_identifier}; ${report.processed} evaluated.`,
    "arm          identities  exposures sent  conversions sent",
  ];
  for (const arm of [SETUP_ENTRY_TREATMENT, SETUP_ENTRY_CONTROL] as const) {
    const counts = report.arms[arm];
    lines.push(
      `${arm.padEnd(12)} ${String(counts.identities).padStart(10)}  ${String(counts.exposures_sent).padStart(14)}  ${String(counts.conversions_sent).padStart(16)}`,
    );
  }
  lines.push(`Not enrolled: ${report.not_enrolled}. No variant: ${report.no_variant}. Evaluation failures: ${report.evaluation_failures}.`);
  const keys = Object.entries(report.variant_keys).map(([k, v]) => `${k} ${v}`);
  lines.push(`Variant keys seen: ${keys.length ? keys.join(", ") : "none"}.`);
  if (report.events) {
    const statuses = Object.entries(report.events.by_status).map(([k, v]) => `${k} x${v}`);
    const accepted = Object.entries(report.events.accepted).map(([k, v]) => `${k} ${v}`);
    lines.push(
      `Events API: ${report.events.posts} posts (${statuses.length ? statuses.join(", ") : "no responses"}; network errors ${report.events.network_errors}); accepted: ${accepted.length ? accepted.join(", ") : "none"}.`,
    );
  }
  lines.push("These are counts of what this script sent, not results. Results come from Flagsmith's Synthetic experiment page.");
  return lines;
}

/** True only when this file is the process's entry point, so importing it in tests sends nothing. */
export function isEntryPoint(entry: string | undefined): boolean {
  return /(^|[\\/])synthetic-setup-traffic\.[cm]?[tj]s$/.test(entry ?? "");
}

async function main(): Promise<void> {
  const deps = defaultDeps();
  const report = await runSyntheticTraffic(process.argv.slice(2), process.env, deps);
  if (report.mode === "real" && report.client_created) {
    for (const line of summaryLines(report)) deps.log(line);
  }
  process.exitCode = report.exit_code;
}

if (isEntryPoint(process.argv[1])) {
  main().catch((error: unknown) => {
    console.error(`synthetic run failed: ${errorText(error, process.env[SYNTHETIC_KEY_ENV]?.trim() ?? "")}`);
    process.exitCode = 1;
  });
}
