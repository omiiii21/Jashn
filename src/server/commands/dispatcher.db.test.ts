import { createHash, randomUUID } from "node:crypto";

import { and, eq, inArray, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import type { CommandEnvelope, CommandResponse } from "@/contracts/commands";
import type { GuestActor, SessionActor } from "@/contracts/domain";
import type { SetupSavedInput } from "@/contracts/flags";
import type { HandlerMap } from "@/contracts/services";
import { createDb } from "@/db/client";
import { activityEntries, commandReceipts, guests, households, invitationLinks, members, venues, weddings } from "@/db/schema";

import { assertSameWedding, createDispatcher } from "./dispatcher";
import { getHandlerRegistry } from "./registry";

/**
 * The dispatcher against a real Postgres (D103). Every test makes its own wedding with a
 * random user, so it never depends on (or disturbs) what else is in the database.
 * Run: DATABASE_URL=… RUN_DB_TESTS=1 npx vitest run src/server/commands/dispatcher.db.test.ts
 */

const { db, client } = createDb(process.env.DATABASE_URL ?? "", { max: 6 });
const created: string[] = [];
const pending: Promise<void>[] = [];
const setupSaved: SetupSavedInput[] = [];

function dispatcherWith(overrides: Parameters<typeof createDispatcher>[0] = {}) {
  return createDispatcher({
    db: () => db,
    schedule: (task) => {
      pending.push(task());
    },
    voiceGate: async () => ({ status: "enabled" }),
    onSetupSaved: async (input) => {
      setupSaved.push(input);
    },
    afterCommit: {},
    log: (message, detail) => { if (process.env.DEBUG_DISPATCH) console.error(message, detail); },
    ...overrides,
  });
}

const dispatcher = dispatcherWith();

function newUser(name = "Tess"): SessionActor {
  return {
    kind: "member",
    user_id: randomUUID(),
    email: `${name.toLowerCase()}.${randomUUID().slice(0, 8)}@example.com`,
    display_name: name,
    wedding_id: null,
    member_id: null,
    role: null,
    is_internal: true,
    is_first_wedding: true,
    preferred_language: "en",
  };
}

function profileEnvelope(wedding_id: string | null, input: Record<string, unknown>, key: string | null): CommandEnvelope<"set_wedding_profile"> {
  return { wedding_id, command: "set_wedding_profile", input, idempotency_key: key, source: "ui" } as CommandEnvelope<"set_wedding_profile">;
}

async function createWedding(user: SessionActor, key: string = randomUUID()) {
  const response = await dispatcher.runCommand(
    user,
    profileEnvelope(null, { bride_name: "Asha", groom_name: "Ravi", wedding_date: "2026-12-14", city: "Bengaluru" }, key),
  );
  if (!response.ok) throw new Error(`create failed: ${response.error.code}`);
  const result = response.result as { wedding_id: string; member_id: string };
  created.push(result.wedding_id);
  const owner: SessionActor = { ...user, wedding_id: result.wedding_id, member_id: result.member_id, role: "owner" };
  return { response, wedding_id: result.wedding_id, owner };
}

async function versionOf(wedding_id: string): Promise<number> {
  const rows = await db.select({ version: weddings.version }).from(weddings).where(eq(weddings.id, wedding_id));
  return Number(rows[0].version);
}

async function activityCount(wedding_id: string): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)::bigint` })
    .from(activityEntries)
    .where(eq(activityEntries.wedding_id, wedding_id));
  return Number(rows[0].n);
}

function outcomeOf(response: CommandResponse): string {
  return response.ok ? response.outcome : response.error.code;
}

afterAll(async () => {
  await Promise.allSettled(pending);
  if (created.length > 0) await db.delete(weddings).where(inArray(weddings.id, created));
  await client.end();
});

describe("set_wedding_profile through the dispatcher", () => {
  it("creates the wedding with one activity entry and version 1, then replays the same key", async () => {
    const user = newUser();
    const key = `create-${randomUUID()}`;
    const { response, wedding_id, owner } = await createWedding(user, key);
    expect(response).toMatchObject({ ok: true, outcome: "applied", version: 1 });
    expect(response.ok && response.activity_entry_id).toBeTruthy();
    expect(await versionOf(wedding_id)).toBe(1);

    const entries = await db
      .select({ actor_member_id: activityEntries.actor_member_id, topic: activityEntries.topic, key: activityEntries.idempotency_key })
      .from(activityEntries)
      .where(eq(activityEntries.wedding_id, wedding_id));
    expect(entries).toEqual([{ actor_member_id: owner.member_id, topic: "wedding.created", key }]);

    const again = await dispatcher.runCommand(
      user,
      profileEnvelope(null, { bride_name: "Asha", groom_name: "Ravi", wedding_date: "2026-12-14", city: "Bengaluru" }, key),
    );
    expect(again).toMatchObject({ ok: true, outcome: "replayed", version: 1 });
    expect(again.ok && (again.result as { wedding_id: string }).wedding_id).toBe(wedding_id);
    const mine = await db.select({ id: weddings.id }).from(weddings).where(eq(weddings.created_by_user_id, user.user_id));
    expect(mine).toHaveLength(1);

    await Promise.allSettled(pending);
    expect(setupSaved.some((hook) => hook.wedding_id === wedding_id && hook.is_create && hook.outcome === "applied")).toBe(true);
  });

  it("replays a create resent after the user became its owner (I2, AT-2.9)", async () => {
    const user = newUser();
    const key = `setup-${randomUUID()}`;
    const { wedding_id, owner } = await createWedding(user, key);
    // A retry whose actor now carries the new membership (getSession() after the commit).
    const again = await dispatcher.runCommand(
      owner,
      profileEnvelope(null, { bride_name: "Asha", groom_name: "Ravi", wedding_date: "2026-12-14", city: "Bengaluru" }, key),
    );
    expect(again).toMatchObject({ ok: true, outcome: "replayed", version: 1 });
    expect(again.ok && (again.result as { wedding_id: string }).wedding_id).toBe(wedding_id);
    expect(await activityCount(wedding_id)).toBe(1);
  });

  it("requires a key on create", async () => {
    const response = await dispatcher.runCommand(
      newUser(),
      profileEnvelope(null, { bride_name: "A", groom_name: "B", wedding_date: "2026-12-14" }, null),
    );
    expect(response).toMatchObject({ ok: false, error: { code: "validation_failed", field: "idempotency_key" } });
  });

  it("applies an update once, replays the same key, and refuses the key with another input", async () => {
    const { wedding_id, owner } = await createWedding(newUser());
    const key = `upd:${randomUUID()}:0`;

    const first = await dispatcher.runCommand(owner, profileEnvelope(wedding_id, { city: "Mysuru" }, key));
    expect(first).toMatchObject({ ok: true, outcome: "applied", version: 2 });
    const second = await dispatcher.runCommand(owner, profileEnvelope(wedding_id, { city: "Mysuru" }, key));
    expect(second).toMatchObject({ ok: true, outcome: "replayed", version: 2 });
    expect(await versionOf(wedding_id)).toBe(2);
    expect(await activityCount(wedding_id)).toBe(2);

    const reused = await dispatcher.runCommand(owner, profileEnvelope(wedding_id, { city: "Pune" }, key));
    expect(reused).toMatchObject({ ok: false, error: { code: "idempotency_key_reused" } });
    expect(await versionOf(wedding_id)).toBe(2);
  });

  it("answers unchanged with a receipt but no activity and no version bump", async () => {
    const { wedding_id, owner } = await createWedding(newUser());
    const key = randomUUID();
    const response = await dispatcher.runCommand(owner, profileEnvelope(wedding_id, { city: "Bengaluru" }, key));
    expect(response).toMatchObject({ ok: true, outcome: "unchanged", version: 1, activity_entry_id: null });
    expect(await versionOf(wedding_id)).toBe(1);
    expect(await activityCount(wedding_id)).toBe(1);
    const receipts = await db.select({ outcome: commandReceipts.outcome }).from(commandReceipts).where(eq(commandReceipts.idempotency_key, key));
    expect(receipts).toEqual([{ outcome: "unchanged" }]);
  });

  it("lets two concurrent same-key updates end as one applied and one replayed, never a 500", async () => {
    const { wedding_id, owner } = await createWedding(newUser());
    const key = randomUUID();
    const responses = await Promise.all([
      dispatcher.runCommand(owner, profileEnvelope(wedding_id, { city: "Udaipur" }, key)),
      dispatcher.runCommand(owner, profileEnvelope(wedding_id, { city: "Udaipur" }, key)),
    ]);
    expect(responses.map(outcomeOf).sort()).toEqual(["applied", "replayed"]);
    expect(await versionOf(wedding_id)).toBe(2);
    expect(await activityCount(wedding_id)).toBe(2);
  });

  it("lets two concurrent same-key creates make one wedding", async () => {
    const user = newUser();
    const key = randomUUID();
    const input = { bride_name: "Nila", groom_name: "Dev", wedding_date: "2027-01-20" };
    const responses = await Promise.all([
      dispatcher.runCommand(user, profileEnvelope(null, input, key)),
      dispatcher.runCommand(user, profileEnvelope(null, input, key)),
    ]);
    for (const response of responses) {
      if (response.ok) created.push((response.result as { wedding_id: string }).wedding_id);
    }
    expect(responses.map(outcomeOf).sort()).toEqual(["applied", "replayed"]);
    const mine = await db.select({ id: weddings.id }).from(weddings).where(eq(weddings.created_by_user_id, user.user_id));
    expect(mine).toHaveLength(1);
  });

  it("refuses a manager's update with 403 and writes nothing", async () => {
    const { wedding_id } = await createWedding(newUser());
    const manager = newUser("Dia");
    const [row] = await db
      .insert(members)
      .values({ wedding_id, user_id: manager.user_id, role: "manager", display_name: "Dia" })
      .returning({ id: members.id });
    const actor: SessionActor = { ...manager, wedding_id, member_id: row.id, role: "manager" };
    const response = await dispatcher.runCommand(actor, profileEnvelope(wedding_id, { city: "Goa" }, randomUUID()));
    expect(response).toMatchObject({ ok: false, error: { code: "forbidden" } });
    expect(await versionOf(wedding_id)).toBe(1);
  });

  it("refuses a removed member on the next request (6.2)", async () => {
    const { wedding_id } = await createWedding(newUser());
    const coOwner = newUser("Kai");
    const [row] = await db
      .insert(members)
      .values({ wedding_id, user_id: coOwner.user_id, role: "owner", display_name: "Kai", removed_at: new Date() })
      .returning({ id: members.id });
    const actor: SessionActor = { ...coOwner, wedding_id, member_id: row.id, role: "owner" };
    const response = await dispatcher.runCommand(actor, profileEnvelope(wedding_id, { city: "Goa" }, randomUUID()));
    expect(response).toMatchObject({ ok: false, error: { code: "forbidden" } });
    expect(await versionOf(wedding_id)).toBe(1);
  });

  it("refuses a guest whose link was revoked while it waited on the lock, with the guest 404 (G5, 6.3)", async () => {
    const { wedding_id } = await createWedding(newUser());
    const [household] = await db.insert(households).values({ wedding_id, name: "Bhat" }).returning({ id: households.id });
    const [guest] = await db.insert(guests).values({ wedding_id, household_id: household.id, full_name: "Tara Bhat" }).returning({ id: guests.id });
    const token_hash = createHash("sha256").update(randomUUID(), "utf8").digest();
    const [link] = await db
      .insert(invitationLinks)
      .values({ wedding_id, household_id: household.id, token_hash, token_hint: "abcd" })
      .returning({ id: invitationLinks.id });
    const guestActor: GuestActor = {
      kind: "guest",
      wedding_id,
      household_id: household.id,
      household_name: "Bhat",
      guest_ids: [guest.id],
      token_hash: token_hash.toString("hex"),
    };
    let calls = 0;
    const guestDispatcher = dispatcherWith({
      registry: () => ({
        set_dietary: async () => {
          calls += 1;
          return { outcome: "unchanged", result: {} as never, activity: null };
        },
      }),
    });
    const envelope = (key: string) =>
      ({ wedding_id, command: "set_dietary", input: { guest_id: guest.id, dietary_note: "Jain" }, idempotency_key: key, source: "guest_link" }) as unknown as CommandEnvelope;

    const active = await guestDispatcher.runCommand(guestActor, envelope(randomUUID()));
    expect(outcomeOf(active)).toBe("unchanged");
    expect(calls).toBe(1);

    await db.update(invitationLinks).set({ revoked_at: new Date() }).where(eq(invitationLinks.id, link.id));
    const revoked = await guestDispatcher.runCommand(guestActor, envelope(randomUUID()));
    expect(revoked).toEqual({ ok: false, error: { code: "not_found", message: "Not found.", field: null } });
    expect(JSON.stringify((revoked as { error: unknown }).error)).toBe('{"code":"not_found","message":"Not found.","field":null}');
    expect(calls).toBe(1);
  });

  it("refuses a voice write while the gate is paused, with the prefill (V3)", async () => {
    const { wedding_id, owner } = await createWedding(newUser());
    const paused = dispatcherWith({
      voiceGate: async () => ({ status: "paused", cause: "switch_off" }),
      voiceTurnCheck: async () => ({ ok: true, transcript: "city Goa", members_safe: true }),
    });
    const response = await paused.runCommand(owner, {
      ...profileEnvelope(wedding_id, { city: "Goa" }, `${randomUUID()}:0`),
      source: "voice",
      voice_turn_id: randomUUID(),
    });
    expect(response).toMatchObject({
      ok: false,
      error: { code: "voice_writes_paused", prefill: [{ command: "set_wedding_profile", input: { city: "Goa" } }] },
    });
    expect(await versionOf(wedding_id)).toBe(1);
  });

  it("rolls back everything when a handler fails after writing", async () => {
    const { wedding_id, owner } = await createWedding(newUser());
    const failing: HandlerMap = {
      ...getHandlerRegistry(),
      set_wedding_profile: async (context) => {
        const tx = context.tx as typeof db;
        await tx.update(weddings).set({ city: "Nowhere" }).where(eq(weddings.id, wedding_id));
        throw new Error("boom");
      },
    };
    const broken = dispatcherWith({ registry: () => failing });
    const key = randomUUID();
    const response = await broken.runCommand(owner, profileEnvelope(wedding_id, { city: "Goa" }, key));
    expect(response).toMatchObject({ ok: false, error: { code: "internal_error" } });
    const [row] = await db.select({ city: weddings.city, version: weddings.version }).from(weddings).where(eq(weddings.id, wedding_id));
    expect(row).toEqual({ city: "Bengaluru", version: 1 });
    const receipts = await db
      .select({ key: commandReceipts.idempotency_key })
      .from(commandReceipts)
      .where(and(eq(commandReceipts.idempotency_key, key), eq(commandReceipts.wedding_id, wedding_id)));
    expect(receipts).toHaveLength(0);
  });
});

describe("cross-wedding references (5.0, AT-9.7)", () => {
  it("answers 404 not_found for an id from another wedding, and passes its own", async () => {
    const first = await createWedding(newUser());
    const second = await createWedding(newUser());
    const [venue] = await db.insert(venues).values({ wedding_id: first.wedding_id, name: "Banyan Hall" }).returning({ id: venues.id });
    await expect(assertSameWedding(db, venues, venue.id, first.wedding_id, "venue_id")).resolves.toBeUndefined();
    await expect(assertSameWedding(db, venues, venue.id, second.wedding_id, "venue_id")).rejects.toMatchObject({
      body: { code: "not_found", field: "venue_id" },
    });
    await expect(assertSameWedding(db, venues, randomUUID(), first.wedding_id)).rejects.toMatchObject({ body: { code: "not_found" } });
  });
});
