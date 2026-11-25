import "server-only";

/**
 * The ledger maths (domain-and-data 2.1 M4–M6, 2.2 C6, 2.3 E1–E3), in one place.
 *
 * - Pure functions: per-vendor figures (M4), wedding totals as sums of vendor figures (M5,
 *   never committed minus paid), the budget position and category lines (M6, `has_line`),
 *   the due state (4.2, D99) and the catering estimate (E2, E3).
 * - Database helpers the money commands and the read models share: `loadVendorFigures`,
 *   `vendorTotals` (every money command's `result.vendor_totals`) and `moneyWarnings`
 *   (`over_budget` and `overpaid`, 3.3).
 *
 * Current versions only (C1: `superseded_at` empty), active commitments, non-void payments,
 * non-deleted vendors. Every aggregate is cast to bigint, and every figure is checked to be
 * a safe integer before it leaves this module (domain 0.1).
 */
import { and, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";

import { CommandFailure, type CommandWarning, type CommandWarningKind, type VendorTotals } from "@/contracts/commands";
import {
  BUDGET_CATEGORY_LABELS,
  type BudgetCategory,
  type DueState,
  type EstimateDirection,
  type IsoDate,
  type MemberRole,
  type SessionActor,
  type SharingSettings,
} from "@/contracts/domain";
import { formatInr, groupIndian } from "@/contracts/money";
import { managerSeesBlock } from "@/contracts/permissions";
import type { HiddenBlock, MoneyTotals } from "@/contracts/read-models";
import type { DbOrTx } from "@/db/client";
import { daysBetween } from "@/db/ist";
import {
  budgetLines,
  budgets,
  commitmentVersions,
  commitments,
  members,
  paymentVersions,
  payments,
  vendors,
  weddings,
} from "@/db/schema";

// ---------------------------------------------------------------------------
// Safe integers (domain 0.1)
// ---------------------------------------------------------------------------

/** Returns `value` as a number, or throws when it is not a safe integer (strings from SQL included). */
export function safeInt(name: string, value: unknown): number {
  const number = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof number !== "number" || !Number.isSafeInteger(number)) {
    throw new Error(`ledger: ${name} is not a safe integer`);
  }
  return number;
}

/** A nullable aggregate: null and undefined read as 0. */
export function safeIntOrZero(name: string, value: unknown): number {
  return value === null || value === undefined ? 0 : safeInt(name, value);
}

/** A `date` value from SQL as "YYYY-MM-DD" (Drizzle passes dates through as strings). */
export function isoDateOrNull(value: unknown): IsoDate | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = String(value);
  return text === "" ? null : text.slice(0, 10);
}

// ---------------------------------------------------------------------------
// Pure maths
// ---------------------------------------------------------------------------

/** M4: one vendor's figures from its committed and paid sums. */
export function vendorFigures(committed_inr: number, paid_inr: number): VendorTotals {
  const committed = safeInt("committed_inr", committed_inr);
  const paid = safeInt("paid_inr", paid_inr);
  return {
    committed_inr: committed,
    paid_inr: paid,
    outstanding_inr: Math.max(0, committed - paid),
    overpaid_inr: Math.max(0, paid - committed),
  };
}

export type WeddingFigureTotals = {
  total_committed_inr: number;
  total_paid_inr: number;
  total_outstanding_inr: number;
  total_overpaid_inr: number;
};

/**
 * M5: the wedding's totals are sums of the vendors' M4 figures. Outstanding is never
 * committed minus paid, so one overpaid vendor never hides another vendor's due.
 */
export function sumVendorFigures(rows: readonly VendorTotals[]): WeddingFigureTotals {
  let committed = 0;
  let paid = 0;
  let outstanding = 0;
  let overpaid = 0;
  for (const row of rows) {
    committed += row.committed_inr;
    paid += row.paid_inr;
    outstanding += row.outstanding_inr;
    overpaid += row.overpaid_inr;
  }
  return {
    total_committed_inr: safeInt("total_committed_inr", committed),
    total_paid_inr: safeInt("total_paid_inr", paid),
    total_outstanding_inr: safeInt("total_outstanding_inr", outstanding),
    total_overpaid_inr: safeInt("total_overpaid_inr", overpaid),
  };
}

/** M5's check: total outstanding − total overpaid = total committed − total paid. */
export function totalsBalance(totals: WeddingFigureTotals): boolean {
  return (
    totals.total_outstanding_inr - totals.total_overpaid_inr === totals.total_committed_inr - totals.total_paid_inr
  );
}

