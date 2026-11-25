/**
 * The app schema (domain-and-data 5.0 to 5.2, as amended by architecture 9, export-and-recovery
 * 2.4 and 11, voice.md 9, flagsmith.md 5.10 and doc-ai.md 1.8). Lane A alone edits this file.
 *
 * - Every table lives in schema `app`, has RLS enabled and no policies (domain 6.2). No triggers,
 *   no SQL functions, and no foreign key into `auth` (`*user_id` columns are plain uuids).
 * - Property keys are the SQL column names (snake_case), so rows read and write as the DTOs do.
 * - Money is bigint whole rupees in `_inr` columns, read as JavaScript numbers (mode "number").
 * - Timestamps are timestamptz read as Date; `date` columns are "YYYY-MM-DD" strings and `time`
 *   columns "HH:MM:SS" strings (IST wall clock, domain 5.0).
 * - `seed_key` is on every table the seed writes; unique per table and wedding when present.
 *
 * No `server-only` here: the seed (tsx) and Vitest import it (architecture 7.1, trap 11).
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

import {
  ACTIVITY_VISIBILITIES,
  ACTOR_TYPES,
  APP_LANGUAGES,
  ASSET_KINDS,
  BUDGET_CATEGORIES,
  CARD_IMPORT_STATUSES,
  COMMAND_SOURCES,
  COMMITMENT_PRICINGS,
  COMMITMENT_UNITS,
  ENTITY_TYPES,
  EVENT_KINDS,
  EXPORT_FORMATS,
  EXPORT_STATUSES,
  EXPORT_TRIGGERS,
  FAIL_INJECTIONS,
  INVITE_LAYOUTS,
  INVITE_THEMES,
  INVITE_TYPEFACES,
  MEMBER_ROLES,
  PAYMENT_KINDS,
  PAYMENT_METHODS,
  PHOTO_FRAMES,
  PROPOSAL_STATUSES,
  QUOTE_STATUSES,
  REQUIREMENT_CATEGORIES,
  RSVP_CHANNELS,
  RSVP_STATUSES,
  VENDOR_STATUSES,
  VOICE_TURN_STATUSES,
  type JsonValue,
} from "../contracts/domain";

export const app = pgSchema("app");

// ---------------------------------------------------------------------------
// Enums (domain 5.2)
// ---------------------------------------------------------------------------

export const memberRoleEnum = app.enum("member_role", MEMBER_ROLES);
export const appLanguageEnum = app.enum("app_language", APP_LANGUAGES);
export const eventKindEnum = app.enum("event_kind", EVENT_KINDS);
export const inviteThemeEnum = app.enum("invite_theme", INVITE_THEMES);
export const inviteTypefaceEnum = app.enum("invite_typeface", INVITE_TYPEFACES);
export const inviteLayoutEnum = app.enum("invite_layout", INVITE_LAYOUTS);
export const photoFrameEnum = app.enum("photo_frame", PHOTO_FRAMES);
export const assetKindEnum = app.enum("asset_kind", ASSET_KINDS);
export const budgetCategoryEnum = app.enum("budget_category", BUDGET_CATEGORIES);
export const vendorStatusEnum = app.enum("vendor_status", VENDOR_STATUSES);
export const commitmentPricingEnum = app.enum("commitment_pricing", COMMITMENT_PRICINGS);
export const commitmentUnitEnum = app.enum("commitment_unit", COMMITMENT_UNITS);
export const quoteStatusEnum = app.enum("quote_status", QUOTE_STATUSES);
export const paymentKindEnum = app.enum("payment_kind", PAYMENT_KINDS);
export const paymentMethodEnum = app.enum("payment_method", PAYMENT_METHODS);
export const requirementCategoryEnum = app.enum("requirement_category", REQUIREMENT_CATEGORIES);
export const rsvpStatusEnum = app.enum("rsvp_status", RSVP_STATUSES);
export const rsvpChannelEnum = app.enum("rsvp_channel", RSVP_CHANNELS);
export const proposalStatusEnum = app.enum("proposal_status", PROPOSAL_STATUSES);
export const commandSourceEnum = app.enum("command_source", COMMAND_SOURCES);
export const actorTypeEnum = app.enum("actor_type", ACTOR_TYPES);
export const activityVisibilityEnum = app.enum("activity_visibility", ACTIVITY_VISIBILITIES);
export const entityTypeEnum = app.enum("entity_type", ENTITY_TYPES);
export const voiceTurnStatusEnum = app.enum("voice_turn_status", VOICE_TURN_STATUSES);
export const exportFormatEnum = app.enum("export_format", EXPORT_FORMATS);
export const exportStatusEnum = app.enum("export_status", EXPORT_STATUSES);
export const cardImportStatusEnum = app.enum("card_import_status", CARD_IMPORT_STATUSES);
export const failInjectionEnum = app.enum("fail_injection", FAIL_INJECTIONS);
export const exportTriggerEnum = app.enum("export_trigger", EXPORT_TRIGGERS);

// ---------------------------------------------------------------------------
// Column helpers (domain 5.0)
// ---------------------------------------------------------------------------

/** SHA-256 digests of link and invite tokens (domain 6.3). */
export const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

const money = (name: string) => bigint(name, { mode: "number" });
const tstz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const isoDate = (name: string) => date(name, { mode: "string" });
const json = (name: string) => jsonb(name).$type<JsonValue>();

const idColumn = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => tstz("created_at").notNull().defaultNow();
const updatedAt = () => tstz("updated_at").notNull().defaultNow();
const seedKey = () => text("seed_key");
const weddingRef = () =>
  uuid("wedding_id")
    .notNull()
    .references((): AnyPgColumn => weddings.id, { onDelete: "cascade" });

