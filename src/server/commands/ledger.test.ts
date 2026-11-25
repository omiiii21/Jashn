import { describe, expect, it } from "vitest";

import { CommandFailure, commandSchemas } from "@/contracts/commands";

import {
  COMMITMENT_VALUE_FIELDS,
  PAYMENT_VALUE_FIELDS,
  beforeAfter,
  budgetLineText,
  commitmentFieldSpecs,
  commitmentRecordedText,
  commitmentUpdatedText,
  commitmentVoidedText,
  describeChanges,
  diffValues,
  expenseRecordedText,
  isAfterToday,
  kindWithArticle,
  mergeCommitment,
  mergePayment,
  needsEventForEstimate,
  paymentCorrectedText,
  paymentRecordedText,
  paymentVoidedText,
  proposalSummaries,
  quoteAddedText,
  resolvePricing,
  vendorAddedText,
  vendorUpdatedText,
  type CommitmentValues,
  type PaymentValues,
} from "./ledger";

function failureOf(run: () => unknown): CommandFailure {
  try {
    run();
  } catch (error) {
    if (error instanceof CommandFailure) return error;
    throw error;
  }
  throw new Error("expected a CommandFailure");
}

const COM_01: CommitmentValues = {
  pricing: "per_unit",
  unit: "plate",
  unit_price_inr: 800,
  quantity: 250,
  amount_inr: 200_000,
  event_id: "11111111-1111-4111-8111-111111111111",
  description: "250 covers, fixed minimum",
  agreed_on: "2026-11-20",
  due_on: "2026-12-12",
};

const COM_04: CommitmentValues = {
  pricing: "lump_sum",
  unit: null,
  unit_price_inr: null,
  quantity: null,
  amount_inr: 110_000,
  event_id: null,
  description: "Photo and video, all five",
  agreed_on: "2026-11-12",
  due_on: "2026-12-14",
};

const PAY_01: PaymentValues = { amount_inr: 50_000, paid_on: "2026-11-20", method: "upi", note: null };

describe("M3: per-unit totals are computed", () => {
  it("computes 800 × 250 = 200000", () => {
    expect(resolvePricing({ pricing: "per_unit", unit: "plate", unit_price_inr: 800, quantity: 250 })).toEqual({
      pricing: "per_unit",
      unit: "plate",
      unit_price_inr: 800,
      quantity: 250,
      amount_inr: 200_000,
    });
  });

  it("accepts a sent amount that matches", () => {
    expect(resolvePricing({ pricing: "per_unit", unit: "plate", unit_price_inr: 800, quantity: 250, amount_inr: 200_000 }).amount_inr).toBe(200_000);
  });

  it("refuses 800 × 250 with amount_inr 210000 as amount_mismatch", () => {
    const error = failureOf(() => resolvePricing({ pricing: "per_unit", unit: "plate", unit_price_inr: 800, quantity: 250, amount_inr: 210_000 }));
    expect(error.body.code).toBe("amount_mismatch");
    expect(error.http_status).toBe(422);
    expect(error.body.field).toBe("amount_inr");
    expect(error.body.current).toEqual({ amount_inr: 200_000, unit_price_inr: 800, quantity: 250 });
  });

  it("accepts exactly ₹100 crore and refuses one plate more (M2)", () => {
    expect(resolvePricing({ pricing: "per_unit", unit: "item", unit_price_inr: 1_000_000, quantity: 1000 }).amount_inr).toBe(1_000_000_000);
    const error = failureOf(() => resolvePricing({ pricing: "per_unit", unit: "item", unit_price_inr: 1_000_000, quantity: 1001 }));
    expect(error.body).toMatchObject({ code: "validation_failed", message: "out_of_range", field: "quantity" });
  });

  it("drops unit fields from a lump sum and needs its amount", () => {
    expect(resolvePricing({ pricing: "lump_sum", unit: "plate", unit_price_inr: 5, quantity: 2, amount_inr: 12_000 })).toEqual({
      pricing: "lump_sum",
      unit: null,
      unit_price_inr: null,
      quantity: null,
      amount_inr: 12_000,
    });
    expect(failureOf(() => resolvePricing({ pricing: "lump_sum" })).body).toMatchObject({ code: "validation_failed", field: "amount_inr", message: "required" });
  });

  it("names the missing per-unit field", () => {
    expect(failureOf(() => resolvePricing({ pricing: "per_unit", unit: "plate", quantity: 250 })).body.field).toBe("unit_price_inr");
  });
});

