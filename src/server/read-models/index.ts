import "server-only";

/**
 * Lane A's read-model index (architecture 4.2). Every member read goes through
 * `services.read`, which applies the guard first; this index only gathers the builders.
 *
 * - `export_job_status` is Lane D's (D16), re-exported from its module (D52).
 * - `wedding_profile` is Lane A's (D99).
 * The money, itinerary, guest, team and overview builders join at 14:45.
 */
export { export_job_status } from "@/server/jobs/status";
export { buildWeddingProfile } from "./wedding-profile";
