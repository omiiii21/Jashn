import { ArrowLeft, CalendarBlank, Phone } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import type { ReactNode } from "react";

import {
  Amount,
  CorrectedBy,
  CorrectionTrail,
  EmptyState,
  EstimateBox,
  HistoryEntry,
  MoneyRow,
  NotShared,
  SectionHeading,
  StatusLabel,
  Wash,
  type MoneyTone,
} from "@/components/planner";
import { formatDayMonth, istDateOf } from "@/components/planner/format";
import { formatWeekdayDayMonth } from "@/components/planner/kit/dates";
import { BUDGET_CATEGORY_LABELS, PAYMENT_KIND_LABELS, type WeddingId } from "@/contracts/domain";
import { formatInr, formatOverpaid } from "@/contracts/money";
import type {
  CateringEstimateRow,
  CommitmentView,
  LedgerHistoryEntry,
  MoneySummaryVendorRow,
  PaymentView,
  VendorLedger,
  VendorMoneyFigures,
} from "@/contracts/read-models";
import { routes } from "@/contracts/routes";

import {
  VENDOR_STATUS_LABELS,
  commitmentFormula,
  describeHistoryEntry,
  dueLine,
  firstVersion,
  type DueLine,
  paymentMeta,
  previousVersion,
  quoteFormula,
} from "./vendor-text";

const SHEET = "rounded-sheet border border-line bg-paper p-4 lg:p-6";
const LINK = "text-maroon underline underline-offset-4 hover:text-maroon-deep";

function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

/** "All vendors", the way back to the list. */
export function BackToVendors({ wedding_id }: { wedding_id: WeddingId }) {
  return (
    <Link
      href={routes.vendors(wedding_id)}
      className="-ml-2 inline-flex min-h-11 items-center gap-2 rounded-control px-2 text-table text-maroon hover:bg-paper hover:text-maroon-deep"
    >
      <ArrowLeft size={16} aria-hidden="true" />
      All vendors
    </Link>
  );
}

function Detail({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-meta text-ink-3">{term}</dt>
      <dd className="text-body text-ink">{children}</dd>
    </div>
  );
}

function VendorHeader({ ledger }: { ledger: VendorLedger }) {
  const { vendor } = ledger;
  const category = BUDGET_CATEGORY_LABELS[vendor.vendor_category];
  return (
    <header className="flex flex-col gap-4">
      <h1 className="font-serif text-title text-ink">{vendor.name}</h1>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 @3xl:grid-cols-4">
        <Detail term="Category">
          {category.en}{" "}
          <span lang="hi" className="text-ink-2">
            {category.hi}
          </span>
        </Detail>
        <Detail term="Status">{VENDOR_STATUS_LABELS[vendor.status]}</Detail>
        <Detail term="Contact">
          {/* The name and the number on lines of their own, so neither is left hanging. */}
          {vendor.contact_name ? <span className="block">{vendor.contact_name}</span> : null}
          {vendor.contact_phone ? (
            <span className="block">
              {/* Inline padding widens the tap target to 48 px without moving the line. */}
              <a href={telHref(vendor.contact_phone)} className={`py-3 tabular-nums whitespace-nowrap ${LINK}`}>
                <Phone size={16} aria-hidden="true" className="mr-1 inline-block align-middle" />
                {vendor.contact_phone}
              </a>
            </span>
          ) : null}
          {vendor.contact_name || vendor.contact_phone ? null : <span className="text-ink-3">Not added yet</span>}
        </Detail>
        <Detail term="Serving">
          {vendor.functions.length === 0 ? (
            <span className="text-ink-3">No function linked yet</span>
          ) : (
            <>
              {vendor.functions.map((fn) => fn.title).join(", ")}{" "}
              <span lang="hi" className="text-ink-2">
                {vendor.functions.map((fn) => fn.title_hi).join(", ")}
              </span>
            </>
          )}
        </Detail>
      </dl>
      {vendor.notes ? <p className="max-w-prose text-body text-ink-2">{vendor.notes}</p> : null}
    </header>
  );
}

