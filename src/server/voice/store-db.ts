import "server-only";

import { and, desc, eq, gte, isNull } from "drizzle-orm";

import type { VoiceInputMode } from "@/contracts/api";
import type { JsonObject, JsonValue, VoiceTurnStatus } from "@/contracts/domain";
import { getDb, type DbOrTx } from "@/db/client";
import { voiceTurns } from "@/db/schema";

import type { StoredTurn, ToolIntent, VoiceTurnStore } from "./types";

/**
 * The voice_turns store on Lane A's table (voice.md 9; decision D96). Lane C writes these
 * rows outside the dispatcher, and writing one never moves weddings.version. No audio, ever.
 *
 * Columns the table has no place for (the chip, the replayable events and the setup clock)
 * ride in `trace.replay`; the trace route strips that key before answering (voice.md 8).
 */

type Row = typeof voiceTurns.$inferSelect;
type Insert = typeof voiceTurns.$inferInsert;

type ReplayBlock = {
  chip?: StoredTurn["chip"];
  events?: JsonObject[];
  setup_opened_at?: string | null;
  intent?: StoredTurn["intent"];
};

const TABLE_INTENTS: readonly ToolIntent[] = ["act", "ask", "clarify"];

/** The table allows act, ask and clarify; a phrase turn is stored as `ask` (voice.md 1.8). */
function tableIntent(intent: StoredTurn["intent"]): ToolIntent | null {
  if (intent === null) return null;
  return (TABLE_INTENTS as readonly string[]).includes(intent) ? (intent as ToolIntent) : "ask";
}

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function asJson<T>(value: T): JsonValue {
  return value as unknown as JsonValue;
}

function traceWithReplay(turn: Pick<StoredTurn, "trace" | "chip" | "events" | "setup_opened_at" | "intent">): JsonObject {
  const replay: ReplayBlock = {
    chip: turn.chip,
    events: turn.events,
    setup_opened_at: turn.setup_opened_at,
    intent: turn.intent,
  };
  return { ...turn.trace, replay: asJson(replay) };
}

function toInsert(turn: StoredTurn): Insert {
  return {
    id: turn.voice_turn_id,
    wedding_id: turn.wedding_id,
    user_id: turn.user_id,
    member_id: turn.member_id,
    status: turn.status,
    transcript: turn.transcript,
    language_code: turn.language_code,
    intent: tableIntent(turn.intent),
    actions: asJson(turn.actions),
    missing_fields: asJson(turn.missing_fields),
    reply_text: turn.reply_text,
    context_turn_id: turn.context_turn_id,
    superseded_by_turn_id: turn.superseded_by_turn_id,
    flags: asJson(turn.flags),
    refusal_code: turn.refusal_code,
    results: turn.results === null ? null : asJson(turn.results),
    expires_at: new Date(new Date(turn.created_at).getTime() + 10 * 60_000),
    confirmed_at: toDate(turn.confirmed_at),
    confirmed_via: turn.confirmed_via,
    client_turn_id: turn.client_turn_id,
    input_mode: turn.input_mode,
    speech_language: turn.speech_language,
    reply_language: turn.reply_language,
    reply_speech: turn.reply_speech === null ? null : asJson(turn.reply_speech),
    options: turn.options === null ? null : asJson(turn.options),
    ref_map: asJson(turn.ref_map),
    trace: traceWithReplay(turn),
    timings_ms: asJson(turn.timings_ms),
    fixture_id: turn.fixture_id,
    created_at: toDate(turn.created_at) ?? new Date(),
    updated_at: toDate(turn.updated_at) ?? new Date(),
  };
}

