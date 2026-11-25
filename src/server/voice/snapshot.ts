import "server-only";

import { CommandFailure } from "@/contracts/commands";
import type { AppLanguage, IsoDate, MemberRole, SessionActor, WeddingId } from "@/contracts/domain";
import { getDemoFixture } from "@/contracts/fixtures";
import { formatInr } from "@/contracts/money";
import type {
  ActivityFeed,
  CateringEstimate,
  ExportJobStatusModel,
  WeddingNotes,
  Itinerary,
  ItineraryFunction,
  MoneySummary,
  ReadModelName,
  RsvpGuestList,
  RsvpTotals,
  VendorLedger,
  WeddingProfile,
} from "@/contracts/read-models";
import type { Services } from "@/contracts/services";
import { SAMPLE_COPIES, seededId } from "@/db/ids";
import { services as defaultServices } from "@/server/services";

import { setupKeyterms, weddingKeyterms } from "./keyterms";
import type { RefMap, Snapshot, StoredTurn } from "./types";

/**
 * The snapshot sent to the model (voice.md 1.9): compact text, one record per line, every
 * record named by a reference (its `seed_key`, or an alias `{PREFIX}-L{n}` for a live row),
 * built from read models with the speaker's role. A block a manager can't see is simply
 * absent, so the model can't leak it, and named in `snapshot.hidden`.
 *
 * `snapshot.data` keys (the resolver checks against these, with no second read; each key is
 * absent when the read failed or the speaker can't see it). See `SnapshotData`:
 * - `wedding_profile`, `itinerary`, `money_summary`, `rsvp_guest_list`, `rsvp_totals`,
 *   `activity_feed` (the last 10 entries), `catering_estimate`, `export_job_status`:
 *   the read-model results as returned.
 * - `vendor_ledger`: `Record<vendor_id, VendorLedger>`, one per vendor whose money the
 *   speaker may see (owners; managers with `managers_can_see_vendor_dues`).
 * - `members`, `households`: the people lists behind the People block (see below).
 * - `ref_by_id`: UUID → reference, the inverse of `ref_map`.
 * - `setup_draft`: the profile fields held by the open setup turn (setup turns only).
 * - `read_errors`: read-model names whose read failed (forbidden or otherwise).
 *
 * Never in the text: phone numbers, emails, tokens, links, UUIDs, other weddings, or any
 * block in a read model's `hidden` list. Member-written text stays, as data.
 *
 * Seams: there is no `team` read model yet (lane-lead-contracts-2, D99), so members and
 * households (with seed keys and relations) come from the sample fixtures for a sample
 * wedding; a live wedding gets the speaker alone and households from the guest list.
 * Shagun stays out until Should #13 ships (D131).
 */

export type SnapshotMember = { member_id: string; seed_key: string | null; display_name: string; role: MemberRole };
export type SnapshotHousehold = { household_id: string; seed_key: string | null; name: string; relation: string | null };

export type SnapshotData = {
  wedding_profile?: WeddingProfile;
  itinerary?: Itinerary;
  money_summary?: MoneySummary;
  vendor_ledger?: Record<string, VendorLedger>;
  rsvp_guest_list?: RsvpGuestList;
  rsvp_totals?: RsvpTotals;
  activity_feed?: ActivityFeed;
  catering_estimate?: CateringEstimate;
  export_job_status?: ExportJobStatusModel;
  wedding_notes?: WeddingNotes;
  members?: SnapshotMember[];
  households?: SnapshotHousehold[];
  ref_by_id?: Record<string, string>;
  setup_draft?: Record<string, unknown>;
  read_errors?: string[];
};

/** Typed view of `snapshot.data`. */
export function snapshotData(snapshot: Snapshot): SnapshotData {
  return snapshot.data as SnapshotData;
}

export type SnapshotDeps = {
  services: Pick<Services, "read">;
  /** Members of a wedding, with their seed keys. */
  listMembers: (wedding_id: WeddingId, actor: SessionActor) => Promise<SnapshotMember[]>;
  /** Households with seed keys and relations; null to derive them from the guest list. */
  listHouseholds: (wedding_id: WeddingId) => Promise<SnapshotHousehold[] | null>;
};

