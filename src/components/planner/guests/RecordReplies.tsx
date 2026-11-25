"use client";

import { CheckCircle } from "@phosphor-icons/react";
import { useId, useState } from "react";

import { SaveError } from "@/components/planner/kit/SaveError";
import { RSVP_STATUSES, RSVP_STATUS_LABELS, type EventId, type RsvpStatus, type WeddingId } from "@/contracts/domain";
import { formatTime } from "@/components/planner/format";

import { commandErrorText, type Dispatch } from "../forms/command";
import { useCommand } from "../forms/useCommand";
import type { ReplyFormGuest } from "./households";

const FIELD =
  "h-11 w-full rounded-control border border-line-strong bg-ivory px-3 text-body text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-maroon";
const PRIMARY =
  "inline-flex h-11 items-center rounded-control bg-maroon px-4 text-body text-ivory hover:bg-maroon-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-maroon disabled:opacity-60";
const SECONDARY =
  "inline-flex h-11 items-center rounded-control border border-line-strong bg-paper px-4 text-body text-ink hover:bg-ivory-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-maroon";
const CHOICE = "flex min-h-11 items-center gap-3 rounded-control px-2 text-body text-ink hover:bg-ivory";

type Receipt = {
  names: string[];
  title: string;
  status: RsvpStatus;
  unchanged: boolean;
  at: string;
};

/** "Nikhil Jain", "Nikhil Jain and Prachi Jain", "A, B and C". Joins names; counts nothing. */
function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * Record replies on a guest's behalf (AT-4.7, R10): pick a function, the household's guests
 * invited to it, and the reply, then one `set_rsvp` through the `dispatch` prop. Owners and
 * managers both may. Never optimistic: the counts come back from the read models after the
 * refresh. A new idempotency key is made whenever the selection changes (R8). The open form
 * keeps its state across the 2.5 s refresh.
 */
