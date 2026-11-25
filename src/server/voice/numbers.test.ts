import { describe, expect, it } from "vitest";

import {
  addDays,
  composeDate,
  foldLatin,
  inRange,
  isSmallVendorAmount,
  pickTimeReading,
  readAmount,
  readAmountDetailed,
  readCorrectionPair,
  readCount,
  readDate,
  readMonth,
  readTime,
  rereadField,
  resolveDate,
  weekdayOfDate,
} from "./numbers";

const TODAY = "2026-11-25";
const WEDDING = "2026-12-14";
const ctx = { today: TODAY, wedding_date: WEDDING };
const setupCtx = { today: TODAY, wedding_date: null };

describe("readAmount (voice.md 3.2, 3.7)", () => {
  const cases: Array<[string, number]> = [
    // 3.7's worked examples
    ["chaalis hazaar", 40_000],
    ["चालीस हज़ार", 40_000],
    ["चालीस हजार", 40_000],
    ["40000", 40_000],
    ["40,000", 40_000],
    ["₹40,000", 40_000],
    ["४०,०००", 40_000],
    ["40k", 40_000],
    ["dedh lakh", 150_000],
    ["डेढ़ लाख", 150_000],
    ["1.5 lakh", 150_000],
    ["₹1.5L", 150_000],
    ["one and a half lakh", 150_000],
    ["paanch sau", 500],
    ["पाँच सौ", 500],
    ["500", 500],
    ["5,100", 5_100],
    ["ikyavan sau", 5_100],
    ["इक्यावन सौ", 5_100],
    ["twelve lakh", 1_200_000],
    ["baarah lakh", 1_200_000],
    ["बारह लाख", 1_200_000],
    ["12 lakh", 1_200_000],
    ["12,00,000", 1_200_000],
    ["sava lakh", 125_000],
    ["सवा लाख", 125_000],
    ["dhai lakh", 250_000],
    ["ढाई लाख", 250_000],
    ["paune do lakh", 175_000],
    ["पौने दो लाख", 175_000],
    ["saade teen hazaar", 3_500],
    ["साढ़े तीन लाख", 350_000],
    ["ek lakh saath hazaar", 160_000],
    ["एक लाख साठ हज़ार", 160_000],
    ["fifty-thousand", 50_000],
    ["fifty thousand", 50_000],
    ["pachaas hazaar", 50_000],
    ["पचास हज़ार", 50_000],
    ["bees hazaar", 20_000],
    ["बीस हज़ार", 20_000],
    ["eight hundred", 800],
    // 3.2's rules
    ["chalis hazar", 40_000],
    ["chaalees hajar", 40_000],
    ["ek lakh saath hazaar paanch sau", 160_500],
    ["paanch sau pachaas", 550],
    ["do hazaar chhabbees", 2_026],
    ["pandrah sau", 1_500],
    ["lakh", 100_000],
    ["a lakh", 100_000],
    ["sau", 100],
    ["dedh hazaar", 1_500],
    ["dedh sau", 150],
    ["dhai hazaar", 2_500],
    ["dhai sau", 250],
    ["sava do lakh", 225_000],
    ["sava paanch hazaar", 5_250],
    ["saade paanch hazaar", 5_500],
    ["paune lakh", 75_000],
    ["paune sau", 75],
    ["half a lakh", 50_000],
    ["two and a half lakh", 250_000],
    ["2.25 lakh", 225_000],
    ["1,50,000", 150_000],
    ["150,000", 150_000],
    ["Rs. 40,000", 40_000],
    ["INR 40000", 40_000],
    ["40000 rupaye", 40_000],
    ["चालीस हज़ार रुपये", 40_000],
    ["sirf 10,000", 10_000],
    ["lagbhag pachaas hazaar", 50_000],
    ["ek crore pachchees lakh paanch sau", 12_500_500],
    ["one lakh eighty-four thousand", 184_000],
    ["two hundred fifty thousand", 250_000],
    ["₹50,000 ka", 50_000],
    ["chaalis", 40],
    ["chhe hazaar", 6_000],
    ["छः हज़ार", 6_000],
    ["twenty six thousand", 26_000],
    ["one million", 1_000_000],
    ["2 cr", 20_000_000],
    ["दो करोड़", 20_000_000],
  ];
  it.each(cases)("%s → %d", (phrase, expected) => {
    expect(readAmount(phrase)).toBe(expected);
  });

  const unreadable = [
    "",
    "hello",
    "dedh",
    "1.5",
    "15,00",
    "chaalis pachaas",
    "ek hazaar do lakh",
    "chaalis hazaar advance diya tha",
    "lakh lakh",
    "1.3333 hazaar",
    "saade do",
  ];
  it.each(unreadable)("%s → null", (phrase) => {
    expect(readAmount(phrase)).toBeNull();
  });

  it("rule 5: a bare count after lakh is ambiguous, offering the next scale down", () => {
    expect(readAmount("do lakh pachaas")).toBeNull();
    expect(readAmountDetailed("do lakh pachaas")).toEqual({ status: "ambiguous", value: null, suggestion: 250_000 });
    expect(readAmountDetailed("ek crore pachchees")).toEqual({ status: "ambiguous", value: null, suggestion: 12_500_000 });
  });

  it("rule 7: a correction pair reads the corrected amount", () => {
    expect(readAmount("पचास नहीं, चालीस हज़ार")).toBe(40_000);
    const reading = readAmountDetailed("पचास नहीं, चालीस हज़ार");
    expect(reading.status).toBe("ok");
    if (reading.status === "ok") expect(reading.correction).toEqual({ previous_inr: 50_000, amount_inr: 40_000 });
  });
});

