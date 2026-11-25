/**
 * The guest page's fixed strings (acceptance AT-4.1, AT-4.2; design-direction 10.6).
 * The Hindi lines are drafts pending a native speaker's check.
 * No string here names a count, an amount or a contact (G2, AT-9.1).
 */
import type { AppLanguage } from "@/contracts/domain";

export type GuestCopy = {
  language_en: string;
  language_hi: string;
  language_label: string;
  will_you_come: string;
  yes: string;
  no: string;
  directions: string;
  dress: string;
  muhurat: string;
  guests_with_you: string;
  fewer: string;
  more: string;
  food_heading: string;
  food_for: (name: string) => string;
  food_chips: readonly string[];
  food_placeholder: string;
  send: string;
  sending: string;
  change_later: string;
  thank_you: (name: string) => string;
  change_reply: string;
  photo_label: string;
  photo_alt: (names: string) => string;
  sample_badge: string;
  error_rate_limited: string;
  error_network: string;
  error_gone: string;
  error_nothing_chosen: string;
  error_other: string;
};

export const GUEST_COPY: Record<AppLanguage, GuestCopy> = {
  en: {
    language_en: "English",
    language_hi: "हिंदी",
    language_label: "Language",
    will_you_come: "Will you come?",
    yes: "Yes, attending",
    no: "Can't come",
    directions: "Directions",
    dress: "Dress:",
    muhurat: "Muhurat",
    guests_with_you: "Guests with you",
    fewer: "One fewer",
    more: "One more",
    food_heading: "Food preferences (optional)",
    food_for: (name) => `Food preferences for ${name}`,
    food_chips: ["Vegetarian", "Jain", "No onion or garlic"],
    food_placeholder: "Anything else the caterer should know",
    send: "Send reply to the families",
    sending: "Sending",
    change_later: "You can change your reply later from this link.",
    thank_you: (name) => `Thank you, ${name}. The families have your reply.`,
    change_reply: "Change reply",
    photo_label: "AI-generated, fictional",
    photo_alt: (names) => `${names}, the couple`,
    sample_badge: "Fictional demo data",
    error_rate_limited: "Too many tries from this link. Wait a minute, then send again.",
    error_network: "Your reply didn't reach the families. Check your connection and send again.",
    error_gone: "This invitation link no longer works. Ask the family for a new one.",
    error_nothing_chosen: "Choose Yes or Can't come for at least one celebration.",
    error_other: "Your reply wasn't saved. Check your answers and send again.",
  },
  hi: {
    language_en: "English",
    language_hi: "हिंदी",
    language_label: "भाषा",
    will_you_come: "क्या आप आएँगे?",
    yes: "हाँ, आएँगे",
    no: "नहीं आ पाएँगे",
    directions: "रास्ता देखें",
    dress: "पहनावा:",
    muhurat: "मुहूर्त",
    guests_with_you: "साथ में मेहमान",
    fewer: "एक कम",
    more: "एक और",
    food_heading: "खाने की पसंद (वैकल्पिक)",
    food_for: (name) => `${name} के खाने की पसंद`,
    food_chips: ["शाकाहारी", "जैन", "बिना प्याज़-लहसुन"],
    food_placeholder: "खाने के बारे में और कुछ बताना हो तो लिखें",
    send: "परिवारों को जवाब भेजें",
    sending: "भेज रहे हैं",
    change_later: "आप इसी लिंक से बाद में अपना जवाब बदल सकते हैं।",
    thank_you: (name) => `धन्यवाद, ${name}। परिवारों को आपका जवाब मिल गया है।`,
    change_reply: "जवाब बदलें",
    photo_label: "AI से बनी, काल्पनिक",
    photo_alt: (names) => `${names}, दूल्हा-दुल्हन`,
    sample_badge: "काल्पनिक डेमो डेटा",
    error_rate_limited: "इस लिंक से बहुत बार भेजा गया। एक मिनट रुककर फिर भेजें।",
    error_network: "आपका जवाब परिवारों तक नहीं पहुँचा। इंटरनेट देखकर फिर भेजें।",
    error_gone: "यह निमंत्रण लिंक अब काम नहीं करता। परिवार से नया लिंक माँगें।",
    error_nothing_chosen: "कम से कम एक समारोह के लिए हाँ या नहीं चुनें।",
    error_other: "आपका जवाब सहेजा नहीं गया। अपने जवाब देखकर फिर भेजें।",
  },
};