// ---------------------------------------------------------------------------
// Wedding, budget and members
// ---------------------------------------------------------------------------

export const weddings = app
  .table(
    "weddings",
    {
      id: idColumn(),
      bride_name: text("bride_name").notNull(),
      groom_name: text("groom_name").notNull(),
      city: text("city"),
      wedding_date: isoDate("wedding_date").notNull(),
      expected_guests: integer("expected_guests"),
      timezone: text("timezone").notNull().default("Asia/Kolkata"),
      is_sample: boolean("is_sample").notNull().default(false),
      managers_can_see_vendor_dues: boolean("managers_can_see_vendor_dues").notNull().default(false),
      managers_can_see_budget: boolean("managers_can_see_budget").notNull().default(false),
      managers_can_see_guest_contacts: boolean("managers_can_see_guest_contacts").notNull().default(false),
      version: bigint("version", { mode: "number" }).notNull().default(0),
      draft_version: bigint("draft_version", { mode: "number" }).notNull().default(0),
      published_revision: integer("published_revision"),
      created_by_user_id: uuid("created_by_user_id").notNull(),
      created_at: createdAt(),
      updated_at: updatedAt(),
      seed_key: seedKey(),
    },
    (t) => [
      check("weddings_bride_name_length", sql`char_length(${t.bride_name}) between 1 and 60`),
      check("weddings_groom_name_length", sql`char_length(${t.groom_name}) between 1 and 60`),
      check("weddings_expected_guests_range", sql`${t.expected_guests} is null or ${t.expected_guests} >= 0`),
      index("weddings_created_by_user_id_idx").on(t.created_by_user_id),
    ],
  )
  .enableRLS();

export const budgets = app
  .table(
    "budgets",
    {
      wedding_id: uuid("wedding_id")
        .primaryKey()
        .references(() => weddings.id, { onDelete: "cascade" }),
      total_inr: money("total_inr").notNull().default(0),
      created_at: createdAt(),
      updated_at: updatedAt(),
      seed_key: seedKey(),
    },
    (t) => [check("budgets_total_inr_range", sql`${t.total_inr} between 0 and 10000000000`)],
  )
  .enableRLS();

export const budgetLines = app
  .table(
    "budget_lines",
    {
      id: idColumn(),
      wedding_id: weddingRef(),
      budget_category: budgetCategoryEnum("budget_category").notNull(),
      planned_inr: money("planned_inr").notNull(),
      created_at: createdAt(),
      updated_at: updatedAt(),
      seed_key: seedKey(),
    },
    (t) => [
      uniqueIndex("budget_lines_wedding_category_uq").on(t.wedding_id, t.budget_category),
      uniqueIndex("budget_lines_seed_key_uq").on(t.wedding_id, t.seed_key).where(sql`${t.seed_key} is not null`),
      check("budget_lines_planned_inr_range", sql`${t.planned_inr} between 0 and 10000000000`),
    ],
  )
  .enableRLS();

export const members = app
  .table(
    "members",
    {
      id: idColumn(),
      wedding_id: weddingRef(),
      user_id: uuid("user_id").notNull(),
      role: memberRoleEnum("role").notNull(),
      display_name: text("display_name").notNull(),
      preferred_language: appLanguageEnum("preferred_language").notNull().default("en"),
      removed_at: tstz("removed_at"),
      created_at: createdAt(),
      updated_at: updatedAt(),
      seed_key: seedKey(),
    },
    (t) => [
      uniqueIndex("members_wedding_user_uq").on(t.wedding_id, t.user_id),
      index("members_user_id_idx").on(t.user_id),
      uniqueIndex("members_seed_key_uq").on(t.wedding_id, t.seed_key).where(sql`${t.seed_key} is not null`),
    ],
  )
  .enableRLS();

export const memberInvites = app
  .table(
    "member_invites",
    {
      id: idColumn(),
      wedding_id: weddingRef(),
      email: text("email").notNull(),
      role: memberRoleEnum("role").notNull(),
      display_name: text("display_name"),
      token_hash: bytea("token_hash").notNull(),
      expires_at: tstz("expires_at")
        .notNull()
        .default(sql`now() + interval '48 hours'`),
      accepted_at: tstz("accepted_at"),
      accepted_by_member_id: uuid("accepted_by_member_id"),
      revoked_at: tstz("revoked_at"),
      invited_by_member_id: uuid("invited_by_member_id"),
      created_at: createdAt(),
      updated_at: updatedAt(),
      seed_key: seedKey(),
    },
    (t) => [
      uniqueIndex("member_invites_token_hash_uq").on(t.token_hash),
      index("member_invites_wedding_id_idx").on(t.wedding_id),
      uniqueIndex("member_invites_seed_key_uq").on(t.wedding_id, t.seed_key).where(sql`${t.seed_key} is not null`),
    ],
  )
  .enableRLS();

// ---------------------------------------------------------------------------
// Functions, the invitation and publications
// ---------------------------------------------------------------------------

export const venues = app
  .table(
    "venues",
    {
      id: idColumn(),
      wedding_id: weddingRef(),
      name: text("name").notNull(),
      place_name: text("place_name"),
      locality: text("locality"),
      address: text("address"),
      capacity: integer("capacity"),
      map_url: text("map_url"),
      created_at: createdAt(),
      updated_at: updatedAt(),
      seed_key: seedKey(),
    },
    (t) => [
      uniqueIndex("venues_wedding_name_place_uq").on(
        t.wedding_id,
        sql`lower(${t.name})`,
        sql`lower(coalesce(${t.place_name}, ''))`,
      ),
      uniqueIndex("venues_seed_key_uq").on(t.wedding_id, t.seed_key).where(sql`${t.seed_key} is not null`),
      check("venues_capacity_range", sql`${t.capacity} is null or ${t.capacity} >= 0`),
    ],
  )
  .enableRLS();