describe("readCorrectionPair (3.2 rule 7)", () => {
  const cases: Array<[string, { previous_inr: number; amount_inr: number } | null]> = [
    ["नहीं, पचास नहीं, चालीस हज़ार दिए थे।", { previous_inr: 50_000, amount_inr: 40_000 }],
    ["पचास नहीं, चालीस हज़ार", { previous_inr: 50_000, amount_inr: 40_000 }],
    ["fifty, no, forty thousand", { previous_inr: 50_000, amount_inr: 40_000 }],
    ["not fifty, forty thousand", { previous_inr: 50_000, amount_inr: 40_000 }],
    ["forty thousand, not fifty", { previous_inr: 50_000, amount_inr: 40_000 }],
    ["pachaas nahin chaalis hazaar diye the", { previous_inr: 50_000, amount_inr: 40_000 }],
    ["पचास हज़ार नहीं, चालीस", { previous_inr: 50_000, amount_inr: 40_000 }],
    ["Caterer ko chaalis hazaar advance diya tha", null],
    ["नहीं, रहने दो", null],
  ];
  it.each(cases)("%s", (text, expected) => {
    expect(readCorrectionPair(text)).toEqual(expected);
  });
});

describe("readCount", () => {
  const cases: Array<[string, number]> = [
    ["बारह", 12],
    ["twelve", 12],
    ["250", 250],
    ["terah", 13],
    ["तेरह", 13],
    ["roughly 250 guests", 250],
    ["barah logon", 12],
    ["बारह लोगों", 12],
    ["twelve guests", 12],
    ["250 people", 250],
    ["two hundred fifty", 250],
    ["do sau pachaas", 250],
    ["ढाई सौ", 250],
    ["dedh sau log", 150],
    ["around 1,000", 1_000],
  ];
  it.each(cases)("%s → %d", (phrase, expected) => {
    expect(readCount(phrase)).toBe(expected);
  });
  it.each(["", "kuch log", "do lakh pachaas", "1.5"])("%s → null", (phrase) => {
    expect(readCount(phrase)).toBeNull();
  });
});

