/**
 * The D0 dataset of one sample copy, as rows for `src/db/schema.ts` (demo-data.md, all of it;
 * domain-and-data 3.7, 5.0, 5.1 and 5.3). Pure: no I/O, no clock, no `server-only`, so
 * `scripts/seed.ts` (tsx), Vitest and Lane A's `reset_demo` handler share this one copy.
 *
 * - Every row carries a `seed_key`, and its id is `seededId(copy, <domain table>, seed_key)`
 *   (D100, D123). Parent-keyed tables (`budgets`, `invite_styles`, `guest_contacts`) use their
 *   parent's key; `vendor_events` has no id.
 * - Values come from `getDemoFixture(copy)` (its keys and ids, so fixtures and seed agree),
 *   corrected where demo-data or a binding spec says otherwise (see FIXTURE_CORRECTIONS).
 * - Activity lines follow domain-and-data section 3's templates, not demo-data's paraphrases (D23).
 * - REV-1 and REV-2 are built with `src/db/itinerary-snapshot.ts`, never by hand (D95), and
 *   REV-2 is built from the D0 draft rows, so the draft and the latest snapshot agree.
 *
 * Not in `rows`, on purpose:
 * - `invitation_links`: tokens are random, made once by `ensureInvitationLinks` (seed-apply.ts).
 * - The couple photo's `assets` row: it is part of D0 from the start (D126), but `reset_demo`
 *   keeps it (3.7) and the photo step fills its file fields, so it must be inserted only when
 *   missing and never overwritten. It is `photo.row`. `invite_styles.photo_asset_id` and both
 *   snapshots reference it, so the applier inserts `photo.row` (ON CONFLICT DO NOTHING) before
 *   `invite_styles`.
 * - `activity_entries.seq`: an identity that is unique across every wedding, so the database
 *   assigns it.
 */
import {
  BUDGET_CATEGORY_LABELS,
  type CommandSource,
  type EventKind,
  type IsoDate,
  type JsonValue,
  type PublicationSnapshot,
} from "../contracts/domain";
import { getDemoFixture, SEED_KEYS, vendorEventKey, type DemoFixture } from "../contracts/fixtures";
import { exportKey } from "../contracts/jobs";
import { formatInr } from "../contracts/money";
import { SAMPLE_COPIES, seededId, uuidV5, type SampleCopy } from "./ids";
import { buildItinerarySnapshot, diffSnapshots, type SnapshotEventRow } from "./itinerary-snapshot";
import type { ALL_TABLES } from "./schema";

// ---------------------------------------------------------------------------
// Types (the agreed interface with seed-apply.ts and scripts/seed.ts)
// ---------------------------------------------------------------------------

export type SeedTableKey = keyof typeof ALL_TABLES;
export type SeedRow<K extends SeedTableKey> = (typeof ALL_TABLES)[K]["$inferInsert"];
export type SeedRows = { [K in SeedTableKey]?: Array<SeedRow<K>> };

export type SeedAccount = { email: string; display_name: string; member_key: string; role: "owner" | "manager" };

export type SeedDataset = {
  copy: SampleCopy;
  wedding_id: string;
  rows: SeedRows;
  /** Household seed keys that get a guest link (the 16 named households; never the synthetic one). */
  link_households: string[];
  /**
   * The couple photo (D107, D126). `row` is the D0 asset row (no file fields yet): insert it
   * when missing, never overwrite it. `storage_path` is `{wedding_id}/{asset_id}.jpg` in `uploads`.
   */
  photo: { asset_id: string; seed_key: string; storage_path_ext: "jpg"; storage_path: string; row: SeedRow<"assets"> };
  /**
   * The extra couple photos ASSET-PHOTO-2 to ASSET-PHOTO-6, so the invitation photo can be switched
   * in the demo. Unlike `photo`, they have no D0 row: the photo step creates each one when its file
   * (`scripts/seed-assets/couple-photo-{n}.jpg`) exists, and `reset_demo` keeps them (assets are
   * never deleted, domain 3.7). The invite style keeps pointing at `photo`.
   */
  extra_photos: ExtraPhoto[];
  /** JOB-EXP-R2-PNG (D15): Ready, with artifact fields only when `rev2_card` was given. */
  rev2_job: { job_id: string; seed_key: string; revision: 2; artifact_path: string };
};

/** One extra couple photo: `couple-photo-{number}.jpg` is stored as seed key `ASSET-PHOTO-{number}`. */
export type ExtraPhoto = { number: number; asset_id: string; seed_key: string; storage_path: string; file_name: string };

/** The extra photos' numbers (the lead's photo PR commits couple-photo-2.jpg to couple-photo-6.jpg). */
export const EXTRA_PHOTO_NUMBERS = [2, 3, 4, 5, 6] as const;

/** `ASSET-PHOTO-{n}`: stable, so a rerun upserts the same row and the fixed id never changes. */
export function extraPhotoSeedKey(number: number): string {
  return `${SEED_KEYS.couple_photo}-${number}`;
}

