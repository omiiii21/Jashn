import "server-only";

import type { IsoInstant, VoiceTurnId, WeddingId } from "@/contracts/domain";
import type { StoredTurn, VoiceTurnStore } from "./types";

/**
 * The voice_turns store (voice.md 9, decision D96).
 *
 * Today this is an in-memory fake kept on globalThis, so it survives `next dev` hot reloads
 * (it does not survive a server restart, and it is per instance). Lane A's Drizzle store
 * replaces it behind the same `VoiceTurnStore` interface once `lane-a-schema` is on main:
 * swap the body of `getVoiceTurnStore()` and nothing else changes.
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
 * The app's store. In-memory until Lane A's Drizzle implementation lands (D96); then this
 * returns that implementation instead.
 */
export function getVoiceTurnStore(): VoiceTurnStore {
  const holder = globalThis as unknown as Record<string, MemoryState | undefined>;
  let state = holder[GLOBAL_KEY];
  if (!state) {
    state = { turns: new Map() };
    holder[GLOBAL_KEY] = state;
  }
  return memoryStore(state);
}
