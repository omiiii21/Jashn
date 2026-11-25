import { beforeEach, describe, expect, it, vi } from "vitest";

import { fixtureSessionActor } from "@/contracts/fixtures";

const mira = fixtureSessionActor("mira", "a");
const WEDDING = mira.wedding_id!;
const USER = { user_id: mira.user_id, email: mira.email };
const TARA_TOKEN = "q3Jv1lJ0n8kQm1uX2c7vR4pYtA9sD6fG0hK3wE5zB1c";

const getSignedInUser = vi.fn();
const loadMemberActor = vi.fn();
const isLiveAuth = vi.fn();
const signUploadForMember = vi.fn();
const fixtureSignUpload = vi.fn();

vi.mock("@/server/auth/session", () => ({
  getSignedInUser: (...args: unknown[]) => getSignedInUser(...args),
  loadMemberActor: (...args: unknown[]) => loadMemberActor(...args),
  isLiveAuth: () => isLiveAuth(),
}));
// The real request parser, a fake signer.
vi.mock("@/server/storage/uploads", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@/server/storage/uploads");
  return { ...actual, signUploadForMember: (...args: unknown[]) => signUploadForMember(...args) };
});
vi.mock("@/contracts/services", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@/contracts/services");
  return { ...actual, fixtureServices: { signUpload: (...args: unknown[]) => fixtureSignUpload(...args) } };
});

import { POST } from "./route";

const body = (fields: Record<string, unknown> = {}) =>
  JSON.stringify({ wedding_id: WEDDING, asset_kind: "couple_photo", mime_type: "image/jpeg", bytes: 2_400_000, ...fields });

function call(text: string, headers: Record<string, string> = {}) {
  return POST(
    new Request("http://localhost:3001/api/uploads/sign", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: text,
    }),
  );
}

const signed = {
  ok: true,
  asset_id: "6b0f6f7e-2f43-4d55-9d2a-0d5cbb0e2a11",
  bucket: "uploads",
  object_key: `${WEDDING}/6b0f6f7e-2f43-4d55-9d2a-0d5cbb0e2a11.jpg`,
  signed_upload_url: "https://storage.test/upload",
  token: "t0k",
  expires_at: "2026-11-25T10:00:00.000Z",
};

beforeEach(() => {
  getSignedInUser.mockReset().mockResolvedValue(USER);
  loadMemberActor.mockReset().mockResolvedValue(mira);
  isLiveAuth.mockReset().mockReturnValue(true);
  signUploadForMember.mockReset().mockResolvedValue(signed);
  fixtureSignUpload.mockReset().mockResolvedValue(signed);
});

