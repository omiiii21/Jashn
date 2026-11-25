import { describe, expect, it, vi } from "vitest";

import { CommandFailure, commandSchemas, type CommandEnvelope } from "@/contracts/commands";
import type { CommandActor, SessionActor } from "@/contracts/domain";
import { fixtureGuestActor, fixtureSessionActor } from "@/contracts/fixtures";
import type { CommandHandlerContext, StorageAdapter } from "@/contracts/services";
import type { Tx } from "@/db/client";

import { addedAssetActivity, assetFromInput, createAddAssetHandler, sameAsset, type StoredAsset } from "./assets";

const mira = fixtureSessionActor("mira", "a");
const diya = fixtureSessionActor("diya", "a");
const WEDDING = mira.wedding_id!;
const ASSET = "6b0f6f7e-2f43-4d55-9d2a-0d5cbb0e2a11";
const KEY = `${WEDDING}/${ASSET}.jpg`;
const NOW = "2026-11-25T08:30:00.000Z";

type Input = CommandHandlerContext<"add_asset", Tx>["input"];
const input = (fields: Partial<Input> = {}): Input =>
  commandSchemas.add_asset.parse({ asset_id: ASSET, asset_kind: "couple_photo", mime_type: "image/jpeg", bytes: 2_400_000, ...fields });

/** Just enough of a Drizzle transaction: one select chain answering `rows`, and recorded inserts. */
function fakeTx(rows: StoredAsset[] = []) {
  const inserted: Record<string, unknown>[] = [];
  const tx = {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => rows }) }) }),
    insert: () => ({
      values: async (value: Record<string, unknown>) => {
        inserted.push(value);
      },
    }),
  };
  return { tx: tx as unknown as Tx, inserted };
}

function context(actor: CommandActor, tx: Tx, fields: Partial<Input> = {}): CommandHandlerContext<"add_asset", Tx> {
  const parsed = input(fields);
  return {
    command: "add_asset",
    actor,
    wedding_id: WEDDING,
    input: parsed,
    envelope: { wedding_id: WEDDING, command: "add_asset", input: parsed, source: "ui" } as CommandEnvelope<"add_asset">,
    tx,
    now: NOW,
  };
}

function statOf(object: { bytes: number } | null): ReturnType<typeof vi.fn<StorageAdapter["stat"]>> {
  return vi.fn<StorageAdapter["stat"]>(async () => (object ? { bytes: object.bytes, content_type: "image/jpeg", updated_at: NOW } : null));
}

async function failureOf(promise: Promise<unknown>): Promise<CommandFailure> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof CommandFailure) return error;
    throw error;
  }
  throw new Error("expected a CommandFailure");
}

describe("add_asset pure parts", () => {
  it("builds the row with the key {wedding_id}/{asset_id}.{ext} and no seed key", () => {
    expect(assetFromInput(WEDDING, input({ mime_type: "image/png", width: 1600, height: 2000 }))).toEqual({
      asset_id: ASSET,
      wedding_id: WEDDING,
      seed_key: null,
      asset_kind: "couple_photo",
      storage_path: `${WEDDING}/${ASSET}.png`,
      mime_type: "image/png",
      bytes: 2_400_000,
      width: 1600,
      height: 2000,
    });
  });

  it("writes the 3.2 template, members visibility, no before", () => {
    const asset = assetFromInput(WEDDING, input({ width: 1600 }));
    expect(addedAssetActivity({ actor_label: "Diya", asset })).toEqual({
      topic: "asset.added",
      entity_type: "asset",
      entity_id: ASSET,
      summary_en: "Diya added a couple photo.",
      summary_hi: "Diya ने जोड़े की फ़ोटो जोड़ी।",
      before: null,
      after: { asset_kind: "couple_photo", mime_type: "image/jpeg", bytes: 2_400_000, width: 1600 },
      visibility: "members",
    });
  });

  it("matches a resend, ignoring dimensions the resend leaves out", () => {
    const stored = assetFromInput(WEDDING, input({ width: 1600, height: 2000 }));
    expect(sameAsset(stored, assetFromInput(WEDDING, input()), input())).toBe(true);
    expect(sameAsset(stored, assetFromInput(WEDDING, input({ width: 1600 })), input({ width: 1600 }))).toBe(true);
    expect(sameAsset(stored, assetFromInput(WEDDING, input({ width: 1200 })), input({ width: 1200 }))).toBe(false);
    expect(sameAsset(stored, assetFromInput(WEDDING, input({ bytes: 5 })), input({ bytes: 5 }))).toBe(false);
  });
});

