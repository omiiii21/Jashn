# NudgeBee: `card-export-recovery`

The runbook for the NudgeBee account operator (whoever can sign in to the user's NudgeBee account, D72) and the user. The binding spec is `docs/prep/spec/export-and-recovery.md` sections 4 to 6; where this file and the spec disagree, the spec wins.

**One run recovers one failed Jashn invitation-card export.** It reads the job, waits for a person to approve in NudgeBee, calls Jashn's export-only retry, checks that the card exists, sends the same retry again to prove it replays, and prints a verdict. It never publishes, never changes the guest page, RSVPs or the ledger, and never messages guests.

This folder holds no secrets, URLs, tokens, emails or ids. Placeholders look like `<production domain>` and `<job id>`.

## Traps (read before building)

- **Any HTTP status of 400 or above fails a NudgeBee step** (F16). Jashn answers 200 for every business state. 412 comes only when the call sends `expect`.
- **The HTTP step timeout stays at its documented default of 30 s** (F15). That's why the retry sends `wait=20`: Jashn answers within the wait, leaving 10 s of margin.
- **Exact base URL.** The https production origin with no path, no trailing slash and no redirect (a 301 or 302 can turn the POST into a GET). Never a `VERCEL_URL` deployment URL: those are protected.
- **No Vercel challenge on `/api/ops/*`.** If a read returns an HTML page instead of JSON, tell Lane D at once.
- **Task outputs are not masked** (6.6). Jashn's ops answers carry no URL, path, token or signed link. Never add a step that prints the Secret or the webhook URL.
- **Triggers run the published live version** (F27, F36). After every edit: publish, make that version live, then test.
- **Never click Retry on a run waiting at an approval** (U17). A Retry starts a new execution from the top, with a new key (F33). Jashn still makes at most one card, but the run record gets confusing.
- **Stop and ask the lead** before arming or disarming the drill, before wiring `retry_export` to a real job (only after EX-01 to EX-04 pass), and before touching the demo copy.

## 1. Objects to create

| Object | Where in NudgeBee | Name | Setting |
|---|---|---|---|
| K8s account | Admin → Integrations → Kubernetes Clusters | `jashn-kind` (Non-production) | Exists already. The agent connects only if T2 or T4 failed (6.8) |
| Config | Configs | `jashn_base_url` | The https origin of `<production domain>`, no trailing slash. It holds the tunnel URL only during the tunnel read; switch it back straight after |
| Secret | Configs, type Secret | `jashn_ops_token` | The value of Jashn's `JOBS_API_TOKEN`. **Only the user pastes it**, from the password manager or by copying it from `.env.local` in an editor. Never through chat, Notion or a terminal (D117) |
| Automation webhook | Admin → Integrations → Webhooks | `jashn_export_failed` | Its URL carries a token. The operator puts it into the main `.env.local` in an editor; the lead adds it to Vercel Production as `NUDGEBEE_EXPORT_WEBHOOK_URL`. It takes effect at the next production deploy. Never logged, printed or committed |
| Workflow | Automations | `card-export-recovery` | Manual and Webhook triggers. Automation Timeout 60 min. Retries 0 (override the pre-filled 3, so each step's own policy applies) |

Scope the Config and the Secret to `jashn-kind` or to the tenant, whichever the workflow's account picker accepts.

## 2. Triggers

**Webhook (primary).** Jashn posts once per job, right after the commit that first moves it to `failed`, with a 5 s timeout and no retry. It never fires for a later failure of the same job, or for a lazy failure an ops route found. With `NUDGEBEE_EXPORT_WEBHOOK_URL` unset, nothing is sent and the panel says "NudgeBee was not notified".

Payload (every value a string):

```json
{
  "type": "invitation_export.failed",
  "job_id": "<job id>",
  "export_key": "export:<wedding id>:rev3:png",
  "error_code": "DRILL_INJECTED",
  "failed_at": "2026-11-25T08:12:07Z",
  "synthetic": "true"
}
```

- Filter: the payload's `type` equals `invitation_export.failed`. The filter key name is unverified (U5); if it fights back, drop the filter.
- The run takes only `job_id` from the body. A forged webhook can at most make NudgeBee read a job and ask a person, because the base URL and token come from NudgeBee's own Config and Secret.
- Webhook runs act as the automation's owner (F27).

**Manual.** Input `{"job_id": "<job id>"}`. Use it when the webhook starts no run, for the reject test (NB-T12), and for a second run on a job that has already notified.

## 3. Steps

| # | Task id | Type | Runs when | What it does | Timeout; attempts |
|---|---|---|---|---|---|
| 1 | `resolve_job` | Print | Always | Prints the job id: the manual input `job_id`, else the webhook body's `job_id` | Default |
| 2 | `read_status` | HTTP GET, bearer `jashn_ops_token` | After 1 | `{jashn_base_url}/api/ops/export-jobs/{job_id}` | 20 s; 3 attempts, 2 s apart |
| 3 | `nothing_to_retry` | Print | Step 2's `status` isn't `failed`, or `retryable` isn't "true" | "Nothing to retry: {job_label} is {status} after {attempts} attempts. Artifact {artifact_id}." | Default |
| 4 | `approve_retry` | Approval, `in_app`, options `approve` and `reject` | Step 2's `status` is `failed` and `retryable` is "true" | Shows the message in section 4 | **45 min**; 1 attempt |
| 5 | `retry_export` | HTTP POST, bearer | Step 4's status is `approve` | `{jashn_base_url}/api/ops/export-jobs/{job_id}/retry?wait=20`, with the headers and body below | 30 s; 2 attempts, 5 s apart (a resend reuses the key and replays) |
| 6 | `verify` | HTTP GET, bearer | After 5 | `…/api/ops/export-jobs/{job_id}?wait=10&expect=succeeded`. A 412 fails the step, and so the run, when no card exists | 20 s; 2 attempts, 3 s apart |
| 7 | `replay_check` | HTTP POST, bearer | After 6 | Step 5's request again: same URL, key and body | 30 s; 1 attempt |
| 8 | `verdict` | Print | After 7 | "Card {artifact_id} ready (sha256 {first 12}). Retry {outcome}; resend replayed {replayed}; one card for {export_key}. No publish, guest page, RSVP or ledger change." | Default |
| 9 | `rejected` | Print | Step 4's status is `reject` | "Rejected by {approver}. The job stays failed; nothing was re-rendered." | Default |

**`retry_export` request** (and `replay_check`, written out in full again; don't rely on YAML anchors):
- Headers: `Content-Type: application/json` and `Idempotency-Key: nb-{workflow_execution_id}-{job_id}`. `workflow_execution_id` and `workflow_id` are NudgeBee's automatic run inputs (F21).
- Body, `expected_export_key` from step 2:

```json
{
  "expected_export_key": "<export_key from read_status>",
  "nudgebee": {
    "workflow_id": "<workflow_id>",
    "execution_id": "<workflow_execution_id>",
    "approver": "<approver from approve_retry>"
  }
}
```

**Notes:**
- Branch with conditions on the tasks, or one Switch after step 2. Skipped tasks skip their dependents, so a job that isn't failed never reaches the approval.
- **Timeouts:** the approval step needs its own 45-minute task timeout, and the workflow 60 minutes. Without both, NudgeBee's 5-minute default fails a waiting approval (F30).
- **Slow cold render:** if the render outlasts the retry's 20 s, the retry answers `queued` or `rendering` and `verify` long-polls 10 s, twice. If that still isn't enough, raise `verify` to 4 attempts; never raise the HTTP timeout.
- Optional, only if a test shows it is fast and can't fail the run: `ai_note` (`llm.summary`) before step 4 (U6). It never decides anything.

## 4. Approval message

Verbatim, every value from step 2's body:

```text
Retry the invitation card export?
Job: {job_label} ({job_id})
Card: {card_summary}
Revision {revision}, {format}. Key {export_key}
Status: {status} after {attempts} of {max_attempts} attempts
Last error: {last_error.code}: {last_error.message}
Deliberate drill: {synthetic}
If you approve: Jashn re-renders this one card. Nothing is published, and the guest page, RSVPs and the ledger do not change.
If you reject: nothing happens, and the job stays failed.
This request expires 45 minutes after it was created.
```

Any user on the tenant can approve; approvals have no per-step roles (F30). The fallback is `email` approval sent to the user (D121).

## 5. The Jashn ops contract

**Rules for every ops route (5.1):**
- Auth: bearer, the Secret `jashn_ops_token` (header `Authorization: Bearer <JOBS_API_TOKEN>`), compared in constant time. The token is never echoed or logged.
- **Strings rule:** every scalar is a string (`"3"`, `"true"`), nothing is null, absent values are `""`, and `artifact`, `last_error` and `last_recovery` are always objects. Instants are ISO UTC.
- Answers are JSON with `Cache-Control: no-store` and no CORS headers.
- The reserved id `probe` answers 404 on the GET and the retry, like any unknown id.

| Method and route | Query | Headers | Body | Answers |
|---|---|---|---|---|
| `GET /api/ops/export-jobs/[job_id]` | `wait` 0–10 s (default 0): while `queued` or `rendering`, hold until it settles. `expect=succeeded`: after the wait, 412 unless it succeeded | `Authorization` | – | 200 status body (below). Runs the lazy expiry first, without sending the webhook |
| `POST /api/ops/export-jobs/[job_id]/retry` | `wait` 0–25 s (default 25; NudgeBee sends 20): while `queued` or `rendering`, re-read every 500 ms | `Authorization`, `Content-Type: application/json`, `Idempotency-Key` (8–200 printable ASCII characters) | `expected_export_key` (required); `nudgebee.workflow_id`, `execution_id`, `approver` (optional strings, up to 100 characters each, stored on the attempt) | 200 retry body (below), with `status`, `retryable` and `artifact` read fresh |
| `POST /api/ops/export-jobs/[job_id]/run` | – | `Authorization` | – | Jashn's own worker kick. NudgeBee never calls it |

**GET status body, failed after the drill (5.2):**

```json
{
  "job_id": "<job id>", "job_label": "JOB-EXP-R3-PNG",
  "export_key": "export:<wedding id>:rev3:png", "wedding_id": "<wedding id>",
  "revision": "3", "latest_revision": "3", "format": "png",
  "status": "failed", "retryable": "true", "attempts": "1", "max_attempts": "3",
  "synthetic": "true",
  "last_error": { "code": "DRILL_INJECTED", "message": "Injected fault (deliberate): renderer timeout",
                  "at": "2026-11-25T08:12:07Z" },
  "artifact": { "artifact_id": "", "sha256": "", "bytes": "", "created_at": "" },
  "last_recovery": { "nudgebee_execution_id": "", "approver": "", "attempt": "" },
  "card_summary": "Mira & Kabir, Reception, Monday, 14 December 2026, Lotus Hall",
  "updated_at": "2026-11-25T08:12:07Z"
}
```

After the recovery: `status` "succeeded", `retryable` "false", `attempts` "2", `artifact` filled (`artifact_id` "card-rev3.png", `sha256`, `bytes`, `created_at`), and `last_recovery` naming the NudgeBee execution id, approver and attempt "2". `last_error` keeps the drill's error.

- `retryable` is "true" only when the job is failed, `attempts` < `max_attempts`, and `revision` equals `latest_revision`.

**Retry body (5.3):**

```json
{
  "job_id": "<job id>", "export_key": "export:<wedding id>:rev3:png",
  "outcome": "retried", "replayed": "false", "attempt": "2",
  "status": "succeeded", "retryable": "false", "revision": "3", "latest_revision": "3",
  "artifact": { "artifact_id": "card-rev3.png", "sha256": "<sha256>", "bytes": "<bytes>" },
  "idempotency_key": "nb-<execution id>-<job id>"
}
```

**Outcomes** (all 200):

| Job state, after the lazy expiry | `outcome` | What happens |
|---|---|---|
| This key was seen before with the same request | The stored outcome, with `replayed` "true" | Nothing starts. The stored `outcome` and `attempt`, the job as it is now |
| `succeeded` | `already_succeeded` | Nothing; same artifact and sha256 |
| `queued`, or `rendering` within its lease | `in_progress` | Nothing; the answer comes after the wait |
| `expected_export_key` differs, or `revision` < `latest_revision` | `stale_revision` | Nothing; status unchanged |
| `failed` with `attempts` ≥ 3 | `not_retryable` | Nothing; status `failed` |
| `failed` and retryable | `retried` | Claims the job, adds attempt N+1, starts the render, then waits. `status` is `succeeded`, `failed` with a new error, or `queued`/`rendering` if the wait ran out |

**Errors** (body `{"ok": false, "error": {"code", "message", "field", "current"}}`, strings rule, `field` "" and `current` {} when absent):
- 400 `validation_failed`: a missing or malformed `Idempotency-Key`, or a body without `expected_export_key`; `field` names `idempotency_key` or `body`. Nothing is written.
- 401 `unauthenticated`: a missing or wrong token. Nothing is written.
- 404 `not_found`: an unknown job, a job id that isn't a UUID, or `probe`. Identical bodies.
- 409 `idempotency_key_reused`: the same key with another job or another body.
- 412 `expectation_failed`: only with `expect`, for example "Job is rendering; expected succeeded.", with `current` holding `status` and `attempts`.
- 500 `internal_error`: real server faults only.

**Safety:**
- At most one job per `export_key`, and one stored object per job (a fixed path, overwritten in place).
- A replay starts nothing. The claim is one compare-and-set on status `failed`, `export_key`, the published revision and `attempts` < 3, so two different keys can't both claim.
- A retry never publishes and never changes the guest page, RSVPs or the ledger.
- NudgeBee only ever gets `artifact_id`, `sha256`, `bytes` and `created_at`: never a URL, path or token.

## 6. The drill

**How it arms (4.1).** Only the Flagsmith Production flag `export_failure_drill` arms it, read once when `request_card_export` creates a job:
- **Armed:** enabled, with the value equal to the id of a wedding that has `is_sample`. The new job gets `fail_injection` `once` and `synthetic` true.
- **Not armed:** disabled (the default); enabled with an empty value, or with the id of a wedding that isn't a sample (the server logs "drill ignored"); Flagsmith unreachable (falls back to off).
- **Env override:** `EXPORT_FAILURE_DRILL` holds a wedding id and is unset by default. It is the only override, needs a redeploy, and is used only when Flagsmith is down.
- Only new jobs on the named wedding. Nothing else can arm it: no request field, header, voice phrase or ops call.
- It fails attempt 1 before any browser starts, and is consumed in the claim write, so the retry renders normally.
- Practice runs use Lane D's rehearsal copy `d`. The demo copy is armed only for the recorded take (V15).

**Expected sequence (NB-T10 on copy `d`):**
1. Lane D resets copy `d` to D0 (`reset_demo`, checkpoint d0). As Diya, move the reception to Lotus Hall; as Mira, publish revision 3.
2. Warm the renderer up 5 minutes before (3.4).
3. After the lead says go, the user arms the drill with copy `d`'s wedding id.
4. Mira clicks Export card. Attempt 1 fails with `DRILL_INJECTED` ("Injected fault (deliberate): renderer timeout", `synthetic` "true"). The panel shows Failed with the "Deliberate drill" chip and "Sent to NudgeBee for recovery."
5. The user disarms the drill at once: disable the flag and clear its value.
6. The webhook starts `card-export-recovery` within 10 s. `resolve_job` and `read_status` go green, and `approve_retry` waits.
7. The approver approves (comment "Re-render the card only").
8. `retry_export` answers `retried` with `attempt` "2"; `verify` answers 200 with `succeeded`; `replay_check` answers `replayed` "true"; `verdict` prints.
9. Jashn's panel shows Ready and "Attempt 2 ready at {time}. NudgeBee run {first 8 of the execution id}, approved by {approver}."

**What it must leave:**
- **Four activity entries,** in this order:
  1. "Mira started a card export for revision 3."
  2. "The card export for revision 3 failed: renderer timeout (deliberate drill)."
  3. "NudgeBee retried the card export for revision 3 (run {run}, approved by {approver})."
  4. "The card for revision 3 is ready."
- **One stored object,** `card-rev3.png` in the job's folder of the private `exports` bucket, on a job with 2 attempts.
- No publish and no change to the guest page, RSVPs or the ledger.

**Record:** the run id (the first 8 characters of the execution id is enough) and the IST time go in the run log below, in a follow-up PR (D62). Keep the first successful run id (D43). Take three screenshots for the fallback: failed, awaiting approval, completed. NudgeBee's retention is unknown.

## 7. Today's order (D131)

- The user builds the workflow 13:30–14:40, against httpbin stand-ins first.
- The Secret is pasted before the tunnel read.
- Tunnel read at about 14:15: an authenticated GET against a real Jashn job through Lane D's tunnel, then the retry.
- Production read at about 14:55, after the 14:45 deploy. Keep the first successful run id.
- NB-T10 to NB-T15 run 14:55–15:10. The recording path is chosen at 15:10.
- V15 is recorded 15:10–15:25 on the demo copy, only after one NB-T10 has passed. Freeze is at 15:35.

| Test | What | Passes when |
|---|---|---|
| NB-T10 | Full drill on copy `d` (section 6) | Webhook run within 10 s; approve, `retried`, verify 200, `replay_check` replayed "true", verdict. Jashn shows attempt 2 with the run id and approver, one object and four activity entries |
| NB-T11 | Retry the finished run, then a direct POST with a new key | The run ends at `nothing_to_retry`; the POST answers `already_succeeded` with the same artifact |
| NB-T12 | Reject (manual run on a failed job) | `rejected` prints, the job stays failed, nothing renders |
| NB-T13 | A copy of the workflow with a 2-minute approval | The step and run fail after 2 minutes; the job stays failed; the owner's Retry still works |
| NB-T14 | Manual trigger with a job id | As NB-T10 from step 2 |
| NB-T15 | A webhook payload with another `type` | No run starts |

## 8. Run log

Filled in the follow-up PR (D62). Never claim a result that wasn't run.

| Id | IST time | Execution id (first 8) | Result | Notes |
|---|---|---|---|---|
| Tunnel read | | | | |
| Production read | | | | |
| NB-T10 | | | | |
| NB-T11 | | | | |
| NB-T12 | | | | |
| NB-T13 | | | | |
| NB-T14 | | | | |
| NB-T15 | | | | |
| P4 (EX-01, EX-03 on production) | | | | |
| P5 (headers and links) | | | | |
| V15 | | | | |

- First successful run id:
- Unknowns, once tested: U4 (templating of `or`, numbers, quoting), U5 (filter key), U7 (email approval link), U17 (Retry at an approval), the approver format (T4).

## 9. Fallbacks (6.10)

1. **The webhook starts no run:** start runs manually with the job id, and stop debugging the filter at the time the lead sets.
2. **In-app approval unusable:** `email` approval sent to the user (D121). The link may need a login (U7).
3. **The status read fails** (tunnel or production): Lane D owns the fix: the exact https URL, no redirect, no challenge, the Secret, the response shape. A manual start doesn't help, because it calls the same URL with the same credential. Ask the sponsor's team at once.
4. **Retries through NudgeBee still fail at 15:10:** the lead and the user choose the recording path: NudgeBee reads the failed job, the user retries in Jashn, NudgeBee reads the completion. Label who retried; this file says which path was used.
5. **No real run at all:** this file says so. Demo the owner's Retry and the ops contract, with no NudgeBee clip.

## 10. Exported workflow

`ops/nudgebee/card-export-recovery.yaml` will be exported from NudgeBee (workflow-as-code) once the workflow runs end to end. It is not hand-written. Before committing it, remove every NudgeBee API token, any token in a webhook URL, every email address, tenant and account ids, and every absolute URL, putting placeholders in their place.

To import it again: Create from Code (paste the YAML), or `nbctl workflow apply ops/nudgebee/card-export-recovery.yaml` (F26). Then publish and make it live.

## 11. Option B

The CrashLoopBackOff stretch (6.9) is out of scope today (D131: Must 1–9 only).
