import { beforeEach, describe, expect, it, vi } from "vitest";

import { fixtureSessionActor } from "@/contracts/fixtures";

const mira = fixtureSessionActor("mira", "a");
const WEDDING = mira.wedding_id!;

const dispatch = vi.fn();
const requireMemberForApi = vi.fn();

vi.mock("@/server/services", () => ({ services: { dispatch: (...args: unknown[]) => dispatch(...args) } }));
vi.mock("@/server/authz/guard", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@/server/authz/guard");
  return { ...actual, requireMemberForApi: (...args: unknown[]) => requireMemberForApi(...args) };
});
vi.mock("@/server/auth/session", () => ({ getSignedInUser: vi.fn(), loadMemberActor: vi.fn() }));

import { POST } from "./route";

function call(command: string, body: string, headers: Record<string, string> = {}) {
  const request = new Request(`http://localhost:3001/api/w/${WEDDING}/commands/${command}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body,
  });
  return POST(request, { params: Promise.resolve({ wedding_id: WEDDING, command }) });
}

const applied = { ok: true, outcome: "applied", command: "correct_payment", result: {}, activity_entry_id: null, version: 2, warnings: [] };

beforeEach(() => {
  dispatch.mockReset().mockResolvedValue(applied);
  requireMemberForApi.mockReset().mockResolvedValue({ ok: true, actor: mira });
});

describe("POST /api/w/{wedding_id}/commands/{command}", () => {
  it("answers 401 for every command when signed out", async () => {
    requireMemberForApi.mockResolvedValue({
      ok: false,
      response: Response.json({ ok: false, error: { code: "unauthenticated" } }, { status: 401 }),
    });
    const response = await call("reset_demo", "{}");
    expect(response.status).toBe(401);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("refuses an amount in exponent form before parsing (AT-5.6)", async () => {
    const response = await call("correct_payment", '{"input":{"payment_id":"p","expected_version":1,"amount_inr":4e4}}');
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "validation_failed", field: "amount_inr" } });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("refuses 1.5E+3 too, but not an e inside a string or true/false", async () => {
    expect((await call("correct_payment", '{"input":{"amount_inr":1.5E+3}}')).status).toBe(422);
    const response = await call("correct_payment", '{"input":{"note":"4e4 is fine here","flag":true,"other":false,"amount_inr":40000}}');
    expect(response.status).toBe(200);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("builds the envelope from the path, with source ui by default", async () => {
    await call("correct_payment", JSON.stringify({ input: { amount_inr: 40000 }, idempotency_key: "a41f0000:0" }));
    expect(dispatch).toHaveBeenCalledWith(mira, {
      wedding_id: WEDDING,
      command: "correct_payment",
      input: { amount_inr: 40000 },
      idempotency_key: "a41f0000:0",
      source: "ui",
      voice_turn_id: null,
    });
  });

  it("takes the key from the Idempotency-Key header and never checks it as a UUID (I1)", async () => {
    await call("correct_payment", JSON.stringify({ input: {} }), { "Idempotency-Key": "proposal:not-a-uuid" });
    expect(dispatch.mock.calls[0][1]).toMatchObject({ idempotency_key: "proposal:not-a-uuid" });
  });

  it("refuses a key shorter than 8 or longer than 200 characters, or two keys that differ", async () => {
    expect((await call("correct_payment", JSON.stringify({ input: {}, idempotency_key: "short" }))).status).toBe(422);
    expect((await call("correct_payment", JSON.stringify({ input: {}, idempotency_key: "k".repeat(201) }))).status).toBe(422);
    const twoKeys = await call("correct_payment", JSON.stringify({ input: {}, idempotency_key: "key-one-1" }), { "Idempotency-Key": "key-two-2" });
    expect(twoKeys.status).toBe(422);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("refuses a body whose wedding or command disagrees with the path, and other sources", async () => {
    expect((await call("correct_payment", JSON.stringify({ input: {}, command: "record_payment" }))).status).toBe(422);
    expect((await call("correct_payment", JSON.stringify({ input: {}, wedding_id: "0b7c6e1a-2222-4222-8222-222222222222" }))).status).toBe(422);
    expect((await call("correct_payment", JSON.stringify({ input: {}, source: "nudgebee" }))).status).toBe(422);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("answers 404 for an unknown command and 422 for malformed JSON", async () => {
    expect((await call("drop_tables", "{}")).status).toBe(404);
    expect((await call("correct_payment", "{not json")).status).toBe(422);
  });

  it("uses the dispatcher's status for its answer", async () => {
    dispatch.mockResolvedValue({ ok: false, error: { code: "approval_required", message: "x" } });
    expect((await call("record_payment", JSON.stringify({ input: {} }))).status).toBe(403);
    dispatch.mockResolvedValue({ ...applied, outcome: "proposed" });
    expect((await call("propose_change", JSON.stringify({ input: {} }))).status).toBe(202);
  });
});
