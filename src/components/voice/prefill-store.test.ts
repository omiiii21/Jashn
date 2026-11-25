import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { VoicePrefillEntry } from "@/contracts/commands";

import {
  clearVoicePrefill,
  getVoicePrefillState,
  peekVoicePrefill,
  prefillTargetPath,
  resetVoicePrefillForTests,
  setVoicePrefill,
  subscribeVoicePrefill,
  takeVoicePrefill,
  VOICE_PREFILL_TTL_MS,
} from "./prefill-store";

const requirement: VoicePrefillEntry = {
  command: "add_requirement",
  input: { event_id: "e-rec", label: "Jain food", quantity: 12, category: "catering", vendor_id: "v-cat" },
  labels: { label: "What", quantity: "How many", category: "Category", vendor_id: "Vendor" },
};
const payment: VoicePrefillEntry = {
  command: "record_payment",
  input: { vendor_id: "v-cat", amount_inr: 50000 },
  labels: { amount_inr: "Amount" },
};

beforeEach(() => {
  resetVoicePrefillForTests();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("prefill store (D61, D121)", () => {
  it("stores one turn's list and hands each command's entry out once", () => {
    const seen: number[] = [];
    const unsubscribe = subscribeVoicePrefill(() => seen.push(1));
    setVoicePrefill([requirement, payment], { voice_turn_id: "t1", wedding_id: "w1" });
    expect(seen).toHaveLength(1);
    expect(peekVoicePrefill("add_requirement")?.entry.input.quantity).toBe(12);

    const taken = takeVoicePrefill("add_requirement");
    expect(taken?.voice_turn_id).toBe("t1");
    expect(taken?.entry.labels.quantity).toBe("How many");
    expect(takeVoicePrefill("add_requirement")).toBeNull();
    expect(peekVoicePrefill("record_payment")).not.toBeNull();
    expect(seen).toHaveLength(2);
    unsubscribe();
  });

  it("replaces the list on a new refusal and clears on an empty one", () => {
    setVoicePrefill([requirement], { voice_turn_id: "t1", wedding_id: "w1" });
    setVoicePrefill([payment], { voice_turn_id: "t2", wedding_id: "w1" });
    expect(peekVoicePrefill("add_requirement")).toBeNull();
    expect(peekVoicePrefill("record_payment")?.voice_turn_id).toBe("t2");
    setVoicePrefill([], { voice_turn_id: "t3", wedding_id: "w1" });
    expect(getVoicePrefillState()).toBeNull();
  });

  it("expires entries after 10 minutes", () => {
    setVoicePrefill([requirement], { voice_turn_id: "t1", wedding_id: "w1" });
    vi.advanceTimersByTime(VOICE_PREFILL_TTL_MS - 1);
    expect(peekVoicePrefill("add_requirement")).not.toBeNull();
    vi.advanceTimersByTime(2);
    expect(peekVoicePrefill("add_requirement")).toBeNull();
  });

  it("clears on demand", () => {
    setVoicePrefill([requirement], { voice_turn_id: "t1", wedding_id: "w1" });
    clearVoicePrefill();
    expect(getVoicePrefillState()).toBeNull();
  });
});

describe("prefillTargetPath (voice.md 6.3)", () => {
  it("routes an entry naming an event to that function on Events", () => {
    expect(prefillTargetPath([requirement], "w1")).toBe("/w/w1/events?event_id=e-rec");
  });

  it("routes vendor money to the vendor page, including a manager's proposal", () => {
    expect(prefillTargetPath([payment], "w1")).toBe("/w/w1/vendors?vendor_id=v-cat");
    const proposal: VoicePrefillEntry = { command: "propose_change", input: { command: "record_commitment", input: { vendor_id: "v-dec" } }, labels: {} };
    expect(prefillTargetPath([proposal], "w1")).toBe("/w/w1/vendors?vendor_id=v-dec");
  });

  it("has no target on setup", () => {
    expect(prefillTargetPath([requirement], null)).toBeNull();
  });
});
