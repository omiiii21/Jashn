import "server-only";

import { and, eq, isNull, max, min } from "drizzle-orm";

import { CommandFailure } from "@/contracts/commands";
import type { SessionActor, WeddingId } from "@/contracts/domain";
import { managerSeesBlock } from "@/contracts/permissions";
import type { HiddenBlock, WeddingProfile } from "@/contracts/read-models";
import type { DbOrTx } from "@/db/client";
import { budgets, events, members, weddings } from "@/db/schema";

/** Read models never return an amount or a count that isn't a safe integer (domain 0.1). */
function safeInteger(name: string, value: unknown): number {
  const number = typeof value === "string" ? Number(value) : value;
  if (typeof number !== "number" || !Number.isSafeInteger(number)) {
    throw new Error(`wedding_profile: ${name} is not a safe integer`);
  }
  return number;
}

function isoDateOf(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

/**
 * `wedding_profile` (domain 4.11, D99): the landing view's and the shell's header, for any
 * member. The caller (the guard) has already checked membership; this only reads.
 * `budget_inr` is for owners, and managers while `managers_can_see_budget` is on;
 * otherwise it is left out, `budget` is listed in `hidden` (G7) and `budgets` isn't read.
 */
export async function buildWeddingProfile(db: DbOrTx, actor: SessionActor, wedding_id: WeddingId): Promise<WeddingProfile> {
  const [weddingRows, memberRows, dateRows] = await Promise.all([
    db
      .select({
        wedding_id: weddings.id,
        seed_key: weddings.seed_key,
        bride_name: weddings.bride_name,
        groom_name: weddings.groom_name,
        wedding_date: weddings.wedding_date,
        city: weddings.city,
        is_sample: weddings.is_sample,
        version: weddings.version,
        managers_can_see_vendor_dues: weddings.managers_can_see_vendor_dues,
        managers_can_see_budget: weddings.managers_can_see_budget,
        managers_can_see_guest_contacts: weddings.managers_can_see_guest_contacts,
      })
      .from(weddings)
      .where(eq(weddings.id, wedding_id))
      .limit(1),
    db
      .select({ member_id: members.id, role: members.role, display_name: members.display_name })
      .from(members)
      .where(and(eq(members.wedding_id, wedding_id), eq(members.user_id, actor.user_id), isNull(members.removed_at)))
      .limit(1),
    db
      .select({ first_event_date: min(events.event_date), last_event_date: max(events.event_date) })
      .from(events)
      .where(and(eq(events.wedding_id, wedding_id), isNull(events.deleted_at))),
  ]);

  const wedding = weddingRows[0];
  if (!wedding) throw new CommandFailure({ code: "not_found", message: "Wedding not found." });
  const member = memberRows[0];
  if (!member) throw new CommandFailure({ code: "not_found", message: "Wedding not found." });
  const dates = dateRows[0];

  const hidden: HiddenBlock[] = [];
  const profile: WeddingProfile = {
    version: safeInteger("version", wedding.version),
    hidden,
    wedding_id: wedding.wedding_id,
    seed_key: wedding.seed_key,
    display_name: `${wedding.bride_name} & ${wedding.groom_name}`,
    bride_name: wedding.bride_name,
    groom_name: wedding.groom_name,
    wedding_date: wedding.wedding_date,
    first_event_date: isoDateOf(dates?.first_event_date),
    last_event_date: isoDateOf(dates?.last_event_date),
    city: wedding.city,
    is_sample: wedding.is_sample,
    member: { member_id: member.member_id, role: member.role, display_name: member.display_name },
  };

  // `budgets` is kept apart so a manager's read never touches it without budget sharing (5.1).
  const seesBudget = member.role === "owner" || managerSeesBlock("budget", wedding);
  if (seesBudget) {
    const budgetRows = await db
      .select({ total_inr: budgets.total_inr })
      .from(budgets)
      .where(eq(budgets.wedding_id, wedding_id))
      .limit(1);
    profile.budget_inr = safeInteger("budget_inr", budgetRows[0]?.total_inr ?? 0);
  } else hidden.push("budget");
  return profile;
}
