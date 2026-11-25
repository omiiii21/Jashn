import "server-only";

import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";

import { CommandFailure } from "@/contracts/commands";
import type { EventId, GuestId, HouseholdId, IsoInstant, RsvpStatus, SessionActor, WeddingId } from "@/contracts/domain";
import { managerSeesBlock } from "@/contracts/permissions";
import type {
  HiddenBlock,
  ReadModelParams,
  RsvpCounts,
  RsvpGuestList,
  RsvpGuestListFunction,
  RsvpGuestRow,
} from "@/contracts/read-models";
import type { DbOrTx } from "@/db/client";
import { toIstInstant } from "@/db/ist";
import { guestContacts, guests, households, invitationLinks, invitations, members, weddings } from "@/db/schema";

import {
  emptyRsvpCounts,
  eventStartsAt,
  loadActiveEvents,
  loadRsvpCountGroups,
  safeCount,
  tallyRsvpCounts,
  type ActiveEventRow,
  type RsvpTally,
} from "./rsvp-totals";

/**
 * `rsvp_guest_list` (domain 4.4, G7, D99): per active function, each invited named guest with
 * household, group, status, plus-ones and dietary note; the synthetic guests collapse into one
 * row ("210 imported guests (synthetic placeholders)"). Phone numbers and emails appear only
 * for owners and for managers while `managers_can_see_guest_contacts` is on; otherwise the
 * contact table is not even read, and `guest_contacts` is listed in `hidden`.
 *
 * D99's household link fields (`link_status`, `last_rotated_at`) ride on a `households` list
 * beside `functions`. The contract type for them is due in lane-lead-contracts-2, so the shape
 * here is `RsvpGuestListWithHouseholds`, a superset of the contract's `RsvpGuestList`.
 */

// ---------------------------------------------------------------------------
// D99's household fields (provisional until lane-lead-contracts-2 types them)
// ---------------------------------------------------------------------------

export type HouseholdLinkStatus = "none" | "active" | "revoked";

export type RsvpHouseholdGuest = {
  guest_id: GuestId;
  seed_key: string | null;
  full_name: string;
  group_label: string | null;
  dietary_note: string | null;
  /** Owners, and managers with `managers_can_see_guest_contacts`; otherwise left out. */
  phone?: string | null;
  email?: string | null;
};

export type RsvpGuestListHousehold = {
  household_id: HouseholdId;
  seed_key: string | null;
  name: string;
  relation: string | null;
  is_synthetic: boolean;
  /** Guests not deleted, named or synthetic. */
  guest_count: number;
  /** Named guests only; the synthetic household lists none (they collapse, 4.4). */
  guests: RsvpHouseholdGuest[];
  link_status: HouseholdLinkStatus;
  /** When the household's current link replaced an earlier one; null if never rotated. */
  last_rotated_at: IsoInstant | null;
};

export type RsvpGuestListWithHouseholds = RsvpGuestList & { households: RsvpGuestListHousehold[] };

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** "210 imported guests (synthetic placeholders)". */
export function syntheticRowLabel(count: number): string {
  return count === 1 ? "1 imported guest (synthetic placeholder)" : `${count} imported guests (synthetic placeholders)`;
}

/** The collapsed synthetic row for one function, or null when it has no synthetic invitations. */
export function collapsedSyntheticRow(tally: RsvpTally | undefined): (RsvpCounts & { label: string }) | null {
  const counts = tally?.synthetic ?? emptyRsvpCounts();
  if (counts.invited === 0) return null;
  return { ...counts, label: syntheticRowLabel(counts.invited) };
}

export type LinkRow = { household_id: HouseholdId; created_at: Date; revoked_at: Date | null };

/**
 * D99: `active` while a link is unrevoked, `revoked` when every link is revoked, `none` with no
 * link. A rotation is a new link that replaced an earlier one (6.3: revoke plus a new link),
 * so `last_rotated_at` is the newest link's creation time once the household has had two or
 * more links, and null before that.
 */
export function linkStateOf(links: readonly LinkRow[]): { link_status: HouseholdLinkStatus; last_rotated_at: IsoInstant | null } {
  if (links.length === 0) return { link_status: "none", last_rotated_at: null };
  const link_status: HouseholdLinkStatus = links.some((link) => link.revoked_at === null) ? "active" : "revoked";
  if (links.length < 2) return { link_status, last_rotated_at: null };
  const newest = links.reduce((latest, link) => (link.created_at.getTime() > latest.created_at.getTime() ? link : latest));
  return { link_status, last_rotated_at: toIstInstant(newest.created_at) };
}

type Contact = { phone: string | null; email: string | null };

