/**
 * The flags drawer's data shapes (flagsmith.md 5.9, 6.7). Plain data only, shared by Lane C's
 * server builders (src/server/flags/drawer.ts) and the client drawer (FlagDrawer.tsx), so no
 * browser file ever imports src/server/. Nothing here carries a key, an email or a name.
 */
import type { FlagsSelfCheck, SetupEntryVariant } from "@/contracts/flags";

/** One flag as an evaluation returned it, ready to show. */
export type DrawerFlagRow = {
  key: string;
  enabled: boolean;
  value: string | null;
  /** The multivariate variant key, when the flag has one. */
  variant: string | null;
  /** The raw evaluation reason, exactly as the SDK returned it. */
  reason: string | null;
  /** True when the value didn't come from Flagsmith (the default handler answered). */
  fallback: boolean;
};

/** Part 1, "This session": built from VoiceDock's own render evaluation (no extra request). */
export type DrawerSessionPart = {
  /** The `u_…` identity key, or null when the salt is missing. */
  identity: string | null;
  env_label: string;
  expected_env: string;
  /** The last four characters of NEXT_PUBLIC_FLAGSMITH_ENVIRONMENT_ID, read on the server. */
  environment_id_last4: string | null;
  /** True when any flag came from the default handler. */
  fallback: boolean;
  flags: DrawerFlagRow[];
  /** When the render evaluated, as "14:05 IST". */
  evaluated_label: string;
};

/** Item 6 of the full check: the SDK `trackEvent` probe. */
export type DrawerSdkProbe = {
  status: "queued" | "skipped" | "failed";
  note: string;
};

/** "Run check again": items 1 to 6, whatever the 60 s cache holds. */
export type DrawerFullCheck = {
  summary: FlagsSelfCheck;
  sdk_probe: DrawerSdkProbe;
  /** The environment flags the check read, each with its value and raw reason. */
  environment_flags: DrawerFlagRow[];
};

/** One probe identity's evaluation (6.7 probe mode). */
export type DrawerProbeRow = {
  identity: string;
  voice_pilot: { enabled: boolean; reason: string | null; fallback: boolean };
  setup_entry: { variant: string | null; in_experiment: boolean | null; fallback: boolean };
};

/** "Run 50 probes": evaluation only, never events. */
export type DrawerProbes = {
  rows: DrawerProbeRow[];
  voice_pilot_on: number;
  /** Probes on with a reason naming `voice_rollout`. */
  voice_pilot_rollout: number;
  in_experiment: number;
  /** Count per `setup_entry` variant key (or value). */
  variants: Record<string, number>;
  /** Probes whose evaluation fell back (Flagsmith unreadable, or no key). */
  fallback: number;
  ran_label: string;
};

export type DrawerArmCounts = { variant: SetupEntryVariant; exposures: number; saves: number };

/** Part 2, "Sent by Jashn": app-side counts from `experiment_exposures`, Production only. */
export type DrawerSentCounts = {
  env: "production";
  arms: DrawerArmCounts[];
  as_of_label: string;
  source: "database" | "none";
  /** Why the counts are empty, when they can't be read. */
  note: string | null;
};

/** Part 4's quick view of the rollout gate (4.3): Production voice turns in the last 2 hours. */
export type DrawerVoiceTurnCounts = {
  env: "production";
  window_hours: number;
  total: number;
  failed: number;
  paused: number;
  as_of_label: string;
  source: "database" | "memory";
  note: string | null;
};

/** Every action answers `{ ok: false }` with no data for a caller who isn't internal. */
export type DrawerResult<T> = { ok: true; data: T } | { ok: false };

/** Lane C's drawer server actions, passed down from VoiceDock as props. */
export type DrawerActions = {
  latestCheck: () => Promise<DrawerResult<FlagsSelfCheck>>;
  runFullCheck: () => Promise<DrawerResult<DrawerFullCheck>>;
  runProbes: () => Promise<DrawerResult<DrawerProbes>>;
  sentByJashn: () => Promise<DrawerResult<DrawerSentCounts>>;
  voiceTurnCounts: () => Promise<DrawerResult<DrawerVoiceTurnCounts>>;
};

/** What VoiceDock hands its client part for internal accounts; nothing for anyone else. */
export type FlagDrawerData = {
  session: DrawerSessionPart;
  actions: DrawerActions;
};
