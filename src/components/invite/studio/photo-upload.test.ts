import { afterEach, describe, expect, it, vi } from "vitest";
import { UPLOAD_MAX_BYTES } from "@/contracts/api";
import { commandSchemas } from "@/contracts/commands";
import {
  addAssetInput,
  checkPhotoFile,
  isFixtureUploadUrl,
  PHOTO_ACCEPT,
  PHOTO_ERROR_TEXT,
  putSignedUpload,
  signPhotoUpload,
  uploadFailureText,
} from "./photo-upload";

const ASSET_ID = "0b8d4f6a-2c1e-4d3b-8a9f-7e6d5c4b3a21";

describe("checkPhotoFile (AT-7.1 upload limits)", () => {
  it("refuses a GIF and a HEIC by type", () => {
    expect(checkPhotoFile({ type: "image/gif", size: 1000 })).toEqual({ ok: false, reason: "type" });
    expect(checkPhotoFile({ type: "image/heic", size: 1000 })).toEqual({ ok: false, reason: "type" });
    expect(checkPhotoFile({ type: "", size: 1000 })).toEqual({ ok: false, reason: "type" });
  });

  it("accepts JPEG, PNG and WebP from 1 byte to exactly 10 MB", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp"]) {
      expect(checkPhotoFile({ type, size: 1 })).toEqual({ ok: true, mime_type: type });
      expect(checkPhotoFile({ type, size: UPLOAD_MAX_BYTES })).toEqual({ ok: true, mime_type: type });
    }
  });

  it("refuses 10 MB + 1 byte, and an empty file", () => {
    expect(checkPhotoFile({ type: "image/jpeg", size: UPLOAD_MAX_BYTES + 1 })).toEqual({ ok: false, reason: "size" });
    expect(checkPhotoFile({ type: "image/jpeg", size: 0 })).toEqual({ ok: false, reason: "empty" });
  });

  it("never offers a GIF in the picker", () => {
    expect(PHOTO_ACCEPT).toBe("image/jpeg,image/png,image/webp");
    expect(PHOTO_ACCEPT).not.toContain("gif");
  });
});

describe("addAssetInput", () => {
  it("builds a valid add_asset input with the measured size", () => {
    const input = addAssetInput(ASSET_ID, "image/jpeg", 482_113, { width: 1200, height: 1500 });
    expect(input).toEqual({
      asset_id: ASSET_ID,
      asset_kind: "couple_photo",
      mime_type: "image/jpeg",
      bytes: 482_113,
      width: 1200,
      height: 1500,
    });
    expect(commandSchemas.add_asset.safeParse(input).success).toBe(true);
  });

  it("leaves out an unknown or out-of-range size", () => {
    expect(addAssetInput(ASSET_ID, "image/png", 10, null)).not.toHaveProperty("width");
    const huge = addAssetInput(ASSET_ID, "image/png", 10, { width: 30_000, height: 100 });
    expect(huge).not.toHaveProperty("width");
    expect(huge).not.toHaveProperty("height");
    expect(commandSchemas.add_asset.safeParse(huge).success).toBe(true);
  });
});

describe("upload failures", () => {
  it("turns validation words into the field's words", () => {
    expect(uploadFailureText({ code: "validation_failed", message: "out_of_range", field: "bytes" })).toBe(
      PHOTO_ERROR_TEXT.size,
    );
    expect(uploadFailureText({ code: "validation_failed", message: "unknown_value", field: "mime_type" })).toBe(
      PHOTO_ERROR_TEXT.type,
    );
    expect(uploadFailureText({ code: "internal_error", message: "internal_error" })).toBe(PHOTO_ERROR_TEXT.upload);
    expect(uploadFailureText({ code: "not_found", message: "Wedding not found." })).toBe("Wedding not found.");
  });

  it("recognises the fixture signer's URLs only", () => {
    expect(isFixtureUploadUrl("https://fixtures.invalid/storage/uploads/w/a.jpg")).toBe(true);
    expect(isFixtureUploadUrl("https://abc.supabase.co/storage/v1/object/upload/sign/uploads/w/a.jpg")).toBe(false);
    expect(isFixtureUploadUrl("not a url")).toBe(false);
  });
});

describe("the sign and upload requests", () => {
  afterEach(() => vi.unstubAllGlobals());

  const request = { wedding_id: "w", asset_kind: "couple_photo", mime_type: "image/jpeg", bytes: 10 } as const;

  it("passes the route's JSON answer through, ok or not", async () => {
    const answer = { ok: false, error: { code: "forbidden", message: "Not allowed for your role." } };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(answer), { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await signPhotoUpload(request)).toEqual(answer);
    expect(fetchMock).toHaveBeenCalledWith("/api/uploads/sign", expect.objectContaining({ method: "POST" }));
  });

  it("says uploads aren't on yet when the route is missing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>Not found</html>", { status: 404 })));
    const result = await signPhotoUpload(request);
    expect(result).toEqual({ ok: false, error: { code: "internal_error", message: PHOTO_ERROR_TEXT.unavailable } });
  });

  it("PUTs the file to a real signed URL and skips the fixture signer's", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const file = new Blob(["x"], { type: "image/jpeg" });
    expect(await putSignedUpload("https://fixtures.invalid/storage/uploads/w/a.jpg", file, "image/jpeg")).toEqual({ ok: true });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await putSignedUpload("https://x.supabase.co/storage/v1/object/upload/sign/uploads/w/a.jpg?token=t", file, "image/jpeg")).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://x.supabase.co/storage/v1/object/upload/sign/uploads/w/a.jpg?token=t",
      expect.objectContaining({ method: "PUT", body: file }),
    );
  });
});
