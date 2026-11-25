/**
 * The interface every lane calls (architecture 4.3): the dispatcher, every read model, the
 * guest view and upload signing, with a fixture implementation built on `fixtures.ts`.
 * Lane A's `src/server/services/index.ts` exports `fixtureServices` until it switches to
 * the real implementation (target 10:45); lanes never write their own command wrappers (D98).
 *
 * Also here: the handler and after-commit types (D53, D101), and the typed signatures of
 * Lane A's 11:40 items (D102): the Storage adapter and signing helpers, the guest token
 * resolver, the system verifier, the rate limiter, `reset_demo` and A4 (`update_event`
 * and the itinerary read model), so Lane D builds against them from 10:00.
 *
 * The fixture services never mutate the fixtures: a command is validated, checked against
 * the role matrix and answered as if it had applied. Voice writes are refused (D47).
 */
import { SAMPLE_COPIES, seededId, uuidV5, type SampleCopy } from "../db/ids";
import type { UploadSignRequest, UploadSignResponse } from "./api";
import {
  COMMAND_ERROR_HTTP_STATUS,
  COMMAND_OUTCOME_HTTP_STATUS,
  CommandFailure,
  commandSchemas,
  validationMessageFor,
  type ActivityTopic,
  type CommandEnvelope,
  type CommandErrorBody,
  type CommandName,
  type CommandOutcome,
  type CommandResponse,
  type CommandResult,
  type CommandSuccess,
  type CommandWarning,
  type ParsedCommandInput,
  type VendorTotals,
} from "./commands";
import {
  BUDGET_CATEGORIES,
  BUDGET_CATEGORY_LABELS,
  type ActivityEntryId,
  type ActivityVisibility,
  type AssetDto,
  type CommandActor,
  type EntityType,
  type EventDto,
  type GuestActor,
  type GuestInvitationView,
  type IsoDate,
  type IsoInstant,
  type JsonObject,
  type JsonPrimitive,
  type MemberRole,
  type ProposalId,
  type SessionActor,
  type SharingSettings,
  type SnapshotEvent,
  type SystemActor,
  type WeddingId,
} from "./domain";
import { getDemoFixture, type DemoFixture } from "./fixtures";
import { exportJobLabel, exportKey, jobLabel, MAX_ATTEMPTS, type ExportJobStatus } from "./jobs";
import { formatInr, formatPerUnitFormula } from "./money";
import { GUEST_COMMANDS, READ_MODEL_PERMISSIONS, SYSTEM_COMMANDS, managerSeesBlock, memberCommandDecision } from "./permissions";
import type {
  ActivityFeed,
  ActivityFeedEntry,
  ActivityFeedParams,
  BudgetCategoryLine,
  CateringEstimate,
  CateringEstimateRow,
  CommitmentView,
  ExportJobStatusModel,
  ExportJobView,
  HiddenBlock,
  Itinerary,
  ItineraryConflict,
  ItineraryFunction,
  LedgerHistoryEntry,
  MoneySummary,
  MoneySummaryVendorRow,
  MoneyTotals,
  Overview,
  PaymentView,
  Proposals,
  ProposalView,
  ReadModelName,
  ReadModelParams,
  ReadModelResult,
  RsvpCounts,
  RsvpGuestList,
  RsvpTotals,
  RsvpTotalsRow,
  ShagunRegister,
  UnpublishedChange,
  VendorLedger,
  WeddingProfile,
} from "./read-models";

// ---------------------------------------------------------------------------
// The Services interface
// ---------------------------------------------------------------------------

/** A member read: the actor (from the session helper), the wedding and the model's params. */
export type ReadRequest<N extends ReadModelName> = {
  actor: SessionActor;
  wedding_id: WeddingId;
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- `{} extends P` asks whether every param is optional
} & ({} extends ReadModelParams<N> ? { params?: ReadModelParams<N> } : { params: ReadModelParams<N> });

export interface Services {
  /**
   * Runs one command through the dispatcher (domain 3.0) and returns the response envelope.
   * The HTTP status is `httpStatusOf(response)`. Never throws for a command error.
   */
  dispatch<C extends CommandName>(actor: CommandActor, envelope: CommandEnvelope<C>): Promise<CommandResponse<C>>;
  /**
   * Builds one member read model with the actor's role filtering (domain 4, 6.1). Throws a
   * `CommandFailure` (`forbidden`, `not_found`) when the actor may not read it at all.
   */
  read<N extends ReadModelName>(name: N, request: ReadRequest<N>): Promise<ReadModelResult<N>>;
  /** The guest view for a link token (4.6); null for an unknown, malformed or revoked token (G5). */
  guestInvitationView(token: string): Promise<GuestInvitationView | null>;
  /** The guest poll's number; null when the token doesn't resolve (the route answers 404). */
  guestRevision(token: string): Promise<number | null>;
  /** `POST /api/uploads/sign`: a signed upload URL for a couple photo (members). */
  signUpload(actor: SessionActor, request: UploadSignRequest): Promise<UploadSignResponse>;
}

/** The HTTP status for a response envelope (domain 3.0). */
export function httpStatusOf(response: CommandResponse): number {
  return response.ok ? COMMAND_OUTCOME_HTTP_STATUS[response.outcome] : COMMAND_ERROR_HTTP_STATUS[response.error.code];
}

// ---------------------------------------------------------------------------
// Command handlers (Lane A's registry; Lane D's handler map in src/server/invite/handlers.ts)
// ---------------------------------------------------------------------------

/** A finished activity entry a handler returns; the dispatcher writes it in the transaction (L1). */
export type ActivityEntryDraft = {
  topic: ActivityTopic;
  entity_type: EntityType;
  entity_id: string;
  summary_en: string;
  summary_hi: string;
  /** Changed fields only; money as integers (L2). */
  before: JsonObject | null;
  after: JsonObject | null;
  visibility: ActivityVisibility;
  proposal_id?: ProposalId | null;
  /** Overrides the actor's label ("NudgeBee"). */
  actor_label?: string;
};

/** What the dispatcher hands a handler after the guard, validation and the receipt check. */
export type CommandHandlerContext<C extends CommandName = CommandName, Tx = unknown> = {
  command: C;
  actor: CommandActor;
  /** Null only for the `set_wedding_profile` create and `accept_member_invite`. */
  wedding_id: WeddingId | null;
  /** Parsed with `commandSchemas[command]`. */
  input: ParsedCommandInput<C>;
  envelope: CommandEnvelope<C>;
  /** The open transaction (Drizzle's, in Lane A's implementation). */
  tx: Tx;
  /** The instant the dispatcher stamps on everything this command writes. */
  now: IsoInstant;
};

export type CommandHandlerResult<C extends CommandName = CommandName> = {
  /** Default `applied`. `unchanged` writes no activity and moves no version. */
  outcome?: Extract<CommandOutcome, "applied" | "unchanged">;
  result: CommandResult<C>;
  /** Null only for `unchanged` and `reset_demo` (the one exception to L1). */
  activity: ActivityEntryDraft | null;
  warnings?: CommandWarning[];
  /** True for a draft edit: the dispatcher also bumps `draft_version` (P1). */
  bumps_draft_version?: boolean;
};

/**
 * One command's handler. Throws `CommandFailure` to roll back. Method syntax keeps the
 * parameter bivariant, so a handler for one command fits `HandlerMap`.
 */
export type CommandHandler<C extends CommandName = CommandName, Tx = unknown> = {
  handle(context: CommandHandlerContext<C, Tx>): Promise<CommandHandlerResult<C>>;
}["handle"];