describe("number words 1 to 99, both scripts", () => {
  const latin = [
    "ek", "do", "teen", "chaar", "paanch", "chhah", "saat", "aath", "nau",
    "das", "gyaarah", "baarah", "terah", "chaudah", "pandrah", "solah", "satrah", "athaarah", "unnees",
    "bees", "ikkees", "baaees", "teyees", "chaubees", "pachchees", "chhabbees", "sattaees", "atthaees", "untees",
    "tees", "iktees", "battees", "taintees", "chauntees", "paintees", "chhattees", "saintees", "adtees", "untaalees",
    "chaalees", "iktaalees", "bayaalees", "taintaalees", "chavaalees", "paintaalees", "chhiyaalees", "saintaalees", "adtaalees", "unchaas",
    "pachaas", "ikyaavan", "baavan", "tirepan", "chauvan", "pachpan", "chhappan", "sattaavan", "atthaavan", "unsath",
    "saath", "iksath", "baasath", "tirsath", "chaunsath", "painsath", "chhiyaasath", "sadsath", "adsath", "unhattar",
    "sattar", "ikhattar", "bahattar", "tihattar", "chauhattar", "pachhattar", "chhihattar", "sathattar", "athhattar", "unyaasi",
    "assi", "ikyaasi", "bayaasi", "tiraasi", "chauraasi", "pachaasi", "chhiyaasi", "sattaasi", "atthaasi", "navaasi",
    "nabbe", "ikyaanve", "baanve", "tiraanve", "chauraanve", "pachaanve", "chhiyaanve", "sattaanve", "atthaanve", "ninyaanve",
  ];
  it("reads every Latin word in 3.2's table", () => {
    latin.forEach((word, i) => expect([word, readCount(word)]).toEqual([word, i + 1]));
  });
  it("reads every Devanagari word, 1 to 99", () => {
    const deva = [
      "एक", "दो", "तीन", "चार", "पाँच", "छह", "सात", "आठ", "नौ", "दस", "ग्यारह", "बारह", "तेरह", "चौदह", "पंद्रह", "सोलह", "सत्रह", "अठारह", "उन्नीस",
      "बीस", "इक्कीस", "बाईस", "तेईस", "चौबीस", "पच्चीस", "छब्बीस", "सत्ताईस", "अट्ठाईस", "उनतीस", "तीस", "इकतीस", "बत्तीस", "तैंतीस", "चौंतीस", "पैंतीस",
      "छत्तीस", "सैंतीस", "अड़तीस", "उनतालीस", "चालीस", "इकतालीस", "बयालीस", "तैंतालीस", "चवालीस", "पैंतालीस", "छियालीस", "सैंतालीस", "अड़तालीस", "उनचास",
      "पचास", "इक्यावन", "बावन", "तिरेपन", "चौवन", "पचपन", "छप्पन", "सत्तावन", "अट्ठावन", "उनसठ", "साठ", "इकसठ", "बासठ", "तिरसठ", "चौंसठ", "पैंसठ",
      "छियासठ", "सड़सठ", "अड़सठ", "उनहत्तर", "सत्तर", "इकहत्तर", "बहत्तर", "तिहत्तर", "चौहत्तर", "पचहत्तर", "छिहत्तर", "सतहत्तर", "अठहत्तर", "उन्यासी",
      "अस्सी", "इक्यासी", "बयासी", "तिरासी", "चौरासी", "पचासी", "छियासी", "सत्तासी", "अट्ठासी", "नवासी", "नब्बे", "इक्यानवे", "बानवे", "तिरानवे", "चौरानवे",
      "पचानवे", "छियानवे", "सत्तानवे", "अट्ठानवे", "निन्यानवे",
    ];
    deva.forEach((word, i) => expect([word, readCount(word)]).toEqual([word, i + 1]));
  });
  it("reads English one to ninety-nine", () => {
    expect(readCount("ninety-nine")).toBe(99);
    expect(readCount("twenty-one")).toBe(21);
    expect(readCount("forty five")).toBe(45);
    expect(readCount("nineteen")).toBe(19);
  });
  it("folds long vowels and w", () => {
    expect(foldLatin("chaalees")).toBe(foldLatin("chalis"));
    expect(foldLatin("ikyawan")).toBe(foldLatin("ikyaavan"));
  });
  it("also accepts 3.2's extra spellings", () => {
    expect(readCount("छः")).toBe(6);
    expect(readCount("che")).toBe(6);
    expect(readCount("pachees")).toBe(25);
    expect(readCount("उनासी")).toBe(79);
    expect(readCount("चौवालीस")).toBe(44);
    expect(readCount("तिरपन")).toBe(53);
  });
});

