import "server-only";

import type { ReplyRegister } from "@/contracts/api";

import type { ReplyText } from "./types";

/**
 * Fixed replies (voice.md 1.8, 1.4, 2.3, 4.1, 4.10, 6.1). Display text per register, plus the
 * speech text Bulbul says (Hindi words in Devanagari, English words in Latin). Failure
 * messages are shown, never spoken (6.1), so their speech text is null.
 */

export type FixedReplyKey =
  | "already_saved"
  | "nothing_to_confirm"
  | "cancelled"
  | "nothing_to_cancel"
  | "voice_writes_paused"
  | "replaced"
  | "publish_alone"
  | "cant_by_voice"
  | "too_many_actions"
  | "request_closed"
  | "expired"
  | "no_speech"
  | "stt_failed"
  | "llm_failed"
  | "too_long";

type Form = { display: string; speech: string | null };
type Forms = Record<ReplyRegister, Form>;

const same = (display: string, speech: string | null = display): Form => ({ display, speech });

const FIXED: Record<FixedReplyKey, Forms> = {
  already_saved: {
    en: same("That's already saved."),
    hinglish: { display: "Yeh pehle hi save ho chuka hai.", speech: "यह पहले ही save हो चुका है।" },
    hi: same("यह पहले ही सेव हो चुका है।"),
  },
  nothing_to_confirm: {
    en: same("There's nothing to confirm right now."),
    hinglish: { display: "Abhi confirm karne ke liye kuch nahi hai.", speech: "अभी confirm करने के लिए कुछ नहीं है।" },
    hi: same("अभी पुष्टि करने के लिए कुछ नहीं है।"),
  },
  cancelled: {
    en: same("OK, nothing was changed."),
    hinglish: same("ठीक है, कुछ नहीं बदला।"),
    hi: same("ठीक है, कुछ नहीं बदला।"),
  },
  nothing_to_cancel: {
    en: same("There's nothing to cancel."),
    hinglish: { display: "Cancel karne ke liye kuch nahi hai.", speech: "Cancel करने के लिए कुछ नहीं है।" },
    hi: same("रद्द करने के लिए कुछ नहीं है।"),
  },
  // R-03 (4.9 #8, 4.10, decision D93): hi and hinglish share the fixed line.
  voice_writes_paused: {
    en: same("Voice changes are paused right now. You can type it and save."),
    hinglish: {
      display: "Abhi voice se badlav band hain. Aap type karke save kar sakte hain.",
      speech: "अभी voice से बदलाव बंद हैं। आप type करके save कर सकते हैं।",
    },
    hi: {
      display: "Abhi voice se badlav band hain. Aap type karke save kar sakte hain.",
      speech: "अभी voice से बदलाव बंद हैं। आप type करके save कर सकते हैं।",
    },
  },
  replaced: {
    en: same("Replaced by your new request.", null),
    hinglish: same("Aapki nayi request ne ise badal diya.", null),
    hi: same("आपके नए अनुरोध ने इसे बदल दिया।", null),
  },
  publish_alone: {
    en: same("One thing at a time, please: publishing goes on its own."),
    hinglish: { display: "Ek baar mein ek kaam: publish alag se kijiye.", speech: "एक बार में एक काम: publish अलग से कीजिए।" },
    hi: same("एक बार में एक काम: पब्लिश अलग से कीजिए।"),
  },
  cant_by_voice: {
    en: same("I can't do that by voice yet. You can do it on its page."),
    hinglish: {
      display: "Yeh abhi voice se nahi ho sakta. Uske page par kar sakte hain.",
      speech: "यह अभी voice से नहीं हो सकता। उसके page पर कर सकते हैं।",
    },
    hi: same("यह अभी वॉइस से नहीं हो सकता। उसके पेज पर कर सकते हैं।"),
  },
  too_many_actions: {
    en: same("One or two things at a time, please."),
    hinglish: { display: "Ek baar mein ek ya do kaam boliye.", speech: "एक बार में एक या दो काम बोलिए।" },
    hi: same("एक बार में एक या दो काम बोलिए।"),
  },
  request_closed: {
    en: same("This request is closed.", null),
    hinglish: same("This request is closed.", null),
    hi: same("यह अनुरोध बंद हो चुका है।", null),
  },
  expired: {
    en: same("This request expired. Say it again."),
    hinglish: { display: "Yeh request purani ho gayi. Phir se boliye.", speech: "यह request पुरानी हो गई। फिर से बोलिए।" },
    hi: same("यह अनुरोध पुराना हो गया। फिर से बोलिए।"),
  },
  // Failures (6.1): shown in the screen language, never spoken.
  no_speech: {
    en: same("I didn't hear anything. Hold the mic and speak, or type.", null),
    hinglish: same("I didn't hear anything. Hold the mic and speak, or type.", null),
    hi: same("मुझे कुछ सुनाई नहीं दिया। माइक दबाकर बोलिए, या टाइप कीजिए।", null),
  },
  stt_failed: {
    en: same("Couldn't reach the speech service. Nothing was saved. Try again or type.", null),
    hinglish: same("Couldn't reach the speech service. Nothing was saved. Try again or type.", null),
    hi: same("स्पीच सेवा से संपर्क नहीं हो पाया। कुछ सेव नहीं हुआ। फिर कोशिश करें या टाइप करें।", null),
  },
  llm_failed: {
    en: same("Couldn't reach the assistant. Nothing was saved. Edit what I heard, or type it.", null),
    hinglish: same("Couldn't reach the assistant. Nothing was saved. Edit what I heard, or type it.", null),
    hi: same("असिस्टेंट से संपर्क नहीं हो पाया। कुछ सेव नहीं हुआ। सुनी हुई बात बदलें, या टाइप करें।", null),
  },
  too_long: {
    en: same("That recording is too long. Say it in two parts, or type.", null),
    hinglish: same("That recording is too long. Say it in two parts, or type.", null),
    hi: same("रिकॉर्डिंग बहुत लंबी है। दो हिस्सों में बोलिए, या टाइप कीजिए।", null),
  },
};

