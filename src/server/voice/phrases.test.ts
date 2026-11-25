import { describe, expect, it } from "vitest";

import { canonicalPhrase, matchPhrase } from "./phrases";

describe("matchPhrase (voice.md 1.8)", () => {
  const confirm = [
    "Haan, save karo.",
    "हाँ, save करो",
    "हां सेव करो",
    "haan",
    "Haan.",
    "हाँ",
    "han",
    "haa",
    "ha",
    "Yes, save.",
    "yeah save",
    "Theek hai, save.",
    "ठीक है save",
    "thik he save",
    "haan ji",
    "हाँ जी",
    "Yes",
    "yep",
    "save karo",
    "सेव करो",
    "save kar do",
    "save कर दो",
    "theek hai save karo",
    "Theek hai, save kar do.",
    "haan save kardo",
  ];
  it.each(confirm)("%s → confirm", (t) => {
    expect(matchPhrase(t)).toBe("confirm");
  });

  const cancel = [
    "नहीं, रहने दो।",
    "nahin, रहने दो",
    "नहीं, rehne do",
    "Nahin rehne do",
    "nahi rahne do",
    "cancel",
    "Cancel.",
    "कैंसल",
    "nahin",
    "नहीं",
    "nai",
    "rehne do",
    "रहने दो",
    "no",
    "No.",
    "cancel karo",
    "cancel kar do",
    "कैंसल करो",
  ];
  it.each(cancel)("%s → cancel", (t) => {
    expect(matchPhrase(t)).toBe("cancel");
  });

  const neither = [
    "नहीं, पचास नहीं, चालीस हज़ार दिए थे",
    "Caterer ko chaalis hazaar advance diya tha.",
    "haan, aur decorator ko bhi",
    "theek hai",
    "save",
    "yes please save the payment",
    "Advance chaalis hazaar tha.",
    "no, forty thousand",
    "",
    "   ",
    "।",
  ];
  it.each(neither)("%s → null", (t) => {
    expect(matchPhrase(t)).toBeNull();
  });

  it("maps equivalent words to canonical ones", () => {
    expect(canonicalPhrase("हाँ, save करो")).toBe("haan save karo");
    expect(canonicalPhrase("नहीं, रहने दो।")).toBe("nahin rehne do");
  });
});
