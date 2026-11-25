import "server-only";

/**
 * `money_summary` (domain-and-data 4.2; M4–M6, A5, G7, D99): one row per non-deleted vendor
 * (one-off payees included), the wedding totals as sums of the vendor figures, and one
 * category line per budget category in the order of 5.2.
 *
 * Visibility: owners see everything. A manager sees the vendor rows only with
 * `managers_can_see_vendor_dues` (else `vendor_money` in `hidden`), and the totals and the
 * category lines only with `managers_can_see_budget` (else `budget` in `hidden`). A hidden
 * block is left out, never zeroed.
 */
import { and, asc, eq, isNull, sql } from "drizzle-orm";

import { BUDGET_CATEGORIES, BUDGET_CATEGORY_LABELS, type BudgetCategory, type SessionActor, type WeddingId } from "@/contracts/domain";
import { getDemoFixture } from "@/contracts/fixtures";
import type {
  BudgetCategoryLine,
  HiddenBlock,
  MoneySummary,
  MoneySummaryVendorRow,
  ReadModelParams,
} from "@/contracts/read-models";
import type { DbOrTx } from "@/db/client";
import { istToday } from "@/db/ist";
import { budgetLines, budgets, proposals, vendors } from "@/db/schema";

import {
  categoryPosition,
  dueFor,
  loadLedgerReader,
  loadVendorFigures,
  moneyTotals,
  nextDueOn,
  readerSees,
  safeInt,
  vendorFigures,
} from "./ledger-math";

export type MoneySummaryOptions = {
  /** The read instant; "today" is its IST date (tests pin it). */
  now?: Date;
};

let seededVendorOrder: Map<string, number> | null = null;

/** demo-data's vendor order (AT-5.1's table), by seed key; the same in every copy. */
function seededVendorRank(seed_key: string | null): number {
  seededVendorOrder ??= new Map(getDemoFixture().vendors.map((vendor, index) => [vendor.seed_key ?? "", index]));
  return seed_key === null ? Number.MAX_SAFE_INTEGER : (seededVendorOrder.get(seed_key) ?? Number.MAX_SAFE_INTEGER);
}

/** Regular vendors before one-off payees; seeded ones in demo-data's order, then live ones by creation. */
function compareVendors(
  a: { is_one_off: boolean; seed_key: string | null; created_at: Date; name: string },
  b: { is_one_off: boolean; seed_key: string | null; created_at: Date; name: string },
): number {
  return (
    Number(a.is_one_off) - Number(b.is_one_off) ||
    seededVendorRank(a.seed_key) - seededVendorRank(b.seed_key) ||
    a.created_at.getTime() - b.created_at.getTime() ||
    a.name.localeCompare(b.name)
  );
}

type PendingProposal = { vendor_id: string | null; budget_category: BudgetCategory | null; committed_delta_inr: number };

/** Pending proposals with the category they would land in (A5: never part of a total). */
async function pendingProposals(db: DbOrTx, wedding_id: string): Promise<PendingProposal[]> {
  const rows = await db
    .select({
      vendor_id: proposals.vendor_id,
      budget_category: sql<BudgetCategory | null>`coalesce(${proposals.budget_category}, ${vendors.vendor_category})`,
      committed_delta_inr: proposals.committed_delta_inr,
    })
    .from(proposals)
    .leftJoin(vendors, and(eq(vendors.id, proposals.vendor_id), eq(vendors.wedding_id, proposals.wedding_id)))
    .where(and(eq(proposals.wedding_id, wedding_id), eq(proposals.status, "pending")));
  return rows.map((row) => ({
    vendor_id: row.vendor_id,
    budget_category: row.budget_category,
    committed_delta_inr: safeInt("committed_delta_inr", row.committed_delta_inr),
  }));
}

