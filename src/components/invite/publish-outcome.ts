/**
 * Reads what a PublishSheet `on_confirm` callback resolved to (D59). The planner path
 * resolves to a `CommandResponse<"publish_itinerary">`; Lane C's voice confirm resolves
 * to a `VoiceConfirmResponse` or its error body. Anything else (including a fixture's
 * bare `{}` result) counts as published, and a throw counts as an error.
 */

export type PublishOutcome = "published" | "unchanged" | "draft_changed" | "forbidden" | "error";

type Loose = Record<string, unknown>;

function isObject(value: unknown): value is Loose {
  return typeof value === "object" && value !== null;
}

function fromErrorCode(code: unknown): PublishOutcome {
  if (code === "draft_changed") return "draft_changed";
  if (code === "forbidden") return "forbidden";
  return "error";
}

function fromSuccessOutcome(outcome: unknown): PublishOutcome {
  if (outcome === "unchanged") return "unchanged";
  return "published";
}

export function interpretConfirmResult(value: unknown): PublishOutcome {
  if (!isObject(value)) return value === undefined ? "published" : "error";
  if (value.ok === false) {
    const error = isObject(value.error) ? value.error : null;
    return fromErrorCode(error?.code);
  }
  // Voice confirm: `{ ok: true, results: [{ outcome, ... }] }`.
  if (Array.isArray(value.results)) {
    const first = value.results.find(isObject);
    if (!first) return "error";
    if (first.ok === false) return fromErrorCode(isObject(first.error) ? first.error.code : undefined);
    return fromSuccessOutcome(first.outcome);
  }
  if (value.ok === true) {
    const result = isObject(value.result) ? value.result : null;
    if (result && Array.isArray(result.changes) && result.changes.length === 0 && value.outcome !== "applied") return "unchanged";
    return fromSuccessOutcome(value.outcome);
  }
  return "published";
}

/** The sheet's line for each outcome (AT-3.6; voice.md 885; adapted from E-06). */
export const PUBLISH_OUTCOME_TEXT: Record<Exclude<PublishOutcome, "published">, string> = {
  unchanged: "There's nothing new to publish.",
  draft_changed: "The schedule changed while you were reviewing. Check the list and publish again.",
  forbidden: "Only an owner can publish. Your changes are safe in the draft.",
  error: "Publishing didn't go through. Nothing was published. Try again.",
};
