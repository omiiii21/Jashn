import "server-only";

import { and, eq } from "drizzle-orm";

import {
  CommandFailure,
  commandSchemas,
  isGatedCommand,
  validationMessageFor,
  type CommandErrorCode,
  type GatedCommand,
} from "@/contracts/commands";
import type { JsonObject, JsonValue, ProposalStatus } from "@/contracts/domain";
import type { ActivityEntryDraft, CommandHandler, CommandHandlerResult, HandlerMap } from "@/contracts/services";
import type { Tx } from "@/db/client";
import { members, proposals } from "@/db/schema";

import { ledgerContextFor, planGated, type GatedPlan, type LedgerContext, type Text } from "./ledger";

/**
 * The proposal commands (domain-and-data 3.5, rules A1–A7).
 *
 * - `propose_change` (managers): validates the gated command's input exactly as the command
 *   would (types, ids, M3) through the ledger's plan step, without running it; stores the
 *   command, its input, the 3.5 summary, the deltas and, for `record_expense`, the payee
 *   resolved to a vendor id (or "new vendor", null) in `proposals.vendor_id`. Nothing else
 *   changes (A5). The guard has already refused a manager without vendor-dues sharing for
 *   every A1 command except `record_expense` (403 `forbidden`).
 * - `approve_proposal` (owners): locks the proposal, runs the stored command's plan under row
 *   locks as the approving owner, against the stored vendor id, and fails with 409
 *   `proposal_changed` when the payee or any shown value no longer matches; commands with
 *   `expected_version` fail with `stale_version`. The executed command's own entry is the
 *   one activity entry, with `proposal_id` and " Proposed by {proposer}." (A6). Any failure
 *   rolls the whole transaction back, so the proposal stays pending (A4).
 * - `reject_proposal` (owners) and `withdraw_proposal` (the proposer): their own entries.
 */

function failure(code: CommandErrorCode, message: string, field: string | null = null, current?: JsonValue): CommandFailure {
  return new CommandFailure(current === undefined ? { code, message, field } : { code, message, field, current });
}

// ---------------------------------------------------------------------------
// Pure parts (unit-tested in proposals.test.ts)
// ---------------------------------------------------------------------------

/** The value at a zod issue's path in the raw input (zod 4 leaves `issue.input` out by default). */
function valueAt(raw: unknown, path: readonly PropertyKey[]): unknown {
  let value: unknown = raw;
  for (const key of path) {
    if (value === null || typeof value !== "object") return undefined;
    value = (value as Record<PropertyKey, unknown>)[key];
  }
  return value;
}

/** The `validation_failed` word for a zod issue (a string where a number belongs is `not_integer`, AT-5.6). */
function issueMessage(issue: { code: string; message: string; path: PropertyKey[]; expected?: unknown }, raw: unknown): string {
  const input = valueAt(raw, issue.path);
  if (issue.code === "invalid_type" && issue.expected === "number" && input !== undefined) return "not_integer";
  return validationMessageFor({ code: issue.code, message: issue.message, input });
}

/**
 * Parses a proposal's inner input with the gated command's own schema. Fields are named
 * `input.<field>`. Inside a proposal, `record_expense` needs `paid_in_full` with no default.
 */
export function parseProposalInput(command: GatedCommand, input: unknown): unknown {
  const parsed = commandSchemas[command].safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue && issue.path.length > 0 ? issue.path.map(String).join(".") : null;
    throw failure("validation_failed", issue ? issueMessage(issue, input) : "unknown_value", path ? `input.${path}` : "input");
  }
  if (command === "record_expense" && (parsed.data as { paid_in_full?: boolean }).paid_in_full === undefined) {
    throw failure("validation_failed", "required", "input.paid_in_full");
  }
  return parsed.data;
}

/** A plan step's field names, as the proposal's input names them. */
function prefixed(error: unknown): unknown {
  if (!(error instanceof CommandFailure) || !error.body.field || error.body.field.startsWith("input")) return error;
  return new CommandFailure({ ...error.body, field: `input.${error.body.field}` });
}

export function proposedText(actor: string, summary: Text): Text {
  return {
    en: `${actor} proposed ${summary.en}. It needs an owner's approval.`,
    hi: `${actor} ने प्रस्ताव भेजा: ${summary.hi}। मालिक की मंज़ूरी बाकी है।`,
  };
}

export function rejectedText(actor: string, proposer: string, summary: Text): Text {
  return {
    en: `${actor} declined ${proposer}'s proposal: ${summary.en}.`,
    hi: `${actor} ने ${proposer} का प्रस्ताव नामंज़ूर किया: ${summary.hi}।`,
  };
}

export function withdrawnText(actor: string, summary: Text): Text {
  return {
    en: `${actor} withdrew the proposal: ${summary.en}.`,
    hi: `${actor} ने अपना प्रस्ताव वापस लिया: ${summary.hi}।`,
  };
}

/** A6: the executed command's entry, marked with the proposal and its proposer. */
export function approvedEntry(entry: ActivityEntryDraft, proposal_id: string, proposer: string): ActivityEntryDraft {
  return {
    ...entry,
    proposal_id,
    summary_en: `${entry.summary_en} Proposed by ${proposer}.`,
    summary_hi: `${entry.summary_hi} प्रस्ताव: ${proposer}।`,
  };
}

