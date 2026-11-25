import { createHash, randomUUID } from "node:crypto";

import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { CommandEnvelope, CommandName, CommandResponse, CommandSuccess } from "@/contracts/commands";
import type { SessionActor } from "@/contracts/domain";
import { SEED_KEYS, fixtureSessionActor } from "@/contracts/fixtures";
import { httpStatusOf } from "@/contracts/services";
import { createDb, type Db } from "@/db/client";
import { seededId } from "@/db/ids";
import { activityEntries, commandReceipts, events, memberInvites, members, weddings } from "@/db/schema";
import { applySeedState, ensureInvitationLinks } from "@/db/seed-apply";
import { buildSeedDataset, type SeedDataset } from "@/db/seed-data";
import { localDatabaseUrl, lockSampleCopy } from "@/db/testing";
import { buildUserActor, loadMemberActor } from "@/server/auth/session";
import { assertReadModelAccess, loadSharing } from "@/server/authz/guard";
import { generateLinkToken, hashLinkToken } from "@/server/authz/guest-token";
import { readMemberVersion } from "@/server/live/version";
import { buildActivityFeed } from "@/server/read-models/activity-feed";
import { loadJoinInvite } from "@/server/read-models/join-invite";
import { buildMoneySummary } from "@/server/read-models/money-summary";
import { buildTeam } from "@/server/read-models/team";
import { buildWeddingProfile } from "@/server/read-models/wedding-profile";

import { seedUserIds } from "./demo";
import { createDispatcher } from "./dispatcher";
import { eventHandlers } from "./events";
import { ledgerHandlers } from "./ledger";
import { INVITE_INVALID_BODY, INVITE_TTL_MS, memberHandlers } from "./members";

/**
 * A6's sharing and member commands against a real Postgres (the local database only:
 * DATABASE_URL=postgresql://…@127.0.0.1…, RUN_DB_TESTS=1). Every command runs through the
 * dispatcher, so the wedding lock, the receipt, the one activity entry and the one version
 * bump are the real ones.
 *
 * - Copy "a" (D120): the done-check (a fresh @example.com invitee joins as manager; the link
 *   twice, and a cancelled invite's link, answer 404 `invite_invalid`), AT-8.1's joining,
 *   cancelling and removing, and AT-6.5 with vendor-dues sharing off. It leaves copy a at D0
 *   and deletes the members rows it added (a reset keeps members).
 * - Throwaway sample weddings: `last_owner`, a removed member failing every check, a removed
 *   member invited back, expiry, the join page's preview and concurrent accepts.
 */

const COPY = "a" as const;
// Seeds and resets a whole sample copy, so it runs only against a local Postgres.
const url = localDatabaseUrl();
const W = seededId(COPY, "weddings", SEED_KEYS.wedding);
const MIRA_MEMBER = seededId(COPY, "members", SEED_KEYS.members.mira);
const DIYA_MEMBER = seededId(COPY, "members", SEED_KEYS.members.diya);
const VEN_CAT = seededId(COPY, "vendors", "VEN-CAT");
const APP_BASE_URL = "http://localhost:3001";

let db: Db;
let close: () => Promise<void>;
let releaseCopy: (() => Promise<void>) | undefined;
let dataset: SeedDataset;
let mira: SessionActor;
let diya: SessionActor;
const liveMembers: string[] = [];
const throwaway: string[] = [];

type Dispatcher = ReturnType<typeof createDispatcher>;
let dispatcher: Dispatcher;

function short(): string {
  return randomUUID().slice(0, 8);
}

/** A signed-in user with no membership yet: the actor `dispatchCommand` builds for a join. */
function newUser(email: string): SessionActor {
  return {
    kind: "member",
    user_id: randomUUID(),
    email,
    display_name: email.split("@")[0] ?? email,
    wedding_id: null,
    member_id: null,
    role: null,
    is_internal: true,
    is_first_wedding: true,
    preferred_language: "en",
  };
}

/** The actor of a member row, as the session helper would build it. */
function memberActor(base: SessionActor, wedding_id: string, member_id: string, role: "owner" | "manager", display_name: string): SessionActor {
  return { ...base, wedding_id, member_id, role, display_name, is_first_wedding: false };
}

function run<C extends CommandName>(
  actor: SessionActor,
  command: C,
  input: Record<string, unknown>,
  options: { wedding_id?: string | null; key?: string | null } = {},
): Promise<CommandResponse<C>> {
  const wedding_id = options.wedding_id === undefined ? W : options.wedding_id;
  const envelope = {
    ...(wedding_id ? { wedding_id } : {}),
    command,
    input,
    idempotency_key: options.key === undefined ? `a6-${randomUUID()}` : options.key,
    source: "ui",
  } as unknown as CommandEnvelope<C>;
  return dispatcher.runCommand(actor, envelope);
}

