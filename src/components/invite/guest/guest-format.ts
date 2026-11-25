/**
 * Formatting for the guest page (AGENTS 9: every date and time in Asia/Kolkata, the server
 * runs in UTC). Pure; the page formats on the server and hands the client finished strings.
 */
import { APP_TIMEZONE, type AppLanguage, type GuestViewVenue, type IsoDate, type IsoInstant } from "@/contracts/domain";

/** Hindi keeps Latin digits (design-direction 5.3). */
const LOCALES: Record<AppLanguage, string> = { en: "en-IN", hi: "hi-IN-u-nu-latn" };

function partsOf(formatter: Intl.DateTimeFormat, date: Date) {
  const parts = formatter.formatToParts(date);
  return (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
}

/** "Sun 13 Dec 2026, 7:00 pm" (en) or "रवि 13 दिस॰ 2026, 7:00 pm" (hi), in IST. */
export function formatGuestWhen(iso: IsoInstant, lang: AppLanguage): string {
  const formatter = new Intl.DateTimeFormat(LOCALES[lang], {
    timeZone: APP_TIMEZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  const part = partsOf(formatter, new Date(iso));
  return `${part("weekday")} ${part("day")} ${part("month")} ${part("year")}, ${part("hour")}:${part("minute")} ${part("dayPeriod")}`;
}

/** "9:12 pm", in IST. */
export function formatGuestTime(iso: IsoInstant, lang: AppLanguage): string {
  const formatter = new Intl.DateTimeFormat(LOCALES[lang], {
    timeZone: APP_TIMEZONE,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  const part = partsOf(formatter, new Date(iso));
  return `${part("hour")}:${part("minute")} ${part("dayPeriod")}`;
}

/** "14 December 2026" (en) or "14 दिसंबर 2026" (hi). A calendar date, so no zone shift. */
export function formatWeddingDate(isoDate: IsoDate, lang: AppLanguage): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const formatter = new Intl.DateTimeFormat(LOCALES[lang], { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" });
  return formatter.format(new Date(Date.UTC(y, m - 1, d)));
}

function present(parts: (string | null | undefined)[]): string[] {
  const kept = parts.map((part) => part?.trim() ?? "").filter((part) => part !== "");
  return kept.filter((part, index) => kept.indexOf(part) === index);
}

/** "Garden Hall, Mallige Gardens, Whitefield": the hall, the place and the locality. */
export function formatWhere(venue: GuestViewVenue | null): string | null {
  if (!venue) return null;
  const line = present([venue.name, venue.place_name, venue.locality]).join(", ");
  return line === "" ? null : line;
}

/**
 * The Directions link: the venue's own map link when it is an https URL, else a maps search
 * for the hall, place and locality. Opened with no referrer, so the token never leaks (G6).
 */
export function directionsHref(venue: GuestViewVenue | null, city: string | null = null): string | null {
  if (!venue) return null;
  if (venue.map_url && /^https:\/\//i.test(venue.map_url)) return venue.map_url;
  const query = present([venue.name, venue.place_name, venue.locality, city]).join(", ");
  if (query === "") return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/** "MK": the seal's initials, bride first. */
export function coupleInitials(wedding: { bride_name: string; groom_name: string }): string {
  const initial = (name: string) => name.trim().charAt(0).toLocaleUpperCase("en-IN");
  return `${initial(wedding.bride_name)}${initial(wedding.groom_name)}`;
}

/** The name the thank-you line greets: Tara's first name, or "Sharma family" for a larger household. */
export function thankYouName(household: { name: string; guests: { full_name: string }[] }, lang: AppLanguage): string {
  if (household.guests.length === 1) {
    const first = household.guests[0].full_name.trim().split(/\s+/)[0];
    if (first) return first;
  }
  return lang === "hi" ? `${household.name} परिवार` : `${household.name} family`;
}
