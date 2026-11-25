import "server-only";

/**
 * `vendor_ledger` (domain-and-data 4.2; M4, C1–C10, E1–E6): one vendor with its contact,
 * functions and M4 figures; its quotes; its commitments and payments at their current
 * versions (voided ones stay listed, C9); every version of both, oldest first (C7); and the
 * catering estimate rows (4.5) for the vendor.
 *
 * Visibility as `money_summary`'s vendor rows: owners, and managers while
 * `managers_can_see_vendor_dues` is on. Otherwise only the vendor block is returned and
 * `vendor_money` and `estimate` are listed in `hidden` ("Not shared with you").
 */
import { and, asc, eq, inArray, isNull } from "drizzle-orm";

import { CommandFailure } from "@/contracts/commands";
import type { SessionActor, WeddingId } from "@/contracts/domain";
import { formatPerUnitFormula } from "@/contracts/money";
import type {
  CommitmentView,
  HiddenBlock,
  LedgerHistoryEntry,
  PaymentView,
  QuoteView,
  ReadModelParams,
  VendorLedger,
} from "@/contracts/read-models";
import type { DbOrTx } from "@/db/client";
import { toIstInstant } from "@/db/ist";
import { commitmentVersions, commitments, events, paymentVersions, payments, quotes, vendorEvents, vendors } from "@/db/schema";

import { cateringEstimateRows } from "./catering-estimate";
import { isUuid, loadLedgerReader, memberLabels, readerSees, safeInt, vendorTotals } from "./ledger-math";

const intOrNull = (name: string, value: number | null): number | null => (value === null ? null : safeInt(name, value));

/** The current version (C1: `superseded_at` empty), else the one the identity row names, else the latest. */
function currentOf<V extends { version_no: number; superseded_at: Date | null }>(versions: V[], current_version_no: number): V | undefined {
  return (
    versions.find((version) => version.superseded_at === null) ??
    versions.find((version) => version.version_no === current_version_no) ??
    versions[versions.length - 1]
  );
}

function groupBy<T, K>(rows: T[], key: (row: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const row of rows) {
    const list = map.get(key(row));
    if (list) list.push(row);
    else map.set(key(row), [row]);
  }
  return map;
}