/** M6: against a budget (the wedding's, or a category line's). */
export function budgetPosition(budget_inr: number, committed_inr: number): { uncommitted_inr: number; over_budget_inr: number } {
  return {
    uncommitted_inr: Math.max(0, budget_inr - committed_inr),
    over_budget_inr: Math.max(0, committed_inr - budget_inr),
  };
}

/**
 * M6 for one category. No `budget_lines` row is not a line of ₹0: `has_line` false,
 * `planned_inr` null, and uncommitted and over-budget both 0 (never `over_budget`).
 */
export function categoryPosition(
  planned_inr: number | null,
  committed_inr: number,
): { has_line: boolean; planned_inr: number | null; uncommitted_inr: number; over_budget_inr: number } {
  if (planned_inr === null) return { has_line: false, planned_inr: null, uncommitted_inr: 0, over_budget_inr: 0 };
  return { has_line: true, planned_inr: safeInt("planned_inr", planned_inr), ...budgetPosition(planned_inr, committed_inr) };
}

/** M5 and M6: the totals block of `money_summary`. */
export function moneyTotals(input: {
  vendors: readonly VendorTotals[];
  budget_inr: number;
  /** Every `budget_lines.planned_inr` of the wedding. */
  planned_lines_inr: readonly number[];
  /** Sum of `committed_delta_inr` over pending proposals (A5: never part of a total). */
  pending_proposals_inr: number;
}): MoneyTotals {
  const totals = sumVendorFigures(input.vendors);
  const budget = safeInt("budget_inr", input.budget_inr);
  const lines = input.planned_lines_inr.reduce((sum, planned) => sum + planned, 0);
  const pending = safeInt("pending_proposals_inr", input.pending_proposals_inr);
  return {
    ...totals,
    budget_inr: budget,
    ...budgetPosition(budget, totals.total_committed_inr),
    unallocated_inr: safeInt("unallocated_inr", Math.max(0, budget - lines)),
    pending_proposals_inr: pending,
    if_approved_committed_inr: safeInt("if_approved_committed_inr", totals.total_committed_inr + pending),
  };
}

/** The earliest due date counts only while something is outstanding (4.2). */
export function nextDueOn(outstanding_inr: number, earliest_due_on: IsoDate | null): IsoDate | null {
  return outstanding_inr > 0 ? earliest_due_on : null;
}

/**
 * 4.2 and D99: whole IST calendar days from today to `next_due_on` (null without a date),
 * and the due state: `none` without a date, `overdue` before today, `due_soon` within the
 * next 7 days, otherwise `upcoming`. On 25 Nov, a 1 Dec due date reads 6 and `due_soon`.
 */
export function dueFor(next_due_on: IsoDate | null, today: IsoDate): { days_until_due: number | null; due_state: DueState } {
  if (!next_due_on) return { days_until_due: null, due_state: "none" };
  const days = safeInt("days_until_due", daysBetween(today, next_due_on));
  const due_state: DueState = days < 0 ? "overdue" : days <= 7 ? "due_soon" : "upcoming";
  return { days_until_due: days, due_state };
}

/** E1: the units an estimate exists for. */
export const ESTIMATE_UNITS = ["plate", "person"] as const;

/** E1: an active commitment whose current version is per plate or per person, for a function. */
export function estimateApplies(version: {
  pricing: string;
  unit: string | null;
  unit_price_inr: number | null;
  event_id: string | null;
  voided?: boolean;
}): boolean {
  if (version.voided) return false;
  if (version.pricing !== "per_unit" || version.event_id === null || version.unit_price_inr === null) return false;
  return (ESTIMATE_UNITS as readonly string[]).includes(version.unit ?? "");
}

/**
 * E2 and E3: `estimate_inr` = confirmed headcount × the current unit price; `difference_inr`
 * is the absolute difference from the contract, with `direction` below, above or equal.
 */
export function cateringEstimate(
  confirmed_headcount: number,
  unit_price_inr: number,
  contract_amount_inr: number,
): { estimate_inr: number; difference_inr: number; direction: EstimateDirection } {
  const estimate = safeInt("estimate_inr", safeInt("confirmed_headcount", confirmed_headcount) * safeInt("unit_price_inr", unit_price_inr));
  const contract = safeInt("contract_amount_inr", contract_amount_inr);
  const direction: EstimateDirection = estimate < contract ? "below" : estimate > contract ? "above" : "equal";
  return { estimate_inr: estimate, difference_inr: Math.abs(contract - estimate), direction };
}

/** E6's labels. */
export const ESTIMATE_LABEL = { en: "Estimate, not the contract", hi: "अंदाज़ा, कॉन्ट्रैक्ट नहीं" } as const;

