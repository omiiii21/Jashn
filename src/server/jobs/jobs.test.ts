import { describe, expect, it } from "vitest";

import { CommandFailure, type CommandEnvelope, type CommandName } from "@/contracts/commands";
import type { CommandActor, PublicationSnapshot, WeddingId } from "@/contracts/domain";
import { fixtureIds, fixtureSessionActor } from "@/contracts/fixtures";
import { FLAG_KEYS, type EnvironmentFlags, type FlagValue } from "@/contracts/flags";
import { exportKey } from "@/contracts/jobs";
import type { AppendActivity, CommandHandlerContext, CommandHandlerResult } from "@/contracts/services";

type ActivityEntryInput = Parameters<AppendActivity>[1];
import { probeSnapshot } from "@/server/export/probe-fixture";

import { createRequestCardExportHandler, createRetryCardExportHandler, expireIfDue, type JobDeps } from "./handlers";
import { addPublication, createMemoryJobStore, emptyJobState, type MemoryJobState } from "./memory-store";
import { assertStrings, NUDGEBEE_ACTOR, toOpsJobStatus } from "./ops";
import { computeCardEventIds, decideRetryOutcome, drillArmed, drillCandidate } from "./state";
import { claimJob, finishJob, JobRenderFailure, type WorkerDeps } from "./worker";
import { sendFirstFailureWebhook } from "./webhook";

/**
 * EX-01 to EX-16 on the in-memory store (D104): the claim, the lease, lazy expiry, the
 * drill, the retry table, the webhook and the ops strings rule. The Drizzle store's own
 * checks are `*.db.test.ts`.
 */

const ids = fixtureIds("d");
const WEDDING = ids.wedding_id as WeddingId;
const T0 = new Date("2026-11-25T09:00:00.000Z");

function flag(enabled: boolean, value: string | null, fallback = false): FlagValue {
  return { enabled, value, fallback };
}

function flags(overrides: Partial<EnvironmentFlags> = {}): EnvironmentFlags {
  const base = Object.fromEntries(FLAG_KEYS.map((key) => [key, flag(false, null, true)])) as EnvironmentFlags;
  return { ...base, card_renderer: flag(true, "chromium"), ...overrides };
}

type Harness = {
  state: MemoryJobState;
  deps: WorkerDeps<unknown>;
  activity: ActivityEntryInput[];
  versions: number;
  clock: { now: Date };
  webhooks: string[];
  rendered: string[];
  setFlags(next: EnvironmentFlags): void;
  failRender: JobRenderFailure | null;
};

function harness(options: { is_sample?: boolean; published_revision?: number } = {}): Harness {
  const state = emptyJobState();
  state.weddings.set(WEDDING, { id: WEDDING, is_sample: options.is_sample ?? true, published_revision: options.published_revision ?? 3, version: 1 });
  const rev2: PublicationSnapshot = probeSnapshot("rev2");
  const rev3: PublicationSnapshot = probeSnapshot("rev3");
  addPublication(state, WEDDING, "00000000-0000-4000-8000-0000000000a2", 2, rev2);
  addPublication(state, WEDDING, "00000000-0000-4000-8000-0000000000a3", 3, rev3);
  state.member_names = { [fixtureSessionActor("mira", "d").member_id!]: "Mira" };
  const clock = { now: T0 };
  let current = flags();
  const h: Harness = {
    state,
    activity: [],
    versions: 0,
    clock,
    webhooks: [],
    rendered: [],
    failRender: null,
    setFlags(next) {
      current = next;
    },
    deps: undefined as unknown as WorkerDeps<unknown>,
  };
  const store = createMemoryJobStore(state);
  h.deps = {
    store,
    appendActivity: async (_tx, entry) => {
      h.activity.push(entry);
      return `00000000-0000-4000-9000-${String(h.activity.length).padStart(12, "0")}`;
    },
    bumpVersion: async () => {
      h.versions += 1;
      return h.versions;
    },
    readFlags: async () => current,
    drillEnv: () => undefined,
    log: () => undefined,
    now: () => clock.now,
    render: async (job) => {
      h.rendered.push(job.id);
      if (h.failRender) throw h.failRender;
      return { png: new Uint8Array([137, 80, 78, 71, 1, 2, 3]), timings: { launch_ms: 1, total_ms: 2 } };
    },
    upload: async (_key, png) => ({ bytes: png.byteLength }),
    notifyFailure: async (job_id) => {
      await sendFirstFailureWebhook(
        {
          store,
          bumpVersion: async () => {
            h.versions += 1;
            return h.versions;
          },
          url: () => "https://hooks.example.invalid/x",
          fetch: async () => {
            h.webhooks.push(job_id);
            return new Response(null, { status: 200 });
          },
          now: () => clock.now,
          log: () => undefined,
        },
        job_id,
      );
    },
  };
  return h;
}

