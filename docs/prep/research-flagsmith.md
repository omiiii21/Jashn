# Flagsmith for Jashn: research and design notes

Prepared from 01:45 to about 02:35 IST on 25 Nov 2026 for FestiveHacks (coding starts 09:00 IST, submission due 17:00 IST). I read these sources live tonight: the Flagsmith docs, flagsmith.com/pricing, the live Management API schema (`api.flagsmith.com` swagger), npm, Flagsmith's GitHub repos and the organisers' own blog posts. **"Code says"** marks something read in Flagsmith's open-source `main` branch rather than in the docs, and Cloud may behave differently. Nothing in this file has been built or run. The code blocks are sketches for 09:00.

## Verdict

1. On the **free Cloud plan**, Flagsmith can do real work in Jashn: the server-side `@flagsmith/nodejs` 9.5.0 SDK (remote evaluation on Vercel) drives one **voice-first vs form-first experiment**, a server-enforced **`voice_writes_enabled` kill switch** that leaves typing working, and a **`voice_mode` rollout** by language, role and % split.
2. The strategist is right that first ingestion can be slow ("up to a few hours") but wrong to wait until 09:00: **enable the managed warehouse tonight** in Development, Synthetic and Production (a dashboard toggle, so access prep), and create flags, segments, metrics and the experiment after 09:00.
3. Real traffic will stay below Flagsmith's floor of 50 identities and 5 conversions per arm, so show **real counts marked "Collecting data"** beside a **bannered Synthetic environment with a disclosed planted effect**, and never claim a winner.

## Facts with sources

### Flagsmith Cloud: signup, plans and limits

