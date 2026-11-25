import { randomUUID } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import type { AssetDto } from "@/contracts/domain";
import type { StorageBucket } from "@/contracts/services";

import {
  StorageAdapterError,
  createSigningHelpers,
  createStorageAdapter,
  isObjectNotFound,
  isValidObjectKey,
  storage,
  type BucketApi,
} from "./index";

/** An in-memory Storage with storage-js's result shapes. */
function fakeStorage(options: { infoUnsupported?: boolean | "route_404"; legacyNotFound?: boolean } = {}) {
  const objects = new Map<string, { body: Uint8Array<ArrayBuffer>; content_type: string; updated_at: string }>();
  const calls: { op: string; bucket: string; args: unknown[] }[] = [];
  const notFound = options.legacyNotFound
    ? { message: "Object not found", status: 400, statusCode: "404" }
    : { message: "Object not found", status: 404, statusCode: "404", code: "NoSuchKey" };

  function bucketApi(bucket: StorageBucket) {
    const id = (key: string) => `${bucket}/${key}`;
    const api = {
      async upload(key: string, body: Uint8Array, opts: { contentType: string; upsert: boolean; cacheControl?: string }) {
        calls.push({ op: "upload", bucket, args: [key, opts] });
        if (objects.has(id(key)) && !opts.upsert) return { data: null, error: { message: "The resource already exists", status: 409, statusCode: "409" } };
        objects.set(id(key), { body: new Uint8Array(body), content_type: opts.contentType, updated_at: "2026-11-25T08:00:00.000Z" });
        return { data: { id: "x", path: key, fullPath: id(key) }, error: null };
      },
      async info(key: string) {
        calls.push({ op: "info", bucket, args: [key] });
        if (options.infoUnsupported === "route_404") {
          // Fastify's reply for a route the server doesn't have.
          return { data: null, error: { message: `Route GET:/object/info/${bucket}/${key} not found`, status: 404, statusCode: "404" } };
        }
        if (options.infoUnsupported) return { data: null, error: { message: "Route GET:/object/info failed", status: 400, statusCode: "400" } };
        const object = objects.get(id(key));
        if (!object) return { data: null, error: notFound };
        return { data: { size: object.body.byteLength, contentType: object.content_type, lastModified: object.updated_at }, error: null };
      },
      async list(folder: string, opts: { search: string }) {
        calls.push({ op: "list", bucket, args: [folder, opts] });
        const rows = [...objects.entries()]
          .filter(([key]) => key.startsWith(`${bucket}/${folder}/`) && key.slice(bucket.length + folder.length + 2).startsWith(opts.search))
          .map(([key, object]) => ({
            name: key.slice(bucket.length + folder.length + 2),
            id: "x",
            updated_at: object.updated_at,
            created_at: object.updated_at,
            metadata: { size: object.body.byteLength, mimetype: object.content_type },
          }));
        return { data: rows, error: null };
      },
      async download(key: string) {
        calls.push({ op: "download", bucket, args: [key] });
        const object = objects.get(id(key));
        if (!object) return { data: null, error: notFound };
        return { data: new Blob([object.body]), error: null };
      },
      async createSignedUrl(key: string, expires: number, opts?: { download?: string }) {
        calls.push({ op: "createSignedUrl", bucket, args: [key, expires, opts] });
        if (!objects.has(id(key))) return { data: null, error: notFound };
        const download = opts?.download ? `&download=${opts.download}` : "";
        return { data: { signedUrl: `https://storage.invalid/sign/${bucket}/${key}?token=t&expires=${expires}${download}` }, error: null };
      },
      async createSignedUploadUrl(key: string) {
        calls.push({ op: "createSignedUploadUrl", bucket, args: [key] });
        return { data: { signedUrl: `https://storage.invalid/upload/sign/${bucket}/${key}?token=up`, token: "up", path: key }, error: null };
      },
      async remove(keys: string[]) {
        calls.push({ op: "remove", bucket, args: [keys] });
        for (const key of keys) objects.delete(id(key));
        return { data: [], error: null };
      },
    };
    return api as unknown as BucketApi;
  }

  return { source: bucketApi, objects, calls };
}

const weddingId = randomUUID();
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);

