import { describe, expect, it } from "vitest";

import {
  BULBUL_VOICES,
  amountWords,
  countWords,
  dateSpeech,
  speechFor,
  splitSpeechParts,
  timeSpeech,
  voiceForSpeech,
} from "./speech";

describe("amountWords (voice.md 3.5)", () => {
  const cases: Array<[number, string, string]> = [
    [160_000, "एक लाख साठ हज़ार रुपये", "one lakh sixty thousand rupees"],
    [150_000, "एक लाख पचास हज़ार रुपये", "one lakh fifty thousand rupees"],
    [540_000, "पाँच लाख चालीस हज़ार रुपये", "five lakh forty thousand rupees"],
    [184_000, "एक लाख चौरासी हज़ार रुपये", "one lakh eighty-four thousand rupees"],
    [1_200_000, "बारह लाख रुपये", "twelve lakh rupees"],
    [200_000, "दो लाख रुपये", "two lakh rupees"],
    [140_000, "एक लाख चालीस हज़ार रुपये", "one lakh forty thousand rupees"],
    [280_000, "दो लाख अस्सी हज़ार रुपये", "two lakh eighty thousand rupees"],
    [95_000, "पचानवे हज़ार रुपये", "ninety-five thousand rupees"],
    [40_000, "चालीस हज़ार रुपये", "forty thousand rupees"],
    [10_000, "दस हज़ार रुपये", "ten thousand rupees"],
    [5_100, "पाँच हज़ार एक सौ रुपये", "five thousand one hundred rupees"],
    [45_400, "पैंतालीस हज़ार चार सौ रुपये", "forty-five thousand four hundred rupees"],
    [273_000, "दो लाख तिहत्तर हज़ार रुपये", "two lakh seventy-three thousand rupees"],
    [12_500_500, "एक करोड़ पच्चीस लाख पाँच सौ रुपये", "one crore twenty-five lakh five hundred rupees"],
    [1, "एक रुपया", "one rupee"],
  ];
  it.each(cases)("%d", (inr, hi, en) => {
    expect(amountWords(inr, "hi")).toBe(hi);
    expect(amountWords(inr, "en")).toBe(en);
  });

  it("never says डेढ़, ढाई, सवा, साढ़े or पौने for money (M7)", () => {
    for (const inr of [150_000, 250_000, 125_000, 350_000, 175_000, 1_500, 2_500, 150]) {
      expect(amountWords(inr, "hi")).not.toMatch(/डेढ़|ढाई|सवा|साढ़े|पौने/);
    }
  });

  it("builds demo-data §14's three fixed replies character for character", () => {
    expect(`${amountWords(160_000, "hi")} बाकी हैं।`).toBe("एक लाख साठ हज़ार रुपये बाकी हैं।");
    expect(`${amountWords(150_000, "hi")} बाकी हैं।`).toBe("एक लाख पचास हज़ार रुपये बाकी हैं।");
    expect(`Reception: Lotus Hall. ${amountWords(160_000, "hi")} बाकी हैं।`).toBe(
      "Reception: Lotus Hall. एक लाख साठ हज़ार रुपये बाकी हैं।",
    );
    // The same code points as the spec (हज़ार with a decomposed nukta, पाँच with chandrabindu).
    expect(amountWords(540_000, "hi")).toBe("पाँच लाख चालीस हज़ार रुपये");
  });
});

describe("countWords", () => {
  it("counts in Hindi and English", () => {
    expect(countWords(229, "hi")).toBe("दो सौ उनतीस");
    expect(countWords(12, "hi")).toBe("बारह");
    expect(countWords(2026, "hi")).toBe("दो हज़ार छब्बीस");
    expect(countWords(231, "hi")).toBe("दो सौ इकतीस");
    expect(countWords(12, "en")).toBe("twelve");
    expect(countWords(250, "en")).toBe("two hundred fifty");
  });
});

