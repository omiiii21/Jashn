import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { UPLOAD_URL_TTL_S } from "@/contracts/api";
import type { AssetDto, IsoInstant } from "@/contracts/domain";
import { DOWNLOAD_URL_TTL_S, downloadName, exportObjectKey } from "@/contracts/jobs";
import {
  GUEST_PHOTO_URL_TTL_S,
  MEMBER_SIGNED_URL_TTL_S,
  STORAGE_BUCKETS,
  type SigningHelpers,
  type StorageAdapter,
  type StorageBucket,
} from "@/contracts/services";
import { isUuidShaped } from "@/db/ids";
import { getSupabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";

/**
 * The Storage adapter and the signing helpers (architecture 3.6, domain 5.5,
 * export-and-recovery 2.6; decisions D41 and D102).
 *
 * - Supabase Storage through the service-role client in `src/lib/supabase/admin`; both
 *   buckets are private with no Storage policies, so every read is a server-signed URL.
 * - Object keys never include the bucket: `{wedding_id}/{asset_id}.{ext}` in `uploads`,
 *   `{wedding_id}/card-rev{n}.png` in `exports`.
 * - `upload` upserts by default: the export worker overwrites its fixed key (Lane D owns
 *   the upsert and the size check, through this adapter).
 * - Errors are `StorageAdapterError`s with a code. Messages name the operation and the
 *   bucket only: never a key, a token or a signed URL, and nothing here logs.
 */

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type StorageAdapterErrorCode =
  /** `NEXT_PUBLIC_SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` is missing. */
  | "not_configured"
  /** A bad key, bucket, TTL or body, caught before any request. */
  | "invalid_request"
  /** The object doesn't exist (for the calls that can't answer null). */
  | "not_found"
  /** Any other Storage failure. */
  | "storage_error";

export class StorageAdapterError extends Error {
  readonly code: StorageAdapterErrorCode;
  /** The Storage HTTP status, when there was one. */
  readonly status: number | null;

  constructor(code: StorageAdapterErrorCode, message: string, status: number | null = null) {
    super(message);
    this.name = "StorageAdapterError";
    this.code = code;
    this.status = status;
  }
}

/** The fields storage-js puts on its errors (`StorageError`, `StorageApiError`). */
type StorageErrorLike = { message?: string; status?: number; statusCode?: string; code?: string };

/** True when Storage says the object (not the bucket) doesn't exist, across server versions. */
export function isObjectNotFound(error: StorageErrorLike | null | undefined): boolean {
  if (!error) return false;
  const message = error.message ?? "";
  if (error.code === "NoSuchBucket" || /bucket/i.test(message)) return false;
  // A route miss ("Route GET:/object/info/... not found") means the server lacks the
  // endpoint, not the object: `stat` then falls back to the folder listing.
  if (/^Route [A-Z]+:/.test(message)) return false;
  if (error.code === "NoSuchKey" || error.code === "not_found") return true;
  // Older servers answer 400 with `statusCode: "404"`; newer ones a plain 404.
  if (error.status === 404 || error.statusCode === "404") return true;
  return /not[\s_-]?found/i.test(message);
}

function storageFailure(operation: string, bucket: StorageBucket, error: StorageErrorLike): StorageAdapterError {
  const status = typeof error.status === "number" ? error.status : null;
  if (isObjectNotFound(error)) return new StorageAdapterError("not_found", `Storage ${operation} in ${bucket}: object not found`, status);
  const detail = error.code ?? error.statusCode ?? (status === null ? "unknown" : String(status));
  return new StorageAdapterError("storage_error", `Storage ${operation} in ${bucket} failed (${detail})`, status);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const KNOWN_BUCKETS = Object.values(STORAGE_BUCKETS) as readonly string[];

/** The longest a signed download lives: the guest photo's hour (domain 5.5). */
export const MAX_SIGNED_URL_TTL_S = GUEST_PHOTO_URL_TTL_S;

const KEY_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const DOWNLOAD_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function assertBucket(bucket: string): asserts bucket is StorageBucket {
  if (!KNOWN_BUCKETS.includes(bucket)) throw new StorageAdapterError("invalid_request", "Unknown Storage bucket");
}

/**
 * A key is relative to its bucket: no bucket prefix, no leading slash, no empty, `.` or
 * `..` segments, and only URL-safe characters.
 */
export function isValidObjectKey(bucket: StorageBucket, object_key: string): boolean {
  if (typeof object_key !== "string" || object_key.length === 0 || object_key.length > 512) return false;
  if (object_key.startsWith(`${bucket}/`)) return false;
  return object_key.split("/").every((segment) => KEY_SEGMENT.test(segment) && segment !== "." && segment !== "..");
}

function assertKey(bucket: StorageBucket, object_key: string): void {
  if (!isValidObjectKey(bucket, object_key)) throw new StorageAdapterError("invalid_request", `Invalid object key for ${bucket}`);
}

function assertTtl(expires_in_s: number): void {
  if (!Number.isSafeInteger(expires_in_s) || expires_in_s < 1 || expires_in_s > MAX_SIGNED_URL_TTL_S) {
    throw new StorageAdapterError("invalid_request", `Signed URL lifetime must be 1 to ${MAX_SIGNED_URL_TTL_S} seconds`);
  }
}

function toIsoInstant(value: unknown): IsoInstant | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function safeBytes(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

// ---------------------------------------------------------------------------
// The adapter
// ---------------------------------------------------------------------------

/** One bucket's storage-js API, as the service-role client returns it. */
export type BucketApi = ReturnType<SupabaseClient["storage"]["from"]>;

/** Where the adapter gets a bucket's API; tests inject a fake. */
export type BucketApiSource = (bucket: StorageBucket) => BucketApi;

export type StorageAdapterOptions = {
  /** The clock for `signedUploadUrl`'s `expires_at` (tests). */
  now?: () => number;
};

/** The service-role bucket API, or a clear `not_configured` error while the keys are missing. */
function serviceRoleBucket(bucket: StorageBucket): BucketApi {
  if (!isSupabaseAdminConfigured()) {
    throw new StorageAdapterError("not_configured", "Supabase Storage is not configured (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)");
  }
  return getSupabaseAdmin().storage.from(bucket);
}

/** True when the adapter can reach Storage (the project URL and the service role key are set). */
export function isStorageConfigured(): boolean {
  return isSupabaseAdminConfigured();
}

/** Builds a `StorageAdapter` over a bucket source (the real one by default). */
export function createStorageAdapter(source: BucketApiSource = serviceRoleBucket, options: StorageAdapterOptions = {}): StorageAdapter {
  const now = options.now ?? Date.now;

  function api(bucket: StorageBucket): BucketApi {
    assertBucket(bucket);
    return source(bucket);
  }

  /** The folder listing, for Storage servers that lack `/object/info`. */
  async function statFromList(bucket: StorageBucket, object_key: string) {
    const slash = object_key.lastIndexOf("/");
    const folder = slash >= 0 ? object_key.slice(0, slash) : "";
    const name = object_key.slice(slash + 1);
    const listed = await api(bucket).list(folder, { search: name, limit: 100 });
    if (listed.error) throw storageFailure("stat", bucket, listed.error);
    const row = (listed.data ?? []).find((entry) => entry.name === name && entry.id !== null);
    if (!row) return null;
    const metadata = (row.metadata ?? {}) as { size?: unknown; contentLength?: unknown; mimetype?: unknown; lastModified?: unknown };
    const bytes = safeBytes(metadata.size) ?? safeBytes(metadata.contentLength);
    if (bytes === null) throw new StorageAdapterError("storage_error", `Storage stat in ${bucket}: no object size`);
    return {
      bytes,
      content_type: typeof metadata.mimetype === "string" ? metadata.mimetype : null,
      updated_at: toIsoInstant(metadata.lastModified) ?? toIsoInstant(row.updated_at) ?? toIsoInstant(row.created_at),
    };
  }

  return {
    async upload(bucket, object_key, body, uploadOptions) {
      assertBucket(bucket);
      assertKey(bucket, object_key);
      if (!(body instanceof Uint8Array)) throw new StorageAdapterError("invalid_request", "Upload body must be bytes");
      const content_type = uploadOptions?.content_type?.trim();
      if (!content_type) throw new StorageAdapterError("invalid_request", "Upload needs a content type");
      const { error } = await api(bucket).upload(object_key, body, {
        contentType: content_type,
        upsert: uploadOptions.upsert ?? true,
        // Exports are overwritten at a fixed key: never let a cached copy outlive a rewrite.
        cacheControl: bucket === STORAGE_BUCKETS.exports ? "0" : "3600",
      });
      if (error) throw storageFailure("upload", bucket, error);
      return { object_key, bytes: body.byteLength };
    },

    async stat(bucket, object_key) {
      assertBucket(bucket);
      assertKey(bucket, object_key);
      const info = await api(bucket).info(object_key);
      if (!info.error) {
        const data = info.data as {
          size?: unknown;
          contentType?: unknown;
          lastModified?: unknown;
          updatedAt?: unknown;
          createdAt?: unknown;
          metadata?: { size?: unknown; contentLength?: unknown; mimetype?: unknown } | null;
        };
        const bytes = safeBytes(data.size) ?? safeBytes(data.metadata?.size) ?? safeBytes(data.metadata?.contentLength);
        if (bytes !== null) {
          const content_type =
            typeof data.contentType === "string" ? data.contentType : typeof data.metadata?.mimetype === "string" ? data.metadata.mimetype : null;
          return {
            bytes,
            content_type,
            updated_at: toIsoInstant(data.lastModified) ?? toIsoInstant(data.updatedAt) ?? toIsoInstant(data.createdAt),
          };
        }
        return statFromList(bucket, object_key);
      }
      if (isObjectNotFound(info.error)) return null;
      return statFromList(bucket, object_key);
    },

    async download(bucket, object_key) {
      assertBucket(bucket);
      assertKey(bucket, object_key);
      const { data, error } = await api(bucket).download(object_key);
      if (error) {
        if (isObjectNotFound(error)) return null;
        throw storageFailure("download", bucket, error);
      }
      if (!data) return null;
      return new Uint8Array(await data.arrayBuffer());
    },

    async signedDownloadUrl(bucket, object_key, signOptions) {
      assertBucket(bucket);
      assertKey(bucket, object_key);
      assertTtl(signOptions.expires_in_s);
      const name = signOptions.download_name;
      if (name !== undefined && !DOWNLOAD_NAME.test(name)) throw new StorageAdapterError("invalid_request", "Invalid download name");
      const { data, error } = await api(bucket).createSignedUrl(object_key, signOptions.expires_in_s, name ? { download: name } : undefined);
      if (error) throw storageFailure("sign", bucket, error);
      if (!data?.signedUrl) throw new StorageAdapterError("storage_error", `Storage sign in ${bucket}: no URL returned`);
      return data.signedUrl;
    },

    async signedUploadUrl(bucket, object_key) {
      if (bucket !== STORAGE_BUCKETS.uploads) throw new StorageAdapterError("invalid_request", "Only the uploads bucket takes browser uploads");
      assertKey(bucket, object_key);
      const { data, error } = await api(bucket).createSignedUploadUrl(object_key);
      if (error) throw storageFailure("upload sign", bucket, error);
      if (!data?.signedUrl || !data.token) throw new StorageAdapterError("storage_error", `Storage upload sign in ${bucket}: no URL returned`);
      // Supabase signed upload URLs are valid for 2 hours (domain 5.5).
      return { signed_url: data.signedUrl, token: data.token, expires_at: new Date(now() + UPLOAD_URL_TTL_S * 1000).toISOString() };
    },

    async remove(bucket, object_keys) {
      assertBucket(bucket);
      if (object_keys.length === 0) return;
      for (const key of object_keys) assertKey(bucket, key);
      const { error } = await api(bucket).remove([...object_keys]);
      if (error && !isObjectNotFound(error)) throw storageFailure("remove", bucket, error);
    },
  };
}

/** The Storage adapter (service role, server only). */
export const storage: StorageAdapter = createStorageAdapter();

// ---------------------------------------------------------------------------
// Signing helpers
// ---------------------------------------------------------------------------

export type SigningHelpersOptions = {
  /** Whether Storage is reachable; the couple photo answers null while it isn't. */
  isConfigured?: () => boolean;
};

/** Builds the signing helpers over an adapter (the real one by default). */
export function createSigningHelpers(adapter: StorageAdapter = storage, options: SigningHelpersOptions = {}): SigningHelpers {
  const isConfigured = options.isConfigured ?? isStorageConfigured;

  return {
    /**
     * The card download: `{wedding_id}/card-rev{n}.png` in `exports`, signed 10 minutes,
     * saved as `jashn-card-rev{n}.png` (export-and-recovery 2.6). Throws when the object is
     * missing (`not_found`) or Storage isn't configured.
     */
    async exportDownloadUrl(job) {
      if (!isUuidShaped(job.wedding_id)) throw new StorageAdapterError("invalid_request", "Invalid wedding id");
      if (!Number.isSafeInteger(job.revision) || job.revision < 1) throw new StorageAdapterError("invalid_request", "Invalid revision");
      if (job.format !== "png") throw new StorageAdapterError("invalid_request", "Unsupported export format");
      const object_key = exportObjectKey(job.wedding_id, job.revision, job.format);
      return adapter.signedDownloadUrl(STORAGE_BUCKETS.exports, object_key, {
        expires_in_s: DOWNLOAD_URL_TTL_S,
        download_name: downloadName(job.revision, job.format),
      });
    },

    /**
     * The couple photo, signed 10 minutes for members and 1 hour inside the guest view.
     * Null when there is no photo: no asset, another kind, no key, the file missing, or
     * Storage not configured yet (the card and the guest page render without it). Other
     * Storage failures throw.
     */
    async couplePhotoUrl(asset, audience) {
      const photo = asset as AssetDto | null | undefined;
      if (!photo || photo.asset_kind !== "couple_photo" || !photo.storage_path) return null;
      if (!isValidObjectKey(STORAGE_BUCKETS.uploads, photo.storage_path)) return null;
      if (!isConfigured()) return null;
      const expires_in_s = audience === "guest" ? GUEST_PHOTO_URL_TTL_S : MEMBER_SIGNED_URL_TTL_S;
      try {
        return await adapter.signedDownloadUrl(STORAGE_BUCKETS.uploads, photo.storage_path, { expires_in_s });
      } catch (error) {
        if (error instanceof StorageAdapterError && error.code === "not_found") return null;
        throw error;
      }
    },
  };
}

/** The signing helpers over the real adapter. */
export const signingHelpers: SigningHelpers = createSigningHelpers();
