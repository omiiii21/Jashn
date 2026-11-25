import "server-only";

import { and, desc, eq, isNull } from "drizzle-orm";

import { CommandFailure } from "@/contracts/commands";
import type { WeddingId } from "@/contracts/domain";
import type { WeddingNotes } from "@/contracts/read-models";
import type { DbOrTx } from "@/db/client";
import { isUuidShaped } from "@/db/ids";
import { members, weddingNotes, weddings } from "@/db/schema";

/** The newest notes first; the assistant's snapshot lists at most this many. */
export const MAX_NOTES = 50;

/**
 * `wedding_notes`: the facts the planner told the assistant (add_note), newest first, as
 * saved. Owners and managers read it (6.1); the caller's guard has already checked that.
 */
export async function buildWeddingNotes(db: DbOrTx, wedding_id: WeddingId): Promise<WeddingNotes> {
  if (!isUuidShaped(wedding_id)) throw new CommandFailure({ code: "not_found", message: "Wedding not found.", field: null });
  const [wedding] = await db.select({ version: weddings.version }).from(weddings).where(eq(weddings.id, wedding_id)).limit(1);
  if (!wedding) throw new CommandFailure({ code: "not_found", message: "Wedding not found.", field: null });

  const rows = await db
    .select({
      note_id: weddingNotes.id,
      seed_key: weddingNotes.seed_key,
      topic: weddingNotes.topic,
      note_text: weddingNotes.note_text,
      created_at: weddingNotes.created_at,
      created_by_name: members.display_name,
    })
    .from(weddingNotes)
    .leftJoin(members, eq(members.id, weddingNotes.created_by_member_id))
    .where(and(eq(weddingNotes.wedding_id, wedding_id), isNull(weddingNotes.deleted_at)))
    .orderBy(desc(weddingNotes.created_at), desc(weddingNotes.id))
    .limit(MAX_NOTES);

  return {
    version: Number(wedding.version),
    notes: rows.map((row) => ({
      note_id: row.note_id,
      seed_key: row.seed_key,
      topic: row.topic,
      note_text: row.note_text,
      created_at: row.created_at.toISOString(),
      created_by_name: row.created_by_name ?? null,
    })),
  };
}
