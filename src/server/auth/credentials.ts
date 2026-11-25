import "server-only";

import { z } from "zod";

/**
 * Form parsing and the plain messages for sign-in and sign-up (AT-8.1). Pure, so it is
 * unit-tested; the server actions in `actions.ts` call it.
 */

/** Supabase's own minimum is 6; the app asks for 8 on sign-up. */
export const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 72; // bcrypt's input limit, which Supabase Auth uses.

/** bcrypt counts bytes, not characters: a Devanagari character is 3 bytes in UTF-8. */
function passwordTooLong(password: string): boolean {
  return new TextEncoder().encode(password).length > MAX_PASSWORD_LENGTH;
}

export const AUTH_MESSAGES = {
  /** Sign-in shows one plain message for every failure (wrong email, wrong password, unknown user). */
  sign_in_failed: "That email and password don't match. Check them and try again.",
  sign_in_missing: "Enter your email and password.",
  sign_up_invalid_email: "Enter a valid email address.",
  sign_up_short_password: `Use a password of at least ${MIN_PASSWORD_LENGTH} characters.`,
  sign_up_long_password: "That password is too long. Use a shorter one.",
  sign_up_exists: "That email already has an account. Sign in instead.",
  sign_up_failed: "We couldn't create your account. Try again in a minute.",
  sign_up_no_session: "Your account was created, but you aren't signed in yet. Sign in to continue.",
  unavailable: "Sign-in isn't available right now. Try again in a minute.",
} as const;

const emailField = z.string().trim().toLowerCase().max(254).pipe(z.email());

export type Credentials = { email: string; password: string };

type ParseResult = { ok: true; credentials: Credentials } | { ok: false; error: string; email: string };

function formText(form_data: FormData, name: string): string {
  const value = form_data.get(name);
  return typeof value === "string" ? value : "";
}

/** The email as typed, trimmed, for refilling the form after an error. */
export function typedEmail(form_data: FormData): string {
  return formText(form_data, "email").trim().slice(0, 254);
}

/** Sign-in input: any non-empty email and password; one plain message otherwise. */
export function parseSignIn(form_data: FormData): ParseResult {
  const email = typedEmail(form_data);
  const password = formText(form_data, "password");
  if (!email || !password) return { ok: false, error: AUTH_MESSAGES.sign_in_missing, email };
  const parsed = emailField.safeParse(email);
  // A malformed email can't match an account: the same plain message as a wrong password.
  if (!parsed.success || passwordTooLong(password)) {
    return { ok: false, error: AUTH_MESSAGES.sign_in_failed, email };
  }
  return { ok: true, credentials: { email: parsed.data, password } };
}

/** Sign-up input: a valid email and a password of at least 8 characters and at most 72 bytes. */
export function parseSignUp(form_data: FormData): ParseResult {
  const email = typedEmail(form_data);
  const password = formText(form_data, "password");
  const parsed = emailField.safeParse(email);
  if (!parsed.success) return { ok: false, error: AUTH_MESSAGES.sign_up_invalid_email, email };
  if (password.length < MIN_PASSWORD_LENGTH) return { ok: false, error: AUTH_MESSAGES.sign_up_short_password, email };
  if (passwordTooLong(password)) return { ok: false, error: AUTH_MESSAGES.sign_up_long_password, email };
  return { ok: true, credentials: { email: parsed.data, password } };
}

/** The parts of an auth-js `AuthError` that say whether Supabase itself was unreachable. */
export type AuthErrorLike = { name?: string; status?: number; code?: string };

/**
 * True when an auth error means "try again later" rather than "wrong details": a network
 * failure (auth-js reports it as `AuthRetryableFetchError` with status 0), an unknown error
 * with no status, a rate limit (429) or a server error (5xx).
 */
export function isAuthOutage(error: AuthErrorLike): boolean {
  if (error.name === "AuthRetryableFetchError" || error.name === "AuthUnknownError") return true;
  const status = error.status;
  if (typeof status !== "number" || status === 0) return true;
  if (status === 429 || status >= 500) return true;
  return error.code === "over_request_rate_limit";
}

/** The message for a Supabase sign-up error, by its `code` (auth-js `ErrorCode`). */
export function signUpErrorMessage(code: string | undefined): string {
  switch (code) {
    case "user_already_exists":
    case "email_exists":
    case "identity_already_exists":
      return AUTH_MESSAGES.sign_up_exists;
    case "weak_password":
      return AUTH_MESSAGES.sign_up_short_password;
    case "email_address_invalid":
    case "validation_failed":
      return AUTH_MESSAGES.sign_up_invalid_email;
    default:
      return AUTH_MESSAGES.sign_up_failed;
  }
}
