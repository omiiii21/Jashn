import { describe, expect, it } from "vitest";

import type { VendorTotals } from "@/contracts/commands";

import {
  budgetPosition,
  categoryOverBudgetMessage,
  categoryPosition,
  cateringEstimate,
  dueFor,
  estimateApplies,
  estimateFormulaText,
  isUuid,
  moneyTotals,
  nextDueOn,
  overpaidMessage,
  readerSees,
  safeInt,
  sumVendorFigures,
  totalsBalance,
  vendorFigures,
} from "./ledger-math";

/** demo-data's D0 ledger: committed and paid per vendor (acceptance AT-5.1). */
const D0: Record<string, [number, number]> = {
  "VEN-CAT": [200_000, 50_000],
  "VEN-VEN": [280_000, 140_000],
  "VEN-DEC": [150_000, 50_000],
  "VEN-PHO": [110_000, 30_000],
  "VEN-MEH": [25_000, 5_000],
  "VEN-DJ": [55_000, 15_000],
  "VEN-PRN": [12_000, 12_000],
  "VEN-BTQ": [95_000, 95_000],
};

const D0_LINES = [300_000, 240_000, 160_000, 120_000, 150_000, 70_000, 50_000, 40_000, 30_000, 40_000];

function ledger(overrides: Record<string, [number, number]> = {}): Record<string, VendorTotals> {
  const all = { ...D0, ...overrides };
  return Object.fromEntries(Object.entries(all).map(([key, [committed, paid]]) => [key, vendorFigures(committed, paid)]));
}

describe("M4: per-vendor figures", () => {
  it("gives outstanding when committed exceeds paid, and never a negative", () => {
    expect(vendorFigures(200_000, 50_000)).toEqual({ committed_inr: 200_000, paid_inr: 50_000, outstanding_inr: 150_000, overpaid_inr: 0 });
    expect(vendorFigures(200_000, 210_000)).toEqual({ committed_inr: 200_000, paid_inr: 210_000, outstanding_inr: 0, overpaid_inr: 10_000 });
    expect(vendorFigures(0, 0)).toEqual({ committed_inr: 0, paid_inr: 0, outstanding_inr: 0, overpaid_inr: 0 });
  });

  it("refuses anything that is not a safe integer (domain 0.1)", () => {
    expect(() => vendorFigures(40_000.5, 0)).toThrow();
    expect(() => vendorFigures(Number.MAX_SAFE_INTEGER + 1, 0)).toThrow();
    expect(safeInt("x", "387000")).toBe(387_000);
    expect(() => safeInt("x", "4e4.5")).toThrow();
    expect(() => safeInt("x", null)).toThrow();
  });
});

