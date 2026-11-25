import { describe, expect, it } from "vitest";
import {
  coupleInitials,
  directionsHref,
  formatGuestTime,
  formatGuestWhen,
  formatWeddingDate,
  formatWhere,
  thankYouName,
} from "./guest-format";

const garden = {
  name: "Garden Hall",
  place_name: "Mallige Gardens",
  locality: "Whitefield",
  address: "Mallige Gardens, Whitefield, Bengaluru",
  map_url: null,
};

describe("guest format (IST)", () => {
  it("formats an IST instant as the AT-4.1 when line", () => {
    expect(formatGuestWhen("2026-12-13T19:00:00+05:30", "en")).toBe("Sun 13 Dec 2026, 7:00 pm");
  });

  it("reads a UTC instant in IST", () => {
    expect(formatGuestWhen("2026-12-14T14:00:00Z", "en")).toBe("Mon 14 Dec 2026, 7:30 pm");
    expect(formatGuestTime("2026-12-14T14:00:00Z", "en")).toBe("7:30 pm");
  });

  it("keeps Latin digits in Hindi", () => {
    const line = formatGuestWhen("2026-12-13T19:00:00+05:30", "hi");
    expect(line).toContain("13");
    expect(line).toContain("2026");
    expect(line).toContain("7:00");
    expect(line).toMatch(/[ऀ-ॿ]/);
  });

  it("formats the wedding date as a calendar date", () => {
    expect(formatWeddingDate("2026-12-14", "en")).toBe("14 December 2026");
    expect(formatWeddingDate("2026-12-14", "hi")).toBe("14 दिसंबर 2026");
  });
});

describe("guest format (venue and names)", () => {
  it("joins hall, place and locality", () => {
    expect(formatWhere(garden)).toBe("Garden Hall, Mallige Gardens, Whitefield");
    expect(formatWhere(null)).toBeNull();
    expect(formatWhere({ ...garden, place_name: "Garden Hall", locality: null })).toBe("Garden Hall");
  });

  it("falls back to a maps search when map_url is null", () => {
    const href = directionsHref(garden);
    expect(href).toBe(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent("Garden Hall, Mallige Gardens, Whitefield")}`,
    );
    expect(directionsHref({ ...garden, map_url: "https://maps.example.com/x" })).toBe("https://maps.example.com/x");
    expect(directionsHref({ ...garden, map_url: "javascript:alert(1)" })).toMatch(/^https:\/\/www\.google\.com\/maps/);
    expect(directionsHref(null)).toBeNull();
  });

  it("makes the seal's initials and the thank-you name", () => {
    expect(coupleInitials({ bride_name: "Mira", groom_name: "Kabir" })).toBe("MK");
    expect(thankYouName({ name: "Bhat", guests: [{ full_name: "Tara Bhat" }] }, "en")).toBe("Tara");
    expect(thankYouName({ name: "Sharma", guests: [{ full_name: "A" }, { full_name: "B" }] }, "en")).toBe("Sharma family");
  });
});