describe("add_asset handler", () => {
  it("checks the object at its key and inserts the row as the uploader", async () => {
    const { tx, inserted } = fakeTx();
    const stat = statOf({ bytes: 2_400_000 });
    const handled = await createAddAssetHandler({ stat })(context(diya, tx, { width: 1600, height: 2000 }));
    expect(stat).toHaveBeenCalledExactlyOnceWith("uploads", KEY);
    expect(handled.outcome).toBe("applied");
    expect(handled.bumps_draft_version).toBe(false);
    expect(handled.result).toMatchObject({ asset_id: ASSET, storage_path: KEY, bytes: 2_400_000, seed_key: null });
    expect(handled.activity?.summary_en).toBe("Diya added a couple photo.");
    expect(inserted).toEqual([
      {
        id: ASSET,
        wedding_id: WEDDING,
        asset_kind: "couple_photo",
        storage_path: KEY,
        mime_type: "image/jpeg",
        bytes: 2_400_000,
        width: 1600,
        height: 2000,
        uploaded_by_member_id: diya.member_id,
        created_at: new Date(NOW),
        updated_at: new Date(NOW),
      },
    ]);
  });

  it("refuses a missing object with 404 not_found and a wrong size with validation_failed, writing nothing", async () => {
    const missing = fakeTx();
    const notThere = await failureOf(createAddAssetHandler({ stat: statOf(null) })(context(mira, missing.tx)));
    expect(notThere.body).toMatchObject({ code: "not_found", field: "asset_id" });
    expect(notThere.http_status).toBe(404);
    expect(missing.inserted).toEqual([]);

    const wrong = fakeTx();
    const wrongSize = await failureOf(createAddAssetHandler({ stat: statOf({ bytes: 2_399_999 }) })(context(mira, wrong.tx)));
    expect(wrongSize.body).toEqual({ code: "validation_failed", message: "unknown_value", field: "bytes" });
    expect(wrong.inserted).toEqual([]);
  });

  it("answers unchanged for the same asset again, without asking Storage", async () => {
    const stored = assetFromInput(WEDDING, input());
    const { tx, inserted } = fakeTx([stored]);
    const stat = statOf({ bytes: 2_400_000 });
    const handled = await createAddAssetHandler({ stat })(context(mira, tx));
    expect(handled).toMatchObject({ outcome: "unchanged", activity: null, result: { asset_id: ASSET } });
    expect(stat).not.toHaveBeenCalled();
    expect(inserted).toEqual([]);
  });

  it("refuses an asset id another wedding holds (404) and a different resend (422)", async () => {
    const elsewhere = { ...assetFromInput(WEDDING, input()), wedding_id: fixtureSessionActor("mira", "b").wedding_id! };
    const foreignStat = statOf({ bytes: 1 });
    const foreign = await failureOf(createAddAssetHandler({ stat: foreignStat })(context(mira, fakeTx([elsewhere]).tx)));
    expect(foreign.body).toMatchObject({ code: "not_found", field: "asset_id" });
    expect(foreignStat).not.toHaveBeenCalled();
    // The very body an unknown id with no upload gets, so the foreign id reveals nothing (5.0).
    const unknown = await failureOf(createAddAssetHandler({ stat: statOf(null) })(context(mira, fakeTx().tx)));
    expect(foreign.body).toEqual(unknown.body);
    expect(foreign.http_status).toBe(unknown.http_status);

    const seeded = { ...assetFromInput(WEDDING, input()), seed_key: "ASSET-PHOTO", bytes: 812_345 };
    const differs = await failureOf(createAddAssetHandler({ stat: statOf({ bytes: 1 }) })(context(mira, fakeTx([seeded]).tx)));
    expect(differs.body).toMatchObject({ code: "validation_failed", field: "asset_id" });
  });

  it("answers a guest 404 and the ops token 403 before touching the database or Storage", async () => {
    const stat = statOf({ bytes: 2_400_000 });
    const handler = createAddAssetHandler({ stat });
    const untouched = { select: () => { throw new Error("no reads"); }, insert: () => { throw new Error("no writes"); } } as unknown as Tx;
    expect((await failureOf(handler(context(fixtureGuestActor("a"), untouched)))).body.code).toBe("not_found");
    const system: CommandActor = { kind: "system", label: "NudgeBee" };
    expect((await failureOf(handler(context(system, untouched)))).body.code).toBe("forbidden");
    const outsider: SessionActor = { ...mira, wedding_id: fixtureSessionActor("mira", "b").wedding_id! };
    expect((await failureOf(handler(context(outsider, untouched)))).body.code).toBe("forbidden");
    expect(stat).not.toHaveBeenCalled();
  });

  it("gives up on a Storage check that hangs, so the wedding lock is held only briefly", async () => {
    const { tx, inserted } = fakeTx();
    const stat = vi.fn<StorageAdapter["stat"]>(() => new Promise(() => {}));
    await expect(createAddAssetHandler({ stat, statTimeoutMs: 20 })(context(mira, tx))).rejects.toMatchObject({
      name: "StorageAdapterError",
      code: "storage_error",
    });
    expect(inserted).toEqual([]);
  });
});
