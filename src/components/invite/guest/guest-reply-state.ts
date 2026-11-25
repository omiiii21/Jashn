/**
 * The reply form's pure state rules (domain 7.3, R2, R6, R8, I1). No React, no server
 * imports: the client form and the tests share them.
 */
import type { RsvpStatus } from "@/contracts/domain";
import type { GuestRsvpItem } from "./guest-wire";

export type ReplyChoice = "attending" | "declined";

/** One stored answer, keyed `{event_id}|{guest_id}`. */
export type StoredAnswer = {
  event_id: string;
  guest_id: string;
  rsvp_status: RsvpStatus;
  plus_ones: number;
  max_plus_ones: number;
};

/** What the guest has chosen on the page, by the same key. */
export type Selection = Record<string, { rsvp_status: ReplyChoice; plus_ones: number }>;

/** Anything shaped like the guest view's functions: the view itself or the page's inserts. */
export type AnswerSource = {
  functions: readonly {
    event_id: string;
    responses: readonly { guest_id: string; rsvp_status: RsvpStatus; plus_ones: number; max_plus_ones: number }[];
  }[];
};

export function answerKey(event_id: string, guest_id: string): string {
  return `${event_id}|${guest_id}`;
}

/** The stored answers, in page order (function, then guest). */
export function storedAnswers(source: AnswerSource): StoredAnswer[] {
  return source.functions.flatMap((fn) =>
    fn.responses.map((response) => ({
      event_id: fn.event_id,
      guest_id: response.guest_id,
      rsvp_status: response.rsvp_status,
      plus_ones: response.plus_ones,
      max_plus_ones: response.max_plus_ones,
    })),
  );
}

function clampPlusOnes(status: ReplyChoice, plus_ones: number, max: number): number {
  // Declined always sends 0 (R2); attending stays within the invitation's limit.
  if (status === "declined") return 0;
  if (!Number.isFinite(plus_ones)) return 0;
  return Math.min(Math.max(0, Math.trunc(plus_ones)), Math.max(0, max));
}

/** The answer the page shows for one row: the selection if any, else the stored answer. */
export function effectiveAnswer(stored: StoredAnswer, selection: Selection): { rsvp_status: RsvpStatus; plus_ones: number } {
  const chosen = selection[answerKey(stored.event_id, stored.guest_id)];
  if (!chosen) return { rsvp_status: stored.rsvp_status, plus_ones: stored.plus_ones };
  return { rsvp_status: chosen.rsvp_status, plus_ones: clampPlusOnes(chosen.rsvp_status, chosen.plus_ones, stored.max_plus_ones) };
}

/**
 * The RSVP body (domain 7.3): only the answers that differ from the stored ones, so a single
 * tap sends a single item. With no change, every current non-pending answer, which the
 * server answers `unchanged`. Never `pending`; `plus_ones` always present.
 */
export function buildRsvpBody(stored: readonly StoredAnswer[], selection: Selection): { responses: GuestRsvpItem[] } {
  const current = stored.map((row) => ({ row, answer: effectiveAnswer(row, selection) }));
  const asItem = ({ row, answer }: (typeof current)[number]): GuestRsvpItem => ({
    guest_id: row.guest_id,
    event_id: row.event_id,
    rsvp_status: answer.rsvp_status as ReplyChoice,
    plus_ones: answer.plus_ones,
  });
  const answered = current.filter(({ answer }) => answer.rsvp_status !== "pending");
  const changed = answered.filter(
    ({ row, answer }) => answer.rsvp_status !== row.rsvp_status || answer.plus_ones !== row.plus_ones,
  );
  return { responses: (changed.length > 0 ? changed : answered).map(asItem) };
}

/** True when the household has answered every function it is invited to. */
export function isFullyAnswered(source: AnswerSource): boolean {
  const rows = storedAnswers(source);
  return rows.length > 0 && rows.every((row) => row.rsvp_status !== "pending");
}

/** Drops selections for rows that left the view (a publish can remove a function). */
export function pruneSelection(stored: readonly StoredAnswer[], selection: Selection): Selection {
  const keys = new Set(stored.map((row) => answerKey(row.event_id, row.guest_id)));
  const kept: Selection = {};
  for (const [key, value] of Object.entries(selection)) if (keys.has(key)) kept[key] = value;
  return kept;
}

/** A dietary note as the server stores it: trimmed, and null when empty (`text(200)` rejects ""). */
export function normaliseNote(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * The dietary requests to send: only fields the guest edited, and only where the edit
 * differs from the stored note. An untouched field sends nothing, so a stored note that
 * changed since the page loaded (a planner's edit) is never overwritten by a stale copy.
 */
export function editedNotes(
  guest_ids: readonly string[],
  edits: Readonly<Record<string, string>>,
  stored: Readonly<Record<string, string | null>>,
): { guest_id: string; dietary_note: string | null }[] {
  return guest_ids
    .filter((guest_id) => edits[guest_id] !== undefined && normaliseNote(edits[guest_id]) !== normaliseNote(stored[guest_id]))
    .map((guest_id) => ({ guest_id, dietary_note: normaliseNote(edits[guest_id]) }));
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * A fresh idempotency key (I1). `randomUUID` needs a secure context, which a plain-http
 * LAN address is not, so fall back to `getRandomValues` in the same UUID v4 shape.
 */
export function newIdempotencyKey(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
    try {
      return cryptoApi.randomUUID();
    } catch {
      // Not a secure context: fall through.
    }
  }
  const bytes = new Uint8Array(16);
  if (cryptoApi && typeof cryptoApi.getRandomValues === "function") cryptoApi.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const h = hex(bytes);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** The key held for the body the Send button currently shows. */
export type HeldKey = { signature: string; key: string };

/**
 * One key per exact request (R8): the same body at the same response count keeps its key,
 * so a second tap resends with it and the server replays. A changed body, or any response
 * (`response_seq` moves), gets a new key.
 */
export function keyForBody(
  held: HeldKey | null,
  body: unknown,
  response_seq: number,
  make: () => string = newIdempotencyKey,
): HeldKey {
  const signature = `${response_seq}#${JSON.stringify(body)}`;
  if (held && held.signature === signature) return held;
  return { signature, key: make() };
}
