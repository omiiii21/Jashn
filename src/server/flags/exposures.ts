import "server-only";

import { and, count, eq, isNotNull } from "drizzle-orm";

import { EXPERIMENT_KEY, SETUP_ENTRY_VARIANTS, type SetupEntryVariant } from "@/contracts/flags";
import type { IsoInstant, WeddingId } from "@/contracts/domain";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { experimentExposures } from "@/db/schema";

/**
 * The `experiment_exposures` store (flagsmith 5.10). Lane C writes it outside the dispatcher
 * (it never moves `weddings.version`). Every row records its Flagsmith environment, because
 * Development and Production share one database. The drawer reads it only as aggregates.
 *
 * Drizzle on `app.experiment_exposures` when DATABASE_URL is set; otherwise an in-memory fake
 * on globalThis (per instance, lost on restart), so setup works on fixtures.
 */

export type ExposureKey = { user_id: string; experiment: string; flagsmith_env: string };

export type ExposureRow = ExposureKey & {
  id: string;
  flagsmith_experiment_id: string | null;
  identity_key: string;
  variant: SetupEntryVariant;
  exposed_at: IsoInstant;
  converted_at: IsoInstant | null;
  seconds_to_save: number | null;
  wedding_id: WeddingId | null;
};

export type NewExposure = ExposureKey & {
  flagsmith_experiment_id: string | null;
  identity_key: string;
  variant: SetupEntryVariant;
  exposed_at: IsoInstant;
};

export type Conversion = { converted_at: IsoInstant; seconds_to_save: number | null; wedding_id: WeddingId | null };

export type ArmCounts = { exposures: number; saves: number };

export interface ExposureStore {
  get(key: ExposureKey): Promise<ExposureRow | null>;
  /** Inserts the row unless one exists for the key; an existing row is left alone. Returns the stored row. */
  insertIfAbsent(row: NewExposure): Promise<ExposureRow>;
  /** Sets the conversion on the key's row; false when there is no row. */
  markConverted(key: ExposureKey, conversion: Conversion): Promise<boolean>;
  /** Exposures and saves per arm for one experiment and environment. */
  countsByArm(experiment: string, flagsmith_env: string): Promise<Record<SetupEntryVariant, ArmCounts>>;
}

function emptyCounts(): Record<SetupEntryVariant, ArmCounts> {
  return { form_first: { exposures: 0, saves: 0 }, voice_first: { exposures: 0, saves: 0 } };
}

