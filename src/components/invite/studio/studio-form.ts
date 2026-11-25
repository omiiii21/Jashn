/**
 * The Invite studio's form logic (design-direction 10.7; domain 3.2 `update_invite_style`).
 * Pure: no React, no server imports, so vitest covers it and the client bundle can use it.
 *
 * The studio keeps three layers of style values:
 * - `server`: the draft style from the page's server read;
 * - `overlay`: values this tab saved, kept until the server read shows a newer value
 *   (fixtures never change, so on fixtures the overlay is what keeps a save visible);
 * - `edits`: what the member has typed or picked and not saved yet.
 * The preview and the fields show `{ ...server, ...overlay, ...edits }`.
 */
import type { CommandErrorBody, CommandInput } from "@/contracts/commands";
import { APP_TIMEZONE } from "@/contracts/domain";
import type { StudioStyle } from "./studio-types";

/** `update_invite_style`'s keys, in form order (commands.ts keeps its own list private). */
export const STYLE_KEYS = [
  "theme",
  "typeface",
  "layout",
  "photo_frame",
  "photo_asset_id",
  "heading_hi",
  "wording_en",
  "wording_hi",
  "blessing_line",
] as const satisfies readonly (keyof StudioStyle)[];
export type StyleKey = (typeof STYLE_KEYS)[number];

/** The text limits of the zod schema (`text(n)` counts after trimming). */
export const STYLE_TEXT_LIMITS = { heading_hi: 40, wording_en: 600, wording_hi: 600, blessing_line: 80 } as const;
type TextKey = keyof typeof STYLE_TEXT_LIMITS;

/** The blessing presets (design-direction §6). None is the default; never a religious mark by default. */
export const BLESSING_PRESETS: readonly { value: string; lang?: "hi" }[] = [
  { value: "॥ श्री गणेशाय नमः ॥", lang: "hi" },
  { value: "Bismillah" },
  { value: "Ik Onkar" },
];

export const WORDING_EN_HINT = "Leave one blank line: the first part prints above the names, the second below them.";

export type StyleEdits = Partial<StudioStyle>;
/** A validation word (`required`, `too_long`) per field. */
export type StyleFieldErrors = Partial<Record<StyleKey, "required" | "too_long">>;

export type SavedOverlay = Partial<
  Record<StyleKey, { value: StudioStyle[StyleKey]; server_at_save: StudioStyle[StyleKey] }>
>;

function isTextKey(key: StyleKey): key is TextKey {
  return key in STYLE_TEXT_LIMITS;
}

/**
 * The value as it would be sent: text trimmed with LF line ends; everything else as is.
 * An emptied heading or wording reads as empty (null); an empty custom blessing stays "",
 * because null means None there.
 */
export function normaliseStyleValue<K extends StyleKey>(key: K, value: StudioStyle[K]): StudioStyle[K] {
  if (typeof value !== "string" || !isTextKey(key)) return value;
  const text = value.replace(/\r\n?/g, "\n").trim();
  if (text === "" && key !== "blessing_line") return null as StudioStyle[K];
  return text as StudioStyle[K];
}

function textError(key: TextKey, value: string | null): "required" | "too_long" | null {
  // Only the blessing line may be cleared (null means None); the other texts aren't nullable.
  if (value === null) return key === "blessing_line" ? null : "required";
  if (value === "") return "required";
  if (value.length > STYLE_TEXT_LIMITS[key]) return "too_long";
  return null;
}

export type StyleEditResult = {
  /** Only the changed, valid keys; null when nothing changed or a changed field is invalid. */
  input: CommandInput<"update_invite_style"> | null;
  /** The keys whose shown value differs from `base`. */
  changed: StyleKey[];
  errors: StyleFieldErrors;
};

/** Compares the shown style with the saved one and builds `update_invite_style`'s input. */
export function styleEdits(base: StudioStyle, shown: StudioStyle): StyleEditResult {
  const input: Record<string, StudioStyle[StyleKey]> = {};
  const changed: StyleKey[] = [];
  const errors: StyleFieldErrors = {};
  for (const key of STYLE_KEYS) {
    const before = normaliseStyleValue(key, base[key]);
    const after = normaliseStyleValue(key, shown[key]);
    if (before === after) continue;
    changed.push(key);
    const error = isTextKey(key) ? textError(key, after as string | null) : null;
    if (error) errors[key] = error;
    else input[key] = after;
  }
  const valid = changed.length > 0 && Object.keys(errors).length === 0;
  return { input: valid ? (input as CommandInput<"update_invite_style">) : null, changed, errors };
}