describe("acceptance 4.3: ledger maths", () => {
  it("totals at D0 (M4, M5)", () => {
    const totals = moneyTotals({ vendors: Object.values(ledger()), budget_inr: 1_200_000, planned_lines_inr: D0_LINES, pending_proposals_inr: 15_000 });
    expect(totals).toEqual({
      total_committed_inr: 927_000,
      total_paid_inr: 397_000,
      total_outstanding_inr: 530_000,
      total_overpaid_inr: 0,
      budget_inr: 1_200_000,
      uncommitted_inr: 273_000,
      over_budget_inr: 0,
      unallocated_inr: 0,
      pending_proposals_inr: 15_000,
      if_approved_committed_inr: 942_000,
    });
  });

  it("totals at D1 (C6): PAY-01 version 2 at 40000", () => {
    const rows = ledger({ "VEN-CAT": [200_000, 40_000] });
    expect(rows["VEN-CAT"].outstanding_inr).toBe(160_000);
    const totals = sumVendorFigures(Object.values(rows));
    expect(totals.total_paid_inr).toBe(387_000);
    expect(totals.total_outstanding_inr).toBe(540_000);
  });

  it("overpaid (M4, M5): D1 plus a 170000 instalment never hides another vendor's due", () => {
    const rows = ledger({ "VEN-CAT": [200_000, 40_000 + 170_000] });
    expect(rows["VEN-CAT"]).toEqual({ committed_inr: 200_000, paid_inr: 210_000, outstanding_inr: 0, overpaid_inr: 10_000 });
    const totals = sumVendorFigures(Object.values(rows));
    expect(totals.total_outstanding_inr).toBe(380_000);
    expect(totals.total_overpaid_inr).toBe(10_000);
    // The check: outstanding − overpaid = committed − paid = 370000.
    expect(totals.total_outstanding_inr - totals.total_overpaid_inr).toBe(370_000);
    expect(totals.total_committed_inr - totals.total_paid_inr).toBe(370_000);
    expect(totalsBalance(totals)).toBe(true);
    // Committed minus paid would have said 370000 owed and hidden the other vendors' 380000.
    expect(totals.total_outstanding_inr).not.toBe(totals.total_committed_inr - totals.total_paid_inr);
  });

  it("budget (M6): COM-04 updated to 125000", () => {
    const rows = ledger({ "VEN-PHO": [125_000, 30_000] });
    expect(categoryPosition(120_000, rows["VEN-PHO"].committed_inr)).toEqual({
      has_line: true,
      planned_inr: 120_000,
      uncommitted_inr: 0,
      over_budget_inr: 5_000,
    });
    const totals = moneyTotals({ vendors: Object.values(rows), budget_inr: 1_200_000, planned_lines_inr: D0_LINES, pending_proposals_inr: 0 });
    expect(totals.total_committed_inr).toBe(942_000);
    expect(totals.uncommitted_inr).toBe(258_000);
    expect(totals.over_budget_inr).toBe(0);
    expect(rows["VEN-PHO"].outstanding_inr).toBe(95_000);
    expect(categoryOverBudgetMessage("photography", 5_000, 120_000)).toBe("Photography and video is ₹5,000 over its ₹1,20,000 budget.");
  });

  it("proposals (M6, A5): PRP-01 pending adds only to the if-approved figures", () => {
    const totals = moneyTotals({ vendors: Object.values(ledger()), budget_inr: 1_200_000, planned_lines_inr: D0_LINES, pending_proposals_inr: 15_000 });
    expect(totals.pending_proposals_inr).toBe(15_000);
    expect(totals.if_approved_committed_inr).toBe(942_000);
    expect(totals.total_committed_inr).toBe(927_000);
  });

  it("estimate (E1–E3): 229, 230, 250 and 260 at ₹800 against the ₹2,00,000 contract", () => {
    expect(cateringEstimate(229, 800, 200_000)).toEqual({ estimate_inr: 183_200, difference_inr: 16_800, direction: "below" });
    expect(cateringEstimate(230, 800, 200_000)).toEqual({ estimate_inr: 184_000, difference_inr: 16_000, direction: "below" });
    expect(cateringEstimate(250, 800, 200_000)).toEqual({ estimate_inr: 200_000, difference_inr: 0, direction: "equal" });
    expect(cateringEstimate(260, 800, 200_000)).toEqual({ estimate_inr: 208_000, difference_inr: 8_000, direction: "above" });
    expect(estimateFormulaText(230, 800)).toBe("230 attending × ₹800");
  });

  it("estimate (E1): no estimate for a lump sum, a per-item price, no function or a void", () => {
    expect(estimateApplies({ pricing: "per_unit", unit: "plate", unit_price_inr: 800, event_id: "e" })).toBe(true);
    expect(estimateApplies({ pricing: "per_unit", unit: "person", unit_price_inr: 800, event_id: "e" })).toBe(true);
    expect(estimateApplies({ pricing: "lump_sum", unit: null, unit_price_inr: null, event_id: "e" })).toBe(false);
    expect(estimateApplies({ pricing: "per_unit", unit: "item", unit_price_inr: 800, event_id: "e" })).toBe(false);
    expect(estimateApplies({ pricing: "per_unit", unit: "plate", unit_price_inr: 800, event_id: null })).toBe(false);
    expect(estimateApplies({ pricing: "per_unit", unit: "plate", unit_price_inr: 800, event_id: "e", voided: true })).toBe(false);
  });
});

