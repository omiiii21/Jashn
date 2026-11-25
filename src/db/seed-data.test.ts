import { describe, expect, it } from "vitest";

import type { PublicationSnapshot, SnapshotChange } from "../contracts/domain";
import { getDemoFixture, SEED_KEYS } from "../contracts/fixtures";
import { exportKey } from "../contracts/jobs";
import { isUuidShaped, SAMPLE_COPIES, seededId, type SampleCopy } from "./ids";
import { buildItinerarySnapshot, diffSnapshots } from "./itinerary-snapshot";
import {
  buildSeedDataset,
  fallbackUserId,
  formatWhen,
  SEED_ID_TABLES,
  SEED_SOURCE,
  seedAccounts,
  type SeedDataset,
  type SeedRow,
  type SeedRows,
  type SeedTableKey,
} from "./seed-data";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const userIds = (copy: SampleCopy) => Object.fromEntries(seedAccounts(copy).map((a) => [a.email, fallbackUserId(a.email)]));
const build = (copy: SampleCopy) => buildSeedDataset(copy, { user_ids: userIds(copy) });

const datasets = new Map<SampleCopy, SeedDataset>(SAMPLE_COPIES.map((copy) => [copy, build(copy)]));
const dataset = (copy: SampleCopy = "a") => datasets.get(copy)!;

function rowsOf<K extends SeedTableKey>(ds: SeedDataset, table: K): SeedRow<K>[] {
  return (ds.rows[table] ?? []) as SeedRow<K>[];
}

/** Every (table, row) pair, the photo row included. */
function allRows(ds: SeedDataset): Array<[SeedTableKey, Record<string, unknown>]> {
  const out: Array<[SeedTableKey, Record<string, unknown>]> = [];
  for (const [table, rows] of Object.entries(ds.rows) as Array<[SeedTableKey, Record<string, unknown>[]]>) {
    for (const row of rows) out.push([table, row]);
  }
  out.push(["assets", ds.photo.row as Record<string, unknown>]);
  return out;
}

const bySeed = <T extends { seed_key?: string | null }>(rows: T[], key: string): T => {
  const row = rows.find((entry) => entry.seed_key === key);
  if (!row) throw new Error(`No row ${key}`);
  return row;
};

/** Current version per identity, for the M4/M5 sums. */
function moneyTotals(ds: SeedDataset) {
  const commitments = rowsOf(ds, "commitments");
  const versions = rowsOf(ds, "commitmentVersions");
  const payments = rowsOf(ds, "payments");
  const paymentVersions = rowsOf(ds, "paymentVersions");
  const committedBy = new Map<string, number>();
  const paidBy = new Map<string, number>();
  for (const c of commitments) {
    if (c.voided_at) continue;
    const current = versions.filter((v) => v.commitment_id === c.id && !v.superseded_at);
    expect(current).toHaveLength(1);
    committedBy.set(c.vendor_id, (committedBy.get(c.vendor_id) ?? 0) + current[0].amount_inr);
  }
  for (const p of payments) {
    if (p.voided_at) continue;
    const current = paymentVersions.filter((v) => v.payment_id === p.id && !v.superseded_at);
    expect(current).toHaveLength(1);
    paidBy.set(p.vendor_id, (paidBy.get(p.vendor_id) ?? 0) + current[0].amount_inr);
  }
  const vendorIds = rowsOf(ds, "vendors").map((v) => v.id as string);
  let committed = 0;
  let paid = 0;
  let outstanding = 0;
  for (const vendor_id of vendorIds) {
    const c = committedBy.get(vendor_id) ?? 0;
    const p = paidBy.get(vendor_id) ?? 0;
    committed += c;
    paid += p;
    outstanding += Math.max(c - p, 0);
  }
  return { committed, paid, outstanding, committedBy, paidBy };
}

