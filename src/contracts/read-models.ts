/**
 * Read models (domain-and-data §4, with D99 and D127): the name, parameters and result
 * type of each one. They are the only way numbers reach a screen or a spoken reply (M8).
 *
 * Conventions: money is integer `_inr`; instants are ISO 8601 with the IST offset; dates
 * are `YYYY-MM-DD`. A block the actor may not see is left out and named in `hidden`.
 * Every member read model returns `version`, and every row it returns carries `seed_key`
 * (null for live rows). The guest view and the ops view keep fixed field lists (D127).
 *
 * `team` (4.11) and the household link fields of `rsvp_guest_list` (4.4: `link_status`,
 * `last_rotated_at`) came in lane-lead-contracts-2 (D99, D109), matching what Lane A returns.
 */
import type {
  ActivityEntryId,
  ActorType,
  BudgetCategory,
  ChangeEntity,
  CommandSource,
  CommitmentId,
  CommitmentPricing,
  CommitmentUnit,
  DueState,
  EntityType,
  EstimateDirection,
  EventId,
  EventKind,
  ExportFormat,
  ExportTrigger,
  GuestId,
  GuestInvitationView,
  HouseholdId,
  IsoDate,
  IsoInstant,
  IsoTime,
  JsonObject,
  JsonPrimitive,
  MemberId,
  MemberInviteId,
  MemberRole,
  PaymentId,
  PaymentKind,
  PaymentMethod,
  ProposalId,
  ProposalStatus,
  QuoteId,
  QuoteStatus,
  RequirementId,
  RsvpStatus,
  SeedKey,
  ShagunEntryId,
  SharingSettings,
  SnapshotEvent,
  VendorId,
  VendorStatus,
  VenueId,
  VoiceTurnId,
  WeddingId,
} from "./domain";
import type { ExportErrorCode, ExportJobStatus, ExportRenderer } from "./jobs";

export type { GuestInvitationView } from "./domain";

/** Names a block left out for this reader ("Not shared with you"). */
export type HiddenBlock =
  | "budget"
  | "money"
  | "dues"
  | "vendor_money"
  | "estimate"
  | "guest_contacts"
  | "proposals"
  | "shagun";

/** Every member read model carries these. */
export type MemberReadModelBase = {
  /** `weddings.version` when the model was read (the poll cursor, 5.6). */
  version: number;
  hidden: HiddenBlock[];
};

// ---------------------------------------------------------------------------
// 4.11 wedding_profile (D99)
// ---------------------------------------------------------------------------

export type WeddingProfile = MemberReadModelBase & {
  wedding_id: WeddingId;
  seed_key: SeedKey | null;
  /** "Mira & Kabir", from `bride_name` and `groom_name`. */
  display_name: string;
  bride_name: string;
  groom_name: string;
  wedding_date: IsoDate;
  /** Null until a function exists. */
  first_event_date: IsoDate | null;
  last_event_date: IsoDate | null;
  city: string | null;
  /** Owners, and managers with `managers_can_see_budget`; otherwise left out and `budget` is in `hidden`. */
  budget_inr?: number;
  is_sample: boolean;
  /** The current member. */
  member: { member_id: MemberId; role: MemberRole; display_name: string };
};

// ---------------------------------------------------------------------------
// 4.11 team (D99, D109): owners only; a manager gets 403 `forbidden`
// ---------------------------------------------------------------------------

/** One active member (no `removed_at`): owners first, then by when they joined. */
export type TeamMember = {
  member_id: MemberId;
  seed_key: SeedKey | null;
  display_name: string;
  role: MemberRole;
  /** When the membership began (the `members` row's `created_at`). */
  joined_at: IsoInstant;
  /** True for the reader's own row, so the sheet can leave out "Remove" on it. */
  is_you: boolean;
};

/** One pending invite: not accepted, not revoked and not yet expired at read time. */
export type TeamPendingInvite = {
  member_invite_id: MemberInviteId;
  seed_key: SeedKey | null;
  email: string;
  role: MemberRole;
  display_name: string | null;
  invited_at: IsoInstant;
  expires_at: IsoInstant;
};

