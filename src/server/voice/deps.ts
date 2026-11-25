import "server-only";

import type { ReplyRegister } from "@/contracts/api";
import type { CommandEnvelope, CommandResponse, VoicePrefillEntry } from "@/contracts/commands";
import type { AppLanguage, CommandActor, IsoDate, JsonObject, SessionActor, WeddingId } from "@/contracts/domain";
import type { EnvLabelValue, FlagKey, FlagValue, VoiceDockFlags } from "@/contracts/flags";
import { getSession, requireMember } from "@/server/auth/session";
import { services } from "@/server/services";

import { isFixtureMode, loadFixture, type VoiceFixture } from "./fixture-mode";
import { getVoiceRateLimiter, type VoiceRateLimiter } from "./rate-limit";
import { getVoiceTurnStore } from "./store";
import type {
  ReplySpeech,
  ReplyText,
  ResolveContext,
  ResolveOutcome,
  ResolvedAction,
  Snapshot,
  StoredResult,
  StoredTurn,
  ToolArguments,
  VoiceTurnStore,
} from "./types";

/**
 * Everything the turn, confirm and cancel routes depend on, injectable so tests and fixture
 * mode can replace every piece (voice.md 6.4). The shapes copy the SIGNATURES the other Lane C
 * modules export; the defaults load those modules lazily, so this file (and the route tests)
 * never load a module a test has replaced. Every call site awaits, so a dependency may be
 * sync or async.
 */

type MaybePromise<T> = T | Promise<T>;

// ---------------------------------------------------------------------------
// Shapes of the other modules (copied from their signatures)
// ---------------------------------------------------------------------------

/** `@/server/flags` UserFlagEvaluation. */
export type FlagEvaluation = {
  identity: string | null;
  flags: Record<FlagKey, FlagValue & { reason: string | null }>;
  fallback: boolean;
  env_label: EnvLabelValue;
  latency_ms: number;
};

/** `@/server/voice/sarvam` shapes. */
export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type SttResult =
  | { ok: true; transcript: string; language_code: string | null; request_id: string | null; attempts: number; ms: number }
  | {
      ok: false;
      code: "audio_unreadable" | "stt_unavailable" | "no_speech";
      http_status: number | null;
      message: string;
      retryable: boolean;
      attempts: number;
      ms: number;
    };

export type LlmResult =
  | {
      ok: true;
      args: ToolArguments;
      raw_arguments: string;
      request_ids: string[];
      attempts: number;
      reasoning_tokens: number | null;
      ms: number;
    }
  | {
      ok: false;
      code: "llm_unavailable" | "llm_no_action";
      message: string;
      retryable: boolean;
      attempts: number;
      ms: number;
      request_ids: string[];
    };

export type TranscribeInput = {
  audio: Blob;
  filename: string;
  mime: string;
  speech_language: "hi-IN" | "en-IN";
  keyterms: string[];
  signal?: AbortSignal;
  route_started_ms: number;
};

export type CallModelInput = { messages: ChatMessage[]; signal?: AbortSignal; route_started_ms: number };

export type BuildSnapshotInput = {
  actor: SessionActor;
  wedding_id: WeddingId | null;
  context: StoredTurn | null;
  attached_asset_id: string | null;
  today?: IsoDate;
};

/** `@/server/voice/templates` FixedReplyKey. */
export type FixedReplyKey =
  | "already_saved"
  | "nothing_to_confirm"
  | "cancelled"
  | "nothing_to_cancel"
  | "voice_writes_paused"
  | "replaced"
  | "publish_alone"
  | "cant_by_voice"
  | "too_many_actions"
  | "request_closed"
  | "expired"
  | "no_speech"
  | "stt_failed"
  | "llm_failed"
  | "too_long";

export type ConfirmedReplyInput = {
  actor: SessionActor;
  wedding_id: WeddingId | null;
  actions: ResolvedAction[];
  results: StoredResult[];
  register: ReplyRegister;
  partial: { failed_index: number; reason: string } | null;
};

export type ConfirmEdit = { action_index: number; field: string; value: string };

export type ApplyEditsResult = { ok: true; actions: ResolvedAction[] } | { ok: false; field: string; message: string };

// ---------------------------------------------------------------------------
// The deps
// ---------------------------------------------------------------------------

