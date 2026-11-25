import { describe, expect, it } from "vitest";

import type { ExportAttemptLogEntry, ExportJobView } from "@/contracts/read-models";

import { attemptLine, emptyState, isStalled, panelState } from "./exports-panel-copy";

// 1:41 pm IST is 08:11 UTC.
const T = (hhmm: string) => `2026-11-25T${hhmm}:00.000Z`;

function attempt(over: Partial<ExportAttemptLogEntry> & { attempt_no: number }): ExportAttemptLogEntry {
  return {
    trigger: "request",
    status: "queued",
    started_at: null,
    finished_at: null,
    error_code: null,
    renderer: null,
    nudgebee_execution_id: null,
    approver: null,
    started_by: "Mira",
    ...over,
  };
}

function job(over: Partial<ExportJobView> = {}): ExportJobView {
  return {
    job_id: "11111111-1111-4111-8111-111111111111",
    seed_key: null,
    job_label: "JOB-EXP-R3-PNG",
    export_key: "export:w:rev3:png",
    revision: 3,
    format: "png",
    status: "queued",
    label: "Queued",
    synthetic: false,
    attempts: 0,
    max_attempts: 3,
    renderer: null,
    card_summary: "Mira & Kabir, Reception, Monday, 14 December 2026, Lotus Hall",
    card_functions: ["Reception"],
    last_error: null,
    notified_at: null,
    stalled: false,
    can_retry: false,
    out_of_date: false,
    download_url: null,
    created_at: T("08:11"),
    updated_at: T("08:11"),
    attempt_log: [attempt({ attempt_no: 1 })],
    ...over,
  };
}

const owner = { role: "owner" as const, now: T("08:11"), published_revision: 3 };
const manager = { ...owner, role: "manager" as const };

const drillFailed = job({
  status: "failed",
  label: "Failed",
  synthetic: true,
  attempts: 1,
  can_retry: true,
  last_error: { code: "DRILL_INJECTED", message: "Injected fault (deliberate): renderer timeout", at: T("08:12") },
  notified_at: T("08:12"),
  updated_at: T("08:12"),
  attempt_log: [attempt({ attempt_no: 1, status: "failed", started_at: T("08:12"), finished_at: T("08:12"), error_code: "DRILL_INJECTED", renderer: "chromium" })],
});