export async function buildVendorLedger(
  db: DbOrTx,
  actor: SessionActor,
  wedding_id: WeddingId,
  params: ReadModelParams<"vendor_ledger">,
): Promise<VendorLedger> {
  const reader = await loadLedgerReader(db, actor, wedding_id);
  const vendor_id = params?.vendor_id;
  if (!isUuid(vendor_id)) throw new CommandFailure({ code: "not_found", message: "Vendor not found." });

  const [vendorRows, functionRows] = await Promise.all([
    db
      .select({
        vendor_id: vendors.id,
        seed_key: vendors.seed_key,
        name: vendors.name,
        vendor_category: vendors.vendor_category,
        status: vendors.status,
        is_one_off: vendors.is_one_off,
        contact_name: vendors.contact_name,
        contact_phone: vendors.contact_phone,
        notes: vendors.notes,
      })
      .from(vendors)
      .where(and(eq(vendors.id, vendor_id), eq(vendors.wedding_id, wedding_id), isNull(vendors.deleted_at)))
      .limit(1),
    db
      .select({ event_id: events.id, title: events.title, title_hi: events.title_hi })
      .from(vendorEvents)
      .innerJoin(events, and(eq(events.id, vendorEvents.event_id), eq(events.wedding_id, vendorEvents.wedding_id)))
      .where(and(eq(vendorEvents.vendor_id, vendor_id), eq(vendorEvents.wedding_id, wedding_id), isNull(events.deleted_at)))
      .orderBy(asc(events.event_date), asc(events.start_time), asc(events.sort_order)),
  ]);
  const vendor = vendorRows[0];
  if (!vendor) throw new CommandFailure({ code: "not_found", message: "Vendor not found." });

  const hidden: HiddenBlock[] = [];
  const ledger: VendorLedger = {
    version: reader.version,
    hidden,
    vendor: { ...vendor, functions: functionRows },
  };
  if (!readerSees(reader, "vendor_money")) {
    hidden.push("vendor_money", "estimate");
    return ledger;
  }

  const [figures, quoteRows, commitmentRows, paymentRows, labels, estimate] = await Promise.all([
    vendorTotals(db, wedding_id, vendor_id),
    db
      .select({
        quote_id: quotes.id,
        seed_key: quotes.seed_key,
        event_id: quotes.event_id,
        pricing: quotes.pricing,
        unit: quotes.unit,
        unit_price_inr: quotes.unit_price_inr,
        quantity: quotes.quantity,
        amount_inr: quotes.amount_inr,
        description: quotes.description,
        quoted_on: quotes.quoted_on,
        valid_until: quotes.valid_until,
        status: quotes.status,
      })
      .from(quotes)
      .where(and(eq(quotes.vendor_id, vendor_id), eq(quotes.wedding_id, wedding_id)))
      .orderBy(asc(quotes.quoted_on), asc(quotes.created_at), asc(quotes.seed_key)),
    db
      .select({
        commitment_id: commitments.id,
        seed_key: commitments.seed_key,
        quote_id: commitments.quote_id,
        current_version_no: commitments.current_version_no,
        voided_at: commitments.voided_at,
        void_reason: commitments.void_reason,
      })
      .from(commitments)
      .where(and(eq(commitments.vendor_id, vendor_id), eq(commitments.wedding_id, wedding_id)))
      .orderBy(asc(commitments.created_at), asc(commitments.seed_key), asc(commitments.id)),
    db
      .select({
        payment_id: payments.id,
        seed_key: payments.seed_key,
        commitment_id: payments.commitment_id,
        payment_kind: payments.payment_kind,
        current_version_no: payments.current_version_no,
        voided_at: payments.voided_at,
        void_reason: payments.void_reason,
      })
      .from(payments)
      .where(and(eq(payments.vendor_id, vendor_id), eq(payments.wedding_id, wedding_id)))
      .orderBy(asc(payments.created_at), asc(payments.seed_key), asc(payments.id)),
    memberLabels(db, wedding_id),
    cateringEstimateRows(db, wedding_id, { vendor_id }),
  ]);

  const commitmentIds = commitmentRows.map((row) => row.commitment_id);
  const paymentIds = paymentRows.map((row) => row.payment_id);
  const [commitmentVersionRows, paymentVersionRows] = await Promise.all([
    commitmentIds.length === 0
      ? Promise.resolve([])
      : db
          .select()
          .from(commitmentVersions)
          .where(and(eq(commitmentVersions.wedding_id, wedding_id), inArray(commitmentVersions.commitment_id, commitmentIds)))
          .orderBy(asc(commitmentVersions.commitment_id), asc(commitmentVersions.version_no)),
    paymentIds.length === 0
      ? Promise.resolve([])
      : db
          .select()
          .from(paymentVersions)
          .where(and(eq(paymentVersions.wedding_id, wedding_id), inArray(paymentVersions.payment_id, paymentIds)))
          .orderBy(asc(paymentVersions.payment_id), asc(paymentVersions.version_no)),
  ]);
  const commitmentVersionsById = groupBy(commitmentVersionRows, (row) => row.commitment_id);
  const paymentVersionsById = groupBy(paymentVersionRows, (row) => row.payment_id);
  const labelOf = (member_id: string | null): string | null => (member_id ? (labels.get(member_id) ?? null) : null);

  const history: (LedgerHistoryEntry & { sort_at: number; sort_entity: number })[] = [];

  ledger.figures = figures;

  ledger.quotes = quoteRows.map(
    (quote): QuoteView => ({
      ...quote,
      unit_price_inr: intOrNull("unit_price_inr", quote.unit_price_inr),
      quantity: intOrNull("quantity", quote.quantity),
      amount_inr: safeInt("amount_inr", quote.amount_inr),
    }),
  );

  ledger.commitments = [];
  for (const commitment of commitmentRows) {
    const versions = commitmentVersionsById.get(commitment.commitment_id) ?? [];
    const current = currentOf(versions, commitment.current_version_no);
    if (!current) continue;
    for (const version of versions) {
      history.push({
        entity: "commitment",
        entity_id: commitment.commitment_id,
        seed_key: version.seed_key,
        version_no: version.version_no,
        values: {
          amount_inr: safeInt("amount_inr", version.amount_inr),
          pricing: version.pricing,
          unit: version.unit,
          unit_price_inr: intOrNull("unit_price_inr", version.unit_price_inr),
          quantity: intOrNull("quantity", version.quantity),
          due_on: version.due_on,
        },
        change_reason: version.change_reason,
        by: labelOf(version.created_by_member_id),
        at: toIstInstant(version.created_at),
        source: version.source,
        spoken_text: version.spoken_text,
        sort_at: version.created_at.getTime(),
        sort_entity: 0,
      });
    }
    const unit_price_inr = intOrNull("unit_price_inr", current.unit_price_inr);
    const quantity = intOrNull("quantity", current.quantity);
    const view: CommitmentView = {
      commitment_id: commitment.commitment_id,
      seed_key: commitment.seed_key,
      quote_id: commitment.quote_id,
      version_no: current.version_no,
      version_count: versions.length,
      pricing: current.pricing,
      unit: current.unit,
      unit_price_inr,
      quantity,
      amount_inr: safeInt("amount_inr", current.amount_inr),
      event_id: current.event_id,
      description: current.description,
      agreed_on: current.agreed_on,
      due_on: current.due_on,
      formula_text:
        current.pricing === "per_unit" && current.unit && unit_price_inr !== null && quantity !== null
          ? formatPerUnitFormula(quantity, current.unit, unit_price_inr)
          : null,
      voided: commitment.voided_at !== null,
      void_reason: commitment.void_reason,
    };
    ledger.commitments.push(view);
  }

  ledger.payments = [];
  for (const payment of paymentRows) {
    const versions = paymentVersionsById.get(payment.payment_id) ?? [];
    const current = currentOf(versions, payment.current_version_no);
    if (!current) continue;
    const previous = versions.find((version) => version.version_no === current.version_no - 1) ?? null;
    for (const version of versions) {
      history.push({
        entity: "payment",
        entity_id: payment.payment_id,
        seed_key: version.seed_key,
        version_no: version.version_no,
        values: {
          amount_inr: safeInt("amount_inr", version.amount_inr),
          paid_on: version.paid_on,
          method: version.method,
          note: version.note,
        },
        change_reason: version.change_reason,
        by: labelOf(version.created_by_member_id),
        at: toIstInstant(version.created_at),
        source: version.source,
        spoken_text: version.spoken_text,
        sort_at: version.created_at.getTime(),
        sort_entity: 1,
      });
    }
    const view: PaymentView = {
      payment_id: payment.payment_id,
      seed_key: payment.seed_key,
      commitment_id: payment.commitment_id,
      payment_kind: payment.payment_kind,
      version_no: current.version_no,
      version_count: versions.length,
      amount_inr: safeInt("amount_inr", current.amount_inr),
      paid_on: current.paid_on,
      method: current.method,
      note: current.note,
      // C7: the struck-through value is the version before the current one, when it differs.
      previous_amount_inr:
        previous && previous.amount_inr !== current.amount_inr ? safeInt("previous_amount_inr", previous.amount_inr) : null,
      corrected_by: previous ? labelOf(current.created_by_member_id) : null,
      corrected_at: previous ? toIstInstant(current.created_at) : null,
      voided: payment.voided_at !== null,
      void_reason: payment.void_reason,
    };
    ledger.payments.push(view);
  }

  // Oldest first (C7); ties keep commitments before payments and versions in order.
  history.sort(
    (a, b) =>
      a.sort_at - b.sort_at ||
      a.sort_entity - b.sort_entity ||
      a.entity_id.localeCompare(b.entity_id) ||
      a.version_no - b.version_no,
  );
  ledger.history = history.map(({ sort_at: _at, sort_entity: _entity, ...entry }) => {
    void _at;
    void _entity;
    return entry;
  });
  ledger.estimate = estimate;
  return ledger;
}
