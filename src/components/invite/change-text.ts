import type { ChangeEntity, EventKind, JsonPrimitive } from "@/contracts/domain";
import { APP_TIMEZONE, INVITE_THEME_LABELS } from "@/contracts/domain";

/**
 * The words for one snapshot change (domain-and-data 3.2 and 5.3): the publish sheet's
 * row label, and the `{changes}` text of the `itinerary.published` and
 * `invite_style.updated` activity entries. Pure, so the sheet (client) and the handlers
 * (server) share it.
 *
 * REV-3's change reads "reception venue Banyan Hall to Lotus Hall" (domain 3.2, ACT-08),
 * and its row label is "Reception venue". An id is never printed.
 */

/** What a change's `entity_id` names, when it is a function. */
export type ChangeSubject = { event_kind: EventKind; title: string; title_hi: string };

/** Function names by `event_id`, from either snapshot, so a removed function still has its words. */
export type ChangeSubjects = Readonly<Record<string, ChangeSubject>>;

/** The minimum a change needs: `SnapshotChange` and `UnpublishedChange` both fit. */
export type ChangeLike = {
  entity: ChangeEntity;
  entity_id: string;
  field: string;
  from: JsonPrimitive;
  to: JsonPrimitive;
};

type FieldWords = { en: string; hi: string };

const EVENT_FIELDS: Record<string, FieldWords> = {
  venue: { en: "venue", hi: "स्थान" },
  start_time: { en: "start time", hi: "शुरू होने का समय" },
  end_time: { en: "end time", hi: "ख़त्म होने का समय" },
  muhurat_time: { en: "muhurat", hi: "मुहूर्त" },
  event_date: { en: "date", hi: "तारीख़" },
  title: { en: "name", hi: "नाम" },
  title_hi: { en: "Hindi name", hi: "हिंदी नाम" },
  event_kind: { en: "kind", hi: "प्रकार" },
  dress_code: { en: "dress code", hi: "ड्रेस कोड" },
  description: { en: "description", hi: "विवरण" },
};

const VENUE_FIELDS: Record<string, FieldWords> = {
  name: { en: "name", hi: "नाम" },
  place_name: { en: "place", hi: "जगह" },
  locality: { en: "locality", hi: "इलाक़ा" },
  address: { en: "address", hi: "पता" },
  map_url: { en: "map link", hi: "नक्शे का लिंक" },
};

const WEDDING_FIELDS: Record<string, FieldWords> = {
  bride_name: { en: "bride's name", hi: "दुल्हन का नाम" },
  groom_name: { en: "groom's name", hi: "दूल्हे का नाम" },
  city: { en: "city", hi: "शहर" },
  wedding_date: { en: "wedding date", hi: "शादी की तारीख़" },
};

const STYLE_FIELDS: Record<string, FieldWords> = {
  theme: { en: "theme", hi: "रंग" },
  typeface: { en: "typeface", hi: "अक्षर" },
  layout: { en: "layout", hi: "बनावट" },
  photo_frame: { en: "photo frame", hi: "फ़ोटो फ़्रेम" },
  photo_asset_id: { en: "couple photo", hi: "जोड़े की फ़ोटो" },
  heading_hi: { en: "Hindi heading", hi: "हिंदी शीर्षक" },
  wording_en: { en: "English wording", hi: "अंग्रेज़ी शब्द" },
  wording_hi: { en: "Hindi wording", hi: "हिंदी शब्द" },
  blessing_line: { en: "blessing line", hi: "आशीर्वाद पंक्ति" },
};

const TYPEFACE_LABELS: Record<string, string> = {
  eczar: "Eczar",
  tiro_devanagari: "Tiro Devanagari",
};

const LAYOUT_LABELS: Record<string, string> = {
  card_with_inserts: "card with inserts",
  one_card: "one card",
  facing_pages: "facing pages",
};

const FRAME_LABELS: Record<string, string> = {
  mounted: "mounted",
  arch: "arch",
  none: "no frame",
};

/** Words the long text fields are cut to in a sentence, so an entry stays one line. */
const MAX_VALUE_CHARS = 40;

function fieldWords(change: ChangeLike): FieldWords {
  const table =
    change.entity === "event"
      ? EVENT_FIELDS
      : change.entity === "venue"
        ? VENUE_FIELDS
        : change.entity === "wedding"
          ? WEDDING_FIELDS
          : STYLE_FIELDS;
  return table[change.field] ?? { en: change.field.replace(/_/g, " "), hi: change.field.replace(/_/g, " ") };
}

