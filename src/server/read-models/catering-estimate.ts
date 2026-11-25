import "server-only";

/**
 * `catering_estimate` (domain-and-data 4.5; E1–E7): one row per active commitment whose
 * current version is per plate or per person and linked to a function. The estimate is
 * confirmed headcount × the current unit price; it is computed on every read, never stored
 * and never added to any total (E4). Visibility as vendor money (`estimate` in `hidden`).
 */
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";

import type { SessionActor, WeddingId } from "@/contracts/domain";
import type { CateringEstimate, CateringEstimateRow, HiddenBlock, ReadModelParams } from "@/contracts/read-models";
import type { DbOrTx } from "@/db/client";
import { commitmentVersions, commitments, events, guests, invitations, vendors } from "@/db/schema";

import {
  ESTIMATE_LABEL,
  ESTIMATE_UNITS,
  cateringEstimate,
  estimateFormulaText,
  isUuid,
  loadLedgerReader,
  readerSees,
  safeInt,
  safeIntOrZero,
} from "./ledger-math";

/** R4 and R5: each function's confirmed headcount (attending rows count 1 + plus-ones). */
export async function confirmedHeadcounts(db: DbOrTx, wedding_id: string, event_ids: readonly string[]): Promise<Map<string, number>> {
  if (event_ids.length === 0) return new Map();
  const rows = await db
    .select({
      event_id: invitations.event_id,
      confirmed_headcount: sql<number>`coalesce(sum(case when ${invitations.rsvp_status} = 'attending' then 1 + ${invitations.plus_ones} else 0 end), 0)::bigint`,
    })
    .from(invitations)
    .innerJoin(guests, and(eq(guests.id, invitations.guest_id), eq(guests.wedding_id, invitations.wedding_id)))
    .where(
      and(
        eq(invitations.wedding_id, wedding_id),
        isNull(invitations.revoked_at),
        isNull(guests.deleted_at),
        inArray(invitations.event_id, [...event_ids]),
      ),
    )
    .groupBy(invitations.event_id);
  return new Map(rows.map((row) => [row.event_id, safeIntOrZero("confirmed_headcount", row.confirmed_headcount)]));
}

/** The estimate rows for a wedding, optionally for one vendor or one function. No role check. */
export async function cateringEstimateRows(
  db: DbOrTx,
  wedding_id: string,
  filter: { vendor_id?: string; event_id?: string } = {},
): Promise<CateringEstimateRow[]> {
  if (filter.vendor_id !== undefined && !isUuid(filter.vendor_id)) return [];
  if (filter.event_id !== undefined && !isUuid(filter.event_id)) return [];

  const rows = await db
    .select({
      commitment_id: commitments.id,
      seed_key: commitments.seed_key,
      vendor_id: vendors.id,
      vendor_name: vendors.name,
      event_id: events.id,
      event_title: events.title,
      expected_headcount: events.expected_headcount,
      pricing: commitmentVersions.pricing,
      unit: commitmentVersions.unit,
      unit_price_inr: commitmentVersions.unit_price_inr,
      quantity: commitmentVersions.quantity,
      amount_inr: commitmentVersions.amount_inr,
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
    .innerJoin(events, and(eq(events.id, commitmentVersions.event_id), eq(events.wedding_id, commitments.wedding_id)))
    .where(
      and(
        eq(commitments.wedding_id, wedding_id),
        isNull(commitments.voided_at),
        isNull(vendors.deleted_at),
        isNull(events.deleted_at),
        eq(commitmentVersions.pricing, "per_unit"),
        inArray(commitmentVersions.unit, [...ESTIMATE_UNITS]),
        filter.vendor_id ? eq(vendors.id, filter.vendor_id) : undefined,
        filter.event_id ? eq(events.id, filter.event_id) : undefined,
      ),
    )
    .orderBy(asc(events.event_date), asc(events.start_time), asc(events.sort_order), asc(vendors.name), asc(commitments.created_at));

  const headcounts = await confirmedHeadcounts(
    db,
    wedding_id,
    [...new Set(rows.map((row) => row.event_id))],
  );

  const result: CateringEstimateRow[] = [];
  for (const row of rows) {
    // E1: the schema's per-unit check guarantees these, but an estimate never guesses.
    if (row.unit !== "plate" && row.unit !== "person") continue;
    if (row.unit_price_inr === null || row.quantity === null) continue;
    const confirmed = headcounts.get(row.event_id) ?? 0;
    const unit_price_inr = safeInt("unit_price_inr", row.unit_price_inr);
    const contract_amount_inr = safeInt("amount_inr", row.amount_inr);
    result.push({
      commitment_id: row.commitment_id,
      seed_key: row.seed_key,
      vendor_id: row.vendor_id,
      vendor_name: row.vendor_name,
      event_id: row.event_id,
      event_title: row.event_title,
      unit: row.unit,
      unit_price_inr,
      contract_amount_inr,
      contract_quantity: safeInt("quantity", row.quantity),
      expected_headcount: row.expected_headcount === null ? null : safeInt("expected_headcount", row.expected_headcount),
      confirmed_headcount: confirmed,
      ...cateringEstimate(confirmed, unit_price_inr, contract_amount_inr),
      formula_text: estimateFormulaText(confirmed, unit_price_inr),
      label: ESTIMATE_LABEL.en,
      label_hi: ESTIMATE_LABEL.hi,
    });
  }
  return result;
}

/**
 * The `catering_estimate` read model. Owners see it; a manager only while
 * `managers_can_see_vendor_dues` is on, otherwise `rows` is left out and `estimate` hidden.
 */
export async function buildCateringEstimate(
  db: DbOrTx,
  actor: SessionActor,
  wedding_id: WeddingId,
  params: ReadModelParams<"catering_estimate"> = {},
): Promise<CateringEstimate> {
  const reader = await loadLedgerReader(db, actor, wedding_id);
  const hidden: HiddenBlock[] = [];
  const model: CateringEstimate = { version: reader.version, hidden };
  if (!readerSees(reader, "estimate")) {
    hidden.push("estimate");
    return model;
  }
  model.rows = await cateringEstimateRows(db, wedding_id, { vendor_id: params?.vendor_id, event_id: params?.event_id });
  return model;
}