describe("POST /api/uploads/sign", () => {
  it("signs a member's couple photo, answering JSON with no-store", async () => {
    const response = await call(body());
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual(signed);
    expect(loadMemberActor).toHaveBeenCalledWith(USER, WEDDING);
    expect(signUploadForMember).toHaveBeenCalledWith(mira, JSON.parse(body()));
  });

  it("answers 401 when signed out, before reading the body", async () => {
    getSignedInUser.mockResolvedValue(null);
    const response = await call("{bad json");
    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "unauthenticated" } });
    expect(signUploadForMember).not.toHaveBeenCalled();
  });

  it("never lets a guest link through: a token in a header or the body is no session (401)", async () => {
    getSignedInUser.mockResolvedValue(null);
    for (const response of [
      await call(body(), { Authorization: `Bearer ${TARA_TOKEN}` }),
      await call(body({ token: TARA_TOKEN })),
      await call(body(), { Cookie: `guest_token=${TARA_TOKEN}`, Referer: `http://localhost:3001/i/${TARA_TOKEN}` }),
    ]) {
      expect(response.status).toBe(401);
    }
    expect(loadMemberActor).not.toHaveBeenCalled();
    expect(signUploadForMember).not.toHaveBeenCalled();
  });

  it("answers 403 for a non-member, a removed member and a malformed wedding id", async () => {
    loadMemberActor.mockResolvedValueOnce(null);
    expect((await call(body())).status).toBe(403);
    expect((await call(body({ wedding_id: "not-a-uuid" }))).status).toBe(403);
    expect((await call(body({ wedding_id: 42 }))).status).toBe(403);
    expect(signUploadForMember).not.toHaveBeenCalled();
  });

  it("names a missing wedding id 422", async () => {
    const response = await call(body({ wedding_id: undefined }));
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: "validation_failed", message: "required", field: "wedding_id" } });
  });

  it("refuses a size in exponent form before JSON.parse (AT-5.6), and bad or oversized bodies", async () => {
    const exponent = await call(`{"wedding_id":"${WEDDING}","asset_kind":"couple_photo","mime_type":"image/jpeg","bytes":2.4e6}`);
    expect(exponent.status).toBe(422);
    expect(await exponent.json()).toMatchObject({ error: { code: "validation_failed", message: "not_integer", field: "bytes" } });
    expect((await call("[1]")).status).toBe(422);
    expect((await call("{bad")).status).toBe(422);
    const huge = await call(body({ padding: "x".repeat(5000) }));
    expect(huge.status).toBe(422);
    expect(await huge.json()).toMatchObject({ error: { message: "too_long" } });
    expect(signUploadForMember).not.toHaveBeenCalled();
  });

  it("refuses a GIF, over 10 MB, a text size and another kind next to the field, before any signer (AT-7.1)", async () => {
    const cases: [Record<string, unknown>, string, string][] = [
      [{ mime_type: "image/gif" }, "mime_type", "unknown_value"],
      [{ bytes: 10 * 1024 * 1024 + 1 }, "bytes", "out_of_range"],
      [{ bytes: "2400000" }, "bytes", "not_integer"],
      [{ asset_kind: "invite_scan" }, "asset_kind", "unknown_value"],
    ];
    for (const live of [true, false]) {
      isLiveAuth.mockReturnValue(live);
      for (const [fields, field, message] of cases) {
        const response = await call(body(fields));
        expect(response.status).toBe(422);
        expect(response.headers.get("Cache-Control")).toBe("no-store");
        expect(await response.json()).toEqual({ ok: false, error: { code: "validation_failed", message, field } });
      }
    }
    expect(signUploadForMember).not.toHaveBeenCalled();
    expect(fixtureSignUpload).not.toHaveBeenCalled();
  });

  it("passes the signer only the four request fields", async () => {
    await call(body({ token: TARA_TOKEN, object_key: "elsewhere/x.jpg" }));
    expect(signUploadForMember).toHaveBeenCalledWith(mira, JSON.parse(body()));
  });

  it("answers the signer's refusals with their status (a role check)", async () => {
    signUploadForMember.mockResolvedValueOnce({ ok: false, error: { code: "forbidden", message: "Not allowed for your role." } });
    const refused = await call(body());
    expect(refused.status).toBe(403);
    expect(await refused.json()).toMatchObject({ error: { code: "forbidden", field: null } });
  });

  it("answers the JSON 500 envelope when the database is down or the signer throws", async () => {
    loadMemberActor.mockRejectedValueOnce(new Error("connection refused"));
    const down = await call(body());
    expect(down.status).toBe(500);
    expect(await down.json()).toMatchObject({ ok: false, error: { code: "internal_error" } });

    signUploadForMember.mockRejectedValueOnce(new Error("boom"));
    expect((await call(body())).status).toBe(500);
  });

  it("answers from the fixture services until the keys land", async () => {
    isLiveAuth.mockReturnValue(false);
    expect((await call(body({ extra: "dropped" }))).status).toBe(200);
    expect(fixtureSignUpload).toHaveBeenCalledExactlyOnceWith(mira, JSON.parse(body()));
    expect(signUploadForMember).not.toHaveBeenCalled();
  });
});
