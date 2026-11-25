import { describe, expect, it } from "vitest";

import { chipLabel, normalizeForMatch, registerFor, scriptCounts } from "./normalize";

describe("normalizeForMatch (voice.md 1.6)", () => {
  const cases: Array<[string, string]> = [
    ["Haan, save karo.", "haan save karo"],
    ["हाँ, save करो", "हां save करो"],
    ["नहीं, रहने दो।", "नहीं रहने दो"],
    ["चालीस हज़ार", "चालीस हजार"],
    ["डेढ़ लाख", "डेढ लाख"],
    ["तारीख़", "तारीख"],
    ["Caterer को 40,000 advance दिया था", "caterer को 40000 advance दिया था"],
    ["₹1,50,000", "₹ 150000"],
    ["₹1.5L", "₹ 1.5l"],
    ["7:30 PM", "7:30 pm"],
    ["13/12/2026", "13/12/2026"],
    ["2026-12-13", "2026-12-13"],
    ["fifty-thousand", "fifty thousand"],
    ["Who's attending the reception?", "whos attending the reception"],
    ["  lots   of\tspace  ", "lots of space"],
    ["४०,०००", "40000"],
    ["Frame & Phera Studio", "frame phera studio"],
    ["end.", "end"],
    ["", ""],
  ];
  it.each(cases)("%s → %s", (input, expected) => {
    expect(normalizeForMatch(input)).toBe(expected);
  });

  it("treats precomposed and decomposed nukta letters alike", () => {
    expect(normalizeForMatch("ज़")).toBe(normalizeForMatch("ज़"));
    expect(normalizeForMatch("ज़")).toBe("ज");
  });

  it("reads chandrabindu as anusvara", () => {
    expect(normalizeForMatch("हाँ")).toBe(normalizeForMatch("हां"));
    expect(normalizeForMatch("पाँच")).toBe("पांच");
  });
});

describe("scriptCounts and registerFor (1.6's table)", () => {
  const cases: Array<[string, string | null, { devanagari: number; latin: number }, string]> = [
    ["Who's attending the reception?", null, { devanagari: 0, latin: 4 }, "en"],
    ["Caterer ko ab kitna dena hai?", null, { devanagari: 0, latin: 6 }, "en"],
    ["Caterer ko ab kitna dena hai?", "hinglish", { devanagari: 0, latin: 6 }, "hinglish"],
    ["Caterer ko ab kitna dena hai?", "hi", { devanagari: 0, latin: 6 }, "hinglish"],
    ["कुल कितना बाकी है?", null, { devanagari: 4, latin: 0 }, "hi"],
    ["नहीं, पचास नहीं, चालीस हज़ार दिए थे।", "hi", { devanagari: 7, latin: 0 }, "hi"],
    ["Diya ने क्या बदला?", "en", { devanagari: 3, latin: 1 }, "hinglish"],
    ["Diya ने क्या बदला?", null, { devanagari: 3, latin: 1 }, "hinglish"],
    ["Caterer को अब कितना देना है?", "hinglish", { devanagari: 5, latin: 1 }, "hinglish"],
    ["Add Jain food for twelve guests at the रिसेप्शन", "en", { devanagari: 1, latin: 8 }, "en"],
    ["Add Jain food for twelve guests at the रिसेप्शन", "hinglish", { devanagari: 1, latin: 8 }, "hinglish"],
    ["Caterer को 40000 advance दिया था", null, { devanagari: 3, latin: 2 }, "hinglish"],
    ["Venue ka ₹1.5L baaki hai na?", null, { devanagari: 0, latin: 6 }, "en"],
    ["40000", "hi", { devanagari: 0, latin: 0 }, "hinglish"],
    ["", null, { devanagari: 0, latin: 0 }, "en"],
  ];
  it.each(cases)("%s (model %s)", (transcript, model, counts, register) => {
    expect(scriptCounts(transcript)).toEqual(counts);
    expect(registerFor(transcript, model as "en" | "hinglish" | "hi" | null)).toBe(register);
  });

  it("names the chip", () => {
    expect(chipLabel("en")).toBe("English");
    expect(chipLabel("hinglish")).toBe("Hinglish");
    expect(chipLabel("hi")).toBe("हिंदी");
  });
});
