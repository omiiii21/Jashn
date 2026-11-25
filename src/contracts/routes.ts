/**
 * URL builders for every page and API path in architecture 4.1. Build links only through
 * these, so a path never drifts between lanes. Dynamic segments are snake_case, exactly
 * `[wedding_id]`, `[job_id]`, `[token]`, `[import_id]`, `[voice_turn_id]` and `[command]`.
 *
 * There is no `[vendor_id]` segment: the vendor page is `/w/{wedding_id}/vendors?vendor_id=…` (D18).
 * Team and sharing is a sheet opened from the shell's wedding menu, with no route (D109).
 */
import type { CommandName } from "./commands";
import type { EventId, VendorId, WeddingId } from "./domain";

/** The query parameter naming figures to highlight once, as comma-separated field keys (D121). */
export const HIGHLIGHT_PARAM = "highlight";
/** The vendor page's query parameter (D18). */
export const VENDOR_ID_PARAM = "vendor_id";
/** The render page's short-lived render token (export-and-recovery 3.3). */
export const RENDER_TOKEN_PARAM = "t";
/** The reply-audio part number (voice.md 1.14). */
export const REPLY_PART_PARAM = "part";

const seg = (value: string) => encodeURIComponent(value);

function withQuery(path: string, query: Record<string, string | number | null | undefined>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  if (parts.length === 0) return path;
  return `${path}${path.includes("?") ? "&" : "?"}${parts.join("&")}`;
}

/** The planner sections under `/w/{wedding_id}`; `overview` is the wedding's root. */
export const PLANNER_SECTIONS = [
  "overview",
  "events",
  "guests",
  "money",
  "vendors",
  "activity",
  "shagun",
  "invite",
] as const;
export type PlannerSection = (typeof PLANNER_SECTIONS)[number];

