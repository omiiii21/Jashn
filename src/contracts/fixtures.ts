/**
 * The D0 demo state (demo-data.md) as DTOs: the wedding as the live demo starts.
 * Every id comes from `seededId(copy, table, seed_key)` (D100, D123), so the fixtures, the
 * seed and the tests agree. Table names are domain 5.1's. Importable from the browser and
 * from scripts: no `server-only`, no I/O.
 *
 * Checks that hold here (demo-data 14): budget ₹12,00,000; committed ₹9,27,000; paid
 * ₹3,97,000; the reception 250 invited, 229 attending, 9 declined, 12 pending; Tara (H16)
 * attending the Sangeet and pending for the Reception; the Reception's draft venue is
 * Banyan Hall, equal to REV-2.
 */
import { seededId, type SampleCopy } from "../db/ids";
import {
  BUDGET_CATEGORY_LABELS,
  EVENT_KIND_DEFAULT_TITLES,
  type ActivityEntryDto,
  type AssetDto,
  type BudgetCategory,
  type BudgetLineDto,
  type CommitmentDto,
  type CommitmentPricing,
  type CommitmentUnit,
  type EventDto,
  type EventKind,
  type GuestActor,
  type GuestContactDto,
  type GuestDto,
  type HouseholdDto,
  type InvitationDto,
  type InviteStyleDto,
  type IsoDate,
  type IsoInstant,
  type MemberDto,
  type PaymentDto,
  type PaymentKind,
  type PaymentMethod,
  type ProposalDto,
  type PublicationDto,
  type PublicationSnapshot,
  type QuoteDto,
  type RequirementCategory,
  type RequirementDto,
  type RsvpStatus,
  type SessionActor,
  type ShagunEntryDto,
  type SnapshotEvent,
  type VendorDto,
  type VenueDto,
  type WeddingDto,
} from "./domain";
import { exportKey, jobLabel, MAX_ATTEMPTS } from "./jobs";
import type { ExportJobView } from "./read-models";

// ---------------------------------------------------------------------------
// Clock
// ---------------------------------------------------------------------------

/** The demo day (Wed 25 Nov 2026, IST). Fixture read models compute "today" from this. */
export const FIXTURE_TODAY: IsoDate = "2026-11-25";
export const FIXTURE_NOW: IsoInstant = "2026-11-25T09:30:00+05:30";

const ist = (date: IsoDate, time: string): IsoInstant => `${date}T${time}:00+05:30`;

// ---------------------------------------------------------------------------
// Seed keys the fixtures choose where demo-data names none (Lane A's seed should reuse them)
// ---------------------------------------------------------------------------

export const SEED_KEYS = {
  wedding: "WEDDING",
  members: { mira: "MEM-MIRA", kabir: "MEM-KABIR", diya: "MEM-DIYA" },
  venues: {
    terrace: "VNU-TERRACE",
    courtyard: "VNU-COURTYARD",
    garden: "VNU-GARDEN",
    mandap: "VNU-MANDAP",
    banyan: "VNU-BANYAN",
    lotus: "VNU-LOTUS",
  },
  couple_photo: "ASSET-PHOTO",
  synthetic_household: "H-SYN",
  printer: "VEN-PRN",
  boutique: "VEN-BTQ",
  rev2_export_job: "JOB-EXP-R2-PNG",
} as const;

/** `G01`–`G40` for the named guests (demo-data 4.3's #), `G041`–`G250` for the placeholders. */
export const namedGuestKey = (n: number) => `G${String(n).padStart(2, "0")}`;
export const syntheticGuestKey = (n: number) => `G${String(n).padStart(3, "0")}`;
/** One invitation per guest per function: `INV-{guest}-{event}`. */
export const invitationKey = (guest_key: string, event_key: string) => `INV-${guest_key}-${event_key}`;
/** `VE-VEN-CAT-EVT-REC` (domain 3.7). */
export const vendorEventKey = (vendor_key: string, event_key: string) => `VE-${vendor_key}-${event_key}`;
/** `BL-catering`. */
export const budgetLineKey = (category: BudgetCategory) => `BL-${category}`;

// ---------------------------------------------------------------------------
// Raw demo-data tables
// ---------------------------------------------------------------------------

type EventKey = "EVT-HAL" | "EVT-MEH" | "EVT-SAN" | "EVT-WED" | "EVT-REC";
type VenueKey = keyof typeof SEED_KEYS.venues;

/** Haldi, Mehendi, Sangeet, Wedding, Reception: the column order of demo-data 4.3. */
const EVENT_ORDER: EventKey[] = ["EVT-HAL", "EVT-MEH", "EVT-SAN", "EVT-WED", "EVT-REC"];

const VENUES: { key: VenueKey; name: string; place: string; locality: string; address: string; capacity: number }[] = [
  { key: "terrace", name: "Terrace", place: "Deshpande family home", locality: "Jayanagar", address: "Fictional address, Jayanagar, Bengaluru", capacity: 60 },
  { key: "courtyard", name: "Courtyard Lawn", place: "Mallige Gardens", locality: "Whitefield", address: "Mallige Gardens, Whitefield, Bengaluru", capacity: 80 },
  { key: "garden", name: "Garden Hall", place: "Mallige Gardens", locality: "Whitefield", address: "Mallige Gardens, Whitefield, Bengaluru", capacity: 180 },
  { key: "mandap", name: "Mandap Lawn", place: "Mallige Gardens", locality: "Whitefield", address: "Mallige Gardens, Whitefield, Bengaluru", capacity: 250 },
  { key: "banyan", name: "Banyan Hall", place: "Mallige Gardens", locality: "Whitefield", address: "Mallige Gardens, Whitefield, Bengaluru", capacity: 220 },
  { key: "lotus", name: "Lotus Hall", place: "Mallige Gardens", locality: "Whitefield", address: "Mallige Gardens, Whitefield, Bengaluru", capacity: 300 },
];

