import type { Icon } from "@phosphor-icons/react";
import { CheckCircle, Clock, XCircle } from "@phosphor-icons/react/ssr";

import { RSVP_STATUS_LABELS, type RsvpStatus } from "@/contracts/domain";

const REPLY_STYLES: Record<RsvpStatus, { className: string; icon: Icon }> = {
  attending: { className: "text-paid", icon: CheckCircle },
  declined: { className: "text-ink-2", icon: XCircle },
  pending: { className: "text-due", icon: Clock },
};

/** One reply as an icon and a word, never colour alone: "Attending", "Can't attend", "Not replied". */
export function ReplyLabel({ status, plusOnes = 0 }: { status: RsvpStatus; plusOnes?: number }) {
  const style = REPLY_STYLES[status];
  const ReplyIcon = style.icon;
  return (
    <span data-field="rsvp_status" data-status={status} className={`inline-flex items-center gap-1 ${style.className}`}>
      <ReplyIcon size={16} aria-hidden="true" className="shrink-0" />
      <span>{RSVP_STATUS_LABELS[status].en}</span>
      {status === "attending" && plusOnes > 0 ? (
        <span data-field="plus_ones" className="text-ink-2 tabular-nums">
          with +{plusOnes}
        </span>
      ) : null}
    </span>
  );
}
