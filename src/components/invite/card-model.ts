/**
 * The exported card's content model (export-and-recovery 1.1 to 1.3). Pure: no server
 * imports, so the render page, the studio preview and tests all build the same card.
 * Every date and time is formatted for Asia/Kolkata (AGENTS.md rule 9).
 */
import type {
  EventId,
  InviteTheme,
  InviteTypeface,
  IsoDate,
  IsoTime,
  PhotoFrame,
  PublicationSnapshot,
  SnapshotEvent,
} from "@/contracts/domain";

/** The card's print size in CSS px, 4:5 (1.4). */
export const CARD_WIDTH_PX = 1080;
export const CARD_HEIGHT_PX = 1350;

/** The card prints at most this many functions, then a "more" line (1.1). */
export const CARD_MAX_FUNCTIONS = 3;

export const CARD_REPLY_LINE = "Kindly reply through your personal invitation link";
export const CARD_REPLY_LINE_NO_FUNCTIONS = "Your personal invitation link lists your functions.";
export const CARD_SAMPLE_FOOTER = "Fictional demo data. AI-generated photo.";

export type CardFunction = {
  event_id: EventId;
  title: string;
  title_hi: string;
  /** "Monday, 14 December 2026" */
  date_line: string;
  /** "7:30 PM onwards", or null when the function has no start time. */
  time_line: string | null;
  /** "Muhurat 11:15 AM" when a muhurat is set. */
  muhurat_line: string | null;
  /** "Lotus Hall, Mallige Gardens, Whitefield, Bengaluru", or null with no venue. */
  venue_line: string | null;
};

export type CardPhoto = { url: string; alt: string };

export type CardModel = {
  theme: InviteTheme;
  /** `tiro_devanagari` sets the three Hindi elements in Tiro Devanagari Hindi (1.3). */
  typeface: InviteTypeface;
  /** `arch` renders as `mounted` until it is built (1.3). */
  photo_frame: PhotoFrame;
  blessing_line: string | null;
  initials: string;
  heading_hi: string;
  lead_in: string | null;
  names: string;
  follow_line: string | null;
  photo: CardPhoto | null;
  functions: CardFunction[];
  /** "and 2 more functions. Your personal invitation link lists them all." */
  more_functions_line: string | null;
  /** With no qualifying function: the wedding date and city (1.1). */
  fallback_date_line: string | null;
  wording_hi: string | null;
  reply_line: string;
  footer: string | null;
};

const IST = "Asia/Kolkata";