const EVENTS: {
  key: EventKey;
  kind: EventKind;
  date: IsoDate;
  start: string;
  end: string;
  muhurat: string | null;
  venue: VenueKey;
  dress: string;
  lead: string;
  expected: number;
  description: string;
  version: number;
}[] = [
  { key: "EVT-HAL", kind: "haldi", date: "2026-12-13", start: "09:30", end: "11:30", muhurat: null, venue: "courtyard", dress: "Yellow; clothes that can get stained", lead: "Neelam Arora", expected: 30, description: "Joint haldi for both families. Turmeric paste from Sunita's family recipe.", version: 1 },
  { key: "EVT-MEH", kind: "mehendi", date: "2026-12-13", start: "15:00", end: "19:30", muhurat: null, venue: "terrace", dress: "Green and pink, festive casual", lead: "Sunita Deshpande", expected: 60, description: "Henna for the bride and family. Music and chai.", version: 2 },
  { key: "EVT-SAN", kind: "sangeet", date: "2026-12-13", start: "19:00", end: "23:00", muhurat: null, venue: "garden", dress: "Indo-western, some sparkle", lead: "Diya Fernandes", expected: 150, description: "Family dance performances, then the DJ.", version: 1 },
  { key: "EVT-WED", kind: "wedding", date: "2026-12-14", start: "10:30", end: "13:30", muhurat: "11:15", venue: "mandap", dress: "Traditional: sarees, kurtas, sherwanis; pastels", lead: "Anil Deshpande", expected: 180, description: "Pheras at the muhurat, then lunch.", version: 1 },
  { key: "EVT-REC", kind: "reception", date: "2026-12-14", start: "19:30", end: "23:00", muhurat: null, venue: "banyan", dress: "Formal evening", lead: "Diya Fernandes", expected: 250, description: "Dinner follows.", version: 1 },
];

const HOUSEHOLDS: { key: string; name: string; relation: string; primary: number; phone: string; email?: string }[] = [
  { key: "H01", name: "Deshpande", relation: "Mira's parents", primary: 2, phone: "+91 90000 00101" },
  { key: "H02", name: "Deshpande", relation: "Mira's brother's family", primary: 3, phone: "+91 90000 00201" },
  { key: "H03", name: "Kulkarni", relation: "Mira's maternal uncle (Mama)", primary: 6, phone: "+91 90000 00301" },
  { key: "H04", name: "Joshi", relation: "Mira's aunt (Bua)", primary: 9, phone: "+91 90000 00401" },
  { key: "H05", name: "Sharma", relation: "Deshpande family friends (\"Sharma ji\")", primary: 22, phone: "+91 90000 00501" },
  { key: "H06", name: "Rao", relation: "Mira's friend and her mother", primary: 29, phone: "+91 90000 00601" },
  { key: "H07", name: "Shenoy", relation: "Mira's friend and her husband", primary: 31, phone: "+91 90000 00701" },
  { key: "H08", name: "D'Souza", relation: "Mira's colleague and her husband", primary: 33, phone: "+91 90000 00801" },
  { key: "H09", name: "Arora", relation: "Kabir's parents", primary: 13, phone: "+91 90000 00901" },
  { key: "H10", name: "Arora", relation: "Kabir's grandmother (Dadi)", primary: 14, phone: "+91 90000 01001" },
  { key: "H11", name: "Bhalla", relation: "Kabir's sister's family", primary: 15, phone: "+91 90000 01101" },
  { key: "H12", name: "Arora", relation: "Kabir's uncle (Chacha)", primary: 18, phone: "+91 90000 01201" },
  { key: "H13", name: "Jain", relation: "Arora family friends", primary: 25, phone: "+91 90000 01301" },
  { key: "H14", name: "Siddiqui", relation: "Kabir's friend, his wife and mother", primary: 35, phone: "+91 90000 01401" },
  { key: "H15", name: "Iyer", relation: "Kabir's colleague and his wife", primary: 38, phone: "+91 90000 01501" },
  { key: "H16", name: "Bhat", relation: "Kabir's college friend", primary: 40, phone: "+91 90000 01601", email: "tara.guest@example.com" },
];

/**
 * demo-data 4.3. `rsvp` is Haldi, Mehendi, Sangeet, Wedding, Reception:
 * Y attending, N declined, P pending, - not invited.
 */
const NAMED_GUESTS: { name: string; hh: string; group: string; rsvp: string; dietary?: string; note?: string }[] = [
  { name: "Anil Deshpande", hh: "H01", group: "FAM-B", rsvp: "YYYYY" },
  { name: "Sunita Deshpande", hh: "H01", group: "FAM-B", rsvp: "YYYYY" },
  { name: "Rohan Deshpande", hh: "H02", group: "FAM-B", rsvp: "YYYYY" },
  { name: "Ishita Deshpande", hh: "H02", group: "FAM-B", rsvp: "YYYYY" },
  { name: "Myra Deshpande", hh: "H02", group: "FAM-B", rsvp: "YYYYY", dietary: "Peanut allergy", note: "Child, 6" },
  { name: "Prakash Kulkarni", hh: "H03", group: "FAM-B", rsvp: "YYYYY" },
  { name: "Vandana Kulkarni", hh: "H03", group: "FAM-B", rsvp: "YYYYY" },
  { name: "Aditya Kulkarni", hh: "H03", group: "FAM-B", rsvp: "PPYYY" },
  { name: "Meena Joshi", hh: "H04", group: "FAM-B", rsvp: "YYYYY" },
  { name: "Sameer Joshi", hh: "H04", group: "FAM-B", rsvp: "YYYYY" },
  { name: "Riya Joshi", hh: "H04", group: "FAM-B", rsvp: "NNYYY", note: "Arrives on the evening of 13 Dec" },
  { name: "Rakesh Arora", hh: "H09", group: "FAM-G", rsvp: "YYYYY" },
  { name: "Neelam Arora", hh: "H09", group: "FAM-G", rsvp: "YYYYY" },
  { name: "Kamla Arora", hh: "H10", group: "FAM-G", rsvp: "YYNYY", dietary: "Diabetic: sugar-free dessert" },
  { name: "Simran Bhalla", hh: "H11", group: "FAM-G", rsvp: "YYYYY" },
  { name: "Varun Bhalla", hh: "H11", group: "FAM-G", rsvp: "YYYYY" },
  { name: "Kiaan Bhalla", hh: "H11", group: "FAM-G", rsvp: "YYYYY", note: "Child, 8" },
  { name: "Naveen Arora", hh: "H12", group: "FAM-G", rsvp: "YYYYY" },
  { name: "Ritu Arora", hh: "H12", group: "FAM-G", rsvp: "YYYYY" },
  { name: "Dev Arora", hh: "H12", group: "FAM-G", rsvp: "PPPPP" },
  { name: "Anya Arora", hh: "H12", group: "FAM-G", rsvp: "PPPPP" },
  { name: "Ramesh Sharma", hh: "H05", group: "FF", rsvp: "--YYY" },
  { name: "Kavita Sharma", hh: "H05", group: "FF", rsvp: "--YYY" },
  { name: "Tanmay Sharma", hh: "H05", group: "FF", rsvp: "--NYY" },
  { name: "Mahesh Jain", hh: "H13", group: "FF", rsvp: "--YYY", dietary: "Jain (no onion, garlic or root vegetables)" },
  { name: "Sarita Jain", hh: "H13", group: "FF", rsvp: "--YYY", dietary: "Jain" },
  { name: "Nikhil Jain", hh: "H13", group: "FF", rsvp: "--YPP", dietary: "Jain" },
  { name: "Prachi Jain", hh: "H13", group: "FF", rsvp: "--YPP", dietary: "Jain" },
  { name: "Nisha Rao", hh: "H06", group: "FR-M", rsvp: "-YYYY" },
  { name: "Usha Rao", hh: "H06", group: "FR-M", rsvp: "-NNYY", dietary: "Low spice" },
  { name: "Aarti Shenoy", hh: "H07", group: "FR-M", rsvp: "-YYYY" },
  { name: "Kiran Shenoy", hh: "H07", group: "FR-M", rsvp: "-NYYY" },
  { name: "Leena D'Souza", hh: "H08", group: "FR-M", rsvp: "-YYYY" },
  { name: "Glen D'Souza", hh: "H08", group: "FR-M", rsvp: "-NNNN", note: "Travelling for work" },
  { name: "Yusuf Siddiqui", hh: "H14", group: "FR-K", rsvp: "--Y-Y" },
  { name: "Sana Siddiqui", hh: "H14", group: "FR-K", rsvp: "--Y-Y" },
  { name: "Rukhsana Siddiqui", hh: "H14", group: "FR-K", rsvp: "--N-N", note: "Sent Shagun instead" },
  { name: "Pranav Iyer", hh: "H15", group: "FR-K", rsvp: "--Y-Y" },
  { name: "Meghna Iyer", hh: "H15", group: "FR-K", rsvp: "--Y-P", dietary: "Gluten-free" },
  { name: "Tara Bhat", hh: "H16", group: "FR-K", rsvp: "--Y-P" },
];

