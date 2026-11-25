import "server-only";

import { eq } from "drizzle-orm";

import { CommandFailure, setWeddingProfileCreateSchema, validationMessageFor } from "@/contracts/commands";
import type { IsoDate, JsonObject, JsonValue, SessionActor, WeddingId } from "@/contracts/domain";
import { formatInr, groupIndian } from "@/contracts/money";
import type {
  ActivityEntryDraft,
  CommandHandler,
  CommandHandlerContext,
  CommandHandlerResult,
  HandlerMap,
} from "@/contracts/services";
import type { Tx } from "@/db/client";
import { budgets, inviteStyles, members, weddings } from "@/db/schema";

/**
 * `set_wedding_profile` (domain 3.1): the first command. Create (no `wedding_id` in the
 * envelope) inserts the wedding, the owner's `members` row, the `budgets` row and the
 * `invite_styles` row with its defaults, sharing flags all off. Update changes only the
 * given fields that differ; nothing differing is `unchanged` with no activity (L1).
 *
 * The dispatcher has already resolved the actor, applied the role matrix, parsed the input
 * with `commandSchemas.set_wedding_profile`, locked the `weddings` row (update) and checked
 * the receipt. It writes the activity entry, the version bump (and `draft_version` when
 * `bumps_draft_version` is set) and the receipt from what this handler returns.
 *
 * On create the result carries the new `wedding_id` and the owner's `member_id`, so the
 * dispatcher can bump the new row, attribute the entry and run the setup-saved hook.
 */

// ---------------------------------------------------------------------------
// Pure parts (unit-tested in wedding-profile.test.ts)
// ---------------------------------------------------------------------------

/** The profile fields this command writes, in summary order. */
export const PROFILE_FIELDS = ["bride_name", "groom_name", "wedding_date", "city", "budget_inr", "expected_guests"] as const;
export type ProfileField = (typeof PROFILE_FIELDS)[number];

/** P2: the profile fields guests see. Changing one bumps `draft_version` (P1). */
export const GUEST_VISIBLE_PROFILE_FIELDS: readonly ProfileField[] = ["bride_name", "groom_name", "wedding_date", "city"];

/** The stored profile, as the update path reads it (`budget_inr` is `budgets.total_inr`). */
export type WeddingProfileValues = {
  bride_name: string;
  groom_name: string;
  wedding_date: IsoDate;
  city: string | null;
  budget_inr: number;
  expected_guests: number | null;
};

/** The profile fields an input may carry (`setup_opened_at` is create-only and never diffed). */
export type WeddingProfileInput = {
  bride_name?: string;
  groom_name?: string;
  wedding_date?: IsoDate;
  city?: string;
  budget_inr?: number;
  expected_guests?: number;
};

export type ProfileChange = { field: ProfileField; from: string | number | null; to: string | number };

/** The given fields whose value differs from the stored one, in `PROFILE_FIELDS` order. */
export function diffWeddingProfile(current: WeddingProfileValues, input: WeddingProfileInput): ProfileChange[] {
  const changes: ProfileChange[] = [];
  for (const field of PROFILE_FIELDS) {
    const next = input[field];
    if (next === undefined) continue;
    const previous = current[field];
    if (previous === next) continue;
    changes.push({ field, from: previous, to: next });
  }
  return changes;
}

