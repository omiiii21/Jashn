import { describe, expect, it } from "vitest";

import { changeLabel, changeSentenceEn, changeSentenceHi, changesTextEn, formatChangeValue, formatTimeValue } from "./change-text";

const reception = { event_kind: "reception", title: "Reception", title_hi: "रिसेप्शन" } as const;
const haldi = { event_kind: "haldi", title: "Haldi", title_hi: "हल्दी" } as const;
const subjects = { "evt-rec": reception, "evt-hal": haldi };

describe("change text", () => {
  const venue = { entity: "event", entity_id: "evt-rec", field: "venue", from: "Banyan Hall", to: "Lotus Hall" } as const;

  it("REV-3's change reads as the spec writes it", () => {
    expect(changeLabel(venue, subjects)).toBe("Reception venue");
    expect(changeSentenceEn(venue, subjects)).toBe("reception venue Banyan Hall to Lotus Hall");
    expect(changeSentenceHi(venue, subjects)).toBe("रिसेप्शन का स्थान Banyan Hall से Lotus Hall");
  });

  it("formats times and dates, and joins items with a semicolon", () => {
    expect(formatTimeValue("18:00")).toBe("6:00 PM");
    expect(formatTimeValue("00:15:00")).toBe("12:15 AM");
    const time = { entity: "event", entity_id: "evt-rec", field: "start_time", from: "19:30", to: "18:00" } as const;
    expect(changeSentenceEn(time, subjects)).toBe("reception start time 7:30 PM to 6:00 PM");
    expect(formatChangeValue({ entity: "event", field: "event_date" }, "2026-12-14")).toBe("14 Dec 2026");
    expect(changesTextEn([venue, time], subjects)).toBe(
      "reception venue Banyan Hall to Lotus Hall; reception start time 7:30 PM to 6:00 PM",
    );
  });

  it("names added and removed functions by title", () => {
    const added = { entity: "event", entity_id: "evt-hal", field: "added", from: null, to: "Haldi" } as const;
    expect(changeLabel(added, subjects)).toBe("Haldi added");
    expect(changeSentenceEn(added, subjects)).toBe("Haldi added");
    expect(changeSentenceHi(added, subjects)).toBe("हल्दी जोड़ा गया");
  });

  it("never prints a photo id or a long wording", () => {
    const photo = { entity: "invite_style", entity_id: "w", field: "photo_asset_id", from: null, to: "3f2b9c1e-uuid" } as const;
    expect(changeSentenceEn(photo)).toBe("couple photo added");
    expect(changeLabel(photo)).toBe("Couple photo");
    expect(formatChangeValue(photo, "3f2b9c1e-uuid")).not.toContain("3f2b");
    const wording = { entity: "invite_style", entity_id: "w", field: "wording_en", from: "a", to: "b" } as const;
    expect(changeSentenceEn(wording)).toBe("English wording changed");
    const theme = { entity: "invite_style", entity_id: "w", field: "theme", from: "peacock_gold", to: "maroon_gold" } as const;
    expect(changeSentenceEn(theme)).toBe("theme Peacock & Gold to Maroon & Gold");
  });
});