/** demo-data 4.4: per tier, [attending, declined, pending] per function, or null when not invited. */
type Counts = [number, number, number] | null;
const PLACEHOLDER_TIERS: { group: string; size: number; counts: [Counts, Counts, Counts, Counts, Counts] }[] = [
  { group: "PH-1", size: 9, counts: [[8, 1, 0], [8, 1, 0], [8, 1, 0], [9, 0, 0], [9, 0, 0]] },
  { group: "PH-2", size: 24, counts: [null, [22, 1, 1], [23, 0, 1], [23, 1, 0], [23, 1, 0]] },
  { group: "PH-3", size: 77, counts: [null, null, [72, 2, 3], [72, 3, 2], [74, 2, 1]] },
  { group: "PH-4", size: 36, counts: [null, null, null, [32, 1, 3], [33, 1, 2]] },
  { group: "PH-5", size: 64, counts: [null, null, null, null, [58, 3, 3]] },
];

type MoneyRow = {
  key: string;
  vendor: string;
  pricing: CommitmentPricing;
  unit?: CommitmentUnit;
  unit_price?: number;
  quantity?: number;
  amount: number;
  event?: EventKey;
  description: string;
  agreed_on: IsoDate;
  due_on: IsoDate | null;
  quote?: string;
};

const VENDORS: {
  key: string;
  name: string;
  category: BudgetCategory;
  contact?: string;
  phone?: string;
  notes?: string;
  events: EventKey[];
  one_off?: boolean;
}[] = [
  { key: "VEN-CAT", name: "Annapoorna Caterers", category: "catering", contact: "Suresh", phone: "+91 90000 02001", notes: "Contracted: fixed minimum of 250 covers. Jain plates at the same ₹800.", events: ["EVT-REC"] },
  { key: "VEN-VEN", name: "Mallige Gardens", category: "venue", contact: "Events desk", phone: "+91 90000 02002", notes: "Any hall; includes the in-house kitchen.", events: ["EVT-HAL", "EVT-SAN", "EVT-WED", "EVT-REC"] },
  { key: "VEN-DEC", name: "Marigold Lane Decor", category: "decor", contact: "Ritika", phone: "+91 90000 02003", events: [...EVENT_ORDER] },
  { key: "VEN-PHO", name: "Frame & Phera Studio", category: "photography", contact: "Arvind", phone: "+91 90000 02004", events: [...EVENT_ORDER] },
  { key: "VEN-MEH", name: "Mehendi Mahal Artists", category: "mehendi_makeup", contact: "Zubeida", phone: "+91 90000 02005", events: ["EVT-MEH"] },
  { key: "VEN-DJ", name: "Bass Baraat Sound", category: "music", contact: "Joel", phone: "+91 90000 02006", events: ["EVT-SAN", "EVT-REC"] },
  { key: SEED_KEYS.printer, name: "Printer (fictional)", category: "invitations_gifts", events: [], one_off: true },
  { key: SEED_KEYS.boutique, name: "Boutique (fictional)", category: "attire", events: [], one_off: true },
];

const QUOTES: { key: string; vendor: string; pricing: CommitmentPricing; unit?: CommitmentUnit; unit_price?: number; quantity?: number; amount: number; event?: EventKey; description: string; quoted_on: IsoDate }[] = [
  { key: "QUO-01", vendor: "VEN-CAT", pricing: "per_unit", unit: "plate", unit_price: 850, quantity: 250, amount: 212_500, event: "EVT-REC", description: "Vegetarian reception dinner, Marathi and Punjabi", quoted_on: "2026-11-15" },
  { key: "QUO-02", vendor: "VEN-VEN", pricing: "lump_sum", amount: 310_000, description: "Package, 13–14 Dec, any hall", quoted_on: "2026-11-05" },
  { key: "QUO-03", vendor: "VEN-DEC", pricing: "lump_sum", amount: 165_000, description: "Decor for all five functions", quoted_on: "2026-11-14" },
  { key: "QUO-04", vendor: "VEN-PHO", pricing: "lump_sum", amount: 130_000, description: "Photo and video, all five", quoted_on: "2026-11-08" },
  { key: "QUO-05", vendor: "VEN-MEH", pricing: "lump_sum", amount: 30_000, description: "Bride, plus 20 guests", quoted_on: "2026-11-17" },
  { key: "QUO-06", vendor: "VEN-DJ", pricing: "lump_sum", amount: 60_000, description: "Sangeet and reception", quoted_on: "2026-11-18" },
];

