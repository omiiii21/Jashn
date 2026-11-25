import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getDb } from "@/db/client";
import { guests, households, invitationLinks, weddings } from "@/db/schema";

import { createGuestTokenResolver, findActiveGuestLink, generateLinkToken, hashLinkToken, linkTokenHint, resolveGuestToken } from "./guest-token";

/**
 * The guest check against a real database (architecture 3.4): one throwaway wedding with
 * random ids, removed afterwards. Two households, an active link, a revoked one, a deleted
 * guest, and a second wedding whose link must never resolve into the first.
 */
describe("resolveGuestToken against the database", () => {
  const weddingId = randomUUID();
  const otherWeddingId = randomUUID();
  const tara = { household: randomUUID(), guest: randomUUID(), deleted: randomUUID(), cousin: randomUUID() };
  const nikhil = { household: randomUUID(), guest: randomUUID() };
  const stray = { household: randomUUID(), guest: randomUUID() };
  const activeToken = generateLinkToken();
  const revokedToken = generateLinkToken();
  const mismatchToken = generateLinkToken();

  beforeAll(async () => {
    const db = getDb();
    await db.insert(weddings).values(
      [weddingId, otherWeddingId].map((id) => ({
        id,
        bride_name: "Test",
        groom_name: "Guest",
        wedding_date: "2027-02-14",
        // Throwaway sample weddings only (D103).
        is_sample: true,
        created_by_user_id: randomUUID(),
      })),
    );
    await db.insert(households).values([
      { id: tara.household, wedding_id: weddingId, name: "Tara Kapoor" },
      { id: nikhil.household, wedding_id: weddingId, name: "Nikhil Jain" },
      { id: stray.household, wedding_id: weddingId, name: "Stray Household" },
    ]);
    await db.insert(guests).values([
      { id: tara.guest, wedding_id: weddingId, household_id: tara.household, full_name: "Tara Kapoor", created_at: new Date("2026-11-01T00:00:00Z") },
      { id: tara.cousin, wedding_id: weddingId, household_id: tara.household, full_name: "Ira Kapoor", created_at: new Date("2026-11-02T00:00:00Z") },
      {
        id: tara.deleted,
        wedding_id: weddingId,
        household_id: tara.household,
        full_name: "Removed Guest",
        deleted_at: new Date("2026-11-03T00:00:00Z"),
      },
      { id: nikhil.guest, wedding_id: weddingId, household_id: nikhil.household, full_name: "Nikhil Jain" },
      { id: stray.guest, wedding_id: weddingId, household_id: stray.household, full_name: "Stray Guest" },
    ]);
    await db.insert(invitationLinks).values([
      { wedding_id: weddingId, household_id: tara.household, token_hash: hashLinkToken(activeToken).hash, token_hint: linkTokenHint(activeToken) },
      {
        wedding_id: weddingId,
        household_id: nikhil.household,
        token_hash: hashLinkToken(revokedToken).hash,
        token_hint: linkTokenHint(revokedToken),
        revoked_at: new Date("2026-11-20T00:00:00Z"),
      },
      // A corrupt row: the link claims the other wedding but points at this wedding's household.
      {
        wedding_id: otherWeddingId,
        household_id: stray.household,
        token_hash: hashLinkToken(mismatchToken).hash,
        token_hint: linkTokenHint(mismatchToken),
      },
    ]);
  });

  afterAll(async () => {
    const db = getDb();
    await db.delete(invitationLinks).where(eq(invitationLinks.wedding_id, otherWeddingId));
    await db.delete(weddings).where(eq(weddings.id, weddingId));
    await db.delete(weddings).where(eq(weddings.id, otherWeddingId));
  });

  it("resolves an active link to its wedding, household and non-deleted guests", async () => {
    const actor = await resolveGuestToken(activeToken);
    expect(actor).toEqual({
      kind: "guest",
      wedding_id: weddingId,
      household_id: tara.household,
      household_name: "Tara Kapoor",
      guest_ids: [tara.guest, tara.cousin],
      token_hash: hashLinkToken(activeToken).hex,
    });
  });

  it("answers null for a revoked link, an unknown token and a malformed one", async () => {
    expect(await resolveGuestToken(revokedToken)).toBeNull();
    expect(await resolveGuestToken(generateLinkToken())).toBeNull();
    expect(await resolveGuestToken(activeToken.slice(0, 42))).toBeNull();
    expect(await resolveGuestToken(`${activeToken.slice(0, 42)}!`)).toBeNull();
  });

  it("never resolves a link into a household of another wedding", async () => {
    expect(await resolveGuestToken(mismatchToken)).toBeNull();
  });

  it("revoking a link fails the next lookup at once", async () => {
    const db = getDb();
    const token = generateLinkToken();
    const household = randomUUID();
    await db.insert(households).values({ id: household, wedding_id: weddingId, name: "Late Household" });
    const [link] = await db
      .insert(invitationLinks)
      .values({ wedding_id: weddingId, household_id: household, token_hash: hashLinkToken(token).hash, token_hint: linkTokenHint(token) })
      .returning({ id: invitationLinks.id });
    const resolve = createGuestTokenResolver((hash) => findActiveGuestLink(db, hash));
    expect(await resolve(token)).toMatchObject({ household_id: household, guest_ids: [] });
    await db.update(invitationLinks).set({ revoked_at: new Date() }).where(eq(invitationLinks.id, link.id));
    expect(await resolve(token)).toBeNull();
  });
});
