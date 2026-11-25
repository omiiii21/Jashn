import { randomUUID } from "node:crypto";

import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { CommandEnvelope } from "@/contracts/commands";
import type { CommandActor, GuestActor, SessionActor } from "@/contracts/domain";
import { SEED_KEYS } from "@/contracts/fixtures";
import type { StorageAdapter } from "@/contracts/services";
import { createDb, type Db } from "@/db/client";
import { activityEntries, assets, commandReceipts, members, weddings } from "@/db/schema";
import { localDatabaseUrl } from "@/db/testing";

import { createAddAssetHandler } from "./assets";
import { createDispatcher } from "./dispatcher";

/**
 * `add_asset` through the dispatcher against a local Postgres (D103, D120), on throwaway
 * `is_sample` weddings that the test deletes afterwards. Storage is faked: the stat answers
 * from an in-memory map of uploaded objects.
 */

const url = localDatabaseUrl();

let db: Db;
let close: () => Promise<void>;
const throwaway: string[] = [];

/** Uploaded objects by key in `uploads`, as the fake Storage sees them. */
const objects = new Map<string, number>();
const stat = vi.fn<StorageAdapter["stat"]>(async (_bucket, key) => {
  const bytes = objects.get(key);
  return bytes === undefined ? null : { bytes, content_type: "image/jpeg", updated_at: new Date().toISOString() };
});

type Wedding = { wedding_id: string; owner: SessionActor; manager: SessionActor };

async function makeWedding(): Promise<Wedding> {
  const wedding_id = randomUUID();
  throwaway.push(wedding_id);
  const owner_user = randomUUID();
  const manager_user = randomUUID();
  await db.insert(weddings).values({
    id: wedding_id,
    bride_name: "Test",
    groom_name: "Couple",
    wedding_date: "2027-01-10",
    is_sample: true,
    version: 7,
    draft_version: 3,
    created_by_user_id: owner_user,
  });
  const [owner, manager] = await db
    .insert(members)
    .values([
      { wedding_id, user_id: owner_user, role: "owner", display_name: "Mira" },
      { wedding_id, user_id: manager_user, role: "manager", display_name: "Diya" },
    ])
    .returning({ id: members.id });
  const actor = (user_id: string, member_id: string, role: "owner" | "manager", display_name: string): SessionActor => ({
    kind: "member",
    user_id,
    email: `${display_name.toLowerCase()}.${user_id.slice(0, 8)}@example.com`,
    display_name,
    wedding_id,
    member_id,
    role,
    is_internal: true,
    is_first_wedding: false,
    preferred_language: "en",
  });
  return {
    wedding_id,
    owner: actor(owner_user, owner.id, "owner", "Mira"),
    manager: actor(manager_user, manager.id, "manager", "Diya"),
  };
}

const dispatcher = () =>
  createDispatcher({
    db: () => db,
    registry: () => ({ add_asset: createAddAssetHandler({ stat }) }),
    schedule: () => {},
    voiceGate: async () => ({ status: "enabled" as const }),
    onSetupSaved: async () => {},
    afterCommit: {},
    log: () => {},
  });

function envelope(wedding_id: string, input: Record<string, unknown>, idempotency_key: string | null = null) {
  return { wedding_id, command: "add_asset", input, idempotency_key, source: "ui" } as unknown as CommandEnvelope<"add_asset">;
}

/** Stands in for the sign step and the browser's upload: a fresh id with its object stored. */
function uploaded(wedding_id: string, bytes = 2_400_000, ext = "jpg") {
  const asset_id = randomUUID();
  const key = `${wedding_id}/${asset_id}.${ext}`;
  objects.set(key, bytes);
  return { asset_id, key, bytes };
}

const photoInput = (asset_id: string, bytes: number, extra: Record<string, unknown> = {}) => ({
  asset_id,
  asset_kind: "couple_photo",
  mime_type: "image/jpeg",
  bytes,
  ...extra,
});

