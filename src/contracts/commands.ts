/**
 * The command catalog (domain-and-data §3): one zod input schema per command, the
 * request and response envelopes (§3.0), outcomes, warnings and error codes.
 * Every write goes through the dispatcher with one of these commands.
 */
import { z } from "zod";
import {
  ASSET_KINDS,
  BUDGET_CATEGORIES,
  COMMAND_SOURCES,
  COMMITMENT_PRICINGS,
  COMMITMENT_UNITS,
  EVENT_KINDS,
  EXPORT_FORMATS,
  INVITE_LAYOUTS,
  INVITE_THEMES,
  INVITE_TYPEFACES,
  MEMBER_ROLES,
  PAYMENT_KINDS,
  PAYMENT_METHODS,
  PHOTO_FRAMES,
  REQUIREMENT_CATEGORIES,
  RESET_CHECKPOINTS,
  RSVP_STATUSES,
  VENDOR_STATUSES,
  type ActivityEntryId,
  type EventId,
  type HouseholdId,
  type JsonObject,
  type JsonValue,
  type MemberInviteId,
  type PaymentId,
  type ProposalId,
  type CommandSource,
  type ResetCheckpoint,
  type SnapshotChange,
  type WeddingId,
  type GuestInvitationView,
} from "./domain";
import { MAX_AMOUNT_INR, MAX_BUDGET_INR, MAX_QUANTITY, MAX_UNIT_PRICE_INR } from "./money";
import type { ExportJobView, RsvpTotalsRow } from "./read-models";

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------

export const COMMAND_NAMES = [
  // 3.1 Wedding, budget and members
  "set_wedding_profile",
  "set_budget_line",
  "set_sharing",
  "invite_member",
  "accept_member_invite",
  "revoke_member_invite",
  "remove_member",
  // 3.2 Functions, venues, the invitation and publishing
  "create_event",
  "update_event",
  "update_invite_style",
  "add_asset",
  "publish_itinerary",
  // 3.3 Vendors and money
  "add_vendor",
  "update_vendor",
  "add_quote",
  "record_commitment",
  "update_commitment",
  "void_commitment",
  "record_payment",
  "correct_payment",
  "void_payment",
  "record_expense",
  // 3.4 Requirements, notes, guests and RSVPs
  "add_requirement",
  "add_note",
  "add_guest",
  "set_invitations",
  "set_rsvp",
  "set_dietary",
  "submit_rsvp",
  "create_invitation_links",
  "revoke_invitation_link",
  // 3.5 Proposals
  "propose_change",
  "approve_proposal",
  "reject_proposal",
  "withdraw_proposal",
  // 3.6 Shagun
  "record_shagun",
  "mark_shagun_thanked",
  // 3.7 Card export and demo controls
  "request_card_export",
  "retry_card_export",
  "reset_demo",
] as const;
export type CommandName = (typeof COMMAND_NAMES)[number];

/** A1: a manager must propose these; an owner runs them directly. */
export const GATED_COMMANDS = [
  "record_commitment",
  "update_commitment",
  "void_commitment",
  "record_payment",
  "correct_payment",
  "void_payment",
  "record_expense",
] as const satisfies readonly CommandName[];
export type GatedCommand = (typeof GATED_COMMANDS)[number];

/** Commands the voice tool may propose (3.9). `record_shagun` only once Should #13 ships. */
export const VOICE_COMMANDS = [
  "set_wedding_profile",
  "create_event",
  "update_event",
  "update_invite_style",
  "add_vendor",
  "record_commitment",
  "update_commitment",
  "record_payment",
  "correct_payment",
  "add_requirement",
  "add_note",
  "add_guest",
  "set_rsvp",
  "set_dietary",
  "publish_itinerary",
  "request_card_export",
  "record_shagun",
] as const satisfies readonly CommandName[];
export type VoiceCommand = (typeof VOICE_COMMANDS)[number];

/** Lane D's four handlers, in `src/server/invite/handlers.ts` (D41). Lane A writes the rest. */
export const LANE_D_COMMANDS = [
  "update_invite_style",
  "publish_itinerary",
  "request_card_export",
  "retry_card_export",
] as const satisfies readonly CommandName[];

/** Where section 3 marks the idempotency key as required (`set_wedding_profile`: on create). */
export const IDEMPOTENCY_REQUIRED = [
  "set_wedding_profile",
  "invite_member",
  "publish_itinerary",
  "record_commitment",
  "update_commitment",
  "void_commitment",
  "record_payment",
  "correct_payment",
  "void_payment",
  "record_expense",
  "submit_rsvp",
  "create_invitation_links",
  "propose_change",
  "approve_proposal",
  "record_shagun",
  "retry_card_export",
] as const satisfies readonly CommandName[];

