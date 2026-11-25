import { EnvelopeSimple, ForkKnife, LockSimple, Phone } from "@phosphor-icons/react/ssr";

import { EmptyState, SectionHeading, Wash } from "@/components/planner";
import type { WeddingId } from "@/contracts/domain";
import type { RsvpGuestList } from "@/contracts/read-models";

import type { Dispatch } from "../forms/command";
import { groupHouseholds, replyFormGuests, type Household, type HouseholdGuest } from "./households";
import { RecordReplies } from "./RecordReplies";
import { ReplyLabel } from "./ReplyLabel";

function telHref(phone: string): string {
  return `tel:${phone.replace(/[^+\d]/g, "")}`;
}

/** Contacts only as G7 allows: a field the read model left out is never drawn, not even empty. */
function Contacts({ guest }: { guest: HouseholdGuest }) {
  if (!guest.phone && !guest.email) return null;
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-meta">
      {guest.phone ? (
        <a
          href={telHref(guest.phone)}
          data-field="phone"
          className="inline-flex min-h-11 items-center gap-1 text-ink-2 tabular-nums underline-offset-4 hover:text-maroon hover:underline md:min-h-0"
        >
          <Phone size={16} aria-hidden="true" className="shrink-0 text-ink-3" />
          {guest.phone}
        </a>
      ) : null}
      {guest.email ? (
        <a
          href={`mailto:${guest.email}`}
          data-field="email"
          className="inline-flex min-h-11 items-center gap-1 break-all text-ink-2 underline-offset-4 hover:text-maroon hover:underline md:min-h-0"
        >
          <EnvelopeSimple size={16} aria-hidden="true" className="shrink-0 text-ink-3" />
          {guest.email}
        </a>
      ) : null}
    </div>
  );
}

type FunctionColumn = { event_id: string; title: string };

function GuestRow({ guest, functions }: { guest: HouseholdGuest; functions: FunctionColumn[] }) {
  return (
    <li
      data-guest-id={guest.guest_id}
      className="flex flex-col gap-2 border-t border-line py-3 first:border-t-0 md:flex-row md:gap-6"
    >
      <div className="flex min-w-0 flex-col gap-1 md:w-56 md:shrink-0">
        <span className="text-body font-medium text-ink">{guest.full_name}</span>
        {guest.dietary_note ? (
          <span data-field="dietary_note" className="inline-flex items-start gap-1 text-meta text-ink-2">
            <ForkKnife size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-ink-3" />
            {guest.dietary_note}
          </span>
        ) : null}
        <Contacts guest={guest} />
      </div>
      {/* One fixed cell per function in the read model's order, so each function keeps its
          column from guest to guest; an empty cell where the guest isn't invited. */}
      <ul aria-label={`${guest.full_name}'s replies`} className="grid min-w-0 flex-1 grid-cols-3 gap-x-4 gap-y-2 text-table md:grid-cols-5">
        {functions.map((fn) => {
          const reply = guest.replies.find((r) => r.event_id === fn.event_id);
          return reply ? (
            <li key={fn.event_id} data-event-id={reply.event_id} className="flex min-w-0 flex-col">
              <span className="text-meta text-ink-3">{reply.title}</span>
              <Wash watch={`${reply.rsvp_status}:${reply.plus_ones}`}>
                <ReplyLabel status={reply.rsvp_status} plusOnes={reply.plus_ones} />
              </Wash>
            </li>
          ) : (
            <li key={fn.event_id} aria-hidden="true" />
          );
        })}
      </ul>
    </li>
  );
}

function HouseholdBlock({
  wedding_id,
  dispatch,
  household,
  functions,
  actorName,
}: {
  wedding_id: WeddingId;
  dispatch: Dispatch;
  household: Household;
  functions: FunctionColumn[];
  actorName: string;
}) {
  const headingId = `household-${household.household_id}`;
  return (
    <li>
      <article
        aria-labelledby={headingId}
        data-household-id={household.household_id}
        data-group-label={household.group_label ?? undefined}
        className="flex flex-col gap-3 border-t border-line px-4 py-4 lg:px-6"
      >
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 id={headingId} className="text-heading text-ink">
            {household.household_name}
            <span className="sr-only">
              {" household: "}
              {household.guests.map((guest) => guest.full_name).join(", ")}
            </span>
          </h3>
          {/* group_label holds seed codes (FAM-B, FR-M) today; shown again once the read model
              returns demo-data's words ("Bride's family"). */}
        </div>
        <ul aria-label={`Guests in the ${household.household_name} household`}>
          {household.guests.map((guest) => (
            <GuestRow key={guest.guest_id} guest={guest} functions={functions} />
          ))}
        </ul>
        <RecordReplies
          wedding_id={wedding_id}
          dispatch={dispatch}
          guests={replyFormGuests(household)}
          actorName={actorName}
        />
      </article>
    </li>
  );
}

