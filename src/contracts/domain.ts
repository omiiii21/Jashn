/**
 * Domain contract: ids, the enums of domain-and-data 5.2, entity DTOs, actors and
 * the guest view (an allowlist type with no money fields, G3).
 *
 * Names are domain-and-data's, exactly (snake_case, as in the database and JSON).
 * No `server-only`: browser, scripts and server all import this file.
 */

// ---------------------------------------------------------------------------
// JSON helpers
// ---------------------------------------------------------------------------

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

/** `YYYY-MM-DD`, an IST calendar date. */
export type IsoDate = string;
/** `HH:MM`, 24-hour IST wall clock. */
export type IsoTime = string;
/** ISO 8601 instant. Read models use the IST offset (`2026-12-14T19:30:00+05:30`). */
export type IsoInstant = string;

// ---------------------------------------------------------------------------
// Ids (UUIDs; seeded rows use src/db/ids.ts)
// ---------------------------------------------------------------------------

export type WeddingId = string;
export type UserId = string;
export type MemberId = string;
export type MemberInviteId = string;
export type EventId = string;
export type VenueId = string;
export type AssetId = string;
export type PublicationId = string;
export type HouseholdId = string;
export type GuestId = string;
export type InvitationId = string;
export type InvitationLinkId = string;
export type VendorId = string;
export type QuoteId = string;
export type CommitmentId = string;
export type CommitmentVersionId = string;
export type PaymentId = string;
export type PaymentVersionId = string;
export type RequirementId = string;
export type ShagunEntryId = string;
export type ProposalId = string;
export type ActivityEntryId = string;
export type ExportJobId = string;
export type VoiceTurnId = string;
export type BudgetLineId = string;
/** A demo-data label kept on every seeded row (`EVT-REC`, `PAY-01/v1`); null for live rows. */
export type SeedKey = string;

// ---------------------------------------------------------------------------
// Enums (domain-and-data 5.2). Each is a const tuple plus its union type.
// ---------------------------------------------------------------------------