/** E6: "230 attending × ₹800". */
export function estimateFormulaText(confirmed_headcount: number, unit_price_inr: number): string {
  return `${groupIndian(confirmed_headcount)} attending × ${formatInr(unit_price_inr)}`;
}

/** voice.md 4.10's English line for an overpaid vendor: "Annapoorna Caterers has been overpaid by ₹5,000." */
export function overpaidMessage(vendor_name: string, overpaid_inr: number): string {
  return `${vendor_name} has been overpaid by ${formatInr(overpaid_inr)}.`;
}

/** voice.md 4.10's English line for a category: "Photography and video is ₹5,000 over its ₹1,20,000 budget." */
export function categoryOverBudgetMessage(category: BudgetCategory, over_budget_inr: number, planned_inr: number): string {
  return `${BUDGET_CATEGORY_LABELS[category].en} is ${formatInr(over_budget_inr)} over its ${formatInr(planned_inr)} budget.`;
}

/** M6's wedding-level check: "The wedding is ₹5,000 over its ₹12,00,000 budget." */
export function weddingOverBudgetMessage(over_budget_inr: number, budget_inr: number): string {
  return `The wedding is ${formatInr(over_budget_inr)} over its ${formatInr(budget_inr)} budget.`;
}

// ---------------------------------------------------------------------------
// Database helpers
// ---------------------------------------------------------------------------

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True for a uuid-shaped string, so a malformed id reads as "not found" and never reaches SQL. */
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

/** Who is reading a money read model: the member row and the wedding's sharing flags (G7). */
export type LedgerReader = {
  role: MemberRole;
  member_id: string;
  sharing: SharingSettings;
  /** `weddings.version` at the read (5.6). */
  version: number;
};

/**
 * The reader's membership and the wedding's sharing flags. The guard has already checked
 * base access; a missing wedding or membership still reads as 404 `not_found`.
 */
export async function loadLedgerReader(db: DbOrTx, actor: SessionActor, wedding_id: string): Promise<LedgerReader> {
  if (!isUuid(wedding_id)) throw new CommandFailure({ code: "not_found", message: "Wedding not found." });
  const [weddingRows, memberRows] = await Promise.all([
    db
      .select({
        version: weddings.version,
        managers_can_see_vendor_dues: weddings.managers_can_see_vendor_dues,
        managers_can_see_budget: weddings.managers_can_see_budget,
        managers_can_see_guest_contacts: weddings.managers_can_see_guest_contacts,
      })
      .from(weddings)
      .where(eq(weddings.id, wedding_id))
      .limit(1),
    db
      .select({ member_id: members.id, role: members.role })
      .from(members)
      .where(and(eq(members.wedding_id, wedding_id), eq(members.user_id, actor.user_id), isNull(members.removed_at)))
      .limit(1),
  ]);
  const wedding = weddingRows[0];
  const member = memberRows[0];
  if (!wedding || !member) throw new CommandFailure({ code: "not_found", message: "Wedding not found." });
  return {
    role: member.role,
    member_id: member.member_id,
    sharing: {
      managers_can_see_vendor_dues: wedding.managers_can_see_vendor_dues,
      managers_can_see_budget: wedding.managers_can_see_budget,
      managers_can_see_guest_contacts: wedding.managers_can_see_guest_contacts,
    },
    version: safeInt("version", wedding.version),
  };
}

/** Owners see every block; a manager sees a block only while its sharing flag is on (G7). */
export function readerSees(reader: Pick<LedgerReader, "role" | "sharing">, block: HiddenBlock): boolean {
  return reader.role === "owner" || managerSeesBlock(block, reader.sharing);
}

/** Every member's display name, removed members included, for "by" labels. */
export async function memberLabels(db: DbOrTx, wedding_id: string): Promise<Map<string, string>> {
  const rows = await db
    .select({ id: members.id, display_name: members.display_name })
    .from(members)
    .where(eq(members.wedding_id, wedding_id));
  return new Map(rows.map((row) => [row.id, row.display_name]));
}

export type VendorFigureRow = VendorTotals & {
  vendor_id: string;
  vendor_category: BudgetCategory;
  /** The earliest `due_on` among active commitments' current versions (before the outstanding rule). */
  earliest_due_on: IsoDate | null;
};

/**
 * M4 for every non-deleted vendor of the wedding (or only `vendor_ids`), keyed by vendor id.
 * Vendors with no money get zeros. Safe inside a command's transaction: it reads what the
 * transaction has written.
 */
