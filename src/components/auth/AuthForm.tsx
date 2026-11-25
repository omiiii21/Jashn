"use client";

import { WarningCircle } from "@phosphor-icons/react";
import { useActionState, useId } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { INITIAL_AUTH_FORM_STATE, type AuthFormAction } from "./types";

type AuthFormProps = {
  /** Lane A's `signIn` or `signUp` server action, passed in by the page (AGENTS.md rule 4). */
  action: AuthFormAction;
  /** A safe same-site path to continue to afterwards, already checked by the server. */
  next?: string | null;
  submit_label: string;
  pending_label: string;
  password_autocomplete: "current-password" | "new-password";
  password_hint?: string;
};

/** The email and password form behind both auth pages. It never touches Supabase itself. */
function AuthForm({ action, next, submit_label, pending_label, password_autocomplete, password_hint }: AuthFormProps) {
  const [state, formAction, pending] = useActionState(action, INITIAL_AUTH_FORM_STATE);
  const id = useId();
  const emailId = `${id}-email`;
  const passwordId = `${id}-password`;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [password_hint ? hintId : null, state.error ? errorId : null].filter(Boolean).join(" ") || undefined;

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <div className="flex flex-col gap-2">
        <Label htmlFor={emailId} className="text-body text-ink">
          Email
        </Label>
        <Input
          id={emailId}
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          defaultValue={state.email}
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? errorId : undefined}
          className="h-11 bg-paper text-body"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={passwordId} className="text-body text-ink">
          Password
        </Label>
        <Input
          id={passwordId}
          name="password"
          type="password"
          autoComplete={password_autocomplete}
          required
          aria-invalid={state.error ? true : undefined}
          aria-describedby={describedBy}
          className="h-11 bg-paper text-body"
        />
        {password_hint ? (
          <p id={hintId} className="text-meta text-ink-3">
            {password_hint}
          </p>
        ) : null}
      </div>
      {state.error ? (
        <p id={errorId} role="alert" className="flex items-start gap-2 rounded-control bg-overdue-tint px-3 py-2 text-body text-overdue">
          <WarningCircle aria-hidden className="mt-1 size-4 shrink-0" weight="bold" />
          <span>{state.error}</span>
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="h-11 w-full text-body">
        {pending ? pending_label : submit_label}
      </Button>
    </form>
  );
}

type SignInFormProps = { action: AuthFormAction; next?: string | null };

/** Sign in with email and password (AT-8.1). Errors show one plain message. */
export function SignInForm({ action, next }: SignInFormProps) {
  return (
    <AuthForm
      action={action}
      next={next}
      submit_label="Sign in"
      pending_label="Signing in…"
      password_autocomplete="current-password"
    />
  );
}

type SignUpFormProps = { action: AuthFormAction; next?: string | null; min_password_length: number };

/** Create an owner account; the next stop is setup (architecture 3.5). */
export function SignUpForm({ action, next, min_password_length }: SignUpFormProps) {
  return (
    <AuthForm
      action={action}
      next={next}
      submit_label="Create account"
      pending_label="Creating your account…"
      password_autocomplete="new-password"
      password_hint={`At least ${min_password_length} characters.`}
    />
  );
}
