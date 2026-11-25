import "server-only";

/**
 * `proposals` (domain-and-data 4.10; A4–A7): the proposals with their summaries and the
 * "if approved" deltas. Owners see every proposal; a manager sees only their own (A7), even
 * though money entries in the activity feed are owners-only. A pending proposal is never in
 * any total (A5); its deltas are only what the screen shows beside it.
 */
import { and, asc, eq } from "drizzle-orm";

import { CommandFailure } from "@/contracts/commands";
import { PROPOSAL_STATUSES, type ProposalStatus, type SessionActor, type WeddingId } from "@/contracts/domain";
import type { Proposals, ProposalView, ReadModelParams } from "@/contracts/read-models";
import type { DbOrTx } from "@/db/client";
import { toIstInstant } from "@/db/ist";
import { proposals } from "@/db/schema";

import { loadLedgerReader, memberLabels, safeInt } from "./ledger-math";

function isProposalStatus(value: unknown): value is ProposalStatus {
  return typeof value === "string" && (PROPOSAL_STATUSES as readonly string[]).includes(value);
}

export async function buildProposals(
  db: DbOrTx,
  actor: SessionActor,
  wedding_id: WeddingId,
  params: ReadModelParams<"proposals"> = {},
): Promise<Proposals> {
  const reader = await loadLedgerReader(db, actor, wedding_id);
  const status = params?.status;
  if (status !== undefined && !isProposalStatus(status)) {
    throw new CommandFailure({ code: "validation_failed", message: "unknown_value", field: "status" });
  }

  const [rows, labels] = await Promise.all([
    db
      .select({
        proposal_id: proposals.id,
        seed_key: proposals.seed_key,
        command: proposals.command,
        summary_en: proposals.summary_en,
        summary_hi: proposals.summary_hi,
        committed_delta_inr: proposals.committed_delta_inr,
        paid_delta_inr: proposals.paid_delta_inr,
        status: proposals.status,
        proposed_by_member_id: proposals.proposed_by_member_id,
        created_at: proposals.created_at,
        decided_by_member_id: proposals.decided_by_member_id,
        decided_at: proposals.decided_at,
        reason: proposals.reason,
        decision_reason: proposals.decision_reason,
      })
      .from(proposals)
      .where(
        and(
          eq(proposals.wedding_id, wedding_id),
          // A7: a manager tracks only their own proposals.
          reader.role === "owner" ? undefined : eq(proposals.proposed_by_member_id, reader.member_id),
          status ? eq(proposals.status, status) : undefined,
        ),
      )
      .orderBy(asc(proposals.created_at), asc(proposals.seed_key), asc(proposals.id)),
    memberLabels(db, wedding_id),
  ]);

  return {
    version: reader.version,
    hidden: [],
    proposals: rows.map(
      (row): ProposalView => ({
        proposal_id: row.proposal_id,
        seed_key: row.seed_key,
        command: row.command,
        summary_en: row.summary_en,
        summary_hi: row.summary_hi,
        committed_delta_inr: safeInt("committed_delta_inr", row.committed_delta_inr),
        paid_delta_inr: safeInt("paid_delta_inr", row.paid_delta_inr),
        status: row.status,
        proposed_by: labels.get(row.proposed_by_member_id) ?? "",
        proposed_at: toIstInstant(row.created_at),
        decided_by: row.decided_by_member_id ? (labels.get(row.decided_by_member_id) ?? null) : null,
        decided_at: row.decided_at ? toIstInstant(row.decided_at) : null,
        reason: row.reason,
        decision_reason: row.decision_reason,
      }),
    ),
  };
}