const COMMITMENTS: MoneyRow[] = [
  { key: "COM-01", vendor: "VEN-CAT", pricing: "per_unit", unit: "plate", unit_price: 800, quantity: 250, amount: 200_000, event: "EVT-REC", description: "250 covers, fixed minimum", agreed_on: "2026-11-20", due_on: "2026-12-12", quote: "QUO-01" },
  { key: "COM-02", vendor: "VEN-VEN", pricing: "lump_sum", amount: 280_000, description: "Package, 13–14 Dec", agreed_on: "2026-11-10", due_on: "2026-12-01", quote: "QUO-02" },
  { key: "COM-03", vendor: "VEN-DEC", pricing: "lump_sum", amount: 150_000, description: "All five functions", agreed_on: "2026-11-18", due_on: "2026-12-10", quote: "QUO-03" },
  { key: "COM-04", vendor: "VEN-PHO", pricing: "lump_sum", amount: 110_000, description: "Photo and video, all five", agreed_on: "2026-11-12", due_on: "2026-12-14", quote: "QUO-04" },
  { key: "COM-05", vendor: "VEN-MEH", pricing: "lump_sum", amount: 25_000, description: "Bride, plus 20 guests", agreed_on: "2026-11-21", due_on: "2026-12-13", quote: "QUO-05" },
  { key: "COM-06", vendor: "VEN-DJ", pricing: "lump_sum", amount: 55_000, description: "Sangeet and reception", agreed_on: "2026-11-22", due_on: "2026-12-13", quote: "QUO-06" },
  { key: "EXP-01", vendor: SEED_KEYS.printer, pricing: "lump_sum", amount: 12_000, description: "Printed cards for elders, 100 cards", agreed_on: "2026-11-16", due_on: null },
  { key: "EXP-02", vendor: SEED_KEYS.boutique, pricing: "lump_sum", amount: 95_000, description: "Bridal lehenga", agreed_on: "2026-11-08", due_on: null },
];

const PAYMENTS: { key: string; vendor: string; commitment: string; kind: PaymentKind; amount: number; paid_on: IsoDate; method: PaymentMethod }[] = [
  { key: "PAY-01", vendor: "VEN-CAT", commitment: "COM-01", kind: "advance", amount: 50_000, paid_on: "2026-11-20", method: "upi" },
  { key: "PAY-02", vendor: "VEN-VEN", commitment: "COM-02", kind: "advance", amount: 140_000, paid_on: "2026-11-10", method: "bank_transfer" },
  { key: "PAY-03", vendor: "VEN-DEC", commitment: "COM-03", kind: "advance", amount: 50_000, paid_on: "2026-11-18", method: "upi" },
  { key: "PAY-04", vendor: "VEN-PHO", commitment: "COM-04", kind: "advance", amount: 30_000, paid_on: "2026-11-12", method: "upi" },
  { key: "PAY-05", vendor: "VEN-MEH", commitment: "COM-05", kind: "advance", amount: 5_000, paid_on: "2026-11-21", method: "cash" },
  { key: "PAY-06", vendor: "VEN-DJ", commitment: "COM-06", kind: "advance", amount: 15_000, paid_on: "2026-11-22", method: "upi" },
  { key: "EXP-01", vendor: SEED_KEYS.printer, commitment: "EXP-01", kind: "final", amount: 12_000, paid_on: "2026-11-16", method: "cash" },
  { key: "EXP-02", vendor: SEED_KEYS.boutique, commitment: "EXP-02", kind: "final", amount: 95_000, paid_on: "2026-11-08", method: "card" },
];

/** demo-data 5, in the order of domain 5.2. */
const BUDGET_PLAN: Record<BudgetCategory, number> = {
  venue: 300_000,
  catering: 240_000,
  decor: 160_000,
  photography: 120_000,
  attire: 150_000,
  music: 70_000,
  mehendi_makeup: 50_000,
  invitations_gifts: 40_000,
  transport: 30_000,
  contingency: 40_000,
};

const REQUIREMENTS: { key: string; event: EventKey; category: RequirementCategory; text: string; vendor?: string }[] = [
  { key: "REQ-01", event: "EVT-MEH", category: "other", text: "Natural henna only; no chemical \"black\" henna", vendor: "VEN-MEH" },
  { key: "REQ-02", event: "EVT-MEH", category: "logistics", text: "Floor cushions for 30, plus 10 chairs for elders" },
  { key: "REQ-03", event: "EVT-HAL", category: "decor", text: "Marigold décor; old bedsheets spread over the lawn", vendor: "VEN-DEC" },
  { key: "REQ-04", event: "EVT-SAN", category: "decor", text: "Marigold and fairy-light canopy over the stage", vendor: "VEN-DEC" },
  { key: "REQ-05", event: "EVT-SAN", category: "music", text: "Family dance slot at 21:00 (12 minutes); DJ plays 3 Marathi and 3 Punjabi songs", vendor: "VEN-DJ" },
  { key: "REQ-06", event: "EVT-WED", category: "ritual", text: "Mandap faces east; muhurat 11:15; pandit confirmed", vendor: "VEN-DEC" },
  { key: "REQ-07", event: "EVT-WED", category: "ritual", text: "Kanyadaan items checklist, kept by Sunita" },
  { key: "REQ-08", event: "EVT-REC", category: "catering", text: "Sugar-free dessert option, for Kamla Arora", vendor: "VEN-CAT" },
  { key: "REQ-09", event: "EVT-REC", category: "catering", text: "Peanut-free kids' counter, for Myra", vendor: "VEN-CAT" },
];

// ---------------------------------------------------------------------------
// The fixture shape
// ---------------------------------------------------------------------------

export type FixtureMember = MemberDto & { email: string };

export type DemoFixture = {
  copy: SampleCopy;
  today: IsoDate;
  now: IsoInstant;
  wedding: WeddingDto;
  /** `budgets.total_inr`. */
  budget_total_inr: number;
  members: FixtureMember[];
  budget_lines: BudgetLineDto[];
  venues: VenueDto[];
  events: EventDto[];
  invite_style: InviteStyleDto;
  assets: AssetDto[];
  publications: PublicationDto[];
  households: HouseholdDto[];
  guests: GuestDto[];
  guest_contacts: GuestContactDto[];
  invitations: InvitationDto[];
  vendors: VendorDto[];
  quotes: QuoteDto[];
  commitments: CommitmentDto[];
  payments: PaymentDto[];
  requirements: RequirementDto[];
  shagun_entries: ShagunEntryDto[];
  proposals: ProposalDto[];
  activity_entries: ActivityEntryDto[];
  export_jobs: ExportJobView[];
  /** The raw guest-link token per household seed key (fixtures only; the seed makes random ones). */
  guest_tokens: Record<string, string>;
};

/** Tara's fixture link token (43 base64url characters, like a real one). */
export const FIXTURE_TARA_TOKEN = `fixture-tara-h16-${"A".repeat(26)}`;

const RSVP_LETTER: Record<string, RsvpStatus> = { Y: "attending", N: "declined", P: "pending" };