describe("dateSpeech and timeSpeech (3.5)", () => {
  it("dates", () => {
    expect(dateSpeech("2026-12-13", "hi")).toBe("तेरह दिसंबर");
    expect(dateSpeech("2026-12-13", "hinglish")).toBe("तेरह December");
    expect(dateSpeech("2026-12-13", "en")).toBe("13 December");
    expect(dateSpeech("2026-12-14", "hi", { with_year: true })).toBe("चौदह दिसंबर दो हज़ार छब्बीस");
    expect(dateSpeech("2026-12-13", "hi", { with_weekday: true })).toBe("रविवार तेरह दिसंबर");
    expect(dateSpeech("2026-12-13", "en", { with_weekday: true })).toBe("Sunday 13 December");
  });
  it("times", () => {
    expect(timeSpeech("19:00", "hi")).toBe("शाम सात बजे");
    expect(timeSpeech("17:30", "hi")).toBe("शाम साढ़े पाँच बजे");
    expect(timeSpeech("09:30", "hinglish")).toBe("सुबह साढ़े नौ बजे");
    expect(timeSpeech("19:15", "hi")).toBe("शाम सवा सात बजे");
    expect(timeSpeech("19:45", "hi")).toBe("शाम पौने आठ बजे");
    expect(timeSpeech("13:30", "hi")).toBe("दोपहर डेढ़ बजे");
    expect(timeSpeech("22:00", "hi")).toBe("रात दस बजे");
    expect(timeSpeech("19:00", "en")).toBe("7 PM");
    expect(timeSpeech("17:30", "en")).toBe("5:30 PM");
    expect(timeSpeech("09:05", "en")).toBe("9:05 AM");
    expect(timeSpeech("12:00", "en")).toBe("12 PM");
  });
});

describe("splitSpeechParts (1.14)", () => {
  it("keeps a short reply in one part", () => {
    expect(splitSpeechParts("एक लाख साठ हज़ार रुपये बाकी हैं।")).toEqual(["एक लाख साठ हज़ार रुपये बाकी हैं।"]);
    expect(splitSpeechParts("Reception: Lotus Hall. एक लाख साठ हज़ार रुपये बाकी हैं।")).toEqual([
      "Reception: Lotus Hall. एक लाख साठ हज़ार रुपये बाकी हैं।",
    ]);
  });
  it("packs sentences into parts of at most 140 characters", () => {
    const text =
      "Diya ने reception Banyan Hall से Lotus Hall में shift किया। यह अभी draft है, guests को Banyan Hall ही दिख रहा है। Guests को publish के बाद दिखेगा। फिर से देखिए?";
    const parts = splitSpeechParts(text);
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(p.length).toBeLessThanOrEqual(140);
    expect(parts.join(" ")).toBe(text);
  });
  it("splits at । . and ? but not inside numbers", () => {
    expect(splitSpeechParts("Is it ₹1.5L? Yes.", 12)).toEqual(["Is it ₹1.5L?", "Yes."]);
    expect(splitSpeechParts("एक। दो। तीन?", 4)).toEqual(["एक।", "दो।", "तीन?"]);
  });
  it("cuts a sentence longer than the limit at a space", () => {
    const long = "word ".repeat(60).trim();
    const parts = splitSpeechParts(long);
    for (const p of parts) expect(p.length).toBeLessThanOrEqual(140);
    expect(parts.join(" ")).toBe(long);
  });
  it("gives nothing for empty text", () => {
    expect(splitSpeechParts("   ")).toEqual([]);
  });
});

describe("voiceForSpeech and speechFor (1.14)", () => {
  it("chooses the voice from the script", () => {
    expect(voiceForSpeech("एक लाख पचास हज़ार रुपये बाकी हैं।")).toEqual({ language_code: "hi-IN", speaker: "simran_enhi_customer" });
    expect(voiceForSpeech("Draft में reception अब Lotus Hall में है।")).toEqual(BULBUL_VOICES.hi);
    expect(voiceForSpeech("That's already saved.")).toEqual({ language_code: "en-IN", speaker: "simran_en_customer" });
    expect(voiceForSpeech("₹40,000 or 40")).toEqual(BULBUL_VOICES.en);
  });
  it("is null for a silent reply", () => {
    expect(speechFor({ display_text: "Correction, not a new payment: ₹50,000 → ₹40,000.", speech_text: null, language: "hinglish" })).toBeNull();
  });
  it("stores the parts and the voice", () => {
    expect(speechFor({ display_text: "x", speech_text: "एक लाख साठ हज़ार रुपये बाकी हैं।", language: "hinglish" })).toEqual({
      parts: ["एक लाख साठ हज़ार रुपये बाकी हैं।"],
      language_code: "hi-IN",
      speaker: "simran_enhi_customer",
    });
    expect(speechFor({ display_text: "x", speech_text: "OK, nothing was changed.", language: "en" })).toEqual({
      parts: ["OK, nothing was changed."],
      language_code: "en-IN",
      speaker: "simran_en_customer",
    });
  });
});
