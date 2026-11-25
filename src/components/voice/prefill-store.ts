"use client";

/**
 * The voice prefill store (voice.md 6.3, decisions D61 and D121). One consumer contract for
 * both refusals: the turn's `refused` event (the early kill-switch refusal) and the confirm's
 * 423 `error.prefill` carry the same list, one `{command, input, labels}` entry per action,
 * and the dock fills this store the same way for both. The prefill never goes in the URL.
 *
 * How Lane B's form consumes it (the add-requirement form first, AT-2.7):
 *
 *   const prefill = useVoicePrefill("add_requirement");
 *   // 1. When `prefill` turns non-null, open the form (the dock has already navigated to the
 *   //    record's page, for example routes.events(wedding_id, event_id)).
 *   // 2. On open, call takeVoicePrefill("add_requirement") once: it returns the same entry and
 *   //    removes it, so a re-render or a second form never fills twice.
 *   // 3. Fill each input from `entry.input[field]`; `entry.labels[field]` is the form label.
 *   // 4. Mark each prefilled field with FROM_VOICE_NOTE ("from voice, please check") until the
 *   //    person edits it or saves.
 *   // 5. Save is an ordinary typed command (`source: "ui"`, its own idempotency key) through the
 *   //    `dispatchCommand` prop. On cancel, nothing else is needed: the entry is already taken.
 *
 * Entries live in memory plus sessionStorage, so they survive the client navigation to the
 * form's page, and expire after 10 minutes. Storage access is wrapped: a browser that blocks
 * it keeps the in-memory copy only.
 */
import { useMemo, useSyncExternalStore } from "react";

import type { CommandName, VoicePrefillEntry } from "@/contracts/commands";
import type { EventId, VendorId, WeddingId } from "@/contracts/domain";
import { routes } from "@/contracts/routes";

/** The note a form shows beside each prefilled field. */
export const FROM_VOICE_NOTE = "from voice, please check";
export const FROM_VOICE_NOTE_HI = "आवाज़ से भरा गया, कृपया जाँच लें";

export const VOICE_PREFILL_TTL_MS = 10 * 60_000;
const STORAGE_KEY = "jashn.voice.prefill";

export type VoicePrefillState = {
  entries: VoicePrefillEntry[];
  voice_turn_id: string;
  wedding_id: string | null;
  set_at: number;
};

export type VoicePrefillHit = { entry: VoicePrefillEntry; voice_turn_id: string };

let state: VoicePrefillState | null = null;
let hydrated = false;
let expiryTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function now(): number {
  return Date.now();
}

function isEntry(value: unknown): value is VoicePrefillEntry {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.command === "string" && typeof v.input === "object" && v.input !== null && typeof v.labels === "object" && v.labels !== null;
}

function isState(value: unknown): value is VoicePrefillState {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return Array.isArray(v.entries) && v.entries.every(isEntry) && typeof v.voice_turn_id === "string" && typeof v.set_at === "number";
}

function storage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function persist(): void {
  const store = storage();
  if (!store) return;
  try {
    if (state) store.setItem(STORAGE_KEY, JSON.stringify(state));
    else store.removeItem(STORAGE_KEY);
  } catch {
    // Quota or a blocked storage: the in-memory copy still works.
  }
}

function expired(s: VoicePrefillState | null, at = now()): boolean {
  return !s || at - s.set_at >= VOICE_PREFILL_TTL_MS || s.entries.length === 0;
}

function hydrate(): void {
  if (hydrated) return;
  hydrated = true;
  if (state) return;
  const store = storage();
  if (!store) return;
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed: unknown = JSON.parse(raw);
    if (isState(parsed) && !expired(parsed)) {
      state = parsed;
      scheduleExpiry();
    } else {
      store.removeItem(STORAGE_KEY);
    }
  } catch {
    // Unreadable storage: start empty.
  }
}

function emit(): void {
  for (const listener of listeners) listener();
}

