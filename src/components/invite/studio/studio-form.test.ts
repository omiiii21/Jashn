import { describe, expect, it } from "vitest";
import { commandSchemas } from "@/contracts/commands";
import {
  blessingChoiceOf,
  BLESSING_PRESETS,
  commitEdits,
  fieldError,
  formatIstTime,
  newIdempotencyKey,
  pruneOverlay,
  receiptText,
  shownStyle,
  styleEdits,
} from "./studio-form";
import { splitWording } from "../card-model";
import type { StudioStyle } from "./studio-types";
import { IDEMPOTENCY_KEY_PATTERN } from "@/contracts/commands";

const PHOTO_ID = "6f1c2f4e-8a7b-5c3d-9e2f-1a2b3c4d5e6f";
const NEW_PHOTO_ID = "0b8d4f6a-2c1e-4d3b-8a9f-7e6d5c4b3a21";

function style(overrides: Partial<StudioStyle> = {}): StudioStyle {
  return {
    theme: "maroon_gold",
    typeface: "eczar",
    layout: "card_with_inserts",
    photo_frame: "mounted",
    photo_asset_id: PHOTO_ID,
    heading_hi: "शुभ विवाह",
    wording_en: "With the blessings of our families\n\ninvite you to celebrate their wedding",
    wording_hi: "आपकी उपस्थिति से हमें अत्यंत प्रसन्नता होगी।",
    blessing_line: null,
    ...overrides,
  };
}

describe("styleEdits (only the changed keys)", () => {
  it("returns null input and no changes when nothing changed", () => {
    expect(styleEdits(style(), style())).toEqual({ input: null, changed: [], errors: {} });
  });

  it("sends only the changed keys, and the input parses with the command schema", () => {
    const result = styleEdits(style(), style({ theme: "peacock_gold", photo_asset_id: NEW_PHOTO_ID }));
    expect(result.input).toEqual({ theme: "peacock_gold", photo_asset_id: NEW_PHOTO_ID });
    expect(result.changed).toEqual(["theme", "photo_asset_id"]);
    expect(commandSchemas.update_invite_style.safeParse(result.input).success).toBe(true);
  });

  it("sends blessing None as null and a preset as its text", () => {
    const withPreset = style({ blessing_line: "Bismillah" });
    expect(styleEdits(withPreset, style()).input).toEqual({ blessing_line: null });
    expect(styleEdits(style(), withPreset).input).toEqual({ blessing_line: "Bismillah" });
    const parsed = commandSchemas.update_invite_style.safeParse({ blessing_line: null });
    expect(parsed.success).toBe(true);
  });

  it("treats trimmed-equal wording and CRLF line ends as no change", () => {
    const base = style();
    const shown = style({ wording_en: "  With the blessings of our families\r\n\r\ninvite you to celebrate their wedding \n" });
    expect(styleEdits(base, shown).changed).toEqual([]);
  });

  it("sends trimmed text with LF line ends", () => {
    const result = styleEdits(style(), style({ wording_en: " Together with our families\r\n\r\ninvite you " }));
    expect(result.input).toEqual({ wording_en: "Together with our families\n\ninvite you" });
    const { lead_in, follow_line } = splitWording(result.input?.wording_en ?? null);
    expect(lead_in).toBe("Together with our families");
    expect(follow_line).toBe("invite you");
  });

  it("refuses an emptied wording or heading with required, before any request", () => {
    const result = styleEdits(style(), style({ wording_en: "   ", heading_hi: "" }));
    expect(result.input).toBeNull();
    expect(result.errors).toEqual({ wording_en: "required", heading_hi: "required" });
  });

  it("refuses an empty custom blessing and text over the limits", () => {
    expect(styleEdits(style(), style({ blessing_line: "" })).errors).toEqual({ blessing_line: "required" });
    const long = styleEdits(style(), style({ heading_hi: "क".repeat(41), wording_hi: "अ".repeat(601) }));
    expect(long.errors).toEqual({ heading_hi: "too_long", wording_hi: "too_long" });
  });

  it("leaves an untouched empty wording alone", () => {
    expect(styleEdits(style({ wording_hi: null }), style({ wording_hi: "" })).changed).toEqual([]);
  });

  it("sends a photo removal as photo_asset_id null", () => {
    const result = styleEdits(style(), style({ photo_asset_id: null }));
    expect(result.input).toEqual({ photo_asset_id: null });
    expect(commandSchemas.update_invite_style.safeParse(result.input).success).toBe(true);
  });
});

