import "server-only";

import { and, eq, isNotNull } from "drizzle-orm";

import { CommandFailure } from "@/contracts/commands";
import { RESET_CHECKPOINTS, type ResetCheckpoint, type WeddingId } from "@/contracts/domain";
import { SEED_KEYS } from "@/contracts/fixtures";
import type { HandlerMap, ResetDemoHandler } from "@/contracts/services";
import type { Tx } from "@/db/client";
import { SAMPLE_COPIES, seededId, type SampleCopy } from "@/db/ids";
import { members, weddings } from "@/db/schema";
import { applySeedState, datasetForCheckpoint } from "@/db/seed-apply";
import { buildSeedDataset, fallbackUserId, seedAccounts, type SeedDataset } from "@/db/seed-data";

/**
 * `reset_demo` (domain 3.7, acceptance 5.1 and 5.2; decisions D17, D107, D120).
 *
 * Owner only (the dispatcher's role matrix), only on a seeded `is_sample` copy and only when
 * the server env `DEMO_RESET_ENABLED` is exactly `true`. Everything runs in the dispatcher's
 * transaction, which already holds the `weddings` row lock (step 1).
 *
 * Steps 2 to 4 are the seed's own `applySeedState` (src/db/seed-apply.ts), so the seed script
 * and the reset share one copy of the data and one delete-then-upsert order: live rows (no
 * `seed_key`) go, children first; every seeded row is upserted with its fixed id and seeded
 * values, `published_revision` and `draft_version` included. Kept: auth users, `members`
 * (seeded rows get their seeded values, with the user ids read here), `invitation_links`
 * (Tara's link keeps working, a revoked link stays revoked), `assets` (the couple photo,
 * D107), `experiment_exposures`, `card_imports`, Storage files and the seeded card's
 * artifact fields. `s0` is `datasetForCheckpoint(…, "s0")`: D0 without COM-01, PAY-01 and
 * their versions, with QUO-01 open again.
 *
 * `weddings.version` goes up by exactly one for the command, and the dispatcher is the one
 * that adds it (domain 3.0 step 6). `applySeedState` adds one of its own for the seed script,
 * so this handler puts `version` back to its value under the lock before returning; no one
 * outside the transaction ever sees the intermediate value.
 *
 * No activity entry and no topic: the one exception to L1. The reset is logged on the server.
 */

// ---------------------------------------------------------------------------
// Pure parts (unit-tested in demo.test.ts)
// ---------------------------------------------------------------------------

/** The sample copy whose fixed wedding id this is, or null for any other wedding. */
export function sampleCopyOf(wedding_id: string): SampleCopy | null {
  for (const copy of SAMPLE_COPIES) {
    if (seededId(copy, "weddings", SEED_KEYS.wedding) === wedding_id) return copy;
  }
  return null;
}

/** `DEMO_RESET_ENABLED` must be exactly `true` (architecture 5). */
export function demoResetEnabledFromEnv(env: Record<string, string | undefined> = process.env): boolean {
  return env.DEMO_RESET_ENABLED === "true";
}

/**
 * The dataset's `user_ids` (by account email) from the kept members rows (by `seed_key`), so
 * a reset needs no Supabase call. An account whose member row is missing falls back to the
 * seed's local stand-in id; `missing` names them for the log.
 */
export function seedUserIds(
  copy: SampleCopy,
  rows: readonly { seed_key: string | null; user_id: string }[],
): { user_ids: Record<string, string>; missing: string[] } {
  const bySeedKey = new Map<string, string>();
  for (const row of rows) {
    if (row.seed_key) bySeedKey.set(row.seed_key, row.user_id);
  }
  const user_ids: Record<string, string> = {};
  const missing: string[] = [];
  for (const account of seedAccounts(copy)) {
    const found = bySeedKey.get(account.member_key);
    if (found) {
      user_ids[account.email] = found;
    } else {
      user_ids[account.email] = fallbackUserId(account.email);
      missing.push(account.member_key);
    }
  }
  return { user_ids, missing };
}

/** The dataset a checkpoint restores (domain 3.7). */
export function resetDataset(copy: SampleCopy, checkpoint: ResetCheckpoint, user_ids: Record<string, string>): SeedDataset {
  return datasetForCheckpoint(buildSeedDataset(copy, { user_ids }), checkpoint);
}

