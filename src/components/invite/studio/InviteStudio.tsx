"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CheckIcon, CircleNotchIcon, WarningCircleIcon } from "@phosphor-icons/react";

import type { CommandEnvelope, CommandResponse } from "@/contracts/commands";
import {
  INVITE_THEME_LABELS,
  type AssetId,
  type InviteLayout,
  type InviteTheme,
  type InviteTypeface,
  type PhotoFrame,
} from "@/contracts/domain";
import { routes } from "@/contracts/routes";
import { draftCardModel } from "./draft-card";
import { PhotoField } from "./PhotoField";
import { PhotoPicker } from "./PhotoPicker";
import { StudioPreview } from "./StudioPreview";
import { FIELD_CLASS, PRIMARY_BUTTON_CLASS } from "./studio-styles";
import {
  BLESSING_PRESETS,
  blessingChoiceOf,
  commitEdits,
  fieldError,
  newIdempotencyKey,
  pruneOverlay,
  receiptText,
  shownStyle,
  STYLE_KEYS,
  STYLE_TEXT_LIMITS,
  styleEdits,
  validationText,
  WORDING_EN_HINT,
  type SavedOverlay,
  type StyleEdits,
  type StyleKey,
} from "./studio-form";
import type { InviteStudioDraft, StudioStyle } from "./studio-types";

/**
 * Props the Invite page fills from `getInviteStudioDraft(actor, wedding_id)` plus the one
 * command action: `<InviteStudio {...draft} dispatch={dispatchCommand} />` (D98).
 */
export type InviteStudioProps = InviteStudioDraft & {
  dispatch: (envelope: CommandEnvelope) => Promise<CommandResponse>;
};

/** A spinner shows only when a save takes longer than this (DESIGN.md "Buttons"). */
const SPINNER_DELAY_MS = 150;

type Choice<V extends string> = {
  value: V;
  label: ReactNode;
  lang?: "hi";
  /** Shown beside a disabled option: why it can't be picked yet. */
  disabled_reason?: string;
  adornment?: ReactNode;
};

function ChoiceGroup<V extends string>({
  name,
  legend,
  value,
  choices,
  onChange,
  caption,
  error = null,
}: {
  name: string;
  legend: string;
  value: V;
  choices: Choice<V>[];
  onChange: (value: V) => void;
  caption?: string;
  /** A refusal from the last save that belongs to this group, shown under it. */
  error?: string | null;
}) {
  return (
    <fieldset
      className="flex flex-col gap-2"
      aria-describedby={describedBy(caption && `${name}-caption`, error && `${name}-error`)}
    >
      <legend className="mb-2 text-body font-medium text-ink">{legend}</legend>
      {choices.map((choice) => {
        const id = `${name}-${choice.value}`;
        const disabled = Boolean(choice.disabled_reason);
        return (
          <label
            key={choice.value}
            htmlFor={id}
            className={`flex min-h-11 items-center gap-3 rounded-control border px-3 py-2 ${
              disabled
                ? "cursor-not-allowed border-line bg-ivory-deep text-ink-3"
                : "cursor-pointer border-line-strong bg-paper text-ink hover:bg-ivory has-[:checked]:border-ink has-[:checked]:bg-ivory"
            }`}
          >
            <input
              id={id}
              type="radio"
              name={name}
              value={choice.value}
              checked={value === choice.value}
              disabled={disabled}
              onChange={() => onChange(choice.value)}
              aria-describedby={choice.disabled_reason ? `${id}-reason` : undefined}
              className="size-4 shrink-0 accent-ink"
            />
            {choice.adornment}
            <span className="flex min-w-0 flex-col">
              <span lang={choice.lang} className={choice.lang === "hi" ? "leading-[1.6]" : undefined}>
                {choice.label}
              </span>
              {choice.disabled_reason ? (
                <span id={`${id}-reason`} className="text-meta text-ink-3">
                  {choice.disabled_reason}
                </span>
              ) : null}
            </span>
          </label>
        );
      })}
      {caption ? (
        <p id={`${name}-caption`} className="text-meta text-ink-3">
          {caption}
        </p>
      ) : null}
      <FieldError id={`${name}-error`} text={error} />
    </fieldset>
  );
}

