"use client";

import { useId, useState } from "react";

import type { Dispatch } from "@/components/planner/forms/command";
import { useCommand } from "@/components/planner/forms/useCommand";
import { formatDayTime } from "@/components/planner/format";
import { SaveError } from "@/components/planner/kit/SaveError";
import { QUIET, Receipt, SECONDARY } from "@/components/planner/money/form-parts";
import type { WeddingId } from "@/contracts/domain";
import type { TeamMember, TeamPendingInvite, TeamView } from "@/contracts/read-models";

import { teamErrorText } from "./team-text";

const ROLE_WORD = { owner: "Owner", manager: "Manager" } as const;

/**
 * Who is in the wedding and who is invited, from the `team` read model (4.11; D99, D109).
 * Owners only: the layout reads `team` for owners and passes it here. Remove and Revoke each
 * ask once before sending; a refused save (409 `last_owner`) shows in the row.
 */
export function TeamMembers({ wedding_id, dispatch, team }: { wedding_id: WeddingId; dispatch: Dispatch; team: TeamView }) {
  const headingId = useId();
  const invitesId = useId();
  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby={headingId} className="flex flex-col gap-2">
        <h3 id={headingId} className="text-heading text-ink">
          Members
        </h3>
        <ul className="flex flex-col divide-y divide-line">
          {team.members.map((member) => (
            <MemberRow key={member.member_id} wedding_id={wedding_id} dispatch={dispatch} member={member} />
          ))}
        </ul>
      </section>
      {team.pending_invites.length > 0 ? (
        <section aria-labelledby={invitesId} className="flex flex-col gap-2">
          <h3 id={invitesId} className="text-heading text-ink">
            Invited, not joined yet
          </h3>
          <ul className="flex flex-col divide-y divide-line">
            {team.pending_invites.map((invite) => (
              <InviteRow key={invite.member_invite_id} wedding_id={wedding_id} dispatch={dispatch} invite={invite} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function MemberRow({ wedding_id, dispatch, member }: { wedding_id: WeddingId; dispatch: Dispatch; member: TeamMember }) {
  const save = useCommand(dispatch);
  const [confirm, setConfirm] = useState(false);
  const [done, setDone] = useState(false);
  const errorId = useId();
  const error = save.state.status === "error" ? teamErrorText(save.state.error) : null;

  async function remove() {
    const response = await save.submit({ wedding_id, command: "remove_member", input: { member_id: member.member_id }, source: "ui" });
    if (response.ok) {
      setConfirm(false);
      setDone(true);
    }
  }

  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-body text-ink">
          {member.display_name}
          <span className="text-meta text-ink-3">
            {" · "}
            {ROLE_WORD[member.role]}
            {member.is_you ? " · you" : ""}
          </span>
        </p>
        {member.is_you || done ? null : (
          <button
            type="button"
            className={QUIET}
            aria-label={`Remove ${member.display_name}`}
            aria-expanded={confirm}
            onClick={() => {
              setConfirm(!confirm);
              save.reset();
            }}
          >
            Remove
          </button>
        )}
      </div>
      {confirm ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-meta text-ink-2">{member.display_name} will lose access to this wedding.</p>
          <button type="button" className={SECONDARY} disabled={save.saving} onClick={remove} aria-describedby={error ? errorId : undefined}>
            {save.saving ? "Removing…" : `Remove ${member.display_name}`}
          </button>
          <button type="button" className={QUIET} onClick={() => setConfirm(false)}>
            Keep
          </button>
        </div>
      ) : null}
      {done ? <Receipt>{member.display_name} was removed.</Receipt> : null}
      {error ? <SaveError id={errorId} message={error} /> : null}
    </li>
  );
}

function InviteRow({ wedding_id, dispatch, invite }: { wedding_id: WeddingId; dispatch: Dispatch; invite: TeamPendingInvite }) {
  const save = useCommand(dispatch);
  const [done, setDone] = useState(false);
  const errorId = useId();
  const error = save.state.status === "error" ? teamErrorText(save.state.error) : null;
  const who = invite.display_name ? `${invite.display_name} (${invite.email})` : invite.email;

  async function revoke() {
    const response = await save.submit({
      wedding_id,
      command: "revoke_member_invite",
      input: { member_invite_id: invite.member_invite_id },
      source: "ui",
    });
    if (response.ok) setDone(true);
  }

  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-body break-words text-ink">{who}</p>
          <p className="text-meta text-ink-3 tabular-nums">
            {ROLE_WORD[invite.role]} · link expires {formatDayTime(invite.expires_at)}
          </p>
        </div>
        {done ? null : (
          <button
            type="button"
            className={QUIET}
            aria-label={`Revoke the invite for ${invite.email}`}
            aria-describedby={error ? errorId : undefined}
            disabled={save.saving}
            onClick={revoke}
          >
            {save.saving ? "Revoking…" : "Revoke"}
          </button>
        )}
      </div>
      {done ? <Receipt>Invite revoked. The join link no longer works.</Receipt> : null}
      {error ? <SaveError id={errorId} message={error} /> : null}
    </li>
  );
}
