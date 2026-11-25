/**
 * A money save as the member's role allows it (A1, 3.5): an owner's goes out as the command
 * itself; a manager's gated save goes out as `propose_change { command, input }`, so the
 * ledger never changes before an owner approves. The server still decides.
 */
import type { CommandEnvelope, CommandName } from "@/contracts/commands";
import type { MemberRole, SharingSettings, WeddingId } from "@/contracts/domain";
import { memberCommandDecision } from "@/contracts/permissions";

/** Sharing does not change a gated command's rule, so the decision needs only the role. */
const NO_SHARING: SharingSettings = { managers_can_see_budget: false, managers_can_see_vendor_dues: false, managers_can_see_guest_contacts: false };

export type SaveMode = "direct" | "proposal" | "none";

export function saveModeFor(command: CommandName, role: MemberRole): SaveMode {
  const decision = memberCommandDecision(command, role, NO_SHARING);
  if (decision === "allow") return "direct";
  if (decision === "approval_required") return "proposal";
  return "none";
}

export function moneyEnvelope(
  wedding_id: WeddingId,
  mode: SaveMode,
  command: CommandName,
  input: Record<string, unknown>,
): Omit<CommandEnvelope, "idempotency_key"> {
  if (mode === "proposal") {
    return { wedding_id, command: "propose_change", input: { command, input }, source: "ui" } as Omit<
      CommandEnvelope,
      "idempotency_key"
    >;
  }
  return { wedding_id, command, input, source: "ui" } as Omit<CommandEnvelope, "idempotency_key">;
}

/** The text of a 409's fresh record: "Now ₹45,000, set by Diya." Null when it carries neither. */
export function staleCurrentText(current: unknown, format: (inr: number) => string): string | null {
  if (!current || typeof current !== "object" || Array.isArray(current)) return null;
  const record = current as Record<string, unknown>;
  const amount = typeof record.amount_inr === "number" ? record.amount_inr : null;
  const by =
    typeof record.corrected_by === "string"
      ? record.corrected_by
      : typeof record.by === "string"
        ? record.by
        : typeof record.changed_by === "string"
          ? record.changed_by
          : null;
  if (amount === null && by === null) return null;
  if (amount !== null && by !== null) return `Now ${format(amount)}, set by ${by}.`;
  if (amount !== null) return `Now ${format(amount)}.`;
  return `Last changed by ${by}.`;
}
