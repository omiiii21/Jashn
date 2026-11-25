import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { AuthCard } from "@/components/auth/AuthCard";
import { JoinForm } from "@/components/auth/JoinForm";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { JOIN_MESSAGES } from "@/components/auth/join-messages";
import { Button } from "@/components/ui/button";
import { routes } from "@/contracts/routes";
import { getDb } from "@/db/client";
import { dispatchCommand } from "@/server/actions/dispatch";
import { signOut } from "@/server/auth/actions";
import { withNextParam } from "@/server/auth/pages";
import { safeNextPath } from "@/server/auth/redirects";
import { getSignedInUser, isLiveAuth } from "@/server/auth/session";
import { formatWeddingDate } from "@/server/commands/wedding-profile";
import { loadJoinInvite, type JoinInvitePreview } from "@/server/read-models/join-invite";

// The URL carries the join token: never index it, and never send it on as a Referer.
export const metadata: Metadata = {
  title: "Join a wedding · Jashn",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

type JoinPageProps = { params: Promise<{ token: string }> };

/**
 * Accept a member invite (AT-8.1, domain 3.1; Lane A per D64 and D109). No poll and no focus
 * refresh (architecture 2.4).
 *
 * - Signed out: to sign-up with `next` back here (the invitee usually has no account yet;
 *   sign-up links to sign-in, keeping `next`).
 * - Signed in: the invite as `loadJoinInvite` reads it, without writing. A valid invite shows
 *   the wedding's names and the role with an Accept button, which sends
 *   `accept_member_invite` through `dispatchCommand` and goes to the planner on success.
 *   Every invalid cause (unknown, expired, cancelled, used) shows the one message.
 */
export default async function JoinPage({ params }: JoinPageProps) {
  await connection();
  const { token } = await params;
  const joinPath = safeNextPath(routes.join(token));

  if (!isLiveAuth()) {
    return (
      <AuthCard title="Join a wedding" description="You've been invited to plan a wedding on Jashn.">
        <p className="rounded-control bg-ivory-deep px-3 py-2 text-meta text-ink-2">{JOIN_MESSAGES.not_connected}</p>
      </AuthCard>
    );
  }

  const user = await getSignedInUser();
  if (!user) redirect(withNextParam(routes.signup(), joinPath));

  let preview: JoinInvitePreview | null;
  try {
    preview = await loadJoinInvite(getDb(), token, user);
  } catch {
    preview = null;
  }

  if (!preview) {
    return (
      <AuthCard title="Join a wedding" description="We couldn't open this invite.">
        <Message>{JOIN_MESSAGES.unavailable}</Message>
      </AuthCard>
    );
  }

  switch (preview.status) {
    case "invalid":
      return (
        <AuthCard title="This invite can't be used" description="Invite links work once and expire after 48 hours.">
          <Message>{JOIN_MESSAGES.invalid}</Message>
        </AuthCard>
      );
    case "email_mismatch":
      return (
        <AuthCard title="This invite is for someone else" description="Invites are sent to one email address.">
          <div className="flex flex-col gap-4">
            <Message>{JOIN_MESSAGES.email_mismatch}</Message>
            <SignOutButton action={signOut} variant="outline" className="h-11 w-full text-body" />
          </div>
        </AuthCard>
      );
    case "already_member":
      return (
        <AuthCard title="You're already in" description="You're a member of this wedding already.">
          <Button asChild className="h-11 w-full text-body">
            <Link href={routes.wedding(preview.wedding_id)}>Open the wedding</Link>
          </Button>
        </AuthCard>
      );
    case "ready":
      return (
        <AuthCard title={`Join ${preview.wedding_name}`} description="You've been invited to help plan this wedding on Jashn.">
          <div className="flex flex-col gap-5">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-body">
              <dt className="text-ink-3">Wedding</dt>
              <dd className="text-ink">{preview.wedding_name}</dd>
              <dt className="text-ink-3">Date</dt>
              <dd className="text-ink">{formatWeddingDate(preview.wedding_date)}</dd>
              <dt className="text-ink-3">Your role</dt>
              <dd className="text-ink">{preview.role_label}</dd>
            </dl>
            <JoinForm token={token} dispatch={dispatchCommand} sign_in_href={withNextParam(routes.login(), joinPath)} />
          </div>
        </AuthCard>
      );
  }
}

function Message({ children }: { children: string }) {
  return <p className="rounded-control bg-ivory-deep px-3 py-2 text-body text-ink-2">{children}</p>;
}
