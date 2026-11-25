import "server-only";

import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";

import { CommandFailure, type CommandName, type CommandWarning } from "@/contracts/commands";
import type {
  EventKind,
  GuestActor,
  GuestInvitationView,
  HouseholdId,
  JsonObject,
  PublicationSnapshot,
  RsvpStatus,
  SessionActor,
  WeddingId,
} from "@/contracts/domain";
import { routes } from "@/contracts/routes";
import type {
  ActivityEntryDraft,
  CommandHandler,
  CommandHandlerContext,
  CommandHandlerResult,
  HandlerMap,
} from "@/contracts/services";
import type { DbOrTx, Tx } from "@/db/client";
import { events, guestContacts, guests, households, invitationLinks, invitations, publications, weddings } from "@/db/schema";
import { GUEST_NOT_FOUND_BODY, generateLinkToken, hashLinkToken, linkTokenHint } from "@/server/authz/guest-token";
import { buildGuestInvitationView } from "@/server/read-models/guest-view";
import { loadRsvpTotalsRows } from "@/server/read-models/rsvp-totals";

/**
 * Guests, invitations, RSVPs and invitation links (domain 3.4, rules R1–R12, G1–G7, I1–I2a).
 *
 * The dispatcher has already resolved the actor, applied the role matrix
 * (`src/contracts/permissions.ts`), parsed the input, checked the receipt and locked the
 * `weddings` row FOR UPDATE. Each handler here then:
 * - checks every id it is given against `wedding_id` (an id from another wedding is
 *   `not_found`, AT-9.7), and, for a guest token, against the token's household and the
 *   published revision (R9); every guest-side failure is the one 404 body (G5, D35);
 * - locks the rows it changes FOR UPDATE, after the wedding lock (R7), so ten parallel
 *   submissions of one answer give one `applied` and nine `unchanged`;
 * - writes the domain rows and returns the finished activity entry (section 3's English and
 *   Hindi templates, L5 visibility), or `unchanged` with no entry when nothing differs (L1).
 *
 * Raw link tokens appear only in `create_invitation_links`' result; the dispatcher strips
 * them from the stored receipt (6.3), so a replay says `tokens_already_issued`.
 */

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * The one guest 404 (G5): the same body as an unknown, malformed or revoked token on every
 * guest route (`GUEST_NOT_FOUND_BODY`, which matches the guard's `requireGuestForApi`).
 */
export const GUEST_NOT_FOUND_MESSAGE = GUEST_NOT_FOUND_BODY.message;

function guestNotFound(): CommandFailure {
  return new CommandFailure({ ...GUEST_NOT_FOUND_BODY });
}

function notFound(field: string, message = "Not found."): CommandFailure {
  return new CommandFailure({ code: "not_found", message, field });
}

function forbidden(field: string | null = null, message = "Not allowed for your role."): CommandFailure {
  return new CommandFailure({ code: "forbidden", message, field });
}

function requireWedding(context: { wedding_id: WeddingId | null }): WeddingId {
  if (!context.wedding_id) throw new CommandFailure({ code: "validation_failed", message: "required", field: "wedding_id" });
  return context.wedding_id;
}

/** A member of this wedding (the guard has checked; this is defence in depth). */
function memberOf(context: { actor: CommandHandlerContext["actor"]; wedding_id: WeddingId | null }): SessionActor {
  const actor = context.actor;
  if (actor.kind === "guest" || actor.kind === "system") throw forbidden(null, "Not allowed.");
  if (!actor.member_id || !actor.role || actor.wedding_id !== context.wedding_id) {
    throw forbidden(null, "You are not a member of this wedding.");
  }
  return actor;
}

function ownerOf(context: { actor: CommandHandlerContext["actor"]; wedding_id: WeddingId | null }): SessionActor {
  const actor = memberOf(context);
  if (actor.role !== "owner") throw forbidden();
  return actor;
}

/** The token's household, on this wedding. Anything else is the guest 404 (G4, D35). */
function guestOf(context: { actor: CommandHandlerContext["actor"]; wedding_id: WeddingId | null }): GuestActor {
  const actor = context.actor;
  if (actor.kind !== "guest" || actor.wedding_id !== context.wedding_id) throw guestNotFound();
  return actor;
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

// ---------------------------------------------------------------------------
// Pure parts: R rules and the activity text (unit-tested in guests.test.ts)
// ---------------------------------------------------------------------------

/** The function word in a sentence (3.0 placeholders): "reception", or an `other` function's title. */
export function eventWord(event: { event_kind: EventKind; title: string }): string {
  return event.event_kind === "other" ? event.title : event.event_kind;
}

/** "the sangeet", "the sangeet and the reception", "the haldi, the sangeet and the reception". */
export function joinEnglish(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function theEvents(list: readonly { event_kind: EventKind; title: string }[]): string {
  return joinEnglish(list.map((event) => `the ${eventWord(event)}`));
}

function eventsHi(list: readonly { title_hi: string }[]): string {
  return list.map((event) => event.title_hi).join(", ");
}

/** The response words of `set_rsvp` (3.4). */
export const RSVP_WORDS: Record<RsvpStatus, { en: string; hi: string }> = {
  attending: { en: "attending", hi: "आएँगे" },
  declined: { en: "not attending", hi: "नहीं आएँगे" },
  pending: { en: "not replied", hi: "जवाब बाकी" },
};

/** A new household's name when only the guest's name is given: the last word ("Tara Bhat" → "Bhat"). */
export function householdNameFor(full_name: string): string {
  const parts = full_name.trim().split(/\s+/);
  return (parts[parts.length - 1] || full_name.trim()).slice(0, 80);
}

/** Name comparison for `possible_duplicate`: case and spacing ignored. */
export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export type StoredAnswer = { rsvp_status: RsvpStatus; plus_ones: number; max_plus_ones: number };

/**
 * R2 and R3: the `plus_ones` a new answer stores. 0 unless attending (forced, never an
 * error); attending takes the requested value, or `keep` (the stored value, for a
 * several-guest `set_rsvp`), or 0. Above the invitation's `max_plus_ones` is 422
 * `plus_ones_exceeds_limit`.
 */
export function resolvePlusOnes(
  status: RsvpStatus,
  requested: number | undefined,
  max_plus_ones: number,
  options: { keep?: number; field?: string } = {},
): number {
  if (status !== "attending") return 0;
  const value = requested ?? options.keep ?? 0;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new CommandFailure({ code: "validation_failed", message: "out_of_range", field: options.field ?? "plus_ones" });
  }
  if (value > max_plus_ones) {
    throw new CommandFailure({
      code: "plus_ones_exceeds_limit",
      message: max_plus_ones === 0 ? "This invitation has no plus-ones." : `At most ${max_plus_ones} plus-ones on this invitation.`,
      field: options.field ?? "plus_ones",
    });
  }
  return value;
}

/** R6/R7: an answer equal to the stored one changes nothing. */
export function answerChanged(stored: Pick<StoredAnswer, "rsvp_status" | "plus_ones">, next: { rsvp_status: RsvpStatus; plus_ones: number }): boolean {
  return stored.rsvp_status !== next.rsvp_status || stored.plus_ones !== next.plus_ones;
}

type EventText = { event_kind: EventKind; title: string; title_hi: string };

/** `add_guest`'s entry (members). `after` never carries a phone or email, only `contact_added` (L5a). */
export function addGuestActivity(args: {
  actor_label: string;
  guest_id: string;
  full_name: string;
  household_id: string;
  invited: readonly EventText[];
  after: JsonObject;
}): ActivityEntryDraft {
  const { actor_label, full_name, invited } = args;
  const withEvents = invited.length > 0;
  return {
    topic: "guest.added",
    entity_type: "guest",
    entity_id: args.guest_id,
    summary_en: withEvents
      ? `${actor_label} added the guest ${full_name}, invited to ${theEvents(invited)}.`
      : `${actor_label} added the guest ${full_name}.`,
    summary_hi: withEvents
      ? `${actor_label} ने मेहमान ${full_name} को जोड़ा, न्योता: ${eventsHi(invited)}।`
      : `${actor_label} ने मेहमान ${full_name} को जोड़ा।`,
    before: null,
    after: args.after,
    visibility: "members",
  };
}

/** `{changes}` of `set_invitations`, in English and Hindi. */
export function describeInvitationChanges(changes: {
  added: readonly EventText[];
  removed: readonly EventText[];
  max_plus_ones: number | null;
}): { en: string; hi: string } {
  const en: string[] = [];
  const hi: string[] = [];
  if (changes.added.length > 0) {
    en.push(`added ${theEvents(changes.added)}`);
    hi.push(`जोड़ा: ${eventsHi(changes.added)}`);
  }
  if (changes.removed.length > 0) {
    en.push(`removed ${theEvents(changes.removed)}`);
    hi.push(`हटाया: ${eventsHi(changes.removed)}`);
  }
  if (changes.max_plus_ones !== null) {
    en.push(`plus-ones limit set to ${changes.max_plus_ones}`);
    hi.push(`प्लस-वन सीमा ${changes.max_plus_ones}`);
  }
  return { en: en.join("; "), hi: hi.join("; ") };
}

/** `set_rsvp`'s entry (members): one guest, or several with their names. */
export function setRsvpActivity(args: {
  actor_label: string;
  event: EventText & { event_id: string };
  status: RsvpStatus;
  changed: readonly { invitation_id: string; guest_id: string; full_name: string; before: { rsvp_status: RsvpStatus; plus_ones: number }; plus_ones: number }[];
}): ActivityEntryDraft {
  const { actor_label, event, status, changed } = args;
  const word = RSVP_WORDS[status];
  const what = eventWord(event);
  if (changed.length === 1) {
    const only = changed[0];
    return {
      topic: "rsvp.updated",
      entity_type: "invitation",
      entity_id: only.invitation_id,
      summary_en: `${actor_label} marked ${only.full_name} as ${word.en} for the ${what}.`,
      summary_hi: `${actor_label} ने ${event.title_hi} के लिए ${only.full_name} का जवाब दर्ज किया: ${word.hi}।`,
      before: { guest_id: only.guest_id, event_id: event.event_id, ...only.before },
      after: { guest_id: only.guest_id, event_id: event.event_id, rsvp_status: status, plus_ones: only.plus_ones },
      visibility: "members",
    };
  }
  const names = changed.map((row) => row.full_name).join(", ");
  return {
    topic: "rsvp.updated",
    entity_type: "event",
    entity_id: event.event_id,
    summary_en: `${actor_label} marked ${changed.length} guests as ${word.en} for the ${what}: ${names}.`,
    summary_hi: `${actor_label} ने ${event.title_hi} के लिए ${changed.length} मेहमानों का जवाब दर्ज किया: ${word.hi} (${names})।`,
    before: { event_id: event.event_id, responses: changed.map((row) => ({ guest_id: row.guest_id, ...row.before })) },
    after: {
      event_id: event.event_id,
      responses: changed.map((row) => ({ guest_id: row.guest_id, rsvp_status: status, plus_ones: row.plus_ones })),
    },
    visibility: "members",
  };
}

export type SubmittedAnswer = {
  invitation_id: string;
  guest_id: string;
  full_name: string;
  event: EventText & { event_id: string };
  before: { rsvp_status: RsvpStatus; plus_ones: number };
  rsvp_status: "attending" | "declined";
  plus_ones: number;
};

function guestReplyEn(answer: SubmittedAnswer): string {
  return answer.rsvp_status === "attending"
    ? `${answer.full_name} is attending the ${eventWord(answer.event)}`
    : `${answer.full_name} can't attend the ${eventWord(answer.event)}`;
}

function guestReplyHi(answer: SubmittedAnswer): string {
  return answer.rsvp_status === "attending"
    ? `${answer.full_name} ${answer.event.title_hi} में आएँगे`
    : `${answer.full_name} ${answer.event.title_hi} में नहीं आ पाएँगे`;
}

/**
 * `submit_rsvp`'s entry (members, `actor_type` `guest`). One changed answer is the guest's
 * own line, with the guest as the actor ("Tara Bhat is attending the reception.", ACT-09);
 * several are the household's.
 */
export function submitRsvpActivity(args: {
  household_id: string;
  household_name: string;
  changed: readonly SubmittedAnswer[];
}): ActivityEntryDraft & { actor_guest_id?: string } {
  const { changed } = args;
  if (changed.length === 1) {
    const only = changed[0];
    return {
      topic: "rsvp.submitted",
      entity_type: "invitation",
      entity_id: only.invitation_id,
      summary_en: `${guestReplyEn(only)}.`,
      summary_hi: `${guestReplyHi(only)}।`,
      before: { guest_id: only.guest_id, event_id: only.event.event_id, ...only.before },
      after: { guest_id: only.guest_id, event_id: only.event.event_id, rsvp_status: only.rsvp_status, plus_ones: only.plus_ones },
      visibility: "members",
      actor_label: only.full_name,
      actor_guest_id: only.guest_id,
    };
  }
  return {
    topic: "rsvp.submitted",
    entity_type: "household",
    entity_id: args.household_id,
    summary_en: `The ${args.household_name} household replied: ${changed.map(guestReplyEn).join(", ")}.`,
    summary_hi: `${args.household_name} परिवार ने जवाब भेजा: ${changed.map(guestReplyHi).join(", ")}।`,
    before: { responses: changed.map((row) => ({ guest_id: row.guest_id, event_id: row.event.event_id, ...row.before })) },
    after: {
      responses: changed.map((row) => ({
        guest_id: row.guest_id,
        event_id: row.event.event_id,
        rsvp_status: row.rsvp_status,
        plus_ones: row.plus_ones,
      })),
    },
    visibility: "members",
    actor_label: args.household_name,
  };
}

/** `set_dietary`'s entry (members). From a guest link, `{actor}` is the guest's name. */
export function setDietaryActivity(args: {
  actor_label: string;
  guest_id: string;
  full_name: string;
  before: string | null;
  after: string | null;
}): ActivityEntryDraft {
  const { actor_label, full_name } = args;
  return {
    topic: "dietary.updated",
    entity_type: "guest",
    entity_id: args.guest_id,
    summary_en:
      args.after === null
        ? `${actor_label} cleared ${full_name}'s dietary note.`
        : `${actor_label} updated ${full_name}'s dietary note: ${args.after}.`,
    summary_hi:
      args.after === null
        ? `${actor_label} ने ${full_name} के खाने की जानकारी हटाई।`
        : `${actor_label} ने ${full_name} के खाने की जानकारी बदली: ${args.after}।`,
    before: { dietary_note: args.before },
    after: { dietary_note: args.after },
    visibility: "members",
  };
}

/** `create_invitation_links`' entry (owners). Tokens and hints never enter activity (6.3). */
export function createLinksActivity(args: {
  actor_label: string;
  first_link_id: string;
  household_ids: readonly string[];
  rotated_household_ids: readonly string[];
}): ActivityEntryDraft {
  const n = args.household_ids.length;
  const after: JsonObject = { household_ids: [...args.household_ids] };
  if (args.rotated_household_ids.length > 0) after.rotated_household_ids = [...args.rotated_household_ids];
  return {
    topic: "invitation_links.created",
    entity_type: "invitation_link",
    entity_id: args.first_link_id,
    summary_en: `${args.actor_label} created invitation links for ${n} ${n === 1 ? "household" : "households"}.`,
    summary_hi: `${args.actor_label} ने ${n} ${n === 1 ? "परिवार" : "परिवारों"} के लिए न्योते के लिंक बनाए।`,
    before: null,
    after,
    visibility: "owners",
  };
}

/** `revoke_invitation_link`'s entry (owners). */
export function revokeLinkActivity(args: {
  actor_label: string;
  link_id: string;
  household_id: string;
  household_name: string;
  revoked_at: string;
}): ActivityEntryDraft {
  return {
    topic: "invitation_link.revoked",
    entity_type: "invitation_link",
    entity_id: args.link_id,
    summary_en: `${args.actor_label} turned off the invitation link for the ${args.household_name} household.`,
    summary_hi: `${args.actor_label} ने ${args.household_name} परिवार के न्योते का लिंक बंद किया।`,
    before: { household_id: args.household_id, revoked_at: null },
    after: { household_id: args.household_id, revoked_at: args.revoked_at },
    visibility: "owners",
  };
}

// ---------------------------------------------------------------------------
// Shared queries
// ---------------------------------------------------------------------------

/**
 * The published snapshot guests see (P5): the publication whose revision equals
 * `weddings.published_revision`, the same one the guest view reads. Null before any publish.
 */
export async function loadPublishedSnapshot(
  db: DbOrTx,
  wedding_id: WeddingId,
): Promise<{ revision: number; snapshot: PublicationSnapshot } | null> {
  const [row] = await db
    .select({ revision: publications.revision, snapshot: publications.snapshot })
    .from(weddings)
    .innerJoin(publications, and(eq(publications.wedding_id, weddings.id), eq(publications.revision, weddings.published_revision)))
    .where(eq(weddings.id, wedding_id))
    .limit(1);
  if (!row) return null;
  return { revision: Number(row.revision), snapshot: row.snapshot as unknown as PublicationSnapshot };
}

/**
 * The household's refreshed guest view (4.6), the result of `submit_rsvp` and of a guest's
 * `set_dietary`. Built by Lane A's guest read model inside the command's transaction, so it
 * shows the answer just written. The couple photo is not signed here: signing is a Storage
 * call that must not run under the wedding lock, and the stored receipt drops signed URLs
 * anyway, so an applied answer and its replay return the same view (no `photo_url`).
 */
async function refreshedGuestView(tx: Tx, actor: GuestActor): Promise<GuestInvitationView | null> {
  return buildGuestInvitationView(tx, actor, { signPhoto: async () => null });
}

const eventColumns = {
  event_id: events.id,
  event_kind: events.event_kind,
  title: events.title,
  title_hi: events.title_hi,
};

/** Active functions of this wedding, in itinerary order; any id missing is `not_found` on `field`. */
async function loadEventsOrFail(tx: Tx, wedding_id: WeddingId, event_ids: readonly string[], field: string) {
  if (event_ids.length === 0) return [];
  const rows = await tx
    .select(eventColumns)
    .from(events)
    .where(and(eq(events.wedding_id, wedding_id), inArray(events.id, [...event_ids]), isNull(events.deleted_at)))
    .orderBy(asc(events.event_date), sql`${events.start_time} asc nulls last`, asc(events.sort_order), asc(events.id));
  if (rows.length !== event_ids.length) throw notFound(field, "Function not found.");
  return rows;
}

// ---------------------------------------------------------------------------
// add_guest
// ---------------------------------------------------------------------------

type Ctx<C extends CommandName> = CommandHandlerContext<C, Tx>;
type Res<C extends CommandName> = CommandHandlerResult<C>;

export const addGuestHandler: CommandHandler<"add_guest", Tx> = async (context: Ctx<"add_guest">): Promise<Res<"add_guest">> => {
  const actor = memberOf(context);
  const wedding_id = requireWedding(context);
  const { tx, input } = context;
  const now = new Date(context.now);

  // 3.4: a manager may not send event_ids or max_plus_ones (the guard checks too).
  if (actor.role === "manager") {
    if (input.event_ids !== undefined) throw forbidden("event_ids");
    if (input.max_plus_ones !== undefined) throw forbidden("max_plus_ones");
  }
  // Contacts are typed only, never voice fields (3.4, G9).
  if (context.envelope.source === "voice") {
    if (input.phone !== undefined) throw new CommandFailure({ code: "validation_failed", message: "unknown_value", field: "phone" });
    if (input.email !== undefined) throw new CommandFailure({ code: "validation_failed", message: "unknown_value", field: "email" });
  }

  let household_id: string;
  let household_created = false;
  if (input.household_id) {
    const [household] = await tx
      .select({ id: households.id, is_synthetic: households.is_synthetic })
      .from(households)
      .where(and(eq(households.id, input.household_id), eq(households.wedding_id, wedding_id)))
      .for("update");
    if (!household) throw notFound("household_id", "Household not found.");
    // The synthetic placeholder collapses to one row on Guests (4.4): a named guest there would vanish.
    if (household.is_synthetic) throw new CommandFailure({ code: "validation_failed", message: "unknown_value", field: "household_id" });
    household_id = household.id;
    // A household with an active link lists its members' names on its page: owners only.
    if (actor.role === "manager") {
      const [link] = await tx
        .select({ id: invitationLinks.id })
        .from(invitationLinks)
        .where(
          and(
            eq(invitationLinks.wedding_id, wedding_id),
            eq(invitationLinks.household_id, household_id),
            isNull(invitationLinks.revoked_at),
          ),
        )
        .limit(1);
      if (link) throw forbidden("household_id", "This household has an active invitation link. Ask an owner to add the guest.");
    }
  } else {
    const [created] = await tx
      .insert(households)
      .values({
        wedding_id,
        name: input.household_name ?? householdNameFor(input.full_name),
        relation: input.relation ?? null,
        created_at: now,
        updated_at: now,
      })
      .returning({ id: households.id });
    household_id = created.id;
    household_created = true;
  }

  const eventIds = unique(input.event_ids ?? []);
  const invited = await loadEventsOrFail(tx, wedding_id, eventIds, "event_ids");

  const [duplicate] = await tx
    .select({ count: sql<number>`count(*)::bigint` })
    .from(guests)
    .where(
      and(
        eq(guests.wedding_id, wedding_id),
        isNull(guests.deleted_at),
        sql`lower(regexp_replace(btrim(${guests.full_name}), '\\s+', ' ', 'g')) = ${normalizeName(input.full_name)}`,
      ),
    );

  const [guest] = await tx
    .insert(guests)
    .values({
      wedding_id,
      household_id,
      full_name: input.full_name,
      group_label: input.group_label ?? null,
      dietary_note: input.dietary_note ?? null,
      note: input.note ?? null,
      created_at: now,
      updated_at: now,
    })
    .returning({ id: guests.id });
  const guest_id = guest.id;

  if (household_created) {
    await tx.update(households).set({ primary_guest_id: guest_id, updated_at: now }).where(eq(households.id, household_id));
  }

  const contact_added = input.phone !== undefined || input.email !== undefined;
  if (contact_added) {
    await tx.insert(guestContacts).values({
      guest_id,
      wedding_id,
      phone: input.phone ?? null,
      email: input.email ?? null,
      created_at: now,
      updated_at: now,
    });
  }

  let invitation_ids: string[] = [];
  if (invited.length > 0) {
    const inserted = await tx
      .insert(invitations)
      .values(
        invited.map((event) => ({
          wedding_id,
          guest_id,
          event_id: event.event_id,
          max_plus_ones: input.max_plus_ones ?? 0,
          created_at: now,
          updated_at: now,
        })),
      )
      .returning({ id: invitations.id });
    invitation_ids = inserted.map((row) => row.id);
  }

  const after: JsonObject = { full_name: input.full_name, household_id };
  if (household_created) after.household_created = true;
  if (input.group_label) after.group_label = input.group_label;
  if (invited.length > 0) after.event_ids = invited.map((event) => event.event_id);
  if (input.max_plus_ones !== undefined) after.max_plus_ones = input.max_plus_ones;
  if (input.dietary_note) after.dietary_note = input.dietary_note;
  if (input.note) after.note = input.note;
  if (contact_added) after.contact_added = true;

  const warnings: CommandWarning[] = [];
  if (Number(duplicate?.count ?? 0) > 0) {
    warnings.push({ kind: "possible_duplicate", message: `A guest named ${input.full_name} is already on the list.`, entity_ids: [guest_id] });
  }

  return {
    outcome: "applied",
    result: { guest_id, household_id, household_created, invitation_ids },
    activity: addGuestActivity({ actor_label: actor.display_name, guest_id, full_name: input.full_name, household_id, invited, after }),
    warnings,
  };
};

// ---------------------------------------------------------------------------
// set_invitations
// ---------------------------------------------------------------------------

export const setInvitationsHandler: CommandHandler<"set_invitations", Tx> = async (
  context: Ctx<"set_invitations">,
): Promise<Res<"set_invitations">> => {
  const actor = ownerOf(context);
  const wedding_id = requireWedding(context);
  const { tx, input } = context;
  const now = new Date(context.now);

  const [guest] = await tx
    .select({ id: guests.id, full_name: guests.full_name })
    .from(guests)
    .where(and(eq(guests.id, input.guest_id), eq(guests.wedding_id, wedding_id), isNull(guests.deleted_at)))
    .limit(1);
  if (!guest) throw notFound("guest_id", "Guest not found.");

  const existing = await tx
    .select({
      id: invitations.id,
      event_id: invitations.event_id,
      max_plus_ones: invitations.max_plus_ones,
      plus_ones: invitations.plus_ones,
      revoked_at: invitations.revoked_at,
    })
    .from(invitations)
    .where(and(eq(invitations.wedding_id, wedding_id), eq(invitations.guest_id, guest.id)))
    .orderBy(asc(invitations.id))
    .for("update");
  const byEvent = new Map(existing.map((row) => [row.event_id, row]));

  const targetIds = unique(input.event_ids);
  const targets = await loadEventsOrFail(tx, wedding_id, targetIds, "event_ids");
  const targetSet = new Set(targetIds);
  const nextMax = input.max_plus_ones;

  const added: string[] = [];
  const removed: string[] = [];
  let maxChanged = false;

  for (const event of targets) {
    const row = byEvent.get(event.event_id);
    if (!row) {
      await tx.insert(invitations).values({
        wedding_id,
        guest_id: guest.id,
        event_id: event.event_id,
        max_plus_ones: nextMax ?? 0,
        created_at: now,
        updated_at: now,
      });
      added.push(event.event_id);
    } else if (row.revoked_at) {
      // R11: inviting again clears revoked_at and resets the answer to pending.
      await tx
        .update(invitations)
        .set({
          revoked_at: null,
          rsvp_status: "pending",
          plus_ones: 0,
          responded_at: null,
          responded_via: null,
          rsvp_updated_by_member_id: null,
          max_plus_ones: nextMax ?? Number(row.max_plus_ones),
          updated_at: now,
        })
        .where(eq(invitations.id, row.id));
      added.push(event.event_id);
    } else if (nextMax !== undefined && Number(row.max_plus_ones) !== nextMax) {
      // A lowered limit lowers any larger plus_ones to the new limit.
      await tx
        .update(invitations)
        .set({ max_plus_ones: nextMax, plus_ones: Math.min(Number(row.plus_ones), nextMax), updated_at: now })
        .where(eq(invitations.id, row.id));
      maxChanged = true;
    }
  }
  for (const row of existing) {
    if (row.revoked_at || targetSet.has(row.event_id)) continue;
    await tx.update(invitations).set({ revoked_at: now, updated_at: now }).where(eq(invitations.id, row.id));
    removed.push(row.event_id);
  }

  const activeBefore = existing.filter((row) => !row.revoked_at).map((row) => row.event_id);
  const activeAfter = targets.map((event) => event.event_id);
  if (added.length === 0 && removed.length === 0 && !maxChanged) {
    return { outcome: "unchanged", result: { guest_id: guest.id, event_ids: activeAfter, added: [], removed: [] }, activity: null };
  }

  // Event words for the summary: removed functions may since have been deleted from the draft.
  const changedIds = unique([...added, ...removed]);
  const named =
    changedIds.length === 0
      ? []
      : await tx
          .select(eventColumns)
          .from(events)
          .where(and(eq(events.wedding_id, wedding_id), inArray(events.id, changedIds)))
          .orderBy(asc(events.event_date), sql`${events.start_time} asc nulls last`, asc(events.sort_order), asc(events.id));
  const pick = (ids: readonly string[]) => named.filter((event) => ids.includes(event.event_id));
  const changes = describeInvitationChanges({ added: pick(added), removed: pick(removed), max_plus_ones: maxChanged ? (nextMax ?? null) : null });

  const before: JsonObject = { event_ids: activeBefore };
  const after: JsonObject = { event_ids: activeAfter };
  if (maxChanged && nextMax !== undefined) after.max_plus_ones = nextMax;

  return {
    outcome: "applied",
    result: { guest_id: guest.id, event_ids: activeAfter, added, removed },
    activity: {
      topic: "invitations.set",
      entity_type: "guest",
      entity_id: guest.id,
      summary_en: `${actor.display_name} changed ${guest.full_name}'s invitations: ${changes.en}.`,
      summary_hi: `${actor.display_name} ने ${guest.full_name} के न्योते बदले: ${changes.hi}।`,
      before,
      after,
      visibility: "members",
    },
  };
};

// ---------------------------------------------------------------------------
// set_rsvp (members, on a guest's behalf: R10)
// ---------------------------------------------------------------------------

export const setRsvpHandler: CommandHandler<"set_rsvp", Tx> = async (context: Ctx<"set_rsvp">): Promise<Res<"set_rsvp">> => {
  const actor = memberOf(context);
  const wedding_id = requireWedding(context);
  const { tx, input } = context;
  const now = new Date(context.now);

  const [event] = await tx
    .select(eventColumns)
    .from(events)
    .where(and(eq(events.id, input.event_id), eq(events.wedding_id, wedding_id), isNull(events.deleted_at)))
    .limit(1);
  if (!event) throw notFound("event_id", "Function not found.");

  const guestIds = unique(input.guest_ids);
  const guestRows = await tx
    .select({ id: guests.id, full_name: guests.full_name })
    .from(guests)
    .where(and(eq(guests.wedding_id, wedding_id), inArray(guests.id, guestIds), isNull(guests.deleted_at)));
  if (guestRows.length !== guestIds.length) throw notFound("guest_ids", "Guest not found.");
  const names = new Map(guestRows.map((row) => [row.id, row.full_name]));

  // R7: lock the rows this command may change, after the wedding lock.
  const rows = await tx
    .select({
      id: invitations.id,
      guest_id: invitations.guest_id,
      rsvp_status: invitations.rsvp_status,
      plus_ones: invitations.plus_ones,
      max_plus_ones: invitations.max_plus_ones,
      revoked_at: invitations.revoked_at,
    })
    .from(invitations)
    .where(and(eq(invitations.wedding_id, wedding_id), eq(invitations.event_id, event.event_id), inArray(invitations.guest_id, guestIds)))
    .orderBy(asc(invitations.id))
    .for("update");
  const byGuest = new Map(rows.map((row) => [row.guest_id, row]));

  const single = guestIds.length === 1;
  const plan: { row: (typeof rows)[number]; plus_ones: number }[] = [];
  for (const guest_id of guestIds) {
    const row = byGuest.get(guest_id);
    if (!row || row.revoked_at) {
      const full_name = names.get(guest_id) ?? "This guest";
      throw new CommandFailure({
        code: "not_invited",
        message: `${full_name} is not invited to the ${eventWord(event)}.`,
        field: "guest_ids",
        current: { guest_id, full_name, event_id: event.event_id },
      });
    }
    const stored = { rsvp_status: row.rsvp_status, plus_ones: Number(row.plus_ones), max_plus_ones: Number(row.max_plus_ones) };
    const plus_ones = resolvePlusOnes(input.rsvp_status, single ? input.plus_ones : undefined, stored.max_plus_ones, {
      keep: single ? undefined : stored.rsvp_status === "attending" ? stored.plus_ones : 0,
    });
    if (answerChanged(stored, { rsvp_status: input.rsvp_status, plus_ones })) plan.push({ row, plus_ones });
  }

  for (const item of plan) {
    await tx
      .update(invitations)
      .set({
        rsvp_status: input.rsvp_status,
        plus_ones: item.plus_ones,
        responded_at: now,
        responded_via: "member",
        rsvp_updated_by_member_id: actor.member_id,
        updated_at: now,
      })
      .where(eq(invitations.id, item.row.id));
  }

  const [rsvp_totals] = await loadRsvpTotalsRows(tx, wedding_id, event.event_id);
  if (plan.length === 0) return { outcome: "unchanged", result: { rsvp_totals }, activity: null };

  return {
    outcome: "applied",
    result: { rsvp_totals },
    activity: setRsvpActivity({
      actor_label: actor.display_name,
      event,
      status: input.rsvp_status,
      changed: plan.map(({ row, plus_ones }) => ({
        invitation_id: row.id,
        guest_id: row.guest_id,
        full_name: names.get(row.guest_id) ?? "",
        before: { rsvp_status: row.rsvp_status, plus_ones: Number(row.plus_ones) },
        plus_ones,
      })),
    }),
  };
};

// ---------------------------------------------------------------------------
// set_dietary (members, or the guest token for its own household)
// ---------------------------------------------------------------------------

export const setDietaryHandler: CommandHandler<"set_dietary", Tx> = async (context: Ctx<"set_dietary">): Promise<Res<"set_dietary">> => {
  const wedding_id = requireWedding(context);
  const { tx, input } = context;
  const now = new Date(context.now);
  const guestActor = context.actor.kind === "guest" ? guestOf(context) : null;
  const member = guestActor ? null : memberOf(context);

  const conditions = [eq(guests.id, input.guest_id), eq(guests.wedding_id, wedding_id), isNull(guests.deleted_at)];
  if (guestActor) conditions.push(eq(guests.household_id, guestActor.household_id));
  const [guest] = await tx
    .select({ id: guests.id, full_name: guests.full_name, dietary_note: guests.dietary_note, household_id: guests.household_id })
    .from(guests)
    .where(and(...conditions))
    .for("update");
  if (!guest) throw guestActor ? guestNotFound() : notFound("guest_id", "Guest not found.");

  const next = input.dietary_note ?? null;
  // A guest's answer is its refreshed view. With nothing published the page itself is the
  // one 404, so the dietary route must be too (G5: a valid token is no oracle).
  const result = async (): Promise<JsonObject> => {
    if (!guestActor) return { guest_id: guest.id, dietary_note: next };
    const view = await refreshedGuestView(tx, guestActor);
    if (!view) throw guestNotFound();
    return view as unknown as JsonObject;
  };

  if ((guest.dietary_note ?? null) === next) return { outcome: "unchanged", result: await result(), activity: null };

  await tx.update(guests).set({ dietary_note: next, updated_at: now }).where(eq(guests.id, guest.id));

  const activity: ActivityEntryDraft & { actor_guest_id?: string } = {
    ...setDietaryActivity({
      actor_label: guestActor ? guest.full_name : member!.display_name,
      guest_id: guest.id,
      full_name: guest.full_name,
      before: guest.dietary_note ?? null,
      after: next,
    }),
    ...(guestActor ? { actor_label: guest.full_name, actor_guest_id: guest.id } : {}),
  };
  return { outcome: "applied", result: await result(), activity };
};

// ---------------------------------------------------------------------------
// submit_rsvp (the guest token only)
// ---------------------------------------------------------------------------

export const submitRsvpHandler: CommandHandler<"submit_rsvp", Tx> = async (context: Ctx<"submit_rsvp">): Promise<Res<"submit_rsvp">> => {
  const actor = guestOf(context);
  const wedding_id = requireWedding(context);
  const { tx, input } = context;
  const now = new Date(context.now);

  // R9: only functions in the latest publication, only guests of this household. Every scope
  // check runs before any 422, so a request holding anything out of scope is the one 404 (G5).
  const publication = await loadPublishedSnapshot(tx, wedding_id);
  if (!publication) throw guestNotFound();
  const published = new Map(publication.snapshot.events.map((event) => [event.event_id, event]));
  if (input.responses.some((response) => !published.has(response.event_id))) throw guestNotFound();

  const guestIds = unique(input.responses.map((response) => response.guest_id));
  const eventIds = unique(input.responses.map((response) => response.event_id));
  const guestRows = await tx
    .select({ id: guests.id, full_name: guests.full_name })
    .from(guests)
    .where(
      and(
        eq(guests.wedding_id, wedding_id),
        eq(guests.household_id, actor.household_id),
        inArray(guests.id, guestIds),
        isNull(guests.deleted_at),
      ),
    );
  if (guestRows.length !== guestIds.length) throw guestNotFound();
  const names = new Map(guestRows.map((row) => [row.id, row.full_name]));

  // R7: lock the household's rows for these functions, after the wedding lock.
  const rows = await tx
    .select({
      id: invitations.id,
      guest_id: invitations.guest_id,
      event_id: invitations.event_id,
      rsvp_status: invitations.rsvp_status,
      plus_ones: invitations.plus_ones,
      max_plus_ones: invitations.max_plus_ones,
      revoked_at: invitations.revoked_at,
    })
    .from(invitations)
    .where(and(eq(invitations.wedding_id, wedding_id), inArray(invitations.guest_id, guestIds), inArray(invitations.event_id, eventIds)))
    .orderBy(asc(invitations.id))
    .for("update");
  const byPair = new Map(rows.map((row) => [`${row.guest_id}|${row.event_id}`, row]));

  // Every response is checked before anything is written: scope (404) first, then 422s.
  for (const response of input.responses) {
    const row = byPair.get(`${response.guest_id}|${response.event_id}`);
    if (!row || row.revoked_at) throw guestNotFound();
  }
  const seen = new Set<string>();
  input.responses.forEach((response, index) => {
    const pair = `${response.guest_id}|${response.event_id}`;
    if (seen.has(pair)) {
      throw new CommandFailure({ code: "validation_failed", message: "unknown_value", field: `responses.${index}` });
    }
    seen.add(pair);
  });
  const changed: SubmittedAnswer[] = [];
  input.responses.forEach((response, index) => {
    const row = byPair.get(`${response.guest_id}|${response.event_id}`)!;
    const plus_ones = resolvePlusOnes(response.rsvp_status, response.plus_ones, Number(row.max_plus_ones), {
      field: `responses.${index}.plus_ones`,
    });
    const before = { rsvp_status: row.rsvp_status, plus_ones: Number(row.plus_ones) };
    if (!answerChanged(before, { rsvp_status: response.rsvp_status, plus_ones })) return;
    const event = published.get(response.event_id)!;
    changed.push({
      invitation_id: row.id,
      guest_id: row.guest_id,
      full_name: names.get(row.guest_id) ?? "",
      event: { event_id: event.event_id, event_kind: event.event_kind, title: event.title, title_hi: event.title_hi },
      before,
      rsvp_status: response.rsvp_status,
      plus_ones,
    });
  });

  for (const answer of changed) {
    await tx
      .update(invitations)
      .set({
        rsvp_status: answer.rsvp_status,
        plus_ones: answer.plus_ones,
        responded_at: now,
        responded_via: "guest_link",
        rsvp_updated_by_member_id: null,
        updated_at: now,
      })
      .where(eq(invitations.id, answer.invitation_id));
  }

  const view = await refreshedGuestView(tx, actor);
  if (!view) throw guestNotFound();
  if (changed.length === 0) return { outcome: "unchanged", result: view, activity: null };

  return {
    outcome: "applied",
    result: view,
    activity: submitRsvpActivity({ household_id: actor.household_id, household_name: actor.household_name, changed }),
  };
};

// ---------------------------------------------------------------------------
// create_invitation_links and revoke_invitation_link (owners)
// ---------------------------------------------------------------------------

export const createInvitationLinksHandler: CommandHandler<"create_invitation_links", Tx> = async (
  context: Ctx<"create_invitation_links">,
): Promise<Res<"create_invitation_links">> => {
  const actor = ownerOf(context);
  const wedding_id = requireWedding(context);
  const { tx, input } = context;
  const now = new Date(context.now);
  const rotate = input.rotate ?? false;

  const ids = unique(input.household_ids);
  const rows = await tx
    .select({ id: households.id, is_synthetic: households.is_synthetic })
    .from(households)
    .where(and(eq(households.wedding_id, wedding_id), inArray(households.id, ids)));
  if (rows.length !== ids.length) throw notFound("household_ids", "Household not found.");
  const synthetic = new Set(rows.filter((row) => row.is_synthetic).map((row) => row.id));
  const syntheticIndex = input.household_ids.findIndex((id) => synthetic.has(id));
  if (syntheticIndex >= 0) {
    // Synthetic placeholders have no links (domain 3.4).
    throw new CommandFailure({ code: "validation_failed", message: "unknown_value", field: `household_ids.${syntheticIndex}` });
  }

  const active = await tx
    .select({ id: invitationLinks.id, household_id: invitationLinks.household_id })
    .from(invitationLinks)
    .where(and(eq(invitationLinks.wedding_id, wedding_id), inArray(invitationLinks.household_id, ids), isNull(invitationLinks.revoked_at)))
    .orderBy(asc(invitationLinks.id))
    .for("update");
  const activeByHousehold = new Map(active.map((row) => [row.household_id, row]));

  const links: { household_id: HouseholdId; url: string }[] = [];
  const skipped: HouseholdId[] = [];
  const rotated: HouseholdId[] = [];
  const created: string[] = [];
  for (const household_id of ids) {
    const current = activeByHousehold.get(household_id);
    if (current && !rotate) {
      skipped.push(household_id);
      continue;
    }
    if (current) {
      // Rotating is revoke plus a new link (6.3): the old URL answers 404 at once.
      await tx.update(invitationLinks).set({ revoked_at: now, updated_at: now }).where(eq(invitationLinks.id, current.id));
      rotated.push(household_id);
    }
    const token = generateLinkToken();
    const [link] = await tx
      .insert(invitationLinks)
      .values({
        wedding_id,
        household_id,
        token_hash: hashLinkToken(token).hash,
        token_hint: linkTokenHint(token),
        created_by_member_id: actor.member_id,
        created_at: now,
        updated_at: now,
      })
      .returning({ id: invitationLinks.id });
    created.push(link.id);
    links.push({ household_id, url: routes.guestSite(token) });
  }

  if (links.length === 0) return { outcome: "unchanged", result: { links: [], skipped }, activity: null };

  return {
    outcome: "applied",
    result: { links, skipped },
    activity: createLinksActivity({
      actor_label: actor.display_name,
      first_link_id: created[0],
      household_ids: links.map((link) => link.household_id),
      rotated_household_ids: rotated,
    }),
  };
};

export const revokeInvitationLinkHandler: CommandHandler<"revoke_invitation_link", Tx> = async (
  context: Ctx<"revoke_invitation_link">,
): Promise<Res<"revoke_invitation_link">> => {
  const actor = ownerOf(context);
  const wedding_id = requireWedding(context);
  const { tx, input } = context;
  const now = new Date(context.now);

  const [household] = await tx
    .select({ id: households.id, name: households.name })
    .from(households)
    .where(and(eq(households.id, input.household_id), eq(households.wedding_id, wedding_id)))
    .limit(1);
  if (!household) throw notFound("household_id", "Household not found.");

  const [link] = await tx
    .select({ id: invitationLinks.id })
    .from(invitationLinks)
    .where(and(eq(invitationLinks.wedding_id, wedding_id), eq(invitationLinks.household_id, household.id), isNull(invitationLinks.revoked_at)))
    .for("update");
  if (!link) throw notFound("household_id", "This household has no active link.");

  await tx.update(invitationLinks).set({ revoked_at: now, updated_at: now }).where(eq(invitationLinks.id, link.id));

  return {
    outcome: "applied",
    result: { household_id: household.id, revoked: true },
    activity: revokeLinkActivity({
      actor_label: actor.display_name,
      link_id: link.id,
      household_id: household.id,
      household_name: household.name,
      revoked_at: now.toISOString(),
    }),
  };
};

/** Lane A's handlers for 3.4's guest commands, for the registry in `src/server/commands/`. */
export const guestHandlers: HandlerMap = {
  add_guest: addGuestHandler,
  set_invitations: setInvitationsHandler,
  set_rsvp: setRsvpHandler,
  set_dietary: setDietaryHandler,
  submit_rsvp: submitRsvpHandler,
  create_invitation_links: createInvitationLinksHandler,
  revoke_invitation_link: revokeInvitationLinkHandler,
};
