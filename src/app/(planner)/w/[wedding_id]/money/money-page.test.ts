import { describe, expect, it } from "vitest";

import { moneyBarDescription, moneySentence, proposedNote } from "@/components/planner/money/money-text";
import { moneyEnvelope, saveModeFor, staleCurrentText } from "@/components/planner/money/gated";
import { fixtureSessionActor } from "@/contracts/fixtures";
import { formatInr } from "@/contracts/money";
import { fixtureServices } from "@/contracts/services";

/** Copy b (Lane B's rehearsal copy). */
const WEDDING_ID = "3e546e78-a307-5757-a6e2-2b08e26c0a76";
const CATERER_ID = "7cfd20aa-ff4c-5e4b-9fc9-468eb0914704";

const mira = fixtureSessionActor("mira", "b");
const diya = fixtureSessionActor("diya", "b");

describe("Money at D0 (AT-5.1), Mira", () => {
  it("reads the four figures, Not yet committed and the sentence from money_summary", async () => {
    const summary = await fixtureServices.read("money_summary", { actor: mira, wedding_id: WEDDING_ID });
    expect(summary.hidden).toEqual([]);
    const totals = summary.totals!;
    for (const key of ["budget_inr", "total_committed_inr", "total_paid_inr", "total_outstanding_inr", "uncommitted_inr"] as const) {
      expect(Number.isSafeInteger(totals[key])).toBe(true);
    }
    const sentence = moneySentence(totals);
    expect(sentence).toContain(`Of the ${formatInr(totals.budget_inr)} budget`);
    expect(sentence).toContain(`${formatInr(totals.total_committed_inr)} is committed`);
    expect(sentence).toContain(`${formatInr(totals.total_paid_inr)} is paid`);
    expect(sentence).toContain(`${formatInr(totals.total_outstanding_inr)} is still owed`);
    expect(sentence).not.toMatch(/Outstanding|Rs|INR/);
    expect(moneyBarDescription(totals)).toContain(`${formatInr(totals.total_paid_inr)} paid`);
  });

  it("lists categories in read-model order, with no-line categories never over budget", async () => {
    const summary = await fixtureServices.read("money_summary", { actor: mira, wedding_id: WEDDING_ID });
    const categories = summary.categories!;
    expect(categories.length).toBeGreaterThan(0);
    for (const line of categories.filter((item) => !item.has_line)) {
      expect(line.planned_inr).toBeNull();
      expect(line.over_budget_inr).toBe(0);
    }
  });

  it("keeps the caterer in the vendor rows with its figures", async () => {
    const summary = await fixtureServices.read("money_summary", { actor: mira, wedding_id: WEDDING_ID });
    const caterer = summary.vendors!.find((row) => row.vendor_id === CATERER_ID)!;
    expect(caterer.name).toBe("Annapoorna Caterers");
    expect(caterer).toMatchObject({ committed_inr: 200000, paid_inr: 50000, outstanding_inr: 150000 });
  });

  it("shows Mira the pending proposals with their own figures", async () => {
    const proposals = await fixtureServices.read("proposals", {
      actor: mira,
      wedding_id: WEDDING_ID,
      params: { status: "pending" },
    });
    expect(proposals.hidden).not.toContain("proposals");
    for (const proposal of proposals.proposals) {
      expect(proposal.status).toBe("pending");
      expect(typeof proposal.summary_en).toBe("string");
      expect(Number.isSafeInteger(proposal.committed_delta_inr)).toBe(true);
      expect(Number.isSafeInteger(proposal.paid_delta_inr)).toBe(true);
    }
  });
});

describe("Money at D0 for Diya, a manager (AT-5.9)", () => {
  it("hides the budget, totals and categories and keeps the vendor rows", async () => {
    const summary = await fixtureServices.read("money_summary", { actor: diya, wedding_id: WEDDING_ID });
    expect(summary.hidden).toContain("budget");
    expect(summary.totals).toBeUndefined();
    expect(summary.categories).toBeUndefined();
    expect(summary.hidden).not.toContain("vendor_money");
    expect(summary.vendors!.some((row) => row.vendor_id === CATERER_ID)).toBe(true);
  });

  it("shows her only her own proposals", async () => {
    const proposals = await fixtureServices.read("proposals", { actor: diya, wedding_id: WEDDING_ID, params: {} });
    expect(proposals.hidden).not.toContain("proposals");
    for (const proposal of proposals.proposals) expect(proposal.proposed_by).toBe("Diya");
  });

  it("sends her gated saves out as propose_change", () => {
    expect(saveModeFor("correct_payment", "manager")).toBe("proposal");
    expect(saveModeFor("record_payment", "manager")).toBe("proposal");
    expect(saveModeFor("correct_payment", "owner")).toBe("direct");
    expect(saveModeFor("approve_proposal", "manager")).toBe("none");
    const input = { payment_id: "p", expected_version: 1, amount_inr: 40000 };
    expect(moneyEnvelope(WEDDING_ID, "proposal", "correct_payment", input)).toEqual({
      wedding_id: WEDDING_ID,
      command: "propose_change",
      input: { command: "correct_payment", input },
      source: "ui",
    });
    expect(moneyEnvelope(WEDDING_ID, "direct", "correct_payment", input)).toEqual({
      wedding_id: WEDDING_ID,
      command: "correct_payment",
      input,
      source: "ui",
    });
  });
});

describe("money words", () => {
  it("says a pending amount and a 409's fresh value", () => {
    expect(proposedNote(15000)).toBe("₹15,000 proposed, not in totals");
    expect(proposedNote(0)).toBeNull();
    expect(staleCurrentText({ amount_inr: 45000, corrected_by: "Diya" }, formatInr)).toBe("Now ₹45,000, set by Diya.");
    expect(staleCurrentText(null, formatInr)).toBeNull();
  });
});
