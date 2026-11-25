import { describe, expect, it, vi } from "vitest";

import type { UploadSignRequest } from "@/contracts/api";
import type { GuestActor, SessionActor } from "@/contracts/domain";
import { fixtureGuestActor, fixtureSessionActor } from "@/contracts/fixtures";

import { StorageAdapterError } from "./index";
import { UPLOAD_EXTENSIONS, createUploadSigner, parseUploadSignRequest, uploadObjectKey } from "./uploads";

const mira = fixtureSessionActor("mira", "a");
const diya = fixtureSessionActor("diya", "a");
const WEDDING = mira.wedding_id!;
const OTHER_WEDDING = fixtureSessionActor("mira", "b").wedding_id!;
const ASSET = "6b0f6f7e-2f43-4d55-9d2a-0d5cbb0e2a11";

function setup(options: { fail?: Error } = {}) {
  const signedUploadUrl = vi.fn(async (_bucket: "uploads", object_key: string) => {
    if (options.fail) throw options.fail;
    return {
      signed_url: `https://storage.test/object/upload/sign/uploads/${object_key}?token=t0k`,
      token: "t0k",
      expires_at: "2026-11-25T10:00:00.000Z",
    };
  });
  const log = vi.fn();
  const sign = createUploadSigner({ storage: { signedUploadUrl }, newAssetId: () => ASSET, log });
  return { sign, signedUploadUrl, log };
}

const request = (fields: Partial<Record<keyof UploadSignRequest, unknown>> = {}) =>
  ({ wedding_id: WEDDING, asset_kind: "couple_photo", mime_type: "image/jpeg", bytes: 2_400_000, ...fields }) as UploadSignRequest;

describe("uploadObjectKey", () => {
  it("is {wedding_id}/{asset_id}.{ext}, without the bucket name", () => {
    expect(uploadObjectKey(WEDDING, ASSET, "image/jpeg")).toBe(`${WEDDING}/${ASSET}.jpg`);
    expect(uploadObjectKey(WEDDING, ASSET, "image/png")).toBe(`${WEDDING}/${ASSET}.png`);
    expect(uploadObjectKey(WEDDING, ASSET, "image/webp")).toBe(`${WEDDING}/${ASSET}.webp`);
    expect(Object.keys(UPLOAD_EXTENSIONS)).toEqual(["image/jpeg", "image/png", "image/webp"]);
  });
});

describe("signUploadForMember", () => {
  it("signs an owner's couple photo in bucket uploads at the minted key", async () => {
    const { sign, signedUploadUrl } = setup();
    const response = await sign(mira, request());
    expect(response).toEqual({
      ok: true,
      asset_id: ASSET,
      bucket: "uploads",
      object_key: `${WEDDING}/${ASSET}.jpg`,
      signed_upload_url: `https://storage.test/object/upload/sign/uploads/${WEDDING}/${ASSET}.jpg?token=t0k`,
      token: "t0k",
      expires_at: "2026-11-25T10:00:00.000Z",
    });
    expect(signedUploadUrl).toHaveBeenCalledExactlyOnceWith("uploads", `${WEDDING}/${ASSET}.jpg`);
  });

  it("signs a manager's too: add_asset is owner and manager (permissions.ts)", async () => {
    const { sign } = setup();
    expect(await sign(diya, request({ mime_type: "image/webp" }))).toMatchObject({ ok: true, object_key: `${WEDDING}/${ASSET}.webp` });
  });

  it("refuses 403 for another wedding, a user with no membership and a removed-style actor, and signs nothing", async () => {
    const { sign, signedUploadUrl } = setup();
    const noWedding: SessionActor = { ...mira, wedding_id: null, member_id: null, role: null };
    const noRole: SessionActor = { ...mira, role: null };
    for (const [actor, body] of [
      [mira, request({ wedding_id: OTHER_WEDDING })],
      [noWedding, request()],
      [noRole, request()],
      [mira, request({ wedding_id: "not-a-uuid" })],
    ] as const) {
      expect(await sign(actor, body)).toMatchObject({ ok: false, error: { code: "forbidden", field: null } });
    }
    expect(signedUploadUrl).not.toHaveBeenCalled();
  });

  it("answers a guest actor 404, never 403 (D35)", async () => {
    const { sign, signedUploadUrl } = setup();
    const guest: GuestActor = fixtureGuestActor("a");
    const response = await sign(guest as unknown as SessionActor, request());
    expect(response).toMatchObject({ ok: false, error: { code: "not_found" } });
    expect(signedUploadUrl).not.toHaveBeenCalled();
  });

  it("applies the upload limits: a GIF, over 10 MB, empty, fractional or text sizes and other kinds are refused (AT-7.1)", async () => {
    const { sign, signedUploadUrl } = setup();
    const cases: [Partial<Record<keyof UploadSignRequest, unknown>>, string, string][] = [
      [{ mime_type: "image/gif" }, "mime_type", "unknown_value"],
      // The contract's enum says `unknown_value` for a missing type too, as the dispatcher does.
      [{ mime_type: undefined }, "mime_type", "unknown_value"],
      [{ bytes: 10 * 1024 * 1024 + 1 }, "bytes", "out_of_range"],
      [{ bytes: 0 }, "bytes", "out_of_range"],
      [{ bytes: 1.5 }, "bytes", "not_integer"],
      [{ bytes: "2400000" }, "bytes", "not_integer"],
      [{ bytes: undefined }, "bytes", "required"],
      [{ asset_kind: "invite_scan" }, "asset_kind", "unknown_value"],
    ];
    for (const [fields, field, message] of cases) {
      expect(await sign(mira, request(fields))).toEqual({ ok: false, error: { code: "validation_failed", message, field } });
    }
    expect(signedUploadUrl).not.toHaveBeenCalled();
  });

  it("takes exactly 10 MB", async () => {
    const { sign } = setup();
    expect(await sign(mira, request({ bytes: 10 * 1024 * 1024 }))).toMatchObject({ ok: true });
  });

  it("answers internal_error when Storage fails, and logs no key or URL", async () => {
    const { sign, log } = setup({ fail: new StorageAdapterError("not_configured", "Supabase Storage is not configured") });
    expect(await sign(mira, request())).toEqual({
      ok: false,
      error: { code: "internal_error", message: "The upload couldn't start. Try again.", field: null },
    });
    expect(log).toHaveBeenCalledWith("upload sign failed", { error: "StorageAdapterError", code: "not_configured" });
    expect(JSON.stringify(log.mock.calls)).not.toContain(ASSET);
  });
});

describe("parseUploadSignRequest", () => {
  it("drops unknown fields and keeps the four", () => {
    expect(parseUploadSignRequest({ ...request(), extra: "x" })).toEqual({ ok: true, request: request() });
  });
});