describe("the saved overlay", () => {
  it("shows server, then saved values, then edits", () => {
    const server = style();
    const overlay = commitEdits(server, {}, { theme: "peacock_gold" });
    expect(shownStyle(server, overlay, {}).theme).toBe("peacock_gold");
    expect(shownStyle(server, overlay, { theme: "maroon_gold" }).theme).toBe("maroon_gold");
  });

  it("keeps a saved value while the server read hasn't moved (fixtures never change)", () => {
    const server = style();
    const overlay = commitEdits(server, {}, { theme: "peacock_gold", blessing_line: "Ik Onkar" });
    expect(pruneOverlay(style(), overlay)).toEqual(overlay);
  });

  it("drops a saved value once the server shows it, or shows someone else's newer value", () => {
    const server = style();
    const overlay = commitEdits(server, {}, { theme: "peacock_gold", typeface: "tiro_devanagari" });
    const caughtUp = pruneOverlay(style({ theme: "peacock_gold" }), overlay);
    expect(Object.keys(caughtUp)).toEqual(["typeface"]);
    const movedOn = pruneOverlay(style({ typeface: "eczar", layout: "one_card", theme: "maroon_gold" }), {
      layout: { value: "facing_pages", server_at_save: "card_with_inserts" },
    });
    expect(movedOn).toEqual({});
  });
});

describe("blessing choices", () => {
  it("defaults to None and recognises the presets", () => {
    expect(blessingChoiceOf(null, false)).toEqual({ kind: "none" });
    expect(blessingChoiceOf(BLESSING_PRESETS[0].value, false)).toEqual({ kind: "preset", index: 0 });
    expect(blessingChoiceOf("Bismillah", false)).toEqual({ kind: "preset", index: 1 });
    expect(blessingChoiceOf("With love from both families", false)).toEqual({ kind: "custom" });
    expect(blessingChoiceOf(null, true)).toEqual({ kind: "custom" });
  });

  it("marks the Hindi preset as Hindi and no preset is the default", () => {
    expect(BLESSING_PRESETS[0].lang).toBe("hi");
    expect(blessingChoiceOf(style().blessing_line, false).kind).toBe("none");
  });
});

describe("fieldError", () => {
  it("puts a validation error under its field", () => {
    expect(fieldError({ code: "validation_failed", message: "too_long", field: "wording_en" })).toEqual({
      key: "wording_en",
      text: "Keep this to 600 characters or fewer.",
    });
    expect(fieldError({ code: "validation_failed", message: "required", field: "heading_hi" }).key).toBe("heading_hi");
  });

  it("puts a foreign photo id under the photo", () => {
    expect(fieldError({ code: "not_found", message: "Photo not found.", field: "photo_asset_id" }).key).toBe(
      "photo_asset_id",
    );
  });

  it("keeps people-facing messages and replaces bare words", () => {
    expect(fieldError({ code: "rate_limited", message: "Too many changes. Wait a moment and try again." })).toEqual({
      key: null,
      text: "Too many changes. Wait a moment and try again.",
    });
    expect(fieldError({ code: "internal_error", message: "internal_error" }).text).toBe(
      "The draft wasn't saved. Try again.",
    );
    expect(fieldError({ code: "forbidden", message: "Not allowed." }).text).toMatch(/owner or a manager/);
  });
});

describe("receipt and keys", () => {
  it("formats the receipt time in IST", () => {
    const at = new Date("2026-11-25T10:42:00Z"); // 4:12 pm IST
    expect(formatIstTime(at)).toBe("4:12 pm");
    expect(receiptText("Mira", at)).toBe(
      "Saved to the draft by Mira, 4:12 pm. Guests see it after an owner publishes.",
    );
  });

  it("makes idempotency keys the dispatcher accepts, different every time", () => {
    const first = newIdempotencyKey("studio");
    const second = newIdempotencyKey("studio");
    expect(first).toMatch(IDEMPOTENCY_KEY_PATTERN);
    expect(first).not.toBe(second);
  });
});
