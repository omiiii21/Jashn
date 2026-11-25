/**
 * Who may do what (domain-and-data 6.1, A1–A3, G7, L5) as data. Lane A's guard in
 * `src/server/authz/` applies it; flags never decide access (flagsmith.md 2.4).
 */
import { GATED_COMMANDS, type CommandName } from "./commands";
import type { MemberRole, SharingFlag, SharingSettings } from "./domain";
import type { HiddenBlock, ReadModelName } from "./read-models";

/** How a manager stands on a command. */
export type ManagerRule =
  | "allow"
  | "forbidden"
  /** A1: 403 `approval_required`; send `propose_change` instead. */
  | "approval_required"
  /** Allowed only while `managers_can_see_vendor_dues` is on (G7); otherwise 403 `forbidden`. */
  | "if_vendor_dues"
  /** `add_guest`: no `event_ids`, no `max_plus_ones`, not into a household with an active link (3.4). */
  | "limited";

export type CommandPermission = {
  owner: boolean;
  manager: ManagerRule;
  /** Any signed-in user, member or not: the `set_wedding_profile` create and `accept_member_invite`. */
  any_signed_in: boolean;
  /** A guest token, for its own household only. */
  guest: boolean;
  /** The ops bearer token (`JOBS_API_TOKEN`), as `system` "NudgeBee". */
  system: boolean;
};

const both: CommandPermission = { owner: true, manager: "allow", any_signed_in: false, guest: false, system: false };
const ownerOnly: CommandPermission = { owner: true, manager: "forbidden", any_signed_in: false, guest: false, system: false };
const gated: CommandPermission = { owner: true, manager: "approval_required", any_signed_in: false, guest: false, system: false };

/** The role × command matrix (6.1). */
export const COMMAND_PERMISSIONS: Record<CommandName, CommandPermission> = {
  // Create: any signed-in user (no wedding_id); update: owner only. The guard tells them apart.
  set_wedding_profile: { ...ownerOnly, any_signed_in: true },
  set_budget_line: ownerOnly,
  set_sharing: ownerOnly,
  invite_member: ownerOnly,
  accept_member_invite: { owner: false, manager: "forbidden", any_signed_in: true, guest: false, system: false },
  revoke_member_invite: ownerOnly,
  remove_member: ownerOnly,

  create_event: both,
  update_event: both,
  update_invite_style: both,
  add_asset: both,
  publish_itinerary: ownerOnly,

  add_vendor: both,
  update_vendor: both,
  add_quote: { ...both, manager: "if_vendor_dues" },
  record_commitment: gated,
  update_commitment: gated,
  void_commitment: gated,
  record_payment: gated,
  correct_payment: gated,
  void_payment: gated,
  record_expense: gated,

  add_requirement: both,
  add_note: both,
  add_guest: { ...both, manager: "limited" },
  set_invitations: ownerOnly,
  set_rsvp: both,
  set_dietary: { ...both, guest: true },
  submit_rsvp: { owner: false, manager: "forbidden", any_signed_in: false, guest: true, system: false },
  create_invitation_links: ownerOnly,
  revoke_invitation_link: ownerOnly,

  // Managers only: an owner runs the command directly (403 `forbidden`).
  propose_change: { owner: false, manager: "allow", any_signed_in: false, guest: false, system: false },
  approve_proposal: ownerOnly,
  reject_proposal: ownerOnly,
  // Only the manager who proposed it.
  withdraw_proposal: { owner: false, manager: "allow", any_signed_in: false, guest: false, system: false },

  record_shagun: ownerOnly,
  mark_shagun_thanked: ownerOnly,

  request_card_export: both,
  // The owner from the exports panel, or NudgeBee on the ops route.
  retry_card_export: { ...ownerOnly, system: true },
  reset_demo: ownerOnly,
};

/** A3: owner-only and never proposable. */
export const OWNER_ONLY_COMMANDS = [
  "publish_itinerary",
  "set_wedding_profile",
  "set_budget_line",
  "set_sharing",
  "invite_member",
  "revoke_member_invite",
  "remove_member",
  "set_invitations",
  "create_invitation_links",
  "revoke_invitation_link",
  "record_shagun",
  "mark_shagun_thanked",
  "approve_proposal",
  "reject_proposal",
  "reset_demo",
] as const satisfies readonly CommandName[];

