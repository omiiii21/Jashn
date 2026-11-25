/**
 * The Guests screen's households view (AT-4.8), built from `rsvp_guest_list` alone. The read
 * model lists named guests per function; this regroups the same rows by household and guest,
 * in the read model's order, so each guest shows every function they are invited to and the
 * reply for each. It only regroups rows: it counts nothing and adds nothing (M8).
 */
import type { EventId, GuestId, HouseholdId, RsvpStatus, SeedKey } from "@/contracts/domain";
import type { RsvpGuestList } from "@/contracts/read-models";

export type GuestReply = {
  event_id: EventId;
  title: string;
  title_hi: string;
  rsvp_status: RsvpStatus;
  plus_ones: number;
};

export type HouseholdGuest = {
  guest_id: GuestId;
  seed_key: SeedKey | null;
  full_name: string;
  dietary_note: string | null;
  /** Present only when G7 lets this member read contacts. */
  phone?: string | null;
  email?: string | null;
  replies: GuestReply[];
};

export type Household = {
  household_id: HouseholdId;
  household_name: string;
  group_label: string | null;
  guests: HouseholdGuest[];
};

/** Households in the order their first guest appears, guests in read-model order. */
export function groupHouseholds(list: RsvpGuestList): Household[] {
  const households = new Map<HouseholdId, Household>();
  const guests = new Map<GuestId, HouseholdGuest>();

  for (const fn of list.functions) {
    for (const row of fn.guests) {
      let household = households.get(row.household_id);
      if (!household) {
        household = {
          household_id: row.household_id,
          household_name: row.household_name,
          group_label: row.group_label,
          guests: [],
        };
        households.set(row.household_id, household);
      }

      let guest = guests.get(row.guest_id);
      if (!guest) {
        guest = {
          guest_id: row.guest_id,
          seed_key: row.seed_key,
          full_name: row.full_name,
          dietary_note: row.dietary_note,
          replies: [],
        };
        // Copy the contact fields only when the read model sent them (G7).
        if ("phone" in row) guest.phone = row.phone ?? null;
        if ("email" in row) guest.email = row.email ?? null;
        guests.set(row.guest_id, guest);
        household.guests.push(guest);
      }

      guest.replies.push({
        event_id: fn.event_id,
        title: fn.title,
        title_hi: fn.title_hi,
        rsvp_status: row.rsvp_status,
        plus_ones: row.plus_ones,
      });
    }
  }

  return [...households.values()];
}

/** The reply form's view of a household: names and replies only, never contacts. */
export type ReplyFormGuest = {
  guest_id: GuestId;
  full_name: string;
  replies: { event_id: EventId; title: string; rsvp_status: RsvpStatus }[];
};

export function replyFormGuests(household: Household): ReplyFormGuest[] {
  return household.guests.map((guest) => ({
    guest_id: guest.guest_id,
    full_name: guest.full_name,
    replies: guest.replies.map(({ event_id, title, rsvp_status }) => ({
      event_id,
      title,
      rsvp_status,
    })),
  }));
}
