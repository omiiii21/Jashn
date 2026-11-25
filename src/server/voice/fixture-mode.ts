import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import type { ToolArguments } from "./types";

/**
 * Fixture mode (voice.md 6.4). On with `VOICE_FIXTURE_MODE=on`, or by itself when
 * `SARVAM_API_KEY` is missing, in local development only: never in a production build,
 * whatever the variables say. It replaces only the three Sarvam calls: speech to text returns
 * the fixture's transcript, the model returns the fixture's tool arguments, and the
 * reply-audio route serves the fixture's MP3 (not this module's concern). Everything else
 * (checks, snapshot, resolution, confirm, dispatcher, flags, kill switch, stored turn) stays real.
 */

export type VoiceFixture = {
  row_id: string;
  start_state: string;
  source: string;
  stt: { transcript: string; language_code: string | null };
  llm: ToolArguments | null;
  audio_text: string | null;
};

type Env = Record<string, string | undefined>;

export function isFixtureMode(env: Env = process.env): boolean {
  if (env.NODE_ENV === "production") return false;
  return env.VOICE_FIXTURE_MODE === "on" || !env.SARVAM_API_KEY;
}

/** The dock's row picker order: the live 8 in order, then every other row with a fixture. */
export const LIVE_EIGHT_ROW_IDS = ["O-01", "M-03", "C-01", "E-04", "O-02", "E-05", "O-03", "R-03"] as const;

export const FIXTURE_ROW_IDS: readonly string[] = [
  ...LIVE_EIGHT_ROW_IDS,
  "C-02",
  "S-01",
  "S-02",
  "M-04",
  "M-05",
  "M-12",
  "M-14",
  "E-06",
  "R-01",
  "G-01",
  "I-02",
];

export const FIXTURE_ROW_ID_PATTERN = /^[A-Z]{1,2}-\d{2}$/;

export const FIXTURES_DIR = path.join("src", "server", "voice", "fixtures");

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseFixture(row_id: string, raw: unknown): VoiceFixture | null {
  if (!isRecord(raw) || raw.row_id !== row_id) return null;
  const stt = raw.stt;
  if (!isRecord(stt) || typeof stt.transcript !== "string") return null;
  const llm = raw.llm;
  if (llm !== null && !(isRecord(llm) && Array.isArray(llm.actions) && typeof llm.intent === "string")) return null;
  return {
    row_id,
    start_state: typeof raw.start_state === "string" ? raw.start_state : "",
    source: typeof raw.source === "string" ? raw.source : "hand-written",
    stt: {
      transcript: stt.transcript,
      language_code: typeof stt.language_code === "string" ? stt.language_code : null,
    },
    llm: llm === null ? null : (llm as unknown as ToolArguments),
    audio_text: typeof raw.audio_text === "string" ? raw.audio_text : null,
  };
}

/**
 * Reads `src/server/voice/fixtures/{row_id}.json` from disk on every call, so a fixture saved
 * from the judge panel is picked up without a restart. Null for an unknown or malformed row.
 */
export async function loadFixture(row_id: string, dir: string = path.join(process.cwd(), FIXTURES_DIR)): Promise<VoiceFixture | null> {
  if (!FIXTURE_ROW_ID_PATTERN.test(row_id)) return null;
  try {
    const text = await readFile(path.join(dir, `${row_id}.json`), "utf8");
    return parseFixture(row_id, JSON.parse(text));
  } catch {
    return null;
  }
}
