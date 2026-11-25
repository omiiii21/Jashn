import { createHash, randomUUID } from "node:crypto";

import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CommandFailure, commandSchemas, type CommandEnvelope, type CommandName, type CommandResponse } from "@/contracts/commands";
import type { CommandActor, GuestActor, GuestInvitationView, SessionActor } from "@/contracts/domain";
import { SEED_KEYS, fixtureGuestActor, fixtureSessionActor, invitationKey, namedGuestKey } from "@/contracts/fixtures";
import type { CommandHandlerResult } from "@/contracts/services";
import { createDb, type Db } from "@/db/client";
import { seededId } from "@/db/ids";
import {
  activityEntries,
  commitmentVersions,
  commitments,
  guestContacts,
  guests,
  households,
  invitationLinks,
  invitations,
  weddings,
} from "@/db/schema";
import { localDatabaseUrl } from "@/db/testing";
import { applySeedState, ensureInvitationLinks } from "@/db/seed-apply";
import { buildSeedDataset, fallbackUserId, seedAccounts, type SeedDataset } from "@/db/seed-data";
import { loadRsvpTotalsRows } from "@/server/read-models/rsvp-totals";

import { createDispatcher } from "./dispatcher";
import { GUEST_NOT_FOUND_MESSAGE, guestHandlers } from "./guests";

/**
 * A5's guest commands against a real Postgres (npm run test:db, or the throwaway local
 * database). Uses sample copy "demo" in that database only: it seeds it to D0, runs the
 * commands, and leaves it at D0 again. Handlers run as the dispatcher runs them (wedding row
 * locked first, input parsed); the idempotency and concurrency rows go through the dispatcher.
 */

const COPY = "demo" as const;
// Resets a whole sample copy, so it runs only against a local Postgres (src/db/testing.ts).
const url = localDatabaseUrl();
const id = (table: string, seed_key: string) => seededId(COPY, table, seed_key);
const W = id("weddings", SEED_KEYS.wedding);
const EVT_REC = id("events", "EVT-REC");
const EVT_SAN = id("events", "EVT-SAN");
const EVT_MEH = id("events", "EVT-MEH");
const TARA = id("guests", namedGuestKey(40));
const NIKHIL = id("guests", namedGuestKey(27));
const PRACHI = id("guests", namedGuestKey(28));
const H16 = id("households", "H16");
const H13 = id("households", "H13");
const H_SYN = id("households", SEED_KEYS.synthetic_household);
const COM_01 = id("commitments", "COM-01");
const TARA_REC = id("invitations", invitationKey(namedGuestKey(40), "EVT-REC"));

let db: Db;
let close: () => Promise<void>;
let dataset: SeedDataset;

const mira: SessionActor = fixtureSessionActor("mira", COPY);
const diya: SessionActor = fixtureSessionActor("diya", COPY);
const tara: GuestActor = fixtureGuestActor(COPY);

