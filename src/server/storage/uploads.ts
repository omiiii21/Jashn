import "server-only";

import { randomUUID } from "node:crypto";

import { z } from "zod";

import { type UploadMimeType, type UploadSignRequest, type UploadSignResponse } from "@/contracts/api";
import { commandSchemas, validationMessageFor, type CommandErrorBody } from "@/contracts/commands";
import type { AssetId, SessionActor, WeddingId } from "@/contracts/domain";
import { STORAGE_BUCKETS, type StorageAdapter } from "@/contracts/services";
import { checkCommandActor } from "@/server/authz/guard";

import { StorageAdapterError, storage } from "./index";

/**
 * Upload signing for the couple photo (domain 3.2 `add_asset`, 5.5; architecture 3.6;
 * decisions D41, D121). `POST /api/uploads/sign` calls it, and so will `services.signUpload`.
 *
 * 1. The actor may run `add_asset` on this wedding (owners and managers, permissions.ts):
 *    otherwise 403 `forbidden`, exactly as the dispatcher would answer the command.
 * 2. The request: `couple_photo` only; JPEG, PNG or WebP; `bytes` an integer from 1 to
 *    10 MB. The limits are `add_asset`'s own schema, so the sign step and the command can
 *    never disagree (AT-7.1's upload limits: a GIF or a JPEG over 10 MB is refused, and
 *    nothing is signed).
 * 3. A fresh `asset_id` and the object key `{wedding_id}/{asset_id}.{ext}` in `uploads`
 *    (no bucket in the key), then a signed upload URL valid 2 hours.
 *
 * The browser uploads straight to Storage with that URL, then runs `add_asset`, which
 * checks the object exists at that key with that size. Nothing is written here: an
 * abandoned upload leaves only an object no row points at. The signed URL and its token are
 * never logged.
 */

// ---------------------------------------------------------------------------
// Keys (shared with `add_asset`)
// ---------------------------------------------------------------------------

/** The file extension each allowed type is stored under. */
export const UPLOAD_EXTENSIONS: Record<UploadMimeType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** `{wedding_id}/{asset_id}.{ext}`: the object key in bucket `uploads`, and `assets.storage_path`. */
export function uploadObjectKey(wedding_id: WeddingId, asset_id: AssetId, mime_type: UploadMimeType): string {
  return `${wedding_id}/${asset_id}.${UPLOAD_EXTENSIONS[mime_type]}`;
}

// ---------------------------------------------------------------------------
// The request
// ---------------------------------------------------------------------------

/** The sign request: `add_asset`'s kind, type and size rules, plus the wedding. */
export const uploadSignRequestSchema = commandSchemas.add_asset
  .pick({ asset_kind: true, mime_type: true, bytes: true })
  .extend({ wedding_id: z.guid("unknown_value") });

/** The `validation_failed` word for an issue; a string where `bytes` belongs is `not_integer`, as in the dispatcher. */
function issueMessage(issue: { code: string; message: string; input?: unknown; expected?: unknown }): string {
  if (
    issue.code === "invalid_type" &&
    issue.expected === "number" &&
    (typeof issue.input === "string" || typeof issue.input === "number")
  ) {
    return "not_integer";
  }
  return validationMessageFor(issue);
}

export type ParsedUploadSignRequest =
  | { ok: true; request: UploadSignRequest }
  | { ok: false; error: CommandErrorBody };

/** Validates a sign request (any shape, as it comes off the wire) into `validation_failed` with its field. */
export function parseUploadSignRequest(value: unknown): ParsedUploadSignRequest {
  const parsed = uploadSignRequestSchema.safeParse(value, { reportInput: true });
  if (parsed.success) return { ok: true, request: parsed.data };
  const issue = parsed.error.issues[0];
  const field = issue && issue.path.length > 0 ? issue.path.map(String).join(".") : null;
  return { ok: false, error: { code: "validation_failed", message: issue ? issueMessage(issue) : "unknown_value", field } };
}

// ---------------------------------------------------------------------------
// Signing
// ---------------------------------------------------------------------------

export type UploadSignerDeps = {
  storage: Pick<StorageAdapter, "signedUploadUrl">;
  /** Mints the asset id (a random UUID). */
  newAssetId: () => AssetId;
  /** Never receives a key, a token or a URL: error names and codes only. */
  log: (message: string, detail?: Record<string, string | number | boolean | null>) => void;
};

const UNAVAILABLE: CommandErrorBody = {
  code: "internal_error",
  message: "The upload couldn't start. Try again.",
  field: null,
};

/** Builds the signer over its dependencies (tests inject a fake Storage). */
export function createUploadSigner(overrides: Partial<UploadSignerDeps> = {}) {
  const deps: UploadSignerDeps = {
    storage,
    newAssetId: randomUUID,
    log: (message, detail) => console.error(`[uploads] ${message}`, detail ?? {}),
    ...overrides,
  };

  return async function signUpload(actor: SessionActor, request: UploadSignRequest): Promise<UploadSignResponse> {
    // 1. The role, for this wedding (the guard's command check for `add_asset`).
    const raw = (request ?? {}) as Partial<Record<keyof UploadSignRequest, unknown>>;
    const wedding_id = typeof raw.wedding_id === "string" ? raw.wedding_id : null;
    const actorError = checkCommandActor(actor, "add_asset", { wedding_id, sharing: null });
    if (actorError) return { ok: false, error: { ...actorError, field: actorError.field ?? null } };

    // 2. The request.
    const parsed = parseUploadSignRequest(request);
    if (!parsed.ok) return { ok: false, error: parsed.error };

    // 3. The key and the signed URL.
    const asset_id = deps.newAssetId();
    const object_key = uploadObjectKey(parsed.request.wedding_id, asset_id, parsed.request.mime_type);
    try {
      const signed = await deps.storage.signedUploadUrl(STORAGE_BUCKETS.uploads, object_key);
      return {
        ok: true,
        asset_id,
        bucket: STORAGE_BUCKETS.uploads,
        object_key,
        signed_upload_url: signed.signed_url,
        token: signed.token,
        expires_at: signed.expires_at,
      };
    } catch (error) {
      deps.log("upload sign failed", {
        error: error instanceof Error ? error.name : "unknown",
        code: error instanceof StorageAdapterError ? error.code : null,
      });
      return { ok: false, error: UNAVAILABLE };
    }
  };
}

/**
 * `Services.signUpload` for members: a signed upload URL for a couple photo, or the error
 * envelope (`forbidden`, `validation_failed`, `internal_error`). The caller has already
 * resolved the actor for `request.wedding_id` (the route through the guard's member check).
 */
export const signUploadForMember: (actor: SessionActor, request: UploadSignRequest) => Promise<UploadSignResponse> =
  createUploadSigner();
