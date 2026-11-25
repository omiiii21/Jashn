import { describe, expect, it } from "vitest";
import type { SnapshotEvent } from "@/contracts/domain";
import type { ItineraryFunction } from "@/contracts/read-models";
import { CARD_SAMPLE_FOOTER } from "../card-model";
import { draftCardModel, draftSnapshot, toSnapshotEvent } from "./draft-card";
import type { StudioStyle } from "./studio-types";

const wedding = { bride_name: "Mira", groom_name: "Kabir", city: "Bengaluru", wedding_date: "2026-12-14" };

const style: StudioStyle = {
  theme: "maroon_gold",
  typeface: "eczar",
  layout: "card_with_inserts",
  photo_frame: "mounted",
  photo_asset_id: null,
  heading_hi: "शुभ विवाह",
  wording_en: "With the blessings of our families\n\ninvite you to celebrate their wedding",
  wording_hi: "आपकी उपस्थिति से हमें अत्यंत प्रसन्नता होगी।",
  blessing_line: null,
};

const reception: ItineraryFunction = {
  event_id: "e-rec",
  seed_key: "EVT-REC",
  event_kind: "reception",
  title: "Reception",
  title_hi: "रिसेप्शन",
  event_date: "2026-12-14",
  start_time: "19:30",
  end_time: "23:00",
  muhurat_time: null,
  starts_at: "2026-12-14T19:30:00+05:30",
  ends_at: "2026-12-14T23:00:00+05:30",
  muhurat_at: null,
  venue_id: "v-lotus",
  venue: {
    venue_id: "v-lotus",
    name: "Lotus Hall",
    place_name: "Mallige Gardens",
    locality: "Whitefield",
    address: null,
    capacity: 260,
    map_url: null,
  },
  dress_code: null,
  description: "Dinner follows.",
  lead_name: null,
  expected_headcount: 230,
  version: 3,
  requirements: [],
};

const events: SnapshotEvent[] = [toSnapshotEvent(reception)];

describe("the studio preview's card (AT-7.1, AT-7.2)", () => {
  it("maps a draft function to a snapshot event without capacity or versions", () => {
    const event = events[0];
    expect(event.venue).toEqual({
      venue_id: "v-lotus",
      name: "Lotus Hall",
      place_name: "Mallige Gardens",
      locality: "Whitefield",
      address: null,
      map_url: null,
    });
    expect(event).not.toHaveProperty("version");
    expect(event).not.toHaveProperty("expected_headcount");
  });

  it("passes the theme and typeface straight through", () => {
    const peacock = draftCardModel({ wedding, style: { ...style, theme: "peacock_gold" }, events, is_sample: true, photo_url: null });
    expect(peacock.theme).toBe("peacock_gold");
    const tiro = draftCardModel({ wedding, style: { ...style, typeface: "tiro_devanagari" }, events, is_sample: true, photo_url: null });
    expect(tiro.typeface).toBe("tiro_devanagari");
  });

  it("shows the no-photo layout without a URL (D126) and the photo with one", () => {
    const none = draftCardModel({ wedding, style: { ...style, photo_asset_id: "a" }, events, is_sample: true, photo_url: null });
    expect(none.photo).toBeNull();
    const withPhoto = draftCardModel({ wedding, style, events, is_sample: true, photo_url: "blob:http://localhost/x" });
    expect(withPhoto.photo).toEqual({ url: "blob:http://localhost/x", alt: "Couple photo of Mira and Kabir" });
  });

  it("prints the two wording paragraphs above and below the names", () => {
    const model = draftCardModel({ wedding, style, events, is_sample: true, photo_url: null });
    expect(model.lead_in).toBe("With the blessings of our families");
    expect(model.names).toBe("Mira & Kabir");
    expect(model.follow_line).toBe("invite you to celebrate their wedding");
  });

  it("is the main card: the wedding date and city, no function block", () => {
    const model = draftCardModel({ wedding, style, events, is_sample: true, photo_url: null });
    expect(model.functions).toEqual([]);
    expect(model.fallback_date_line).toBe("Monday, 14 December 2026, Bengaluru");
  });

  it("prints the sample footer only on sample weddings", () => {
    expect(draftCardModel({ wedding, style, events, is_sample: true, photo_url: null }).footer).toBe(CARD_SAMPLE_FOOTER);
    expect(draftCardModel({ wedding, style, events, is_sample: false, photo_url: null }).footer).toBeNull();
  });

  it("carries no money", () => {
    const model = draftCardModel({ wedding, style, events, is_sample: true, photo_url: null });
    const text = JSON.stringify([model, draftSnapshot(wedding, style, events)]);
    expect(text).not.toContain("₹");
    expect(text).not.toContain("_inr");
  });
});
