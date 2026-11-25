/**
 * Flagsmith names (flagsmith.md 2–5, binding for names): flag keys, variation keys,
 * values, fallbacks, traits, segments, events, metrics, identity formats and chips; plus
 * the interfaces the dispatcher calls: the voice gate and the setup-saved hook.
 *
 * `image_extraction_provider` follows in lane-lead-contracts-2 with card-import.ts (D115).
 * Nothing reads a flag in the browser (flagsmith.md 6.9): these are names and types only.
 */
import type { CommandName, CommandOutcome } from "./commands";
import type { AppLanguage, IsoInstant, MemberRole, SessionActor, WeddingId } from "./domain";

// ---------------------------------------------------------------------------
// Flags (3.0)
// ---------------------------------------------------------------------------

export const FLAG_KEYS = [
  "voice_pilot",
  "voice_writes_enabled",
  "spoken_replies",
  "setup_entry",
  "setup_entry_synthetic",
  "env_label",
  "export_failure_drill",
  "card_renderer",
] as const;
export type FlagKey = (typeof FLAG_KEYS)[number];

/** `setup_entry` (and `setup_entry_synthetic`): control `form_first`, variation `voice_first`. */
export const SETUP_ENTRY_VARIANTS = ["form_first", "voice_first"] as const;
export type SetupEntryVariant = (typeof SETUP_ENTRY_VARIANTS)[number];
export const SETUP_ENTRY_CONTROL: SetupEntryVariant = "form_first";
/** Branch on the variant key: only this key means voice-first; anything else is form-first. */
export const SETUP_ENTRY_TREATMENT: SetupEntryVariant = "voice_first";

/** `env_label` values, plus the fallback `unknown`. */
export const ENV_LABELS = ["development", "production", "synthetic"] as const;
export type EnvLabel = (typeof ENV_LABELS)[number];
export type EnvLabelValue = EnvLabel | "unknown";

/** 3.5: `production` when NODE_ENV is production, `development` under next dev. No override. */
export function expectedEnvLabel(node_env: string | undefined): EnvLabel {
  return node_env === "production" ? "production" : "development";
}

/** `card_renderer` values (3.7). */
export const CARD_RENDERERS = ["chromium", "og"] as const;
export type CardRenderer = (typeof CARD_RENDERERS)[number];

/** Flag tags as created in the dashboard (3.0). */
export const FLAG_TAGS: Record<FlagKey, readonly string[]> = {
  voice_pilot: ["rollout"],
  voice_writes_enabled: ["kill-switch", "protected"],
  spoken_replies: [],
  setup_entry: ["experiment", "protected"],
  setup_entry_synthetic: ["synthetic", "experiment", "protected"],
  env_label: ["system"],
  export_failure_drill: ["ops"],
  card_renderer: ["ops"],
};

/** What a flag reads as when Flagsmith can't be read or the flag is missing (3.0, 6.8). */
export type FlagFallback = {
  enabled: boolean;
  value: string | null;
  /** `voice_pilot` only: on for internal accounts, off for everyone else. */
  enabled_for_internal?: boolean;
};

/**
 * Fallbacks. `setup_entry_synthetic` has none: the synthetic run stops instead.
 * `export_failure_drill` falls back to disabled, then to `EXPORT_FAILURE_DRILL` (a wedding id).
 */
export const FLAG_FALLBACKS: Record<FlagKey, FlagFallback | null> = {
  voice_pilot: { enabled: false, value: null, enabled_for_internal: true },
  voice_writes_enabled: { enabled: false, value: null },
  spoken_replies: { enabled: true, value: null },
  setup_entry: { enabled: true, value: SETUP_ENTRY_CONTROL },
  setup_entry_synthetic: null,
  env_label: { enabled: true, value: "unknown" },
  export_failure_drill: { enabled: false, value: "" },
  card_renderer: { enabled: true, value: "chromium" },
};

/** The env var that stands in for `export_failure_drill`'s value when Flagsmith can't be read (3.6). */
export const EXPORT_FAILURE_DRILL_ENV = "EXPORT_FAILURE_DRILL";

// ---------------------------------------------------------------------------
// Identities and traits (2.2, 2.3)
// ---------------------------------------------------------------------------

