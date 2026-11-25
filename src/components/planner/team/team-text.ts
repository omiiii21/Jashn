import { commandErrorText } from "@/components/planner/forms/command";
import type { CommandErrorBody } from "@/contracts/commands";

/** The words for a refused team or sharing command; `last_owner` gets its own sentence here. */
export function teamErrorText(error: CommandErrorBody): string {
  if (error.code === "last_owner") return "A wedding needs at least one owner.";
  return commandErrorText(error);
}

/** The three sharing switches (domain 3.1), in the order the sheet shows them. */
export const SHARING_ROWS = [
  {
    key: "managers_can_see_vendor_dues",
    label: "Vendor dues",
    noun: "vendor dues",
  },
  {
    key: "managers_can_see_budget",
    label: "Budget",
    noun: "the budget",
  },
  {
    key: "managers_can_see_guest_contacts",
    label: "Guest contacts",
    noun: "guest contacts",
  },
] as const;

export type SharingRowKey = (typeof SHARING_ROWS)[number]["key"];

export function sharingReceipt(noun: string, shared: boolean): string {
  return shared ? `Managers can now see ${noun}.` : `Managers no longer see ${noun}.`;
}