/** The imported guests, collapsed into one row per function with the read model's own label. */
function SyntheticRows({ list }: { list: RsvpGuestList }) {
  const blocks = list.functions.filter((fn) => fn.synthetic !== null);
  if (blocks.length === 0) return null;
  return (
    <section
      aria-labelledby="synthetic-heading"
      className="flex flex-col gap-3 border-t border-line-strong px-4 py-4 lg:px-6"
    >
      <h3 id="synthetic-heading" className="text-heading text-ink">
        Imported guests
      </h3>
      <p className="max-w-prose text-meta text-ink-2">
        Fictional placeholders that fill the counts. They are not listed one by one.
      </p>
      <ul className="flex flex-col">
        {blocks.map((fn) =>
          fn.synthetic ? (
            <li
              key={fn.event_id}
              data-event-id={fn.event_id}
              className="flex flex-col gap-1 border-t border-line py-3 first:border-t-0 md:flex-row md:items-baseline md:gap-6"
            >
              <span className="text-meta text-ink-3 md:w-56 md:shrink-0">{fn.title}</span>
              <span data-field="synthetic.label" className="text-body text-ink">
                {fn.synthetic.label}
              </span>
              <span className="flex flex-wrap gap-x-4 text-table text-ink-2 tabular-nums">
                <span>
                  <span data-field="synthetic.attending">{fn.synthetic.attending.toLocaleString("en-IN")}</span>{" "}
                  attending
                </span>
                <span>
                  <span data-field="synthetic.declined">{fn.synthetic.declined.toLocaleString("en-IN")}</span> declined
                </span>
                <span>
                  <span data-field="synthetic.pending">{fn.synthetic.pending.toLocaleString("en-IN")}</span> pending
                </span>
              </span>
            </li>
          ) : null,
        )}
      </ul>
    </section>
  );
}

/**
 * Households and invitations (AT-4.8): the named guests from `rsvp_guest_list`, grouped by
 * household, each with the functions they are invited to and their reply for each, a
 * dietary note and, only where G7 allows, a phone number or email. Then the imported guests,
 * collapsed. Each household can record replies on a guest's behalf (AT-4.7).
 */
export function HouseholdList({
  wedding_id,
  dispatch,
  list,
  actorName,
  filterTitle,
}: {
  wedding_id: WeddingId;
  dispatch: Dispatch;
  list: RsvpGuestList;
  actorName: string;
  /** The function the list is filtered to, for the heading. */
  filterTitle: string | null;
}) {
  const households = groupHouseholds(list);
  const contactsHidden = list.hidden.includes("guest_contacts");

  return (
    <section aria-labelledby="households-heading" className="overflow-hidden rounded-sheet border border-line bg-paper">
      <div className="flex flex-col gap-2 px-4 pt-4 pb-3 lg:px-6">
        <SectionHeading id="households-heading">
          {filterTitle ? `Households invited to the ${filterTitle.toLowerCase()}` : "Households and invitations"}
        </SectionHeading>
        {contactsHidden ? (
          <p className="inline-flex items-center gap-2 text-meta text-ink-3">
            <LockSimple size={16} aria-hidden="true" className="shrink-0" />
            Contacts not shared with you
          </p>
        ) : null}
      </div>
      {households.length === 0 ? (
        <div className="border-t border-line px-4 py-4 lg:px-6">
          <EmptyState>No named guests yet.</EmptyState>
        </div>
      ) : (
        <ul aria-label="Households">
          {households.map((household) => (
            <HouseholdBlock
              key={household.household_id}
              wedding_id={wedding_id}
              dispatch={dispatch}
              household={household}
              functions={list.functions}
              actorName={actorName}
            />
          ))}
        </ul>
      )}
      <SyntheticRows list={list} />
    </section>
  );
}