export const events = app
  .table(
    "events",
    {
      id: idColumn(),
      wedding_id: weddingRef(),
      event_kind: eventKindEnum("event_kind").notNull(),
      title: text("title").notNull(),
      title_hi: text("title_hi").notNull(),
      event_date: isoDate("event_date").notNull(),
      start_time: time("start_time"),
      end_time: time("end_time"),
      muhurat_time: time("muhurat_time"),
      venue_id: uuid("venue_id").references(() => venues.id),
      dress_code: text("dress_code"),
      description: text("description"),
      lead_name: text("lead_name"),
      expected_headcount: integer("expected_headcount"),
      sort_order: integer("sort_order").notNull().default(0),
      version: integer("version").notNull().default(1),
      deleted_at: tstz("deleted_at"),
      created_at: createdAt(),
      updated_at: updatedAt(),
      seed_key: seedKey(),
    },
    (t) => [
      index("events_wedding_date_time_idx").on(t.wedding_id, t.event_date, t.start_time),
      uniqueIndex("events_seed_key_uq").on(t.wedding_id, t.seed_key).where(sql`${t.seed_key} is not null`),
      check(
        "events_end_after_start",
        sql`${t.start_time} is null or ${t.end_time} is null or ${t.end_time} > ${t.start_time}`,
      ),
      check("events_expected_headcount_range", sql`${t.expected_headcount} is null or ${t.expected_headcount} >= 0`),
    ],
  )
  .enableRLS();

export const assets = app
  .table(
    "assets",
    {
      id: idColumn(),
      wedding_id: weddingRef(),
      asset_kind: assetKindEnum("asset_kind").notNull(),
      storage_path: text("storage_path").notNull(),
      mime_type: text("mime_type"),
      bytes: integer("bytes"),
      width: integer("width"),
      height: integer("height"),
      uploaded_by_member_id: uuid("uploaded_by_member_id"),
      created_at: createdAt(),
      updated_at: updatedAt(),
      seed_key: seedKey(),
    },
    (t) => [
      uniqueIndex("assets_storage_path_uq").on(t.storage_path),
      index("assets_wedding_id_idx").on(t.wedding_id),
      uniqueIndex("assets_seed_key_uq").on(t.wedding_id, t.seed_key).where(sql`${t.seed_key} is not null`),
      check("assets_bytes_range", sql`${t.bytes} is null or (${t.bytes} between 0 and 10485760)`),
    ],
  )
  .enableRLS();

export const inviteStyles = app
  .table(
    "invite_styles",
    {
      wedding_id: uuid("wedding_id")
        .primaryKey()
        .references(() => weddings.id, { onDelete: "cascade" }),
      theme: inviteThemeEnum("theme").notNull().default("maroon_gold"),
      typeface: inviteTypefaceEnum("typeface").notNull().default("eczar"),
      layout: inviteLayoutEnum("layout").notNull().default("card_with_inserts"),
      photo_frame: photoFrameEnum("photo_frame").notNull().default("mounted"),
      photo_asset_id: uuid("photo_asset_id").references(() => assets.id, { onDelete: "set null" }),
      heading_hi: text("heading_hi").notNull().default("शुभ विवाह"),
      wording_en: text("wording_en"),
      wording_hi: text("wording_hi"),
      blessing_line: text("blessing_line"),
      updated_by_member_id: uuid("updated_by_member_id"),
      created_at: createdAt(),
      updated_at: updatedAt(),
      seed_key: seedKey(),
    },
  )
  .enableRLS();

export const publications = app
  .table(
    "publications",
    {
      id: idColumn(),
      wedding_id: weddingRef(),
      revision: integer("revision").notNull(),
      snapshot: jsonb("snapshot").$type<JsonValue>().notNull(),
      draft_version: bigint("draft_version", { mode: "number" }).notNull(),
      changes: jsonb("changes")
        .$type<JsonValue>()
        .notNull()
        .default(sql`'[]'::jsonb`),
      note: text("note"),
      published_by_member_id: uuid("published_by_member_id").notNull(),
      published_at: tstz("published_at").notNull().defaultNow(),
      created_at: createdAt(),
      seed_key: seedKey(),
    },
    (t) => [
      uniqueIndex("publications_wedding_revision_uq").on(t.wedding_id, t.revision),
      uniqueIndex("publications_seed_key_uq").on(t.wedding_id, t.seed_key).where(sql`${t.seed_key} is not null`),
      check("publications_revision_positive", sql`${t.revision} >= 1`),
    ],
  )
  .enableRLS();

// ---------------------------------------------------------------------------
// Guests and RSVPs
// ---------------------------------------------------------------------------

export const households = app
  .table(
    "households",
    {
      id: idColumn(),
      wedding_id: weddingRef(),
      name: text("name").notNull(),
      relation: text("relation"),
      primary_guest_id: uuid("primary_guest_id").references((): AnyPgColumn => guests.id, { onDelete: "set null" }),
      is_synthetic: boolean("is_synthetic").notNull().default(false),
      created_at: createdAt(),
      updated_at: updatedAt(),
      seed_key: seedKey(),
    },
    (t) => [
      index("households_wedding_id_idx").on(t.wedding_id),
      uniqueIndex("households_seed_key_uq").on(t.wedding_id, t.seed_key).where(sql`${t.seed_key} is not null`),
    ],
  )
  .enableRLS();

