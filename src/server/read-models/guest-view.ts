import "server-only";

import { and, asc, eq, isNull, sql } from "drizzle-orm";

import {
  EVENT_KINDS,
  INVITE_LAYOUTS,
  INVITE_THEMES,
  INVITE_TYPEFACES,
  PHOTO_FRAMES,
  type AssetDto,
  type EventId,
  type EventKind,
  type GuestActor,
  type GuestId,
  type GuestInvitationView,
  type GuestViewFunction,
  type GuestViewResponse,
  type GuestViewVenue,
  type IsoInstant,
  type RsvpStatus,
} from "@/contracts/domain";
import type { DbOrTx } from "@/db/client";
import { isUuidShaped } from "@/db/ids";
import { istWallClock, toIstInstant } from "@/db/ist";
import { DEFAULT_INVITE_STYLE } from "@/db/itinerary-snapshot";
import { assets, guests, households, invitations, publications, weddings } from "@/db/schema";

/**
 * `guest_invitation_view` (domain 4.6), the only guest read model, and the guest poll's
 * revision read (5.6).
 *
 * Built for the household the token resolved to (G1), only from the publication whose
 * revision equals `weddings.published_revision` (P5) plus that household's live invitation
 * rows (P10, R9). It never reads the draft tables (`events`, `venues`, `invite_styles`).
 *
 * G3: the view is an allowlist. Every field is copied by name into a new object; nothing is
 * spread from a snapshot or a row, so a field added to either later can never leak. The type
 * has no money fields (`GUEST_VIEW_HAS_NO_MONEY_FIELDS` in the contracts) and no `seed_key`
 * (D127). Functions the household isn't actively invited to are absent, not even counted.
 */

// ---------------------------------------------------------------------------
// The pure projection (unit-tested without a database)
// ---------------------------------------------------------------------------

export type GuestViewGuest = { guest_id: GuestId; full_name: string; dietary_note: string | null };

export type GuestViewInvitation = {
  guest_id: GuestId;
  event_id: EventId;
  rsvp_status: RsvpStatus;
  plus_ones: number;
  max_plus_ones: number;
};

export type GuestViewSource = {
  revision: number;
  /** The latest publication's `snapshot` jsonb, as stored (5.3). */
  snapshot: unknown;
  household: { name: string };
  /** The household's guests (not deleted), in display order. */
  guests: readonly GuestViewGuest[];
  /** The household's active invitations (not revoked). Rows for any other guest are ignored. */
  invitations: readonly GuestViewInvitation[];
  /** The couple photo, signed for 1 hour, or null. */
  photo_url: string | null;
};

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);
const objectOr = (value: unknown): Json => (isObject(value) ? value : {});
const text = (value: unknown, fallback = ""): string => (typeof value === "string" ? value : fallback);
const textOrNull = (value: unknown): string | null => (typeof value === "string" ? value : null);
const oneOf = <T extends string>(values: readonly T[], value: unknown, fallback: T): T =>
  typeof value === "string" && (values as readonly string[]).includes(value) ? (value as T) : fallback;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^\d{2}:\d{2}(:\d{2})?$/;

/** The IST instant of a snapshot date and `HH:MM` time; null without a (valid) time. */
function instantOf(date: string, time: unknown): IsoInstant | null {
  if (!DATE_PATTERN.test(date) || typeof time !== "string" || !TIME_PATTERN.test(time)) return null;
  const instant = istWallClock(date, time);
  return Number.isNaN(instant.getTime()) ? null : toIstInstant(instant);
}

function venueOf(value: unknown): GuestViewVenue | null {
  if (!isObject(value)) return null;
  // Copied by name: the snapshot's `venue_id` stays behind.
  return {
    name: text(value.name),
    place_name: textOrNull(value.place_name),
    locality: textOrNull(value.locality),
    address: textOrNull(value.address),
    map_url: textOrNull(value.map_url),
  };
}

/** A count from a row, as a safe non-negative integer (domain 0.1). */
function smallCount(value: unknown): number {
  const number = typeof value === "string" ? Number(value) : value;
  return typeof number === "number" && Number.isSafeInteger(number) && number >= 0 ? number : 0;
}

/**
 * The guest view from its sources, by copying allowed fields only (G3). Functions come in
 * snapshot order; a function appears only when it is in the snapshot and at least one of the
 * household's guests holds an active invitation to it (P10). Responses follow guest order.
 */