function scheduleExpiry(): void {
  if (expiryTimer) clearTimeout(expiryTimer);
  expiryTimer = null;
  if (!state) return;
  const left = state.set_at + VOICE_PREFILL_TTL_MS - now();
  expiryTimer = setTimeout(() => {
    expiryTimer = null;
    if (expired(state)) {
      state = null;
      persist();
      emit();
    }
  }, Math.max(0, left));
}

/**
 * Replaces the store with one turn's prefill list (the dock calls it on a `refused` event with
 * a prefill and on a 423 confirm). An empty list clears the store.
 */
export function setVoicePrefill(entries: VoicePrefillEntry[], meta: { voice_turn_id: string; wedding_id: string | null }): void {
  hydrated = true;
  const valid = entries.filter(isEntry);
  state = valid.length > 0 ? { entries: valid, voice_turn_id: meta.voice_turn_id, wedding_id: meta.wedding_id, set_at: now() } : null;
  persist();
  scheduleExpiry();
  emit();
}

/** Empties the store. */
export function clearVoicePrefill(): void {
  hydrated = true;
  state = null;
  persist();
  scheduleExpiry();
  emit();
}

/** The current state (null when empty or expired). */
export function getVoicePrefillState(): VoicePrefillState | null {
  hydrate();
  if (state && expired(state)) {
    state = null;
    persist();
  }
  return state;
}

function find(s: VoicePrefillState | null, command: CommandName): VoicePrefillHit | null {
  if (!s || expired(s)) return null;
  const entry = s.entries.find((e) => e.command === command);
  return entry ? { entry, voice_turn_id: s.voice_turn_id } : null;
}

/** The entry for this command without removing it, or null. */
export function peekVoicePrefill(command: CommandName): VoicePrefillHit | null {
  return find(getVoicePrefillState(), command);
}

/** Returns the entry for this command and removes it (the form calls this once, on open). */
export function takeVoicePrefill(command: CommandName): VoicePrefillHit | null {
  const s = getVoicePrefillState();
  const hit = find(s, command);
  if (!hit || !s) return null;
  const rest = s.entries.filter((e) => e !== hit.entry);
  state = rest.length > 0 ? { ...s, entries: rest } : null;
  persist();
  scheduleExpiry();
  emit();
  return hit;
}

export function subscribeVoicePrefill(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function serverSnapshot(): VoicePrefillState | null {
  return null;
}

/** The entry for this command, re-rendering when the store changes; null on the server. */
export function useVoicePrefill(command: CommandName): VoicePrefillHit | null {
  const snapshot = useSyncExternalStore(subscribeVoicePrefill, getVoicePrefillState, serverSnapshot);
  return useMemo(() => find(snapshot, command), [snapshot, command]);
}

/**
 * The page whose form takes this prefill (voice.md 6.3's table): an entry naming an event goes
 * to that function on Events, a vendor's money to the vendor page; null when none applies.
 */
export function prefillTargetPath(entries: readonly VoicePrefillEntry[], wedding_id: WeddingId | null): string | null {
  if (!wedding_id) return null;
  for (const entry of entries) {
    const input = (entry.command === "propose_change" && typeof entry.input.input === "object" && entry.input.input !== null
      ? entry.input.input
      : entry.input) as Record<string, unknown>;
    const event_id = typeof input.event_id === "string" ? input.event_id : null;
    if (event_id) return routes.events(wedding_id, event_id as EventId);
    const vendor_id = typeof input.vendor_id === "string" ? input.vendor_id : null;
    if (vendor_id) return routes.vendor(wedding_id, vendor_id as VendorId);
  }
  const first = entries[0];
  if (first && (first.command === "create_event" || first.command === "update_event")) return routes.events(wedding_id);
  return null;
}

/** Test helper: resets the module state. */
export function resetVoicePrefillForTests(): void {
  state = null;
  hydrated = false;
  if (expiryTimer) clearTimeout(expiryTimer);
  expiryTimer = null;
  listeners.clear();
}