describe("M1 and M2 through the command schemas", () => {
  const base = { payment_id: "22222222-2222-4222-8222-222222222222", expected_version: 1 };
  it.each([
    [0, "out_of_range"],
    [-5000, "out_of_range"],
    [40000.5, "not_integer"],
    [1_000_000_001, "out_of_range"],
  ])("refuses amount_inr %s", (amount_inr, message) => {
    const parsed = commandSchemas.correct_payment.safeParse({ ...base, amount_inr });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toBe(message);
  });

  it("refuses a string amount", () => {
    expect(commandSchemas.correct_payment.safeParse({ ...base, amount_inr: "40000" }).success).toBe(false);
  });

  it("refuses unit_price_inr 0 and 1000001, quantity 0 and 100001", () => {
    const commitment = { vendor_id: base.payment_id, pricing: "per_unit", unit: "plate" };
    expect(commandSchemas.record_commitment.safeParse({ ...commitment, unit_price_inr: 0, quantity: 250 }).success).toBe(false);
    expect(commandSchemas.record_commitment.safeParse({ ...commitment, unit_price_inr: 1_000_001, quantity: 250 }).success).toBe(false);
    expect(commandSchemas.record_commitment.safeParse({ ...commitment, unit_price_inr: 800, quantity: 0 }).success).toBe(false);
    expect(commandSchemas.record_commitment.safeParse({ ...commitment, unit_price_inr: 800, quantity: 100_001 }).success).toBe(false);
  });
});

describe("C2–C8: payment corrections", () => {
  it("merges only the sent fields; null clears paid_on", () => {
    expect(mergePayment(PAY_01, { amount_inr: 40_000 })).toEqual({ ...PAY_01, amount_inr: 40_000 });
    expect(mergePayment(PAY_01, { paid_on: null })).toEqual({ ...PAY_01, paid_on: null });
    expect(mergePayment(PAY_01, { method: "cash", note: "Paid at the tasting" })).toEqual({ ...PAY_01, method: "cash", note: "Paid at the tasting" });
  });

  it("finds the amount change of M-03 and nothing else", () => {
    const next = mergePayment(PAY_01, { amount_inr: 40_000 });
    expect(diffValues(PAY_01, next, PAYMENT_VALUE_FIELDS)).toEqual([{ field: "amount_inr", from: 50_000, to: 40_000 }]);
  });

  it("C8: identical values are no change", () => {
    const next = mergePayment(PAY_01, { amount_inr: 50_000, method: "upi" });
    expect(diffValues(PAY_01, next, PAYMENT_VALUE_FIELDS)).toEqual([]);
  });

  it("puts only the changed fields in before and after (L2)", () => {
    const changes = diffValues(PAY_01, mergePayment(PAY_01, { amount_inr: 40_000 }), PAYMENT_VALUE_FIELDS);
    expect(beforeAfter(changes)).toEqual({ before: { amount_inr: 50_000 }, after: { amount_inr: 40_000 } });
  });
});

describe("C10: commitment versions", () => {
  it("M-08: a lump sum takes the new amount", () => {
    const next = mergeCommitment(COM_04, { amount_inr: 125_000 });
    expect(next.amount_inr).toBe(125_000);
    expect(diffValues(COM_04, next, COMMITMENT_VALUE_FIELDS)).toEqual([{ field: "amount_inr", from: 110_000, to: 125_000 }]);
  });

  it("recomputes a per-unit amount from a new quantity", () => {
    const next = mergeCommitment(COM_01, { quantity: 260 });
    expect(next.amount_inr).toBe(208_000);
    expect(diffValues(COM_01, next, COMMITMENT_VALUE_FIELDS).map((change) => change.field)).toEqual(["quantity", "amount_inr"]);
  });

  it("M3 applies to the result: a per-unit amount that disagrees is amount_mismatch", () => {
    expect(failureOf(() => mergeCommitment(COM_01, { amount_inr: 210_000 })).body.code).toBe("amount_mismatch");
  });

  it("switching to a lump sum keeps the amount and drops the unit fields", () => {
    const next = mergeCommitment(COM_01, { pricing: "lump_sum" });
    expect(next).toMatchObject({ pricing: "lump_sum", unit: null, unit_price_inr: null, quantity: null, amount_inr: 200_000 });
  });

  it("null clears an optional field; identical values are no change", () => {
    expect(mergeCommitment(COM_01, { due_on: null }).due_on).toBeNull();
    expect(diffValues(COM_01, mergeCommitment(COM_01, { quantity: 250 }), COMMITMENT_VALUE_FIELDS)).toEqual([]);
  });

  it("E1: per plate or per person needs a function", () => {
    expect(needsEventForEstimate({ pricing: "per_unit", unit: "plate" })).toBe(true);
    expect(needsEventForEstimate({ pricing: "per_unit", unit: "person" })).toBe(true);
    expect(needsEventForEstimate({ pricing: "per_unit", unit: "item" })).toBe(false);
    expect(needsEventForEstimate({ pricing: "lump_sum", unit: null })).toBe(false);
  });
});