export function projectGuestInvitationView(source: GuestViewSource): GuestInvitationView {
  const snapshot = objectOr(source.snapshot);
  const wedding = objectOr(snapshot.wedding);
  const style = objectOr(snapshot.invite_style);
  const snapshotEvents = Array.isArray(snapshot.events) ? snapshot.events.filter(isObject) : [];

  const guestOrder = new Map<GuestId, number>(source.guests.map((guest, index) => [guest.guest_id, index]));
  const invitationsByEvent = new Map<EventId, GuestViewInvitation[]>();
  for (const invitation of source.invitations) {
    if (!guestOrder.has(invitation.guest_id)) continue; // another household's row: never shown (G2)
    const list = invitationsByEvent.get(invitation.event_id) ?? [];
    list.push(invitation);
    invitationsByEvent.set(invitation.event_id, list);
  }

  const functions: GuestViewFunction[] = [];
  const seen = new Set<string>();
  for (const event of snapshotEvents) {
    const event_id = text(event.event_id);
    if (!event_id || seen.has(event_id)) continue;
    const invited = invitationsByEvent.get(event_id);
    if (!invited || invited.length === 0) continue;
    seen.add(event_id);
    const event_date = text(event.event_date);
    const responses: GuestViewResponse[] = [...invited]
      .sort((a, b) => (guestOrder.get(a.guest_id) ?? 0) - (guestOrder.get(b.guest_id) ?? 0))
      .map((invitation) => ({
        guest_id: invitation.guest_id,
        rsvp_status: invitation.rsvp_status,
        plus_ones: smallCount(invitation.plus_ones),
        max_plus_ones: smallCount(invitation.max_plus_ones),
      }));
    functions.push({
      event_id,
      event_kind: oneOf<EventKind>(EVENT_KINDS, event.event_kind, "other"),
      title: text(event.title),
      title_hi: text(event.title_hi),
      starts_at: instantOf(event_date, event.start_time),
      ends_at: instantOf(event_date, event.end_time),
      muhurat_at: instantOf(event_date, event.muhurat_time),
      dress_code: textOrNull(event.dress_code),
      description: textOrNull(event.description),
      venue: venueOf(event.venue),
      responses,
    });
  }

  const view: GuestInvitationView = {
    revision: smallCount(source.revision),
    wedding: {
      bride_name: text(wedding.bride_name),
      groom_name: text(wedding.groom_name),
      city: textOrNull(wedding.city),
      wedding_date: text(wedding.wedding_date),
      heading_hi: text(style.heading_hi, DEFAULT_INVITE_STYLE.heading_hi),
      wording_en: textOrNull(style.wording_en),
      wording_hi: textOrNull(style.wording_hi),
      blessing_line: textOrNull(style.blessing_line),
      theme: oneOf(INVITE_THEMES, style.theme, DEFAULT_INVITE_STYLE.theme),
      typeface: oneOf(INVITE_TYPEFACES, style.typeface, DEFAULT_INVITE_STYLE.typeface),
      layout: oneOf(INVITE_LAYOUTS, style.layout, DEFAULT_INVITE_STYLE.layout),
      photo_frame: oneOf(PHOTO_FRAMES, style.photo_frame, DEFAULT_INVITE_STYLE.photo_frame),
    },
    household: {
      name: source.household.name,
      guests: source.guests.map((guest) => ({
        guest_id: guest.guest_id,
        full_name: guest.full_name,
        dietary_note: guest.dietary_note,
      })),
    },
    functions,
  };
  if (source.photo_url) view.wedding.photo_url = source.photo_url;
  return view;
}

/** The published couple photo's asset id from a snapshot (5.3 keeps it as an id), or null. */
export function snapshotPhotoAssetId(snapshot: unknown): string | null {
  const id = objectOr(objectOr(snapshot).invite_style).photo_asset_id;
  return typeof id === "string" && isUuidShaped(id) ? id : null;
}

// ---------------------------------------------------------------------------
// The database reads
// ---------------------------------------------------------------------------

export type GuestViewOptions = {
  /**
   * Signs the couple photo for a guest (1 hour). Defaults to the Storage adapter's
   * `signingHelpers.couplePhotoUrl(asset, "guest")`, imported lazily. Any failure means no photo.
   */
  signPhoto?: (asset: AssetDto) => Promise<string | null>;
};

async function defaultSignPhoto(asset: AssetDto): Promise<string | null> {
  const storage = await import("@/server/storage");
  return storage.signingHelpers.couplePhotoUrl(asset, "guest");
}