/** Runs one handler as the dispatcher would: the wedding row locked first, the input parsed. */
async function run<C extends CommandName>(command: C, actor: CommandActor, raw: Record<string, unknown>): Promise<CommandHandlerResult<C>> {
  const handler = guestHandlers[command];
  if (!handler) throw new Error(`no handler for ${command}`);
  return db.transaction(async (tx) => {
    await tx.select({ id: weddings.id }).from(weddings).where(eq(weddings.id, W)).for("update");
    const input = commandSchemas[command].parse(raw);
    const envelope = { wedding_id: W, command, input: raw, source: actor.kind === "guest" ? "guest_link" : "ui" } as CommandEnvelope;
    return (await handler({ command, actor, wedding_id: W, input, envelope, tx, now: new Date().toISOString() })) as CommandHandlerResult<C>;
  });
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

const dispatcher = () =>
  createDispatcher({
    db: () => db,
    registry: () => guestHandlers,
    afterCommit: {},
    schedule: () => {},
    voiceGate: async () => ({ status: "paused", cause: "switch_off" }),
    log: () => {},
  });

function rsvpEnvelope(responses: Record<string, unknown>[], key: string): CommandEnvelope<"submit_rsvp"> {
  return { wedding_id: W, command: "submit_rsvp", input: { responses }, idempotency_key: key, source: "guest_link" } as CommandEnvelope<"submit_rsvp">;
}

const taraReception = (rsvp_status: "attending" | "declined", plus_ones = 0) => ({ guest_id: TARA, event_id: EVT_REC, rsvp_status, plus_ones });

async function reception() {
  const [row] = await loadRsvpTotalsRows(db, W, EVT_REC);
  return row;
}

async function sangeet() {
  const [row] = await loadRsvpTotalsRows(db, W, EVT_SAN);
  return row;
}

async function versionOf(): Promise<number> {
  const [row] = await db.select({ version: weddings.version }).from(weddings).where(eq(weddings.id, W));
  return Number(row.version);
}

async function taraReceptionRows() {
  return db.select().from(invitations).where(and(eq(invitations.guest_id, TARA), eq(invitations.event_id, EVT_REC)));
}

async function com01State() {
  const commitment = await db.select().from(commitments).where(eq(commitments.id, COM_01));
  const versions = await db.select().from(commitmentVersions).where(eq(commitmentVersions.commitment_id, COM_01)).orderBy(asc(commitmentVersions.version_no));
  return JSON.stringify({ commitment, versions });
}

/** Puts rows back to their D0 answers without a full reseed. */
async function resetAnswers(): Promise<void> {
  await db
    .update(invitations)
    .set({ rsvp_status: "pending", plus_ones: 0, responded_at: null, responded_via: null, rsvp_updated_by_member_id: null })
    .where(
      and(
        eq(invitations.event_id, EVT_REC),
        inArray(invitations.guest_id, [TARA, NIKHIL, PRACHI]),
      ),
    );
}

describe.skipIf(!url)("guest commands (database, copy demo)", () => {
  beforeAll(async () => {
    const created = createDb(url!, { max: 6 });
    db = created.db;
    close = () => created.client.end();
    const user_ids = Object.fromEntries(seedAccounts(COPY).map((account) => [account.email, fallbackUserId(account.email)]));
    dataset = buildSeedDataset(COPY, { user_ids });
    await db.transaction(async (tx) => {
      await applySeedState(tx, dataset, { now: new Date() });
      await ensureInvitationLinks(tx, dataset);
    });
  }, 60_000);

  afterAll(async () => {
    if (!db) return;
    // Leave the copy at D0: live guests, households and activity go; links stay (3.7).
    await db.transaction(async (tx) => {
      await applySeedState(tx, dataset, { now: new Date() });
      await ensureInvitationLinks(tx, dataset);
    });
    await close();
  }, 60_000);

  // -------------------------------------------------------------------------
  // submit_rsvp: Tara's tap (domain 7.1 step 7, AT-4.2)
  // -------------------------------------------------------------------------

  it("Tara's tap moves the reception to 230 and leaves COM-01 unchanged", async () => {
    await resetAnswers();
    const before = await reception();
    expect([before.invited, before.attending, before.declined, before.pending, before.confirmed_headcount]).toEqual([250, 229, 9, 12, 229]);
    const com01Before = await com01State();

    const handled = await run("submit_rsvp", tara, { responses: [taraReception("attending")] });
    expect(handled.outcome).toBe("applied");
    expect(handled.activity?.summary_en).toBe("Tara Bhat is attending the reception.");
    expect(handled.activity?.topic).toBe("rsvp.submitted");
    expect(handled.activity?.visibility).toBe("members");
    expect(handled.activity?.actor_label).toBe("Tara Bhat");

    const after = await reception();
    expect([after.invited, after.attending, after.declined, after.pending, after.confirmed_headcount]).toEqual([250, 230, 9, 11, 230]);
    const san = await sangeet();
    expect([san.invited, san.attending, san.declined, san.pending]).toEqual([150, 136, 8, 6]);
    expect(await com01State()).toBe(com01Before);

    // R6: the same row, now attending from the guest link.
    const rows = await taraReceptionRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(TARA_REC);
    expect(rows[0].rsvp_status).toBe("attending");
    expect(rows[0].plus_ones).toBe(0);
    expect(rows[0].responded_via).toBe("guest_link");

    // The result is her refreshed view: two functions, no money, no counts (G2).
    const view = handled.result as GuestInvitationView;
    expect(view.functions.map((fn) => fn.event_id)).toEqual([EVT_SAN, EVT_REC]);
    expect(view.household.guests.map((guest) => guest.full_name)).toEqual(["Tara Bhat"]);
    expect(view.functions[1].responses).toEqual([{ guest_id: TARA, rsvp_status: "attending", plus_ones: 0, max_plus_ones: 0 }]);
    expect(JSON.stringify(view)).not.toMatch(/_inr|₹|attending_count|confirmed_headcount/);

    // R7: the same answer again is `unchanged` and writes nothing.
    const again = await run("submit_rsvp", tara, { responses: [taraReception("attending")] });
    expect(again.outcome).toBe("unchanged");
    expect(again.activity).toBeNull();
    expect((await reception()).attending).toBe(230);
  });

  it("answers every out-of-scope guest request with the one 404 and writes nothing (AT-4.6)", async () => {
    await resetAnswers();
    const expectGuest404 = async (responses: Record<string, unknown>[]) => {
      const failure = await failureOf(run("submit_rsvp", tara, { responses }));
      expect(failure.body).toEqual({ code: "not_found", message: GUEST_NOT_FOUND_MESSAGE, field: null });
    };
    await expectGuest404([{ guest_id: TARA, event_id: EVT_MEH, rsvp_status: "attending" }]);
    await expectGuest404([{ guest_id: NIKHIL, event_id: EVT_REC, rsvp_status: "attending" }]);
    await expectGuest404([{ guest_id: seededId("a", "guests", namedGuestKey(40)), event_id: EVT_REC, rsvp_status: "attending" }]);
    await expectGuest404([{ guest_id: TARA, event_id: seededId("a", "events", "EVT-REC"), rsvp_status: "attending" }]);
    // One good answer beside a bad one: the whole request fails.
    await expectGuest404([taraReception("attending"), { guest_id: TARA, event_id: EVT_MEH, rsvp_status: "attending" }]);

    // Scope comes before every 422: a bad plus-ones beside an out-of-scope id is still the 404.
    await expectGuest404([taraReception("attending", 1), { guest_id: TARA, event_id: EVT_MEH, rsvp_status: "attending" }]);
    await expectGuest404([taraReception("attending"), taraReception("attending"), { guest_id: NIKHIL, event_id: EVT_REC, rsvp_status: "attending" }]);

    const limit = await failureOf(run("submit_rsvp", tara, { responses: [taraReception("attending", 1)] }));
    expect(limit.body.code).toBe("plus_ones_exceeds_limit");
    expect(limit.http_status).toBe(422);
    const twice = await failureOf(run("submit_rsvp", tara, { responses: [taraReception("attending"), taraReception("declined")] }));
    expect(twice.body).toMatchObject({ code: "validation_failed", field: "responses.1" });

    const rows = await taraReceptionRows();
    expect(rows[0].rsvp_status).toBe("pending");
    expect((await reception()).attending).toBe(229);
  });

  // -------------------------------------------------------------------------
  // Idempotency and concurrency through the dispatcher (acceptance 4.3)
  // -------------------------------------------------------------------------

  it("replays the same key, refuses it with another body, and is unchanged with a new key", async () => {
    await resetAnswers();
    const d = dispatcher();
    const key = randomUUID();
    const v0 = await versionOf();

    const first = await d.runCommand(tara, rsvpEnvelope([taraReception("attending")], key));
    expect(first.ok && first.outcome).toBe("applied");
    const second = await d.runCommand(tara, rsvpEnvelope([taraReception("attending")], key));
    expect(second.ok && second.outcome).toBe("replayed");
    expect(await versionOf()).toBe(v0 + 1);
    const entries = await db
      .select({ id: activityEntries.id, actor_type: activityEntries.actor_type, actor_label: activityEntries.actor_label })
      .from(activityEntries)
      .where(and(eq(activityEntries.wedding_id, W), eq(activityEntries.idempotency_key, key)));
    expect(entries).toHaveLength(1);
    expect(entries[0].actor_type).toBe("guest");
    expect(entries[0].actor_label).toBe("Tara Bhat");

    const reused = await d.runCommand(tara, rsvpEnvelope([taraReception("declined")], key));
    expect(reused.ok).toBe(false);
    if (!reused.ok) expect(reused.error.code).toBe("idempotency_key_reused");

    const fresh = await d.runCommand(tara, rsvpEnvelope([taraReception("attending")], randomUUID()));
    expect(fresh.ok && fresh.outcome).toBe("unchanged");
    expect(await versionOf()).toBe(v0 + 1);
    expect((await reception()).attending).toBe(230);
  });

  it("ten parallel submissions of one answer give one applied and nine unchanged", async () => {
    await resetAnswers();
    const d = dispatcher();
    const responses = await Promise.all(
      Array.from({ length: 10 }, () => d.runCommand(tara, rsvpEnvelope([taraReception("attending")], randomUUID()))),
    );
    const outcomes = responses.map((response: CommandResponse<"submit_rsvp">) => (response.ok ? response.outcome : response.error.code));
    expect(outcomes.filter((outcome) => outcome === "applied")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome === "unchanged")).toHaveLength(9);
    expect(await taraReceptionRows()).toHaveLength(1);
    const after = await reception();
    expect([after.invited, after.attending, after.pending]).toEqual([250, 230, 11]);
  });

  it("ten parallel submissions alternating answers keep the counts equal to the rows", async () => {
    await resetAnswers();
    const d = dispatcher();
    const responses = await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        d.runCommand(tara, rsvpEnvelope([taraReception(index % 2 === 0 ? "attending" : "declined")], randomUUID())),
      ),
    );
    for (const response of responses) {
      expect(response.ok).toBe(true);
      if (response.ok) expect(["applied", "unchanged"]).toContain(response.outcome);
    }
    const rows = await taraReceptionRows();
    expect(rows).toHaveLength(1);
    const after = await reception();
    expect(after.invited).toBe(250);
    expect(after.attending + after.declined + after.pending).toBe(250);
    expect(after.attending).toBe(rows[0].rsvp_status === "attending" ? 230 : 229);
    expect(after.declined).toBe(rows[0].rsvp_status === "declined" ? 10 : 9);
  });

  // -------------------------------------------------------------------------
  // set_rsvp (R10, AT-4.7)
  // -------------------------------------------------------------------------

  it("records members' replies on a guest's behalf, and refuses a guest who isn't invited", async () => {
    await resetAnswers();
    const handled = await run("set_rsvp", mira, { guest_ids: [NIKHIL, PRACHI], event_id: EVT_REC, rsvp_status: "attending" });
    expect(handled.outcome).toBe("applied");
    expect(handled.activity?.summary_en).toBe("Mira marked 2 guests as attending for the reception: Nikhil Jain, Prachi Jain.");
    const totals = (handled.result as { rsvp_totals: { attending: number; pending: number } }).rsvp_totals;
    expect([totals.attending, totals.pending]).toEqual([231, 10]);
    const rows = await db.select().from(invitations).where(and(eq(invitations.event_id, EVT_REC), inArray(invitations.guest_id, [NIKHIL, PRACHI])));
    for (const row of rows) {
      expect(row.responded_via).toBe("member");
      expect(row.rsvp_updated_by_member_id).toBe(mira.member_id);
    }

    const notInvited = await failureOf(run("set_rsvp", diya, { guest_ids: [TARA], event_id: EVT_MEH, rsvp_status: "attending" }));
    expect(notInvited.body.code).toBe("not_invited");
    expect(notInvited.body.message).toContain("Tara Bhat");

    // A member's answer, then the guest's same answer: unchanged (acceptance 4.3).
    await run("set_rsvp", diya, { guest_ids: [TARA], event_id: EVT_REC, rsvp_status: "attending" });
    const same = await run("submit_rsvp", tara, { responses: [taraReception("attending")] });
    expect(same.outcome).toBe("unchanged");
    await resetAnswers();
  });

  // -------------------------------------------------------------------------
  // add_guest and set_invitations
  // -------------------------------------------------------------------------

  it("refuses a manager's event_ids, max_plus_ones and a linked household", async () => {
    const withEvents = await failureOf(run("add_guest", diya, { full_name: "Asha Rao", event_ids: [EVT_REC] }));
    expect(withEvents.body.code).toBe("forbidden");
    expect(withEvents.http_status).toBe(403);
    const withPlusOnes = await failureOf(run("add_guest", diya, { full_name: "Asha Rao", max_plus_ones: 1 }));
    expect(withPlusOnes.body.code).toBe("forbidden");
    // H16 has an active link: its page lists its members' names.
    const linked = await failureOf(run("add_guest", diya, { full_name: "Asha Bhat", household_id: H16 }));
    expect(linked.body.code).toBe("forbidden");
    // The synthetic placeholder collapses on Guests (4.4): no named guest goes in, for anyone.
    const synthetic = await failureOf(run("add_guest", mira, { full_name: "Asha Rao", household_id: H_SYN }));
    expect(synthetic.body).toMatchObject({ code: "validation_failed", field: "household_id" });

    const added = await run("add_guest", diya, { full_name: "Asha Rao", relation: "Diya's cousin" });
    expect(added.outcome).toBe("applied");
    const result = added.result as { guest_id: string; household_id: string; household_created: boolean; invitation_ids: string[] };
    expect(result.household_created).toBe(true);
    expect(result.invitation_ids).toEqual([]);
    const [household] = await db.select().from(households).where(eq(households.id, result.household_id));
    expect(household.name).toBe("Rao");
    expect(household.primary_guest_id).toBe(result.guest_id);
    expect(added.activity?.summary_en).toBe("Diya added the guest Asha Rao.");
  });

  it("lets an owner add and invite a guest, and changes the invitation set (R11)", async () => {
    const added = await run("add_guest", mira, {
      full_name: "Tara Bhat",
      household_name: "Bhat (Pune)",
      event_ids: [EVT_REC, EVT_SAN],
      phone: "+91 90000 09999",
    });
    expect(added.outcome).toBe("applied");
    expect(added.warnings?.map((warning) => warning.kind)).toEqual(["possible_duplicate"]);
    expect(added.activity?.summary_en).toBe("Mira added the guest Tara Bhat, invited to the sangeet and the reception.");
    expect(JSON.stringify(added.activity)).not.toContain("90000");
    expect(added.activity?.after).toMatchObject({ contact_added: true });
    const { guest_id } = added.result as { guest_id: string };
    const rows = await db.select().from(invitations).where(and(eq(invitations.guest_id, guest_id), isNull(invitations.revoked_at)));
    expect(rows.map((row) => row.rsvp_status)).toEqual(["pending", "pending"]);
    const [contact] = await db.select().from(guestContacts).where(eq(guestContacts.guest_id, guest_id));
    expect(contact.phone).toBe("+91 90000 09999");

    const crossCopy = await failureOf(run("add_guest", mira, { full_name: "Asha Rao", event_ids: [seededId("a", "events", "EVT-REC")] }));
    expect(crossCopy.body.code).toBe("not_found");

    // Owner only.
    const byManager = await failureOf(run("set_invitations", diya, { guest_id, event_ids: [EVT_REC] }));
    expect(byManager.body.code).toBe("forbidden");

    await run("set_rsvp", mira, { guest_ids: [guest_id], event_id: EVT_SAN, rsvp_status: "attending" });
    const removed = await run("set_invitations", mira, { guest_id, event_ids: [EVT_REC] });
    expect(removed.outcome).toBe("applied");
    expect(removed.activity?.summary_en).toBe("Mira changed Tara Bhat's invitations: removed the sangeet.");
    const same = await run("set_invitations", mira, { guest_id, event_ids: [EVT_REC] });
    expect(same.outcome).toBe("unchanged");

    const reinvited = await run("set_invitations", mira, { guest_id, event_ids: [EVT_SAN, EVT_REC], max_plus_ones: 2 });
    expect(reinvited.activity?.summary_en).toBe("Mira changed Tara Bhat's invitations: added the sangeet; plus-ones limit set to 2.");
    const [sangeetRow] = await db.select().from(invitations).where(and(eq(invitations.guest_id, guest_id), eq(invitations.event_id, EVT_SAN)));
    expect(sangeetRow.revoked_at).toBeNull();
    expect(sangeetRow.rsvp_status).toBe("pending");
    expect(sangeetRow.max_plus_ones).toBe(2);
  });

  // -------------------------------------------------------------------------
  // set_dietary (AT-4.9)
  // -------------------------------------------------------------------------

  it("lets Tara set her own dietary note and nobody else's", async () => {
    const handled = await run("set_dietary", tara, { guest_id: TARA, dietary_note: "Mushroom allergy" });
    expect(handled.outcome).toBe("applied");
    expect(handled.activity?.topic).toBe("dietary.updated");
    expect(handled.activity?.actor_label).toBe("Tara Bhat");
    const view = handled.result as unknown as GuestInvitationView;
    expect(view.household.guests[0].dietary_note).toBe("Mushroom allergy");

    const again = await run("set_dietary", tara, { guest_id: TARA, dietary_note: "Mushroom allergy" });
    expect(again.outcome).toBe("unchanged");

    const other = await failureOf(run("set_dietary", tara, { guest_id: NIKHIL, dietary_note: "None" }));
    expect(other.body).toEqual({ code: "not_found", message: GUEST_NOT_FOUND_MESSAGE, field: null });

    const cleared = await run("set_dietary", mira, { guest_id: TARA, dietary_note: null });
    expect(cleared.outcome).toBe("applied");
    expect(cleared.result).toEqual({ guest_id: TARA, dietary_note: null });
  });

  it("answers a guest's dietary note with the one 404 while nothing is published (G5)", async () => {
    const rollback = new Error("rollback");
    const attempt = db.transaction(async (tx) => {
      await tx.select({ id: weddings.id }).from(weddings).where(eq(weddings.id, W)).for("update");
      await tx.update(weddings).set({ published_revision: null }).where(eq(weddings.id, W));
      const raw = { guest_id: TARA, dietary_note: "Peanut allergy" };
      const envelope = { wedding_id: W, command: "set_dietary", input: raw, source: "guest_link" } as CommandEnvelope;
      const failure = await failureOf(
        guestHandlers.set_dietary!({
          command: "set_dietary",
          actor: tara,
          wedding_id: W,
          input: commandSchemas.set_dietary.parse(raw),
          envelope,
          tx,
          now: new Date().toISOString(),
        }),
      );
      expect(failure.body).toEqual({ code: "not_found", message: GUEST_NOT_FOUND_MESSAGE, field: null });
      throw rollback;
    });
    await expect(attempt).rejects.toBe(rollback);
    const [row] = await db.select({ dietary_note: guests.dietary_note }).from(guests).where(eq(guests.id, TARA));
    expect(row.dietary_note).not.toBe("Peanut allergy");
  });

  // -------------------------------------------------------------------------
  // Invitation links (6.3)
  // -------------------------------------------------------------------------

  it("rotates H16's link: the old one is revoked and one new raw token comes back once", async () => {
    const activeLinks = () =>
      db.select().from(invitationLinks).where(and(eq(invitationLinks.household_id, H16), isNull(invitationLinks.revoked_at)));
    const [oldLink] = await activeLinks();
    expect(oldLink).toBeDefined();

    const kept = await run("create_invitation_links", mira, { household_ids: [H16] });
    expect(kept.outcome).toBe("unchanged");
    expect(kept.result).toEqual({ links: [], skipped: [H16] });

    const rotated = await run("create_invitation_links", mira, { household_ids: [H16], rotate: true });
    expect(rotated.outcome).toBe("applied");
    expect(rotated.activity?.visibility).toBe("owners");
    expect(rotated.activity?.summary_en).toBe("Mira created invitation links for 1 household.");
    const { links, skipped } = rotated.result;
    expect(skipped).toEqual([]);
    expect(links).toHaveLength(1);
    const token = /^\/i\/([A-Za-z0-9_-]{43})$/.exec(links[0].url ?? "")?.[1];
    expect(token).toBeDefined();
    expect(JSON.stringify(rotated.activity)).not.toContain(token!);

    const [revokedOld] = await db.select().from(invitationLinks).where(eq(invitationLinks.id, oldLink.id));
    expect(revokedOld.revoked_at).not.toBeNull();
    const active = await activeLinks();
    expect(active).toHaveLength(1);
    expect(active[0].token_hash.equals(createHash("sha256").update(token!, "utf8").digest())).toBe(true);
    expect(active[0].token_hint).toBe(token!.slice(-4));

    const byManager = await failureOf(run("create_invitation_links", diya, { household_ids: [H13] }));
    expect(byManager.body.code).toBe("forbidden");
    const synthetic = await failureOf(run("create_invitation_links", mira, { household_ids: [H_SYN] }));
    expect(synthetic.body.code).toBe("validation_failed");
  });

  it("turns a link off, then answers not_found for a household with no active link", async () => {
    const revoked = await run("revoke_invitation_link", mira, { household_id: H13 });
    expect(revoked.outcome).toBe("applied");
    expect(revoked.activity?.summary_en).toBe("Mira turned off the invitation link for the Jain household.");
    const active = await db.select().from(invitationLinks).where(and(eq(invitationLinks.household_id, H13), isNull(invitationLinks.revoked_at)));
    expect(active).toHaveLength(0);

    const again = await failureOf(run("revoke_invitation_link", mira, { household_id: H13 }));
    expect(again.body.code).toBe("not_found");

    // A new link for a household with none needs no rotate.
    const fresh = await run("create_invitation_links", mira, { household_ids: [H13] });
    expect(fresh.outcome).toBe("applied");
    expect(fresh.result.links).toHaveLength(1);

    // Its replay through the dispatcher keeps the token out (6.3).
    const d = dispatcher();
    const key = randomUUID();
    const envelope = { wedding_id: W, command: "create_invitation_links", input: { household_ids: [H13], rotate: true }, idempotency_key: key, source: "ui" } as CommandEnvelope<"create_invitation_links">;
    const first = await d.runCommand(mira, envelope);
    expect(first.ok && first.outcome).toBe("applied");
    if (first.ok) expect(first.result.links[0].url).toMatch(/^\/i\/[A-Za-z0-9_-]{43}$/);
    const replay = await d.runCommand(mira, envelope);
    expect(replay.ok && replay.outcome).toBe("replayed");
    if (replay.ok) {
      expect(replay.result.tokens_already_issued).toBe(true);
      expect(replay.result.links[0].url).toBeUndefined();
      expect(JSON.stringify(replay)).not.toMatch(/\/i\/[A-Za-z0-9_-]{20,}/);
    }
  });

  it("finds Tara's guests in the guest table", async () => {
    // Sanity: the seed's H16 is Tara alone, so the fixture guest actor matches the database.
    const rows = await db.select({ id: guests.id }).from(guests).where(eq(guests.household_id, H16));
    expect(rows.map((row) => row.id)).toEqual(tara.guest_ids);
  });
});
