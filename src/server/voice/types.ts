import "server-only";

import type { VoiceAnswerCard, VoiceClarifyOption, VoiceInputMode, VoicePreviewAction, ReplyRegister } from "@/contracts/api";
import type { CommandName, VoicePrefillEntry, VoiceRefusalCode } from "@/contracts/commands";
import type {
  AppLanguage,
  IsoDate,
  IsoInstant,
  JsonObject,
  SessionActor,
  VoiceTurnId,
  VoiceTurnStatus,
  WeddingId,
} from "@/contracts/domain";
import type { VoiceDockFlags } from "@/contracts/flags";

/**
 * Lane C's shared voice types (voice.md 1, 2 and 9). Every module in src/server/voice/
 * codes against these, so the turn route, the resolver, the snapshot and the store agree.
 */

// ---------------------------------------------------------------------------
// The propose_actions tool (voice.md 2)
// ---------------------------------------------------------------------------

export const ASK_KINDS = [
  "query_balance",
  "query_budget",
  "query_rsvp",
  "query_event",
  "query_changes",
  "query_catering",
  "query_shagun",
  "query_note",
] as const;
export type AskKind = (typeof ASK_KINDS)[number];

export const WRITE_KINDS = [
  "set_wedding_profile",
  "create_event",
  "update_event",
  "update_invite_style",
  "add_vendor",
  "record_commitment",
  "update_commitment",
  "record_payment",
  "correct_payment",
  "add_requirement",
  "add_note",
  "add_guest",
  "set_rsvp",
  "set_dietary",
  "publish_itinerary",
  "request_card_export",
  "record_shagun",
] as const;
export type WriteKind = (typeof WRITE_KINDS)[number];

export type ActionKind = AskKind | WriteKind;

export type HeardPhrase = { field: string; phrase: string };

/**
 * One action as the model sends it (2.2, 2.4): `kind`, `heard`, the helpers and the kind's
 * own input fields (all optional). The zod schema in tool-schema.ts validates exactly this.
 */
export type ToolAction = {
  kind: ActionKind;
  heard?: HeardPhrase[];
  previous_inr?: number;
  user_claim_inr?: number;
  date_text?: string;
  month?: number;
} & { [field: string]: unknown };

export type ToolIntent = "act" | "ask" | "clarify";

/** The tool's top level (2.1). */
export type ToolArguments = {
  intent: ToolIntent;
  actions: ToolAction[];
  missing_fields: string[];
  reply: string;
  reply_language: ReplyRegister;
};

// ---------------------------------------------------------------------------
// Replies (1.5, 1.14, 4.10)
// ---------------------------------------------------------------------------

/**
 * A reply as the server holds it: the display text the person reads, and the speech text
 * Bulbul says (Devanagari for Hindi words, amounts in words). `speech_text` null means the
 * reply is never spoken (a complete preview). The speech text never leaves the server.
 */
export type ReplyText = {
  display_text: string;
  speech_text: string | null;
  language: ReplyRegister;
};

/** What voice_turns.reply_speech stores: the speech parts of the latest reply (1.14). */
export type ReplySpeech = {
  parts: string[];
  language_code: "hi-IN" | "en-IN";
  speaker: string;
};

// ---------------------------------------------------------------------------
// The snapshot (1.9)
// ---------------------------------------------------------------------------

/** Snapshot reference (seed_key or `{PREFIX}-L{n}`, or `ASSET-NEW`) → UUID. */
export type RefMap = Record<string, string>;

/**
 * The snapshot of one turn: the model's text, the reference map, the keyterms for Saaras and
 * the role-filtered read models the resolver checks against (no second read).
 * `data` holds the read-model results the snapshot was built from, keyed by read-model name
 * (for example `wedding_profile`, `itinerary`, `money_summary`, `activity_feed`), each absent
 * when the speaker can't see it.
 */
export type Snapshot = {
  text: string;
  ref_map: RefMap;
  keyterms: string[];
  today: IsoDate;
  data: Partial<Record<string, unknown>>;
  /** Blocks left out for this speaker's role (managers): `money`, `budget`, `shagun`. */
  hidden: string[];
};

// ---------------------------------------------------------------------------
// Resolution (1.11) and the stored actions
// ---------------------------------------------------------------------------

/**
 * One action after the server's checks: the command it runs, its input with snapshot
 * references already mapped to UUIDs (server-filled `expected_version` and
 * `expected_draft_version` included), and what the card shows. Stored in voice_turns.actions.
 */
export type ResolvedAction = {
  index: number;
  kind: ActionKind;
  /** The command to run at confirm: the kind, or `propose_change` for a manager's A1 command (V8). */
  command: CommandName;
  /** The command's input exactly as the dispatcher takes it (for propose_change: `{command, input}`). */
  input: JsonObject;
  /** The field-key → form-label map for the typed form's prefill (D121). */
  labels: Record<string, string>;
  heard: HeardPhrase[];
  /** The record's reference (seed_key or alias) this action changes, for the receipt. */
  entity_ref: string | null;
  /** The card rows, after_saving block and warnings for this action. */
  preview: Omit<VoicePreviewAction, "index">;
  /** Field keys still missing or uncertain for this action. */
  missing_fields: string[];
  /** The model's raw action, kept for the trace and for merging a follow-up turn. */
  raw: ToolAction;
};