/** The handler registry's shape (Lane D's starts empty). */
export type HandlerMap = Partial<Record<CommandName, CommandHandler>>;

/** What an after-commit handler receives: the committed command and its answer (D53). */
export type AfterCommitContext<C extends CommandName = CommandName> = {
  command: C;
  actor: CommandActor;
  wedding_id: WeddingId | null;
  envelope: CommandEnvelope<C>;
  /** The success envelope the dispatcher is about to return. */
  response: CommandSuccess<C>;
};

/**
 * Work after the commit, run by the dispatcher in `after()` for `applied` and `proposed`
 * outcomes only (never a replay). It must not throw; Lane D's export kick lives here (D101).
 */
export type AfterCommitHandler<C extends CommandName = CommandName> = {
  run(context: AfterCommitContext<C>): Promise<void>;
}["run"];

/** The static after-commit map in `src/server/jobs/after-commit.ts`, shipped empty (D101). */
export type AfterCommitMap = Partial<Record<CommandName, AfterCommitHandler>>;

/** A4 and `reset_demo` (D102). */
export type UpdateEventHandler<Tx = unknown> = CommandHandler<"update_event", Tx>;
export type ResetDemoHandler<Tx = unknown> = CommandHandler<"reset_demo", Tx>;

// ---------------------------------------------------------------------------
// Lane A's 11:40 items (D102): signatures Lane D builds against
// ---------------------------------------------------------------------------

export const STORAGE_BUCKETS = { uploads: "uploads", exports: "exports" } as const;
export type StorageBucket = (typeof STORAGE_BUCKETS)[keyof typeof STORAGE_BUCKETS];

/** Member download URLs live 10 minutes; the guest's couple photo 1 hour (domain 5.5). */
export const MEMBER_SIGNED_URL_TTL_S = 600;
export const GUEST_PHOTO_URL_TTL_S = 3_600;

/** The Storage adapter in `src/server/storage/` (service role, server only). Keys never include the bucket. */
export interface StorageAdapter {
  /** Upsert by default; the export worker overwrites the fixed key. */
  upload(
    bucket: StorageBucket,
    object_key: string,
    body: Uint8Array,
    options: { content_type: string; upsert?: boolean },
  ): Promise<{ object_key: string; bytes: number }>;
  /** Null when the object doesn't exist. */
  stat(bucket: StorageBucket, object_key: string): Promise<{ bytes: number; content_type: string | null; updated_at: IsoInstant | null } | null>;
  download(bucket: StorageBucket, object_key: string): Promise<Uint8Array | null>;
  signedDownloadUrl(
    bucket: StorageBucket,
    object_key: string,
    options: { expires_in_s: number; download_name?: string },
  ): Promise<string>;
  /** Signed upload URLs are valid for 2 hours; only bucket `uploads` takes browser uploads. */
  signedUploadUrl(bucket: "uploads", object_key: string): Promise<{ signed_url: string; token: string; expires_at: IsoInstant }>;
  remove(bucket: StorageBucket, object_keys: string[]): Promise<void>;
}

/** The signing helpers built on the adapter. */
export interface SigningHelpers {
  /** `{wedding_id}/card-rev{n}.png` in `exports`, 10 minutes, download name `jashn-card-rev{n}.png`. */
  exportDownloadUrl(job: { wedding_id: WeddingId; revision: number; format: "png" }): Promise<string>;
  /** The couple photo: 10 minutes for members, 1 hour inside the guest view. */
  couplePhotoUrl(asset: AssetDto, audience: "member" | "guest"): Promise<string | null>;
}

/** Resolves a raw guest-link token (architecture 3.4); null for unknown, malformed or revoked (same 404). */
export type GuestTokenResolver = (token: string) => Promise<GuestActor | null>;

/**
 * Checks `Authorization: Bearer <JOBS_API_TOKEN>` in constant time (hash both, compare
 * digests). Null when missing, wrong or the env var is unset. Never logs the token.
 */
export type SystemVerifier = (authorization_header: string | null) => Promise<SystemActor | null>;

/** The one rate limiter (D57, D108): per token hash about 120 GETs and 30 POSTs a minute, 600 per IP. */
export type RateLimiter = (
  key: string,
  kind: "get" | "post",
) => Promise<{ allowed: true } | { allowed: false; retry_after_s: number }>;

/** The helpers Lane D's job module uses for transitions outside the dispatcher (architecture 3.3). */
export type BumpVersion<Tx = unknown> = (tx: Tx, wedding_id: WeddingId) => Promise<number>;
export type AppendActivity<Tx = unknown> = (
  tx: Tx,
  entry: ActivityEntryDraft & { wedding_id: WeddingId; actor: CommandActor; command: string; occurred_at: IsoInstant },
) => Promise<ActivityEntryId>;

// ---------------------------------------------------------------------------
// Fixture implementation
// ---------------------------------------------------------------------------

const ist = (date: IsoDate, time: string | null): IsoInstant | null => (time ? `${date}T${time}:00+05:30` : null);

function failure(body: CommandErrorBody): CommandFailure {
  return new CommandFailure(body);
}

function fixtureForWedding(wedding_id: WeddingId | null | undefined): DemoFixture | null {
  if (!wedding_id) return null;
  for (const copy of SAMPLE_COPIES) {
    if (seededId(copy, "weddings", "WEDDING") === wedding_id) return getDemoFixture(copy);
  }
  return null;
}

function fixtureForToken(token: string): { fixture: DemoFixture; household_key: string } | null {
  for (const copy of SAMPLE_COPIES) {
    const fixture = getDemoFixture(copy as SampleCopy);
    for (const [household_key, value] of Object.entries(fixture.guest_tokens)) {
      if (value === token) return { fixture, household_key };
    }
    // Only the demo copy carries a fixture token; skip building the other copies.
    if (copy === "demo") break;
  }
  return null;
}

function sharingOf(fixture: DemoFixture): SharingSettings {
  return {
    managers_can_see_vendor_dues: fixture.wedding.managers_can_see_vendor_dues,
    managers_can_see_budget: fixture.wedding.managers_can_see_budget,
    managers_can_see_guest_contacts: fixture.wedding.managers_can_see_guest_contacts,
  };
}