/** The extra photos of a copy, with ids from `seededId` and storage paths `{wedding_id}/{asset_id}.jpg`. */
export function extraPhotosOf(copy: SampleCopy): ExtraPhoto[] {
  const wedding_id = seededId(copy, "weddings", SEED_KEYS.wedding);
  return EXTRA_PHOTO_NUMBERS.map((number) => {
    const seed_key = extraPhotoSeedKey(number);
    const asset_id = seededId(copy, "assets", seed_key);
    return { number, asset_id, seed_key, storage_path: `${wedding_id}/${asset_id}.jpg`, file_name: `couple-photo-${number}.jpg` };
  });
}

export type BuildSeedDatasetOptions = {
  /** Supabase Auth user id per account email (seedAccounts). `fallbackUserId` makes them for local runs. */
  user_ids: Record<string, string>;
  /**
   * The REV-2 card file's digest, once `scripts/seed-assets/card-rev2.png` exists and is
   * uploaded to `rev2_job.artifact_path` (D15). Omitted: the job is Ready without a file.
   */
  rev2_card?: { sha256: string; bytes: number };
};

/** The `command_source` of every seeded version and activity row. */
export const SEED_SOURCE: CommandSource = "seed";

/**
 * `seededId`'s table names (domain 5.1) for the tables whose rows have an `id`.
 * `budgets`, `invite_styles`, `guest_contacts` and `vendor_events` have none.
 */
export const SEED_ID_TABLES = {
  weddings: "weddings",
  budgetLines: "budget_lines",
  members: "members",
  memberInvites: "member_invites",
  venues: "venues",
  events: "events",
  assets: "assets",
  publications: "publications",
  households: "households",
  guests: "guests",
  invitations: "invitations",
  invitationLinks: "invitation_links",
  vendors: "vendors",
  quotes: "quotes",
  commitments: "commitments",
  commitmentVersions: "commitment_versions",
  payments: "payments",
  paymentVersions: "payment_versions",
  requirements: "requirements",
  shagunEntries: "shagun_entries",
  proposals: "proposals",
  activityEntries: "activity_entries",
  exportJobs: "export_jobs",
  exportAttempts: "export_attempts",
} as const satisfies Partial<Record<SeedTableKey, string>>;

/** The seed key of a household's seeded guest link (`LINK-H16`), for `ensureInvitationLinks`. */
export const invitationLinkSeedKey = (household_seed_key: string) => `LINK-${household_seed_key}`;

/**
 * Where this dataset departs from `src/contracts/fixtures.ts`, and why. The fixtures should
 * follow in a lead PR; until then a fixture-backed screen may show the older text.
 */
export const FIXTURE_CORRECTIONS = [
  "COM-01/v1.description is '250 × ₹800, fixed minimum' (demo-data 7.1's basis)",
  "PRP-01.input.description is 'For the baraat' (domain 5.1)",
  "PRP-01.summary_hi and ACT-03.summary_hi end 'भुगतान बाकी' ({paid_state_hi}, domain 3.5)",
  "ACT-04 and ACT-05 summary_en follow add_requirement's template: Diya added \"{item}\" to the {event}. (domain 3.4, D23)",
  "Seeded versions and activity entries carry source 'seed', not 'ui'",
  "Haldi replies carry responded_at 24 Nov 20:30 IST, after the haldi and its invitations existed (ACT-01, 16:05), not 23 Nov 18:00",
] as const;

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

/**
 * The Auth accounts of one copy, owner first (demo-data 1.2 and 1.4): Mira (owner), Kabir
 * (co-owner, seeded though nobody signs in as him, domain open question 14) and Diya (manager).
 * Demo copy: mira.owner@, kabir.owner@, diya.manager@; copy x: mira.x@, kabir.x@, diya.x@.
 */
export function seedAccounts(copy: SampleCopy): SeedAccount[] {
  return getDemoFixture(copy).members.map((member) => {
    if (!member.seed_key) throw new Error(`Fixture member ${member.email} has no seed_key`);
    return { email: member.email, display_name: member.display_name, member_key: member.seed_key, role: member.role };
  });
}

/**
 * A deterministic stand-in for a Supabase Auth user id, for local runs without Auth. For a seed
 * account it is the fixtures' user id, so a fixture session finds its member in a local database.
 */
export function fallbackUserId(email: string): string {
  const normalized = email.trim().toLowerCase();
  for (const copy of SAMPLE_COPIES) {
    const member = getDemoFixture(copy).members.find((row) => row.email.toLowerCase() === normalized);
    if (member) return member.user_id;
  }
  return uuidV5(`auth.users:${normalized}`);
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** The instant of an IST wall-clock date and "HH:MM" time. */
const at = (date: IsoDate, time: string): Date => new Date(`${date}T${time}:00+05:30`);
const instant = (value: string | null): Date | null => (value === null ? null : new Date(value));
const json = (value: unknown): JsonValue => JSON.parse(JSON.stringify(value)) as JsonValue;
const later = (a: Date, b: Date | null): Date => (b !== null && b.getTime() > a.getTime() ? b : a);

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The template's `{when}`, `{old}` and `{new}` form (domain 3.0): "Sun 13 Dec, 9:30 AM". */
export function formatWhen(date: IsoDate, time: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  const [hours, minutes] = time.split(":").map(Number);
  const clock = `${hours % 12 === 0 ? 12 : hours % 12}:${String(minutes).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`;
  return `${weekday} ${day} ${MONTHS[month - 1]}, ${clock}`;
}

/** The template's `{event}`: the function word in a sentence ("the reception"; `other` uses its title). */
const eventWord = (kind: EventKind, title: string) => (kind === "other" ? title : kind);

function must<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`Seed data is missing ${what}`);
  return value;
}

