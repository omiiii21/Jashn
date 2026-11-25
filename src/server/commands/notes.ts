import "server-only";

import { CommandFailure, type ParsedCommandInput } from "@/contracts/commands";
import type { SessionActor, WeddingId } from "@/contracts/domain";
import type { ActivityEntryDraft, CommandHandler, CommandHandlerContext, HandlerMap } from "@/contracts/services";
import type { Tx } from "@/db/client";
import { weddingNotes } from "@/db/schema";

/**
 * `add_note`: a fact the planner told the assistant that no other record holds ("Valet
 * parking for 100 cars"). Owners and managers both save notes; the text is kept as confirmed
 * on the review card, and the assistant answers later questions from it word for word.
 */

export function noteActivity(args: { actor_label: string; note_id: string; topic: string; note_text: string }): ActivityEntryDraft {
  return {
    topic: "note.added",
    entity_type: "wedding_note",
    entity_id: args.note_id,
    summary_en: `${args.actor_label} saved a note about ${args.topic}: "${args.note_text}"`,
    summary_hi: `${args.actor_label} ने ${args.topic} पर नोट सेव किया: ${args.note_text}`,
    before: null,
    after: { topic: args.topic, note_text: args.note_text },
    visibility: "members",
  };
}

function memberActor(actor: CommandHandlerContext["actor"]): SessionActor {
  if (actor.kind === "guest" || actor.kind === "system" || !actor.member_id) {
    throw new CommandFailure({ code: "forbidden", message: "Not allowed." });
  }
  return actor;
}

function weddingOf(context: { wedding_id: WeddingId | null }): WeddingId {
  if (!context.wedding_id) throw new CommandFailure({ code: "validation_failed", message: "required", field: "wedding_id" });
  return context.wedding_id;
}

export const addNoteHandler: CommandHandler<"add_note", Tx> = async (context) => {
  const actor = memberActor(context.actor);
  const wedding_id = weddingOf(context);
  const input = context.input as ParsedCommandInput<"add_note">;
  const now = new Date(context.now);
  const topic = input.topic.trim();
  const note_text = input.note_text.trim();

  const [inserted] = await context.tx
    .insert(weddingNotes)
    .values({ wedding_id, topic, note_text, created_by_member_id: actor.member_id, created_at: now, updated_at: now })
    .returning({ id: weddingNotes.id });

  return {
    outcome: "applied",
    result: { note_id: inserted.id, topic, note_text },
    activity: noteActivity({ actor_label: actor.display_name, note_id: inserted.id, topic, note_text }),
    bumps_draft_version: false,
  };
};

/** Lane A's note handler, for the registry in `src/server/commands/registry.ts`. */
export const noteHandlers: HandlerMap = {
  add_note: addNoteHandler,
};