/** Whole IST calendar days from `from` to `to` (both YYYY-MM-DD). */
function daysBetween(from: IsoDate, to: IsoDate): number {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

function sortedEvents(fixture: DemoFixture): EventDto[] {
  return [...fixture.events].sort(
    (a, b) => a.event_date.localeCompare(b.event_date) || (a.start_time ?? "").localeCompare(b.start_time ?? "") || a.sort_order - b.sort_order,
  );
}

function latestPublication(fixture: DemoFixture) {
  return [...fixture.publications].sort((a, b) => b.revision - a.revision)[0] ?? null;
}

function memberLabel(fixture: DemoFixture, member_id: string | null): string | null {
  if (!member_id) return null;
  return fixture.members.find((member) => member.member_id === member_id)?.display_name ?? null;
}

/** RSVP counts for one function, split named / synthetic (R4: headcount counts plus-ones). */
function rsvpRow(fixture: DemoFixture, event: EventDto): RsvpTotalsRow {
  const empty = (): RsvpCounts => ({ invited: 0, attending: 0, declined: 0, pending: 0, confirmed_headcount: 0 });
  const total = empty();
  const named = empty();
  const synthetic = empty();
  const syntheticGuests = new Set(fixture.guests.filter((guest) => guest.is_synthetic).map((guest) => guest.guest_id));
  for (const invitation of fixture.invitations) {
    if (invitation.event_id !== event.event_id || invitation.revoked_at) continue;
    for (const counts of [total, syntheticGuests.has(invitation.guest_id) ? synthetic : named]) {
      counts.invited += 1;
      counts[invitation.rsvp_status] += 1;
      if (invitation.rsvp_status === "attending") counts.confirmed_headcount += 1 + invitation.plus_ones;
    }
  }
  return {
    ...total,
    event_id: event.event_id,
    seed_key: event.seed_key,
    event_kind: event.event_kind,
    title: event.title,
    title_hi: event.title_hi,
    starts_at: ist(event.event_date, event.start_time),
    named,
    synthetic,
    expected_headcount: event.expected_headcount,
  };
}

type VendorFigures = VendorTotals & { next_due_on: IsoDate | null };

function vendorFigures(fixture: DemoFixture, vendor_id: string): VendorFigures {
  let committed = 0;
  let paid = 0;
  let next_due_on: IsoDate | null = null;
  for (const commitment of fixture.commitments) {
    if (commitment.vendor_id !== vendor_id || commitment.voided_at) continue;
    const current = commitment.versions.find((version) => version.version_no === commitment.current_version_no);
    if (!current) continue;
    committed += current.amount_inr;
    if (current.due_on && (!next_due_on || current.due_on < next_due_on)) next_due_on = current.due_on;
  }
  for (const payment of fixture.payments) {
    if (payment.vendor_id !== vendor_id || payment.voided_at) continue;
    const current = payment.versions.find((version) => version.version_no === payment.current_version_no);
    if (current) paid += current.amount_inr;
  }
  const outstanding = Math.max(0, committed - paid);
  return {
    committed_inr: committed,
    paid_inr: paid,
    outstanding_inr: outstanding,
    overpaid_inr: Math.max(0, paid - committed),
    next_due_on: outstanding > 0 ? next_due_on : null,
  };
}

function vendorRow(fixture: DemoFixture, vendor_id: string): MoneySummaryVendorRow {
  const vendor = fixture.vendors.find((row) => row.vendor_id === vendor_id);
  if (!vendor) throw failure({ code: "not_found", message: "Vendor not found." });
  const figures = vendorFigures(fixture, vendor_id);
  const days = figures.next_due_on ? daysBetween(fixture.today, figures.next_due_on) : null;
  const due_state: MoneySummaryVendorRow["due_state"] =
    days === null ? "none" : days < 0 ? "overdue" : days <= 7 ? "due_soon" : "upcoming";
  const pending = fixture.proposals
    .filter((proposal) => proposal.status === "pending" && proposal.vendor_id === vendor_id)
    .reduce((sum, proposal) => sum + proposal.committed_delta_inr, 0);
  return {
    vendor_id,
    seed_key: vendor.seed_key,
    name: vendor.name,
    vendor_category: vendor.vendor_category,
    is_one_off: vendor.is_one_off,
    status: vendor.status,
    committed_inr: figures.committed_inr,
    paid_inr: figures.paid_inr,
    outstanding_inr: figures.outstanding_inr,
    overpaid_inr: figures.overpaid_inr,
    next_due_on: figures.next_due_on,
    days_until_due: days,
    due_state,
    pending_proposals_inr: pending,
  };
}

function moneyTotals(fixture: DemoFixture, rows: MoneySummaryVendorRow[]): MoneyTotals {
  const committed = rows.reduce((sum, row) => sum + row.committed_inr, 0);
  const paid = rows.reduce((sum, row) => sum + row.paid_inr, 0);
  const pending = fixture.proposals
    .filter((proposal) => proposal.status === "pending")
    .reduce((sum, proposal) => sum + proposal.committed_delta_inr, 0);
  const planned = fixture.budget_lines.reduce((sum, line) => sum + line.planned_inr, 0);
  const budget = fixture.budget_total_inr;
  return {
    total_committed_inr: committed,
    total_paid_inr: paid,
    total_outstanding_inr: rows.reduce((sum, row) => sum + row.outstanding_inr, 0),
    total_overpaid_inr: rows.reduce((sum, row) => sum + row.overpaid_inr, 0),
    budget_inr: budget,
    uncommitted_inr: Math.max(0, budget - committed),
    over_budget_inr: Math.max(0, committed - budget),
    unallocated_inr: Math.max(0, budget - planned),
    pending_proposals_inr: pending,
    if_approved_committed_inr: committed + pending,
  };
}

function categoryLines(fixture: DemoFixture, rows: MoneySummaryVendorRow[]): BudgetCategoryLine[] {
  return BUDGET_CATEGORIES.map((category) => {
    const line = fixture.budget_lines.find((entry) => entry.budget_category === category) ?? null;
    const inCategory = rows.filter((row) => row.vendor_category === category);
    const committed = inCategory.reduce((sum, row) => sum + row.committed_inr, 0);
    const paid = inCategory.reduce((sum, row) => sum + row.paid_inr, 0);
    const planned = line ? line.planned_inr : null;
    return {
      budget_category: category,
      seed_key: line?.seed_key ?? null,
      label: BUDGET_CATEGORY_LABELS[category].en,
      label_hi: BUDGET_CATEGORY_LABELS[category].hi,
      has_line: line !== null,
      planned_inr: planned,
      committed_inr: committed,
      paid_inr: paid,
      outstanding_inr: inCategory.reduce((sum, row) => sum + row.outstanding_inr, 0),
      uncommitted_inr: planned === null ? 0 : Math.max(0, planned - committed),
      over_budget_inr: planned === null ? 0 : Math.max(0, committed - planned),
      pending_proposals_inr: fixture.proposals
        .filter((proposal) => proposal.status === "pending" && proposal.budget_category === category)
        .reduce((sum, proposal) => sum + proposal.committed_delta_inr, 0),
    };
  });
}

type Reader = { role: MemberRole; member_id: string | null; sharing: SharingSettings };

const sees = (reader: Reader, block: HiddenBlock) => reader.role === "owner" || managerSeesBlock(block, reader.sharing);

function buildMoneySummary(fixture: DemoFixture, reader: Reader): MoneySummary {
  const rows = fixture.vendors.map((vendor) => vendorRow(fixture, vendor.vendor_id));
  const hidden: HiddenBlock[] = [];
  const result: MoneySummary = { version: fixture.wedding.version, hidden };
  if (sees(reader, "vendor_money")) result.vendors = rows;
  else hidden.push("vendor_money");
  if (sees(reader, "budget")) {
    result.totals = moneyTotals(fixture, rows);
    result.categories = categoryLines(fixture, rows);
  } else hidden.push("budget");
  return result;
}

function cateringRows(fixture: DemoFixture, filter: { vendor_id?: string; event_id?: string }): CateringEstimateRow[] {
  const rows: CateringEstimateRow[] = [];
  for (const commitment of fixture.commitments) {
    if (commitment.voided_at) continue;
    if (filter.vendor_id && commitment.vendor_id !== filter.vendor_id) continue;
    const current = commitment.versions.find((version) => version.version_no === commitment.current_version_no);
    if (!current || current.pricing !== "per_unit" || !current.event_id || !current.unit) continue;
    if (current.unit !== "plate" && current.unit !== "person") continue;
    if (filter.event_id && current.event_id !== filter.event_id) continue;
    const event = fixture.events.find((row) => row.event_id === current.event_id);
    const vendor = fixture.vendors.find((row) => row.vendor_id === commitment.vendor_id);
    if (!event || !vendor || current.unit_price_inr === null || current.quantity === null) continue;
    const confirmed = rsvpRow(fixture, event).confirmed_headcount;
    const estimate = confirmed * current.unit_price_inr;
    const difference = estimate - current.amount_inr;
    rows.push({
      commitment_id: commitment.commitment_id,
      seed_key: commitment.seed_key,
      vendor_id: vendor.vendor_id,
      vendor_name: vendor.name,
      event_id: event.event_id,
      event_title: event.title,
      unit: current.unit,
      unit_price_inr: current.unit_price_inr,
      contract_amount_inr: current.amount_inr,
      contract_quantity: current.quantity,
      expected_headcount: event.expected_headcount,
      confirmed_headcount: confirmed,
      estimate_inr: estimate,
      difference_inr: difference,
      direction: difference < 0 ? "below" : difference > 0 ? "above" : "equal",
      formula_text: `${confirmed} attending × ${formatInr(current.unit_price_inr)}`,
      label: "Estimate, not the contract",
      label_hi: "अनुमान, अनुबंध नहीं",
    });
  }
  return rows;
}

function buildVendorLedger(fixture: DemoFixture, reader: Reader, vendor_id: string): VendorLedger {
  const vendor = fixture.vendors.find((row) => row.vendor_id === vendor_id);
  if (!vendor) throw failure({ code: "not_found", message: "Vendor not found." });
  const hidden: HiddenBlock[] = [];
  const ledger: VendorLedger = {
    version: fixture.wedding.version,
    hidden,
    vendor: {
      vendor_id: vendor.vendor_id,
      seed_key: vendor.seed_key,
      name: vendor.name,
      vendor_category: vendor.vendor_category,
      status: vendor.status,
      is_one_off: vendor.is_one_off,
      contact_name: vendor.contact_name,
      contact_phone: vendor.contact_phone,
      notes: vendor.notes,
      functions: vendor.event_ids
        .map((event_id) => fixture.events.find((event) => event.event_id === event_id))
        .filter((event): event is EventDto => Boolean(event))
        .map((event) => ({ event_id: event.event_id, title: event.title, title_hi: event.title_hi })),
    },
  };
  if (!sees(reader, "vendor_money")) {
    hidden.push("vendor_money");
    return ledger;
  }
  const { next_due_on: _next, ...figures } = vendorFigures(fixture, vendor_id);
  void _next;
  ledger.figures = figures;
  ledger.quotes = fixture.quotes
    .filter((quote) => quote.vendor_id === vendor_id)
    .map(({ vendor_id: _vendor, ...quote }) => {
      void _vendor;
      return quote;
    });
  const history: LedgerHistoryEntry[] = [];
  ledger.commitments = fixture.commitments
    .filter((commitment) => commitment.vendor_id === vendor_id)
    .map((commitment): CommitmentView => {
      const current = commitment.versions.find((version) => version.version_no === commitment.current_version_no) ?? commitment.versions[commitment.versions.length - 1];
      for (const version of commitment.versions) {
        history.push({
          entity: "commitment",
          entity_id: commitment.commitment_id,
          seed_key: version.seed_key,
          version_no: version.version_no,
          values: {
            amount_inr: version.amount_inr,
            pricing: version.pricing,
            unit: version.unit,
            unit_price_inr: version.unit_price_inr,
            quantity: version.quantity,
            due_on: version.due_on,
          },
          change_reason: version.change_reason,
          by: version.created_by_label,
          at: version.created_at,
          source: version.source,
          spoken_text: version.spoken_text,
        });
      }
      return {
        commitment_id: commitment.commitment_id,
        seed_key: commitment.seed_key,
        quote_id: commitment.quote_id,
        version_no: current.version_no,
        version_count: commitment.versions.length,
        pricing: current.pricing,
        unit: current.unit,
        unit_price_inr: current.unit_price_inr,
        quantity: current.quantity,
        amount_inr: current.amount_inr,
        event_id: current.event_id,
        description: current.description,
        agreed_on: current.agreed_on,
        due_on: current.due_on,
        formula_text:
          current.pricing === "per_unit" && current.quantity !== null && current.unit && current.unit_price_inr !== null
            ? formatPerUnitFormula(current.quantity, current.unit, current.unit_price_inr)
            : null,
        voided: commitment.voided_at !== null,
        void_reason: commitment.void_reason,
      };
    });
  ledger.payments = fixture.payments
    .filter((payment) => payment.vendor_id === vendor_id)
    .map((payment): PaymentView => {
      const index = payment.versions.findIndex((version) => version.version_no === payment.current_version_no);
      const current = payment.versions[index === -1 ? payment.versions.length - 1 : index];
      const previous = index > 0 ? payment.versions[index - 1] : null;
      for (const version of payment.versions) {
        history.push({
          entity: "payment",
          entity_id: payment.payment_id,
          seed_key: version.seed_key,
          version_no: version.version_no,
          values: { amount_inr: version.amount_inr, paid_on: version.paid_on, method: version.method, note: version.note },
          change_reason: version.change_reason,
          by: version.created_by_label,
          at: version.created_at,
          source: version.source,
          spoken_text: version.spoken_text,
        });
      }
      return {
        payment_id: payment.payment_id,
        seed_key: payment.seed_key,
        commitment_id: payment.commitment_id,
        payment_kind: payment.payment_kind,
        version_no: current.version_no,
        version_count: payment.versions.length,
        amount_inr: current.amount_inr,
        paid_on: current.paid_on,
        method: current.method,
        note: current.note,
        previous_amount_inr: previous && previous.amount_inr !== current.amount_inr ? previous.amount_inr : null,
        corrected_by: previous ? current.created_by_label : null,
        corrected_at: previous ? current.created_at : null,
        voided: payment.voided_at !== null,
        void_reason: payment.void_reason,
      };
    });
  ledger.history = history.sort((a, b) => a.at.localeCompare(b.at));
  ledger.estimate = cateringRows(fixture, { vendor_id });
  return ledger;
}

function snapshotFor(fixture: DemoFixture, event_id: string): SnapshotEvent | undefined {
  return latestPublication(fixture)?.snapshot.events.find((event) => event.event_id === event_id);
}

function unpublishedChanges(fixture: DemoFixture): UnpublishedChange[] {
  const changes: UnpublishedChange[] = [];
  const fields = ["title", "title_hi", "event_date", "start_time", "end_time", "muhurat_time", "dress_code", "description"] as const;
  for (const event of sortedEvents(fixture)) {
    const published = snapshotFor(fixture, event.event_id);
    const push = (field: string, published_value: JsonPrimitive, draft_value: JsonPrimitive) =>
      changes.push({ entity: "event", entity_id: event.event_id, field, published_value, draft_value, changed_by: null, changed_at: null });
    if (!published) {
      push("added", null, event.title);
      continue;
    }
    for (const field of fields) {
      if (published[field] !== event[field]) push(field, published[field], event[field]);
    }
    const draftVenue = fixture.venues.find((venue) => venue.venue_id === event.venue_id) ?? null;
    if ((published.venue?.venue_id ?? null) !== (draftVenue?.venue_id ?? null)) {
      push("venue", published.venue?.name ?? null, draftVenue?.name ?? null);
    }
  }
  return changes;
}

function conflicts(fixture: DemoFixture): ItineraryConflict[] {
  const found: ItineraryConflict[] = [];
  const events = sortedEvents(fixture).filter((event) => event.start_time);
  for (let i = 0; i < events.length; i += 1) {
    for (let j = i + 1; j < events.length; j += 1) {
      const a = events[i];
      const b = events[j];
      if (a.event_date !== b.event_date || !a.end_time || !b.start_time) continue;
      const overlap = Math.min(minutesOf(a.end_time), minutesOf(b.end_time ?? "23:59")) - minutesOf(b.start_time);
      if (overlap > 0) {
        found.push({
          kind: "overlap",
          event_ids: [a.event_id, b.event_id],
          overlap_minutes: overlap,
          text: `The ${a.title} ends at ${a.end_time} but the ${b.title} starts at ${b.start_time}: ${overlap} minutes overlap.`,
        });
      }
    }
  }
  for (const event of sortedEvents(fixture)) {
    const venue = fixture.venues.find((row) => row.venue_id === event.venue_id);
    if (!venue || venue.capacity === null) continue;
    const confirmed = rsvpRow(fixture, event).confirmed_headcount;
    if (confirmed > venue.capacity) {
      found.push({
        kind: "over_capacity",
        event_ids: [event.event_id],
        venue_id: venue.venue_id,
        capacity: venue.capacity,
        confirmed_headcount: confirmed,
        text: `${venue.name} seats ${venue.capacity}; ${confirmed} are attending the ${event.title.toLowerCase()}.`,
      });
    }
  }
  return found;
}

function buildItinerary(fixture: DemoFixture): Itinerary {
  const publication = latestPublication(fixture);
  const functions: ItineraryFunction[] = sortedEvents(fixture).map((event) => {
    const venue = fixture.venues.find((row) => row.venue_id === event.venue_id) ?? null;
    const published = snapshotFor(fixture, event.event_id);
    return {
      event_id: event.event_id,
      seed_key: event.seed_key,
      event_kind: event.event_kind,
      title: event.title,
      title_hi: event.title_hi,
      event_date: event.event_date,
      start_time: event.start_time,
      end_time: event.end_time,
      muhurat_time: event.muhurat_time,
      starts_at: ist(event.event_date, event.start_time),
      ends_at: ist(event.event_date, event.end_time),
      muhurat_at: ist(event.event_date, event.muhurat_time),
      venue_id: event.venue_id,
      venue: venue
        ? {
            venue_id: venue.venue_id,
            name: venue.name,
            place_name: venue.place_name,
            locality: venue.locality,
            address: venue.address,
            capacity: venue.capacity,
            map_url: venue.map_url,
          }
        : null,
      dress_code: event.dress_code,
      description: event.description,
      lead_name: event.lead_name,
      expected_headcount: event.expected_headcount,
      version: event.version,
      ...(published ? { published } : {}),
      requirements: fixture.requirements
        .filter((requirement) => requirement.event_id === event.event_id)
        .map((requirement) => ({
          requirement_id: requirement.requirement_id,
          seed_key: requirement.seed_key,
          label: requirement.quantity === null ? requirement.text : `${requirement.text} for ${requirement.quantity}`,
        })),
    };
  });
  return {
    version: fixture.wedding.version,
    hidden: [],
    functions,
    venues: fixture.venues.map((venue) => ({
      venue_id: venue.venue_id,
      seed_key: venue.seed_key,
      name: venue.name,
      place_name: venue.place_name,
      capacity: venue.capacity,
    })),
    unpublished_changes: unpublishedChanges(fixture),
    conflicts: conflicts(fixture),
    draft_version: fixture.wedding.draft_version,
    published_revision: fixture.wedding.published_revision,
    published_at: publication?.published_at ?? null,
    published_by: publication?.published_by_label ?? null,
  };
}

function buildRsvpTotals(fixture: DemoFixture, event_id?: string): RsvpTotals {
  return {
    version: fixture.wedding.version,
    hidden: [],
    functions: sortedEvents(fixture)
      .filter((event) => !event_id || event.event_id === event_id)
      .map((event) => rsvpRow(fixture, event)),
  };
}

function buildRsvpGuestList(fixture: DemoFixture, reader: Reader, event_id?: string): RsvpGuestList {
  const showContacts = sees(reader, "guest_contacts");
  const guests = new Map(fixture.guests.map((guest) => [guest.guest_id, guest]));
  const households = new Map(fixture.households.map((household) => [household.household_id, household]));
  const contacts = new Map(fixture.guest_contacts.map((contact) => [contact.guest_id, contact]));
  return {
    version: fixture.wedding.version,
    hidden: showContacts ? [] : ["guest_contacts"],
    functions: sortedEvents(fixture)
      .filter((event) => !event_id || event.event_id === event_id)
      .map((event) => {
        const row = rsvpRow(fixture, event);
        const named = fixture.invitations
          .filter((invitation) => invitation.event_id === event.event_id && !invitation.revoked_at)
          .map((invitation) => ({ invitation, guest: guests.get(invitation.guest_id) }))
          .filter((entry) => entry.guest && !entry.guest.is_synthetic)
          .map(({ invitation, guest }) => {
            const g = guest!;
            const contact = contacts.get(g.guest_id);
            return {
              guest_id: g.guest_id,
              seed_key: g.seed_key,
              full_name: g.full_name,
              household_id: g.household_id,
              household_name: households.get(g.household_id)?.name ?? "",
              group_label: g.group_label,
              rsvp_status: invitation.rsvp_status,
              plus_ones: invitation.plus_ones,
              max_plus_ones: invitation.max_plus_ones,
              dietary_note: g.dietary_note,
              ...(showContacts ? { phone: contact?.phone ?? null, email: contact?.email ?? null } : {}),
            };
          });
        return {
          event_id: event.event_id,
          seed_key: event.seed_key,
          title: event.title,
          title_hi: event.title_hi,
          starts_at: ist(event.event_date, event.start_time),
          guests: named,
          synthetic:
            row.synthetic.invited > 0
              ? { ...row.synthetic, label: `${row.synthetic.invited} imported guests (synthetic placeholders)` }
              : null,
        };
      }),
  };
}

function feedEntries(fixture: DemoFixture, reader: Reader): ActivityFeedEntry[] {
  const publishedAt = latestPublication(fixture)?.published_at ?? null;
  return fixture.activity_entries
    .filter((entry) => reader.role === "owner" || entry.visibility === "members")
    .sort((a, b) => b.seq - a.seq)
    .map((entry) => ({
      id: entry.activity_entry_id,
      seed_key: entry.seed_key,
      seq: entry.seq,
      occurred_at: entry.occurred_at,
      actor_type: entry.actor_type,
      actor_label: entry.actor_label,
      command: entry.command,
      topic: entry.topic,
      entity_type: entry.entity_type,
      entity_id: entry.entity_id,
      summary_en: entry.summary_en,
      summary_hi: entry.summary_hi,
      before: entry.before,
      after: entry.after,
      source: entry.source,
      voice_turn_id: entry.voice_turn_id,
      spoken_text: entry.spoken_text,
      proposal_id: entry.proposal_id,
      awaiting_publish:
        (entry.topic === "event.created" || entry.topic === "event.updated" || entry.topic === "invite_style.updated") &&
        (publishedAt === null || entry.occurred_at > publishedAt),
    }));
}

function buildActivityFeed(fixture: DemoFixture, reader: Reader, params: ActivityFeedParams = {}): ActivityFeed {
  const day = params.day === "today" ? fixture.today : params.day;
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
  const matching = feedEntries(fixture, reader).filter(
    (entry) =>
      (params.before_seq === undefined || entry.seq < params.before_seq) &&
      (!day || entry.occurred_at.slice(0, 10) === day) &&
      (!params.topic_prefix || entry.topic.startsWith(params.topic_prefix)) &&
      (!params.entity_id || entry.entity_id === params.entity_id) &&
      (!params.actor_member_id ||
        fixture.activity_entries.find((row) => row.activity_entry_id === entry.id)?.actor_member_id === params.actor_member_id),
  );
  const entries = matching.slice(0, limit);
  return {
    version: fixture.wedding.version,
    hidden: [],
    entries,
    next_before_seq: matching.length > limit ? entries[entries.length - 1].seq : null,
  };
}

function jobView(fixture: DemoFixture, job: ExportJobView, reader: Reader): ExportJobView {
  const published = fixture.wedding.published_revision ?? 0;
  const out_of_date = job.revision < published;
  return {
    ...job,
    label: exportJobLabel(job.status, job.attempts),
    out_of_date,
    can_retry: reader.role === "owner" && (job.status === "failed" || job.stalled) && job.attempts < job.max_attempts && !out_of_date,
  };
}

function buildExportJobStatus(fixture: DemoFixture, reader: Reader, job_id?: string): ExportJobStatusModel {
  return {
    version: fixture.wedding.version,
    hidden: [],
    jobs: fixture.export_jobs
      .filter((job) => !job_id || job.job_id === job_id)
      .sort((a, b) => b.revision - a.revision)
      .map((job) => jobView(fixture, job, reader)),
    published_revision: fixture.wedding.published_revision,
  };
}

function proposalView(fixture: DemoFixture, proposal: DemoFixture["proposals"][number]): ProposalView {
  return {
    proposal_id: proposal.proposal_id,
    seed_key: proposal.seed_key,
    command: proposal.command,
    summary_en: proposal.summary_en,
    summary_hi: proposal.summary_hi,
    committed_delta_inr: proposal.committed_delta_inr,
    paid_delta_inr: proposal.paid_delta_inr,
    status: proposal.status,
    proposed_by: memberLabel(fixture, proposal.proposed_by_member_id) ?? "",
    proposed_at: proposal.proposed_at,
    decided_by: memberLabel(fixture, proposal.decided_by_member_id),
    decided_at: proposal.decided_at,
    reason: proposal.reason,
    decision_reason: proposal.decision_reason,
  };
}

function buildProposals(fixture: DemoFixture, reader: Reader, status?: string): Proposals {
  return {
    version: fixture.wedding.version,
    hidden: [],
    proposals: fixture.proposals
      .filter((proposal) => reader.role === "owner" || proposal.proposed_by_member_id === reader.member_id)
      .filter((proposal) => !status || proposal.status === status)
      .map((proposal) => proposalView(fixture, proposal)),
  };
}

function buildShagunRegister(fixture: DemoFixture, thanked?: boolean): ShagunRegister {
  const households = new Map(fixture.households.map((household) => [household.household_id, household]));
  const entries = fixture.shagun_entries
    .filter((entry) => thanked === undefined || (entry.thanked_at !== null) === thanked)
    .map((entry) => ({
      shagun_entry_id: entry.shagun_entry_id,
      seed_key: entry.seed_key,
      giver_name: entry.giver_name,
      household_id: entry.household_id,
      household_name: entry.household_id ? (households.get(entry.household_id)?.name ?? null) : null,
      amount_inr: entry.amount_inr,
      received_on: entry.received_on,
      how: entry.how,
      note: entry.note,
      thank_you: { done: entry.thanked_at !== null, thanked_at: entry.thanked_at, thanked_note: entry.thanked_note },
    }));
  return {
    version: fixture.wedding.version,
    hidden: [],
    entries,
    total_received_inr: fixture.shagun_entries.reduce((sum, entry) => sum + entry.amount_inr, 0),
    pending_thank_yous: fixture.shagun_entries.filter((entry) => entry.thanked_at === null).length,
  };
}

function buildWeddingProfile(fixture: DemoFixture, reader: Reader, actor: SessionActor): WeddingProfile {
  const events = sortedEvents(fixture);
  const member = fixture.members.find((row) => row.member_id === actor.member_id);
  const hidden: HiddenBlock[] = [];
  const profile: WeddingProfile = {
    version: fixture.wedding.version,
    hidden,
    wedding_id: fixture.wedding.wedding_id,
    seed_key: fixture.wedding.seed_key,
    display_name: `${fixture.wedding.bride_name} & ${fixture.wedding.groom_name}`,
    bride_name: fixture.wedding.bride_name,
    groom_name: fixture.wedding.groom_name,
    wedding_date: fixture.wedding.wedding_date,
    first_event_date: events[0]?.event_date ?? null,
    last_event_date: events[events.length - 1]?.event_date ?? null,
    city: fixture.wedding.city,
    is_sample: fixture.wedding.is_sample,
    member: {
      member_id: member?.member_id ?? actor.member_id ?? "",
      role: reader.role,
      display_name: member?.display_name ?? actor.display_name,
    },
  };
  if (sees(reader, "budget")) profile.budget_inr = fixture.budget_total_inr;
  else hidden.push("budget");
  return profile;
}

function buildOverview(fixture: DemoFixture, reader: Reader): Overview {
  const events = sortedEvents(fixture);
  const hidden: HiddenBlock[] = [];
  const nextEvent = events.find((event) => (ist(event.event_date, event.start_time) ?? event.event_date) >= fixture.now) ?? null;
  const nextVenue = nextEvent ? fixture.venues.find((venue) => venue.venue_id === nextEvent.venue_id) : undefined;
  const itinerary = buildItinerary(fixture);
  const rows = fixture.vendors.map((vendor) => vendorRow(fixture, vendor.vendor_id));
  const overview: Overview = {
    version: fixture.wedding.version,
    hidden,
    header: {
      bride_name: fixture.wedding.bride_name,
      groom_name: fixture.wedding.groom_name,
      display_name: `${fixture.wedding.bride_name} & ${fixture.wedding.groom_name}`,
      city: fixture.wedding.city,
      wedding_date: fixture.wedding.wedding_date,
      first_starts_at: events[0] ? ist(events[0].event_date, events[0].start_time) : null,
      last_ends_at: events.length > 0 ? ist(events[events.length - 1].event_date, events[events.length - 1].end_time) : null,
      is_sample: fixture.wedding.is_sample,
    },
    next_event: nextEvent
      ? {
          event_id: nextEvent.event_id,
          seed_key: nextEvent.seed_key,
          title: nextEvent.title,
          title_hi: nextEvent.title_hi,
          starts_at: ist(nextEvent.event_date, nextEvent.start_time),
          venue_name: nextVenue?.name ?? null,
          days_until: daysBetween(fixture.today, nextEvent.event_date),
        }
      : null,
    decisions: {
      unpublished_changes_count: itinerary.unpublished_changes.length,
      conflicts: itinerary.conflicts,
    },
    rsvp: events.map((event) => rsvpRow(fixture, event)),
    activity_today: feedEntries(fixture, reader)
      .filter((entry) => entry.occurred_at.slice(0, 10) === fixture.today)
      .slice(0, 5),
  };
  if (reader.role === "owner") {
    const pending = fixture.proposals.filter((proposal) => proposal.status === "pending").map((proposal) => proposalView(fixture, proposal));
    overview.decisions.pending_proposals = { count: pending.length, items: pending };
  } else hidden.push("proposals");
  if (sees(reader, "budget")) overview.money = moneyTotals(fixture, rows);
  else hidden.push("budget");
  if (sees(reader, "dues")) overview.dues = rows.filter((row) => row.due_state === "overdue" || row.due_state === "due_soon");
  else hidden.push("dues");
  return overview;
}

function readerFor(fixture: DemoFixture, actor: SessionActor, name: ReadModelName): Reader {
  const member = fixture.members.find((row) => row.member_id === actor.member_id || row.user_id === actor.user_id);
  const role = actor.wedding_id === fixture.wedding.wedding_id && actor.role ? actor.role : (member?.role ?? null);
  if (!role) throw failure({ code: "forbidden", message: "You are not a member of this wedding." });
  const sharing = sharingOf(fixture);
  const rule = READ_MODEL_PERMISSIONS[name];
  if (role === "owner" && !rule.owner) throw failure({ code: "forbidden", message: "Not available." });
  if (role === "manager" && rule.manager === "forbidden") throw failure({ code: "forbidden", message: "Not shared with you." });
  return { role, member_id: member?.member_id ?? actor.member_id, sharing };
}

function readModel(name: ReadModelName, fixture: DemoFixture, actor: SessionActor, params: Record<string, unknown>): unknown {
  const reader = readerFor(fixture, actor, name);
  switch (name) {
    case "wedding_profile":
      return buildWeddingProfile(fixture, reader, actor);
    case "overview":
      return buildOverview(fixture, reader);
    case "money_summary":
      return buildMoneySummary(fixture, reader);
    case "vendor_ledger":
      return buildVendorLedger(fixture, reader, String(params.vendor_id ?? ""));
    case "itinerary":
      return buildItinerary(fixture);
    case "rsvp_totals":
      return buildRsvpTotals(fixture, params.event_id as string | undefined);
    case "rsvp_guest_list":
      return buildRsvpGuestList(fixture, reader, params.event_id as string | undefined);
    case "catering_estimate": {
      const hidden: HiddenBlock[] = [];
      const model: CateringEstimate = { version: fixture.wedding.version, hidden };
      if (sees(reader, "estimate")) {
        model.rows = cateringRows(fixture, {
          vendor_id: params.vendor_id as string | undefined,
          event_id: params.event_id as string | undefined,
        });
      } else hidden.push("estimate");
      return model;
    }
    case "activity_feed":
      return buildActivityFeed(fixture, reader, params as ActivityFeedParams);
    case "export_job_status":
      return buildExportJobStatus(fixture, reader, params.job_id as string | undefined);
    case "proposals":
      return buildProposals(fixture, reader, params.status as string | undefined);
    case "shagun_register":
      return buildShagunRegister(fixture, params.thanked as boolean | undefined);
  }
}

function buildGuestView(fixture: DemoFixture, household_key: string): GuestInvitationView | null {
  const household = fixture.households.find((row) => row.seed_key === household_key);
  const publication = latestPublication(fixture);
  if (!household || !publication) return null;
  const members = fixture.guests.filter((guest) => guest.household_id === household.household_id);
  const memberIds = new Set(members.map((guest) => guest.guest_id));
  const invitations = fixture.invitations.filter((invitation) => memberIds.has(invitation.guest_id) && !invitation.revoked_at);
  const style = publication.snapshot.invite_style;
  return {
    revision: publication.revision,
    wedding: {
      ...publication.snapshot.wedding,
      heading_hi: style.heading_hi,
      wording_en: style.wording_en,
      wording_hi: style.wording_hi,
      blessing_line: style.blessing_line,
      theme: style.theme,
      typeface: style.typeface,
      layout: style.layout,
      photo_frame: style.photo_frame,
      // No photo_url: the fixtures have no uploaded file and never sign URLs.
    },
    household: {
      name: household.name,
      guests: members.map((guest) => ({ guest_id: guest.guest_id, full_name: guest.full_name, dietary_note: guest.dietary_note })),
    },
    functions: publication.snapshot.events
      .filter((event) => invitations.some((invitation) => invitation.event_id === event.event_id))
      .map((event) => ({
        event_id: event.event_id,
        event_kind: event.event_kind,
        title: event.title,
        title_hi: event.title_hi,
        starts_at: ist(event.event_date, event.start_time),
        ends_at: ist(event.event_date, event.end_time),
        muhurat_at: ist(event.event_date, event.muhurat_time),
        dress_code: event.dress_code,
        description: event.description,
        venue: event.venue
          ? {
              name: event.venue.name,
              place_name: event.venue.place_name,
              locality: event.venue.locality,
              address: event.venue.address,
              map_url: event.venue.map_url,
            }
          : null,
        responses: invitations
          .filter((invitation) => invitation.event_id === event.event_id)
          .map((invitation) => ({
            guest_id: invitation.guest_id,
            rsvp_status: invitation.rsvp_status,
            plus_ones: invitation.plus_ones,
            max_plus_ones: invitation.max_plus_ones,
          })),
      })),
  };
}

/** A plausible `result` for a fixture command (nothing is written). */
function fixtureResult(fixture: DemoFixture | null, command: CommandName, input: Record<string, unknown>, actor: CommandActor): JsonObject {
  if (!fixture) return {};
  const vendorTotalsFor = (vendor_id: string): JsonObject => {
    const { next_due_on: _next, ...totals } = vendorFigures(fixture, vendor_id);
    void _next;
    return { vendor_id, vendor_totals: totals };
  };
  switch (command) {
    case "update_event":
      return {
        event_id: String(input.event_id),
        version: (fixture.events.find((event) => event.event_id === input.event_id)?.version ?? 0) + 1,
        draft_version: fixture.wedding.draft_version + 1,
      };
    case "reset_demo":
      return {
        checkpoint: String(input.checkpoint ?? "d0"),
        draft_version: fixture.wedding.draft_version,
        published_revision: fixture.wedding.published_revision,
      };
    case "record_commitment":
    case "update_commitment":
    case "void_commitment":
    case "record_payment":
    case "correct_payment":
    case "void_payment": {
      const payment = fixture.payments.find((row) => row.payment_id === input.payment_id);
      const commitment = fixture.commitments.find((row) => row.commitment_id === input.commitment_id);
      const vendor_id = String(input.vendor_id ?? payment?.vendor_id ?? commitment?.vendor_id ?? "");
      const base = vendorTotalsFor(vendor_id);
      if (command === "correct_payment" && payment && typeof input.amount_inr === "number") {
        const totals = base.vendor_totals as JsonObject;
        const paid = (totals.paid_inr as number) - (payment.versions[payment.versions.length - 1]?.amount_inr ?? 0) + input.amount_inr;
        const committed = totals.committed_inr as number;
        return {
          ...base,
          payment_id: payment.payment_id,
          version_no: payment.current_version_no + 1,
          amount_inr: input.amount_inr,
          vendor_totals: {
            committed_inr: committed,
            paid_inr: paid,
            outstanding_inr: Math.max(0, committed - paid),
            overpaid_inr: Math.max(0, paid - committed),
          },
        };
      }
      return base;
    }
    case "set_rsvp": {
      const event = fixture.events.find((row) => row.event_id === input.event_id);
      return event ? { rsvp_totals: rsvpRow(fixture, event) as unknown as JsonObject } : {};
    }
    case "submit_rsvp":
    case "set_dietary": {
      if (actor.kind !== "guest") return {};
      const household = fixture.households.find((row) => row.household_id === actor.household_id);
      const view = household?.seed_key ? buildGuestView(fixture, household.seed_key) : null;
      return (view ?? {}) as unknown as JsonObject;
    }
    case "request_card_export": {
      const revision = fixture.wedding.published_revision ?? 0;
      const status: ExportJobStatus = "queued";
      const job: ExportJobView = {
        job_id: seededId(fixture.copy, "export_jobs", `FIXTURE-R${revision}-PNG`),
        seed_key: null,
        job_label: jobLabel(revision, "png"),
        export_key: exportKey(fixture.wedding.wedding_id, revision, "png"),
        revision,
        format: "png",
        status,
        label: exportJobLabel(status, 0),
        synthetic: false,
        attempts: 0,
        max_attempts: MAX_ATTEMPTS,
        renderer: null,
        card_summary: "Mira & Kabir, Reception, Monday, 14 December 2026, Banyan Hall",
        card_functions: ["Reception"],
        last_error: null,
        notified_at: null,
        stalled: false,
        can_retry: false,
        out_of_date: false,
        download_url: null,
        created_at: fixture.now,
        updated_at: fixture.now,
        attempt_log: [],
      };
      return job as unknown as JsonObject;
    }
    case "retry_card_export": {
      const job = fixture.export_jobs.find((row) => row.job_id === input.job_id);
      return (job ?? {}) as unknown as JsonObject;
    }
    default:
      return {};
  }
}

const receipts = new Map<string, CommandSuccess>();
let fixtureCounter = 0;

function actorKey(actor: CommandActor): string {
  if (actor.kind === "guest") return `household:${actor.household_id}`;
  if (actor.kind === "system") return "ops";
  return `member:${actor.member_id ?? actor.user_id}`;
}

/** The fixture dispatcher: validation, the role matrix, the voice gate (always paused, D47), receipts. */
async function fixtureDispatch<C extends CommandName>(actor: CommandActor, envelope: CommandEnvelope<C>): Promise<CommandResponse<C>> {
  const fail = (body: CommandErrorBody) => ({ ok: false, error: body }) as CommandResponse<C>;
  const command = envelope.command as CommandName;
  const schema = commandSchemas[command];
  if (!schema) return fail({ code: "validation_failed", message: "unknown_value", field: "command" });

  // 1. Who: guest, system or member (domain 3.0 step 2).
  const fixture = fixtureForWedding(envelope.wedding_id ?? (actor.kind !== "system" ? actor.wedding_id : null));
  if (actor.kind === "guest") {
    if (!(GUEST_COMMANDS as readonly string[]).includes(command)) return fail({ code: "forbidden", message: "Not allowed." });
  } else if (actor.kind === "system") {
    if (!(SYSTEM_COMMANDS as readonly string[]).includes(command)) return fail({ code: "forbidden", message: "Not allowed." });
  } else {
    const anySignedIn = (command === "set_wedding_profile" && !envelope.wedding_id) || command === "accept_member_invite";
    if (!anySignedIn) {
      if (!fixture) return fail({ code: "not_found", message: "Wedding not found." });
      if (!actor.role) return fail({ code: "forbidden", message: "You are not a member of this wedding." });
      const decision = memberCommandDecision(command, actor.role, sharingOf(fixture));
      if (decision === "forbidden") return fail({ code: "forbidden", message: "Not allowed for your role." });
      if (decision === "approval_required") {
        return fail({ code: "approval_required", message: "This change needs an owner's approval. Send it as a proposal." });
      }
    }
  }

  // 2. Validation.
  const parsed = schema.safeParse(envelope.input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return fail({
      code: "validation_failed",
      message: issue ? validationMessageFor(issue) : "unknown_value",
      field: issue && issue.path.length > 0 ? issue.path.map(String).join(".") : null,
    });
  }

  // 3. The voice gate: the contracts stub never answers "enabled" (D47).
  if (envelope.source === "voice") {
    return fail({
      code: "voice_writes_paused",
      message: "Voice changes are switched off right now. You can type the change and save it.",
      prefill: [{ command, input: (envelope.input ?? {}) as JsonObject, labels: {} }],
    });
  }

  // 4. Receipts (I1): the same key from the same actor replays.
  const receiptKey = envelope.idempotency_key ? `${actorKey(actor)}|${command}|${envelope.idempotency_key}` : null;
  if (receiptKey) {
    const stored = receipts.get(receiptKey);
    if (stored) return { ...stored, outcome: "replayed" } as CommandResponse<C>;
  }

  fixtureCounter += 1;
  const activity_entry_id = uuidV5(`fixture:activity:${fixtureCounter}:${command}`);
  const version = (fixture?.wedding.version ?? 0) + 1;
  const success =
    command === "propose_change"
      ? {
          ok: true as const,
          outcome: "proposed" as const,
          command,
          result: { proposal_id: uuidV5(`fixture:proposal:${fixtureCounter}`) },
          activity_entry_id,
          version,
          warnings: [],
          proposal_id: uuidV5(`fixture:proposal:${fixtureCounter}`),
        }
      : {
          ok: true as const,
          outcome: "applied" as const,
          command,
          result: fixtureResult(fixture, command, parsed.data as Record<string, unknown>, actor),
          activity_entry_id,
          version,
          warnings: [],
        };
  if (receiptKey) receipts.set(receiptKey, success as unknown as CommandSuccess);
  return success as unknown as CommandResponse<C>;
}

/** The fixture implementation of `Services`, over the D0 fixtures of every sample copy. */
export const fixtureServices: Services = {
  dispatch: fixtureDispatch,

  async read(name, request) {
    const fixture = fixtureForWedding(request.wedding_id);
    if (!fixture) throw failure({ code: "not_found", message: "Wedding not found." });
    const params = ((request as { params?: Record<string, unknown> }).params ?? {}) as Record<string, unknown>;
    return readModel(name, fixture, request.actor, params) as ReadModelResult<typeof name>;
  },

  async guestInvitationView(token) {
    const found = fixtureForToken(token);
    return found ? buildGuestView(found.fixture, found.household_key) : null;
  },

  async guestRevision(token) {
    const found = fixtureForToken(token);
    return found ? (latestPublication(found.fixture)?.revision ?? null) : null;
  },

  async signUpload(actor, request) {
    const fixture = fixtureForWedding(request.wedding_id);
    if (!fixture) return { ok: false, error: { code: "not_found", message: "Wedding not found." } };
    if (!actor.role) return { ok: false, error: { code: "forbidden", message: "You are not a member of this wedding." } };
    if (request.bytes <= 0 || request.bytes > 10 * 1024 * 1024) {
      return { ok: false, error: { code: "validation_failed", message: "out_of_range", field: "bytes" } };
    }
    fixtureCounter += 1;
    const asset_id = uuidV5(`fixture:asset:${fixtureCounter}`);
    const ext = request.mime_type === "image/png" ? "png" : request.mime_type === "image/webp" ? "webp" : "jpg";
    const object_key = `${request.wedding_id}/${asset_id}.${ext}`;
    return {
      ok: true,
      asset_id,
      bucket: "uploads",
      object_key,
      // The .invalid domain never resolves: fixtures can't upload.
      signed_upload_url: `https://fixtures.invalid/storage/uploads/${object_key}`,
      token: "fixture",
      expires_at: new Date(Date.now() + 7_200_000).toISOString(),
    };
  },
};