/** "Monday, 14 December 2026" for a calendar date, read in IST. */
export function formatCardDate(date: IsoDate): string {
  // Noon IST keeps the calendar day whatever the server's zone.
  const instant = new Date(`${date}T12:00:00+05:30`);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: IST,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("weekday")}, ${part("day")} ${part("month")} ${part("year")}`;
}

/** "7:30 PM" for a wall-clock time "19:30" or "19:30:00". */
export function formatCardTime(time: IsoTime): string {
  const [hh = "0", mm = "00"] = time.split(":");
  const hours = Number.parseInt(hh, 10);
  const suffix = hours < 12 ? "AM" : "PM";
  const twelve = hours % 12 === 0 ? 12 : hours % 12;
  return `${twelve}:${mm.padStart(2, "0")} ${suffix}`;
}

/** Splits `wording_en` at its first blank line: above the names, then below (1.2). */
export function splitWording(wording_en: string | null): { lead_in: string | null; follow_line: string | null } {
  if (!wording_en || wording_en.trim() === "") return { lead_in: null, follow_line: null };
  const normalised = wording_en.replace(/\r\n/g, "\n");
  const match = /\n[ \t]*\n/.exec(normalised);
  if (!match) return { lead_in: normalised.trim(), follow_line: null };
  const first = normalised.slice(0, match.index).trim();
  const second = normalised.slice(match.index + match[0].length).trim();
  return { lead_in: first || null, follow_line: second || null };
}

function initialOf(name: string): string {
  const first = name.trim().charAt(0);
  return first.toLocaleUpperCase("en-IN");
}

function venueLine(event: SnapshotEvent, city: string | null): string | null {
  const venue = event.venue;
  if (!venue) return city;
  const parts = [venue.name, venue.place_name, venue.locality, city].filter(
    (part): part is string => typeof part === "string" && part.trim() !== "",
  );
  // Drop repeats such as a place name equal to the hall name.
  return parts.filter((part, index) => parts.indexOf(part) === index).join(", ");
}

function cardFunction(event: SnapshotEvent, city: string | null): CardFunction {
  return {
    event_id: event.event_id,
    title: event.title,
    title_hi: event.title_hi,
    date_line: formatCardDate(event.event_date),
    time_line: event.start_time ? `${formatCardTime(event.start_time)} onwards` : null,
    muhurat_line: event.muhurat_time ? `Muhurat ${formatCardTime(event.muhurat_time)}` : null,
    venue_line: venueLine(event, city),
  };
}

function startKey(event: SnapshotEvent): string {
  return `${event.event_date}T${event.start_time ?? "99:99"}`;
}

export type BuildCardModelInput = {
  snapshot: PublicationSnapshot;
  /** The job's frozen list (1.1). Null means "every published function" (nobody invited yet). */
  card_event_ids: readonly EventId[] | null;
  is_sample: boolean;
  photo: CardPhoto | null;
};

/** Builds the card from a published snapshot and the job's frozen function list. */
export function buildCardModel({ snapshot, card_event_ids, is_sample, photo }: BuildCardModelInput): CardModel {
  const { wedding, invite_style } = snapshot;
  const wanted = card_event_ids ? new Set(card_event_ids) : null;
  const listed = snapshot.events
    .filter((event) => (wanted ? wanted.has(event.event_id) : true))
    .sort((a, b) => startKey(a).localeCompare(startKey(b)));
  const shown = listed.slice(0, CARD_MAX_FUNCTIONS).map((event) => cardFunction(event, wedding.city));
  const extra = listed.length - shown.length;
  const { lead_in, follow_line } = splitWording(invite_style.wording_en);
  const fallbackDate = [formatCardDate(wedding.wedding_date), wedding.city].filter(Boolean).join(", ");

  return {
    theme: invite_style.theme,
    typeface: invite_style.typeface,
    photo_frame: invite_style.photo_frame,
    blessing_line: invite_style.blessing_line?.trim() ? invite_style.blessing_line.trim() : null,
    initials: `${initialOf(wedding.bride_name)}${initialOf(wedding.groom_name)}`,
    heading_hi: invite_style.heading_hi,
    lead_in,
    names: `${wedding.bride_name} & ${wedding.groom_name}`,
    follow_line,
    photo,
    functions: shown,
    more_functions_line:
      extra > 0
        ? `and ${extra} more ${extra === 1 ? "function" : "functions"}. Your personal invitation link lists them all.`
        : null,
    fallback_date_line: shown.length === 0 ? fallbackDate : null,
    wording_hi: invite_style.wording_hi?.trim() ? invite_style.wording_hi.trim() : null,
    reply_line: shown.length === 0 ? CARD_REPLY_LINE_NO_FUNCTIONS : CARD_REPLY_LINE,
    footer: is_sample ? CARD_SAMPLE_FOOTER : null,
  };
}

/** The one-line summary NudgeBee's approval message and the panel show (5.2). */
export function cardSummary(model: CardModel): string {
  const first = model.functions[0];
  if (!first) return [model.names, model.fallback_date_line].filter(Boolean).join(", ");
  const hall = first.venue_line?.split(",")[0]?.trim() ?? "";
  return [model.names, first.title, first.date_line, hall].filter((part) => part !== "").join(", ");
}