/** Activity topics (5.4). Approval uses the executed command's topic. */
export const ACTIVITY_TOPICS = [
  "wedding.created",
  "wedding.updated",
  "budget.updated",
  "sharing.updated",
  "member.invited",
  "member.invite_revoked",
  "member.joined",
  "member.removed",
  "event.created",
  "event.updated",
  "invite_style.updated",
  "asset.added",
  "itinerary.published",
  "vendor.added",
  "vendor.updated",
  "quote.added",
  "commitment.recorded",
  "commitment.updated",
  "commitment.voided",
  "payment.recorded",
  "payment.corrected",
  "payment.voided",
  "expense.recorded",
  "requirement.added",
  "note.added",
  "guest.added",
  "invitations.set",
  "rsvp.updated",
  "rsvp.submitted",
  "dietary.updated",
  "invitation_links.created",
  "invitation_link.revoked",
  "proposal.created",
  "proposal.rejected",
  "proposal.withdrawn",
  "shagun.recorded",
  "shagun.thanked",
  "export.requested",
  "export.succeeded",
  "export.failed",
  "export.retried",
] as const;
export type ActivityTopic = (typeof ACTIVITY_TOPICS)[number];

// ---------------------------------------------------------------------------
// Field primitives (3.0 "Input types"). Messages are the validation_failed words.
// ---------------------------------------------------------------------------

export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
/** I1: 8 to 200 printable ASCII characters, never validated as a UUID. */
export const IDEMPOTENCY_KEY_PATTERN = /^[\x20-\x7E]{8,200}$/;

