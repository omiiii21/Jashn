import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { after } from "next/server";

import {
  COMMAND_OUTCOME_HTTP_STATUS,
  CommandFailure,
  IDEMPOTENCY_REQUIRED,
  commandEnvelopeSchema,
  commandSchemas,
  validationMessageFor,
  type CommandEnvelope,
  type CommandErrorBody,
  type CommandName,
  type CommandOutcome,
  type CommandResponse,
  type CommandSuccess,
  type GatedCommand,
  type ParsedCommandInput,
} from "@/contracts/commands";
import type {
  ActivityVisibility,
  CommandActor,
  CommandSource,
  JsonObject,
  MemberRole,
  SessionActor,
  SharingSettings,
  WeddingId,
} from "@/contracts/domain";
import type { SetupSavedHook, VoiceGate } from "@/contracts/flags";
import type { AfterCommitMap, CommandHandlerResult, HandlerMap } from "@/contracts/services";
import { getDb, type Db, type DbOrTx, type Tx } from "@/db/client";
import { invitationLinks, members, voiceTurns, weddings } from "@/db/schema";
import { appendActivityEntry, defaultSourceFor } from "@/server/activity/append";
import { checkCommandActor, checkMemberInput } from "@/server/authz/guard";
import { onSetupSaved, voiceGate } from "@/server/flags";
import { afterCommitMap } from "@/server/jobs/after-commit";
import { bumpDraftVersion, bumpVersionIn } from "@/server/live/version";

import { actorKeyOf, matchReceipt, readReceipt, requestHash, writeReceipt, type ReceiptMatch } from "./receipts";
import { getHandlerRegistry } from "./registry";

/**
 * The one command dispatcher (domain 3.0 steps 1–7, architecture 3.3). Every transport
 * calls `runCommand`: `dispatchCommand`, the command route, voice confirm, the guest
 * routes and the ops retry. It never throws for a command error: failures come back as
 * the error envelope, with `httpStatusOf(response)` giving the status.
 *
 * 1. Envelope: command, idempotency key (opaque, 8–200 printable characters, I1), source.
 * 2. Actor and role: the guard applies permissions.ts (401, 403 `forbidden`,
 *    403 `approval_required`).
 * 3. Input: the command's zod schema (422 `validation_failed`), then the input-dependent
 *    member limits.
 * 4. Voice: the turn is the speaker's and still open, then Lane C's voice gate, which
 *    fails closed (423 `voice_writes_paused` with the prefill).
 * 5. Receipt fast path: same request replays; same key, other request is 409.
 * 6. One transaction: lock the `weddings` row first, re-check the member and the receipt,
 *    run the handler (it locks the rows it changes), then for `applied` append the one
 *    activity entry, bump `version` by one (and `draft_version` when the handler says),
 *    and write the receipt. `unchanged` writes only the receipt; failures write nothing.
 * 7. After commit, in `after()`: the command's entry in Lane D's after-commit map and,
 *    for `set_wedding_profile`, Lane C's setup-saved hook. Never failing the command.
 */

// ---------------------------------------------------------------------------
// Dependencies (injectable, so tests run outside a request)
// ---------------------------------------------------------------------------

/** Checks a voice command's turn (V2) and returns what the activity entry may carry. */
export type VoiceTurnCheck = (
  db: DbOrTx,
  actor: SessionActor,
  turn: { voice_turn_id: string; wedding_id: WeddingId | null; now: Date },
) => Promise<{ ok: true; transcript: string | null; members_safe: boolean } | { ok: false; error: CommandErrorBody }>;

export type DispatcherDeps = {
  db: () => Db;
  registry: () => HandlerMap;
  afterCommit: AfterCommitMap;
  voiceGate: VoiceGate;
  onSetupSaved: SetupSavedHook;
  voiceTurnCheck: VoiceTurnCheck;
  /** Runs work after the response; `after()` from next/server in a request. */
  schedule: (task: () => Promise<void>) => void;
  now: () => Date;
  /** Never receives secrets: command names, codes and error names only. */
  log: (message: string, detail?: Record<string, string | number | boolean | null>) => void;
};

