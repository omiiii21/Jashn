import { MEMBER_ROLE_LABELS } from "@/contracts/domain";
import type { WeddingProfile } from "@/contracts/read-models";

/** The signed-in member as the shell shows them: "Mira, owner" or "Diya, event manager". */
export function memberLabel(member: WeddingProfile["member"]): string {
  return `${member.display_name}, ${MEMBER_ROLE_LABELS[member.role].en.toLowerCase()}`;
}