/** Lane B's "Team and sharing" sheet. */
export type TeamView = MemberReadModelBase & {
  wedding_id: WeddingId;
  members: TeamMember[];
  pending_invites: TeamPendingInvite[];
  /** The three `managers_can_see_*` flags (G7). */
  sharing: SharingSettings;
};

// ---------------------------------------------------------------------------
// 4.3 itinerary (D99, D127)
// ---------------------------------------------------------------------------

export type ItineraryVenueRef = {
  venue_id: VenueId;
  name: string;
  place_name: string | null;
  locality: string | null;
  address: string | null;
  capacity: number | null;
  map_url: string | null;
};

/** D127: id and label only (plus `seed_key`). `label` is the text plus " for {quantity}". */
export type ItineraryRequirement = {
  requirement_id: RequirementId;
  seed_key: SeedKey | null;
  label: string;
};

export type ItineraryFunction = {
  event_id: EventId;
  seed_key: SeedKey | null;
  event_kind: EventKind;
  title: string;
  title_hi: string;
  event_date: IsoDate;
  start_time: IsoTime | null;
  end_time: IsoTime | null;
  muhurat_time: IsoTime | null;
  starts_at: IsoInstant | null;
  ends_at: IsoInstant | null;
  muhurat_at: IsoInstant | null;
  venue_id: VenueId | null;
  venue: ItineraryVenueRef | null;
  dress_code: string | null;
  description: string | null;
  lead_name: string | null;
  expected_headcount: number | null;
  /** For `update_event`'s `expected_version`. */
  version: number;
  /** The same function in the latest snapshot; absent if never published. */
  published?: SnapshotEvent;
  requirements: ItineraryRequirement[];
};

/** D127: every venue, for the picker and the voice snapshot. */
export type ItineraryVenue = {
  venue_id: VenueId;
  seed_key: SeedKey | null;
  name: string;
  place_name: string | null;
  capacity: number | null;
};

/** P8: one item per differing field. At D2: the reception venue, Banyan Hall → Lotus Hall, by Diya. */
export type UnpublishedChange = {
  entity: ChangeEntity;
  entity_id: string;
  field: string;
  published_value: JsonPrimitive;
  draft_value: JsonPrimitive;
  /** The actor label of the latest activity entry for that field. */
  changed_by: string | null;
  changed_at: IsoInstant | null;
};

export type ItineraryConflict =
  | {
      kind: "overlap";
      event_ids: EventId[];
      overlap_minutes: number;
      /** "The Mehendi ends at 19:30 but the Sangeet starts at 19:00: 30 minutes overlap." */
      text: string;
    }
  | {
      kind: "over_capacity";
      event_ids: EventId[];
      venue_id: VenueId;
      capacity: number;
      confirmed_headcount: number;
      /** "Banyan Hall seats 220; 229 are attending the reception." */
      text: string;
    };

export type Itinerary = MemberReadModelBase & {
  functions: ItineraryFunction[];
  venues: ItineraryVenue[];
  unpublished_changes: UnpublishedChange[];
  conflicts: ItineraryConflict[];
  draft_version: number;
  published_revision: number | null;
  published_at: IsoInstant | null;
  /** The publisher's display name. */
  published_by: string | null;
};

// ---------------------------------------------------------------------------
// 4.4 rsvp_totals and rsvp_guest_list
// ---------------------------------------------------------------------------

export type RsvpCounts = {
  invited: number;
  attending: number;
  declined: number;
  pending: number;
  /** Sum over attending invitations of 1 + plus_ones (R4). */
  confirmed_headcount: number;
};

export type RsvpTotalsRow = RsvpCounts & {
  event_id: EventId;
  seed_key: SeedKey | null;
  event_kind: EventKind;
  title: string;
  title_hi: string;
  starts_at: IsoInstant | null;
  named: RsvpCounts;
  synthetic: RsvpCounts;
  /** The planning field, never mixed into the counts (E7). */
  expected_headcount: number | null;
};

export type RsvpTotals = MemberReadModelBase & {
  /** Per active function, ordered by start. */
  functions: RsvpTotalsRow[];
};