function scheduleAfter(task: () => Promise<void>): void {
  try {
    after(task);
  } catch {
    // Outside a request scope (a script or a test): run it detached instead.
    void task();
  }
}

const defaultLog: DispatcherDeps["log"] = (message, detail) => {
  console.error(`[dispatcher] ${message}`, detail ?? {});
};

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

type Failure = { ok: false; error: CommandErrorBody };

function fail(error: CommandErrorBody): Failure {
  return { ok: false, error: { ...error, field: error.field ?? null } };
}

const VOICE_PAUSED_MESSAGE = "Voice changes are paused right now. You can type it and save.";

/**
 * Zod 4 leaves `input` out of its issues unless asked, and `validationMessageFor` needs it to
 * tell a missing field (`required`) from a wrong type (`unknown_value`). Inputs are never
 * returned or logged: only the message word is.
 */
const PARSE_OPTIONS = { reportInput: true } as const;

/** The `validation_failed` word for a zod issue; a string where a number belongs is `not_integer` (AT-5.6). */
function issueMessage(issue: { code: string; message: string; input?: unknown; expected?: unknown }): string {
  if (
    issue.code === "invalid_type" &&
    issue.expected === "number" &&
    (typeof issue.input === "string" || typeof issue.input === "number")
  ) {
    return "not_integer";
  }
  return validationMessageFor(issue);
}

function validationFailure(issues: readonly { code: string; message: string; path: PropertyKey[]; input?: unknown }[], prefix?: string): Failure {
  const issue = issues[0];
  const path = issue && issue.path.length > 0 ? issue.path.map(String).join(".") : null;
  const field = prefix ? (path ? `${prefix}.${path}` : prefix) : path;
  return fail({ code: "validation_failed", message: issue ? issueMessage(issue) : "unknown_value", field });
}

/**
 * What the log may say about an error: its name and Postgres code; the message only outside
 * production (a driver message can quote a value, and production logs keep no data).
 */
function describeError(error: unknown): Record<string, string | null> {
  const name = error instanceof Error ? error.name : "unknown";
  const code = (error as { code?: unknown; cause?: { code?: unknown } } | null)?.code ?? (error as { cause?: { code?: unknown } } | null)?.cause?.code;
  const detail: Record<string, string | null> = { error: name, pg_code: typeof code === "string" ? code : null };
  if (process.env.NODE_ENV !== "production" && error instanceof Error) {
    const cause = (error as { cause?: unknown }).cause;
    detail.message = (cause instanceof Error ? cause.message : error.message).slice(0, 300);
  }
  return detail;
}