function memberEmail(copy: SampleCopy, who: "mira" | "kabir" | "diya"): string {
  if (copy === "demo") {
    return { mira: "mira.owner@example.com", kabir: "kabir.owner@example.com", diya: "diya.manager@example.com" }[who];
  }
  return `${who}.${copy}@example.com`;
}

function buildFixture(copy: SampleCopy): DemoFixture {
  const id = (table: string, seed_key: string) => seededId(copy, table, seed_key);
  const weddingId = id("weddings", SEED_KEYS.wedding);
  const venueId = (key: VenueKey) => id("venues", SEED_KEYS.venues[key]);
  const eventId = (key: EventKey) => id("events", key);
  const vendorId = (key: string) => id("vendors", key);
  const guestId = (key: string) => id("guests", key);
  const memberId = (who: "mira" | "kabir" | "diya") => id("members", SEED_KEYS.members[who]);

  // Members (display names are the actor labels, domain 5.1)
  const members: FixtureMember[] = (
    [
      ["mira", "owner", "Mira", "en"],
      ["kabir", "owner", "Kabir", "en"],
      ["diya", "manager", "Diya", "en"],
    ] as const
  ).map(([who, role, display_name, preferred_language]) => ({
    member_id: memberId(who),
    seed_key: SEED_KEYS.members[who],
    // Auth user ids are made by Supabase at seed time; fixtures use a stable stand-in.
    user_id: id("auth.users", who),
    role,
    display_name,
    preferred_language,
    removed_at: null,
    email: memberEmail(copy, who),
  }));

  const venues: VenueDto[] = VENUES.map((venue) => ({
    venue_id: venueId(venue.key),
    seed_key: SEED_KEYS.venues[venue.key],
    name: venue.name,
    place_name: venue.place,
    locality: venue.locality,
    address: venue.address,
    capacity: venue.capacity,
    map_url: null,
  }));

  const events: EventDto[] = EVENTS.map((event, index) => {
    const titles = EVENT_KIND_DEFAULT_TITLES[event.kind];
    return {
      event_id: eventId(event.key),
      seed_key: event.key,
      event_kind: event.kind,
      title: titles?.en ?? event.key,
      title_hi: titles?.hi ?? event.key,
      event_date: event.date,
      start_time: event.start,
      end_time: event.end,
      muhurat_time: event.muhurat,
      venue_id: venueId(event.venue),
      dress_code: event.dress,
      description: event.description,
      lead_name: event.lead,
      expected_headcount: event.expected,
      sort_order: index + 1,
      version: event.version,
    };
  });

  const photoId = id("assets", SEED_KEYS.couple_photo);
  const assets: AssetDto[] = [
    {
      asset_id: photoId,
      seed_key: SEED_KEYS.couple_photo,
      asset_kind: "couple_photo",
      storage_path: `${weddingId}/${photoId}.jpg`,
      mime_type: "image/jpeg",
      // D126: the row exists from 10:45; the file and its fields arrive after the 11:40 deploy.
      bytes: null,
      width: null,
      height: null,
    },
  ];

  const invite_style: InviteStyleDto = {
    seed_key: SEED_KEYS.wedding,
    theme: "maroon_gold",
    typeface: "eczar",
    layout: "card_with_inserts",
    photo_frame: "mounted",
    photo_asset_id: photoId,
    heading_hi: "शुभ विवाह",
    wording_en: "invite you to celebrate their wedding",
    wording_hi: "आपकी उपस्थिति से हमें अत्यंत प्रसन्नता होगी।",
    blessing_line: "With the blessings of our families",
  };

  // Publications: REV-1 (no haldi, mehendi to 18:00) and REV-2 (= the D0 draft)
  const snapshotVenue = (venue: VenueDto) => ({
    venue_id: venue.venue_id,
    name: venue.name,
    place_name: venue.place_name,
    locality: venue.locality,
    address: venue.address,
    map_url: venue.map_url,
  });
  const snapshotEvent = (event: EventDto): SnapshotEvent => {
    const venue = venues.find((row) => row.venue_id === event.venue_id) ?? null;
    return {
      event_id: event.event_id,
      event_kind: event.event_kind,
      title: event.title,
      title_hi: event.title_hi,
      event_date: event.event_date,
      start_time: event.start_time,
      end_time: event.end_time,
      muhurat_time: event.muhurat_time,
      dress_code: event.dress_code,
      description: event.description,
      venue: venue ? snapshotVenue(venue) : null,
    };
  };
  const { seed_key: _styleKey, ...styleSnapshot } = invite_style;
  void _styleKey;
  const weddingSnapshot = { bride_name: "Mira", groom_name: "Kabir", city: "Bengaluru", wedding_date: "2026-12-14" };
  const rev1Events = events
    .filter((event) => event.seed_key !== "EVT-HAL")
    .map((event) => (event.seed_key === "EVT-MEH" ? { ...snapshotEvent(event), end_time: "18:00" } : snapshotEvent(event)));
  const rev2Events = events.map(snapshotEvent);
  const rev1: PublicationSnapshot = { wedding: weddingSnapshot, invite_style: styleSnapshot, events: rev1Events };
  const rev2: PublicationSnapshot = { wedding: weddingSnapshot, invite_style: styleSnapshot, events: rev2Events };
  const mira = members[0];
  const diya = members[2];
  const DRAFT_VERSION = 12;
  const publications: PublicationDto[] = [
    {
      publication_id: id("publications", "REV-1"),
      seed_key: "REV-1",
      revision: 1,
      snapshot: rev1,
      draft_version: 8,
      changes: [],
      note: null,
      published_by_member_id: mira.member_id,
      published_by_label: mira.display_name,
      published_at: ist("2026-11-22", "20:00"),
    },
    {
      publication_id: id("publications", "REV-2"),
      seed_key: "REV-2",
      revision: 2,
      snapshot: rev2,
      draft_version: DRAFT_VERSION,
      changes: [
        { entity: "event", entity_id: eventId("EVT-HAL"), field: "added", from: null, to: "Haldi" },
        { entity: "event", entity_id: eventId("EVT-MEH"), field: "end_time", from: "18:00", to: "19:30" },
      ],
      note: null,
      published_by_member_id: mira.member_id,
      published_by_label: mira.display_name,
      published_at: ist("2026-11-24", "21:00"),
    },
  ];

  const wedding: WeddingDto = {
    wedding_id: weddingId,
    seed_key: SEED_KEYS.wedding,
    bride_name: "Mira",
    groom_name: "Kabir",
    city: "Bengaluru",
    wedding_date: "2026-12-14",
    expected_guests: 250,
    timezone: "Asia/Kolkata",
    is_sample: true,
    // Mira shared "Vendors & dues" on 20 Nov; budget and contacts stay private (demo-data 1.3).
    managers_can_see_vendor_dues: true,
    managers_can_see_budget: false,
    managers_can_see_guest_contacts: false,
    version: 1040,
    draft_version: DRAFT_VERSION,
    published_revision: 2,
  };

  const budget_lines: BudgetLineDto[] = (Object.keys(BUDGET_PLAN) as BudgetCategory[]).map((category) => ({
    budget_category: category,
    seed_key: budgetLineKey(category),
    planned_inr: BUDGET_PLAN[category],
  }));

  // Households and guests
  const synthetic_household_id = id("households", SEED_KEYS.synthetic_household);
  const households: HouseholdDto[] = [
    ...HOUSEHOLDS.map((household) => ({
      household_id: id("households", household.key),
      seed_key: household.key,
      name: household.name,
      relation: household.relation,
      primary_guest_id: guestId(namedGuestKey(household.primary)),
      is_synthetic: false,
    })),
    {
      household_id: synthetic_household_id,
      seed_key: SEED_KEYS.synthetic_household,
      name: "Imported list (synthetic)",
      relation: null,
      primary_guest_id: null,
      is_synthetic: true,
    },
  ];

  const guests: GuestDto[] = [];
  const guest_contacts: GuestContactDto[] = [];
  const invitations: InvitationDto[] = [];
  const respondedAt = ist("2026-11-23", "18:00");

  NAMED_GUESTS.forEach((row, index) => {
    const key = namedGuestKey(index + 1);
    const gid = guestId(key);
    guests.push({
      guest_id: gid,
      seed_key: key,
      household_id: id("households", row.hh),
      full_name: row.name,
      group_label: row.group,
      dietary_note: row.dietary ?? null,
      note: row.note ?? null,
      is_synthetic: false,
    });
    const household = HOUSEHOLDS.find((entry) => entry.key === row.hh);
    if (household && household.primary === index + 1) {
      guest_contacts.push({ guest_id: gid, seed_key: key, phone: household.phone, email: household.email ?? null });
    }
    EVENT_ORDER.forEach((event_key, column) => {
      const letter = row.rsvp[column];
      if (letter === "-") return;
      const status = RSVP_LETTER[letter];
      const isTaraSangeet = row.hh === "H16" && event_key === "EVT-SAN";
      invitations.push({
        invitation_id: id("invitations", invitationKey(key, event_key)),
        seed_key: invitationKey(key, event_key),
        guest_id: gid,
        event_id: eventId(event_key),
        max_plus_ones: 0,
        rsvp_status: status,
        plus_ones: 0,
        responded_at: status === "pending" ? null : isTaraSangeet ? ist("2026-11-23", "21:10") : respondedAt,
        responded_via: status === "pending" ? null : isTaraSangeet ? "guest_link" : "member",
        revoked_at: null,
      });
    });
  });

  let syntheticNumber = 41;
  for (const tier of PLACEHOLDER_TIERS) {
    for (let position = 0; position < tier.size; position += 1) {
      const key = syntheticGuestKey(syntheticNumber);
      const gid = guestId(key);
      guests.push({
        guest_id: gid,
        seed_key: key,
        household_id: synthetic_household_id,
        full_name: `Imported guest ${String(syntheticNumber).padStart(3, "0")}`,
        group_label: tier.group,
        dietary_note: null,
        note: null,
        is_synthetic: true,
      });
      tier.counts.forEach((counts, column) => {
        if (!counts) return;
        const [attending, declined] = counts;
        const status: RsvpStatus =
          position < attending ? "attending" : position < attending + declined ? "declined" : "pending";
        const event_key = EVENT_ORDER[column];
        invitations.push({
          invitation_id: id("invitations", invitationKey(key, event_key)),
          seed_key: invitationKey(key, event_key),
          guest_id: gid,
          event_id: eventId(event_key),
          max_plus_ones: 0,
          rsvp_status: status,
          plus_ones: 0,
          responded_at: status === "pending" ? null : respondedAt,
          responded_via: status === "pending" ? null : "member",
          revoked_at: null,
        });
      });
      syntheticNumber += 1;
    }
  }

  // Vendors and money
  const vendors: VendorDto[] = VENDORS.map((vendor) => ({
    vendor_id: vendorId(vendor.key),
    seed_key: vendor.key,
    name: vendor.name,
    vendor_category: vendor.category,
    status: "booked",
    is_one_off: vendor.one_off ?? false,
    contact_name: vendor.contact ?? null,
    contact_phone: vendor.phone ?? null,
    notes: vendor.notes ?? null,
    event_ids: vendor.events.map(eventId),
  }));

  const quotes: QuoteDto[] = QUOTES.map((quote) => ({
    quote_id: id("quotes", quote.key),
    seed_key: quote.key,
    vendor_id: vendorId(quote.vendor),
    event_id: quote.event ? eventId(quote.event) : null,
    pricing: quote.pricing,
    unit: quote.unit ?? null,
    unit_price_inr: quote.unit_price ?? null,
    quantity: quote.quantity ?? null,
    amount_inr: quote.amount,
    description: quote.description,
    quoted_on: quote.quoted_on,
    valid_until: null,
    status: "accepted" as const,
  }));

  const commitments: CommitmentDto[] = COMMITMENTS.map((row) => ({
    commitment_id: id("commitments", row.key),
    seed_key: row.key,
    vendor_id: vendorId(row.vendor),
    quote_id: row.quote ? id("quotes", row.quote) : null,
    current_version_no: 1,
    voided_at: null,
    void_reason: null,
    versions: [
      {
        commitment_version_id: id("commitment_versions", `${row.key}/v1`),
        seed_key: `${row.key}/v1`,
        version_no: 1,
        pricing: row.pricing,
        unit: row.unit ?? null,
        unit_price_inr: row.unit_price ?? null,
        quantity: row.quantity ?? null,
        amount_inr: row.amount,
        event_id: row.event ? eventId(row.event) : null,
        description: row.description,
        agreed_on: row.agreed_on,
        due_on: row.due_on,
        change_reason: null,
        source: "ui",
        spoken_text: null,
        created_by_label: mira.display_name,
        created_at: ist(row.agreed_on, "12:00"),
        superseded_at: null,
      },
    ],
  }));

  const payments: PaymentDto[] = PAYMENTS.map((row) => ({
    payment_id: id("payments", row.key),
    seed_key: row.key,
    vendor_id: vendorId(row.vendor),
    commitment_id: id("commitments", row.commitment),
    payment_kind: row.kind,
    current_version_no: 1,
    voided_at: null,
    void_reason: null,
    versions: [
      {
        payment_version_id: id("payment_versions", `${row.key}/v1`),
        seed_key: `${row.key}/v1`,
        version_no: 1,
        amount_inr: row.amount,
        paid_on: row.paid_on,
        method: row.method,
        note: null,
        change_reason: null,
        source: "ui",
        voice_turn_id: null,
        spoken_text: null,
        created_by_label: mira.display_name,
        created_at: ist(row.paid_on, "12:30"),
        superseded_at: null,
      },
    ],
  }));

  const requirements: RequirementDto[] = REQUIREMENTS.map((row) => ({
    requirement_id: id("requirements", row.key),
    seed_key: row.key,
    event_id: eventId(row.event),
    requirement_category: row.category,
    text: row.text,
    quantity: null,
    vendor_id: row.vendor ? vendorId(row.vendor) : null,
  }));

  const shagun_entries: ShagunEntryDto[] = [
    { shagun_entry_id: id("shagun_entries", "SHG-01"), seed_key: "SHG-01", giver_name: "Kamla Arora (Dadi)", household_id: id("households", "H10"), amount_inr: 21_000, received_on: "2026-11-15", how: "At the roka", note: null, thanked_at: ist("2026-11-16", "11:00"), thanked_note: "Kabir called her on 16 Nov" },
    { shagun_entry_id: id("shagun_entries", "SHG-02"), seed_key: "SHG-02", giver_name: "Prakash & Vandana Kulkarni (Mama–Mami)", household_id: id("households", "H03"), amount_inr: 11_000, received_on: "2026-11-18", how: "Home visit", note: null, thanked_at: null, thanked_note: null },
    { shagun_entry_id: id("shagun_entries", "SHG-03"), seed_key: "SHG-03", giver_name: "Leena & Glen D'Souza", household_id: id("households", "H08"), amount_inr: 2_100, received_on: "2026-11-20", how: "UPI, recorded only", note: "Glen can't attend", thanked_at: null, thanked_note: null },
    { shagun_entry_id: id("shagun_entries", "SHG-04"), seed_key: "SHG-04", giver_name: "Rukhsana Siddiqui", household_id: id("households", "H14"), amount_inr: 1_100, received_on: "2026-11-22", how: "Cash via Yusuf", note: "She declined the functions", thanked_at: ist("2026-11-22", "19:00"), thanked_note: "Mira messaged her on 22 Nov" },
    { shagun_entry_id: id("shagun_entries", "SHG-05"), seed_key: "SHG-05", giver_name: "Naveen & Ritu Arora (Chacha–Chachi)", household_id: id("households", "H12"), amount_inr: 5_100, received_on: "2026-11-23", how: "Home visit", note: null, thanked_at: null, thanked_note: null },
  ];

  const prp01Id = id("proposals", "PRP-01");
  const proposalSummaryEn = `an expense of ₹15,000 to Dhol player (${BUDGET_CATEGORY_LABELS.music.en}), not yet paid`;
  const proposalSummaryHi = `Dhol player को ₹15,000 का खर्च (${BUDGET_CATEGORY_LABELS.music.hi}), अभी भुगतान नहीं हुआ`;
  const proposals: ProposalDto[] = [
    {
      proposal_id: prp01Id,
      seed_key: "PRP-01",
      command: "record_expense",
      input: {
        payee_name: "Dhol player",
        budget_category: "music",
        amount_inr: 15_000,
        paid_in_full: false,
        description: "Dhol player for the baraat",
      },
      reason: "Dhol player for the baraat",
      summary_en: proposalSummaryEn,
      summary_hi: proposalSummaryHi,
      vendor_id: null,
      budget_category: "music",
      committed_delta_inr: 15_000,
      paid_delta_inr: 0,
      status: "pending",
      proposed_by_member_id: diya.member_id,
      proposed_at: ist("2026-11-24", "19:15"),
      decided_by_member_id: null,
      decided_at: null,
      decision_reason: null,
    },
  ];

  // Activity: the 5 Diya items of demo-data 9.1 (D0 shows exactly these)
  const diyaEntry = (
    seq: number,
    occurred_at: IsoInstant,
    fields: Pick<ActivityEntryDto, "command" | "topic" | "entity_type" | "entity_id" | "summary_en" | "summary_hi" | "before" | "after" | "visibility" | "proposal_id">,
  ): ActivityEntryDto => ({
    activity_entry_id: id("activity_entries", `ACT-0${seq}`),
    seed_key: `ACT-0${seq}`,
    seq,
    occurred_at,
    actor_type: "member",
    actor_member_id: diya.member_id,
    actor_guest_id: null,
    actor_label: diya.display_name,
    source: "ui",
    voice_turn_id: null,
    spoken_text: null,
    ...fields,
  });
  const activity_entries: ActivityEntryDto[] = [
    diyaEntry(1, ist("2026-11-24", "16:05"), {
      command: "create_event",
      topic: "event.created",
      entity_type: "event",
      entity_id: eventId("EVT-HAL"),
      summary_en: "Diya added the haldi on Sun 13 Dec, 9:30 AM at Courtyard Lawn.",
      summary_hi: "Diya ने हल्दी जोड़ा: Sun 13 Dec, 9:30 AM, Courtyard Lawn।",
      before: null,
      after: { event_kind: "haldi", event_date: "2026-12-13", start_time: "09:30", end_time: "11:30", venue_id: venueId("courtyard") },
      visibility: "members",
      proposal_id: null,
    }),
    diyaEntry(2, ist("2026-11-24", "17:40"), {
      command: "update_event",
      topic: "event.updated",
      entity_type: "event",
      entity_id: eventId("EVT-MEH"),
      summary_en: "Diya changed the mehendi time from Sun 13 Dec, 6:00 PM to Sun 13 Dec, 7:30 PM.",
      summary_hi: "Diya ने मेहंदी का समय Sun 13 Dec, 6:00 PM से बदलकर Sun 13 Dec, 7:30 PM किया।",
      before: { end_time: "18:00" },
      after: { end_time: "19:30" },
      visibility: "members",
      proposal_id: null,
    }),
    diyaEntry(3, ist("2026-11-24", "19:15"), {
      command: "propose_change",
      topic: "proposal.created",
      entity_type: "proposal",
      entity_id: prp01Id,
      summary_en: `Diya proposed ${proposalSummaryEn}. It needs an owner's approval.`,
      summary_hi: `Diya ने प्रस्ताव भेजा: ${proposalSummaryHi}। मालिक की मंज़ूरी बाकी है।`,
      before: null,
      after: { command: "record_expense", amount_inr: 15_000, budget_category: "music", paid_in_full: false },
      visibility: "owners",
      proposal_id: prp01Id,
    }),
    diyaEntry(4, ist("2026-11-25", "08:30"), {
      command: "add_requirement",
      topic: "requirement.added",
      entity_type: "requirement",
      entity_id: id("requirements", "REQ-08"),
      summary_en: "Diya added a requirement to the reception: Sugar-free dessert option, for Kamla Arora.",
      summary_hi: "Diya ने रिसेप्शन में ज़रूरत जोड़ी: Sugar-free dessert option, for Kamla Arora।",
      before: null,
      after: { text: "Sugar-free dessert option, for Kamla Arora", requirement_category: "catering" },
      visibility: "members",
      proposal_id: null,
    }),
    diyaEntry(5, ist("2026-11-25", "08:45"), {
      command: "add_requirement",
      topic: "requirement.added",
      entity_type: "requirement",
      entity_id: id("requirements", "REQ-04"),
      summary_en: "Diya added a requirement to the sangeet: Marigold and fairy-light canopy over the stage.",
      summary_hi: "Diya ने संगीत में ज़रूरत जोड़ी: Marigold and fairy-light canopy over the stage।",
      before: null,
      after: { text: "Marigold and fairy-light canopy over the stage", requirement_category: "decor" },
      visibility: "members",
      proposal_id: null,
    }),
  ];

  // The REV-2 card (JOB-EXP-R2-PNG, completed 24 Nov 21:05): Ready, Banyan Hall
  const rev2JobId = id("export_jobs", SEED_KEYS.rev2_export_job);
  const export_jobs: ExportJobView[] = [
    {
      job_id: rev2JobId,
      seed_key: SEED_KEYS.rev2_export_job,
      job_label: jobLabel(2, "png"),
      export_key: exportKey(weddingId, 2, "png"),
      revision: 2,
      format: "png",
      status: "succeeded",
      label: "Ready",
      synthetic: false,
      attempts: 1,
      max_attempts: MAX_ATTEMPTS,
      renderer: "chromium",
      card_summary: "Mira & Kabir, Reception, Monday, 14 December 2026, Banyan Hall",
      card_functions: ["Reception"],
      last_error: null,
      notified_at: null,
      stalled: false,
      can_retry: false,
      out_of_date: false,
      // D15: Ready without a file until Lane D commits card-rev2.png; fixtures never sign URLs.
      download_url: null,
      created_at: ist("2026-11-24", "21:04"),
      updated_at: ist("2026-11-24", "21:05"),
      attempt_log: [
        {
          attempt_no: 1,
          trigger: "request",
          status: "succeeded",
          started_at: ist("2026-11-24", "21:04"),
          finished_at: ist("2026-11-24", "21:05"),
          error_code: null,
          renderer: "chromium",
          nudgebee_execution_id: null,
          approver: null,
          started_by: mira.display_name,
        },
      ],
    },
  ];

  return {
    copy,
    today: FIXTURE_TODAY,
    now: FIXTURE_NOW,
    wedding,
    budget_total_inr: 1_200_000,
    members,
    budget_lines,
    venues,
    events,
    invite_style,
    assets,
    publications,
    households,
    guests,
    guest_contacts,
    invitations,
    vendors,
    quotes,
    commitments,
    payments,
    requirements,
    shagun_entries,
    proposals,
    activity_entries,
    export_jobs,
    guest_tokens: { H16: FIXTURE_TARA_TOKEN },
  };
}

