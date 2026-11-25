import { describe, expect, it } from "vitest";
import {
  answerKey,
  buildRsvpBody,
  editedNotes,
  isFullyAnswered,
  keyForBody,
  newIdempotencyKey,
  normaliseNote,
  pruneSelection,
  storedAnswers,
  type StoredAnswer,
} from "./guest-reply-state";

const SAN = "event-sangeet";
const REC = "event-reception";
const TARA = "guest-tara";

const view = {
  functions: [
    { event_id: SAN, responses: [{ guest_id: TARA, rsvp_status: "attending" as const, plus_ones: 0, max_plus_ones: 0 }] },
    { event_id: REC, responses: [{ guest_id: TARA, rsvp_status: "pending" as const, plus_ones: 0, max_plus_ones: 2 }] },
  ],
};

const stored: StoredAnswer[] = storedAnswers(view);

describe("buildRsvpBody (domain 7.3)", () => {
  it("sends only the changed answer", () => {
    const body = buildRsvpBody(stored, { [answerKey(REC, TARA)]: { rsvp_status: "attending", plus_ones: 0 } });
    expect(body).toEqual({ responses: [{ guest_id: TARA, event_id: REC, rsvp_status: "attending", plus_ones: 0 }] });
  });

  it("sends every non-pending answer when nothing changed", () => {
    expect(buildRsvpBody(stored, {})).toEqual({
      responses: [{ guest_id: TARA, event_id: SAN, rsvp_status: "attending", plus_ones: 0 }],
    });
  });

  it("never sends pending, and declined forces plus_ones to 0", () => {
    const body = buildRsvpBody(stored, { [answerKey(REC, TARA)]: { rsvp_status: "declined", plus_ones: 2 } });
    expect(body.responses).toEqual([{ guest_id: TARA, event_id: REC, rsvp_status: "declined", plus_ones: 0 }]);
    expect(JSON.stringify(buildRsvpBody(stored, {}))).not.toContain("pending");
  });

  it("keeps plus_ones within the invitation's limit", () => {
    const body = buildRsvpBody(stored, { [answerKey(REC, TARA)]: { rsvp_status: "attending", plus_ones: 9 } });
    expect(body.responses[0].plus_ones).toBe(2);
  });

  it("sends nothing when nothing is answered", () => {
    const empty = storedAnswers({ functions: [{ event_id: REC, responses: [view.functions[1].responses[0]] }] });
    expect(buildRsvpBody(empty, {})).toEqual({ responses: [] });
  });

  it("drops selections for functions that left the view", () => {
    const pruned = pruneSelection(stored.slice(0, 1), { [answerKey(REC, TARA)]: { rsvp_status: "attending", plus_ones: 0 } });
    expect(pruned).toEqual({});
  });
});

describe("isFullyAnswered", () => {
  it("is false while any answer is pending, true when none is", () => {
    expect(isFullyAnswered(view)).toBe(false);
    expect(isFullyAnswered({ functions: [view.functions[0]] })).toBe(true);
    expect(isFullyAnswered({ functions: [] })).toBe(false);
  });
});

describe("editedNotes (AT-4.9)", () => {
  it("sends only fields the guest edited, never a stale copy over a newer stored note", () => {
    // A planner set "Jain" after the page loaded; the guest never touched the field.
    expect(editedNotes([TARA], {}, { [TARA]: "Jain" })).toEqual([]);
  });

  it("sends an edit that differs, trimmed, and null for an emptied field", () => {
    expect(editedNotes([TARA], { [TARA]: "  Mushroom allergy " }, { [TARA]: null })).toEqual([
      { guest_id: TARA, dietary_note: "Mushroom allergy" },
    ]);
    expect(editedNotes([TARA], { [TARA]: "   " }, { [TARA]: "Jain" })).toEqual([{ guest_id: TARA, dietary_note: null }]);
  });

  it("sends nothing when the edit matches the stored note", () => {
    expect(editedNotes([TARA], { [TARA]: "Jain " }, { [TARA]: "Jain" })).toEqual([]);
    expect(editedNotes([TARA], { [TARA]: "" }, { [TARA]: null })).toEqual([]);
    expect(normaliseNote("  ")).toBeNull();
  });
});

describe("idempotency keys (R8, I1)", () => {
  it("keeps the key for the same body and response count", () => {
    let made = 0;
    const make = () => `key-${(made += 1)}`;
    const body = { responses: [{ event_id: REC }] };
    const first = keyForBody(null, body, 0, make);
    expect(keyForBody(first, { responses: [{ event_id: REC }] }, 0, make)).toBe(first);
    expect(made).toBe(1);
  });

  it("makes a new key for a changed body or after a response", () => {
    let made = 0;
    const make = () => `key-${(made += 1)}`;
    const first = keyForBody(null, { a: 1 }, 0, make);
    const changed = keyForBody(first, { a: 2 }, 0, make);
    const afterResponse = keyForBody(changed, { a: 2 }, 1, make);
    expect(new Set([first.key, changed.key, afterResponse.key]).size).toBe(3);
  });

  it("makes keys the server accepts", () => {
    const key = newIdempotencyKey();
    expect(key).toMatch(/^[\x20-\x7E]{8,200}$/);
    expect(newIdempotencyKey()).not.toBe(key);
  });
});