function fromRow(row: Row): StoredTurn {
  const trace = (row.trace ?? {}) as JsonObject;
  const { replay: rawReplay, ...rest } = trace;
  const replay = (rawReplay ?? {}) as unknown as ReplayBlock;
  return {
    voice_turn_id: row.id,
    user_id: row.user_id,
    member_id: row.member_id,
    wedding_id: row.wedding_id,
    client_turn_id: row.client_turn_id,
    input_mode: row.input_mode as VoiceInputMode,
    speech_language: (row.speech_language as StoredTurn["speech_language"]) ?? null,
    transcript: row.transcript ?? "",
    language_code: row.language_code,
    chip: replay.chip ?? ((row.reply_language as StoredTurn["chip"]) || "en"),
    reply_language: (row.reply_language as StoredTurn["reply_language"]) ?? "en",
    intent: replay.intent ?? (row.intent as ToolIntent | null),
    status: row.status as VoiceTurnStatus,
    refusal_code: (row.refusal_code as StoredTurn["refusal_code"]) ?? null,
    actions: (row.actions ?? []) as unknown as StoredTurn["actions"],
    missing_fields: (row.missing_fields ?? []) as unknown as string[],
    options: (row.options ?? null) as unknown as StoredTurn["options"],
    reply_text: row.reply_text,
    reply_speech: (row.reply_speech ?? null) as unknown as StoredTurn["reply_speech"],
    ref_map: (row.ref_map ?? {}) as unknown as StoredTurn["ref_map"],
    flags: (row.flags ?? {}) as JsonObject,
    events: replay.events ?? [],
    results: (row.results ?? null) as unknown as StoredTurn["results"],
    confirmed_at: toIso(row.confirmed_at),
    confirmed_via: (row.confirmed_via as StoredTurn["confirmed_via"]) ?? null,
    superseded_by_turn_id: row.superseded_by_turn_id,
    context_turn_id: row.context_turn_id,
    setup_opened_at: replay.setup_opened_at ?? null,
    fixture_id: row.fixture_id,
    trace: rest,
    timings_ms: (row.timings_ms ?? {}) as unknown as Record<string, number>,
    created_at: toIso(row.created_at) ?? new Date().toISOString(),
    updated_at: toIso(row.updated_at) ?? new Date().toISOString(),
  };
}

/** The Drizzle store. `db` is injectable for database tests (`*.db.test.ts`). */
export function createDbVoiceTurnStore(db: () => DbOrTx = getDb): VoiceTurnStore {
  return {
    async insert(turn) {
      await db().insert(voiceTurns).values(toInsert(turn));
    },

    async update(voice_turn_id, patch) {
      const current = await this.get(voice_turn_id);
      if (!current) return null;
      const next: StoredTurn = { ...current, ...patch, voice_turn_id, updated_at: new Date().toISOString() };
      const values = toInsert(next);
      // The key, the speaker and the creation time never change.
      const { id: _id, user_id: _user, client_turn_id: _client, created_at: _created, ...changes } = values;
      void _id;
      void _user;
      void _client;
      void _created;
      await db().update(voiceTurns).set(changes).where(eq(voiceTurns.id, voice_turn_id));
      return next;
    },

    async get(voice_turn_id) {
      const rows = await db().select().from(voiceTurns).where(eq(voiceTurns.id, voice_turn_id)).limit(1);
      return rows[0] ? fromRow(rows[0]) : null;
    },

    async byClientTurnId(user_id, client_turn_id) {
      const rows = await db()
        .select()
        .from(voiceTurns)
        .where(and(eq(voiceTurns.user_id, user_id), eq(voiceTurns.client_turn_id, client_turn_id)))
        .limit(1);
      return rows[0] ? fromRow(rows[0]) : null;
    },

    async recentForSpeaker(user_id, wedding_id, since) {
      const sinceDate = toDate(since) ?? new Date(0);
      const rows = await db()
        .select()
        .from(voiceTurns)
        .where(
          and(
            eq(voiceTurns.user_id, user_id),
            wedding_id === null ? isNull(voiceTurns.wedding_id) : eq(voiceTurns.wedding_id, wedding_id),
            gte(voiceTurns.created_at, sinceDate),
          ),
        )
        .orderBy(desc(voiceTurns.created_at))
        .limit(20);
      return rows.map(fromRow);
    },
  };
}

export const __test = { toInsert, fromRow, tableIntent };