/** `u_` plus the first 32 hex characters of HMAC-SHA256(FLAGSMITH_ID_SALT, auth user id). */
export const USER_IDENTITY_PREFIX = "u_";
export const USER_IDENTITY_PATTERN = /^u_[0-9a-f]{32}$/;
export const SELFCHECK_IDENTITY = "probe-selfcheck";
/** `probe-01` to `probe-50` (the drawer's probe mode). */
export const PROBE_IDENTITY_PREFIX = "probe-";
export const PROBE_IDENTITY_COUNT = 50;
/** `synthetic-0001` to `synthetic-0800`; the dry run uses `synthetic-dry-01` to `-05`. */
export const SYNTHETIC_IDENTITY_PREFIX = "synthetic-";
export const SYNTHETIC_DRY_IDENTITY_PREFIX = "synthetic-dry-";
export const SYNTHETIC_IDENTITY_COUNT = 800;

export const TRAIT_KEYS = ["preferred_language", "role", "is_internal", "is_first_wedding", "traffic"] as const;
export type TraitKey = (typeof TRAIT_KEYS)[number];

/** Persisted traits show on Flagsmith's Identities page; transient ones are used once. */
export const PERSISTED_TRAITS: readonly TraitKey[] = ["preferred_language", "traffic"];
export const TRANSIENT_TRAITS: readonly TraitKey[] = ["role", "is_internal", "is_first_wedding"];

/** The traits sent for a signed-in user. Booleans stay booleans. */
export type UserTraits = {
  preferred_language: AppLanguage;
  role: MemberRole;
  is_internal: boolean;
  is_first_wedding: boolean;
};

/** Only the synthetic run sends `traffic`. */
export type SyntheticTraits = UserTraits & { traffic: "synthetic" };

/** The internal-account rule (2.3): listed in INTERNAL_USER_EMAILS, or ending in this domain. */
export const INTERNAL_EMAIL_DOMAIN = "@example.com";
export const INTERNAL_USER_EMAILS_ENV = "INTERNAL_USER_EMAILS";

/** The traits for a session actor. On /setup (no membership) the role is `owner` (2.3). */
export function traitsFor(actor: Pick<SessionActor, "preferred_language" | "role" | "is_internal" | "is_first_wedding">): UserTraits {
  return {
    preferred_language: actor.preferred_language,
    role: actor.role ?? "owner",
    is_internal: actor.is_internal,
    is_first_wedding: actor.is_first_wedding,
  };
}

// ---------------------------------------------------------------------------
// Segments (4.1)
// ---------------------------------------------------------------------------

export const SEGMENT_KEYS = ["internal_team", "voice_rollout", "new_owners"] as const;
export type SegmentKey = (typeof SEGMENT_KEYS)[number];

/** The `voice_rollout` split by rollout step (4.3): 10, then 50, then 100. */
export const VOICE_ROLLOUT_STEPS = [10, 50, 100] as const;

// ---------------------------------------------------------------------------
// The experiment, events and metrics (5)
// ---------------------------------------------------------------------------

export const EXPERIMENT_FLAG: FlagKey = "setup_entry";
export const SYNTHETIC_EXPERIMENT_FLAG: FlagKey = "setup_entry_synthetic";
/** `experiment_exposures.experiment`. */
export const EXPERIMENT_KEY = "setup_entry";

export const FLAG_EVENTS = {
  /** The conversion: `trackEvent`, value = whole seconds to save, clamped 0–3600 (5.4). */
  setup_saved: "setup_saved",
  /** Sent too only if the wizard won't attach two metrics to one event (U11). */
  setup_save_seconds: "setup_save_seconds",
  /** The self-check's direct events probe; matches no metric (6.7 item 5). */
  selfcheck: "jashn_selfcheck",
  /** The drawer's SDK probe (6.7 item 6). */
  selfcheck_sdk: "jashn_selfcheck_sdk",
} as const;
export type FlagEventName = (typeof FLAG_EVENTS)[keyof typeof FLAG_EVENTS];

export const SETUP_SECONDS_MAX = 3600;

export const FLAG_METRICS = [
  { name: "Setup saved", event: "setup_saved", aggregation: "occurrence", direction: "higher_is_better" },
  { name: "Seconds to save", event: "setup_saved", aggregation: "mean", direction: "lower_is_better" },
] as const;

/** `POST https://events.api.flagsmith.com/v1/events` with `X-Environment-Key`. */
export const FLAGSMITH_EVENTS_URL = "https://events.api.flagsmith.com/v1/events";
export const FLAGSMITH_SDK_LABEL = "@flagsmith/nodejs 9.5.0";

/** 6.3: 2 s request timeout, 1 retry, then fallbacks; a 30 s breaker after a failure. */
export const FLAGSMITH_TIMEOUT_SECONDS = 2;
export const FLAGSMITH_RETRIES = 1;
export const FLAGSMITH_BREAKER_MS = 30_000;
/** 6.7: `/api/health` serves each instance's latest self-check for 60 s. */
export const SELFCHECK_CACHE_MS = 60_000;