function isVariant(value: string): value is SetupEntryVariant {
  return (SETUP_ENTRY_VARIANTS as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// In-memory fake
// ---------------------------------------------------------------------------

function keyOf(key: ExposureKey): string {
  return `${key.user_id}|${key.experiment}|${key.flagsmith_env}`;
}

/** A fresh in-memory store (tests make one each; the app shares one through globalThis). */
export function createMemoryExposureStore(): ExposureStore {
  const rows = new Map<string, ExposureRow>();
  return {
    async get(key) {
      const row = rows.get(keyOf(key));
      return row ? { ...row } : null;
    },
    async insertIfAbsent(row) {
      const existing = rows.get(keyOf(row));
      if (existing) return { ...existing };
      const stored: ExposureRow = { ...row, id: crypto.randomUUID(), converted_at: null, seconds_to_save: null, wedding_id: null };
      rows.set(keyOf(row), stored);
      return { ...stored };
    },
    async markConverted(key, conversion) {
      const existing = rows.get(keyOf(key));
      if (!existing) return false;
      rows.set(keyOf(key), { ...existing, ...conversion });
      return true;
    },
    async countsByArm(experiment, flagsmith_env) {
      const counts = emptyCounts();
      for (const row of rows.values()) {
        if (row.experiment !== experiment || row.flagsmith_env !== flagsmith_env) continue;
        counts[row.variant].exposures += 1;
        if (row.converted_at) counts[row.variant].saves += 1;
      }
      return counts;
    },
  };
}

// ---------------------------------------------------------------------------
// Drizzle
// ---------------------------------------------------------------------------

type DbRow = typeof experimentExposures.$inferSelect;

function iso(value: Date | null): IsoInstant | null {
  return value ? value.toISOString() : null;
}

function fromDb(row: DbRow): ExposureRow {
  return {
    id: row.id,
    user_id: row.user_id,
    experiment: row.experiment,
    flagsmith_env: row.flagsmith_env,
    flagsmith_experiment_id: row.flagsmith_experiment_id,
    identity_key: row.identity_key,
    variant: isVariant(row.variant) ? row.variant : "form_first",
    exposed_at: row.exposed_at.toISOString(),
    converted_at: iso(row.converted_at),
    seconds_to_save: row.seconds_to_save,
    wedding_id: row.wedding_id as WeddingId | null,
  };
}

function whereKey(key: ExposureKey) {
  return and(
    eq(experimentExposures.user_id, key.user_id),
    eq(experimentExposures.experiment, key.experiment),
    eq(experimentExposures.flagsmith_env, key.flagsmith_env),
  );
}

export function createDrizzleExposureStore(): ExposureStore {
  return {
    async get(key) {
      const [row] = await getDb().select().from(experimentExposures).where(whereKey(key)).limit(1);
      return row ? fromDb(row) : null;
    },
    async insertIfAbsent(row) {
      const db = getDb();
      await db
        .insert(experimentExposures)
        .values({
          user_id: row.user_id,
          experiment: row.experiment,
          flagsmith_env: row.flagsmith_env,
          flagsmith_experiment_id: row.flagsmith_experiment_id,
          identity_key: row.identity_key,
          variant: row.variant,
          exposed_at: new Date(row.exposed_at),
        })
        .onConflictDoNothing({
          target: [experimentExposures.user_id, experimentExposures.experiment, experimentExposures.flagsmith_env],
        });
      const [stored] = await db.select().from(experimentExposures).where(whereKey(row)).limit(1);
      if (!stored) throw new Error("experiment exposure row missing after insert");
      return fromDb(stored);
    },
    async markConverted(key, conversion) {
      const updated = await getDb()
        .update(experimentExposures)
        .set({
          converted_at: new Date(conversion.converted_at),
          seconds_to_save: conversion.seconds_to_save,
          wedding_id: conversion.wedding_id,
        })
        .where(whereKey(key))
        .returning({ id: experimentExposures.id });
      return updated.length > 0;
    },
    async countsByArm(experiment, flagsmith_env) {
      const scope = and(eq(experimentExposures.experiment, experiment), eq(experimentExposures.flagsmith_env, flagsmith_env));
      const db = getDb();
      const [exposed, saved] = await Promise.all([
        db
          .select({ variant: experimentExposures.variant, n: count() })
          .from(experimentExposures)
          .where(scope)
          .groupBy(experimentExposures.variant),
        db
          .select({ variant: experimentExposures.variant, n: count() })
          .from(experimentExposures)
          .where(and(scope, isNotNull(experimentExposures.converted_at)))
          .groupBy(experimentExposures.variant),
      ]);
      const counts = emptyCounts();
      for (const row of exposed) if (isVariant(row.variant)) counts[row.variant].exposures = Number(row.n);
      for (const row of saved) if (isVariant(row.variant)) counts[row.variant].saves = Number(row.n);
      return counts;
    },
  };
}

// ---------------------------------------------------------------------------
// The store the app uses
// ---------------------------------------------------------------------------

const GLOBAL_KEY = "__jashn_experiment_exposure_store__";
type GlobalHolder = { [GLOBAL_KEY]?: ExposureStore };

let override: ExposureStore | null = null;

/** Drizzle when the database is configured, else the shared in-memory fake. */
export function getExposureStore(): ExposureStore {
  if (override) return override;
  if (isDatabaseConfigured()) return createDrizzleExposureStore();
  const holder = globalThis as unknown as GlobalHolder;
  holder[GLOBAL_KEY] ??= createMemoryExposureStore();
  return holder[GLOBAL_KEY];
}

/** Tests: replace the store (null restores the default). */
export function setExposureStoreForTests(store: ExposureStore | null): void {
  override = store;
}

/** The drawer's "Sent by Jashn" numbers (5.9): exposures and saves per arm, as of now. */
export type SentByJashn = {
  experiment: string;
  flagsmith_env: string;
  as_of: IsoInstant;
  arms: Record<SetupEntryVariant, ArmCounts>;
};

/** Counts for `setup_entry` in one Flagsmith environment (the drawer passes "production"). */
export async function countSentByJashn(flagsmith_env: string): Promise<SentByJashn> {
  const arms = await getExposureStore().countsByArm(EXPERIMENT_KEY, flagsmith_env);
  return { experiment: EXPERIMENT_KEY, flagsmith_env, as_of: new Date().toISOString(), arms };
}