/** Shagun by voice is Should #13, out today (D131). */
const SHAGUN_IN_SNAPSHOT = false;
const ACTIVITY_LIMIT = 10;
/** The newest saved notes the model sees. */
const NOTES_LIMIT = 20;
export const ATTACHED_ASSET_REF = "ASSET-NEW";

// ---------------------------------------------------------------------------
// Default people sources (sample weddings from the fixtures; see the seam note above)
// ---------------------------------------------------------------------------

function sampleFixtureFor(wedding_id: WeddingId) {
  for (const copy of SAMPLE_COPIES) {
    if (seededId(copy, "weddings", "WEDDING") === wedding_id) return getDemoFixture(copy);
  }
  return null;
}

async function defaultListMembers(wedding_id: WeddingId, actor: SessionActor): Promise<SnapshotMember[]> {
  const fixture = sampleFixtureFor(wedding_id);
  const members: SnapshotMember[] = fixture
    ? fixture.members
        .filter((member) => !member.removed_at)
        .map((member) => ({ member_id: member.member_id, seed_key: member.seed_key, display_name: member.display_name, role: member.role }))
    : [];
  if (actor.member_id && actor.role && !members.some((member) => member.member_id === actor.member_id)) {
    members.push({ member_id: actor.member_id, seed_key: null, display_name: actor.display_name, role: actor.role });
  }
  return members;
}

async function defaultListHouseholds(wedding_id: WeddingId): Promise<SnapshotHousehold[] | null> {
  const fixture = sampleFixtureFor(wedding_id);
  if (!fixture) return null;
  return fixture.households
    .filter((household) => !household.is_synthetic)
    .map((household) => ({
    household_id: household.household_id,
    seed_key: household.seed_key,
    name: household.name,
    relation: household.relation ?? null,
  }));
}