export const guests = app
  .table(
    "guests",
    {
      id: idColumn(),
      wedding_id: weddingRef(),
      household_id: uuid("household_id")
        .notNull()
        .references((): AnyPgColumn => households.id),
      full_name: text("full_name").notNull(),
      group_label: text("group_label"),
      dietary_note: text("dietary_note"),
      note: text("note"),
      is_synthetic: boolean("is_synthetic").notNull().default(false),
      deleted_at: tstz("deleted_at"),
      created_at: createdAt(),
      updated_at: updatedAt(),
      seed_key: seedKey(),
    },
    (t) => [
      index("guests_wedding_id_idx").on(t.wedding_id),
      index("guests_household_id_idx").on(t.household_id),
      uniqueIndex("guests_seed_key_uq").on(t.wedding_id, t.seed_key).where(sql`${t.seed_key} is not null`),
    ],
  )
  .enableRLS();

export const guestContacts = app
  .table(
    "guest_contacts",
    {
      guest_id: uuid("guest_id")
        .primaryKey()
        .references(() => guests.id, { onDelete: "cascade" }),
      wedding_id: weddingRef(),
      phone: text("phone"),
      email: text("email"),
      created_at: createdAt(),
      updated_at: updatedAt(),
      seed_key: seedKey(),
    },
    (t) => [
      index("guest_contacts_wedding_id_idx").on(t.wedding_id),
      uniqueIndex("guest_contacts_seed_key_uq").on(t.wedding_id, t.seed_key).where(sql`${t.seed_key} is not null`),
    ],
  )
  .enableRLS();

export const invitations = app
  .table(
    "invitations",
    {
      id: idColumn(),
      wedding_id: weddingRef(),
      guest_id: uuid("guest_id")
        .notNull()
        .references(() => guests.id),
      event_id: uuid("event_id")
        .notNull()
        .references(() => events.id),
      max_plus_ones: smallint("max_plus_ones").notNull().default(0),
      rsvp_status: rsvpStatusEnum("rsvp_status").notNull().default("pending"),
      plus_ones: smallint("plus_ones").notNull().default(0),
      responded_at: tstz("responded_at"),
      responded_via: rsvpChannelEnum("responded_via"),
      rsvp_updated_by_member_id: uuid("rsvp_updated_by_member_id"),
      revoked_at: tstz("revoked_at"),
      created_at: createdAt(),
      updated_at: updatedAt(),
      seed_key: seedKey(),
    },
    (t) => [
      uniqueIndex("invitations_guest_event_uq").on(t.guest_id, t.event_id),
      index("invitations_event_status_idx").on(t.event_id, t.rsvp_status),
      index("invitations_wedding_id_idx").on(t.wedding_id),
      uniqueIndex("invitations_seed_key_uq").on(t.wedding_id, t.seed_key).where(sql`${t.seed_key} is not null`),
      check("invitations_max_plus_ones_range", sql`${t.max_plus_ones} between 0 and 10`),
      check(
        "invitations_plus_ones_range",
        sql`${t.plus_ones} between 0 and ${t.max_plus_ones} and (${t.plus_ones} = 0 or ${t.rsvp_status} = 'attending')`,
      ),
    ],
  )
  .enableRLS();

export const invitationLinks = app
  .table(
    "invitation_links",
    {
      id: idColumn(),
      wedding_id: weddingRef(),
      household_id: uuid("household_id")
        .notNull()
        .references(() => households.id),
      token_hash: bytea("token_hash").notNull(),
      token_hint: text("token_hint").notNull(),
      created_by_member_id: uuid("created_by_member_id"),
      revoked_at: tstz("revoked_at"),
      created_at: createdAt(),
      updated_at: updatedAt(),
      seed_key: seedKey(),
    },
    (t) => [
      uniqueIndex("invitation_links_token_hash_uq").on(t.token_hash),
      uniqueIndex("invitation_links_active_household_uq").on(t.household_id).where(sql`${t.revoked_at} is null`),
      index("invitation_links_wedding_id_idx").on(t.wedding_id),
      uniqueIndex("invitation_links_seed_key_uq").on(t.wedding_id, t.seed_key).where(sql`${t.seed_key} is not null`),
    ],
  )
  .enableRLS();

// ---------------------------------------------------------------------------
// Vendors and money
// ---------------------------------------------------------------------------

export const vendors = app
  .table(
    "vendors",
    {
      id: idColumn(),
      wedding_id: weddingRef(),
      name: text("name").notNull(),
      vendor_category: budgetCategoryEnum("vendor_category").notNull(),
      status: vendorStatusEnum("status").notNull().default("considering"),
      is_one_off: boolean("is_one_off").notNull().default(false),
      contact_name: text("contact_name"),
      contact_phone: text("contact_phone"),
      notes: text("notes"),
      deleted_at: tstz("deleted_at"),
      created_at: createdAt(),
      updated_at: updatedAt(),
      seed_key: seedKey(),
    },
    (t) => [
      uniqueIndex("vendors_wedding_name_uq").on(t.wedding_id, sql`lower(${t.name})`),
      uniqueIndex("vendors_seed_key_uq").on(t.wedding_id, t.seed_key).where(sql`${t.seed_key} is not null`),
    ],
  )
  .enableRLS();

export const vendorEvents = app
  .table(
    "vendor_events",
    {
      vendor_id: uuid("vendor_id")
        .notNull()
        .references(() => vendors.id, { onDelete: "cascade" }),
      event_id: uuid("event_id")
        .notNull()
        .references(() => events.id, { onDelete: "cascade" }),
      wedding_id: weddingRef(),
      created_at: createdAt(),
      seed_key: seedKey(),
    },
    (t) => [
      primaryKey({ columns: [t.vendor_id, t.event_id] }),
      index("vendor_events_wedding_id_idx").on(t.wedding_id),
      uniqueIndex("vendor_events_seed_key_uq").on(t.wedding_id, t.seed_key).where(sql`${t.seed_key} is not null`),
    ],
  )
  .enableRLS();

