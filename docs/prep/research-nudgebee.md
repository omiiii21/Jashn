# NudgeBee research for Jashn

Written from 01:45 to 02:30 IST on 25 Nov 2026, as research notes under Rule 4. Quotes and numbers were re-checked against saved copies of the sources at 02:25 IST. Nothing here has been run against NudgeBee. The workflow YAML and endpoint contracts are design sketches to build and test after 09:00. Claims marked "source" come from NudgeBee's public GitHub code at `main`. NudgeBee Cloud may run a different build, so treat those claims as strong evidence, not proof.

## Verdict

1. **Build Option A.** One NudgeBee workflow, triggered by a webhook or by hand, reads the failed export job over HTTPS, waits for in-app approval, calls an idempotent export-only retry endpoint and reads the result back. Every step is documented and runs on NudgeBee's own server.
2. **The real dependency is a NudgeBee "account", not Kubernetes itself.** Workflows, webhooks and API runs all belong to an account, and accounts come from adding a cluster or cloud. Whether an account whose agent never connected can run HTTP-only workflows is unconfirmed. So add the K8s account tonight and keep kind plus the agent (about 15–25 minutes) as the fallback.
3. **Option B is the judge-pleaser but a stretch.** In it, the export worker is OOMKilled in kind, NuBi finds the root cause, and an approved rightsize is followed by a retry. NudgeBee ships an official template for exactly this. It costs roughly 2–3 more hours and has several untested steps, so start it only if A passes end to end by about 13:30.

---

## Facts with sources

### Sources

| ID | URL |
|---|---|
| S1 | https://docs.nudgebee.com/docs/ |
| S2 | https://docs.nudgebee.com/docs/editions/ |
| S3 | https://docs.nudgebee.com/docs/FAQ/ |
| S4 | https://nudgebee.com/pricing |
| S5 | https://docs.nudgebee.com/docs/features/workflow-builder/ |
| S6 | https://docs.nudgebee.com/docs/features/workflow-builder/triggers/ |
| S7 | https://docs.nudgebee.com/docs/features/workflow-builder/integration-tasks/ |
| S8 | https://docs.nudgebee.com/docs/features/workflow-builder/workflow-operations-approvals/ |
| S9 | https://docs.nudgebee.com/docs/features/workflow-builder/core-tasks/ |
| S10 | https://docs.nudgebee.com/docs/features/workflow-builder/workflow-tasks-reference/ |
| S11 | https://docs.nudgebee.com/docs/features/workflow-builder/workflow-versioning/ |
| S12 | https://docs.nudgebee.com/docs/features/workflow-builder/workflow-dry-run-validation/ |
| S13 | https://docs.nudgebee.com/docs/features/workflow-builder/event-tasks/ |
| S14 | https://docs.nudgebee.com/docs/features/workflow-builder/kubernetes-tasks/ |
| S15 | https://docs.nudgebee.com/docs/features/workflow-builder/cicd-tasks/ |
| S16 | https://docs.nudgebee.com/docs/features/workflow-builder/ai-tasks/ |
| S17 | https://docs.nudgebee.com/docs/features/workflow-builder/notification-tasks/ |
| S18 | https://docs.nudgebee.com/docs/integrations/Webhooks/automation_webhook/ |
| S19 | https://docs.nudgebee.com/docs/integrations/Webhooks/event_webhook/ |
| S20 | https://docs.nudgebee.com/docs/integrations/Notifications/discord/ |
| S21 | https://docs.nudgebee.com/docs/integrations/LLM/ |
| S22 | https://docs.nudgebee.com/docs/integrations/LLM/Gateway/ |
| S23 | https://docs.nudgebee.com/docs/installation/agent/local-setup/ |
| S24 | https://docs.nudgebee.com/docs/installation/agent/installation/ |
| S25 | https://docs.nudgebee.com/docs/installation/agent/installation/install-script/ |
| S26 | https://docs.nudgebee.com/docs/installation/agent/operate/helm_values/ |
| S27 | https://docs.nudgebee.com/docs/features/ai/use-cases/incident-rca/ |
| S28 | https://docs.nudgebee.com/docs/features/ai/event-analysis/ |
| S29 | https://docs.nudgebee.com/docs/api-docs/ (GraphQL reference: `workflow_execute`, `workflow_complete_approval`, …) |
| S30 | https://docs.nudgebee.com/docs/features/api-tokens/ |
| S31 | https://docs.nudgebee.com/docs/integrations/ |
| S32 | https://docs.nudgebee.com/docs/features/Kubernetes/troubleshoot-tab/ |
| S33 | https://docs.nudgebee.com/docs/features/ai/budgets-and-limits/ |
| S34 | https://www.wemakedevs.org/blogs/how-to-root-cause-a-kubernetes-incident-with-nudgebee (Kunal Kushwaha, 23 Nov 2026) |
| S35 | https://github.com/nudgebee/nudgebee (README; BSL 1.1 platform repo) and the org https://github.com/nudgebee |
| S36 | https://github.com/nudgebee/nudgebee/blob/main/runbook-server/internal/tasks/integrations/http_task.go |
| S37 | https://github.com/nudgebee/nudgebee/blob/main/runbook-server/internal/tasks/safehttp/ssrf.go |
| S38 | https://github.com/nudgebee/nudgebee/blob/main/runbook-server/internal/tasks/core/approval_task.go |
| S39 | https://github.com/nudgebee/nudgebee/blob/main/runbook-server/services/cloud/account.go |
| S40 | https://github.com/nudgebee/nudgebee/blob/main/runbook-server/internal/workflow/executor.go (skip propagation, about lines 1177–1220) |
| S41 | https://github.com/nudgebee/nudgebee/blob/main/runbook-server/docs/TRIGGERS.md |
| S42 | https://github.com/nudgebee/automation-templates/blob/main/templates/k8s_crashloopbackoff_remediation.yaml |
| S43 | https://github.com/nudgebee/nbctl (README) |
| S44 | https://github.com/nudgebee/k8s-agent (chart `values.yaml`, `installation.sh`) |
| S45 | https://github.com/nudgebee/nudgebee/blob/main/runbook-server/internal/tasks/notifications/im.go |
| S46 | https://github.com/nudgebee/nudgebee/blob/main/runbook-server/tests/integration/testdata/test-retry-workflow.yaml and `test-approval-workflow.yaml` in the same folder |
| S47 | https://kind.sigs.k8s.io/docs/user/quick-start/ and https://github.com/kubernetes-sigs/kind/releases (v0.33.0, 26 Aug 2026) |
| S48 | https://vercel.com/docs/deployment-protection |
| S49 | https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation |
| S50 | https://www.wemakedevs.org/hackathons/festivehacks/resources |
| S51 | GHCR registry index, checked at 02:00 IST: `ghcr.io/v2/nudgebee/nudgebee-agent/manifests/<chart tag>` and `ghcr.io/v2/nudgebee/kubewatch/manifests/2.14.1-nb.4` |
| S52 | Local shell on this Mac, 02:00 IST: `uname -m`, `sysctl`, `which`, `helm version`, `kubectl version --client`, `docker version` |
| S53 | https://docs.nudgebee.com/docs/installation/server/ (sign-in methods; self-host dependencies) |

