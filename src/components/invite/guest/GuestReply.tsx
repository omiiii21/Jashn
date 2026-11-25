"use client";

import { CheckCircleIcon, MapPinIcon, MinusIcon, PlusIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { RSVP_STATUS_LABELS, type AppLanguage, type RsvpStatus } from "@/contracts/domain";
import { routes } from "@/contracts/routes";
import { GUEST_COPY } from "./guest-copy";
import {
  answerKey,
  buildRsvpBody,
  effectiveAnswer,
  isFullyAnswered,
  keyForBody,
  pruneSelection,
  storedAnswers,
  type HeldKey,
  type ReplyChoice,
  type Selection,
  type StoredAnswer,
} from "./guest-reply-state";
import type { GuestDietaryPayload, GuestReplyBody, GuestRsvpPayload } from "./guest-wire";

/** One function insert, with every string already formatted on the server (IST). */
export type ReplyInsert = {
  event_id: string;
  title: string;
  title_hi: string;
  when: string | null;
  muhurat: string | null;
  where: string | null;
  directions_href: string | null;
  dress_code: string | null;
  description: string | null;
  responses: { guest_id: string; rsvp_status: RsvpStatus; plus_ones: number; max_plus_ones: number }[];
};

export type ReplyGuest = { guest_id: string; full_name: string; dietary_note: string | null };

export type GuestReplyProps = {
  token: string;
  lang: AppLanguage;
  inserts: ReplyInsert[];
  guests: ReplyGuest[];
  thank_name: string;
  /** `font-classic` when the family chose Tiro Devanagari, else `font-serif`. */
  hindi_font: string;
};

type PostResult = { status: number; body: GuestReplyBody | null } | "network";

/** One POST with JSON, no cookies and no cache. A network TypeError gets one resend with the same key and body (R8). */
async function postJson(url: string, payload: GuestRsvpPayload | GuestDietaryPayload): Promise<PostResult> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "omit",
        cache: "no-store",
      });
      let body: GuestReplyBody | null = null;
      try {
        body = (await response.json()) as GuestReplyBody;
      } catch {
        body = null;
      }
      return { status: response.status, body };
    } catch (error) {
      if (!(error instanceof TypeError) || attempt === 1) return "network";
    }
  }
  return "network";
}