export const quotes = app
  .table(
    "quotes",
    {
      id: idColumn(),
      wedding_id: weddingRef(),
      vendor_id: uuid("vendor_id")
        .notNull()
        .references(() => vendors.id),
      event_id: uuid("event_id").references(() => events.id),
      pricing: commitmentPricingEnum("pricing").notNull(),
      unit: commitmentUnitEnum("unit"),
      unit_price_inr: money("unit_price_inr"),
      quantity: integer("quantity"),
      amount_inr: money("amount_inr").notNull(),
      description: text("description"),
      quoted_on: isoDate("quoted_on"),
      valid_until: isoDate("valid_until"),
      status: quoteStatusEnum("status").notNull().default("open"),
      created_by_member_id: uuid("created_by_member_id"),
      created_at: createdAt(),
      updated_at: updatedAt(),
      seed_key: seedKey(),
    },
    (t) => [
      index("quotes_wedding_vendor_idx").on(t.wedding_id, t.vendor_id),
      uniqueIndex("quotes_seed_key_uq").on(t.wedding_id, t.seed_key).where(sql`${t.seed_key} is not null`),
      check("quotes_amount_inr_range", sql`${t.amount_inr} between 1 and 1000000000`),
      check(
        "quotes_per_unit_fields",
        sql`${t.pricing} <> 'per_unit' or (${t.unit} is not null and ${t.unit_price_inr} is not null and ${t.quantity} is not null)`,
      ),
    ],
  )
  .enableRLS();

export const commitments = app
  .table(
    "commitments",
    {
      id: idColumn(),
      wedding_id: weddingRef(),
      vendor_id: uuid("vendor_id")
        .notNull()
        .references(() => vendors.id),
      quote_id: uuid("quote_id").references(() => quotes.id),
      current_version_no: integer("current_version_no").notNull().default(1),
      voided_at: tstz("voided_at"),
      voided_by_member_id: uuid("voided_by_member_id"),
      void_reason: text("void_reason"),
      created_by_member_id: uuid("created_by_member_id"),
      created_at: createdAt(),
      updated_at: updatedAt(),
      seed_key: seedKey(),
    },
    (t) => [
      index("commitments_wedding_vendor_idx").on(t.wedding_id, t.vendor_id),
      uniqueIndex("commitments_seed_key_uq").on(t.wedding_id, t.seed_key).where(sql`${t.seed_key} is not null`),
    ],
  )
  .enableRLS();

export const commitmentVersions = app
  .table(
    "commitment_versions",
    {
      id: idColumn(),
      wedding_id: weddingRef(),
      commitment_id: uuid("commitment_id")
        .notNull()
        .references(() => commitments.id, { onDelete: "cascade" }),
      version_no: integer("version_no").notNull(),
      pricing: commitmentPricingEnum("pricing").notNull(),
      unit: commitmentUnitEnum("unit"),
      unit_price_inr: money("unit_price_inr"),
      quantity: integer("quantity"),
      amount_inr: money("amount_inr").notNull(),
      event_id: uuid("event_id").references(() => events.id),
      description: text("description"),
      agreed_on: isoDate("agreed_on"),
      due_on: isoDate("due_on"),
      change_reason: text("change_reason"),
      source: commandSourceEnum("source").notNull(),
      voice_turn_id: uuid("voice_turn_id"),
      spoken_text: text("spoken_text"),
      created_by_member_id: uuid("created_by_member_id"),
      superseded_at: tstz("superseded_at"),
      /** Plain uuid, no foreign key, so reset_demo can delete a live version first (domain 5.1). */
      superseded_by_version_id: uuid("superseded_by_version_id"),
      created_at: createdAt(),
      seed_key: seedKey(),
    },
    (t) => [
      uniqueIndex("commitment_versions_commitment_version_uq").on(t.commitment_id, t.version_no),
      uniqueIndex("commitment_versions_current_uq").on(t.commitment_id).where(sql`${t.superseded_at} is null`),
      index("commitment_versions_wedding_id_idx").on(t.wedding_id),
      uniqueIndex("commitment_versions_seed_key_uq").on(t.wedding_id, t.seed_key).where(sql`${t.seed_key} is not null`),
      check("commitment_versions_amount_inr_range", sql`${t.amount_inr} between 1 and 1000000000`),
      check("commitment_versions_version_no_positive", sql`${t.version_no} >= 1`),
      check(
        "commitment_versions_per_unit_fields",
        sql`${t.pricing} <> 'per_unit' or (${t.unit} is not null and ${t.unit_price_inr} is not null and ${t.quantity} is not null)`,
      ),
    ],
  )
  .enableRLS();

export const payments = app
  .table(
    "payments",
    {
      id: idColumn(),
      wedding_id: weddingRef(),
      vendor_id: uuid("vendor_id")
        .notNull()
        .references(() => vendors.id),
      commitment_id: uuid("commitment_id").references(() => commitments.id),
      payment_kind: paymentKindEnum("payment_kind").notNull(),
      current_version_no: integer("current_version_no").notNull().default(1),
      voided_at: tstz("voided_at"),
      voided_by_member_id: uuid("voided_by_member_id"),
      void_reason: text("void_reason"),
      created_by_member_id: uuid("created_by_member_id"),
      created_at: createdAt(),
      updated_at: updatedAt(),
      seed_key: seedKey(),
    },
    (t) => [
      index("payments_vendor_id_idx").on(t.vendor_id),
      index("payments_wedding_id_idx").on(t.wedding_id),
      uniqueIndex("payments_seed_key_uq").on(t.wedding_id, t.seed_key).where(sql`${t.seed_key} is not null`),
    ],
  )
  .enableRLS();

