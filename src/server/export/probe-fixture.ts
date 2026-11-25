import "server-only";

import type { PublicationSnapshot, SnapshotEvent } from "@/contracts/domain";

/**
 * The built-in sample card for the reserved job id `probe` (export-and-recovery 3.3 step 2,
 * 3.6): the demo wedding's names and Hindi lines with the reception at Lotus Hall (REV-3),
 * plus the shaping-check line. No database and no upload. Values from demo-data §11 and
 * export-and-recovery 1.2. The `rev2` variant (Banyan Hall) renders the seeded REV-2 card
 * (decision D15).
 */

export type ProbeVariant = "rev3" | "rev2";

const RECEPTION_EVENT_ID = "00000000-0000-4000-8000-00000000e0c5";
const HALL_VENUE_ID = "00000000-0000-4000-8000-00000000a11e";

/** The couple-photo stand-in in `public/card/` until the seeded photo is in place (D107). */
export const PROBE_PHOTO = { url: "/card/probe-photo.svg", alt: "Placeholder for the couple photo" } as const;

/** design-direction §5's visual check strings, printed on the probe's extra line (1.5). */
export const PROBE_CHECK_LINE = { label: "Shaping check:", text_hi: "कृष्ण प्रीतिभोज स्वागत समारोह" } as const;

function reception(hall: "Lotus Hall" | "Banyan Hall"): SnapshotEvent {
  return {
    event_id: RECEPTION_EVENT_ID,
    event_kind: "reception",
    title: "Reception",
    title_hi: "रिसेप्शन",
    event_date: "2026-12-14",
    start_time: "19:30",
    end_time: "23:00",
    muhurat_time: null,
    dress_code: "Formal evening",
    description: "Dinner follows.",
    venue: {
      venue_id: HALL_VENUE_ID,
      name: hall,
      place_name: "Mallige Gardens",
      locality: "Whitefield",
      address: "Mallige Gardens, Whitefield, Bengaluru",
      map_url: null,
    },
  };
}

export function probeSnapshot(variant: ProbeVariant = "rev3"): PublicationSnapshot {
  return {
    wedding: { bride_name: "Mira", groom_name: "Kabir", city: "Bengaluru", wedding_date: "2026-12-14" },
    invite_style: {
      theme: "maroon_gold",
      typeface: "eczar",
      layout: "card_with_inserts",
      photo_frame: "mounted",
      photo_asset_id: null,
      heading_hi: "शुभ विवाह",
      wording_en: "With the blessings of our families\n\ninvite you to celebrate their wedding",
      wording_hi: "आपकी उपस्थिति से हमें अत्यंत प्रसन्नता होगी।",
      blessing_line: null,
    },
    events: [reception(variant === "rev2" ? "Banyan Hall" : "Lotus Hall")],
  };
}

export const PROBE_CARD_EVENT_IDS = [RECEPTION_EVENT_ID] as const;
