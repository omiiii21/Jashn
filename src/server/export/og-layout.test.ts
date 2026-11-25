import { describe, expect, it } from "vitest";
import { FLAG_FALLBACKS, type EnvironmentFlags } from "@/contracts/flags";
import { readImageInfo } from "./image-size";
import { headingLineFor, OG_HEADING_HI_TEXT, OG_WORDING_HI_TEXT, wordingLineFor } from "./og-hindi-lines";
import { fitLabel, fitSequence, isLatinText, latinOrNull, lineCount, photoDisplaySize } from "./og-layout";
import { readCardRenderer } from "./renderer-choice";

describe("og layout helpers", () => {
  it("lets only Latin text through", () => {
    expect(isLatinText("Lotus Hall, Mallige Gardens, Whitefield, Bengaluru")).toBe(true);
    expect(isLatinText("Café – “quoted”")).toBe(true);
    expect(isLatinText("रिसेप्शन")).toBe(false);
    expect(isLatinText("Reception रिसेप्शन")).toBe(false);
    expect(latinOrNull("  Dinner follows.  ")).toBe("Dinner follows.");
    expect(latinOrNull("शुभ विवाह")).toBeNull();
    expect(latinOrNull("")).toBeNull();
    expect(latinOrNull(null)).toBeNull();
  });

  it("wraps long lines and keeps short ones on one line", () => {
    expect(lineCount("Kindly reply through your personal invitation link", "anek_400", 22, 872)).toBe(1);
    expect(lineCount("Mira & Kabir", "eczar_600", 84, 872, -0.84)).toBe(1);
    const long = "Lotus Hall, Mallige Gardens, Whitefield, Bengaluru, Karnataka, India, near the old lake road";
    expect(lineCount(long, "anek_400", 25, 872)).toBe(2);
    expect(lineCount("", "anek_400", 25, 872)).toBe(0);
  });

  it("keeps the photo's ratio within 560 × the cap and never enlarges it", () => {
    const landscape = photoDisplaySize({ width: 1500, height: 1000 }, 380);
    expect(landscape.width).toBe(560);
    expect(landscape.height).toBeCloseTo(373.33, 2);
    const portrait = photoDisplaySize({ width: 1000, height: 1500 }, 380);
    expect(portrait.width).toBeCloseTo(253.33, 2);
    expect(portrait.height).toBe(380);
    expect(photoDisplaySize({ width: 300, height: 200 }, 380)).toEqual({ width: 300, height: 200 });
    expect(photoDisplaySize({ width: 1500, height: 1000 }, 240).height).toBe(240);
  });

  it("follows the guard's fit order: photo, then gaps, then compact", () => {
    const withPhoto = fitSequence(true);
    expect(withPhoto[0]).toEqual({ photo_max_h: 380, gap: 1, compact: false });
    expect(withPhoto.map((fit) => fitLabel(fit, true))).toEqual([
      "",
      "photo:360",
      "photo:340",
      "photo:320",
      "photo:300",
      "photo:280",
      "photo:260",
      "photo:240",
      "photo:240,gap:0.9",
      "photo:240,gap:0.8",
      "photo:240,gap:0.7",
      "photo:240,gap:0.6",
      "photo:240,gap:0.5",
      "photo:240,gap:0.5,compact",
    ]);
    expect(fitSequence(false).map((fit) => fitLabel(fit, false))).toEqual([
      "",
      "gap:0.9",
      "gap:0.8",
      "gap:0.7",
      "gap:0.6",
      "gap:0.5",
      "gap:0.5,compact",
    ]);
  });
});