describe("paid_on is not after today (IST)", () => {
  it("compares IST calendar dates", () => {
    expect(isAfterToday("2026-11-26", "2026-11-25")).toBe(true);
    expect(isAfterToday("2026-11-25", "2026-11-25")).toBe(false);
    expect(isAfterToday(null, "2026-11-25")).toBe(false);
    expect(isAfterToday(undefined, "2026-11-25")).toBe(false);
  });
});

describe("activity templates (3.3)", () => {
  it("ACT-06: the correction", () => {
    const changes = [{ field: "amount_inr", from: 50_000, to: 40_000 }];
    expect(paymentCorrectedText("Mira", "Annapoorna Caterers", "advance", changes)).toEqual({
      en: "Mira corrected the advance to Annapoorna Caterers from ₹50,000 to ₹40,000.",
      hi: "Mira ने Annapoorna Caterers का एडवांस ₹50,000 से बदलकर ₹40,000 किया।",
    });
  });

  it("a correction of other fields lists them", () => {
    const text = paymentCorrectedText("Mira", "Annapoorna Caterers", "advance", [{ field: "method", from: "upi", to: "cash" }]);
    expect(text.en).toBe("Mira corrected the advance to Annapoorna Caterers: method UPI to Cash.");
    expect(text.hi).toBe("Mira ने Annapoorna Caterers के एडवांस में सुधार किया: तरीका UPI से Cash।");
  });

  it("record_payment uses 'an' for an advance or instalment and 'a' for a final payment", () => {
    expect(kindWithArticle("advance")).toBe("an advance");
    expect(kindWithArticle("instalment")).toBe("an instalment");
    expect(kindWithArticle("final")).toBe("a final payment");
    expect(paymentRecordedText("Mira", "Marigold Lane Decor", "instalment", 50_000)).toEqual({
      en: "Mira recorded an instalment of ₹50,000 to Marigold Lane Decor.",
      hi: "Mira ने Marigold Lane Decor को ₹50,000 का किस्त दर्ज किया।",
    });
  });

  it("record_commitment, per unit and lump sum", () => {
    expect(commitmentRecordedText("Mira", "Annapoorna Caterers", resolvePricing({ pricing: "per_unit", unit: "plate", unit_price_inr: 800, quantity: 250 }))).toEqual({
      en: "Mira agreed ₹2,00,000 with Annapoorna Caterers (250 plates × ₹800).",
      hi: "Mira ने Annapoorna Caterers के साथ ₹2,00,000 तय किया (250 × ₹800)।",
    });
    expect(commitmentRecordedText("Mira", "Mallige Gardens", resolvePricing({ pricing: "lump_sum", amount_inr: 280_000 })).en).toBe(
      "Mira agreed ₹2,80,000 with Mallige Gardens.",
    );
  });

  it("update_commitment: the amount sentence, else the changes", () => {
    const specs = commitmentFieldSpecs();
    expect(commitmentUpdatedText("Mira", "Frame & Phera Studio", [{ field: "amount_inr", from: 110_000, to: 125_000 }], specs)).toEqual({
      en: "Mira changed the agreed amount with Frame & Phera Studio from ₹1,10,000 to ₹1,25,000.",
      hi: "Mira ने Frame & Phera Studio के साथ तय रकम ₹1,10,000 से बदलकर ₹1,25,000 की।",
    });
    expect(commitmentUpdatedText("Mira", "Mallige Gardens", [{ field: "due_on", from: "2026-12-01", to: "2026-12-05" }], specs).en).toBe(
      "Mira changed the commitment with Mallige Gardens: balance due Tue 1 Dec 2026 to Sat 5 Dec 2026.",
    );
  });

  it("voids, quotes, expenses, vendors and budget lines", () => {
    expect(commitmentVoidedText("Mira", "Bass Baraat Sound", 55_000).en).toBe("Mira cancelled the ₹55,000 commitment with Bass Baraat Sound.");
    expect(paymentVoidedText("Mira", "Bass Baraat Sound", "advance", 15_000)).toEqual({
      en: "Mira voided the ₹15,000 advance to Bass Baraat Sound.",
      hi: "Mira ने Bass Baraat Sound को दिया गया ₹15,000 का एडवांस रद्द किया।",
    });
    expect(quoteAddedText("Diya", "Annapoorna Caterers", 212_500).en).toBe("Diya added a quote from Annapoorna Caterers: ₹2,12,500.");
    expect(expenseRecordedText("Mira", "Dhol player", 15_000, "music")).toEqual({
      en: "Mira recorded an expense of ₹15,000 to Dhol player (Music and entertainment).",
      hi: "Mira ने Dhol player को ₹15,000 का खर्च दर्ज किया (संगीत और मनोरंजन)।",
    });
    expect(vendorAddedText("Diya", "Shehnai Duo", "music")).toEqual({
      en: "Diya added the vendor Shehnai Duo (Music and entertainment).",
      hi: "Diya ने वेंडर Shehnai Duo जोड़ा (संगीत और मनोरंजन)।",
    });
    expect(vendorUpdatedText("Diya", "Shehnai Duo", [{ field: "status", from: "considering", to: "booked" }, { field: "contact_phone", from: null, to: "+91 1" }]).en).toBe(
      "Diya updated the vendor Shehnai Duo: status considering to booked, phone changed.",
    );
    expect(budgetLineText("Mira", "catering", 200_000, 240_000).en).toBe("Mira set the Catering budget to ₹2,40,000 (was ₹2,00,000).");
    expect(budgetLineText("Mira", "transport", null, 30_000).en).toBe("Mira set the Transport and logistics budget to ₹30,000 (was not set).");
  });

  it("describes set, cleared and quiet fields", () => {
    const specs = commitmentFieldSpecs(new Map([["e1", { en: "Reception", hi: "रिसेप्शन" }]]));
    expect(
      describeChanges(
        [
          { field: "event_id", from: null, to: "e1" },
          { field: "due_on", from: "2026-12-12", to: null },
          { field: "description", from: "a", to: "b" },
        ],
        specs,
        "en",
      ),
    ).toBe("function set to Reception, balance due cleared, basis changed");
  });
});

