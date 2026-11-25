import { randomUUID } from "node:crypto";

import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { getDb } from "@/db/client";
import { members, weddings } from "@/db/schema";

import { buildUserActor, isLiveAuth, loadMemberActor } from "./session";

/**
 * The live membership check against a real database (domain 6.2): a throwaway pair of
 * weddings with random ids, cleaned up afterwards. Supabase isn't called: these helpers take
 * the user, which the guard reads from `getClaims()`.
 */
describe("loadMemberActor and buildUserActor against the database", () => {
  const userId = randomUUID();
  const outsiderId = randomUUID();
  const ownedWedding = randomUUID();
  const helpedWedding = randomUUID();
  const removedWedding = randomUUID();
  const user = { user_id: userId, email: "session-test@example.com" };

  beforeAll(async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://session-test.invalid");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "session-test-anon-key");
    const db = getDb();
    await db.insert(weddings).values(
      [helpedWedding, ownedWedding, removedWedding].map((id) => ({
        id,
        bride_name: "Test",
        groom_name: "Session",
        wedding_date: "2027-02-14",
        created_by_user_id: outsiderId,
      })),
    );
    // Oldest first: the manager row of helpedWedding, then the owner row of ownedWedding.
    await db.insert(members).values([
      {
        wedding_id: helpedWedding,
        user_id: userId,
        role: "manager",
        display_name: "Helper",
        preferred_language: "hi",
        created_at: new Date("2026-11-01T00:00:00Z"),
      },
      {
        wedding_id: ownedWedding,
        user_id: userId,
        role: "owner",
        display_name: "Owner",
        created_at: new Date("2026-11-02T00:00:00Z"),
      },
      {
        wedding_id: removedWedding,
        user_id: userId,
        role: "owner",
        display_name: "Gone",
        removed_at: new Date("2026-11-03T00:00:00Z"),
      },
    ]);
  });

  afterAll(async () => {
    const db = getDb();
    await db.delete(weddings).where(inArray(weddings.id, [helpedWedding, ownedWedding, removedWedding]));
    vi.unstubAllEnvs();
  });

  it("runs live", () => {
    expect(isLiveAuth()).toBe(true);
  });

  it("returns the member actor of an active membership", async () => {
    const actor = await loadMemberActor(user, helpedWedding);
    expect(actor).toMatchObject({
      kind: "member",
      user_id: userId,
      wedding_id: helpedWedding,
      role: "manager",
      display_name: "Helper",
      preferred_language: "hi",
      is_internal: true,
      is_first_wedding: false,
    });
    expect(actor?.member_id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("returns null for a removed membership, a stranger's wedding and a non-uuid id", async () => {
    await expect(loadMemberActor(user, removedWedding)).resolves.toBeNull();
    await expect(loadMemberActor({ user_id: outsiderId, email: "x@gmail.com" }, ownedWedding)).resolves.toBeNull();
    await expect(loadMemberActor(user, "not-a-uuid")).resolves.toBeNull();
  });

  it("builds the no-wedding actor from the oldest membership", async () => {
    const actor = await buildUserActor(user);
    expect(actor).toMatchObject({ wedding_id: null, member_id: null, role: null, display_name: "Helper", is_first_wedding: false });
  });

  it("gives a brand-new user is_first_wedding true and the email's local part", async () => {
    const actor = await buildUserActor({ user_id: randomUUID(), email: "fresh.owner@gmail.com" });
    expect(actor).toMatchObject({ display_name: "fresh.owner", is_first_wedding: true, is_internal: false, preferred_language: "en" });
  });
});