/** `{ ...server, ...overlay, ...edits }`. */
export function shownStyle(server: StudioStyle, overlay: SavedOverlay, edits: StyleEdits): StudioStyle {
  const saved: StyleEdits = {};
  for (const key of STYLE_KEYS) {
    const entry = overlay[key];
    if (entry) (saved as Record<string, unknown>)[key] = entry.value;
  }
  return { ...server, ...saved, ...edits };
}

/** Records a successful save: each sent key remembers the server value it was saved over. */
export function commitEdits(
  server: StudioStyle,
  overlay: SavedOverlay,
  sent: CommandInput<"update_invite_style">,
): SavedOverlay {
  const next: SavedOverlay = { ...overlay };
  for (const key of STYLE_KEYS) {
    if (!(key in sent)) continue;
    const value = (sent as Record<string, unknown>)[key] as StudioStyle[StyleKey];
    if (value === undefined) continue;
    next[key] = { value, server_at_save: server[key] };
  }
  return next;
}

/**
 * Drops overlay keys the server has moved on from: a newer read shows a value other than
 * the one the save went over (someone else's change, or ours arriving), or shows ours.
 */
export function pruneOverlay(server: StudioStyle, overlay: SavedOverlay): SavedOverlay {
  const next: SavedOverlay = {};
  for (const key of STYLE_KEYS) {
    const entry = overlay[key];
    if (!entry) continue;
    if (server[key] !== entry.server_at_save || server[key] === entry.value) continue;
    next[key] = entry;
  }
  return next;
}

export type BlessingChoice = { kind: "none" } | { kind: "preset"; index: number } | { kind: "custom" };

/** Which blessing option a value shows: None, a preset, or the custom text field. */
export function blessingChoiceOf(value: string | null, custom_mode: boolean): BlessingChoice {
  if (custom_mode) return { kind: "custom" };
  if (value === null) return { kind: "none" };
  const index = BLESSING_PRESETS.findIndex((preset) => preset.value === value.trim());
  return index >= 0 ? { kind: "preset", index } : { kind: "custom" };
}

const REQUIRED_TEXT: Record<TextKey, string> = {
  heading_hi: "Type a Hindi heading, such as शुभ विवाह.",
  wording_en: "Type the English wording. It can't be empty.",
  wording_hi: "Type the Hindi line. It can't be empty.",
  blessing_line: "Type the blessing line, or choose None.",
};

/** The words under a field for a validation word. */
export function validationText(key: StyleKey, word: string): string {
  if (isTextKey(key)) {
    if (word === "required") return REQUIRED_TEXT[key];
    if (word === "too_long") return `Keep this to ${STYLE_TEXT_LIMITS[key]} characters or fewer.`;
  }
  if (key === "photo_asset_id") return "That photo can't be used. Choose the photo again.";
  return "Choose one of the options.";
}

export function isStyleKey(value: string | null | undefined): value is StyleKey {
  return typeof value === "string" && (STYLE_KEYS as readonly string[]).includes(value);
}

/** Where a failed save's error shows: under its field, or above the Save button. */
export function fieldError(body: CommandErrorBody): { key: StyleKey | null; text: string } {
  if (isStyleKey(body.field)) {
    if (body.code === "validation_failed") return { key: body.field, text: validationText(body.field, body.message) };
    if (body.code === "not_found" && body.field === "photo_asset_id") {
      return { key: "photo_asset_id", text: validationText("photo_asset_id", "not_found") };
    }
  }
  if (body.code === "forbidden") {
    return { key: null, text: "Only an owner or a manager of this wedding can change the invitation." };
  }
  const message = body.message?.trim();
  // Validation words ("out_of_range") aren't sentences; everything else is written for people.
  const readable = message && /\s/.test(message) ? message : null;
  return { key: null, text: readable ?? "The draft wasn't saved. Try again." };
}

/** "4:12 pm" in IST (AGENTS.md rule 9). */
export function formatIstTime(at: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: APP_TIMEZONE,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(at);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("hour")}:${part("minute")} ${part("dayPeriod").toLowerCase().replace(/\./g, "")}`;
}

/** The receipt line after a save (design-direction 10.7; proposed copy). */
export function receiptText(display_name: string, at: Date): string {
  return `Saved to the draft by ${display_name}, ${formatIstTime(at)}. Guests see it after an owner publishes.`;
}

/** An idempotency key for one set of edits (I1: 8 to 200 printable characters). */
export function newIdempotencyKey(prefix: string): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === "function") return `${prefix}:${cryptoApi.randomUUID()}`;
  // randomUUID needs a secure context; a phone on a LAN address has getRandomValues only.
  const bytes = new Uint8Array(16);
  cryptoApi.getRandomValues(bytes);
  return `${prefix}:${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}
