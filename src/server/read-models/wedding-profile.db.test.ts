import { randomUUID } from "node:crypto";

import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CommandFailure, type CommandEnvelope } from "@/contracts/commands";
import type { SessionActor } from "@/contracts/domain";
import type { CommandHandlerContext } from "@/contracts/services";
import { createDb, type Db, type Tx } from "@/db/client";
import { budgets, events, inviteStyles, members, weddings } from "@/db/schema";
import { setWeddingProfileHandler as handler } from "@/server/commands/wedding-profile";

import { buildWeddingProfile } from "./wedding-profile";

/**
 * Runs against the database in DATABASE_URL (npm run test:db). Every wedding here is a
 * throwaway `is_sample` row with a random id, deleted afterwards (cascade), so the test
 * never assumes an empty database and never touches a seeded copy.
 */

const url = process.env.DATABASE_URL;
let db: Db;
let close: () => Promise<void>;
const createdWeddings: string[] = [];

function actorFor(user_id: string, overrides: Partial<SessionActor> = {}): SessionActor {
  return {
    kind: "member",
    user_id,
    email: `profile-test-${user_id.slice(0, 8)}@example.com`,
    display_name: "Mira",
    wedding_id: null,
    member_id: null,
    role: null,
    is_internal: true,
    is_first_wedding: true,
    preferred_language: "en",
    ...overrides,
  };
}

async function insertWedding(options: { managers_can_see_budget?: boolean; total_inr?: number; event_dates?: string[] } = {}) {
  const wedding_id = randomUUID();
  createdWeddings.push(wedding_id);
  const owner_user = randomUUID();
  const manager_user = randomUUID();
  await db.insert(weddings).values({
    id: wedding_id,
    bride_name: "Mira",
    groom_name: "Kabir",
    wedding_date: "2026-12-14",
    city: "Bengaluru",
    is_sample: true,
    managers_can_see_vendor_dues: true,
    managers_can_see_budget: options.managers_can_see_budget ?? false,
    version: 7,
    created_by_user_id: owner_user,
  });
  await db.insert(budgets).values({ wedding_id, total_inr: options.total_inr ?? 1_200_000 });
  const [owner] = await db
    .insert(members)
    .values({ wedding_id, user_id: owner_user, role: "owner", display_name: "Mira" })
    .returning({ id: members.id });
  const [manager] = await db
    .insert(members)
    .values({ wedding_id, user_id: manager_user, role: "manager", display_name: "Diya" })
    .returning({ id: members.id });
  for (const [index, event_date] of (options.event_dates ?? []).entries()) {
    await db.insert(events).values({
      wedding_id,
      event_kind: "other",
      title: `Function ${index}`,
      title_hi: `कार्यक्रम ${index}`,
      event_date,
    });
  }
  return {
    wedding_id,
    owner: actorFor(owner_user, { wedding_id, member_id: owner.id, role: "owner", is_first_wedding: false }),
    manager: actorFor(manager_user, { wedding_id, member_id: manager.id, role: "manager", display_name: "Diya", is_first_wedding: false }),
  };
}

function contextFor(
  tx: Tx,
  actor: SessionActor,
  wedding_id: string | null,
  input: Record<string, unknown>,
): CommandHandlerContext<"set_wedding_profile", Tx> {
  const envelope = {
    wedding_id,
    command: "set_wedding_profile",
    input,
    idempotency_key: `profile-test-${randomUUID()}`,
    source: "ui",
  } as CommandEnvelope<"set_wedding_profile">;
  return {
    command: "set_wedding_profile",
    actor,
    wedding_id,
    input: input as CommandHandlerContext<"set_wedding_profile", Tx>["input"],
    envelope,
    tx,
    now: new Date().toISOString(),
  };
}