describe("ranges (3.6)", () => {
  it("checks a payment, a budget and a count", () => {
    expect(inRange("amount_inr", 40_000)).toBe(true);
    expect(inRange("amount_inr", 2_000_000_000)).toBe(false);
    expect(inRange("budget_inr", 0)).toBe(true);
    expect(inRange("quantity", 20_000, "add_requirement")).toBe(false);
    expect(inRange("expected_guests", 250)).toBe(true);
    expect(isSmallVendorAmount(40)).toBe(true);
    expect(isSmallVendorAmount(40_000)).toBe(false);
  });
});

describe("readDate (3.3)", () => {
  it("14 December with no wedding date: no year, no date", () => {
    expect(readDate("14 December", setupCtx)).toMatchObject({ date: null, day: 14, month: 12, year: null, relative: null });
  });
  it("14 December with a wedding date takes the year from the wedding window", () => {
    expect(readDate("14 December", ctx)).toMatchObject({ date: "2026-12-14", day: 14, month: 12, year: null });
  });
  const event: Array<[string, string]> = [
    ["13 Dec", "2026-12-13"],
    ["13 December", "2026-12-13"],
    ["terah December", "2026-12-13"],
    ["तेरह दिसंबर", "2026-12-13"],
    ["तेरह दिसम्बर", "2026-12-13"],
    ["13/12", "2026-12-13"],
    ["13-12", "2026-12-13"],
    ["13.12", "2026-12-13"],
    ["13/12/2026", "2026-12-13"],
    ["2026-12-13", "2026-12-13"],
    ["13th December", "2026-12-13"],
    ["the 13th", "2026-12-13"],
    ["14 December 2026", "2026-12-14"],
    ["14 December twenty twenty-six", "2026-12-14"],
    ["14 December do hazaar chhabbees", "2026-12-14"],
    ["14 दिसंबर दो हज़ार छब्बीस", "2026-12-14"],
  ];
  it.each(event)("%s → %s", (phrase, date) => {
    expect(readDate(phrase, ctx).date).toBe(date);
  });
  it("the thirteenth, terah tareekh ko: from the wedding month", () => {
    expect(readDate("the thirteenth", ctx)).toMatchObject({ date: "2026-12-13", day: 13, month: null, from_wedding_month: true });
    expect(readDate("terah tareekh ko", ctx)).toMatchObject({ date: "2026-12-13", from_wedding_month: true });
    expect(readDate("तेरह तारीख़ को", ctx)).toMatchObject({ date: "2026-12-13", from_wedding_month: true });
    expect(readDate("the thirty-first", ctx)).toMatchObject({ day: 31, date: "2026-12-31" });
  });
  it("relative words", () => {
    expect(readDate("kal", ctx)).toMatchObject({ relative: "tomorrow", date: "2026-11-26", tense_dependent: true, relative_days: 1 });
    expect(readDate("tomorrow", ctx)).toMatchObject({ relative: "tomorrow", date: "2026-11-26", tense_dependent: false });
    expect(readDate("aaj", ctx)).toMatchObject({ relative: "today", date: TODAY });
    expect(readDate("today", ctx)).toMatchObject({ relative: "today", date: TODAY });
    expect(readDate("आज", ctx)).toMatchObject({ relative: "today" });
    expect(readDate("yesterday", ctx)).toMatchObject({ relative: null, relative_days: -1, date: "2026-11-24" });
    expect(readDate("परसों", ctx)).toMatchObject({ relative_days: 2, tense_dependent: true });
    expect(readDate("next Sunday", ctx)).toMatchObject({ date: "2026-11-29" });
    expect(readDate("agle ravivaar", ctx)).toMatchObject({ date: "2026-11-29" });
  });
  it("Saal 2026 hai: a year alone", () => {
    expect(readDate("Saal 2026 hai", setupCtx)).toMatchObject({ year: 2026, day: null, month: null, date: null });
  });
  it("a weekday that contradicts the date", () => {
    expect(readDate("Monday 13 December", ctx)).toMatchObject({ date: "2026-12-13", weekday: 1, weekday_matches: false });
    expect(readDate("Sunday 13 December", ctx)).toMatchObject({ weekday_matches: true });
  });
  it("garbage and impossible dates", () => {
    expect(readDate("hello there", ctx).date).toBeNull();
    expect(readDate("31 November 2026", ctx).date).toBeNull();
    expect(readDate("", ctx).date).toBeNull();
  });
  it("demo-data §14's weekdays", () => {
    expect(weekdayOfDate("2026-12-13")).toBe(0);
    expect(weekdayOfDate("2026-12-14")).toBe(1);
    expect(weekdayOfDate("2026-11-25")).toBe(3);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(composeDate(2026, 2, 29)).toBeNull();
  });
});

