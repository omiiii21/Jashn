import { randomBytes, randomUUID } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CommandFailure } from "@/contracts/commands";
import type { AssetDto, GuestActor, SessionActor } from "@/contracts/domain";
import { createDb, type Db } from "@/db/client";
import { buildItinerarySnapshot } from "@/db/itinerary-snapshot";
import {
  assets,
  events,
  guestContacts,
  guests,
  households,
  invitationLinks,
  invitations,
  inviteStyles,
  members,
  publications,
  venues,
  weddings,
} from "@/db/schema";

import { buildGuestInvitationView, readGuestRevision } from "./guest-view";
import { buildRsvpGuestList } from "./rsvp-guest-list";
import { buildRsvpTotals } from "./rsvp-totals";

/**
 * A5's read models against the database in DATABASE_URL (npm run test:db). Every wedding here
 * is a throwaway `is_sample` row with random ids, deleted afterwards (cascade), so the test
 * never touches a seeded copy and never collides with another worker's copy.
 */

const url = process.env.DATABASE_URL;
let db: Db;
let close: () => Promise<void>;
const createdWeddings: string[] = [];

function sessionActor(user_id: string, wedding_id: string, member_id: string, role: "owner" | "manager"): SessionActor {
  return {
    kind: "member",
    user_id,
    email: `rsvp-test-${user_id.slice(0, 8)}@example.com`,
    display_name: role === "owner" ? "Mira" : "Diya",
    wedding_id,
    member_id,
    role,
    is_internal: true,
    is_first_wedding: false,
    preferred_language: "en",
  };
}

const ids = () => ({
  wedding: randomUUID(),
  owner_user: randomUUID(),
  manager_user: randomUUID(),
  owner: randomUUID(),
  manager: randomUUID(),
  garden: randomUUID(),
  banyan: randomUUID(),
  lotus: randomUUID(),
  meh: randomUUID(),
  san: randomUUID(),
  rec: randomUUID(),
  gone: randomUUID(),
  bhat: randomUUID(),
  jain: randomUUID(),
  syn: randomUUID(),
  tara: randomUUID(),
  ravi: randomUUID(),
  nikhil: randomUUID(),
  prachi: randomUUID(),
  photo: randomUUID(),
});

type World = ReturnType<typeof ids> & {
  owner_actor: SessionActor;
  manager_actor: SessionActor;
  guestOf: (household: "bhat" | "jain") => GuestActor;
  publish: (revision: number) => Promise<void>;
  rotatedAt: Date;
};

/**
 * One small wedding: mehendi (12 Dec), sangeet (13 Dec, Garden Hall), reception (14 Dec,
 * Banyan Hall) and a deleted function; Bhat (Tara, and Ravi who is deleted), Jain (Nikhil with
 * two plus-ones, Prachi) and five synthetic guests. REV-1 and REV-2 are published; REV-2 is
 * the latest. Bhat's link was rotated once; Jain's only link is revoked.
 */