function ok<C extends CommandName>(response: CommandResponse<C>): CommandSuccess<C> {
  if (!response.ok) throw new Error(`expected success, got ${response.error.code}: ${response.error.message}`);
  return response;
}

function tokenOf(join_url: unknown): string {
  expect(typeof join_url).toBe("string");
  const match = /\/join\/([A-Za-z0-9_-]{43})$/.exec(String(join_url));
  if (!match) throw new Error("join_url carries no token");
  return match[1];
}

async function versionOf(wedding_id = W): Promise<number> {
  const [row] = await db.select({ version: weddings.version }).from(weddings).where(eq(weddings.id, wedding_id));
  return Number(row?.version ?? -1);
}

async function entriesOf(wedding_id = W) {
  return db.select().from(activityEntries).where(eq(activityEntries.wedding_id, wedding_id));
}

async function throwawayWedding(owner: SessionActor, extra: { role: "owner" | "manager"; actor: SessionActor; display_name: string }[] = []) {
  const wedding_id = randomUUID();
  throwaway.push(wedding_id);
  await db.insert(weddings).values({
    id: wedding_id,
    bride_name: "Asha",
    groom_name: "Ravi",
    wedding_date: "2027-02-14",
    city: "Pune",
    is_sample: true,
    created_by_user_id: owner.user_id,
  });
  const [ownerRow] = await db
    .insert(members)
    .values({ wedding_id, user_id: owner.user_id, role: "owner", display_name: "Asha" })
    .returning({ id: members.id });
  const others: string[] = [];
  for (const row of extra) {
    const [inserted] = await db
      .insert(members)
      .values({ wedding_id, user_id: row.actor.user_id, role: row.role, display_name: row.display_name })
      .returning({ id: members.id });
    others.push(inserted.id);
  }
  return { wedding_id, owner_member: ownerRow.id, others };
}