async function state(wedding_id: string) {
  const [row] = await db.select({ version: weddings.version, draft_version: weddings.draft_version }).from(weddings).where(eq(weddings.id, wedding_id));
  const entries = await db.select().from(activityEntries).where(eq(activityEntries.wedding_id, wedding_id));
  const rows = await db.select().from(assets).where(eq(assets.wedding_id, wedding_id));
  return { version: Number(row.version), draft_version: Number(row.draft_version), entries, rows };
}

describe.skipIf(!url)("add_asset (database)", () => {
  beforeAll(async () => {
    const created = createDb(url!, { max: 4 });
    db = created.db;
    close = () => created.client.end();
  }, 60_000);

  afterAll(async () => {
    if (!db) return;
    if (throwaway.length > 0) {
      await db.delete(commandReceipts).where(inArray(commandReceipts.wedding_id, throwaway));
      await db.delete(weddings).where(inArray(weddings.id, throwaway));
    }
    await close();
  }, 60_000);

  it("an owner's photo: one asset row, one members entry, one version bump, no draft bump (AT-7.1)", async () => {
    const w = await makeWedding();
    const photo = uploaded(w.wedding_id);
    const response = await dispatcher().runCommand(w.owner, envelope(w.wedding_id, photoInput(photo.asset_id, photo.bytes, { width: 1600, height: 2000 })));
    expect(response).toMatchObject({
      ok: true,
      outcome: "applied",
      version: 8,
      result: { asset_id: photo.asset_id, storage_path: photo.key, asset_kind: "couple_photo", bytes: photo.bytes, seed_key: null },
    });
    const after = await state(w.wedding_id);
    expect(after.version).toBe(8);
    expect(after.draft_version).toBe(3);
    expect(after.rows).toHaveLength(1);
    expect(after.rows[0]).toMatchObject({
      id: photo.asset_id,
      asset_kind: "couple_photo",
      storage_path: photo.key,
      mime_type: "image/jpeg",
      bytes: photo.bytes,
      width: 1600,
      height: 2000,
      uploaded_by_member_id: w.owner.member_id,
      seed_key: null,
    });
    // The key never carries the bucket name (5.5).
    expect(after.rows[0].storage_path.startsWith("uploads/")).toBe(false);
    expect(after.entries).toHaveLength(1);
    expect(after.entries[0]).toMatchObject({
      command: "add_asset",
      topic: "asset.added",
      entity_type: "asset",
      entity_id: photo.asset_id,
      actor_type: "member",
      actor_member_id: w.owner.member_id,
      actor_label: "Mira",
      summary_en: "Mira added a couple photo.",
      summary_hi: "Mira ने जोड़े की फ़ोटो जोड़ी।",
      visibility: "members",
      source: "ui",
      before: null,
    });
    expect(response.ok && response.activity_entry_id).toBe(after.entries[0].id);
  });

  it("a manager may add one too (permissions.ts: owner and manager)", async () => {
    const w = await makeWedding();
    const photo = uploaded(w.wedding_id, 812_345, "webp");
    const response = await dispatcher().runCommand(
      w.manager,
      envelope(w.wedding_id, photoInput(photo.asset_id, photo.bytes, { mime_type: "image/webp" })),
    );
    expect(response).toMatchObject({ ok: true, outcome: "applied", result: { storage_path: photo.key } });
    const after = await state(w.wedding_id);
    expect(after.rows[0].uploaded_by_member_id).toBe(w.manager.member_id);
    expect(after.entries[0]).toMatchObject({ actor_label: "Diya", summary_en: "Diya added a couple photo.", visibility: "members" });
  });

  it("refuses a missing object (404) and a wrong size (422), writing nothing", async () => {
    const w = await makeWedding();
    const before = await state(w.wedding_id);

    const missing = await dispatcher().runCommand(w.owner, envelope(w.wedding_id, photoInput(randomUUID(), 2_400_000)));
    expect(missing).toMatchObject({ ok: false, error: { code: "not_found", field: "asset_id" } });

    const photo = uploaded(w.wedding_id, 2_400_000);
    const wrongSize = await dispatcher().runCommand(w.owner, envelope(w.wedding_id, photoInput(photo.asset_id, 2_400_001), `asset-${randomUUID()}`));
    expect(wrongSize).toMatchObject({ ok: false, error: { code: "validation_failed", message: "unknown_value", field: "bytes" } });

    // A PNG declared for a JPEG upload looks for `.png`, which isn't there.
    const wrongType = await dispatcher().runCommand(w.owner, envelope(w.wedding_id, photoInput(photo.asset_id, photo.bytes, { mime_type: "image/png" })));
    expect(wrongType).toMatchObject({ ok: false, error: { code: "not_found" } });

    const after = await state(w.wedding_id);
    expect(after).toEqual({ ...before, entries: [], rows: [] });
    expect(after.version).toBe(before.version);
    expect(await db.select().from(commandReceipts).where(eq(commandReceipts.wedding_id, w.wedding_id))).toEqual([]);
  });

  it("applies the upload limits before Storage is asked: a GIF and over 10 MB are refused (AT-7.1)", async () => {
    const w = await makeWedding();
    stat.mockClear();
    const gif = await dispatcher().runCommand(w.owner, envelope(w.wedding_id, photoInput(randomUUID(), 1000, { mime_type: "image/gif" })));
    expect(gif).toMatchObject({ ok: false, error: { code: "validation_failed", message: "unknown_value", field: "mime_type" } });
    const big = await dispatcher().runCommand(w.owner, envelope(w.wedding_id, photoInput(randomUUID(), 10 * 1024 * 1024 + 1)));
    expect(big).toMatchObject({ ok: false, error: { code: "validation_failed", message: "out_of_range", field: "bytes" } });
    const scan = await dispatcher().runCommand(w.owner, envelope(w.wedding_id, photoInput(randomUUID(), 1000, { asset_kind: "invite_scan" })));
    expect(scan).toMatchObject({ ok: false, error: { code: "validation_failed", field: "asset_kind" } });
    expect(stat).not.toHaveBeenCalled();
    expect((await state(w.wedding_id)).rows).toEqual([]);
  });

  it("a key sent twice replays; the same asset under a new key is unchanged; neither writes again", async () => {
    const w = await makeWedding();
    const photo = uploaded(w.wedding_id);
    const key = `asset-${randomUUID()}`;
    const first = await dispatcher().runCommand(w.owner, envelope(w.wedding_id, photoInput(photo.asset_id, photo.bytes), key));
    expect(first).toMatchObject({ ok: true, outcome: "applied" });
    const replay = await dispatcher().runCommand(w.owner, envelope(w.wedding_id, photoInput(photo.asset_id, photo.bytes), key));
    expect(replay).toMatchObject({ ok: true, outcome: "replayed" });
    const resend = await dispatcher().runCommand(w.owner, envelope(w.wedding_id, photoInput(photo.asset_id, photo.bytes), `asset-${randomUUID()}`));
    expect(resend).toMatchObject({ ok: true, outcome: "unchanged", result: { asset_id: photo.asset_id } });
    const after = await state(w.wedding_id);
    expect(after.rows).toHaveLength(1);
    expect(after.entries).toHaveLength(1);
    expect(after.version).toBe(8);
  });

  it("two racing adds of one asset queue on the wedding lock: one applied, one unchanged", async () => {
    const w = await makeWedding();
    const photo = uploaded(w.wedding_id);
    const run = dispatcher();
    const results = await Promise.all([
      run.runCommand(w.owner, envelope(w.wedding_id, photoInput(photo.asset_id, photo.bytes), `asset-${randomUUID()}`)),
      run.runCommand(w.manager, envelope(w.wedding_id, photoInput(photo.asset_id, photo.bytes), `asset-${randomUUID()}`)),
    ]);
    expect(results.map((result) => (result.ok ? result.outcome : result.error.code)).sort()).toEqual(["applied", "unchanged"]);
    const after = await state(w.wedding_id);
    expect(after.rows).toHaveLength(1);
    expect(after.entries).toHaveLength(1);
    expect(after.version).toBe(8);
  });

  it("a new photo never touches the seeded one (D107): both rows stay", async () => {
    const w = await makeWedding();
    const seeded_id = randomUUID();
    await db.insert(assets).values({
      id: seeded_id,
      wedding_id: w.wedding_id,
      asset_kind: "couple_photo",
      storage_path: `${w.wedding_id}/${seeded_id}.jpg`,
      mime_type: "image/jpeg",
      bytes: 654_321,
      width: 1200,
      height: 1500,
      seed_key: SEED_KEYS.couple_photo,
    });
    const [seededBefore] = await db.select().from(assets).where(eq(assets.id, seeded_id));
    const photo = uploaded(w.wedding_id);
    expect(await dispatcher().runCommand(w.owner, envelope(w.wedding_id, photoInput(photo.asset_id, photo.bytes)))).toMatchObject({
      ok: true,
      outcome: "applied",
    });
    const [seededAfter] = await db.select().from(assets).where(eq(assets.id, seeded_id));
    expect(seededAfter).toEqual(seededBefore);
    expect((await state(w.wedding_id)).rows.map((row) => row.id).sort()).toEqual([photo.asset_id, seeded_id].sort());

    // Re-adding the seeded photo with other values is refused and changes nothing.
    objects.set(`${w.wedding_id}/${seeded_id}.jpg`, 1);
    const clash = await dispatcher().runCommand(w.owner, envelope(w.wedding_id, photoInput(seeded_id, 1)));
    expect(clash).toMatchObject({ ok: false, error: { code: "validation_failed", field: "asset_id" } });
    expect((await db.select().from(assets).where(eq(assets.id, seeded_id)))[0]).toEqual(seededBefore);
  });

  it("another wedding's asset id is 404, and a member of one wedding can't add to another", async () => {
    const a = await makeWedding();
    const b = await makeWedding();
    const photo = uploaded(a.wedding_id);
    await dispatcher().runCommand(a.owner, envelope(a.wedding_id, photoInput(photo.asset_id, photo.bytes)));
    // Same asset id in wedding b: the row belongs to a, so b's member learns nothing.
    objects.set(`${b.wedding_id}/${photo.asset_id}.jpg`, photo.bytes);
    const foreign = await dispatcher().runCommand(b.owner, envelope(b.wedding_id, photoInput(photo.asset_id, photo.bytes)));
    expect(foreign).toMatchObject({ ok: false, error: { code: "not_found", field: "asset_id" } });
    // Exactly what an id with nothing uploaded gets: the foreign id reveals nothing (5.0, AT-9.7).
    const unknown = await dispatcher().runCommand(b.owner, envelope(b.wedding_id, photoInput(randomUUID(), photo.bytes)));
    expect(foreign).toEqual(unknown);
    // a's owner on b's wedding: not a member there.
    const outsider = await dispatcher().runCommand({ ...a.owner, wedding_id: b.wedding_id }, envelope(b.wedding_id, photoInput(randomUUID(), 10)));
    expect(outsider).toMatchObject({ ok: false, error: { code: "forbidden" } });
    expect((await state(b.wedding_id)).rows).toEqual([]);
  });

  it("a removed member is refused, and a guest token never reaches the handler (404, D35)", async () => {
    const w = await makeWedding();
    stat.mockClear();
    await db.update(members).set({ removed_at: new Date() }).where(eq(members.id, w.manager.member_id!));
    const photo = uploaded(w.wedding_id);
    const removed = await dispatcher().runCommand(w.manager, envelope(w.wedding_id, photoInput(photo.asset_id, photo.bytes)));
    expect(removed).toMatchObject({ ok: false, error: { code: "forbidden" } });

    const guest: GuestActor = {
      kind: "guest",
      wedding_id: w.wedding_id,
      household_id: randomUUID(),
      household_name: "Bhat family",
      guest_ids: [randomUUID()],
      token_hash: "0".repeat(64),
    };
    const asGuest = await dispatcher().runCommand(guest as CommandActor, envelope(w.wedding_id, photoInput(photo.asset_id, photo.bytes)));
    expect(asGuest).toMatchObject({ ok: false, error: { code: "not_found" } });
    expect(stat).not.toHaveBeenCalled();
    const after = await state(w.wedding_id);
    expect(after.rows).toEqual([]);
    expect(after.entries).toEqual([]);
    expect(after.version).toBe(7);
  });
});
