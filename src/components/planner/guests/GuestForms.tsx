"use client";

import { CheckCircle } from "@phosphor-icons/react";
import { useId, useState } from "react";

import { cx } from "@/components/planner/kit/cx";
import { Field, FormError, INPUT, PRIMARY, QUIET, Receipt, SECONDARY } from "@/components/planner/money/form-parts";
import type { CommandEnvelope } from "@/contracts/commands";
import type { WeddingId } from "@/contracts/domain";

import type { Dispatch } from "../forms/command";
import { useCommand } from "../forms/useCommand";

export type FunctionOption = { event_id: string; title: string };
export type HouseholdOption = { household_id: string; household_name: string };

const CHOICE = "flex min-h-11 items-center gap-3 rounded-control px-2 text-body text-ink hover:bg-ivory-deep";
const FORM = "flex flex-col gap-4 rounded-paper border border-line bg-ivory p-4";
const NEW_HOUSEHOLD = "__new__";

/** Whole number 0–10 from the plus-ones field, or a message. Empty means "not sent". */
function parsePlusOnes(raw: string): { ok: true; value: number | undefined } | { ok: false; message: string } {
  const text = raw.trim();
  if (text === "") return { ok: true, value: undefined };
  if (!/^\d{1,2}$/.test(text) || Number(text) > 10) return { ok: false, message: "Use a whole number from 0 to 10." };
  return { ok: true, value: Number(text) };
}

