import { ArrowLeft, CaretRight, PencilSimpleLine, WarningCircle } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import type { ReactNode } from "react";

import { InvitePublishPanel } from "@/components/invite/InvitePublishPanel";
import type { VoicePrefillEntry } from "@/contracts/commands";
import type { WeddingId } from "@/contracts/domain";
import type { Itinerary, ItineraryConflict, ItineraryFunction, UnpublishedChange } from "@/contracts/read-models";
import { routes } from "@/contracts/routes";

import type { Dispatch } from "../forms/command";
import { EmptyState } from "../kit/EmptyState";
import { formatWeekdayDate } from "../kit/dates";
import { SectionHeading } from "../kit/SectionHeading";
import { Wash } from "../kit/Wash";
import { formatClock } from "../format";
import { AddRequirementForm } from "./AddRequirementForm";
import { EventEditForm } from "./EventEditForm";
import {
  CHANGE_FIELD_LABELS,
  changedByLine,
  changesFor,
  conflictsFor,
  draftLine,
  NO_DRAFT_LINE,
  groupByDay,
  publishedLine,
  timeRange,
  venueText,
  wasLine,
} from "./event-text";

const SHEET = "rounded-sheet border border-line bg-paper";

export type EventsViewProps = {
  wedding_id: WeddingId;
  itinerary: Itinerary;
  selected_id: string | null;
  is_owner: boolean;
  member_name: string;
  dispatch: Dispatch;
  /** Voice prefill entries (D121), handed to the form whose command they name. */
  prefill?: VoicePrefillEntry[];
};

function ConflictLine({ conflict }: { conflict: ItineraryConflict }) {
  return (
    <p className="flex items-start gap-2 text-meta text-due">
      <WarningCircle size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
      <span>
        <span className="sr-only">Warning: </span>
        {conflict.text}
      </span>
    </p>
  );
}

function ChangeLine({ change }: { change: UnpublishedChange }) {
  const by = changedByLine(change);
  return (
    <p className="flex flex-wrap items-baseline gap-x-2 text-meta text-ink-2">
      <span className="inline-flex items-center gap-1 rounded-chip bg-ivory-deep px-2 text-ink-2">
        <PencilSimpleLine size={16} aria-hidden="true" className="shrink-0" />
        Not published
      </span>
      <span>
        {CHANGE_FIELD_LABELS[change.field] ?? "Changed"} {wasLine(change)}
        {by ? <span className="text-ink-3">. {by}</span> : null}
      </span>
    </p>
  );
}

function FunctionRow({
  wedding_id,
  fn,
  changes,
  conflicts,
  selected,
}: {
  wedding_id: WeddingId;
  fn: ItineraryFunction;
  changes: UnpublishedChange[];
  conflicts: ItineraryConflict[];
  selected: boolean;
}) {
  const time = timeRange(fn);
  const venue = venueText(fn);
  return (
    <li>
      <Link
        href={routes.events(wedding_id, fn.event_id)}
        aria-current={selected ? "true" : undefined}
        className={`flex min-h-11 items-start gap-3 rounded-paper px-3 py-3 hover:bg-ivory-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-maroon ${selected ? "bg-maroon-tint" : ""}`}
      >
        <div className="w-24 shrink-0 text-table text-ink-2 tabular-nums" data-field="functions.start_time">
          <Wash watch={time}>{time ?? "Time not set"}</Wash>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="text-body text-ink">
            {fn.title}{" "}
            <span lang="hi" className="text-ink-2">
              {fn.title_hi}
            </span>
          </p>
          <p className="text-table text-ink-2" data-field="functions.venue">
            <Wash watch={venue}>{venue ?? "Venue not chosen"}</Wash>
          </p>
          {fn.muhurat_time ? (
            <p className="text-meta text-ink-3 tabular-nums" data-field="functions.muhurat_time">
              Muhurat {formatClock(fn.muhurat_time)}
            </p>
          ) : null}
          {fn.dress_code ? (
            <p className="text-meta text-ink-3" data-field="functions.dress_code">
              <Wash watch={fn.dress_code}>Dress code: {fn.dress_code}</Wash>
            </p>
          ) : null}
          {fn.lead_name ? (
            <p className="text-meta text-ink-3" data-field="functions.lead_name">
              Lead: {fn.lead_name}
            </p>
          ) : null}
          {changes.map((change) => (
            <ChangeLine key={change.field} change={change} />
          ))}
          {conflicts.map((conflict) => (
            <ConflictLine key={conflict.text} conflict={conflict} />
          ))}
        </div>
        <CaretRight size={16} aria-hidden="true" className="mt-1 shrink-0 text-ink-3" />
      </Link>
    </li>
  );
}

