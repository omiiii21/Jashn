import "server-only";

import { and, count, eq, isNull } from "drizzle-orm";

import {
  EXPERIMENT_KEY,
  expectedEnvLabel,
  FLAG_EVENTS,
  FLAG_KEYS,
  SETUP_SECONDS_MAX,
  type EnvironmentFlags,
  type SetupSavedInput,
} from "@/contracts/flags";
import type { IsoInstant } from "@/contracts/domain";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { members } from "@/db/schema";

import { getFlagsmithSdk } from "./client";
import { envLabelOf, readEnvironmentFlagsFresh } from "./evaluate";
import { getExposureStore, type ExposureStore } from "./exposures";
import { isInternalUser, userIdentity } from "./identity";
import type { ExperimentEventsSdk } from "./setup-render";

/**
 * The setup-saved hook (flagsmith 5.4): the dispatcher calls it in `after()` after
 * `set_wedding_profile`. For a first-wedding create it sends `setup_saved` with the seconds to
 * save, marks the user's exposure row converted, and flushes. Sent for both arms and both input
 * paths, whatever the enrolment (Flagsmith ignores a conversion with no exposure). Never throws;
 * one log line per call, with no user data.
 */

export type SetupSavedDeps = {
  readEnvironment?: () => Promise<EnvironmentFlags>;
  sdk?: ExperimentEventsSdk | null;
  store?: ExposureStore;
  /** How many weddings the user owns now (active owner memberships). */
  ownedWeddings?: (input: SetupSavedInput) => Promise<number>;
  node_env?: string | undefined;
  identity?: (user_id: string) => string | null;
  log?: (line: string) => void;
};

export type SetupSavedOutcome =
  | "sent"
  | "skip_not_create"
  | "skip_internal"
  | "skip_not_first_wedding"
  | "skip_fallback"
  | "skip_env_mismatch"
  | "skip_no_identity"
  | "failed";

/** Whole seconds from `start` to `committed`, clamped to 0–3600; null without a start or with a future one. */
export function secondsToSave(start: IsoInstant | null, committed: IsoInstant): number | null {
  if (!start) return null;
  const from = Date.parse(start);
  const to = Date.parse(committed);
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  if (from > to) return null;
  return Math.min(SETUP_SECONDS_MAX, Math.max(0, Math.floor((to - from) / 1000)));
}

/** Active owner memberships of the user, from `app.members` (architecture 4.2 rule 2). */
async function ownedWeddingsFromDb(input: SetupSavedInput): Promise<number> {
  if (!isDatabaseConfigured()) {
    // No database: the fixture path. A first-wedding actor now owns exactly the new one.
    return input.actor.is_first_wedding ? 1 : 2;
  }
  const [row] = await getDb()
    .select({ n: count() })
    .from(members)
    .where(and(eq(members.user_id, input.actor.user_id), eq(members.role, "owner"), isNull(members.removed_at)));
  return Number(row?.n ?? 0);
}

export async function handleSetupSaved(input: SetupSavedInput, deps: SetupSavedDeps = {}): Promise<SetupSavedOutcome> {
  const log = deps.log ?? ((line: string) => console.info(line));
  const done = (outcome: SetupSavedOutcome): SetupSavedOutcome => {
    log(`setup-saved ${outcome}`);
    return outcome;
  };
  try {
    // 1. The case.
    if (!input.is_create || input.outcome !== "applied" || !input.wedding_id) return done("skip_not_create");
    if (isInternalUser(input.actor)) return done("skip_internal");
    const owned = await (deps.ownedWeddings ?? ownedWeddingsFromDb)(input);
    if (owned !== 1) return done("skip_not_first_wedding");

    // 2. The environment: environment flags once; nothing unless all were served and env_label matches.
    const flags = await (deps.readEnvironment ?? readEnvironmentFlagsFresh)();
    if (FLAG_KEYS.some((key) => !flags[key] || flags[key].fallback)) return done("skip_fallback");
    const env_label = envLabelOf(flags.env_label);
    const node_env = "node_env" in deps ? deps.node_env : process.env.NODE_ENV;
    if (env_label !== expectedEnvLabel(node_env)) return done("skip_env_mismatch");

    const identity = (deps.identity ?? userIdentity)(input.actor.user_id);
    if (!identity) return done("skip_no_identity");

    // 3. The value: from the exposure row's exposed_at, else from setup_opened_at.
    const store = deps.store ?? getExposureStore();
    const key = { user_id: input.actor.user_id, experiment: EXPERIMENT_KEY, flagsmith_env: env_label };
    let row = null;
    try {
      row = await store.get(key);
    } catch {
      row = null;
    }
    const seconds = secondsToSave(row ? row.exposed_at : input.setup_opened_at, input.committed_at);

    // 4. Send it.
    const sdk = deps.sdk !== undefined ? deps.sdk : getFlagsmithSdk();
    if (sdk) sdk.trackEvent(FLAG_EVENTS.setup_saved, { identifier: identity, ...(seconds !== null ? { value: seconds } : {}) });

    // 5. Record it.
    if (row) {
      try {
        await store.markConverted(key, { converted_at: input.committed_at, seconds_to_save: seconds, wedding_id: input.wedding_id });
      } catch {
        console.warn("setup-saved exposure row not updated");
      }
    }

    // 6. Flush.
    if (sdk) await sdk.flushEvents();
    return done("sent");
  } catch {
    return done("failed");
  }
}
