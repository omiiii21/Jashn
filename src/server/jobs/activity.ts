import { DRILL_SUFFIX, EXPORT_ERRORS, approverLabel, nudgebeeRunLabel, type ExportErrorCode } from "@/contracts/jobs";
import type { ActivityEntryDraft } from "@/contracts/services";

/**
 * The export activity templates (export-and-recovery 2.4; decision D63). Each returns the
 * finished entry Lane A's append helper takes. Reasons come from EXPORT_ERRORS, never the
 * raw message, and a drill failure carries the drill suffix.
 */

type JobRef = { job_id: string; revision: number };

function entry(job: JobRef, topic: ActivityEntryDraft["topic"], summary_en: string, summary_hi: string, after: ActivityEntryDraft["after"] = null): ActivityEntryDraft {
  return { topic, entity_type: "export_job", entity_id: job.job_id, summary_en, summary_hi, before: null, after, visibility: "members" };
}

export function requestedEntry(job: JobRef, actor_name: string): ActivityEntryDraft {
  return entry(
    job,
    "export.requested",
    `${actor_name} started a card export for revision ${job.revision}.`,
    `${actor_name} ने संस्करण ${job.revision} का कार्ड बनवाना शुरू किया।`,
    { status: "queued", revision: job.revision },
  );
}

export function failedEntry(job: JobRef, code: ExportErrorCode, synthetic: boolean): ActivityEntryDraft {
  const reason = EXPORT_ERRORS[code];
  const drill = synthetic && code === "DRILL_INJECTED";
  const en = `${reason.reason_en}${drill ? DRILL_SUFFIX.en : ""}`;
  const hi = `${reason.reason_hi}${drill ? DRILL_SUFFIX.hi : ""}`;
  return entry(
    job,
    "export.failed",
    `The card export for revision ${job.revision} failed: ${en}.`,
    `संस्करण ${job.revision} का कार्ड नहीं बन पाया: ${hi}।`,
    { status: "failed", error_code: code },
  );
}

export function retriedByNudgebeeEntry(job: JobRef, execution_id: string, approver: string): ActivityEntryDraft {
  const run = nudgebeeRunLabel(execution_id);
  const who = approverLabel(approver);
  return {
    ...entry(
      job,
      "export.retried",
      `NudgeBee retried the card export for revision ${job.revision} (run ${run}, approved by ${who}).`,
      `NudgeBee ने संस्करण ${job.revision} का कार्ड दोबारा बनवाया (रन ${run}, मंज़ूरी: ${who})।`,
      { status: "queued" },
    ),
    actor_label: "NudgeBee",
  };
}

export function retriedByOwnerEntry(job: JobRef, actor_name: string): ActivityEntryDraft {
  return entry(
    job,
    "export.retried",
    `${actor_name} retried the card export for revision ${job.revision}.`,
    `${actor_name} ने संस्करण ${job.revision} का कार्ड दोबारा बनवाया।`,
    { status: "queued" },
  );
}

export function readyEntry(job: JobRef): ActivityEntryDraft {
  return entry(job, "export.succeeded", `The card for revision ${job.revision} is ready.`, `संस्करण ${job.revision} का कार्ड तैयार है।`, {
    status: "succeeded",
  });
}
