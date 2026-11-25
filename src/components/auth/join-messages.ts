import type { CommandErrorCode } from "@/contracts/commands";

/**
 * The `/join/[token]` page's words, shared by the server page and the client Accept form.
 * A plain module (no directive), so the server page reads the strings themselves rather than
 * client references.
 */
export const JOIN_MESSAGES = {
  /** One message for every `invite_invalid` cause: unknown, expired, cancelled or used (3.1). */
  invalid:
    "This invite link isn't valid any more. It may have expired, been cancelled or already been used. Ask the wedding's owner to send you a new one.",
  // Signing out goes to /login without this link (signOut takes no `next`), so the person
  // must open the link again to get back here with the right account.
  email_mismatch:
    "This invite was sent to a different email address. Sign out, open this invite link again, then sign in or create an account with the address the invite was sent to.",
  unauthenticated: "Your session has ended. Sign in again to accept the invite.",
  unreachable: "Couldn't reach Jashn. Check your connection and try again.",
  generic: "Something went wrong, and you haven't joined yet. Try again.",
  unavailable: "Invites can't be opened right now. Try again in a minute.",
  not_connected: "Sign-in isn't connected yet, so invites can't be accepted here.",
} as const;

/** The message for an `accept_member_invite` failure. */
export function joinErrorMessage(code: CommandErrorCode): string {
  switch (code) {
    case "invite_invalid":
      return JOIN_MESSAGES.invalid;
    case "forbidden":
      return JOIN_MESSAGES.email_mismatch;
    case "unauthenticated":
      return JOIN_MESSAGES.unauthenticated;
    default:
      return JOIN_MESSAGES.generic;
  }
}

/** Failures that pressing Accept again can't fix: the form hides the button after them. */
export function isFinalJoinError(code: CommandErrorCode): boolean {
  return code === "invite_invalid" || code === "forbidden" || code === "unauthenticated";
}