export type RsvpGuestRow = {
  guest_id: GuestId;
  seed_key: SeedKey | null;
  full_name: string;
  household_id: HouseholdId;
  household_name: string;
  group_label: string | null;
  rsvp_status: RsvpStatus;
  plus_ones: number;
  max_plus_ones: number;
  dietary_note: string | null;
  /** Owners, and managers with `managers_can_see_guest_contacts`; otherwise left out. */
  phone?: string | null;
  email?: string | null;
};

export type RsvpGuestListFunction = {
  event_id: EventId;
  seed_key: SeedKey | null;
  title: string;
  title_hi: string;
  starts_at: IsoInstant | null;
  /** Named guests only. */
  guests: RsvpGuestRow[];
  /** The synthetic guests, collapsed: "210 imported guests (synthetic placeholders)". */
  synthetic: (RsvpCounts & { label: string }) | null;
};

/** A household's guest link (4.4, D109): never rotated, live, or turned off. */
export type HouseholdLinkStatus = "none" | "active" | "revoked";

export type RsvpHouseholdGuest = {
  guest_id: GuestId;
  seed_key: SeedKey | null;
  full_name: string;
  group_label: string | null;
  dietary_note: string | null;
  /** Owners, and managers with `managers_can_see_guest_contacts`; otherwise left out. */
  phone?: string | null;
  email?: string | null;
};

export type RsvpGuestListHousehold = {
  household_id: HouseholdId;
  seed_key: SeedKey | null;
  name: string;
  relation: string | null;
  is_synthetic: boolean;
  guest_count: number;
  guests: RsvpHouseholdGuest[];
  link_status: HouseholdLinkStatus;
  /** Null if the household's link was never rotated. */
  last_rotated_at: IsoInstant | null;
};

export type RsvpGuestList = MemberReadModelBase & {
  functions: RsvpGuestListFunction[];
  /**
   * Every household with its link fields (4.4, D109), for the guest screens' link controls.
   * Optional until every implementation returns it; a reader treats a missing list as empty.
   */
  households?: RsvpGuestListHousehold[];
};

// ---------------------------------------------------------------------------
// 4.2 money_summary and vendor_ledger
// ---------------------------------------------------------------------------

/** M4 figures. */
export type VendorMoneyFigures = {
  committed_inr: number;
  paid_inr: number;
  outstanding_inr: number;
  overpaid_inr: number;
};

export type MoneySummaryVendorRow = VendorMoneyFigures & {
  vendor_id: VendorId;
  seed_key: SeedKey | null;
  name: string;
  vendor_category: BudgetCategory;
  is_one_off: boolean;
  status: VendorStatus;
  /** Earliest `due_on` among active commitments, while something is outstanding. */
  next_due_on: IsoDate | null;
  /** Whole IST calendar days from today to `next_due_on`; null without a due date (D99). */
  days_until_due: number | null;
  due_state: DueState;
  /** Never added to the figures above (A5). */
  pending_proposals_inr: number;
};

export type MoneyTotals = {
  total_committed_inr: number;
  total_paid_inr: number;
  total_outstanding_inr: number;
  total_overpaid_inr: number;
  budget_inr: number;
  uncommitted_inr: number;
  over_budget_inr: number;
  unallocated_inr: number;
  pending_proposals_inr: number;
  if_approved_committed_inr: number;
};

export type BudgetCategoryLine = {
  budget_category: BudgetCategory;
  seed_key: SeedKey | null;
  label: string;
  label_hi: string;
  has_line: boolean;
  /** Null when the category has no line; then uncommitted and over-budget are 0 (M6). */
  planned_inr: number | null;
  committed_inr: number;
  paid_inr: number;
  outstanding_inr: number;
  uncommitted_inr: number;
  over_budget_inr: number;
  pending_proposals_inr: number;
};

export type MoneySummary = MemberReadModelBase & {
  /** Managers: only with `managers_can_see_vendor_dues` (else `vendor_money` in `hidden`). */
  vendors?: MoneySummaryVendorRow[];
  /** Managers: only with `managers_can_see_budget` (else `budget` in `hidden`). */
  totals?: MoneyTotals;
  /** In the order of 5.2. Same visibility as `totals`. */
  categories?: BudgetCategoryLine[];
};