describe("exports panel copy (export 2.7)", () => {
  it("no card yet, and nothing published", () => {
    expect(emptyState(3)).toEqual({ lines: ["No card yet for revision 3."], can_export: true });
    expect(emptyState(null)).toEqual({ lines: ["Publish the schedule first. There's no card to make yet."], can_export: false });
  });

  it("queued", () => {
    const state = panelState(job(), owner);
    expect(state.status_label).toBe("Queued");
    expect(state.lines).toEqual(["Started by Mira at 1:41 pm."]);
    expect(state.buttons).toEqual([]);
  });

  it("rendering, attempt 1", () => {
    const state = panelState(
      job({ status: "rendering", attempts: 1, attempt_log: [attempt({ attempt_no: 1, status: "rendering", started_at: T("08:11") })] }),
      owner,
    );
    expect(state.status_label).toBe("Rendering");
    expect(state.lines).toEqual(["Making the card. This takes a few seconds."]);
  });

  it("failed, NudgeBee notified, with the drill chip and the attempt line", () => {
    const state = panelState(drillFailed, { ...owner, now: T("08:13") });
    expect(state.status_label).toBe("Failed");
    expect(state.chip).toBe("Deliberate drill");
    expect(state.lines).toEqual([
      "Renderer timeout, 1:42 pm. Sent to NudgeBee for recovery. The retry waits for an operator's approval.",
    ]);
    expect(state.buttons).toEqual(["retry"]);
    expect(state.attempt_lines).toEqual(["Attempt 1 failed at 1:42 pm: renderer timeout (deliberate drill). Started by Mira."]);
  });

  it("failed, NudgeBee not notified", () => {
    const state = panelState({ ...drillFailed, synthetic: false, notified_at: null, last_error: { code: "RENDER_TIMEOUT", message: "x", at: T("08:12") } }, owner);
    expect(state.chip).toBeNull();
    expect(state.lines).toEqual(["The render took too long, 1:42 pm. NudgeBee was not notified."]);
  });

  it("failed, 45 minutes after notifying", () => {
    expect(panelState(drillFailed, { ...owner, now: T("08:57") }).lines).toEqual(["No approval came within 45 minutes."]);
    expect(panelState(drillFailed, { ...owner, now: T("08:56") }).lines[0]).toContain("Sent to NudgeBee");
  });

  it("stalled: rendering past its lease, computed against the panel clock", () => {
    const rendering = job({
      status: "rendering",
      attempts: 1,
      attempt_log: [attempt({ attempt_no: 1, status: "rendering", started_at: T("08:11") })],
    });
    expect(isStalled(rendering, T("08:12"))).toBe(false);
    const state = panelState(rendering, { ...owner, now: T("08:14") });
    expect(state.status_label).toBe("Rendering");
    expect(state.chip).toBe("Stopped responding");
    expect(state.lines).toEqual(["This render stopped responding."]);
    expect(state.buttons).toEqual(["retry"]);
    expect(panelState(job(), { ...owner, now: T("08:13") }).lines).toEqual(["This render stopped responding."]);
  });

  it("retrying through NudgeBee and through the owner", () => {
    const viaNudgebee = job({
      status: "rendering",
      label: "Retrying",
      attempts: 2,
      attempt_log: [
        attempt({ attempt_no: 1, status: "failed", finished_at: T("08:12"), error_code: "DRILL_INJECTED" }),
        attempt({
          attempt_no: 2,
          status: "rendering",
          trigger: "nudgebee",
          started_at: T("08:13"),
          nudgebee_execution_id: "019e8cde-aaaa-bbbb",
          approver: "lead@example.com",
          started_by: "NudgeBee",
        }),
      ],
    });
    const state = panelState(viaNudgebee, { ...owner, now: T("08:13") });
    expect(state.status_label).toBe("Retrying");
    expect(state.lines).toEqual(["Approved by lead in NudgeBee run 019e8cde."]);

    const viaOwner = job({
      status: "queued",
      attempts: 1,
      attempt_log: [
        attempt({ attempt_no: 1, status: "failed", finished_at: T("08:12"), error_code: "RENDER_FAILED" }),
        attempt({ attempt_no: 2, trigger: "owner_retry", started_by: "Mira" }),
      ],
    });
    const ownerState = panelState(viaOwner, { ...owner, now: T("08:12") });
    expect(ownerState.status_label).toBe("Retrying");
    expect(ownerState.lines).toEqual(["Started by Mira."]);
  });

  it("ready, with the download and the attempt lines", () => {
    const ready = job({
      status: "succeeded",
      label: "Ready",
      attempts: 2,
      download_url: "https://storage.example/signed",
      attempt_log: [
        attempt({ attempt_no: 1, status: "failed", finished_at: T("08:12"), error_code: "DRILL_INJECTED" }),
        attempt({
          attempt_no: 2,
          status: "succeeded",
          trigger: "nudgebee",
          started_at: T("08:13"),
          finished_at: T("08:13"),
          nudgebee_execution_id: "019e8cde-aaaa-bbbb",
          approver: "lead",
          started_by: "NudgeBee",
          renderer: "chromium",
        }),
      ],
    });
    const state = panelState(ready, { ...owner, now: T("08:20") });
    expect(state.status_label).toBe("Ready");
    expect(state.lines).toEqual(["Ready at 1:43 pm, attempt 2 of 3."]);
    expect(state.buttons).toEqual(["download"]);
    expect(state.attempt_lines[1]).toBe("Attempt 2 ready at 1:43 pm. NudgeBee run 019e8cde, approved by lead.");
    expect(state.lines.join(" ")).not.toContain("https://");
  });

  it("names the fallback renderer", () => {
    const line = attemptLine(attempt({ attempt_no: 1, status: "succeeded", finished_at: T("08:13"), renderer: "og" }), job());
    expect(line).toBe("Attempt 1 ready at 1:43 pm with the fallback renderer. Started by Mira.");
  });

  it("failed 3 times", () => {
    const state = panelState({ ...drillFailed, attempts: 3, can_retry: false }, owner);
    expect(state.lines).toEqual(["Failed 3 times. Export again after the next publish."]);
    expect(state.buttons).toEqual([]);
  });

  it("out of date, with the reason and both buttons", () => {
    const old = job({
      revision: 2,
      status: "succeeded",
      attempts: 1,
      out_of_date: true,
      download_url: "https://storage.example/signed",
      created_at: "2026-11-24T08:00:00.000Z",
      attempt_log: [attempt({ attempt_no: 1, status: "succeeded", finished_at: "2026-11-24T08:01:00.000Z" })],
    });
    const state = panelState(old, { ...owner, out_of_date_note: "The reception venue has changed since." });
    expect(state.status_label).toBe("Out of date");
    expect(state.lines).toEqual(["Out of date. Export a new card.", "Made 24 Nov for revision 2. The reception venue has changed since."]);
    expect(state.buttons).toEqual(["download_secondary", "export_new"]);
    expect(panelState(old, { ...owner, has_current_job: true }).buttons).toEqual(["download_secondary"]);
  });

  it("manager: no retry, and the failed state says who can", () => {
    const state = panelState({ ...drillFailed, can_retry: false }, { ...manager, now: T("08:13") });
    expect(state.buttons).toEqual([]);
    expect(state.lines).toContain("The owner or NudgeBee can retry.");
    const stalled = panelState(job(), { ...manager, now: T("08:13") });
    expect(stalled.buttons).toEqual([]);
    expect(stalled.lines).toContain("The owner or NudgeBee can retry.");
  });
});