function Detail({ term, field, children }: { term: string; field?: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-meta text-ink-3">{term}</dt>
      <dd className="text-body text-ink" data-field={field}>
        {children}
      </dd>
    </div>
  );
}

function FunctionDetail({
  wedding_id,
  itinerary,
  fn,
  member_name,
  dispatch,
  prefill,
}: {
  wedding_id: WeddingId;
  itinerary: Itinerary;
  fn: ItineraryFunction;
  member_name: string;
  dispatch: Dispatch;
  prefill?: VoicePrefillEntry[];
}) {
  const time = timeRange(fn);
  const venue = venueText(fn);
  const changes = changesFor(itinerary.unpublished_changes, fn.event_id);
  const conflicts = conflictsFor(itinerary.conflicts, fn.event_id);
  const eventPrefill = prefill?.find(
    (entry) => entry.command === "update_event" && (entry.input.event_id === undefined || entry.input.event_id === fn.event_id),
  );
  const reqPrefill = prefill?.find(
    (entry) => entry.command === "add_requirement" && (entry.input.event_id === undefined || entry.input.event_id === fn.event_id),
  );
  return (
    <article aria-labelledby="function-title" className={`${SHEET} flex flex-col gap-6 p-4 lg:p-6`}>
      <Link
        href={routes.events(wedding_id)}
        className="-ml-2 inline-flex min-h-11 items-center gap-2 self-start rounded-control px-2 text-table text-maroon hover:bg-ivory-deep lg:hidden"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        All functions
      </Link>
      <header className="flex flex-col gap-1">
        <h2 id="function-title" className="font-serif text-panel text-ink">
          {fn.title}{" "}
          <span lang="hi" className="text-ink-2">
            {fn.title_hi}
          </span>
        </h2>
        <p className="text-table text-ink-2 tabular-nums">{formatWeekdayDate(fn.event_date)}</p>
      </header>
      {changes.length > 0 || conflicts.length > 0 ? (
        <div className="flex flex-col gap-2">
          {changes.map((change) => (
            <ChangeLine key={change.field} change={change} />
          ))}
          {conflicts.map((conflict) => (
            <ConflictLine key={conflict.text} conflict={conflict} />
          ))}
        </div>
      ) : null}
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        <Detail term="Time" field="functions.start_time">
          <Wash watch={time} className="tabular-nums">
            {time ?? "Not set"}
          </Wash>
        </Detail>
        <Detail term="Muhurat" field="functions.muhurat_time">
          <Wash watch={fn.muhurat_time} className="tabular-nums">
            {fn.muhurat_time ? formatClock(fn.muhurat_time) : "None"}
          </Wash>
        </Detail>
        <Detail term="Venue" field="functions.venue">
          <Wash watch={venue}>{venue ?? "Not chosen"}</Wash>
          {fn.venue?.capacity != null ? (
            <span className="block text-meta text-ink-3 tabular-nums">Seats {fn.venue.capacity}</span>
          ) : null}
        </Detail>
        <Detail term="Dress code" field="functions.dress_code">
          <Wash watch={fn.dress_code}>{fn.dress_code ?? "Not set"}</Wash>
        </Detail>
        <Detail term="Lead" field="functions.lead_name">
          {fn.lead_name ?? "Not set"}
        </Detail>
        {fn.description ? (
          <Detail term="Notes" field="functions.description">
            {fn.description}
          </Detail>
        ) : null}
      </dl>

      <section aria-labelledby="function-reqs" className="flex flex-col gap-3">
        <SectionHeading id="function-reqs" level={3}>
          Requirements
        </SectionHeading>
        {fn.requirements.length === 0 ? (
          <EmptyState>No requirements yet. Add one below, or say &ldquo;add a sugar-free dessert to the reception&rdquo;.</EmptyState>
        ) : (
          <ul className="flex flex-col divide-y divide-line border-y border-line">
            {fn.requirements.map((req) => (
              <li key={req.requirement_id} className="py-2 text-body text-ink" data-field="functions.requirements">
                {req.label}
              </li>
            ))}
          </ul>
        )}
        <AddRequirementForm
          key={`req-${fn.event_id}`}
          wedding_id={wedding_id}
          event_id={fn.event_id}
          function_title={fn.title}
          dispatch={dispatch}
          member_name={member_name}
          prefill={reqPrefill}
        />
      </section>

      <section className="border-t border-line pt-6">
        <EventEditForm
          key={`edit-${fn.event_id}`}
          wedding_id={wedding_id}
          fn={fn}
          venues={itinerary.venues}
          dispatch={dispatch}
          member_name={member_name}
          prefill={eventPrefill}
        />
      </section>
    </article>
  );
}