/** Every uuid-shaped string anywhere in a value (row fields, arrays, JSON snapshots). */
function collectUuids(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") {
    if (isUuidShaped(value)) out.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectUuids(item, out);
  } else if (value && typeof value === "object" && !(value instanceof Date) && !Buffer.isBuffer(value)) {
    for (const item of Object.values(value)) collectUuids(item, out);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Acceptance 0.4, row D0
// ---------------------------------------------------------------------------

describe("D0 counts (acceptance 0.4, demo-data 14)", () => {
  it.each(SAMPLE_COPIES)("copy %s holds exactly the D0 rows", (copy) => {
    const ds = dataset(copy);
    const count = (table: SeedTableKey) => (ds.rows[table] ?? []).length;
    expect(count("weddings")).toBe(1);
    expect(count("budgets")).toBe(1);
    expect(count("budgetLines")).toBe(10);
    expect(count("members")).toBe(3);
    expect(count("events")).toBe(5);
    expect(count("venues")).toBe(6);
    expect(count("inviteStyles")).toBe(1);
    expect(count("households")).toBe(17); // 16 named + "Imported list (synthetic)"
    expect(rowsOf(ds, "guests").filter((g) => !g.is_synthetic)).toHaveLength(40);
    expect(rowsOf(ds, "guests").filter((g) => g.is_synthetic)).toHaveLength(210);
    expect(count("guestContacts")).toBe(16);
    expect(count("invitations")).toBe(30 + 60 + 150 + 180 + 250);
    expect(count("vendors")).toBe(8);
    expect(count("vendorEvents")).toBe(1 + 4 + 5 + 5 + 1 + 2);
    expect(count("quotes")).toBe(6);
    expect(count("commitments")).toBe(8);
    expect(count("commitmentVersions")).toBe(8);
    expect(count("payments")).toBe(8);
    expect(count("paymentVersions")).toBe(8);
    expect(count("requirements")).toBe(9);
    expect(count("shagunEntries")).toBe(5);
    expect(count("proposals")).toBe(1);
    expect(count("activityEntries")).toBe(5);
    expect(count("publications")).toBe(2);
    expect(count("exportJobs")).toBe(1);
    expect(count("exportAttempts")).toBe(1);
    // Never seeded as rows: links (random tokens), receipts, voice and the operational tables.
    for (const table of ["invitationLinks", "memberInvites", "commandReceipts", "voiceTurns", "experimentExposures", "cardImports", "assets"] as const) {
      expect(ds.rows[table]).toBeUndefined();
    }
    expect(ds.link_households).toEqual(Array.from({ length: 16 }, (_, i) => `H${String(i + 1).padStart(2, "0")}`));
  });

  it("the wedding row is the sample copy at revision 2", () => {
    const wedding = rowsOf(dataset(), "weddings")[0];
    expect(wedding).toMatchObject({
      bride_name: "Mira",
      groom_name: "Kabir",
      city: "Bengaluru",
      wedding_date: "2026-12-14",
      is_sample: true,
      published_revision: 2,
      managers_can_see_vendor_dues: true,
      managers_can_see_budget: false,
      managers_can_see_guest_contacts: false,
      seed_key: SEED_KEYS.wedding,
    });
    expect(wedding.draft_version).toBe(bySeed(rowsOf(dataset(), "publications"), "REV-2").draft_version);
    expect(rowsOf(dataset(), "budgets")[0].total_inr).toBe(1_200_000);
  });

  it("money at D0: committed ₹9,27,000, paid ₹3,97,000, outstanding ₹5,30,000; the caterer ₹2,00,000 / ₹50,000", () => {
    const ds = dataset();
    const totals = moneyTotals(ds);
    expect(totals.committed).toBe(927_000);
    expect(totals.paid).toBe(397_000);
    expect(totals.outstanding).toBe(530_000);
    const caterer = bySeed(rowsOf(ds, "vendors"), "VEN-CAT").id as string;
    expect(totals.committedBy.get(caterer)).toBe(200_000);
    expect(totals.paidBy.get(caterer)).toBe(50_000);
    const lines = rowsOf(ds, "budgetLines");
    expect(lines.reduce((sum, line) => sum + line.planned_inr, 0)).toBe(1_200_000);
    expect(1_200_000 - totals.committed).toBe(273_000);
    // PRP-01 is pending and in no total (A5).
    expect(bySeed(rowsOf(ds, "proposals"), "PRP-01")).toMatchObject({ status: "pending", committed_delta_inr: 15_000, paid_delta_inr: 0 });
  });

  it("COM-01 v1 is ₹800 × 250 plates for the reception; PAY-01 has one version of ₹50,000", () => {
    const ds = dataset();
    const com01 = bySeed(rowsOf(ds, "commitmentVersions"), "COM-01/v1");
    expect(com01).toMatchObject({
      pricing: "per_unit",
      unit: "plate",
      unit_price_inr: 800,
      quantity: 250,
      amount_inr: 200_000,
      event_id: bySeed(rowsOf(ds, "events"), "EVT-REC").id,
      description: "250 × ₹800, fixed minimum",
      superseded_at: null,
      source: SEED_SOURCE,
    });
    const pay01 = bySeed(rowsOf(ds, "payments"), "PAY-01").id;
    const versions = rowsOf(ds, "paymentVersions").filter((v) => v.payment_id === pay01);
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({ seed_key: "PAY-01/v1", version_no: 1, amount_inr: 50_000, paid_on: "2026-11-20", method: "upi" });
    expect(bySeed(rowsOf(ds, "quotes"), "QUO-01")).toMatchObject({ unit_price_inr: 850, quantity: 250, amount_inr: 212_500 });
  });

  it("activity: five Diya entries with demo-data's times; Diya's feed shows 4 (ACT-03 is owners-only)", () => {
    const entries = rowsOf(dataset(), "activityEntries");
    expect(entries.map((e) => e.seed_key)).toEqual(["ACT-01", "ACT-02", "ACT-03", "ACT-04", "ACT-05"]);
    expect(entries.map((e) => (e.occurred_at as Date).toISOString())).toEqual([
      "2026-11-24T10:35:00.000Z", // 16:05 IST
      "2026-11-24T12:10:00.000Z", // 17:40 IST
      "2026-11-24T13:45:00.000Z", // 19:15 IST
      "2026-11-25T03:00:00.000Z", // 08:30 IST
      "2026-11-25T03:15:00.000Z", // 08:45 IST
    ]);
    expect(entries.every((e) => e.actor_label === "Diya" && e.actor_type === "member" && e.source === SEED_SOURCE)).toBe(true);
    expect(entries.every((e) => e.seq === undefined)).toBe(true);
    expect(entries.filter((e) => e.visibility === "members")).toHaveLength(4);
    expect(bySeed(entries, "ACT-03").visibility).toBe("owners");
  });

  it("activity lines follow domain section 3's templates (D23)", () => {
    const entries = rowsOf(dataset(), "activityEntries");
    expect(entries.map((e) => e.summary_en)).toEqual([
      "Diya added the haldi on Sun 13 Dec, 9:30 AM at Courtyard Lawn.",
      "Diya changed the mehendi time from Sun 13 Dec, 6:00 PM to Sun 13 Dec, 7:30 PM.",
      "Diya proposed an expense of ₹15,000 to Dhol player (Music and entertainment), not yet paid. It needs an owner's approval.",
      'Diya added "Sugar-free dessert option, for Kamla Arora" to the reception.',
      'Diya added "Marigold and fairy-light canopy over the stage" to the sangeet.',
    ]);
    expect(bySeed(entries, "ACT-03").summary_hi).toBe(
      "Diya ने प्रस्ताव भेजा: Dhol player को ₹15,000 का खर्च (संगीत और मनोरंजन), भुगतान बाकी। मालिक की मंज़ूरी बाकी है।",
    );
    expect(bySeed(entries, "ACT-04").summary_hi).toBe("Diya ने रिसेप्शन में ज़रूरत जोड़ी: Sugar-free dessert option, for Kamla Arora।");
  });

  it("formatWhen writes the templates' 'Mon 14 Dec, 7:30 PM' form", () => {
    expect(formatWhen("2026-12-14", "19:30")).toBe("Mon 14 Dec, 7:30 PM");
    expect(formatWhen("2026-12-13", "09:30")).toBe("Sun 13 Dec, 9:30 AM");
    expect(formatWhen("2026-11-25", "12:00")).toBe("Wed 25 Nov, 12:00 PM");
    expect(formatWhen("2026-11-25", "00:15")).toBe("Wed 25 Nov, 12:15 AM");
  });
});

// ---------------------------------------------------------------------------
// PRP-01, ACT-03 (D91) and the reception (open question 16)
// ---------------------------------------------------------------------------

describe("seeded text", () => {
  it("PRP-01's and ACT-03's summaries end ', not yet paid' (D91)", () => {
    const ds = dataset();
    const prp = bySeed(rowsOf(ds, "proposals"), "PRP-01");
    expect(prp.summary_en).toBe("an expense of ₹15,000 to Dhol player (Music and entertainment), not yet paid");
    expect(prp.summary_en.endsWith(", not yet paid")).toBe(true);
    expect(prp.summary_hi).toBe("Dhol player को ₹15,000 का खर्च (संगीत और मनोरंजन), भुगतान बाकी");
    const act03 = bySeed(rowsOf(ds, "activityEntries"), "ACT-03");
    expect(act03.summary_en.replace(" It needs an owner's approval.", "").endsWith(", not yet paid.")).toBe(true);
    expect(act03.proposal_id).toBe(prp.id);
    expect(act03.entity_id).toBe(prp.id);
    expect(prp).toMatchObject({
      command: "record_expense",
      input: { payee_name: "Dhol player", budget_category: "music", amount_inr: 15_000, paid_in_full: false, description: "For the baraat" },
      vendor_id: null,
      budget_category: "music",
      proposed_by_member_id: bySeed(rowsOf(ds, "members"), SEED_KEYS.members.diya).id,
    });
  });

  it('the reception\'s description is "Dinner follows." in the draft and in REV-2', () => {
    const ds = dataset();
    const reception = bySeed(rowsOf(ds, "events"), "EVT-REC");
    expect(reception.description).toBe("Dinner follows.");
    const rev2 = bySeed(rowsOf(ds, "publications"), "REV-2").snapshot as unknown as PublicationSnapshot;
    expect(rev2.events.find((e) => e.event_id === reception.id)?.description).toBe("Dinner follows.");
    const everyText = JSON.stringify(ds.rows.events) + JSON.stringify(ds.rows.publications);
    expect(everyText).not.toContain("Annapoorna");
  });
});

// ---------------------------------------------------------------------------
// AT-4.8 and AT-13.1 from the stored rows
// ---------------------------------------------------------------------------

describe("AT-4.8: the reply table from stored rows", () => {
  it.each(["demo", "a"] as const)("copy %s", (copy) => {
    const ds = dataset(copy);
    const events = rowsOf(ds, "events");
    const invitations = rowsOf(ds, "invitations").filter((i) => !i.revoked_at);
    const table = ["EVT-HAL", "EVT-MEH", "EVT-SAN", "EVT-WED", "EVT-REC"].map((key) => {
      const event = bySeed(events, key);
      const rows = invitations.filter((i) => i.event_id === event.id);
      const by = (status: string) => rows.filter((i) => i.rsvp_status === status).length;
      return [event.title, rows.length, by("attending"), by("declined"), by("pending"), event.expected_headcount];
    });
    expect(table).toEqual([
      ["Haldi", 30, 25, 2, 3, 30],
      ["Mehendi", 60, 50, 6, 4, 60],
      ["Sangeet", 150, 136, 8, 6, 150],
      ["Wedding", 180, 165, 6, 9, 180],
      ["Reception", 250, 229, 9, 12, 250],
    ]);
  });

  it("Tara (H16) is attending the sangeet and pending for the reception, and has a phone contact", () => {
    const ds = dataset();
    const tara = bySeed(rowsOf(ds, "guests"), "G40");
    expect(tara.full_name).toBe("Tara Bhat");
    expect(tara.household_id).toBe(bySeed(rowsOf(ds, "households"), "H16").id);
    const mine = rowsOf(ds, "invitations").filter((i) => i.guest_id === tara.id);
    const status = (key: string) => mine.find((i) => i.event_id === bySeed(rowsOf(ds, "events"), key).id)?.rsvp_status;
    expect(mine).toHaveLength(2);
    expect(status("EVT-SAN")).toBe("attending");
    expect(status("EVT-REC")).toBe("pending");
    expect(bySeed(rowsOf(ds, "guestContacts"), "G40")).toMatchObject({ guest_id: tara.id, phone: "+91 90000 01601", email: "tara.guest@example.com" });
    // Every invitation is pending with no plus-ones, or answered by a member or Tara's link (R2, R3).
    for (const invitation of rowsOf(ds, "invitations")) {
      expect(invitation.max_plus_ones).toBe(0);
      expect(invitation.plus_ones).toBe(0);
      expect(invitation.rsvp_status === "pending").toBe(invitation.responded_at === null);
    }
  });

  it("the 210 imported guests sit in one synthetic household with no contacts", () => {
    const ds = dataset();
    const synthetic = bySeed(rowsOf(ds, "households"), SEED_KEYS.synthetic_household);
    expect(synthetic).toMatchObject({ name: "Imported list (synthetic)", is_synthetic: true, primary_guest_id: null });
    const guests = rowsOf(ds, "guests").filter((g) => g.household_id === synthetic.id);
    expect(guests).toHaveLength(210);
    expect(guests[0].full_name).toBe("Imported guest 041");
    expect(guests[209].full_name).toBe("Imported guest 250");
    const contactIds = new Set(rowsOf(ds, "guestContacts").map((c) => c.guest_id));
    expect(guests.some((g) => contactIds.has(g.id as string))).toBe(false);
  });
});

describe("AT-13.1: the register at D0", () => {
  it("lists the five gifts, ₹40,300 received and 3 thank-yous pending", () => {
    const ds = dataset();
    const households = rowsOf(ds, "households");
    const entries = rowsOf(ds, "shagunEntries");
    const view = entries.map((e) => ({
      from: e.giver_name,
      household: households.find((h) => h.id === e.household_id)?.seed_key,
      amount: e.amount_inr,
      received: e.received_on,
      how: e.how,
      thanked: e.thanked_at !== null,
    }));
    expect(view).toEqual([
      { from: "Kamla Arora (Dadi)", household: "H10", amount: 21_000, received: "2026-11-15", how: "At the roka", thanked: true },
      { from: "Prakash & Vandana Kulkarni (Mama–Mami)", household: "H03", amount: 11_000, received: "2026-11-18", how: "Home visit", thanked: false },
      { from: "Leena & Glen D'Souza", household: "H08", amount: 2_100, received: "2026-11-20", how: "UPI, recorded only", thanked: false },
      { from: "Rukhsana Siddiqui", household: "H14", amount: 1_100, received: "2026-11-22", how: "Cash via Yusuf", thanked: true },
      { from: "Naveen & Ritu Arora (Chacha–Chachi)", household: "H12", amount: 5_100, received: "2026-11-23", how: "Home visit", thanked: false },
    ]);
    expect(bySeed(entries, "SHG-01").thanked_note).toBe("Kabir called her on 16 Nov");
    expect(entries.reduce((sum, e) => sum + e.amount_inr, 0)).toBe(40_300);
    expect(entries.filter((e) => e.thanked_at === null)).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// Seed keys and ids (D100, D123; domain 5.0)
// ---------------------------------------------------------------------------

describe("seed keys and fixed ids", () => {
  it.each(SAMPLE_COPIES)("copy %s: every row has a seed_key, and its id is seededId(copy, table, seed_key)", (copy) => {
    const ds = dataset(copy);
    const weddingId = seededId(copy, "weddings", SEED_KEYS.wedding);
    expect(ds.wedding_id).toBe(weddingId);
    for (const [table, row] of allRows(ds)) {
      const seed_key = row.seed_key;
      expect(typeof seed_key === "string" && seed_key.length > 0, `${table} row without a seed_key`).toBe(true);
      if (table !== "weddings") expect(row.wedding_id, `${table} ${seed_key}`).toBe(weddingId);
      const domainTable = (SEED_ID_TABLES as Partial<Record<SeedTableKey, string>>)[table];
      if (domainTable) {
        expect(row.id, `${table} ${seed_key}`).toBe(seededId(copy, domainTable, seed_key as string));
      } else if (table === "budgets" || table === "inviteStyles") {
        expect(seed_key).toBe(SEED_KEYS.wedding);
      } else if (table === "guestContacts") {
        expect(row.guest_id).toBe(seededId(copy, "guests", seed_key as string));
      } else if (table === "vendorEvents") {
        const [vendorKey, eventKey] = [...(seed_key as string).matchAll(/(VEN-[A-Z]+|EVT-[A-Z]+)/g)].map((m) => m[1]);
        expect(seed_key).toBe(`VE-${vendorKey}-${eventKey}`);
        expect(row.vendor_id).toBe(seededId(copy, "vendors", vendorKey));
        expect(row.event_id).toBe(seededId(copy, "events", eventKey));
      } else {
        throw new Error(`Unexpected table ${table}`);
      }
    }
  });

  it("seed keys are unique per table, and the shapes follow domain 5.0", () => {
    const ds = dataset();
    for (const [table, rows] of Object.entries(ds.rows) as Array<[string, Array<{ seed_key?: string | null }>]>) {
      const keys = rows.map((row) => row.seed_key);
      expect(new Set(keys).size, table).toBe(keys.length);
    }
    const keys = (table: SeedTableKey) => (ds.rows[table] as Array<{ seed_key?: string | null }>).map((r) => r.seed_key);
    expect(keys("paymentVersions")).toContain("PAY-01/v1");
    expect(keys("commitmentVersions")).toContain("COM-01/v1");
    expect(keys("invitations")).toContain("INV-G40-EVT-REC");
    expect(keys("vendorEvents")).toContain("VE-VEN-CAT-EVT-REC");
    expect(keys("budgetLines")).toContain("BL-catering");
  });

  it("the seeded ids are the fixtures' ids (fixtures and seed agree)", () => {
    for (const copy of ["demo", "a"] as const) {
      const ds = dataset(copy);
      const f = getDemoFixture(copy);
      const ids = new Set(allRows(ds).map(([, row]) => row.id as string | undefined).filter(Boolean));
      const fixtureIds = [
        f.wedding.wedding_id,
        ...f.members.map((r) => r.member_id),
        ...f.venues.map((r) => r.venue_id),
        ...f.events.map((r) => r.event_id),
        ...f.assets.map((r) => r.asset_id),
        ...f.publications.map((r) => r.publication_id),
        ...f.households.map((r) => r.household_id),
        ...f.guests.map((r) => r.guest_id),
        ...f.invitations.map((r) => r.invitation_id),
        ...f.vendors.map((r) => r.vendor_id),
        ...f.quotes.map((r) => r.quote_id),
        ...f.commitments.flatMap((r) => [r.commitment_id, ...r.versions.map((v) => v.commitment_version_id)]),
        ...f.payments.flatMap((r) => [r.payment_id, ...r.versions.map((v) => v.payment_version_id)]),
        ...f.requirements.map((r) => r.requirement_id),
        ...f.shagun_entries.map((r) => r.shagun_entry_id),
        ...f.proposals.map((r) => r.proposal_id),
        ...f.activity_entries.map((r) => r.activity_entry_id),
        ...f.export_jobs.map((r) => r.job_id),
      ];
      for (const fixtureId of fixtureIds) expect(ids.has(fixtureId), fixtureId).toBe(true);
      // Plus what the fixtures carry without an id: the 10 budget lines and the export attempt (a log there).
      expect(ids.size).toBe(fixtureIds.length + f.budget_lines.length + 1);
    }
  });

  it("no row records a moment before its own created_at (replies, thank-yous, updates)", () => {
    const early: string[] = [];
    for (const [table, row] of allRows(dataset())) {
      const created = row.created_at;
      if (!(created instanceof Date)) continue;
      for (const [column, value] of Object.entries(row)) {
        if (value instanceof Date && value.getTime() < created.getTime()) early.push(`${table}.${String(row.seed_key)}.${column}`);
      }
    }
    expect(early).toEqual([]);
  });

  it("a rebuild gives the same rows (two seed runs, the same ids and values)", () => {
    expect(build("b")).toEqual(build("b"));
  });

  it("refuses to build without an Auth user id for every account", () => {
    const ids = userIds("c");
    delete ids["kabir.c@example.com"];
    expect(() => buildSeedDataset("c", { user_ids: ids })).toThrow(/kabir\.c@example\.com/);
  });
});

// ---------------------------------------------------------------------------
// Domain 5.0: every reference stays inside the copy
// ---------------------------------------------------------------------------

describe("cross-wedding references (domain 5.0)", () => {
  it.each(SAMPLE_COPIES)("copy %s references only its own rows and its own Auth users", (copy) => {
    const ds = dataset(copy);
    const own = new Set<string>(Object.values(userIds(copy)));
    for (const [, row] of allRows(ds)) if (typeof row.id === "string") own.add(row.id);
    const foreign: string[] = [];
    for (const [table, row] of allRows(ds)) {
      for (const uuid of collectUuids(row)) if (!own.has(uuid)) foreign.push(`${table}.${String(row.seed_key)} → ${uuid}`);
    }
    expect(foreign).toEqual([]);
  });

  it("no id is shared between copies", () => {
    const seen = new Map<string, SampleCopy>();
    for (const copy of SAMPLE_COPIES) {
      const ds = dataset(copy);
      const ids = [...allRows(ds).map(([, row]) => row.id as string | undefined), ...Object.values(userIds(copy))];
      for (const id of ids) {
        if (!id) continue;
        expect(seen.get(id), `${id} in ${copy}`).toBeUndefined();
        seen.set(id, copy);
      }
    }
  });

  it("the households' primary guests and the members' users point where they should", () => {
    const ds = dataset("d");
    const guests = new Map(rowsOf(ds, "guests").map((g) => [g.id, g]));
    for (const household of rowsOf(ds, "households")) {
      if (household.is_synthetic) continue;
      const primary = guests.get(household.primary_guest_id as string);
      expect(primary?.household_id, household.seed_key ?? "").toBe(household.id);
    }
    const accounts = seedAccounts("d");
    expect(accounts.map((a) => [a.email, a.role])).toEqual([
      ["mira.d@example.com", "owner"],
      ["kabir.d@example.com", "owner"],
      ["diya.d@example.com", "manager"],
    ]);
    const members = rowsOf(ds, "members");
    for (const account of accounts) {
      expect(bySeed(members, account.member_key)).toMatchObject({ user_id: fallbackUserId(account.email), role: account.role, display_name: account.display_name });
    }
    expect(rowsOf(ds, "weddings")[0].created_by_user_id).toBe(fallbackUserId("mira.d@example.com"));
  });
});

// ---------------------------------------------------------------------------
// Accounts and fallback user ids
// ---------------------------------------------------------------------------

describe("seed accounts", () => {
  it("names demo-data 1.2 and 1.4's accounts", () => {
    expect(seedAccounts("demo").map((a) => a.email)).toEqual(["mira.owner@example.com", "kabir.owner@example.com", "diya.manager@example.com"]);
    expect(seedAccounts("e2e").map((a) => a.email)).toEqual(["mira.e2e@example.com", "kabir.e2e@example.com", "diya.e2e@example.com"]);
    for (const copy of SAMPLE_COPIES) {
      expect(seedAccounts(copy).every((a) => a.email.endsWith("@example.com"))).toBe(true);
    }
  });

  it("fallbackUserId is deterministic, is the fixtures' user id for seed accounts, and differs per email", () => {
    const fixtureMira = getDemoFixture("a").members.find((m) => m.seed_key === SEED_KEYS.members.mira)!;
    expect(fallbackUserId("mira.a@example.com")).toBe(fixtureMira.user_id);
    expect(fallbackUserId(" Mira.A@Example.com ")).toBe(fixtureMira.user_id);
    expect(fallbackUserId("setup-a-1310@example.com")).toBe(fallbackUserId("setup-a-1310@example.com"));
    expect(fallbackUserId("setup-a-1310@example.com")).not.toBe(fallbackUserId("setup-a-1311@example.com"));
    expect(isUuidShaped(fallbackUserId("someone@example.net"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Publications (D95, domain 5.3)
// ---------------------------------------------------------------------------

describe("REV-1 and REV-2, built with the snapshot builder", () => {
  it.each(["demo", "a", "e2e"] as const)("copy %s: REV-2 agrees field for field with the D0 draft", (copy) => {
    const ds = dataset(copy);
    const draft = buildItinerarySnapshot({
      wedding: rowsOf(ds, "weddings")[0],
      invite_style: rowsOf(ds, "inviteStyles")[0],
      events: rowsOf(ds, "events"),
      venues: rowsOf(ds, "venues"),
    });
    const rev2 = bySeed(rowsOf(ds, "publications"), "REV-2");
    expect(rev2.snapshot).toEqual(draft);
    expect(diffSnapshots(rev2.snapshot as unknown as PublicationSnapshot, draft, { wedding_id: ds.wedding_id })).toEqual([]);
    expect(rev2.revision).toBe(2);
  });

  it("REV-2 shows Banyan Hall, the mehendi to 19:30, the haldi, and the couple photo", () => {
    const ds = dataset();
    const rev2 = bySeed(rowsOf(ds, "publications"), "REV-2").snapshot as unknown as PublicationSnapshot;
    const ofKind = (kind: string) => rev2.events.find((e) => e.event_kind === kind)!;
    expect(rev2.events.map((e) => e.event_kind)).toEqual(["haldi", "mehendi", "sangeet", "wedding", "reception"]);
    expect(ofKind("reception").venue?.name).toBe("Banyan Hall");
    expect(ofKind("reception").start_time).toBe("19:30");
    expect(ofKind("mehendi").end_time).toBe("19:30");
    expect(rev2.invite_style.photo_asset_id).toBe(ds.photo.asset_id);
    expect(rev2.invite_style).toMatchObject({
      theme: "maroon_gold",
      heading_hi: "शुभ विवाह",
      wording_en: "With the blessings of our families\n\ninvite you to celebrate their wedding",
      blessing_line: null,
    });
    expect(rev2.wedding).toEqual({ bride_name: "Mira", groom_name: "Kabir", city: "Bengaluru", wedding_date: "2026-12-14" });
  });

  it("REV-1 has no haldi and the mehendi to 18:00; REV-2's changes are the haldi and the mehendi end", () => {
    const ds = dataset();
    const publications = rowsOf(ds, "publications");
    const rev1 = bySeed(publications, "REV-1");
    const rev2 = bySeed(publications, "REV-2");
    const snapshot1 = rev1.snapshot as unknown as PublicationSnapshot;
    expect(snapshot1.events.map((e) => e.event_kind)).toEqual(["mehendi", "sangeet", "wedding", "reception"]);
    expect(snapshot1.events[0].end_time).toBe("18:00");
    expect(rev1.changes).toEqual([]);
    const haldi = bySeed(rowsOf(ds, "events"), "EVT-HAL").id;
    const mehendi = bySeed(rowsOf(ds, "events"), "EVT-MEH").id;
    expect(rev2.changes as unknown as SnapshotChange[]).toEqual([
      { entity: "event", entity_id: haldi, field: "added", from: null, to: "Haldi" },
      { entity: "event", entity_id: mehendi, field: "end_time", from: "18:00", to: "19:30" },
    ]);
    const mira = bySeed(rowsOf(ds, "members"), SEED_KEYS.members.mira).id;
    expect(publications.every((p) => p.published_by_member_id === mira)).toBe(true);
    expect((rev1.published_at as Date).toISOString()).toBe("2026-11-22T14:30:00.000Z"); // 20:00 IST
    expect((rev2.published_at as Date).toISOString()).toBe("2026-11-24T15:30:00.000Z"); // 21:00 IST
  });
});

// ---------------------------------------------------------------------------
// The couple photo (D126) and JOB-EXP-R2-PNG (D15, P10)
// ---------------------------------------------------------------------------

describe("the couple photo and the REV-2 card job", () => {
  it("the photo row exists from the start with no file fields, and the style references it", () => {
    const ds = dataset();
    expect(ds.photo).toMatchObject({ seed_key: SEED_KEYS.couple_photo, storage_path_ext: "jpg" });
    expect(ds.photo.storage_path).toBe(`${ds.wedding_id}/${ds.photo.asset_id}.jpg`);
    expect(ds.photo.row).toMatchObject({
      id: ds.photo.asset_id,
      asset_kind: "couple_photo",
      storage_path: ds.photo.storage_path,
      mime_type: "image/jpeg",
      bytes: null,
      width: null,
      height: null,
    });
    expect(rowsOf(ds, "inviteStyles")[0].photo_asset_id).toBe(ds.photo.asset_id);
  });

  it("JOB-EXP-R2-PNG is Ready for REV-2 without a file, with the reception alone on its card", () => {
    const ds = dataset();
    const job = bySeed(rowsOf(ds, "exportJobs"), SEED_KEYS.rev2_export_job);
    expect(ds.rev2_job).toEqual({ job_id: job.id, seed_key: SEED_KEYS.rev2_export_job, revision: 2, artifact_path: `${ds.wedding_id}/card-rev2.png` });
    expect(job).toMatchObject({
      publication_id: bySeed(rowsOf(ds, "publications"), "REV-2").id,
      revision: 2,
      format: "png",
      export_key: exportKey(ds.wedding_id, 2, "png"),
      status: "succeeded",
      attempts: 1,
      max_attempts: 3,
      fail_injection: "none",
      synthetic: false,
      artifact_path: null,
      artifact_sha256: null,
      artifact_bytes: null,
    });
    expect(job.card_event_ids).toEqual([bySeed(rowsOf(ds, "events"), "EVT-REC").id]);
    expect((job.updated_at as Date).toISOString()).toBe("2026-11-24T15:35:00.000Z"); // 21:05 IST
    expect(bySeed(rowsOf(ds, "exportAttempts"), `${SEED_KEYS.rev2_export_job}/a1`)).toMatchObject({
      job_id: job.id,
      attempt_no: 1,
      trigger: "request",
      status: "succeeded",
      renderer: "chromium",
    });
  });

  it("with the card file's digest, the job carries its artifact (D15, A9)", () => {
    const ds = buildSeedDataset("a", { user_ids: userIds("a"), rev2_card: { sha256: "ab".repeat(32), bytes: 412_377 } });
    const job = bySeed(rowsOf(ds, "exportJobs"), SEED_KEYS.rev2_export_job);
    expect(job).toMatchObject({ artifact_path: `${ds.wedding_id}/card-rev2.png`, artifact_sha256: "ab".repeat(32), artifact_bytes: 412_377 });
    expect(job.artifact_created_at).toEqual(job.updated_at);
  });
});

// Keep the SeedRows type exercised so a schema change that breaks it fails this file's typecheck.
const _typecheck: SeedRows = dataset().rows;
void _typecheck;