describe("resolveDate per field (3.3's table)", () => {
  it("wedding_date is never filled in without a said year (AT-1.4)", () => {
    expect(resolveDate("wedding_date", "14 December", setupCtx).status).toBe("partial");
    expect(resolveDate("wedding_date", "14 December 2026", setupCtx)).toMatchObject({ status: "ok", date: "2026-12-14" });
    expect(resolveDate("wedding_date", "Saal 2026 hai", { ...setupCtx, draft_date_text: "14 December" })).toMatchObject({
      status: "ok",
      date: "2026-12-14",
    });
    expect(resolveDate("wedding_date", "kal", setupCtx).status).toBe("asked");
  });
  it("event_date: a relative word is always asked, with the resolved date offered (E-08)", () => {
    expect(resolveDate("event_date", "kal", ctx)).toMatchObject({ status: "asked", date: "2026-11-26" });
    expect(resolveDate("event_date", "the thirteenth", ctx)).toMatchObject({ status: "ok", date: "2026-12-13" });
    expect(resolveDate("event_date", "Monday 13 December", ctx).status).toBe("weekday_mismatch");
    expect(resolveDate("event_date", "13 December 2031", ctx).status).toBe("unreadable");
  });
  it("paid_on: aaj today, kal yesterday, never after today", () => {
    expect(resolveDate("paid_on", "kal", ctx)).toMatchObject({ status: "ok", date: "2026-11-24" });
    expect(resolveDate("paid_on", "aaj", ctx)).toMatchObject({ status: "ok", date: TODAY });
    expect(resolveDate("paid_on", "parson", ctx)).toMatchObject({ status: "ok", date: "2026-11-23" });
    expect(resolveDate("paid_on", "20 November", ctx)).toMatchObject({ status: "ok", date: "2026-11-20" });
    expect(resolveDate("paid_on", "20 December", ctx)).toMatchObject({ status: "ok", date: "2025-12-20" });
    expect(resolveDate("paid_on", "20", ctx)).toMatchObject({ status: "ok", date: "2026-11-20" });
    expect(resolveDate("paid_on", "28", ctx)).toMatchObject({ status: "ok", date: "2026-10-28" });
    expect(resolveDate("paid_on", "tomorrow", ctx).status).toBe("unreadable");
  });
  it("due_on: kal tomorrow, the next such date", () => {
    expect(resolveDate("due_on", "kal", ctx)).toMatchObject({ status: "ok", date: "2026-11-26" });
    expect(resolveDate("due_on", "10", ctx)).toMatchObject({ status: "ok", date: "2026-12-10" });
    expect(resolveDate("due_on", "28", ctx)).toMatchObject({ status: "ok", date: "2026-11-28" });
    expect(resolveDate("due_on", "10 November", ctx)).toMatchObject({ status: "ok", date: "2027-11-10" });
  });
  it("day (query_changes): today stays today", () => {
    expect(resolveDate("day", "today", ctx)).toMatchObject({ status: "ok", date: "today" });
    expect(resolveDate("day", "kal", ctx)).toMatchObject({ status: "ok", date: "2026-11-24" });
  });
  it("readMonth (S-03)", () => {
    expect(readMonth("December mein")).toBe(12);
    expect(readMonth("दिसंबर में")).toBe(12);
    expect(readMonth("14 December")).toBeNull();
  });
});

