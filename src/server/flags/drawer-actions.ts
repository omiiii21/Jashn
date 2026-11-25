"use server";

import "server-only";

import type { FlagsSelfCheck } from "@/contracts/flags";
import type {
  DrawerFullCheck,
  DrawerProbes,
  DrawerResult,
  DrawerSentCounts,
  DrawerVoiceTurnCounts,
} from "@/components/voice/drawer-types";
import { getSession } from "@/server/auth/session";

import { runFullCheck, runProbes, sentByJashn, voiceTurnCounts } from "./drawer";
import { isInternalUser } from "./identity";
import { getCachedSelfCheck } from "./selfcheck";

/**
 * The flags drawer's server actions (flagsmith 5.9, 6.2). Server actions are reachable by a
 * direct POST, so each one checks the caller again: no session, or a caller who isn't
 * internal (2.3), gets `{ ok: false }` and no data. VoiceDock passes them to the drawer as
 * props, only for internal accounts.
 */

const REFUSED = { ok: false } as const;

async function callerIsInternal(): Promise<boolean> {
  try {
    const actor = await getSession();
    return !!actor && isInternalUser(actor);
  } catch {
    return false;
  }
}

/** The instance's latest self-check (items 1–5; the 60 s cached summary). */
export async function drawerLatestCheck(): Promise<DrawerResult<FlagsSelfCheck>> {
  if (!(await callerIsInternal())) return REFUSED;
  return { ok: true, data: await getCachedSelfCheck() };
}

/** "Run check again": the full check, items 1–6, whatever the cache holds. */
export async function drawerRunFullCheck(): Promise<DrawerResult<DrawerFullCheck>> {
  if (!(await callerIsInternal())) return REFUSED;
  return { ok: true, data: await runFullCheck() };
}

/** "Run 50 probes": evaluation only, never events. */
export async function drawerRunProbes(): Promise<DrawerResult<DrawerProbes>> {
  if (!(await callerIsInternal())) return REFUSED;
  return { ok: true, data: await runProbes() };
}

/** "Sent by Jashn": app-side exposures and saves per arm, Production only. */
export async function drawerSentByJashn(): Promise<DrawerResult<DrawerSentCounts>> {
  if (!(await callerIsInternal())) return REFUSED;
  return { ok: true, data: await sentByJashn() };
}

/** Production voice turns in the last two hours: total, failed and paused. */
export async function drawerVoiceTurnCounts(): Promise<DrawerResult<DrawerVoiceTurnCounts>> {
  if (!(await callerIsInternal())) return REFUSED;
  return { ok: true, data: await voiceTurnCounts() };
}
