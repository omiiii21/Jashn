import "server-only";

import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";

import type { CommandName, CommandOutcome, CommandSuccess } from "@/contracts/commands";
import type { ActorKey, CommandActor, JsonValue, WeddingId } from "@/contracts/domain";
import type { DbOrTx } from "@/db/client";
import { commandReceipts } from "@/db/schema";

/**
 * Command receipts (domain 2.10 I1–I3, 5.1 `command_receipts`). A receipt names one exact
 * request: the key, the command, the actor and the SHA-256 of the canonical input. The
 * stored response never carries a raw token or a signed URL.
 */

// ---------------------------------------------------------------------------
// Canonical JSON and the request hash
// ---------------------------------------------------------------------------

/**
 * JSON with object keys sorted at every depth and `undefined` members dropped, so two
 * requests that differ only in key order or omitted optionals hash the same.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && !Number.isFinite(value)) return null;
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => (item === undefined ? null : canonicalize(item)));
  if (value instanceof Date) return value.toISOString();
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    const item = (value as Record<string, unknown>)[key];
    if (item === undefined) continue;
    out[key] = canonicalize(item);
  }
  return out;
}

/** Hex SHA-256 of the command name, the wedding (null for a create) and the canonical input. */
export function requestHash(command: CommandName, wedding_id: WeddingId | null, input: unknown): string {
  return createHash("sha256")
    .update(canonicalJson({ command, wedding_id: wedding_id ?? null, input: input ?? {} }))
    .digest("hex");
}

/**
 * `member:{id}`, `household:{id}` or `ops`. A command with no wedding in its envelope (the
 * create, `accept_member_invite`) keys on the user id: the user may hold a membership by the
 * time the same request is resent, and a retry must still replay (I2, AT-2.9).
 */
export function actorKeyOf(actor: CommandActor, wedding_id?: WeddingId | null): ActorKey {
  if (actor.kind === "guest") return `household:${actor.household_id}`;
  if (actor.kind === "system") return "ops";
  if (wedding_id === null) return `member:${actor.user_id}`;
  return `member:${actor.member_id ?? actor.user_id}`;
}

// ---------------------------------------------------------------------------
// Stripping tokens and signed URLs
// ---------------------------------------------------------------------------

/** Keys whose values are raw tokens or signed URLs: removed (or nulled when the DTO keeps the key). */
const SECRET_KEYS = new Set(["token", "raw_token", "join_url", "url", "signed_url", "signed_upload_url"]);
/** Keys the DTO types keep as `string | null`: nulled instead of removed. */
const NULLED_KEYS = new Set(["download_url", "photo_url"]);

/** A Supabase signed URL, a URL with a token parameter, or a guest or join link carrying a raw token. */
const SECRET_STRING = /\/object\/sign\/|\/object\/upload\/sign\/|[?&](token|t)=|\/(i|join)\/[A-Za-z0-9_-]{20,}/;

function stripValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripValue);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (NULLED_KEYS.has(key)) {
        out[key] = null;
        continue;
      }
      if (SECRET_KEYS.has(key)) continue;
      out[key] = stripValue(item);
    }
    return out;
  }
  if (typeof value === "string" && SECRET_STRING.test(value)) return null;
  return value;
}

/**
 * The response as stored: raw tokens and signed URLs removed (5.1). A replay of
 * `create_invitation_links` or `invite_member` then says the token was already issued
 * (6.3), since the raw token was shown once and is not kept.
 */
export function stripResponseForReceipt<C extends CommandName>(response: CommandSuccess<C>): CommandSuccess<C> {
  const stripped = stripValue(response) as CommandSuccess<C>;
  const result = stripped.result as Record<string, unknown> | null;
  if (result && typeof result === "object") {
    if (response.command === "create_invitation_links") result.tokens_already_issued = true;
    if (response.command === "invite_member") result.token_already_issued = true;
  }
  return stripped;
}

// ---------------------------------------------------------------------------
// Read and write
// ---------------------------------------------------------------------------

export type StoredReceipt = {
  idempotency_key: string;
  command: string;
  wedding_id: WeddingId | null;
  actor_key: string;
  request_hash: string;
  outcome: string;
  http_status: number;
  response: JsonValue;
};

/** The receipt for a key, or null. */
export async function readReceipt(db: DbOrTx, idempotency_key: string): Promise<StoredReceipt | null> {
  const rows = await db
    .select({
      idempotency_key: commandReceipts.idempotency_key,
      command: commandReceipts.command,
      wedding_id: commandReceipts.wedding_id,
      actor_key: commandReceipts.actor_key,
      request_hash: commandReceipts.request_hash,
      outcome: commandReceipts.outcome,
      http_status: commandReceipts.http_status,
      response: commandReceipts.response,
    })
    .from(commandReceipts)
    .where(eq(commandReceipts.idempotency_key, idempotency_key))
    .limit(1);
  return rows[0] ?? null;
}

export type ReceiptMatch =
  /** Same request: replay the stored response. */
  | { kind: "replay"; response: CommandSuccess }
  /** Same key, another request (or another actor or command): 409 `idempotency_key_reused`. */
  | { kind: "reused" };

/**
 * Compares a stored receipt with the incoming request (I2). Another actor's or another
 * command's receipt is never replayed: that would hand one caller another's response.
 * A create stores the new wedding's id, so a create (no envelope wedding) skips that check.
 */
export function matchReceipt(
  receipt: StoredReceipt,
  request: { command: CommandName; actor_key: string; request_hash: string; wedding_id: WeddingId | null },
): ReceiptMatch {
  const sameWedding = request.wedding_id === null || receipt.wedding_id === request.wedding_id;
  if (
    receipt.command === request.command &&
    receipt.actor_key === request.actor_key &&
    receipt.request_hash === request.request_hash &&
    sameWedding
  ) {
    return { kind: "replay", response: { ...(receipt.response as CommandSuccess), outcome: "replayed" } };
  }
  return { kind: "reused" };
}

/** Writes the receipt inside the command's transaction (I3). */
export async function writeReceipt(
  tx: DbOrTx,
  receipt: {
    idempotency_key: string;
    command: CommandName;
    wedding_id: WeddingId | null;
    actor_key: string;
    request_hash: string;
    outcome: CommandOutcome;
    http_status: number;
    response: CommandSuccess;
    created_at: Date;
  },
): Promise<void> {
  await tx.insert(commandReceipts).values({
    idempotency_key: receipt.idempotency_key,
    command: receipt.command,
    wedding_id: receipt.wedding_id,
    actor_key: receipt.actor_key,
    request_hash: receipt.request_hash,
    outcome: receipt.outcome,
    http_status: receipt.http_status,
    response: stripResponseForReceipt(receipt.response) as unknown as JsonValue,
    created_at: receipt.created_at,
  });
}