export const routes = {
  // Pages ------------------------------------------------------------------
  /** The root redirect: your wedding, `/setup` or `/login`. */
  home: () => "/",
  login: () => "/login",
  signup: () => "/signup",
  /** Setup: voice-first or form-first (Lane C). No poll and no focus refresh (D79). */
  setup: () => "/setup",
  /** Accept a member invite. */
  join: (token: string) => `/join/${seg(token)}`,

  /** The overview. */
  wedding: (wedding_id: WeddingId) => `/w/${seg(wedding_id)}`,
  overview: (wedding_id: WeddingId) => `/w/${seg(wedding_id)}`,
  events: (wedding_id: WeddingId, event_id?: EventId) =>
    withQuery(`/w/${seg(wedding_id)}/events`, { event_id }),
  guests: (wedding_id: WeddingId, event_id?: EventId) =>
    withQuery(`/w/${seg(wedding_id)}/guests`, { event_id }),
  money: (wedding_id: WeddingId) => `/w/${seg(wedding_id)}/money`,
  /** The vendor list, or one vendor's page when `vendor_id` is given (D18). */
  vendors: (wedding_id: WeddingId, vendor_id?: VendorId) =>
    withQuery(`/w/${seg(wedding_id)}/vendors`, { [VENDOR_ID_PARAM]: vendor_id }),
  /** One vendor's page: `/w/{wedding_id}/vendors?vendor_id=…`. */
  vendor: (wedding_id: WeddingId, vendor_id: VendorId) =>
    withQuery(`/w/${seg(wedding_id)}/vendors`, { [VENDOR_ID_PARAM]: vendor_id }),
  activity: (wedding_id: WeddingId) => `/w/${seg(wedding_id)}/activity`,
  shagun: (wedding_id: WeddingId) => `/w/${seg(wedding_id)}/shagun`,
  /** The invite studio, review and publish, and the exports panel (Lane D). B's nav links here (D121). */
  invite: (wedding_id: WeddingId) => `/w/${seg(wedding_id)}/invite`,
  /** A planner section by key. */
  section: (wedding_id: WeddingId, section: PlannerSection) =>
    section === "overview" ? `/w/${seg(wedding_id)}` : `/w/${seg(wedding_id)}/${section}`,

  /** The guest site for one household's link. */
  guestSite: (token: string) => `/i/${seg(token)}`,
  /** The page Chromium screenshots; `t` is the render token. */
  renderCard: (job_id: string, render_token: string) =>
    withQuery(`/render/card/${seg(job_id)}`, { [RENDER_TOKEN_PARAM]: render_token }),

  // API routes -------------------------------------------------------------
  api: {
    /** Liveness, the commit SHA and the `flags` summary. */
    health: () => "/api/health",
    /** POST: a signed upload URL for a couple photo (members). */
    uploadsSign: () => "/api/uploads/sign",
    /** GET: `{ version }`, polled every 2.5 s on planner screens. */
    version: (wedding_id: WeddingId) => `/api/w/${seg(wedding_id)}/version`,
    /** POST: the command route. */
    command: (wedding_id: WeddingId, command: CommandName) =>
      `/api/w/${seg(wedding_id)}/commands/${seg(command)}`,
    /** POST: `request_card_export` from the exports panel. */
    exports: (wedding_id: WeddingId) => `/api/w/${seg(wedding_id)}/exports`,
    /** POST: the owner's Retry (`retry_card_export`). */
    exportRetry: (wedding_id: WeddingId, job_id: string) =>
      `/api/w/${seg(wedding_id)}/exports/${seg(job_id)}/retry`,

    /** GET: `{ revision }`, polled every 10 s on the guest page. */
    guestRevision: (token: string) => `/api/i/${seg(token)}/revision`,
    /** POST: `submit_rsvp`. */
    guestRsvp: (token: string) => `/api/i/${seg(token)}/rsvp`,
    /** POST: `set_dietary` for a guest of the household. */
    guestDietary: (token: string) => `/api/i/${seg(token)}/dietary`,

    /** POST multipart: one voice turn; answers an NDJSON stream. */
    voiceTurn: () => "/api/voice/turn",
    voiceConfirm: () => "/api/voice/confirm",
    voiceCancel: () => "/api/voice/cancel",
    /** GET: the spoken reply's audio part (`part` from 1). */
    voiceReplyAudio: (voice_turn_id: string, part: number) =>
      withQuery(`/api/voice/turns/${seg(voice_turn_id)}/reply-audio`, { [REPLY_PART_PARAM]: part }),
    /** GET: the judge panel's trace. */
    voiceTrace: (voice_turn_id: string) => `/api/voice/turns/${seg(voice_turn_id)}/trace`,

    /** POST multipart: read a printed card (Should #11). */
    cardImports: () => "/api/card-imports",
    /** GET status, DELETE discard. */
    cardImport: (import_id: string) => `/api/card-imports/${seg(import_id)}`,
    cardImportApply: (import_id: string) => `/api/card-imports/${seg(import_id)}/apply`,

    /** GET: the ops job status (strings rule). `wait` 0–10 s; `expect` "succeeded". */
    opsExportJob: (job_id: string, query: { wait?: number; expect?: "succeeded" } = {}) =>
      withQuery(`/api/ops/export-jobs/${seg(job_id)}`, query),
    /** POST: the ops retry. `wait` 0–25 s (NudgeBee sends 20). */
    opsExportJobRetry: (job_id: string, wait?: number) =>
      withQuery(`/api/ops/export-jobs/${seg(job_id)}/retry`, { wait }),
    /** POST: the worker; `probe` renders the fixture and writes nothing. */
    opsExportJobRun: (job_id: string) => `/api/ops/export-jobs/${seg(job_id)}/run`,
  },
} as const;

/**
 * Appends `highlight=a,b` to a path (keeping any query it has). Lane C appends it to
 * `navigate.path`; an empty list returns the path unchanged.
 */
export function withHighlight(path: string, field_keys: readonly string[]): string {
  const keys = field_keys.map((key) => key.trim()).filter((key) => key.length > 0);
  if (keys.length === 0) return path;
  const hashAt = path.indexOf("#");
  const base = hashAt === -1 ? path : path.slice(0, hashAt);
  const hash = hashAt === -1 ? "" : path.slice(hashAt);
  // Commas stay literal so the value reads `outstanding_inr,paid_inr`.
  const value = keys.map((key) => encodeURIComponent(key)).join(",");
  return `${base}${base.includes("?") ? "&" : "?"}${HIGHLIGHT_PARAM}=${value}${hash}`;
}

/**
 * Reads the highlight keys from a page's search params (Next's `searchParams` value, or a
 * URLSearchParams `get`). Lane B applies the highlight once.
 */
export function parseHighlight(value: string | string[] | null | undefined): string[] {
  if (value === null || value === undefined) return [];
  const raw = Array.isArray(value) ? value.join(",") : value;
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const key = part.trim();
    if (key.length > 0) seen.add(key);
  }
  return [...seen];
}