- You sign up and sign in at https://app.flagsmith.com/. Creating a project automatically creates `Development` and `Production` environments. [Quick start](https://docs.flagsmith.com/getting-started/quick-start)
- **Free ($0):**
  - Usage: up to **50,000 requests/month**, **1 team member**, **1 project**.
  - Unlimited flags (fair use), environments, identities and segments, plus API access.
  - **Up to 100,000 users in experiments.**
  - The comparison matrix ticks "A/B and MVT Testing" and "3rd Party Integrations" for Free.
  - Not ticked for Free: scheduled flags, user roles and permissions, unlimited audit-log history, change requests, SAML and real-time flag updates. [Pricing](https://www.flagsmith.com/pricing)
- **Start-Up:** $40/month billed yearly or $45 monthly, with a 14-day free trial. 1M requests, 3 team members, unlimited projects, scheduled flags, 2FA and 500,000 users in experiments.
- **Scale-Up:** $250/month yearly or $300 monthly, with a 14-day trial. 5M+ requests, 5–20 members, a **bring-your-own experimentation warehouse**, roles and permissions, change requests, unlimited audit-log history and SAML.
- **Enterprise:** adds real-time flag updates, custom fields and on-prem installation. [Pricing](https://www.flagsmith.com/pricing)
- **Billable requests:** `/flags`, `/identities`, `/traits` and `/environment-document`. Management API calls, flag-analytics posts and the real-time stream are not billable. A server-rendered page usually costs one request per page view. [Pricing FAQ](https://www.flagsmith.com/pricing) · [Billing and API usage](https://docs.flagsmith.com/administration-and-security/billing-api-usage)
- **Going over the Free limit:** Flagsmith stops answering API requests, after a warning email 7 days before the block. The block clears 30 days after that email, or on upgrade. The Management API is rate-limited to 500 requests/minute. [System limits](https://docs.flagsmith.com/administration-and-security/governance-and-compliance/system-limits)
- **Audit log on Free (code says):** the Free plan's audit-log visibility is **0 days**.
  - `FREE_PLAN_SUBSCRIPTION_METADATA` leaves `audit_log_visibility_days` at its default of 0.
  - The audit list view filters to `created_date >= now - limit`.
  - So expect an empty Audit Log on Free, and check it tonight. [constants.py](https://github.com/Flagsmith/flagsmith/blob/main/api/organisations/subscriptions/constants.py) · [metadata.py](https://github.com/Flagsmith/flagsmith/blob/main/api/organisations/subscriptions/metadata.py) · [audit/views.py](https://github.com/Flagsmith/flagsmith/blob/main/api/audit/views.py)
- **Conflicts between sources:**
  - The docs say scheduled flags are "only for our Scale-up and Enterprise plans", but the pricing matrix ticks them for Start-Up.
  - The Start-Up card lists "A/B and MVT Testing" as an extra, but the matrix ticks it for Free. [Scheduled flags](https://docs.flagsmith.com/managing-flags/scheduled-flags) · [Pricing](https://www.flagsmith.com/pricing)
- Experimentation is **in beta**, and each experiment is **scoped to one environment**. [Experimentation](https://docs.flagsmith.com/experimentation)

### Self-hosting

- **Docker Compose:** run `curl -o docker-compose.yml https://raw.githubusercontent.com/Flagsmith/flagsmith/main/docker-compose.yml`, then `docker-compose -f docker-compose.yml up`. The dashboard and API are at http://localhost:8000, and the first account created is a superuser. [Docker guide](https://docs.flagsmith.com/deployment-self-hosting/hosting-guides/docker)
- **Experimentation works self-hosted** in both the open-source and Enterprise editions, "with no edition restriction".
  - Set `EXPERIMENTATION_ENABLED=true`. The current compose file already sets it.
  - Events can go to the "Flagsmith database". It is PostgreSQL only, "For evaluating experimentation only", and shows **Connected straight away**.
  - Or events can go to your own ClickHouse, Databricks or PostgreSQL. That also needs the ingestion service, Kafka and warehouse delivery.
  - Point the SDK events URL at your API URL ending in `/api/`. The SDKs append `v1/events`. [Self-hosting experimentation](https://docs.flagsmith.com/experimentation/self-hosting)
- The compose file on `main` today runs `postgres`, `migrate-db`, `flagsmith` and `flagsmith-task-processor`, with `EXPERIMENTATION_ENABLED: 'true'`. The self-hosting page's claim that it "runs every experimentation service, with a local ClickHouse" looks out of date. [docker-compose.yml](https://github.com/Flagsmith/flagsmith/blob/main/docker-compose.yml)
- Self-hosted installs have no API request limits. [Billing](https://docs.flagsmith.com/administration-and-security/billing-api-usage)
- Flagsmith publishes a "run locally" coding-agent prompt.
  - It brings up Docker, creates Development and Production, connects both to the Flagsmith database and installs the CLI.
  - It needs Docker Compose v2, at least 4 GB of memory for Docker, and free ports 8000 and 8001. [Run locally with a coding agent](https://docs.flagsmith.com/getting-started/run-locally-with-a-coding-agent)
- The main repo is `Flagsmith/flagsmith`: BSD-3-Clause, about 9.4k stars, latest release v2.295.2 on 23 Nov 2026. [GitHub](https://github.com/Flagsmith/flagsmith)

### SDK and tool versions (read tonight)

| Package | Latest | What matters | Source |
|---|---|---|---|
| `@flagsmith/nodejs` | **9.5.0** (23 Nov 2026) | `engines.node >=20` (the docs still say Node 18+). ESM and CJS. Experiments need ≥9.1.0. 9.3.0 records exposures under local evaluation. 9.4.0 adds event retries, a bounded buffer and a close timeout. 9.5.0 adds `reason`. | [npm](https://www.npmjs.com/package/@flagsmith/nodejs) · [releases](https://github.com/Flagsmith/flagsmith-nodejs-client/releases) |
| `flagsmith-nodejs` | 8.1.2, deprecated | The old package "can't" send events | [npm](https://www.npmjs.com/package/flagsmith-nodejs) · [agent prompt](https://docs.flagsmith.com/experimentation/set-up-with-a-coding-agent) |
| `@flagsmith/flagsmith` (JS/React) | **12.6.0** (23 Nov 2026) | Experiments need ≥12.4.0. 12.5.0 retries delivery and flushes on close. 12.6.0 adds `reason`. | [npm](https://www.npmjs.com/package/@flagsmith/flagsmith) · [releases](https://github.com/Flagsmith/flagsmith-js-client/releases) |
| Flagsmith CLI | **v2.0.0** (21 Aug 2026, written in Go). The npm `@flagsmith/cli` 2.0.0 wraps it. | The experiment prompt requires v2 or later | [releases](https://github.com/Flagsmith/flagsmith-cli/releases) · [CLI docs](https://docs.flagsmith.com/integrating-with-flagsmith/CLI) |
| `next` | 16.4.6 (9 Nov 2026) | `after()` has been stable since 15.1.0 | [npm](https://www.npmjs.com/package/next) · [after()](https://nextjs.org/docs/app/api-reference/functions/after) |

On 23 Nov 2026 Flagsmith removed the "remote evaluation only" note from the experiment docs, stating that "Experiments now work under local evaluation in every server-side SDK". [PR #9055](https://github.com/Flagsmith/flagsmith/pull/9055)

### Features a judge might count as "best use"

| Feature | Fact | Source |
|---|---|---|
| Segments | Rules over identity traits. Rules inside a segment are evaluated top to bottom. Precedence is identity override, then segment override, then the environment default. Remote evaluation never returns segment definitions to the app. | [Segments](https://docs.flagsmith.com/flagsmith-concepts/segments/) |
| % rollout | "% Split" is the only operator that needs no trait. It is deterministic per identity. With a single split rule, members at 10% stay members when you raise it. The bucket is a hash of segment ID plus identity ID. | [Rule operators](https://docs.flagsmith.com/flagsmith-concepts/segments/segment-rule-operators) · [Rollout by %](https://docs.flagsmith.com/managing-flags/rollout/rollout-by-percentage) |
| `In` operator | Matches a comma-separated list, case-sensitive | [Rule operators](https://docs.flagsmith.com/flagsmith-concepts/segments/segment-rule-operators) |
| Remote config | A typed value (string, number, boolean or JSON) alongside the on/off state | [Core management](https://docs.flagsmith.com/managing-flags/core-management) |
| Multivariate | Needs identified users. Deterministic per environment. Changing weights mid-test re-buckets users. Bucketing differs between environments. | [Core management](https://docs.flagsmith.com/managing-flags/core-management) |
| Kill-switch hygiene | The "Server-side only" flag setting blocks client SDKs. The `protected` tag prevents deletion. | [Core management](https://docs.flagsmith.com/managing-flags/core-management) · [Tagging](https://docs.flagsmith.com/managing-flags/tagging) |
| Transient traits | Used for evaluation but not persisted. In Node: `{ role: { value: 'owner', transient: true } }`. | [Identities](https://docs.flagsmith.com/flagsmith-concepts/identities) · [sdk/index.ts](https://github.com/Flagsmith/flagsmith-nodejs-client/blob/main/sdk/index.ts) |
| Identity keys | Use an unguessable key such as a GUID, because the SDK identity API is public by design. A trait value is at most 2,000 bytes. | [Identities](https://docs.flagsmith.com/flagsmith-concepts/identities) |
| Environments | Unlimited on Free. Each environment has its own keys and its own warehouse connection, and can have a coloured banner. | [Pricing](https://www.flagsmith.com/pricing) · [Connect a warehouse](https://docs.flagsmith.com/experimentation/connect-a-warehouse) · [Security](https://docs.flagsmith.com/administration-and-security/governance-and-compliance/security) |
| Environment webhooks | Send `FLAG_UPDATED` on feature create or update, identity override and segment override. The payload has `changed_by`, `new_state`, `previous_state` and `timestamp`, signed with HMAC-SHA256 in `X-Flagsmith-Signature`. **Which plans include them is not stated.** | [Environment settings](https://docs.flagsmith.com/administration-and-security/platform-configuration/environment-settings) |
| Audit log | Records "Every action taken within the Flagsmith administration application". Audit-log webhooks are set up in organisation settings. Free-plan history is probably 0 days (see above). | [Audit logs](https://docs.flagsmith.com/administration-and-security/governance-and-compliance/audit-logs) |
| Change requests | Scale-Up and Enterprise only. A four-eyes flow: create, approve, publish. | [Change requests](https://docs.flagsmith.com/administration-and-security/governance-and-compliance/change-requests) |
| Scheduled flags | Paid plans only (see the conflict above) | [Scheduled flags](https://docs.flagsmith.com/managing-flags/scheduled-flags) |
| Real-time updates | Enterprise only. Supported SDKs are JavaScript, Android, iOS, Flutter, Python and Ruby; **Node.js is not listed**. Trait and identity-override changes emit nothing. | [Real-time flags](https://docs.flagsmith.com/performance/real-time-flags) |
| Flag analytics | Opt in through the SDK. Counts appear 30–60 minutes later. | [Flag analytics](https://docs.flagsmith.com/managing-flags/flag-analytics) |
| Edge API | Runs in 8 AWS regions including Mumbai (`ap-south-1`). The SDK's default URL is `https://edge.api.flagsmith.com/api/v1/`. | [Edge API](https://docs.flagsmith.com/performance/edge-api) · [sdk/types.ts](https://github.com/Flagsmith/flagsmith-nodejs-client/blob/main/sdk/types.ts) |
| "Hide Sensitive Data" | Nulls `reason` (among other fields) in responses. Leave it off if Jashn shows why a flag is on. | [Security](https://docs.flagsmith.com/administration-and-security/governance-and-compliance/security) |

### What the organisers say they reward

- **FestiveHacks publishes no judging weights** (hackathon-facts.md).
- **Toggle Wars** is the organisers' online Flagsmith hackathon on 26–29 Nov. Its "Use of Flagsmith" criterion asks "whether the flags or experiments do real work". Kunal Kushwaha writes: "delete Flagsmith from your submission, and if it behaves identically you have not scored on this line." [How to Win Toggle Wars](https://www.wemakedevs.org/blogs/how-to-win-toggle-wars) · [Toggle Wars](https://www.wemakedevs.org/hackathons/flagsmith)
- Kunal lists four wiring mistakes: an unstable identifier, exposures on one side only, a conversion event that never fires, and a boolean flag converted late ("Start multivariate"). He says "+14.9% lift, 84% probability, interval from -14.1% to +44.0%" "is not a win", and advises tracking one guardrail metric. [How to Win Toggle Wars](https://www.wemakedevs.org/blogs/how-to-win-toggle-wars)
- The organisers' A/B walkthrough:
  - It discloses that its "502 visitors are traffic I pushed through the demo".
  - It prints the served variation in the footer and uses a default flag handler for outages.
  - Under "What to do between now and the 26th" (the Toggle Wars start) it says: "Sign up for Flagsmith Cloud, make a project, and create one multivariate flag with two values." It also says the managed warehouse "is already wired up". [How to run a real A/B test](https://www.wemakedevs.org/blogs/how-to-run-a-real-ab-test-with-flagsmith-experimentation)
- Toggle Wars says "simulated traffic is fine". [Toggle Wars](https://www.wemakedevs.org/hackathons/flagsmith)

## Experimentation mechanics

### How an experiment is defined

1. **Warehouse connection.** Each environment has one. It "must be in place before you can create experiments". [Connect a warehouse](https://docs.flagsmith.com/experimentation/connect-a-warehouse)
2. **Multivariate flag.** It needs one variation per treatment, each with a **label** (the API and CLI call it `key`). The flag's current value is the control, and the key `control` is reserved. A flag can be in only one active experiment at a time. [Create an experiment](https://docs.flagsmith.com/experimentation/create-an-experiment) · [Statistics](https://docs.flagsmith.com/experimentation/statistics)
3. **Metric.** Defined per environment and reusable.
   - Aggregation: Occurrence, Count, Sum or Mean.
   - Direction: higher is better, lower is better, or informational.
   - Event name: must match exactly and is case-sensitive. Sum and Mean read the numeric `value` sent with each event. [Create metrics](https://docs.flagsmith.com/experimentation/create-metrics)
4. **Experiment wizard.** Four steps:
   - Setup: name, hypothesis and flag.
   - Rollout: the percentage of identities that enter, then the split between control and variations. Bucketing is deterministic on the identity key.
   - Measurement: the primary metric and its expected direction (increase, decrease, should not increase, should not decrease).
   - Review & Launch: the experiment "starts immediately".
   - While it runs, the flag's configuration and variations are locked, though the rollout % can still be edited (which can hurt validity). Ending freezes the results, and an ended experiment cannot be restarted. [Create an experiment](https://docs.flagsmith.com/experimentation/create-an-experiment)
5. **Extra endpoints in the live API, missing from the docs.** The schema has `start`, `pause`, `complete` and `rollout`:
   - `complete` "decides what its feature serves afterwards: control, one variant, or the flag disabled".
   - `rollout` (PATCH) takes an optional **`audience`** `{match: any|all, segment_ids}` that "can only be changed before the experiment starts serving traffic". Code says the audience can hold at most one segment.
   - There are also `exposures` and `results` endpoints, each with a `refresh`. [Swagger](https://api.flagsmith.com/api/v1/swagger.json) · [experimentation/constants.py](https://github.com/Flagsmith/flagsmith/blob/main/api/experimentation/constants.py)

### How exposure and conversion events are sent

| Step | Node.js `@flagsmith/nodejs` ≥9.1.0 | JS `@flagsmith/flagsmith` ≥12.4.0 | React |
|---|---|---|---|
| Init | `new Flagsmith({ environmentKey, enableEvents: true })` | `await flagsmith.init({ environmentID, enableEvents: true })`, then `identify(id)` | `<FlagsmithProvider options={{ environmentID, identity, enableEvents: true }}>` |
| Evaluate and record the exposure in one call | `await flagsmith.getExperimentFlag('setup_entry', identifier, traits?)` | `flagsmith.getExperimentFlag('setup_entry')` | `useExperiment('setup_entry')` (records on render) |
| Evaluate now, record at display | `(await flagsmith.getIdentityFlags(id, traits)).getFlag(name)`, then if `flag.experiment?.inExperiment`, `flagsmith.trackExposureEvent(name, { identifier, value: flag.variant })` | `getAllFlags()[name]`, then `trackExposureEvent(name, { value: flag.variant })` | `useFlags` plus `useFlagsmith().trackExposureEvent` |
| Conversion | `flagsmith.trackEvent('setup_saved', { identifier, value? })` | `flagsmith.trackEvent('setup_saved', { value? })` | `useFlagsmith().trackEvent(...)` |
| Send what is buffered | `await flagsmith.flushEvents()` (can be called repeatedly). `await flagsmith.close(timeoutMs?)` is terminal. | `await flagsmith.flushEvents()` | n/a |

Python names: `get_experiment_flag`, `track_event` and `track_exposure_event`. The organisers' blog uses the first two. Sources: [Run an experiment](https://docs.flagsmith.com/experimentation/run-an-experiment) · [sdk/index.ts](https://github.com/Flagsmith/flagsmith-nodejs-client/blob/main/sdk/index.ts) · [flagsmith-core.ts](https://github.com/Flagsmith/flagsmith-js-client/blob/main/flagsmith-core.ts) · [A/B blog](https://www.wemakedevs.org/blogs/how-to-run-a-real-ab-test-with-flagsmith-experimentation)

**Node SDK behaviour (code says).** [sdk/index.ts](https://github.com/Flagsmith/flagsmith-nodejs-client/blob/main/sdk/index.ts) · [sdk/events.ts](https://github.com/Flagsmith/flagsmith-nodejs-client/blob/main/sdk/events.ts) · [sdk/models.ts](https://github.com/Flagsmith/flagsmith-nodejs-client/blob/main/sdk/models.ts)
- The exposure event is named `$flag_exposure`. `trackEvent` throws on any name that starts with `$`.
- `getExperimentFlag` throws if `enableEvents` is off. It records nothing if the flag is missing, disabled, not `inExperiment`, or has no variant.
- `flag.variant` is set even for identities outside the rollout ("A Flag.variant alone cannot tell"). Always check `flag.experiment.inExperiment`.
- The buffer holds 1,000 events and flushes every 10 s. A batch gets up to 3 attempts on network errors, 408, 429 or 5xx.
- **A 401 or 403 response makes the processor drop every event and stop tracking, silently.**

**REST endpoint.** There is no public docs page for it; this comes from the SDK source:

```
POST https://events.api.flagsmith.com/v1/events
X-Environment-Key: <environment key>
{"events":[{"event":"$flag_exposure","feature_name":"setup_entry","identifier":"u_…","value":"voice_first",
            "traits":null,"metadata":{"experiment_id":123},"timestamp":1764050000000}]}
```

A conversion is the same shape, with `"event":"setup_saved"` and `"feature_name":null`. A self-hosted "Flagsmith database" receives events at `POST <api>/api/v1/events/` (the live schema returns 202). [sdk/events.ts](https://github.com/Flagsmith/flagsmith-nodejs-client/blob/main/sdk/events.ts) · [Swagger](https://api.flagsmith.com/api/v1/swagger.json)

**Rules that silently drop or skew data:**
- Events older than 10 days, or more than 24 hours in the future, are rejected. A batch over 2 MiB is rejected whole.
- Event names that match no metric are ignored silently.
- Conversions count only after the identity's first exposure.
- Exposures are deduplicated per identity, under the variant seen first. Identities seen in two variants are quarantined.
- Delivery is at-least-once, so Count, Sum and Mean can inflate slightly. Occurrence metrics and exposures are not affected.
- The ingestion service **rejects events for environments without a warehouse**.
- Exposures are attributed by label, so a variation without one (for example, created through the API without a `key`) is not counted.
- Code limits: event name ≤256 characters, value ≤128 KiB, traits ≤32 KiB, metadata ≤8 KiB.

[Run an experiment](https://docs.flagsmith.com/experimentation/run-an-experiment) · [Create metrics](https://docs.flagsmith.com/experimentation/create-metrics) · [Statistics](https://docs.flagsmith.com/experimentation/statistics) · [constants.py](https://github.com/Flagsmith/flagsmith/blob/main/api/experimentation/constants.py)

### Warehouses

- **A warehouse is required.**
- **Managed "Flagsmith" warehouse:** Cloud only, "nothing to provision".
  - To enable it: Environment Settings › Warehouse › select Flagsmith › Enable, then confirm.
  - "Send your first event" makes Flagsmith send a test event for you.
  - Status goes Created → Pending Connection → Connected. Any first event counts, including one from your app. It can also show Errored.
  - The card shows total events received and unique event names. Code says the managed store is ClickHouse. [Connect a warehouse](https://docs.flagsmith.com/experimentation/connect-a-warehouse) · [warehouses/flagsmith.py](https://github.com/Flagsmith/flagsmith/blob/main/api/experimentation/warehouses/flagsmith.py)
- **Bring your own:** ClickHouse, Databricks or PostgreSQL. "Supabase and Neon also work" for PostgreSQL. On Cloud this needs **Scale-Up or Enterprise**; self-hosted has no plan restriction. **Snowflake and BigQuery are "Coming soon"**; the live API's type list already includes `snowflake` but not BigQuery. [Connect a warehouse](https://docs.flagsmith.com/experimentation/connect-a-warehouse) · [PostgreSQL](https://docs.flagsmith.com/experimentation/connect-postgresql) · [Swagger](https://api.flagsmith.com/api/v1/swagger.json)
- **API:** `GET` or `POST /api/v1/environments/{environment_api_key}/warehouse-connections/` with `warehouse_type` set to one of `flagsmith`, `snowflake`, `clickhouse`, `databricks` or `postgres`. The response carries `status`, `total_events_received`, `unique_events_count` and `last_event_received_at`. [Swagger](https://api.flagsmith.com/api/v1/swagger.json)

### Timing

- **First event:** "Processing the first event can take up to a few hours. The status refreshes about once a minute while you keep the Warehouse tab open." [Connect a warehouse](https://docs.flagsmith.com/experimentation/connect-a-warehouse)
- **SDK batches** go out every 10 s by default. [Run an experiment](https://docs.flagsmith.com/experimentation/run-an-experiment)
- **Once connected,** Flagsmith's own agent prompt refreshes results "About a minute later" after test traffic. That suggests about a minute of latency, but it is my inference, not a promise. [Agent prompt](https://docs.flagsmith.com/experimentation/set-up-with-a-coding-agent)
- **Refresh limits:** results refresh at most once every 5 minutes (code applies the same limit to exposures). [Analyse](https://docs.flagsmith.com/experimentation/analyse-an-experiment) · [constants.py](https://github.com/Flagsmith/flagsmith/blob/main/api/experimentation/constants.py)

### Where results show and what statistics are reported

- **Where:** Experiments page › experiment detail. Results also come from `GET …/experiments/{id}/results/` and `…/exposures/` (both return null until computed) and from the MCP tools `get_experiment_results` and `get_experiment_exposures`.
- **Scorecards:** Users enrolled, Winning variation, Chance to be best, Lift vs control.
- **Per-variation table:** Exposures, the metric value (rate, count, sum or mean), Delta %, the **95% credible interval** and Win probability.
- **Other panels:** exposures over time with each variation's share, a count of quarantined identities, and a conversions trend.
- **Verdict rules:** a banner recommends rollout at 95%. Above 95% is winning, below 5% is losing, anything between is inconclusive.
- **Engine:** **Bayesian**. A frequentist engine is "Deferred" and expected loss is "Not currently planned".
- **Thresholds:** "**Collecting data**" shows until every arm has **≥50 identities** and, for conversion metrics, **≥5 conversions**. The **sample-ratio-mismatch** check starts at ≥100 identities and fires at one-in-a-thousand imbalance.

[Analyse](https://docs.flagsmith.com/experimentation/analyse-an-experiment) · [Statistics](https://docs.flagsmith.com/experimentation/statistics) · [Swagger](https://api.flagsmith.com/api/v1/swagger.json) · [MCP tools](https://docs.flagsmith.com/integrating-with-flagsmith/mcp-server)

### The strategist's claim: "Enable the managed warehouse at 09:00 because first ingestion can take hours"

- **The premise is confirmed, with a nuance.** The doc says "Processing the first event can take up to a few hours". That is "up to", not always. [Connect a warehouse](https://docs.flagsmith.com/experimentation/connect-a-warehouse)
- **The timing is refuted.** A warehouse "must be in place before you can create experiments", and "The event ingestion service rejects events for environments without one". [Run an experiment](https://docs.flagsmith.com/experimentation/run-an-experiment)
  - Enabling at 09:00 puts a wait of up to several hours inside the 8-hour build. The astra plan wants the experiment started between 12:15 and 13:00.
  - Enabling at about 02:00 moves that wait to sleep time.
  - There is one connection per environment, so do it in **every** environment you will use.

### Does tonight's setup count as "access prep"?

The rule says: "The main coding and design work must begin after the hackathon starts. Ideas, notes, sketches and research beforehand are fine." ([rules](https://www.wemakedevs.org/hackathons/festivehacks/rules), quoted in hackathon-facts.md). The approved brief calls tonight "planning, research, assets and access preparation". The organisers' A/B post goes further, for Toggle Wars: "Sign up for Flagsmith Cloud, make a project, and create one multivariate flag with two values" ([A/B blog](https://www.wemakedevs.org/blogs/how-to-run-a-real-ab-test-with-flagsmith-experimentation)). FestiveHacks' rule is stricter, and a flag already encodes the experiment's design, so stop at the empty project.

| Tonight (access prep: no code, no product design) | After 09:00 (project work) |
|---|---|
| Account, organisation, an empty project, a third empty environment, server-side keys, an organisation API key, and the managed warehouse toggle with Flagsmith's own test event | Every flag, segment, override, metric, experiment and webhook, plus SDK code, the synthetic script, environment banners and trait settings |

This matches astra-plan.md, which lists "custom flags" as 09:00 work. Add one README line: "Before 09:00 we only created the Flagsmith account, an empty project with three environments, and enabled the managed warehouse. Everything else was created after 09:00."

## SDK usage for Next.js (App Router, Node runtime, Vercel)

### Choice: server-only Node SDK, remote evaluation

- **Package:** `@flagsmith/nodejs@9.5.0`, pinned exactly because the SDK shipped on 23 Nov. It needs Node ≥20. [npm](https://www.npmjs.com/package/@flagsmith/nodejs)
- **Remote evaluation (the default).** Every `getIdentityFlags` call is a blocking request, so flags are as fresh as the Edge API. Traits sent are persisted unless marked transient, and are used in that same request. [Server SDKs](https://docs.flagsmith.com/integrating-with-flagsmith/sdks/server-side)
- **Not local evaluation.** "When running in Local Evaluation mode, our SDKs expect to be run as long-lived processes… we do not recommend running our SDKs in Local Evaluation mode on top of platforms like Lambda". Vercel functions are serverless. [SDK overview](https://docs.flagsmith.com/integrating-with-flagsmith/sdks/)
- **Key:** the server-side environment key (`ser.…`), which is secret. Keep it server-only and never in a `NEXT_PUBLIC_` variable. Events accept client- or server-side keys. [Server SDKs](https://docs.flagsmith.com/integrating-with-flagsmith/sdks/server-side) · [Run an experiment](https://docs.flagsmith.com/experimentation/run-an-experiment)
- **Why not the client SDK:** client keys are public, client SDKs can write traits, and it would add a second identity path. The judged behaviour (a kill switch, exposures, conversions) must be enforced on the server anyway. [SDK overview](https://docs.flagsmith.com/integrating-with-flagsmith/sdks/) · [Security](https://docs.flagsmith.com/administration-and-security/governance-and-compliance/security)

### Pattern (sketch for 09:00, not run)

```ts
// lib/flags/server.ts
import 'server-only'
import { cache } from 'react'
import { after } from 'next/server'
import { createHmac } from 'node:crypto'
import { Flagsmith, DefaultFlag } from '@flagsmith/nodejs'

const FALLBACK: Record<string, [boolean, string | null]> = {        // used only if Flagsmith fails
  voice_mode: [true, null], voice_writes_enabled: [true, null], setup_entry: [true, 'form_first'],
  voice_tts_enabled: [true, null], stt_mode: [true, 'codemix'], image_extraction_provider: [true, 'docai'],
}
export const flagsmith = new Flagsmith({
  environmentKey: process.env.FLAGSMITH_SERVER_KEY!,   // ser.… per environment
  enableEvents: true,                                   // required for exposures and trackEvent
  requestTimeoutSeconds: 2, retries: 1,                 // fail fast to FALLBACK
  defaultFlagHandler: (k) => new DefaultFlag(FALLBACK[k]?.[1] ?? null, FALLBACK[k]?.[0] ?? false),
})
export const fsIdentity = (userId: string) =>          // stable, unguessable, never the raw DB id
  'u_' + createHmac('sha256', process.env.FLAGSMITH_ID_SALT!).update(userId).digest('base64url').slice(0, 22)

// one Flagsmith request per render, shared by every server component (key by string, not object)
export const flagsFor = cache(async (userId: string) => {
  const u = await loadFlagContext(userId)               // role, lang, isInternal, weddingCount from the DB
  return flagsmith.getIdentityFlags(fsIdentity(userId), {
    preferred_language: u.lang,                         // persisted; 'en' | 'hi' | 'hinglish'
    role: { value: u.role, transient: true },
    is_internal: { value: u.isInternal, transient: true },
    is_first_wedding: { value: u.weddingCount === 0, transient: true },
  })
})
export const flushLater = () => after(() => flagsmith.flushEvents())  // never close() per request: it is terminal
```

- In **server components**, call `const flags = await flagsFor(user.id)`, then `flags.isFeatureEnabled('voice_mode')`, `flags.getFeatureValue('stt_mode')`, or `flags.getFlag('setup_entry')`. The `Flag` object has `enabled`, `value`, `variant`, `experiment` and `reason`.
- In **route handlers and server actions**, use the same call (React `cache` only dedupes inside a render), then enforce the kill switch.
- Call `flushLater()` wherever an exposure or conversion is tracked.
- `after()` works in "Server Components…, Server Functions, Route Handlers, and Proxy". On Vercel it uses `waitUntil`. [after()](https://nextjs.org/docs/app/api-reference/functions/after)

### Gotchas, each with a source

- **Frozen flags.** With the default fetch, Next.js "will fetch once during next build because the route will be statically prerendered" unless request-time APIs are used. Every route that reads flags must be dynamic: it reads the session cookie, or calls `await connection()`. [Next.js fetch](https://nextjs.org/docs/app/api-reference/functions/fetch)
- **Exposures from prefetch.** `<Link prefetch={true}>` prefetches "The full route… for both static and dynamic routes", which would render the setup page and record exposures for owners who never opened it. Use `prefetch={false}` on links to `/weddings/new`. [Next.js Link](https://nextjs.org/docs/app/api-reference/components/link)
- **Lost events.** Buffered events are lost if the function freezes. Flush through `after()`. A wrong key (401/403) silently stops all event tracking. [sdk/events.ts](https://github.com/Flagsmith/flagsmith-nodejs-client/blob/main/sdk/events.ts)
- **Bundling.** `pino` is already in Next.js's default `serverExternalPackages`, so bundling should be fine. [serverExternalPackages](https://nextjs.org/docs/app/api-reference/config/next-config-js/serverExternalPackages)

### Official Next.js guidance, and real-time updates

- **The official Next.js page uses the JS client.** Flagsmith documents `@flagsmith/flagsmith/isomorphic`:
  - `flagsmith.init()` in the App Router `RootLayout`, then `getState()` → `<FlagsmithProvider serverState>`, then `useFlags`.
  - Its SSR example says: "Create a fresh instance per request to prevent identity leaking".
  - `@flagsmith/flagsmith/next-middleware` serves middleware.
  - The example repo `flagsmith-js-examples/nextjs-approuter` still depends on the deprecated `flagsmith` 9.x package.
  - This pattern is for UI-only flags. It does not suit a server-enforced kill switch. [Next.js and SSR](https://docs.flagsmith.com/integrating-with-flagsmith/sdks/client-side-sdks/nextjs-and-ssr) · [example package.json](https://github.com/Flagsmith/flagsmith-js-examples/blob/main/nextjs-approuter/package.json)
- **Real-time updates need Enterprise**, and the Node SDK is not on the supported list. The JS client has `realtime: true` and polling through `startListening(ticks)`, but polling uses quota. [Real-time](https://docs.flagsmith.com/performance/real-time-flags) · [JS client](https://docs.flagsmith.com/integrating-with-flagsmith/sdks/client-side-sdks/javascript)
- **For the demo,** enforce on the server, and add a small client component that calls `router.refresh()` when the tab regains focus. Switching back from the Flagsmith tab then re-evaluates the server flags. This is my pattern, not Flagsmith's.

### "Set up with a coding agent": what it is

- **It is a copy-paste prompt.** It is not an MCP server and not an agent skill. You run it in the repo with "Claude Code… or any coding agent that can run shell commands". It drives the **Flagsmith CLI v2** and calls the Management API through `flagsmith api <path>`. [Agent prompt](https://docs.flagsmith.com/experimentation/set-up-with-a-coding-agent)
- **Install:** `curl -fsSL https://get.flagsmith.com | sh` or `brew install Flagsmith/tap/flagsmith`, with `npm install -g @flagsmith/cli` "only as a fallback".
- **Connect:** for Cloud the prompt asks you to run `flagsmith login` yourself, then it runs `flagsmith init --project <project> --environment <environment key>`. `flagsmith init` writes `flagsmith.json`, which is "safe to check in". [CLI](https://docs.flagsmith.com/integrating-with-flagsmith/CLI)
- **What it does:**
  - Asks what to test and what counts as success, and finds the code for both.
  - Checks SDK versions.
  - Checks that `GET api/v1/environments/<key>/warehouse-connections/` is not empty, and stops otherwise.
  - Creates the multivariate flag with `flagsmith feature create … --value control --enabled` and keyed variations with `flagsmith feature variant add … --key …`.
  - Creates the metric (`POST …/experiment-metrics/`) and the experiment (`POST …/experiments/`).
  - Shows the planned code changes and waits for confirmation, then instruments the code.
  - Starts the experiment (`POST …/experiments/<id>/start/`).
  - Offers a script that simulates "a few hundred users" and refreshes the results.
  - It says: "Don't use the Flagsmith MCP server: it can't start experiments." [Agent prompt](https://docs.flagsmith.com/experimentation/set-up-with-a-coding-agent)
- **The separate MCP server:**
  - Install with `claude mcp add --transport http flagsmith https://mcp.flagsmith.com`, then `/mcp` for OAuth. Headless clients can send `Authorization: Api-Key <key>` instead.
  - Its tools include `create_feature`, `create_feature_multivariate_option`, `create_project_segment`, `create_segment_override`, `update_feature_state`, `create_metric`, `create_experiment`, `get_experiment_results` and `get_experiment_exposures`. There is no start tool.
  - The old Gram-hosted server was due to shut down on 30 June 2026. [MCP server](https://docs.flagsmith.com/integrating-with-flagsmith/mcp-server)
- **Use for Jashn:** run the prompt after 09:00 in the speech-and-flags worktree to create the flag, metric and experiment, approving each step. That human approval step is the one Toggle Wars' agent track rewards. Have it instrument the code to match the design below, and bind its traffic script to the **Synthetic** environment only.

## Recommended Flagsmith design for Jashn

### Environments

| Environment | Used by | Warehouse | Experiment | Banner |
|---|---|---|---|---|
| Development | local dev, Vercel preview deployments, agent tests | managed | none (an A/A dry run is optional) | none |
| Synthetic | only `scripts/synthetic-setup-traffic` | managed | "setup_entry: SYNTHETIC, planted +10 pts" | purple, "SYNTHETIC: scripted traffic" |
| Production | Vercel production (the app judges see) | managed | "setup_entry: real new owners" | red, "PRODUCTION: real users" |

Each deployment receives its own `FLAGSMITH_SERVER_KEY`. The synthetic script reads a separate `FLAGSMITH_SYNTHETIC_KEY`, so it cannot hit Production by accident.

### Identity and traits (privacy first)

- **Identity:** `fsIdentity(userId)` (HMAC, stable across devices). Use it everywhere: server components, route handlers, server actions. This avoids the "unstable identifier" mistake.
- **Traits, all set server-side:**
  - `preferred_language` (`en`, `hi` or `hinglish`): persisted.
  - `role` (`owner` or `manager`): transient.
  - `is_internal`: transient, from an allowlist environment variable naming the team's and demo accounts' user IDs.
  - `is_first_wedding`: transient.
- **Never sent:** names, phone numbers, emails, amounts or any guest data. **Guests are never identified to Flagsmith.** Guest pages make no Flagsmith call.
- **Flags never decide authorisation.** Money and guest privacy stay in server checks and the database. The segments doc warns against segments for access control. [Segments](https://docs.flagsmith.com/flagsmith-concepts/segments/)
- **One-time hardening at 09:00:** in every environment, turn off "Persist traits when using client-side SDK keys", and leave "Hide Sensitive Data" off so `reason` is still returned. [Security](https://docs.flagsmith.com/administration-and-security/governance-and-compliance/security)

### Flags

| Flag | Type and values | Environment default (Prod / Dev) | Targeting | Code path it guards |
|---|---|---|---|---|
| `voice_mode` | boolean, server-side only | **off** / on | Overrides: `internal_testers` → on; `voice_pilot` → on | Renders the persistent mic (the layout server component passes a prop). `/api/voice/*` returns 403 `voice_unavailable` when off. If Flagsmith is unreachable (`isDefault`), only `is_internal` users keep voice. |
| `voice_writes_enabled` | boolean **kill switch**, server-side only, tags `protected` and `kill-switch` | on / on | none (option: an override on `lang_hi_hinglish` → off for a targeted pause) | Confirming a voice proposal. When off, the server writes nothing and returns 423 `voice_writes_paused` plus a prefilled form. Also pauses new experiment enrolment. |
| `setup_entry` | **multivariate** string. Control value `form_first`; one variation with key and value `voice_first` | enabled; the split is set by the experiment | Experiment rollout 100%, 50/50; audience `new_owners` if the wizard offers it. **No identity overrides.** | Which input `/weddings/new` opens first. Both arms can switch input. The exposure is recorded here. |
| `voice_tts_enabled` | boolean (**Sarvam design**, from research-sarvam.json) | on / on | optional language override | Bulbul's short spoken reply after a saved action or an answer |
| `stt_mode` | remote config string (**Sarvam design**: `codemix` or `translit`) | `codemix` | optional `lang_hi_hinglish` override, if the Sarvam owner wants one | The Saaras request mode |
| `image_extraction_provider` | remote config string (**Sarvam design**: `docai`, `gemma4` or `off`) | `docai` | none | "Read an existing invitation". `off` hides it and leaves manual entry. |
| `card_export_fault_once` *(optional; agree with the NudgeBee owner first)* | boolean | off | an identity override for the fictional demo wedding only | The export worker fails the first attempt of a job exactly once, giving NudgeBee a real failure to recover |

Astra's `spoken_replies` is dropped because it duplicates Sarvam's `voice_tts_enabled`. Astra's `voice_pilot` becomes the rollout **segment**. Astra's names `setup_entry`, `setup_saved` and `voice_writes_enabled` are kept.

### Segments (project-level; rules evaluated top to bottom)

| Segment | Rules | Used by |
|---|---|---|
| `internal_testers` | `is_internal` = `true` | `voice_mode` on, always (team and demo accounts Mira and Diya) |
| `voice_pilot` | `role` In `owner,manager` → `preferred_language` In `en,hi,hinglish` → `% Split` 10 (then 50, then 100) | `voice_mode` on: the gradual rollout |
| `new_owners` | `role` = `owner` → `is_first_wedding` = `true` → `is_internal` = `false` | The experiment audience, if offered (the live API allows one segment). The app gate mirrors it either way. |
| `lang_hi_hinglish` | `preferred_language` In `hi,hinglish` | `stt_mode` override and an optional targeted pause of voice writes |

Override order on `voice_mode`: `internal_testers` first, then `voice_pilot`. Precedence follows the docs: identity override, then segment override, then the default. [Segments](https://docs.flagsmith.com/flagsmith-concepts/segments/)

### The one real experiment: "Setup entry, voice-first vs form-first"

- **Hypothesis** (Flagsmith's format: the change, the metric, the size, the timeframe): "Opening new-wedding setup on the microphone will raise the share of new owners who save a reviewed wedding by at least 10 percentage points on 25 Nov 2026, without making setup slower."
- **Variants:** control `form_first` and treatment `voice_first`, 50/50, rollout 100% of eligible owners. Branch on `flag.variant`, not on the value. [PayPal example](https://docs.flagsmith.com/experimentation/example-paypal-button)
- **Eligibility** (the app gate, mirrored by the `new_owners` audience): role is owner, this is their first wedding, not internal, `voice_mode` is on, and `voice_writes_enabled` is on. Enrolment therefore pauses during a kill-switch incident.
- **Exposure:** recorded where the owner actually sees the variant. The `/weddings/new` server component evaluates once with `flagsFor`. If the owner is eligible and the flag passes the checks `getExperimentFlag` makes (`enabled`, `experiment?.inExperiment`, a `variant`), it calls `flagsmith.trackExposureEvent('setup_entry', { identifier: fsIdentity(id), value: flag.variant, metadata: { experiment_id: flag.experiment.id } })` and then `flushLater()`. This does the same thing as `getExperimentFlag` without a second request. Keep links to the page on `prefetch={false}`. Re-renders are safe because exposures are deduplicated.
- **Conversion:** recorded in the `saveReviewedWedding` server action, **after the database transaction commits**. Both arms use the same action and the same identity. Fire only for the owner's first wedding: `flagsmith.trackEvent('setup_saved', { identifier, value: Math.min(secondsSinceSetupOpened, 3600) })`, then `flushLater()`. Store `setup_opened_at` on the draft when it is first rendered.
- **Metrics:**
  - **Setup saved**: Occurrence of `setup_saved`, expected to increase. This is the primary metric.
  - **Seconds to save**: Mean of the `setup_saved` value, should not increase. This is the guardrail. If the wizard will not attach two metrics to one event, send a separate `setup_save_seconds` event.
  - *Optional:* **Forced fallback to typing**: Occurrence of `voice_forced_fallback`, informational. Fire it where speech recognition fails and the UI switches the owner to typing.
- **Reporting the sample size honestly:**
  - Show the real `n` per arm from Production's Exposures panel, plus real saves.
  - Say "Flagsmith withholds statistics below 50 identities and 5 conversions per arm; we claim nothing."
  - Give a yardstick computed by us, not by Flagsmith: detecting +10 points from about 50% needs **about 385 owners per arm** (two proportions, α = 0.05, power 0.8).
  - Run **synthetic traffic only in the Synthetic environment**: 400 identities `synthetic-0001…0400`, trait `traffic=synthetic`, conversion probabilities **planted at 0.50 and 0.60** with a fixed random seed. Show it under the purple banner as "this tests the instrument, not the product".
  - Put the same labels in the README and the video caption.

```ts
// scripts/synthetic-setup-traffic.ts (sketch). Uses FLAGSMITH_SYNTHETIC_KEY only.
for (let i = 1; i <= 400; i++) {
  const id = `synthetic-${String(i).padStart(4, '0')}`
  const flag = await fs.getExperimentFlag('setup_entry', id, { traffic: 'synthetic' })   // records the exposure
  if (rng() < (flag.variant === 'voice_first' ? 0.60 : 0.50))                           // PLANTED, disclosed
    fs.trackEvent('setup_saved', { identifier: id, value: 60 + Math.floor(rng() * 240) })
}
await fs.close()   // fine here: the script is a short-lived process
```

### Kill switch: voice writes off, typing still works

1. A spoken change becomes a **proposal** with `source: 'voice'` and an idempotency key. Nothing is written yet.
2. The confirm route or server action evaluates `voice_writes_enabled` **on the server, at confirm time**.
   - If off: write nothing and return `423 {status: 'voice_writes_paused', openForm, prefill}`.
   - The UI shows "Voice changes are paused. Check the details and save by typing", and opens the same draft in the form.
3. Forms call **the same domain services** (ledger correction, event update) and never check this flag. Typing keeps working.
4. Voice questions (read-only) keep working, so the mic shows "Questions only". Spoken replies still follow `voice_tts_enabled`.
5. Do not put change requests on this flag: a kill switch must be instant. Tag it `protected` and set it server-side only.
6. *Optional:* an environment webhook (`FLAG_UPDATED`, HMAC-verified) on `/api/webhooks/flagsmith` writes the owner-visible notice "Voice changes paused by the operator at 16:41 (Flagsmith)". This makes the change auditable inside Jashn even if the Free-plan Audit Log is empty. [Environment webhooks](https://docs.flagsmith.com/administration-and-security/platform-configuration/environment-settings)
7. If Flagsmith is unreachable, the flag fails open (`true`), because every voice write still needs human confirmation. Flipping the switch only matters when Sarvam is failing, and Flagsmith is up in that case.

### Gradual voice rollout

| When (IST) | `voice_mode` in Production | Gate before the next step (app data from the `voice_attempts` table) |
|---|---|---|
| ~11:30 | `internal_testers` only | Pilot attempts work on both devices |
| ~12:30 | `voice_pilot` at **10%** | ≥20 pilot attempts, ≤1 forced fallback, **0 unconfirmed writes** (astra's gate) |
| ~14:00 | **50%** | Same gate again |
| before 16:15 | **100%** of eligible languages | Ensures judges' fresh accounts get voice. Record each step's time in the README. |

Raising the split keeps earlier members in, which is documented for a single split rule and follows from the hash of segment and identity. Test T9 checks it. [Rule operators](https://docs.flagsmith.com/flagsmith-concepts/segments/segment-rule-operators) · [Rollout by %](https://docs.flagsmith.com/managing-flags/rollout/rollout-by-percentage)

### Making Flagsmith visible inside Jashn

- **Flag drawer** (owners and internal users only, opened from a footer chip). It lists each flag's `enabled`, value or variant and **`reason`**, for example `TARGETING_MATCH; segment=voice_pilot`, `SPLIT; weight=50` or `DEFAULT`, and marks `isDefault` as "fallback". This follows the organisers' blog, which prints the served variation. [models.ts reason doc](https://github.com/Flagsmith/flagsmith-nodejs-client/blob/main/sdk/models.ts) · [A/B blog](https://www.wemakedevs.org/blogs/how-to-run-a-real-ab-test-with-flagsmith-experimentation)
- **Activity notice** from the environment webhook (optional, see above).
- **Optional experiment card:** a server route reads `GET /api/v1/environments/{env}/experiments/{id}/exposures/` with the organisation API key, which is not billable. It shows the counts per arm and the "as of" time next to Jashn's own count of saves. The JSON shape is unknown; inspect it at 09:00. [Swagger](https://api.flagsmith.com/api/v1/swagger.json)

### How this fits with the Sarvam flags (no overlap)

| Situation | `voice_mode` | `voice_writes_enabled` | `voice_tts_enabled` | `stt_mode` / `image_extraction_provider` |
|---|---|---|---|---|
| Normal | on (by segment) | on | on | `codemix` / `docai` |
| Speech-to-text mishears amounts | on | **off**: questions only; changes go through typing | unchanged | maybe switch `stt_mode` (outside the experiment window) |
| Spoken replies slow | on | on | **off** | unchanged |
| Image reading failing | unchanged | unchanged | unchanged | `image_extraction_provider=off` |
| Sarvam fully down | **off** (no mic) | n/a | n/a | n/a |

Don't change `stt_mode` in Production while the experiment runs. It would change the treatment. If you must, note the time.

### Build order after 09:00 (rough agent time)

1. Dashboard work, 15 min: create the flags, segments and overrides above, plus banners and trait settings. Run Flagsmith's agent prompt for the flag, metric and experiment.
2. `lib/flags/server.ts` and the identity helper, 15 min.
3. Kill-switch enforcement and the prefilled-form fallback, 30 min.
4. Exposure and conversion wiring with `after()` flushing, 20 min.
5. Synthetic script, 15 min.
6. Flag drawer, 15 min.
7. *(Optional)* Webhook to activity notice, 25 min.

Start the Production experiment only after the instrumented build is deployed.

### The 60-second demo beat (real numbers go in the ⟨ ⟩ slots; never invent them)

Setup: two tabs. One is Jashn signed in as Mira (Production). The other is the Flagsmith dashboard (Production, red banner).

| Clock | Screen | Line |
|---|---|---|
| 0:00–0:08 | Jashn flag drawer: `voice_mode on (⟨reason⟩)`, `setup_entry ⟨variant⟩ (not enrolled: internal)`, `voice_writes_enabled on` | "Flagsmith decides who gets voice, how setup opens, and whether voice may write." |
| 0:08–0:24 | Flagsmith › Experiments › Production: Exposures panel. Then switch the environment to Synthetic (purple banner). | "Real new owners today: ⟨n1⟩ voice-first, ⟨n2⟩ form-first, ⟨k⟩ saves. Flagsmith withholds a verdict below 50 per arm, and so do we. This environment is 400 scripted owners with a planted ten-point effect: ⟨lift⟩, interval ⟨a⟩ to ⟨b⟩, ⟨p⟩% chance. That proves the plumbing, not the product." |
| 0:24–0:46 | Toggle `voice_writes_enabled` off. Back in Jashn (refresh on focus), speak a change to an open draft, press Confirm, see the paused banner and the prefilled form, then Save | "Suppose speech starts mishearing amounts. Voice can still answer, but it can't write. Mira finishes the same change by typing, and the history keeps it." |
| 0:46–0:55 | Flagsmith › Segments › `voice_pilot` (% split) and the rollout times in the activity notice or README | "Voice went 10, then 50, then 100 percent, each step gated on 20 pilot attempts with at most one fallback and zero unconfirmed writes." |
| 0:55–1:00 | Toggle voice writes back on | "Take Flagsmith out and none of this works. It's the mechanism, not a wrapper." |

**25-second video cut:** drawer (3 s), Production then Synthetic experiment (9 s), kill switch to typed save (13 s).

**Where to flip the switch:** in Production (a few seconds, logged by the webhook notice) or, as astra-plan has it ("in rehearsal"), on a preview deployment bound to Development. Decide at the 14:45 rehearsal. Use a different change from the main script's "chaalis hazaar" correction so the balances stay consistent.

**Don'ts:**
- No identity overrides on `setup_entry`, and no weight or rollout changes mid-experiment. Never toggle "Use Consistent Hashing" in Environment Settings: it re-buckets variants and % splits ([Environment settings](https://docs.flagsmith.com/administration-and-security/platform-configuration/environment-settings)).
- Don't end an experiment before recording it, because it cannot be restarted.
- No local evaluation on Vercel, and no `close()` per request.
- No secrets in `NEXT_PUBLIC_` variables.
- No "winner" claims.

## What the user should do tonight (about 15 minutes, no code)

1. Open https://app.flagsmith.com/ and **sign up**. Create an **organisation** with any name and leave the plan on **Free**. Remember Free has 1 team member, so the lead operates the dashboard.
2. **Create a project** with any name. Confirm that `Development` and `Production` appear. [Quick start](https://docs.flagsmith.com/getting-started/quick-start)
3. In the environment menu, choose **Create Environment** and name it `Synthetic`. Leave it empty.
4. In **each** of Development, Synthetic and Production:
   - Go to **Environment Settings › Warehouse**, select **Flagsmith**, click **Enable**, and confirm.
   - Click **Send your first event**. Keep the tab open for about a minute, then write down the status and time. Expect Pending Connection, then Connected; this can take up to a few hours. If the card already shows Connected (the organisers' blog says the managed warehouse "is already wired up"), just record that. [Connect a warehouse](https://docs.flagsmith.com/experimentation/connect-a-warehouse)
   - In Environment Settings, **create a Server-side Environment Key** (`ser.…`) and save it in your password manager as `FLAGSMITH_SERVER_KEY_DEV`, `_SYNTH` or `_PROD`. Also note each environment's **client-side key (environment ID)**: the Management API path `/environments/{environment_api_key}/` uses it, and it is not secret. [Server SDKs](https://docs.flagsmith.com/integrating-with-flagsmith/sdks/server-side) · [Swagger](https://api.flagsmith.com/api/v1/swagger.json)
5. Click the **organisation name** in the top navigation, open **API Access**, click **Create API Key** (admin), and save it as `FLAGSMITH_ORG_API_KEY`. The 09:00 checks and the results reads use it. [Management API auth](https://docs.flagsmith.com/integrating-with-flagsmith/flagsmith-api-overview/management-api/authentication)
6. **Look, but don't build.** Write yes or no for each:
   - (a) the left navigation shows **Experiments** and **Metrics**
   - (b) the **Audit Log** shows the "environment created" entries
   - (c) Environment Settings has **Webhooks**
   - (d) the organisation **Usage** page shows the 50,000 limit
   - (e) a **trial** is offered, and whether it needs a card
   These close Unknowns U4–U5 below.
7. If any warehouse still says Pending at 08:30, post in the Flagsmith Discord (https://discord.gg/hFhxNtXzgm, linked from the [FestiveHacks resources page](https://www.wemakedevs.org/hackathons/festivehacks/resources)) and ask again at the **11:00 Flagsmith sponsor demo**.
8. Optional tooling, which is not project code: `brew install Flagsmith/tap/flagsmith`, then `flagsmith --version` should print v2.0.0. [CLI](https://docs.flagsmith.com/integrating-with-flagsmith/CLI)
9. **Do not** create flags, segments, metrics, experiments or webhooks, and do not run SDK code. Never paste a key into a repo, chat or document.

## Tests to run at 9:00

| # | Test | Pass | If it fails |
|---|---|---|---|
| T1 | Warehouse status in each environment: `curl -s -H "Authorization: Api-Key $FLAGSMITH_ORG_API_KEY" https://api.flagsmith.com/api/v1/environments/<client-side env key>/warehouse-connections/` | `"status":"connected"` and `total_events_received` ≥ 1 | Send the test event again, ask at 11:00, then follow risk R1 |
| T2 | SDK smoke test from a deployed `/api/flags/health` route (Development key): `getIdentityFlags('probe-01', {preferred_language:'en'})`, printing `allFlags()`, `reason` and `isDefault` | `isDefault=false`, `reason` present, p50 latency noted (my target is <300 ms) | Check the key type, region and timeout |
| T3 | Time from flip to effect: toggle a Development flag and poll `/api/flags/health` every second | ≤10 s | Demo with an explicit refresh and say so |
| T4 | Exposures on both arms: experiment in Synthetic, 40 scripted identities, then `close()` | Both arms above zero, split roughly 50/50, within 5 minutes of connection | Check variation keys, identity and warehouse |
| T5 | Conversions: the same run sends `setup_saved`; refresh results (at most every 5 minutes) | The metric counts conversions per arm ("Collecting data" is fine) | Check that the event name matches exactly |
| T6 | Serverless flush: a preview route calls `trackEvent('flush_probe')` and `after(flushEvents)` | The warehouse card's event total goes up | Make the flush blocking (`await flushEvents()`) before responding |
| T7 | One flag, two environments: start the Synthetic experiment, then create the Production one on `setup_entry` (the API says "Only one active experiment per feature is allowed") | Both are allowed | Finish the Synthetic run before 12:15 and **end** it (results stay frozen and visible), then start Production in astra-plan's 12:15–13:00 slot |
| T8 | Does the wizard offer an experiment audience? | If yes, set `new_owners` | Rely on the app gate |
| T9 | Rollout determinism: 20 `probe-NN` identities; `voice_pilot` at 10% then 50% | Everyone on at 10% is still on at 50% | Use a single split rule and move the language filter into its own segment |
| T10 | Fallbacks: a preview deployment with an invalid key | Pages render, the drawer shows "fallback", form-first, no exposure, events dropped (401) | Fix `defaultFlagHandler` |
| T11 | Kill switch end to end on laptop and phone: voice proposal, flip off, confirm | 423, **nothing written** in the database, typed save updates the balance exactly once | Treat it as a blocker before the demo |
| T12 | Free-plan checks: Audit Log entries, Webhooks tab, then the HMAC-verified webhook to a notice | Each answered yes or no | No webhook: show the rollout times from the README |
| T13 | `next build` route table | Every flag-reading route is dynamic (ƒ) | Read the session or call `await connection()` |
| T14 | Prefetch: visit pages that link to `/weddings/new` without opening it | No exposure for that probe identity | Use `prefetch={false}`, or move the exposure to a mount-time server action |

## Risks

| # | Risk | Trigger | Mitigation |
|---|---|---|---|
| R1 | Warehouse never reaches Connected | T1 fails, still Pending at 12:30 | Show real SDK exposures from server logs plus app-database counts, labelled. Run the synthetic experiment on local Docker Flagsmith (the Flagsmith database "shows Connected straight away") and label it "local self-hosted". [Self-hosting](https://docs.flagsmith.com/experimentation/self-hosting) |
| R2 | Events lost on serverless | T6 fails | `after(() => flushEvents())`, or await it before responding. Never `close()` per request. |
| R3 | A wrong key silently stops all events | 401/403 in logs | Check events in T2, T6 and T10. One key per environment, named clearly. |
| R4 | Exposure integrity: one side only, prefetch, internal testers, re-bucketing | T4, T14 | One `fsIdentity`, eligibility gate, `prefetch={false}`, no overrides or weight changes on `setup_entry` |
| R5 | The experiment is locked and ending it is irreversible | Ending by mistake | Decide variants and metrics before starting. The API has `pause`, with unknown semantics. |
| R6 | Kill-switch flips arrive late (Edge API propagation, no real-time on Free) | T3 over 10 s | Server-side enforcement at confirm time plus refresh on focus. Say "after a refresh" honestly. |
| R7 | Flagsmith slow or down | Timeouts | 2 s timeout, 1 retry, `defaultFlagHandler`, and "fallback" shown in the drawer |
| R8 | Free-plan limits: 1 seat, audit log probably empty, no scheduled flags or change requests | Checks 6a–e tonight | The lead runs the dashboard. Webhook notices or README timestamps replace the audit log. Nothing in this design needs a paid feature. |
| R9 | Beta churn: docs and both SDKs changed on 23 Nov | Odd behaviour | Pin `@flagsmith/nodejs@9.5.0`. Keep this file's links to re-check. |
| R10 | Synthetic data mistaken for real | Any slide or video | A separate environment, purple banner, `synthetic-` IDs, "planted" in the caption and README |
| R11 | Rule 4 perception | A judge asks | The README line above. Nothing project-specific existed before 09:00. |
| R12 | Flags frozen at build time | T13 | Dynamic routes only |
| R13 | Privacy | Traits or event payloads | Minimal non-personal traits. Guests are never identified. No amounts or names sent. |
| R14 | 50k request budget | Polling or loops | About one request per page view or action. No `startListening`. The synthetic run costs about 400 requests. |

## Unknowns (verify; don't assume)

- **U1. Real ingestion latency.** The docs give only "up to a few hours" for the first event. Steady-state latency after Connected is inferred at about a minute, from the agent prompt.
- **U2. Whether Pending Connection blocks** creating or starting an experiment. The docs only say the connection "must be in place".
- **U3. Whether one flag can run experiments in two environments at once.** The docs say "A flag can only be in one active experiment at a time", and the API says "Only one active experiment per feature is allowed" ([Swagger](https://api.flagsmith.com/api/v1/swagger.json)). T7 settles it.
- **U4. Whether the Cloud wizard exposes an Audience.** The live API has `audience` (one segment), but the docs never mention it. Also whether Experiments and Metrics appear for a new Free organisation without opting in. The blog says "the managed one is already wired up".
- **U5. Free plan details:**
  - audit-log visibility (code says 0 days)
  - whether environment webhooks are included
  - whether a trial needs a card
  - whether a teammate could get access without a paid seat
- **U6. Edge API propagation delay** after a dashboard toggle. Not documented.
- **U7. Billing for events:** whether calls to `events.api.flagsmith.com` count toward the 50k requests (it is not in the billable list), and whether synthetic identities count toward "users in experiments" (100k on Free, so irrelevant here).
- **U8. JSON shapes** of `results` and `exposures`. The schema labels both loosely as "Experiment".
- **U9. What `pause` does**, and whether a paused experiment can resume.
- **U10. Remote evaluation `reason` strings.** The engine code shows `TARGETING_MATCH; segment=…`, `SPLIT; weight=…`, `DEFAULT` and `STATIC`. The API's strings are unconfirmed.
- **U11. Whether two metrics can share one event**: Occurrence and Mean on `setup_saved`.
- **U12. Documentation conflicts**, recorded above:
  - scheduled-flags plan
  - Node 18 vs 20
  - compose with ClickHouse vs the Flagsmith database
  - the pricing card vs the matrix for A/B testing and integrations
- **U13. Whether FestiveHacks' Flagsmith judges use Toggle Wars' scorecard.** Nothing is published for FestiveHacks.
