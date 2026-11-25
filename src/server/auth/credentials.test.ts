import { describe, expect, it } from "vitest";

import { AUTH_MESSAGES, isAuthOutage, parseSignIn, parseSignUp, signUpErrorMessage } from "./credentials";

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe("parseSignIn", () => {
  it("lowercases and trims the email", () => {
    const result = parseSignIn(form({ email: "  Mira.A@Example.com ", password: "secret phrase" }));
    expect(result).toEqual({ ok: true, credentials: { email: "mira.a@example.com", password: "secret phrase" } });
  });

  it("asks for both fields when one is empty", () => {
    expect(parseSignIn(form({ email: "mira.a@example.com", password: "" }))).toEqual({
      ok: false,
      error: AUTH_MESSAGES.sign_in_missing,
      email: "mira.a@example.com",
    });
    expect(parseSignIn(form({}))).toMatchObject({ ok: false, error: AUTH_MESSAGES.sign_in_missing });
  });

  it("gives a malformed email the same plain message as a wrong password", () => {
    expect(parseSignIn(form({ email: "not-an-email", password: "x" }))).toMatchObject({
      ok: false,
      error: AUTH_MESSAGES.sign_in_failed,
      email: "not-an-email",
    });
  });
});

describe("parseSignUp", () => {
  it("accepts a valid email and an 8-character password", () => {
    expect(parseSignUp(form({ email: "new@gmail.com", password: "12345678" }))).toEqual({
      ok: true,
      credentials: { email: "new@gmail.com", password: "12345678" },
    });
  });

  it("refuses a short password and keeps the email", () => {
    expect(parseSignUp(form({ email: "new@gmail.com", password: "short" }))).toEqual({
      ok: false,
      error: AUTH_MESSAGES.sign_up_short_password,
      email: "new@gmail.com",
    });
  });

  it("counts the length limit in bytes, as bcrypt does", () => {
    // 30 Devanagari letters are 30 characters but 90 bytes.
    const hindi = "क".repeat(30);
    expect(parseSignUp(form({ email: "new@gmail.com", password: hindi }))).toMatchObject({
      ok: false,
      error: AUTH_MESSAGES.sign_up_long_password,
    });
    expect(parseSignUp(form({ email: "new@gmail.com", password: "a".repeat(72) }))).toMatchObject({ ok: true });
  });

  it("refuses an invalid email", () => {
    expect(parseSignUp(form({ email: "new@", password: "12345678" }))).toMatchObject({
      ok: false,
      error: AUTH_MESSAGES.sign_up_invalid_email,
    });
  });
});

describe("signUpErrorMessage", () => {
  it("maps Supabase's codes to plain messages", () => {
    expect(signUpErrorMessage("user_already_exists")).toBe(AUTH_MESSAGES.sign_up_exists);
    expect(signUpErrorMessage("weak_password")).toBe(AUTH_MESSAGES.sign_up_short_password);
    expect(signUpErrorMessage(undefined)).toBe(AUTH_MESSAGES.sign_up_failed);
  });
});

describe("isAuthOutage", () => {
  it("reads a wrong password or a taken email as the user's error", () => {
    expect(isAuthOutage({ name: "AuthApiError", status: 400, code: "invalid_credentials" })).toBe(false);
    expect(isAuthOutage({ name: "AuthApiError", status: 422, code: "user_already_exists" })).toBe(false);
    expect(isAuthOutage({ name: "AuthWeakPasswordError", status: 422, code: "weak_password" })).toBe(false);
  });

  it("reads a network failure, a rate limit or a server error as an outage", () => {
    // auth-js reports a fetch that never reached Supabase with status 0.
    expect(isAuthOutage({ name: "AuthRetryableFetchError", status: 0 })).toBe(true);
    expect(isAuthOutage({ name: "AuthUnknownError" })).toBe(true);
    expect(isAuthOutage({ name: "AuthApiError", status: 429, code: "over_request_rate_limit" })).toBe(true);
    expect(isAuthOutage({ name: "AuthApiError", status: 503 })).toBe(true);
  });
});