export function fixedReply(key: FixedReplyKey, register: ReplyRegister): ReplyText {
  const form = FIXED[key][register];
  return { display_text: form.display, speech_text: form.speech, language: register };
}

/** A reply from per-register forms. `speech` undefined means "say what is shown". */
export function reply(register: ReplyRegister, display: string, speech?: string | null): ReplyText {
  return { display_text: display, speech_text: speech === undefined ? display : speech, language: register };
}

/** A silent reply: a complete preview's title line (1.14). */
export function silent(register: ReplyRegister, display: string): ReplyText {
  return { display_text: display, speech_text: null, language: register };
}

/** Joins replies into one (two answers, 4.3), keeping each one's speech. */
export function joinReplies(register: ReplyRegister, parts: ReplyText[]): ReplyText {
  const display = parts.map((part) => part.display_text).join(" ");
  const speechParts = parts.map((part) => part.speech_text ?? part.display_text);
  return { display_text: display, speech_text: speechParts.join(" "), language: register };
}

/** The first sentence of a text (ending in ".", "?", "!" or "।"). */
export function firstSentence(text: string): string {
  const match = text.match(/^.*?[.?!।](?=\s|$)/u);
  return match ? match[0] : text;
}

/** The first sentence of a reply's display and speech. */
export function firstSentenceOf(value: ReplyText): ReplyText {
  return {
    display_text: firstSentence(value.display_text),
    speech_text: value.speech_text === null ? null : firstSentence(value.speech_text),
    language: value.language,
  };
}

/** 4.1's generic question, when nothing else fits. */
export function genericQuestion(register: ReplyRegister): ReplyText {
  if (register === "en") return reply(register, "Sorry, I didn't get that. Say it again, or type it.");
  if (register === "hinglish") {
    return reply(
      register,
      "Maaf kijiye, samajh nahi aaya. Phir se boliye, ya type kijiye.",
      "माफ़ कीजिए, समझ नहीं आया। फिर से बोलिए, या type कीजिए।",
    );
  }
  return reply(register, "माफ़ कीजिए, समझ नहीं आया। फिर से बोलिए, या टाइप कीजिए।");
}

/** "The Shagun register isn't set up yet." (2.3, until Should #13 ships). */
export function shagunNotSetUp(register: ReplyRegister): ReplyText {
  if (register === "en") return reply(register, "The Shagun register isn't set up yet.");
  if (register === "hinglish") {
    return reply(register, "Shagun register abhi set up nahi hua hai.", "शगुन register अभी set up नहीं हुआ है।");
  }
  return reply(register, "शगुन रजिस्टर अभी तैयार नहीं हुआ है।");
}

/** 4.6: a manager's refusal lines. */
export function vendorPaymentsNotShared(register: ReplyRegister): ReplyText {
  if (register === "en") return reply(register, "Vendor payments haven't been shared with you.");
  if (register === "hinglish") {
    return reply(register, "Vendor payments aapke saath share nahi hue hain.", "Vendor payments आपके साथ share नहीं हुए हैं।");
  }
  return reply(register, "वेंडर के भुगतान आपके साथ साझा नहीं किए गए हैं।");
}