const cache = new Map<SampleCopy, DemoFixture>();

/** The D0 state of one sample copy, built once per copy (about 1,000 seeded ids). */
export function getDemoFixture(copy: SampleCopy = "demo"): DemoFixture {
  let fixture = cache.get(copy);
  if (!fixture) {
    fixture = buildFixture(copy);
    cache.set(copy, fixture);
  }
  return fixture;
}

// ---------------------------------------------------------------------------
// Actors
// ---------------------------------------------------------------------------

export type FixturePerson = "mira" | "kabir" | "diya";

/** The session actor for a seeded member of a copy, as Lane A's session helper returns it. */
export function fixtureSessionActor(person: FixturePerson = "mira", copy: SampleCopy = "demo"): SessionActor {
  const fixture = getDemoFixture(copy);
  const member = fixture.members.find((row) => row.seed_key === SEED_KEYS.members[person]);
  if (!member) throw new Error(`No fixture member ${person}`);
  return {
    kind: "member",
    user_id: member.user_id,
    email: member.email,
    display_name: member.display_name,
    wedding_id: fixture.wedding.wedding_id,
    member_id: member.member_id,
    role: member.role,
    is_internal: true,
    is_first_wedding: false,
    preferred_language: member.preferred_language,
  };
}

/** Tara's household (H16), as Lane A's guest token resolver returns it. */
export function fixtureGuestActor(copy: SampleCopy = "demo"): GuestActor {
  const fixture = getDemoFixture(copy);
  const household = fixture.households.find((row) => row.seed_key === "H16");
  if (!household) throw new Error("No fixture household H16");
  return {
    kind: "guest",
    wedding_id: fixture.wedding.wedding_id,
    household_id: household.household_id,
    household_name: household.name,
    guest_ids: fixture.guests.filter((guest) => guest.household_id === household.household_id).map((guest) => guest.guest_id),
    token_hash: "fixture-token-hash-h16",
  };
}