describe("proposal summaries (3.5)", () => {
  it("PRP-01 and ACT-03 end ', not yet paid' (D91)", () => {
    expect(proposalSummaries.record_expense("Dhol player", 15_000, "music", false)).toEqual({
      en: "an expense of ₹15,000 to Dhol player (Music and entertainment), not yet paid",
      hi: "Dhol player को ₹15,000 का खर्च (संगीत और मनोरंजन), भुगतान बाकी",
    });
    expect(proposalSummaries.record_expense("Dhol player", 15_000, "music", true).en).toBe(
      "an expense of ₹15,000 to Dhol player (Music and entertainment), paid in full",
    );
  });

  it("X-04: a payment, and the other gated commands", () => {
    expect(proposalSummaries.record_payment("Marigold Lane Decor", 20_000)).toEqual({
      en: "a payment of ₹20,000 to Marigold Lane Decor",
      hi: "Marigold Lane Decor को ₹20,000 का भुगतान",
    });
    expect(proposalSummaries.record_commitment("Bass Baraat Sound", 55_000).en).toBe("a commitment of ₹55,000 with Bass Baraat Sound");
    expect(proposalSummaries.void_commitment("Bass Baraat Sound", 55_000).en).toBe("cancelling the ₹55,000 commitment with Bass Baraat Sound");
    expect(proposalSummaries.void_payment("Bass Baraat Sound", "advance", 15_000).en).toBe("voiding the ₹15,000 advance to Bass Baraat Sound");
    expect(proposalSummaries.correct_payment("Annapoorna Caterers", "advance", [{ field: "amount_inr", from: 50_000, to: 40_000 }])).toEqual({
      en: "correcting the advance to Annapoorna Caterers from ₹50,000 to ₹40,000",
      hi: "Annapoorna Caterers का एडवांस ₹50,000 से ₹40,000 करना",
    });
    expect(
      proposalSummaries.update_commitment("Frame & Phera Studio", [{ field: "amount_inr", from: 110_000, to: 125_000 }], commitmentFieldSpecs()).en,
    ).toBe("changing the agreed amount with Frame & Phera Studio from ₹1,10,000 to ₹1,25,000");
  });
});