describe("readTime (3.4)", () => {
  const cases: Array<[string, string]> = [
    ["shaam saat baje", "19:00"],
    ["seven in the evening", "19:00"],
    ["7 PM", "19:00"],
    ["7pm", "19:00"],
    ["7 p.m.", "19:00"],
    ["शाम सात बजे", "19:00"],
    ["शाम साढ़े पाँच बजे", "17:30"],
    ["शाम साढ़े पाँच बजे तक", "17:30"],
    ["19:00", "19:00"],
    ["7:30 pm", "19:30"],
    ["subah saat baje", "07:00"],
    ["सुबह साढ़े नौ बजे", "09:30"],
    ["shaam sava saat", "19:15"],
    ["shaam paune aath baje", "19:45"],
    ["dopahar barah baje", "12:00"],
    ["noon", "12:00"],
    ["dopahar dedh baje", "13:30"],
    ["dopahar dhai baje", "14:30"],
    ["raat das baje", "22:00"],
    ["half past seven in the evening", "19:30"],
    ["quarter to eight pm", "19:45"],
    ["seven thirty pm", "19:30"],
    ["15:00", "15:00"],
    ["07:00", "07:00"],
    ["7 AM", "07:00"],
  ];
  it.each(cases)("%s → %s", (phrase, time) => {
    const reading = readTime(phrase);
    expect(reading.time).toBe(time);
    expect(reading.daypart_missing).toBe(false);
  });
  it("a bare saat baje needs a daypart", () => {
    expect(readTime("saat baje")).toEqual({ time: "07:00", daypart_missing: true, daypart: null, alternatives: ["07:00", "19:00"] });
    expect(readTime("7 बजे")).toMatchObject({ daypart_missing: true });
    expect(readTime("saade paanch baje tak")).toMatchObject({ time: "05:30", daypart_missing: true, alternatives: ["05:30", "17:30"] });
  });
  it("subah alone is the morning, with no time", () => {
    expect(readTime("subah")).toEqual({ time: null, daypart_missing: false, daypart: "morning", alternatives: [] });
  });
  it("garbage", () => {
    expect(readTime("hello").time).toBeNull();
    expect(readTime("").time).toBeNull();
    expect(readTime("25:00").time).toBeNull();
  });
  it("the only reading after the start (E-03 without shaam)", () => {
    const reading = readTime("saade paanch baje tak");
    expect(pickTimeReading("end_time", reading, { start_time: "15:00" })).toBe("17:30");
    expect(pickTimeReading("start_time", readTime("saat baje"), null)).toBeNull();
  });
});