### Product and access

| # | Fact | Source |
|---|---|---|
| F1 | NudgeBee calls itself an "AI Agents & Agentic Workflow Platform for SRE, CloudOps, and Support Teams". It has two parts: the **Server** (control plane: UI, API, knowledge graph, workflow engine) and the **Agent**, an in-cluster collector. | S1 |
| F2 | Cloud SaaS: "Sign up at app.nudgebee.com", 5–10 minutes. The pricing page's "Start a Free Trial" button links to **https://app.nudgebee.com/signup**. Cloud sign-in is "Completely passwordless": OAuth SSO (Google, GitHub, Okta, Microsoft) or email magic links. | S1, S4, S53 |
| F3 | Pricing page wording: "Start a Free Trial … Free to self-host \| No credit card required". Community is free; Enterprise Support starts at $499/month. Cloud free-tier limits and trial length are **not** stated. | S4 |
| F4 | Kunal's blog: "The cloud free tier covers two clusters. Everything here ran on the free tier plus one kind cluster." | S34 |
| F5 | The Community edition is free and source-available. The server is under BSL 1.1, the agents under Apache 2.0, and it includes the Workflow Builder. Self-serve multi-tenant signup is Cloud-only. | S2 |
| F6 | Self-hosting the server needs a Kubernetes cluster with "12 GB RAM and 4 CPU cores total with bundled dependencies (PostgreSQL, RabbitMQ, Redis)", or 8 GB and 2 CPU with external ones. That is too heavy for today. | S1 |
| F7 | "SaaS users get a NudgeBee-managed LLM by default." The LLM integration section (bring your own model) is "primarily for self-hosted users or those who want to use their own LLM provider". | S1, S21 |
| F8 | "Some integrations are required for NudgeBee to function (Kubernetes cluster and observability source)." | S31 |

### Accounts: why a cluster keeps coming up

| # | Fact | Source |
|---|---|---|
| F9 | Creating an automation starts with "pick the Account the automation will run in". "Create Automation is disabled when you can't write to any account." | S5 |
| F10 | The API call `workflow_execute(request: WorkflowTriggerRequest!)` takes `account_id: String!`, `id: String!`, `inputs: jsonb`, `event_id`, `use_draft_definition` and returns `{ id, execution_id }`. | S29 |
| F11 | The Automation Webhook form requires "Select Account(s) \* (Required)". | S18 |
| F12 | A K8s account is created under Admin → Integrations → Kubernetes Clusters → **Add K8s Account** (name it, mark it Non-production, click Next). The Finish Setup step then shows the agent auth key. | S23, S24 |
| F13 | Source: the server's `ValidateAccount` only checks that the account row exists and belongs to the tenant. It does not check whether the agent is connected. | S39 |
| F14 | Source: the HTTP task runs inside the server's runbook-server, not in the in-cluster agent. Approvals are Temporal activities on the server. | S36, S38 |

### Workflow engine

| # | Fact | Source |
|---|---|---|
| F15 | HTTP task `integrations.http`: GET/POST/PUT/DELETE/PATCH/HEAD/OPTIONS, a `headers` map, a string `body`, and `auth_type` of none, `bearer`, `basic`, `api_key` or `oauth2`. Other options: `timeout` (default `30s`), `insecure_skip_verify`, `proxy_url`. It outputs `status_code`, `headers` and `body` ("Parsed JSON body (if applicable) or raw string"). | S7 |
| F16 | Source: "If status code is 4xx or 5xx, return an error". **Any response of 400 or above fails the task.** The body is parsed as JSON when possible, capped at 10 MB, and the default Content-Type is `application/json`. | S36 |
| F17 | Source: an SSRF guard blocks loopback, RFC1918 private and link-local addresses (including 169.254.169.254), and allows only http and https. It follows up to 10 redirects, re-checking each one. | S37 |
| F18 | The Configs page stores values of type **Config** (`{{ Configs.key }}`) or **Secret** (`{{ Secrets.key }}`), scoped to one account or the whole tenant. Secrets are "masked in logs, task inputs and errors — not in task outputs". | S5 |
| F19 | No NudgeBee Cloud egress IP list is documented. I searched every docs page I fetched; the only "whitelist" text is about the agent reaching NudgeBee on port 443. | S1–S33 (absence) |
| F20 | Templates: `{{ Inputs.x }}`, `{{ Inputs.webhook_json.field }}`, `{{ Tasks['id'].output.field }}`, `{{ Configs.* }}`, `{{ Secrets.* }}`, `{{ Vars.* }}`, `{{ State.* }}`. A task's Condition runs it "only when the expression renders `true`". Branching uses the **Switch** task (`core.switch`). | S5, S9 |
| F21 | Every run gets automatic inputs: `workflow_execution_id` ("Unique run ID", a UUID), `workflow_id`, `workflow_name` and the execution times. | S10, S41 |
| F22 | Source: if any ordinary dependency of a task was skipped, that task is skipped too. A task after a Switch runs as long as at least one of its branches was selected. | S40 |
| F23 | Triggers: Manual, Schedule (cron in UTC), Webhook, Event and Optimization. A workflow can have several. | S6 |
| F24 | The webhook URL ends in `/api/webhooks/workflow?token=…`. "The `token` in the URL authenticates the request — no extra header is needed." The body arrives as `Inputs.webhook_json` (parsed) and `Inputs.webhook_payload` (raw). An optional filter must render exactly `true`. The body limit is 5 MB. | S6, S18, S5 |
| F25 | Event triggers fire at `event.created` (the default), `investigation.completed` or `investigation.failed`. Other phases can be saved but "NudgeBee doesn't publish events at those phases today". | S6 |
| F26 | Starting a run by API: `workflow_execute` over `/api/graphql`, or JSON-RPC at `/api/rpc`, with an `sk-nb-` API token as Bearer. The `nbctl` CLI's `workflow trigger <id> -i k=v` "Returns the new execution ID", and `workflow apply <file>` creates or updates a workflow from YAML. | S29, S30, S43 |
| F27 | Manual runs and retries act as the person who started them. Schedule, event and webhook runs act as the automation's owner. Triggers always use the published **live** version. | S5, S11 |
| F28 | Approval task `core.approval` has three types. `in_app` is the default: it "sends nothing and waits for an approval in the execution view". `instant_message` supports **Slack or MS Teams only**. `email` sends a link to an approval page in NudgeBee. Options default to `["approve","reject"]`. Output: `status` (the chosen option word for word, e.g. `approve`, not `approved`), `approver`, `comments`. | S9, S38 |
| F29 | "Webhook-only chat integrations can't carry approvals." Discord connects through your own bot token and gets notifications via Notification Rules. Neither the docs nor the source list Discord as a Send IM provider: `slack`, `ms_teams`, `google_chat` and their `_webhook` variants. | S9, S20, S17, S45 |
| F30 | "There is no separate approval timeout: the step uses its Task Timeout, else the Automation Timeout (5 minutes by default), else 10 minutes. If nobody responds in time, the step fails." Approvals have no per-step approver roles and no escalation. | S8 |
| F31 | Approval by API: `workflow_complete_approval{account_id, workflow_id, execution_id, task_id, status, comments}`. | S29 |
| F32 | The Executions tab shows a run list (status, time, duration), a read-only canvas colored by status, and each task's input, output, errors and logs. An Executions dashboard spans all automations. Statuses: Running, Completed, Failed, Canceled, Terminated, Timed Out, Continued As New. | S5 |
| F33 | **Retry semantics, quoted:** "A retry starts a new execution of the workflow from the beginning. It does not resume at the failed task or reuse completed task outputs." … "Earlier tasks can execute again, including ticket creation, notifications, and infrastructure changes. Check whether those actions are safe to repeat before retrying." A retry uses the original run's version if it still exists, otherwise the live version. | S8, S11 |
| F34 | Task failure policy controls max attempts and backoff. Automation Settings pre-fill "Retries 3" (range 0–5) and a 5-minute Automation Timeout, applied once saved. If nothing is set, the step timeout is 10 minutes with one attempt. YAML form: `failure_policy: {retry: {maximum_attempts: 3, initial_interval: "1s"}}`. | S5, S46 |
| F35 | Dry Run still sends HTTP requests for real. Only some K8s, ticket and call-workflow tasks honor the dry-run flag. | S12 |
| F36 | Workflows have versions: draft, then publish (an immutable version), then make live. "Run current" runs the draft. "Create from Code" accepts JSON or YAML. | S11, S5 |
| F37 | Runbooks run "on Temporal". Approvals are asynchronous Temporal activities. | S35, S38 |