export async function loadVendorFigures(
  db: DbOrTx,
  wedding_id: string,
  vendor_ids?: readonly string[],
): Promise<Map<string, VendorFigureRow>> {
  if (vendor_ids && vendor_ids.length === 0) return new Map();
  const vendorFilter: SQL | undefined = vendor_ids ? inArray(vendors.id, [...vendor_ids]) : undefined;

  const [vendorRows, committedRows, paidRows] = await Promise.all([
    db
      .select({ vendor_id: vendors.id, vendor_category: vendors.vendor_category })
      .from(vendors)
      .where(and(eq(vendors.wedding_id, wedding_id), isNull(vendors.deleted_at), vendorFilter)),
    db
      .select({
        vendor_id: commitments.vendor_id,
        committed_inr: sql<number>`coalesce(sum(${commitmentVersions.amount_inr}), 0)::bigint`,
        earliest_due_on: sql<string | null>`min(${commitmentVersions.due_on})`,
      })
      .from(commitments)
      .innerJoin(
        commitmentVersions,
        and(
          eq(commitmentVersions.commitment_id, commitments.id),
          eq(commitmentVersions.wedding_id, commitments.wedding_id),
          isNull(commitmentVersions.superseded_at),
        ),
      )
      .innerJoin(vendors, and(eq(vendors.id, commitments.vendor_id), eq(vendors.wedding_id, commitments.wedding_id)))
      .where(and(eq(commitments.wedding_id, wedding_id), isNull(commitments.voided_at), isNull(vendors.deleted_at), vendorFilter))
      .groupBy(commitments.vendor_id),
    db
      .select({
        vendor_id: payments.vendor_id,
        paid_inr: sql<number>`coalesce(sum(${paymentVersions.amount_inr}), 0)::bigint`,
      })
      .from(payments)
      .innerJoin(
        paymentVersions,
        and(
          eq(paymentVersions.payment_id, payments.id),
          eq(paymentVersions.wedding_id, payments.wedding_id),
          isNull(paymentVersions.superseded_at),
        ),
      )
      .innerJoin(vendors, and(eq(vendors.id, payments.vendor_id), eq(vendors.wedding_id, payments.wedding_id)))
      .where(and(eq(payments.wedding_id, wedding_id), isNull(payments.voided_at), isNull(vendors.deleted_at), vendorFilter))
      .groupBy(payments.vendor_id),
  ]);

  const committed = new Map(committedRows.map((row) => [row.vendor_id, row]));
  const paid = new Map(paidRows.map((row) => [row.vendor_id, row]));
  const result = new Map<string, VendorFigureRow>();
  for (const vendor of vendorRows) {
    const c = committed.get(vendor.vendor_id);
    const p = paid.get(vendor.vendor_id);
    result.set(vendor.vendor_id, {
      vendor_id: vendor.vendor_id,
      vendor_category: vendor.vendor_category,
      ...vendorFigures(safeIntOrZero("committed_inr", c?.committed_inr), safeIntOrZero("paid_inr", p?.paid_inr)),
      earliest_due_on: isoDateOrNull(c?.earliest_due_on),
    });
  }
  return result;
}

/**
 * Every money command's `result.vendor_totals` (3.3): the vendor's M4 figures after the
 * command's writes. A vendor of another wedding, or a deleted one, reads as zeros.
 */
export async function vendorTotals(db: DbOrTx, wedding_id: string, vendor_id: string): Promise<VendorTotals> {
  // A malformed id would make Postgres throw and abort the command's transaction.
  if (!isUuid(wedding_id) || !isUuid(vendor_id)) return vendorFigures(0, 0);
  const row = (await loadVendorFigures(db, wedding_id, [vendor_id])).get(vendor_id);
  if (!row) return vendorFigures(0, 0);
  return {
    committed_inr: row.committed_inr,
    paid_inr: row.paid_inr,
    outstanding_inr: row.outstanding_inr,
    overpaid_inr: row.overpaid_inr,
  };
}

/** The committed sum of one category's non-deleted vendors (M6). */
async function categoryCommitted(db: DbOrTx, wedding_id: string, category: BudgetCategory): Promise<number> {
  const rows = await db
    .select({ committed_inr: sql<number>`coalesce(sum(${commitmentVersions.amount_inr}), 0)::bigint` })
    .from(commitments)
    .innerJoin(
      commitmentVersions,
      and(
        eq(commitmentVersions.commitment_id, commitments.id),
        eq(commitmentVersions.wedding_id, commitments.wedding_id),
        isNull(commitmentVersions.superseded_at),
      ),
    )
    .innerJoin(vendors, and(eq(vendors.id, commitments.vendor_id), eq(vendors.wedding_id, commitments.wedding_id)))
    .where(
      and(
        eq(commitments.wedding_id, wedding_id),
        isNull(commitments.voided_at),
        isNull(vendors.deleted_at),
        eq(vendors.vendor_category, category),
      ),
    );
  return safeIntOrZero("category_committed_inr", rows[0]?.committed_inr);
}