export type VoiceDeps = {
  now: () => number;
  newId: () => string;
  store: VoiceTurnStore;
  rateLimiter: VoiceRateLimiter;

  readSession: () => Promise<SessionActor | null>;
  readMember: (wedding_id: WeddingId) => Promise<SessionActor>;

  evaluateFlags: (actor: SessionActor, opts: { wedding_id?: WeddingId | null; ui_language?: AppLanguage }) => Promise<FlagEvaluation>;
  dockFlags: (evaluation: FlagEvaluation, actor: Pick<SessionActor, "email" | "is_internal">) => MaybePromise<VoiceDockFlags>;
  voiceFlagsRecord: (evaluation: FlagEvaluation) => MaybePromise<JsonObject>;

  fixtureMode: () => boolean;
  loadFixture: (row_id: string) => Promise<VoiceFixture | null>;

  transcribe: (input: TranscribeInput) => Promise<SttResult>;
  callModel: (input: CallModelInput) => Promise<LlmResult>;
  buildMessages: (input: { snapshot: Snapshot; transcript: string; context_turns: StoredTurn[] }) => MaybePromise<ChatMessage[]>;
  promptVersion: () => MaybePromise<string>;
  buildSnapshot: (input: BuildSnapshotInput) => Promise<Snapshot>;
  resolveTurn: (ctx: ResolveContext) => Promise<ResolveOutcome>;

  matchPhrase: (transcript: string) => MaybePromise<"confirm" | "cancel" | null>;
  registerFor: (transcript: string, model_reply_language: ReplyRegister | null) => MaybePromise<ReplyRegister>;
  normalizeForMatch: (text: string) => MaybePromise<string>;
  speechFor: (reply: ReplyText) => MaybePromise<ReplySpeech | null>;
  fixedReply: (key: FixedReplyKey, register: ReplyRegister) => MaybePromise<ReplyText>;

  confirmedReply: (input: ConfirmedReplyInput) => Promise<{ reply: ReplyText; navigate_path: string | null }>;
  prefillFor: (actions: ResolvedAction[]) => MaybePromise<VoicePrefillEntry[]>;
  applyEdits: (actions: ResolvedAction[], edits: ConfirmEdit[]) => MaybePromise<ApplyEditsResult>;

  dispatch: (actor: CommandActor, envelope: CommandEnvelope) => Promise<CommandResponse>;

  /** One plain log line, never user data (flagsmith 3.2's refusal line goes through here). */
  log: (line: string) => void;
};

// Lazily loaded modules: a test that injects a dependency never loads its module.
function lazy<M>(load: () => Promise<M>): () => Promise<M> {
  let loaded: Promise<M> | null = null;
  return () => (loaded ??= load());
}

const flagsModule = lazy(() => import("@/server/flags"));
const sarvamModule = lazy(() => import("./sarvam"));
const instructionsModule = lazy(() => import("./instructions"));
const snapshotModule = lazy(() => import("./snapshot"));
const resolveModule = lazy(() => import("./resolve"));
const phrasesModule = lazy(() => import("./phrases"));
const normalizeModule = lazy(() => import("./normalize"));
const speechModule = lazy(() => import("./speech"));
const templatesModule = lazy(() => import("./templates"));
const confirmReplyModule = lazy(() => import("./confirm-reply"));

export function defaultVoiceDeps(): VoiceDeps {
  return {
    now: () => Date.now(),
    newId: () => crypto.randomUUID(),
    store: getVoiceTurnStore(),
    rateLimiter: getVoiceRateLimiter(),

    readSession: () => getSession(),
    readMember: (wedding_id) => requireMember(wedding_id),

    evaluateFlags: async (actor, opts) => (await flagsModule()).evaluateUserFlags(actor, opts),
    dockFlags: async (evaluation, actor) => (await flagsModule()).dockFlags(evaluation, actor),
    voiceFlagsRecord: async (evaluation) => (await flagsModule()).voiceFlagsRecord(evaluation),

    fixtureMode: () => isFixtureMode(),
    loadFixture: (row_id) => loadFixture(row_id),

    transcribe: async (input) => (await sarvamModule()).transcribe(input),
    callModel: async (input) => (await sarvamModule()).callModel(input),
    buildMessages: async (input) => (await instructionsModule()).buildMessages(input),
    promptVersion: async () => (await instructionsModule()).PROMPT_VERSION,
    buildSnapshot: async (input) => (await snapshotModule()).buildSnapshot(input),
    resolveTurn: async (ctx) => (await resolveModule()).resolveTurn(ctx),

    matchPhrase: async (transcript) => (await phrasesModule()).matchPhrase(transcript),
    registerFor: async (transcript, lang) => (await normalizeModule()).registerFor(transcript, lang),
    normalizeForMatch: async (text) => (await normalizeModule()).normalizeForMatch(text),
    speechFor: async (reply) => (await speechModule()).speechFor(reply),
    fixedReply: async (key, register) => (await templatesModule()).fixedReply(key, register),

    confirmedReply: async (input) => (await confirmReplyModule()).confirmedReply(input),
    prefillFor: async (actions) => (await confirmReplyModule()).prefillFor(actions),
    applyEdits: async (actions, edits) => (await confirmReplyModule()).applyEdits(actions, edits),

    dispatch: (actor, envelope) => services.dispatch(actor, envelope),

    log: (line) => console.info(line),
  };
}

export function resolveDeps(overrides: Partial<VoiceDeps> = {}): VoiceDeps {
  return { ...defaultVoiceDeps(), ...overrides };
}