export function budgetNotShared(register: ReplyRegister): ReplyText {
  if (register === "en") return reply(register, "The budget hasn't been shared with you. I can help with vendor dues.");
  if (register === "hinglish") {
    return reply(
      register,
      "Budget aapke saath share nahi hua hai. Vendors ke baaki mein madad kar sakti hoon.",
      "Budget आपके साथ share नहीं हुआ है। Vendors के बाकी में मदद कर सकती हूँ।",
    );
  }
  return reply(register, "बजट आपके साथ साझा नहीं किया गया है। वेंडर के बकाया में मदद कर सकती हूँ।");
}

export function totalNotShared(register: ReplyRegister): ReplyText {
  if (register === "en") return reply(register, "The total hasn't been shared with you. I can tell you what each vendor is owed.");
  if (register === "hinglish") {
    return reply(
      register,
      "Total aapke saath share nahi hua hai. Har vendor ka baaki bata sakti hoon.",
      "Total आपके साथ share नहीं हुआ है। हर vendor का बाकी बता सकती हूँ।",
    );
  }
  return reply(register, "कुल रकम आपके साथ साझा नहीं की गई है। हर वेंडर का बकाया बता सकती हूँ।");
}

export function shagunNotShared(register: ReplyRegister): ReplyText {
  if (register === "en") return reply(register, "The Shagun register hasn't been shared with you.");
  if (register === "hinglish") {
    return reply(register, "Shagun register aapke saath share nahi hua hai.", "शगुन register आपके साथ share नहीं हुआ है।");
  }
  return reply(register, "शगुन रजिस्टर आपके साथ साझा नहीं किया गया है।");
}

/** M-14: two refusals join into one sentence, then what the speaker can see (4.3). */
export function budgetAndShagunNotShared(register: ReplyRegister): ReplyText {
  if (register === "en") {
    return reply(register, "The budget and the Shagun register haven't been shared with you. I can help with vendor dues.");
  }
  if (register === "hinglish") {
    return reply(
      register,
      "Budget aur Shagun register aapke saath share nahi hue hain. Vendors ke baaki mein madad kar sakti hoon.",
      "Budget और शगुन register आपके साथ share नहीं हुए हैं। Vendors के बाकी में मदद कर सकती हूँ।",
    );
  }
  return reply(register, "बजट और शगुन रजिस्टर आपके साथ साझा नहीं किए गए हैं। वेंडर के बकाया में मदद कर सकती हूँ।");
}

/** E-06 (4.10): a manager's publish. `owners` is "Mira or Kabir". */
export function publishForbidden(register: ReplyRegister, owners: string): ReplyText {
  if (register === "en") return reply(register, `Only ${owners} can publish. Your change is safe in the draft.`);
  const [a, b] = owners.split(" or ");
  const ownersHi = b ? `${a} ya ${b}` : owners;
  const ownersDev = b ? `${a} या ${b}` : owners;
  if (register === "hinglish") {
    return reply(
      register,
      `Publish sirf ${ownersHi} kar sakte hain. Aapka badlav draft mein safe hai.`,
      `Publish सिर्फ़ ${ownersDev} कर सकते हैं। आपका बदलाव draft में safe है।`,
    );
  }
  return reply(register, `प्रकाशित सिर्फ़ ${ownersDev} कर सकते हैं। आपका बदलाव ड्राफ़्ट में सुरक्षित है।`);
}

/** 1.11 step 2: a manager's add_guest with invitations or plus-ones. */
export function guestInviteForbidden(register: ReplyRegister, owners: string): ReplyText {
  if (register === "en") return reply(register, `Only ${owners} can invite guests to functions.`);
  const [a, b] = owners.split(" or ");
  const ownersHi = b ? `${a} ya ${b}` : owners;
  const ownersDev = b ? `${a} या ${b}` : owners;
  if (register === "hinglish") {
    return reply(
      register,
      `Functions mein guests ko sirf ${ownersHi} invite kar sakte hain.`,
      `Functions में guests को सिर्फ़ ${ownersDev} invite कर सकते हैं।`,
    );
  }
  return reply(register, `कार्यक्रमों में मेहमानों को सिर्फ़ ${ownersDev} बुला सकते हैं।`);
}

/** 2.6 set_wedding_profile: a manager's update. */
export function weddingDetailsForbidden(register: ReplyRegister, owners: string): ReplyText {
  if (register === "en") return reply(register, `Only ${owners} can change the wedding details.`);
  const [a, b] = owners.split(" or ");
  const ownersDev = b ? `${a} या ${b}` : owners;
  const ownersHi = b ? `${a} ya ${b}` : owners;
  if (register === "hinglish") {
    return reply(
      register,
      `Wedding ki details sirf ${ownersHi} badal sakte hain.`,
      `Wedding की details सिर्फ़ ${ownersDev} बदल सकते हैं।`,
    );
  }
  return reply(register, `शादी की जानकारी सिर्फ़ ${ownersDev} बदल सकते हैं।`);
}
