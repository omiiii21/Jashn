"use client";

import { Copy } from "@phosphor-icons/react";
import { useId, useRef, useState, type FormEvent } from "react";

import type { Dispatch } from "@/components/planner/forms/command";
import { useCommand } from "@/components/planner/forms/useCommand";
import { SaveError } from "@/components/planner/kit/SaveError";
import { Field, INPUT, PRIMARY, Receipt, SECONDARY } from "@/components/planner/money/form-parts";
import type { MemberRole, WeddingId } from "@/contracts/domain";

import { teamErrorText } from "./team-text";

type InviteMemberFormProps = {
  wedding_id: WeddingId;
  dispatch: Dispatch;
};

const ROLE_OPTIONS: { value: MemberRole; label: string }[] = [
  { value: "manager", label: "Manager" },
  { value: "owner", label: "Owner" },
];

/** A plain shape check before the server's own; the server still decides. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Outcome = { kind: "link"; url: string; email: string } | { kind: "already_issued" };

/**
 * "Invite a member" (`invite_member`, D64, D109): email, an optional name and the role. The
 * join URL comes back once, so it shows in a read-only field to copy, and it leaves with the
 * sheet. A replay says an invite already exists instead.
 */
export function InviteMemberForm({ wedding_id, dispatch }: InviteMemberFormProps) {
  const id = useId();
  const headingId = useId();
  const linkRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<MemberRole>("manager");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [copied, setCopied] = useState<"copied" | "failed" | null>(null);
  const save = useCommand(dispatch);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = email.trim();
    if (trimmed.length === 0) {
      setEmailError("Enter the person's email address.");
      return;
    }
    if (!EMAIL_SHAPE.test(trimmed)) {
      setEmailError("Enter a full email address, like diya@example.com.");
      return;
    }
    setEmailError(null);
    setCopied(null);
    const response = await save.submit({
      wedding_id,
      command: "invite_member",
      input: { email: trimmed, role, ...(name.trim() ? { display_name: name.trim() } : {}) },
      source: "ui",
    });
    if (!response.ok || response.command !== "invite_member") return;
    if (response.result.token_already_issued) {
      setOutcome({ kind: "already_issued" });
    } else if (response.result.join_url) {
      setOutcome({ kind: "link", url: response.result.join_url, email: trimmed });
      setEmail("");
      setName("");
      setRole("manager");
    }
  }

  async function copyLink() {
    if (outcome?.kind !== "link") return;
    try {
      await navigator.clipboard.writeText(outcome.url);
      setCopied("copied");
    } catch {
      linkRef.current?.select();
      setCopied("failed");
    }
  }

  const saveError = save.state.status === "error" ? teamErrorText(save.state.error) : null;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h3 id={headingId} className="text-heading text-ink">
        Invite a member
      </h3>
      <form onSubmit={submit} noValidate aria-labelledby={headingId} className="flex flex-col gap-3">
        <Field id={`${id}-email`} label="Email" error={emailError}>
          <input
            id={`${id}-email`}
            name="email"
            type="email"
            required
            autoComplete="off"
            spellCheck={false}
            maxLength={120}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={emailError ? true : undefined}
            aria-describedby={emailError ? `${id}-email-error` : undefined}
            className={INPUT}
          />
        </Field>
        <Field id={`${id}-name`} label="Name (optional)">
          <input
            id={`${id}-name`}
            name="name"
            autoComplete="off"
            maxLength={60}
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={INPUT}
          />
        </Field>
        <Field id={`${id}-role`} label="Role">
          <select
            id={`${id}-role`}
            name="role"
            value={role}
            onChange={(event) => setRole(event.target.value as MemberRole)}
            className={INPUT}
          >
            {ROLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
        {saveError ? <SaveError message={saveError} /> : null}
        <div>
          <button type="submit" className={PRIMARY} disabled={save.saving}>
            {save.saving ? "Sending…" : "Send invite"}
          </button>
        </div>
      </form>

      {outcome?.kind === "already_issued" ? (
        <Receipt>An invite was already made for this email. Revoke it to make a new one.</Receipt>
      ) : null}
      {outcome?.kind === "link" ? (
        <div className="flex flex-col gap-2 rounded-paper bg-ivory p-3">
          <Receipt>Invite made for {outcome.email}. Send them this link.</Receipt>
          <Field id={`${id}-link`} label="Join link">
            <input
              ref={linkRef}
              id={`${id}-link`}
              readOnly
              value={outcome.url}
              onFocus={(event) => event.currentTarget.select()}
              aria-describedby={`${id}-link-note`}
              className={INPUT}
            />
          </Field>
          <p id={`${id}-link-note`} className="text-meta text-ink-2">
            Shown once. It expires in 48 hours.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={SECONDARY} onClick={copyLink}>
              <Copy size={16} aria-hidden="true" />
              Copy link
            </button>
            {copied ? (
              <span role="status" className="text-meta text-ink-2">
                {copied === "copied" ? "Copied." : "Select the link and copy it."}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