export type QuoteView = {
  quote_id: QuoteId;
  seed_key: SeedKey | null;
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

export type CommitmentView = {
  commitment_id: CommitmentId;
  seed_key: SeedKey | null;
  quote_id: QuoteId | null;
  /** The current version's number, for `expected_version`. */
  version_no: number;
  version_count: number;
  pricing: CommitmentPricing;
  unit: CommitmentUnit | null;
  unit_price_inr: number | null;
  quantity: number | null;
  amount_inr: number;
  event_id: EventId | null;
  description: string | null;
  agreed_on: IsoDate | null;
  due_on: IsoDate | null;
  /** Per-unit only: "250 plates × ₹800 = ₹2,00,000". */
  formula_text: string | null;
  voided: boolean;
  void_reason: string | null;
};

export type PaymentView = {
  payment_id: PaymentId;
  seed_key: SeedKey | null;
  commitment_id: CommitmentId | null;
  payment_kind: PaymentKind;
  /** The current version's number, for `expected_version`. */
  version_no: number;
  version_count: number;
  amount_inr: number;
  /** Null shows "Date not given". */
  paid_on: IsoDate | null;
  method: PaymentMethod | null;
  note: string | null;
  /** The amount of the version before the current one, when it differs (the struck-through value, C7). */
  previous_amount_inr: number | null;
  corrected_by: string | null;
  corrected_at: IsoInstant | null;
  voided: boolean;
  void_reason: string | null;
};

export type LedgerHistoryEntry = {
  entity: "commitment" | "payment";
  entity_id: string;
  /** `PAY-01/v1`. */
  seed_key: SeedKey | null;
  version_no: number;
  values: {
    amount_inr: number;
    pricing?: CommitmentPricing;
    unit?: CommitmentUnit | null;
    unit_price_inr?: number | null;
    quantity?: number | null;
    paid_on?: IsoDate | null;
    method?: PaymentMethod | null;
    note?: string | null;
    due_on?: IsoDate | null;
  };
  change_reason: string | null;
  /** Actor label. */
  by: string | null;
  at: IsoInstant;
  source: CommandSource;
  spoken_text: string | null;
};

export type VendorLedger = MemberReadModelBase & {
  vendor: {
    vendor_id: VendorId;
    seed_key: SeedKey | null;
    name: string;
    vendor_category: BudgetCategory;
    status: VendorStatus;
    is_one_off: boolean;
    contact_name: string | null;
    contact_phone: string | null;
    notes: string | null;
    functions: { event_id: EventId; title: string; title_hi: string }[];
  };
  /** The money blocks below need `managers_can_see_vendor_dues` for a manager. */
  figures?: VendorMoneyFigures;
  quotes?: QuoteView[];
  commitments?: CommitmentView[];
  payments?: PaymentView[];
  /** Every version of every commitment and payment, oldest first. */
  history?: LedgerHistoryEntry[];
  estimate?: CateringEstimateRow[];
};

// ---------------------------------------------------------------------------
// 4.5 catering_estimate
// ---------------------------------------------------------------------------

export type CateringEstimateRow = {
  commitment_id: CommitmentId;
  seed_key: SeedKey | null;
  vendor_id: VendorId;
  vendor_name: string;
  event_id: EventId;
  event_title: string;
  unit: CommitmentUnit;
  unit_price_inr: number;
  contract_amount_inr: number;
  contract_quantity: number;
  expected_headcount: number | null;
  confirmed_headcount: number;
  /** confirmed_headcount × unit_price_inr (E2). Never stored, never totalled. */
  estimate_inr: number;
  difference_inr: number;
  direction: EstimateDirection;
  /** "229 attending × ₹800". */
  formula_text: string;
  /** "Estimate, not the contract". */
  label: string;
  label_hi: string;
};

export type CateringEstimate = MemberReadModelBase & {
  /** Visibility as vendor money (`estimate` in `hidden` otherwise). */
  rows?: CateringEstimateRow[];
};

// ---------------------------------------------------------------------------
// 4.7 activity_feed
// ---------------------------------------------------------------------------

export type ActivityFeedEntry = {
  id: ActivityEntryId;
  seed_key: SeedKey | null;
  seq: number;
  occurred_at: IsoInstant;
  actor_type: ActorType;
  actor_label: string;
  command: string;
  topic: string;
  entity_type: EntityType;
  entity_id: string;
  summary_en: string;
  summary_hi: string;
  before: JsonObject | null;
  after: JsonObject | null;
  source: CommandSource;
  voice_turn_id: VoiceTurnId | null;
  spoken_text: string | null;
  proposal_id: ProposalId | null;
  /** A draft edit made after the latest publish: "Draft. Guests still see Banyan Hall." */
  awaiting_publish: boolean;
};

export type ActivityFeedParams = {
  before_seq?: number;
  /** Default 50, at most 200. */
  limit?: number;
  /** An IST date, or `today`. */
  day?: IsoDate | "today";
  actor_member_id?: MemberId;
  topic_prefix?: string;
  entity_id?: string;
};

export type ActivityFeed = MemberReadModelBase & {
  /** `seq` descending. */
  entries: ActivityFeedEntry[];
  /** Pass as `before_seq` for the next page; null at the end. */
  next_before_seq: number | null;
};

// ---------------------------------------------------------------------------
// 4.8 export_job_status (member view; Lane D implements it, D16 and D52)
// ---------------------------------------------------------------------------

export type ExportAttemptLogEntry = {
  attempt_no: number;
  trigger: ExportTrigger;
  status: ExportJobStatus;
  started_at: IsoInstant | null;
  finished_at: IsoInstant | null;
  error_code: ExportErrorCode | null;
  renderer: ExportRenderer | null;
  nudgebee_execution_id: string | null;
  approver: string | null;
  /** Who started it: a member's name, "NudgeBee" or null. */
  started_by: string | null;
};

/** One export job as the exports panel shows it. Normal JSON types (not the ops strings rule). */
export type ExportJobView = {
  job_id: string;
  seed_key: SeedKey | null;
  /** `JOB-EXP-R{revision}-{FORMAT}`. */
  job_label: string;
  export_key: string;
  revision: number;
  format: ExportFormat;
  status: ExportJobStatus;
  /** Queued, Rendering (Retrying from attempt 2), Ready, Failed. */
  label: string;
  /** A drill job: shows "Deliberate drill". */
  synthetic: boolean;
  attempts: number;
  max_attempts: number;
  /** The latest attempt's renderer. */
  renderer: ExportRenderer | null;
  /** "Mira & Kabir, Reception, Monday, 14 December 2026, Lotus Hall". */
  card_summary: string;
  /** The titles behind `card_event_ids`. */
  card_functions: string[];
  last_error: { code: ExportErrorCode; message: string; at: IsoInstant } | null;
  notified_at: IsoInstant | null;
  /** `rendering` past its lease, or `queued` over 60 s: "Stopped responding". */
  stalled: boolean;
  /** Owner, failed or stalled, attempts left, revision current. */
  can_retry: boolean;
  /** Older than `published_revision`: "Out of date. Export a new card." (P9). */
  out_of_date: boolean;
  /** Signed for 10 minutes, download name `jashn-card-rev{n}.png`; only when succeeded. */
  download_url: string | null;
  created_at: IsoInstant;
  updated_at: IsoInstant;
  attempt_log: ExportAttemptLogEntry[];
};

export type ExportJobStatusModel = MemberReadModelBase & {
  /** Newest revision first. */
  jobs: ExportJobView[];
  published_revision: number | null;
};

// ---------------------------------------------------------------------------
// 4.10 proposals and shagun_register
// ---------------------------------------------------------------------------

export type ProposalView = {
  proposal_id: ProposalId;
  seed_key: SeedKey | null;
  command: string;
  summary_en: string;
  summary_hi: string;
  committed_delta_inr: number;
  paid_delta_inr: number;
  status: ProposalStatus;
  /** Display names. */
  proposed_by: string;
  proposed_at: IsoInstant;
  decided_by: string | null;
  decided_at: IsoInstant | null;
  reason: string | null;
  decision_reason: string | null;
};

export type Proposals = MemberReadModelBase & {
  /** Owners see all; a manager only their own (A7). */
  proposals: ProposalView[];
};

export type ShagunRow = {
  shagun_entry_id: ShagunEntryId;
  seed_key: SeedKey | null;
  giver_name: string;
  household_id: HouseholdId | null;
  household_name: string | null;
  amount_inr: number;
  received_on: IsoDate;
  how: string | null;
  note: string | null;
  thank_you: { done: boolean; thanked_at: IsoInstant | null; thanked_note: string | null };
};

export type ShagunRegister = MemberReadModelBase & {
  entries: ShagunRow[];
  total_received_inr: number;
  pending_thank_yous: number;
};

// ---------------------------------------------------------------------------
// 4.1 overview (Should #10)
// ---------------------------------------------------------------------------

export type Overview = MemberReadModelBase & {
  header: {
    bride_name: string;
    groom_name: string;
    display_name: string;
    city: string | null;
    wedding_date: IsoDate;
    first_starts_at: IsoInstant | null;
    last_ends_at: IsoInstant | null;
    is_sample: boolean;
  };
  next_event: {
    event_id: EventId;
    seed_key: SeedKey | null;
    title: string;
    title_hi: string;
    starts_at: IsoInstant | null;
    venue_name: string | null;
    /** IST calendar days. */
    days_until: number;
  } | null;
  decisions: {
    /** Owners only (`proposals` in `hidden` for managers). */
    pending_proposals?: { count: number; items: ProposalView[] };
    unpublished_changes_count: number;
    conflicts: ItineraryConflict[];
  };
  /** Owners; managers with `managers_can_see_budget`. */
  money?: MoneyTotals;
  /** Owners; managers with `managers_can_see_vendor_dues`. Vendors with `due_state` overdue or due_soon. */
  dues?: MoneySummaryVendorRow[];
  rsvp: RsvpTotalsRow[];
  /** The first 5 feed entries for today, with L5 visibility. */
  activity_today: ActivityFeedEntry[];
};

// ---------------------------------------------------------------------------
// The registry
// ---------------------------------------------------------------------------

/** Parameters for read models that take none. */
export type NoParams = Record<string, never>;

export type ReadModelMap = {
  wedding_profile: { params: NoParams; result: WeddingProfile };
  team: { params: NoParams; result: TeamView };
  overview: { params: NoParams; result: Overview };
  money_summary: { params: NoParams; result: MoneySummary };
  vendor_ledger: { params: { vendor_id: VendorId }; result: VendorLedger };
  itinerary: { params: NoParams; result: Itinerary };
  rsvp_totals: { params: { event_id?: EventId }; result: RsvpTotals };
  rsvp_guest_list: { params: { event_id?: EventId }; result: RsvpGuestList };
  catering_estimate: { params: { vendor_id?: VendorId; event_id?: EventId }; result: CateringEstimate };
  activity_feed: { params: ActivityFeedParams; result: ActivityFeed };
  export_job_status: { params: { job_id?: string }; result: ExportJobStatusModel };
  proposals: { params: { status?: ProposalStatus }; result: Proposals };
  shagun_register: { params: { thanked?: boolean }; result: ShagunRegister };
};

/** The member read models. The guest view (`guest_invitation_view`) has its own entry point. */
export type ReadModelName = keyof ReadModelMap;
export type ReadModelParams<N extends ReadModelName> = ReadModelMap[N]["params"];
export type ReadModelResult<N extends ReadModelName> = ReadModelMap[N]["result"];

export const READ_MODEL_NAMES = [
  "wedding_profile",
  "team",
  "overview",
  "money_summary",
  "vendor_ledger",
  "itinerary",
  "rsvp_totals",
  "rsvp_guest_list",
  "catering_estimate",
  "activity_feed",
  "export_job_status",
  "proposals",
  "shagun_register",
] as const satisfies readonly ReadModelName[];

/** The guest read model (4.6) and its poll (`GET /api/i/{token}/revision`). */
export type GuestReadModels = {
  guest_invitation_view: GuestInvitationView;
};