function ctx<C extends CommandName>(command: C, actor: CommandActor, input: CommandHandlerContext<C>["input"], key: string, now: Date): CommandHandlerContext<C, unknown> {
  const envelope = { wedding_id: WEDDING, command, input, idempotency_key: key, source: "ui" } as CommandEnvelope<C>;
  return { command, actor, wedding_id: WEDDING, input, envelope, tx: null, now: now.toISOString() };
}

const mira = fixtureSessionActor("mira", "d");
const diya = fixtureSessionActor("diya", "d");

async function request(h: Harness, actor: CommandActor = mira, key = "export-key-0001"): Promise<CommandHandlerResult<"request_card_export">> {
  const handler = createRequestCardExportHandler(h.deps as JobDeps<unknown>);
  const result = await handler(ctx("request_card_export", actor, { format: "png" }, key, h.clock.now));
  if (result.activity) h.activity.push({ ...result.activity, wedding_id: WEDDING, actor, command: "request_card_export", occurred_at: h.clock.now.toISOString() });
  return result;
}

async function retry(h: Harness, job_id: string, actor: CommandActor, key: string, extra: Record<string, unknown> = {}) {
  const handler = createRetryCardExportHandler(h.deps as JobDeps<unknown>);
  return handler(ctx("retry_card_export", actor, { job_id, ...extra } as never, key, h.clock.now));
}

function later(h: Harness, ms: number): void {
  h.clock.now = new Date(h.clock.now.getTime() + ms);
}

async function runOnce(h: Harness, job_id: string) {
  const claim = await claimJob(h.deps, job_id);
  if (claim.kind === "started") await finishJob(h.deps, claim);
  return claim;
}

describe("request_card_export", () => {
  it("EX-01: creates one queued job for the latest revision with its key, and one attempt row", async () => {
    const h = harness();
    const result = await request(h);
    expect(result.outcome).toBe("applied");
    expect(result.result.status).toBe("queued");
    expect(result.result.export_key).toBe(exportKey(WEDDING, 3, "png"));
    expect(h.state.jobs).toHaveLength(1);
    expect(h.state.attempts).toEqual([expect.objectContaining({ attempt_no: 1, trigger: "request", status: "queued" })]);
    expect(result.activity?.summary_en).toBe("Mira started a card export for revision 3.");
  });

  it("EX-02: a second request for the same revision answers unchanged with the same job", async () => {
    const h = harness();
    const first = await request(h);
    const second = await request(h, diya, "export-key-0002");
    expect(second.outcome).toBe("unchanged");
    expect(second.result.job_id).toBe(first.result.job_id);
    expect(h.state.jobs).toHaveLength(1);
    expect(second.activity).toBeNull();
  });

  it("EX-02: a racing twin that lost the insert answers unchanged, never an error", async () => {
    const h = harness();
    const handler = createRequestCardExportHandler(h.deps as JobDeps<unknown>);
    const [a, b] = await Promise.all([
      handler(ctx("request_card_export", mira, { format: "png" }, "race-key-0001", h.clock.now)),
      handler(ctx("request_card_export", diya, { format: "png" }, "race-key-0002", h.clock.now)),
    ]);
    expect([a.outcome, b.outcome].sort()).toEqual(["applied", "unchanged"]);
    expect(a.result.job_id).toBe(b.result.job_id);
    expect(h.state.jobs).toHaveLength(1);
  });

  it("refuses with nothing_published before any publish", async () => {
    const h = harness();
    h.state.weddings.get(WEDDING)!.published_revision = null;
    await expect(request(h)).rejects.toMatchObject({ body: { code: "nothing_published" } });
  });

  it("freezes the shared card's functions: only those every invited guest shares", () => {
    const snapshot = probeSnapshot("rev3");
    const reception = snapshot.events.find((event) => event.title === "Reception")!.event_id;
    const others = snapshot.events.filter((event) => event.event_id !== reception).map((event) => event.event_id);
    const invitations = [
      { guest_id: "g1", event_id: reception },
      { guest_id: "g1", event_id: others[0] },
      { guest_id: "g2", event_id: reception },
    ];
    expect(computeCardEventIds(snapshot, invitations)).toEqual([reception]);
    expect(computeCardEventIds(snapshot, [])).toEqual(snapshot.events.map((event) => event.event_id));
  });
});