describe("M6: category lines", () => {
  it("a category with no line is not a line of ₹0 and is never over budget", () => {
    expect(categoryPosition(null, 50_000)).toEqual({ has_line: false, planned_inr: null, uncommitted_inr: 0, over_budget_inr: 0 });
  });

  it("a line of ₹0 is a line, and can be over budget", () => {
    expect(categoryPosition(0, 5_000)).toEqual({ has_line: true, planned_inr: 0, uncommitted_inr: 0, over_budget_inr: 5_000 });
  });

  it("the wedding's position and unallocated", () => {
    expect(budgetPosition(1_200_000, 1_250_000)).toEqual({ uncommitted_inr: 0, over_budget_inr: 50_000 });
    const totals = moneyTotals({ vendors: [], budget_inr: 1_200_000, planned_lines_inr: [300_000, 240_000], pending_proposals_inr: 0 });
    expect(totals.unallocated_inr).toBe(660_000);
    expect(totals.uncommitted_inr).toBe(1_200_000);
  });
});

describe("4.2 and D99: due items in IST days", () => {
  it("Mallige Gardens, due 1 Dec, reads 6 days and due soon on 25 Nov", () => {
    expect(dueFor("2026-12-01", "2026-11-25")).toEqual({ days_until_due: 6, due_state: "due_soon" });
  });

  it("upcoming beyond 7 days, overdue before today, none without a date", () => {
    expect(dueFor("2026-12-12", "2026-11-25")).toEqual({ days_until_due: 17, due_state: "upcoming" });
    expect(dueFor("2026-12-02", "2026-11-25")).toEqual({ days_until_due: 7, due_state: "due_soon" });
    expect(dueFor("2026-11-25", "2026-11-25")).toEqual({ days_until_due: 0, due_state: "due_soon" });
    expect(dueFor("2026-11-24", "2026-11-25")).toEqual({ days_until_due: -1, due_state: "overdue" });
    expect(dueFor(null, "2026-11-25")).toEqual({ days_until_due: null, due_state: "none" });
  });

  it("a due date counts only while something is outstanding", () => {
    expect(nextDueOn(0, "2026-12-01")).toBeNull();
    expect(nextDueOn(150_000, "2026-12-12")).toBe("2026-12-12");
  });
});

describe("visibility and messages", () => {
  const off = { managers_can_see_vendor_dues: false, managers_can_see_budget: false, managers_can_see_guest_contacts: false };
  const seeded = { ...off, managers_can_see_vendor_dues: true };

  it("owners see every block; the seeded manager sees vendor dues but not the budget (G7)", () => {
    expect(readerSees({ role: "owner", sharing: off }, "budget")).toBe(true);
    expect(readerSees({ role: "manager", sharing: seeded }, "vendor_money")).toBe(true);
    expect(readerSees({ role: "manager", sharing: seeded }, "estimate")).toBe(true);
    expect(readerSees({ role: "manager", sharing: seeded }, "budget")).toBe(false);
    expect(readerSees({ role: "manager", sharing: off }, "vendor_money")).toBe(false);
    expect(readerSees({ role: "manager", sharing: off }, "estimate")).toBe(false);
  });

  it("formats warnings with M7 amounts", () => {
    expect(overpaidMessage("Annapoorna Caterers", 10_000)).toBe("Annapoorna Caterers has been overpaid by ₹10,000.");
  });

  it("recognises uuids only", () => {
    expect(isUuid("75e13aff-00d4-427e-8e6b-7bd1798f1316")).toBe(true);
    expect(isUuid("PAY-01")).toBe(false);
    expect(isUuid(undefined)).toBe(false);
  });
});
