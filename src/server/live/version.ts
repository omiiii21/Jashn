import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";

import type { WeddingId } from "@/contracts/domain";
import type { BumpVersion } from "@/contracts/services";
import type { DbOrTx, Tx } from "@/db/client";
import { members, weddings } from "@/db/schema";

/**
 * The poll cursor (domain L6, 5.6). `weddings.version` moves by exactly one in every
 * state-changing transaction and never goes down; `draft_version` moves when a
 * guest-visible draft field changes (P1). Lane D's job module calls `bumpVersion` inside
 * its own transaction for every export-job transition (architecture 3.3).
 */

/** +1 on `weddings.version`; returns the new value. Throws when the wedding doesn't exist. */
export const bumpVersion: BumpVersion<Tx> = (tx, wedding_id) => bumpVersionIn(tx, wedding_id);

export async function bumpVersionIn(tx: DbOrTx, wedding_id: WeddingId): Promise<number> {
  const rows = await tx
    .update(weddings)
    .set({ version: sql`${weddings.version} + 1`, updated_at: sql`now()` })
    .where(eq(weddings.id, wedding_id))
    .returning({ version: weddings.version });
  const version = rows[0]?.version;
  if (version === undefined) throw new Error("bumpVersion: wedding not found");
  return Number(version);
}

/** +1 on `weddings.draft_version` (P1); returns the new value. */
export async function bumpDraftVersion(tx: DbOrTx, wedding_id: WeddingId): Promise<number> {
  const rows = await tx
    .update(weddings)
    .set({ draft_version: sql`${weddings.draft_version} + 1` })
    .where(eq(weddings.id, wedding_id))
    .returning({ draft_version: weddings.draft_version });
  const draft_version = rows[0]?.draft_version;
  if (draft_version === undefined) throw new Error("bumpDraftVersion: wedding not found");
  return Number(draft_version);
}

/** The poll's one-row read; null when the wedding doesn't exist. */
export async function readVersion(db: DbOrTx, wedding_id: WeddingId): Promise<number | null> {
  const rows = await db.select({ version: weddings.version }).from(weddings).where(eq(weddings.id, wedding_id)).limit(1);
  const version = rows[0]?.version;
  return version === undefined ? null : Number(version);
}

/**
 * The planner poll's read (architecture 2.4): the wedding's `version`, only through an
 * active membership of this user, in one query. Null when the user isn't an active member
 * (or was removed), which the route answers with 403.
 */
export async function readMemberVersion(db: DbOrTx, user_id: string, wedding_id: WeddingId): Promise<number | null> {
  const rows = await db
    .select({ version: weddings.version })
    .from(members)
    .innerJoin(weddings, eq(weddings.id, members.wedding_id))
    .where(and(eq(members.user_id, user_id), eq(members.wedding_id, wedding_id), isNull(members.removed_at)))
    .limit(1);
  const version = rows[0]?.version;
  return version === undefined ? null : Number(version);
}
