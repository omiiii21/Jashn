/**
 * The guest routes' wire shapes and the guest view's allowlist copy (domain 4.6, G1 to G3).
 * Pure: no server imports, so the guest routes (server), the reply form (client) and the
 * tests share one definition.
 *
 * A guest-route success body is `{ ok, outcome, command, result }` and nothing else: no
 * `version`, `activity_entry_id` or `warnings` (AT-9.1). The contract's `GuestRsvpResponse`
 * still carries them; see the open question in the guest-site PR.
 */
import type { CommandErrorCode, CommandOutcome } from "@/contracts/commands";
import type { GuestInvitationView, GuestViewFunction, GuestViewVenue } from "@/contracts/domain";

export type GuestCommand = "submit_rsvp" | "set_dietary";

export type GuestSuccessBody<C extends GuestCommand = GuestCommand> = {
  ok: true;
  outcome: CommandOutcome;
  command: C;
  result: GuestInvitationView;
};

export type GuestErrorBody = {
  ok: false;
  error: { code: CommandErrorCode; message: string; field?: string | null };
};

export type GuestReplyBody<C extends GuestCommand = GuestCommand> = GuestSuccessBody<C> | GuestErrorBody;

/** `POST /api/i/{token}/rsvp` and `/dietary` bodies, as the reply form sends them. */
export type GuestRsvpItem = {
  guest_id: string;
  event_id: string;
  rsvp_status: "attending" | "declined";
  plus_ones: number;
};
export type GuestRsvpPayload = { idempotency_key: string; responses: GuestRsvpItem[] };
export type GuestDietaryPayload = { idempotency_key: string; guest_id: string; dietary_note: string | null };

function copyVenue(venue: GuestViewVenue | null): GuestViewVenue | null {
  if (!venue) return null;
  return {
    name: venue.name,
    place_name: venue.place_name,
    locality: venue.locality,
    address: venue.address,
    map_url: venue.map_url,
  };
}

function copyFunction(fn: GuestViewFunction): GuestViewFunction {
  return {
    event_id: fn.event_id,
    event_kind: fn.event_kind,
    title: fn.title,
    title_hi: fn.title_hi,
    starts_at: fn.starts_at,
    ends_at: fn.ends_at,
    muhurat_at: fn.muhurat_at,
    dress_code: fn.dress_code,
    description: fn.description,
    venue: copyVenue(fn.venue),
    responses: fn.responses.map((response) => ({
      guest_id: response.guest_id,
      rsvp_status: response.rsvp_status,
      plus_ones: response.plus_ones,
      max_plus_ones: response.max_plus_ones,
    })),
  };
}

/**
 * Copies the allowed fields of a guest view into a new object (P5, G3). Built by copying,
 * never by deleting, so a field the source gains later never reaches a guest.
 */
export function copyGuestView(view: GuestInvitationView): GuestInvitationView {
  const wedding = view.wedding;
  return {
    revision: view.revision,
    wedding: {
      bride_name: wedding.bride_name,
      groom_name: wedding.groom_name,
      city: wedding.city,
      wedding_date: wedding.wedding_date,
      heading_hi: wedding.heading_hi,
      wording_en: wedding.wording_en,
      wording_hi: wedding.wording_hi,
      blessing_line: wedding.blessing_line,
      theme: wedding.theme,
      typeface: wedding.typeface,
      layout: wedding.layout,
      photo_frame: wedding.photo_frame,
      ...(typeof wedding.photo_url === "string" ? { photo_url: wedding.photo_url } : {}),
    },
    household: {
      name: view.household.name,
      guests: view.household.guests.map((guest) => ({
        guest_id: guest.guest_id,
        full_name: guest.full_name,
        dietary_note: guest.dietary_note,
      })),
    },
    functions: view.functions.map(copyFunction),
  };
}

/** True when a dispatcher result has the guest view's shape (set_dietary's result is untyped). */
export function isGuestView(value: unknown): value is GuestInvitationView {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<GuestInvitationView>;
  return (
    typeof candidate.revision === "number" &&
    !!candidate.wedding &&
    typeof candidate.wedding === "object" &&
    !!candidate.household &&
    Array.isArray(candidate.household.guests) &&
    Array.isArray(candidate.functions)
  );
}

/**
 * The guest page's couple photo, served from the app's own origin (AT-9.5, G6): the signed
 * Storage URL never reaches the browser. The published revision is in the query, so a new
 * photo shows after a publish.
 */
export function guestPhotoPath(token: string, revision: number): string {
  return `/api/i/${encodeURIComponent(token)}/photo?r=${revision}`;
}