export async function buildMoneySummary(
  db: DbOrTx,
  actor: SessionActor,
  wedding_id: WeddingId,
  params: ReadModelParams<"money_summary"> = {},
  options: MoneySummaryOptions = {},
): Promise<MoneySummary> {
  void params; // money_summary takes no parameters.
  const reader = await loadLedgerReader(db, actor, wedding_id);
  const hidden: HiddenBlock[] = [];
  const summary: MoneySummary = { version: reader.version, hidden };
  const showVendors = readerSees(reader, "vendor_money");
  const showBudget = readerSees(reader, "budget");
  if (!showVendors) hidden.push("vendor_money");
  if (!showBudget) hidden.push("budget");
  if (!showVendors && !showBudget) return summary;

  const [vendorRows, figures, pending, lineRows, budgetRows] = await Promise.all([
    db
      .select({
        vendor_id: vendors.id,
        seed_key: vendors.seed_key,
        name: vendors.name,
        vendor_category: vendors.vendor_category,
        is_one_off: vendors.is_one_off,
        status: vendors.status,
        created_at: vendors.created_at,
      })
      .from(vendors)
      .where(and(eq(vendors.wedding_id, wedding_id), isNull(vendors.deleted_at)))
      .orderBy(asc(vendors.created_at), asc(vendors.id)),
    loadVendorFigures(db, wedding_id),
    pendingProposals(db, wedding_id),
    db
      .select({ budget_category: budgetLines.budget_category, planned_inr: budgetLines.planned_inr, seed_key: budgetLines.seed_key })
      .from(budgetLines)
      .where(eq(budgetLines.wedding_id, wedding_id)),
    db.select({ total_inr: budgets.total_inr }).from(budgets).where(eq(budgets.wedding_id, wedding_id)).limit(1),
  ]);

  const today = istToday(options.now ?? new Date());
  vendorRows.sort(compareVendors);
  const rows: MoneySummaryVendorRow[] = vendorRows.map((vendor) => {
    const figure = figures.get(vendor.vendor_id);
    const totals = figure ?? vendorFigures(0, 0);
    const next_due_on = nextDueOn(totals.outstanding_inr, figure?.earliest_due_on ?? null);
    const due = dueFor(next_due_on, today);
    const pending_inr = pending
      .filter((proposal) => proposal.vendor_id === vendor.vendor_id)
      .reduce((sum, proposal) => sum + proposal.committed_delta_inr, 0);
    return {
      vendor_id: vendor.vendor_id,
      seed_key: vendor.seed_key,
      name: vendor.name,
      vendor_category: vendor.vendor_category,
      is_one_off: vendor.is_one_off,
      status: vendor.status,
      committed_inr: totals.committed_inr,
      paid_inr: totals.paid_inr,
      outstanding_inr: totals.outstanding_inr,
      overpaid_inr: totals.overpaid_inr,
      next_due_on,
      days_until_due: due.days_until_due,
      due_state: due.due_state,
      pending_proposals_inr: safeInt("pending_proposals_inr", pending_inr),
    };
  });

  if (showVendors) summary.vendors = rows;

  if (showBudget) {
    const lines = new Map(lineRows.map((line) => [line.budget_category, line]));
    summary.totals = moneyTotals({
      vendors: rows,
      budget_inr: budgetRows[0] ? safeInt("budget_inr", budgetRows[0].total_inr) : 0,
      planned_lines_inr: lineRows.map((line) => safeInt("planned_inr", line.planned_inr)),
      pending_proposals_inr: pending.reduce((sum, proposal) => sum + proposal.committed_delta_inr, 0),
    });
    summary.categories = BUDGET_CATEGORIES.map((category): BudgetCategoryLine => {
      const line = lines.get(category);
      const inCategory = rows.filter((row) => row.vendor_category === category);
      const committed = inCategory.reduce((sum, row) => sum + row.committed_inr, 0);
      const position = categoryPosition(line ? safeInt("planned_inr", line.planned_inr) : null, committed);
      return {
        budget_category: category,
        seed_key: line?.seed_key ?? null,
        label: BUDGET_CATEGORY_LABELS[category].en,
        label_hi: BUDGET_CATEGORY_LABELS[category].hi,
        has_line: position.has_line,
        planned_inr: position.planned_inr,
        committed_inr: safeInt("committed_inr", committed),
        paid_inr: safeInt("paid_inr", inCategory.reduce((sum, row) => sum + row.paid_inr, 0)),
        outstanding_inr: safeInt("outstanding_inr", inCategory.reduce((sum, row) => sum + row.outstanding_inr, 0)),
        uncommitted_inr: position.uncommitted_inr,
        over_budget_inr: position.over_budget_inr,
        pending_proposals_inr: safeInt(
          "pending_proposals_inr",
          pending
            .filter((proposal) => proposal.budget_category === category)
            .reduce((sum, proposal) => sum + proposal.committed_delta_inr, 0),
        ),
      };
    });
  }

  return summary;
}