export const MEMBER_ROLES = ["owner", "manager"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const APP_LANGUAGES = ["en", "hi"] as const;
export type AppLanguage = (typeof APP_LANGUAGES)[number];

export const EVENT_KINDS = ["mehendi", "haldi", "sangeet", "wedding", "reception", "other"] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export const INVITE_THEMES = ["maroon_gold", "peacock_gold"] as const;
export type InviteTheme = (typeof INVITE_THEMES)[number];

export const INVITE_TYPEFACES = ["eczar", "tiro_devanagari"] as const;
export type InviteTypeface = (typeof INVITE_TYPEFACES)[number];

export const INVITE_LAYOUTS = ["card_with_inserts", "one_card", "facing_pages"] as const;
export type InviteLayout = (typeof INVITE_LAYOUTS)[number];

export const PHOTO_FRAMES = ["mounted", "arch"] as const;
export type PhotoFrame = (typeof PHOTO_FRAMES)[number];

export const ASSET_KINDS = ["couple_photo"] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

/** In display order (5.2). Also the vendor category. */
export const BUDGET_CATEGORIES = [
  "venue",
  "catering",
  "decor",
  "photography",
  "attire",
  "music",
  "mehendi_makeup",
  "invitations_gifts",
  "transport",
  "contingency",
] as const;
export type BudgetCategory = (typeof BUDGET_CATEGORIES)[number];

export const VENDOR_STATUSES = ["considering", "booked", "cancelled"] as const;
export type VendorStatus = (typeof VENDOR_STATUSES)[number];

export const COMMITMENT_PRICINGS = ["lump_sum", "per_unit"] as const;
export type CommitmentPricing = (typeof COMMITMENT_PRICINGS)[number];

export const COMMITMENT_UNITS = ["plate", "person", "item", "hour", "day"] as const;
export type CommitmentUnit = (typeof COMMITMENT_UNITS)[number];

export const QUOTE_STATUSES = ["open", "accepted"] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const PAYMENT_KINDS = ["advance", "instalment", "final"] as const;
export type PaymentKind = (typeof PAYMENT_KINDS)[number];

export const PAYMENT_METHODS = ["upi", "cash", "bank_transfer", "cheque", "card", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const REQUIREMENT_CATEGORIES = ["catering", "decor", "music", "ritual", "logistics", "attire", "other"] as const;
export type RequirementCategory = (typeof REQUIREMENT_CATEGORIES)[number];

export const RSVP_STATUSES = ["attending", "declined", "pending"] as const;
export type RsvpStatus = (typeof RSVP_STATUSES)[number];

export const RSVP_CHANNELS = ["guest_link", "member"] as const;
export type RsvpChannel = (typeof RSVP_CHANNELS)[number];

export const PROPOSAL_STATUSES = ["pending", "approved", "rejected", "withdrawn"] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export const COMMAND_SOURCES = ["ui", "voice", "guest_link", "nudgebee", "system", "seed"] as const;
export type CommandSource = (typeof COMMAND_SOURCES)[number];

export const ACTOR_TYPES = ["member", "guest", "system"] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

export const ACTIVITY_VISIBILITIES = ["members", "owners"] as const;
export type ActivityVisibility = (typeof ACTIVITY_VISIBILITIES)[number];

export const ENTITY_TYPES = [
  "wedding",
  "budget",
  "member",
  "member_invite",
  "event",
  "venue",
  "invite_style",
  "asset",
  "publication",
  "household",
  "guest",
  "invitation",
  "invitation_link",
  "vendor",
  "quote",
  "commitment",
  "payment",
  "requirement",
  "shagun_entry",
  "proposal",
  "export_job",
] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export const VOICE_TURN_STATUSES = [
  "proposed",
  "confirmed",
  "partially_saved",
  "cancelled",
  "paused",
  "answered",
  "superseded",
  "failed",
  "expired",
] as const;
export type VoiceTurnStatus = (typeof VOICE_TURN_STATUSES)[number];

/** `pdf` is added only if the lead approves the PDF Should at 13:30 (D66). */
export const EXPORT_FORMATS = ["png"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

/** Same values as `ExportJobStatus` in jobs.ts. */
export const EXPORT_STATUSES = ["queued", "rendering", "succeeded", "failed"] as const;
export type ExportStatus = (typeof EXPORT_STATUSES)[number];

/** doc-ai.md 1.8. The card-import contract itself lands in lane-lead-contracts-2 (D44). */
export const CARD_IMPORT_STATUSES = [
  "submitting",
  "reading",
  "fetching",
  "ready",
  "failed",
  "timed_out",
  "applied",
  "applied_partial",
  "discarded",
  "expired",
] as const;
export type CardImportStatus = (typeof CARD_IMPORT_STATUSES)[number];

export const FAIL_INJECTIONS = ["none", "once", "consumed"] as const;
export type FailInjection = (typeof FAIL_INJECTIONS)[number];

export const EXPORT_TRIGGERS = ["request", "owner_retry", "nudgebee"] as const;
export type ExportTrigger = (typeof EXPORT_TRIGGERS)[number];

// API-only value sets (5.2, last paragraph). Command outcomes live in commands.ts,
// retry outcomes in jobs.ts.

export const DUE_STATES = ["none", "upcoming", "due_soon", "overdue"] as const;
export type DueState = (typeof DUE_STATES)[number];

export const ESTIMATE_DIRECTIONS = ["below", "above", "equal"] as const;
export type EstimateDirection = (typeof ESTIMATE_DIRECTIONS)[number];

export const VOICE_INTENTS = ["act", "ask", "clarify"] as const;
export type VoiceIntent = (typeof VOICE_INTENTS)[number];

export const RESET_CHECKPOINTS = ["s0", "d0"] as const;
export type ResetCheckpoint = (typeof RESET_CHECKPOINTS)[number];

/** The three manager sharing flags (G7). */
export const SHARING_FLAGS = [
  "managers_can_see_vendor_dues",
  "managers_can_see_budget",
  "managers_can_see_guest_contacts",
] as const;
export type SharingFlag = (typeof SHARING_FLAGS)[number];
export type SharingSettings = Record<SharingFlag, boolean>;

// ---------------------------------------------------------------------------
// Labels shown to people (5.2)
// ---------------------------------------------------------------------------

export type BilingualLabel = { en: string; hi: string };

export const MEMBER_ROLE_LABELS: Record<MemberRole, BilingualLabel> = {
  owner: { en: "Owner", hi: "मालिक" },
  manager: { en: "Event manager", hi: "इवेंट मैनेजर" },
};

/** Default titles for `create_event`; an `other` function needs its own title. */
export const EVENT_KIND_DEFAULT_TITLES: Record<EventKind, BilingualLabel | null> = {
  mehendi: { en: "Mehendi", hi: "मेहंदी" },
  haldi: { en: "Haldi", hi: "हल्दी" },
  sangeet: { en: "Sangeet", hi: "संगीत" },
  wedding: { en: "Wedding", hi: "विवाह" },
  reception: { en: "Reception", hi: "रिसेप्शन" },
  other: null,
};

export const BUDGET_CATEGORY_LABELS: Record<BudgetCategory, BilingualLabel> = {
  venue: { en: "Venue and halls", hi: "वेन्यू और हॉल" },
  catering: { en: "Catering", hi: "खाना" },
  decor: { en: "Decor and flowers", hi: "सजावट और फूल" },
  photography: { en: "Photography and video", hi: "फ़ोटो और वीडियो" },
  attire: { en: "Attire and jewellery", hi: "कपड़े और गहने" },
  music: { en: "Music and entertainment", hi: "संगीत और मनोरंजन" },
  mehendi_makeup: { en: "Mehendi and makeup", hi: "मेहंदी और मेकअप" },
  invitations_gifts: { en: "Invitations and gifts", hi: "निमंत्रण और तोहफ़े" },
  transport: { en: "Transport and logistics", hi: "आना-जाना" },
  contingency: { en: "Contingency", hi: "आकस्मिक खर्च" },
};

/** Labels (UI) and the in-sentence words of the activity templates (`{kind}`, `{kind_hi}`). */
export const PAYMENT_KIND_LABELS: Record<PaymentKind, BilingualLabel & { in_sentence: string }> = {
  advance: { en: "Advance", hi: "एडवांस", in_sentence: "advance" },
  instalment: { en: "Instalment", hi: "किस्त", in_sentence: "instalment" },
  final: { en: "Final payment", hi: "आख़िरी भुगतान", in_sentence: "final payment" },
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  upi: "UPI",
  cash: "Cash",
  bank_transfer: "Bank transfer",
  cheque: "Cheque",
  card: "Card",
  other: "Other",
};

export const RSVP_STATUS_LABELS: Record<RsvpStatus, BilingualLabel & { in_sentence: string }> = {
  attending: { en: "Attending", hi: "आएँगे", in_sentence: "attending" },
  declined: { en: "Can't attend", hi: "नहीं आएँगे", in_sentence: "not attending" },
  pending: { en: "Not replied", hi: "जवाब बाकी", in_sentence: "not replied" },
};

export const INVITE_THEME_LABELS: Record<InviteTheme, string> = {
  maroon_gold: "Maroon & Gold",
  peacock_gold: "Peacock & Gold",
};

export const DEFAULT_HEADING_HI = "शुभ विवाह";
export const APP_TIMEZONE = "Asia/Kolkata";
export const IST_OFFSET = "+05:30";
/** The badge every sample copy shows (demo-data header). */
export const SAMPLE_BADGE_TEXT = "Fictional demo data";

// ---------------------------------------------------------------------------
// Actors (domain 3.0 "Actor context"; flagsmith.md 2.3 and 4.1 traits)
// ---------------------------------------------------------------------------

/**
 * The signed-in actor, from Lane A's session helper (`src/server/auth/session.ts`).
 * `wedding_id`, `member_id` and `role` describe the user's membership in the wedding
 * the request is about; they are null on /setup or when the user has no wedding.
 * `email` is server-only: never sent to Flagsmith, logged or returned (flagsmith 10.1 item 5).
 */
export type SessionActor = {
  kind?: "member";
  user_id: UserId;
  email: string;
  display_name: string;
  wedding_id: WeddingId | null;
  member_id: MemberId | null;
  role: MemberRole | null;
  /** Flagsmith trait: email in INTERNAL_USER_EMAILS or ending in @example.com. */
  is_internal: boolean;
  /** Flagsmith trait: the user owns no wedding yet. */
  is_first_wedding: boolean;
  /** Flagsmith trait: the member's language; on /setup, the UI language. */
  preferred_language: AppLanguage;
};

/** The household a guest token resolves to (architecture 3.4). */
export type GuestActor = {
  kind: "guest";
  wedding_id: WeddingId;
  household_id: HouseholdId;
  household_name: string;
  guest_ids: GuestId[];
  /** Hex SHA-256 of the token, for the rate limiter and receipts. Never the token. */
  token_hash: string;
};

export type SystemActorLabel = "NudgeBee" | "Jashn";

/** The ops bearer token (`JOBS_API_TOKEN`) or the server itself. */
export type SystemActor = {
  kind: "system";
  label: SystemActorLabel;
};

export type CommandActor = SessionActor | GuestActor | SystemActor;

/** The `command_receipts.actor_key` forms: `member:{id}`, `household:{id}` or `ops`. */
export type ActorKey = `member:${string}` | `household:${string}` | "ops";

// ---------------------------------------------------------------------------
// Entity DTOs (rows as read models and fixtures carry them; snake_case)
// ---------------------------------------------------------------------------

export type WeddingDto = {
  wedding_id: WeddingId;
  seed_key: SeedKey | null;
  bride_name: string;
  groom_name: string;
  city: string | null;
  wedding_date: IsoDate;
  expected_guests: number | null;
  timezone: string;
  is_sample: boolean;
  managers_can_see_vendor_dues: boolean;
  managers_can_see_budget: boolean;
  managers_can_see_guest_contacts: boolean;
  version: number;
  draft_version: number;
  published_revision: number | null;
};

export type MemberDto = {
  member_id: MemberId;
  seed_key: SeedKey | null;
  user_id: UserId;
  role: MemberRole;
  display_name: string;
  preferred_language: AppLanguage;
  removed_at: IsoInstant | null;
};

export type BudgetLineDto = {
  budget_category: BudgetCategory;
  seed_key: SeedKey | null;
  planned_inr: number;
};

export type VenueDto = {
  venue_id: VenueId;
  seed_key: SeedKey | null;
  name: string;
  place_name: string | null;
  locality: string | null;
  address: string | null;
  capacity: number | null;
  map_url: string | null;
};

export type EventDto = {
  event_id: EventId;
  seed_key: SeedKey | null;
  event_kind: EventKind;
  title: string;
  title_hi: string;
  event_date: IsoDate;
  start_time: IsoTime | null;
  end_time: IsoTime | null;
  muhurat_time: IsoTime | null;
  venue_id: VenueId | null;
  dress_code: string | null;
  description: string | null;
  lead_name: string | null;
  expected_headcount: number | null;
  sort_order: number;
  version: number;
};

export type InviteStyleDto = {
  seed_key: SeedKey | null;
  theme: InviteTheme;
  typeface: InviteTypeface;
  layout: InviteLayout;
  photo_frame: PhotoFrame;
  photo_asset_id: AssetId | null;
  heading_hi: string;
  wording_en: string | null;
  wording_hi: string | null;
  blessing_line: string | null;
};

export type AssetDto = {
  asset_id: AssetId;
  seed_key: SeedKey | null;
  asset_kind: AssetKind;
  /** Object key `{wedding_id}/{asset_id}.{ext}` in bucket `uploads`, without the bucket name. */
  storage_path: string;
  mime_type: string | null;
  bytes: number | null;
  width: number | null;
  height: number | null;
};

export type HouseholdDto = {
  household_id: HouseholdId;
  seed_key: SeedKey | null;
  name: string;
  relation: string | null;
  primary_guest_id: GuestId | null;
  is_synthetic: boolean;
};

export type GuestDto = {
  guest_id: GuestId;
  seed_key: SeedKey | null;
  household_id: HouseholdId;
  full_name: string;
  group_label: string | null;
  dietary_note: string | null;
  note: string | null;
  is_synthetic: boolean;
};

/** `guest_contacts`; read only where G7 allows. */
export type GuestContactDto = {
  guest_id: GuestId;
  seed_key: SeedKey | null;
  phone: string | null;
  email: string | null;
};

export type InvitationDto = {
  invitation_id: InvitationId;
  seed_key: SeedKey | null;
  guest_id: GuestId;
  event_id: EventId;
  max_plus_ones: number;
  rsvp_status: RsvpStatus;
  plus_ones: number;
  responded_at: IsoInstant | null;
  responded_via: RsvpChannel | null;
  revoked_at: IsoInstant | null;
};

export type VendorDto = {
  vendor_id: VendorId;
  seed_key: SeedKey | null;
  name: string;
  vendor_category: BudgetCategory;
  status: VendorStatus;
  is_one_off: boolean;
  contact_name: string | null;
  contact_phone: string | null;
  notes: string | null;
  event_ids: EventId[];
};

export type QuoteDto = {
  quote_id: QuoteId;
  seed_key: SeedKey | null;
  vendor_id: VendorId;
  event_id: EventId | null;
  pricing: CommitmentPricing;
  unit: CommitmentUnit | null;
  unit_price_inr: number | null;
  quantity: number | null;
  amount_inr: number;
  description: string | null;
  quoted_on: IsoDate | null;
  valid_until: IsoDate | null;
  status: QuoteStatus;
};

export type CommitmentVersionDto = {
  commitment_version_id: CommitmentVersionId;
  seed_key: SeedKey | null;
  version_no: number;
  pricing: CommitmentPricing;
  unit: CommitmentUnit | null;
  unit_price_inr: number | null;
  quantity: number | null;
  amount_inr: number;
  event_id: EventId | null;
  description: string | null;
  agreed_on: IsoDate | null;
  due_on: IsoDate | null;
  change_reason: string | null;
  source: CommandSource;
  spoken_text: string | null;
  created_by_label: string | null;
  created_at: IsoInstant;
  superseded_at: IsoInstant | null;
};

export type CommitmentDto = {
  commitment_id: CommitmentId;
  seed_key: SeedKey | null;
  vendor_id: VendorId;
  quote_id: QuoteId | null;
  current_version_no: number;
  voided_at: IsoInstant | null;
  void_reason: string | null;
  /** Oldest first; exactly one has `superseded_at` null (C1). */
  versions: CommitmentVersionDto[];
};

export type PaymentVersionDto = {
  payment_version_id: PaymentVersionId;
  seed_key: SeedKey | null;
  version_no: number;
  amount_inr: number;
  paid_on: IsoDate | null;
  method: PaymentMethod | null;
  note: string | null;
  change_reason: string | null;
  source: CommandSource;
  voice_turn_id: VoiceTurnId | null;
  spoken_text: string | null;
  created_by_label: string | null;
  created_at: IsoInstant;
  superseded_at: IsoInstant | null;
};

export type PaymentDto = {
  payment_id: PaymentId;
  seed_key: SeedKey | null;
  vendor_id: VendorId;
  commitment_id: CommitmentId | null;
  payment_kind: PaymentKind;
  current_version_no: number;
  voided_at: IsoInstant | null;
  void_reason: string | null;
  /** Oldest first; exactly one has `superseded_at` null (C1). */
  versions: PaymentVersionDto[];
};

export type RequirementDto = {
  requirement_id: RequirementId;
  seed_key: SeedKey | null;
  event_id: EventId;
  requirement_category: RequirementCategory;
  text: string;
  quantity: number | null;
  vendor_id: VendorId | null;
};

export type ShagunEntryDto = {
  shagun_entry_id: ShagunEntryId;
  seed_key: SeedKey | null;
  giver_name: string;
  household_id: HouseholdId | null;
  amount_inr: number;
  received_on: IsoDate;
  how: string | null;
  note: string | null;
  thanked_at: IsoInstant | null;
  thanked_note: string | null;
};

export type ProposalDto = {
  proposal_id: ProposalId;
  seed_key: SeedKey | null;
  command: string;
  input: JsonObject;
  reason: string | null;
  summary_en: string;
  summary_hi: string;
  vendor_id: VendorId | null;
  budget_category: BudgetCategory | null;
  committed_delta_inr: number;
  paid_delta_inr: number;
  status: ProposalStatus;
  proposed_by_member_id: MemberId;
  proposed_at: IsoInstant;
  decided_by_member_id: MemberId | null;
  decided_at: IsoInstant | null;
  decision_reason: string | null;
};

export type ActivityEntryDto = {
  activity_entry_id: ActivityEntryId;
  seed_key: SeedKey | null;
  seq: number;
  occurred_at: IsoInstant;
  actor_type: ActorType;
  actor_member_id: MemberId | null;
  actor_guest_id: GuestId | null;
  actor_label: string;
  command: string;
  topic: string;
  source: CommandSource;
  entity_type: EntityType;
  entity_id: string;
  summary_en: string;
  summary_hi: string;
  before: JsonObject | null;
  after: JsonObject | null;
  visibility: ActivityVisibility;
  proposal_id: ProposalId | null;
  voice_turn_id: VoiceTurnId | null;
  spoken_text: string | null;
};

// ---------------------------------------------------------------------------
// Publication snapshots (domain 5.3; built only by src/db/itinerary-snapshot.ts, D95)
// ---------------------------------------------------------------------------

export type SnapshotVenue = {
  venue_id: VenueId;
  name: string;
  place_name: string | null;
  locality: string | null;
  address: string | null;
  map_url: string | null;
};

export type SnapshotEvent = {
  event_id: EventId;
  event_kind: EventKind;
  title: string;
  title_hi: string;
  event_date: IsoDate;
  start_time: IsoTime | null;
  end_time: IsoTime | null;
  muhurat_time: IsoTime | null;
  dress_code: string | null;
  description: string | null;
  venue: SnapshotVenue | null;
};

export type PublicationSnapshot = {
  wedding: { bride_name: string; groom_name: string; city: string | null; wedding_date: IsoDate };
  invite_style: Omit<InviteStyleDto, "seed_key">;
  events: SnapshotEvent[];
};

export type ChangeEntity = "wedding" | "event" | "venue" | "invite_style";

/** One item of `publications.changes` (5.3): `{entity, entity_id, field, from, to}`. */
export type SnapshotChange = {
  entity: ChangeEntity;
  entity_id: string;
  field: string;
  from: JsonPrimitive;
  to: JsonPrimitive;
};

export type PublicationDto = {
  publication_id: PublicationId;
  seed_key: SeedKey | null;
  revision: number;
  snapshot: PublicationSnapshot;
  draft_version: number;
  changes: SnapshotChange[];
  note: string | null;
  published_by_member_id: MemberId;
  published_by_label: string;
  published_at: IsoInstant;
};

// ---------------------------------------------------------------------------
// The guest view (domain 4.6): an allowlist. No money, no counts, no seed_key (D127).
// ---------------------------------------------------------------------------

export type GuestViewVenue = {
  name: string;
  place_name: string | null;
  locality: string | null;
  address: string | null;
  map_url: string | null;
};

export type GuestViewResponse = {
  guest_id: GuestId;
  rsvp_status: RsvpStatus;
  plus_ones: number;
  max_plus_ones: number;
};

export type GuestViewFunction = {
  event_id: EventId;
  event_kind: EventKind;
  title: string;
  title_hi: string;
  starts_at: IsoInstant | null;
  ends_at: IsoInstant | null;
  muhurat_at: IsoInstant | null;
  dress_code: string | null;
  description: string | null;
  venue: GuestViewVenue | null;
  responses: GuestViewResponse[];
};

export type GuestInvitationView = {
  revision: number;
  wedding: {
    bride_name: string;
    groom_name: string;
    city: string | null;
    wedding_date: IsoDate;
    heading_hi: string;
    wording_en: string | null;
    wording_hi: string | null;
    blessing_line: string | null;
    theme: InviteTheme;
    typeface: InviteTypeface;
    layout: InviteLayout;
    photo_frame: PhotoFrame;
    /** Signed for 1 hour; absent when there is no published photo. */
    photo_url?: string;
  };
  household: {
    name: string;
    guests: { guest_id: GuestId; full_name: string; dietary_note: string | null }[];
  };
  functions: GuestViewFunction[];
};

/** Every key of T, at any depth (arrays included). */
type DeepKeys<T> = T extends readonly (infer U)[]
  ? DeepKeys<U>
  : T extends object
    ? { [K in keyof T & string]: K | DeepKeys<T[K]> }[keyof T & string]
    : never;

/** The `_inr` keys of T at any depth; `never` when it has none. */
export type MoneyKeys<T> = Extract<DeepKeys<T>, `${string}_inr`>;

/** Compile-time G3 check: this line stops compiling if the guest view gains a money field. */
export const GUEST_VIEW_HAS_NO_MONEY_FIELDS: [MoneyKeys<GuestInvitationView>] extends [never] ? true : never = true;
