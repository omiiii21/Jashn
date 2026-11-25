import type { Metadata } from "next";

import { ApprovalsSection } from "@/components/planner/approvals";
import { HighlightOnce, MoneyRow, NotShared, SectionHeading, StatusLabel } from "@/components/planner";
import { CategoryTable } from "@/components/planner/money/CategoryTable";
import { MoneyBar } from "@/components/planner/money/MoneyBar";
import { moneySentence } from "@/components/planner/money/money-text";
import { formatOverpaid } from "@/contracts/money";
import { HIGHLIGHT_PARAM, parseHighlight } from "@/contracts/routes";
import { dispatchCommand } from "@/server/actions/dispatch";

import { getWeddingProfile, readModel } from "../_lib/read";
import { VendorTable } from "../vendors/VendorList";

type MoneyPageProps = {
  params: Promise<{ wedding_id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata: Metadata = { title: "Money" };

const SHEET = "rounded-sheet border border-line bg-paper p-4 lg:p-6";

/**
 * Money (AT-5.1, design-direction 8 and 10.4): the money sentence, the four figures each on
 * its own with Not yet committed, one segmented bar, the budget by category, the vendor rows
 * and the approvals. Every figure is a read-model field. A manager without budget sharing
 * sees "Not shared with you" for the budget, totals and categories, and keeps the vendor
 * rows (AT-5.9).
 */
export default async function MoneyPage({ params, searchParams }: MoneyPageProps) {
  const [{ wedding_id }, query] = await Promise.all([params, searchParams]);
  const highlight = parseHighlight(query[HIGHLIGHT_PARAM]);

  const profile = await getWeddingProfile(wedding_id);
  const role = profile.member.role;
  const [summary, proposals] = await Promise.all([
    readModel("money_summary", wedding_id),
    readModel("proposals", wedding_id, role === "owner" ? { status: "pending" } : {}),
  ]);

  const budgetHidden = summary.hidden.includes("budget");
  const totals = budgetHidden ? undefined : summary.totals;
  const categories = budgetHidden ? undefined : summary.categories;
  const proposalsHidden = proposals.hidden.includes("proposals");

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-serif text-title text-ink">Money</h1>

      <section aria-labelledby="money-totals" className={SHEET}>
        <SectionHeading id="money-totals">Budget and spending</SectionHeading>
        {totals ? (
          <div className="mt-3 flex flex-col gap-6">
            <p className="max-w-prose text-body text-ink">{moneySentence(totals)}</p>
            <div className="grid gap-6 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] lg:items-start">
              <dl className="divide-y divide-line">
                <MoneyRow label="Budget" label_hi="बजट" inr={totals.budget_inr} field="budget_inr" />
                <MoneyRow label="Committed" label_hi="तय" inr={totals.total_committed_inr} field="total_committed_inr" />
                <MoneyRow label="Paid" label_hi="दिया" inr={totals.total_paid_inr} field="total_paid_inr" tone="paid" />
                <MoneyRow
                  label="Still owed"
                  label_hi="बाकी"
                  inr={totals.total_outstanding_inr}
                  field="total_outstanding_inr"
                  weight="total"
                />
                <MoneyRow label="Not yet committed" inr={totals.uncommitted_inr} field="uncommitted_inr" />
              </dl>
              <div className="flex flex-col gap-4">
                <MoneyBar totals={totals} values={false} />
                {totals.total_overpaid_inr > 0 ? (
                  <StatusLabel
                    kind="overpaid"
                    label={formatOverpaid(totals.total_overpaid_inr)}
                    field="total_overpaid_inr"
                    explanation="Some vendors were paid more than their contract. Check those payments or contracts below."
                  />
                ) : null}
              </div>
            </div>
          </div>
        ) : (
          <>
            <NotShared className="mt-3 text-body" />
            <p className="mt-2 max-w-prose text-table text-ink-2">
              An owner can share the budget with you from Team and sharing.
            </p>
          </>
        )}
      </section>

      <section aria-labelledby="money-categories" className="flex flex-col gap-3">
        <SectionHeading id="money-categories">By category</SectionHeading>
        {totals && categories ? (
          <CategoryTable categories={categories} totals={totals} />
        ) : (
          <div className={SHEET}>
            <NotShared className="text-body" />
          </div>
        )}
      </section>

      {proposalsHidden ? null : (
        <ApprovalsSection
          wedding_id={wedding_id}
          role={role}
          actor_name={profile.member.display_name}
          proposals={proposals.proposals}
          totals={totals}
          dispatch={dispatchCommand}
        />
      )}

      <section aria-labelledby="money-vendors" className="flex flex-col gap-3">
        <SectionHeading id="money-vendors">Vendors</SectionHeading>
        <VendorTable wedding_id={wedding_id} summary={summary} />
      </section>

      <HighlightOnce keys={highlight} />
    </div>
  );
}
