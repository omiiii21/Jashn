import "server-only";

import type { ReplyRegister } from "@/contracts/api";
import type { BudgetCategory, EventKind, IsoDate, SessionActor, WeddingId } from "@/contracts/domain";
import type {
  ActivityFeed,
  ActivityFeedParams,
  CateringEstimate,
  ExportJobStatusModel,
  Itinerary,
  ItineraryFunction,
  ItineraryVenue,
  MoneySummary,
  MoneySummaryVendorRow,
  ReadModelName,
  RsvpTotals,
  VendorLedger,
  WeddingProfile,
} from "@/contracts/read-models";
import type { Services } from "@/contracts/services";

import { normalizeForMatch } from "../normalize";
import { rereadField, readAmount } from "../numbers";
import type { HeardPhrase, ResolveContext, Snapshot, ToolAction } from "../types";

// ---------------------------------------------------------------------------
// Read access: the snapshot's read models first, then a read through services
// ---------------------------------------------------------------------------

export type ReadAccess = {
  profile(): Promise<WeddingProfile | null>;
  itinerary(): Promise<Itinerary | null>;
  money(): Promise<MoneySummary | null>;
  ledger(vendor_id: string): Promise<VendorLedger | null>;
  rsvp(event_id?: string): Promise<RsvpTotals | null>;
  catering(): Promise<CateringEstimate | null>;
  activity(params: ActivityFeedParams): Promise<ActivityFeed | null>;
  exports(): Promise<ExportJobStatusModel | null>;
  /** Members of the wedding, from the snapshot's People block when it has one. */
  members(): Promise<{ member_id: string; display_name: string; role: string; seed_key: string | null }[]>;
  vendors(): Promise<VendorRef[]>;
};

export type VendorRef = {
  vendor_id: string;
  seed_key: string | null;
  name: string;
  vendor_category: BudgetCategory;
  is_one_off: boolean;
};

export function createReadAccess(
  input: { actor: SessionActor; wedding_id: WeddingId | null; snapshot: Snapshot },
  services: Services,
): ReadAccess {
  const cache = new Map<string, Promise<unknown>>();
  const data = input.snapshot.data as Record<string, unknown>;

  async function read<T>(name: ReadModelName, params?: Record<string, unknown>): Promise<T | null> {
    if (!input.wedding_id) return null;
    const key = `${name}:${JSON.stringify(params ?? {})}`;
    if (!params || Object.keys(params).length === 0) {
      const fromSnapshot = data[name];
      if (fromSnapshot && typeof fromSnapshot === "object") return fromSnapshot as T;
    }
    if (!cache.has(key)) {
      const wedding_id = input.wedding_id;
      cache.set(
        key,
        services
          .read(name, { actor: input.actor, wedding_id, params } as never)
          .then((value) => value as unknown)
          .catch(() => null),
      );
    }
    return (await cache.get(key)) as T | null;
  }

  const access: ReadAccess = {
    profile: () => read<WeddingProfile>("wedding_profile"),
    itinerary: () => read<Itinerary>("itinerary"),
    money: () => read<MoneySummary>("money_summary"),
    async ledger(vendor_id) {
      const ledgers = data.vendor_ledgers ?? data.vendor_ledger;
      if (ledgers && typeof ledgers === "object") {
        const found = (ledgers as Record<string, unknown>)[vendor_id];
        if (found && typeof found === "object") return found as VendorLedger;
        if (Array.isArray(ledgers)) {
          const row = (ledgers as VendorLedger[]).find((entry) => entry?.vendor?.vendor_id === vendor_id);
          if (row) return row;
        }
      }
      return read<VendorLedger>("vendor_ledger", { vendor_id });
    },
    rsvp: (event_id) => read<RsvpTotals>("rsvp_totals", event_id ? { event_id } : undefined),
    catering: () => read<CateringEstimate>("catering_estimate"),
    activity: (params) => read<ActivityFeed>("activity_feed", params as Record<string, unknown>),
    exports: () => read<ExportJobStatusModel>("export_job_status"),
    async members() {
      const raw = data.members ?? data.team;
      const list = Array.isArray(raw) ? raw : raw && typeof raw === "object" && Array.isArray((raw as { members?: unknown }).members) ? (raw as { members: unknown[] }).members : [];
      const rows = list
        .filter((row): row is Record<string, unknown> => !!row && typeof row === "object")
        .map((row) => ({
          member_id: String(row.member_id ?? ""),
          display_name: String(row.display_name ?? ""),
          role: String(row.role ?? ""),
          seed_key: typeof row.seed_key === "string" ? row.seed_key : null,
        }))
        .filter((row) => row.member_id.length > 0);
      if (rows.length > 0) return rows;
      // Without a People block: the speaker, plus members named in the reference map.
      const profile = await access.profile();
      const out: { member_id: string; display_name: string; role: string; seed_key: string | null }[] = [];
      if (profile) out.push({ ...profile.member, seed_key: null });
      for (const [ref, id] of Object.entries(input.snapshot.ref_map)) {
        if (!ref.startsWith("MEM-") || out.some((row) => row.member_id === id)) continue;
        const name = ref.slice(4).toLowerCase();
        out.push({ member_id: id, display_name: name.charAt(0).toUpperCase() + name.slice(1), role: "", seed_key: ref });
      }
      return out;
    },
    async vendors() {
      const raw = data.vendors;
      if (Array.isArray(raw) && raw.length > 0) {
        return (raw as Record<string, unknown>[]).map((row) => ({
          vendor_id: String(row.vendor_id),
          seed_key: (row.seed_key as string | null) ?? null,
          name: String(row.name),
          vendor_category: row.vendor_category as BudgetCategory,
          is_one_off: Boolean(row.is_one_off),
        }));
      }
      const money = await access.money();
      if (money?.vendors) {
        return money.vendors.map((row: MoneySummaryVendorRow) => ({
          vendor_id: row.vendor_id,
          seed_key: row.seed_key,
          name: row.name,
          vendor_category: row.vendor_category,
          is_one_off: row.is_one_off,
        }));
      }
      // A manager without money sharing: the vendor block of each ledger.
      const out: VendorRef[] = [];
      for (const [ref, id] of Object.entries(input.snapshot.ref_map)) {
        if (!ref.startsWith("VEN-")) continue;
        const ledger = await access.ledger(id);
        if (ledger) {
          out.push({
            vendor_id: ledger.vendor.vendor_id,
            seed_key: ledger.vendor.seed_key,
            name: ledger.vendor.name,
            vendor_category: ledger.vendor.vendor_category,
            is_one_off: ledger.vendor.is_one_off,
          });
        }
      }
      return out;
    },
  };
  return access;
}

