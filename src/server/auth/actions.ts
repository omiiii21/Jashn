"use server";

import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import type { AuthFormState } from "@/components/auth/types";
import { routes } from "@/contracts/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { AUTH_MESSAGES, isAuthOutage, parseSignIn, parseSignUp, signUpErrorMessage } from "./credentials";
import { safeNextPath } from "./redirects";
import { isLiveAuth } from "./session";

/**
 * Lane A's own sign-in, sign-up and sign-out actions (architecture 3.5; AGENTS.md rule 4).
 * Email and password only. They run Supabase Auth on the `@supabase/ssr` server client, so
 * the session cookies are set on this response; there is no browser auth client.
 *
 * In fixture mode (no Supabase or database yet) everyone is the fixture member, so sign-in
 * and sign-up just continue to the app.
 */

/** `useActionState` action: signs in with email and password, then goes home (or to `next`). */
export async function signIn(_state: AuthFormState, form_data: FormData): Promise<AuthFormState> {
  const next = safeNextPath(form_data.get("next"));
  const parsed = parseSignIn(form_data);
  if (!parsed.ok) return { error: parsed.error, email: parsed.email };

  if (isLiveAuth()) {
    let failed: string | null = null;
    try {
      const supabase = await createSupabaseServerClient();
      const { error } = await supabase.auth.signInWithPassword(parsed.credentials);
      // One plain message for every failure: never say which half was wrong. An outage or a
      // rate limit says so instead, so nobody retypes a correct password.
      if (error) failed = isAuthOutage(error) ? AUTH_MESSAGES.unavailable : AUTH_MESSAGES.sign_in_failed;
    } catch {
      failed = AUTH_MESSAGES.unavailable;
    }
    if (failed) return { error: failed, email: parsed.credentials.email };
  }

  // Outside any try block: redirect throws (Next's redirect docs).
  redirect(next ?? routes.home());
}

/**
 * "Try the demo": signs this browser in to the shared sample wedding (Mira & Kabir), so a visitor
 * can look around without an account. The account and its password live only in server env vars
 * (`DEMO_ACCOUNT_EMAIL`, `DEMO_ACCOUNT_PASSWORD`) and never reach the browser. It is a separate
 * sample copy from the one used in live demos. In fixture mode everyone is the fixture member.
 */
export async function signInDemo(): Promise<void> {
  if (!isLiveAuth()) redirect(routes.home());
  const email = process.env.DEMO_ACCOUNT_EMAIL?.trim() ?? "";
  const password = process.env.DEMO_ACCOUNT_PASSWORD ?? "";
  let ok = false;
  if (email && password) {
    try {
      const supabase = await createSupabaseServerClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      ok = !error;
    } catch {
      ok = false;
    }
  }
  // Outside any try block: redirect throws (Next's redirect docs).
  redirect(ok ? routes.home() : `${routes.login()}?demo=unavailable`);
}

/**
 * `useActionState` action: creates an owner account. "Confirm email" is off (D116), so the
 * session starts at once and the user goes to /setup (or to `next`, such as a join link).
 */
export async function signUp(_state: AuthFormState, form_data: FormData): Promise<AuthFormState> {
  const next = safeNextPath(form_data.get("next"));
  const parsed = parseSignUp(form_data);
  if (!parsed.ok) return { error: parsed.error, email: parsed.email };

  if (isLiveAuth()) {
    let failed: string | null = null;
    try {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase.auth.signUp(parsed.credentials);
      if (error) failed = isAuthOutage(error) ? AUTH_MESSAGES.unavailable : signUpErrorMessage(error.code);
      else if (!data.session) {
        // Confirmation is on after all, or the address already exists (Supabase hides which).
        failed = AUTH_MESSAGES.sign_up_no_session;
      }
    } catch {
      failed = AUTH_MESSAGES.unavailable;
    }
    if (failed) return { error: failed, email: parsed.credentials.email };
  }

  redirect(next ?? routes.setup());
}

/** Signs out this browser only (other sessions stay signed in, AT-8.1), then goes to /login. */
export async function signOut(): Promise<void> {
  if (isLiveAuth()) {
    let cleared = false;
    try {
      const supabase = await createSupabaseServerClient();
      const { error } = await supabase.auth.signOut({ scope: "local" });
      cleared = !error;
    } catch {
      cleared = false;
    }
    if (!cleared) {
      // The revoke call failed (network, outage): still drop this browser's auth cookies.
      const cookieStore = await cookies();
      for (const { name } of cookieStore.getAll()) {
        if (name.startsWith("sb-") && name.includes("-auth-token")) cookieStore.delete(name);
      }
    }
  }
  redirect(routes.login());
}