### Agent and local kind cluster

| # | Fact | Source |
|---|---|---|
| F38 | The kind guide needs Docker, kubectl, kind and Helm. Steps: create a cluster, click Add K8s Account, then `bash installation.sh -a <agent-key> -d true` (`-d` turns off the eBPF node agent, which can't run on kind). Inventory and metrics appear in about 5 minutes; rightsizing needs about an hour of history. Not available on kind: network metrics, L7 traces, profiling. | S23 |
| F39 | Agent requirements: K8s v1.27+, Helm v3.x, a default StorageClass and a cluster-admin installer. Outbound TCP 443 to `relay.nudgebee.com` (wss), `collector.nudgebee.com`, `ghcr.io`, `nudgebee.github.io` and `raw.githubusercontent.com`. Add the Prometheus and Grafana chart hosts if the script bundles them. No inbound connections. | S24 |
| F40 | Resource requests: runner 250m CPU and 1000 Mi (limit 2000 Mi); event watcher 10m and 512 Mi. A full install adds the OTel collector (250m, 512 Mi) and ClickHouse (100m, 2000 Mi, a 50 Gi PVC). Bundled Prometheus uses a 50 Gi PVC, and the in-cluster monitoring stack needs about 1–2 CPU and 2–4 GB. | S24, S3 |
| F41 | The UI's script command is a minimal install (`-g true -x true -t true`): no bundled Prometheus and no traces. Without `-g`, the script asks to install Prometheus, and any answer but `yes` stops it. Re-running the script resets values unless you pass the same flags. | S25 |
| F42 | A default agent install "can already act on workloads: delete and evict pods, exec into them, cordon nodes, restart rollouts, scale Deployments and ReplicaSets, patch HPAs" (S26), and can "apply rightsizing recommendations" (S24). `runner.enableWritePermissions=true` adds more, including "rollout lifecycle management". `runner.readOnly=true` makes the runner's ClusterRole "strictly get/list/watch" (S44 `values.yaml`). | S24, S26, S44 |
| F43 | Blog: NuBi's `kubectl rollout restart` was refused by the runner even after chat approval ("restart is not a read-only subcommand of rollout … enable runner.enableWritePermissions for writes"). | S34 |
| F44 | The runner image (`ghcr.io/nudgebee/nudgebee-agent`) and the event-watcher image (`kubewatch`) are published for **linux/amd64 and linux/arm64**, so Apple Silicon is fine. | S51 |
| F45 | Install time: "5–10 minutes per cluster using the install script" (docs). The blog says "Inventory landed in about four minutes" and advised 10 GB+ of Docker memory, but that was for the 20-service OTel demo app. | S24, S34 |
| F46 | The agent is "required for deep in-cluster telemetry, live pod logs, … and automated AI incident RCA". | S24 |

### AI features

| # | Fact | Source |
|---|---|---|
| F47 | NuBi analyzes high-priority events automatically by default. Other events can be investigated with **Investigate**, and results appear under Troubleshoot → Investigations. | S28 |
| F48 | AI workflow tasks: `llm.summary`, `llm.investigate`, `llm.event_investigate` (takes `account_id` and `event_id`), `llm.nubi`, `llm.classify`, plus MCP and agent-to-agent (A2A) calls. | S16 |
| F49 | The blog's real root-cause analysis: CrashLoopBackOff, then the OOM killer (exit 137), then `limits.memory: 32Mi`, citing events, the manifest, logs and memory metrics. One deep question took "Fifty-six tasks, one approval, twelve sources, seven minutes forty-one seconds." | S34 |
| F50 | Official template "K8s CrashLoopBackOff Remediation": `k8s.cli` get/logs/describe → `llm.investigate` → Slack notify → `core.approval` → Switch. On OOMKilled it runs `k8s.vertical_rightsize` (direction up); otherwise `k8s.workload_restart`. | S42 |
| F51 | Typed tasks include `k8s.workload_restart`, `k8s.pod_delete` and `k8s.vertical_rightsize`. The last resizes in place on K8s ≥1.35 and honors dry run. | S14, S12 |
| F52 | Troubleshoot → Pod Errors lists OOM Killed, Image Pull Backoff, High Restarts, CPU Throttling and Replica Mismatch. | S32 |
| F53 | `events.store` creates a NudgeBee event from inside a workflow, deduplicated by `finding_id`, with optional AI analysis. The Event Webhook (`/api/webhooks/event`, token in the URL or as a Bearer header) lets any tool POST alerts in. | S13, S19 |
| F54 | The server's trigger doc gives this event-trigger example: `event_type: ["KubePodCrashLooping"]`. | S41 |
| F55 | The LLM Gateway can point at any public HTTPS OpenAI-compatible endpoint. | S22 |
| F56 | Default AI budgets: a monthly cost cap per module (tenant $1,000; per account $600 for event analysis and $400 for NuBi chat). | S33 |

### Hackathon, machine and Vercel context

| # | Fact | Source |
|---|---|---|
| F57 | Judge Kunal Kushwaha's blog: "the judging criteria ask for human approval explicitly". It suggests building "a workflow that closes a loop you close by hand today … with a human gate on the mutating step". I found no published criteria. | S34 |
| F58 | The FestiveHacks resources page lists exactly the NudgeBee pages read here: docs, Workflow Builder, Approvals, CI/CD, Kubernetes, HTTP, Event tasks, Try locally, Agent installation, root-cause walkthrough, the blog, BYOM and Discord. | S50 |
| F59 | This Mac: Apple Silicon (arm64), 24 GB RAM, macOS 26.5.2, Homebrew, kubectl v1.36.1, Docker CLI 29.7.2 with the **daemon not running**. **Helm v4.3.2 is already installed** at `/opt/homebrew/bin/helm`, which contradicts the brief, while NudgeBee documents Helm 3.x. **kind is not installed**; the latest is v0.33.0. | S52, S47 |
| F60 | Vercel: "Standard Protection: Protects all deployments except production domains". Automated callers can bypass it with an `x-vercel-protection-bypass` header. | S48, S49 |

---

## Access path and what the user must do tonight

**Path:** use NudgeBee Cloud (SaaS), not self-hosting (F6). The only open question is whether the tenant needs a *connected* cluster or just an account record (F9–F14).

**Do tonight, required, about 10 minutes:**

1. Sign up at **https://app.nudgebee.com/signup** with the team email (passwordless: SSO or an email magic link). Write down any plan or trial banner and its limits. (F2–F4)
2. Go to Admin → Integrations → Kubernetes Clusters → **Add K8s Account**. Name it `jashn-kind`, mark it Non-production and click Next. On Finish Setup, copy the auth key (the Shell Script tab shows `-a "<ACCESS_KEY>:<SECRET>"`) into the password manager. Don't install anything yet. (F12)
3. Open Automations → **Create Automation** only to check that the button works and `jashn-kind` appears in the Account picker, then close it. Workflows are built after 09:00. (F9)
4. Run `brew install kind`; Helm 4.3.2 and kubectl 1.36.1 are already installed (F59). Start Docker Desktop with `open -a Docker`, then set Settings → Resources to 8 GB memory (10 GB if B stays possible) and 4–6 CPUs. kind's own guide says 6 GB is the minimum and 8 GB is recommended, though that advice is for building node images (S47).
5. Optional, worth doing: ask in NudgeBee's Discord (https://discord.gg/C5d27ceTEv, linked from the S35 README) whether a workflow with only HTTP and approval steps can run in a K8s account whose agent has never connected. Keep the question generic; no project details are needed. The answer may arrive by morning.

**Optional tonight, about 20–30 minutes on home Wi-Fi.** This is a stock sponsor-agent install for access checking, like running a sponsor's sample. It involves no project code. Skip it if you're tired: it becomes the first task at 09:00 if the T2 test fails.

```bash
kind create cluster --name jashn-ops          # single node; lighter than the docs' 3-node example
kubectl cluster-info --context kind-jashn-ops
curl -fsSL https://raw.githubusercontent.com/nudgebee/k8s-agent/main/installation.sh -o installation.sh
# Keep-B-possible variant (Prometheus for memory metrics and alerts; no traces; no eBPF):
bash installation.sh -a "<ACCESS_KEY>:<SECRET>" -d true -t true    # answer "yes" to Prometheus, "no" to Loki
# Minimal variant for A only (no Prometheus):
# bash installation.sh -a "<ACCESS_KEY>:<SECRET>" -d true -t true -g true
kubectl get pods -n nudgebee-agent
kubectl logs -n nudgebee-agent -l app=nudgebee-agent-runner --tail=50   # want "relay connected"
```

Then confirm the cluster shows **Connected** in the UI and leave it running. (F38–F41)

**Are Docker, kind and Helm needed?**
- **Option A:** none of them are needed if the never-connected account can run HTTP workflows (test T2). If it can't, all three are needed for the fallback, and the laptop cluster must stay connected through the demo (unknown U1).
- **Option B:** all three are required, along with Docker memory and the venue network for outbound wss on port 443 (F39).

**Don't do tonight:** build the workflow, Configs or Secrets for the app, worker image, manifests or app endpoints (Rule 4).

---

## Workflow Builder mechanics

**Triggers** (F23–F27)
- **Manual:** the editor's Run button, or the list's Manual run with JSON inputs (max 2000 characters). Also by API (`workflow_execute`, which returns `execution_id`) and `nbctl workflow trigger <id> -i job_id=…`.
- **Schedule:** a 5-field cron in UTC, with overlap policy and catch-up window settings.
- **Webhook:** first create an Automation Webhook integration (Admin → Integrations → Webhooks). The URL `…/api/webhooks/workflow?token=…` appears once a workflow's trigger links to that integration. The token in the URL is the credential. The body arrives as `Inputs.webhook_json`. The filter is evaluated against `webhook_payload`.
- **Event:** filters on event type, namespace, source, priority, an advanced Jinja expression, or other accounts. It fires at `event.created`, or at `investigation.completed`/`failed` when set in the JSON.
- **Optimization:** fires when a new recommendation matches.

**HTTP request task** (F15–F18)
- Supports any method, a `headers` map and a string `body` (templated).
- Auth: `auth_type: bearer` plus `bearer_token: '{{ Secrets.jashn_ops_token }}'`, or basic, `api_key` (custom header) or OAuth2 client-credentials.
- Use later steps' data with `{{ Tasks['read_status'].output.body.status }}`.
- **Status codes of 400 and above fail the step**, and a failed step can be retried automatically if a failure policy is set (F16, F34). So business states such as "job failed" must come back as 200.
- Public HTTPS is fine. Private and loopback IPs are blocked. Redirects are followed, but Go's HTTP client normally turns a POST into a GET on a 301 or 302, so call the exact final URL.

**Conditions and branches** (F20, F22)
- The Condition tab (YAML `if:`) runs a task only when the expression renders `true`.
- `core.switch` routes to case targets.
- Skips cascade: a task depending on a skipped task is skipped too.

**Approvals** (F28–F31)
- **Where:** NudgeBee's execution view by default (`in_app`), Slack or Teams (`instant_message`), or email (a link to a NudgeBee approval page).
- **Not supported:** Discord, and webhook-only chat targets.
- **Who:** any NudgeBee user with permission on the account. There are no per-step approver roles.
- **Output:** `status` is the chosen option word for word, so compare with `== 'approve'`, then use `approver` and `comments`.
- **Timeout:** the 5-minute default fails a waiting approval, so set the step timeout (YAML `timeout: 45m`) and the workflow timeout higher.
- **API:** `workflow_complete_approval` exists if Jashn ever needs to show approvals itself.

**Execution history and run IDs** (F21, F32)
- Each workflow's Executions tab, plus the Executions dashboard.
- Every run has `{{ Inputs.workflow_execution_id }}`. Send it to Jashn so both systems show the same run ID.
- `workflow_get_execution` returns `tasks[]`, `inputs`, `workflow_result`, `error` and `triggered_by` (S29).

**Retry and replay** (F33, F34)
- A UI or API **Retry is a whole new execution from the first task**, using the same inputs. In the docs' words: "It does not resume at the failed task or reuse completed task outputs", and "Earlier tasks can execute again". The API calls this `workflow_replay_execution`, taking `account_id`, `workflow_id`, `execution_id` and `inputs` (S29).
- Separately, a step's failure policy may re-send the *same* HTTP call within one run.
- Both paths can repeat a POST, so the retry endpoint must be idempotent.

**Versioning and safety** (F27, F35, F36)
- Webhook and event runs use the **live** version and act as its owner.
- Dry Run still makes real HTTP calls.
- Keep the workflow YAML in the repo and paste it via Create from Code, or apply it with `nbctl`.

---

## Option A in full: HTTP recovery workflow (recommended)

### Flow

```
Jashn (Vercel production domain)                         NudgeBee Cloud (runbook-server on Temporal)
card export r7/png fails (labelled synthetic) ─POST webhook──▶ run starts, job_id from Inputs.webhook_json
                                 ◀── GET  /api/ops/export-jobs/{id} ─── read_status
                                                                    [optional llm.summary → "AI note"]
                                                                    approve_retry (in_app, 45 min)
                                                                    operator clicks Approve in Executions
                                 ◀── POST /api/ops/export-jobs/{id}/retry ─── retry_export (Idempotency-Key)
                                 ◀── GET  /api/ops/export-jobs/{id} ─── read_back → verdict (run completes)
```

### NudgeBee objects to create after 09:00

| Object | Value |
|---|---|
| Account | `jashn-kind` (made tonight) |
| Config `jashn_base_url` (type Config) | `https://<production-domain>`, not a preview URL (F60) |
| Config `jashn_ops_token` (type **Secret**) | 32+ random bytes; the same value goes in the Vercel server env as `OPS_RECOVERY_TOKEN` |
| Automation Webhook integration | `jashn_export_failed`, account `jashn-kind` |
| Workflow | `jashn-invite-export-recovery` (below); workflow timeout 60 min; approval step 45 min |
| Vercel env | `NUDGEBEE_EXPORT_WEBHOOK_URL` = the copied `…/api/webhooks/workflow?token=…` (server-only) |

### Workflow sketch (paste via Create from Code or `nbctl workflow apply` after 09:00; untested)

The shape follows NudgeBee's own templates and test files (S42, S46, S41). Check the U4–U6 templating questions in T7.

```yaml
name: jashn-invite-export-recovery
description: Recover one failed invitation-card export with operator approval. Export-only; never publishes or touches money.
definition:
  version: v1
  timeout: 60m
  inputs:
    - id: job_id            # manual runs pass {"job_id": "exp_..."}; webhook runs use webhook_json
      type: string
      required: false
  triggers:
    - type: manual
    - type: webhook
      params:
        integration_name: jashn_export_failed   # required key per S41; may need the integration's ID rather than its display name
        filter: '{{ webhook_payload.type == "invitation_export.failed" }}'   # key name to verify (U5)
  tasks:
    - id: resolve_job
      type: core.print
      params:
        message: '{{ Inputs.job_id or Inputs.webhook_json.job_id }}'

    - id: read_status
      type: integrations.http
      depends_on: [resolve_job]
      params:
        method: GET
        url: "{{ Configs.jashn_base_url }}/api/ops/export-jobs/{{ Tasks['resolve_job'].output.data }}"
        auth_type: bearer
        bearer_token: '{{ Secrets.jashn_ops_token }}'
        timeout: 20s
      failure_policy:
        retry: {maximum_attempts: 3, initial_interval: "2s"}

    - id: approve_retry
      type: core.approval
      depends_on: [read_status]
      timeout: 45m
      params:
        approval_type: in_app
        approval_options: [approve, reject]
        message: |
          Retry invitation-card export {{ Tasks['read_status'].output.body.job_id }} ({{ Tasks['read_status'].output.body.export_key }})?
          Status: {{ Tasks['read_status'].output.body.status }} · attempts {{ Tasks['read_status'].output.body.attempts }}
          Last error: {{ Tasks['read_status'].output.body.last_error.code }}
          Effect: re-renders this card only. No publish, guest, RSVP or ledger change.

    - id: retry_export
      type: integrations.http
      depends_on: [approve_retry]
      if: "{{ Tasks['approve_retry'].output.status == 'approve' }}"
      params:
        method: POST
        url: "{{ Configs.jashn_base_url }}/api/ops/export-jobs/{{ Tasks['read_status'].output.body.job_id }}/retry"
        auth_type: bearer
        bearer_token: '{{ Secrets.jashn_ops_token }}'
        headers:
          Content-Type: application/json
          Idempotency-Key: "nb-{{ Inputs.workflow_execution_id }}-{{ Tasks['read_status'].output.body.job_id }}"
        body: |
          {"expected_export_key": "{{ Tasks['read_status'].output.body.export_key }}",
           "nudgebee": {"workflow_id": "{{ Inputs.workflow_id }}",
                        "execution_id": "{{ Inputs.workflow_execution_id }}",
                        "approver": "{{ Tasks['approve_retry'].output.approver }}"}}
        timeout: 30s
      failure_policy:
        retry: {maximum_attempts: 2, initial_interval: "5s"}   # safe only because the endpoint is idempotent

    - id: settle
      type: core.wait
      depends_on: [retry_export]
      params: {duration: 5s}

    - id: read_back
      type: integrations.http
      depends_on: [settle]
      params:
        method: GET
        url: "{{ Configs.jashn_base_url }}/api/ops/export-jobs/{{ Tasks['read_status'].output.body.job_id }}"
        auth_type: bearer
        bearer_token: '{{ Secrets.jashn_ops_token }}'
        timeout: 20s

    - id: verdict
      type: core.print
      depends_on: [read_back]
      params:
        message: "{{ Tasks['read_back'].output.body.job_id }} = {{ Tasks['read_back'].output.body.status }}; artifact {{ Tasks['read_back'].output.body.artifact.artifact_id }}; retry outcome {{ Tasks['retry_export'].output.body.outcome }}"

    - id: rejected
      type: core.print
      depends_on: [approve_retry]
      if: "{{ Tasks['approve_retry'].output.status == 'reject' }}"
      params:
        message: "Operator rejected; job left failed, nothing re-rendered."
```

The approval step deliberately has no condition: even when the job has already succeeded, the run reaches approval and the endpoint answers `already_succeeded`. That lets a replay visibly prove the endpoint is replay-safe. A stricter production version would add a `core.switch` on `status`.

### App contracts

**Common rules for the `/api/ops/*` endpoints**
- Serve them from the **production domain** only.
- Require `Authorization: Bearer <OPS_RECOVERY_TOKEN>`. Compare in constant time. Use a separate token from users' sessions that grants only these endpoints.
- JSON only, no CORS headers, `Cache-Control: no-store`. Never echo the token back.
- **Return 200 for every business state.** Reserve 400 for malformed requests, 401 for bad tokens, 404 for unknown jobs and 5xx for real server faults, because NudgeBee fails the step on any status of 400 or above (F16).
- Don't enable Vercel challenge or bot modes on these paths.

**Records** (Supabase Postgres)
- `export_jobs`: `id` (`exp_…`), `wedding_id`, `publication_id`, `revision`, `format` (`png`), and **`export_key` UNIQUE** = `card:{wedding_id}:r{revision}:{format}`.
  - `status` is one of `queued`, `running`, `failed` or `succeeded`.
  - Also: `attempts`, `max_attempts` (3), `last_error_code`, `last_error_message` and `last_error_at`.
  - Artifact fields: `artifact_id`, `artifact_path`, `artifact_sha256`.
  - `synthetic_failure_pending` (bool, for the labelled demo) and `updated_at`.
- `export_attempts`: `job_id`, `attempt_no`, `trigger` (`owner` or `nudgebee`), **`idempotency_key` UNIQUE** (nullable), `nudgebee_workflow_id`, `nudgebee_execution_id`, `approver`, `outcome`, `response_json`, `started_at`, `finished_at`.

**Idempotency rules**
1. Each `export_key` has at most one artifact, at a fixed storage path (`exports/{wedding_id}/r{revision}.png`, written by upsert).
2. Retry claims the job atomically: `UPDATE export_jobs SET status='running', attempts=attempts+1 WHERE id=$1 AND status='failed' AND export_key=$2 AND attempts<max_attempts RETURNING *`. If no row comes back, no new attempt starts; return the current state with the matching outcome.
3. `Idempotency-Key` is required. The first request stores its response in `export_attempts.response_json`. A repeat with the same key returns that stored response with `"replayed": true`. This covers NudgeBee resending a POST after a timeout within one run.
4. A whole-run replay brings a new key (new `execution_id`), but rule 2 still guarantees a single card.
5. The retry path only re-renders the card. It never publishes, never changes the guest page, never sends guest messages and never writes to the ledger.
6. Synthetic failure: the labelled demo control sets `synthetic_failure_pending`. The next render clears it atomically and fails once with `SYNTHETIC_RENDER_FAILURE`, and the UI shows the job as "Synthetic failure".

**E1. `GET /api/ops/export-jobs/{job_id}`** returns 200 for any existing job:

```json
{
  "job_id": "exp_r7png_3f9a",
  "export_key": "card:wed_mira_kabir:r7:png",
  "wedding_id": "wed_mira_kabir",
  "revision": "7",
  "format": "png",
  "status": "failed",
  "retryable": true,
  "attempts": 1,
  "max_attempts": 3,
  "last_error": {"code": "SYNTHETIC_RENDER_FAILURE", "message": "Deliberate demo failure (labelled synthetic)", "at": "2026-11-25T12:41:07Z"},
  "artifact": null,
  "last_recovery": null,
  "synthetic": true,
  "updated_at": "2026-11-25T12:41:07Z"
}
```

After recovery the same call returns `"status": "succeeded"`, `"retryable": false`, `"artifact": {"artifact_id": "art_r7png", "sha256": "…", "bytes": 182344, "created_at": "…"}` and `"last_recovery": {"nudgebee_execution_id": "…", "approver": "…", "attempt": 2}`.

Keep all templated values as **strings** (`"revision": "7"`), because it's unknown how numbers render (U4). Leave signed download URLs out of NudgeBee-visible output, since run outputs aren't masked (F18).

**E2. `POST /api/ops/export-jobs/{job_id}/retry`**

Headers: `Authorization: Bearer …`, `Content-Type: application/json`, `Idempotency-Key: nb-{execution_id}-{job_id}` (required; 400 if missing).

```json
{"expected_export_key": "card:wed_mira_kabir:r7:png",
 "nudgebee": {"workflow_id": "…", "execution_id": "…", "approver": "…"}}
```

| Job state | Action | `outcome` | `status` after |
|---|---|---|---|
| failed, retryable, key matches | claim, then render synchronously, capped at about 15 s | `retried` | `succeeded` (or `failed` with a new error, or `running` if over the cap) |
| succeeded | none | `already_succeeded` | `succeeded`, same `artifact_id` |
| running | none | `in_progress` | `running` |
| failed, attempts ≥ max | none | `not_retryable` | `failed` |
| key differs (owner published a newer revision) | none | `stale_revision` | unchanged |
| `Idempotency-Key` already seen | return the stored response | stored value | — |

Response (200):

```json
{"job_id": "exp_r7png_3f9a", "outcome": "retried", "status": "succeeded", "attempt": 2,
 "artifact": {"artifact_id": "art_r7png", "sha256": "…", "bytes": 182344},
 "idempotency_key": "nb-019e8cde-…-exp_r7png_3f9a", "replayed": false}
```

**E3. Jashn → NudgeBee failure webhook.** Sent once when a job becomes `failed`, without blocking the user, with a 5 s timeout and a recorded `notified_at`:

```http
POST <NUDGEBEE_EXPORT_WEBHOOK_URL>        (…/api/webhooks/workflow?token=…; never sent to the browser)
Content-Type: application/json

{"type": "invitation_export.failed", "job_id": "exp_r7png_3f9a",
 "export_key": "card:wed_mira_kabir:r7:png", "error_code": "SYNTHETIC_RENDER_FAILURE",
 "failed_at": "2026-11-25T12:41:07Z", "synthetic": true}
```

NudgeBee takes only `job_id` from this payload. The base URL and token come from NudgeBee's Configs and Secrets, so a forged webhook can't redirect the token. If the webhook fails, start the run manually with `{"job_id": "…"}`.

**E4. Demo control, labelled synthetic.** `POST /api/ops/export-jobs/{job_id}/inject-failure` uses the same ops token, or an owner-only "Demo controls" toggle, to set `synthetic_failure_pending`.

**In the app:** the Invite exports panel shows the job's attempts (1: failed, synthetic; 2: succeeded via NudgeBee run `019e…`, approved by `…`). It also posts an activity-feed entry with the run ID, and offers one downloadable card.

### Setup time
- **NudgeBee side:** about 40 minutes after tonight's account step. That covers Configs and Secret (5 min), the webhook integration (5), pasting the YAML and fixing templates (15–20) and drills (10).
- **App side:** about 60–90 minutes of agent coding in the exports-and-recovery worktree, plus tests: job tables, state machine, E1–E4, the webhook call and idempotency tests.
- **Fallback:** add 15–25 minutes if T2 shows the account needs a connected agent.

### What the judges see
1. The owner exports the Lotus Hall card, and it fails (labelled synthetic).
2. NudgeBee → Automations → Executions shows a new **webhook-triggered** run paused at `approve_retry`, showing the error and its stated effect.
3. The operator clicks Approve. The steps turn green: `retry_export` shows `outcome: retried`, `read_back` shows `succeeded` plus the `artifact_id`, and the run ID is visible.
4. Jashn shows the downloaded card, the attempt history and the same run ID.
5. Replay proof: click **Retry** on the finished run, approve, and see `already_succeeded` with the same `artifact_id`. There is still one card.

### Risks and fallback for A
- **No-agent account can't run workflows (U1):** connect kind plus the agent (F38), using the hotspot if the venue blocks wss.
- **Template quirks (U4–U6):** debug with `core.print` steps and keep values as strings.
- **Approval timeout:** set it explicitly (F30).
- **Vercel protection or redirects:** call the production domain or send the bypass header (F60).
- **Judges call it "just HTTP":** add an AI note via `llm.summary`, keep the workflow-as-code YAML in the repo, and mention that the approval wait is a durable Temporal activity (F37).
- **Fallback ladder** (matches astra-plan risk #1):
  1. If the webhook fails, start the run manually with the job ID.
  2. If in-app approval fails, use `approval_type: email`.
  3. If writes fail by 14:30, run read-only (status read plus AI note) beside a manual app retry, disclosed.
  4. If no real NudgeBee run works, say so in the README.

---

## Option B: export worker in kind, NudgeBee AI root-cause analysis, approved fix (stretch)

### Shape

```
kind "jashn-ops" (laptop)                                        NudgeBee Cloud
 ns nudgebee-agent: runner, event watcher, Prometheus  ──wss/443──▶ relay / collector
 ns jashn: Deployment invite-export-worker (label app=invite-export-worker, limits.memory 96Mi)
   loop: claim job → render PNG → complete/fail
   a large-photo export exceeds 96Mi → OOMKilled (exit 137) → CrashLoopBackOff
                                     Troubleshoot → Pod Errors "OOM Killed"; NuBi investigates
                                     workflow from the "K8s CrashLoopBackOff Remediation" template (F50):
                                       get/describe/logs → llm.investigate → approval (in_app)
                                       → k8s.vertical_rightsize memory +100% (max 512Mi)
                                       → HTTP POST …/retry (re-queue) → wait → GET read-back
```

The memory limit is honestly labelled as deliberately under-provisioned. It's the same mistake as the 32Mi catalog in the judges' own walkthrough (F49).

### Extra pieces beyond A
- **Worker:** a small Node container in kind, built and then loaded with `kind load docker-image … --name jashn-ops` (S47). It runs as a Deployment with `app: invite-export-worker`, because the template selects pods with `-l app=<workload_name>` (S42). It also needs a Secret holding `WORKER_TOKEN`, separate from the ops token, and the API base URL.
- **App endpoints for the worker:**
  - `POST /api/ops/export-jobs/claim` with body `{"worker_id": "<pod>"}` returns 200 with `{"job": {…}|null, "lease_id": "…", "lease_expires_at": "…"}`. Claim with `FOR UPDATE SKIP LOCKED`.
  - `POST /api/ops/export-jobs/{id}/complete` with `{"lease_id", "artifact": {"sha256", "bytes"}}` is idempotent per lease and ignored if the lease is stale.
  - `POST /api/ops/export-jobs/{id}/fail` takes `{"lease_id", "error": {...}}`.
  - Lease expiry (an OOMKilled worker can't report) turns the job `failed` with `WORKER_LOST` and fires E3.
- **E2 changes:** retry now **re-queues** the job (`failed → queued`) instead of rendering on Vercel. The read-back waits about 20–30 s for the healed worker.
- **NudgeBee:** use Start from Template → "K8s CrashLoopBackOff Remediation". Set inputs `namespace=jashn`, `workload_name=invite-export-worker` and `account_id`. Switch the approval to `in_app`, or connect Slack, and delete the Slack notify steps. Give `rightsize_up` explicit `memory: {change_pct: 100, max: "512Mi"}`, since the template omits it (U13). Append A's `retry_export`, `settle` and `read_back`; per F22 they still run after whichever branch the Switch picked. Trigger manually with inputs, or use an event trigger once T13 shows the real event type.

### Setup time
Roughly 2–3 hours more than A:
- Cluster and agent with Prometheus: 20–30 min, unless done tonight.
- Worker, Dockerfile and lease endpoints: 45–60 min of agent time.
- Image load and manifests: 15–20 min.
- Watching events and NuBi's root-cause analysis: 30–45 min. A deep investigation took 7m41s in the blog (F49).
- Adapting the template: 30 min. Rehearsal: 20 min.

### What the judges see
- `jashn-ops` shows as a Connected cluster in NudgeBee, and `kubectl get pods -n jashn` shows CrashLoopBackOff.
- Troubleshoot shows "OOM Killed" with NuBi's analysis citing exit 137 and the 96Mi limit.
- The workflow run shows the diagnosis, the approval, the rightsize patch (old to new memory), the pod Running again, the export retried and the card appearing in Jashn, all under one run ID.

### Risks
- Laptop RAM, CPU and battery at the venue. Image pulls and the wss connection over venue Wi-Fi.
- Helm 4.3.2 versus the documented Helm 3.x (U10).
- How fast and under which type events arrive (U11); a stock crash-loop alert may wait many minutes before firing.
- AI analysis time (U14).
- The runner's command guard versus typed tasks (F42, F43, U12).
- The product's export path would depend on a laptop.

### Fallback
Option A's workflow stays the demo. Show B only as clearly labelled "experimental" footage, or drop it.

---

## Recommendation

**Choose Option A**, for a solo lead with about 6 build hours and seven modules plus three sponsors.

**Why A over B:**
- A is the integration the brief already approved: real execution, approval and retry, with no duplicate effects.
- It needs no laptop infrastructure if T2 passes.
- It fits the brief's 45-minute NudgeBee slot plus about an hour of agent work.
- It directly answers the judges' stated interest in human approval (F57) and replay safety (F33).
- B needs 2–3 more hours and five or more unverified steps.

**Cheap upgrades, in order (each about 10–15 minutes, only after the base run passes):**
1. Add an `llm.summary` "AI note" before the approval, run on the managed LLM (F7, F48). Its output goes into the approval message.
2. Add an `events.store` step so each failure also shows up as a NudgeBee event in Troubleshoot, deduplicated by `finding_id = job_id:attempt` (F53). Automatic AI analysis may not run on it, since it's limited to high-priority events and service labels may be required (F47, S28).
3. Put the workflow YAML in the repo (`ops/nudgebee/export-recovery.yaml`) and describe it in the README.

**Not on the critical path:** Slack approvals need a Slack app installed. Routing NudgeBee's AI to Sarvam's OpenAI-compatible LLM through the LLM Gateway (F55) is a nice cross-sponsor idea but untested; use it only as a final flourish.

**Timing**
- **Tonight:** the access steps above.
- **09:00–09:30:** tests T1–T9, about 25 minutes, while agents scaffold.
- **11:10:** at the NudgeBee demo, ask about U1, U2, U11 and U12.
- **12:15–13:00:** create the Configs, Secret and webhook, paste the YAML, then drill T10–T12, as the astra plan schedules.
- **13:30 Option B gate:** start B only if T10–T12 pass *and* the must-work product flows are green. Otherwise add upgrade 1 and stop.
- **14:00–14:45:** record the run, the replay and the run ID shown in both systems.

---

## Tests to run at 9:00

| # | Test (about 25 min for T1–T9) | Pass when |
|---|---|---|
| T1 | Log in. Automations → Create Automation is enabled, with `jashn-kind` selectable. | The modal accepts the account. |
| T2 | In `jashn-kind`, with no agent connected: Manual trigger, then HTTP GET `https://httpbin.org/get`, then Print `{{ Tasks['http'].output.status_code }}`. Publish, then Run current. | Completed, printing 200. **If it fails, do T2b.** |
| T2b | Install kind and the agent with the minimal command (`-d true -t true -g true`), wait for the Connected badge, then rerun T2. | Completed. Note that the cluster must stay connected for the demo. |
| T3 | Add a dummy Secret `nb_test_secret`. HTTP GET `https://httpbin.org/headers` with `auth_type: bearer` and `{{ Secrets.nb_test_secret }}`. | The header arrives and the task input shows it masked. Delete the secret afterwards; outputs aren't masked. |
| T4 | Add `core.approval` (`in_app`, step timeout 30m) before Print with `if: status == 'approve'`. Run it, approve in Executions, run again and reject. | The approve run prints; the reject run skips. Record what `approver` looks like. |
| T5 | HTTP GET `https://httpbin.org/status/500` with `failure_policy.retry.maximum_attempts: 2`. | The step fails after 2 attempts, confirming F16 and F34. |
| T6 | Create the Automation Webhook `nb_test_hook` on `jashn-kind` and add a Webhook trigger. Run `curl -X POST '<url>' -H 'Content-Type: application/json' -d '{"type":"invitation_export.failed","job_id":"exp_test"}'`. | A run appears within seconds. `{{ Inputs.webhook_json.job_id }}` gives `exp_test`, and the filter passes or blocks as expected. |
| T7 | Templating: run `{{ Inputs.job_id or Inputs.webhook_json.job_id }}` both manually and by webhook. Print a JSON number from `https://jsonplaceholder.typicode.com/todos/1` (`body.id`). | Both runs resolve, and you know whether numbers render as `1` or `1.0`. |
| T8 | Click Retry on a completed run. | A new execution ID, the same inputs, and every step re-runs, including the HTTP call (F33). |
| T9 | Create from Code: paste a minimal YAML (manual, Print) and Validate. | It's accepted, confirming the definition format. |
| T10 | (After E1–E4 exist, about 12:15.) Full drill on the production URL: synthetic failure, webhook run, approve, card. | One artifact for the `export_key`, and the run ID shown in Jashn. |
| T11 | Replay: Retry the finished recovery run and approve. Separately, `curl` E2 twice with the same `Idempotency-Key`. | `already_succeeded` with the same `artifact_id`; the second curl returns `replayed: true`. |
| T12 | Reject path. | The job stays `failed`, nothing renders and the `rejected` step prints. |
| T13 (B) | In namespace `nb-test`, deploy something memory-hungry under a 64Mi limit, e.g. `python:3.12-alpine` running `python -c "x=bytearray(200*1024*1024); import time; time.sleep(3600)"`. Watch Troubleshoot → All Events and Pod Errors, then click Investigate. | You learn the event types, the time until the first event, and how long the analysis takes. |
| T14 (B) | In the Task Runner, run `k8s.workload_restart` on that Deployment on a default install. | It succeeds; if not, run `helm upgrade … --reuse-values --set runner.enableWritePermissions=true` (F42). |

---

## Risks

| Risk | Trigger | Response |
|---|---|---|
| An account without an agent can't run workflows | T2 fails | Do T2b now (15–25 min) and keep Docker and kind running through judging. |
| Approval times out mid-demo | Default 5-minute Automation Timeout (F30) | Workflow `timeout: 60m`, approval step `timeout: 45m`; approve within the rehearsed window. |
| Duplicate cards from replays or step retries | F33 and F34 behavior | `Idempotency-Key` plus the conditional claim on `export_key`; prove it with T11. |
| HTTP step fails on business states | Endpoint returns 409 or 500 for "already done" (F16) | Return 200 with an `outcome` field; non-2xx only for real errors. |
| NudgeBee can't reach Jashn | A preview URL, Vercel protection, a redirect or a private IP (F17, F60) | Use the exact production URL, no redirects, and the bypass header if protection is on. |
| Token leak | Secrets are unmasked in outputs (F18); the webhook URL contains a token | Never echo the token; keep the webhook URL in a server env var; rotate tokens after the event. |
| Venue network blocks wss or is slow | Agent disconnects; image pulls stall | Phone hotspot; pull images tonight; A doesn't need the cluster if T2 passes. |
| Helm 4 breaks the agent install | Script or chart errors (U10) | Use a Helm 3 binary from the official Helm releases for this install only. |
| NudgeBee SaaS slow or down at judging | Run doesn't start | Show the labelled recording of a real run, with screenshots of the execution and the run ID. |
| Option B eats the afternoon | B isn't green by 14:30 | Drop B; A is the demo. |
| Judges see A as "just HTTP calls" | — | AI note step, workflow-as-code, replay-safety demo; mention it's Temporal-backed (F37). |

---

## Unknowns

- **U1** Can an account whose agent never connected run HTTP and approval workflows on Cloud? For: the HTTP step runs server-side and `ValidateAccount` doesn't check connectivity (F13, F14). Against: "Kubernetes cluster … Required" (F8). **Not verified.**
- **U2** The Cloud free tier: trial length, execution or AI limits, and whether it includes the Workflow Builder and Automation Webhook. The only source is the blog's "covers two clusters" (F4).
- **U3** NudgeBee Cloud egress IPs (not documented, F19). Don't rely on IP allow-listing.
- **U4** Jinja details: `or` and `if/else`, how JSON numbers render, and `| tojson`.
- **U5** The YAML key for a webhook trigger's filter (`params.filter`?), and whether webhook body fields also show up directly in `Inputs`.
- **U6** Whether a step that failed under a `continue` policy still lets later steps run.
- **U7** Whether clicking an email approval link needs a NudgeBee login.
- **U8** Whether a pending in-app approval raises any notification, or only shows in the execution view.
- **U9** Discord as a Send IM target: the Discord page implies it; the Send IM docs and source list no Discord (F29).
- **U10** Whether the agent chart and `installation.sh` work with Helm 4.3.2 (documented: 3.x).
- **U11** For a pod OOMKill or crash loop on kind, with and without Prometheus: which NudgeBee event types appear and how fast, and how long the stock crash-loop alert waits.
- **U12** Whether typed `k8s.workload_restart` and `k8s.vertical_rightsize` work on a default install (docs say yes, F42; the blog shows the kubectl-string path is guarded, F43).
- **U13** `k8s.vertical_rightsize` defaults when the `cpu`/`memory` blocks are left out, as the template does.
- **U14** How long automatic analysis takes for an OOM event, and whether that event counts as high priority.
- **U15** Which "judging criteria" the blog means; nothing is published (F57).
- **U16** Whether Cloud runs the same runbook-server code as GitHub `main`. Every "source" claim carries this caveat.
- **U17** What Retry does to a run still waiting at an approval.
