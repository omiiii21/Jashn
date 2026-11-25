import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { buildCardModel } from "@/components/invite/card-model";
import { InvitationCard } from "@/components/invite/InvitationCard";
import { PROBE_JOB_ID } from "@/contracts/jobs";
import { RENDER_TOKEN_PARAM } from "@/contracts/routes";
import { PROBE_CARD_EVENT_IDS, PROBE_CHECK_LINE, PROBE_PHOTO, probeSnapshot } from "@/server/export/probe-fixture";
import { verifyRenderToken } from "@/server/export/render-token";
import { JOBS_WIRED, cardPhotoFor, jobDeps } from "@/server/jobs/deps";

/**
 * The card page Chromium screenshots (export-and-recovery 1.6, 3.2): `/render/card/{job_id}?t=…`.
 * A wrong, expired or missing token gets the plain 404. Card only: no app chrome. The
 * reserved id `probe` renders the built-in sample card and reads nothing; a real job renders
 * its frozen publication snapshot and its frozen `card_event_ids` (1.1).
 * next.config sets noindex, no-store and no-referrer for `/render/*`.
 */

export const maxDuration = 30;

export const metadata: Metadata = {
  title: "Invitation card",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/** The page owns its body: hide anything the dev server layers on top (risk 17). */
const RENDER_PAGE_CSS = `
  html, body { margin: 0; padding: 0; background: var(--jashn-invite-ground); overflow: hidden; }
  nextjs-portal, [data-sonner-toaster] { display: none !important; }
`;

export default async function RenderCardPage({ params, searchParams }: PageProps<"/render/card/[job_id]">) {
  const { job_id } = await params;
  const query = await searchParams;
  const raw = query[RENDER_TOKEN_PARAM];
  const token = typeof raw === "string" ? raw : null;

  if (!verifyRenderToken(job_id, token)) notFound();
  if (job_id === PROBE_JOB_ID) {
    const model = buildCardModel({
      snapshot: probeSnapshot("rev3"),
      card_event_ids: PROBE_CARD_EVENT_IDS,
      is_sample: true,
      photo: PROBE_PHOTO,
    });
    return (
      <>
        <style>{RENDER_PAGE_CSS}</style>
        <InvitationCard model={model} className="fixed left-0 top-0" check_line={PROBE_CHECK_LINE} />
      </>
    );
  }

  if (!JOBS_WIRED) notFound();
  const job = await jobDeps.store.readJob(null, job_id);
  if (!job) notFound();
  const publication = await jobDeps.store.readPublicationById(null, job.publication_id);
  const wedding = await jobDeps.store.readWedding(null, job.wedding_id);
  if (!publication || !wedding) notFound();

  const model = buildCardModel({
    snapshot: publication.snapshot,
    card_event_ids: job.card_event_ids,
    is_sample: wedding.is_sample,
    photo: await cardPhotoFor(job.wedding_id, publication.snapshot),
  });

  return (
    <>
      <style>{RENDER_PAGE_CSS}</style>
      <InvitationCard model={model} className="fixed left-0 top-0" />
    </>
  );
}
