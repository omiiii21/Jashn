/**
 * The couple photo's upload steps (architecture 3.6 "Uploads"; domain 3.2 `add_asset`, 5.5).
 * Browser helpers with no `src/server` import: the file goes straight from the browser to
 * Storage through a signed upload URL, never through a server action (AGENTS.md rule 10).
 *
 * 1. `checkPhotoFile` refuses a GIF, HEIC or anything over 10 MB before any request,
 *    so nothing is stored (AT-7.1).
 * 2. `measureImage` reads the width and height, when the browser can.
 * 3. `signPhotoUpload` asks `POST /api/uploads/sign` for a signed URL and the asset id.
 * 4. `putSignedUpload` sends the file to Storage.
 * 5. The caller dispatches `add_asset` with `addAssetInput(...)`.
 */
import {
  UPLOAD_MAX_BYTES,
  UPLOAD_MIME_TYPES,
  type UploadMimeType,
  type UploadSignRequest,
  type UploadSignResponse,
} from "@/contracts/api";
import type { CommandErrorBody, CommandInput } from "@/contracts/commands";
import type { AssetId } from "@/contracts/domain";
import { routes } from "@/contracts/routes";

/** For the file input's `accept`. GIFs are never offered. */
export const PHOTO_ACCEPT = UPLOAD_MIME_TYPES.join(",");

export type PhotoCheck = { ok: true; mime_type: UploadMimeType } | { ok: false; reason: "type" | "size" | "empty" };

export const PHOTO_ERROR_TEXT = {
  type: "Choose a JPEG, PNG or WebP photo. GIFs can't be used.",
  size: "This photo is over 10 MB. Choose a smaller one.",
  empty: "This file is empty. Choose another photo.",
  upload: "The photo didn't upload. Check your connection and try again.",
  unavailable: "Photo uploads aren't switched on yet. Try again later.",
} as const;

/** The client-side refusal: type in UPLOAD_MIME_TYPES, size from 1 byte to 10 MB. */
export function checkPhotoFile(file: { type: string; size: number }): PhotoCheck {
  const type = file.type.toLowerCase();
  if (!(UPLOAD_MIME_TYPES as readonly string[]).includes(type)) return { ok: false, reason: "type" };
  if (file.size <= 0) return { ok: false, reason: "empty" };
  if (file.size > UPLOAD_MAX_BYTES) return { ok: false, reason: "size" };
  return { ok: true, mime_type: type as UploadMimeType };
}

const MAX_SIDE_PX = 20_000;

function validSide(value: number | undefined): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= MAX_SIDE_PX;
}

/** `add_asset`'s input. Width and height go only when known and inside the schema's range. */
export function addAssetInput(
  asset_id: AssetId,
  mime_type: UploadMimeType,
  bytes: number,
  size: { width: number; height: number } | null,
): CommandInput<"add_asset"> {
  const input: CommandInput<"add_asset"> = { asset_id, asset_kind: "couple_photo", mime_type, bytes };
  if (size && validSide(size.width) && validSide(size.height)) {
    input.width = size.width;
    input.height = size.height;
  }
  return input;
}

/** The words under the Photo field for a failed sign or `add_asset`. */
export function uploadFailureText(body: CommandErrorBody): string {
  if (body.code === "validation_failed") {
    if (body.field === "bytes") return PHOTO_ERROR_TEXT.size;
    if (body.field === "mime_type") return PHOTO_ERROR_TEXT.type;
  }
  if (body.code === "forbidden") return "Only an owner or a manager of this wedding can add a photo.";
  if (body.code === "unauthenticated") return "Sign in again to add a photo.";
  const message = body.message?.trim();
  // Validation words ("out_of_range") aren't sentences; route messages are written for people.
  return message && /\s/.test(message) ? message : PHOTO_ERROR_TEXT.upload;
}

/** Width and height in pixels, or null when the browser can't decode the file. */
export async function measureImage(file: Blob): Promise<{ width: number; height: number } | null> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      const size = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      return size;
    } catch {
      // Fall through to the Image element.
    }
  }
  if (typeof Image === "undefined" || typeof URL.createObjectURL !== "function") return null;
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => resolve(null);
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** `POST /api/uploads/sign` (Lane A6). Never throws for an HTTP error: it answers the failure body. */
export async function signPhotoUpload(request: UploadSignRequest): Promise<UploadSignResponse> {
  const response = await fetch(routes.api.uploadsSign(), {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });
  try {
    const body = (await response.json()) as UploadSignResponse;
    if (body && typeof body === "object" && "ok" in body) return body;
  } catch {
    // Not JSON: fall through.
  }
  // A bare 404 means the upload route isn't deployed yet (Lane A6), not a network fault.
  const message = response.status === 404 ? PHOTO_ERROR_TEXT.unavailable : PHOTO_ERROR_TEXT.upload;
  return { ok: false, error: { code: "internal_error", message } };
}

/** The fixture signer's URLs use the reserved .invalid domain, which never resolves. */
export function isFixtureUploadUrl(signed_upload_url: string): boolean {
  try {
    return new URL(signed_upload_url).hostname.endsWith(".invalid");
  } catch {
    return false;
  }
}

/**
 * Sends the file to the signed upload URL with one PUT, the request storage-js's
 * `uploadToSignedUrl` makes, without bundling supabase-js. The URL carries its own token;
 * the anon key (public by design) goes along as Supabase's gateway expects. The URL is
 * never logged. Fixture URLs skip the network, so the studio works on fixtures.
 */
export async function putSignedUpload(
  signed_upload_url: string,
  file: Blob,
  mime_type: UploadMimeType,
): Promise<{ ok: boolean }> {
  if (isFixtureUploadUrl(signed_upload_url)) return { ok: true };
  const headers: Record<string, string> = {
    "content-type": mime_type,
    "cache-control": "max-age=3600",
    "x-upsert": "false",
  };
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (anonKey) {
    headers.apikey = anonKey;
    headers.authorization = `Bearer ${anonKey}`;
  }
  try {
    const response = await fetch(signed_upload_url, { method: "PUT", headers, body: file });
    return { ok: response.ok };
  } catch {
    return { ok: false };
  }
}
