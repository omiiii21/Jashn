import "server-only";

import type { AfterCommitMap } from "@/contracts/services";

/**
 * The after-commit map (decisions D53 and D101): a static export that Lane A's dispatcher
 * imports and whose entry for the committed command it runs in `after()`, never failing
 * the command. It ships empty; Lane D adds the export kick for `request_card_export` and
 * `retry_card_export` at 11:40. Nothing registers itself by an import side effect.
 */
export const afterCommitMap: AfterCommitMap = {};
