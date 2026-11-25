import { describe, expect, it } from "vitest";

import { formatWeekdayDate, formatWeekdayDayMonth } from "@/components/planner/kit/dates";
import { fixtureSessionActor } from "@/contracts/fixtures";
import { formatInr } from "@/contracts/money";
import type { LedgerHistoryEntry, MoneySummaryVendorRow, PaymentView } from "@/contracts/read-models";
import { fixtureServices } from "@/contracts/services";

import {
  VENDOR_STATUS_LABELS,
  commitmentFormula,
  describeHistoryEntry,
  dueCell,
  dueLine,
  firstVersion,
  paymentMeta,
  previousVersion,
  quoteFormula,
} from "./vendor-text";

/** Copy b (Lane B's rehearsal copy) and its caterer, Annapoorna Caterers (demo-data 6). */
const WEDDING_ID = "3e546e78-a307-5757-a6e2-2b08e26c0a76";
const CATERER_ID = "7cfd20aa-ff4c-5e4b-9fc9-468eb0914704";

const mira = fixtureSessionActor("mira", "b");
const diya = fixtureSessionActor("diya", "b");

describe("Annapoorna Caterers at D0 (AT-6.1), Mira", () => {
  it("reads the header, quote, contract, payment and figures the page shows", async () => {
    const ledger = await fixtureServices.read("vendor_ledger", {
      actor: mira,
      wedding_id: WEDDING_ID,
      params: { vendor_id: CATERER_ID },
    });

    expect(ledger.hidden).toEqual([]);
    expect(ledger.vendor.name).toBe("Annapoorna Caterers");
    expect(VENDOR_STATUS_LABELS[ledger.vendor.status]).toBe("Contracted");
    expect(ledger.vendor.contact_name).toBe("Suresh");
    expect(ledger.vendor.contact_phone).toBe("+91 90000 02001");
    expect(ledger.vendor.functions.map((fn) => fn.title)).toEqual(["Reception"]);

    expect(ledger.quotes).toHaveLength(1);
    expect(quoteFormula(ledger.quotes![0])).toBe("₹850 × 250 = ₹2,12,500");
    expect(ledger.quotes![0].status).toBe("accepted");

    const [contract] = ledger.commitments!;
    expect(commitmentFormula(contract)).toBe("250 plates × ₹800 = ₹2,00,000");
    expect(contract.due_on).toBe("2026-12-12");
    expect(formatWeekdayDayMonth(contract.due_on!)).toBe("Sat 12 Dec");
    expect(firstVersion(ledger.history!, contract.commitment_id)?.by).toBe("Mira");

    const [advance] = ledger.payments!;
    expect(advance.seed_key).toBe("PAY-01");
    expect(advance.payment_kind).toBe("advance");
    expect(formatInr(advance.amount_inr)).toBe("₹50,000");
    expect(paymentMeta(advance.paid_on, advance.method)).toBe("Fri 20 Nov 2026, UPI");
    expect(advance.previous_amount_inr).toBeNull();

    expect(ledger.figures).toEqual({ committed_inr: 200000, paid_inr: 50000, outstanding_inr: 150000, overpaid_inr: 0 });
  });

  it("reads the estimate beside the contract, with both headcounts", async () => {
    const ledger = await fixtureServices.read("vendor_ledger", {
      actor: mira,
      wedding_id: WEDDING_ID,
      params: { vendor_id: CATERER_ID },
    });
    const [estimate] = ledger.estimate!;
    expect(estimate.commitment_id).toBe(ledger.commitments![0].commitment_id);
    expect(estimate.label).toBe("Estimate, not the contract");
    expect(formatInr(estimate.estimate_inr)).toBe("₹1,83,200");
    expect(estimate.formula_text).toBe("229 attending × ₹800");
    expect(estimate.direction).toBe("below");
    expect(formatInr(Math.abs(estimate.difference_inr))).toBe("₹16,800");
    expect(estimate.expected_headcount).toBe(250);
    expect(estimate.confirmed_headcount).toBe(229);
  });

  it("lists the history oldest first, with source and who", async () => {
    const ledger = await fixtureServices.read("vendor_ledger", {
      actor: mira,
      wedding_id: WEDDING_ID,
      params: { vendor_id: CATERER_ID },
    });
    const history = ledger.history!;
    const lines = history.map((entry) => describeHistoryEntry(entry, previousVersion(history, entry), ledger.payments!));
    expect(lines.map((line) => line.what)).toEqual(["Contract recorded at ₹2,00,000", "Advance recorded at ₹50,000"]);
    expect(lines[1].detail).toBe("Version 1: Fri 20 Nov 2026, UPI");
    expect(history.map((entry) => entry.source)).toEqual(["ui", "ui"]);
    expect([...history].sort((a, b) => a.at.localeCompare(b.at))).toEqual(history);
  });

  it("reads the due line from money_summary's row: Sat 12 Dec, in 17 days", async () => {
    const summary = await fixtureServices.read("money_summary", { actor: mira, wedding_id: WEDDING_ID });
    const row = summary.vendors!.find((vendor) => vendor.vendor_id === CATERER_ID)!;
    expect(row.due_state).toBe("upcoming");
    expect(row.days_until_due).toBe(17);
    expect(dueLine({ committed_inr: 200000, paid_inr: 50000, outstanding_inr: 150000, overpaid_inr: 0 }, row, null)).toEqual({
      kind: "plain",
      text: "Balance due Sat 12 Dec, in 17 days",
    });
    expect(summary.totals?.total_committed_inr).toBe(927000);
    expect(summary.totals?.total_paid_inr).toBe(397000);
    expect(summary.totals?.total_outstanding_inr).toBe(530000);
  });
});