function FunctionChecks({
  legend,
  functions,
  picked,
  onChange,
}: {
  legend: string;
  functions: FunctionOption[];
  picked: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="mb-1 text-table font-medium text-ink">{legend}</legend>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {functions.map((fn) => (
          <label key={fn.event_id} className={CHOICE}>
            <input
              type="checkbox"
              className="size-5 shrink-0 accent-maroon"
              checked={picked.includes(fn.event_id)}
              onChange={(event) =>
                onChange(event.target.checked ? [...picked, fn.event_id] : picked.filter((id) => id !== fn.event_id))
              }
            />
            <span>{fn.title}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * Add a guest (`add_guest`). Owners pick functions, plus-ones and a phone number; a manager's
 * save is "limited" (permissions 3.4): no functions, no plus-ones, and no household with an
 * active link. Link status isn't in the read model yet, so a manager may only start a new
 * household. Never optimistic; the receipt stays.
 */
export function AddGuestForm({
  wedding_id,
  dispatch,
  isOwner,
  functions,
  households,
}: {
  wedding_id: WeddingId;
  dispatch: Dispatch;
  isOwner: boolean;
  functions: FunctionOption[];
  households: HouseholdOption[];
}) {
  const { state, submit, reset, saving } = useCommand(dispatch);
  const id = useId();
  const pickable = isOwner ? households : [];

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [household, setHousehold] = useState<string>(pickable[0]?.household_id ?? NEW_HOUSEHOLD);
  const [householdName, setHouseholdName] = useState("");
  const [relation, setRelation] = useState("");
  const [dietary, setDietary] = useState("");
  const [phone, setPhone] = useState("");
  const [events, setEvents] = useState<string[]>([]);
  const [plusOnes, setPlusOnes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [added, setAdded] = useState<string | null>(null);

  function changed() {
    if (state.status === "error") reset();
    setAdded(null);
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next: Record<string, string> = {};
    const fullName = name.trim();
    if (!fullName) next.name = "Enter the guest's full name.";
    else if (fullName.length > 80) next.name = "Keep the name to 80 characters or fewer.";
    const isNew = household === NEW_HOUSEHOLD;
    if (isNew && !householdName.trim()) next.household_name = "Name the new household, like Sharma family.";
    else if (isNew && householdName.trim().length > 80) next.household_name = "Keep it to 80 characters or fewer.";
    if (relation.trim().length > 80) next.relation = "Keep it to 80 characters or fewer.";
    if (dietary.trim().length > 200) next.dietary = "Keep the note to 200 characters or fewer.";
    if (isOwner && phone.trim() && !/^\+?[0-9 ]{1,20}$/.test(phone.trim())) {
      next.phone = "Use digits and spaces, with an optional + at the start.";
    }
    const plus = parsePlusOnes(plusOnes);
    if (isOwner && !plus.ok) next.plus_ones = plus.message;
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    const input: Extract<CommandEnvelope, { command: "add_guest" }>["input"] = { full_name: fullName };
    if (isNew) input.household_name = householdName.trim();
    else input.household_id = household;
    if (relation.trim()) input.relation = relation.trim();
    if (dietary.trim()) input.dietary_note = dietary.trim();
    if (isOwner) {
      if (phone.trim()) input.phone = phone.trim();
      if (events.length > 0) input.event_ids = events;
      if (plus.ok && plus.value !== undefined) input.max_plus_ones = plus.value;
    }
    const response = await submit({ wedding_id, command: "add_guest", input, source: "ui" });
    if (response.ok) {
      setAdded(fullName);
      setName("");
      setRelation("");
      setDietary("");
      setPhone("");
      setHouseholdName("");
      setEvents([]);
      setPlusOnes("");
    }
  }

  const describe = (key: string, fieldId: string) => (errors[key] ? `${fieldId}-error` : undefined);

  return (
    <section aria-labelledby={`${id}-heading`} className="flex flex-col gap-3">
      <h2 id={`${id}-heading`} className="sr-only">
        Add a guest
      </h2>
      <div>
        <button
          type="button"
          className={SECONDARY}
          aria-expanded={open}
          aria-controls={open ? `${id}-form` : undefined}
          onClick={() => {
            setOpen(!open);
            setErrors({});
            if (!open) setAdded(null);
          }}
        >
          Add a guest
        </button>
      </div>

      {open ? (
        <form id={`${id}-form`} aria-label="Add a guest" onSubmit={onSubmit} className={FORM} noValidate>
          <div className="grid gap-4 md:grid-cols-2">
            <Field id={`${id}-name`} label="Full name" error={errors.name}>
              <input
                id={`${id}-name`}
                className={INPUT}
                value={name}
                maxLength={80}
                autoComplete="off"
                aria-invalid={errors.name ? true : undefined}
                aria-describedby={describe("name", `${id}-name`)}
                onChange={(event) => {
                  setName(event.target.value);
                  changed();
                }}
              />
            </Field>

            <Field id={`${id}-household`} label="Household">
              <select
                id={`${id}-household`}
                className={INPUT}
                value={household}
                aria-describedby={isOwner ? undefined : `${id}-household-note`}
                onChange={(event) => {
                  setHousehold(event.target.value);
                  changed();
                }}
              >
                {pickable.map((item) => (
                  <option key={item.household_id} value={item.household_id}>
                    {item.household_name}
                  </option>
                ))}
                <option value={NEW_HOUSEHOLD}>New household</option>
              </select>
              {isOwner ? null : (
                <span id={`${id}-household-note`} className="text-meta text-ink-2">
                  Managers add guests into a new household. Only an owner can add to a household that may already
                  have an invite link.
                </span>
              )}
            </Field>

            {household === NEW_HOUSEHOLD ? (
              <Field id={`${id}-hname`} label="New household name" error={errors.household_name}>
                <input
                  id={`${id}-hname`}
                  className={INPUT}
                  value={householdName}
                  maxLength={80}
                  autoComplete="off"
                  aria-invalid={errors.household_name ? true : undefined}
                  aria-describedby={describe("household_name", `${id}-hname`)}
                  onChange={(event) => {
                    setHouseholdName(event.target.value);
                    changed();
                  }}
                />
              </Field>
            ) : null}

            <Field id={`${id}-relation`} label="Relation (optional)" error={errors.relation}>
              <input
                id={`${id}-relation`}
                className={INPUT}
                value={relation}
                maxLength={80}
                autoComplete="off"
                aria-invalid={errors.relation ? true : undefined}
                aria-describedby={describe("relation", `${id}-relation`)}
                onChange={(event) => {
                  setRelation(event.target.value);
                  changed();
                }}
              />
            </Field>

            <Field id={`${id}-dietary`} label="Dietary note (optional)" error={errors.dietary}>
              <input
                id={`${id}-dietary`}
                className={INPUT}
                value={dietary}
                maxLength={200}
                autoComplete="off"
                aria-invalid={errors.dietary ? true : undefined}
                aria-describedby={describe("dietary", `${id}-dietary`)}
                onChange={(event) => {
                  setDietary(event.target.value);
                  changed();
                }}
              />
            </Field>

            {isOwner ? (
              <Field id={`${id}-phone`} label="Phone (optional)" error={errors.phone}>
                <input
                  id={`${id}-phone`}
                  className={INPUT}
                  type="tel"
                  inputMode="tel"
                  value={phone}
                  autoComplete="off"
                  aria-invalid={errors.phone ? true : undefined}
                  aria-describedby={describe("phone", `${id}-phone`)}
                  onChange={(event) => {
                    setPhone(event.target.value);
                    changed();
                  }}
                />
              </Field>
            ) : null}
          </div>

          {isOwner ? (
            <>
              <FunctionChecks
                legend="Invite to"
                functions={functions}
                picked={events}
                onChange={(next) => {
                  setEvents(next);
                  changed();
                }}
              />
              <div className="max-w-40">
                <Field id={`${id}-plus`} label="Plus-ones allowed" error={errors.plus_ones}>
                  <input
                    id={`${id}-plus`}
                    className={INPUT}
                    inputMode="numeric"
                    value={plusOnes}
                    placeholder="0"
                    autoComplete="off"
                    aria-invalid={errors.plus_ones ? true : undefined}
                    aria-describedby={describe("plus_ones", `${id}-plus`)}
                    onChange={(event) => {
                      setPlusOnes(event.target.value);
                      changed();
                    }}
                  />
                </Field>
              </div>
            </>
          ) : (
            <p className="text-meta text-ink-2">An owner chooses which functions this guest is invited to.</p>
          )}

          <FormError state={state} />

          <div className="flex flex-wrap gap-2">
            <button type="submit" className={PRIMARY} disabled={saving}>
              {saving ? "Saving…" : "Add guest"}
            </button>
            <button
              type="button"
              className={SECONDARY}
              onClick={() => {
                setOpen(false);
                setErrors({});
                if (state.status === "error") reset();
              }}
            >
              Close
            </button>
          </div>
        </form>
      ) : null}

      {added ? (
        <Receipt>
          <span className="inline-flex items-start gap-2">
            <CheckCircle size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-paid" />
            Added {added}.
          </span>
        </Receipt>
      ) : null}
    </section>
  );
}

/** Owner only: the functions a named guest is invited to, sent as the full list (`set_invitations`). */
export function EditInvitations({
  wedding_id,
  dispatch,
  guest_id,
  guestName,
  functions,
  invited,
}: {
  wedding_id: WeddingId;
  dispatch: Dispatch;
  guest_id: string;
  guestName: string;
  functions: FunctionOption[];
  invited: string[];
}) {
  const { state, submit, reset, saving } = useCommand(dispatch);
  const id = useId();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>(invited);
  const [plusOnes, setPlusOnes] = useState("");
  const [plusError, setPlusError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const plus = parsePlusOnes(plusOnes);
    if (!plus.ok) {
      setPlusError(plus.message);
      return;
    }
    setPlusError(null);
    const input: Extract<CommandEnvelope, { command: "set_invitations" }>["input"] = { guest_id, event_ids: picked };
    if (plus.value !== undefined) input.max_plus_ones = plus.value;
    const response = await submit({ wedding_id, command: "set_invitations", input, source: "ui" });
    if (response.ok) {
      setSaved(true);
      setOpen(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div>
        <button
          type="button"
          className={QUIET}
          aria-expanded={open}
          aria-controls={open ? `${id}-form` : undefined}
          aria-label={`Edit invitations for ${guestName}`}
          onClick={() => {
            if (!open) {
              setPicked(invited);
              setSaved(false);
            } else if (state.status === "error") reset();
            setOpen(!open);
          }}
        >
          Edit invitations
        </button>
      </div>
      {open ? (
        <form
          id={`${id}-form`}
          aria-label={`Invitations for ${guestName}`}
          onSubmit={onSubmit}
          className={FORM}
          noValidate
        >
          <FunctionChecks
            legend={`Invite ${guestName} to`}
            functions={functions}
            picked={picked}
            onChange={(next) => {
              setPicked(next);
              if (state.status === "error") reset();
            }}
          />
          <div className="max-w-40">
            <Field id={`${id}-plus`} label="Plus-ones allowed" error={plusError}>
              <input
                id={`${id}-plus`}
                className={INPUT}
                inputMode="numeric"
                value={plusOnes}
                autoComplete="off"
                aria-invalid={plusError ? true : undefined}
                aria-describedby={plusError ? `${id}-plus-error` : `${id}-plus-note`}
                onChange={(event) => setPlusOnes(event.target.value)}
              />
            </Field>
            <span id={`${id}-plus-note`} className="text-meta text-ink-3">
              Leave empty to keep the current number.
            </span>
          </div>
          <FormError state={state} />
          <div className="flex flex-wrap gap-2">
            <button type="submit" className={PRIMARY} disabled={saving}>
              {saving ? "Saving…" : "Save invitations"}
            </button>
            <button
              type="button"
              className={SECONDARY}
              onClick={() => {
                setOpen(false);
                if (state.status === "error") reset();
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}
      {saved ? <Receipt>Invitations saved for {guestName}.</Receipt> : null}
    </div>
  );
}

/**
 * Owner only: make a fresh invite link for one household (rotating any earlier one) or turn
 * it off. The new URL is shown once, kept only in this component's state.
 */
export function HouseholdLinks({
  wedding_id,
  dispatch,
  household_id,
  householdName,
}: {
  wedding_id: WeddingId;
  dispatch: Dispatch;
  household_id: string;
  householdName: string;
}) {
  const make = useCommand(dispatch);
  const revoke = useCommand(dispatch);
  const id = useId();
  const [confirm, setConfirm] = useState<"make" | "revoke" | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function onMake() {
    const response = await make.submit({
      wedding_id,
      command: "create_invitation_links",
      input: { household_ids: [household_id], rotate: true },
      source: "ui",
    });
    if (response.ok) {
      setConfirm(null);
      const result = response.result as { links?: { household_id: string; url?: string }[]; tokens_already_issued?: boolean };
      const link = result.links?.find((item) => item.household_id === household_id)?.url ?? null;
      setUrl(link);
      setNote(link ? null : "The link was made earlier and can't be shown again. Make a new one to copy it.");
    }
  }

  async function onRevoke() {
    const response = await revoke.submit({
      wedding_id,
      command: "revoke_invitation_link",
      input: { household_id },
      source: "ui",
    });
    if (response.ok) {
      setConfirm(null);
      setUrl(null);
      setNote("Link turned off.");
    }
  }

  async function onCopy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
      setNote("Copy didn't work here. Select the link and copy it.");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={QUIET}
          aria-label={`New invite link for the ${householdName} household`}
          aria-expanded={confirm === "make"}
          onClick={() => {
            setConfirm(confirm === "make" ? null : "make");
            setNote(null);
            make.reset();
          }}
        >
          New invite link
        </button>
        <button
          type="button"
          className={QUIET}
          aria-label={`Turn off link for the ${householdName} household`}
          aria-expanded={confirm === "revoke"}
          onClick={() => {
            setConfirm(confirm === "revoke" ? null : "revoke");
            setNote(null);
            revoke.reset();
          }}
        >
          Turn off link
        </button>
      </div>

      {confirm === "make" ? (
        <div role="group" aria-labelledby={`${id}-make`} className={FORM}>
          <p id={`${id}-make`} className="text-body text-ink">
            Any earlier link for this household will stop working.
          </p>
          <FormError state={make.state} />
          <div className="flex flex-wrap gap-2">
            <button type="button" className={PRIMARY} disabled={make.saving} onClick={onMake}>
              {make.saving ? "Making…" : "Make link"}
            </button>
            <button type="button" className={SECONDARY} onClick={() => setConfirm(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {confirm === "revoke" ? (
        <div role="group" aria-labelledby={`${id}-revoke`} className={FORM}>
          <p id={`${id}-revoke`} className="text-body text-ink">
            Guests with the old link will no longer see the invitation.
          </p>
          <FormError state={revoke.state} />
          <div className="flex flex-wrap gap-2">
            <button type="button" className={PRIMARY} disabled={revoke.saving} onClick={onRevoke}>
              {revoke.saving ? "Turning off…" : "Turn off link"}
            </button>
            <button type="button" className={SECONDARY} onClick={() => setConfirm(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {url ? (
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-url`} className="text-table font-medium text-ink">
            Invite link for the {householdName} household
          </label>
          <div className="flex flex-wrap gap-2">
            <input
              id={`${id}-url`}
              className={cx(INPUT, "min-w-0 flex-1")}
              value={url}
              readOnly
              aria-describedby={`${id}-url-note`}
              onFocus={(event) => event.currentTarget.select()}
            />
            <button type="button" className={SECONDARY} onClick={onCopy}>
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>
          <span id={`${id}-url-note`} className="text-meta text-ink-2">
            Shown once. Copy it now.
          </span>
        </div>
      ) : null}

      {note ? <Receipt>{note}</Receipt> : null}
    </div>
  );
}
