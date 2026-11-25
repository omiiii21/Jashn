import type { UnpublishedChange } from "@/contracts/read-models";

import { changeLabel, formatChangeValue, type ChangeSubjects } from "./change-text";
import { istTime } from "./ist-format";

/**
 * The draft changes, each with the old value struck through next to the new one
 * (design-direction 10.7; AT-3.4 "~~Banyan Hall~~ Lotus Hall"). No hooks, so the sheet
 * and the Invite page (server) both render it.
 */
export function ChangeList({ changes, subjects }: { changes: readonly UnpublishedChange[]; subjects: ChangeSubjects }) {
  return (
    <ul className="divide-y divide-line border-y border-line">
      {changes.map((change) => {
        const like = { entity: change.entity, entity_id: change.entity_id, field: change.field, from: change.published_value, to: change.draft_value };
        const from = formatChangeValue(like, change.published_value);
        const to = formatChangeValue(like, change.draft_value);
        return (
          <li key={`${change.entity}:${change.entity_id}:${change.field}`} className="flex flex-col gap-1 py-3">
            <span className="text-body font-medium text-ink">{changeLabel(like, subjects)}</span>
            <span className="flex flex-wrap items-baseline gap-x-2 text-body">
              {change.published_value !== null && change.field !== "added" ? (
                <del className="text-ink-3 decoration-ink-3">
                  <span className="sr-only">was </span>
                  {from}
                </del>
              ) : null}
              {change.draft_value !== null && change.field !== "removed" ? (
                <ins className="text-ink no-underline">
                  <span className="sr-only">now </span>
                  {to}
                </ins>
              ) : null}
            </span>
            {change.changed_by ? (
              <span className="text-meta text-ink-2">
                Changed by {change.changed_by}
                {change.changed_at ? `, ${istTime(change.changed_at)}` : ""}
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
