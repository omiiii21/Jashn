/**
 * The JSON shape of every route handler (architecture 4.3): both polls, the guest RSVP and
 * dietary routes, the voice routes, exports, the ops routes including `/run`, uploads and
 * `/api/health`. The command route's bodies are `CommandEnvelope` and `CommandResponse`.
 *
 * Member and guest routes use normal JSON types. The ops routes follow the strings rule
 * (export-and-recovery 5.1): every scalar is a string and nothing is null.
 * The card-import routes' bodies follow with card-import.ts in lane-lead-contracts-2 (D44).
 */
import type {
  CommandEnvelope,
  CommandErrorBody,
  CommandFailureBody,
  CommandInput,
  CommandName,
  CommandOutcome,
  CommandResponse,
  VoicePrefillEntry,
} from "./commands";
import type { AssetId, GuestInvitationView, IsoInstant, JsonObject, VoiceTurnId, WeddingId } from "./domain";
import type { FlagsSelfCheck, VoiceDockFlags } from "./flags";
import type { ExportErrorCode, ExportFailedWebhook, ExportJobStatus, RetryOutcome } from "./jobs";

// ---------------------------------------------------------------------------
// /api/health (L; flagsmith.md 6.7)
// ---------------------------------------------------------------------------

export type HealthBody = {
  ok: true;
  /** The commit SHA (`VERCEL_GIT_COMMIT_SHA`), or "local". */
  sha: string;
  /** `VERCEL_ENV`, or `NODE_ENV` locally. */
  env: string;
  /** Lane C's self-check summary; the contracts stub says "not built yet" with `ok` false (D12). */
  flags: FlagsSelfCheck;
};

// ---------------------------------------------------------------------------
// The polls (architecture 2.4)
// ---------------------------------------------------------------------------

/** `GET /api/w/{wedding_id}/version`: member session; 401 or 403 otherwise. */
export type VersionPollBody = { version: number };

/** `GET /api/i/{token}/revision`: an unknown, malformed or revoked token gets the page's 404. */
export type RevisionPollBody = { revision: number };

/** The planner poll interval and the guest poll interval (and its 429 back-off). */
export const PLANNER_POLL_MS = 2_500;
export const GUEST_POLL_MS = 10_000;
export const GUEST_POLL_BACKOFF_MS = 30_000;

// ---------------------------------------------------------------------------
// The command route
// ---------------------------------------------------------------------------

/** `POST /api/w/{wedding_id}/commands/{command}`: the §3.0 envelope in, the §3.0 envelope out. */
export type CommandRouteRequest<C extends CommandName = CommandName> = CommandEnvelope<C>;
export type CommandRouteResponse<C extends CommandName = CommandName> = CommandResponse<C>;

// ---------------------------------------------------------------------------
// Guest routes (domain 3.4, 7.3): the household comes from the token, never the body
// ---------------------------------------------------------------------------

/** `POST /api/i/{token}/rsvp`: one idempotency key per press (R8). */
export type GuestRsvpRequest = { idempotency_key: string } & CommandInput<"submit_rsvp">;

/** `POST /api/i/{token}/dietary`. */
export type GuestDietaryRequest = { idempotency_key: string } & CommandInput<"set_dietary">;

/** Both answer the dispatcher envelope; `result` is the refreshed guest view (no counts, no money). */
export type GuestRsvpResponse = CommandResponse<"submit_rsvp">;
export type GuestDietaryResponse =
  | { ok: true; outcome: CommandOutcome; command: "set_dietary"; result: GuestInvitationView; version: number }
  | CommandFailureBody;

// ---------------------------------------------------------------------------
// Uploads (domain 3.2 `add_asset`, 5.5)
// ---------------------------------------------------------------------------

export const UPLOAD_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type UploadMimeType = (typeof UPLOAD_MIME_TYPES)[number];
export const UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
/** Signed upload URLs are valid for 2 hours. */
export const UPLOAD_URL_TTL_S = 7_200;

/** `POST /api/uploads/sign` (members only). */
export type UploadSignRequest = {
  wedding_id: WeddingId;
  asset_kind: "couple_photo";
  mime_type: UploadMimeType;
  bytes: number;
};

export type UploadSignResponse =
  | {
      ok: true;
      asset_id: AssetId;
      bucket: "uploads";
      /** `{wedding_id}/{asset_id}.{ext}`, without the bucket name. */
      object_key: string;
      /** For the browser's direct upload with the anon key. */
      signed_upload_url: string;
      /** The token half of the signed upload, if the client SDK wants it separately. */
      token: string;
      expires_at: IsoInstant;
    }
  | CommandFailureBody;

// ---------------------------------------------------------------------------
// Voice routes (voice.md 1.4–1.17)
// ---------------------------------------------------------------------------

