import type { PublicationSnapshot, WeddingId } from "@/contracts/domain";
import type { EnvironmentFlags } from "@/contracts/flags";
import { LEASE_MS, QUEUED_EXPIRY_MS, type ExportErrorCode, type ExportRenderer, type RetryOutcome } from "@/contracts/jobs";

import type { ExportJobRow } from "./store";

/**
 * The job state machine's pure parts (export-and-recovery 2.1 to 2.3, 4.1, 5.3; domain 3.7).
 * No I/O: the handlers, the worker and the ops routes apply what these decide.
 */

/** A lazy expiry the next reader must write (2.1 rows 5 and 6), or null. */
export function lazyExpiry(job: Pick<ExportJobRow, "status" | "lease_until" | "updated_at">, now: Date): ExportErrorCode | null {
  if (job.status === "rendering" && job.lease_until && job.lease_until.getTime() < now.getTime()) return "LEASE_EXPIRED";
  if (job.status === "queued" && now.getTime() - job.updated_at.getTime() > QUEUED_EXPIRY_MS) return "NOT_STARTED";
  return null;
}

/** "Stopped responding": what a reader that never writes shows for a job lazy expiry would fail. */
export function isStalled(job: Pick<ExportJobRow, "status" | "lease_until" | "updated_at">, now: Date): boolean {
  return lazyExpiry(job, now) !== null;
}

/** The ops `retryable` (5.1): failed, attempts left, and still the latest revision. */
export function isRetryable(job: Pick<ExportJobRow, "status" | "attempts" | "max_attempts" | "revision">, latest_revision: number | null): boolean {
  return job.status === "failed" && job.attempts < job.max_attempts && job.revision === latest_revision;
}

/** 5.3's outcome table, in its order. The job has already been lazily expired. */
export function decideRetryOutcome(
  job: Pick<ExportJobRow, "status" | "attempts" | "max_attempts" | "revision" | "export_key" | "lease_until">,
  input: { expected_export_key?: string | null },
  published_revision: number | null,
  now: Date,
): RetryOutcome {
  if (job.status === "succeeded") return "already_succeeded";
  if (job.status === "queued") return "in_progress";
  if (job.status === "rendering" && (!job.lease_until || job.lease_until.getTime() >= now.getTime())) return "in_progress";
  if ((input.expected_export_key && input.expected_export_key !== job.export_key) || (published_revision !== null && job.revision < published_revision)) {
    return "stale_revision";
  }
  if (job.attempts >= job.max_attempts) return "not_retryable";
  return "retried";
}

/** The lease a claim takes (2.2). */
export function leaseUntil(now: Date): Date {
  return new Date(now.getTime() + LEASE_MS);
}

/**
 * The functions on the shared card (1.1): those every invited guest is invited to, in the
 * snapshot's order. With nobody invited, every published function.
 */
export function computeCardEventIds(snapshot: PublicationSnapshot, invitations: readonly { guest_id: string; event_id: string }[]): string[] {
  const published = snapshot.events.map((event) => event.event_id);
  const byGuest = new Map<string, Set<string>>();
  for (const { guest_id, event_id } of invitations) {
    const set = byGuest.get(guest_id) ?? new Set<string>();
    set.add(event_id);
    byGuest.set(guest_id, set);
  }
  if (byGuest.size === 0) return published;
  return published.filter((event_id) => [...byGuest.values()].every((set) => set.has(event_id)));
}

/**
 * Whether the drill arms a new job (4.1; flagsmith 3.6): the flag's value, or
 * `EXPORT_FAILURE_DRILL` when Flagsmith can't be read, must equal this wedding's id, and
 * the wedding must be a sample. Nothing else arms it.
 */
export function drillCandidate(flags: Pick<EnvironmentFlags, "export_failure_drill">, env_value: string | undefined): string {
  const flag = flags.export_failure_drill;
  if (flag.fallback) return (env_value ?? "").trim();
  return flag.enabled ? (flag.value ?? "").trim() : "";
}

export function drillArmed(candidate: string, wedding: { id: WeddingId; is_sample: boolean }): boolean {
  return candidate !== "" && candidate === wedding.id && wedding.is_sample;
}

/** The renderer the claim records (3.7): `og` only when the flag says so. */
export function rendererFrom(flags: Pick<EnvironmentFlags, "card_renderer">): ExportRenderer {
  return flags.card_renderer.value === "og" ? "og" : "chromium";
}

/** An instant as ops JSON writes it: UTC, no milliseconds (5.1). */
export function utcSeconds(date: Date | null | undefined): string {
  return date ? date.toISOString().replace(/\.\d{3}Z$/, "Z") : "";
}
