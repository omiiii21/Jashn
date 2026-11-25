"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";

import type { CommandEnvelope, CommandResponse } from "@/contracts/commands";
import type { WeddingId } from "@/contracts/domain";
import type { Itinerary } from "@/contracts/read-models";

import type { ChangeSubjects } from "./change-text";
import { PublishSheet } from "./PublishSheet";
import { PublishSheetProvider } from "./publish-sheet-context";

export type InvitePublishPanelProps = {
  wedding_id: WeddingId;
  itinerary: Pick<Itinerary, "unpublished_changes" | "draft_version" | "published_revision" | "functions">;
  /** The shared `dispatchCommand` server action, passed down by the page (D98). */
  dispatch: (envelope: CommandEnvelope) => Promise<CommandResponse>;
};

function newKey(): string {
  return `publish-${crypto.randomUUID()}`;
}

/**
 * The owner's publish control on the Invite page (D105, D107): mounts PublishSheet with the
 * planner's `on_confirm`, which sends exactly one `publish_itinerary` per tap with a fresh
 * idempotency key, then refreshes the page's server data.
 */
export function InvitePublishPanel({ wedding_id, itinerary, dispatch }: InvitePublishPanelProps) {
  const router = useRouter();
  const subjects = useMemo<ChangeSubjects>(() => {
    const map: Record<string, ChangeSubjects[string]> = {};
    for (const fn of itinerary.functions) {
      map[fn.event_id] = { event_kind: fn.event_kind, title: fn.title, title_hi: fn.title_hi };
      if (fn.published) map[fn.event_id] ??= { event_kind: fn.published.event_kind, title: fn.published.title, title_hi: fn.published.title_hi };
    }
    return map;
  }, [itinerary.functions]);

  async function onConfirm(expected_draft_version: number) {
    const response = await dispatch({
      wedding_id,
      command: "publish_itinerary",
      input: { expected_draft_version },
      idempotency_key: newKey(),
      source: "ui",
    });
    router.refresh();
    return response;
  }

  return (
    <PublishSheetProvider value={{ next_revision: (itinerary.published_revision ?? 0) + 1, subjects }}>
      <PublishSheet
        wedding_id={wedding_id}
        unpublished_changes={itinerary.unpublished_changes}
        expected_draft_version={itinerary.draft_version}
        on_confirm={onConfirm}
      />
    </PublishSheetProvider>
  );
}