/** Whether any change touches a guest-visible field (P1, P2). */
export function bumpsDraftVersion(changes: readonly ProfileChange[]): boolean {
  return changes.some((change) => GUEST_VISIBLE_PROFILE_FIELDS.includes(change.field));
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A calendar date as activity text shows it: 2026-12-14 → "Mon 14 Dec 2026" (IST date, no shift). */
export function formatWeddingDate(value: IsoDate): string {
  const [year, month, day] = value.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return `${WEEKDAYS[weekday]} ${day} ${MONTHS[month - 1]} ${year}`;
}

const FIELD_LABELS: Record<ProfileField, { en: string; hi: string }> = {
  bride_name: { en: "bride", hi: "दुल्हन" },
  groom_name: { en: "groom", hi: "दूल्हा" },
  wedding_date: { en: "date", hi: "तारीख" },
  city: { en: "city", hi: "शहर" },
  budget_inr: { en: "budget", hi: "बजट" },
  expected_guests: { en: "expected guests", hi: "अनुमानित मेहमान" },
};

/** One field's value as activity text shows it: money per M7, dates as "Mon 14 Dec 2026". */
export function formatProfileValue(field: ProfileField, value: string | number): string {
  if (field === "budget_inr") return formatInr(Number(value));
  if (field === "expected_guests") return groupIndian(Number(value));
  if (field === "wedding_date") return formatWeddingDate(String(value));
  return String(value);
}

/** `{changes}`: "city Bengaluru to Mysuru, budget ₹12,00,000 to ₹15,00,000" (en) / "शहर Bengaluru से Mysuru" (hi). */
export function describeProfileChanges(changes: readonly ProfileChange[], language: "en" | "hi"): string {
  return changes
    .map((change) => {
      const label = FIELD_LABELS[change.field][language];
      const to = formatProfileValue(change.field, change.to);
      if (change.from === null) return language === "en" ? `${label} set to ${to}` : `${label} ${to}`;
      const from = formatProfileValue(change.field, change.from);
      return language === "en" ? `${label} ${from} to ${to}` : `${label} ${from} से ${to}`;
    })
    .join(", ");
}

/** The create's activity values: the required three plus whichever optional fields were given. */
export type CreatedProfile = {
  bride_name: string;
  groom_name: string;
  wedding_date: IsoDate;
  city?: string;
  budget_inr?: number;
  expected_guests?: number;
};

/**
 * The create's entry (3.1): `wedding.created`. Visibility is `owners` when a budget was
 * given, because `after` then carries `budget_inr` (L5a item 1); otherwise `members`.
 */
export function createdActivity(args: { actor_label: string; wedding_id: WeddingId; profile: CreatedProfile }): ActivityEntryDraft {
  const { actor_label, wedding_id, profile } = args;
  const date = formatWeddingDate(profile.wedding_date);
  const place = profile.city ? `, ${profile.city}` : "";
  const after: JsonObject = {};
  for (const field of PROFILE_FIELDS) {
    const value = profile[field];
    if (value !== undefined) after[field] = value;
  }
  return {
    topic: "wedding.created",
    entity_type: "wedding",
    entity_id: wedding_id,
    summary_en: `${actor_label} created the wedding of ${profile.bride_name} and ${profile.groom_name}, ${date}${place}.`,
    summary_hi: `${actor_label} ने ${profile.bride_name} और ${profile.groom_name} की शादी जोड़ी: ${date}${place}।`,
    before: null,
    after,
    visibility: profile.budget_inr !== undefined ? "owners" : "members",
    actor_label,
  };
}

/**
 * The update's entry (3.1). A budget-only change is `budget.updated` on the `budget` entity;
 * anything else is `wedding.updated`, `owners` when the budget is among the changes (L5a).
 * `before` and `after` carry the changed fields only (L2).
 */
export function updatedActivity(args: {
  actor_label: string;
  wedding_id: WeddingId;
  changes: readonly ProfileChange[];
}): ActivityEntryDraft {
  const { actor_label, wedding_id, changes } = args;
  const before: JsonObject = {};
  const after: JsonObject = {};
  for (const change of changes) {
    before[change.field] = change.from as JsonValue;
    after[change.field] = change.to;
  }
  const budgetChange = changes.find((change) => change.field === "budget_inr");
  if (budgetChange && changes.length === 1) {
    const from = formatInr(Number(budgetChange.from ?? 0));
    const to = formatInr(Number(budgetChange.to));
    return {
      topic: "budget.updated",
      entity_type: "budget",
      entity_id: wedding_id,
      summary_en: `${actor_label} changed the budget from ${from} to ${to}.`,
      summary_hi: `${actor_label} ने बजट ${from} से बदलकर ${to} किया।`,
      before,
      after,
      visibility: "owners",
    };
  }
  return {
    topic: "wedding.updated",
    entity_type: "wedding",
    entity_id: wedding_id,
    summary_en: `${actor_label} changed the wedding details: ${describeProfileChanges(changes, "en")}.`,
    summary_hi: `${actor_label} ने शादी की जानकारी बदली: ${describeProfileChanges(changes, "hi")}।`,
    before,
    after,
    visibility: budgetChange ? "owners" : "members",
  };
}

/** The owner's `members.display_name` on create: the actor's name, else the email's local part. */
export function ownerDisplayName(actor: Pick<SessionActor, "display_name" | "email">): string {
  const name = actor.display_name?.trim() || actor.email.split("@")[0]?.trim() || "Owner";
  return name.slice(0, 60);
}

/**
 * Validates the create form: names and a full date. A missing date is `year_required` (V5,
 * AT-1.4), and it wins over a missing name, so a draft with neither (S-01) still names the date.
 */
export function parseCreateInput(input: unknown): CreatedProfile & { setup_opened_at?: string } {
  const parsed = setWeddingProfileCreateSchema.safeParse(input);
  if (parsed.success) return parsed.data;
  const issues = parsed.error.issues;
  const issue = issues.find((candidate) => candidate.path[0] === "wedding_date") ?? issues[0];
  const field = issue && issue.path.length > 0 ? issue.path.map(String).join(".") : null;
  let message = issue ? validationMessageFor(issue) : "unknown_value";
  if (field === "wedding_date" && message === "required") message = "year_required";
  throw new CommandFailure({ code: "validation_failed", message, field });
}

function profileInputOf(input: Record<string, unknown>): WeddingProfileInput {
  const picked: Record<string, unknown> = {};
  for (const field of PROFILE_FIELDS) {
    if (input[field] !== undefined) picked[field] = input[field];
  }
  return picked as WeddingProfileInput;
}

// ---------------------------------------------------------------------------
// The handler
// ---------------------------------------------------------------------------

type Context = CommandHandlerContext<"set_wedding_profile", Tx>;
type Result = CommandHandlerResult<"set_wedding_profile">;

function sessionActorOf(context: Context): SessionActor {
  const actor = context.actor;
  if (actor.kind === "guest" || actor.kind === "system") {
    throw new CommandFailure({ code: "forbidden", message: "Not allowed." });
  }
  return actor;
}

async function createWedding(context: Context, actor: SessionActor): Promise<Result> {
  const profile = parseCreateInput(context.input);
  const { tx } = context;
  const now = new Date(context.now);

  const [wedding] = await tx
    .insert(weddings)
    .values({
      bride_name: profile.bride_name,
      groom_name: profile.groom_name,
      wedding_date: profile.wedding_date,
      city: profile.city ?? null,
      expected_guests: profile.expected_guests ?? null,
      created_by_user_id: actor.user_id,
      created_at: now,
      updated_at: now,
    })
    .returning({ id: weddings.id });
  const wedding_id = wedding.id;

  const display_name = ownerDisplayName(actor);
  const [member] = await tx
    .insert(members)
    .values({
      wedding_id,
      user_id: actor.user_id,
      role: "owner",
      display_name,
      preferred_language: actor.preferred_language,
      created_at: now,
      updated_at: now,
    })
    .returning({ id: members.id });

  await tx.insert(budgets).values({ wedding_id, total_inr: profile.budget_inr ?? 0, created_at: now, updated_at: now });
  // Theme, typeface, layout, frame and heading take their column defaults (5.1).
  await tx.insert(inviteStyles).values({ wedding_id, updated_by_member_id: member.id, created_at: now, updated_at: now });

  const { setup_opened_at: _opened, ...created } = profile;
  void _opened;
  return {
    outcome: "applied",
    result: { wedding_id, member_id: member.id, created: true },
    activity: createdActivity({ actor_label: display_name, wedding_id, profile: created }),
    bumps_draft_version: false,
  };
}

async function updateWedding(context: Context, actor: SessionActor, wedding_id: WeddingId): Promise<Result> {
  const { tx } = context;
  const [row] = await tx
    .select({
      bride_name: weddings.bride_name,
      groom_name: weddings.groom_name,
      wedding_date: weddings.wedding_date,
      city: weddings.city,
      expected_guests: weddings.expected_guests,
      budget_inr: budgets.total_inr,
    })
    .from(weddings)
    .leftJoin(budgets, eq(budgets.wedding_id, weddings.id))
    .where(eq(weddings.id, wedding_id))
    .limit(1);
  if (!row) throw new CommandFailure({ code: "not_found", message: "Wedding not found." });

  const current: WeddingProfileValues = { ...row, budget_inr: row.budget_inr ?? 0 };
  const changes = diffWeddingProfile(current, profileInputOf(context.input as Record<string, unknown>));
  if (changes.length === 0) {
    return { outcome: "unchanged", result: { wedding_id, created: false, changed_fields: [] }, activity: null };
  }

  const now = new Date(context.now);
  const patch: Partial<typeof weddings.$inferInsert> = {};
  let budgetTotal: number | null = null;
  for (const change of changes) {
    if (change.field === "budget_inr") budgetTotal = Number(change.to);
    else if (change.field === "expected_guests") patch.expected_guests = Number(change.to);
    else patch[change.field] = String(change.to);
  }
  if (Object.keys(patch).length > 0) {
    await tx
      .update(weddings)
      .set({ ...patch, updated_at: now })
      .where(eq(weddings.id, wedding_id));
  }
  if (budgetTotal !== null) {
    await tx
      .insert(budgets)
      .values({ wedding_id, total_inr: budgetTotal, created_at: now, updated_at: now })
      .onConflictDoUpdate({ target: budgets.wedding_id, set: { total_inr: budgetTotal, updated_at: now } });
  }

  return {
    outcome: "applied",
    result: { wedding_id, created: false, changed_fields: changes.map((change) => change.field) },
    activity: updatedActivity({ actor_label: actor.display_name, wedding_id, changes }),
    bumps_draft_version: bumpsDraftVersion(changes),
  };
}

/** The typed handler (tests call it directly); the registry takes `weddingProfileHandlers`. */
export const setWeddingProfileHandler: CommandHandler<"set_wedding_profile", Tx> = async (context) => {
  const actor = sessionActorOf(context);
  if (!context.wedding_id) return createWedding(context, actor);
  // A3: the update is owner-only. The guard has checked already; this is defence in depth.
  if (actor.role !== "owner" || actor.wedding_id !== context.wedding_id) {
    throw new CommandFailure({ code: "forbidden", message: "Not allowed for your role." });
  }
  return updateWedding(context, actor, context.wedding_id);
};

/** Lane A's handlers for 3.1's profile command, for the registry in `src/server/commands/`. */
export const weddingProfileHandlers: HandlerMap = {
  set_wedding_profile: setWeddingProfileHandler,
};