/** "19:30" or "19:30:00" as "7:30 PM". */
export function formatTimeValue(value: string): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(value);
  if (!match) return value;
  const hours = Number(match[1]);
  const suffix = hours >= 12 ? "PM" : "AM";
  const h12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${h12}:${match[2]} ${suffix}`;
}

/** "2026-12-14" as "14 Dec 2026", read as an IST calendar date. */
export function formatDateValue(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const date = new Date(`${value}T12:00:00+05:30`);
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: APP_TIMEZONE }).format(date);
}

function clip(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > MAX_VALUE_CHARS ? `${flat.slice(0, MAX_VALUE_CHARS - 1).trimEnd()}…` : flat;
}

/** One value as a guest-readable word. Null reads "none". Never an id. */
export function formatChangeValue(change: Pick<ChangeLike, "entity" | "field">, value: JsonPrimitive): string {
  if (value === null || value === "") return "none";
  if (typeof value !== "string") return String(value);
  const { entity, field } = change;
  if (entity === "event" && (field === "start_time" || field === "end_time" || field === "muhurat_time")) return formatTimeValue(value);
  if ((entity === "event" && field === "event_date") || (entity === "wedding" && field === "wedding_date")) return formatDateValue(value);
  if (entity === "invite_style") {
    if (field === "theme") return INVITE_THEME_LABELS[value as keyof typeof INVITE_THEME_LABELS] ?? value;
    if (field === "typeface") return TYPEFACE_LABELS[value] ?? value;
    if (field === "layout") return LAYOUT_LABELS[value] ?? value;
    if (field === "photo_frame") return FRAME_LABELS[value] ?? value;
    if (field === "photo_asset_id") return "a photo";
  }
  return clip(value);
}

/** The lowercase kind name, or the title itself for `other` (domain 3.0 placeholders). */
function eventWordEn(subject: ChangeSubject | undefined): string {
  if (!subject) return "function";
  return subject.event_kind === "other" ? subject.title : subject.event_kind;
}

function capitalise(text: string): string {
  return text.length === 0 ? text : text[0].toUpperCase() + text.slice(1);
}

/** The photo reads added, replaced or removed: its id never shows. */
function photoVerb(change: ChangeLike): { en: string; hi: string } {
  if (change.from === null) return { en: "added", hi: "जोड़ी गई" };
  if (change.to === null) return { en: "removed", hi: "हटाई गई" };
  return { en: "replaced", hi: "बदली गई" };
}

/** Long wording reads "changed", not the text. */
function isWordingField(change: ChangeLike): boolean {
  return change.entity === "invite_style" && (change.field === "wording_en" || change.field === "wording_hi");
}

/** The sheet's row label: "Reception venue", "Haldi", "Theme", "Venue Lotus Hall address". */
export function changeLabel(change: ChangeLike, subjects: ChangeSubjects = {}): string {
  const words = fieldWords(change);
  if (change.entity === "event") {
    const subject = subjects[change.entity_id];
    if (change.field === "added" || change.field === "removed") {
      const title = subject?.title ?? (typeof (change.to ?? change.from) === "string" ? String(change.to ?? change.from) : "Function");
      return change.field === "added" ? `${title} added` : `${title} removed`;
    }
    const name = subject ? (subject.event_kind === "other" ? subject.title : capitalise(subject.event_kind)) : "Function";
    return `${name} ${words.en}`;
  }
  if (change.entity === "venue") return `Venue ${words.en}`;
  return capitalise(words.en);
}

/** English `{changes}` item: "reception venue Banyan Hall to Lotus Hall". */
export function changeSentenceEn(change: ChangeLike, subjects: ChangeSubjects = {}): string {
  const words = fieldWords(change);
  const from = formatChangeValue(change, change.from);
  const to = formatChangeValue(change, change.to);
  if (change.entity === "event") {
    const subject = subjects[change.entity_id];
    if (change.field === "added") return `${subject?.title ?? to} added`;
    if (change.field === "removed") return `${subject?.title ?? from} removed`;
    return `${eventWordEn(subject)} ${words.en} ${from} to ${to}`;
  }
  if (change.entity === "invite_style" && change.field === "photo_asset_id") return `couple photo ${photoVerb(change).en}`;
  if (isWordingField(change)) return `${words.en} changed`;
  if (change.entity === "venue") return `venue ${words.en} ${from} to ${to}`;
  return `${words.en} ${from} to ${to}`;
}

/** Hindi `{changes}` item: "रिसेप्शन का स्थान Banyan Hall से Lotus Hall". */
export function changeSentenceHi(change: ChangeLike, subjects: ChangeSubjects = {}): string {
  const words = fieldWords(change);
  const from = formatChangeValue(change, change.from);
  const to = formatChangeValue(change, change.to);
  if (change.entity === "event") {
    const subject = subjects[change.entity_id];
    const name = subject?.title_hi ?? subject?.title ?? "कार्यक्रम";
    if (change.field === "added") return `${name} जोड़ा गया`;
    if (change.field === "removed") return `${name} हटाया गया`;
    return `${name} का ${words.hi} ${from} से ${to}`;
  }
  if (change.entity === "invite_style" && change.field === "photo_asset_id") return `${words.hi} ${photoVerb(change).hi}`;
  if (isWordingField(change)) return `${words.hi} बदले गए`;
  return `${words.hi} ${from} से ${to}`;
}

/** The `{changes}` text of an activity entry, items joined by "; ". */
export function changesTextEn(changes: readonly ChangeLike[], subjects: ChangeSubjects = {}): string {
  return changes.map((change) => changeSentenceEn(change, subjects)).join("; ");
}

export function changesTextHi(changes: readonly ChangeLike[], subjects: ChangeSubjects = {}): string {
  return changes.map((change) => changeSentenceHi(change, subjects)).join("; ");
}
