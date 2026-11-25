import "server-only";

import { eq } from "drizzle-orm";

import { CommandFailure } from "@/contracts/commands";
import type { AssetDto, AssetId, JsonObject, SessionActor, WeddingId } from "@/contracts/domain";
import {
  STORAGE_BUCKETS,
  type ActivityEntryDraft,
  type CommandHandler,
  type CommandHandlerContext,
  type HandlerMap,
  type StorageAdapter,
} from "@/contracts/services";
import type { Tx } from "@/db/client";
import { assets } from "@/db/schema";
import { StorageAdapterError, storage } from "@/server/storage";
import { uploadObjectKey } from "@/server/storage/uploads";

/**
 * `add_asset` (domain 3.2, 5.5; architecture 3.6; decisions D107, D121, D126). The last step
 * of the couple-photo upload: `POST /api/uploads/sign` minted the asset id and the key
 * `{wedding_id}/{asset_id}.{ext}`, the browser uploaded straight to Storage, and now the
 * server checks the object exists at that key with exactly that size and inserts the
 * `assets` row with the key (no bucket) in `storage_path`.
 *
 * - Who: owner and manager (the dispatcher's role matrix). A guest token never gets here:
 *   the guard answers it 404 before any handler runs (D35).
 * - Effects: one new `assets` row. Nothing else changes: the photo reaches the card and
 *   guests only when `update_invite_style` references it and an owner publishes, so this
 *   command never moves `draft_version`. Older photos, the seeded one (seed_key
 *   `ASSET-PHOTO`) included, are never touched; `reset_demo` keeps every asset (D107).
 * - The same asset id again: `unchanged` when it matches the stored row, else refused.
 * - Storage: one `stat` call, after the cheap checks, with a short timeout. The handler runs
 *   inside the dispatcher's transaction, which already holds the `weddings` lock, so the
 *   call is bounded rather than moved outside.
 */

/** How long the Storage check may hold the wedding lock. */
export const ASSET_STAT_TIMEOUT_MS = 5_000;

/**
 * The one answer for an asset id with nothing behind it in this wedding: no uploaded object
 * at its key, or an id another wedding holds. Both get this exact body, so a foreign id
 * reveals nothing (5.0, AT-9.7).
 */
export const ASSET_NOT_UPLOADED = {
  code: "not_found",
  message: "The photo hasn't finished uploading. Try again.",
  field: "asset_id",
} as const;

export type AssetHandlerDeps = {
  /** The Storage check (injected so tests fake it). */
  stat: StorageAdapter["stat"];
  statTimeoutMs: number;
};

// ---------------------------------------------------------------------------
// Pure parts (unit-tested in assets.test.ts)
// ---------------------------------------------------------------------------

type AddAssetInput = CommandHandlerContext<"add_asset", Tx>["input"];

/** The stored row as the result and the replay check read it (an `AssetDto`). */
export type StoredAsset = AssetDto & { wedding_id: WeddingId };

/** The row this input would insert. */
export function assetFromInput(wedding_id: WeddingId, input: AddAssetInput): StoredAsset {
  return {
    asset_id: input.asset_id,
    wedding_id,
    seed_key: null,
    asset_kind: input.asset_kind,
    storage_path: uploadObjectKey(wedding_id, input.asset_id, input.mime_type),
    mime_type: input.mime_type,
    bytes: input.bytes,
    width: input.width ?? null,
    height: input.height ?? null,
  };
}

/** True when a stored row already says what this input says (a resend: `unchanged`). */
export function sameAsset(stored: StoredAsset, wanted: StoredAsset, input: AddAssetInput): boolean {
  return (
    stored.wedding_id === wanted.wedding_id &&
    stored.asset_kind === wanted.asset_kind &&
    stored.storage_path === wanted.storage_path &&
    stored.mime_type === wanted.mime_type &&
    stored.bytes === wanted.bytes &&
    (input.width === undefined || stored.width === input.width) &&
    (input.height === undefined || stored.height === input.height)
  );
}

/** The result: the asset as `AssetDto`, ready for `update_invite_style`'s `photo_asset_id`. */
export function assetResult(asset: StoredAsset): JsonObject {
  return {
    asset_id: asset.asset_id,
    seed_key: asset.seed_key,
    asset_kind: asset.asset_kind,
    storage_path: asset.storage_path,
    mime_type: asset.mime_type,
    bytes: asset.bytes,
    width: asset.width,
    height: asset.height,
  };
}