function QuoteSection({ ledger }: { ledger: VendorLedger }) {
  const quotes = ledger.quotes ?? [];
  if (quotes.length === 0) return null;
  return (
    <section aria-labelledby="vendor-quote" className="flex flex-col gap-2">
      <SectionHeading id="vendor-quote" meta="A quote never counts in a total">
        {quotes.length === 1 ? "Quote" : "Quotes"}
      </SectionHeading>
      <ul className="flex flex-col gap-1">
        {quotes.map((quote) => (
          <li key={quote.quote_id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <span className="text-table text-ink-2">
              {quote.description ?? "Quote"}
              {quote.quoted_on ? <span className="text-ink-3">, quoted {formatDayMonth(quote.quoted_on)}</span> : null}
            </span>
            <span className="text-table text-ink-2 tabular-nums">
              <span data-field="quotes.amount_inr">{quoteFormula(quote)}</span>, {quote.status}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ContractBlock({
  commitment,
  history,
}: {
  commitment: CommitmentView;
  history: readonly LedgerHistoryEntry[];
}) {
  const recorded = firstVersion(history, commitment.commitment_id);
  return (
    <div className={commitment.voided ? "text-ink-3" : undefined}>
      <p
        data-field="commitments.amount_inr"
        className={`-mx-1 rounded-chip px-1 text-heading tabular-nums ${
          commitment.voided ? "text-ink-3 line-through decoration-ink-3 decoration-[1.5px]" : "text-ink"
        }`}
      >
        <Wash watch={commitment.amount_inr}>{commitmentFormula(commitment)}</Wash>
      </p>
      {commitment.voided ? (
        <StatusLabel kind="void" label="Void" explanation={commitment.void_reason ?? undefined} className="mt-2" />
      ) : null}
      <ul className="mt-2 flex flex-col gap-1 text-table text-ink-2">
        {commitment.description ? <li>{commitment.description}</li> : null}
        {recorded ? (
          <li>
            Recorded {formatDayMonth(istDateOf(recorded.at))}
            {recorded.by ? ` by ${recorded.by}` : null}
            {commitment.version_count > 1 ? `, now on version ${commitment.version_no}` : null}
          </li>
        ) : null}
        {commitment.due_on ? (
          <li className="tabular-nums">Balance due {formatWeekdayDayMonth(commitment.due_on)}</li>
        ) : null}
      </ul>
    </div>
  );
}

function ContractSection({ ledger }: { ledger: VendorLedger }) {
  const commitments = ledger.commitments ?? [];
  const history = ledger.history ?? [];
  return (
    <section aria-labelledby="vendor-contract" className="flex flex-col gap-3">
      <SectionHeading
        id="vendor-contract"
        meta={commitments.length === 1 ? (commitments[0].seed_key ?? undefined) : undefined}
      >
        {commitments.length > 1 ? "Contracts" : "Contract"}
      </SectionHeading>
      {commitments.length === 0 ? (
        <EmptyState>
          No contract yet. Say &lsquo;The caterer is charging eight hundred per person for 250 people&rsquo; or
          record one.
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-6">
          {commitments.map((commitment) => (
            <li key={commitment.commitment_id}>
              <ContractBlock commitment={commitment} history={history} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * The dashed estimate box for each active per-unit contract, in the contracts' order: from
 * `vendor_ledger.estimate`, or "Not shared with you" when the estimate is hidden.
 */
function estimateBoxes(ledger: VendorLedger): ReactNode[] {
  const estimates = ledger.estimate ?? [];
  const estimateHidden = ledger.hidden.includes("estimate");
  const boxes: ReactNode[] = [];
  for (const commitment of ledger.commitments ?? []) {
    if (commitment.pricing !== "per_unit" || commitment.voided) continue;
    const estimate: CateringEstimateRow | undefined = estimates.find(
      (row) => row.commitment_id === commitment.commitment_id,
    );
    if (estimate) {
      boxes.push(<EstimateBox key={commitment.commitment_id} row={estimate} />);
    } else if (estimateHidden) {
      boxes.push(
        <div key={commitment.commitment_id} className="rounded-control border border-dashed border-line-strong p-4 lg:p-6">
          <p className="text-body font-semibold text-ink">Estimate, not the contract</p>
          <NotShared className="mt-2 text-table" />
        </div>,
      );
    }
  }
  return boxes;
}

function PaymentRow({ payment }: { payment: PaymentView }) {
  const kind = PAYMENT_KIND_LABELS[payment.payment_kind];
  const corrected = payment.previous_amount_inr !== null;
  return (
    <li className="flex items-start justify-between gap-4 py-3">
      <div className="flex min-w-0 flex-col gap-1">
        <p className={`text-body ${payment.voided ? "text-ink-3 line-through decoration-ink-3" : "text-ink"}`}>
          {kind.en}{" "}
          <span lang="hi" className={`no-underline ${payment.voided ? "text-ink-3" : "text-ink-2"}`}>
            {kind.hi}
          </span>
          {payment.seed_key ? <span className="ml-2 text-meta text-ink-3 tabular-nums">{payment.seed_key}</span> : null}
        </p>
        <p className="text-table text-ink-2 tabular-nums">
          {paymentMeta(payment.paid_on, payment.method)}
          {payment.note ? `. ${payment.note}` : null}
        </p>
        {corrected && payment.corrected_by && payment.corrected_at ? (
          <CorrectedBy by={payment.corrected_by} at={payment.corrected_at} />
        ) : null}
        {payment.voided ? (
          <StatusLabel kind="void" label="Void" explanation={payment.void_reason ?? undefined} className="mt-1" />
        ) : null}
      </div>
      <Wash watch={`${payment.amount_inr}:${payment.previous_amount_inr ?? ""}:${payment.voided}`} className="shrink-0 text-right">
        {payment.voided ? (
          <del className="font-sans font-medium text-ink-3 tabular-nums whitespace-nowrap line-through decoration-ink-3 decoration-[1.5px]">
            <span className="sr-only">Voided </span>
            {formatInr(payment.amount_inr)}
          </del>
        ) : corrected && payment.previous_amount_inr !== null ? (
          <CorrectionTrail previous_inr={payment.previous_amount_inr} current_inr={payment.amount_inr} field="payments.amount_inr" />
        ) : (
          <Amount inr={payment.amount_inr} field="payments.amount_inr" className="text-ink" />
        )}
      </Wash>
    </li>
  );
}

function PaymentsSection({ ledger }: { ledger: VendorLedger }) {
  const payments = ledger.payments ?? [];
  return (
    <section aria-labelledby="vendor-payments" className="flex flex-col gap-1">
      <SectionHeading id="vendor-payments" meta={payments.length > 1 ? `${payments.length} payments` : undefined}>
        Payments
      </SectionHeading>
      {payments.length === 0 ? (
        <EmptyState>No payments yet. Say &lsquo;I paid the caterer fifty thousand&rsquo; or record one.</EmptyState>
      ) : (
        <ul className="divide-y divide-line">
          {payments.map((payment) => (
            <PaymentRow key={payment.payment_id} payment={payment} />
          ))}
        </ul>
      )}
    </section>
  );
}

const OWED_TONE_CLASSES: Record<MoneyTone, string> = {
  ink: "text-ink",
  paid: "text-paid",
  due: "text-due",
  overdue: "text-overdue",
};

/** The due line under Still owed and the figure's colour, from `money_summary`'s row (never a computed day count). */
function balanceStatus(
  ledger: VendorLedger,
  figures: VendorMoneyFigures,
  row: MoneySummaryVendorRow | null,
): { due: DueLine; tone: MoneyTone } {
  const fallbackDue = (ledger.commitments ?? []).find((commitment) => !commitment.voided && commitment.due_on)?.due_on ?? null;
  const due = dueLine(figures, row, fallbackDue);
  const tone: MoneyTone = due?.kind === "overdue" ? "overdue" : due?.kind === "due" ? "due" : "ink";
  return { due, tone };
}

/**
 * The answer first (design-direction 10.4): Still owed, with its due line or overpaid note,
 * at the head of the sheet, so the figure the voice answers and the correction point at is
 * on screen without scrolling. The breakdown that sums to it stays at the foot.
 */
function OwedLead({ figures, due, tone }: { figures: VendorMoneyFigures; due: DueLine; tone: MoneyTone }) {
  return (
    <section aria-labelledby="vendor-owed" className="flex flex-col gap-2 border-b border-line pb-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="vendor-owed" className="text-heading text-ink">
          Still owed{" "}
          <span lang="hi" className="font-normal text-ink-2">
            बाकी
          </span>
        </h2>
        <p className={OWED_TONE_CLASSES[tone]}>
          <Wash watch={figures.outstanding_inr}>
            <Amount inr={figures.outstanding_inr} weight="panel" field="outstanding_inr" />
          </Wash>
        </p>
      </div>
      {figures.overpaid_inr > 0 ? (
        <StatusLabel
          kind="overpaid"
          field="overpaid_inr"
          label={formatOverpaid(figures.overpaid_inr)}
          explanation="The payments recorded are more than the contract, so nothing is owed. Check the payments or the contract."
        />
      ) : null}
      {due?.kind === "plain" ? (
        <p className="inline-flex items-center gap-2 text-table text-ink-2 tabular-nums">
          <CalendarBlank size={16} aria-hidden="true" className="shrink-0 text-ink-3" />
          {due.text}
        </p>
      ) : due ? (
        <StatusLabel kind={due.kind} label={due.text} className="self-start" />
      ) : null}
    </section>
  );
}

/** The foot of the khata page: what Still owed is made of, with the accounting rules. */
function BalanceSection({ figures, tone }: { figures: VendorMoneyFigures; tone: MoneyTone }) {
  return (
    <section aria-labelledby="vendor-balance" className="flex flex-col gap-2">
      <SectionHeading id="vendor-balance">Balance</SectionHeading>
      <dl>
        <MoneyRow label="Committed" label_hi="तय" inr={figures.committed_inr} field="committed_inr" />
        <MoneyRow label="Paid" label_hi="दिया" inr={figures.paid_inr} field="paid_inr" tone="paid" />
        <MoneyRow
          label="Still owed"
          label_hi="बाकी"
          inr={figures.outstanding_inr}
          field="outstanding_inr"
          weight="total"
          tone={tone}
          total
        />
      </dl>
    </section>
  );
}

function HistorySection({ ledger }: { ledger: VendorLedger }) {
  const history = ledger.history ?? [];
  const payments = ledger.payments ?? [];
  return (
    <section aria-labelledby="vendor-history" className={SHEET}>
      <SectionHeading id="vendor-history" meta="Oldest first">
        History
      </SectionHeading>
      {history.length === 0 ? (
        <EmptyState className="mt-2">Nothing recorded yet. Every change to a contract or payment will be listed here.</EmptyState>
      ) : (
        <ol className="mt-2 divide-y divide-line">
          {history.map((entry) => {
            const { what, detail } = describeHistoryEntry(entry, previousVersion(history, entry), payments);
            return (
              <HistoryEntry
                key={`${entry.entity_id}:${entry.version_no}`}
                what={what}
                detail={detail}
                by={entry.by}
                at={entry.at}
                source={entry.source}
                spoken_text={entry.spoken_text}
                reason={entry.change_reason}
              />
            );
          })}
        </ol>
      )}
    </section>
  );
}

/**
 * The ledger sheet, read top to bottom like a khata page: Still owed first, then the quote,
 * the contract, the payments and the balance at the foot. When the sheet is wide enough
 * (its container, not the viewport, so the voice dock's reflow counts), Still owed and the
 * estimate take a second column beside the quote and the contract, so the amounts on the
 * left share one right edge. In one column the estimate falls under the contract.
 */
function LedgerSheet({ ledger, figures, row }: { ledger: VendorLedger; figures: VendorMoneyFigures; row: MoneySummaryVendorRow | null }) {
  const boxes = estimateBoxes(ledger);
  const hasQuote = (ledger.quotes ?? []).length > 0;
  const { due, tone } = balanceStatus(ledger, figures, row);
  const lead = <OwedLead figures={figures} due={due} tone={tone} />;
  const quote = hasQuote ? <QuoteSection ledger={ledger} /> : null;
  const contract = <ContractSection ledger={ledger} />;
  const payments = <PaymentsSection ledger={ledger} />;
  const balance = <BalanceSection figures={figures} tone={tone} />;

  if (boxes.length === 0) {
    return (
      <div className={`${SHEET} flex flex-col gap-6 [&>*]:max-w-2xl`}>
        {lead}
        {quote}
        {contract}
        {payments}
        {balance}
      </div>
    );
  }
  return (
    <div className={`${SHEET} grid gap-6 @2xl:grid-cols-2 @2xl:gap-x-12`}>
      <div className="@2xl:col-start-2 @2xl:row-start-1">{lead}</div>
      {quote ? <div className="@2xl:col-start-1 @2xl:row-start-1">{quote}</div> : null}
      <div className={hasQuote ? "@2xl:col-start-1 @2xl:row-start-2" : "@2xl:col-start-1 @2xl:row-span-2 @2xl:row-start-1"}>
        {contract}
      </div>
      <div className="flex flex-col gap-6 @2xl:col-start-2 @2xl:row-span-3 @2xl:row-start-2 @2xl:self-start">{boxes}</div>
      <div className="@2xl:col-start-1 @2xl:row-start-3">{payments}</div>
      <div className="@2xl:col-start-1 @2xl:row-start-4">{balance}</div>
    </div>
  );
}

/**
 * One vendor's page (acceptance AT-6.1; design-direction 10.4 and 11): the header, Still
 * owed with its due line, the quote, the contract with the estimate beside it when the
 * sheet is wide enough (below it on a phone, never in the same cell), the payments with
 * their correction trail, the balance, then the history, oldest first. Money blocks show
 * "Not shared with you" when hidden.
 */
export function VendorLedgerView({
  wedding_id,
  ledger,
  row,
}: {
  wedding_id: WeddingId;
  ledger: VendorLedger;
  row: MoneySummaryVendorRow | null;
}) {
  const figures = ledger.hidden.includes("vendor_money") ? undefined : ledger.figures;
  return (
    <div className="@container flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <BackToVendors wedding_id={wedding_id} />
        <VendorHeader ledger={ledger} />
      </div>

      {figures === undefined ? (
        <section aria-labelledby="vendor-money" className={SHEET}>
          <SectionHeading id="vendor-money">Contract, payments and balance</SectionHeading>
          <NotShared className="mt-3 text-body" />
          <p className="mt-2 max-w-prose text-table text-ink-2">
            An owner can share vendor dues with you from Team and sharing.
          </p>
        </section>
      ) : (
        <>
          <LedgerSheet ledger={ledger} figures={figures} row={row} />
          <HistorySection ledger={ledger} />
        </>
      )}
    </div>
  );
}

/** The page when the reader may not open this vendor's record at all. */
export function VendorNotShared({ wedding_id }: { wedding_id: WeddingId }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <BackToVendors wedding_id={wedding_id} />
        <h1 className="font-serif text-title text-ink">Vendor</h1>
      </div>
      <section className={SHEET}>
        <NotShared className="text-body" />
      </section>
    </div>
  );
}