/** The multipart field names of `POST /api/voice/turn` (1.4). Values are strings, `audio` a Blob. */
export const VOICE_TURN_FIELDS = [
  "audio",
  "text",
  "option",
  "wedding_id",
  "client_turn_id",
  "ui_language",
  "speech_language",
  "context_turn_id",
  "duration_ms",
  "attached_asset_id",
  "page",
  "setup_opened_at",
  "fixture_id",
] as const;
export type VoiceTurnField = (typeof VOICE_TURN_FIELDS)[number];

export const VOICE_AUDIO_MAX_BYTES = 2 * 1024 * 1024;
export const VOICE_AUDIO_MAX_MS = 30_000;
export const VOICE_TEXT_MAX = 500;
export const VOICE_TURN_TTL_MS = 10 * 60_000;

export type ReplyRegister = "en" | "hinglish" | "hi";
export type VoiceInputMode = "speech" | "typed" | "tap" | "fixture";

/** Every `reply` object (1.5). The speech text stays on the server. */
export type VoiceReply = {
  display_text: string;
  language: ReplyRegister;
  speak: boolean;
  /** How many audio parts the reply route serves. */
  parts: number;
};

export type VoiceAnswerCard = {
  title: string;
  figure: string;
  /** Built with `routes`; carries the `highlight` parameter. */
  link: string | null;
};

export type VoiceFieldState = "ok" | "missing" | "uncertain" | "changed";

export type VoicePreviewField = {
  field: string;
  label: string;
  old: string | null;
  new: string | null;
  heard: string | null;
  state: VoiceFieldState;
};

export type VoicePreviewAction = {
  index: number;
  kind: string;
  /** The command it runs (`propose_change` for a manager's gated command). */
  command: CommandName;
  fields: VoicePreviewField[];
  after_saving: { label: string; old: string; new: string }[];
  warnings: string[];
};

export type VoiceClarifyOption = { label: string; value: string; default?: boolean };

export type VoiceErrorCode =
  | "no_speech"
  | "audio_unreadable"
  | "stt_unavailable"
  | "llm_unavailable"
  | "llm_no_action"
  | "internal_error";

type VoiceEventBase = { voice_turn_id: VoiceTurnId };

/** One NDJSON line of the turn response: `heard`, one terminal event, then `done` (1.5). */
export type VoiceStreamEvent =
  | (VoiceEventBase & {
      type: "heard";
      transcript: string;
      language_code: string | null;
      chip: ReplyRegister;
      input_mode: VoiceInputMode;
      voice: VoiceDockFlags;
    })
  | (VoiceEventBase & {
      type: "preview";
      status: "proposed";
      title: string;
      button_label: string;
      actions: VoicePreviewAction[];
      missing_fields: string[];
      confirm_enabled: boolean;
      disabled_reason: string | null;
      reply: VoiceReply;
      expires_at: IsoInstant;
    })
  | (VoiceEventBase & { type: "answer"; cards: VoiceAnswerCard[]; reply: VoiceReply })
  | (VoiceEventBase & {
      type: "clarify";
      question: VoiceReply;
      missing_fields: string[];
      options?: VoiceClarifyOption[];
      cards?: VoiceAnswerCard[];
    })
  | (VoiceEventBase & {
      type: "refused";
      code: "voice_writes_paused" | "forbidden" | "not_shared";
      reply: VoiceReply;
      prefill: VoicePrefillEntry[];
      cards: VoiceAnswerCard[];
    })
  | (VoiceEventBase & { type: "saved"; body: VoiceConfirmResponse })
  | (VoiceEventBase & { type: "cancelled"; reply: VoiceReply })
  | (VoiceEventBase & {
      type: "error";
      code: VoiceErrorCode;
      stage: "stt" | "llm" | "server";
      message: string;
      retryable: boolean;
    })
  | (VoiceEventBase & { type: "done"; timings_ms: Record<string, number>; voice: VoiceDockFlags });

export type VoiceStreamEventType = VoiceStreamEvent["type"];

/** Check failures before the stream starts: the domain error envelope plus the voice block. */
export type VoiceErrorBody = { ok: false; error: CommandErrorBody; voice: VoiceDockFlags };

/** `POST /api/voice/confirm` (1.13). */
export type VoiceConfirmRequest = {
  voice_turn_id: VoiceTurnId;
  edits?: { action_index: number; field: string; value: string }[];
  via: "tap";
};

export type VoiceConfirmResult = {
  index: number;
  command: CommandName;
  outcome: CommandOutcome;
  idempotency_key: string;
  /** The record's seed_key or live alias. */
  entity_ref: string | null;
  activity_entry_id: string | null;
  vendor_totals?: { committed_inr: number; paid_inr: number; outstanding_inr: number; overpaid_inr?: number };
  proposal_id?: string;
};

/** 200, or 202 when every action was proposed. */
export type VoiceConfirmResponse = {
  ok: true;
  voice_turn_id: VoiceTurnId;
  status: "confirmed" | "partially_saved";
  confirmed_via: "tap" | "phrase";
  results: VoiceConfirmResult[];
  reply: VoiceReply;
  /** Built with `routes` plus `withHighlight`. */
  navigate?: { path: string };
  voice: VoiceDockFlags;
};