describe("rereadField (3.1)", () => {
  it("amounts", () => {
    expect(rereadField("amount_inr", 40_000, "chaalis hazaar", ctx)).toBe("match");
    expect(rereadField("amount_inr", 40_000, "चालीस हज़ार", ctx)).toBe("match");
    expect(rereadField("amount_inr", 40_000, "40000", ctx)).toBe("match");
    expect(rereadField("amount_inr", 50_000, "चालीस हज़ार", ctx)).toBe("mismatch");
    expect(rereadField("amount_inr", 40_000, "chaalis", ctx)).toBe("mismatch");
    expect(rereadField("amount_inr", 250_000, "do lakh pachaas", ctx)).toBe("unreadable");
    expect(rereadField("budget_inr", 1_200_000, "twelve lakh", ctx)).toBe("match");
    expect(rereadField("user_claim_inr", 150_000, "₹1.5L", ctx)).toBe("match");
    expect(rereadField("amount_inr", 125_000, "sava lakh", ctx)).toBe("match");
    expect(rereadField("amount_inr", 40_000, "", ctx)).toBe("unreadable");
    expect(rereadField("amount_inr", 40_000, "advance", ctx)).toBe("unreadable");
  });
  it("M-04: the old amount borrows the new amount's scale", () => {
    const transcript = "नहीं, पचास नहीं, चालीस हज़ार दिए थे।";
    expect(rereadField("previous_inr", 50_000, "पचास", { ...ctx, transcript })).toBe("match");
    expect(rereadField("previous_inr", 50_000, "पचास नहीं, चालीस हज़ार", ctx)).toBe("match");
    expect(rereadField("amount_inr", 40_000, "चालीस हज़ार", { ...ctx, transcript })).toBe("match");
    expect(rereadField("previous_inr", 50_000, "पचास", ctx)).toBe("mismatch");
  });
  it("counts", () => {
    expect(rereadField("quantity", 12, "बारह", ctx)).toBe("match");
    expect(rereadField("quantity", 12, "twelve", ctx)).toBe("match");
    expect(rereadField("expected_guests", 250, "roughly 250 guests", ctx)).toBe("match");
    expect(rereadField("quantity", 250, "250", ctx)).toBe("match");
    expect(rereadField("quantity", 13, "barah", ctx)).toBe("mismatch");
  });
  it("dates", () => {
    expect(rereadField("event_date", "2026-12-13", "the thirteenth", ctx)).toBe("match");
    expect(rereadField("event_date", "2026-12-13", "terah tareekh ko", ctx)).toBe("match");
    expect(rereadField("event_date", "2026-11-26", "kal", ctx)).toBe("unreadable");
    expect(rereadField("event_date", "2026-12-13", "Monday 13 December", ctx)).toBe("unreadable");
    expect(rereadField("wedding_date", "2026-12-14", "14 December", setupCtx)).toBe("unreadable");
    expect(rereadField("wedding_date", "2026-12-14", "14 December 2026", setupCtx)).toBe("match");
    expect(rereadField("paid_on", "2026-11-24", "kal", ctx)).toBe("match");
    expect(rereadField("paid_on", "2026-11-25", "kal", ctx)).toBe("mismatch");
  });
  it("times", () => {
    expect(rereadField("start_time", "19:00", "shaam saat baje", ctx)).toBe("match");
    expect(rereadField("start_time", "19:00", "seven in the evening", ctx)).toBe("match");
    expect(rereadField("end_time", "17:30", "शाम साढ़े पाँच बजे तक", ctx)).toBe("match");
    expect(rereadField("start_time", "19:00", "saat baje", ctx)).toBe("unreadable");
    expect(rereadField("end_time", "17:30", "saade paanch baje tak", { ...ctx, event_times: { start_time: "15:00" } })).toBe("match");
    expect(rereadField("start_time", "07:00", "shaam saat baje", ctx)).toBe("mismatch");
  });
  it("month and plain text", () => {
    expect(rereadField("month", 12, "December mein", ctx)).toBe("match");
    expect(rereadField("venue_name", "Lotus Hall", "Lotus Hall", ctx)).toBe("match");
    expect(rereadField("venue_name", "Lotus Hall", "Banyan Hall", ctx)).toBe("mismatch");
  });
});