// ---------------------------------------------------------------------------
// Matching (2.5)
// ---------------------------------------------------------------------------

/** The normalised form plus 3.2's Latin folding (aa→a, ee→i, oo→u, w→v). */
export function fold(text: string): string {
  return normalizeForMatch(text)
    .replace(/aa/g, "a")
    .replace(/ee/g, "i")
    .replace(/oo/g, "u")
    .replace(/w/g, "v")
    .replace(/&/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when `needle` appears in `haystack` as whole words (both folded). */
export function hasWords(haystack: string, needle: string): boolean {
  const h = ` ${fold(haystack)} `;
  const n = fold(needle);
  if (n.length === 0) return false;
  return h.includes(` ${n} `);
}

export const EVENT_KIND_WORDS: Record<Exclude<EventKind, "other">, string[]> = {
  mehendi: ["mehendi", "mehndi", "mehandi", "मेहंदी", "मेहँदी"],
  haldi: ["haldi", "हल्दी"],
  sangeet: ["sangeet", "sangit", "संगीत"],
  wedding: ["wedding", "shaadi", "shadi", "vivah", "pheras", "phere", "शादी", "विवाह"],
  reception: ["reception", "रिसेप्शन"],
};

export const VENDOR_ROLE_WORDS: Partial<Record<BudgetCategory, string[]>> = {
  catering: ["caterer", "catering", "कैटरर", "khana wala", "खाना वाला"],
  decor: ["decorator", "decor", "डेकोरेटर", "सजावट", "sajavat"],
  photography: ["photographer", "photo", "video", "फ़ोटोग्राफ़र", "फोटोग्राफर"],
  music: ["dj", "music", "sound", "डीजे"],
  mehendi_makeup: ["mehendi artist", "mehendi wali", "makeup", "मेहंदी आर्टिस्ट", "मेहंदी वाली"],
  venue: ["venue", "hall", "वेन्यू"],
  invitations_gifts: ["printer"],
  attire: ["boutique", "tailor"],
};

/** The role word for a vendor category, as replies and questions say it. */
export const ROLE_WORD: Partial<Record<BudgetCategory, { en: string; hi: string }>> = {
  catering: { en: "caterer", hi: "कैटरर" },
  venue: { en: "venue", hi: "वेन्यू" },
  decor: { en: "decorator", hi: "डेकोरेटर" },
  photography: { en: "photographer", hi: "फ़ोटोग्राफ़र" },
  mehendi_makeup: { en: "mehendi artist", hi: "मेहंदी आर्टिस्ट" },
  music: { en: "DJ", hi: "डीजे" },
  invitations_gifts: { en: "printer", hi: "प्रिंटर" },
  attire: { en: "boutique", hi: "बुटीक" },
};

/** The `{role}` fill (4.2): the role word when only one vendor has it, else the name. */
export function roleOrName(vendor: VendorRef, vendors: VendorRef[]): { en: string; hi: string; is_role: boolean } {
  const role = ROLE_WORD[vendor.vendor_category];
  const sameRole = vendors.filter((row) => row.vendor_category === vendor.vendor_category && !row.is_one_off);
  if (role && sameRole.length === 1) return { ...role, is_role: true };
  return { en: vendor.name, hi: vendor.name, is_role: false };
}

export type Resolved<T> =
  | { ok: true; value: T }
  | { ok: false; reason: "missing" | "ambiguous" | "unknown"; candidates: T[]; heard: string | null };

function refValue(action: ToolAction, field: string): string | null {
  const value = action[field];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/** A function, by reference or kind word (2.5). */
export function resolveEvent(
  action: ToolAction,
  snapshot: Snapshot,
  itinerary: Itinerary | null,
  field = "event_id",
): Resolved<ItineraryFunction> {
  const functions = itinerary?.functions ?? [];
  const value = refValue(action, field);
  if (!value) return { ok: false, reason: "missing", candidates: functions, heard: null };
  const id = snapshot.ref_map[value];
  if (id) {
    const fn = functions.find((row) => row.event_id === id);
    if (fn) return { ok: true, value: fn };
  }
  const byId = functions.find((row) => row.event_id === value || row.seed_key === value);
  if (byId) return { ok: true, value: byId };
  // The kind word, or an `other` function's title.
  for (const [kind, words] of Object.entries(EVENT_KIND_WORDS)) {
    if (words.some((word) => hasWords(value, word))) {
      const matches = functions.filter((row) => row.event_kind === kind);
      if (matches.length === 1) return { ok: true, value: matches[0] };
      if (matches.length > 1) return { ok: false, reason: "ambiguous", candidates: matches, heard: value };
    }
  }
  const byTitle = functions.filter((row) => fold(row.title) === fold(value));
  if (byTitle.length === 1) return { ok: true, value: byTitle[0] };
  return { ok: false, reason: "unknown", candidates: functions, heard: value };
}

/** A vendor, by reference, name, one distinctive word or role word (2.5). */
export function resolveVendor(action: ToolAction, snapshot: Snapshot, vendors: VendorRef[], field = "vendor_id"): Resolved<VendorRef> {
  const value = refValue(action, field);
  if (!value) return { ok: false, reason: "missing", candidates: vendors, heard: null };
  const id = snapshot.ref_map[value];
  if (id) {
    const vendor = vendors.find((row) => row.vendor_id === id);
    if (vendor) return { ok: true, value: vendor };
  }
  const direct = vendors.find((row) => row.vendor_id === value || row.seed_key === value);
  if (direct) return { ok: true, value: direct };
  const byName = vendors.filter((row) => fold(row.name) === fold(value));
  if (byName.length === 1) return { ok: true, value: byName[0] };
  for (const [category, words] of Object.entries(VENDOR_ROLE_WORDS)) {
    if (words?.some((word) => hasWords(value, word))) {
      const matches = vendors.filter((row) => row.vendor_category === category && !row.is_one_off);
      if (matches.length === 1) return { ok: true, value: matches[0] };
      if (matches.length > 1) return { ok: false, reason: "ambiguous", candidates: matches, heard: value };
    }
  }
  const STOP = new Set(["the", "and", "ka", "ki", "ke", "ko"]);
  const words = fold(value)
    .split(" ")
    .filter((word) => word.length > 3 && !STOP.has(word));
  const byWord = vendors.filter((row) => words.some((word) => hasWords(row.name, word)));
  if (byWord.length === 1) return { ok: true, value: byWord[0] };
  if (byWord.length > 1) return { ok: false, reason: "ambiguous", candidates: byWord, heard: value };
  return { ok: false, reason: "unknown", candidates: vendors, heard: value };
}

/** A venue by name, then a distinctive word; "Lotus Hall, Mallige Gardens" matches at that place (2.5). */
export function resolveVenue(name: string, venues: ItineraryVenue[]): Resolved<ItineraryVenue> {
  const value = name.trim();
  const exact = venues.filter((row) => fold(row.name) === fold(value));
  if (exact.length === 1) return { ok: true, value: exact[0] };
  const [head, place] = value.split(",").map((part) => part.trim());
  if (place) {
    const atPlace = venues.filter((row) => fold(row.name) === fold(head) && row.place_name && fold(row.place_name) === fold(place));
    if (atPlace.length === 1) return { ok: true, value: atPlace[0] };
    const byHead = venues.filter((row) => fold(row.name) === fold(head));
    if (byHead.length === 1) return { ok: true, value: byHead[0] };
  }
  const GENERIC = new Set(["hall", "lawn", "garden", "gardens", "the", "mein", "me"]);
  const words = fold(head ?? value)
    .split(" ")
    .filter((word) => word.length > 2 && !GENERIC.has(word));
  const byWord = venues.filter((row) => words.some((word) => hasWords(row.name, word)));
  if (byWord.length === 1) return { ok: true, value: byWord[0] };
  if (byWord.length > 1) return { ok: false, reason: "ambiguous", candidates: byWord, heard: value };
  return { ok: false, reason: "unknown", candidates: [], heard: value };
}

/** A member by reference, display name, or "manager" when there is exactly one (2.5, O-04). */
export function resolveMember(
  value: string | null,
  snapshot: Snapshot,
  members: { member_id: string; display_name: string; role: string; seed_key: string | null }[],
): { member_id: string; display_name: string } | null {
  if (!value) return null;
  const id = snapshot.ref_map[value];
  if (id) {
    const found = members.find((row) => row.member_id === id);
    if (found) return found;
    const name = value.startsWith("MEM-") ? value.slice(4).toLowerCase() : value;
    return { member_id: id, display_name: name.charAt(0).toUpperCase() + name.slice(1) };
  }
  const byName = members.filter((row) => fold(row.display_name) === fold(value) || fold(row.display_name).split(" ")[0] === fold(value));
  if (byName.length === 1) return byName[0];
  if (/manager|मैनेजर/i.test(value)) {
    const managers = members.filter((row) => row.role === "manager");
    if (managers.length === 1) return managers[0];
  }
  return null;
}

// ---------------------------------------------------------------------------
// Values: the phrase re-read (3.1)
// ---------------------------------------------------------------------------

export const AMOUNT_FIELDS = new Set(["amount_inr", "unit_price_inr", "budget_inr", "previous_inr", "user_claim_inr"]);
export const COUNT_FIELDS = new Set(["quantity", "expected_guests", "expected_headcount", "plus_ones", "max_plus_ones"]);
export const DATE_FIELDS = new Set(["wedding_date", "event_date", "paid_on", "due_on", "received_on"]);
export const TIME_FIELDS = new Set(["start_time", "end_time", "muhurat_time"]);

export function isNumericField(field: string): boolean {
  return AMOUNT_FIELDS.has(field) || COUNT_FIELDS.has(field) || DATE_FIELDS.has(field) || TIME_FIELDS.has(field);
}

export function heardFor(action: ToolAction, field: string): string | null {
  const heard = (action.heard ?? []) as HeardPhrase[];
  const found = heard.find((item) => item.field === field);
  return found ? found.phrase : null;
}

export type ValueCheck =
  | { state: "ok"; phrase: string | null }
  | { state: "uncertain"; phrase: string | null; code_value: number | null; reason: "mismatch" | "not_found" | "unreadable" | "no_phrase" | "range" | "small" };

/** Re-reads one value from its heard phrase (3.1). */
export function checkValue(
  ctx: Pick<ResolveContext, "transcript" | "context" | "snapshot">,
  action: ToolAction,
  field: string,
  value: unknown,
  wedding_date: IsoDate | null,
  extra: {
    event_times?: { start_time?: string | null; end_time?: string | null; muhurat_time?: string | null } | null;
    draft_date_text?: string | null;
    draft_month?: number | null;
  } = {},
): ValueCheck {
  const phrase = heardFor(action, field);
  if (!isNumericField(field)) return { state: "ok", phrase };
  if (!phrase) return { state: "uncertain", phrase: null, code_value: null, reason: "no_phrase" };
  const transcripts = [ctx.transcript, ctx.context?.transcript ?? ""].map((text) => ` ${normalizeForMatch(text)} `);
  const needle = normalizeForMatch(phrase);
  const found = needle.length > 0 && transcripts.some((text) => text.includes(needle));
  const code_value = AMOUNT_FIELDS.has(field) ? safeReadAmount(phrase) : null;
  if (!found) return { state: "uncertain", phrase, code_value, reason: "not_found" };
  let verdict: "match" | "mismatch" | "unreadable";
  try {
    verdict = rereadField(field, value, phrase, {
      today: ctx.snapshot.today,
      wedding_date,
      transcript: `${ctx.transcript} ${ctx.context?.transcript ?? ""}`.trim(),
      ...extra,
    });
  } catch {
    verdict = "unreadable";
  }
  if (verdict === "match") return { state: "ok", phrase };
  return { state: "uncertain", phrase, code_value, reason: verdict };
}

function safeReadAmount(phrase: string): number | null {
  try {
    return readAmount(phrase);
  } catch {
    return null;
  }
}

/** True when the model listed the field in `missing_fields` (1.11 step 7), with or without an index prefix. */
export function modelMissing(missing: string[], index: number, field: string, single: boolean): boolean {
  return missing.some((entry) => entry === `${index}:${field}` || (single && entry === field) || (!entry.includes(":") && entry === field));
}

// ---------------------------------------------------------------------------
// Display (3.5, M7): dates "Sun 13 Dec 2026", short "20 Nov", times "7:00 pm"
// ---------------------------------------------------------------------------

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEEKDAYS_HI = ["रविवार", "सोमवार", "मंगलवार", "बुधवार", "गुरुवार", "शुक्रवार", "शनिवार"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const MONTHS_HI = ["जनवरी", "फ़रवरी", "मार्च", "अप्रैल", "मई", "जून", "जुलाई", "अगस्त", "सितंबर", "अक्टूबर", "नवंबर", "दिसंबर"];

function parts(date: IsoDate): { y: number; m: number; d: number; wd: number } {
  const [y, m, d] = date.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return { y, m, d, wd };
}

/** "Sun 13 Dec 2026". */
export function formatDate(date: IsoDate): string {
  const p = parts(date);
  return `${WEEKDAYS[p.wd]} ${p.d} ${MONTHS[p.m - 1]} ${p.y}`;
}

/** "20 Nov". */
export function formatShortDate(date: IsoDate): string {
  const p = parts(date);
  return `${p.d} ${MONTHS[p.m - 1]}`;
}

/** "14 December 2026" or "14 December". */
export function formatLongDate(date: IsoDate, withYear = true): string {
  const p = parts(date);
  return withYear ? `${p.d} ${MONTHS_LONG[p.m - 1]} ${p.y}` : `${p.d} ${MONTHS_LONG[p.m - 1]}`;
}

/** "Sunday 13 December". */
export function formatWeekdayDate(date: IsoDate): string {
  const p = parts(date);
  return `${WEEKDAYS_LONG[p.wd]} ${p.d} ${MONTHS_LONG[p.m - 1]}`;
}

/** "रविवार, 13 दिसंबर". */
export function formatWeekdayDateHi(date: IsoDate): string {
  const p = parts(date);
  return `${WEEKDAYS_HI[p.wd]}, ${p.d} ${MONTHS_HI[p.m - 1]}`;
}

export function monthName(month: number): string {
  return MONTHS_LONG[month - 1] ?? "";
}

/** "7:00 pm" (acceptance's style). */
export function formatTime(time: string | null): string {
  if (!time) return "";
  const [h, m] = time.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** "7 PM", "5:30 PM" for English speech and replies (3.5). */
export function speakTimeEn(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour} ${suffix}` : `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** The register's screen-language pick for card labels. */
export function pick<T>(register: ReplyRegister, en: T, hi: T): T {
  return register === "hi" ? hi : en;
}