function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current; depth += 1) {
    if ((current as { code?: unknown }).code === "23505") return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/** Sources a member may send (forms, voice); guests and the ops token have their own. */
const MEMBER_SOURCES: readonly CommandSource[] = ["ui", "voice"];

function sourceFor(actor: CommandActor, requested: CommandSource): CommandSource | null {
  if (actor.kind === "guest") return "guest_link";
  if (actor.kind === "system") return requested === "nudgebee" || requested === "system" ? requested : defaultSourceFor(actor);
  return MEMBER_SOURCES.includes(requested) ? requested : null;
}

function readSharing(row: {
  managers_can_see_vendor_dues: boolean;
  managers_can_see_budget: boolean;
  managers_can_see_guest_contacts: boolean;
}): SharingSettings {
  return {
    managers_can_see_vendor_dues: row.managers_can_see_vendor_dues,
    managers_can_see_budget: row.managers_can_see_budget,
    managers_can_see_guest_contacts: row.managers_can_see_guest_contacts,
  };
}

const weddingColumns = {
  id: weddings.id,
  version: weddings.version,
  managers_can_see_vendor_dues: weddings.managers_can_see_vendor_dues,
  managers_can_see_budget: weddings.managers_can_see_budget,
  managers_can_see_guest_contacts: weddings.managers_can_see_guest_contacts,
};

// ---------------------------------------------------------------------------
// Voice turns (step 4, V2) and spoken text on activity (L5a item 2)
// ---------------------------------------------------------------------------

/** Commands whose entries are always `members` and never carry money or contacts. */
const MEMBERS_SAFE_COMMANDS = new Set<string>([
  "set_wedding_profile",
  "create_event",
  "update_event",
  "update_invite_style",
  "add_vendor",
  "update_vendor",
  "add_requirement",
  "add_guest",
  "set_rsvp",
  "set_dietary",
  "publish_itinerary",
  "request_card_export",
]);

/**
 * Whether every action of a voice turn writes a `members` entry with nothing private in it
 * (L5a item 2). `voice_turns.actions` holds voice.md 2.2's objects: `kind` (the command
 * name) with the kind's fields flat; `{command, input}` is accepted too.
 */
export function voiceActionsMembersSafe(actions: unknown): boolean {
  if (!Array.isArray(actions) || actions.length === 0) return false;
  return actions.every((action) => {
    if (!action || typeof action !== "object" || Array.isArray(action)) return false;
    const record = action as Record<string, unknown>;
    const command = typeof record.command === "string" ? record.command : record.kind;
    const nested = record.input;
    const input = (nested && typeof nested === "object" && !Array.isArray(nested) ? nested : record) as Record<string, unknown>;
    if (typeof command !== "string" || !MEMBERS_SAFE_COMMANDS.has(command)) return false;
    if (command === "set_wedding_profile" && input.budget_inr !== undefined) return false;
    if (command === "add_guest" && (input.phone !== undefined || input.email !== undefined)) return false;
    if ((command === "add_vendor" || command === "update_vendor") && input.contact_phone !== undefined) return false;
    return true;
  });
}

/** voice.md 1.13 check 4: only `proposed`, `confirmed` and `partially_saved` turns can run. */
const CLOSED_TURN_STATUSES = new Set(["cancelled", "superseded", "answered", "paused", "failed", "expired"]);

/** The default V2 check: the turn is this user's, on this wedding, and still open. */
export const defaultVoiceTurnCheck: VoiceTurnCheck = async (db, actor, turn) => {
  const rows = await db
    .select({
      user_id: voiceTurns.user_id,
      wedding_id: voiceTurns.wedding_id,
      status: voiceTurns.status,
      expires_at: voiceTurns.expires_at,
      confirmed_at: voiceTurns.confirmed_at,
      transcript: voiceTurns.transcript,
      actions: voiceTurns.actions,
    })
    .from(voiceTurns)
    .where(eq(voiceTurns.id, turn.voice_turn_id))
    .limit(1);
  const row = rows[0];
  if (!row || row.user_id !== actor.user_id || (row.wedding_id ?? null) !== (turn.wedding_id ?? null)) {
    return { ok: false, error: { code: "forbidden", message: "This request isn't yours.", field: "voice_turn_id" } };
  }
  const open = row.confirmed_at !== null || row.expires_at.getTime() > turn.now.getTime();
  if (!open || CLOSED_TURN_STATUSES.has(row.status)) {
    return { ok: false, error: { code: "voice_turn_expired", message: "This request is closed.", field: "voice_turn_id" } };
  }
  return { ok: true, transcript: row.transcript, members_safe: voiceActionsMembersSafe(row.actions) };
};

function spokenTextFor(visibility: ActivityVisibility, voice: { transcript: string | null; members_safe: boolean } | null): string | null {
  if (!voice?.transcript) return null;
  if (visibility === "owners") return voice.transcript;
  return voice.members_safe ? voice.transcript : null;
}

// ---------------------------------------------------------------------------
// Cross-wedding references (5.0, AT-9.7)
// ---------------------------------------------------------------------------

type WeddingScopedTable = PgTable & { id: PgColumn; wedding_id: PgColumn; deleted_at?: PgColumn };

/**
 * Every id a command references must belong to the command's wedding (domain 5.0, 3.0
 * step 3). An id from another wedding, an unknown id and a soft-deleted row all answer
 * 404 `not_found`, so a foreign id reveals nothing. Handlers call it inside the transaction.
 */
export async function assertSameWedding(
  tx: DbOrTx,
  table: WeddingScopedTable,
  id: string,
  wedding_id: WeddingId,
  field: string | null = null,
): Promise<void> {
  const conditions = [eq(table.id, id), eq(table.wedding_id, wedding_id)];
  if (table.deleted_at) conditions.push(isNull(table.deleted_at));
  const rows = await tx
    .select({ id: table.id })
    .from(table as PgTable)
    .where(and(...conditions))
    .limit(1);
  if (rows.length === 0) throw new CommandFailure({ code: "not_found", message: "Not found.", field });
}

// ---------------------------------------------------------------------------
// The dispatcher
// ---------------------------------------------------------------------------

type Committed = { kind: "committed"; response: CommandSuccess; wedding_id: WeddingId | null; actor: CommandActor };
type TxOutcome = Committed | { kind: "receipt"; match: ReceiptMatch };

function fromMatch<C extends CommandName>(match: ReceiptMatch): CommandResponse<C> {
  if (match.kind === "replay") return match.response as CommandResponse<C>;
  return fail({
    code: "idempotency_key_reused",
    message: "This key was already used for a different request.",
    field: "idempotency_key",
  }) as CommandResponse<C>;
}

export function createDispatcher(overrides: Partial<DispatcherDeps> = {}) {
  const deps: DispatcherDeps = {
    db: getDb,
    registry: getHandlerRegistry,
    afterCommit: afterCommitMap,
    voiceGate,
    onSetupSaved,
    voiceTurnCheck: defaultVoiceTurnCheck,
    schedule: scheduleAfter,
    now: () => new Date(),
    log: defaultLog,
    ...overrides,
  };

  async function run<C extends CommandName>(actor: CommandActor, rawEnvelope: CommandEnvelope<C>): Promise<CommandResponse<C>> {
    const failWith = (error: CommandErrorBody) => fail(error) as CommandResponse<C>;

    // 1. The envelope.
    const envelopeParse = commandEnvelopeSchema.safeParse(rawEnvelope, PARSE_OPTIONS);
    if (!envelopeParse.success) return validationFailure(envelopeParse.error.issues) as CommandResponse<C>;
    const envelope = envelopeParse.data;
    const command = envelope.command as C;
    const wedding_id = envelope.wedding_id ?? null;
    const idempotency_key = envelope.idempotency_key ?? null;
    const isCreate = command === "set_wedding_profile" && !wedding_id;
    const keyRequired = (IDEMPOTENCY_REQUIRED as readonly string[]).includes(command) && (command !== "set_wedding_profile" || isCreate);
    if (keyRequired && !idempotency_key) return failWith({ code: "validation_failed", message: "required", field: "idempotency_key" });
    if (!wedding_id && !isCreate && command !== "accept_member_invite") {
      return failWith({ code: "validation_failed", message: "required", field: "wedding_id" });
    }
    const source = sourceFor(actor, envelope.source);
    if (!source) return failWith({ code: "validation_failed", message: "unknown_value", field: "source" });
    const voice_turn_id = source === "voice" ? (envelope.voice_turn_id ?? null) : null;
    if (source === "voice" && !voice_turn_id) return failWith({ code: "validation_failed", message: "required", field: "voice_turn_id" });

    const db = deps.db();

    // 2. Actor and role. The wedding's sharing flags decide the vendor-dues cases.
    let sharing: SharingSettings | null = null;
    if (wedding_id) {
      const rows = await db.select(weddingColumns).from(weddings).where(eq(weddings.id, wedding_id)).limit(1);
      if (!rows[0]) {
        return failWith(actor.kind === "member" || actor.kind === undefined
          ? { code: "forbidden", message: "You are not a member of this wedding." }
          : { code: "not_found", message: "Not found." });
      }
      sharing = readSharing(rows[0]);
    }
    const actorError = checkCommandActor(actor, command, { wedding_id, sharing });
    if (actorError) return failWith(actorError);

    // 3. The input.
    const schema = commandSchemas[command];
    const parsed = schema.safeParse(envelope.input, PARSE_OPTIONS);
    if (!parsed.success) return validationFailure(parsed.error.issues) as CommandResponse<C>;
    let input = parsed.data as ParsedCommandInput<C>;
    if (command === "propose_change") {
      // The proposed command's input is validated exactly like a direct one (3.0 step 3, 3.5);
      // `field` names the inner field, as the money form shows it.
      const proposal = parsed.data as { command: GatedCommand; input: Record<string, unknown>; reason?: string };
      const inner = commandSchemas[proposal.command].safeParse(proposal.input, PARSE_OPTIONS);
      if (!inner.success) return validationFailure(inner.error.issues) as CommandResponse<C>;
      input = { ...proposal, input: inner.data } as ParsedCommandInput<C>;
    }
    const role: MemberRole | null = actor.kind === "guest" || actor.kind === "system" ? null : actor.role;
    const inputError = checkMemberInput(command, input, role, sharing);
    if (inputError) return failWith(inputError);

    const handler = deps.registry()[command];
    if (!handler) {
      deps.log("no handler", { command });
      return failWith({ code: "internal_error", message: "This change isn't available yet." });
    }

    // 4. Voice: the speaker's open turn, then the kill switch (fails closed).
    let voice: { transcript: string | null; members_safe: boolean } | null = null;
    if (source === "voice") {
      if (actor.kind === "guest" || actor.kind === "system") return failWith({ code: "forbidden", message: "Not allowed." });
      const turn = await deps.voiceTurnCheck(db, actor, { voice_turn_id: voice_turn_id!, wedding_id, now: deps.now() });
      if (!turn.ok) return failWith(turn.error);
      voice = { transcript: turn.transcript, members_safe: turn.members_safe };
      let gate: Awaited<ReturnType<VoiceGate>>;
      try {
        gate = await deps.voiceGate(command);
      } catch {
        gate = { status: "paused", cause: "unreadable" };
      }
      if (gate.status !== "enabled") {
        return failWith({
          code: "voice_writes_paused",
          message: VOICE_PAUSED_MESSAGE,
          prefill: [{ command, input: envelope.input as JsonObject, labels: {} }],
        });
      }
    }

    // 5. The receipt, as a fast path.
    const actor_key = actorKeyOf(actor, wedding_id);
    const request_hash = requestHash(command, wedding_id, input);
    const receiptRequest = { command, actor_key, request_hash, wedding_id };
    if (idempotency_key) {
      const stored = await readReceipt(db, idempotency_key);
      if (stored) return fromMatch<C>(matchReceipt(stored, receiptRequest));
    }

    // 6. One transaction.
    const now = deps.now();
    let outcome: TxOutcome;
    try {
      outcome = await db.transaction(async (tx: Tx): Promise<TxOutcome> => {
        let currentVersion: number | null = null;
        let handlerActor: CommandActor = actor;
        if (wedding_id) {
          const locked = await tx.select(weddingColumns).from(weddings).where(eq(weddings.id, wedding_id)).for("update");
          if (!locked[0]) throw new CommandFailure({ code: "not_found", message: "Not found." });
          currentVersion = Number(locked[0].version);
          // A removed member fails every check (6.2); the role is the row's, under the lock.
          if (actor.kind !== "guest" && actor.kind !== "system" && actor.member_id) {
            const memberRows = await tx
              .select({ role: members.role, display_name: members.display_name, removed_at: members.removed_at })
              .from(members)
              .where(and(eq(members.id, actor.member_id), eq(members.wedding_id, wedding_id), eq(members.user_id, actor.user_id)))
              .limit(1);
            const member = memberRows[0];
            if (!member || member.removed_at) {
              throw new CommandFailure({ code: "forbidden", message: "You are not a member of this wedding." });
            }
            handlerActor = { ...actor, role: member.role };
            const lockedSharing = readSharing(locked[0]);
            const recheck =
              checkCommandActor(handlerActor, command, { wedding_id, sharing: lockedSharing }) ??
              checkMemberInput(command, input, member.role, lockedSharing);
            if (recheck) throw new CommandFailure(recheck);
          } else if (actor.kind === "guest") {
            // A link revoked or rotated while this request waited on the lock now fails like an
            // unknown token, with the same 404 body (G5, 6.3).
            const linkRows = await tx
              .select({ id: invitationLinks.id })
              .from(invitationLinks)
              .where(
                and(
                  eq(invitationLinks.wedding_id, wedding_id),
                  eq(invitationLinks.household_id, actor.household_id),
                  eq(invitationLinks.token_hash, Buffer.from(actor.token_hash, "hex")),
                  isNull(invitationLinks.revoked_at),
                ),
              )
              .limit(1);
            if (!linkRows[0]) throw new CommandFailure({ code: "not_found", message: "Not found." });
          }
        } else if (idempotency_key) {
          // No wedding row to lock yet: same-key creates queue on the key instead.
          await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${idempotency_key}, 0))`);
        }

        if (idempotency_key) {
          const stored = await readReceipt(tx, idempotency_key);
          if (stored) return { kind: "receipt", match: matchReceipt(stored, receiptRequest) };
        }

        const handled = (await handler({
          command,
          actor: handlerActor,
          wedding_id,
          input,
          envelope: rawEnvelope as CommandEnvelope,
          tx,
          now: now.toISOString(),
        })) as CommandHandlerResult<C>;

        const handledOutcome = handled.outcome ?? "applied";
        const resultWedding = (handled.result as { wedding_id?: unknown } | null)?.wedding_id;
        const effectiveWedding = wedding_id ?? (typeof resultWedding === "string" ? resultWedding : null);
        let activity_entry_id: string | null = null;
        let version = currentVersion ?? 0;

        if (handledOutcome === "applied") {
          if (!effectiveWedding) throw new Error("applied command without a wedding");
          if (handled.activity) {
            // The create and `accept_member_invite` run before the user has this membership:
            // the entry names the member row the handler just made (L2).
            const resultFields = (handled.result ?? {}) as { member_id?: unknown; role?: unknown };
            const resultRole: MemberRole | null =
              resultFields.role === "owner" || resultFields.role === "manager" ? resultFields.role : null;
            const entryActor: CommandActor =
              !wedding_id && handlerActor.kind !== "guest" && handlerActor.kind !== "system" && typeof resultFields.member_id === "string"
                ? {
                    ...handlerActor,
                    wedding_id: effectiveWedding,
                    member_id: resultFields.member_id,
                    role: isCreate ? "owner" : (resultRole ?? handlerActor.role),
                  }
                : handlerActor;
            activity_entry_id = await appendActivityEntry(tx, {
              ...handled.activity,
              wedding_id: effectiveWedding,
              actor: entryActor,
              command,
              occurred_at: now.toISOString(),
              source,
              voice_turn_id,
              spoken_text: spokenTextFor(handled.activity.visibility, voice),
              idempotency_key,
            });
          } else if (command !== "reset_demo") {
            deps.log("applied without an activity entry", { command });
          }
          version = await bumpVersionIn(tx, effectiveWedding);
          if (handled.bumps_draft_version) await bumpDraftVersion(tx, effectiveWedding);
        }

        const finalOutcome: CommandOutcome = command === "propose_change" && handledOutcome === "applied" ? "proposed" : handledOutcome;
        const proposal_id = (handled.result as { proposal_id?: unknown } | null)?.proposal_id;
        const response = {
          ok: true as const,
          outcome: finalOutcome,
          command,
          result: handled.result,
          activity_entry_id,
          version,
          warnings: handled.warnings ?? [],
          ...(finalOutcome === "proposed" && typeof proposal_id === "string" ? { proposal_id } : {}),
        } as CommandSuccess;

        if (idempotency_key) {
          await writeReceipt(tx, {
            idempotency_key,
            command,
            wedding_id: effectiveWedding,
            actor_key,
            request_hash,
            outcome: finalOutcome,
            http_status: COMMAND_OUTCOME_HTTP_STATUS[finalOutcome],
            response,
            created_at: now,
          });
        }
        return { kind: "committed", response, wedding_id: effectiveWedding, actor: handlerActor };
      });
    } catch (error) {
      if (error instanceof CommandFailure) return failWith(error.body);
      // A same-key twin committed first (the create race): its receipt answers.
      if (idempotency_key && isUniqueViolation(error)) {
        const stored = await readReceipt(db, idempotency_key).catch(() => null);
        if (stored) return fromMatch<C>(matchReceipt(stored, receiptRequest));
      }
      deps.log("command failed", { command, ...describeError(error) });
      return failWith({ code: "internal_error", message: "Something went wrong. Nothing was saved." });
    }

    if (outcome.kind === "receipt") return fromMatch<C>(outcome.match);

    // 7. After commit: never failing the command.
    const committed = outcome;
    const response = committed.response as CommandSuccess<C>;
    if (response.outcome === "applied" || response.outcome === "proposed") {
      deps.schedule(async () => {
        const afterHandler = deps.afterCommit[command];
        if (afterHandler) {
          try {
            await afterHandler({
              command,
              actor: committed.actor,
              wedding_id: committed.wedding_id,
              envelope: rawEnvelope as CommandEnvelope,
              response: response as CommandSuccess,
            });
          } catch (error) {
            deps.log("after-commit handler failed", { command, ...describeError(error) });
          }
        }
        const hookActor = committed.actor;
        if (command === "set_wedding_profile" && hookActor.kind !== "guest" && hookActor.kind !== "system") {
          try {
            const opened = (input as { setup_opened_at?: unknown }).setup_opened_at;
            await deps.onSetupSaved({
              actor: hookActor,
              outcome: response.outcome,
              is_create: isCreate,
              wedding_id: isCreate ? committed.wedding_id : null,
              setup_opened_at: typeof opened === "string" ? opened : null,
              committed_at: now.toISOString(),
            });
          } catch (error) {
            deps.log("setup-saved hook failed", { command, ...describeError(error) });
          }
        }
      });
    }
    return response as CommandResponse<C>;
  }

  return {
    /** Runs one command; never throws for a command error. */
    async runCommand<C extends CommandName>(actor: CommandActor, envelope: CommandEnvelope<C>): Promise<CommandResponse<C>> {
      try {
        return await run(actor, envelope);
      } catch (error) {
        deps.log("dispatcher error", { command: String((envelope as { command?: unknown })?.command ?? ""), ...describeError(error) });
        return fail({ code: "internal_error", message: "Something went wrong. Nothing was saved." }) as CommandResponse<C>;
      }
    },
  };
}

let defaultDispatcher: ReturnType<typeof createDispatcher> | null = null;

/** The dispatcher every transport calls (`services.dispatch`). */
export function runCommand<C extends CommandName>(actor: CommandActor, envelope: CommandEnvelope<C>): Promise<CommandResponse<C>> {
  defaultDispatcher ??= createDispatcher();
  return defaultDispatcher.runCommand(actor, envelope);
}