function FieldError({ id, text }: { id: string; text: string | null }) {
  if (!text) return null;
  return (
    <p id={id} className="flex items-start gap-2 text-meta text-overdue">
      <WarningCircleIcon size={16} aria-hidden="true" className="mt-1 shrink-0" />
      <span>{text}</span>
    </p>
  );
}

function describedBy(...ids: (string | false | null | undefined)[]): string | undefined {
  const list = ids.filter((id): id is string => typeof id === "string" && id !== "");
  return list.length > 0 ? list.join(" ") : undefined;
}

function ThemeSwatch({ theme }: { theme: InviteTheme }) {
  return (
    <span
      aria-hidden="true"
      data-invite-theme={theme === "peacock_gold" ? "peacock" : undefined}
      className="flex size-6 shrink-0 items-center justify-center rounded-paper bg-invite-ground"
    >
      <span className="size-3 rounded-paper border border-invite-foil bg-invite-stock" />
    </span>
  );
}

/**
 * The minimum Invite studio (design-direction 10.7; AT-7.1's typed path, AT-7.2).
 * Workspace controls on the left, the live stationery preview of the draft on the right;
 * on phones the preview comes first and the controls stack under it. Every change shows
 * in the preview at once. "Save draft" sends one `update_invite_style` with only the
 * changed keys; guests see it only after an owner publishes.
 */