// ---------------------------------------------------------------------------
// Fixed times (IST). demo-data gives the activity, publication and money dates; the rest are
// plausible and fixed, so a reseed writes the same values.
// ---------------------------------------------------------------------------

const T_WEDDING = at("2026-11-01", "10:00");
const T_VENDORS = at("2026-11-05", "10:00");
const T_GUESTS = at("2026-11-02", "11:00");
const T_REQUIREMENTS = at("2026-11-23", "10:00");
const T_DIYA_JOINED = at("2026-11-20", "10:00");
/** After ACT-01 (the haldi, 16:05) and before REV-2 (21:00). */
const T_HALDI_REPLIES = at("2026-11-24", "20:30");
const T_ACT = {
  "ACT-01": at("2026-11-24", "16:05"),
  "ACT-02": at("2026-11-24", "17:40"),
  "ACT-03": at("2026-11-24", "19:15"),
  "ACT-04": at("2026-11-25", "08:30"),
  "ACT-05": at("2026-11-25", "08:45"),
} as const;

/** demo-data 8's "Added by". */
const REQUIREMENT_ADDED_BY: Record<string, "mira" | "diya"> = {
  "REQ-01": "mira",
  "REQ-02": "diya",
  "REQ-03": "diya",
  "REQ-04": "diya",
  "REQ-05": "mira",
  "REQ-06": "mira",
  "REQ-07": "mira",
  "REQ-08": "diya",
  "REQ-09": "mira",
};

/** export-and-recovery 1.2: the lead-in above the names, the follow line below (split at the blank line). */
const WORDING_EN = "With the blessings of our families\n\ninvite you to celebrate their wedding";

// ---------------------------------------------------------------------------
// The dataset
// ---------------------------------------------------------------------------