/** The wedding's committed total (M5), as the sum of current versions of active commitments. */
async function weddingCommitted(db: DbOrTx, wedding_id: string): Promise<number> {
  const rows = await db
    .select({ committed_inr: sql<number>`coalesce(sum(${commitmentVersions.amount_inr}), 0)::bigint` })
    .from(commitments)
    .innerJoin(
      commitmentVersions,
      and(
        eq(commitmentVersions.commitment_id, commitments.id),
        eq(commitmentVersions.wedding_id, commitments.wedding_id),
        isNull(commitmentVersions.superseded_at),
      ),
    )
    .innerJoin(vendors, and(eq(vendors.id, commitments.vendor_id), eq(vendors.wedding_id, commitments.wedding_id)))
    .where(and(eq(commitments.wedding_id, wedding_id), isNull(commitments.voided_at), isNull(vendors.deleted_at)));
  return safeIntOrZero("wedding_committed_inr", rows[0]?.committed_inr);
}

export type MoneyWarningOptions = {
  /** Only these kinds (default both `over_budget` and `overpaid`). */
  kinds?: readonly Extract<CommandWarningKind, "over_budget" | "overpaid">[];
};

/**
 * The money warnings (3.3) for the vendor's position after the command's writes:
 * - `overpaid` when the vendor's paid figure exceeds its committed figure (M4);
 * - `over_budget` when the vendor's category has a budget line and its committed sum is
 *   above it (M6; a category with no line never warns), and when the wedding's committed
 *   total is above a set budget (M6's wedding-level check).
 * The command still saves; these only travel in the response's `warnings`.
 * `record_payment` and `correct_payment` pass `{ kinds: ["overpaid"] }`; the commitment
 * commands pass `{ kinds: ["over_budget"] }`.
 */
export async function moneyWarnings(
  db: DbOrTx,
  wedding_id: string,
  vendor_id: string,
  options: MoneyWarningOptions = {},
): Promise<CommandWarning[]> {
  const kinds = new Set(options.kinds ?? ["over_budget", "overpaid"]);
  if (!isUuid(wedding_id) || !isUuid(vendor_id)) return [];
  const vendorRows = await db
    .select({ name: vendors.name, vendor_category: vendors.vendor_category })
    .from(vendors)
    .where(and(eq(vendors.id, vendor_id), eq(vendors.wedding_id, wedding_id), isNull(vendors.deleted_at)))
    .limit(1);
  const vendor = vendorRows[0];
  if (!vendor) return [];

  const warnings: CommandWarning[] = [];

  if (kinds.has("over_budget")) {
    const [lineRows, budgetRows, inCategory, total] = await Promise.all([
      db
        .select({ id: budgetLines.id, planned_inr: budgetLines.planned_inr })
        .from(budgetLines)
        .where(and(eq(budgetLines.wedding_id, wedding_id), eq(budgetLines.budget_category, vendor.vendor_category)))
        .limit(1),
      db.select({ total_inr: budgets.total_inr }).from(budgets).where(eq(budgets.wedding_id, wedding_id)).limit(1),
      categoryCommitted(db, wedding_id, vendor.vendor_category),
      weddingCommitted(db, wedding_id),
    ]);
    const line = lineRows[0];
    if (line) {
      const planned = safeInt("planned_inr", line.planned_inr);
      const { over_budget_inr } = categoryPosition(planned, inCategory);
      if (over_budget_inr > 0) {
        warnings.push({
          kind: "over_budget",
          message: categoryOverBudgetMessage(vendor.vendor_category, over_budget_inr, planned),
          entity_ids: [vendor_id, line.id],
        });
      }
    }
    const budget = budgetRows[0] ? safeInt("budget_inr", budgetRows[0].total_inr) : 0;
    if (budget > 0) {
      const { over_budget_inr } = budgetPosition(budget, total);
      if (over_budget_inr > 0) {
        warnings.push({ kind: "over_budget", message: weddingOverBudgetMessage(over_budget_inr, budget), entity_ids: [wedding_id] });
      }
    }
  }

  if (kinds.has("overpaid")) {
    const totals = await vendorTotals(db, wedding_id, vendor_id);
    if (totals.overpaid_inr > 0) {
      warnings.push({ kind: "overpaid", message: overpaidMessage(vendor.name, totals.overpaid_inr), entity_ids: [vendor_id] });
    }
  }

  return warnings;
}