export function InviteStudio(props: InviteStudioProps) {
  const { wedding_id, wedding, events, is_sample, member, dispatch } = props;
  const router = useRouter();

  const [edits, setEdits] = useState<StyleEdits>({});
  const [overlay, setOverlay] = useState<SavedOverlay>({});
  const [lastServerStyle, setLastServerStyle] = useState<StudioStyle>(props.style);
  const [customBlessing, setCustomBlessing] = useState(false);
  const [localPhotos, setLocalPhotos] = useState<Record<AssetId, string>>({});
  const [showErrors, setShowErrors] = useState(false);
  const [serverErrors, setServerErrors] = useState<Partial<Record<StyleKey, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);
  /** A refused save, read out through the polite live region (acceptance 6.5). */
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [spinner, setSpinner] = useState(false);
  const keyFor = useRef<{ body: string; key: string } | null>(null);
  const refreshedForImage = useRef(false);
  const objectUrls = useRef<string[]>([]);

  // A newer server read drops the overlay keys it has moved past (studio-form.ts).
  if (lastServerStyle !== props.style) {
    setLastServerStyle(props.style);
    setOverlay((current) => pruneOverlay(props.style, current));
  }

  useEffect(() => {
    const urls = objectUrls.current;
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  useEffect(() => {
    if (!saving) return;
    const timer = window.setTimeout(() => setSpinner(true), SPINNER_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
      setSpinner(false);
    };
  }, [saving]);

  const base = useMemo(() => shownStyle(props.style, overlay, {}), [props.style, overlay]);
  const shown = useMemo(() => shownStyle(props.style, overlay, edits), [props.style, overlay, edits]);
  const diff = useMemo(() => styleEdits(base, shown), [base, shown]);

  const photoUrl = shown.photo_asset_id
    ? (localPhotos[shown.photo_asset_id] ??
      (props.photo?.asset_id === shown.photo_asset_id ? props.photo.url : null) ??
      props.photos.find((photo) => photo.asset_id === shown.photo_asset_id)?.url ??
      null)
    : null;

  const model = useMemo(
    () => draftCardModel({ wedding, style: shown, events, is_sample, photo_url: photoUrl }),
    [wedding, shown, events, is_sample, photoUrl],
  );

  function edit<K extends StyleKey>(key: K, value: StudioStyle[K]) {
    setEdits((current) => ({ ...current, [key]: value }));
    setServerErrors((current) => {
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
    setFormError(null);
    setReceipt(null);
    setAnnouncement(null);
  }

  function errorFor(key: StyleKey): string | null {
    const clientWord = diff.errors[key];
    if (showErrors && clientWord) return validationText(key, clientWord);
    return serverErrors[key] ?? null;
  }

  async function save() {
    if (saving) return;
    const firstInvalid = STYLE_KEYS.find((key) => diff.errors[key]);
    if (firstInvalid) {
      setShowErrors(true);
      setAnnouncement(`The draft wasn't saved. ${validationText(firstInvalid, diff.errors[firstInvalid] ?? "required")}`);
      return;
    }
    const input = diff.input;
    if (!input) return;

    // One key per set of edits: a repeated press replays instead of writing twice (I1).
    const body = JSON.stringify(input);
    if (keyFor.current?.body !== body) keyFor.current = { body, key: newIdempotencyKey("studio") };
    const serverAtSave = props.style;

    setSaving(true);
    setFormError(null);
    setAnnouncement(null);
    try {
      const response = await dispatch({
        wedding_id,
        command: "update_invite_style",
        input,
        idempotency_key: keyFor.current.key,
        source: "ui",
      });
      // A key names one exact request: any answer, success or refusal, ends it (I1, R8).
      // Only a thrown call (no answer) keeps it, so a resend replays if the first one landed.
      keyFor.current = null;
      if (response.ok) {
        setOverlay((current) => commitEdits(serverAtSave, current, input));
        setEdits({});
        setCustomBlessing(false);
        setShowErrors(false);
        setServerErrors({});
        setReceipt(receiptText(member.display_name, new Date()));
        // The publish sheet needs the new draft_version and unpublished changes (P6, P8).
        router.refresh();
        return;
      }
      const error = fieldError(response.error);
      if (error.key) {
        setServerErrors((current) => ({ ...current, [error.key as StyleKey]: error.text }));
        // The photo's own live region reads its error; every other field's is read here.
        if (error.key !== "photo_asset_id") setAnnouncement(`The draft wasn't saved. ${error.text}`);
      } else {
        setFormError(error.text);
      }
    } catch {
      setFormError("The draft wasn't saved. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  const blessing = blessingChoiceOf(shown.blessing_line, customBlessing);
  const blessingValue =
    blessing.kind === "none" ? "none" : blessing.kind === "preset" ? `preset-${blessing.index}` : "custom";
  const pending = diff.changed.length > 0;

  const wordingEnError = errorFor("wording_en");
  const wordingHiError = errorFor("wording_hi");
  const headingError = errorFor("heading_hi");
  const blessingError = errorFor("blessing_line");

  return (
    <div className="mx-auto grid w-full max-w-content grid-cols-1 gap-6 px-4 pb-8 lg:grid-cols-[25rem_minmax(0,1fr)] lg:gap-8 lg:px-6">
      <form
        aria-label="Invitation settings"
        className="flex min-w-0 flex-col gap-6 rounded-sheet border border-line bg-paper p-4 lg:p-6"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <fieldset className="flex flex-col gap-4">
          <legend className="mb-2 text-body font-medium text-ink">Wording</legend>
          <div className="flex flex-col gap-2">
            <label htmlFor="studio-wording-en" className="text-meta font-medium text-ink-2">
              English
            </label>
            <textarea
              id="studio-wording-en"
              rows={4}
              maxLength={STYLE_TEXT_LIMITS.wording_en}
              value={shown.wording_en ?? ""}
              onChange={(event) => edit("wording_en", event.currentTarget.value)}
              aria-invalid={wordingEnError ? true : undefined}
              aria-describedby={describedBy("studio-wording-en-hint", wordingEnError && "studio-wording-en-error")}
              className={`${FIELD_CLASS} min-h-24 py-2`}
            />
            <p id="studio-wording-en-hint" className="text-meta text-ink-3">
              {WORDING_EN_HINT}
            </p>
            <FieldError id="studio-wording-en-error" text={wordingEnError} />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="studio-wording-hi" className="text-meta font-medium text-ink-2" lang="hi">
              हिंदी
            </label>
            <textarea
              id="studio-wording-hi"
              lang="hi"
              rows={3}
              maxLength={STYLE_TEXT_LIMITS.wording_hi}
              value={shown.wording_hi ?? ""}
              onChange={(event) => edit("wording_hi", event.currentTarget.value)}
              aria-invalid={wordingHiError ? true : undefined}
              aria-describedby={describedBy(wordingHiError && "studio-wording-hi-error")}
              className={`${FIELD_CLASS} min-h-20 py-2 leading-[1.6]`}
            />
            <FieldError id="studio-wording-hi-error" text={wordingHiError} />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="studio-heading-hi" className="text-meta font-medium text-ink-2">
              Hindi heading
            </label>
            <input
              id="studio-heading-hi"
              lang="hi"
              maxLength={STYLE_TEXT_LIMITS.heading_hi}
              value={shown.heading_hi ?? ""}
              onChange={(event) => edit("heading_hi", event.currentTarget.value)}
              aria-invalid={headingError ? true : undefined}
              aria-describedby={describedBy(headingError && "studio-heading-hi-error")}
              className={`${FIELD_CLASS} h-11 leading-[1.6]`}
            />
            <FieldError id="studio-heading-hi-error" text={headingError} />
          </div>
        </fieldset>

        <div className="flex flex-col gap-2">
          <ChoiceGroup
            name="studio-blessing"
            legend="Blessing line"
            value={blessingValue}
            onChange={(value) => {
              if (value === "none") {
                setCustomBlessing(false);
                edit("blessing_line", null);
              } else if (value === "custom") {
                setCustomBlessing(true);
                const current = shown.blessing_line;
                const isPreset = BLESSING_PRESETS.some((preset) => preset.value === current);
                edit("blessing_line", current && !isPreset ? current : "");
              } else {
                const preset = BLESSING_PRESETS[Number(value.slice("preset-".length))];
                setCustomBlessing(false);
                if (preset) edit("blessing_line", preset.value);
              }
            }}
            choices={[
              { value: "none", label: "None" },
              ...BLESSING_PRESETS.map((preset, index) => ({
                value: `preset-${index}`,
                label: preset.value,
                lang: preset.lang,
              })),
              { value: "custom", label: "Your own words" },
            ]}
          />
          {blessing.kind === "custom" ? (
            <>
              <label htmlFor="studio-blessing-text" className="sr-only">
                Blessing line, your own words
              </label>
              <input
                id="studio-blessing-text"
                maxLength={STYLE_TEXT_LIMITS.blessing_line}
                value={shown.blessing_line ?? ""}
                onChange={(event) => edit("blessing_line", event.currentTarget.value)}
                aria-invalid={blessingError ? true : undefined}
                aria-describedby={describedBy(blessingError && "studio-blessing-error")}
                className={`${FIELD_CLASS} h-11 leading-[1.6]`}
              />
            </>
          ) : null}
          <FieldError id="studio-blessing-error" text={blessingError} />
        </div>

        <PhotoPicker
          photos={props.photos}
          selected={shown.photo_asset_id}
          on_select={(asset_id) => edit("photo_asset_id", asset_id)}
          is_sample={is_sample}
          on_image_error={() => {
            if (refreshedForImage.current) return;
            refreshedForImage.current = true;
            router.refresh();
          }}
        />

        <PhotoField
          wedding_id={wedding_id}
          photo_url={photoUrl}
          has_photo={shown.photo_asset_id !== null}
          dispatch={dispatch}
          save_error={serverErrors.photo_asset_id ?? null}
          on_uploaded={({ asset_id, preview_url }) => {
            objectUrls.current.push(preview_url);
            setLocalPhotos((current) => ({ ...current, [asset_id]: preview_url }));
            edit("photo_asset_id", asset_id);
          }}
          on_remove={() => edit("photo_asset_id", null)}
          on_image_error={() => {
            // Member photo URLs live 10 minutes (domain 5.5): one fresh server read.
            if (refreshedForImage.current) return;
            refreshedForImage.current = true;
            router.refresh();
          }}
        />

        <ChoiceGroup<PhotoFrame>
          name="studio-frame"
          legend="Frame"
          value={shown.photo_frame}
          onChange={(value) => edit("photo_frame", value)}
          error={serverErrors.photo_frame ?? null}
          choices={[
            { value: "mounted", label: "Mounted" },
            { value: "arch", label: "Arch", disabled_reason: "The arch frame comes later." },
          ]}
        />

        <ChoiceGroup<InviteLayout>
          name="studio-layout"
          legend="Layout"
          value={shown.layout}
          onChange={(value) => edit("layout", value)}
          error={serverErrors.layout ?? null}
          caption="Layout sets the guest page. The card stays the same."
          choices={[
            { value: "card_with_inserts", label: "Card with inserts" },
            { value: "one_card", label: "One card", disabled_reason: "Comes later." },
            { value: "facing_pages", label: "Facing pages, Hindi and English", disabled_reason: "Comes later." },
          ]}
        />

        <ChoiceGroup<InviteTheme>
          name="studio-theme"
          legend="Colours"
          value={shown.theme}
          onChange={(value) => edit("theme", value)}
          error={serverErrors.theme ?? null}
          choices={(["maroon_gold", "peacock_gold"] as const).map((theme) => ({
            value: theme,
            label: INVITE_THEME_LABELS[theme],
            adornment: <ThemeSwatch theme={theme} />,
          }))}
        />

        <ChoiceGroup<InviteTypeface>
          name="studio-typeface"
          legend="Typeface"
          value={shown.typeface}
          onChange={(value) => edit("typeface", value)}
          error={serverErrors.typeface ?? null}
          caption="The typeface sets the Hindi heading and the Hindi lines."
          choices={[
            { value: "eczar", label: "Eczar" },
            { value: "tiro_devanagari", label: "Tiro Devanagari, classic" },
          ]}
        />

        <div className="flex flex-col gap-1">
          <p className="text-body font-medium text-ink">Functions on the invite</p>
          <p className="text-meta text-ink-3">
            Taken from Events.{" "}
            <Link href={routes.events(wedding_id)} className="text-ink-2 underline underline-offset-4">
              Edit them in Events.
            </Link>
          </p>
        </div>

        <div className="sticky bottom-0 -mx-4 flex flex-col gap-2 border-t border-line bg-paper px-4 py-3 lg:-mx-6 lg:px-6">
          <div aria-live="polite">
            <FieldError id="studio-form-error" text={formError} />
            {announcement ? <p className="sr-only">{announcement}</p> : null}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={!pending || saving}
              aria-describedby={formError ? "studio-form-error" : undefined}
              className={PRIMARY_BUTTON_CLASS}
            >
              {spinner ? <CircleNotchIcon size={16} aria-hidden="true" className="animate-spin" /> : null}
              Save draft
            </button>
            <p className="text-meta text-ink-3">
              {pending ? "Unsaved changes" : receipt ? null : "No changes to save"}
            </p>
          </div>
          <p aria-live="polite" className="text-meta text-ink-2">
            {receipt ? (
              <span className="flex items-start gap-2">
                <CheckIcon size={16} aria-hidden="true" className="mt-1 shrink-0 text-paid" />
                <span>{receipt}</span>
              </span>
            ) : null}
          </p>
        </div>
      </form>

      <section aria-label="Invitation preview" className="order-first flex min-w-0 flex-col gap-3 lg:order-none">
        <div className="lg:sticky lg:top-6">
          <div className="rounded-sheet bg-ivory-deep p-4 lg:p-8">
            <div className="mx-auto w-full max-w-80 lg:max-w-[30rem]">
              <StudioPreview
                model={model}
                label={`Invitation preview: ${INVITE_THEME_LABELS[shown.theme]}, ${model.names}${photoUrl ? ", with the couple photo" : ""}.`}
              />
            </div>
          </div>
          <div className="mt-3 flex flex-col gap-1">
            <p className="text-meta text-ink-2">The preview shows the draft. Guests see it after an owner publishes.</p>
            <p className="text-meta text-ink-3">The exported card lists the functions every invited guest is invited to.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
