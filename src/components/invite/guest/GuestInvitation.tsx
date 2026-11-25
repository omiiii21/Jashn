import Link from "next/link";
import type { AppLanguage, GuestInvitationView, GuestViewFunction } from "@/contracts/domain";
import { routes } from "@/contracts/routes";
import { splitWording } from "../card-model";
import { GuestReply, type ReplyInsert } from "./GuestReply";
import { GuestSeal } from "./GuestSeal";
import { GUEST_COPY } from "./guest-copy";
import {
  coupleInitials,
  directionsHref,
  formatGuestTime,
  formatGuestWhen,
  formatWeddingDate,
  formatWhere,
  thankYouName,
} from "./guest-format";
import styles from "./guest.module.css";

/**
 * The guest invitation in the stationery register (design-direction §3, §6, 10.6): the
 * seal, the ivory card with its foil hairline, then one insert per function with the RSVP
 * inside. Server-safe: every date and time is formatted here, in IST, and the reply form
 * gets finished strings. It renders only fields of `guest_invitation_view`, copied one by
 * one (P5, G1 to G3): no counts, no amounts, no vendors, no other households.
 */

export type GuestInvitationProps = {
  token: string;
  lang: AppLanguage;
  view: GuestInvitationView;
  /** Sample copies show the "Fictional demo data" badge and the photo's AI label (D21). */
  is_sample: boolean;
};

function startOrder(a: GuestViewFunction, b: GuestViewFunction): number {
  // By start time, functions without one last (AT-4.1 order).
  if (a.starts_at === b.starts_at) return 0;
  if (a.starts_at === null) return 1;
  if (b.starts_at === null) return -1;
  return Date.parse(a.starts_at) - Date.parse(b.starts_at);
}

function toInsert(fn: GuestViewFunction, lang: AppLanguage, city: string | null): ReplyInsert {
  const copy = GUEST_COPY[lang];
  return {
    event_id: fn.event_id,
    title: fn.title,
    title_hi: fn.title_hi,
    when: fn.starts_at ? formatGuestWhen(fn.starts_at, lang) : null,
    muhurat: fn.muhurat_at ? `${copy.muhurat} ${formatGuestTime(fn.muhurat_at, lang)}` : null,
    where: formatWhere(fn.venue),
    directions_href: directionsHref(fn.venue, city),
    dress_code: fn.dress_code,
    description: fn.description,
    responses: fn.responses.map((response) => ({
      guest_id: response.guest_id,
      rsvp_status: response.rsvp_status,
      plus_ones: response.plus_ones,
      max_plus_ones: response.max_plus_ones,
    })),
  };
}

const toggleLink =
  "inline-flex min-h-11 items-center rounded-chip px-3 text-body text-on-maroon-2 underline-offset-4 hover:text-ivory aria-[current=page]:text-ivory aria-[current=page]:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold";

export function GuestInvitation({ token, lang, view, is_sample }: GuestInvitationProps) {
  const copy = GUEST_COPY[lang];
  const wedding = view.wedding;
  const hiLang = lang === "hi" ? undefined : "hi";
  const hindiFont = wedding.typeface === "tiro_devanagari" ? "font-classic" : "font-serif";
  const names = `${wedding.bride_name} & ${wedding.groom_name}`;
  const { lead_in, follow_line } = splitWording(wedding.wording_en);
  const blessing = wedding.blessing_line?.trim() ? wedding.blessing_line.trim() : null;
  const wordingHi = wedding.wording_hi?.trim() ? wedding.wording_hi.trim() : null;
  const dateLine = [names, formatWeddingDate(wedding.wedding_date, lang), wedding.city].filter(Boolean).join(" · ");
  const photoUrl = typeof wedding.photo_url === "string" && /^https:\/\//i.test(wedding.photo_url) ? wedding.photo_url : null;
  const inserts = [...view.functions].sort(startOrder).map((fn) => toInsert(fn, lang, wedding.city));
  const guests = view.household.guests.map((guest) => ({
    guest_id: guest.guest_id,
    full_name: guest.full_name,
    dietary_note: guest.dietary_note,
  }));
  const site = routes.guestSite(token);

  return (
    <main
      lang={lang}
      data-invite-theme={wedding.theme === "peacock_gold" ? "peacock" : undefined}
      className="flex-1 bg-invite-ground px-4 pb-16 pt-4 font-sans text-invite-ink"
    >
      <div className="mx-auto w-full max-w-md">
        <nav aria-label={copy.language_label} className="flex justify-end gap-2">
          <Link href={site} replace scroll={false} lang="en" aria-current={lang === "en" ? "page" : undefined} className={toggleLink}>
            {copy.language_en}
          </Link>
          <Link
            href={`${site}?lang=hi`}
            replace
            scroll={false}
            lang="hi"
            aria-current={lang === "hi" ? "page" : undefined}
            className={toggleLink}
          >
            {copy.language_hi}
          </Link>
        </nav>

        <div className="mt-2 flex justify-center">
          <GuestSeal initials={coupleInitials(wedding)} />
        </div>

        <section aria-label={names} className="relative mt-4 rounded-paper bg-invite-stock px-8 py-12 text-center shadow-insert">
          <div aria-hidden className="pointer-events-none absolute inset-3">
            <svg className="size-full overflow-visible text-invite-foil">
              <rect
                x="0"
                y="0"
                width="100%"
                height="100%"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
                pathLength={1}
                vectorEffect="non-scaling-stroke"
                className={styles.foil}
              />
            </svg>
          </div>

          <p lang={hiLang} className={`${hindiFont} text-title leading-normal text-invite-name`}>
            {wedding.heading_hi}
          </p>
          {blessing ? <p className="mt-3 text-body text-invite-blessing">{blessing}</p> : null}
          {lead_in ? <p className="mt-6 whitespace-pre-line font-serif text-wording">{lead_in}</p> : null}
          <h1 className="mt-4 font-serif text-names text-invite-name">{names}</h1>
          {follow_line ? <p className="mt-4 whitespace-pre-line font-serif text-wording">{follow_line}</p> : null}
          {wordingHi ? (
            <p lang={hiLang} className={`mt-4 ${hindiFont} text-wording leading-loose text-invite-blessing`}>
              {wordingHi}
            </p>
          ) : null}

          {photoUrl ? (
            <figure className="mx-auto mt-8 max-w-full">
              <div
                className={
                  wedding.photo_frame === "arch"
                    ? "overflow-hidden rounded-t-full border border-gold-ink bg-invite-stock p-2"
                    : "border border-gold-ink bg-invite-stock p-2"
                }
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- a signed Storage URL, shown as uploaded, never cropped */}
                <img
                  src={photoUrl}
                  alt={copy.photo_alt(names)}
                  referrerPolicy="no-referrer"
                  className="block h-auto max-w-full"
                />
              </div>
              {is_sample ? <figcaption className="mt-2 text-meta text-ink-2">{copy.photo_label}</figcaption> : null}
            </figure>
          ) : null}

          <p className="mt-8 text-body text-ink-2">{dateLine}</p>
          {is_sample ? (
            <p className="mt-4 inline-flex rounded-chip border border-line-strong px-2 text-meta text-ink-2">
              {copy.sample_badge}
            </p>
          ) : null}
        </section>

        <GuestReply
          token={token}
          lang={lang}
          inserts={inserts}
          guests={guests}
          thank_name={thankYouName(view.household, lang)}
          hindi_font={hindiFont}
        />
      </div>
    </main>
  );
}
