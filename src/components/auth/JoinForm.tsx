"use client";

import { WarningCircle } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import type { CommandEnvelope, CommandResponse } from "@/contracts/commands";
import { routes } from "@/contracts/routes";

import { JOIN_MESSAGES, isFinalJoinError, joinErrorMessage } from "./join-messages";

export type JoinFormProps = {
  /** The raw join token from the URL; sent once, in the command's input. */
  token: string;
  /** Lane A's `dispatchCommand` server action, passed in by the page (AGENTS.md rule 4). */
  dispatch: (envelope: CommandEnvelope) => Promise<CommandResponse>;
  /** The login page with `next` back to this join page, for an expired session. */
  sign_in_href: string;
};

/** An idempotency key (I1): opaque text, a UUID where the browser offers one. */
function newKey(): string {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === "function") return `join:${cryptoApi.randomUUID()}`;
  // Plain http on a LAN address has no randomUUID; 16 random bytes in hex serve as well.
  const bytes = new Uint8Array(16);
  cryptoApi.getRandomValues(bytes);
  return `join:${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

type JoinError = { message: string; final: boolean; sign_in: boolean };

/**
 * The Accept button of `/join/[token]` (AT-8.1). It sends `accept_member_invite` through
 * `dispatchCommand` with no wedding in the envelope (the user isn't a member yet). The key is
 * made when the button is shown and reused only to resend the identical request after a lost
 * response; every answer gets a new one (I1). On success it goes to the wedding's planner.
 */
export function JoinForm({ token, dispatch, sign_in_href }: JoinFormProps) {
  const router = useRouter();
  const [key, setKey] = useState(newKey);
  const [error, setError] = useState<JoinError | null>(null);
  const [pending, startTransition] = useTransition();

  function accept() {
    setError(null);
    startTransition(async () => {
      let response: CommandResponse;
      try {
        response = await dispatch({ command: "accept_member_invite", input: { token }, idempotency_key: key, source: "ui" });
      } catch {
        // No answer arrived: keep the key, so pressing again resends this exact request.
        setError({ message: JOIN_MESSAGES.unreachable, final: false, sign_in: false });
        return;
      }
      setKey(newKey());
      if (response.ok) {
        const wedding_id = (response.result as { wedding_id?: unknown }).wedding_id;
        if (typeof wedding_id === "string") {
          router.replace(routes.wedding(wedding_id));
          return;
        }
        setError({ message: JOIN_MESSAGES.generic, final: false, sign_in: false });
        return;
      }
      const { code, current } = response.error;
      const member_of = (current as { wedding_id?: unknown } | null | undefined)?.wedding_id;
      if (code === "already_member" && typeof member_of === "string") {
        router.replace(routes.wedding(member_of));
        return;
      }
      setError({ message: joinErrorMessage(code), final: isFinalJoinError(code), sign_in: code === "unauthenticated" });
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <p role="alert" className="flex items-start gap-2 rounded-control bg-overdue-tint px-3 py-2 text-body text-overdue">
          <WarningCircle aria-hidden className="mt-1 size-4 shrink-0" weight="bold" />
          <span>{error.message}</span>
        </p>
      ) : null}
      {error?.sign_in ? (
        <Button asChild className="h-11 w-full text-body">
          <Link href={sign_in_href}>Sign in</Link>
        </Button>
      ) : null}
      {error?.final ? null : (
        <Button type="button" onClick={accept} disabled={pending} aria-busy={pending || undefined} className="h-11 w-full text-body">
          {pending ? "Joining…" : "Accept and join"}
        </Button>
      )}
    </div>
  );
}
