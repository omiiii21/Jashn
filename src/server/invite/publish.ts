import "server-only";

import { CommandFailure } from "@/contracts/commands";
import type { CommandActor, PublicationSnapshot, SessionActor } from "@/contracts/domain";
import type { CommandHandler } from "@/contracts/services";
import { changesTextEn, changesTextHi, type ChangeSubjects } from "@/components/invite/change-text";

import type { SnapshotTools } from "./snapshot";
import type { InviteStore } from "./store";

/**
 * `publish_itinerary` (domain-and-data 2.5 P3 to P7, 3.2; acceptance AT-3.4 to AT-3.6).
 * Owners only: the dispatcher's guard answers 403 first, and this handler checks again.
 * The dispatcher holds the wedding lock, writes the activity entry and bumps `version`;
 * publishing never moves `draft_version`.
 */

export type InviteHandlerDeps<Tx> = {
  store: InviteStore<Tx>;
  snapshot: SnapshotTools;
};

export const DRAFT_CHANGED_MESSAGE = "The schedule changed while you were reviewing. Check the list and publish again.";

export function memberActor(actor: CommandActor): SessionActor | null {
  return actor.kind === "guest" || actor.kind === "system" ? null : actor;
}

/** Function words by id from every snapshot given, so added and removed functions both have names. */
export function subjectsOf(...snapshots: (PublicationSnapshot | null | undefined)[]): ChangeSubjects {
  const subjects: Record<string, { event_kind: PublicationSnapshot["events"][number]["event_kind"]; title: string; title_hi: string }> = {};
  for (const snapshot of snapshots) {
    for (const event of snapshot?.events ?? []) {
      subjects[event.event_id] ??= { event_kind: event.event_kind, title: event.title, title_hi: event.title_hi };
    }
  }
  return subjects;
}

export function createPublishItineraryHandler<Tx>(deps: InviteHandlerDeps<Tx>): CommandHandler<"publish_itinerary", Tx> {
  return async (context) => {
    const { tx, input } = context;
    const wedding_id = context.wedding_id;
    if (!wedding_id) throw new CommandFailure({ code: "not_found", message: "Not found." });

    const actor = memberActor(context.actor);
    if (!actor || actor.role !== "owner" || !actor.member_id) {
      throw new CommandFailure({ code: "forbidden", message: "Only an owner can publish. Your changes are safe in the draft." });
    }

    const wedding = await deps.store.readWedding(tx, wedding_id);
    if (!wedding) throw new CommandFailure({ code: "not_found", message: "Not found." });

    const invite_style = await deps.store.readInviteStyle(tx, wedding_id);
    const events = await deps.store.readEvents(tx, wedding_id);
    const venues = await deps.store.readVenues(tx, wedding_id);
    const draft = deps.snapshot.build({ wedding, invite_style, events, venues });

    const previous_revision = wedding.published_revision;
    const latest = previous_revision === null ? null : await deps.store.readPublication(tx, wedding_id, previous_revision);
    const changes = deps.snapshot.diff(latest?.snapshot ?? null, draft, { wedding_id });

    // P6: the owner reviewed a different draft.
    if (input.expected_draft_version !== wedding.draft_version) {
      throw new CommandFailure({
        code: "draft_changed",
        message: DRAFT_CHANGED_MESSAGE,
        current: { draft_version: wedding.draft_version, changes },
      });
    }

    if (draft.events.length === 0) {
      throw new CommandFailure({ code: "validation_failed", message: "no_functions", field: null });
    }

    // P7: nothing guest-visible changed, so no new revision.
    if (latest && deps.snapshot.equal(latest.snapshot, draft)) {
      return {
        outcome: "unchanged",
        result: { publication_id: latest.id, revision: latest.revision, changes: [] },
        activity: null,
      };
    }

    const revision = (previous_revision ?? 0) + 1;
    const now = new Date(context.now);
    const { id: publication_id } = await deps.store.insertPublication(tx, {
      wedding_id,
      revision,
      snapshot: draft,
      draft_version: wedding.draft_version,
      changes,
      note: input.note ?? null,
      published_by_member_id: actor.member_id,
      published_at: now,
    });
    await deps.store.setPublishedRevision(tx, wedding_id, revision, now);

    const subjects = subjectsOf(draft, latest?.snapshot);
    const changes_en = changesTextEn(changes, subjects);
    const changes_hi = changesTextHi(changes, subjects);
    return {
      outcome: "applied",
      result: { publication_id, revision, changes },
      activity: {
        topic: "itinerary.published",
        entity_type: "publication",
        entity_id: publication_id,
        summary_en: changes_en
          ? `${actor.display_name} published the schedule, revision ${revision}: ${changes_en}.`
          : `${actor.display_name} published the schedule, revision ${revision}.`,
        summary_hi: changes_hi
          ? `${actor.display_name} ने कार्यक्रम प्रकाशित किया, संस्करण ${revision}: ${changes_hi}।`
          : `${actor.display_name} ने कार्यक्रम प्रकाशित किया, संस्करण ${revision}।`,
        before: { published_revision: previous_revision },
        after: { published_revision: revision },
        visibility: "members",
      },
    };
  };
}
