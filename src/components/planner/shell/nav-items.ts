/**
 * The planner nav (brief B1; DESIGN.md "Navigation and the header mic"). Safe on the server
 * and in the browser: labels, keys and the active-section rule, with no icons (the client
 * nav components own those). Every href is built with `routes.section`.
 */
import type { WeddingId } from "@/contracts/domain";
import { PLANNER_SECTIONS, routes, type PlannerSection } from "@/contracts/routes";

/** The section title shown in the desktop header and on each page. */
export const SECTION_TITLES: Record<PlannerSection, string> = {
  overview: "Overview",
  events: "Events",
  guests: "Guests",
  money: "Money",
  vendors: "Vendors",
  invite: "Invite",
  activity: "Activity",
  shagun: "Shagun",
};

/** The six sections in the phone tab row and the top of the rail. Invite is Lane D's page (D121). */
export const PRIMARY_SECTIONS = ["overview", "events", "guests", "money", "vendors", "invite"] as const satisfies readonly PlannerSection[];

/**
 * Below the six in the rail; in the wedding menu on phones. Shagun is future scope today
 * (D131), so it has no nav item.
 */
export const SECONDARY_SECTIONS = ["activity"] as const satisfies readonly PlannerSection[];

export type NavSection = (typeof PRIMARY_SECTIONS)[number] | (typeof SECONDARY_SECTIONS)[number];

export function sectionHref(wedding_id: WeddingId, section: PlannerSection): string {
  return routes.section(wedding_id, section);
}

/**
 * The section a pathname belongs to: `/w/{id}` is the overview, `/w/{id}/money/...` is
 * money. Null outside this wedding's pages.
 */
export function activeSection(pathname: string | null, wedding_id: WeddingId): PlannerSection | null {
  if (!pathname) return null;
  const base = routes.wedding(wedding_id);
  const path = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  if (path === base) return "overview";
  if (!path.startsWith(`${base}/`)) return null;
  const segment = path.slice(base.length + 1).split("/")[0];
  return (PLANNER_SECTIONS as readonly string[]).includes(segment) && segment !== "overview"
    ? (segment as PlannerSection)
    : null;
}

/**
 * The gold nav dot (brief B3, design-direction 7.2): which section an activity topic belongs
 * to. Money topics light both Money and Vendors.
 */
const TOPIC_SECTIONS: { prefixes: readonly string[]; sections: readonly NavSection[] }[] = [
  { prefixes: ["event.", "requirement."], sections: ["events"] },
  { prefixes: ["rsvp.", "guest.", "dietary.", "invitation"], sections: ["guests"] },
  {
    prefixes: ["payment.", "commitment.", "quote.", "expense.", "proposal.", "budget."],
    sections: ["money", "vendors"],
  },
];

export type SectionSeqs = Partial<Record<NavSection, number>>;

/** The newest activity `seq` per section, from a feed in `seq`-descending order. */
export function newestSeqBySection(entries: readonly { seq: number; topic: string }[]): SectionSeqs {
  const latest: SectionSeqs = {};
  for (const entry of entries) {
    for (const group of TOPIC_SECTIONS) {
      if (!group.prefixes.some((prefix) => entry.topic.startsWith(prefix))) continue;
      for (const section of group.sections) {
        if (latest[section] === undefined || entry.seq > (latest[section] ?? 0)) latest[section] = entry.seq;
      }
    }
  }
  return latest;
}