function withContact<T extends object>(row: T, guest_id: GuestId, contacts: Map<GuestId, Contact> | null): T & Partial<Contact> {
  if (!contacts) return row;
  const contact = contacts.get(guest_id);
  return { ...row, phone: contact?.phone ?? null, email: contact?.email ?? null };
}

// ---------------------------------------------------------------------------
// The read model
// ---------------------------------------------------------------------------

type ReaderContext = { version: number; sees_contacts: boolean };

async function loadReader(db: DbOrTx, actor: SessionActor, wedding_id: WeddingId): Promise<ReaderContext> {
  const [row] = await db
    .select({
      version: weddings.version,
      managers_can_see_vendor_dues: weddings.managers_can_see_vendor_dues,
      managers_can_see_budget: weddings.managers_can_see_budget,
      managers_can_see_guest_contacts: weddings.managers_can_see_guest_contacts,
      role: members.role,
    })
    .from(weddings)
    .innerJoin(
      members,
      and(eq(members.wedding_id, weddings.id), eq(members.user_id, actor.user_id), isNull(members.removed_at)),
    )
    .where(eq(weddings.id, wedding_id))
    .limit(1);
  // The guard has already checked membership; a miss here means the wedding or member is gone.
  if (!row) throw new CommandFailure({ code: "not_found", message: "Wedding not found." });
  return {
    version: safeCount("version", row.version),
    sees_contacts: row.role === "owner" || managerSeesBlock("guest_contacts", row),
  };
}

type NamedInvitationRow = {
  event_id: EventId;
  guest_id: GuestId;
  seed_key: string | null;
  full_name: string;
  household_id: HouseholdId;
  household_name: string;
  group_label: string | null;
  rsvp_status: RsvpStatus;
  plus_ones: number;
  max_plus_ones: number;
  dietary_note: string | null;
};

async function loadNamedInvitations(db: DbOrTx, wedding_id: WeddingId, event_ids: readonly EventId[]): Promise<NamedInvitationRow[]> {
  if (event_ids.length === 0) return [];
  return db
    .select({
      event_id: invitations.event_id,
      guest_id: guests.id,
      seed_key: guests.seed_key,
      full_name: guests.full_name,
      household_id: households.id,
      household_name: households.name,
      group_label: guests.group_label,
      rsvp_status: invitations.rsvp_status,
      plus_ones: invitations.plus_ones,
      max_plus_ones: invitations.max_plus_ones,
      dietary_note: guests.dietary_note,
    })
    .from(invitations)
    .innerJoin(guests, and(eq(guests.id, invitations.guest_id), eq(guests.wedding_id, invitations.wedding_id)))
    .innerJoin(households, and(eq(households.id, guests.household_id), eq(households.wedding_id, guests.wedding_id)))
    .where(
      and(
        eq(invitations.wedding_id, wedding_id),
        inArray(invitations.event_id, [...event_ids]),
        isNull(invitations.revoked_at),
        isNull(guests.deleted_at),
        eq(guests.is_synthetic, false),
      ),
    )
    .orderBy(asc(guests.created_at), sql`${guests.seed_key} asc nulls last`, asc(guests.id));
}

/** Only called when the reader may see contacts (G7): the contact table is read by no other path here. */
async function loadContacts(db: DbOrTx, wedding_id: WeddingId): Promise<Map<GuestId, Contact>> {
  const rows = await db
    .select({ guest_id: guestContacts.guest_id, phone: guestContacts.phone, email: guestContacts.email })
    .from(guestContacts)
    .innerJoin(guests, and(eq(guests.id, guestContacts.guest_id), eq(guests.wedding_id, guestContacts.wedding_id)))
    .where(eq(guestContacts.wedding_id, wedding_id));
  return new Map(rows.map((row) => [row.guest_id, { phone: row.phone, email: row.email }]));
}