export const paymentVersions = app
  .table(
    "payment_versions",
    {
      id: idColumn(),
      wedding_id: weddingRef(),
      payment_id: uuid("payment_id")
        .notNull()
        .references(() => payments.id, { onDelete: "cascade" }),
      version_no: integer("version_no").notNull(),
      amount_inr: money("amount_inr").notNull(),
      paid_on: isoDate("paid_on"),
      method: paymentMethodEnum("method"),
      note: text("note"),
      change_reason: text("change_reason"),
      source: commandSourceEnum("source").notNull(),
      voice_turn_id: uuid("voice_turn_id"),
      spoken_text: text("spoken_text"),
      created_by_member_id: uuid("created_by_member_id"),
      superseded_at: tstz("superseded_at"),
      /** Plain uuid, no foreign key (domain 5.1). */
      superseded_by_version_id: uuid("superseded_by_version_id"),
      created_at: createdAt(),
      seed_key: seedKey(),
    },
    (t) => [
      uniqueIndex("payment_versions_payment_version_uq").on(t.payment_id, t.version_no),
      uniqueIndex("payment_versions_current_uq").on(t.payment_id).where(sql`${t.superseded_at} is null`),
      index("payment_versions_wedding_id_idx").on(t.wedding_id),
      uniqueIndex("payment_versions_seed_key_uq").on(t.wedding_id, t.seed_key).where(sql`${t.seed_key} is not null`),
      check("payment_versions_amount_inr_range", sql`${t.amount_inr} between 1 and 1000000000`),
      check("payment_versions_version_no_positive", sql`${t.version_no} >= 1`),
    ],
  )
  .enableRLS();

// ---------------------------------------------------------------------------
// Notes, gifts and proposals
// ---------------------------------------------------------------------------

export const requirements = app
  .table(
    "requirements",
    {
      id: idColumn(),
      wedding_id: weddingRef(),
      event_id: uuid("event_id")
        .notNull()
        .references(() => events.id),
      requirement_category: requirementCategoryEnum("requirement_category").notNull().default("other"),
      text: text("text").notNull(),
      quantity: integer("quantity"),
      vendor_id: uuid("vendor_id").references(() => vendors.id),
      created_by_member_id: uuid("created_by_member_id"),
      deleted_at: tstz("deleted_at"),
      created_at: createdAt(),
      updated_at: updatedAt(),
      seed_key: seedKey(),
    },
    (t) => [
      index("requirements_wedding_event_idx").on(t.wedding_id, t.event_id),
      uniqueIndex("requirements_seed_key_uq").on(t.wedding_id, t.seed_key).where(sql`${t.seed_key} is not null`),
      check("requirements_quantity_range", sql`${t.quantity} is null or ${t.quantity} >= 1`),
    ],
  )
  .enableRLS();

export const shagunEntries = app
  .table(
    "shagun_entries",
    {
      id: idColumn(),
      wedding_id: weddingRef(),
      giver_name: text("giver_name").notNull(),
      household_id: uuid("household_id").references(() => households.id),
      amount_inr: money("amount_inr").notNull(),
      received_on: isoDate("received_on").notNull(),
      how: text("how"),
      note: text("note"),
      thanked_at: tstz("thanked_at"),
      thanked_note: text("thanked_note"),
      thanked_by_member_id: uuid("thanked_by_member_id"),
      recorded_by_member_id: uuid("recorded_by_member_id"),
      created_at: createdAt(),
      updated_at: updatedAt(),
      seed_key: seedKey(),
    },
    (t) => [
      index("shagun_entries_wedding_id_idx").on(t.wedding_id),
      uniqueIndex("shagun_entries_seed_key_uq").on(t.wedding_id, t.seed_key).where(sql`${t.seed_key} is not null`),
      check("shagun_entries_amount_inr_range", sql`${t.amount_inr} between 1 and 1000000000`),
    ],
  )
  .enableRLS();

export const proposals = app
  .table(
    "proposals",
    {
      id: idColumn(),
      wedding_id: weddingRef(),
      command: text("command").notNull(),
      input: jsonb("input").$type<JsonValue>().notNull(),
      reason: text("reason"),
      summary_en: text("summary_en").notNull(),
      summary_hi: text("summary_hi").notNull(),
      vendor_id: uuid("vendor_id").references(() => vendors.id),
      budget_category: budgetCategoryEnum("budget_category"),
      committed_delta_inr: money("committed_delta_inr").notNull().default(0),
      paid_delta_inr: money("paid_delta_inr").notNull().default(0),
      status: proposalStatusEnum("status").notNull().default("pending"),
      proposed_by_member_id: uuid("proposed_by_member_id").notNull(),
      decided_by_member_id: uuid("decided_by_member_id"),
      decided_at: tstz("decided_at"),
      decision_reason: text("decision_reason"),
      result_entity_id: uuid("result_entity_id"),
      voice_turn_id: uuid("voice_turn_id"),
      created_at: createdAt(),
      updated_at: updatedAt(),
      seed_key: seedKey(),
    },
    (t) => [
      index("proposals_wedding_status_idx").on(t.wedding_id, t.status),
      uniqueIndex("proposals_seed_key_uq").on(t.wedding_id, t.seed_key).where(sql`${t.seed_key} is not null`),
    ],
  )
  .enableRLS();

// ---------------------------------------------------------------------------
// History, receipts, exports and voice
// ---------------------------------------------------------------------------