/** 409 `stale_version` / `draft_changed` carries the refreshed preview; 423 the full prefill list. */
export type VoiceConfirmErrorBody = VoiceErrorBody & {
  preview?: Extract<VoiceStreamEvent, { type: "preview" }>;
};

/** `POST /api/voice/cancel`. Cancelling a closed turn is not an error. */
export type VoiceCancelRequest = { voice_turn_id: VoiceTurnId };
export type VoiceCancelResponse = {
  ok: true;
  voice_turn_id: VoiceTurnId;
  status: "cancelled";
  reply: VoiceReply;
  voice: VoiceDockFlags;
};

/** `GET /api/voice/turns/{voice_turn_id}/trace`: Lane C's judge panel data (voice.md section 8). */
export type VoiceTraceBody = { ok: true; voice_turn_id: VoiceTurnId; trace: JsonObject };

// ---------------------------------------------------------------------------
// Member export routes (export-and-recovery 5.6): normal JSON types
// ---------------------------------------------------------------------------

/** `POST /api/w/{wedding_id}/exports`. */
export type ExportRequest = CommandEnvelope<"request_card_export">;
export type ExportResponse = CommandResponse<"request_card_export">;

/** `POST /api/w/{wedding_id}/exports/{job_id}/retry`: the server fills `expected_export_key` and uses `wait` 0. */
export type ExportRetryRequest = CommandEnvelope<"retry_card_export">;
export type ExportRetryResponse = CommandResponse<"retry_card_export">;

// ---------------------------------------------------------------------------
// Ops routes (export-and-recovery 5.1–5.5): the strings rule
// ---------------------------------------------------------------------------

export type OpsBool = "true" | "false";

export type OpsLastError = { code: ExportErrorCode | ""; message: string; at: string };
export type OpsArtifact = { artifact_id: string; sha256: string; bytes: string; created_at: string };
export type OpsLastRecovery = { nudgebee_execution_id: string; approver: string; attempt: string };

/** `GET /api/ops/export-jobs/{job_id}` (5.2). Instants are ISO UTC. */
export type OpsJobStatusBody = {
  job_id: string;
  job_label: string;
  export_key: string;
  wedding_id: string;
  revision: string;
  latest_revision: string;
  format: string;
  status: ExportJobStatus;
  retryable: OpsBool;
  attempts: string;
  max_attempts: string;
  synthetic: OpsBool;
  last_error: OpsLastError;
  artifact: OpsArtifact;
  last_recovery: OpsLastRecovery;
  card_summary: string;
  updated_at: string;
};

/** `POST /api/ops/export-jobs/{job_id}/retry?wait=20` body; `Idempotency-Key` is a header. */
export type OpsRetryRequestBody = {
  expected_export_key: string;
  nudgebee?: { workflow_id?: string; execution_id?: string; approver?: string };
};

export type OpsRetryResponseBody = {
  job_id: string;
  export_key: string;
  outcome: RetryOutcome;
  replayed: OpsBool;
  attempt: string;
  status: ExportJobStatus;
  retryable: OpsBool;
  revision: string;
  latest_revision: string;
  artifact: Omit<OpsArtifact, "created_at">;
  idempotency_key: string;
};

/** `POST /api/ops/export-jobs/{job_id}/run`: 202 when it claimed, 200 otherwise (3.3). */
export type OpsRunStartedBody = { started: "true"; attempt: string };
export type OpsRunNotStartedBody = { started: "false"; status: ExportJobStatus };
export type OpsRunBody = OpsRunStartedBody | OpsRunNotStartedBody;

export const OPS_ERROR_CODES = [
  "validation_failed",
  "unauthenticated",
  "not_found",
  "idempotency_key_reused",
  "expectation_failed",
  "internal_error",
] as const;
export type OpsErrorCode = (typeof OPS_ERROR_CODES)[number];

export const OPS_ERROR_HTTP_STATUS: Record<OpsErrorCode, number> = {
  validation_failed: 400,
  unauthenticated: 401,
  not_found: 404,
  idempotency_key_reused: 409,
  expectation_failed: 412,
  internal_error: 500,
};

/** The domain error body with the strings rule: `field` "" and `current` {} when absent. */
export type OpsErrorBody = {
  ok: false;
  error: { code: OpsErrorCode; message: string; field: string; current: Record<string, string> };
};

/** Jashn to NudgeBee, a POST to `NUDGEBEE_EXPORT_WEBHOOK_URL` (5.5). */
export type ExportFailedWebhookBody = ExportFailedWebhook;

/** The NudgeBee manual trigger's input. */
export type NudgebeeManualInput = { job_id: string };

/** Every ops response carries these headers. */
export const OPS_RESPONSE_HEADERS = { "Cache-Control": "no-store" } as const;