function isCalendarDate(value: string): boolean {
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

const id = () => z.guid("unknown_value");
const text = (max: number) => z.string().trim().min(1, "required").max(max, "too_long");
const intIn = (min: number, max: number) =>
  z.number().int("not_integer").min(min, "out_of_range").max(max, "out_of_range");
const amountInr = () => intIn(1, MAX_AMOUNT_INR);
const budgetInr = () => intIn(0, MAX_BUDGET_INR);
const date = () => z.string().regex(DATE_PATTERN, "unknown_value").refine(isCalendarDate, "unknown_value");
const dateInYears = (from: number, to: number) =>
  date().refine((value) => {
    const year = Number(value.slice(0, 4));
    return year >= from && year <= to;
  }, "out_of_range");
const time = () => z.string().regex(TIME_PATTERN, "unknown_value");
const instant = () => z.string().refine((value) => !Number.isNaN(Date.parse(value)), "unknown_value");
export const idempotencyKeySchema = z.string().regex(IDEMPOTENCY_KEY_PATTERN, "out_of_range");

function definedCount(value: Record<string, unknown>, keys: readonly string[]): number {
  return keys.filter((key) => value[key] !== undefined).length;
}

function minutes(hhmm: string): number {
  return Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
}

// ---------------------------------------------------------------------------
// 3.1 Wedding, budget and members
// ---------------------------------------------------------------------------

const weddingProfileFields = {
  bride_name: text(60),
  groom_name: text(60),
  wedding_date: dateInYears(2026, 2030),
  city: text(60),
  budget_inr: budgetInr(),
  expected_guests: intIn(0, 5000),
  setup_opened_at: instant(),
};
const WEDDING_PROFILE_KEYS = Object.keys(weddingProfileFields);

/** Update (or create, when the envelope has no wedding_id): at least one field. */
export const setWeddingProfileSchema = z
  .object({
    bride_name: weddingProfileFields.bride_name.optional(),
    groom_name: weddingProfileFields.groom_name.optional(),
    wedding_date: weddingProfileFields.wedding_date.optional(),
    city: weddingProfileFields.city.optional(),
    budget_inr: weddingProfileFields.budget_inr.optional(),
    expected_guests: weddingProfileFields.expected_guests.optional(),
    setup_opened_at: weddingProfileFields.setup_opened_at.optional(),
  })
  .refine((value) => definedCount(value, WEDDING_PROFILE_KEYS) > 0, "required");

/** The create form of `set_wedding_profile`: names and a full date are required. */
export const setWeddingProfileCreateSchema = z.object({
  bride_name: weddingProfileFields.bride_name,
  groom_name: weddingProfileFields.groom_name,
  wedding_date: weddingProfileFields.wedding_date,
  city: weddingProfileFields.city.optional(),
  budget_inr: weddingProfileFields.budget_inr.optional(),
  expected_guests: weddingProfileFields.expected_guests.optional(),
  setup_opened_at: weddingProfileFields.setup_opened_at.optional(),
});

const SHARING_KEYS = ["managers_can_see_vendor_dues", "managers_can_see_budget", "managers_can_see_guest_contacts"];

// ---------------------------------------------------------------------------
// 3.2 Functions
// ---------------------------------------------------------------------------

const eventFields = {
  title: text(40),
  title_hi: text(40),
  event_date: dateInYears(2026, 2030),
  start_time: time(),
  end_time: time(),
  muhurat_time: time(),
  venue_id: id(),
  venue_name: text(80),
  dress_code: text(120),
  description: text(500),
  lead_name: text(60),
  expected_headcount: intIn(0, 5000),
};

type TimeFields = { start_time?: string | null; end_time?: string | null; muhurat_time?: string | null };

/** The part of zod's refinement context these checks use. */
type IssueSink = { addIssue(issue: { code: "custom"; message: string; path?: (string | number)[] }): void };

function checkEventTimes(value: TimeFields, ctx: IssueSink): void {
  const { start_time, end_time, muhurat_time } = value;
  if (start_time && end_time && minutes(end_time) <= minutes(start_time)) {
    ctx.addIssue({ code: "custom", path: ["end_time"], message: "time_order" });
  }
  if (muhurat_time && start_time && end_time) {
    const m = minutes(muhurat_time);
    if (m < minutes(start_time) || m > minutes(end_time)) {
      ctx.addIssue({ code: "custom", path: ["muhurat_time"], message: "time_order" });
    }
  }
}

const UPDATE_EVENT_KEYS = Object.keys(eventFields);

// ---------------------------------------------------------------------------
// 3.3 Money
// ---------------------------------------------------------------------------

type PricingFields = {
  pricing?: "lump_sum" | "per_unit";
  unit?: string | null;
  unit_price_inr?: number | null;
  quantity?: number | null;
  amount_inr?: number | null;
};

/** M2 and the per-pricing required fields (M3's amount check is the handler's: `amount_mismatch`). */
function checkPricing(value: PricingFields, ctx: IssueSink, requireAll: boolean): void {
  if (!requireAll && value.pricing === undefined) return;
  if (value.pricing === "per_unit") {
    for (const field of ["unit", "unit_price_inr", "quantity"] as const) {
      if (value[field] === undefined || value[field] === null) {
        ctx.addIssue({ code: "custom", path: [field], message: "required" });
      }
    }
    if (value.unit_price_inr && value.quantity && value.unit_price_inr * value.quantity > MAX_AMOUNT_INR) {
      ctx.addIssue({ code: "custom", path: ["quantity"], message: "out_of_range" });
    }
  } else if (value.pricing === "lump_sum" && (value.amount_inr === undefined || value.amount_inr === null)) {
    ctx.addIssue({ code: "custom", path: ["amount_inr"], message: "required" });
  }
}

const UPDATE_COMMITMENT_KEYS = [
  "pricing",
  "unit",
  "unit_price_inr",
  "quantity",
  "amount_inr",
  "event_id",
  "description",
  "agreed_on",
  "due_on",
];
const CORRECT_PAYMENT_KEYS = ["amount_inr", "paid_on", "method", "note"];
const VENDOR_KEYS = ["name", "vendor_category", "status", "contact_name", "contact_phone", "event_ids", "notes"];
const INVITE_STYLE_KEYS = [
  "theme",
  "typeface",
  "layout",
  "photo_frame",
  "photo_asset_id",
  "heading_hi",
  "wording_en",
  "wording_hi",
  "blessing_line",
];

// ---------------------------------------------------------------------------
// The schemas, one per command
// ---------------------------------------------------------------------------

export const commandSchemas = {
  // 3.1
  set_wedding_profile: setWeddingProfileSchema,
  set_budget_line: z.object({
    budget_category: z.enum(BUDGET_CATEGORIES, "unknown_value"),
    planned_inr: budgetInr(),
  }),
  set_sharing: z
    .object({
      managers_can_see_vendor_dues: z.boolean().optional(),
      managers_can_see_budget: z.boolean().optional(),
      managers_can_see_guest_contacts: z.boolean().optional(),
    })
    .refine((value) => definedCount(value, SHARING_KEYS) > 0, "required"),
  invite_member: z.object({
    email: z.email("unknown_value").max(120, "too_long"),
    role: z.enum(MEMBER_ROLES, "unknown_value"),
    display_name: text(60).optional(),
  }),
  accept_member_invite: z.object({ token: text(64) }),
  revoke_member_invite: z.object({ member_invite_id: id() }),
  remove_member: z.object({ member_id: id() }),

  // 3.2
  create_event: z
    .object({
      event_kind: z.enum(EVENT_KINDS, "unknown_value"),
      title: eventFields.title.optional(),
      title_hi: eventFields.title_hi.optional(),
      event_date: eventFields.event_date,
      start_time: eventFields.start_time.optional(),
      end_time: eventFields.end_time.optional(),
      muhurat_time: eventFields.muhurat_time.optional(),
      venue_id: eventFields.venue_id.optional(),
      venue_name: eventFields.venue_name.optional(),
      dress_code: eventFields.dress_code.optional(),
      description: eventFields.description.optional(),
      lead_name: eventFields.lead_name.optional(),
      expected_headcount: eventFields.expected_headcount.optional(),
    })
    .superRefine((value, ctx) => {
      if (value.event_kind === "other" && !value.title) {
        ctx.addIssue({ code: "custom", path: ["title"], message: "required" });
      }
      checkEventTimes(value, ctx);
    }),
  /** `null` clears an optional field. At least one field must change. */
  update_event: z
    .object({
      event_id: id(),
      expected_version: intIn(1, Number.MAX_SAFE_INTEGER),
      title: eventFields.title.optional(),
      title_hi: eventFields.title_hi.optional(),
      event_date: eventFields.event_date.optional(),
      start_time: eventFields.start_time.optional(),
      end_time: eventFields.end_time.nullable().optional(),
      muhurat_time: eventFields.muhurat_time.nullable().optional(),
      venue_id: eventFields.venue_id.nullable().optional(),
      venue_name: eventFields.venue_name.optional(),
      dress_code: eventFields.dress_code.nullable().optional(),
      description: eventFields.description.nullable().optional(),
      lead_name: eventFields.lead_name.nullable().optional(),
      expected_headcount: eventFields.expected_headcount.optional(),
    })
    .superRefine((value, ctx) => {
      if (definedCount(value, UPDATE_EVENT_KEYS) === 0) ctx.addIssue({ code: "custom", message: "required" });
      checkEventTimes(value, ctx);
    }),
  update_invite_style: z
    .object({
      theme: z.enum(INVITE_THEMES, "unknown_value").optional(),
      typeface: z.enum(INVITE_TYPEFACES, "unknown_value").optional(),
      layout: z.enum(INVITE_LAYOUTS, "unknown_value").optional(),
      photo_frame: z.enum(PHOTO_FRAMES, "unknown_value").optional(),
      photo_asset_id: id().nullable().optional(),
      heading_hi: text(40).optional(),
      wording_en: text(600).optional(),
      wording_hi: text(600).optional(),
      blessing_line: text(80).nullable().optional(),
    })
    .refine((value) => definedCount(value, INVITE_STYLE_KEYS) > 0, "required"),
  add_asset: z.object({
    asset_id: id(),
    asset_kind: z.enum(ASSET_KINDS, "unknown_value"),
    mime_type: z.enum(["image/jpeg", "image/png", "image/webp"], "unknown_value"),
    bytes: intIn(1, 10 * 1024 * 1024),
    width: intIn(1, 20000).optional(),
    height: intIn(1, 20000).optional(),
  }),
  publish_itinerary: z.object({
    expected_draft_version: intIn(0, Number.MAX_SAFE_INTEGER),
    note: text(200).optional(),
  }),

  // 3.3
  add_vendor: z.object({
    name: text(80),
    vendor_category: z.enum(BUDGET_CATEGORIES, "unknown_value"),
    status: z.enum(VENDOR_STATUSES, "unknown_value").optional(),
    contact_name: text(60).optional(),
    contact_phone: z.string().trim().regex(/^\+?[0-9 ]{1,20}$/, "unknown_value").optional(),
    event_ids: z.array(id()).max(50, "out_of_range").optional(),
    notes: text(500).optional(),
  }),
  update_vendor: z
    .object({
      vendor_id: id(),
      name: text(80).optional(),
      vendor_category: z.enum(BUDGET_CATEGORIES, "unknown_value").optional(),
      status: z.enum(VENDOR_STATUSES, "unknown_value").optional(),
      contact_name: text(60).optional(),
      contact_phone: z.string().trim().regex(/^\+?[0-9 ]{1,20}$/, "unknown_value").optional(),
      event_ids: z.array(id()).max(50, "out_of_range").optional(),
      notes: text(500).optional(),
    })
    .refine((value) => definedCount(value, VENDOR_KEYS) > 0, "required"),
  add_quote: z
    .object({
      vendor_id: id(),
      pricing: z.enum(COMMITMENT_PRICINGS, "unknown_value"),
      unit: z.enum(COMMITMENT_UNITS, "unknown_value").optional(),
      unit_price_inr: intIn(1, MAX_UNIT_PRICE_INR).optional(),
      quantity: intIn(1, MAX_QUANTITY).optional(),
      amount_inr: amountInr().optional(),
      event_id: id().optional(),
      description: text(200).optional(),
      quoted_on: date().optional(),
      valid_until: date().optional(),
    })
    .superRefine((value, ctx) => checkPricing(value, ctx, true)),
  record_commitment: z
    .object({
      vendor_id: id(),
      pricing: z.enum(COMMITMENT_PRICINGS, "unknown_value"),
      unit: z.enum(COMMITMENT_UNITS, "unknown_value").optional(),
      unit_price_inr: intIn(1, MAX_UNIT_PRICE_INR).optional(),
      quantity: intIn(1, MAX_QUANTITY).optional(),
      /** For `per_unit`, only a check: it must equal unit_price_inr × quantity (M3). */
      amount_inr: amountInr().optional(),
      event_id: id().optional(),
      description: text(200).optional(),
      quote_id: id().optional(),
      agreed_on: date().optional(),
      due_on: date().optional(),
    })
    .superRefine((value, ctx) => checkPricing(value, ctx, true)),
  update_commitment: z
    .object({
      commitment_id: id(),
      expected_version: intIn(1, Number.MAX_SAFE_INTEGER),
      pricing: z.enum(COMMITMENT_PRICINGS, "unknown_value").optional(),
      unit: z.enum(COMMITMENT_UNITS, "unknown_value").optional(),
      unit_price_inr: intIn(1, MAX_UNIT_PRICE_INR).optional(),
      quantity: intIn(1, MAX_QUANTITY).optional(),
      amount_inr: amountInr().optional(),
      event_id: id().nullable().optional(),
      description: text(200).nullable().optional(),
      agreed_on: date().nullable().optional(),
      due_on: date().nullable().optional(),
    })
    .superRefine((value, ctx) => {
      if (definedCount(value, UPDATE_COMMITMENT_KEYS) === 0) ctx.addIssue({ code: "custom", message: "required" });
      checkPricing(value, ctx, false);
    }),
  void_commitment: z.object({
    commitment_id: id(),
    expected_version: intIn(1, Number.MAX_SAFE_INTEGER),
    void_reason: text(200).optional(),
  }),
  record_payment: z.object({
    vendor_id: id(),
    amount_inr: amountInr(),
    payment_kind: z.enum(PAYMENT_KINDS, "unknown_value"),
    /** Not after today (IST): the handler checks; empty means "Date not given". */
    paid_on: date().optional(),
    method: z.enum(PAYMENT_METHODS, "unknown_value").optional(),
    commitment_id: id().optional(),
    note: text(200).optional(),
  }),
  correct_payment: z
    .object({
      payment_id: id(),
      expected_version: intIn(1, Number.MAX_SAFE_INTEGER),
      amount_inr: amountInr().optional(),
      paid_on: date().nullable().optional(),
      method: z.enum(PAYMENT_METHODS, "unknown_value").optional(),
      note: text(200).optional(),
      change_reason: text(200).optional(),
    })
    .refine((value) => definedCount(value, CORRECT_PAYMENT_KEYS) > 0, "required"),
  void_payment: z.object({
    payment_id: id(),
    expected_version: intIn(1, Number.MAX_SAFE_INTEGER),
    void_reason: text(200).optional(),
  }),
  /** `paid_in_full` defaults to true for an owner; inside `propose_change` it is required (3.5). */
  record_expense: z.object({
    payee_name: text(80),
    budget_category: z.enum(BUDGET_CATEGORIES, "unknown_value"),
    amount_inr: amountInr(),
    paid_in_full: z.boolean().optional(),
    paid_on: date().optional(),
    method: z.enum(PAYMENT_METHODS, "unknown_value").optional(),
    event_id: id().optional(),
    description: text(200).optional(),
  }),

  // 3.4
  add_requirement: z.object({
    event_id: id(),
    text: text(200),
    quantity: intIn(1, 10000).optional(),
    requirement_category: z.enum(REQUIREMENT_CATEGORIES, "unknown_value").optional(),
    vendor_id: id().optional(),
  }),
  // A fact the planner told the assistant that no other record holds ("Valet parking for 100 cars").
  add_note: z.object({
    topic: text(40),
    note_text: text(300),
  }),
  add_guest: z.object({
    full_name: text(80),
    household_id: id().optional(),
    household_name: text(80).optional(),
    relation: text(80).optional(),
    group_label: text(40).optional(),
    event_ids: z.array(id()).max(50, "out_of_range").optional(),
    max_plus_ones: intIn(0, 10).optional(),
    dietary_note: text(200).optional(),
    phone: z.string().trim().regex(/^\+?[0-9 ]{1,20}$/, "unknown_value").optional(),
    email: z.email("unknown_value").max(120, "too_long").optional(),
    note: text(200).optional(),
  }),
  set_invitations: z.object({
    guest_id: id(),
    event_ids: z.array(id()).max(50, "out_of_range"),
    max_plus_ones: intIn(0, 10).optional(),
  }),
  set_rsvp: z
    .object({
      guest_ids: z.array(id()).min(1, "required").max(50, "out_of_range"),
      event_id: id(),
      rsvp_status: z.enum(RSVP_STATUSES, "unknown_value"),
      plus_ones: intIn(0, 10).optional(),
    })
    .superRefine((value, ctx) => {
      if (value.plus_ones !== undefined && value.guest_ids.length !== 1) {
        ctx.addIssue({ code: "custom", path: ["plus_ones"], message: "unknown_value" });
      }
    }),
  set_dietary: z.object({
    guest_id: id(),
    dietary_note: text(200).nullable(),
  }),
  /** Guest token only, through `POST /api/i/{token}/rsvp`; the key rides in the envelope. */
  submit_rsvp: z.object({
    responses: z
      .array(
        z.object({
          guest_id: id(),
          event_id: id(),
          rsvp_status: z.enum(["attending", "declined"], "unknown_value"),
          plus_ones: intIn(0, 10).optional(),
        }),
      )
      .min(1, "required")
      .max(20, "out_of_range"),
  }),
  create_invitation_links: z.object({
    household_ids: z.array(id()).min(1, "required").max(100, "out_of_range"),
    rotate: z.boolean().optional(),
  }),
  revoke_invitation_link: z.object({ household_id: id() }),

  // 3.5
  /** `input` is exactly the gated command's input; the handler validates it with that schema. */
  propose_change: z.object({
    command: z.enum(GATED_COMMANDS, "unknown_value"),
    input: z.record(z.string(), z.unknown()),
    reason: text(200).optional(),
  }),
  approve_proposal: z.object({ proposal_id: id() }),
  reject_proposal: z.object({ proposal_id: id(), decision_reason: text(200).optional() }),
  withdraw_proposal: z.object({ proposal_id: id() }),

  // 3.6
  record_shagun: z.object({
    giver_name: text(80),
    household_id: id().optional(),
    amount_inr: amountInr(),
    received_on: date().optional(),
    how: text(120).optional(),
    note: text(200).optional(),
  }),
  mark_shagun_thanked: z.object({
    shagun_entry_id: id(),
    thanked: z.boolean(),
    thanked_note: text(120).optional(),
  }),

  // 3.7
  request_card_export: z.object({ format: z.enum(EXPORT_FORMATS, "unknown_value") }),
  /**
   * `job_id` comes from the route path; the Idempotency-Key header rides in the envelope.
   * `expected_export_key` is required on the ops route and server-filled for the owner's
   * button. `wait` is the query parameter, 0–25 s (default 25 on the ops route, 0 on the panel).
   */
  retry_card_export: z.object({
    job_id: id(),
    expected_export_key: text(200).optional(),
    nudgebee: z
      .object({
        workflow_id: z.string().max(100, "too_long").optional(),
        execution_id: z.string().max(100, "too_long").optional(),
        approver: z.string().max(100, "too_long").optional(),
      })
      .optional(),
    wait: intIn(0, 25).optional(),
  }),
  reset_demo: z.object({
    checkpoint: z.enum(RESET_CHECKPOINTS, "unknown_value").optional(),
    confirm_text: z.literal("RESET", "unknown_value"),
  }),
} satisfies Record<CommandName, z.ZodType>;

export type CommandSchemas = typeof commandSchemas;

/** What a caller sends for command C (before trimming). */
export type CommandInput<C extends CommandName> = z.input<CommandSchemas[C]>;
/** What a handler receives for command C (after parsing). */
export type ParsedCommandInput<C extends CommandName> = z.output<CommandSchemas[C]>;

export type ProposeChangeInput = {
  [G in GatedCommand]: { command: G; input: CommandInput<G>; reason?: string };
}[GatedCommand];

// ---------------------------------------------------------------------------
// Outcomes, warnings and errors (3.0)
// ---------------------------------------------------------------------------

export const COMMAND_OUTCOMES = ["applied", "proposed", "replayed", "unchanged"] as const;
export type CommandOutcome = (typeof COMMAND_OUTCOMES)[number];

export const COMMAND_OUTCOME_HTTP_STATUS: Record<CommandOutcome, number> = {
  applied: 200,
  proposed: 202,
  replayed: 200,
  unchanged: 200,
};

export const COMMAND_WARNING_KINDS = ["overlap", "over_capacity", "over_budget", "overpaid", "possible_duplicate"] as const;
export type CommandWarningKind = (typeof COMMAND_WARNING_KINDS)[number];

export type CommandWarning = {
  kind: CommandWarningKind;
  message: string;
  entity_ids?: string[];
};

export const COMMAND_ERROR_CODES = [
  "unauthenticated",
  "forbidden",
  "approval_required",
  "not_found",
  "validation_failed",
  "amount_mismatch",
  "plus_ones_exceeds_limit",
  "stale_version",
  "draft_changed",
  "idempotency_key_reused",
  "payment_void",
  "commitment_void",
  "proposal_not_pending",
  "duplicate_vendor",
  "duplicate_requirement",
  "not_invited",
  "nothing_published",
  "proposal_changed",
  "already_member",
  "invite_invalid",
  "last_owner",
  "voice_turn_expired",
  "expectation_failed",
  "voice_writes_paused",
  "voice_unavailable",
  "demo_reset_disabled",
  "not_sample_wedding",
  "rate_limited",
  "internal_error",
] as const;
export type CommandErrorCode = (typeof COMMAND_ERROR_CODES)[number];

export const COMMAND_ERROR_HTTP_STATUS: Record<CommandErrorCode, number> = {
  unauthenticated: 401,
  forbidden: 403,
  approval_required: 403,
  not_found: 404,
  validation_failed: 422,
  amount_mismatch: 422,
  plus_ones_exceeds_limit: 422,
  stale_version: 409,
  draft_changed: 409,
  idempotency_key_reused: 409,
  payment_void: 409,
  commitment_void: 409,
  proposal_not_pending: 409,
  duplicate_vendor: 409,
  duplicate_requirement: 409,
  not_invited: 409,
  nothing_published: 409,
  proposal_changed: 409,
  already_member: 409,
  invite_invalid: 404,
  last_owner: 409,
  voice_turn_expired: 410,
  expectation_failed: 412,
  voice_writes_paused: 423,
  voice_unavailable: 403,
  demo_reset_disabled: 403,
  not_sample_wedding: 403,
  rate_limited: 429,
  internal_error: 500,
};

/** The `message` words of `validation_failed` (3.0), plus `no_functions` for a publish. */
export const VALIDATION_MESSAGES = [
  "required",
  "out_of_range",
  "not_integer",
  "year_required",
  "time_order",
  "too_long",
  "unknown_value",
  "no_functions",
] as const;
export type ValidationMessage = (typeof VALIDATION_MESSAGES)[number];

/** Voice refusals stored in `voice_turns.refusal_code`; `not_shared` is never an HTTP error. */
export const VOICE_REFUSAL_CODES = ["voice_writes_paused", "forbidden", "not_shared"] as const;
export type VoiceRefusalCode = (typeof VOICE_REFUSAL_CODES)[number];

/** One prefill entry (3.8, D121): the typed form opens with these values. */
export type VoicePrefillEntry = {
  command: CommandName;
  input: JsonObject;
  /** Field key → the form's label. */
  labels: Record<string, string>;
};

export type CommandErrorBody = {
  code: CommandErrorCode;
  message: string;
  field?: string | null;
  /** The fresh record, for 409s. */
  current?: JsonValue;
  /** Only on 423 `voice_writes_paused`: one entry per action. */
  prefill?: VoicePrefillEntry[];
};

/**
 * Maps a zod issue to the `validation_failed` message word. Our schemas set the word as the
 * message; type errors (a missing key or a wrong JSON type) fall back here.
 */
export function validationMessageFor(issue: { code: string; message: string; input?: unknown }): string {
  if ((VALIDATION_MESSAGES as readonly string[]).includes(issue.message)) return issue.message;
  if (issue.code === "invalid_type") return issue.input === undefined ? "required" : "unknown_value";
  if (issue.code === "too_big") return "out_of_range";
  if (issue.code === "too_small") return "out_of_range";
  return "unknown_value";
}

// ---------------------------------------------------------------------------
// Results (the `result` of the response envelope)
// ---------------------------------------------------------------------------

/** M4 figures for one vendor, returned by every money command (3.3). */
export type VendorTotals = {
  committed_inr: number;
  paid_inr: number;
  outstanding_inr: number;
  overpaid_inr: number;
};

export type MoneyCommandResult = {
  vendor_id: string;
  vendor_totals: VendorTotals;
};

export type PaymentCommandResult = MoneyCommandResult & {
  payment_id: PaymentId;
  version_no: number;
  amount_inr: number;
};

export type UpdateEventResult = {
  event_id: EventId;
  version: number;
  draft_version: number;
};

export type ResetDemoResult = {
  checkpoint: ResetCheckpoint;
  draft_version: number;
  published_revision: number | null;
};

export type ProposeChangeResult = { proposal_id: ProposalId };

export type PublishItineraryResult = {
  publication_id: string;
  revision: number;
  changes: SnapshotChange[];
};

export type CreateInvitationLinksResult = {
  links: { household_id: HouseholdId; url?: string }[];
  skipped: HouseholdId[];
  /** On a replay: the raw tokens were shown once and are not stored (6.3). */
  tokens_already_issued?: boolean;
};

export type InviteMemberResult = {
  member_invite_id: MemberInviteId;
  /** Shown once; a replay returns `token_already_issued` instead. */
  join_url?: string;
  token_already_issued?: boolean;
};

type CommandResultOverrides = {
  update_event: UpdateEventResult;
  reset_demo: ResetDemoResult;
  propose_change: ProposeChangeResult;
  publish_itinerary: PublishItineraryResult;
  record_commitment: MoneyCommandResult & { commitment_id: string; version_no: number };
  update_commitment: MoneyCommandResult & { commitment_id: string; version_no: number };
  void_commitment: MoneyCommandResult & { commitment_id: string };
  record_payment: PaymentCommandResult;
  correct_payment: PaymentCommandResult;
  void_payment: MoneyCommandResult & { payment_id: PaymentId };
  record_expense: MoneyCommandResult & { commitment_id: string; payment_id: PaymentId | null };
  set_rsvp: { rsvp_totals: RsvpTotalsRow };
  submit_rsvp: GuestInvitationView;
  request_card_export: ExportJobView;
  retry_card_export: ExportJobView;
  create_invitation_links: CreateInvitationLinksResult;
  invite_member: InviteMemberResult;
};

/** The result type of command C; commands without a named shape return a JSON object. */
export type CommandResult<C extends CommandName> = C extends keyof CommandResultOverrides
  ? CommandResultOverrides[C]
  : JsonObject;

// ---------------------------------------------------------------------------
// Envelopes (3.0)
// ---------------------------------------------------------------------------

export type CommandEnvelopeOf<C extends CommandName> = {
  /** Absent (or null) only for the `set_wedding_profile` create. */
  wedding_id?: WeddingId | null;
  command: C;
  input: CommandInput<C>;
  /** I1: opaque text of 8 to 200 characters. Required where `IDEMPOTENCY_REQUIRED` says. */
  idempotency_key?: string | null;
  source: CommandSource;
  voice_turn_id?: string | null;
};

/** The request envelope `dispatchCommand` and the dispatcher take. */
export type CommandEnvelope<C extends CommandName = CommandName> = { [K in C]: CommandEnvelopeOf<K> }[C];

export type CommandSuccessOf<C extends CommandName> = {
  ok: true;
  outcome: CommandOutcome;
  command: C;
  result: CommandResult<C>;
  activity_entry_id: ActivityEntryId | null;
  /** `weddings.version` after the command. */
  version: number;
  warnings: CommandWarning[];
  /** Set when the outcome is `proposed`. */
  proposal_id?: ProposalId;
};

export type CommandSuccess<C extends CommandName = CommandName> = { [K in C]: CommandSuccessOf<K> }[C];

export type CommandFailureBody = { ok: false; error: CommandErrorBody };

/** The response envelope. HTTP status: COMMAND_OUTCOME_HTTP_STATUS or COMMAND_ERROR_HTTP_STATUS. */
export type CommandResponse<C extends CommandName = CommandName> = CommandSuccess<C> | CommandFailureBody;

/** The outer envelope, before the input is parsed with `commandSchemas[command]`. */
export const commandEnvelopeSchema = z.object({
  wedding_id: z.guid("unknown_value").nullish(),
  command: z.enum(COMMAND_NAMES, "unknown_value"),
  input: z.record(z.string(), z.unknown()),
  idempotency_key: idempotencyKeySchema.nullish(),
  source: z.enum(COMMAND_SOURCES, "unknown_value"),
  voice_turn_id: z.guid("unknown_value").nullish(),
});

/**
 * A command failure a handler throws inside the transaction (rolling it back); the
 * dispatcher turns it into the error envelope with COMMAND_ERROR_HTTP_STATUS[code].
 */
export class CommandFailure extends Error {
  readonly body: CommandErrorBody;
  readonly http_status: number;

  constructor(body: CommandErrorBody) {
    super(body.message);
    this.name = "CommandFailure";
    this.body = body;
    this.http_status = COMMAND_ERROR_HTTP_STATUS[body.code];
  }
}

export function isCommandName(value: string): value is CommandName {
  return (COMMAND_NAMES as readonly string[]).includes(value);
}

export function isGatedCommand(value: string): value is GatedCommand {
  return (GATED_COMMANDS as readonly string[]).includes(value);
}