export const activityEntries = app
  .table(
    "activity_entries",
    {
      id: idColumn(),
      wedding_id: weddingRef(),
      seq: bigint("seq", { mode: "number" }).notNull().generatedByDefaultAsIdentity(),
      occurred_at: tstz("occurred_at").notNull().defaultNow(),
      actor_type: actorTypeEnum("actor_type").notNull(),
      actor_member_id: uuid("actor_member_id"),
      actor_guest_id: uuid("actor_guest_id"),
      actor_label: text("actor_label").notNull(),
      command: text("command").notNull(),
      topic: text("topic").notNull(),
      source: commandSourceEnum("source").notNull(),
      entity_type: entityTypeEnum("entity_type").notNull(),
      entity_id: uuid("entity_id").notNull(),
      summary_en: text("summary_en").notNull(),
      summary_hi: text("summary_hi").notNull(),
      before: json("before"),
      after: json("after"),
      visibility: activityVisibilityEnum("visibility").notNull(),
      proposal_id: uuid("proposal_id"),
      voice_turn_id: uuid("voice_turn_id"),
      spoken_text: text("spoken_text"),
      idempotency_key: text("idempotency_key"),
      created_at: createdAt(),
      seed_key: seedKey(),
    },
    (t) => [
      uniqueIndex("activity_entries_seq_uq").on(t.seq),
      index("activity_entries_wedding_seq_idx").on(t.wedding_id, t.seq),
      index("activity_entries_wedding_actor_seq_idx").on(t.wedding_id, t.actor_member_id, t.seq),
      uniqueIndex("activity_entries_seed_key_uq").on(t.wedding_id, t.seed_key).where(sql`${t.seed_key} is not null`),
    ],
  )
  .enableRLS();

export const commandReceipts = app
  .table(
    "command_receipts",
    {
      idempotency_key: text("idempotency_key").primaryKey(),
      command: text("command").notNull(),
      wedding_id: uuid("wedding_id").references(() => weddings.id, { onDelete: "cascade" }),
      actor_key: text("actor_key").notNull(),
      request_hash: text("request_hash").notNull(),
      outcome: text("outcome").notNull(),
      http_status: integer("http_status").notNull(),
      response: jsonb("response").$type<JsonValue>().notNull(),
      created_at: createdAt(),
    },
    (t) => [
      index("command_receipts_wedding_id_idx").on(t.wedding_id),
      check("command_receipts_key_length", sql`char_length(${t.idempotency_key}) between 8 and 200`),
    ],
  )
  .enableRLS();

export const exportJobs = app
  .table(
    "export_jobs",
    {
      id: idColumn(),
      wedding_id: weddingRef(),
      publication_id: uuid("publication_id")
        .notNull()
        .references(() => publications.id),
      revision: integer("revision").notNull(),
      format: exportFormatEnum("format").notNull().default("png"),
      export_key: text("export_key").notNull(),
      status: exportStatusEnum("status").notNull().default("queued"),
      /** The published functions on the card, frozen at creation (export-and-recovery 2.4, P10). */
      card_event_ids: uuid("card_event_ids").array().notNull(),
      attempts: integer("attempts").notNull().default(0),
      max_attempts: integer("max_attempts").notNull().default(3),
      lease_until: tstz("lease_until"),
      fail_injection: failInjectionEnum("fail_injection").notNull().default("none"),
      synthetic: boolean("synthetic").notNull().default(false),
      last_error_code: text("last_error_code"),
      last_error_message: text("last_error_message"),
      last_error_at: tstz("last_error_at"),
      artifact_path: text("artifact_path"),
      artifact_sha256: text("artifact_sha256"),
      artifact_bytes: integer("artifact_bytes"),
      artifact_created_at: tstz("artifact_created_at"),
      notified_at: tstz("notified_at"),
      requested_by_member_id: uuid("requested_by_member_id").notNull(),
      created_at: createdAt(),
      updated_at: updatedAt(),
      seed_key: seedKey(),
    },
    (t) => [
      uniqueIndex("export_jobs_export_key_uq").on(t.export_key),
      index("export_jobs_wedding_status_idx").on(t.wedding_id, t.status),
      uniqueIndex("export_jobs_seed_key_uq").on(t.wedding_id, t.seed_key).where(sql`${t.seed_key} is not null`),
      check("export_jobs_attempts_range", sql`${t.attempts} >= 0 and ${t.max_attempts} >= 1`),
    ],
  )
  .enableRLS();

export const exportAttempts = app
  .table(
    "export_attempts",
    {
      id: idColumn(),
      wedding_id: weddingRef(),
      job_id: uuid("job_id")
        .notNull()
        .references(() => exportJobs.id, { onDelete: "cascade" }),
      attempt_no: integer("attempt_no").notNull(),
      trigger: exportTriggerEnum("trigger").notNull(),
      idempotency_key: text("idempotency_key"),
      nudgebee_workflow_id: text("nudgebee_workflow_id"),
      nudgebee_execution_id: text("nudgebee_execution_id"),
      approver: text("approver"),
      status: exportStatusEnum("status").notNull().default("queued"),
      /** `chromium` or `og`, set at the claim (export-and-recovery 2.4). */
      renderer: text("renderer"),
      error_code: text("error_code"),
      started_at: tstz("started_at"),
      finished_at: tstz("finished_at"),
      created_at: createdAt(),
      updated_at: updatedAt(),
      seed_key: seedKey(),
    },
    (t) => [
      uniqueIndex("export_attempts_job_attempt_uq").on(t.job_id, t.attempt_no),
      uniqueIndex("export_attempts_idempotency_key_uq").on(t.idempotency_key),
      index("export_attempts_wedding_id_idx").on(t.wedding_id),
      uniqueIndex("export_attempts_seed_key_uq").on(t.wedding_id, t.seed_key).where(sql`${t.seed_key} is not null`),
      check("export_attempts_renderer_values", sql`${t.renderer} is null or ${t.renderer} in ('chromium', 'og')`),
    ],
  )
  .enableRLS();

