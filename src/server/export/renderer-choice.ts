import "server-only";

import type { CardRenderer, EnvironmentFlagReader } from "@/contracts/flags";
import { readEnvironmentFlags } from "@/server/flags";

/**
 * Which renderer draws the card (export-and-recovery 3.3 step 3, 3.7): `card_renderer` from
 * the environment flags, read once per claim and recorded on the attempt. Chromium is the
 * selected renderer; only an enabled flag whose value is `og` (case and spaces ignored)
 * switches to the next/og fallback. Anything else (missing, disabled, unreadable, a typo)
 * reads as `chromium`.
 */
export async function readCardRenderer(read: EnvironmentFlagReader = readEnvironmentFlags): Promise<CardRenderer> {
  try {
    const flags = await read();
    const flag = flags.card_renderer;
    if (flag?.enabled && flag.value?.trim().toLowerCase() === "og") return "og";
    return "chromium";
  } catch {
    return "chromium";
  }
}
