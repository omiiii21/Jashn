import "server-only";

import { CommandFailure } from "@/contracts/commands";
import { DEFAULT_HEADING_HI, type JsonObject, type JsonPrimitive, type WeddingId } from "@/contracts/domain";
import type { CommandHandler } from "@/contracts/services";
import { changesTextEn, changesTextHi, type ChangeLike } from "@/components/invite/change-text";

import { memberActor, type InviteHandlerDeps } from "./publish";
import type { InviteStylePatch, InviteStyleRow } from "./store";

/**
 * `update_invite_style` (domain-and-data 3.2; P1, L1 to L3). Owners and managers. It
 * writes the draft only: guests see a style change after the next publish (AT-7.2).
 * `wording_en` keeps its single blank line (export 1.2's split rule); the blessing line
 * defaults to none.
 */

export const INVITE_STYLE_FIELDS = [
  "theme",
  "typeface",
  "layout",
  "photo_frame",
  "photo_asset_id",
  "heading_hi",
  "wording_en",
  "wording_hi",
  "blessing_line",
] as const satisfies readonly (keyof InviteStylePatch)[];

export type InviteStyleField = (typeof INVITE_STYLE_FIELDS)[number];

/** The `invite_styles` table defaults (domain 5.1), for a wedding with no style row yet. */
export function defaultInviteStyle(wedding_id: WeddingId): InviteStyleRow {
  return {
    wedding_id,
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

function normalise(field: InviteStyleField, value: unknown): JsonPrimitive {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return value as JsonPrimitive;
  if (field === "wording_en" || field === "wording_hi") return value.replace(/\r\n?/g, "\n");
  return value;
}

export function createUpdateInviteStyleHandler<Tx>(deps: InviteHandlerDeps<Tx>): CommandHandler<"update_invite_style", Tx> {
  return async (context) => {
    const { tx, input } = context;
    const wedding_id = context.wedding_id;
    if (!wedding_id) throw new CommandFailure({ code: "not_found", message: "Not found." });
    const actor = memberActor(context.actor);
    if (!actor) throw new CommandFailure({ code: "forbidden", message: "Only members can change the invitation." });

    const wedding = await deps.store.readWedding(tx, wedding_id);
    if (!wedding) throw new CommandFailure({ code: "not_found", message: "Not found." });
    const current = (await deps.store.readInviteStyle(tx, wedding_id)) ?? defaultInviteStyle(wedding_id);

    const patch: Record<string, JsonPrimitive> = {};
    const before: JsonObject = {};
    const after: JsonObject = {};
    const changes: ChangeLike[] = [];
    const sent = input as Partial<Record<InviteStyleField, unknown>>;
    for (const field of INVITE_STYLE_FIELDS) {
      if (sent[field] === undefined) continue;
      const next = normalise(field, sent[field]);
      const was = normalise(field, current[field]);
      if (next === was) continue;
      patch[field] = next;
      before[field] = was;
      after[field] = next;
      changes.push({ entity: "invite_style", entity_id: wedding_id, field, from: was, to: next });
    }

    const photo = patch.photo_asset_id;
    if (typeof photo === "string" && !(await deps.store.isCouplePhoto(tx, wedding_id, photo))) {
      throw new CommandFailure({ code: "not_found", message: "Photo not found.", field: "photo_asset_id" });
    }

    const changed_fields = Object.keys(patch);
    if (changed_fields.length === 0) {
      return { outcome: "unchanged", result: { changed_fields: [], draft_version: wedding.draft_version }, activity: null };
    }

    await deps.store.writeInviteStyle(tx, wedding_id, patch as InviteStylePatch, actor.member_id, new Date(context.now));
    return {
      outcome: "applied",
      result: { changed_fields, draft_version: wedding.draft_version + 1 },
      activity: {
        topic: "invite_style.updated",
        entity_type: "invite_style",
        entity_id: wedding_id,
        summary_en: `${actor.display_name} changed the invitation: ${changesTextEn(changes)}.`,
        summary_hi: `${actor.display_name} ने निमंत्रण बदला: ${changesTextHi(changes)}।`,
        before,
        after,
        visibility: "members",
      },
      bumps_draft_version: true,
    };
  };
}