function noteOf(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

function notesFrom(guests: readonly ReplyGuest[]): Record<string, string | null> {
  return Object.fromEntries(guests.map((guest) => [guest.guest_id, guest.dietary_note]));
}

const chip =
  "relative flex min-h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-chip border border-line-strong bg-paper px-3 text-body text-ink transition-colors duration-150 has-[:checked]:border-maroon has-[:checked]:bg-maroon has-[:checked]:text-paper has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-maroon has-[:disabled]:cursor-default";

export function GuestReply({ token, lang, inserts, guests, thank_name, hindi_font }: GuestReplyProps) {
  const copy = GUEST_COPY[lang];
  const router = useRouter();
  const hiLang = lang === "hi" ? undefined : "hi";

  // The baseline is the view's stored answers. A reply's result replaces it until the
  // next refresh brings new props (router.refresh keeps this state).
  const propsAnswers = storedAnswers({ functions: inserts });
  const propsSignature = JSON.stringify(propsAnswers);
  const [latest, setLatest] = useState<{ basis: string; answers: StoredAnswer[]; notes: Record<string, string | null> } | null>(null);
  const fresh = latest && latest.basis === propsSignature ? latest : null;
  const baseline = fresh ? fresh.answers : propsAnswers;
  const baselineNotes = fresh ? fresh.notes : notesFrom(guests);

  const [rawSelection, setSelection] = useState<Selection>({});
  const selection = pruneSelection(baseline, rawSelection);
  const [notes, setNotes] = useState<Record<string, string>>(() =>
    Object.fromEntries(guests.map((guest) => [guest.guest_id, guest.dietary_note ?? ""])),
  );
  const [done, setDone] = useState(() => isFullyAnswered({ functions: inserts }));
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [responseSeq, setResponseSeq] = useState(0);
  const rsvpKey = useRef<HeldKey | null>(null);
  const dietaryKeys = useRef<Record<string, HeldKey | null>>({});

  const guestName = new Map(guests.map((guest) => [guest.guest_id, guest.full_name]));
  const manyGuests = guests.length > 1;

  function choose(row: StoredAnswer, status: ReplyChoice) {
    const key = answerKey(row.event_id, row.guest_id);
    const current = effectiveAnswer(row, selection);
    setSelection({ ...selection, [key]: { rsvp_status: status, plus_ones: status === "declined" ? 0 : current.plus_ones } });
    setError(null);
  }

  function step(row: StoredAnswer, delta: number) {
    const key = answerKey(row.event_id, row.guest_id);
    const current = effectiveAnswer(row, selection);
    const plus_ones = Math.min(Math.max(0, current.plus_ones + delta), row.max_plus_ones);
    setSelection({ ...selection, [key]: { rsvp_status: "attending", plus_ones } });
  }

  function appendChip(guest_id: string, word: string) {
    const current = notes[guest_id] ?? "";
    if (current.toLocaleLowerCase().includes(word.toLocaleLowerCase())) return;
    const next = current.trim() === "" ? word : `${current.trim().replace(/[,.;]$/, "")}, ${word}`;
    setNotes({ ...notes, [guest_id]: next.slice(0, 200) });
  }

  function failureMessage(result: PostResult): string {
    if (result === "network") return copy.error_network;
    if (result.status === 429) return copy.error_rate_limited;
    if (result.status === 404) return copy.error_gone;
    return copy.error_other;
  }

  async function send() {
    setError(null);
    const body = buildRsvpBody(baseline, selection);
    const changedNotes = guests.filter((guest) => noteOf(notes[guest.guest_id]) !== noteOf(baselineNotes[guest.guest_id]));
    if (body.responses.length === 0 && changedNotes.length === 0) {
      setError(copy.error_nothing_chosen);
      return;
    }
    // Every tap while the same body is shown resends it with the same key (R8): the server
    // answers the second one `replayed`. A new body or a response gets a new key.
    setSending(true);
    let answers = baseline;
    let savedNotes = baselineNotes;
    let ok = true;
    try {
      if (body.responses.length > 0) {
        const held = keyForBody(rsvpKey.current, body, responseSeq);
        rsvpKey.current = held;
        const result = await postJson(routes.api.guestRsvp(token), { idempotency_key: held.key, responses: body.responses });
        if (result !== "network" && result.body?.ok) {
          answers = storedAnswers(result.body.result);
          savedNotes = notesFrom(result.body.result.household.guests);
        } else {
          ok = false;
          setError(failureMessage(result));
        }
      }
      if (ok) {
        for (const guest of changedNotes) {
          const payload = { guest_id: guest.guest_id, dietary_note: noteOf(notes[guest.guest_id]) };
          const held = keyForBody(dietaryKeys.current[guest.guest_id] ?? null, payload, responseSeq);
          dietaryKeys.current[guest.guest_id] = held;
          const result = await postJson(routes.api.guestDietary(token), { idempotency_key: held.key, ...payload });
          if (result !== "network" && result.body?.ok) {
            savedNotes = { ...savedNotes, [guest.guest_id]: payload.dietary_note };
          } else {
            ok = false;
            setError(failureMessage(result));
            break;
          }
        }
      }
    } finally {
      setSending(false);
      setResponseSeq((seq) => seq + 1);
    }
    setLatest({ basis: propsSignature, answers, notes: savedNotes });
    if (ok) {
      setDone(true);
      router.refresh();
    }
  }

  function reopen() {
    setDone(false);
    setError(null);
    setResponseSeq((seq) => seq + 1);
  }

  const summary = inserts.map((insert) => {
    const rows = baseline.filter((row) => row.event_id === insert.event_id);
    const parts = rows.map((row) => {
      const label = RSVP_STATUS_LABELS[effectiveAnswer(row, selection).rsvp_status][lang];
      return manyGuests ? `${guestName.get(row.guest_id) ?? ""}, ${label}` : label;
    });
    return { event_id: insert.event_id, title: lang === "hi" ? insert.title_hi : insert.title, text: parts.join("; ") };
  });

  return (
    <div className="mt-8 space-y-6">
      {inserts.map((insert) => (
        <article
          key={insert.event_id}
          data-insert={insert.event_id}
          className="rounded-paper bg-invite-stock p-6 text-invite-ink shadow-insert"
        >
          <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 className="font-serif text-insert-title text-invite-name">{insert.title}</h2>
            <p lang={hiLang} className={`${hindi_font} text-heading font-medium leading-normal text-invite-name`}>
              {insert.title_hi}
            </p>
          </header>
          <div className="mt-3 space-y-1 text-body">
            {insert.when ? <p>{insert.when}</p> : null}
            {insert.muhurat ? <p>{insert.muhurat}</p> : null}
            {insert.where ? (
              <p className="flex flex-wrap items-center gap-x-3">
                <span>{insert.where}</span>
                {insert.directions_href ? (
                  <a
                    href={insert.directions_href}
                    target="_blank"
                    rel="noreferrer noopener"
                    referrerPolicy="no-referrer"
                    className="inline-flex min-h-11 items-center gap-1 font-medium text-maroon underline underline-offset-4"
                  >
                    <MapPinIcon size={16} aria-hidden />
                    {copy.directions}
                  </a>
                ) : null}
              </p>
            ) : null}
            {insert.dress_code ? (
              <p>
                {copy.dress} {insert.dress_code}
              </p>
            ) : null}
            {insert.description ? <p className="text-ink-2">{insert.description}</p> : null}
          </div>

          {baseline
            .filter((row) => row.event_id === insert.event_id)
            .map((row) => {
              const answer = effectiveAnswer(row, selection);
              const name = `rsvp-${row.event_id}-${row.guest_id}`;
              return (
                <fieldset key={row.guest_id} disabled={done} className="mt-4">
                  <legend className="text-body font-medium">
                    {manyGuests ? guestName.get(row.guest_id) : copy.will_you_come}
                  </legend>
                  <div className="mt-2 flex gap-2">
                    {(["attending", "declined"] as const).map((status) => (
                      <label key={status} className={chip} data-rsvp-choice={status}>
                        <input
                          type="radio"
                          name={name}
                          value={status}
                          checked={answer.rsvp_status === status}
                          onChange={() => choose(row, status)}
                          className="sr-only"
                        />
                        {answer.rsvp_status === status ? <CheckCircleIcon size={20} weight="fill" aria-hidden /> : null}
                        <span>{status === "attending" ? copy.yes : copy.no}</span>
                      </label>
                    ))}
                  </div>
                  {row.max_plus_ones > 0 && answer.rsvp_status === "attending" ? (
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <span className="text-body">{copy.guests_with_you}</span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => step(row, -1)}
                          disabled={done || answer.plus_ones <= 0}
                          aria-label={copy.fewer}
                          className="flex size-11 items-center justify-center rounded-chip border border-line-strong bg-paper text-ink disabled:opacity-50"
                        >
                          <MinusIcon size={20} aria-hidden />
                        </button>
                        <output aria-live="polite" className="min-w-8 text-center text-heading tabular-nums">
                          {answer.plus_ones}
                        </output>
                        <button
                          type="button"
                          onClick={() => step(row, 1)}
                          disabled={done || answer.plus_ones >= row.max_plus_ones}
                          aria-label={copy.more}
                          className="flex size-11 items-center justify-center rounded-chip border border-line-strong bg-paper text-ink disabled:opacity-50"
                        >
                          <PlusIcon size={20} aria-hidden />
                        </button>
                      </div>
                    </div>
                  ) : null}
                </fieldset>
              );
            })}
        </article>
      ))}

      <section aria-labelledby="guest-food-heading" className="rounded-paper bg-invite-stock p-6 text-invite-ink shadow-insert">
        <h2 id="guest-food-heading" className="text-heading">
          {copy.food_heading}
        </h2>
        {guests.map((guest) => {
          const fieldId = `diet-${guest.guest_id}`;
          return (
            <div key={guest.guest_id} className="mt-4">
              {manyGuests ? (
                <label htmlFor={fieldId} className="text-body font-medium">
                  {guest.full_name}
                </label>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-2">
                {copy.food_chips.map((word) => (
                  <button
                    key={word}
                    type="button"
                    disabled={done}
                    onClick={() => appendChip(guest.guest_id, word)}
                    className="min-h-11 rounded-chip border border-line-strong bg-paper px-3 text-body text-ink disabled:opacity-60"
                  >
                    {word}
                  </button>
                ))}
              </div>
              <textarea
                id={fieldId}
                aria-label={manyGuests ? copy.food_for(guest.full_name) : copy.food_heading}
                value={notes[guest.guest_id] ?? ""}
                disabled={done}
                maxLength={200}
                rows={2}
                placeholder={copy.food_placeholder}
                onChange={(event) => setNotes({ ...notes, [guest.guest_id]: event.target.value })}
                className="mt-3 block w-full rounded-control border border-line-strong bg-paper px-3 py-2 text-body text-ink placeholder:text-ink-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-maroon disabled:opacity-70"
              />
            </div>
          );
        })}

        <div role="status" aria-live="polite" className="mt-6">
          {done ? (
            <div className="flex gap-3">
              <CheckCircleIcon size={24} weight="fill" aria-hidden className="mt-0.5 shrink-0 text-paid" />
              <div className="space-y-2">
                <p className="text-body font-medium">{copy.thank_you(thank_name)}</p>
                <ul className="space-y-0.5 text-body text-ink-2">
                  {summary.map((line) => (
                    <li key={line.event_id}>
                      {line.title}: {line.text}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={reopen}
                  className="min-h-11 font-medium text-maroon underline underline-offset-4"
                >
                  {copy.change_reply}
                </button>
              </div>
            </div>
          ) : null}
        </div>

        {!done ? (
          <button
            type="button"
            onClick={send}
            aria-busy={sending}
            className="flex min-h-12 w-full items-center justify-center rounded-control bg-maroon px-4 text-body font-medium text-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-maroon"
          >
            {copy.send}
          </button>
        ) : null}
        {error ? (
          <p role="alert" className="mt-3 text-body text-overdue">
            {error}
          </p>
        ) : null}
        <p className="mt-3 text-meta text-ink-2">{copy.change_later}</p>
      </section>
    </div>
  );
}
