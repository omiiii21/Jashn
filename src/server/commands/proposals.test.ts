import { describe, expect, it } from "vitest";

import { CommandFailure } from "@/contracts/commands";
import type { ActivityEntryDraft } from "@/contracts/services";

import { approvedEntry, parseProposalInput, proposalStillMatches, proposedText, rejectedText, withdrawnText } from "./proposals";

const PRP_01 = { en: "an expense of ₹15,000 to Dhol player (Music and entertainment), not yet paid", hi: "Dhol player को ₹15,000 का खर्च (संगीत और मनोरंजन), भुगतान बाकी" };

function failureOf(run: () => unknown): CommandFailure {
  try {
    run();
  } catch (error) {
    if (error instanceof CommandFailure) return error;
    throw error;
  }
  throw new Error("expected a CommandFailure");
}

describe("parseProposalInput", () => {
  it("validates the inner input with the command's own schema, naming input.<field>", () => {
    const error = failureOf(() => parseProposalInput("record_payment", { vendor_id: "11111111-1111-4111-8111-111111111111", amount_inr: 0, payment_kind: "advance" }));
    expect(error.body).toMatchObject({ code: "validation_failed", message: "out_of_range", field: "input.amount_inr" });
  });

  it("calls a string amount not_integer", () => {
    const error = failureOf(() => parseProposalInput("record_payment", { vendor_id: "11111111-1111-4111-8111-111111111111", amount_inr: "20000", payment_kind: "advance" }));
    expect(error.body).toMatchObject({ message: "not_integer", field: "input.amount_inr" });
  });

  it("needs paid_in_full for record_expense, with no default (3.5)", () => {
    const input = { payee_name: "Dhol player", budget_category: "music", amount_inr: 15_000 };
    expect(failureOf(() => parseProposalInput("record_expense", input)).body).toMatchObject({ code: "validation_failed", message: "required", field: "input.paid_in_full" });
    expect(parseProposalInput("record_expense", { ...input, paid_in_full: false })).toMatchObject({ paid_in_full: false });
  });
});

describe("proposal activity templates (3.5)", () => {
  it("ACT-03: the proposal", () => {
    expect(proposedText("Diya", PRP_01)).toEqual({
      en: "Diya proposed an expense of ₹15,000 to Dhol player (Music and entertainment), not yet paid. It needs an owner's approval.",
      hi: "Diya ने प्रस्ताव भेजा: Dhol player को ₹15,000 का खर्च (संगीत और मनोरंजन), भुगतान बाकी। मालिक की मंज़ूरी बाकी है।",
    });
  });

  it("AT-5.8: declining and withdrawing", () => {
    expect(rejectedText("Mira", "Diya", PRP_01).en).toBe(
      "Mira declined Diya's proposal: an expense of ₹15,000 to Dhol player (Music and entertainment), not yet paid.",
    );
    expect(withdrawnText("Diya", PRP_01).en).toBe("Diya withdrew the proposal: an expense of ₹15,000 to Dhol player (Music and entertainment), not yet paid.");
  });

  it("A6: approval marks the executed command's entry", () => {
    const entry: ActivityEntryDraft = {
      topic: "expense.recorded",
      entity_type: "commitment",
      entity_id: "c1",
      summary_en: "Mira recorded an expense of ₹15,000 to Dhol player (Music and entertainment).",
      summary_hi: "Mira ने Dhol player को ₹15,000 का खर्च दर्ज किया (संगीत और मनोरंजन)।",
      before: null,
      after: null,
      visibility: "owners",
    };
    expect(approvedEntry(entry, "p1", "Diya")).toMatchObject({
      topic: "expense.recorded",
      proposal_id: "p1",
      summary_en: "Mira recorded an expense of ₹15,000 to Dhol player (Music and entertainment). Proposed by Diya.",
      summary_hi: "Mira ने Dhol player को ₹15,000 का खर्च दर्ज किया (संगीत और मनोरंजन)। प्रस्ताव: Diya।",
    });
  });
});

describe("proposalStillMatches (proposal_changed)", () => {
  const stored = { summary_en: PRP_01.en, vendor_id: null, committed_delta_inr: 15_000, paid_delta_inr: 0 };
  const plan = { summary: PRP_01, vendor_id: null, committed_delta_inr: 15_000, paid_delta_inr: 0, unchanged: false };
  it("matches the stored payee and values", () => {
    expect(proposalStillMatches(stored, plan)).toBe(true);
  });
  it("refuses a changed payee, amount or summary", () => {
    expect(proposalStillMatches(stored, { ...plan, vendor_id: "v1" })).toBe(false);
    expect(proposalStillMatches(stored, { ...plan, committed_delta_inr: 16_000 })).toBe(false);
    expect(proposalStillMatches(stored, { ...plan, summary: { ...PRP_01, en: "an expense of ₹15,000 to Dhol Wala (Music and entertainment), not yet paid" } })).toBe(false);
    expect(proposalStillMatches(stored, { ...plan, unchanged: true })).toBe(false);
  });
});