// ---------------------------------------------------------------------------
// The handler
// ---------------------------------------------------------------------------

export type ResetDemoDeps = {
  resetEnabled: () => boolean;
  log: (message: string, details: Record<string, unknown>) => void;
};

const defaultDeps: ResetDemoDeps = {
  resetEnabled: () => demoResetEnabledFromEnv(),
  log: (message, details) => console.info(`[jashn] ${message}`, details),
};

const notSample = () => new CommandFailure({ code: "not_sample_wedding", message: "Only a sample wedding can be reset." });

export function createResetDemoHandler(overrides: Partial<ResetDemoDeps> = {}): ResetDemoHandler<Tx> {
  const deps: ResetDemoDeps = { ...defaultDeps, ...overrides };

  return async (ctx) => {
    const { tx, input } = ctx;
    const wedding_id: WeddingId | null = ctx.wedding_id;

    if (!deps.resetEnabled()) {
      throw new CommandFailure({ code: "demo_reset_disabled", message: "Demo reset is turned off here." });
    }
    // The dispatcher has parsed the input already; checked again so a direct call can't skip it.
    if (input.confirm_text !== "RESET") {
      throw new CommandFailure({ code: "validation_failed", message: "unknown_value", field: "confirm_text" });
    }
    const checkpoint: ResetCheckpoint = input.checkpoint ?? "d0";
    if (!(RESET_CHECKPOINTS as readonly string[]).includes(checkpoint)) {
      throw new CommandFailure({ code: "validation_failed", message: "unknown_value", field: "checkpoint" });
    }
    if (!wedding_id) throw new CommandFailure({ code: "not_found", message: "Not found." });

    // Step 1: the dispatcher holds the lock; read the row under it (a no-op re-lock).
    const [wedding] = await tx
      .select({ id: weddings.id, is_sample: weddings.is_sample, version: weddings.version, seed_key: weddings.seed_key })
      .from(weddings)
      .where(eq(weddings.id, wedding_id))
      .for("update");
    if (!wedding) throw new CommandFailure({ code: "not_found", message: "Not found." });
    if (!wedding.is_sample) throw notSample();
    // Only a seeded copy has a D0 to go back to; a throwaway sample wedding has none.
    const copy = sampleCopyOf(wedding_id);
    if (!copy || wedding.seed_key !== SEED_KEYS.wedding) throw notSample();
    const versionBefore = Number(wedding.version);

    // Members are kept, so their auth user ids build the dataset.
    const memberRows = await tx
      .select({ seed_key: members.seed_key, user_id: members.user_id })
      .from(members)
      .where(and(eq(members.wedding_id, wedding_id), isNotNull(members.seed_key)));
    const { user_ids, missing } = seedUserIds(copy, memberRows);

    const dataset = resetDataset(copy, checkpoint, user_ids);
    if (dataset.wedding_id !== wedding_id) throw new Error(`reset_demo: the ${copy} dataset is for another wedding`);

    // Steps 2 to 4: one copy of the data, shared with the seed script.
    await applySeedState(tx, dataset, { now: new Date(ctx.now) });

    // The command's one version bump is the dispatcher's: undo the applier's own.
    const [after] = await tx
      .update(weddings)
      .set({ version: versionBefore })
      .where(eq(weddings.id, wedding_id))
      .returning({ draft_version: weddings.draft_version, published_revision: weddings.published_revision });
    if (!after) throw new Error("reset_demo: the wedding row vanished");

    deps.log("reset_demo", {
      wedding_id,
      copy,
      checkpoint,
      member_id: ctx.actor.kind === "guest" || ctx.actor.kind === "system" ? null : ctx.actor.member_id,
      ...(missing.length > 0 ? { members_missing: missing } : {}),
    });

    return {
      outcome: "applied",
      result: {
        checkpoint,
        draft_version: Number(after.draft_version),
        published_revision: after.published_revision === null ? null : Number(after.published_revision),
      },
      // The one exception to L1 (domain 3.7): no entry, no topic; the version bump refreshes screens.
      activity: null,
    };
  };
}

export const resetDemoHandler: ResetDemoHandler<Tx> = createResetDemoHandler();

export const demoHandlers: HandlerMap = {
  reset_demo: resetDemoHandler,
};