/** The household (in this wedding) and the wedding's published revision; null when either is missing. */
async function loadHead(db: DbOrTx, guest: GuestActor): Promise<{ revision: number; household_name: string } | null> {
  if (!isUuidShaped(guest.wedding_id) || !isUuidShaped(guest.household_id)) return null;
  const [row] = await db
    .select({ published_revision: weddings.published_revision, household_name: households.name })
    .from(weddings)
    .innerJoin(households, and(eq(households.wedding_id, weddings.id), eq(households.id, guest.household_id)))
    .where(eq(weddings.id, guest.wedding_id))
    .limit(1);
  if (!row || row.published_revision === null) return null;
  return { revision: row.published_revision, household_name: row.household_name };
}

async function loadPhotoUrl(db: DbOrTx, wedding_id: string, snapshot: unknown, options: GuestViewOptions): Promise<string | null> {
  const asset_id = snapshotPhotoAssetId(snapshot);
  if (!asset_id) return null;
  try {
    const [asset] = await db
      .select({
        asset_id: assets.id,
        seed_key: assets.seed_key,
        asset_kind: assets.asset_kind,
        storage_path: assets.storage_path,
        mime_type: assets.mime_type,
        bytes: assets.bytes,
        width: assets.width,
        height: assets.height,
      })
      .from(assets)
      .where(and(eq(assets.id, asset_id), eq(assets.wedding_id, wedding_id), eq(assets.asset_kind, "couple_photo")))
      .limit(1);
    if (!asset) return null;
    const url = await (options.signPhoto ?? defaultSignPhoto)(asset);
    return typeof url === "string" && url.length > 0 ? url : null;
  } catch {
    // The card and the page render without a photo (D107); a signing failure is never a 500.
    return null;
  }
}

/**
 * The guest view for a resolved guest actor (4.6). Null when the wedding has nothing
 * published yet, or the household is no longer in that wedding: the route answers the same
 * 404 as for a bad token (G5).
 */
export async function buildGuestInvitationView(
  db: DbOrTx,
  guest: GuestActor,
  options: GuestViewOptions = {},
): Promise<GuestInvitationView | null> {
  const head = await loadHead(db, guest);
  if (!head) return null;

  const [publicationRows, guestRows, invitationRows] = await Promise.all([
    db
      .select({ revision: publications.revision, snapshot: publications.snapshot })
      .from(publications)
      .where(and(eq(publications.wedding_id, guest.wedding_id), eq(publications.revision, head.revision)))
      .limit(1),
    db
      .select({ guest_id: guests.id, full_name: guests.full_name, dietary_note: guests.dietary_note })
      .from(guests)
      .where(and(eq(guests.wedding_id, guest.wedding_id), eq(guests.household_id, guest.household_id), isNull(guests.deleted_at)))
      .orderBy(asc(guests.created_at), sql`${guests.seed_key} asc nulls last`, asc(guests.id)),
    db
      .select({
        guest_id: invitations.guest_id,
        event_id: invitations.event_id,
        rsvp_status: invitations.rsvp_status,
        plus_ones: invitations.plus_ones,
        max_plus_ones: invitations.max_plus_ones,
      })
      .from(invitations)
      .innerJoin(guests, and(eq(guests.id, invitations.guest_id), eq(guests.wedding_id, invitations.wedding_id)))
      .where(
        and(
          eq(invitations.wedding_id, guest.wedding_id),
          eq(guests.household_id, guest.household_id),
          isNull(guests.deleted_at),
          isNull(invitations.revoked_at),
        ),
      ),
  ]);

  const publication = publicationRows[0];
  if (!publication) return null;
  const photo_url = await loadPhotoUrl(db, guest.wedding_id, publication.snapshot, options);

  return projectGuestInvitationView({
    revision: publication.revision,
    snapshot: publication.snapshot,
    household: { name: head.household_name },
    guests: guestRows,
    invitations: invitationRows,
    photo_url,
  });
}

/**
 * `GET /api/i/{token}/revision` (4.6, 5.6): the wedding's `published_revision`, the revision
 * the view is built from. Null when nothing is published or the household is gone, so the
 * poll and the page answer the same 404 (G5).
 */
export async function readGuestRevision(db: DbOrTx, guest: GuestActor): Promise<number | null> {
  const head = await loadHead(db, guest);
  return head ? head.revision : null;
}
