import "server-only";

import type { IsoInstant, VoiceTurnId, WeddingId } from "@/contracts/domain";
import { isDatabaseConfigured } from "@/db/client";

import { createDbVoiceTurnStore } from "./store-db";
import type { StoredTurn, VoiceTurnStore } from "./types";

/**
 * The voice_turns store (voice.md 9, decision D96).
 *
 * With a database, the rows live in Lane A's `voice_turns` table (store-db.ts). Without one,
 * an in-memory fake kept on globalThis stands in, so it survives `next dev` hot reloads (not a
 * server restart, and it is per instance).
 *
 * The store never holds audio (AT-2.13). Writing a turn never moves `weddings.version`.
 */

type MemoryState = { turns: Map<VoiceTurnId, StoredTurn> };

const GLOBAL_KEY = "__jashn_voice_turn_store__";

function clone<T>(value: T): T {
  return structuredClone(value);
}

function instantMs(value: IsoInstant): number {
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? 0 : ms;
}

/** A fresh in-memory store (tests make one each; the app shares one through globalThis). */
export function createMemoryVoiceTurnStore(): VoiceTurnStore {
  const state: MemoryState = { turns: new Map() };
  return memoryStore(state);
}

function memoryStore(state: MemoryState): VoiceTurnStore {
  return {
    async insert(turn) {
      if (state.turns.has(turn.voice_turn_id)) throw new Error("voice turn already stored");
      for (const existing of state.turns.values()) {
        if (existing.user_id === turn.user_id && existing.client_turn_id === turn.client_turn_id) {
          throw new Error("client_turn_id already used by this user");
        }
      }
      state.turns.set(turn.voice_turn_id, clone(turn));
    },

    async update(voice_turn_id, patch) {
      const existing = state.turns.get(voice_turn_id);
      if (!existing) return null;
      const next: StoredTurn = { ...existing, ...clone(patch), voice_turn_id, updated_at: new Date().toISOString() };
      state.turns.set(voice_turn_id, next);
      return clone(next);
    },

    async get(voice_turn_id) {
      const found = state.turns.get(voice_turn_id);
      return found ? clone(found) : null;
    },

    async byClientTurnId(user_id, client_turn_id) {
      for (const turn of state.turns.values()) {
        if (turn.user_id === user_id && turn.client_turn_id === client_turn_id) return clone(turn);
      }
      return null;
    },

    async recentForSpeaker(user_id: string, wedding_id: WeddingId | null, since: IsoInstant) {
      const sinceMs = instantMs(since);
      const rows: StoredTurn[] = [];
      for (const turn of state.turns.values()) {
        if (turn.user_id !== user_id) continue;
        if ((turn.wedding_id ?? null) !== (wedding_id ?? null)) continue;
        if (instantMs(turn.created_at) < sinceMs) continue;
        rows.push(clone(turn));
      }
      return rows.sort((a, b) => instantMs(b.created_at) - instantMs(a.created_at));
    },
  };
}

/**
 * The app's store: the Drizzle store on Lane A's `voice_turns` table when `DATABASE_URL` is
 * set, else the in-memory fake (D96).
 */
export function getVoiceTurnStore(): VoiceTurnStore {
  if (isDatabaseConfigured()) return createDbVoiceTurnStore();
  const holder = globalThis as unknown as Record<string, MemoryState | undefined>;
  let state = holder[GLOBAL_KEY];
  if (!state) {
    state = { turns: new Map() };
    holder[GLOBAL_KEY] = state;
  }
  return memoryStore(state);
}

/**
 * Every turn the in-memory fake holds that was created at or after `since`, across speakers.
 * Only the flags drawer's two-hour counts read it (flagsmith 5.9), and only while no database
 * is configured; with one, the drawer counts `app.voice_turns` directly.
 */
export function memoryTurnsSince(since: IsoInstant): StoredTurn[] {
  const holder = globalThis as unknown as Record<string, MemoryState | undefined>;
  const state = holder[GLOBAL_KEY];
  if (!state) return [];
  const sinceMs = instantMs(since);
  const rows: StoredTurn[] = [];
  for (const turn of state.turns.values()) {
    if (instantMs(turn.created_at) >= sinceMs) rows.push(clone(turn));
  }
  return rows;
}