// ---------------------------------------------------------------------------
// The reason chip (3.1) and the dock fields (6.9)
// ---------------------------------------------------------------------------

export const CHIP_KEYS = ["internal_team", "voice_rollout", "voice_on", "questions_only", "safe_mode"] as const;
export type ChipKey = (typeof CHIP_KEYS)[number];

export const CHIP_LABELS: Record<ChipKey, { label_en: string; label_hi: string; explanation: string }> = {
  internal_team: {
    label_en: "Voice · team preview",
    label_hi: "वॉइस · टीम प्रीव्यू",
    explanation: "Voice is on because this is a Jashn team or demo account.",
  },
  voice_rollout: {
    label_en: "Voice · pilot group",
    label_hi: "वॉइस · पायलट ग्रुप",
    explanation: "Voice is on because you are in the voice pilot for owners and managers.",
  },
  voice_on: {
    label_en: "Voice · on",
    label_hi: "वॉइस · चालू",
    explanation: "Voice is on for everyone.",
  },
  questions_only: {
    label_en: "Questions only",
    label_hi: "सिर्फ़ सवाल",
    explanation: "Voice can answer questions. To change something, type it.",
  },
  safe_mode: {
    label_en: "Voice · safe mode",
    label_hi: "वॉइस · सेफ़ मोड",
    explanation: "Flagsmith can't be reached, so voice can answer questions but not save changes.",
  },
};

/** The mic's off text (design-direction 7.1). */
export const VOICE_OFF_TEXT = "Voice is switched off right now. You can type or edit directly.";

export type VoiceChip = { key: ChipKey; label_en: string; label_hi: string };

/**
 * The five dock fields: VoiceDock's props and the `voice` block of every voice response.
 * `chip` is null when voice is off; its key is `safe_mode` when `fallback` is true for an
 * internal account. `writes_enabled` false adds the second chip, `questions_only`.
 */
export type VoiceDockFlags = {
  voice_available: boolean;
  writes_enabled: boolean;
  spoken_replies: boolean;
  chip: VoiceChip | null;
  fallback: boolean;
};

// ---------------------------------------------------------------------------
// Readers and the interfaces the dispatcher calls (6.2)
// ---------------------------------------------------------------------------

/** One flag as an evaluation returned it. */
export type FlagValue = {
  enabled: boolean;
  value: string | null;
  /** True when the default handler answered (Flagsmith unreadable or the flag missing). */
  fallback: boolean;
};

/** Environment flags (no identity): the voice gate, export jobs, the worker, the self-check. */
export type EnvironmentFlags = Record<FlagKey, FlagValue>;
export type EnvironmentFlagReader = () => Promise<EnvironmentFlags>;

/**
 * The voice gate's answer (flagsmith.md 6.2): "enabled", or "paused" with the cause.
 * The dispatcher turns "paused" into 423 `voice_writes_paused`. The contracts stub always
 * answers paused with cause `unreadable` (D47); it never answers enabled.
 */
export type VoiceGateResult =
  | { status: "enabled" }
  | { status: "paused"; cause: "switch_off" | "unreadable" };

/** Called by the dispatcher (3.0 step 4) for every command whose source is `voice`. Never throws. */
export type VoiceGate = (command: CommandName) => Promise<VoiceGateResult>;

export type SetupSavedInput = {
  /** The user who ran the command; the email stays on the server. */
  actor: SessionActor;
  outcome: CommandOutcome;
  /** True only for the `set_wedding_profile` create. */
  is_create: boolean;
  /** The new wedding's id (null when nothing was created). */
  wedding_id: WeddingId | null;
  /** The `setup_opened_at` input, if the form or the turn sent one. */
  setup_opened_at: IsoInstant | null;
  committed_at: IsoInstant;
};

/**
 * The setup-saved hook (5.4): the dispatcher calls it in `after()` after `set_wedding_profile`.
 * It returns nothing and never throws. The contracts stub does nothing (D39).
 */
export type SetupSavedHook = (input: SetupSavedInput) => Promise<void>;

/** The `flags` summary inside `/api/health` (6.7). No secrets, no user data. */
export type FlagsSelfCheck = {
  ok: boolean;
  expected_env: string;
  env_label: string;
  key_type: "server" | "client" | "missing";
  /** Every flag the default handler answered. */
  fallback_flags: string[];
  /** Flags not created yet, such as `image_extraction_provider` until Should #11 starts. */
  not_created: string[];
  events_probe_status: number | null;
  experiment_events: "enabled" | "off";
  latency_ms: number | null;
  sdk: string;
  checked_at: IsoInstant;
  /** The contracts stub says "not built yet" here, with `ok` false (D12). */
  note?: string;
};