/** The D0 state of one sample copy (demo-data 9.3's D0 row; acceptance 0.4). */
export function buildSeedDataset(copy: SampleCopy, options: BuildSeedDatasetOptions): SeedDataset {
  const f: DemoFixture = getDemoFixture(copy);
  const id = (table: string, seed_key: string) => seededId(copy, table, seed_key);
  const wedding_id = f.wedding.wedding_id;
  const weddingKey = SEED_KEYS.wedding;

  // Members and their Auth users
  const userIdFor = (email: string): string => {
    const value = options.user_ids[email] ?? options.user_ids[email.toLowerCase()];
    if (!value) throw new Error(`buildSeedDataset(${copy}): no Auth user id for ${email}; pass it in options.user_ids`);
    return value;
  };
  const memberBySeed = (seed_key: string) => must(f.members.find((m) => m.seed_key === seed_key), `member ${seed_key}`);
  const mira = memberBySeed(SEED_KEYS.members.mira);
  const kabir = memberBySeed(SEED_KEYS.members.kabir);
  const diya = memberBySeed(SEED_KEYS.members.diya);
  const memberIdOf = { mira: mira.member_id, kabir: kabir.member_id, diya: diya.member_id };

  const eventBySeed = (seed_key: string) => must(f.events.find((e) => e.seed_key === seed_key), `event ${seed_key}`);
  const eventById = new Map(f.events.map((e) => [e.event_id, e]));
  const venueById = new Map(f.venues.map((v) => [v.venue_id, v]));
  const haldi = eventBySeed("EVT-HAL");
  const mehendi = eventBySeed("EVT-MEH");

  // --- Wedding, budget, members -------------------------------------------------------------

  const REV2_AT = new Date(must(f.publications.find((p) => p.seed_key === "REV-2"), "REV-2").published_at);

  const weddings: SeedRow<"weddings">[] = [
    {
      id: wedding_id,
      bride_name: f.wedding.bride_name,
      groom_name: f.wedding.groom_name,
      city: f.wedding.city,
      wedding_date: f.wedding.wedding_date,
      expected_guests: f.wedding.expected_guests,
      timezone: f.wedding.timezone,
      is_sample: true,
      managers_can_see_vendor_dues: f.wedding.managers_can_see_vendor_dues,
      managers_can_see_budget: f.wedding.managers_can_see_budget,
      managers_can_see_guest_contacts: f.wedding.managers_can_see_guest_contacts,
      // The insert value only: the applier never lowers `version` and adds 1 per run (3.7).
      version: f.wedding.version,
      draft_version: f.wedding.draft_version,
      published_revision: f.wedding.published_revision,
      created_by_user_id: userIdFor(mira.email),
      created_at: T_WEDDING,
      updated_at: REV2_AT,
      seed_key: weddingKey,
    },
  ];

  const budgets: SeedRow<"budgets">[] = [
    { wedding_id, total_inr: f.budget_total_inr, created_at: T_WEDDING, updated_at: T_WEDDING, seed_key: weddingKey },
  ];

  const budgetLines: SeedRow<"budgetLines">[] = f.budget_lines.map((line) => {
    const seed_key = must(line.seed_key ?? undefined, `budget line ${line.budget_category}`);
    return {
      id: id("budget_lines", seed_key),
      wedding_id,
      budget_category: line.budget_category,
      planned_inr: line.planned_inr,
      created_at: T_WEDDING,
      updated_at: T_WEDDING,
      seed_key,
    };
  });

  const members: SeedRow<"members">[] = f.members.map((member) => {
    const joined = member.member_id === diya.member_id ? T_DIYA_JOINED : T_WEDDING;
    return {
      id: member.member_id,
      wedding_id,
      user_id: userIdFor(member.email),
      role: member.role,
      display_name: member.display_name,
      preferred_language: member.preferred_language,
      removed_at: null,
      created_at: joined,
      updated_at: joined,
      seed_key: must(member.seed_key ?? undefined, `member ${member.email}`),
    };
  });

  // --- Venues, functions, the invitation ----------------------------------------------------

  const venues: SeedRow<"venues">[] = f.venues.map((venue) => ({
    id: venue.venue_id,
    wedding_id,
    name: venue.name,
    place_name: venue.place_name,
    locality: venue.locality,
    address: venue.address,
    capacity: venue.capacity,
    map_url: venue.map_url,
    created_at: T_WEDDING,
    updated_at: T_WEDDING,
    seed_key: must(venue.seed_key ?? undefined, `venue ${venue.name}`),
  }));

  const events: SeedRow<"events">[] = f.events.map((event) => {
    const created = event.event_id === haldi.event_id ? T_ACT["ACT-01"] : T_WEDDING;
    const updated = event.event_id === mehendi.event_id ? T_ACT["ACT-02"] : created;
    return {
      id: event.event_id,
      wedding_id,
      event_kind: event.event_kind,
      title: event.title,
      title_hi: event.title_hi,
      event_date: event.event_date,
      start_time: event.start_time,
      end_time: event.end_time,
      muhurat_time: event.muhurat_time,
      venue_id: event.venue_id,
      dress_code: event.dress_code,
      // Open question 16: the reception reads "Dinner follows." (the fixtures already do).
      description: event.description,
      lead_name: event.lead_name,
      expected_headcount: event.expected_headcount,
      sort_order: event.sort_order,
      version: event.version,
      deleted_at: null,
      created_at: created,
      updated_at: updated,
      seed_key: must(event.seed_key ?? undefined, `event ${event.title}`),
    };
  });

  const photoDto = must(f.assets.find((asset) => asset.seed_key === SEED_KEYS.couple_photo), "the couple photo asset");
  const photoRow: SeedRow<"assets"> = {
    id: photoDto.asset_id,
    wedding_id,
    asset_kind: "couple_photo",
    storage_path: photoDto.storage_path,
    mime_type: photoDto.mime_type ?? "image/jpeg",
    // D126: no file yet; the photo step fills these and nothing else.
    bytes: null,
    width: null,
    height: null,
    uploaded_by_member_id: null,
    created_at: T_WEDDING,
    updated_at: T_WEDDING,
    seed_key: SEED_KEYS.couple_photo,
  };

  const inviteStyles: SeedRow<"inviteStyles">[] = [
    {
      wedding_id,
      theme: f.invite_style.theme,
      typeface: f.invite_style.typeface,
      layout: f.invite_style.layout,
      photo_frame: f.invite_style.photo_frame,
      // D126: the photo is referenced from the start, so the draft equals REV-2 before and after the photo step.
      photo_asset_id: photoRow.id,
      heading_hi: f.invite_style.heading_hi,
      wording_en: WORDING_EN,
      wording_hi: f.invite_style.wording_hi,
      blessing_line: null,
      updated_by_member_id: mira.member_id,
      created_at: T_WEDDING,
      updated_at: T_WEDDING,
      seed_key: weddingKey,
    },
  ];

  // --- Publications: REV-1 and REV-2, built with the one builder (D95) -----------------------

  const draftWedding = weddings[0];
  const draftStyle = inviteStyles[0];
  const rev2Snapshot: PublicationSnapshot = buildItinerarySnapshot({
    wedding: draftWedding,
    invite_style: draftStyle,
    events,
    venues,
  });
  // REV-1 (22 Nov, 20:00): before Diya's haldi (ACT-01) and before the mehendi ran to 19:30 (ACT-02).
  const rev1Events: SnapshotEventRow[] = events
    .filter((event) => event.id !== haldi.event_id)
    .map((event) => (event.id === mehendi.event_id ? { ...event, end_time: "18:00" } : event));
  const rev1Snapshot: PublicationSnapshot = buildItinerarySnapshot({
    wedding: draftWedding,
    invite_style: draftStyle,
    events: rev1Events,
    venues,
  });

  const publications: SeedRow<"publications">[] = f.publications.map((publication) => {
    const seed_key = must(publication.seed_key ?? undefined, `publication ${publication.revision}`);
    const snapshot = seed_key === "REV-1" ? rev1Snapshot : rev2Snapshot;
    const changes = seed_key === "REV-1" ? diffSnapshots(null, rev1Snapshot) : diffSnapshots(rev1Snapshot, rev2Snapshot, { wedding_id });
    const published_at = new Date(publication.published_at);
    return {
      id: publication.publication_id,
      wedding_id,
      revision: publication.revision,
      snapshot: json(snapshot),
      draft_version: publication.draft_version,
      changes: json(changes),
      note: publication.note,
      published_by_member_id: mira.member_id,
      published_at,
      created_at: published_at,
      seed_key,
    };
  });

  // --- Households, guests, contacts, invitations ---------------------------------------------

  const households: SeedRow<"households">[] = f.households.map((household) => ({
    id: household.household_id,
    wedding_id,
    name: household.name,
    relation: household.relation,
    // References guests: the applier inserts households with it null, then sets it after guests.
    primary_guest_id: household.primary_guest_id,
    is_synthetic: household.is_synthetic,
    created_at: T_GUESTS,
    updated_at: T_GUESTS,
    seed_key: must(household.seed_key ?? undefined, `household ${household.name}`),
  }));

  const guests: SeedRow<"guests">[] = f.guests.map((guest) => ({
    id: guest.guest_id,
    wedding_id,
    household_id: guest.household_id,
    full_name: guest.full_name,
    group_label: guest.group_label,
    dietary_note: guest.dietary_note,
    note: guest.note,
    is_synthetic: guest.is_synthetic,
    deleted_at: null,
    created_at: T_GUESTS,
    updated_at: T_GUESTS,
    seed_key: must(guest.seed_key ?? undefined, `guest ${guest.full_name}`),
  }));

  const guestContacts: SeedRow<"guestContacts">[] = f.guest_contacts.map((contact) => ({
    guest_id: contact.guest_id,
    wedding_id,
    phone: contact.phone,
    email: contact.email,
    created_at: T_GUESTS,
    updated_at: T_GUESTS,
    seed_key: must(contact.seed_key ?? undefined, `contact ${contact.guest_id}`),
  }));

  const invitations: SeedRow<"invitations">[] = f.invitations.map((invitation) => {
    const isHaldi = invitation.event_id === haldi.event_id;
    const created = isHaldi ? T_ACT["ACT-01"] : T_GUESTS;
    // A reply never predates its invitation: the haldi (and its invitations) exist from ACT-01.
    const responded_at = isHaldi && invitation.responded_at !== null ? T_HALDI_REPLIES : instant(invitation.responded_at);
    return {
      id: invitation.invitation_id,
      wedding_id,
      guest_id: invitation.guest_id,
      event_id: invitation.event_id,
      max_plus_ones: invitation.max_plus_ones,
      rsvp_status: invitation.rsvp_status,
      plus_ones: invitation.plus_ones,
      responded_at,
      responded_via: invitation.responded_via,
      rsvp_updated_by_member_id: invitation.responded_via === "member" ? mira.member_id : null,
      revoked_at: instant(invitation.revoked_at),
      created_at: created,
      updated_at: later(created, responded_at),
      seed_key: must(invitation.seed_key ?? undefined, `invitation ${invitation.invitation_id}`),
    };
  });

  // --- Vendors and money ---------------------------------------------------------------------

  const vendorCreated = (vendor_id: string): Date => {
    const vendor = f.vendors.find((row) => row.vendor_id === vendor_id);
    if (vendor?.is_one_off) {
      const commitment = f.commitments.find((row) => row.vendor_id === vendor_id);
      const agreed = commitment?.versions[0]?.agreed_on;
      if (agreed) return at(agreed, "12:00");
    }
    return T_VENDORS;
  };

  const vendors: SeedRow<"vendors">[] = f.vendors.map((vendor) => ({
    id: vendor.vendor_id,
    wedding_id,
    name: vendor.name,
    vendor_category: vendor.vendor_category,
    status: vendor.status,
    is_one_off: vendor.is_one_off,
    contact_name: vendor.contact_name,
    contact_phone: vendor.contact_phone,
    notes: vendor.notes,
    deleted_at: null,
    created_at: vendorCreated(vendor.vendor_id),
    updated_at: vendorCreated(vendor.vendor_id),
    seed_key: must(vendor.seed_key ?? undefined, `vendor ${vendor.name}`),
  }));

  const vendorEvents: SeedRow<"vendorEvents">[] = f.vendors.flatMap((vendor) =>
    vendor.event_ids.map((event_id) => {
      const event = must(eventById.get(event_id), `event ${event_id}`);
      return {
        vendor_id: vendor.vendor_id,
        event_id,
        wedding_id,
        created_at: vendorCreated(vendor.vendor_id),
        seed_key: vendorEventKey(must(vendor.seed_key ?? undefined, "vendor key"), must(event.seed_key ?? undefined, "event key")),
      };
    }),
  );

  const quotes: SeedRow<"quotes">[] = f.quotes.map((quote) => {
    const created = quote.quoted_on ? at(quote.quoted_on, "10:00") : T_VENDORS;
    return {
      id: quote.quote_id,
      wedding_id,
      vendor_id: quote.vendor_id,
      event_id: quote.event_id,
      pricing: quote.pricing,
      unit: quote.unit,
      unit_price_inr: quote.unit_price_inr,
      quantity: quote.quantity,
      amount_inr: quote.amount_inr,
      description: quote.description,
      quoted_on: quote.quoted_on,
      valid_until: quote.valid_until,
      // Every seeded quote was accepted by its commitment (record_commitment, 3.3).
      status: quote.status,
      created_by_member_id: mira.member_id,
      created_at: created,
      updated_at: created,
      seed_key: must(quote.seed_key ?? undefined, `quote ${quote.quote_id}`),
    };
  });

  const commitments: SeedRow<"commitments">[] = [];
  const commitmentVersions: SeedRow<"commitmentVersions">[] = [];
  for (const commitment of f.commitments) {
    const seed_key = must(commitment.seed_key ?? undefined, `commitment ${commitment.commitment_id}`);
    const first = must(commitment.versions[0], `${seed_key} version 1`);
    const created = new Date(first.created_at);
    commitments.push({
      id: commitment.commitment_id,
      wedding_id,
      vendor_id: commitment.vendor_id,
      quote_id: commitment.quote_id,
      current_version_no: commitment.current_version_no,
      voided_at: instant(commitment.voided_at),
      voided_by_member_id: null,
      void_reason: commitment.void_reason,
      created_by_member_id: mira.member_id,
      created_at: created,
      updated_at: created,
      seed_key,
    });
    for (const version of commitment.versions) {
      const version_key = must(version.seed_key ?? undefined, `${seed_key} version ${version.version_no}`);
      commitmentVersions.push({
        id: version.commitment_version_id,
        wedding_id,
        commitment_id: commitment.commitment_id,
        version_no: version.version_no,
        pricing: version.pricing,
        unit: version.unit,
        unit_price_inr: version.unit_price_inr,
        quantity: version.quantity,
        amount_inr: version.amount_inr,
        event_id: version.event_id,
        // demo-data 7.1's basis for COM-01; the others match the fixtures.
        description: version_key === "COM-01/v1" ? "250 × ₹800, fixed minimum" : version.description,
        agreed_on: version.agreed_on,
        due_on: version.due_on,
        change_reason: version.change_reason,
        source: SEED_SOURCE,
        voice_turn_id: null,
        spoken_text: version.spoken_text,
        created_by_member_id: mira.member_id,
        superseded_at: instant(version.superseded_at),
        superseded_by_version_id: null,
        created_at: new Date(version.created_at),
        seed_key: version_key,
      });
    }
  }

  const payments: SeedRow<"payments">[] = [];
  const paymentVersions: SeedRow<"paymentVersions">[] = [];
  for (const payment of f.payments) {
    const seed_key = must(payment.seed_key ?? undefined, `payment ${payment.payment_id}`);
    const first = must(payment.versions[0], `${seed_key} version 1`);
    const created = new Date(first.created_at);
    payments.push({
      id: payment.payment_id,
      wedding_id,
      vendor_id: payment.vendor_id,
      commitment_id: payment.commitment_id,
      payment_kind: payment.payment_kind,
      current_version_no: payment.current_version_no,
      voided_at: instant(payment.voided_at),
      voided_by_member_id: null,
      void_reason: payment.void_reason,
      created_by_member_id: mira.member_id,
      created_at: created,
      updated_at: created,
      seed_key,
    });
    for (const version of payment.versions) {
      paymentVersions.push({
        id: version.payment_version_id,
        wedding_id,
        payment_id: payment.payment_id,
        version_no: version.version_no,
        amount_inr: version.amount_inr,
        paid_on: version.paid_on,
        method: version.method,
        note: version.note,
        change_reason: version.change_reason,
        source: SEED_SOURCE,
        voice_turn_id: null,
        spoken_text: version.spoken_text,
        created_by_member_id: mira.member_id,
        superseded_at: instant(version.superseded_at),
        superseded_by_version_id: null,
        created_at: new Date(version.created_at),
        seed_key: must(version.seed_key ?? undefined, `${seed_key} version ${version.version_no}`),
      });
    }
  }

  // --- Requirements, shagun, the proposal ----------------------------------------------------

  const requirementCreated = (seed_key: string): Date => {
    if (seed_key === "REQ-04") return T_ACT["ACT-05"];
    if (seed_key === "REQ-08") return T_ACT["ACT-04"];
    if (seed_key === "REQ-03") return at("2026-11-24", "16:20"); // after the haldi existed (ACT-01)
    return T_REQUIREMENTS;
  };

  const requirements: SeedRow<"requirements">[] = f.requirements.map((requirement) => {
    const seed_key = must(requirement.seed_key ?? undefined, `requirement ${requirement.text}`);
    const created = requirementCreated(seed_key);
    return {
      id: requirement.requirement_id,
      wedding_id,
      event_id: requirement.event_id,
      requirement_category: requirement.requirement_category,
      text: requirement.text,
      quantity: requirement.quantity,
      vendor_id: requirement.vendor_id,
      created_by_member_id: memberIdOf[must(REQUIREMENT_ADDED_BY[seed_key], `who added ${seed_key}`)],
      deleted_at: null,
      created_at: created,
      updated_at: created,
      seed_key,
    };
  });

  const shagunEntries: SeedRow<"shagunEntries">[] = f.shagun_entries.map((entry) => {
    const seed_key = must(entry.seed_key ?? undefined, `shagun ${entry.giver_name}`);
    // Noon of the day received: SHG-04 was thanked at 19:00 that same day, so it must be recorded first.
    const created = at(entry.received_on, "12:00");
    const thanked_at = instant(entry.thanked_at);
    return {
      id: entry.shagun_entry_id,
      wedding_id,
      giver_name: entry.giver_name,
      household_id: entry.household_id,
      amount_inr: entry.amount_inr,
      received_on: entry.received_on,
      how: entry.how,
      note: entry.note,
      thanked_at,
      thanked_note: entry.thanked_note,
      // SHG-01: "Kabir called her"; SHG-04: "Mira messaged her".
      thanked_by_member_id: thanked_at === null ? null : seed_key === "SHG-01" ? kabir.member_id : mira.member_id,
      recorded_by_member_id: mira.member_id,
      created_at: created,
      updated_at: later(created, thanked_at),
      seed_key,
    };
  });

  // PRP-01 (domain 3.5 and 5.1; D91): record_expense, payee "Dhol player", not paid in full.
  const prp = must(f.proposals.find((row) => row.seed_key === "PRP-01"), "PRP-01");
  const prpAmount = 15_000;
  const music = BUDGET_CATEGORY_LABELS.music;
  const prpSummaryEn = `an expense of ${formatInr(prpAmount)} to Dhol player (${music.en}), not yet paid`;
  const prpSummaryHi = `Dhol player को ${formatInr(prpAmount)} का खर्च (${music.hi}), भुगतान बाकी`;
  const proposals: SeedRow<"proposals">[] = [
    {
      id: prp.proposal_id,
      wedding_id,
      command: "record_expense",
      input: { payee_name: "Dhol player", budget_category: "music", amount_inr: prpAmount, paid_in_full: false, description: "For the baraat" },
      reason: prp.reason,
      summary_en: prpSummaryEn,
      summary_hi: prpSummaryHi,
      // "New vendor": no vendor named Dhol player exists yet (3.5).
      vendor_id: null,
      budget_category: "music",
      committed_delta_inr: prpAmount,
      paid_delta_inr: 0,
      status: "pending",
      proposed_by_member_id: diya.member_id,
      decided_by_member_id: null,
      decided_at: null,
      decision_reason: null,
      result_entity_id: null,
      voice_turn_id: null,
      created_at: T_ACT["ACT-03"],
      updated_at: T_ACT["ACT-03"],
      seed_key: "PRP-01",
    },
  ];

  // --- Activity: ACT-01 to ACT-05, Diya's five items (demo-data 9.1), from section 3's templates -

  const reqBySeed = (seed_key: string) => must(f.requirements.find((r) => r.seed_key === seed_key), seed_key);
  const req08 = reqBySeed("REQ-08");
  const req04 = reqBySeed("REQ-04");
  const reception = eventBySeed("EVT-REC");
  const sangeet = eventBySeed("EVT-SAN");
  const haldiVenue = must(venueById.get(must(haldi.venue_id ?? undefined, "the haldi's venue")), "the haldi's venue row");
  const haldiWhen = formatWhen(haldi.event_date, must(haldi.start_time ?? undefined, "the haldi's start"));
  const mehendiOld = formatWhen(mehendi.event_date, "18:00");
  const mehendiNew = formatWhen(mehendi.event_date, must(mehendi.end_time ?? undefined, "the mehendi's end"));
  const actor = diya.display_name;
  const fixtureAct = (seed_key: string) => must(f.activity_entries.find((row) => row.seed_key === seed_key), seed_key);

  const activityLines: Record<keyof typeof T_ACT, { en: string; hi: string }> = {
    // create_event: "{actor} added the {event} on {when} at {venue}." / "{actor} ने {event_hi} जोड़ा: {when}, {venue}।"
    "ACT-01": {
      en: `${actor} added the ${eventWord(haldi.event_kind, haldi.title)} on ${haldiWhen} at ${haldiVenue.name}.`,
      hi: `${actor} ने ${haldi.title_hi} जोड़ा: ${haldiWhen}, ${haldiVenue.name}।`,
    },
    // update_event, a time change: "{actor} changed the {event} time from {old} to {new}."
    "ACT-02": {
      en: `${actor} changed the ${eventWord(mehendi.event_kind, mehendi.title)} time from ${mehendiOld} to ${mehendiNew}.`,
      hi: `${actor} ने ${mehendi.title_hi} का समय ${mehendiOld} से बदलकर ${mehendiNew} किया।`,
    },
    // propose_change: "{actor} proposed {summary}. It needs an owner's approval."
    "ACT-03": {
      en: `${actor} proposed ${prpSummaryEn}. It needs an owner's approval.`,
      hi: `${actor} ने प्रस्ताव भेजा: ${prpSummaryHi}। मालिक की मंज़ूरी बाकी है।`,
    },
    // add_requirement: "{actor} added "{item}" to the {event}." / "{actor} ने {event_hi} में ज़रूरत जोड़ी: {item}।"
    "ACT-04": {
      en: `${actor} added "${req08.text}" to the ${eventWord(reception.event_kind, reception.title)}.`,
      hi: `${actor} ने ${reception.title_hi} में ज़रूरत जोड़ी: ${req08.text}।`,
    },
    "ACT-05": {
      en: `${actor} added "${req04.text}" to the ${eventWord(sangeet.event_kind, sangeet.title)}.`,
      hi: `${actor} ने ${sangeet.title_hi} में ज़रूरत जोड़ी: ${req04.text}।`,
    },
  };

  const activityEntries: SeedRow<"activityEntries">[] = (Object.keys(T_ACT) as (keyof typeof T_ACT)[]).map((seed_key) => {
    const entry = fixtureAct(seed_key);
    const occurred_at = T_ACT[seed_key];
    return {
      id: entry.activity_entry_id,
      wedding_id,
      occurred_at,
      actor_type: "member",
      actor_member_id: diya.member_id,
      actor_guest_id: null,
      actor_label: actor,
      command: entry.command,
      topic: entry.topic,
      source: SEED_SOURCE,
      entity_type: entry.entity_type,
      entity_id: entry.entity_id,
      summary_en: activityLines[seed_key].en,
      summary_hi: activityLines[seed_key].hi,
      before: entry.before === null ? null : json(entry.before),
      after: entry.after === null ? null : json(entry.after),
      visibility: entry.visibility,
      proposal_id: entry.proposal_id,
      voice_turn_id: null,
      spoken_text: null,
      idempotency_key: null,
      created_at: occurred_at,
      seed_key,
    };
  });

  // --- JOB-EXP-R2-PNG: the REV-2 card, Ready (D15), Banyan Hall ------------------------------

  const job = must(f.export_jobs.find((row) => row.seed_key === SEED_KEYS.rev2_export_job), "JOB-EXP-R2-PNG");
  const rev2 = must(publications.find((row) => row.seed_key === "REV-2"), "the REV-2 row");
  const artifact_path = `${wedding_id}/card-rev2.png`;
  const jobCreated = new Date(job.created_at);
  const jobDone = new Date(job.updated_at);
  const exportJobs: SeedRow<"exportJobs">[] = [
    {
      id: job.job_id,
      wedding_id,
      publication_id: must(rev2.id, "REV-2's id"),
      revision: 2,
      format: "png",
      export_key: exportKey(wedding_id, 2, "png"),
      status: "succeeded",
      card_event_ids: cardEventIds(rev2Snapshot, invitations),
      attempts: 1,
      max_attempts: job.max_attempts,
      lease_until: null,
      fail_injection: "none",
      synthetic: false,
      last_error_code: null,
      last_error_message: null,
      last_error_at: null,
      artifact_path: options.rev2_card ? artifact_path : null,
      artifact_sha256: options.rev2_card ? options.rev2_card.sha256 : null,
      artifact_bytes: options.rev2_card ? options.rev2_card.bytes : null,
      artifact_created_at: options.rev2_card ? jobDone : null,
      notified_at: null,
      requested_by_member_id: mira.member_id,
      created_at: jobCreated,
      updated_at: jobDone,
      seed_key: SEED_KEYS.rev2_export_job,
    },
  ];
  const attemptKey = `${SEED_KEYS.rev2_export_job}/a1`;
  const exportAttempts: SeedRow<"exportAttempts">[] = [
    {
      id: id("export_attempts", attemptKey),
      wedding_id,
      job_id: job.job_id,
      attempt_no: 1,
      trigger: "request",
      idempotency_key: null,
      nudgebee_workflow_id: null,
      nudgebee_execution_id: null,
      approver: null,
      status: "succeeded",
      renderer: "chromium",
      error_code: null,
      started_at: jobCreated,
      finished_at: jobDone,
      created_at: jobCreated,
      updated_at: jobDone,
      seed_key: attemptKey,
    },
  ];

  const rows: SeedRows = {
    weddings,
    budgets,
    budgetLines,
    members,
    venues,
    events,
    inviteStyles,
    publications,
    households,
    guests,
    guestContacts,
    invitations,
    vendors,
    vendorEvents,
    quotes,
    commitments,
    commitmentVersions,
    payments,
    paymentVersions,
    requirements,
    shagunEntries,
    proposals,
    activityEntries,
    exportJobs,
    exportAttempts,
  };

  return {
    copy,
    wedding_id,
    rows,
    link_households: households.filter((row) => !row.is_synthetic).map((row) => must(row.seed_key ?? undefined, "household key")),
    photo: {
      asset_id: photoRow.id as string,
      seed_key: SEED_KEYS.couple_photo,
      storage_path_ext: "jpg",
      storage_path: photoRow.storage_path,
      row: photoRow,
    },
    extra_photos: extraPhotosOf(copy),
    rev2_job: { job_id: job.job_id, seed_key: SEED_KEYS.rev2_export_job, revision: 2, artifact_path },
  };
}

/**
 * P10's frozen card list: the published functions to which every invited guest has an active
 * invitation, or every published function when nobody is invited. At D0: the reception alone.
 */
export function cardEventIds(snapshot: PublicationSnapshot, invitations: readonly SeedRow<"invitations">[]): string[] {
  const published = snapshot.events.map((event) => event.event_id);
  const byGuest = new Map<string, Set<string>>();
  for (const invitation of invitations) {
    if (invitation.revoked_at) continue;
    const set = byGuest.get(invitation.guest_id) ?? new Set<string>();
    set.add(invitation.event_id);
    byGuest.set(invitation.guest_id, set);
  }
  if (byGuest.size === 0) return published;
  return published.filter((event_id) => [...byGuest.values()].every((set) => set.has(event_id)));
}