/** The entry (3.2), visibility `members` (L5): "{actor} added a couple photo." */
export function addedAssetActivity(args: { actor_label: string; asset: StoredAsset }): ActivityEntryDraft {
  const { actor_label, asset } = args;
  const after: JsonObject = { asset_kind: asset.asset_kind, mime_type: asset.mime_type, bytes: asset.bytes };
  if (asset.width !== null) after.width = asset.width;
  if (asset.height !== null) after.height = asset.height;
  return {
    topic: "asset.added",
    entity_type: "asset",
    entity_id: asset.asset_id,
    summary_en: `${actor_label} added a couple photo.`,
    summary_hi: `${actor_label} ने जोड़े की फ़ोटो जोड़ी।`,
    before: null,
    after,
    visibility: "members",
  };
}

// ---------------------------------------------------------------------------
// The handler
// ---------------------------------------------------------------------------

function memberActorOf(context: CommandHandlerContext<"add_asset", Tx>): SessionActor & { member_id: string } {
  const actor = context.actor;
  // Defence in depth behind the guard: a guest is answered 404 (D35), the ops token 403.
  if (actor.kind === "guest") throw new CommandFailure({ code: "not_found", message: "Not found." });
  if (actor.kind === "system") throw new CommandFailure({ code: "forbidden", message: "Not allowed." });
  if (!context.wedding_id || actor.wedding_id !== context.wedding_id || !actor.member_id || !actor.role) {
    throw new CommandFailure({ code: "forbidden", message: "You are not a member of this wedding." });
  }
  return actor as SessionActor & { member_id: string };
}

async function readAsset(tx: Tx, asset_id: AssetId): Promise<StoredAsset | null> {
  const rows = await tx
    .select({
      asset_id: assets.id,
      wedding_id: assets.wedding_id,
      seed_key: assets.seed_key,
      asset_kind: assets.asset_kind,
      storage_path: assets.storage_path,
      mime_type: assets.mime_type,
      bytes: assets.bytes,
      width: assets.width,
      height: assets.height,
    })
    .from(assets)
    .where(eq(assets.id, asset_id))
    .limit(1);
  return rows[0] ?? null;
}

async function statWithin(
  stat: StorageAdapter["stat"],
  object_key: string,
  timeout_ms: number,
): Promise<Awaited<ReturnType<StorageAdapter["stat"]>>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new StorageAdapterError("storage_error", "Storage stat in uploads timed out")), timeout_ms);
  });
  try {
    return await Promise.race([stat(STORAGE_BUCKETS.uploads, object_key), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Builds the handler over its dependencies (the real Storage by default). */
export function createAddAssetHandler(overrides: Partial<AssetHandlerDeps> = {}): CommandHandler<"add_asset", Tx> {
  const deps: AssetHandlerDeps = {
    stat: (bucket, object_key) => storage.stat(bucket, object_key),
    statTimeoutMs: ASSET_STAT_TIMEOUT_MS,
    ...overrides,
  };

  return async (context) => {
    const actor = memberActorOf(context);
    const wedding_id = context.wedding_id as WeddingId;
    const { tx, input } = context;
    const wanted = assetFromInput(wedding_id, input);

    // The same asset id again (the sign step mints a fresh one each time).
    const stored = await readAsset(tx, input.asset_id);
    if (stored) {
      // Another wedding's asset reveals nothing (5.0): the same body as a missing upload.
      if (stored.wedding_id !== wedding_id) throw new CommandFailure({ ...ASSET_NOT_UPLOADED });
      if (sameAsset(stored, wanted, input)) return { outcome: "unchanged", result: assetResult(stored), activity: null };
      throw new CommandFailure({ code: "validation_failed", message: "unknown_value", field: "asset_id" });
    }

    // The object must exist at that key with exactly that size (3.2).
    const object = await statWithin(deps.stat, wanted.storage_path, deps.statTimeoutMs);
    if (!object) throw new CommandFailure({ ...ASSET_NOT_UPLOADED });
    if (object.bytes !== input.bytes) {
      throw new CommandFailure({ code: "validation_failed", message: "unknown_value", field: "bytes" });
    }

    const now = new Date(context.now);
    await tx.insert(assets).values({
      id: wanted.asset_id,
      wedding_id,
      asset_kind: wanted.asset_kind,
      storage_path: wanted.storage_path,
      mime_type: wanted.mime_type,
      bytes: wanted.bytes,
      width: wanted.width,
      height: wanted.height,
      uploaded_by_member_id: actor.member_id,
      created_at: now,
      updated_at: now,
    });

    return {
      outcome: "applied",
      result: assetResult(wanted),
      activity: addedAssetActivity({ actor_label: actor.display_name, asset: wanted }),
      bumps_draft_version: false,
    };
  };
}

/** The typed handler over the real Storage. */
export const addAssetHandler: CommandHandler<"add_asset", Tx> = createAddAssetHandler();

/** Lane A's handler for 3.2's `add_asset`, for the registry in `src/server/commands/`. */
export const assetHandlers: HandlerMap = {
  add_asset: addAssetHandler,
};
