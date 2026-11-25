import "server-only";

import { CommandFailure } from "@/contracts/commands";
import { DEFAULT_HEADING_HI, type AssetDto, type InviteStyleDto, type SessionActor, type WeddingId } from "@/contracts/domain";
import { getDemoFixture } from "@/contracts/fixtures";
import { fixtureServices } from "@/contracts/services";
import { SAMPLE_COPIES, seededId } from "@/db/ids";
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
  const { style, photo } = await readDraftStyle(wedding_id);

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

async function readDraftStyle(wedding_id: WeddingId): Promise<{ style: StudioStyle; photo: StudioPhoto | null }> {
  const copy = fixtureCopyOf(wedding_id);

  if (services === fixtureServices) {
    if (!copy) throw new CommandFailure({ code: "not_found", message: "Wedding not found." });
    const fixture = getDemoFixture(copy);
    const style = withoutSeedKey(fixture.invite_style);
    // Fixtures sign nothing, so the photo shows only once uploaded in this tab.
    return { style, photo: await photoFor(style, fixture.assets, async () => null) };
  }

  // TODO(lane-a-schema): once src/db/schema.ts merges, read this wedding's `invite_styles`
  // row and its `assets` (core query builder, explicit where on wedding_id; AGENTS.md
  // rule 7), and sign the photo with Lane A's `couplePhotoUrl(asset, "member")` (10 minutes).
  // Until then the real services show the seeded copy's D0 style, or the column defaults.
  if (copy) {
    const fixture = getDemoFixture(copy);
    const style = withoutSeedKey(fixture.invite_style);
    return { style, photo: await photoFor(style, fixture.assets, async () => null) };
  }
  return { style: defaultStyle(), photo: null };
}
