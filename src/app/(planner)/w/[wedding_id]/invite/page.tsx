import { notFound } from "next/navigation";

import { ChangeList } from "@/components/invite/ChangeList";
import { ExportsPanel } from "@/components/invite/ExportsPanel";
import type { ChangeSubjects } from "@/components/invite/change-text";
import { InvitePublishPanel } from "@/components/invite/InvitePublishPanel";
import { istDateTime, istDayMonth } from "@/components/invite/ist-format";
import { CommandFailure } from "@/contracts/commands";
import type { ExportJobStatusModel, Itinerary } from "@/contracts/read-models";
import { dispatchCommand } from "@/server/actions/dispatch";
import { requireMember } from "@/server/auth/session";
import { services } from "@/server/services";

/**
 * The Invite page (D105, D107). Owners review and publish the draft here through
 * PublishSheet; managers see the same list read-only. The exports panel sits below; the
 * studio mounts above it from lane-d-invite-minimum.
 */

export const dynamic = "force-dynamic";

function subjectsOf(itinerary: Itinerary): ChangeSubjects {
  const map: Record<string, ChangeSubjects[string]> = {};
  for (const fn of itinerary.functions) map[fn.event_id] = { event_kind: fn.event_kind, title: fn.title, title_hi: fn.title_hi };
  return map;
}

function statusLine(itinerary: Itinerary): string {
  const count = itinerary.unpublished_changes.length;
  if (itinerary.published_revision === null) {
    return count > 0 ? "Draft. Guests see nothing until you publish." : "Nothing published yet.";
  }
  if (count > 0) {
    const since = itinerary.published_at ? ` since you published on ${istDayMonth(itinerary.published_at)}` : "";
    return `Draft. ${count} ${count === 1 ? "change" : "changes"}${since}.`;
  }
  const when = itinerary.published_at ? `, ${istDateTime(itinerary.published_at)}` : "";
  const by = itinerary.published_by ? `, by ${itinerary.published_by}` : "";
  return `Published revision ${itinerary.published_revision}${when}${by}.`;
}

export default async function InvitePage({ params }: PageProps<"/w/[wedding_id]/invite">) {
  const { wedding_id } = await params;
  const actor = await requireMember(wedding_id);

  let itinerary: Itinerary;
  try {
    itinerary = await services.read("itinerary", { actor, wedding_id });
  } catch (error) {
    if (error instanceof CommandFailure && (error.body.code === "not_found" || error.body.code === "forbidden")) notFound();
    throw error;
  }

  const isOwner = actor.role === "owner";
  const changes = itinerary.unpublished_changes;
  const exports: ExportJobStatusModel = await services.read("export_job_status", { actor, wedding_id });

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6">
      <section aria-labelledby="invite-publish-heading" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 id="invite-publish-heading" className="font-serif text-title text-ink">
              Invitation
            </h1>
            <p className="text-body text-ink-2" data-testid="invite-status">
              {statusLine(itinerary)}
            </p>
          </div>
          {isOwner ? (
            <InvitePublishPanel
              wedding_id={wedding_id}
              itinerary={{
                unpublished_changes: changes,
                draft_version: itinerary.draft_version,
                published_revision: itinerary.published_revision,
                functions: itinerary.functions,
              }}
              dispatch={dispatchCommand}
            />
          ) : null}
        </div>

        {!isOwner && changes.length > 0 ? (
          <div className="flex flex-col gap-3 rounded-control border border-line bg-ivory p-4">
            <p className="text-body text-ink">Only an owner can publish. Your changes are safe in the draft.</p>
            <ChangeList changes={changes} subjects={subjectsOf(itinerary)} />
          </div>
        ) : null}
      </section>

      <ExportsPanel wedding_id={wedding_id} model={exports} role={isOwner ? "owner" : "manager"} />
    </div>
  );
}
