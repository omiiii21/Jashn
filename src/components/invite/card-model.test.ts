import { describe, expect, it } from "vitest";
import type { PublicationSnapshot, SnapshotEvent } from "@/contracts/domain";
import {
  buildCardModel,
  CARD_REPLY_LINE,
  CARD_REPLY_LINE_NO_FUNCTIONS,
  CARD_SAMPLE_FOOTER,
  cardSummary,
  formatCardDate,
  formatCardTime,
  splitWording,
} from "./card-model";

function event(id: string, title: string, date: string, start: string | null, hall: string | null): SnapshotEvent {
  return {
    event_id: id,
    event_kind: "reception",
    title,
    title_hi: "रिसेप्शन",
    event_date: date,
    start_time: start,
    end_time: null,
    muhurat_time: null,
    dress_code: null,
    description: null,
    venue: hall
      ? { venue_id: `v-${id}`, name: hall, place_name: "Mallige Gardens", locality: "Whitefield", address: null, map_url: null }
      : null,
  };
}

function snapshot(events: SnapshotEvent[], wording_en: string | null = "With the blessings of our families\n\ninvite you to celebrate their wedding"): PublicationSnapshot {
  return {
    wedding: { bride_name: "Mira", groom_name: "Kabir", city: "Bengaluru", wedding_date: "2026-12-14" },
    invite_style: {
      theme: "maroon_gold",
      typeface: "eczar",
      layout: "card_with_inserts",
      photo_frame: "mounted",
      photo_asset_id: null,
      heading_hi: "शुभ विवाह",
      wording_en,
      wording_hi: "आपकी उपस्थिति से हमें अत्यंत प्रसन्नता होगी।",
      blessing_line: null,
    },
    events,
  };
}

const reception = event("e-rec", "Reception", "2026-12-14", "19:30", "Lotus Hall");

describe("card model (export-and-recovery 1.1 to 1.3)", () => {
  it("formats dates weekday first and times in 12-hour form", () => {
    expect(formatCardDate("2026-12-14")).toBe("Monday, 14 December 2026");
    expect(formatCardTime("19:30")).toBe("7:30 PM");
    expect(formatCardTime("11:15:00")).toBe("11:15 AM");
    expect(formatCardTime("00:05")).toBe("12:05 AM");
    expect(formatCardTime("12:00")).toBe("12:00 PM");
  });

  it("splits wording_en at its first blank line", () => {
    expect(splitWording("A\n\nB")).toEqual({ lead_in: "A", follow_line: "B" });
    expect(splitWording("A\r\n \r\nB\n\nC")).toEqual({ lead_in: "A", follow_line: "B\n\nC" });
    expect(splitWording("Only one paragraph")).toEqual({ lead_in: "Only one paragraph", follow_line: null });
    expect(splitWording(null)).toEqual({ lead_in: null, follow_line: null });
  });

  it("builds the demo REV-3 card", () => {
    const model = buildCardModel({ snapshot: snapshot([reception]), card_event_ids: ["e-rec"], is_sample: true, photo: null });
    expect(model.initials).toBe("MK");
    expect(model.names).toBe("Mira & Kabir");
    expect(model.lead_in).toBe("With the blessings of our families");
    expect(model.follow_line).toBe("invite you to celebrate their wedding");
    expect(model.blessing_line).toBeNull();
    expect(model.functions).toEqual([
      {
        event_id: "e-rec",
        title: "Reception",
        title_hi: "रिसेप्शन",
        date_line: "Monday, 14 December 2026",
        time_line: "7:30 PM onwards",
        muhurat_line: null,
        venue_line: "Lotus Hall, Mallige Gardens, Whitefield, Bengaluru",
      },
    ]);
    expect(model.reply_line).toBe(CARD_REPLY_LINE);
    expect(model.footer).toBe(CARD_SAMPLE_FOOTER);
    expect(cardSummary(model)).toBe("Mira & Kabir, Reception, Monday, 14 December 2026, Lotus Hall");
  });

  it("lists only the frozen functions, in start order", () => {
    const wedding = event("e-wed", "Wedding", "2026-12-14", "10:00", "Mandap Lawn");
    const model = buildCardModel({ snapshot: snapshot([reception, wedding]), card_event_ids: ["e-rec"], is_sample: false, photo: null });
    expect(model.functions.map((fn) => fn.title)).toEqual(["Reception"]);
    expect(model.footer).toBeNull();
    const all = buildCardModel({ snapshot: snapshot([reception, wedding]), card_event_ids: null, is_sample: false, photo: null });
    expect(all.functions.map((fn) => fn.title)).toEqual(["Wedding", "Reception"]);
  });

  it("prints three functions and a more line beyond that", () => {
    const events = [
      event("a", "Haldi", "2026-12-12", "09:00", "Courtyard Lawn"),
      event("b", "Mehendi", "2026-12-12", "16:00", "Garden Hall"),
      event("c", "Sangeet", "2026-12-13", "19:00", "Banyan Hall"),
      event("d", "Wedding", "2026-12-14", "10:00", "Mandap Lawn"),
      event("e", "Reception", "2026-12-14", "19:30", "Lotus Hall"),
    ];
    const model = buildCardModel({ snapshot: snapshot(events), card_event_ids: null, is_sample: false, photo: null });
    expect(model.functions.map((fn) => fn.title)).toEqual(["Haldi", "Mehendi", "Sangeet"]);
    expect(model.more_functions_line).toBe("and 2 more functions. Your personal invitation link lists them all.");
  });

  it("falls back to the wedding date and city with no qualifying function", () => {
    const model = buildCardModel({ snapshot: snapshot([reception]), card_event_ids: [], is_sample: false, photo: null });
    expect(model.functions).toEqual([]);
    expect(model.fallback_date_line).toBe("Monday, 14 December 2026, Bengaluru");
    expect(model.reply_line).toBe(CARD_REPLY_LINE_NO_FUNCTIONS);
  });

  it("prints a muhurat line and handles a function with no venue or time", () => {
    const withMuhurat = { ...event("w", "Wedding", "2026-12-14", "10:00", null), muhurat_time: "11:15" };
    const model = buildCardModel({ snapshot: snapshot([withMuhurat], "One paragraph only"), card_event_ids: null, is_sample: false, photo: null });
    expect(model.functions[0].muhurat_line).toBe("Muhurat 11:15 AM");
    expect(model.functions[0].venue_line).toBe("Bengaluru");
    expect(model.lead_in).toBe("One paragraph only");
    expect(model.follow_line).toBeNull();
    const noTime = buildCardModel({ snapshot: snapshot([event("x", "Puja", "2026-12-13", null, null)]), card_event_ids: null, is_sample: false, photo: null });
    expect(noTime.functions[0].time_line).toBeNull();
  });
});