/** Convenience ids for the demo copy, for tests and stubs. */
export function fixtureIds(copy: SampleCopy = "demo") {
  const fixture = getDemoFixture(copy);
  const bySeed = <T extends { seed_key: string | null }>(rows: T[], key: string) => {
    const row = rows.find((entry) => entry.seed_key === key);
    if (!row) throw new Error(`No fixture row ${key}`);
    return row;
  };
  return {
    wedding_id: fixture.wedding.wedding_id,
    reception_event_id: bySeed(fixture.events, "EVT-REC").event_id,
    sangeet_event_id: bySeed(fixture.events, "EVT-SAN").event_id,
    caterer_vendor_id: bySeed(fixture.vendors, "VEN-CAT").vendor_id,
    caterer_commitment_id: bySeed(fixture.commitments, "COM-01").commitment_id,
    advance_payment_id: bySeed(fixture.payments, "PAY-01").payment_id,
    banyan_venue_id: bySeed(fixture.venues, SEED_KEYS.venues.banyan).venue_id,
    lotus_venue_id: bySeed(fixture.venues, SEED_KEYS.venues.lotus).venue_id,
    tara_guest_id: bySeed(fixture.guests, namedGuestKey(40)).guest_id,
    tara_household_id: bySeed(fixture.households, "H16").household_id,
    rev2_job_id: bySeed(fixture.export_jobs, SEED_KEYS.rev2_export_job).job_id,
    proposal_id: bySeed(fixture.proposals, "PRP-01").proposal_id,
  };
}