/** Commands a guest token may run (G4): its own household's RSVP and dietary note. */
export const GUEST_COMMANDS = ["submit_rsvp", "set_dietary"] as const satisfies readonly CommandName[];

/** Commands the ops token may run. */
export const SYSTEM_COMMANDS = ["retry_card_export"] as const satisfies readonly CommandName[];

/** 3.5: a manager's `propose_change` for these also needs `managers_can_see_vendor_dues`. */
export const PROPOSALS_NEEDING_VENDOR_DUES = GATED_COMMANDS.filter((command) => command !== "record_expense");

/** Which sharing flag opens which read-model block to a manager (G7). */
export const BLOCK_SHARING_FLAG: Partial<Record<HiddenBlock, SharingFlag>> = {
  budget: "managers_can_see_budget",
  money: "managers_can_see_budget",
  vendor_money: "managers_can_see_vendor_dues",
  dues: "managers_can_see_vendor_dues",
  estimate: "managers_can_see_vendor_dues",
  guest_contacts: "managers_can_see_guest_contacts",
};

/** How a manager stands on a read model (6.1). Owners read every member read model. */
export type ManagerReadRule = "allow" | "forbidden" | "if_vendor_dues" | "own_only";

export const READ_MODEL_PERMISSIONS: Record<ReadModelName, { owner: boolean; manager: ManagerReadRule; guest: boolean }> = {
  wedding_profile: { owner: true, manager: "allow", guest: false },
  overview: { owner: true, manager: "allow", guest: false },
  itinerary: { owner: true, manager: "allow", guest: false },
  wedding_notes: { owner: true, manager: "allow", guest: false },
  rsvp_totals: { owner: true, manager: "allow", guest: false },
  rsvp_guest_list: { owner: true, manager: "allow", guest: false },
  activity_feed: { owner: true, manager: "allow", guest: false },
  export_job_status: { owner: true, manager: "allow", guest: false },
  // The rows' money needs vendor dues; totals and category lines need the budget flag (G7).
  money_summary: { owner: true, manager: "allow", guest: false },
  vendor_ledger: { owner: true, manager: "if_vendor_dues", guest: false },
  catering_estimate: { owner: true, manager: "if_vendor_dues", guest: false },
  proposals: { owner: true, manager: "own_only", guest: false },
  shagun_register: { owner: true, manager: "forbidden", guest: false },
  // 4.11: the member list, pending invites and sharing flags are for owners only.
  team: { owner: true, manager: "forbidden", guest: false },
};

/**
 * L5: entries with these topic prefixes are `owners`; everything else is `members`.
 * A `set_wedding_profile` entry carrying `budget_inr` is `owners` too (L5a).
 */
export const OWNER_ONLY_TOPIC_PREFIXES = [
  "budget.",
  "sharing.",
  "member.",
  "quote.",
  "commitment.",
  "payment.",
  "expense.",
  "proposal.",
  "shagun.",
  "invitation_links.",
  "invitation_link.",
] as const;

export type RoleDecision = "allow" | "approval_required" | "forbidden";

/**
 * Step 2 of the dispatcher (3.0) for a member: the matrix plus the sharing flags.
 * `add_guest`'s limits and `withdraw_proposal`'s "own proposal" check need the input
 * and the rows, so the guard checks them after this.
 */
export function memberCommandDecision(command: CommandName, role: MemberRole, sharing: SharingSettings): RoleDecision {
  const rule = COMMAND_PERMISSIONS[command];
  if (role === "owner") return rule.owner ? "allow" : "forbidden";
  switch (rule.manager) {
    case "allow":
    case "limited":
      return "allow";
    case "approval_required":
      return "approval_required";
    case "if_vendor_dues":
      return sharing.managers_can_see_vendor_dues ? "allow" : "forbidden";
    default:
      return "forbidden";
  }
}

/** Whether a manager may see a block, given the wedding's sharing flags. Owners always may. */
export function managerSeesBlock(block: HiddenBlock, sharing: SharingSettings): boolean {
  const flag = BLOCK_SHARING_FLAG[block];
  if (flag) return sharing[flag];
  // Blocks with no flag (shagun, owner-only proposals and activity) are owners only.
  return false;
}