const defaultDeps: SnapshotDeps = {
  services: defaultServices,
  listMembers: defaultListMembers,
  listHouseholds: defaultListHouseholds,
};

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const EMAIL_RE = /[^\s@<>()"',;]+@[^\s@<>()"',;]+\.[a-z]{2,}/gi;
const URL_RE = /\b(?:https?:\/\/|www\.)\S+/gi;
/** Ten or more digits with single spaces or hyphens between them (phone numbers). */
const PHONE_RE = /\+?\d(?:[ -]?\d){9,}/g;
/** Long opaque strings (link tokens, keys). */
const TOKEN_RE = /\b[A-Za-z0-9_-]{32,}\b/g;

/** Strips anything the snapshot must never carry from one free-text value (G9). */
export function sanitizeText(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .replace(URL_RE, "[link removed]")
    .replace(EMAIL_RE, "[email removed]")
    .replace(UUID_RE, "[id removed]")
    .replace(TOKEN_RE, "[removed]")
    .replace(PHONE_RE, "[phone removed]")
    .replace(/[\r\n|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Mon 14 Dec 2026 (2026-12-14)": the weekday comes from code, never the model. */
export function formatDay(date: IsoDate | null | undefined): string {
  if (!date) return "-";
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return date;
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${weekday} ${d} ${MONTHS[m - 1]} ${y} (${date})`;
}

/** Today's date in Asia/Kolkata (the server runs in UTC). */
export function istToday(now: Date = new Date()): IsoDate {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function istStamp(instant: string): string {
  const at = new Date(instant);
  if (Number.isNaN(at.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(at);
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("day")} ${part("month")} ${part("hour")}:${part("minute")}`;
}

const RSVP_CODE: Record<string, string> = { attending: "A", declined: "D", pending: "P" };

const or = (value: string | number | null | undefined, fallback = "-") =>
  value === null || value === undefined || value === "" ? fallback : String(value);

// ---------------------------------------------------------------------------
// References
// ---------------------------------------------------------------------------

class RefAllocator {
  readonly map: RefMap = {};
  readonly byId: Record<string, string> = {};
  private readonly counters: Record<string, number> = {};

  /** The record's seed_key when it has an unused one, else `{PREFIX}-L{n}`. */
  ref(prefix: string, seed_key: string | null | undefined, id: string): string {
    const existing = this.byId[id];
    if (existing) return existing;
    let reference: string;
    if (seed_key && seed_key.length <= 24 && !this.map[seed_key]) {
      reference = seed_key;
    } else {
      do {
        this.counters[prefix] = (this.counters[prefix] ?? 0) + 1;
        reference = `${prefix}-L${this.counters[prefix]}`;
      } while (this.map[reference]);
    }
    this.map[reference] = id;
    this.byId[id] = reference;
    return reference;
  }

  set(reference: string, id: string) {
    this.map[reference] = id;
    this.byId[id] = reference;
  }
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

type Reads = SnapshotData & { read_errors: string[] };

async function readOrNull<T>(errors: string[], name: string, read: () => Promise<T>): Promise<T | undefined> {
  try {
    return await read();
  } catch (error) {
    // forbidden / not_found leave the block out; anything else does too, so a turn never
    // fails on its snapshot. Only the read-model name is recorded, never the message.
    errors.push(error instanceof CommandFailure ? `${name}:${error.body.code}` : `${name}:error`);
    return undefined;
  }
}

async function readAll(deps: SnapshotDeps, actor: SessionActor, wedding_id: WeddingId): Promise<Reads> {
  const read_errors: string[] = [];
  const svc = deps.services;
  const read = <N extends ReadModelName>(name: N, params?: Record<string, unknown>) =>
    readOrNull(read_errors, name, () =>
      (svc.read as (n: N, r: { actor: SessionActor; wedding_id: WeddingId; params?: Record<string, unknown> }) => Promise<unknown>)(
        name,
        { actor, wedding_id, ...(params ? { params } : {}) },
      ),
    );

  const [wedding_profile, itinerary, money_summary, rsvp_guest_list, rsvp_totals, activity_feed, catering_estimate, export_job_status, wedding_notes, members, households] =
    await Promise.all([
      read("wedding_profile") as Promise<WeddingProfile | undefined>,
      read("itinerary") as Promise<Itinerary | undefined>,
      read("money_summary") as Promise<MoneySummary | undefined>,
      read("rsvp_guest_list") as Promise<RsvpGuestList | undefined>,
      read("rsvp_totals") as Promise<RsvpTotals | undefined>,
      read("activity_feed", { limit: ACTIVITY_LIMIT }) as Promise<ActivityFeed | undefined>,
      read("catering_estimate") as Promise<CateringEstimate | undefined>,
      read("export_job_status") as Promise<ExportJobStatusModel | undefined>,
      read("wedding_notes") as Promise<WeddingNotes | undefined>,
      readOrNull(read_errors, "members", () => deps.listMembers(wedding_id, actor)),
      readOrNull(read_errors, "households", () => deps.listHouseholds(wedding_id)),
    ]);

  // Vendor money: one ledger per vendor, only when the vendor rows are visible (G7).
  let vendor_ledger: Record<string, VendorLedger> | undefined;
  if (money_summary?.vendors && money_summary.vendors.length > 0) {
    const ledgers = await Promise.all(
      money_summary.vendors.map(
        (vendor) => read("vendor_ledger", { vendor_id: vendor.vendor_id }) as Promise<VendorLedger | undefined>,
      ),
    );
    vendor_ledger = {};
    for (const ledger of ledgers) if (ledger) vendor_ledger[ledger.vendor.vendor_id] = ledger;
  }

  return {
    wedding_profile,
    itinerary,
    money_summary,
    rsvp_guest_list,
    rsvp_totals,
    activity_feed,
    catering_estimate,
    export_job_status,
    wedding_notes,
    vendor_ledger,
    members: members ?? undefined,
    households: households ?? undefined,
    read_errors,
  };
}

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

function functionLine(fn: ItineraryFunction, ref: string): string {
  const venue = fn.venue ? `${sanitizeText(fn.venue.name)}${fn.venue.place_name ? ` (${sanitizeText(fn.venue.place_name)})` : ""}` : "-";
  const parts = [
    ref,
    fn.event_kind,
    sanitizeText(fn.title),
    formatDay(fn.event_date),
    `${or(fn.start_time)}-${or(fn.end_time)}`,
    `muhurat ${or(fn.muhurat_time)}`,
    `venue ${venue}`,
    `dress ${or(sanitizeText(fn.dress_code))}`,
    `lead ${or(sanitizeText(fn.lead_name))}`,
    `expected ${or(fn.expected_headcount)}`,
  ];
  const published = fn.published;
  if (!published) {
    parts.push("not yet published");
  } else {
    const differs: string[] = [];
    if (published.event_date !== fn.event_date) differs.push(`date ${formatDay(published.event_date)}`);
    if (published.start_time !== fn.start_time || published.end_time !== fn.end_time) {
      differs.push(`time ${or(published.start_time)}-${or(published.end_time)}`);
    }
    if (published.muhurat_time !== fn.muhurat_time) differs.push(`muhurat ${or(published.muhurat_time)}`);
    if ((published.venue?.venue_id ?? null) !== (fn.venue_id ?? null)) differs.push(`venue ${or(sanitizeText(published.venue?.name))}`);
    if ((published.dress_code ?? null) !== (fn.dress_code ?? null)) differs.push(`dress ${or(sanitizeText(published.dress_code))}`);
    if (published.title !== fn.title) differs.push(`title ${sanitizeText(published.title)}`);
    if (differs.length > 0) parts.push(`guests still see (published): ${differs.join(", ")}`);
  }
  return parts.join(" | ");
}

type BuildInput = {
  actor: SessionActor;
  wedding_id: WeddingId | null;
  context: StoredTurn | null;
  attached_asset_id: string | null;
  today?: IsoDate;
  ui_language?: AppLanguage;
};

const SETUP_DRAFT_FIELDS = ["bride_name", "groom_name", "wedding_date", "date_text", "month", "city", "budget_inr", "expected_guests"] as const;

function setupDraftOf(context: StoredTurn | null): Record<string, unknown> | null {
  if (!context || context.wedding_id !== null) return null;
  const action = context.actions.find((entry) => entry.kind === "set_wedding_profile");
  if (!action) return null;
  const draft: Record<string, unknown> = {};
  for (const field of SETUP_DRAFT_FIELDS) {
    const value = (action.input as Record<string, unknown>)[field] ?? action.raw[field];
    if (value !== undefined && value !== null && value !== "") draft[field] = value;
  }
  return draft;
}

function draftValue(value: unknown): string {
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return sanitizeText(value);
  return "";
}

/** The role word the model should map to a vendor of each category (voice.md 2.5's role words). */
const VENDOR_ROLE_HINT: Partial<Record<string, string>> = {
  catering: "caterer",
  decor: "decorator",
  photography: "photographer",
  music: "DJ",
  mehendi_makeup: "mehendi artist",
  venue: "venue",
  invitations_gifts: "printer",
  attire: "boutique",
};

/**
 * Builds one turn's snapshot. Never throws for a read: a block that can't be read is left
 * out. `today` defaults to the real IST date (pass it in tests).
 */
export async function buildSnapshot(input: BuildInput, overrides?: Partial<SnapshotDeps>): Promise<Snapshot> {
  const deps: SnapshotDeps = { ...defaultDeps, ...overrides };
  const { actor } = input;
  const today = input.today ?? istToday();
  const screenLanguage = input.ui_language ?? actor.preferred_language;
  const refs = new RefAllocator();
  const lines: string[] = [];
  const hidden: string[] = [];
  const data: SnapshotData = {};

  lines.push(`Today: ${formatDay(today)}, Asia/Kolkata.`);

  if (input.attached_asset_id) refs.set(ATTACHED_ASSET_REF, input.attached_asset_id);

  // ----- Setup turn: today, the speaker and the draft only -----
  if (!input.wedding_id) {
    lines.push(`Speaker: ${sanitizeText(actor.display_name) || "the user"}, screen language ${screenLanguage}.`);
    lines.push("No wedding exists yet: this is the setup screen. Only set_wedding_profile can be proposed.");
    const draft = setupDraftOf(input.context);
    if (draft && Object.keys(draft).length > 0) {
      data.setup_draft = draft;
      const fields = Object.entries(draft).map(([field, value]) => `${field} ${draftValue(value)}`);
      const missing = input.context?.missing_fields.length ? ` Still missing: ${input.context.missing_fields.join(", ")}.` : "";
      lines.push("");
      lines.push(`Setup draft (from the previous turn): ${fields.join(" | ")}.${missing}`);
    }
    if (input.attached_asset_id) {
      lines.push("");
      lines.push(`Attached photo: ${ATTACHED_ASSET_REF} (a couple photo attached to this request).`);
    }
    data.ref_by_id = refs.byId;
    return { text: lines.join("\n"), ref_map: refs.map, keyterms: setupKeyterms(), today, data, hidden };
  }

  // ----- A wedding turn -----
  const reads = await readAll(deps, actor, input.wedding_id);
  const profile = reads.wedding_profile;
  const itinerary = reads.itinerary;
  const money = reads.money_summary;
  const guestList = reads.rsvp_guest_list;
  const role = profile?.member.role ?? actor.role ?? "manager";
  const isOwner = role === "owner";

  Object.assign(data, {
    wedding_profile: reads.wedding_profile,
    itinerary: reads.itinerary,
    money_summary: reads.money_summary,
    rsvp_guest_list: reads.rsvp_guest_list,
    rsvp_totals: reads.rsvp_totals,
    activity_feed: reads.activity_feed,
    catering_estimate: reads.catering_estimate,
    export_job_status: reads.export_job_status,
    wedding_notes: reads.wedding_notes,
    vendor_ledger: reads.vendor_ledger,
    members: reads.members,
  } satisfies SnapshotData);
  if (reads.read_errors.length > 0) data.read_errors = reads.read_errors;
  for (const key of Object.keys(data) as (keyof SnapshotData)[]) if (data[key] === undefined) delete data[key];

  // Header
  const speakerName = sanitizeText(profile?.member.display_name ?? actor.display_name) || "the speaker";
  lines.push(`Speaker: ${speakerName}, ${role}, screen language ${screenLanguage}.`);
  if (profile) {
    const city = profile.city ? `, city ${sanitizeText(profile.city)}` : "";
    lines.push(
      `Wedding: ${sanitizeText(profile.bride_name)} & ${sanitizeText(profile.groom_name)}, wedding date ${formatDay(profile.wedding_date)}${city}.`,
    );
  }
  if (itinerary) {
    const revision = itinerary.published_revision === null ? "never published" : `published revision ${itinerary.published_revision}`;
    const pending = itinerary.unpublished_changes.length;
    lines.push(`Schedule: ${revision}; ${pending} unpublished draft change${pending === 1 ? "" : "s"}.`);
  }

  // Functions (allocate refs first, so vendors and guests can point at them)
  const eventRef = (event_id: string) => refs.byId[event_id] ?? null;
  if (itinerary) {
    lines.push("");
    lines.push("Functions (reference | kind | title | date | start-end | muhurat | venue | dress code | lead | expected headcount):");
    for (const fn of itinerary.functions) lines.push(functionLine(fn, refs.ref("EVT", fn.seed_key, fn.event_id)));

    if (itinerary.venues.length > 0) {
      lines.push("");
      lines.push("Venues (name | place | capacity):");
      for (const venue of itinerary.venues) {
        lines.push([sanitizeText(venue.name), or(sanitizeText(venue.place_name)), `seats ${or(venue.capacity)}`].join(" | "));
      }
    }
  }

  // Vendors (members), from the money summary's rows
  const vendorRows = money?.vendors ?? [];
  const vendorName = new Map<string, string>();
  if (vendorRows.length > 0) {
    lines.push("");
    lines.push("Vendors, in the order added (reference | name | category, with the role word that names it | status | functions):");
    for (const vendor of vendorRows) {
      const ref = refs.ref("VEN", vendor.seed_key, vendor.vendor_id);
      vendorName.set(vendor.vendor_id, `${ref} ${sanitizeText(vendor.name)}`);
      const functions = (reads.vendor_ledger?.[vendor.vendor_id]?.vendor.functions ?? [])
        .map((fn) => eventRef(fn.event_id))
        .filter((value): value is string => Boolean(value));
      // The role word (voice.md 2.5) only when it names exactly one vendor, so "the caterer" maps to one reference.
      const role = VENDOR_ROLE_HINT[vendor.vendor_category];
      const sameRole = vendorRows.filter((row) => row.vendor_category === vendor.vendor_category && !row.is_one_off).length;
      const category = role && !vendor.is_one_off && sameRole === 1 ? `${vendor.vendor_category} ("${role}")` : vendor.vendor_category;
      lines.push(
        [ref, sanitizeText(vendor.name), category, vendor.status, functions.length ? functions.join(", ") : "-"].join(" | "),
      );
    }
  }

  // Money (owners; managers with managers_can_see_vendor_dues)
  const ledgers = reads.vendor_ledger ? Object.values(reads.vendor_ledger) : [];
  const moneyVisible = vendorRows.length > 0 && ledgers.some((ledger) => ledger.commitments !== undefined || ledger.payments !== undefined);
  if (moneyVisible) {
    const commitmentLines: string[] = [];
    const paymentLines: string[] = [];
    for (const vendor of vendorRows) {
      const ledger = reads.vendor_ledger?.[vendor.vendor_id];
      if (!ledger) continue;
      const who = vendorName.get(vendor.vendor_id) ?? sanitizeText(vendor.name);
      for (const commitment of ledger.commitments ?? []) {
        if (commitment.voided) continue;
        const ref = refs.ref("COM", commitment.seed_key, commitment.commitment_id);
        const rate =
          commitment.pricing === "per_unit"
            ? `per_unit ${or(commitment.quantity)} ${or(commitment.unit)} x ${commitment.unit_price_inr === null ? "-" : formatInr(commitment.unit_price_inr)}`
            : "lump_sum";
        const fn = commitment.event_id ? (eventRef(commitment.event_id) ?? "-") : "-";
        commitmentLines.push(
          [ref, who, rate, `amount ${formatInr(commitment.amount_inr)}`, `function ${fn}`, `due ${formatDay(commitment.due_on)}`].join(" | "),
        );
      }
      for (const payment of ledger.payments ?? []) {
        if (payment.voided) continue;
        const ref = refs.ref("PAY", payment.seed_key, payment.payment_id);
        paymentLines.push(
          [
            ref,
            who,
            payment.payment_kind,
            formatInr(payment.amount_inr),
            payment.paid_on ? `paid ${formatDay(payment.paid_on)}` : "date not given",
            or(payment.method),
          ].join(" | "),
        );
      }
    }
    lines.push("");
    lines.push("Commitments, current versions (reference | vendor | pricing | amount | function | due):");
    lines.push(...(commitmentLines.length ? commitmentLines : ["none"]));
    lines.push("");
    lines.push("Payments, current versions (reference | vendor | kind | amount | date | method):");
    lines.push(...(paymentLines.length ? paymentLines : ["none"]));
  } else if (!isOwner) {
    hidden.push("money");
  }

  // Budget (owners; managers with managers_can_see_budget)
  if (money?.totals && money.categories) {
    lines.push("");
    lines.push(`Budget: total ${formatInr(money.totals.budget_inr)}. Category lines (category | planned):`);
    for (const line of money.categories) {
      if (!line.has_line || line.planned_inr === null) continue;
      lines.push(`${line.budget_category} | ${formatInr(line.planned_inr)}`);
    }
  } else if (!isOwner) {
    hidden.push("budget");
  }

  // People: members, households, named guests (synthetic guests only as a count)
  const members = reads.members ?? [];
  if (members.length > 0) {
    lines.push("");
    lines.push("Members (reference | name | role):");
    for (const member of members) {
      lines.push([refs.ref("MEM", member.seed_key, member.member_id), sanitizeText(member.display_name), member.role].join(" | "));
    }
  }

  const guests = new Map<string, { guest_id: string; seed_key: string | null; full_name: string; household_id: string; household_name: string; rsvps: string[]; pending: boolean }>();
  let syntheticCount = 0;
  for (const fn of guestList?.functions ?? []) {
    const fnRef = eventRef(fn.event_id) ?? sanitizeText(fn.title);
    if (fn.synthetic) syntheticCount = Math.max(syntheticCount, fn.synthetic.invited);
    for (const guest of fn.guests) {
      let entry = guests.get(guest.guest_id);
      if (!entry) {
        entry = {
          guest_id: guest.guest_id,
          seed_key: guest.seed_key,
          full_name: guest.full_name,
          household_id: guest.household_id,
          household_name: guest.household_name,
          rsvps: [],
          pending: false,
        };
        guests.set(guest.guest_id, entry);
      }
      entry.rsvps.push(`${fnRef} ${RSVP_CODE[guest.rsvp_status]}`);
      if (guest.rsvp_status === "pending") entry.pending = true;
    }
  }

  let households = reads.households ?? null;
  if (!households) {
    const seen = new Map<string, SnapshotHousehold>();
    for (const guest of guests.values()) {
      if (!seen.has(guest.household_id)) {
        seen.set(guest.household_id, { household_id: guest.household_id, seed_key: null, name: guest.household_name, relation: null });
      }
    }
    households = [...seen.values()];
  }
  data.households = households;
  if (households.length > 0) {
    lines.push("");
    lines.push("Households (reference | name | relation):");
    for (const household of households) {
      lines.push(
        [refs.ref("HH", household.seed_key, household.household_id), sanitizeText(household.name), or(sanitizeText(household.relation))].join(" | "),
      );
    }
  }
  if (guests.size > 0) {
    lines.push("");
    lines.push("Named guests (reference | name | household | invited functions with RSVP: A attending, D declined, P pending):");
    for (const guest of guests.values()) {
      const household = refs.byId[guest.household_id] ?? sanitizeText(guest.household_name);
      lines.push([refs.ref("GST", guest.seed_key, guest.guest_id), sanitizeText(guest.full_name), household, guest.rsvps.join(", ")].join(" | "));
    }
  }
  if (syntheticCount > 0) lines.push(`Plus ${syntheticCount} imported placeholder guests (counted in totals, never named).`);

  // Requirements
  const requirementLines: string[] = [];
  for (const fn of itinerary?.functions ?? []) {
    const fnRef = eventRef(fn.event_id) ?? "-";
    for (const requirement of fn.requirements) {
      requirementLines.push([refs.ref("REQ", requirement.seed_key, requirement.requirement_id), fnRef, sanitizeText(requirement.label)].join(" | "));
    }
  }
  if (requirementLines.length > 0) {
    lines.push("");
    lines.push("Requirements (reference | function | text):");
    lines.push(...requirementLines);
  }

  // Notes the planner saved (add_note): facts no other record holds, as saved.
  const notes = (reads.wedding_notes?.notes ?? []).slice(0, NOTES_LIMIT);
  if (notes.length > 0) {
    lines.push("");
    lines.push("Notes the planner saved, newest first (reference | topic | text):");
    for (const note of notes) {
      lines.push([refs.ref("NOTE", note.seed_key, note.note_id), sanitizeText(note.topic), sanitizeText(note.note_text)].join(" | "));
    }
  }

  // Recent activity (already filtered to what the speaker may see, L5)
  const entries = (reads.activity_feed?.entries ?? []).slice(0, ACTIVITY_LIMIT);
  if (entries.length > 0) {
    lines.push("");
    lines.push("Recent activity, newest first (who | when, IST | what):");
    for (const entry of entries) {
      const summary = screenLanguage === "hi" ? entry.summary_hi : entry.summary_en;
      const draft = entry.awaiting_publish ? " (draft; guests don't see it yet)" : "";
      lines.push([sanitizeText(entry.actor_label), istStamp(entry.occurred_at), `${sanitizeText(summary)}${draft}`].join(" | "));
    }
  }

  // Shagun: owners only, and only once Should #13 ships.
  if (!isOwner) hidden.push("shagun");
  else if (SHAGUN_IN_SNAPSHOT) {
    // Intentionally empty until #13 ships.
  }

  if (input.attached_asset_id) {
    lines.push("");
    lines.push(`Attached photo: ${ATTACHED_ASSET_REF} (a couple photo attached to this request).`);
  }

  data.ref_by_id = refs.byId;

  const keyterms = weddingKeyterms({
    other_function_titles: (itinerary?.functions ?? []).filter((fn) => fn.event_kind === "other").map((fn) => fn.title),
    couple_names: profile ? [profile.bride_name, profile.groom_name] : [],
    member_names: members.map((member) => member.display_name),
    venue_names: (itinerary?.venues ?? []).flatMap((venue) => [venue.name, ...(venue.place_name ? [venue.place_name] : [])]),
    vendor_names: vendorRows.map((vendor) => vendor.name),
    household_names: households.map((household) => household.name),
    guests: [...guests.values()].map((guest) => ({ full_name: guest.full_name, pending: guest.pending })),
  });

  return { text: lines.join("\n"), ref_map: refs.map, keyterms, today, data: data as Snapshot["data"], hidden };
}