export type ResolveContext = {
  actor: SessionActor;
  /** Null on a setup turn. */
  wedding_id: WeddingId | null;
  tool: ToolArguments;
  snapshot: Snapshot;
  transcript: string;
  /** The register from the transcript's script (1.6). */
  register: ReplyRegister;
  ui_language: AppLanguage;
  /** `voice_writes_enabled` for this request's evaluation (the early check, 1.11 step 9). */
  writes_enabled: boolean;
  /** The context turn the dock named (`context_turn_id`), still under 10 minutes old. */
  context: StoredTurn | null;
  /** The planner page the person is on (1.4 `page`), for questions only (4.5). */
  page: string | null;
  /** Setup only: passed through to set_wedding_profile (1.4). */
  setup_opened_at: IsoInstant | null;
};

/** The resolver's decision (1.11 step 8): exactly one terminal event's content. */
export type ResolveOutcome =
  | {
      kind: "preview";
      title: string;
      button_label: string;
      actions: ResolvedAction[];
      missing_fields: string[];
      confirm_enabled: boolean;
      disabled_reason: string | null;
      /** A complete preview is silent (speech_text null); one needing input speaks its question. */
      reply: ReplyText;
    }
  | { kind: "answer"; cards: VoiceAnswerCard[]; reply: ReplyText }
  | {
      kind: "clarify";
      question: ReplyText;
      missing_fields: string[];
      options?: VoiceClarifyOption[];
      cards?: VoiceAnswerCard[];
      /** Partial actions kept so a follow-up turn or an option completes them (1.11, 6.2). */
      actions: ResolvedAction[];
    }
  | {
      kind: "refused";
      code: VoiceRefusalCode;
      reply: ReplyText;
      prefill: VoicePrefillEntry[];
      cards: VoiceAnswerCard[];
      actions: ResolvedAction[];
    };

// ---------------------------------------------------------------------------
// The stored turn (domain 5.1 plus voice.md 9) and its store
// ---------------------------------------------------------------------------

export type StoredOption = VoiceClarifyOption & {
  /** What the option stands for: field values merged into the stored actions when tapped. */
  apply: { action_index: number; field: string; value: unknown }[];
};

export type StoredResult = {
  index: number;
  command: CommandName;
  outcome: string;
  idempotency_key: string;
  entity_ref: string | null;
  activity_entry_id: string | null;
  vendor_totals?: { committed_inr: number; paid_inr: number; outstanding_inr: number; overpaid_inr?: number };
  proposal_id?: string;
  /** The gate's answer for this action (flagsmith 10.1 item 7). */
  gate?: string;
  error_code?: string;
};

export type StoredTurn = {
  voice_turn_id: VoiceTurnId;
  user_id: string;
  member_id: string | null;
  wedding_id: WeddingId | null;
  client_turn_id: string;
  input_mode: VoiceInputMode;
  speech_language: "hi-IN" | "en-IN" | null;
  transcript: string;
  language_code: string | null;
  chip: ReplyRegister;
  reply_language: ReplyRegister;
  intent: ToolIntent | "confirm" | "cancel" | null;
  status: VoiceTurnStatus;
  refusal_code: VoiceRefusalCode | null;
  actions: ResolvedAction[];
  missing_fields: string[];
  options: StoredOption[] | null;
  /** The latest reply's display text. */
  reply_text: string | null;
  reply_speech: ReplySpeech | null;
  ref_map: RefMap;
  /** voice_pilot, voice_writes_enabled, spoken_replies, env_label, fallback (flagsmith 10.1 item 7). */
  flags: JsonObject;
  /** The terminal events of this turn, replayed for a repeated client_turn_id (1.4 check 6). */
  events: JsonObject[];
  results: StoredResult[] | null;
  confirmed_at: IsoInstant | null;
  confirmed_via: "tap" | "phrase" | null;
  superseded_by_turn_id: VoiceTurnId | null;
  context_turn_id: VoiceTurnId | null;
  setup_opened_at: IsoInstant | null;
  fixture_id: string | null;
  trace: JsonObject;
  timings_ms: Record<string, number>;
  created_at: IsoInstant;
  updated_at: IsoInstant;
};

/**
 * The voice_turns store (D96): an in-memory fake until lane-a-schema lands, then a Drizzle
 * implementation behind the same interface. Writing a turn never moves weddings.version.
 */
export interface VoiceTurnStore {
  insert(turn: StoredTurn): Promise<void>;
  /** Replaces the stored row (by voice_turn_id) with these fields merged in. */
  update(voice_turn_id: VoiceTurnId, patch: Partial<StoredTurn>): Promise<StoredTurn | null>;
  get(voice_turn_id: VoiceTurnId): Promise<StoredTurn | null>;
  byClientTurnId(user_id: string, client_turn_id: string): Promise<StoredTurn | null>;
  /** The speaker's turns in this wedding (null = setup), newest first, created after `since`. */
  recentForSpeaker(user_id: string, wedding_id: WeddingId | null, since: IsoInstant): Promise<StoredTurn[]>;
}

// ---------------------------------------------------------------------------
// The turn's dependencies (injectable, so tests and fixture mode swap them)
// ---------------------------------------------------------------------------

export type VoiceFlagsForRequest = {
  dock: VoiceDockFlags;
  /** The record stored in voice_turns.flags. */
  record: JsonObject;
};