describe("createStorageAdapter", () => {
  it("upserts by default and reports the bytes written", async () => {
    const fake = fakeStorage();
    const adapter = createStorageAdapter(fake.source);
    const key = `${weddingId}/card-rev2.png`;
    expect(await adapter.upload("exports", key, png, { content_type: "image/png" })).toEqual({ object_key: key, bytes: 8 });
    expect(await adapter.upload("exports", key, png, { content_type: "image/png" })).toEqual({ object_key: key, bytes: 8 });
    expect(fake.calls[0].args[1]).toMatchObject({ contentType: "image/png", upsert: true, cacheControl: "0" });
  });

  it("fails without overwriting when upsert is false and the object exists", async () => {
    const fake = fakeStorage();
    const adapter = createStorageAdapter(fake.source);
    const key = `${weddingId}/photo.jpg`;
    await adapter.upload("uploads", key, png, { content_type: "image/jpeg" });
    await expect(adapter.upload("uploads", key, png, { content_type: "image/jpeg", upsert: false })).rejects.toMatchObject({
      code: "storage_error",
      status: 409,
    });
  });

  it("stats an object's size, content type and time, and answers null for a missing one", async () => {
    const fake = fakeStorage();
    const adapter = createStorageAdapter(fake.source);
    const key = `${weddingId}/card-rev2.png`;
    expect(await adapter.stat("exports", key)).toBeNull();
    await adapter.upload("exports", key, png, { content_type: "image/png" });
    expect(await adapter.stat("exports", key)).toEqual({ bytes: 8, content_type: "image/png", updated_at: "2026-11-25T08:00:00.000Z" });
  });

  it("reads the older servers' 400-with-statusCode-404 as not found", async () => {
    const adapter = createStorageAdapter(fakeStorage({ legacyNotFound: true }).source);
    expect(await adapter.stat("exports", `${weddingId}/card-rev9.png`)).toBeNull();
    expect(await adapter.download("exports", `${weddingId}/card-rev9.png`)).toBeNull();
  });

  it("falls back to the folder listing when /object/info isn't there", async () => {
    const fake = fakeStorage({ infoUnsupported: true });
    const adapter = createStorageAdapter(fake.source);
    const key = `${weddingId}/card-rev2.png`;
    await adapter.upload("exports", `${weddingId}/card-rev22.png`, new Uint8Array(3), { content_type: "image/png" });
    expect(await adapter.stat("exports", key)).toBeNull();
    await adapter.upload("exports", key, png, { content_type: "image/png" });
    expect(await adapter.stat("exports", key)).toEqual({ bytes: 8, content_type: "image/png", updated_at: "2026-11-25T08:00:00.000Z" });
    expect(fake.calls.some((call) => call.op === "list")).toBe(true);
  });

  it("reads a 404 route miss on /object/info as a missing endpoint, not a missing object", async () => {
    const fake = fakeStorage({ infoUnsupported: "route_404" });
    const adapter = createStorageAdapter(fake.source);
    const key = `${weddingId}/card-rev2.png`;
    await adapter.upload("exports", key, png, { content_type: "image/png" });
    expect(await adapter.stat("exports", key)).toEqual({ bytes: 8, content_type: "image/png", updated_at: "2026-11-25T08:00:00.000Z" });
    expect(await adapter.stat("exports", `${weddingId}/card-rev3.png`)).toBeNull();
    expect(isObjectNotFound({ status: 404, statusCode: "404", message: "Route GET:/object/info/exports/x not found" })).toBe(false);
  });

  it("downloads bytes, or null for a missing object", async () => {
    const adapter = createStorageAdapter(fakeStorage().source);
    const key = `${weddingId}/card-rev2.png`;
    expect(await adapter.download("exports", key)).toBeNull();
    await adapter.upload("exports", key, png, { content_type: "image/png" });
    expect(Array.from((await adapter.download("exports", key)) ?? [])).toEqual(Array.from(png));
  });

  it("signs downloads with the lifetime and file name asked for", async () => {
    const fake = fakeStorage();
    const adapter = createStorageAdapter(fake.source);
    const key = `${weddingId}/card-rev2.png`;
    await adapter.upload("exports", key, png, { content_type: "image/png" });
    const url = await adapter.signedDownloadUrl("exports", key, { expires_in_s: 600, download_name: "jashn-card-rev2.png" });
    expect(url).toContain("expires=600");
    expect(url).toContain("download=jashn-card-rev2.png");
  });

  it("refuses a signed download for a missing object with not_found", async () => {
    const adapter = createStorageAdapter(fakeStorage().source);
    await expect(adapter.signedDownloadUrl("exports", `${weddingId}/card-rev5.png`, { expires_in_s: 600 })).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("refuses lifetimes outside 1 s to 1 hour, and bad download names", async () => {
    const adapter = createStorageAdapter(fakeStorage().source);
    const key = `${weddingId}/card-rev2.png`;
    for (const expires_in_s of [0, -1, 1.5, 3_601, Number.NaN]) {
      await expect(adapter.signedDownloadUrl("exports", key, { expires_in_s })).rejects.toMatchObject({ code: "invalid_request" });
    }
    await expect(adapter.signedDownloadUrl("exports", key, { expires_in_s: 600, download_name: "../x.png" })).rejects.toMatchObject({
      code: "invalid_request",
    });
  });

  it("signs browser uploads for the uploads bucket only, valid 2 hours", async () => {
    const now = Date.parse("2026-11-25T08:00:00.000Z");
    const adapter = createStorageAdapter(fakeStorage().source, { now: () => now });
    const key = `${weddingId}/${randomUUID()}.jpg`;
    expect(await adapter.signedUploadUrl("uploads", key)).toEqual({
      signed_url: `https://storage.invalid/upload/sign/uploads/${key}?token=up`,
      token: "up",
      expires_at: "2026-11-25T10:00:00.000Z",
    });
    await expect(adapter.signedUploadUrl("exports" as "uploads", key)).rejects.toMatchObject({ code: "invalid_request" });
  });

  it("removes objects, and does nothing for an empty list", async () => {
    const fake = fakeStorage();
    const adapter = createStorageAdapter(fake.source);
    const key = `${weddingId}/card-rev2.png`;
    await adapter.upload("exports", key, png, { content_type: "image/png" });
    await adapter.remove("exports", []);
    expect(fake.calls.filter((call) => call.op === "remove")).toHaveLength(0);
    await adapter.remove("exports", [key]);
    expect(await adapter.stat("exports", key)).toBeNull();
  });

  it("refuses keys that carry the bucket, a leading slash, dot segments or odd characters", async () => {
    const fake = fakeStorage();
    const adapter = createStorageAdapter(fake.source);
    for (const key of ["", "/x.png", `exports/${weddingId}/card-rev2.png`, `${weddingId}/../x.png`, `${weddingId}//x.png`, `${weddingId}/a b.png`]) {
      await expect(adapter.stat("exports", key)).rejects.toMatchObject({ code: "invalid_request" });
    }
    await expect(adapter.stat("photos" as StorageBucket, `${weddingId}/x.png`)).rejects.toMatchObject({ code: "invalid_request" });
    expect(fake.calls).toHaveLength(0);
    expect(isValidObjectKey("uploads", `${weddingId}/${randomUUID()}.jpg`)).toBe(true);
  });

  it("names the operation and bucket in errors, never the key or a URL", async () => {
    const source = () =>
      ({
        upload: async () => ({ data: null, error: { message: "Internal", status: 500, statusCode: "500" } }),
      }) as unknown as BucketApi;
    const adapter = createStorageAdapter(source);
    const key = `${weddingId}/card-rev2.png`;
    const error = await adapter.upload("exports", key, png, { content_type: "image/png" }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(StorageAdapterError);
    expect((error as Error).message).toBe("Storage upload in exports failed (500)");
    expect((error as Error).message).not.toContain(weddingId);
  });
});

describe("the real adapter without keys", () => {
  it("fails with a clear not_configured error", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    try {
      await expect(storage.stat("exports", `${weddingId}/card-rev2.png`)).rejects.toMatchObject({
        code: "not_configured",
        message: expect.stringContaining("SUPABASE_SERVICE_ROLE_KEY"),
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("isObjectNotFound", () => {
  it("tells a missing object from a missing bucket", () => {
    expect(isObjectNotFound({ code: "NoSuchKey", status: 404 })).toBe(true);
    expect(isObjectNotFound({ status: 400, statusCode: "404", message: "Object not found" })).toBe(true);
    expect(isObjectNotFound({ status: 404, statusCode: "404", message: "Bucket not found" })).toBe(false);
    expect(isObjectNotFound({ code: "NoSuchBucket", status: 404 })).toBe(false);
    expect(isObjectNotFound({ status: 500, message: "Internal" })).toBe(false);
    expect(isObjectNotFound(null)).toBe(false);
  });
});

describe("createSigningHelpers", () => {
  const photo = (overrides: Partial<AssetDto> = {}): AssetDto => ({
    asset_id: randomUUID(),
    seed_key: "AST-PHOTO",
    asset_kind: "couple_photo",
    storage_path: `${weddingId}/couple.jpg`,
    mime_type: "image/jpeg",
    bytes: 8,
    width: 2000,
    height: 1333,
    ...overrides,
  });

  it("signs the card at its fixed key for 10 minutes, saved as jashn-card-rev{n}.png", async () => {
    const fake = fakeStorage();
    const adapter = createStorageAdapter(fake.source);
    await adapter.upload("exports", `${weddingId}/card-rev3.png`, png, { content_type: "image/png" });
    const helpers = createSigningHelpers(adapter, { isConfigured: () => true });
    const url = await helpers.exportDownloadUrl({ wedding_id: weddingId, revision: 3, format: "png" });
    expect(url).toBe(`https://storage.invalid/sign/exports/${weddingId}/card-rev3.png?token=t&expires=600&download=jashn-card-rev3.png`);
    await expect(helpers.exportDownloadUrl({ wedding_id: weddingId, revision: 4, format: "png" })).rejects.toMatchObject({ code: "not_found" });
    await expect(helpers.exportDownloadUrl({ wedding_id: "not-a-uuid", revision: 3, format: "png" })).rejects.toMatchObject({
      code: "invalid_request",
    });
    await expect(helpers.exportDownloadUrl({ wedding_id: weddingId, revision: 0, format: "png" })).rejects.toMatchObject({
      code: "invalid_request",
    });
  });

  it("signs the couple photo for 10 minutes for members and 1 hour for guests", async () => {
    const fake = fakeStorage();
    const adapter = createStorageAdapter(fake.source);
    const asset = photo();
    await adapter.upload("uploads", asset.storage_path, png, { content_type: "image/jpeg" });
    const helpers = createSigningHelpers(adapter, { isConfigured: () => true });
    expect(await helpers.couplePhotoUrl(asset, "member")).toContain("expires=600");
    expect(await helpers.couplePhotoUrl(asset, "guest")).toContain("expires=3600");
    expect(await helpers.couplePhotoUrl(asset, "guest")).not.toContain("download=");
  });

  it("answers null when there is no photo to show", async () => {
    const helpers = createSigningHelpers(createStorageAdapter(fakeStorage().source), { isConfigured: () => true });
    expect(await helpers.couplePhotoUrl(null as unknown as AssetDto, "guest")).toBeNull();
    expect(await helpers.couplePhotoUrl(photo({ storage_path: "" }), "guest")).toBeNull();
    expect(await helpers.couplePhotoUrl(photo({ asset_kind: "other" as AssetDto["asset_kind"] }), "guest")).toBeNull();
    // The row exists but the file was never uploaded.
    expect(await helpers.couplePhotoUrl(photo(), "member")).toBeNull();
  });

  it("answers null for the photo while Storage isn't configured, without calling it", async () => {
    const fake = fakeStorage();
    const helpers = createSigningHelpers(createStorageAdapter(fake.source), { isConfigured: () => false });
    expect(await helpers.couplePhotoUrl(photo(), "guest")).toBeNull();
    expect(fake.calls).toHaveLength(0);
  });

  it("lets other Storage failures through for the photo", async () => {
    const source = () =>
      ({ createSignedUrl: async () => ({ data: null, error: { message: "Internal", status: 500 } }) }) as unknown as BucketApi;
    const helpers = createSigningHelpers(createStorageAdapter(source), { isConfigured: () => true });
    await expect(helpers.couplePhotoUrl(photo(), "member")).rejects.toMatchObject({ code: "storage_error" });
  });
});