/** The voice log (domain 5.1 plus voice.md 9). Only Lane C's voice routes write it; it never moves `version`. No audio column, ever. */
export const voiceTurns = app
  .table(
    "voice_turns",
    {
      id: idColumn(),
      wedding_id: uuid("wedding_id").references(() => weddings.id, { onDelete: "cascade" }),
      user_id: uuid("user_id").notNull(),
      member_id: uuid("member_id"),
      status: voiceTurnStatusEnum("status").notNull(),
      transcript: text("transcript"),
      language_code: text("language_code"),
      intent: text("intent"),
      actions: json("actions")
        .notNull()
        .default(sql`'[]'::jsonb`),
      missing_fields: json("missing_fields")
        .notNull()
        .default(sql`'[]'::jsonb`),
      reply_text: text("reply_text"),
      context_turn_id: uuid("context_turn_id"),
      superseded_by_turn_id: uuid("superseded_by_turn_id"),
      flags: json("flags"),
      refusal_code: text("refusal_code"),
      results: json("results"),
      expires_at: tstz("expires_at")
        .notNull()
        .default(sql`now() + interval '10 minutes'`),
      confirmed_at: tstz("confirmed_at"),
      confirmed_via: text("confirmed_via"),
      client_turn_id: uuid("client_turn_id").notNull(),
      input_mode: text("input_mode").notNull(),
      speech_language: text("speech_language"),
      reply_language: text("reply_language"),
      reply_speech: json("reply_speech"),
      options: json("options"),
      ref_map: json("ref_map")
        .notNull()
        .default(sql`'{}'::jsonb`),
      trace: json("trace")
        .notNull()
        .default(sql`'{}'::jsonb`),
      timings_ms: json("timings_ms")
        .notNull()
        .default(sql`'{}'::jsonb`),
      fixture_id: text("fixture_id"),
      created_at: createdAt(),
      updated_at: updatedAt(),
      seed_key: seedKey(),
    },
    (t) => [
      uniqueIndex("voice_turns_user_client_turn_uq").on(t.user_id, t.client_turn_id),
      index("voice_turns_user_wedding_created_idx").on(t.user_id, t.wedding_id, t.created_at),
      check("voice_turns_intent_values", sql`${t.intent} is null or ${t.intent} in ('act', 'ask', 'clarify')`),
      check("voice_turns_confirmed_via_values", sql`${t.confirmed_via} is null or ${t.confirmed_via} in ('tap', 'phrase')`),
      check("voice_turns_input_mode_values", sql`${t.input_mode} in ('speech', 'typed', 'tap', 'fixture')`),
    ],
  )
  .enableRLS();

/** flagsmith.md 5.10 is binding: exactly these columns. Lane C writes it; it never moves `version`. */
export const experimentExposures = app
  .table(
    "experiment_exposures",
    {
      id: idColumn(),
      user_id: uuid("user_id").notNull(),
      experiment: text("experiment").notNull(),
      flagsmith_env: text("flagsmith_env").notNull(),
      flagsmith_experiment_id: text("flagsmith_experiment_id"),
      identity_key: text("identity_key").notNull(),
      variant: text("variant").notNull(),
      exposed_at: tstz("exposed_at").notNull().defaultNow(),
      converted_at: tstz("converted_at"),
      seconds_to_save: integer("seconds_to_save"),
      wedding_id: uuid("wedding_id").references(() => weddings.id, { onDelete: "set null" }),
    },
    (t) => [
      uniqueIndex("experiment_exposures_user_experiment_env_uq").on(t.user_id, t.experiment, t.flagsmith_env),
      check("experiment_exposures_variant_values", sql`${t.variant} in ('voice_first', 'form_first')`),
    ],
  )
  .enableRLS();

/** doc-ai.md 1.8 is binding: exactly these columns. Lane C writes it; never the image itself. */
export const cardImports = app
  .table(
    "card_imports",
    {
      id: idColumn(),
      request_idempotency_key: uuid("request_idempotency_key").notNull(),
      user_id: uuid("user_id").notNull(),
      wedding_id: uuid("wedding_id").references(() => weddings.id, { onDelete: "set null" }),
      provider: text("provider").notNull(),
      language: text("language").notNull(),
      image_sha256: text("image_sha256").notNull(),
      image_bytes: integer("image_bytes").notNull(),
      sarvam_idempotency_key: uuid("sarvam_idempotency_key").notNull(),
      sarvam_job_id: text("sarvam_job_id"),
      sarvam_run_id: text("sarvam_run_id"),
      status: cardImportStatusEnum("status").notNull().default("submitting"),
      sarvam_status: text("sarvam_status"),
      last_checked_at: tstz("last_checked_at"),
      submitted_at: tstz("submitted_at"),
      ready_at: tstz("ready_at"),
      applied_at: tstz("applied_at"),
      error_code: text("error_code"),
      error_detail: text("error_detail"),
      pages_total: integer("pages_total"),
      draft: json("draft"),
      field_counts: json("field_counts"),
      applied_event_ids: json("applied_event_ids"),
      created_at: createdAt(),
      updated_at: updatedAt(),
    },
    (t) => [
      uniqueIndex("card_imports_user_request_key_uq").on(t.user_id, t.request_idempotency_key),
      uniqueIndex("card_imports_sarvam_key_uq").on(t.sarvam_idempotency_key),
      check("card_imports_provider_values", sql`${t.provider} in ('docai', 'gemma4')`),
      check("card_imports_language_values", sql`${t.language} in ('en-IN', 'hi-IN')`),
    ],
  )
  .enableRLS();

/** Every table, in an order that inserts parents before children (the seed and reset use it). */
export const ALL_TABLES = {
  weddings,
  budgets,
  budgetLines,
  members,
  memberInvites,
  venues,
  events,
  assets,
  inviteStyles,
  publications,
  households,
  guests,
  guestContacts,
  invitations,
  invitationLinks,
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
  commandReceipts,
  exportJobs,
  exportAttempts,
  voiceTurns,
  experimentExposures,
  cardImports,
} as const;
