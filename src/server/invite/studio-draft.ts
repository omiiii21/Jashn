import "server-only";

import { and, asc, eq } from "drizzle-orm";

import { CommandFailure } from "@/contracts/commands";
import { DEFAULT_HEADING_HI, type AssetDto, type AssetId, type InviteStyleDto, type SeedKey, type SessionActor, type WeddingId } from "@/contracts/domain";
import { getDemoFixture } from "@/contracts/fixtures";
import { getDb } from "@/db/client";
import { SAMPLE_COPIES, seededId } from "@/db/ids";
import { assets, inviteStyles } from "@/db/schema";
import { isLiveAuth } from "@/server/auth/session";
import { signingHelpers } from "@/server/storage";
import { toSnapshotEvent } from "@/components/invite/studio/draft-card";
import type { InviteStudioDraft, StudioPhoto, StudioStyle } from "@/components/invite/studio/studio-types";
import { services } from "@/server/services";

/**
 * The Invite studio's server read (design-direction 10.7): the draft wedding, functions,
 * invite style and couple photo for one member. The page calls it after `requireMember`
 * and passes the result straight to `<InviteStudio>` with `dispatchCommand`.
 *
 * The wedding and the functions come through the `wedding_profile` and `itinerary` read
 * models (AGENTS.md rule 4). No read model carries the draft invite style or the photo
 * yet, so this module reads them itself (CLAUDE.local part 2, rule 2): from the fixtures
 * while `services` is the fixture implementation, and from Lane A's tables once
 * `src/db/schema.ts` merges (the TODO below).
 */
export async function getInviteStudioDraft(actor: SessionActor, wedding_id: WeddingId): Promise<InviteStudioDraft> {
  const [profile, itinerary] = await Promise.all([
    services.read("wedding_profile", { actor, wedding_id }),
    services.read("itinerary", { actor, wedding_id }),
  ]);
  const { style, photo, photos } = await readDraftStyle(wedding_id);

  return {
    wedding_id,
    wedding: {
      bride_name: profile.bride_name,
      groom_name: profile.groom_name,
      city: profile.city,
      wedding_date: profile.wedding_date,
    },
    style,
    events: itinerary.functions.map(toSnapshotEvent),
    photo,
    photos,
    is_sample: profile.is_sample,
    member: { display_name: profile.member.display_name, role: profile.member.role },
  };
}

/** The style a wedding has before anyone opens the studio (domain 5.1 column defaults). */
function defaultStyle(): StudioStyle {
  return {
    theme: "maroon_gold",
    typeface: "eczar",
    layout: "card_with_inserts",
    photo_frame: "mounted",
    photo_asset_id: null,
    heading_hi: DEFAULT_HEADING_HI,
    wording_en: null,
    wording_hi: null,
    blessing_line: null,
  };
}

function withoutSeedKey(style: InviteStyleDto): StudioStyle {
  const { seed_key: _seedKey, ...rest } = style;
  void _seedKey;
  return rest;
}

/** The photo row for the style: no URL while the row has no file yet (D126). */
async function photoFor(
  style: StudioStyle,
  assets: readonly AssetDto[],
  sign: (asset: AssetDto) => Promise<string | null>,
): Promise<StudioPhoto | null> {
  if (!style.photo_asset_id) return null;
  const asset = assets.find((row) => row.asset_id === style.photo_asset_id && row.asset_kind === "couple_photo");
  if (!asset) return { asset_id: style.photo_asset_id, url: null };
  const url = asset.bytes === null ? null : await sign(asset);
  return { asset_id: asset.asset_id, url };
}

function fixtureCopyOf(wedding_id: WeddingId) {
  return SAMPLE_COPIES.find((copy) => seededId(copy, "weddings", "WEDDING") === wedding_id) ?? null;
}

type DraftStyleRead = { style: StudioStyle; photo: StudioPhoto | null; photos: StudioPhoto[] };

const signMember = (asset: AssetDto) => signingHelpers.couplePhotoUrl(asset, "member").catch(() => null);

/** Every couple photo, signed for a member; a row with no file yet has no URL (D126). */
async function signAll(rows: readonly AssetDto[], sign: (asset: AssetDto) => Promise<string | null>): Promise<StudioPhoto[]> {
  const couple = rows.filter((row) => row.asset_kind === "couple_photo");
  return Promise.all(couple.map(async (asset) => ({ asset_id: asset.asset_id, url: asset.bytes === null ? null : await sign(asset) })));
}

async function readDraftStyle(wedding_id: WeddingId): Promise<DraftStyleRead> {
  if (isLiveAuth()) return readLiveDraftStyle(wedding_id);

  const copy = fixtureCopyOf(wedding_id);
  if (!copy) throw new CommandFailure({ code: "not_found", message: "Wedding not found." });
  const fixture = getDemoFixture(copy);
  const style = withoutSeedKey(fixture.invite_style);
  // Fixtures sign nothing, so a photo shows only once uploaded in this tab.
  const unsigned = async () => null;
  return { style, photo: await photoFor(style, fixture.assets, unsigned), photos: await signAll(fixture.assets, unsigned) };
}

/** Lane A's tables: the wedding's `invite_styles` row and its couple photos (rule 2). */
async function readLiveDraftStyle(wedding_id: WeddingId): Promise<DraftStyleRead> {
  const db = getDb();
  const [row] = await db.select().from(inviteStyles).where(eq(inviteStyles.wedding_id, wedding_id));
  const assetRows = await db
    .select()
    .from(assets)
    .where(and(eq(assets.wedding_id, wedding_id), eq(assets.asset_kind, "couple_photo")))
    .orderBy(asc(assets.created_at), asc(assets.id));
  const dtos: AssetDto[] = assetRows.map((asset) => ({
    asset_id: asset.id as AssetId,
    seed_key: asset.seed_key as SeedKey | null,
    asset_kind: asset.asset_kind,
    storage_path: asset.storage_path,
    mime_type: asset.mime_type,
    bytes: asset.bytes,
    width: asset.width,
    height: asset.height,
  }));
  const style: StudioStyle = row
    ? {
        theme: row.theme,
        typeface: row.typeface,
        layout: row.layout,
        photo_frame: row.photo_frame,
        photo_asset_id: row.photo_asset_id as AssetId | null,
        heading_hi: row.heading_hi,
        wording_en: row.wording_en,
        wording_hi: row.wording_hi,
        blessing_line: row.blessing_line,
      }
    : defaultStyle();
  return { style, photo: await photoFor(style, dtos, signMember), photos: await signAll(dtos, signMember) };
}
