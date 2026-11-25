import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { cache } from "react";
import { GuestInvitation } from "@/components/invite/guest/GuestInvitation";
import { LiveRefresh } from "@/components/live/LiveRefresh";
import { GUEST_POLL_MS } from "@/contracts/api";
import type { AppLanguage } from "@/contracts/domain";
import { routes } from "@/contracts/routes";
import { isSampleWedding, limitGuestPage, resolveGuest } from "@/server/invite/guest-deps";
import { services } from "@/server/services";

/**
 * The guest site (domain 4.6; design-direction 10.6): one household's published invitation,
 * opened from its private link. Built only from `guest_invitation_view`. Every bad,
 * malformed or revoked token gets the plain 404 (G5, AT-9.4). No session, no cookie, no
 * Supabase client and no third-party script; next.config sets no-referrer, noindex and
 * no-store for `/i/*` (G6).
 *
 * Dynamic on every request: the fixture services read no request-time API, so without this
 * Next could prerender the page on demand and cache it.
 */
export const dynamic = "force-dynamic";

/** Static on purpose: metadata that read the view would run before `notFound()`. */
export const metadata: Metadata = {
  title: "Your invitation",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

const guestView = cache((token: string) => services.guestInvitationView(token));

export default async function GuestInvitationPage({ params, searchParams }: PageProps<"/i/[token]">) {
  const { token } = await params;
  const query = await searchParams;
  const lang: AppLanguage = query.lang === "hi" ? "hi" : "en";

  // Limited before the view is read, so a refusal says nothing about whether the link is real.
  const decision = await limitGuestPage(token, await headers());
  if (!decision.allowed) return <GuestBusy />;

  const view = await guestView(token);
  if (!view) notFound();
  const actor = await resolveGuest(token);

  return (
    <>
      <GuestInvitation token={token} lang={lang} view={view} is_sample={isSampleWedding(actor?.wedding_id ?? null)} />
      <LiveRefresh endpoint={routes.api.guestRevision(token)} interval_ms={GUEST_POLL_MS} />
    </>
  );
}

/** The page's answer to a refused request (domain 6.3): no invitation, no hint about the link. */
function GuestBusy() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md items-center px-4">
      <p className="font-[family-name:var(--font-body)] text-body text-ink-2" role="status">
        This page is busy. Try again in a minute.
      </p>
    </main>
  );
}