/**
 * What approval checks before it runs (3.5): the stored payee and every value the owner
 * was shown (the summary and both deltas) still match the current state.
 */
export function proposalStillMatches(
  stored: { summary_en: string; vendor_id: string | null; committed_delta_inr: number; paid_delta_inr: number },
  plan: Pick<GatedPlan, "summary" | "vendor_id" | "committed_delta_inr" | "paid_delta_inr" | "unchanged">,
): boolean {
  return (
    !plan.unchanged &&
    plan.summary.en === stored.summary_en &&
    plan.vendor_id === stored.vendor_id &&
    plan.committed_delta_inr === stored.committed_delta_inr &&
    plan.paid_delta_inr === stored.paid_delta_inr
  );
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

type ProposalRow = {
  id: string;
  command: string;
  input: JsonValue;
  summary_en: string;
  summary_hi: string;
  vendor_id: string | null;
  committed_delta_inr: number;
  paid_delta_inr: number;
  status: ProposalStatus;
  proposed_by_member_id: string;
};

/** Locks one proposal of this wedding (after the dispatcher's wedding lock). */
async function lockProposal(lc: LedgerContext, proposal_id: string): Promise<ProposalRow> {
  const rows = await lc.tx
    .select({
      id: proposals.id,
      command: proposals.command,
      input: proposals.input,
      summary_en: proposals.summary_en,
      summary_hi: proposals.summary_hi,
      vendor_id: proposals.vendor_id,
      committed_delta_inr: proposals.committed_delta_inr,
      paid_delta_inr: proposals.paid_delta_inr,
      status: proposals.status,
      proposed_by_member_id: proposals.proposed_by_member_id,
    })
    .from(proposals)
    .where(and(eq(proposals.id, proposal_id), eq(proposals.wedding_id, lc.wedding_id)))
    .limit(1)
    .for("update");
  if (!rows[0]) throw failure("not_found", "Not found.", "proposal_id");
  return rows[0];
}

function assertPending(proposal: ProposalRow): void {
  if (proposal.status !== "pending") {
    throw failure("proposal_not_pending", "This proposal was already decided.", "proposal_id", {
      proposal_id: proposal.id,
      status: proposal.status,
    });
  }
}

async function proposerName(lc: LedgerContext, member_id: string): Promise<string> {
  const rows = await lc.tx
    .select({ display_name: members.display_name })
    .from(members)
    .where(and(eq(members.id, member_id), eq(members.wedding_id, lc.wedding_id)))
    .limit(1);
  return rows[0]?.display_name ?? "a manager";
}

function proposalEntry(args: {
  topic: ActivityEntryDraft["topic"];
  proposal_id: string;
  text: Text;
  before: JsonObject | null;
  after: JsonObject | null;
}): ActivityEntryDraft {
  return {
    topic: args.topic,
    entity_type: "proposal",
    entity_id: args.proposal_id,
    summary_en: args.text.en,
    summary_hi: args.text.hi,
    before: args.before,
    after: args.after,
    // L5: proposals are money entries, for owners; managers track theirs through `proposals` (A7).
    visibility: "owners",
    proposal_id: args.proposal_id,
  };
}

// ---------------------------------------------------------------------------
// The handlers
// ---------------------------------------------------------------------------

export const proposeChangeHandler: CommandHandler<"propose_change", Tx> = async (context): Promise<CommandHandlerResult<"propose_change">> => {
  const lc = await ledgerContextFor(context);
  // Owners run the command directly (3.5); the guard answers this first.
  if (lc.actor.role !== "manager") throw failure("forbidden", "Owners make this change directly.");
  const { command, input, reason } = context.input;
  const inner = parseProposalInput(command, input);

  let plan: GatedPlan;
  try {
    plan = await planGated(lc, command, inner, { lock: false });
  } catch (error) {
    throw prefixed(error);
  }
  // A no-op (C8) would leave nothing for an owner to approve.
  if (plan.unchanged) throw failure("validation_failed", "unknown_value", "input");

  const [row] = await lc.tx
    .insert(proposals)
    .values({
      wedding_id: lc.wedding_id,
      command,
      input: inner as JsonValue,
      reason: reason ?? null,
      summary_en: plan.summary.en,
      summary_hi: plan.summary.hi,
      vendor_id: plan.vendor_id,
      budget_category: plan.budget_category,
      committed_delta_inr: plan.committed_delta_inr,
      paid_delta_inr: plan.paid_delta_inr,
      status: "pending",
      proposed_by_member_id: lc.actor.member_id,
      voice_turn_id: lc.voice_turn_id,
      created_at: lc.now,
      updated_at: lc.now,
    })
    .returning({ id: proposals.id });

  return {
    outcome: "applied",
    result: { proposal_id: row.id },
    activity: proposalEntry({
      topic: "proposal.created",
      proposal_id: row.id,
      text: proposedText(lc.actor.display_name, plan.summary),
      before: null,
      after: {
        command,
        status: "pending",
        vendor_id: plan.vendor_id,
        budget_category: plan.budget_category,
        committed_delta_inr: plan.committed_delta_inr,
        paid_delta_inr: plan.paid_delta_inr,
      },
    }),
    warnings: [],
  };
};

export const approveProposalHandler: CommandHandler<"approve_proposal", Tx> = async (context): Promise<CommandHandlerResult<"approve_proposal">> => {
  const lc = await ledgerContextFor(context);
  if (lc.actor.role !== "owner") throw failure("forbidden", "Not allowed for your role.");
  const proposal = await lockProposal(lc, context.input.proposal_id);
  assertPending(proposal);
  if (!isGatedCommand(proposal.command)) throw failure("proposal_changed", "This proposal can't be run.", "proposal_id");
  const command = proposal.command;

  let inner: unknown;
  try {
    inner = parseProposalInput(command, proposal.input);
  } catch {
    throw failure("proposal_changed", "This proposal no longer matches the ledger. Review it again.", "proposal_id");
  }

  // The stored input, unchanged, as the approving owner; a record_expense against the
  // stored payee. Errors such as stale_version roll everything back (A4).
  const plan = await planGated(lc, command, inner, {
    lock: true,
    expense_vendor: command === "record_expense" ? { vendor_id: proposal.vendor_id } : undefined,
  });
  if (!proposalStillMatches(proposal, plan)) {
    throw failure("proposal_changed", "This proposal no longer matches the ledger. Review it again.", "proposal_id", {
      proposal_id: proposal.id,
      summary_en: plan.summary.en,
      summary_hi: plan.summary.hi,
      committed_delta_inr: plan.committed_delta_inr,
      paid_delta_inr: plan.paid_delta_inr,
    });
  }
  const done = await plan.apply();
  if (done.outcome !== "applied" || !done.activity) {
    throw failure("proposal_changed", "This proposal no longer changes anything.", "proposal_id");
  }

  await lc.tx
    .update(proposals)
    .set({
      status: "approved",
      decided_by_member_id: lc.actor.member_id,
      decided_at: lc.now,
      result_entity_id: done.entity_id,
      updated_at: lc.now,
    })
    .where(eq(proposals.id, proposal.id));

  const proposer = await proposerName(lc, proposal.proposed_by_member_id);
  return {
    outcome: "applied",
    result: { proposal_id: proposal.id, status: "approved", command, result_entity_id: done.entity_id, result: done.result },
    activity: approvedEntry(done.activity, proposal.id, proposer),
    warnings: done.warnings,
  };
};

export const rejectProposalHandler: CommandHandler<"reject_proposal", Tx> = async (context): Promise<CommandHandlerResult<"reject_proposal">> => {
  const lc = await ledgerContextFor(context);
  if (lc.actor.role !== "owner") throw failure("forbidden", "Not allowed for your role.");
  const proposal = await lockProposal(lc, context.input.proposal_id);
  assertPending(proposal);
  const decision_reason = context.input.decision_reason ?? null;
  await lc.tx
    .update(proposals)
    .set({ status: "rejected", decided_by_member_id: lc.actor.member_id, decided_at: lc.now, decision_reason, updated_at: lc.now })
    .where(eq(proposals.id, proposal.id));
  const proposer = await proposerName(lc, proposal.proposed_by_member_id);
  return {
    outcome: "applied",
    result: { proposal_id: proposal.id, status: "rejected" },
    activity: proposalEntry({
      topic: "proposal.rejected",
      proposal_id: proposal.id,
      text: rejectedText(lc.actor.display_name, proposer, { en: proposal.summary_en, hi: proposal.summary_hi }),
      before: { status: "pending" },
      after: { status: "rejected", decision_reason },
    }),
  };
};

export const withdrawProposalHandler: CommandHandler<"withdraw_proposal", Tx> = async (context): Promise<CommandHandlerResult<"withdraw_proposal">> => {
  const lc = await ledgerContextFor(context);
  const proposal = await lockProposal(lc, context.input.proposal_id);
  // Only the manager who proposed it (3.5).
  if (proposal.proposed_by_member_id !== lc.actor.member_id) throw failure("forbidden", "Only the person who proposed this can withdraw it.");
  assertPending(proposal);
  await lc.tx
    .update(proposals)
    .set({ status: "withdrawn", decided_by_member_id: lc.actor.member_id, decided_at: lc.now, updated_at: lc.now })
    .where(eq(proposals.id, proposal.id));
  return {
    outcome: "applied",
    result: { proposal_id: proposal.id, status: "withdrawn" },
    activity: proposalEntry({
      topic: "proposal.withdrawn",
      proposal_id: proposal.id,
      text: withdrawnText(lc.actor.display_name, { en: proposal.summary_en, hi: proposal.summary_hi }),
      before: { status: "pending" },
      after: { status: "withdrawn" },
    }),
  };
};

/** The four proposal handlers (3.5), for the registry. */
export const proposalHandlers: HandlerMap = {
  propose_change: proposeChangeHandler,
  approve_proposal: approveProposalHandler,
  reject_proposal: rejectProposalHandler,
  withdraw_proposal: withdrawProposalHandler,
};