async function insertWorld(options: { contacts_shared?: boolean; publish?: boolean } = {}): Promise<World> {
  const w = ids();
  createdWeddings.push(w.wedding);
  await db.insert(weddings).values({
    id: w.wedding,
    bride_name: "Mira",
    groom_name: "Kabir",
    wedding_date: "2026-12-14",
    city: "Bengaluru",
    is_sample: true,
    managers_can_see_vendor_dues: true,
    managers_can_see_guest_contacts: options.contacts_shared ?? false,
    version: 41,
    draft_version: 5,
    created_by_user_id: w.owner_user,
  });
  await db.insert(members).values([
    { id: w.owner, wedding_id: w.wedding, user_id: w.owner_user, role: "owner", display_name: "Mira" },
    { id: w.manager, wedding_id: w.wedding, user_id: w.manager_user, role: "manager", display_name: "Diya" },
  ]);
  await db.insert(venues).values([
    { id: w.garden, wedding_id: w.wedding, name: "Garden Hall", place_name: "Mallige Gardens", locality: "Whitefield", capacity: 180 },
    { id: w.banyan, wedding_id: w.wedding, name: "Banyan Hall", place_name: "Mallige Gardens", locality: "Whitefield", capacity: 220 },
    { id: w.lotus, wedding_id: w.wedding, name: "Lotus Hall", place_name: "Mallige Gardens", locality: "Whitefield", capacity: 300 },
  ]);
  await db.insert(events).values([
    { id: w.rec, wedding_id: w.wedding, event_kind: "reception", title: "Reception", title_hi: "रिसेप्शन", event_date: "2026-12-14", start_time: "19:30", end_time: "23:00", venue_id: w.banyan, dress_code: "Formal evening", description: "Dinner follows.", lead_name: "Diya Fernandes", expected_headcount: 250 },
    { id: w.san, wedding_id: w.wedding, event_kind: "sangeet", title: "Sangeet", title_hi: "संगीत", event_date: "2026-12-13", start_time: "19:00", venue_id: w.garden, expected_headcount: 150 },
    { id: w.meh, wedding_id: w.wedding, event_kind: "mehendi", title: "Mehendi", title_hi: "मेहंदी", event_date: "2026-12-12", start_time: "15:00", expected_headcount: 60 },
    { id: w.gone, wedding_id: w.wedding, event_kind: "other", title: "Cancelled brunch", title_hi: "ब्रंच", event_date: "2026-12-15", start_time: "10:00", deleted_at: new Date() },
  ]);
  await db.insert(assets).values({ id: w.photo, wedding_id: w.wedding, asset_kind: "couple_photo", storage_path: `${w.wedding}/${w.photo}.jpg`, mime_type: "image/jpeg", bytes: 1000 });
  await db.insert(inviteStyles).values({ wedding_id: w.wedding, photo_asset_id: w.photo, wording_en: "With the blessings of our families" });
  await db.insert(households).values([
    { id: w.bhat, wedding_id: w.wedding, name: "Bhat", relation: "Kabir's college friend" },
    { id: w.jain, wedding_id: w.wedding, name: "Jain" },
    { id: w.syn, wedding_id: w.wedding, name: "Imported list (synthetic)", is_synthetic: true },
  ]);
  await db.insert(guests).values([
    { id: w.tara, wedding_id: w.wedding, household_id: w.bhat, full_name: "Tara Bhat", group_label: "FR-K", seed_key: "G40" },
    { id: w.ravi, wedding_id: w.wedding, household_id: w.bhat, full_name: "Ravi Bhat", deleted_at: new Date(), seed_key: "G41" },
    { id: w.nikhil, wedding_id: w.wedding, household_id: w.jain, full_name: "Nikhil Jain", dietary_note: "Jain food", seed_key: "G30" },
    { id: w.prachi, wedding_id: w.wedding, household_id: w.jain, full_name: "Prachi Jain", seed_key: "G31" },
  ]);
  const synthetic = Array.from({ length: 5 }, (_, index) => ({
    id: randomUUID(),
    wedding_id: w.wedding,
    household_id: w.syn,
    full_name: `Imported guest ${String(index + 41).padStart(3, "0")}`,
    is_synthetic: true,
  }));
  await db.insert(guests).values(synthetic);
  await db.insert(guestContacts).values([
    { guest_id: w.tara, wedding_id: w.wedding, phone: "+91 90000 01601", email: "tara.guest@example.com" },
    { guest_id: w.nikhil, wedding_id: w.wedding, phone: "+91 90000 01301" },
  ]);
  await db.insert(invitations).values([
    { wedding_id: w.wedding, guest_id: w.tara, event_id: w.san, rsvp_status: "attending" },
    { wedding_id: w.wedding, guest_id: w.tara, event_id: w.rec, rsvp_status: "pending" },
    { wedding_id: w.wedding, guest_id: w.ravi, event_id: w.rec, rsvp_status: "attending" }, // deleted guest: never counted
    { wedding_id: w.wedding, guest_id: w.nikhil, event_id: w.rec, rsvp_status: "attending", max_plus_ones: 2, plus_ones: 2 },
    { wedding_id: w.wedding, guest_id: w.prachi, event_id: w.rec, rsvp_status: "declined" },
    { wedding_id: w.wedding, guest_id: w.prachi, event_id: w.meh, rsvp_status: "pending", revoked_at: new Date() }, // revoked
    { wedding_id: w.wedding, guest_id: w.nikhil, event_id: w.gone, rsvp_status: "attending" }, // deleted function
    ...synthetic.map((guest, index) => ({
      wedding_id: w.wedding,
      guest_id: guest.id,
      event_id: w.rec,
      rsvp_status: index < 3 ? ("attending" as const) : ("pending" as const),
    })),
  ]);
  const firstLink = new Date("2026-11-20T10:00:00Z");
  const rotatedAt = new Date("2026-11-25T06:00:00Z");
  const hash = () => randomBytes(32);
  await db.insert(invitationLinks).values([
    { wedding_id: w.wedding, household_id: w.bhat, token_hash: hash(), token_hint: "aaaa", created_at: firstLink, revoked_at: rotatedAt },
    { wedding_id: w.wedding, household_id: w.bhat, token_hash: hash(), token_hint: "bbbb", created_at: rotatedAt },
    { wedding_id: w.wedding, household_id: w.jain, token_hash: hash(), token_hint: "cccc", created_at: firstLink, revoked_at: rotatedAt },
  ]);

  const publish = async (revision: number) => {
    const [wedding] = await db.select().from(weddings).where(eq(weddings.id, w.wedding));
    const [style] = await db.select().from(inviteStyles).where(eq(inviteStyles.wedding_id, w.wedding));
    const eventRows = await db.select().from(events).where(eq(events.wedding_id, w.wedding));
    const venueRows = await db.select().from(venues).where(eq(venues.wedding_id, w.wedding));
    const snapshot = buildItinerarySnapshot({ wedding, invite_style: style, events: eventRows, venues: venueRows });
    await db.insert(publications).values({
      wedding_id: w.wedding,
      revision,
      snapshot,
      draft_version: wedding.draft_version,
      published_by_member_id: w.owner,
    });
    await db.update(weddings).set({ published_revision: revision }).where(eq(weddings.id, w.wedding));
  };
  if (options.publish ?? true) {
    await publish(1);
    await publish(2);
  }

  const guestOf = (household: "bhat" | "jain"): GuestActor => ({
    kind: "guest",
    wedding_id: w.wedding,
    household_id: household === "bhat" ? w.bhat : w.jain,
    household_name: household === "bhat" ? "Bhat" : "Jain",
    guest_ids: household === "bhat" ? [w.tara] : [w.nikhil, w.prachi],
    token_hash: "test",
  });

  return {
    ...w,
    owner_actor: sessionActor(w.owner_user, w.wedding, w.owner, "owner"),
    manager_actor: sessionActor(w.manager_user, w.wedding, w.manager, "manager"),
    guestOf,
    publish,
    rotatedAt,
  };
}

