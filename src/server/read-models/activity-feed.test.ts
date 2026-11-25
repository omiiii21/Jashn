import { describe, expect, it } from "vitest";

import { awaitingPublish, feedLimit, isGuestVisibleDraftEdit, likePrefix, nextIsoDate, stripForManager } from "./activity-feed";

describe("activity_feed helpers (domain 4.7, L5a)", () => {
  it("marks only guest-visible draft edits", () => {
    expect(isGuestVisibleDraftEdit({ topic: "event.updated", before: { venue_id: "a", venue: "Banyan Hall" }, after: { venue_id: "b", venue: "Lotus Hall" } })).toBe(true);
    expect(isGuestVisibleDraftEdit({ topic: "event.updated", before: { lead_name: "a" }, after: { lead_name: "b" } })).toBe(false);
    expect(isGuestVisibleDraftEdit({ topic: "event.created", before: null, after: {} })).toBe(true);
    expect(isGuestVisibleDraftEdit({ topic: "wedding.updated", before: { budget_inr: 1 }, after: { budget_inr: 2 } })).toBe(false);
    expect(isGuestVisibleDraftEdit({ topic: "wedding.updated", before: { city: "Pune" }, after: { city: "Bengaluru" } })).toBe(true);
    expect(isGuestVisibleDraftEdit({ topic: "requirement.added", before: null, after: { text: "x" } })).toBe(false);
    expect(isGuestVisibleDraftEdit({ topic: "payment.corrected", before: null, after: null })).toBe(false);
  });

  it("compares with the publish entry's seq when known, else the publish instant", () => {
    const edit = { seq: 7, occurred_at: new Date("2026-11-25T05:00:00Z"), topic: "event.updated", before: { venue_id: "a" }, after: { venue_id: "b" } };
    expect(awaitingPublish(edit, null)).toBe(true);
    expect(awaitingPublish(edit, { seq: null, published_at: new Date("2026-11-24T15:30:00Z") })).toBe(true);
    expect(awaitingPublish(edit, { seq: null, published_at: new Date("2026-11-25T06:00:00Z") })).toBe(false);
    expect(awaitingPublish(edit, { seq: 6, published_at: new Date("2026-11-25T06:00:00Z") })).toBe(true);
    expect(awaitingPublish(edit, { seq: 8, published_at: new Date("2026-11-24T00:00:00Z") })).toBe(false);
  });

  it("strips money, budget, contact and shagun fields for managers, at any depth", () => {
    expect(
      stripForManager({
        amount_inr: 40000,
        venue: "Lotus Hall",
        budget_inr: 1200000,
        contact_phone: "+91",
        nested: { phone: "x", email: "y", ok: 1, list: [{ paid_inr: 5, name: "n" }] },
      }),
    ).toEqual({ venue: "Lotus Hall", nested: { ok: 1, list: [{ name: "n" }] } });
    expect(stripForManager(null)).toBeNull();
  });

  it("clamps the limit, steps dates and escapes LIKE", () => {
    expect(feedLimit(undefined)).toBe(50);
    expect(feedLimit(0)).toBe(1);
    expect(feedLimit(1000)).toBe(200);
    expect(nextIsoDate("2026-11-30")).toBe("2026-12-01");
    expect(nextIsoDate("2026-12-31")).toBe("2027-01-01");
    expect(likePrefix("payment.")).toBe("payment.%");
    expect(likePrefix("a_b%")).toBe("a\\_b\\%%");
  });
});
