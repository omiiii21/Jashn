import "server-only";

import type { AfterCommitHandler, AfterCommitMap } from "@/contracts/services";

import { kickRun } from "./kick";

/**
 * The after-commit map (decisions D53 and D101): a static export that Lane A's dispatcher
 * imports and whose entry for the committed command it runs in `after()`, never failing
 * the command. Lane D's entries kick `/run` for a job the command left queued.
 */
const kickExport: AfterCommitHandler<"request_card_export" | "retry_card_export"> = async ({ response }) => {
  const result = response.result as { job_id?: unknown; status?: unknown } | null;
  if (!result || typeof result.job_id !== "string" || result.status !== "queued") return;
  try {
    await kickRun(result.job_id, { wait: true });
  } catch {
    // kickRun never throws; this keeps the dispatcher's promise either way.
  }
};

export const afterCommitMap: AfterCommitMap = {
  request_card_export: kickExport,
  retry_card_export: kickExport,
} as AfterCommitMap;