const signed = async (asset: AssetDto) => `https://signed.test/${asset.storage_path}?ttl=3600`;

function allKeys(value: unknown, into: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach((item) => allKeys(item, into));
  else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      into.push(key);
      allKeys(child, into);
    }
  }
  return into;
}

describe.skipIf(!url)("A5 read models (database)", () => {
  beforeAll(() => {
    const created = createDb(url!, { max: 2 });
    db = created.db;
    close = () => created.client.end({ timeout: 5 });
  });

  afterAll(async () => {
    if (createdWeddings.length > 0) await db.delete(weddings).where(inArray(weddings.id, createdWeddings));
    await close();
  });

  describe("rsvp_totals", () => {
    it("counts active invitations per function, with plus-ones and the named/synthetic split", async () => {
      const w = await insertWorld();
      const totals = await buildRsvpTotals(db, w.owner_actor, w.wedding);
      expect(totals.version).toBe(41);
      expect(totals.hidden).toEqual([]);
      expect(totals.functions.map((row) => row.title)).toEqual(["Mehendi", "Sangeet", "Reception"]);
      const [mehendi, sangeet, reception] = totals.functions;
      expect(mehendi).toMatchObject({ invited: 0, attending: 0, declined: 0, pending: 0, confirmed_headcount: 0, expected_headcount: 60 });
      expect(sangeet).toMatchObject({ invited: 1, attending: 1, declined: 0, pending: 0, confirmed_headcount: 1 });
      expect(reception).toMatchObject({
        event_id: w.rec,
        event_kind: "reception",
        starts_at: "2026-12-14T19:30:00+05:30",
        invited: 8,
        attending: 4,
        declined: 1,
        pending: 3,
        confirmed_headcount: 6, // Nikhil + 2 plus-ones, and 3 synthetic
        named: { invited: 3, attending: 1, declined: 1, pending: 1, confirmed_headcount: 3 },
        synthetic: { invited: 5, attending: 3, declined: 0, pending: 2, confirmed_headcount: 3 },
        expected_headcount: 250,
      });
      for (const row of totals.functions) {
        for (const value of [row.invited, row.attending, row.declined, row.pending, row.confirmed_headcount]) {
          expect(Number.isSafeInteger(value)).toBe(true);
        }
      }
    });

    it("filters by event_id, and answers not_found for an id outside this wedding", async () => {
      const w = await insertWorld();
      const other = await insertWorld();
      const one = await buildRsvpTotals(db, w.manager_actor, w.wedding, { event_id: w.san });
      expect(one.functions.map((row) => row.event_id)).toEqual([w.san]);
      await expect(buildRsvpTotals(db, w.owner_actor, w.wedding, { event_id: other.rec })).rejects.toBeInstanceOf(CommandFailure);
      await expect(buildRsvpTotals(db, w.owner_actor, w.wedding, { event_id: w.gone })).rejects.toBeInstanceOf(CommandFailure);
      await expect(buildRsvpTotals(db, w.owner_actor, w.wedding, { event_id: "not-a-uuid" })).rejects.toBeInstanceOf(CommandFailure);
    });
  });

  describe("rsvp_guest_list", () => {
    it("gives a manager without contact sharing no phone numbers or emails (G7)", async () => {
      const w = await insertWorld({ contacts_shared: false });
      const list = await buildRsvpGuestList(db, w.manager_actor, w.wedding);
      expect(list.hidden).toEqual(["guest_contacts"]);
      const keys = allKeys(list);
      expect(keys).not.toContain("phone");
      expect(keys).not.toContain("email");
      expect(JSON.stringify(list)).not.toContain("+91");
      expect(JSON.stringify(list)).not.toContain("tara.guest@example.com");
      // Names, replies and dietary notes stay.
      const reception = list.functions.find((row) => row.event_id === w.rec);
      // Inserted together, so they order by seed key: G30, G31, G40.
      expect(reception?.guests.map((guest) => guest.full_name)).toEqual(["Nikhil Jain", "Prachi Jain", "Tara Bhat"]);
      expect(reception?.guests.find((guest) => guest.full_name === "Nikhil Jain")).toMatchObject({
        household_name: "Jain",
        rsvp_status: "attending",
        plus_ones: 2,
        max_plus_ones: 2,
        dietary_note: "Jain food",
      });
    });

    it("gives the owner contacts, and a manager too once contacts are shared", async () => {
      const w = await insertWorld({ contacts_shared: false });
      const owner = await buildRsvpGuestList(db, w.owner_actor, w.wedding);
      expect(owner.hidden).toEqual([]);
      const tara = owner.functions.find((row) => row.event_id === w.rec)?.guests.find((guest) => guest.guest_id === w.tara);
      expect(tara).toMatchObject({ phone: "+91 90000 01601", email: "tara.guest@example.com" });
      const prachi = owner.functions.find((row) => row.event_id === w.rec)?.guests.find((guest) => guest.guest_id === w.prachi);
      expect(prachi).toMatchObject({ phone: null, email: null });

      const shared = await insertWorld({ contacts_shared: true });
      const manager = await buildRsvpGuestList(db, shared.manager_actor, shared.wedding);
      expect(manager.hidden).toEqual([]);
      const bhat = manager.households.find((household) => household.household_id === shared.bhat);
      expect(bhat?.guests[0]).toMatchObject({ full_name: "Tara Bhat", phone: "+91 90000 01601" });
    });

    it("lists named guests per function, collapses the synthetic ones and skips revoked, deleted rows", async () => {
      const w = await insertWorld();
      const list = await buildRsvpGuestList(db, w.owner_actor, w.wedding);
      expect(list.version).toBe(41);
      expect(list.functions.map((row) => row.title)).toEqual(["Mehendi", "Sangeet", "Reception"]);
      const [mehendi, sangeet, reception] = list.functions;
      expect(mehendi.guests).toEqual([]); // Prachi's mehendi invitation is revoked
      expect(mehendi.synthetic).toBeNull();
      expect(sangeet.guests.map((guest) => guest.full_name)).toEqual(["Tara Bhat"]);
      expect(reception.guests.map((guest) => guest.full_name)).not.toContain("Ravi Bhat");
      expect(reception.guests.some((guest) => guest.full_name.startsWith("Imported"))).toBe(false);
      expect(reception.synthetic).toEqual({
        invited: 5,
        attending: 3,
        declined: 0,
        pending: 2,
        confirmed_headcount: 3,
        label: "5 imported guests (synthetic placeholders)",
      });
    });

    it("carries each household's link_status and last_rotated_at (D99)", async () => {
      const w = await insertWorld();
      const list = await buildRsvpGuestList(db, w.manager_actor, w.wedding);
      const byId = new Map(list.households.map((household) => [household.household_id, household]));
      expect(byId.get(w.bhat)).toMatchObject({ name: "Bhat", link_status: "active", last_rotated_at: "2026-11-25T11:30:00+05:30", guest_count: 1 });
      expect(byId.get(w.bhat)?.guests.map((guest) => guest.full_name)).toEqual(["Tara Bhat"]);
      expect(byId.get(w.jain)).toMatchObject({ link_status: "revoked", last_rotated_at: null, guest_count: 2 });
      expect(byId.get(w.syn)).toMatchObject({ is_synthetic: true, link_status: "none", last_rotated_at: null, guest_count: 5, guests: [] });
      expect(allKeys(list)).not.toContain("token_hash");
      expect(allKeys(list)).not.toContain("token_hint");
    });
  });

  describe("guest_invitation_view", () => {
    it("shows Bhat only its published, invited functions from the latest revision", async () => {
      const w = await insertWorld();
      const view = await buildGuestInvitationView(db, w.guestOf("bhat"), { signPhoto: signed });
      expect(view).not.toBeNull();
      expect(view!.revision).toBe(2);
      expect(view!.household).toEqual({ name: "Bhat", guests: [{ guest_id: w.tara, full_name: "Tara Bhat", dietary_note: null }] });
      expect(view!.functions.map((fn) => fn.title)).toEqual(["Sangeet", "Reception"]);
      const reception = view!.functions[1];
      expect(reception).toEqual({
        event_id: w.rec,
        event_kind: "reception",
        title: "Reception",
        title_hi: "रिसेप्शन",
        starts_at: "2026-12-14T19:30:00+05:30",
        ends_at: "2026-12-14T23:00:00+05:30",
        muhurat_at: null,
        dress_code: "Formal evening",
        description: "Dinner follows.",
        venue: { name: "Banyan Hall", place_name: "Mallige Gardens", locality: "Whitefield", address: null, map_url: null },
        responses: [{ guest_id: w.tara, rsvp_status: "pending", plus_ones: 0, max_plus_ones: 0 }],
      });
      expect(view!.wedding.photo_url).toBe(`https://signed.test/${w.wedding}/${w.photo}.jpg?ttl=3600`);
      expect(view!.wedding.wording_en).toBe("With the blessings of our families");
      const keys = allKeys(view);
      expect(keys.filter((key) => key.endsWith("_inr"))).toEqual([]);
      for (const banned of ["seed_key", "venue_id", "capacity", "expected_headcount", "lead_name", "phone", "email", "photo_asset_id"]) {
        expect(keys).not.toContain(banned);
      }
      expect(JSON.stringify(view)).not.toMatch(/Mehendi|Nikhil|Prachi|Ravi|Lotus|Cancelled/);
      expect(await readGuestRevision(db, w.guestOf("bhat"))).toBe(2);
    });

    it("keeps a draft change invisible until it is published (AT-9.3)", async () => {
      const w = await insertWorld();
      await db.update(events).set({ venue_id: w.lotus }).where(eq(events.id, w.rec));
      await db.update(events).set({ title: "Draft Sangeet" }).where(eq(events.id, w.san));
      const draft = await buildGuestInvitationView(db, w.guestOf("bhat"), { signPhoto: signed });
      expect(draft!.revision).toBe(2);
      expect(draft!.functions.map((fn) => fn.venue?.name)).toEqual(["Garden Hall", "Banyan Hall"]);
      expect(JSON.stringify(draft)).not.toMatch(/Lotus|Draft Sangeet/);

      await w.publish(3);
      const published = await buildGuestInvitationView(db, w.guestOf("bhat"), { signPhoto: signed });
      expect(published!.revision).toBe(3);
      expect(published!.functions[1].venue?.name).toBe("Lotus Hall");
      expect(await readGuestRevision(db, w.guestOf("bhat"))).toBe(3);
    });

    it("reads only the latest publication: an older revision with other functions doesn't leak", async () => {
      const w = await insertWorld({ publish: false });
      // REV-1 has the mehendi, sangeet and reception; REV-2 is published while the sangeet is
      // deleted from the draft, so it has no sangeet. The draft then restores it, unpublished.
      await w.publish(1);
      await db.update(events).set({ deleted_at: new Date() }).where(eq(events.id, w.san));
      await w.publish(2);
      await db.update(events).set({ deleted_at: null }).where(eq(events.id, w.san));
      const view = await buildGuestInvitationView(db, w.guestOf("bhat"), { signPhoto: signed });
      expect(view!.revision).toBe(2);
      // Tara's sangeet invitation is live, but the latest snapshot has no sangeet.
      expect(view!.functions.map((fn) => fn.title)).toEqual(["Reception"]);
    });

    it("drops a function once its invitation is revoked, and lists responses per guest", async () => {
      const w = await insertWorld();
      const jain = await buildGuestInvitationView(db, w.guestOf("jain"), { signPhoto: signed });
      expect(jain!.functions.map((fn) => fn.title)).toEqual(["Reception"]); // the mehendi row is revoked
      expect(jain!.functions[0].responses).toEqual([
        { guest_id: w.nikhil, rsvp_status: "attending", plus_ones: 2, max_plus_ones: 2 },
        { guest_id: w.prachi, rsvp_status: "declined", plus_ones: 0, max_plus_ones: 0 },
      ]);
      await db
        .update(invitations)
        .set({ revoked_at: new Date() })
        .where(and(eq(invitations.guest_id, w.tara), eq(invitations.event_id, w.san)));
      const bhat = await buildGuestInvitationView(db, w.guestOf("bhat"), { signPhoto: signed });
      expect(bhat!.functions.map((fn) => fn.title)).toEqual(["Reception"]);
    });

    it("gives nothing for a household of another wedding, or before anything is published", async () => {
      const w = await insertWorld();
      const other = await insertWorld();
      const crossed: GuestActor = { ...w.guestOf("bhat"), household_id: other.bhat };
      expect(await buildGuestInvitationView(db, crossed, { signPhoto: signed })).toBeNull();
      expect(await readGuestRevision(db, crossed)).toBeNull();
      const malformed: GuestActor = { ...w.guestOf("bhat"), household_id: "not-a-uuid" };
      expect(await buildGuestInvitationView(db, malformed)).toBeNull();

      const unpublished = await insertWorld({ publish: false });
      expect(await buildGuestInvitationView(db, unpublished.guestOf("bhat"), { signPhoto: signed })).toBeNull();
      expect(await readGuestRevision(db, unpublished.guestOf("bhat"))).toBeNull();
    });

    it("renders without a photo when signing fails", async () => {
      const w = await insertWorld();
      const view = await buildGuestInvitationView(db, w.guestOf("bhat"), {
        signPhoto: async () => {
          throw new Error("storage down");
        },
      });
      expect(view).not.toBeNull();
      expect("photo_url" in view!.wedding).toBe(false);
    });
  });
});
