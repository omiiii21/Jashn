import { describe, expect, it } from "vitest";

import { JOIN_MESSAGES, isFinalJoinError, joinErrorMessage } from "./join-messages";

describe("the join page's messages (AT-8.1)", () => {
  it("shows one message for every invite_invalid cause, and the email message for a 403", () => {
    expect(joinErrorMessage("invite_invalid")).toBe(JOIN_MESSAGES.invalid);
    expect(joinErrorMessage("forbidden")).toBe(JOIN_MESSAGES.email_mismatch);
    expect(joinErrorMessage("unauthenticated")).toBe(JOIN_MESSAGES.unauthenticated);
    expect(joinErrorMessage("internal_error")).toBe(JOIN_MESSAGES.generic);
  });

  it("hides Accept only where pressing again can't help", () => {
    expect(isFinalJoinError("invite_invalid")).toBe(true);
    expect(isFinalJoinError("forbidden")).toBe(true);
    expect(isFinalJoinError("unauthenticated")).toBe(true);
    expect(isFinalJoinError("internal_error")).toBe(false);
  });

  it("tells a wrong-account visitor to open the link again, since signing out drops it", () => {
    expect(JOIN_MESSAGES.email_mismatch).toMatch(/open this invite link again/);
  });

  it("never names a cause in the invalid message beyond the three the spec lists together", () => {
    // One message for unknown, expired, cancelled and used links: no oracle (3.1).
    expect(JOIN_MESSAGES.invalid).toMatch(/expired, been cancelled or already been used/);
  });
});