async function loadHouseholds(
  db: DbOrTx,
  wedding_id: WeddingId,
  contacts: Map<GuestId, Contact> | null,
): Promise<RsvpGuestListHousehold[]> {
  const [householdRows, namedGuests, guestCounts, links] = await Promise.all([
    db
      .select({
        household_id: households.id,
        seed_key: households.seed_key,
        name: households.name,
        relation: households.relation,
        is_synthetic: households.is_synthetic,
      })
      .from(households)
      .where(eq(households.wedding_id, wedding_id))
      .orderBy(asc(households.created_at), sql`${households.seed_key} asc nulls last`, asc(households.id)),
    db
      .select({
        guest_id: guests.id,
        seed_key: guests.seed_key,
        household_id: guests.household_id,
        full_name: guests.full_name,
        group_label: guests.group_label,
        dietary_note: guests.dietary_note,
      })
      .from(guests)
      .where(and(eq(guests.wedding_id, wedding_id), isNull(guests.deleted_at), eq(guests.is_synthetic, false)))
      .orderBy(asc(guests.created_at), sql`${guests.seed_key} asc nulls last`, asc(guests.id)),
    db
      .select({ household_id: guests.household_id, guest_count: sql<number>`count(*)::bigint` })
      .from(guests)
      .where(and(eq(guests.wedding_id, wedding_id), isNull(guests.deleted_at)))
      .groupBy(guests.household_id),
    db
      .select({
        household_id: invitationLinks.household_id,
        created_at: invitationLinks.created_at,
        revoked_at: invitationLinks.revoked_at,
      })
      .from(invitationLinks)
      .where(eq(invitationLinks.wedding_id, wedding_id)),
  ]);

  const countBy = new Map(guestCounts.map((row) => [row.household_id, safeCount("guest_count", row.guest_count)]));
  const guestsBy = new Map<HouseholdId, RsvpHouseholdGuest[]>();
  for (const guest of namedGuests) {
    const list = guestsBy.get(guest.household_id) ?? [];
    list.push(
      withContact(
        {
          guest_id: guest.guest_id,
          seed_key: guest.seed_key,
          full_name: guest.full_name,
          group_label: guest.group_label,
          dietary_note: guest.dietary_note,
        },
        guest.guest_id,
        contacts,
      ),
    );
    guestsBy.set(guest.household_id, list);
  }
  const linksBy = new Map<HouseholdId, LinkRow[]>();
  for (const link of links) {
    const list = linksBy.get(link.household_id) ?? [];
    list.push(link);
    linksBy.set(link.household_id, list);
  }

  return householdRows.map((household) => ({
    household_id: household.household_id,
    seed_key: household.seed_key,
    name: household.name,
    relation: household.relation,
    is_synthetic: household.is_synthetic,
    guest_count: countBy.get(household.household_id) ?? 0,
    guests: household.is_synthetic ? [] : (guestsBy.get(household.household_id) ?? []),
    ...linkStateOf(linksBy.get(household.household_id) ?? []),
  }));
}

function functionRow(
  event: ActiveEventRow,
  named: readonly NamedInvitationRow[],
  tally: RsvpTally | undefined,
  contacts: Map<GuestId, Contact> | null,
): RsvpGuestListFunction {
  const guestsOf: RsvpGuestRow[] = named.map((row) =>
    withContact(
      {
        guest_id: row.guest_id,
        seed_key: row.seed_key,
        full_name: row.full_name,
        household_id: row.household_id,
        household_name: row.household_name,
        group_label: row.group_label,
        rsvp_status: row.rsvp_status,
        plus_ones: safeCount("plus_ones", row.plus_ones),
        max_plus_ones: safeCount("max_plus_ones", row.max_plus_ones),
        dietary_note: row.dietary_note,
      },
      row.guest_id,
      contacts,
    ),
  );
  return {
    event_id: event.event_id,
    seed_key: event.seed_key,
    title: event.title,
    title_hi: event.title_hi,
    starts_at: eventStartsAt(event.event_date, event.start_time),
    guests: guestsOf,
    synthetic: collapsedSyntheticRow(tally),
  };
}

/**
 * `rsvp_guest_list` for any member (6.1), with contacts filtered by G7. The caller (the guard)
 * has checked base access; this applies the contact rule from the reader's `members` row and
 * the wedding's sharing flags, read fresh, never from the session.
 */
export async function buildRsvpGuestList(
  db: DbOrTx,
  actor: SessionActor,
  wedding_id: WeddingId,
  params: ReadModelParams<"rsvp_guest_list"> = {},
): Promise<RsvpGuestListWithHouseholds> {
  const reader = await loadReader(db, actor, wedding_id);
  const activeEvents = await loadActiveEvents(db, wedding_id, params.event_id);
  const event_ids = activeEvents.map((event) => event.event_id);
  const [groups, named, contacts] = await Promise.all([
    loadRsvpCountGroups(db, wedding_id, event_ids),
    loadNamedInvitations(db, wedding_id, event_ids),
    reader.sees_contacts ? loadContacts(db, wedding_id) : Promise.resolve(null),
  ]);
  const tallies = tallyRsvpCounts(groups);
  const namedBy = new Map<EventId, NamedInvitationRow[]>();
  for (const row of named) {
    const list = namedBy.get(row.event_id) ?? [];
    list.push(row);
    namedBy.set(row.event_id, list);
  }
  const hidden: HiddenBlock[] = reader.sees_contacts ? [] : ["guest_contacts"];
  return {
    version: reader.version,
    hidden,
    functions: activeEvents.map((event) =>
      functionRow(event, namedBy.get(event.event_id) ?? [], tallies.get(event.event_id), contacts),
    ),
    households: await loadHouseholds(db, wedding_id, contacts),
  };
}