describe.skipIf(!url)("sharing and members (database)", () => {
  beforeAll(async () => {
    // loadMemberActor and buildUserActor run live only with the Supabase names set (they never
    // call Supabase here: the tests hand them the user).
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://members-test.invalid");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "members-test-anon-key");
    vi.stubEnv("APP_BASE_URL", APP_BASE_URL);
    // demo.db.test.ts also seeds, resets and counts copy a: take turns (src/db/testing.ts).
    releaseCopy = await lockSampleCopy(url!, COPY);
    const created = createDb(url!, { max: 6 });
    db = created.db;
    close = () => created.client.end();
    // The copy's stored Auth user ids, so seeding never re-points mira.a or diya.a.
    const stored = await db
      .select({ seed_key: members.seed_key, user_id: members.user_id })
      .from(members)
      .where(and(eq(members.wedding_id, W), isNotNull(members.seed_key)));
    const { user_ids } = seedUserIds(COPY, stored);
    dataset = buildSeedDataset(COPY, { user_ids });
    await db.transaction(async (tx) => {
      await applySeedState(tx, dataset, { now: new Date() });
      await ensureInvitationLinks(tx, dataset);
    });
    const miraFixture = fixtureSessionActor("mira", COPY);
    const diyaFixture = fixtureSessionActor("diya", COPY);
    mira = { ...miraFixture, user_id: user_ids[miraFixture.email] ?? miraFixture.user_id, member_id: MIRA_MEMBER };
    diya = { ...diyaFixture, user_id: user_ids[diyaFixture.email] ?? diyaFixture.user_id, member_id: DIYA_MEMBER };
    dispatcher = createDispatcher({
      db: () => db,
      registry: () => ({ ...memberHandlers, add_quote: ledgerHandlers.add_quote, create_event: eventHandlers.create_event }),
      schedule: () => {},
      voiceGate: async () => ({ status: "enabled" as const }),
      onSetupSaved: async () => {},
      afterCommit: {},
      log: () => {},
    });
  }, 60_000);

  afterAll(async () => {
    try {
      if (db) {
        // Copy a back to D0 (live invites, activity and receipts go); then the members rows the
        // test added, which every reset keeps; then the throwaway weddings.
        await db.transaction(async (tx) => {
          await applySeedState(tx, dataset, { now: new Date() });
          await ensureInvitationLinks(tx, dataset);
        });
        if (liveMembers.length > 0) await db.delete(members).where(inArray(members.id, liveMembers));
        if (throwaway.length > 0) await db.delete(weddings).where(inArray(weddings.id, throwaway));
        await close();
      }
    } finally {
      await releaseCopy?.();
      vi.unstubAllEnvs();
    }
  }, 60_000);

  // -------------------------------------------------------------------------
  // Copy a: the done-check and AT-8.1
  // -------------------------------------------------------------------------

  it("done-check: a fresh @example.com invitee joins copy a as manager; the link twice, and a cancelled invite's link, answer 404 invite_invalid", async () => {
    const email = `invitee-a-${short()}@example.com`;
    const versionBefore = await versionOf();
    const entriesBefore = (await entriesOf()).length;

    // Mira invites the address as a manager; the join link is shown once.
    const inviteKey = `a6-invite-${randomUUID()}`;
    const invited = ok(await run(mira, "invite_member", { email: email.toUpperCase(), role: "manager" }, { key: inviteKey }));
    expect(invited.outcome).toBe("applied");
    const join_url = invited.result.join_url;
    expect(join_url?.startsWith(`${APP_BASE_URL}/join/`)).toBe(true);
    const token = tokenOf(join_url);
    expect(invited.version).toBe(versionBefore + 1);

    // Only the SHA-256 is stored; the address is kept in lower case; 48 hours to accept.
    const [inviteRow] = await db.select().from(memberInvites).where(eq(memberInvites.id, invited.result.member_invite_id));
    expect(inviteRow.email).toBe(email);
    expect(inviteRow.token_hash.equals(createHash("sha256").update(token, "utf8").digest())).toBe(true);
    expect(inviteRow.expires_at.getTime() - inviteRow.created_at.getTime()).toBe(INVITE_TTL_MS);
    expect(inviteRow.invited_by_member_id).toBe(MIRA_MEMBER);

    // One owners entry: "Mira invited {email} as manager."
    const [invitedEntry] = await db.select().from(activityEntries).where(eq(activityEntries.id, invited.activity_entry_id!));
    expect(invitedEntry).toMatchObject({
      topic: "member.invited",
      entity_type: "member_invite",
      summary_en: `Mira invited ${email} as manager.`,
      visibility: "owners",
      actor_member_id: MIRA_MEMBER,
    });

    // The receipt never holds the token; a replay says it was already issued.
    const [receipt] = await db.select().from(commandReceipts).where(eq(commandReceipts.idempotency_key, inviteKey));
    expect(JSON.stringify(receipt.response)).not.toContain(token);
    const replay = ok(await run(mira, "invite_member", { email: email.toUpperCase(), role: "manager" }, { key: inviteKey }));
    expect(replay.outcome).toBe("replayed");
    expect(replay.result).toEqual({ member_invite_id: invited.result.member_invite_id, token_already_issued: true });
    expect(JSON.stringify(replay)).not.toContain(token);
    expect(await versionOf()).toBe(versionBefore + 1);
    // No entry anywhere carries the raw token.
    for (const entry of await entriesOf()) expect(JSON.stringify(entry)).not.toContain(token);

    // Diya inviting anyone gets 403 forbidden.
    const diyaInvite = await run(diya, "invite_member", { email: `diya-guest-${short()}@example.com`, role: "manager" });
    expect(diyaInvite).toMatchObject({ ok: false, error: { code: "forbidden" } });

    // A different signed-in email opening the link gets 403 forbidden, and nothing is written.
    const stranger = newUser(`someone-else-${short()}@example.com`);
    const wrongEmail = await run(stranger, "accept_member_invite", { token }, { wedding_id: null });
    expect(wrongEmail).toMatchObject({ ok: false, error: { code: "forbidden" } });
    expect(httpStatusOf(wrongEmail)).toBe(403);
    expect(await versionOf()).toBe(versionBefore + 1);

    // The invitee signs up with that email (any case) and joins.
    const invitee = newUser(email.replace("invitee", "Invitee"));
    const acceptKey = `a6-accept-${randomUUID()}`;
    const accepted = ok(await run(invitee, "accept_member_invite", { token }, { wedding_id: null, key: acceptKey }));
    expect(accepted.outcome).toBe("applied");
    expect(accepted.result).toMatchObject({ wedding_id: W, role: "manager" });
    const member_id = String((accepted.result as { member_id: string }).member_id);
    liveMembers.push(member_id);
    expect(accepted.version).toBe(versionBefore + 2);

    const [memberRow] = await db.select().from(members).where(eq(members.id, member_id));
    expect(memberRow).toMatchObject({ wedding_id: W, user_id: invitee.user_id, role: "manager", removed_at: null });
    const [usedInvite] = await db.select().from(memberInvites).where(eq(memberInvites.id, invited.result.member_invite_id));
    expect(usedInvite.accepted_by_member_id).toBe(member_id);
    expect(usedInvite.accepted_at).not.toBeNull();

    // Activity (owners) then reads "{email} accepted the invite as manager.", by the new member.
    const [joinedEntry] = await db.select().from(activityEntries).where(eq(activityEntries.id, accepted.activity_entry_id!));
    expect(joinedEntry).toMatchObject({
      topic: "member.joined",
      entity_type: "member",
      entity_id: member_id,
      summary_en: `${email} accepted the invite as manager.`,
      visibility: "owners",
      actor_type: "member",
      actor_member_id: member_id,
      actor_label: memberRow.display_name,
    });
    expect((await entriesOf()).length).toBe(entriesBefore + 2);

    // The session helper now finds the membership, with the invited role.
    const session = await loadMemberActor({ user_id: invitee.user_id, email: invitee.email }, W);
    expect(session).toMatchObject({ wedding_id: W, member_id, role: "manager" });
    expect(await readMemberVersion(db, invitee.user_id, W)).toBe(versionBefore + 2);

    // The same request again replays; using the link a second time is 404 invite_invalid.
    const acceptReplay = ok(await run(invitee, "accept_member_invite", { token }, { wedding_id: null, key: acceptKey }));
    expect(acceptReplay.outcome).toBe("replayed");
    const secondUse = await run(invitee, "accept_member_invite", { token }, { wedding_id: null });
    expect(secondUse).toEqual({ ok: false, error: INVITE_INVALID_BODY });
    expect(httpStatusOf(secondUse)).toBe(404);
    const secondUseByStranger = await run(stranger, "accept_member_invite", { token }, { wedding_id: null });
    expect(secondUseByStranger).toEqual({ ok: false, error: INVITE_INVALID_BODY });
    expect(await versionOf()).toBe(versionBefore + 2);

    // A second, pending invite, cancelled: its link answers invite_invalid at once.
    const otherEmail = `second-a-${short()}@example.com`;
    const second = ok(await run(mira, "invite_member", { email: otherEmail, role: "manager", display_name: "Second" }));
    const secondToken = tokenOf(second.result.join_url);
    const diyaRevoke = await run(diya, "revoke_member_invite", { member_invite_id: second.result.member_invite_id });
    expect(diyaRevoke).toMatchObject({ ok: false, error: { code: "forbidden" } });
    const revoked = ok(await run(mira, "revoke_member_invite", { member_invite_id: second.result.member_invite_id }));
    const [revokedEntry] = await db.select().from(activityEntries).where(eq(activityEntries.id, revoked.activity_entry_id!));
    expect(revokedEntry).toMatchObject({
      topic: "member.invite_revoked",
      entity_type: "member_invite",
      entity_id: second.result.member_invite_id,
      summary_en: `Mira cancelled the invite to ${otherEmail}.`,
      visibility: "owners",
    });
    const cancelledUse = await run(newUser(otherEmail), "accept_member_invite", { token: secondToken }, { wedding_id: null });
    expect(cancelledUse).toEqual({ ok: false, error: INVITE_INVALID_BODY });
    const revokeAgain = await run(mira, "revoke_member_invite", { member_invite_id: second.result.member_invite_id });
    expect(revokeAgain).toMatchObject({ ok: false, error: { code: "invite_invalid", field: "member_invite_id" } });
    const revokeForeign = await run(mira, "revoke_member_invite", { member_invite_id: randomUUID() });
    expect(revokeForeign).toMatchObject({ ok: false, error: { code: "not_found" } });

    // The team view (owners): the joined member, and no cancelled or used invite pending.
    const team = await buildTeam(db, mira, W);
    expect(team.members.map((row) => row.member_id)).toEqual(expect.arrayContaining([MIRA_MEMBER, DIYA_MEMBER, member_id]));
    expect(team.members[0].role).toBe("owner");
    expect(team.members.find((row) => row.member_id === MIRA_MEMBER)?.is_you).toBe(true);
    expect(team.pending_invites.map((row) => row.email)).not.toContain(email);
    expect(team.pending_invites.map((row) => row.email)).not.toContain(otherEmail);
    expect(team.sharing).toEqual({ managers_can_see_vendor_dues: true, managers_can_see_budget: false, managers_can_see_guest_contacts: false });
    // Managers never read it: no emails or member list reach Diya.
    await expect(buildTeam(db, diya, W)).rejects.toMatchObject({ body: { code: "forbidden" } });

    // Mira removes the member who joined: from their next request, no planner data.
    const diyaRemove = await run(diya, "remove_member", { member_id });
    expect(diyaRemove).toMatchObject({ ok: false, error: { code: "forbidden" } });
    const removed = ok(await run(mira, "remove_member", { member_id }));
    const [removedEntry] = await db.select().from(activityEntries).where(eq(activityEntries.id, removed.activity_entry_id!));
    expect(removedEntry).toMatchObject({
      topic: "member.removed",
      entity_type: "member",
      entity_id: member_id,
      summary_en: `Mira removed ${memberRow.display_name} from the wedding.`,
      visibility: "owners",
    });
    expect(await loadMemberActor({ user_id: invitee.user_id, email: invitee.email }, W)).toBeNull();
    expect(await readMemberVersion(db, invitee.user_id, W)).toBeNull();

    // Diya's feed (members) shows none of these owners-only entries (L5).
    const feed = await buildActivityFeed(db, diya, W, { limit: 200 });
    expect(feed.entries.filter((entry) => entry.topic.startsWith("member.") || entry.topic.startsWith("sharing."))).toEqual([]);
  }, 60_000);

  // -------------------------------------------------------------------------
  // Copy a: AT-6.5 with vendor-dues sharing off
  // -------------------------------------------------------------------------

  it("AT-6.5: with vendor-dues sharing off, Diya loses every vendor figure and her add_quote answers 403 forbidden", async () => {
    const before = await versionOf();
    const diyaSharing = await run(diya, "set_sharing", { managers_can_see_vendor_dues: false });
    expect(diyaSharing).toMatchObject({ ok: false, error: { code: "forbidden" } });

    const off = ok(await run(mira, "set_sharing", { managers_can_see_vendor_dues: false }));
    expect(off.outcome).toBe("applied");
    expect(off.version).toBe(before + 1);
    const [entry] = await db.select().from(activityEntries).where(eq(activityEntries.id, off.activity_entry_id!));
    expect(entry).toMatchObject({
      topic: "sharing.updated",
      summary_en: "Mira changed what managers can see: vendors and dues off.",
      visibility: "owners",
      before: { managers_can_see_vendor_dues: true },
      after: { managers_can_see_vendor_dues: false },
    });

    // The same again changes nothing: no entry, no version.
    const again = ok(await run(mira, "set_sharing", { managers_can_see_vendor_dues: false }));
    expect(again.outcome).toBe("unchanged");
    expect(again.activity_entry_id).toBeNull();
    expect(await versionOf()).toBe(before + 1);

    // Diya's vendor pages: no figure, "Not shared with you"; add_quote and the ledger refuse her.
    const summary = await buildMoneySummary(db, diya, W);
    expect(summary.hidden).toEqual(expect.arrayContaining(["vendor_money", "budget"]));
    expect(summary.vendors).toBeUndefined();
    expect(summary.totals).toBeUndefined();
    const sharing = await loadSharing(db, W);
    expect(() => assertReadModelAccess("vendor_ledger", diya, W, sharing!)).toThrowError(/Not shared with you/);
    const quote = { vendor_id: VEN_CAT, pricing: "lump_sum", amount_inr: 190_000 };
    const refused = await run(diya, "add_quote", quote);
    expect(refused).toMatchObject({ ok: false, error: { code: "forbidden" } });
    expect(httpStatusOf(refused)).toBe(403);
    expect(await versionOf()).toBe(before + 1);

    // Mira shares it again: Diya's quote goes through.
    const on = ok(await run(mira, "set_sharing", { managers_can_see_vendor_dues: true }));
    expect(on.outcome).toBe("applied");
    const allowed = await run(diya, "add_quote", quote);
    expect(allowed).toMatchObject({ ok: true, outcome: "applied" });
    expect((await buildMoneySummary(db, diya, W)).vendors?.length).toBeGreaterThan(0);
  }, 60_000);

  // -------------------------------------------------------------------------
  // Copy a: AT-9.6, the server enforces the manager's limits
  // -------------------------------------------------------------------------

  it("AT-9.6: Diya's budget, shagun and record-payment calls answer 403, record-payment with approval_required", async () => {
    const before = await versionOf();
    const entriesBefore = (await entriesOf()).length;
    const budget = await run(diya, "set_budget_line", { budget_category: "catering", planned_inr: 900_000 });
    expect(budget).toMatchObject({ ok: false, error: { code: "forbidden" } });
    expect(httpStatusOf(budget)).toBe(403);
    const shagun = await run(diya, "record_shagun", { giver_name: "Test", kind: "cash", amount_inr: 1_100 });
    expect(shagun).toMatchObject({ ok: false, error: { code: "forbidden" } });
    expect(httpStatusOf(shagun)).toBe(403);
    const payment = await run(diya, "record_payment", {
      vendor_id: VEN_CAT,
      amount_inr: 10_000,
      paid_on: "2026-11-24",
      method: "upi",
    });
    expect(payment).toMatchObject({ ok: false, error: { code: "approval_required" } });
    expect(httpStatusOf(payment)).toBe(403);
    expect(await versionOf()).toBe(before);
    expect((await entriesOf()).length).toBe(entriesBefore);

    // Her reads: no budget, totals or category lines at D0 (budget sharing off), and no shagun.
    const summary = await buildMoneySummary(db, diya, W);
    expect(summary.hidden).toContain("budget");
    expect(summary.totals).toBeUndefined();
    expect(summary.categories).toBeUndefined();
    const sharing = await loadSharing(db, W);
    expect(() => assertReadModelAccess("shagun_register", diya, W, sharing!)).toThrowError();
    try {
      assertReadModelAccess("shagun_register", diya, W, sharing!);
    } catch (error) {
      expect(error).toMatchObject({ body: { code: "forbidden" } });
    }
  }, 60_000);

  // -------------------------------------------------------------------------
  // Throwaway weddings
  // -------------------------------------------------------------------------

  it("refuses to remove the only owner (409 last_owner), and a removed member then fails every check", async () => {
    const owner = newUser(`owner-${short()}@example.com`);
    const manager = newUser(`manager-${short()}@example.com`);
    const { wedding_id, owner_member, others } = await throwawayWedding(owner, [{ role: "manager", actor: manager, display_name: "Meera" }]);
    const ownerActor = memberActor(owner, wedding_id, owner_member, "owner", "Asha");
    const managerActor = memberActor(manager, wedding_id, others[0], "manager", "Meera");
    const version0 = await versionOf(wedding_id);

    const lastOwner = await run(ownerActor, "remove_member", { member_id: owner_member }, { wedding_id });
    expect(lastOwner).toMatchObject({ ok: false, error: { code: "last_owner" } });
    expect(httpStatusOf(lastOwner)).toBe(409);
    expect(await versionOf(wedding_id)).toBe(version0);
    expect(await entriesOf(wedding_id)).toHaveLength(0);

    // Before removal the manager can work; after it, every check fails.
    const event = { event_kind: "haldi", event_date: "2027-02-13" };
    expect(await run(managerActor, "create_event", event, { wedding_id })).toMatchObject({ ok: true, outcome: "applied" });
    ok(await run(ownerActor, "remove_member", { member_id: others[0] }, { wedding_id }));
    expect(await loadMemberActor({ user_id: manager.user_id, email: manager.email }, wedding_id)).toBeNull();
    expect(await readMemberVersion(db, manager.user_id, wedding_id)).toBeNull();
    const stale = await run(managerActor, "create_event", event, { wedding_id });
    expect(stale).toMatchObject({ ok: false, error: { code: "forbidden", message: "You are not a member of this wedding." } });
    await expect(buildWeddingProfile(db, managerActor, wedding_id)).rejects.toMatchObject({ body: { code: "not_found" } });
    await expect(buildTeam(db, managerActor, wedding_id)).rejects.toMatchObject({ body: { code: "forbidden" } });
    await expect(buildMoneySummary(db, managerActor, wedding_id)).rejects.toMatchObject({ body: { code: "not_found" } });
    expect((await buildUserActor({ user_id: manager.user_id, email: manager.email })).wedding_id).toBeNull();
    expect(await db.select().from(events).where(eq(events.wedding_id, wedding_id))).toHaveLength(1);

    // Removing them again, or an unknown member, is 404 not_found.
    expect(await run(ownerActor, "remove_member", { member_id: others[0] }, { wedding_id })).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });

    // With a second owner, one owner may go; the last one still may not.
    const coOwner = newUser(`coowner-${short()}@example.com`);
    const [coRow] = await db
      .insert(members)
      .values({ wedding_id, user_id: coOwner.user_id, role: "owner", display_name: "Ravi" })
      .returning({ id: members.id });
    ok(await run(ownerActor, "remove_member", { member_id: coRow.id }, { wedding_id }));
    expect(await run(ownerActor, "remove_member", { member_id: owner_member }, { wedding_id })).toMatchObject({
      ok: false,
      error: { code: "last_owner" },
    });

    // A removed member invited back joins the same row again, with the invite's role.
    const back = ok(await run(ownerActor, "invite_member", { email: manager.email, role: "owner" }, { wedding_id }));
    const rejoined = ok(await run(manager, "accept_member_invite", { token: tokenOf(back.result.join_url) }, { wedding_id: null }));
    expect(rejoined.result).toMatchObject({ wedding_id, member_id: others[0], role: "owner", display_name: "Meera" });
    expect(await loadMemberActor({ user_id: manager.user_id, email: manager.email }, wedding_id)).toMatchObject({ role: "owner" });
    // Now an active member: inviting the address again is already_member.
    expect(await run(ownerActor, "invite_member", { email: manager.email, role: "manager" }, { wedding_id })).toMatchObject({
      ok: false,
      error: { code: "already_member" },
    });
  }, 60_000);

  it("answers invite_invalid for expired and malformed tokens, already_member for a member, and one applied of two racing accepts", async () => {
    const owner = newUser(`owner-${short()}@example.com`);
    const { wedding_id, owner_member } = await throwawayWedding(owner);
    const ownerActor = memberActor(owner, wedding_id, owner_member, "owner", "Asha");

    // The owner's own address: already_member at invite time.
    expect(await run(ownerActor, "invite_member", { email: owner.email, role: "manager" }, { wedding_id })).toMatchObject({
      ok: false,
      error: { code: "already_member", field: "email" },
    });

    // An expired invite (49 hours old) is not pending: invite_invalid, and the team view skips it.
    const expiredToken = generateLinkToken();
    const expiredEmail = `late-${short()}@example.com`;
    const createdAt = new Date(Date.now() - INVITE_TTL_MS - 3_600_000);
    await db.insert(memberInvites).values({
      wedding_id,
      email: expiredEmail,
      role: "manager",
      token_hash: hashLinkToken(expiredToken).hash,
      expires_at: new Date(createdAt.getTime() + INVITE_TTL_MS),
      invited_by_member_id: owner_member,
      created_at: createdAt,
    });
    expect(await run(newUser(expiredEmail), "accept_member_invite", { token: expiredToken }, { wedding_id: null })).toEqual({
      ok: false,
      error: INVITE_INVALID_BODY,
    });
    expect(await loadJoinInvite(db, expiredToken, { user_id: randomUUID(), email: expiredEmail })).toEqual({ status: "invalid" });
    for (const token of ["short", "x".repeat(64), `${expiredToken.slice(0, 42)}!`, generateLinkToken()]) {
      expect(await run(newUser(expiredEmail), "accept_member_invite", { token }, { wedding_id: null })).toEqual({
        ok: false,
        error: INVITE_INVALID_BODY,
      });
    }

    // A pending invite, as the team view and the join page see it.
    const email = `racer-${short()}@example.com`;
    const invited = ok(await run(ownerActor, "invite_member", { email, role: "manager", display_name: "Kiran" }, { wedding_id }));
    const token = tokenOf(invited.result.join_url);
    const team = await buildTeam(db, ownerActor, wedding_id);
    expect(team.pending_invites).toEqual([
      expect.objectContaining({ member_invite_id: invited.result.member_invite_id, email, role: "manager", display_name: "Kiran", seed_key: null }),
    ]);
    expect(team.pending_invites[0].expires_at).toMatch(/\+05:30$/);
    const racer = newUser(email);
    expect(await loadJoinInvite(db, token, { user_id: racer.user_id, email })).toEqual({
      status: "ready",
      wedding_id,
      wedding_name: "Asha & Ravi",
      wedding_date: "2027-02-14",
      role: "manager",
      role_label: "Event manager",
    });
    expect(await loadJoinInvite(db, token, { user_id: racer.user_id, email: "other@example.com" })).toEqual({ status: "email_mismatch" });
    expect(await loadJoinInvite(db, "not-a-token", { user_id: racer.user_id, email })).toEqual({ status: "invalid" });

    // An existing member holding an invite for their own address: already_member, with the wedding.
    const memberToken = generateLinkToken();
    await db.insert(memberInvites).values({
      wedding_id,
      email: owner.email,
      role: "manager",
      token_hash: hashLinkToken(memberToken).hash,
      expires_at: new Date(Date.now() + INVITE_TTL_MS),
    });
    expect(await loadJoinInvite(db, memberToken, { user_id: owner.user_id, email: owner.email })).toEqual({ status: "already_member", wedding_id });
    expect(await run(owner, "accept_member_invite", { token: memberToken }, { wedding_id: null })).toMatchObject({
      ok: false,
      error: { code: "already_member", current: { wedding_id } },
    });

    // Two accepts of one link at once, with different keys: exactly one joins.
    const version0 = await versionOf(wedding_id);
    const results = await Promise.all([
      run(racer, "accept_member_invite", { token }, { wedding_id: null }),
      run(racer, "accept_member_invite", { token }, { wedding_id: null }),
    ]);
    expect(results.filter((response) => response.ok && response.outcome === "applied")).toHaveLength(1);
    expect(results.filter((response) => !response.ok && response.error.code === "invite_invalid")).toHaveLength(1);
    expect(await db.select().from(members).where(and(eq(members.wedding_id, wedding_id), eq(members.user_id, racer.user_id)))).toHaveLength(1);
    expect(await versionOf(wedding_id)).toBe(version0 + 1);
    expect((await buildTeam(db, ownerActor, wedding_id)).pending_invites.map((row) => row.email)).not.toContain(email);
  }, 60_000);

  it("I2a for a join: one key sent five times at once applies once and replays the rest", async () => {
    // No wedding in the envelope, so the same-key twins queue on the key's advisory lock, not
    // on the wedding row; each must still replay, never 500 or invite_invalid.
    const owner = newUser(`owner-${short()}@example.com`);
    const { wedding_id, owner_member } = await throwawayWedding(owner);
    const ownerActor = memberActor(owner, wedding_id, owner_member, "owner", "Asha");
    const email = `twin-${short()}@example.com`;
    const invited = ok(await run(ownerActor, "invite_member", { email, role: "manager" }, { wedding_id }));
    const token = tokenOf(invited.result.join_url);
    const invitee = newUser(email);
    const key = `a6-twin-${randomUUID()}`;
    const version0 = await versionOf(wedding_id);
    const entries0 = (await entriesOf(wedding_id)).length;

    const results = await Promise.all(
      Array.from({ length: 5 }, () => run(invitee, "accept_member_invite", { token }, { wedding_id: null, key })),
    );
    expect(results.filter((response) => response.ok && response.outcome === "applied")).toHaveLength(1);
    expect(results.filter((response) => response.ok && response.outcome === "replayed")).toHaveLength(4);
    const member_ids = new Set(results.map((response) => (response.ok ? (response.result as { member_id?: string }).member_id : null)));
    expect(member_ids.size).toBe(1);
    expect(await versionOf(wedding_id)).toBe(version0 + 1);
    expect(await entriesOf(wedding_id)).toHaveLength(entries0 + 1);
  }, 60_000);

  it("serialises a join against a cancel and two owners removing each other (one wins, one entry each)", async () => {
    for (let round = 0; round < 3; round += 1) {
      const owner = newUser(`owner-${short()}@example.com`);
      const { wedding_id, owner_member } = await throwawayWedding(owner);
      const ownerActor = memberActor(owner, wedding_id, owner_member, "owner", "Asha");
      const email = `race-${short()}@example.com`;
      const invited = ok(await run(ownerActor, "invite_member", { email, role: "manager" }, { wedding_id }));
      const invitee = newUser(email);
      const entries0 = (await entriesOf(wedding_id)).length;

      const [accept, revoke] = await Promise.all([
        run(invitee, "accept_member_invite", { token: tokenOf(invited.result.join_url) }, { wedding_id: null }),
        run(ownerActor, "revoke_member_invite", { member_invite_id: invited.result.member_invite_id }, { wedding_id }),
      ]);
      // Exactly one applies; the loser answers invite_invalid (the invite is no longer pending).
      expect([accept.ok, revoke.ok].filter(Boolean)).toHaveLength(1);
      const loser = accept.ok ? revoke : accept;
      expect(loser).toMatchObject({ ok: false, error: { code: "invite_invalid" } });
      const [invite] = await db.select().from(memberInvites).where(eq(memberInvites.id, invited.result.member_invite_id));
      expect(Boolean(invite.accepted_at)).toBe(accept.ok);
      expect(Boolean(invite.revoked_at)).toBe(revoke.ok);
      const joined = await db.select().from(members).where(and(eq(members.wedding_id, wedding_id), eq(members.user_id, invitee.user_id)));
      expect(joined).toHaveLength(accept.ok ? 1 : 0);
      expect(await entriesOf(wedding_id)).toHaveLength(entries0 + 1);
    }

    // Two owners removing each other at once: the wedding lock orders them, so one remains.
    const owner = newUser(`owner-${short()}@example.com`);
    const coOwner = newUser(`coowner-${short()}@example.com`);
    const { wedding_id, owner_member, others } = await throwawayWedding(owner, [{ role: "owner", actor: coOwner, display_name: "Ravi" }]);
    const [first, second] = await Promise.all([
      run(memberActor(owner, wedding_id, owner_member, "owner", "Asha"), "remove_member", { member_id: others[0] }, { wedding_id }),
      run(memberActor(coOwner, wedding_id, others[0], "owner", "Ravi"), "remove_member", { member_id: owner_member }, { wedding_id }),
    ]);
    expect([first.ok, second.ok].filter(Boolean)).toHaveLength(1);
    // The loser was removed by the winner first, so it fails the member check under the lock.
    expect(first.ok ? second : first).toMatchObject({ ok: false, error: { code: "forbidden" } });
    const rows = await db.select().from(members).where(eq(members.wedding_id, wedding_id));
    expect(rows.filter((row) => row.removed_at === null && row.role === "owner")).toHaveLength(1);
  }, 60_000);
});
