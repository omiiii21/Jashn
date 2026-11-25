import "server-only";

import { and, eq, gte, sql } from "drizzle-orm";

import { EXPERIMENT_KEY, SETUP_ENTRY_VARIANTS, type SetupEntryVariant } from "@/contracts/flags";
import type { IsoInstant } from "@/contracts/domain";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { experimentExposures, voiceTurns } from "@/db/schema";
import { memoryTurnsSince } from "@/server/voice/store";

/**
 * The drawer's two readers (flagsmith 5.9, 5.10, 4.3): aggregate counts only, never rows.
 * With DATABASE_URL set they count `app.experiment_exposures` and `app.voice_turns`; with no
 * database the exposure counts are zero with a note, and voice turns come from the in-memory
 * store. Tests inject their own source.
 */

export type ExposureCounts = {
  arms: { variant: SetupEntryVariant; exposures: number; saves: number }[];
  source: "database" | "none";
  note: string | null;
};

export type VoiceTurnCountsRaw = {
  total: number;
  failed: number;
  paused: number;
  source: "database" | "memory";
  note: string | null;
};

export interface DrawerCountsSource {
  /** Exposures and saves per arm for `setup_entry`, rows whose `flagsmith_env` is `env`. */
  exposureCounts(env: "production"): Promise<ExposureCounts>;
  /** Voice turns created since `since` whose recorded `flags.env_label` is `env`. */
  voiceTurnCounts(env: "production", since: IsoInstant): Promise<VoiceTurnCountsRaw>;
}

export function zeroArms(): ExposureCounts["arms"] {
  return SETUP_ENTRY_VARIANTS.map((variant) => ({ variant, exposures: 0, saves: 0 }));
}

/** No database yet: zero exposures (said so), and voice turns from the in-memory store. */
export const memoryCountsSource: DrawerCountsSource = {
  async exposureCounts() {
    return {
      arms: zeroArms(),
      source: "none",
      note: "No database is configured on this server, so experiment_exposures can't be read: the counts show 0.",
    };
  },
  async voiceTurnCounts(env, since) {
    const turns = memoryTurnsSince(since).filter((turn) => turn.flags?.env_label === env);
    return {
      total: turns.length,
      failed: turns.filter((turn) => turn.status === "failed").length,
      paused: turns.filter((turn) => turn.status === "paused").length,
      source: "memory",
      note: "No database is configured on this server: these are this instance's in-memory turns only.",
    };
  },
};

function safeCount(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isSafeInteger(n) && n >= 0 ? n : 0;
}

/**
 * Drizzle on Lane A's tables (core query builder; aggregates cast to bigint). Read only:
 * the drawer never writes either table.
 */
export const databaseCountsSource: DrawerCountsSource = {
  async exposureCounts(env) {
    const rows = await getDb()
      .select({
        variant: experimentExposures.variant,
        exposures: sql<number>`count(*)::bigint`,
        saves: sql<number>`count(${experimentExposures.converted_at})::bigint`,
      })
      .from(experimentExposures)
      .where(and(eq(experimentExposures.experiment, EXPERIMENT_KEY), eq(experimentExposures.flagsmith_env, env)))
      .groupBy(experimentExposures.variant);
    const arms = zeroArms().map((arm) => {
      const row = rows.find((candidate) => candidate.variant === arm.variant);
      return row ? { ...arm, exposures: safeCount(row.exposures), saves: safeCount(row.saves) } : arm;
    });
    return { arms, source: "database", note: null };
  },
  async voiceTurnCounts(env, since) {
    const [row] = await getDb()
      .select({
        total: sql<number>`count(*)::bigint`,
        failed: sql<number>`(count(*) filter (where ${voiceTurns.status} = 'failed'))::bigint`,
        paused: sql<number>`(count(*) filter (where ${voiceTurns.status} = 'paused'))::bigint`,
      })
      .from(voiceTurns)
      .where(and(gte(voiceTurns.created_at, new Date(since)), sql`${voiceTurns.flags} ->> 'env_label' = ${env}`));
    return {
      total: safeCount(row?.total),
      failed: safeCount(row?.failed),
      paused: safeCount(row?.paused),
      source: "database",
      note: null,
    };
  },
};

let override: DrawerCountsSource | null = null;

/** The source the drawer reads: a test override, else the database when configured, else memory. */
export function getDrawerCountsSource(): DrawerCountsSource {
  if (override) return override;
  return isDatabaseConfigured() ? databaseCountsSource : memoryCountsSource;
}

/** Replaces the source in tests (null restores the default). */
export function setDrawerCountsSourceForTests(next: DrawerCountsSource | null): void {
  override = next;
}