export function RecordReplies({
  wedding_id,
  dispatch,
  guests,
  actorName,
}: {
  wedding_id: WeddingId;
  dispatch: Dispatch;
  guests: ReplyFormGuest[];
  actorName: string;
}) {
  const { state, submit, reset, saving } = useCommand(dispatch);
  const formId = useId();

  // The functions any guest here is invited to, in read-model order (a de-duplication).
  const functions: { event_id: EventId; title: string }[] = [];
  for (const guest of guests) {
    for (const reply of guest.replies) {
      if (!functions.some((fn) => fn.event_id === reply.event_id)) {
        functions.push({ event_id: reply.event_id, title: reply.title });
      }
    }
  }

  const [open, setOpen] = useState(false);
  const [eventId, setEventId] = useState<EventId>(functions[0]?.event_id ?? "");
  const [picked, setPicked] = useState<string[]>([]);
  const [status, setStatus] = useState<RsvpStatus>("attending");
  const [missing, setMissing] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  if (functions.length === 0) return null;

  const fn = functions.find((item) => item.event_id === eventId) ?? functions[0];
  const invited = guests.filter((guest) => guest.replies.some((reply) => reply.event_id === fn.event_id));
  const pickedHere = picked.filter((id) => invited.some((guest) => guest.guest_id === id));

  /** Any change starts a fresh confirmation: a new key, and the old receipt or error goes. */
  function changed() {
    reset();
    setMissing(false);
    setReceipt(null);
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pickedHere.length === 0) {
      setMissing(true);
      return;
    }
    const names = invited.filter((guest) => pickedHere.includes(guest.guest_id)).map((guest) => guest.full_name);
    const response = await submit({
      wedding_id,
      command: "set_rsvp",
      input: {
        guest_ids: pickedHere,
        event_id: fn.event_id,
        rsvp_status: status,
      },
      source: "ui",
    });
    if (response.ok) {
      setReceipt({
        names,
        title: fn.title,
        status,
        unchanged: response.outcome === "unchanged",
        at: formatTime(new Date().toISOString()),
      });
    }
  }

  const errorId = `${formId}-error`;

  return (
    <div className="flex flex-col gap-3">
      <div>
        <button
          type="button"
          className={SECONDARY}
          aria-expanded={open}
          aria-controls={open ? formId : undefined}
          onClick={() => {
            if (open && state.status === "error") reset();
            setOpen(!open);
            setMissing(false);
            if (!open) setReceipt(null);
          }}
        >
          Record replies
        </button>
      </div>

      {open ? (
        <form
          id={formId}
          onSubmit={onSubmit}
          aria-label="Record replies"
          className="flex flex-col gap-4 rounded-paper border border-line bg-ivory p-4"
          noValidate
        >
          <label className="flex max-w-xs flex-col gap-2 text-meta font-medium text-ink-2">
            Function
            <select
              className={FIELD}
              value={fn.event_id}
              onChange={(event) => {
                setEventId(event.target.value);
                changed();
              }}
            >
              {functions.map((item) => (
                <option key={item.event_id} value={item.event_id}>
                  {item.title}
                </option>
              ))}
            </select>
          </label>

          <fieldset className="flex flex-col gap-1" aria-describedby={missing ? errorId : undefined}>
            <legend className="mb-1 text-meta font-medium text-ink-2">
              Guests invited to the {fn.title.toLowerCase()}
            </legend>
            {invited.map((guest) => {
              const current = guest.replies.find((reply) => reply.event_id === fn.event_id);
              return (
                <label key={guest.guest_id} className={CHOICE}>
                  <input
                    type="checkbox"
                    className="size-5 shrink-0 accent-maroon"
                    checked={pickedHere.includes(guest.guest_id)}
                    onChange={(event) => {
                      const on = event.target.checked;
                      setPicked((list) =>
                        on ? [...list, guest.guest_id] : list.filter((id) => id !== guest.guest_id),
                      );
                      changed();
                    }}
                  />
                  <span>{guest.full_name}</span>
                  {current ? (
                    <span className="text-meta text-ink-3">
                      now {RSVP_STATUS_LABELS[current.rsvp_status].in_sentence}
                    </span>
                  ) : null}
                </label>
              );
            })}
            {missing ? <SaveError id={errorId} message="Choose at least one guest." className="mt-1" /> : null}
          </fieldset>

          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 text-meta font-medium text-ink-2">Reply</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {RSVP_STATUSES.map((value) => (
                <label key={value} className={CHOICE}>
                  <input
                    type="radio"
                    name={`${formId}-status`}
                    className="size-5 shrink-0 accent-maroon"
                    value={value}
                    checked={status === value}
                    onChange={() => {
                      setStatus(value);
                      changed();
                    }}
                  />
                  <span>{RSVP_STATUS_LABELS[value].en}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {state.status === "error" ? (
            <SaveError
              message={commandErrorText(state.error)}
              next={state.error.code === "not_invited" ? "Pick a function they're invited to." : undefined}
            />
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button type="submit" className={PRIMARY} disabled={saving}>
              {saving ? "Saving…" : "Save reply"}
            </button>
            <button
              type="button"
              className={SECONDARY}
              onClick={() => {
                setOpen(false);
                setMissing(false);
                if (state.status === "error") reset();
              }}
            >
              Close
            </button>
          </div>
        </form>
      ) : null}

      <div role="status">
        {receipt ? (
          <p className="flex items-start gap-2 text-meta text-ink-2">
            <CheckCircle size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-paid" />
            <span>
              {receipt.unchanged
                ? `No change: ${joinNames(receipt.names)} ${receipt.names.length === 1 ? "was" : "were"} already marked ${RSVP_STATUS_LABELS[receipt.status].in_sentence} for the ${receipt.title.toLowerCase()}.`
                : `Saved by ${actorName}, ${receipt.at}. ${joinNames(receipt.names)} marked ${RSVP_STATUS_LABELS[receipt.status].in_sentence} for the ${receipt.title.toLowerCase()}.`}
            </span>
          </p>
        ) : null}
      </div>
    </div>
  );
}