/** Events (brief B3, design-direction 10.3): functions by day, the draft line, and the detail. */
export function EventsView({ wedding_id, itinerary, selected_id, is_owner, member_name, dispatch, prefill }: EventsViewProps) {
  const days = groupByDay(itinerary.functions);
  const selected = selected_id ? (itinerary.functions.find((fn) => fn.event_id === selected_id) ?? null) : null;
  const draft = draftLine(itinerary.unpublished_changes);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <h1 className="font-serif text-title text-ink">Events</h1>
        <div className={`${SHEET} flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between`}>
          <div aria-live="polite">
            <Wash watch={draft ?? NO_DRAFT_LINE} className="text-body text-ink">
              {draft ?? NO_DRAFT_LINE}
            </Wash>
            <p className="text-meta text-ink-3">{publishedLine(itinerary)}</p>
          </div>
          {draft ? (
            is_owner ? (
              <InvitePublishPanel wedding_id={wedding_id} itinerary={itinerary} dispatch={dispatch} />
            ) : (
              <p className="text-meta text-ink-2">Only an owner can publish. Your changes are safe in the draft.</p>
            )
          ) : null}
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className={selected ? "hidden lg:block" : undefined}>
          {days.length === 0 ? (
            <EmptyState>No functions yet. Say &ldquo;add the sangeet on 13 December at 7 pm&rdquo; to add the first one.</EmptyState>
          ) : (
            <div className="flex flex-col gap-6">
              {days.map((day) => (
                <section key={day.date} aria-labelledby={`day-${day.date}`} className="flex flex-col gap-2">
                  <SectionHeading id={`day-${day.date}`}>
                    <span className="tabular-nums">{formatWeekdayDate(day.date)}</span>
                  </SectionHeading>
                  <ul className={`${SHEET} flex flex-col divide-y divide-line p-1`}>
                    {day.functions.map((fn) => (
                      <FunctionRow
                        key={fn.event_id}
                        wedding_id={wedding_id}
                        fn={fn}
                        changes={changesFor(itinerary.unpublished_changes, fn.event_id)}
                        conflicts={conflictsFor(itinerary.conflicts, fn.event_id)}
                        selected={fn.event_id === selected?.event_id}
                      />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>
        <div className={selected ? undefined : "hidden lg:block"}>
          {selected ? (
            <FunctionDetail
              key={selected.event_id}
              wedding_id={wedding_id}
              itinerary={itinerary}
              fn={selected}
              member_name={member_name}
              dispatch={dispatch}
              prefill={prefill}
            />
          ) : (
            <div className={`${SHEET} p-4 lg:p-6`}>
              <EmptyState>Pick a function to see its details, change it in the draft, or add what it needs.</EmptyState>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
