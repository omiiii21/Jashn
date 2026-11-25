import "server-only";

import { SETUP_ENTRY_VARIANTS, type SetupEntryVariant } from "@/contracts/flags";
import type { IsoInstant } from "@/contracts/domain";
import { memoryTurnsSince } from "@/server/voice/store";

/**
 * The drawer's two readers (flagsmith 5.9, 5.10, 4.3): aggregate counts only, never rows.
 * Behind a small interface so the drawer works before Lane A's schema is on main: with no
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

let override: DrawerCountsSource | null = null;

/** The source the drawer reads: a test override, else the in-memory one until the schema lands. */
export function getDrawerCountsSource(): DrawerCountsSource {
  return override ?? memoryCountsSource;
}

/** Replaces the source in tests (null restores the default). */
export function setDrawerCountsSourceForTests(next: DrawerCountsSource | null): void {
  override = next;
}