describe("the worker", () => {
  it("EX-03: claims once; a second /run for the same job does not start", async () => {
    const h = harness();
    const { result } = await request(h);
    const first = await claimJob(h.deps, result.job_id);
    const second = await claimJob(h.deps, result.job_id);
    expect(first.kind).toBe("started");
    expect(second).toEqual({ kind: "not_started", status: "rendering" });
    const job = h.state.jobs[0];
    expect(job.attempts).toBe(1);
    expect(job.lease_until?.getTime()).toBe(T0.getTime() + 120_000);
    expect(h.state.attempts[0]).toMatchObject({ status: "rendering", renderer: "chromium" });
  });

  it("EX-04: a render succeeds with the artifact, the attempt, the Ready line and the version", async () => {
    const h = harness();
    const { result } = await request(h);
    await runOnce(h, result.job_id);
    const job = h.state.jobs[0];
    expect(job.status).toBe("succeeded");
    expect(job.artifact_path).toBe(`${WEDDING}/card-rev3.png`);
    expect(job.artifact_bytes).toBe(7);
    expect(job.artifact_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(h.state.attempts[0]).toMatchObject({ status: "succeeded" });
    expect(h.activity.at(-1)?.summary_en).toBe("The card for revision 3 is ready.");
    expect(h.webhooks).toEqual([]);
  });

  it("EX-05: a render failure records its code and fires the first-failure webhook once", async () => {
    const h = harness();
    const { result } = await request(h);
    h.failRender = new JobRenderFailure("FONT_NOT_LOADED", "Web fonts did not load: Anek Devanagari");
    await runOnce(h, result.job_id);
    const job = h.state.jobs[0];
    expect(job.status).toBe("failed");
    expect(job.last_error_code).toBe("FONT_NOT_LOADED");
    expect(job.last_error_message).toBe("Web fonts did not load: Anek Devanagari");
    expect(job.notified_at).not.toBeNull();
    expect(h.webhooks).toEqual([result.job_id]);
  });

  it("EX-06: a worker that lost its claim uploads nothing and commits nothing", async () => {
    const h = harness();
    const { result } = await request(h);
    const claim = await claimJob(h.deps, result.job_id);
    if (claim.kind !== "started") throw new Error("expected a claim");
    // The lease ran out and a reader failed the job before the render returned.
    later(h, 121_000);
    await h.deps.store.transaction((tx) => expireIfDue(h.deps, tx, h.state.jobs[0], h.clock.now));
    let uploaded = 0;
    await finishJob({ ...h.deps, upload: async (_k, png) => ((uploaded += 1), { bytes: png.byteLength }) }, claim);
    expect(uploaded).toBe(0);
    expect(h.state.jobs[0]).toMatchObject({ status: "failed", last_error_code: "LEASE_EXPIRED", artifact_path: null });
  });
});

describe("lazy expiry", () => {
  it("EX-08: a rendering job past its lease fails LEASE_EXPIRED on the next read", async () => {
    const h = harness();
    const { result } = await request(h);
    await claimJob(h.deps, result.job_id);
    later(h, 120_001);
    await h.deps.store.transaction((tx) => expireIfDue(h.deps, tx, h.state.jobs[0], h.clock.now));
    expect(h.state.jobs[0]).toMatchObject({ status: "failed", attempts: 1, last_error_code: "LEASE_EXPIRED" });
    expect(h.state.attempts[0]).toMatchObject({ status: "failed", error_code: "LEASE_EXPIRED" });
  });

  it("EX-09: a job left queued over 60 s fails NOT_STARTED, counting its waiting attempt", async () => {
    const h = harness();
    const { result } = await request(h);
    later(h, 60_001);
    const again = await request(h, mira, "export-key-0003");
    expect(again.outcome).toBe("unchanged");
    expect(again.result.job_id).toBe(result.job_id);
    expect(h.state.jobs[0]).toMatchObject({ status: "failed", attempts: 1, last_error_code: "NOT_STARTED" });
    expect(h.state.attempts).toHaveLength(1);
  });
});

describe("the drill", () => {
  it("EX-10: arms only for the flag's own sample wedding id", () => {
    const on = flags({ export_failure_drill: flag(true, WEDDING) });
    expect(drillArmed(drillCandidate(on, undefined), { id: WEDDING, is_sample: true })).toBe(true);
    expect(drillArmed(drillCandidate(on, undefined), { id: WEDDING, is_sample: false })).toBe(false);
    expect(drillArmed(drillCandidate(flags({ export_failure_drill: flag(true, "another") }), undefined), { id: WEDDING, is_sample: true })).toBe(false);
    expect(drillArmed(drillCandidate(flags({ export_failure_drill: flag(false, WEDDING) }), undefined), { id: WEDDING, is_sample: true })).toBe(false);
    // Flagsmith unreadable: the environment value decides.
    expect(drillArmed(drillCandidate(flags(), WEDDING), { id: WEDDING, is_sample: true })).toBe(true);
    expect(drillArmed(drillCandidate(flags(), ""), { id: WEDDING, is_sample: true })).toBe(false);
  });

  it("EX-11: the armed job fails DRILL_INJECTED at its claim, before any render, and the retry renders", async () => {
    const h = harness();
    h.setFlags(flags({ export_failure_drill: flag(true, WEDDING) }));
    const { result } = await request(h);
    expect(h.state.jobs[0]).toMatchObject({ fail_injection: "once", synthetic: true });

    const claim = await claimJob(h.deps, result.job_id);
    expect(claim.kind).toBe("drill_failed");
    expect(h.rendered).toEqual([]);
    expect(h.state.jobs[0]).toMatchObject({ status: "failed", fail_injection: "consumed", last_error_code: "DRILL_INJECTED", attempts: 1 });
    expect(h.activity.at(-1)?.summary_en).toBe("The card export for revision 3 failed: renderer timeout (deliberate drill).");

    const retried = await retry(h, result.job_id, NUDGEBEE_ACTOR, "nb-exec-1-job", {
      expected_export_key: exportKey(WEDDING, 3, "png"),
      nudgebee: { execution_id: "exec-12345678", approver: "user@example.com", workflow_id: "wf-1" },
    });
    expect(retried.outcome).toBe("applied");
    expect(retried.result).toMatchObject({ retry_outcome: "retried", attempt: 2, status: "queued" });
    expect(retried.activity?.summary_en).toMatch(/^NudgeBee retried the card export for revision 3 \(run /);

    await runOnce(h, result.job_id);
    expect(h.rendered).toEqual([result.job_id]);
    expect(h.state.jobs[0]).toMatchObject({ status: "succeeded", attempts: 2, fail_injection: "consumed" });
    // retried's entry is the dispatcher's; here the handler returned it.
    const topics = [...h.activity.map((entry) => entry.topic)];
    topics.splice(2, 0, retried.activity!.topic);
    expect(topics).toEqual(["export.requested", "export.failed", "export.retried", "export.succeeded"]);
    expect(h.state.attempts.map((a) => [a.attempt_no, a.trigger, a.status])).toEqual([
      [1, "request", "failed"],
      [2, "nudgebee", "succeeded"],
    ]);
  });

  it("a lost kick spends the drill on attempt 1's NOT_STARTED; the retry renders normally", async () => {
    const h = harness();
    h.setFlags(flags({ export_failure_drill: flag(true, WEDDING) }));
    const { result } = await request(h);
    later(h, 61_000);
    const retried = await retry(h, result.job_id, mira, "owner-retry-0001", { expected_export_key: exportKey(WEDDING, 3, "png") });
    expect(retried.result).toMatchObject({ retry_outcome: "retried", attempt: 2, status: "queued" });

    await runOnce(h, result.job_id);
    expect(h.rendered).toEqual([result.job_id]);
    expect(h.state.jobs[0]).toMatchObject({ status: "succeeded", attempts: 2, fail_injection: "consumed" });
    expect(h.state.attempts.map((a) => [a.attempt_no, a.status, a.error_code])).toEqual([
      [1, "failed", "NOT_STARTED"],
      [2, "succeeded", null],
    ]);
    expect(h.activity.some((entry) => /deliberate drill/.test(entry.summary_en))).toBe(false);
  });
});

describe("the first-failure webhook", () => {
  it("moves the version when it records notified_at, so open panels show NudgeBee was notified", async () => {
    const h = harness();
    const { result } = await request(h);
    h.failRender = new JobRenderFailure("RENDER_FAILED", "boom");
    const claim = await claimJob(h.deps, result.job_id);
    if (claim.kind === "started") await finishJob({ ...h.deps, notifyFailure: async () => undefined }, claim);
    expect(h.state.jobs[0].notified_at).toBeNull();
    const before = h.versions;
    await h.deps.notifyFailure(result.job_id);
    expect(h.state.jobs[0].notified_at).not.toBeNull();
    expect(h.versions).toBe(before + 1);
    // Once is enough: a second call sends nothing and moves nothing.
    await h.deps.notifyFailure(result.job_id);
    expect(h.webhooks).toHaveLength(1);
    expect(h.versions).toBe(before + 1);
  });

  it("a member request sends only for a lazy failure it found itself", async () => {
    const h = harness();
    const { result } = await request(h);
    h.failRender = new JobRenderFailure("RENDER_FAILED", "boom");
    const claim = await claimJob(h.deps, result.job_id);
    if (claim.kind === "started") await finishJob({ ...h.deps, notifyFailure: async () => undefined }, claim);
    const webhook = {
      store: h.deps.store,
      bumpVersion: async () => 0,
      url: () => "https://hooks.example.invalid/x",
      fetch: async () => {
        h.webhooks.push(result.job_id);
        return new Response(null, { status: 200 });
      },
      now: () => h.clock.now,
      log: () => undefined,
    };
    // RENDER_FAILED was the worker's to report: a member's request never sends it.
    expect(await sendFirstFailureWebhook(webhook, result.job_id, { found_since: h.clock.now })).toBe(false);
    expect(h.webhooks).toEqual([]);
  });
});

describe("retry_card_export", () => {
  async function failedJob(h: Harness) {
    const { result } = await request(h);
    h.failRender = new JobRenderFailure("RENDER_FAILED", "browser launch failed");
    await runOnce(h, result.job_id);
    h.failRender = null;
    return result.job_id;
  }

  it("EX-12: the outcome table, in order", () => {
    const base = { export_key: "k", revision: 3, max_attempts: 3, lease_until: null };
    const now = T0;
    expect(decideRetryOutcome({ ...base, status: "succeeded", attempts: 1 }, {}, 3, now)).toBe("already_succeeded");
    expect(decideRetryOutcome({ ...base, status: "queued", attempts: 1 }, {}, 3, now)).toBe("in_progress");
    expect(decideRetryOutcome({ ...base, status: "rendering", attempts: 1, lease_until: new Date(now.getTime() + 1) }, {}, 3, now)).toBe("in_progress");
    expect(decideRetryOutcome({ ...base, status: "failed", attempts: 1 }, { expected_export_key: "other" }, 3, now)).toBe("stale_revision");
    expect(decideRetryOutcome({ ...base, status: "failed", attempts: 1 }, {}, 4, now)).toBe("stale_revision");
    expect(decideRetryOutcome({ ...base, status: "failed", attempts: 3 }, {}, 3, now)).toBe("not_retryable");
    expect(decideRetryOutcome({ ...base, status: "failed", attempts: 2 }, {}, 3, now)).toBe("retried");
  });

  it("EX-13: only an owner or NudgeBee may retry", async () => {
    const h = harness();
    const job_id = await failedJob(h);
    await expect(retry(h, job_id, diya, "diya-retry-0001")).rejects.toBeInstanceOf(CommandFailure);
    const owner = await retry(h, job_id, mira, "mira-retry-0001");
    expect(owner.result).toMatchObject({ retry_outcome: "retried", attempt: 2 });
    expect(owner.activity?.summary_en).toBe("Mira retried the card export for revision 3.");
    expect(h.state.attempts.at(-1)).toMatchObject({ trigger: "owner_retry", idempotency_key: "mira-retry-0001" });
  });

  it("EX-14: a retry of a running job is in_progress and adds no attempt", async () => {
    const h = harness();
    const job_id = await failedJob(h);
    await retry(h, job_id, mira, "mira-retry-0002");
    const again = await retry(h, job_id, NUDGEBEE_ACTOR, "nb-exec-2-job", { expected_export_key: exportKey(WEDDING, 3, "png") });
    expect(again.outcome).toBe("unchanged");
    expect(again.result).toMatchObject({ retry_outcome: "in_progress" });
    expect(h.state.attempts).toHaveLength(2);
  });

  it("EX-15: after the third failed attempt the answer is not_retryable", async () => {
    const h = harness();
    const job_id = await failedJob(h);
    h.failRender = new JobRenderFailure("RENDER_FAILED", "browser launch failed");
    for (const n of [2, 3]) {
      await retry(h, job_id, mira, `mira-retry-10${n}`);
      await runOnce(h, job_id);
    }
    expect(h.state.jobs[0]).toMatchObject({ status: "failed", attempts: 3 });
    const last = await retry(h, job_id, mira, "mira-retry-1004");
    expect(last.result).toMatchObject({ retry_outcome: "not_retryable" });
    // The webhook fired for the first failure only.
    expect(h.webhooks).toEqual([job_id]);
  });

  it("EX-16: a job for an older revision is stale_revision", async () => {
    const h = harness();
    const job_id = await failedJob(h);
    h.state.weddings.get(WEDDING)!.published_revision = 4;
    const stale = await retry(h, job_id, NUDGEBEE_ACTOR, "nb-exec-3-job", { expected_export_key: exportKey(WEDDING, 3, "png") });
    expect(stale.result).toMatchObject({ retry_outcome: "stale_revision" });
  });
});

describe("ops JSON", () => {
  it("EX-19: every scalar is a string, nothing is null, objects are always present", async () => {
    const h = harness();
    const { result } = await request(h);
    const queued = toOpsJobStatus(h.state.jobs[0], h.state.attempts, 3, "Mira & Kabir, Reception");
    expect(() => assertStrings(queued)).not.toThrow();
    expect(queued).toMatchObject({ status: "queued", retryable: "false", artifact: { artifact_id: "", bytes: "" }, last_error: { code: "" } });

    await runOnce(h, result.job_id);
    const done = toOpsJobStatus(h.state.jobs[0], h.state.attempts, 3, "");
    expect(() => assertStrings(done)).not.toThrow();
    expect(done.artifact).toMatchObject({ artifact_id: "card-rev3.png", bytes: "7" });
    expect(JSON.stringify(done)).not.toMatch(/https?:|\/card-rev3\.png/);
  });
});