describe("og Hindi lines", () => {
  it("draws the captured heading only for the exact text, in the card's theme and face", () => {
    expect(headingLineFor(OG_HEADING_HI_TEXT, "maroon_gold", "eczar")?.id).toBe("heading-hi-eczar-maroon");
    expect(headingLineFor(OG_HEADING_HI_TEXT, "peacock_gold", "eczar")?.id).toBe("heading-hi-eczar-peacock");
    expect(headingLineFor(OG_HEADING_HI_TEXT, "maroon_gold", "tiro_devanagari")?.id).toBe("heading-hi-tiro-maroon");
    expect(headingLineFor(` ${OG_HEADING_HI_TEXT} `, "maroon_gold", "eczar")?.id).toBe("heading-hi-eczar-maroon");
    expect(headingLineFor("शुभ लग्न", "maroon_gold", "eczar")).toBeNull();
    expect(headingLineFor("", "maroon_gold", "eczar")).toBeNull();
  });

  it("draws the captured Hindi line only for the exact text", () => {
    expect(wordingLineFor(OG_WORDING_HI_TEXT, "eczar")?.id).toBe("wording-hi-eczar");
    expect(wordingLineFor(OG_WORDING_HI_TEXT, "tiro_devanagari")?.id).toBe("wording-hi-tiro");
    expect(wordingLineFor("आपकी उपस्थिति से हमें प्रसन्नता होगी।", "eczar")).toBeNull();
    expect(wordingLineFor(null, "eczar")).toBeNull();
  });
});

describe("readImageInfo", () => {
  it("reads PNG, JPEG, WEBP and SVG sizes and refuses a GIF", () => {
    const png = new Uint8Array(24);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
    new DataView(png.buffer).setUint32(16, 1500);
    new DataView(png.buffer).setUint32(20, 1000);
    expect(readImageInfo(png)).toEqual({ kind: "png", mime: "image/png", width: 1500, height: 1000 });

    // SOI, an APP0 segment of 16 bytes, then SOF0 with height 1000 and width 1500.
    const jpeg = new Uint8Array([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, ...new Array(14).fill(0), 0xff, 0xc0, 0x00, 0x11, 0x08, 0x03, 0xe8, 0x05, 0xdc, 0x03,
      ...new Array(9).fill(0),
    ]);
    expect(readImageInfo(jpeg)).toEqual({ kind: "jpeg", mime: "image/jpeg", width: 1500, height: 1000 });

    // RIFF....WEBPVP8X, then 24-bit width-1 and height-1 at offsets 24 and 27.
    const webp = new Uint8Array(30);
    webp.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58]);
    webp.set([0xdb, 0x05, 0x00, 0xe7, 0x03, 0x00], 24);
    expect(readImageInfo(webp)).toEqual({ kind: "webp", mime: "image/webp", width: 1500, height: 1000 });

    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1500 1000"></svg>');
    expect(readImageInfo(svg)).toEqual({ kind: "svg", mime: "image/svg+xml", width: 1500, height: 1000 });

    expect(readImageInfo(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0]))).toBeNull();
    expect(readImageInfo(new Uint8Array([]))).toBeNull();
  });
});

describe("readCardRenderer", () => {
  const flags = (card_renderer: EnvironmentFlags["card_renderer"]): EnvironmentFlags => {
    const base = Object.fromEntries(
      Object.entries(FLAG_FALLBACKS).map(([key, fallback]) => [
        key,
        { enabled: fallback?.enabled ?? false, value: fallback?.value ?? null, fallback: true },
      ]),
    ) as EnvironmentFlags;
    return { ...base, card_renderer };
  };

  it("defaults to chromium through Lane C's reader (the stub answers the fallbacks)", async () => {
    await expect(readCardRenderer()).resolves.toBe("chromium");
  });

  it("answers og only for an enabled flag with the value og", async () => {
    await expect(readCardRenderer(async () => flags({ enabled: true, value: "og", fallback: false }))).resolves.toBe("og");
    await expect(readCardRenderer(async () => flags({ enabled: true, value: " OG ", fallback: false }))).resolves.toBe("og");
    await expect(readCardRenderer(async () => flags({ enabled: false, value: "og", fallback: false }))).resolves.toBe("chromium");
    await expect(readCardRenderer(async () => flags({ enabled: true, value: "chromium", fallback: false }))).resolves.toBe("chromium");
    await expect(readCardRenderer(async () => flags({ enabled: true, value: "ogg", fallback: false }))).resolves.toBe("chromium");
    await expect(readCardRenderer(async () => flags({ enabled: true, value: null, fallback: true }))).resolves.toBe("chromium");
  });

  it("answers chromium when the reader throws", async () => {
    await expect(
      readCardRenderer(async () => {
        throw new Error("unreadable");
      }),
    ).resolves.toBe("chromium");
  });
});