describe.skipIf(!url)("wedding_profile read model (database)", () => {
  beforeAll(() => {
    const created = createDb(url!, { max: 2 });
    db = created.db;
    close = () => created.client.end({ timeout: 5 });
  });

  afterAll(async () => {
    if (createdWeddings.length > 0) await db.delete(weddings).where(inArray(weddings.id, createdWeddings));
    await close();
  });

  it("gives the owner the budget and the function dates", async () => {
    const { wedding_id, owner } = await insertWedding({ event_dates: ["2026-12-14", "2026-12-12", "2026-12-13"] });
    const profile = await buildWeddingProfile(db, owner, wedding_id);
    expect(profile).toEqual({
      version: 7,
      hidden: [],
      wedding_id,
      seed_key: null,
      display_name: "Mira & Kabir",
      bride_name: "Mira",
      groom_name: "Kabir",
      wedding_date: "2026-12-14",
      first_event_date: "2026-12-12",
      last_event_date: "2026-12-14",
      city: "Bengaluru",
      budget_inr: 1_200_000,
      is_sample: true,
      member: { member_id: owner.member_id, role: "owner", display_name: "Mira" },
    });
    expect(Number.isSafeInteger(profile.budget_inr)).toBe(true);
  });

  it("hides the budget from a manager without budget sharing (G7)", async () => {
    const { wedding_id, manager } = await insertWedding();
    const profile = await buildWeddingProfile(db, manager, wedding_id);
    expect(profile.hidden).toEqual(["budget"]);
    expect("budget_inr" in profile).toBe(false);
    expect(profile.member).toEqual({ member_id: manager.member_id, role: "manager", display_name: "Diya" });
    expect(profile.first_event_date).toBeNull();
    expect(profile.last_event_date).toBeNull();
  });

  it("shows a manager the budget while managers_can_see_budget is on", async () => {
    const { wedding_id, manager } = await insertWedding({ managers_can_see_budget: true, total_inr: 1_500_000 });
    const profile = await buildWeddingProfile(db, manager, wedding_id);
    expect(profile.hidden).toEqual([]);
    expect(profile.budget_inr).toBe(1_500_000);
  });

  it("shows an owner a zero budget as 0, never hidden", async () => {
    const { wedding_id, owner } = await insertWedding({ total_inr: 0 });
    const profile = await buildWeddingProfile(db, owner, wedding_id);
    expect(profile.hidden).toEqual([]);
    expect(profile.budget_inr).toBe(0);
  });

  it("answers not_found for a stranger and for a removed member", async () => {
    const { wedding_id, manager } = await insertWedding();
    await expect(buildWeddingProfile(db, actorFor(randomUUID()), wedding_id)).rejects.toBeInstanceOf(CommandFailure);
    await db.update(members).set({ removed_at: new Date() }).where(eq(members.id, manager.member_id!));
    await expect(buildWeddingProfile(db, manager, wedding_id)).rejects.toMatchObject({ body: { code: "not_found" } });
  });

  it("set_wedding_profile creates, then updates, a wedding the read model shows", async () => {
    const user_id = randomUUID();
    const actor = actorFor(user_id);

    const created = await db.transaction((tx) =>
      handler(
        contextFor(tx, actor, null, {
          bride_name: "Mira",
          groom_name: "Kabir",
          wedding_date: "2026-12-14",
          city: "Bengaluru",
          budget_inr: 1_200_000,
          expected_guests: 250,
        }),
      ),
    );
    const wedding_id = String(created.result.wedding_id);
    createdWeddings.push(wedding_id);
    expect(created.outcome).toBe("applied");
    expect(created.bumps_draft_version).toBe(false);
    expect(created.activity).toMatchObject({ topic: "wedding.created", visibility: "owners", entity_id: wedding_id });

    // AT-1.2's records: the row, the budget, one owner, the invite style defaults, sharing off.
    const [row] = await db.select().from(weddings).where(eq(weddings.id, wedding_id));
    expect(row).toMatchObject({
      bride_name: "Mira",
      groom_name: "Kabir",
      wedding_date: "2026-12-14",
      city: "Bengaluru",
      expected_guests: 250,
      created_by_user_id: user_id,
      managers_can_see_vendor_dues: false,
      managers_can_see_budget: false,
      managers_can_see_guest_contacts: false,
      is_sample: false,
      seed_key: null,
    });
    // Mark it sample like every other throwaway in this file.
    await db.update(weddings).set({ is_sample: true }).where(eq(weddings.id, wedding_id));
    const [budget] = await db.select().from(budgets).where(eq(budgets.wedding_id, wedding_id));
    expect(budget.total_inr).toBe(1_200_000);
    const owners = await db.select().from(members).where(eq(members.wedding_id, wedding_id));
    expect(owners).toHaveLength(1);
    expect(owners[0]).toMatchObject({ user_id, role: "owner", display_name: "Mira", id: created.result.member_id });
    const [style] = await db.select().from(inviteStyles).where(eq(inviteStyles.wedding_id, wedding_id));
    expect(style).toMatchObject({
      theme: "maroon_gold",
      typeface: "eczar",
      layout: "card_with_inserts",
      photo_frame: "mounted",
      heading_hi: "शुभ विवाह",
      updated_by_member_id: owners[0].id,
    });

    const member_actor = { ...actor, wedding_id, member_id: owners[0].id, role: "owner" as const };
    const profile = await buildWeddingProfile(db, member_actor, wedding_id);
    expect(profile).toMatchObject({ display_name: "Mira & Kabir", wedding_date: "2026-12-14", city: "Bengaluru", budget_inr: 1_200_000 });

    // The same values again: unchanged, no activity.
    const same = await db.transaction((tx) => handler(contextFor(tx, member_actor, wedding_id, { city: "Bengaluru", budget_inr: 1_200_000 })));
    expect(same).toMatchObject({ outcome: "unchanged", activity: null });

    // A guest-visible change bumps the draft; a budget-only change is budget.updated.
    const moved = await db.transaction((tx) => handler(contextFor(tx, member_actor, wedding_id, { city: "Mysuru", expected_guests: 300 })));
    expect(moved).toMatchObject({ outcome: "applied", bumps_draft_version: true });
    expect(moved.activity).toMatchObject({
      topic: "wedding.updated",
      visibility: "members",
      before: { city: "Bengaluru", expected_guests: 250 },
      after: { city: "Mysuru", expected_guests: 300 },
    });
    const budgeted = await db.transaction((tx) => handler(contextFor(tx, member_actor, wedding_id, { budget_inr: 1_500_000 })));
    expect(budgeted).toMatchObject({ outcome: "applied", bumps_draft_version: false });
    expect(budgeted.activity).toMatchObject({ topic: "budget.updated", visibility: "owners" });

    const after = await buildWeddingProfile(db, member_actor, wedding_id);
    expect(after).toMatchObject({ city: "Mysuru", budget_inr: 1_500_000 });
  });

  it("refuses a manager's update with forbidden (A3)", async () => {
    const { wedding_id, manager } = await insertWedding();
    await expect(db.transaction((tx) => handler(contextFor(tx, manager, wedding_id, { city: "Mysuru" })))).rejects.toMatchObject({
      body: { code: "forbidden" },
    });
    const [row] = await db.select({ city: weddings.city }).from(weddings).where(eq(weddings.id, wedding_id));
    expect(row.city).toBe("Bengaluru");
  });

  it("refuses a create without a date with year_required, writing nothing", async () => {
    const user_id = randomUUID();
    await expect(
      db.transaction((tx) => handler(contextFor(tx, actorFor(user_id), null, { bride_name: "Mira", groom_name: "Kabir" }))),
    ).rejects.toMatchObject({ body: { code: "validation_failed", field: "wedding_date", message: "year_required" } });
    const rows = await db.select({ id: weddings.id }).from(weddings).where(eq(weddings.created_by_user_id, user_id));
    expect(rows).toHaveLength(0);
  });
});