describe("Diya, the event manager (AT-5.9)", () => {
  it("keeps the vendor rows and hides the budget", async () => {
    const summary = await fixtureServices.read("money_summary", { actor: diya, wedding_id: WEDDING_ID });
    expect(summary.hidden).toContain("budget");
    expect(summary.hidden).not.toContain("vendor_money");
    expect(summary.totals).toBeUndefined();
    expect(summary.categories).toBeUndefined();
    const row = summary.vendors?.find((vendor) => vendor.vendor_id === CATERER_ID);
    expect(row?.outstanding_inr).toBe(150000);
  });

  it("opens the caterer's page with its money, because vendor dues are shared at D0", async () => {
    const ledger = await fixtureServices.read("vendor_ledger", {
      actor: diya,
      wedding_id: WEDDING_ID,
      params: { vendor_id: CATERER_ID },
    });
    expect(ledger.hidden).not.toContain("vendor_money");
    expect(ledger.figures?.outstanding_inr).toBe(150000);
  });
});

describe("unknown vendors", () => {
  it("answer not_found, which the page turns into a 404", async () => {
    await expect(
      fixtureServices.read("vendor_ledger", {
        actor: mira,
        wedding_id: WEDDING_ID,
        params: { vendor_id: "00000000-0000-4000-8000-000000000000" },
      }),
    ).rejects.toMatchObject({ body: { code: "not_found" } });
  });
});

describe("vendor page text", () => {
  const row = (overrides: Partial<MoneySummaryVendorRow>): MoneySummaryVendorRow => ({
    vendor_id: CATERER_ID,
    seed_key: "VEN-CAT",
    name: "Annapoorna Caterers",
    vendor_category: "catering",
    is_one_off: false,
    status: "booked",
    committed_inr: 200000,
    paid_inr: 50000,
    outstanding_inr: 150000,
    overpaid_inr: 0,
    next_due_on: "2026-12-01",
    days_until_due: 6,
    due_state: "due_soon",
    pending_proposals_inr: 0,
    ...overrides,
  });

  it("formats weekday dates", () => {
    expect(formatWeekdayDate("2026-11-20")).toBe("Fri 20 Nov 2026");
    expect(formatWeekdayDayMonth("2026-12-01")).toBe("Tue 1 Dec");
  });

  it("words the due states from the read model, never computing a day count", () => {
    expect(dueCell(row({}))).toEqual({ kind: "due", text: "Due Tue 1 Dec, in 6 days" });
    expect(dueCell(row({ due_state: "overdue", days_until_due: -2 }))).toEqual({ kind: "overdue", text: "Overdue since Tue 1 Dec" });
    expect(dueCell(row({ outstanding_inr: 0, paid_inr: 200000, next_due_on: null, days_until_due: null, due_state: "none" }))).toEqual({
      kind: "paid",
      text: "Paid in full",
    });
    expect(dueCell(row({ overpaid_inr: 10000, outstanding_inr: 0 }))).toBeNull();
  });

  it("describes a correction as old to new, keeping version 1", () => {
    const v1: LedgerHistoryEntry = {
      entity: "payment",
      entity_id: "pay-1",
      seed_key: "PAY-01/v1",
      version_no: 1,
      values: { amount_inr: 50000, paid_on: "2026-11-20", method: "upi", note: null },
      change_reason: null,
      by: "Mira",
      at: "2026-11-20T12:30:00+05:30",
      source: "ui",
      spoken_text: null,
    };
    const v2: LedgerHistoryEntry = {
      ...v1,
      seed_key: null,
      version_no: 2,
      values: { ...v1.values, amount_inr: 40000 },
      at: "2026-11-25T13:42:00+05:30",
      source: "voice",
      spoken_text: "Caterer ko chaalis hazaar advance diya tha.",
    };
    const payments = [{ payment_id: "pay-1", payment_kind: "advance" } as PaymentView];
    const history = [v1, v2];
    expect(previousVersion(history, v2)).toBe(v1);
    expect(describeHistoryEntry(v2, previousVersion(history, v2), payments).what).toBe(
      "Advance corrected from ₹50,000 to ₹40,000",
    );
    expect(describeHistoryEntry(v1, null, payments).what).toBe("Advance recorded at ₹50,000");
  });
});
