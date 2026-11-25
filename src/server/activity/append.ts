import "server-only";

import type { ActivityEntryId, CommandActor, CommandSource, IsoInstant, JsonValue, VoiceTurnId, WeddingId } from "@/contracts/domain";
import type { ActivityEntryDraft, AppendActivity } from "@/contracts/services";
import type { DbOrTx, Tx } from "@/db/client";
import { activityEntries } from "@/db/schema";

/**
 * The append-activity helper (domain L1–L5, architecture 3.3). It writes one
 * `activity_entries` row from a finished entry, inside the caller's transaction: the
 * dispatcher for every applied command, and Lane D's job module for its own export
 * entries (D63). It never builds summaries: templates stay with their commands.
 */

/** What the dispatcher adds beyond the contract's `AppendActivity` entry. All optional. */
export type ActivityEntryExtras = {
  source?: CommandSource;
  voice_turn_id?: VoiceTurnId | null;
  spoken_text?: string | null;
  idempotency_key?: string | null;
  /** A guest actor's guest (the person who tapped); defaults to the household's first guest. */
  actor_guest_id?: string | null;
};

export type AppendActivityEntry = ActivityEntryDraft & {
  wedding_id: WeddingId;
  actor: CommandActor;
  command: string;
  occurred_at: IsoInstant;
} & ActivityEntryExtras;

/** The `source` an actor implies when the caller doesn't say. */
export function defaultSourceFor(actor: CommandActor): CommandSource {
  if (actor.kind === "guest") return "guest_link";
  if (actor.kind === "system") return actor.label === "NudgeBee" ? "nudgebee" : "system";
  return "ui";
}

function actorColumns(actor: CommandActor, entry: AppendActivityEntry) {
  if (actor.kind === "guest") {
    return {
      actor_type: "guest" as const,
      actor_member_id: null,
      actor_guest_id: entry.actor_guest_id ?? actor.guest_ids[0] ?? null,
      actor_label: entry.actor_label ?? actor.household_name,
    };
  }
  if (actor.kind === "system") {
    return { actor_type: "system" as const, actor_member_id: null, actor_guest_id: null, actor_label: entry.actor_label ?? actor.label };
  }
  return {
    actor_type: "member" as const,
    actor_member_id: actor.member_id,
    actor_guest_id: null,
    actor_label: entry.actor_label ?? actor.display_name,
  };
}

async function append(tx: DbOrTx, entry: AppendActivityEntry): Promise<ActivityEntryId> {
  const rows = await tx
    .insert(activityEntries)
    .values({
      wedding_id: entry.wedding_id,
      occurred_at: new Date(entry.occurred_at),
      ...actorColumns(entry.actor, entry),
      command: entry.command,
      topic: entry.topic,
      source: entry.source ?? defaultSourceFor(entry.actor),
      entity_type: entry.entity_type,
      entity_id: entry.entity_id,
      summary_en: entry.summary_en,
      summary_hi: entry.summary_hi,
      before: (entry.before ?? null) as JsonValue | null,
      after: (entry.after ?? null) as JsonValue | null,
      visibility: entry.visibility,
      proposal_id: entry.proposal_id ?? null,
      voice_turn_id: entry.voice_turn_id ?? null,
      spoken_text: entry.spoken_text ?? null,
      idempotency_key: entry.idempotency_key ?? null,
    })
    .returning({ id: activityEntries.id });
  const id = rows[0]?.id;
  if (!id) throw new Error("activity entry insert returned no id");
  return id;
}

/** The helper typed as the contract's `AppendActivity`, for Lane D (D63). */
export const appendActivity: AppendActivity<Tx> = (tx, entry) => append(tx, entry);

/** The dispatcher's form, which also records source, voice turn, spoken text and key. */
export function appendActivityEntry(tx: DbOrTx, entry: AppendActivityEntry): Promise<ActivityEntryId> {
  return append(tx, entry);
}
