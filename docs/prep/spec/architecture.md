# Jashn: technical architecture

Prep note written at about 03:30 IST on Wed 25 Nov 2026, before FestiveHacks coding starts at 09:00, and revised at about 04:00 to match `flagsmith.md` (03:43) and `export-and-recovery.md` (03:49). It is notes only (Rule 4): prose, tables, lists, one directory tree, three short JSON examples of HTTP payloads, and setup shell commands, each block labelled "Run at 09:00 or later". It contains no application code, SQL or config files.

**Status: binding** for the runtime layout, the folder tree and file ownership, environment variable names, the delivery process and the fallback triggers. Four other specs win on their own names:
- `spec/domain-and-data.md`: tables, columns, commands, read models, errors and payloads;
- `spec/flagsmith.md`: flags, traits, segments, events, metrics and identities;
- `spec/doc-ai.md`: the card-import routes and table (Should #11);
- `spec/export-and-recovery.md`: the export routes, job states and timers, the ops JSON, the drill and the NudgeBee workflow.

This file supersedes `research-stack.md` where they differ: §4 (the Flagsmith packages), §5 (the lane rules and AGENTS.md rule 10), §6.1 and §12 (env var names), §6.5 (the Realtime doorbell), §9 (the ops paths and the 409 response) and §11 (the repo-creation step, the branch names, the Vercel CLI steps and the env loop). Section 9 lists what domain-and-data.md must change to match, and section 11 what the other specs must change.

Read with: `scope.md`, `research-stack.md`, `research-flagsmith.md`, `research-nudgebee.md`, `research-sarvam.md`, `demo-data.md`, `demo-script.md`, and in `spec/`: `domain-and-data.md`, `flagsmith.md`, `doc-ai.md`, `export-and-recovery.md`, `acceptance.md` and `voice.md`.

Fact-checked at about 04:50 against the four research notes and against `flagsmith.md` (04:42), `export-and-recovery.md`, `doc-ai.md` and `voice.md` (04:43). Sections 10 and 11 record what that pass settled.

Laptop facts checked at 02:50 IST (read-only):
- Node v24.19.0, npm 11.17.0, gh 2.105.0, cloudflared 2026.11.2, psql, Google Chrome and Docker.app are installed.
- **The Vercel CLI runs as `npx vercel@66.6.0`** (no global install) and is already logged in as omiiii21 (checked 05:00, decision D5).
- gh is logged in to two accounts, and the **active one is another account, not `omiiii21`**.
- The repo already exists: `origin` is github.com/omiiii21/Jashn, and `main` has 3 commits.
- The repo's own git config already contains a credential helper that authenticates `git push` as `omiiii21`.
- The commit-msg hook is installed in `.git/hooks`.

---

## 0. Decisions at a glance

1. **One app, one region.** One Next.js 16.4.6 app on Vercel Hobby, with functions in `bom1` (Mumbai) on Node 24.x. One Supabase Free project in Mumbai provides Postgres, Auth and Storage.
2. **The browser never talks to the database.** Every read and write runs in server code: Drizzle 0.45.4 on postgres 3.4.9, against tables in the Postgres schema `app`, which Supabase's Data API does not expose.
3. **One guard.** Every command goes through the dispatcher (`applyAction`, Lane A), and the dispatcher calls the guard in `src/server/authz` first (research-stack's `requireMember`, plus its guest and ops counterparts). Every read model calls the same guard. It knows three kinds of actor: a **member** (Supabase session), a **guest** (a household link token) and **system** (the ops bearer token NudgeBee uses).
4. **No RLS policies and no Realtime.** RLS is switched on with zero policies, as a deny-all backstop for the API roles. Live updates come from polling plus `router.refresh()`: planner screens poll a version number every 2.5 s, the guest page polls its revision every 10 s, and every screen also refreshes when its tab regains focus. `/setup` is the one exception: no poll and no focus refresh (decision D79).
5. **Stored files never pass through a Vercel function.** Two private buckets, `uploads` and `exports`, with signed upload URLs and short-lived signed download URLs. Two inputs that are never stored do go through a route handler, straight on to Sarvam: voice audio (at most 2 MB) and the printed-card photo for Should #11 (at most 4 MB). Server actions never carry files.
6. **Card export.** Chromium (puppeteer-core 25.11.0 + @sparticuz/chromium 153.0.0) runs in one route only, the internal worker `POST /api/ops/export-jobs/[job_id]/run`. Every command that queues a job kicks it after commit, whichever transport ran the command (export-and-recovery.md 3.2). The next/og renderer ships dormant in the 11:40 batch, with Chromium still selected. If Chromium hasn't worked on production by 12:15, the user flips `card_renderer` to `og` (Latin-only text) with no deploy (decision D48).
7. **Flagsmith.** `@flagsmith/nodejs` 9.5.0 on the server only, with remote evaluation and no browser SDK. Names and behaviour: `spec/flagsmith.md`.
8. **NudgeBee** calls `GET /api/ops/export-jobs/{job_id}` and `POST /api/ops/export-jobs/{job_id}/retry` on the production domain, with `Authorization: Bearer <JOBS_API_TOKEN>`. Every business state answers 200, because NudgeBee fails a step on any status of 400 or above (research-nudgebee F16). The retry answers within its `wait` window, at most 25 s.
9. **Env var names are the ones already in `.env.local`,** plus five new ones and a few per-worktree or optional ones (section 5). The lead adds three at 09:22; the user types `SEED_PASSWORD` and `INTERNAL_USER_EMAILS` at 09:27 (decision D118). Research-stack's names are retired. Worktrees get a copy of `.env.local` without the admin-only secrets.
10. **Branches and merges.** Short-lived topic branches named `lane-<session>-<topic>` (for example `lane-a-schema`, `lane-c-voice`, `lane-lead-contracts`), with one git worktree per session. Every change reaches `main` through a pull request, merged as a merge commit, in batches in the order A → B → C → D every 45–60 minutes. The contracts PR goes first.
11. **No Vercel preview deployments.** `vercel.json` switches Git deployments off for `lane-*`. Sessions test locally (with a tunnel for phones) before a merge, and on production after it. Production deploys from `main`.
12. **No AI tool names** in commits, PR titles, PR descriptions or branch names. AI assistance is disclosed in the README and on the submission form.
13. **Playwright 1.65.1 with `channel: 'chrome'`.** After each batch the lead runs that batch's staged production check (6.7). The connected demo-path spec runs from the 12:30 batch on, on the `e2e` sample copy only (decisions D46 and D54).

---

## 1. Stack and pinned versions

The lockfile is the real pin. Only the lead installs, at about 09:08 (7.2 step 4), and sessions run `npm ci`, never `npm install`. Versions were read with `npm view` on 25 Nov 2026; the four marked "checked 02:50" were re-read for this note.

### 1.1 Runtime dependencies

| Package | Exact version | Purpose | Source |
|---|---|---|---|
| next | 16.4.6 | Framework: App Router, Node runtime, Turbopack, `src/` directory, Cache Components off | research-stack §2, §4 |
| react, react-dom | 19.3.0 | UI. Template pin; don't take 19.3.1 mid-day | §4 |
| @supabase/supabase-js | 2.119.2 | Auth admin calls in the seed, Storage signing, and the browser's signed upload (its only browser use) | §4, §6.6 |
| @supabase/ssr | 0.12.7 | Cookie sessions in the proxy, server components, server actions and route handlers | §4, §6.3 |
| drizzle-orm | 0.45.4 | Schema and queries, using the core query builder. Not 1.0.0-rc.6 | §2, §4 |
| postgres | 3.4.9 | Postgres driver. Not 4.x: npm latest is 4.1.1 (checked 02:50), and 4.x breaks Drizzle | §2, §4 |
| zod | 4.6.7 | Command inputs and payload contracts | §4 |
| sarvamai | 1.1.22 | Speech-to-text and text-to-speech from the server; chat completions and Document AI use plain fetch | §4; research-sarvam §3.0 |
| @flagsmith/nodejs | 9.5.0 | Server-side flags, the kill switch, and experiment exposure and conversion events (published 23 Nov; 9.4.0 is the fallback pin) | research-flagsmith "SDK usage", spec/flagsmith.md 6.1; replaces §4's `flagsmith-nodejs` 8.1.2 and `flagsmith` 10.0.0 |
| puppeteer-core | 25.11.0 | Drives Chromium; targets Chrome 153. npm latest 25.18.1 targets a newer Chrome (checked 02:50) | §4, §7 |
| @sparticuz/chromium | 153.0.0 | Linux Chromium for Vercel. Not 158.0.0, published 24 Nov | §4, §7 |
| server-only | 0.0.1 | Build-time guard on everything in `src/server/` | §4 |
| @phosphor-icons/react | 2.1.10 | The locked icon family; it has a ₹ icon (published May 2025, checked 02:50) | design-direction §6 (not in research-stack) |

`shadcn init` and `shadcn add` install their own dependencies with caret ranges, and the lockfile then fixes them. Expect radix-ui 1.8.1, class-variance-authority 0.7.1, clsx 2.1.1, tailwind-merge 3.7.1, lucide-react 1.79.0, sonner 2.0.8 and tw-animate-css 1.4.0 (research-stack §4). Lucide stays inside the generated shadcn components; app code uses Phosphor only.

### 1.2 Dev dependencies

| Package | Exact version | Purpose | Source |
|---|---|---|---|
| typescript | 5.9.3 | Not 7.0.2, which has no JavaScript compiler API | §2, §4 |
| @types/node | 24.19.2 | Matches Node 24; the template has ^20 | §4 |
| @types/react, @types/react-dom | 19.3.1, 19.3.0 | | §4 |
| eslint, eslint-config-next | 9.39.5, 16.4.6 | Not ESLint 10 | §4 |
| tailwindcss, @tailwindcss/turbopack | 4.3.3, 4.3.3 | create-next-app's pins (4.3.4 had a CJS/ESM bug). No PostCSS config | §2, §4 |
| drizzle-kit | 0.31.11 | `generate` and `migrate` | §4 |
| @next/env | 16.4.6 | Loads `.env.local` in the Drizzle config and scripts | §4 |
| tsx | 4.23.15 | Runs laptop scripts | §4 |
| vitest | 5.1.1 | Unit tests: ledger, permissions, RSVP and retry idempotency | §4 |
| @playwright/test | 1.65.1 | Demo-path end-to-end test on the installed Chrome (published 13 Nov 2026, checked 02:50) | skills-toolkit §2 row 6 (not in research-stack) |

### 1.3 Tools and scaffold flags

| Tool | Version | State at 02:50 | Use |
|---|---|---|---|
| create-next-app | 16.4.6, via npx | – | Scaffold in a sibling folder (section 7) |
| shadcn CLI | 4.23.0, via npx | – | `init --base radix --yes --no-monorepo`, then `add` |
| Vercel CLI | 66.6.0, via npx | Not installed globally; `npx vercel@66.6.0` works and is logged in as omiiii21 (checked 05:00) | Never a project dependency. The user creates the project by the dashboard import (6.5). L adds the Production env vars with `vercel env add`, run from the empty scratch folder `~/jashn-vercel-cli` so it never touches the repo's `.env.local`; the dashboard is the fallback. Also terminal logs (decision D5) |
| gh | 2.105.0 | Installed; another account is active | Always with `GH_TOKEN` for omiiii21 (6.2) |
| cloudflared | 2026.11.2 | Installed | HTTPS quick tunnels to local dev servers |
| Node, npm | 24.19.0, 11.17.0 | Installed | `engines.node` is 24.x |
| psql | Homebrew build | Installed | The 09:25 pooler check (section 8) |
| Google Chrome | current stable | Installed | Local card export (`CHROME_EXECUTABLE_PATH`) and Playwright |

- **Fallback stack only:** better-auth 1.7.28, @better-auth/drizzle-adapter 1.7.28 and @vercel/blob 2.9.0 (research-stack §3).
- **Not used:** the Supabase CLI, Prisma, @react-pdf/renderer, react-query, Supabase Realtime and the Flagsmith browser SDK. Docker is used only for the NudgeBee kind fallback.

**create-next-app flags:** `--ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --no-cache-components --no-react-compiler --agents-md --no-agent-feedback --disable-git --skip-install --yes`.

**shadcn flags:** `--base radix` (shadcn's default became Base UI on 2026-07-02).

**Node 24:** set both `engines.node` = `24.x` in package.json and Node.js Version 24.x in the Vercel project settings. Vercel's default is 26.x.

---

## 2. Runtime layout

### 2.1 Which code runs where

| Layer | Runs on | What lives there | Rules |
|---|---|---|---|
| Proxy (`src/proxy.ts`, Lane A) | Node, in `bom1`, before each matched request | Supabase session refresh, nothing else | The matcher skips static assets, `/i/*`, `/api/i/*`, `/render/*`, `/api/ops/*`, `/api/health` and the version poll. Those routes do their own checks, and the poll must not pay for a session refresh every 2.5 s |
| Server components (pages and layouts) | A Vercel function per request | Every page read, through a read model (Lane A) that returns a role-shaped DTO; Flagsmith evaluation (Lane C), at most once per render | Always dynamic, because they read cookies or a token. Never `'use cache'`. No client-side fetching of page data |
| Server actions | The same function as the page | Planner form writes and the setup form, all through the one command action `dispatchCommand` (`src/server/actions/dispatch.ts`, Lane A), which server components pass to client forms as a prop (decision D98); Lane A's sign-in, sign-up and sign-out; the flag drawer's actions (Lane C) | Body at most 1 MB (Next's default), so never a file. They return the response envelope from domain-and-data §3.0. The client creates the idempotency key when the confirmation appears |
| Route handlers | Vercel functions | The two polls; voice (multipart audio, the spoken reply); card imports (multipart photo, Should #11); upload signing; guest RSVP and dietary; the export request and the owner's retry; the ops endpoints (NudgeBee's status and retry, and the internal export worker); the generic command route for tests; app health | Node runtime only. Explicit `maxDuration` (2.2). snake_case JSON. `Cache-Control: no-store` |
| `after()` work | The same invocation, after the response | The export kick and, inside the worker route, the render (2.3); the Flagsmith event flush; the NudgeBee failure webhook; the gemma4 card-reading call | Bounded by the route's `maxDuration`. On Vercel it uses `waitUntil` |
| Client components | The browser | VoiceDock (MediaRecorder and audio playback), forms, RSVP buttons, the LiveRefresh poller, the upload widget, the card-import sheet, studio controls, the flags drawer | They never import `src/server/`, `src/db/` or the admin Supabase client. They receive DTOs as props and reach the server only through server actions and `/api/*` |
| Laptop scripts | Node 24, via tsx | Migrations, the seed, the Flagsmith synthetic run | They never import a module that contains `server-only`. The seed writes rows directly, bypassing the dispatcher, by design |

### 2.2 Vercel region and the function limits that matter

**Hobby facts** (research-stack §2):
- Fluid compute with 2 GB of memory and 1 vCPU.
- 300 s default and maximum duration.
- 4.5 MB request and response bodies.
- 250 MB uncompressed bundle per function.
- One region: `bom1`, set by `regions` in `vercel.json`.
- 1 concurrent build, 100 deployments a day, and runtime logs kept for 1 hour.

| Path (owner) | Kind | `maxDuration` | Body | Why |
|---|---|---|---|---|
| `/api/voice/turn` (C) | Route | 60 s | Multipart audio. The client stops recording at 25 s; the route rejects anything over 2 MB or 30 s. Speech is about 0.1–0.5 MB, against Vercel's 4.5 MB cap | Sarvam speech-to-text (30 s audio limit), the model call and at most one fallback call (domain 3.8) |
| `/api/voice/confirm`, `/api/voice/cancel` (C) | Route | 30 s, 10 s | JSON | One dispatcher call per confirmed action |
| `/api/voice/turns/[voice_turn_id]/reply-audio` GET (C) | Route | 30 s | Streamed `audio/mpeg`, about 100 KB for 140 characters; 204 when `spoken_replies` is off | Passes Bulbul's chunked MP3 straight through (voice.md 0.2; flagsmith.md 3.3) |
| `/api/voice/turns/[voice_turn_id]/trace` GET (C) | Route | 10 s | JSON | The judge panel's data, for the speaker or an owner of the turn's wedding (voice.md section 8) |
| `/api/health` (L) | Route | 10 s | JSON | Liveness, the commit SHA and the `flags` self-check summary from Lane C's module. The scaffold PR ships liveness only (200 with the commit SHA); the contracts PR adds the `flags` summary from the stub, and `flags.ok` stays false until `lane-c-voice` merges at 10:45 (decision D12). Each instance serves the summary from a 60-second cache, so the public route costs at most one Flagsmith evaluation and one probe event per instance per minute (flagsmith.md 6.7) |
| `/api/card-imports` POST (C) | Route | 120 s | Multipart JPEG, at most 4 MB, re-encoded in the browser; never stored | Document AI submit, or the gemma4 call in `after()` (doc-ai.md 1.7) |
| `/api/card-imports/[import_id]` GET and DELETE, `.../apply` POST (C) | Route | 30 s | JSON | The sheet polls status every 3 s; Sarvam is asked at most every 2.5 s |
| `/api/w/[wedding_id]/exports` (D) | Route | 30 s | JSON | Runs `request_card_export` through the dispatcher; the kick follows after commit (2.3). No Chromium |
| `/api/w/[wedding_id]/exports/[job_id]/retry` (D) | Route | 30 s | JSON | The owner's Retry button: `retry_card_export` as the owner with `wait` 0, then the kick. No Chromium |
| `/api/ops/export-jobs/[job_id]` (D) | Route | 15 s | JSON | NudgeBee reads the job status, with an optional `wait` of 0–10 s |
| `/api/ops/export-jobs/[job_id]/retry` (D) | Route | 60 s | JSON. It answers after at most `wait` seconds (default and maximum 25; NudgeBee sends 20), reading the job row every 500 ms | NudgeBee's HTTP task timeout defaults to 30 s (research-nudgebee F15). No Chromium |
| `/api/ops/export-jobs/[job_id]/run` (D) | Route | 120 s | JSON; for the reserved id `probe`, a PNG of at most about 1.5 MB | The export worker: claims the job and renders it. **The only route that loads Chromium** (export-and-recovery.md 3.2, 3.3) |
| `/api/w/[wedding_id]/version` (A), `/api/i/[token]/revision` (D) | Route | 10 s | Tiny | The polls (2.4) |
| `/api/i/[token]/rsvp`, `/api/i/[token]/dietary` (D) | Route | 15 s | JSON | Guest commands |
| `/api/uploads/sign` (A) | Route | 10 s | JSON | Returns a signed upload URL |
| `/api/w/[wedding_id]/commands/[command]` (A) | Route | 30 s | JSON | Tests and scripts (domain-and-data §3.0) |
| `/render/card/[job_id]` (D) | Page | 30 s | HTML | The page Chromium loads (export-and-recovery.md 1.6) |

**Chromium:**
- Sparticuz recommends at least 1600 MB, and Hobby gives 2 GB.
- One browser per server instance, behind a module-level promise, and one export at a time. Concurrent launches inside one Fluid instance can fail with `spawn ETXTBSY` (research-stack §7).
- Puppeteer and Chromium are imported only in `src/server/export/`, by dynamic import, and only the `/run` route uses that module. Chromium (about 70 MB, research-stack §4) sits in that one function, so every other function stays small and starts fast.
- Each render has a 45 s cap inside a 2-minute lease (export-and-recovery.md 2.2).
- Next already keeps both packages out of the bundle (they are on its default server-external list, research-stack §7), so `next.config.ts` starts with no Chromium entry. If the 10:30 probe reports a missing Chromium file, the lead adds one file-tracing include for `/run` covering the Chromium package's `bin` folder (export-and-recovery.md 3.1).
- Cold-start time in `bom1` is unknown; the probe measures it and answers with timing headers. Warm up 5 minutes before each take: open every page, run the probe twice, then one export (export-and-recovery.md 3.4).

### 2.3 Work after the response, and the export kick

- **`after()`** runs work once the response has gone, inside the same invocation. On Vercel it uses `waitUntil` and is bounded by the route's `maxDuration`. It carries:
  - the export kick, when a command queued an export job (below);
  - inside `/run`, the render itself (export-and-recovery.md 3.3);
  - the NudgeBee failure webhook, which the worker sends after a failed attempt (export-and-recovery.md 2.8);
  - the Flagsmith event flush and the setup-saved conversion (flagsmith.md 5.4, 5.5);
  - the gemma4 card-reading call (doc-ai.md 1.7).
- **The export kick.** `request_card_export` and `retry_card_export` queue a job, whichever transport ran them: the exports panel, voice, NudgeBee or tests.
  - **The after-commit map** (decisions D53 and D101). The types (`AfterCommitHandler` and the map type) are in `src/contracts/services.ts`. The map itself is a static export in `src/server/jobs/after-commit.ts` (Lane D), which the contracts PR ships empty. Lane A's dispatcher imports it statically and runs the committed command's entry in `after()`. Lane D adds the export kick there once, in `lane-d-export-jobs` at 11:40. Nothing registers itself by an import side effect.
  - The kick is a POST to `/api/ops/export-jobs/{job_id}/run` with the ops bearer token.
  - Ordinary command responses send it in `after()`. It waits up to 5 s for the answer and logs a failure.
  - **The ops retry route is the exception.** When its outcome commits as `retried`, the route itself starts `/run` with a fire-and-forget request, before its wait loop begins. A kick left to `after()` would only start once the wait had ended. The dispatcher's `after()` kick from the map that follows is harmless: the claim is a compare-and-set, so the second call answers `started` "false" (export-and-recovery.md 5.3).
  - A lost kick is recovered when the job expires as `NOT_STARTED` after 60 s in `queued`, which makes it retryable (export-and-recovery.md 3.2).
- **Self-calls** (the kick, and Chromium opening the render page) use `https://` plus `VERCEL_PROJECT_PRODUCTION_URL` on Vercel, and `APP_BASE_URL` locally. Never `VERCEL_URL`, which Standard Protection covers.
- **Why one worker route:** a voice-requested export confirms in Lane C's route, which must not bundle Chromium, and one function is the one to warm (export-and-recovery.md 0.2).

### 2.4 Live updates: polling

| Screen | Endpoint | When it polls | On a change |
|---|---|---|---|
| Every planner screen under `/w/[wedding_id]`: overview, events, guests, money, vendors, activity, shagun and the invite studio | `GET /api/w/[wedding_id]/version` | Every 2.5 s while the tab is visible | `router.refresh()` when `version` moved. Also one `router.refresh()` whenever the tab becomes visible or gains focus, whatever the version |
| Guest site `/i/[token]` | `GET /api/i/[token]/revision` | Every 10 s while visible (domain 5.6) | `router.refresh()` when `revision` moved, and whenever the tab becomes visible or gains focus |
| `/setup`, `/login`, `/signup`, `/join/[token]`, the render page | None. `/setup` is the one exception to the planner polling rule (decision D79): no version poll and no focus refresh, so the experiment exposure isn't recorded again and the draft isn't disturbed (flagsmith.md 5.3) | – | – |

- **One poller per tab.** `LiveRefresh` (Lane A, `src/components/live/`) takes the endpoint and the interval as props. It is mounted once in the planner shell layout (Lane B) and once on the guest page (Lane D).
- **`router.refresh()` keeps client state,** so an open form or voice review card survives a refresh.
- **The version endpoint.**
  - It needs a member session for that wedding, and answers 401 or 403 otherwise. On a 401 the poller stops and calls `router.refresh()` once, which goes through the proxy, so the session is refreshed or the user is sent to `/login`.
  - It reads one row and evaluates no Flagsmith flags.
- **The revision endpoint.** It resolves the token exactly as the guest page does (3.4); an unknown or revoked token gets the same 404. It returns only the latest published revision number.
- **Guest rate limits and a 429** (decision D108). Lane A's one limiter (D57) allows, per token hash, about 120 GETs and 30 POSTs a minute, plus a loose 600 a minute per IP, so a shared venue Wi-Fi isn't blocked (domain 6.3; 3.4). After a 429 the guest poller backs off to 30 s and keeps showing the content it has (decision D90; domain 5.6).
- **What moves the version.** Every state-changing command increments `weddings.version` in its own transaction (domain-and-data L6). That includes guest RSVPs, publishes and proposal decisions, plus every export-job transition; the worker's claim moves it without an activity entry (export-and-recovery.md 2.1; Lane D's job module uses Lane A's helpers, 3.3). Reads, replays and `unchanged` outcomes don't move it.
- **Flags reach an open page through the focus refresh.** A flag flip doesn't move `version`, and the poll never calls Flagsmith. The refresh on focus re-renders VoiceDock with fresh flags, so switching back from the Flagsmith tab shows the new state. Every voice response also tells the dock whether writes are enabled, and the server enforces the kill switch on the next request whatever the page shows (flagsmith.md 6.9).
- **Other polls.** The card-import sheet polls its own status route every 3 s (doc-ai.md 1.7), and NudgeBee polls the ops status endpoint. The exports panel needs no poll of its own, because every job transition moves `version`.

Member poll response:

```json
{ "version": 1043 }
```

Guest poll response:

```json
{ "revision": 3 }
```

**How the owner sees the manager's change in time** (estimates):

| Step | Time after Diya taps "Save draft" |
|---|---|
| The command commits, and `weddings.version` goes up | about 0.2 s |
| Mira's next poll sees the new number | 0–2.5 s later |
| `router.refresh()` re-renders the activity feed and the events list | about 0.3–0.8 s |
| "Diya moved the reception from Banyan Hall to Lotus Hall" is on the laptop | **about 1–3.5 s in total** |

- The script gives this 10 s (1:02–1:12 in demo-script §2).
- Question #5, "Diya ne kya badla?", reads the saved records, so the spoken answer is right even if the screen lags.
- Tara's RSVP reaches the laptop (229 → 230) by the same path, in the same 1–3.5 s.
- Mira's publish reaches Tara's phone by itself within 12 s: one 10 s poll plus the refresh (decision D92). No note promises "within 10 s". The script has Tara refresh anyway (demo-script §2, 1:25).
- **Rehearsal bar:** under 5 s on the owner's screen, or the script switches to a manual refresh (section 8).
- **Cost:** about 35,000 invocations over 6 hours for 4 open planner screens, plus a quarter of that for each open guest page, against the 1,000,000 a month Hobby allows (research-stack §6.5). Polls never call Flagsmith; a planner page's focus refresh costs one evaluation from its 50,000-request budget (flagsmith.md 6.10).
- **No Realtime:** no browser Supabase client and no WebSocket. The doorbell in research-stack §6.5 is dropped.

---

## 3. Data access

### 3.1 Drizzle over postgres.js, from the server only

| Use | Env var | Supabase string | Driver settings |
|---|---|---|---|
| App at runtime (Vercel and every local dev server) | `DATABASE_URL` | Transaction pooler, port 6543 | Prepared statements off (transaction mode has none). Pool max 5, idle timeout 20 s. One client per server instance at module scope, cached on `globalThis` in dev |
| Migrations and seed (laptop only) | `DATABASE_URL_SESSION` | Session pooler, port 5432 | Defaults |

- **Hosts.** The direct database host is IPv6-only, so everything goes through the two poolers (research-stack §6.1).
- **The Drizzle config** (Lane A) points drizzle-kit at `DATABASE_URL_SESSION`, at `src/db/schema.ts` and the `drizzle/` folder, and limits it to the `app` schema, so drizzle-kit never touches `auth`, `storage` or `realtime`.
- **Migrations.** Only Lane A runs `db:generate` and `db:migrate`, reads the generated SQL, and commits `drizzle/`.
  - Nobody runs `drizzle-kit push`.
  - After 11:00, migrations are additive only (no renames, no drops).
  - Lane A applies a migration to the shared database as soon as it generates it, before the PR merges. Production and the other branches keep working, because the change is additive.
- **Transactions.** Every command runs in one Drizzle transaction. This works on the transaction pooler, because a transaction holds one connection until it ends.

### 3.2 The `app` schema, and why the browser never talks to the database

**What is set up:**
- Every application table lives in the Postgres schema `app` (domain-and-data 0.1). `public` stays empty.
- `app` is never added to the Data API's exposed schemas, and gets no grants to `anon` or `authenticated`.
- RLS is switched on with **zero policies** on every `app` table. This denies everything to the API roles. The server connects through the pooler as `postgres`, the owner of the `app` tables, so RLS doesn't restrict it. Nobody writes policies.

**Why the browser never talks to the database:**
1. **One enforcement point.** Forms, voice, the guest page and NudgeBee all pass the same guard, which is one testable module. Four sessions keeping RLS policies consistent would drift.
2. **The browser key is public.** It ships to every phone. Guests have no Supabase identity, and covering them with RLS would need anonymous sign-ins (rate-limited per IP) or custom JWTs (research-stack §6.4).
3. **Real transactions.** A payment correction writes the new version, supersedes the old one, and adds the activity entry, the receipt and the version bump atomically. supabase-js has no client-side transactions.
4. **Privacy by construction.** The guest view is an allowlist type with no money fields (G3). The browser only ever receives DTOs.
5. **Defence in depth.** Even a leaked browser key reads nothing: `app` isn't exposed, has no grants, and RLS denies by default.

**Check at 10:15 (Lane A).** A Data API request made with the browser key and asking for the `app` profile is refused, and `public` lists no tables.

### 3.3 Roles are enforced in one place: the guard every command runs through

- **Where it lives.**
  - The guard is `src/server/authz/` (Lane A).
  - The dispatcher is `src/server/commands/` (Lane A); research-stack calls it `applyAction`.
  - The role matrix, gated commands, owner-only commands and sharing flags are data in `src/contracts/permissions.ts`: domain-and-data 6.1, A1–A3 and G7.
- **Order of checks for every command.** This is domain-and-data §3.0, steps 1–7.
  1. Resolve the actor. A member comes from the session claims plus the `members` row for this wedding; a guest from the token (3.4); `system` from the ops token (3.7).
  2. Check the role against the matrix and the sharing flags. A manager on a gated money command gets `approval_required`.
  3. Validate the input with the command's zod schema from `src/contracts/commands.ts`, and check that every id belongs to this wedding and is visible to this actor.
  4. For voice: check that the turn belongs to the speaker and is under 10 minutes old. Then check the `voice_writes_enabled` kill switch, through the voice-gate interface in `src/contracts/flags.ts` that Lane C implements. The real gate fails closed (flagsmith.md 6.8). Until Lane C's real gate merges in `lane-c-voice` at 10:45, the contracts stub fails closed too: it refuses every voice write and never answers "enabled" (decision D47). At 11:15 the user turns `voice_writes_enabled` off and Lane C checks the deployed behaviour (right after the 11:40 deploy instead, if Lane C's pipeline splits; D121); after 12:30 the full kill-switch check runs (a pending voice write, one typed save and a read-only question; the typed save is an Events edit, such as a dress code, if the requirement form isn't merged, D114), then the flag is restored and the result logged for the README.
  5. Look up the receipt for the idempotency key. This is a fast path only. Keys are opaque text of 8–200 characters and are never validated as UUIDs (client UUID, `{uuid}:{index}`, `proposal:{proposal_id}`, `nb-{execution_id}-{job_id}`).
  6. Run one transaction: lock the `weddings` row first, re-check the receipt inside the transaction (a concurrent twin with the same key waits on that lock, then replays), lock the other rows, check expected versions, apply the change, write the activity entry, increment `weddings.version`, and write the receipt.
  7. After commit, run the side effects in `after()`: the export kick when the command queued a job (2.3), Lane C's setup-saved conversion when `set_wedding_profile` creates a wedding (flagsmith.md 5.4; from 10:45 the dispatcher calls the contracts PR's no-op stub, and Lane C replaces it with the real conversion in the 11:40 batch, decision D39), and the read models a spoken reply needs. The NudgeBee failure webhook is sent by the export worker after a failed attempt (export-and-recovery.md 2.8), not by the dispatcher.
- **Every transport calls the same dispatcher:**

| Transport | Actor | Owner |
|---|---|---|
| Server actions on planner and setup screens, all through `dispatchCommand` (D98) | Member (any signed-in user for the first `set_wedding_profile`) | Lanes B and C (screens), Lane A (`dispatchCommand`) |
| `POST /api/voice/confirm` | The member who spoke | Lane C |
| `POST /api/card-imports/[import_id]/apply` (`create_event` per function) | The uploader | Lane C (doc-ai.md 1.5) |
| `POST /api/i/[token]/rsvp` and `/dietary` | Guest household | Lane D |
| `POST /api/w/[wedding_id]/exports` (`request_card_export`) | Owner or manager | Lane D |
| `POST /api/w/[wedding_id]/exports/[job_id]/retry` (`retry_card_export`) | Owner | Lane D |
| `POST /api/ops/export-jobs/[job_id]/retry` (`retry_card_export`) | `system` ("NudgeBee") | Lane D |
| `POST /api/w/[wedding_id]/commands/[command]` (tests and scripts) | Member | Lane A |

- **Exports from any transport.** Voice and the generic command route may also run `request_card_export`; the kick after commit starts the worker wherever the command ran (2.3). The worker route `/api/ops/export-jobs/[job_id]/run` is not a transport: it claims and finishes jobs through Lane D's job module.
- **Command handlers.**
  - Lane A writes the handlers for every command except Lane D's four: `update_invite_style`, `publish_itinerary`, `request_card_export` and `retry_card_export`. Those live in `src/server/invite/handlers.ts`, which Lane A's registry imports. Any note that gives `publish_itinerary` to Lane A is wrong (decision D41).
  - `publish_itinerary` builds its snapshot with Lane A's pure builder in `src/db/itinerary-snapshot.ts` (A1, 10:45), the same one the seed uses for REV-1 and REV-2. Lane D never writes a second builder (decision D95).
  - Each handler receives the open transaction and the resolved actor. Handlers never resolve actors themselves.
- **The A-to-D handoff for 11:40** (decisions D41 and D102):
  - By 11:40 at the latest, merged ahead of Lane D in that batch, Lane A ships the Storage adapter and signing helpers (the `exports` bucket write and the signed download that Lane D's worker uses, plus upload signing), the guest token resolver, the `JOBS_API_TOKEN` system verifier, `reset_demo`, and A4: the draft venue change (`update_event`, ahead of its member-invite work) and the itinerary read model. Their signatures are typed in `src/contracts/services.ts` in the contracts PR, so Lane D builds against them from 10:00. Lane A may still ship any of them at 10:45.
  - Lane D owns the worker's upsert and size check, through that adapter. The couple-photo upload route and `add_asset` are Lane A's A6, at 12:30 (D121).
  - Lane D's four handlers and a reusable `PublishSheet` ship at 11:40. The sheet takes the reviewed `expected_draft_version` and a confirm callback. Lane B passes the planner action and Lane C the voice confirm, with exactly one write on either path. Lane C's export (I-02) and publish (E-05) by voice ship at 12:30 (decision D59).
  - **The day's key signal, at about 11:50,** after the 11:40 deploy, runs on Lane D's own pages, on production, on copy `d` (decision D107). Diya's `update_event` (reception to Lotus Hall) goes through `POST /api/w/[wedding_id]/commands/update_event`. Mira publishes through `PublishSheet` on Lane D's own Invite page (in `lane-d-publish`). Then the export job's PNG downloads. Lane B's Events screen isn't needed (B3 is 12:30). The card renders with or without the couple photo, so it passes either way.
  - The 12:30 batch carries Lane A's guest view and RSVP transaction, Lane D's guest page and routes, Lane B's visible RSVP count (the Guests reply table's totals and the vendor page's estimate headcount, both from `rsvp_totals`; D110) and the Must screens' minimums (D105). What 13:45 and 14:30 take is in 6.4 (D106).
- **Reads use the same guard.**
  - Every read model in domain-and-data §4 starts with the member or guest check and returns a DTO shaped for the role.
  - Voice answers (Lane C) use the same read models, so a manager's "What's our total budget?" is refused by the server (voice-test-set M-14), not by the model.
- **Writes outside the dispatcher (operational, server-only):**
  - Lane C writes `voice_turns`, `experiment_exposures` (flagsmith.md 5.10) and `card_imports` (doc-ai.md 1.8). Lane D writes `export_jobs` and `export_attempts`.
  - Whenever such a change must show on a screen, the owning module writes in a transaction that also calls Lane A's two helpers, append activity entry (`src/server/activity/`) and bump version (`src/server/live/`).
  - The append helper takes a finished entry. The export templates and their call sites live in Lane D's `src/server/jobs/` or `src/server/invite/`, and Lane D never edits `src/server/activity/` (decision D63).
  - No other code writes domain tables.
- **Flags never decide who may see or change what** (flagsmith.md 2.4). Flagsmith only switches features.
- **Lane A's tests (vitest):**
  - the permission matrix, including `approval_required` and the owner-only list;
  - the guest view type has no money fields;
  - an uninvited function is absent from the guest view;
  - a draft change is invisible until it is published;
  - an RSVP for an uninvited function returns 404;
  - a revoked token returns 404.

### 3.4 How guest tokens are resolved

- **The link.**
  - Each household has one active link, `/i/{token}`, stored in `invitation_links` (domain-and-data 6.3).
  - The token is 32 random bytes in base64url (43 characters), created by `create_invitation_links`.
  - Only its SHA-256 hash is stored, under a unique index. Revoking a link sets `revoked_at`.
- **Resolution** (the guest check, Lane A), in order:
  1. Check the format: 43 base64url characters.
  2. Hash the token with SHA-256.
  3. Look the hash up.
  4. Reject a revoked link.
  5. Return the actor: the wedding, the household and its guests.

  Any failure gives the same 404 body as a missing page (G5).
- **Who ships what, by batch** (decisions D57 and D102):
  - Lane A: `LiveRefresh` at 10:45, and the token resolver by 11:40 at the latest.
  - Lane A, A5 (12:30): the guest DTO, the revision read, the RSVP and dietary handlers, and the one rate limiter (D108).
  - Lane D (12:30): the guest page and its routes.
- **What the guest sees.**
  - The guest page (Lane D) renders the guest-view read model (Lane A).
  - That view is built from the publication whose revision equals `weddings.published_revision`, filtered to the functions the household's guests are actively invited to (P5, P10, R9). It never touches the draft tables.
- **Guest writes.**
  - Only the RSVP and dietary commands, through `/api/i/[token]/rsvp` and `/api/i/[token]/dietary`, with one idempotency key per press (R8). A guest token opens no other route (G4).
  - The limits are per token hash, about 120 GETs and 30 POSTs a minute, plus a loose ceiling of 600 requests a minute per IP on `/i/` and `/api/i/`, so a shared venue Wi-Fi is never blocked (domain 3.4, 6.3; decision D108). They are counted in memory per server instance: best effort against a stuck retry loop, not an exact limit.
  - Lane A owns the single rate limiter. Lane D calls it once per guest request and tests the 429s through its own routes (decision D57).
- **Seeded links.**
  - The seed creates random tokens once, prints the household links of each sample copy to the terminal, and writes them to the gitignored `demo-links.local.md`.
  - Rerunning the seed, and running `reset_demo`, keep existing link rows. Tara's link, bookmarked in Safari, survives every reset.
- **Headers.**
  - `/i/*`, `/api/i/*` and `/render/*` send `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex` and `Cache-Control: private, no-store`, set through `headers()` in `next.config.ts` (G6).
  - Guest pages load no Supabase client and no third-party script.
  - Tokens do appear in request paths in Vercel's runtime logs, which Hobby keeps for one hour. That is accepted (domain §8 question 3).

### 3.5 Member logins: Supabase Auth

- **Email and password only.** No magic links: the built-in mailer sends 2 emails an hour.
- **"Confirm email" is off,** under Authentication → Providers → Email (decision D116).
  - If `SUPABASE_ACCESS_TOKEN` is in `.env.local`, L turns it off through the Management API (`PATCH /v1/projects/{ref}/config/auth` with `mailer_autoconfirm: true`), and nobody clicks.
  - Otherwise it stays the user's one dashboard click, at home or in the 09:27 block.
  - build-kickoff's `check-keys.py` and its step 12 sign-up test verify it either way. Nobody adds users in the dashboard (D68).
- **Accounts.**
  - The seed creates every account with the Auth admin API (`email_confirm` true, password `SEED_PASSWORD`).
  - The demo copy has Mira (owner), Kabir (co-owner, never signed in) and Diya (manager), from demo-data §1.2.
  - Each rehearsal copy (section 9, item 10) has its own owner and manager: `mira.<copy>@example.com` and `diya.<copy>@example.com`, for copy `a`, `b`, `c`, `d` or `e2e`.
  - Every seeded address ends in `@example.com`, so Flagsmith treats it as internal and the experiment never enrols it (flagsmith.md 2.3).
  - The demo uses **two logins**: Mira on the laptop (Chrome profile "Mira") and Diya on the phone (Chrome).
- **New owners sign up** at `/signup` (Lane A). With confirmation off, the session starts at once and the page goes to `/setup`. This is how real first-time owners enter the Flagsmith experiment.
- **How the session reaches server code:**
  1. The sign-in and sign-up server actions call Supabase on the `@supabase/ssr` server client, and Supabase's cookies are set on the response.
  2. `src/proxy.ts` refreshes the tokens on navigation requests.
  3. Any server code that needs the user calls Lane A's one session helper. It builds the server client from `await cookies()` and calls `auth.getClaims()`; it never trusts `getSession()` on the server.
  4. The user id then goes through the `members` row to a role for this wedding.

  There is no browser Supabase auth client, and the cookie options stay at the `@supabase/ssr` defaults.
- **Only two places touch Supabase Auth:** `src/server/auth/` and `src/lib/supabase/`. Everything else takes the actor from the guard, which is what makes the Better Auth fallback a two-module swap (section 8).
- **Keys.**
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (the publishable key, or the legacy anon key) serves the server's SSR client and the browser's signed upload.
  - `SUPABASE_SERVICE_ROLE_KEY` (the secret key, or the legacy service_role key) is read only in `src/lib/supabase/admin` (server-only), for admin user creation, bucket creation and URL signing.

### 3.6 Storage for photos and exported cards

| Bucket (private) | Holds | Limits | Object key |
|---|---|---|---|
| `uploads` | Couple photos | `image/jpeg`, `image/png`, `image/webp`; 10 MB | `{wedding_id}/{asset_id}.{ext}`, stored in `assets.storage_path` (domain 5.5) |
| `exports` | Exported cards | `image/png`, plus `application/pdf` only if the lead approves the PDF Should at 13:30: then Lane A adds the `pdf` enum value and the MIME type in an additive migration, and Lane D ships the PDF in the 14:30 batch (decision D66); 10 MB | `{wedding_id}/card-rev{revision}.png` (`.pdf` if it ships), written with upsert, so one `export_key` has one object (domain 3.7, 5.5) |

- **Setup.** The seed (Lane A) creates both buckets idempotently. There are no Storage policies at all; every access is server-signed.
- **The seeded couple photo** (decision D107). L commits the Sol photo as `scripts/seed-assets/couple-photo.jpg` by 11:00, in a lead PR merged first in the 11:40 batch. The seed's photo step is idempotent: it uploads the file and upserts the asset row by `seed_key`, and touches nothing else. L runs it for every copy right after the 11:40 deploy. From then on it's part of D0, so `reset_demo` keeps it.
- **The Storage adapter** (`src/server/storage/`, Lane A, by 11:40 at the latest, merged ahead of Lane D; decisions D41 and D102) covers the `exports` write and signed download that Lane D's worker uses, plus upload signing. Lane D's worker does its own upsert and size check through it.
- **Uploads:**
  1. The client shrinks the image to a JPEG with a long edge of about 2000 px.
  2. `POST /api/uploads/sign` (Lane A's A6, 12:30, with `add_asset`; D41, D121) checks the role. It returns an `asset_id`, the object key and a signed upload URL, valid for 2 hours.
  3. The browser uploads straight to Storage with supabase-js's signed-URL upload.
  4. The client runs `add_asset`, and the server checks that the object exists at that key with that size.

  The file never touches a Vercel function.
- **Never stored:** voice audio and printed-card photos (Should #11). Each goes once to its route handler, on to Sarvam, and is dropped when the request ends (doc-ai.md 3.1). The `invite_scan` asset kind is therefore unused.
- **Display.** The server signs photo URLs at render time: 10 minutes for planner pages, 1 hour inside the guest view and on the render page (domain 4.6, 5.5; export-and-recovery.md 1.6). Use a plain image element; no `next/image` remote patterns.
- **Card downloads.** The `export_job_status` read model returns `download_url`, signed for 10 minutes with the download name `jashn-card-rev{n}.png`, only for a succeeded job (domain 4.8). A card is never streamed through a function.
- **Ops responses carry no signed URLs,** because NudgeBee doesn't mask task outputs (research-nudgebee F18).
- **Free-plan headroom:** 1 GB of storage, 50 MB per file and 5 GB of egress, which is ample.

### 3.7 The other credentials the server checks

| Credential | Where | Check |
|---|---|---|
| Ops bearer token | `/api/ops/*` | `Authorization: Bearer <JOBS_API_TOKEN>`, compared in constant time. It grants only these endpoints: NudgeBee's status and retry, as the `system` actor labelled "NudgeBee", and the internal worker `/run`, which Jashn's own kick and the team's probe call. A retry without an `Idempotency-Key` header gets 400 (domain 6.4). **Staging** (decisions D58 and D102): the 10:30 probe uses a temporary token check inside Lane D's own path. Lane A exports the system verifier by 11:40 at the latest, merged ahead of Lane D in that batch, so the temporary check lives until then. Lane D then switches `/run`, the GET and the retry to it and deletes the temporary check |
| Render token | `/render/card/[job_id]?t=…` | An HMAC of the job id and an expiry at most 5 minutes ahead, signed with `RENDER_TOKEN_SECRET` and minted by the worker. The page reads only the job, its publication snapshot and `is_sample`, and is noindex |
| None (public) | `/api/health` | It returns only liveness, the commit SHA and the `flags` self-check summary, which hold no secrets and no user data (flagsmith.md 6.7). The full check is in the flag drawer, for internal accounts only |

---

## 4. Folder structure and file ownership

### 4.1 Directory tree

Owners in brackets: L = lead session (repo root), A = data, roles and privacy, B = planning screens, C = voice and Flagsmith, D = invitation, guest site, RSVP, export and NudgeBee. Dynamic segments use snake_case, like the JSON. Next refuses two different names for the same dynamic segment, so every lane uses exactly these: `[wedding_id]`, `[job_id]`, `[token]`, `[import_id]`, `[voice_turn_id]` and `[command]`.

- `Jashn/` [L]: the repository root
  - `AGENTS.md` [L]: Next's managed block, then the team rules in 7.3. The committed rules file
  - Local and gitignored, never committed (decision D1): `CLAUDE.md` (in each worktree, a local copy of one line that points to AGENTS.md), `CLAUDE.local.md` (the lane brief), `.claude/` (including the Stop hook in `settings.local.json`) and `.impeccable/`
  - `README.md` [L]: setup, AI disclosure, Working / Partial / Future table
  - `.env.example` [L]: every variable name from section 5, no values
  - `.gitignore` [L]
  - `package.json`, `package-lock.json` [L]: only the lead installs
  - `next.config.ts`, `vercel.json`, `tsconfig.json`, `eslint.config.mjs`, `components.json`, `vitest.config.ts`, `playwright.config.ts` [L]
  - `drizzle.config.ts` [A]
  - `DESIGN.md`, `PRODUCT.md` [B]: design tokens and product notes. Written in the lead's design direction round (09:10–09:27) and merged in the contracts PR; Lane B owns both afterwards (decision D3)
  - `CONTEXT.md` [A]: the glossary from domain-and-data §1, for the domain-modeling skill
  - `.github/` [L]: the CI workflow and the PR template (6.3)
  - `docs/prep/` [L]: notes and research; read-only for sessions
    - `spec/` [L]: the build specs, including this file
  - `drizzle/` [A]: generated SQL migrations, append-only
  - `scripts/`: laptop-only scripts
    - `seed.ts` [A]: users, buckets and every sample copy; idempotent. It builds REV-1 and REV-2 with `src/db/itinerary-snapshot.ts` (D95), uploads `seed-assets/card-rev2.png` when present, and has an idempotent photo step for `seed-assets/couple-photo.jpg` (D107)
    - `seed-assets/card-rev2.png` [D]: the REV-2 seed card, rendered by Lane D at about 12:00. Lane D's one-file exception to Lane A's ownership of `scripts/`, granted by the lead (decision D15)
    - `seed-assets/couple-photo.jpg` [L]: the Sol couple photo, committed by L by 11:00 in a lead PR merged first in the 11:40 batch (decision D107)
    - `synthetic-setup-traffic.ts` [C]: the Flagsmith synthetic run (flagsmith.md 5.8)
  - `ops/nudgebee/` [D]: `card-export-recovery.yaml` (workflow-as-code) and a short README with the object names and test run ids
  - `e2e/` [L]: the demo-path spec and global setup; each session owns `lane-<letter>.spec.ts`; `.auth/` is gitignored and belongs to the lead's demo-path project only (D120)
  - `public/` [L]: favicon and static files
    - `card/` [D]: the next/og fallback's Hindi PNGs and the probe's placeholder photo
    - `voice-fixtures/` [C]: recorded audio for voice fixture mode
    - `samples/` [C]: the fictional printed card for Should #11 (doc-ai.md 4.1)
  - `src/`
    - `proxy.ts` [A]: Supabase session refresh only
    - `contracts/` [L]: shared types, schemas and fixtures (4.3)
    - `db/` [A]: schema and client. No `server-only` here, because the seed imports it
      - `ids.ts` [A]: the seeded-id helper (UUIDv5), shipped in the contracts PR; the fixtures and the seed both use it (decision D100)
      - `itinerary-snapshot.ts` [A]: pure functions that build a published itinerary snapshot from the itinerary rows and diff two snapshots (P2's fields). It imports nothing server-only. Lane A ships it in A1 (10:45); the seed and Lane D's `publish_itinerary` both import it (decision D95)
    - `lib/`
      - `fonts.ts` [L]: Eczar, Anek Devanagari and Tiro Devanagari Hindi with the latin, latin-ext and devanagari subsets. research-stack §7 confirms Eczar, Tiro Devanagari Hindi and Mukta in next/font 16.4.6 but doesn't name Anek Devanagari, so the lead checks it after the 09:08 install and uses Mukta if it is missing (export-and-recovery.md 1.5)
      - `utils.ts` [L]: the shadcn class helper
      - `supabase/` [A]: server client (cookies), admin client (server-only), browser client (signed upload only)
      - `card-import/` [C]: the pure card-reading rules shared by the server and the review form (doc-ai.md 5.3)
    - `server/`: server-only; every file starts with the `server-only` import
      - `actions/dispatch.ts` [A]: the `'use server'` module exporting `dispatchCommand`, the one command action every form uses (decision D98)
      - `auth/` [A]: session to user (`session.ts`, from the contracts PR's stub, D96); the sign-in, sign-up and sign-out actions
      - `authz/` [A]: the guard (member, guest and system checks)
      - `commands/` [A]: the dispatcher, receipts, the handler registry and the handlers for every command except Lane D's four
      - `read-models/` [A]: every read model in domain-and-data §4, including the guest view. Its index re-exports `export_job_status` from Lane D's `jobs/` (decision D16)
      - `activity/` [A]: activity templates and the append-activity helper, which takes a finished entry. The export templates stay in Lane D's `jobs/` or `invite/` (decision D63)
      - `live/` [A]: the version read and the bump-version helper
      - `storage/` [A]: bucket names, the Storage adapter and the signing helpers, by 11:40 at the latest (decisions D41 and D102)
      - `services/` [A]: the implementation behind `src/contracts/services.ts`, switched from fixtures to real
      - `flags/` [C]: `index.ts` (the only surface other lanes import), the client, identity, evaluation, gates, experiment events, self-check, reason labels and the drawer's server actions (flagsmith.md 6.2)
      - `voice/` [C]: Sarvam speech-to-text, model and text-to-speech clients, the proposal builder and fixture mode
      - `card-import/` [C]: Document AI and gemma4 calls, normalising, and `card_imports` reads and writes (doc-ai.md 5.3)
      - `invite/` [D]: handlers for `update_invite_style`, `publish_itinerary`, `request_card_export` and `retry_card_export`. `publish_itinerary` imports Lane A's snapshot builder from `src/db/` (D95)
      - `export/` [D]: the Chromium renderer, the next/og fallback renderer, the upload, the readiness guard and the probe's sample card
      - `jobs/` [D]: the export-job state machine, the worker, the kick, lazy expiry, the ops endpoint logic, the NudgeBee webhook, the export activity templates (D63), the `export_job_status` read model in `status.ts`, whose computed fields (stalled, can_retry, card_summary) are job logic (decisions D16 and D52), and `after-commit.ts`, the static after-commit map Lane A's dispatcher imports (D101)
    - `components/`
      - `ui/` [L]: shadcn output; nobody regenerates it
      - `live/` [A]: `LiveRefresh`, the poller
      - `auth/` [A]: the sign-in and sign-up forms
      - `planner/` [B]: workspace components
      - `voice/` [C]: `VoiceDock` (a server component), the client dock, `ReasonChip`, `FlagDrawer` and the review card (flagsmith.md 6.2)
      - `setup/` [C]: setup parts, including `card-import/` (the sheet and its review form)
      - `invite/` [D]: studio, `PublishSheet`, guest-page parts, RSVP and the exports panel
    - `app/`
      - `layout.tsx`, `not-found.tsx` [L]
      - `globals.css` [B]: Tailwind import and the design-direction §4 tokens. L writes the token layer into the contracts PR (decision D4); Lane B owns the file from then on
      - `page.tsx` [A]: the root redirect (your wedding, `/setup` or `/login`)
      - `(auth)/login/`, `(auth)/signup/` [A]
      - `join/[token]/` [A]: accept a member invite
      - `(planner)/layout.tsx` [A]: sends signed-out users to `/login`; nothing else
      - `(planner)/setup/` [C]: voice-first and form-first setup
      - `(planner)/w/[wedding_id]/` [B]: the shell layout, overview, events, guests, money, vendors, activity and shagun. Team and sharing is an owners-only sheet opened from the shell's wedding menu, with no route segment of its own (D109)
        - `invite/` [D]: studio, review and publish, exports panel. It starts as the contracts PR's placeholder, and B's nav links to `routes.invite` (D121)
      - `(public)/i/[token]/` [D]: the guest site and RSVP
      - `render/card/[job_id]/` [D]: the page Chromium screenshots
      - `api/`
        - `health/` [L]: liveness and the commit SHA from the scaffold PR; the `flags` summary that Lane C's module exports from the contracts PR (flagsmith.md 6.7, decision D12)
        - `uploads/sign/` [A]
        - `w/[wedding_id]/version/` [A]
        - `w/[wedding_id]/commands/[command]/` [A]
        - `w/[wedding_id]/exports/`, with `[job_id]/retry/` [D]
        - `i/[token]/revision/`, `i/[token]/rsvp/`, `i/[token]/dietary/` [D]
        - `voice/` [C]: `turn/`, `confirm/` and `cancel/`, plus `turns/[voice_turn_id]/reply-audio/` and `turns/[voice_turn_id]/trace/` (voice.md 0.2). No `state/` route
        - `card-imports/`, with `[import_id]/` and `[import_id]/apply/` [C]
        - `ops/export-jobs/[job_id]/`, with `retry/` and `run/` [D]

### 4.2 Ownership per session

A session edits only its own paths. It may import anything another lane exports, but never edits it; it asks the owner instead.

| Session | Owns (exclusive write) | Imports from others | First deliverable |
|---|---|---|---|
| **L** (lead, repo root) | Root config and package files, AGENTS.md, README.md, `.github/`, `vitest.config.ts`, `playwright.config.ts`, `e2e/` (demo path), `src/contracts/`, `src/lib/fonts.ts`, `src/lib/utils.ts`, `src/components/ui/`, `src/app/layout.tsx`, `src/app/not-found.tsx`, `src/app/api/health/`, `docs/`, and the one file `scripts/seed-assets/couple-photo.jpg` (D107) | – | Scaffold at 09:28, contracts merged at about 09:50–09:55 (D70), `lane-lead-contracts-2` at about 10:30 (D44), then merges |
| **A** | `drizzle.config.ts`, `drizzle/`, `scripts/seed.ts`, `CONTEXT.md`, `src/proxy.ts`, `src/db/`, `src/lib/supabase/`, `src/server/{actions,auth,authz,commands,read-models,activity,live,storage,services}/`, `src/components/{live,auth}/`, `src/app/page.tsx`, `src/app/(auth)/`, `src/app/join/`, `src/app/(planner)/layout.tsx`, `src/app/api/uploads/`, `src/app/api/w/[wedding_id]/{version,commands}/` | Lane D's handler map, its after-commit map in `src/server/jobs/after-commit.ts` (D53, D101) and its `export_job_status` read model, which the read-model index re-exports from the 09:50 stub on (D16, D52); Lane C's voice gate and setup-saved hook (all through contracts). The dispatcher calls the setup-saved stub from 10:45, and Lane C makes it real in the 11:40 batch (D39) | 10:45: the schema and first migration (pushed as a draft PR by 10:20, D96), the seed for every copy with the D95 snapshots, sign-in, the dispatcher with the guard and the receipt re-check, the real `dispatchCommand`, the version poll, `LiveRefresh` and `wedding_profile`. By 11:40 at the latest, merged ahead of Lane D: the Storage adapter and signing helpers, the guest token resolver, the system verifier, `reset_demo` and A4 (`update_event` and the itinerary read model) (D102) |
| **B** | `src/app/(planner)/w/[wedding_id]/` except `invite/`, `src/components/planner/`, `src/app/globals.css`, `DESIGN.md`, `PRODUCT.md` (all three from the contracts merge on; L writes their first versions, D3 and D4) | `VoiceDock` (C), `LiveRefresh` (A), `PublishSheet` (D), services and `dispatchCommand` (A) | Shell and the Money vendor page on fixtures by 10:45 |
| **C** | `src/app/(planner)/setup/`, `src/app/api/{voice,card-imports}/`, `src/server/{voice,flags,card-import}/`, `src/lib/card-import/`, `src/components/{voice,setup}/`, `scripts/synthetic-setup-traffic.ts`, `public/{voice-fixtures,samples}/` | Services, the dispatcher, `dispatchCommand` and the session helper (A); `lane-a-schema`, merged in before 10:45 (D96) | `lane-c-voice` in the 10:45 batch: the flags core, VoiceDock with the reason chip and the kill switch (flagsmith.md 7.7), and record, transcribe, preview and confirm through the dispatcher |
| **D** | `src/app/(planner)/w/[wedding_id]/invite/`, `src/app/(public)/`, `src/app/render/`, `src/app/api/i/`, `src/app/api/w/[wedding_id]/exports/`, `src/app/api/ops/`, `src/server/{invite,export,jobs}/`, `src/components/invite/`, `ops/nudgebee/`, `public/card/`, and the one file `scripts/seed-assets/card-rev2.png` (D15) | Services, dispatcher, activity and version helpers, the snapshot builder, the Storage adapter, the system verifier and the rate limiter (A); environment flags (C) | `lane-d-render-probe`: the render page, the Chromium module and `/run` with `probe` behind a temporary token check (D58), merged out of batch at about 10:30 (export-and-recovery.md 3.6) |

**Rules for every session:**
1. Lane A alone edits `src/db/schema.ts` and `drizzle/`, including the operational tables other lanes need: `voice_turns`, `experiment_exposures` and `card_imports` for C; `export_jobs` and `export_attempts` for D. The others ask Lane A for columns.
2. Other lanes may read Lane A's tables directly from their own `src/server/` module for their own needs. For example, Lane D's worker and render page read `publications`, which hold guest-visible data only. Domain writes always go through the dispatcher.
3. Until Lane A switches `src/server/services/index.ts` and `dispatchCommand` to the real implementation (target: the 10:45 batch), B, C and D build against the fixture services from the contracts. Lanes never write their own command wrappers (D98).
4. No session runs `npm install`, `npx shadcn add`, `drizzle-kit push` or anything `@latest`. A package request goes to the lead, who adds it in a `lane-lead-*` PR.
5. Unit tests sit next to the code they test, in the owner's folder. Tests that need the database are named `*.db.test.ts` (6.3, D103). End-to-end specs are `e2e/lane-<letter>.spec.ts`.
6. The one cross-lane exception is Lane D's `scripts/seed-assets/card-rev2.png`, committed at about 12:00. Until it exists, Lane A's seed marks JOB-EXP-R2-PNG as Ready without a file, and rehearsals before 13:45 skip its download (decision D15). The lead also commits `scripts/seed-assets/couple-photo.jpg` by 11:00 (D107).

### 4.3 Shared contract files that must exist first

The lead writes these between 09:35 and 09:55 (decision D121), from domain-and-data.md, flagsmith.md, doc-ai.md, voice.md and export-and-recovery.md. They merge in the `lane-lead-contracts` PR at about 09:50–09:55, before any worktree exists (decision D70). After that they change only through a lead PR, merged at once (6.4).

**The contracts PR is the minimum that compiles all four first branches** (decision D44): the fixtures, the fonts, the handler and component stubs (with their final props, D97), the session-helper stub (D96), `dispatchCommand` on the fixture services (D98), the `wedding_profile` type and fixture (D99), the seeded-id helper (D100), the `export_job_status` stub (D52), the after-commit types and the empty map (D53, D101), the Invite placeholder (D121) and the token layer (D4). The card-import contract with `image_extraction_provider`'s key (D115), the `team` read model and the household link fields (D99), and any other metadata no first branch needs move to `lane-lead-contracts-2` at about 10:30.

The same PR also carries three design files (decisions D3 and D4):
- `PRODUCT.md` and `DESIGN.md`, from the impeccable direction round that runs in the lead session at 09:10–09:27. The user's pick during the round is the approval; L writes DESIGN.md from it.
- The token layer of `src/app/globals.css`: colour, type and spacing tokens from DESIGN.md and design-direction.md, written by L right after the pick, so Lanes C and D style with real tokens from their first minute.

Lane B owns all three from the merge on.

| File | Contents | Changes requested by |
|---|---|---|
| `src/contracts/domain.ts` | Ids, the enums from domain-and-data §5.2, entity DTO types, and the guest view as an allowlist type with no money fields | A |
| `src/contracts/commands.ts` | A zod input schema per command (domain-and-data §3), the request and response envelopes, outcomes and error codes. Replaces research-stack's `actions.ts` | A |
| `src/contracts/permissions.ts` | The role × command matrix (6.1), gated (A1) and owner-only (A3) lists, sharing flags (G7) and guest commands | A |
| `src/contracts/read-models.ts` | The name and result type of every read model (domain-and-data §4), with D99's additions: `wedding_profile` (new), `itinerary`'s `venues[]` and per-function `requirements[]`, `days_until_due` on `money_summary`'s due items, and `seed_key` on every row. `team` and the household link fields follow in `lane-lead-contracts-2`. `export_job_status` is implemented by Lane D (D16) | A, D |
| `src/contracts/money.ts` | Integer-rupee helpers, the en-IN display rules (M7) and the Hindi amount words. Replaces research-stack's paise | A |
| `src/contracts/services.ts` | The interface every lane calls (dispatcher, read models, guest view, upload signing), with a fixture implementation. It also holds the after-commit types, `AfterCommitHandler` and the map type (decisions D53 and D101), and the typed signatures of Lane A's 11:40 items (the Storage adapter and signing helpers, the guest token resolver, the system verifier, `reset_demo` and A4), so Lane D builds against them from 10:00 (D102) | A, D |
| `src/contracts/api.ts` | The JSON shape of every route handler: both polls, guest RSVP and dietary, the voice routes, exports, ops including `/run`, and `/api/health` with its `flags` object | The route's owner |
| `src/contracts/routes.ts` | URL builders for every page and API path in 4.1, including `routes.invite`. The vendor page is `/w/{wedding_id}/vendors?vendor_id=…`, because no `[vendor_id]` segment exists (decision D18). It also exports the `highlight` query parameter (comma-separated field keys): Lane C appends it to `navigate.path`, and Lane B's pages read it and apply the highlight once (decision D121) | Any |
| `src/contracts/flags.ts` | Flag keys, variation keys, fallbacks, and trait, segment and event names, copied from flagsmith.md 2–5 (including `card_renderer` and `export_failure_drill`); the voice-gate and setup-saved interfaces the dispatcher calls. Should #11's `image_extraction_provider` key follows in `lane-lead-contracts-2` (D115) | C, D |
| `src/contracts/card-import.ts` | The card-import draft shape, statuses, stages, field states, providers and error codes (doc-ai.md 1.7, 5.3). It is types only, and no first branch needs it, so it lands in `lane-lead-contracts-2` at about 10:30 (decision D44), with `image_extraction_provider`'s key in `flags.ts` (D115); the Flagsmith flag itself is still created only when #11's build starts (flagsmith.md 3.8) | C |
| `src/contracts/jobs.ts` | Export-job statuses and labels, the `export_key` and `job_label` formats, timers, error codes, retry outcomes, trigger and renderer values, and the reserved job id `probe` (export-and-recovery.md 10.5) | D |
| `src/contracts/fixtures.ts` | The D0 demo state from demo-data.md as DTOs | A |

**Stubs.** The contracts PR also creates these stubs, so cross-lane imports compile from the first minute. The named lane replaces the body and owns the file from then on.

| Stub | Starts as | Owner |
|---|---|---|
| `src/server/services/index.ts` | Exports the fixture services | A |
| `src/server/actions/dispatch.ts` | A `'use server'` module exporting `dispatchCommand`: it takes the domain §3.0 command envelope and returns the §3.0 response envelope, backed by the fixture services. Lane A replaces the body at 10:45 (decision D98) | A |
| `src/server/auth/session.ts` | The session helper's final signature, returning the fixture member with the actor fields domain §1 and flagsmith.md 4 need. Lane A replaces the body in `lane-a-dispatcher` (decision D96) | A |
| `src/db/ids.ts` | Not a stub: the real seeded-id helper, UUIDv5 under the namespace `75e13aff-00d4-427e-8e6b-7bd1798f1316` with the names domain 0.1 gives. The fixtures and the seed both use it (decision D100) | A |
| `src/server/flags/index.ts` | A voice gate that fails closed: it refuses every voice write and never answers "enabled" (decision D47), an environment-flag reader that returns the fallbacks, a setup-saved hook that does nothing (Lane A's dispatcher calls it from 10:45; Lane C replaces it in the 11:40 batch, D39), and a self-check summary that says "not built yet" (the lead wires it into `/api/health` in this PR, so `flags.ok` reads false until `lane-c-voice` merges, D12) | C |
| `src/server/invite/handlers.ts` | An empty handler map, which Lane A's registry imports | D |
| `src/server/jobs/after-commit.ts` | The after-commit map, a static export, shipped empty. Lane A's dispatcher imports it statically; Lane D adds the export kick at 11:40 (decision D101) | D |
| `src/server/jobs/status.ts` | `export_job_status` returning the fixture export view. Lane A's read-model index re-exports it from 09:50; Lane D replaces the body in `lane-d-export-jobs` in the 11:40 batch (decision D52) | D |
| `src/components/live/LiveRefresh.tsx` | Renders nothing. Final props: the endpoint and the interval (2.4) | A |
| `src/components/voice/VoiceDock.tsx` | A disabled microphone. Final props: `wedding_id` (null on `/setup`) and the props voice.md names | C |
| `src/components/invite/PublishSheet.tsx` | A disabled "Review and publish" button. Final props: `wedding_id`, the `unpublished_changes` list, `expected_draft_version` and an `on_confirm` callback. The real, reusable sheet ships at 11:40 (decision D59) | D |
| `src/app/(planner)/w/[wedding_id]/layout.tsx` | A bare shell that renders its children, VoiceDock and LiveRefresh. Final props: Next's `children` and `params` (`wedding_id`) | B |
| `src/app/(planner)/w/[wedding_id]/invite/page.tsx` | A placeholder page under Lane D's path; Lane B's placeholder pages exclude Invite, and its nav links to `routes.invite` (decision D121). `lane-d-publish` mounts `PublishSheet` there at 11:40 (D107) | D |
| `src/lib/fonts.ts` | The real font definitions; Lanes B and D need them from the start | L (stays with the lead) |

**Stub props** (decision D97). Every component stub declares its final props in the contracts PR, as listed above, and its owner keeps them unchanged. Changing a stub's props is a contracts change, made by L.

---

## 5. Environment variables

### 5.1 The table

Names only, never values. "Present" means the name is already in the main `.env.local` (gitignored by `.env.*`). Vercel gets **Production** values only, because no previews are built. L adds them at about 09:35 with the documented form `npx vercel@66.6.0 env add <NAME> --environment production --sensitive --yes`, from the empty scratch folder `~/jashn-vercel-cli`, feeding each value on stdin from the main `.env.local` without printing it (decisions D5 and D119; build-kickoff step 15). L skips `NEXT_PUBLIC_FLAGSMITH_ENVIRONMENT_ID`: the user sets its Production client-side key by hand at the 09:32 import (D119). The fallback is the dashboard (Project → Settings → Environment Variables, scope Production, secrets marked Sensitive), pasting each value from the password manager.

| Name | Read in | `.env.local` | Vercel Production | Source | Owner |
|---|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Browser (signed upload) and server | Present | Yes | Supabase → Project Settings → API | A |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser (signed upload only) and server (SSR auth client) | Present | Yes | Supabase API keys: the publishable key (or legacy anon) | A |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only (`src/lib/supabase/admin`): admin users, buckets, URL signing | Present | Yes, Sensitive | Supabase API keys: the secret key (or legacy service_role) | A |
| `SUPABASE_DB_PASSWORD` | Nobody: it is already inside both database URLs. Kept for reference | Present; not copied to worktrees | No | Password manager | L |
| `DATABASE_URL` | Server runtime | Present | Yes, Sensitive | Supabase Connect → Transaction pooler, port 6543 | A |
| `DATABASE_URL_SESSION` | Laptop only: drizzle-kit and the seed, from Lane A's worktree | Present | No | Supabase Connect → Session pooler, port 5432 | A |
| `SUPABASE_ACCESS_TOKEN` | Laptop only: the lead's Management API calls (such as the Data API's exposed schemas, and turning "Confirm email" off, D116) | Present; not copied to worktrees | No | Supabase account → Access Tokens | L |
| `SARVAM_API_KEY` | Server only (`src/server/voice/`, `src/server/card-import/`) | Present | Yes, Sensitive | Sarvam dashboard → API keys | C |
| `FLAGSMITH_SERVER_KEY` | Server only (`src/server/flags/`) | Present: the **Development** `ser.` key | Yes: the **Production** key, Sensitive | Flagsmith → Environment settings → Server-side keys | C |
| `NEXT_PUBLIC_FLAGSMITH_ENVIRONMENT_ID` | Server code only: the flag drawer's environment label. No client code reads it, so it is never inlined into a bundle; there is no browser SDK (flagsmith.md 6.9) | Present (the Development client-side key) | Yes: the Production client-side key, which the user sets by hand at the 09:32 import; L's CLI loop skips it (D119) | Flagsmith | C |
| `FLAGSMITH_SERVER_KEY_PRODUCTION` | Nobody in app code: the source for Vercel's `FLAGSMITH_SERVER_KEY`, the lead's laptop checks and the hosting fallback (flagsmith.md F19) | Present; not copied to worktrees | No | Flagsmith | L |
| `FLAGSMITH_SERVER_KEY_SYNTHETIC` | `scripts/synthetic-setup-traffic.ts` only, which Lane C runs once from its worktree (flagsmith.md 5.8) | Present; copied to Lane C's worktree only | No | Flagsmith | C |
| `FLAGSMITH_ORG_API_KEY` | Laptop only: the lead's read-only checks (flagsmith.md 7.5, FV1). Never used to write, and never by lane code | Present; not copied to worktrees | **No** | Flagsmith → Organisation → API Access | L |
| `JOBS_API_TOKEN` | Server only: the bearer check on `/api/ops/*` (NudgeBee's status and retry, and the internal worker) and the kick that calls the worker. The same value is NudgeBee's Secret `jashn_ops_token`, which the user pastes by 11:10 (D117) | Present | Yes, Sensitive | Already generated (32 random bytes, base64) | D |
| `NUDGEBEE_AGENT_AUTH_KEY` | Laptop only: the kind agent install, fallback only | Present; not copied to worktrees | No | NudgeBee → Add K8s Account | D |
| `RENDER_TOKEN_SECRET` | Server only: the HMAC on render URLs | **Add at 09:22** | Yes, Sensitive | `openssl rand -base64 32` | D |
| `FLAGSMITH_ID_SALT` | Server only: the HMAC behind Flagsmith identity keys (flagsmith.md 2.2) | **Add at 09:22**, the same value everywhere | Yes, Sensitive | `openssl rand -base64 32` | C |
| `INTERNAL_USER_EMAILS` | Server only (`src/server/flags/identity.ts`): the team's real emails, lowercase, comma-separated. It holds personal data. `@example.com` accounts are internal anyway (flagsmith.md 2.3) | **The user types it at 09:27** (D118) | Yes | The team's own addresses | C |
| `SEED_PASSWORD` | Laptop only: the password of every seeded account | **The user types it at 09:27** (D118). If it's still unset at 09:50, L generates one and the user copies it into the password manager | No | A passphrase the user chooses and saves in their password manager, because the teammate types it on a phone as Diya (D118) | A |
| `DEMO_RESET_ENABLED` | Server only: `true` lets an owner run `reset_demo` on sample copies | **Add at 09:22**, `true` | Yes, `true` through judging | Team decision | A |
| `NUDGEBEE_EXPORT_WEBHOOK_URL` | Server only, optional: NudgeBee's workflow webhook (its URL carries a token) | Optional | Add at about 12:15; live after the 12:30 deploy | NudgeBee → Integrations → Webhooks | D |
| `EXPORT_FAILURE_DRILL` | Server only, optional: a sample wedding's id. It arms the labelled drill on that wedding only when Flagsmith can't be read (export-and-recovery.md 4.1) | Unset | Unset | – | D |
| `VOICE_FIXTURE_MODE` | Server only: `on` serves recorded fixtures instead of calling Sarvam, labelled in the dock | Optional (it turns on by itself when `SARVAM_API_KEY` is missing) | **Never** | – | C |
| `APP_BASE_URL` | Server, local only: absolute URLs in dev (`http://localhost:300N`, or the tunnel URL) | Per worktree | No: production builds them from `VERCEL_PROJECT_PRODUCTION_URL` | – | A, D |
| `CHROME_EXECUTABLE_PATH` | Server, Lane D's worktree only: local Chrome for card export | D only | No | The Chrome app's binary path | D |
| `E2E_BASE_URL` | Playwright only | Optional | No | – | L |

### 5.2 Set by Vercel, retired names and the fallback stack

**Set by Vercel:**
- `VERCEL_ENV`.
- `VERCEL_PROJECT_PRODUCTION_URL`: no protocol. It is the base for self-calls, the Chromium render URL and the guest links shown to owners.
- `VERCEL_URL`: a protected deployment URL, so never use it for self-calls.
- `VERCEL_GIT_COMMIT_SHA`: shown by `/api/health`.
- `VERCEL_AUTOMATION_BYPASS_SECRET` is not needed, because there are no protected previews.

**Retired names. Don't use them anywhere:**

| Old name (where) | Use instead |
|---|---|
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (research-stack) | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `SUPABASE_SECRET_KEY` (research-stack, domain-and-data) | `SUPABASE_SERVICE_ROLE_KEY` |
| `MIGRATION_DATABASE_URL` (research-stack) | `DATABASE_URL_SESSION` |
| `OPS_API_TOKEN` (research-stack, domain-and-data), `OPS_RECOVERY_TOKEN` (research-nudgebee) | `JOBS_API_TOKEN` |
| `NUDGEBEE_WEBHOOK_URL` (research-stack, domain-and-data) | `NUDGEBEE_EXPORT_WEBHOOK_URL` (research-nudgebee's name) |
| `FLAGSMITH_SERVER_KEY_DEV`, `_SYNTH`, `_PROD` (research-flagsmith) | `FLAGSMITH_SERVER_KEY` (each deployment's own key), `FLAGSMITH_SERVER_KEY_SYNTHETIC`, `FLAGSMITH_SERVER_KEY_PRODUCTION` |
| `FLAGSMITH_SYNTHETIC_KEY` and `.env.synthetic.local` (research-flagsmith, an earlier draft of this file) | `FLAGSMITH_SERVER_KEY_SYNTHETIC`, in `.env.local` |
| `FLAGSMITH_INTERNAL_EMAILS` (an earlier draft of this file) | `INTERNAL_USER_EMAILS` |

**Fallback stack only:**
- `DATABASE_URL` and `DATABASE_URL_UNPOOLED`, set by the Neon Marketplace integration. They replace the Supabase values.
- `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL`.
- `BLOB_READ_WRITE_TOKEN`.

### 5.3 Rules

- **Worktree copies.** Each worktree gets `.env.local` minus `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `FLAGSMITH_SERVER_KEY_PRODUCTION`, `NUDGEBEE_AGENT_AUTH_KEY` and `FLAGSMITH_ORG_API_KEY`. Every copy except Lane C's also drops `FLAGSMITH_SERVER_KEY_SYNTHETIC` (the commands are in 7.2, step 11). Coding sessions never hold account-wide or flag-changing credentials.
- `NEXT_PUBLIC_` values are inlined at build time. Set them before the contracts merge (about 09:50–09:55), and redeploy after changing one.
- No secret ever goes in a `NEXT_PUBLIC_` name (G8).
- Never print values: no viewing the env file, no echoing it, no values in commit messages, PRs or chats. Generated secrets go straight into the file (build-kickoff step 10) or to the clipboard (`openssl rand -base64 32 | pbcopy`), never to the screen.
- `.env.example` lists every name in 5.1, with no values.
- No Preview-scoped values: no preview is ever built.

---

## 6. Delivery

### 6.1 Worktrees, branches and ports

| Session | Worktree | First branch | Later branches | Dev port |
|---|---|---|---|---|
| L | `~/Desktop/Personal/Jashn` | `lane-lead-notes`, `lane-lead-scaffold`, `lane-lead-contracts` | `lane-lead-<topic>` | 3000 |
| A | `~/Desktop/Personal/jashn-a` | `lane-a-schema` | `lane-a-<topic>` | 3001 |
| B | `~/Desktop/Personal/jashn-b` | `lane-b-shell` | `lane-b-<topic>` | 3002 |
| C | `~/Desktop/Personal/jashn-c` | `lane-c-voice` | `lane-c-<topic>`, such as `lane-c-setup-experiment` and `lane-c-card-reader` (doc-ai.md 5.6) | 3003 |
| D | `~/Desktop/Personal/jashn-d` | `lane-d-render-probe` | `lane-d-<topic>`, such as `lane-d-export-jobs` and `lane-d-ops-recovery` (export-and-recovery.md 10.1) | 3004 |

- **A topic is one reviewable piece:** a table and its commands, one screen, one route. Aim for a PR every 45–60 minutes, in time for a batch (6.4). Every lane works this way. flagsmith.md 7.7, doc-ai.md 5.6 and export-and-recovery.md 10.1 name their topic branches to this pattern.
- **Every branch name starts with `lane-`,** so Vercel ignores it (6.5), and names the work, never a tool. Sessions never let a tool invent a branch name.
- **After opening a PR, start the next topic at once.** Cut it from `origin/main` when it doesn't need the open PR, or from the open branch when it does. Every PR targets `main`. A branch cut from an open one shows both sets of commits until the first PR merges, then only its own.
- **Each worktree gets its own `npm ci` and env copy (5.3),** because of Next 16's one-`next dev`-per-folder lock and Turbopack's root detection.
- **Each worktree also gets a gitignored `CLAUDE.local.md` lane brief:** session letter, owned paths (4.2), port, first deliverable, and the PR routine below. Its local `CLAUDE.md` is a gitignored copy that points to the committed AGENTS.md (decision D1).
- **Worktrees share this clone's hooks and git config,** so the commit-msg hook and the omiiii21 credential helper apply everywhere. Never work in a fresh clone, because it would have neither.

### 6.2 Commits, pull requests and the AI rules

- **Commits.** Small, with plain messages that say what changed.
  - No AI attribution of any kind: no `Co-Authored-By` naming an AI tool, and no "Generated with" footer.
  - The local commit-msg hook strips such lines, then **rejects any message that still contains the word "claude"** in any case. So never name `CLAUDE.md` in a commit message; write "agent instructions".
- **Pull requests.**
  - Title: the session letter, a colon and what it delivers, for example "A: payment corrections with version history" or "D: card render page and Chromium probe". The lead uses "L:".
  - Body: what changed; how it was tested (laptop, phone, production); schema or env changes; follow-ups.
  - No AI attribution lines and no "Generated with" footer. The hook doesn't see PR text, so AGENTS.md states this rule, and it overrides any default attribution instruction.
- **Drafts.** Every PR opens as a draft (`gh pr create --draft`) and is marked ready with `gh pr ready` once the checks pass (decision D30).
- **Disclosure.** AI assistance is disclosed in the README and on the submission form, as the hackathon rules require (decision D31). The canonical text is presentation.md §6, with the full names (Claude Code with Claude Opus 5.5; Claude Fable 5.2; GPT-6.2-Sol and GPT-6.2-Astra from OpenAI through the Codex CLI), corrected to what was actually used, plus the line on what existed before 09:00. demo-script §4.3 points to it. It never goes in commits, PR text or branch names.
- **gh** commands for this repo always run with `GH_TOKEN` taken from `gh auth token --user omiiii21`, and with `--repo omiiii21/Jashn`. `git push` needs nothing extra.

Run at 09:00 or later (each session, from its worktree; Lane A's names shown). A branch with database tests also runs `npm run test:db` before the build (6.3, decision D103):

```bash
git fetch origin && git merge origin/main
npm run check && npm test && npm run build
git push -u origin lane-a-schema
GH_TOKEN="$(gh auth token --user omiiii21)" gh pr create --draft --repo omiiii21/Jashn --base main --head lane-a-schema --title "A: schema, sign-in and the command dispatcher" --body "What changed, how it was tested, schema and env changes."
GH_TOKEN="$(gh auth token --user omiiii21)" gh pr checks lane-a-schema --repo omiiii21/Jashn
GH_TOKEN="$(gh auth token --user omiiii21)" gh pr ready lane-a-schema --repo omiiii21/Jashn
```

Run at 09:00 or later (a follow-up, once that PR is open: the next topic; decision D67):

```bash
git switch --no-track -c lane-a-ledger origin/main
```

Run at 09:00 or later (lead, merging a batch in order):

```bash
GH_TOKEN="$(gh auth token --user omiiii21)" gh pr list --repo omiiii21/Jashn --state open
GH_TOKEN="$(gh auth token --user omiiii21)" gh pr merge lane-a-schema --repo omiiii21/Jashn --merge
GH_TOKEN="$(gh auth token --user omiiii21)" gh pr merge lane-b-shell --repo omiiii21/Jashn --merge
```

Merge commits only. Never squash or rebase: a branch cut from an open PR then still merges cleanly. A session's PRs merge oldest first.

### 6.3 GitHub settings and CI (lead, once, at about 09:22)

Run at 09:00 or later:

```bash
GH_TOKEN="$(gh auth token --user omiiii21)" gh repo edit omiiii21/Jashn --enable-merge-commit --enable-squash-merge=false --enable-rebase-merge=false --delete-branch-on-merge
```

Merged topic branches are deleted on GitHub automatically. A worktree keeps its local copy until the session switches to its next branch.

**Branch ruleset on `main`,** applied by L at about 09:22 with `gh api`, never by a click (decision D69). The call names the repo in its path, which satisfies the "always name the repo" rule. It sets:
- Require a pull request before merging, with 0 approvals. One account cannot approve its own PRs.
- Block force pushes.
- Restrict deletions.

The request body (an HTTP payload), saved by L as `~/jashn-ruleset.json`, outside the repo, the path the kickoff uses (decision D119):

```json
{
  "name": "main", "target": "branch", "enforcement": "active",
  "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
  "rules": [
    { "type": "pull_request", "parameters": {
        "required_approving_review_count": 0, "dismiss_stale_reviews_on_push": false,
        "require_code_owner_review": false, "require_last_push_approval": false,
        "required_review_thread_resolution": false } },
    { "type": "non_fast_forward" },
    { "type": "deletion" }
  ]
}
```

Run at 09:00 or later (after step 0, the user's force-push):

```bash
GH_TOKEN="$(gh auth token --user omiiii21)" gh api --method POST repos/omiiii21/Jashn/rulesets --input "$HOME/jashn-ruleset.json"
```

If the call fails, skip the ruleset: the lead enforces the PR flow anyway. The user has no ruleset click.

**CI** (the `.github/` workflow, written in the scaffold PR):
- On every pull request to `main`: `npm ci`, typecheck, lint and unit tests. It takes about 3 minutes and is free on a public repo.
- The unit-test step and `npm test` both run `vitest run --passWithNoTests`, so an empty suite never fails CI. The scaffold also adds one unit test, for the `/api/health` response (decision D42).
- **Database tests** (decision D103). Tests that need the database are named `*.db.test.ts`. The scaffold's `vitest.config.ts` excludes them unless `RUN_DB_TESTS=1`, and loads `.env.local` with `@next/env`'s `loadEnvConfig`. `package.json` gets `"test:db": "RUN_DB_TESTS=1 vitest run"`. CI keeps `npm test` and never touches a database. Every lane runs `npm test`, and `npm run test:db` if it has database tests, before marking a PR ready.
- L runs the same test command locally before opening the scaffold PR, and the 09:28 merge waits for green CI.
- No `next build` in CI, because the build needs real env values. Sessions run `npm run build` locally before marking a PR ready.
- The check is not "required" in the ruleset, so a GitHub hiccup can't block a merge, but the lead never merges a red PR.
- PR template sections: what changed, testing, schema and env changes. No attribution footer.

### 6.4 Merge order, with the shared contracts first

| Time (IST) | PR | Why it goes here |
|---|---|---|
| about 09:05 | `lane-lead-notes`: `docs/prep/`, including `spec/` | The notes predate the code. A separate PR keeps the scaffold diff clean. It goes in right after step 0, the user's force-push; not 09:02, because the scheduled prompt fires at 09:03 (decision D11) |
| 09:28 | `lane-lead-scaffold`: scaffold, pinned packages, shadcn, AGENTS.md, CI, config, and a liveness-only `/api/health` | The Vercel import right after it makes the first production deploy |
| about 09:50–09:55 | `lane-lead-contracts`: the minimum that compiles all four first branches (4.3, D44): `src/contracts/`, the stubs in 4.3 with their final props (D97), `src/db/ids.ts` (D100), `src/lib/fonts.ts`, PRODUCT.md, DESIGN.md, the `globals.css` token layer, and the `flags` summary in `/api/health` | Every lane builds on it. Worktrees are cut from `main` right after it merges, and lanes start at about 09:58–10:05 (D70) |
| about 10:30 | `lane-d-render-probe` (out of batch) | Linux Chromium can only be checked on production (export-and-recovery.md 3.6) |
| about 10:30 | `lane-lead-contracts-2`: the card-import contract with `image_extraction_provider`'s key (D115), the `team` read model and household link fields (D99), and the metadata no first branch needed (D44) | Merged at once, like every contracts follow-up |
| 10:45, 11:40, 12:30, 13:45, 14:30 | Batches, always **A → B → C → D** | B, C and D depend on A's schema and services; at 11:40 Lane A's PRs merge ahead of Lane D's (D102). What each batch takes is below |
| 11:40, first in the batch | A lead PR with `scripts/seed-assets/couple-photo.jpg`, committed by 11:00 | L runs the seed's photo step for every copy right after the 11:40 deploy, so the 11:50 card and every D0 have the photo (D107) |
| any time | `lane-lead-contracts-<n>`, or a fix that unblocks the demo path | Merged at once; then every session merges `origin/main` |

**What the later batches take:**
- **12:30:** the Must screens' minimums, unconditionally: the minimum Guests screen (AT-4.7, AT-4.8) and the minimum Invite studio (AT-7.1's typed path: the style, and the couple photo through A6's upload). The studio minimum extends Lane D's Invite page from `lane-d-publish` (11:40). Polish goes in 13:45 (decision D105). D56's "if L cannot verify Must 1–9 by 13:00, #11 is future scope" still stands.
- **13:45:** demo-path fixes first (any lane), then Must polish, then Should work that passed its gate. A Should PR merges at 13:45 only if L's post-12:30 demo-path run (D46) passed and the PR's own checks are green; otherwise it moves to 14:30 or becomes future scope. That covers Lane A's and Lane B's Should topics (Overview, Shagun with D65's deadline, the seeded card), `lane-c-judge-panel` and the Invite studio polish (decision D106).
- **14:30, the last batch:** the Should voice items (SH-01, SH-02, D65), PDF if approved (D66), and fixes. Freeze at 14:45 (D106).

**Lane C and Lane A's schema** (decision D96). Lane A pushes `lane-a-schema` (`src/db/schema.ts` and the first migration) as a draft PR by 10:20. Lane C merges `origin/lane-a-schema` into `lane-c-voice` (merge commits only) and writes `voice_turns` through it; before 10:20 it builds the pipeline on fixtures. L merges Lane A's PRs first in the 10:45 batch, so C's PR then shows only C's own diff. If `lane-a-schema` isn't pushed by 10:25, C's 10:45 PR keeps `voice_turns` writes behind its own small store interface with an in-memory fake, and the real write moves to 11:40.

**Before a PR joins a batch,** its session:
1. merges `origin/main` into its branch;
2. runs `npm run check`, `npm test` (plus `npm run test:db` if it has database tests, D103), `npm run build` and its own `e2e/lane-<letter>.spec.ts` against its own dev server, with `E2E_BASE_URL` set to its port (6.7);
3. pushes, waits for CI to go green, and marks the draft PR ready with `gh pr ready` (6.2).

**Done-checks come in two parts** (decision D104):
1. Before the PR is marked ready, the check passes on fixture services or injected dependencies, on the lane's own copy.
2. After the batch deploys, the lane merges `origin/main` and reruns the real-data part on its own rehearsal copy, or on production where its brief says so. A failure there becomes the first item of the next batch; it doesn't hold the current one.

L never holds a batch for a real-data check, except D46's demo-path checks (6.7). Examples: Lane D's REV-3 at about 11:50 on production (D41, D107) and Tara's double tap after the 12:30 deploy; Lane C's AT-2.4 RSVP half after 12:30; A5 checks `submit_rsvp` idempotency with a `*.db.test.ts` on copy `a`.

**During a batch, the lead:**
1. merges the ready PRs in order;
2. on `main`, in the repo root, runs `npm ci`, `npm run check` and `npm run build`;
3. waits for the production deploy, checks that `/api/health` serves the merge's commit SHA (and, from the 10:45 batch on, `flags.ok` true, flagsmith.md 6.7), then runs that batch's staged production check (6.7);
4. tells the sessions to merge `origin/main` and rerun the real-data part of their done-checks (D104).

A conflict in a file the session doesn't own means a rule was broken, and the file's owner resolves it.

### 6.5 Vercel: production from `main`, no previews

**Decision.** Build only production. Test locally before a merge and on production after it. Leave Deployment Protection at its default (Standard Protection), because no preview deployment ever exists, so no bypass secret is needed.

**How:**
- `vercel.json` sets `regions` to `bom1` and sets `git.deploymentEnabled` to false for the minimatch pattern `lane-*`.
- `main` deploys to production on every merge.

**Why:**
- **Hobby builds one deployment at a time** (Vercel docs, build queues). Different branches don't skip each other, so four busy lanes pushing previews would sit in the queue ahead of production builds.
- **Previews would be useless to the callers that matter.** Standard Protection covers every deployment URL except production domains, so a preview would not serve phones, NudgeBee or the Chromium self-call without a bypass header.
- **Bursts on one branch collapse.** Vercel finishes the running build, skips the queued older commits and builds the newest (the Git branch queue rule). A batch of merges therefore costs at most two production builds. `github.autoJobCancelation` stays at its default.

**Public URLs before a merge** come from a cloudflared quick tunnel to the session's own dev server (6.6). That serves phones, and Lane D can point NudgeBee's base-URL Config at its tunnel for a dry run. Linux Chromium is the one thing that needs production, hence D's early probe merge.

**Project setup at about 09:32, in the dashboard, by the user** (decision D5):
- Add New → Project → Import `omiiii21/Jashn`. This installs the Vercel GitHub app on the repo. Framework Next.js, default settings, production branch `main`.
- Node.js 24.x in the project settings (`engines` pins it too), confirmed with `vercel project inspect` or by the user on the Settings page at 09:32 (D119). Fluid compute on, which is the default.
- The user also adds one Production variable by hand: `NEXT_PUBLIC_FLAGSMITH_ENVIRONMENT_ID`, the Production client-side key (D119).
- The import builds the scaffold, which reads no env vars. L adds the other Production env vars from section 5 straight after, at about 09:35, with `npx vercel@66.6.0 env add` from `~/jashn-vercel-cli` (5.1); the dashboard is the fallback. They apply from the next deployment, the contracts merge at about 09:50–09:55.
- **No Ready production deploy** by 09:50, or by 10:40: section 8 row 10 (D119).
- **Firewall:** leave Attack Challenge Mode and any bot-protection rules off, so NudgeBee's calls to `/api/ops/*` are never challenged (domain 6.4).

**Budget:** at most about 50 merges in the day, under the 100 deployments a day even if skipped builds count.

**If a production build fails,** the last good deployment keeps serving. The lead fixes forward with a `lane-lead-fix-<n>` PR, or reverts the merge commit through a PR.

**Logs:** Hobby keeps runtime logs for one hour, so evidence lives in app tables: export attempts, `voice_turns` and activity entries.

### 6.6 Phone testing over HTTPS

- **Default: the production domain on both phones.**
  - It is HTTPS, and the microphone needs a secure context.
  - It is one stable origin, so each phone asks for the microphone once.
  - Bookmark it at 09:30.
- **Local iteration: a Cloudflare quick tunnel** to the session's dev server. It needs no account.
  - It gives a random `https://*.trycloudflare.com` URL.
  - `next.config.ts` lists `*.trycloudflare.com` in `allowedDevOrigins`.
  - Sign in again on that origin, and expect a new microphone prompt for each new hostname.
  - It has no uptime guarantee and allows 200 in-flight requests.
  - Set `APP_BASE_URL` to the tunnel URL while testing absolute links.
  - If server actions reject the tunnel's origin, add the tunnel host to Next's server-actions allowed-origins setting (see `node_modules/next/dist/docs`).
- **Not:**
  - a LAN IP over http (no microphone);
  - `next dev --experimental-https` (phones won't trust its certificate);
  - ngrok free (an interstitial page).
- **Device matrix:** research-stack §8, item 6. iPhone Safari, Android Chrome and laptop Chrome, each covering the first permission prompt, a 5 s Hinglish clip, reply playback, a second clip with no new prompt, and backgrounding the tab.

Run at 09:00 or later (Lane C's port shown; use your own):

```bash
npm run dev -- --port 3003
cloudflared tunnel --url http://localhost:3003
```

### 6.7 Playwright for the demo path

- **Package and browser.** `@playwright/test` 1.65.1 with `channel: 'chrome'`, which uses the installed Google Chrome. Never run Playwright's browser download.
- **Config** (lead):
  - `playwright.config.ts` loads `.env.local` (decision D120).
  - The base URL comes from `E2E_BASE_URL`, defaulting to `http://localhost:3000`.
  - Two projects: desktop Chrome for the owner, and Chrome with a 390 × 844 touch viewport for the manager and the guest.
  - Traces are kept on the first retry. Retries: 1 against production, 0 locally.
- **Global setup belongs to the lead's demo-path project only** (decisions D46 and D54). It runs as a setup project that only the demo-path projects depend on, so a lane spec never triggers it. It works on the **`e2e` copy only, never the demo copy:**
  1. Sign in `mira.e2e@example.com` and `diya.e2e@example.com` through the login page, and save their sessions under `e2e/.auth/` (gitignored).
  2. Run `reset_demo` on the `e2e` copy through the command route, as its owner.
  3. From the 12:30 batch on only (Lane A's `create_invitation_links` ships in A5 at 12:30): rotate household H16's link with `rotate` true, and keep the URL from the response for the guest steps.
- **Lane specs.** Each lane's `e2e/lane-<letter>.spec.ts` sets `E2E_BASE_URL` to its own port (3001–3004) and exercises what that lane's open PR delivers. Lane D's probe spec runs with no seeded data and no login. Lane test data (decision D120):
  - The lane starts its own dev server first (`npm run dev -- --port 300N`, in the background).
  - Its spec signs in or signs up its own `@example.com` accounts through the login page, with its own storage state. It never touches `e2e/.auth/` or the `e2e` copy.
  - Fresh internal owners sign up as `setup-<lane>-<HHMM>@example.com`. AT-1.7's non-internal tester is `nonint-c-<HHMM>@example.net`, on local dev only, never on production.
  - A lane may run `reset_demo` on its own rehearsal copy only, as that copy's owner (`checkpoint` d0, `confirm_text` RESET). The demo and `e2e` copies stay L's (D17).
  - If copies `c` and `d` aren't seeded by 10:45, Lanes C and D read the `e2e` copy (GETs only) and use fixtures for writes until 11:40. A5's checks run on copy `a`, not the `e2e` copy.
- **Staged production checks,** one per batch (D46). L records which steps passed before calling the path ready at 13:45:

  | After | L checks on production |
  |---|---|
  | 10:45 | Sign-in, and `/api/health` with the served SHA |
  | 11:40 | A persisted payment correction (step 2 below); at about 11:50, Lane D's real Lotus Hall publish and PNG download on copy `d`, through the command route and D's own Invite page (D41, D107) |
  | 12:15 | Whichever voice, audio and renderer checks exist by then: the renderer gate, and the capture and Bulbul-audio test. The two-device smoke test first runs after the 12:30 deploy, at about 12:35–12:55 (D111) |
  | 12:30 | The served SHA; then the H16 rotation and the connected demo-path spec on the `e2e` copy. It must include a refresh, a second session, exactly one RSVP and the guest-privacy check |
  | 13:45, 14:30 | The full demo-path spec again |
- **The demo-path spec** (lead) drives forms and buttons only, with no microphone, so it doesn't depend on Sarvam. Each step checks the numbers in demo-data §9.3:
  1. The caterer's balance reads ₹1,50,000 (O-01's answer).
  2. Correcting PAY-01 to ₹40,000 leaves ₹1,60,000, and PAY-01 has exactly two versions (X-01).
  3. The manager moves the reception to Lotus Hall, and the owner's activity feed shows the line within 5 s.
  4. The guest page still shows Banyan Hall.
  5. The owner publishes.
  6. After a reload, the guest page shows Lotus Hall.
  7. The guest taps Attending twice. The count reads 230 once, and the estimate of ₹1,84,000 sits beside the ₹2,00,000 contract (X-02).
  8. The guest token on a planner or money URL gets no data.
  9. On production only, an export job reaches `succeeded`.
  10. `/api/health` reports `flags.ok` true, from the 10:45 batch on, once `lane-c-voice` has merged (decision D12; flagsmith.md 10.2).
- **Voice is tested by Lane C,** not in this spec: fixture mode locally (`VOICE_FIXTURE_MODE=on`), and Chrome's fake audio-capture flags with a recorded WAV for the real pipeline.
- **When it runs:**
  - each session runs its lane spec against its own port before marking a PR ready;
  - the lead runs the staged check after every batch (above), the full demo path from the 12:30 batch on, before the 14:45 freeze, and before each recording take.

Run at 09:00 or later (Lane B's port shown; each lane uses its own, 3001–3004). The first line runs in the background (D120):

```bash
npm run dev -- --port 3002
E2E_BASE_URL="http://localhost:3002" npx playwright test e2e/lane-b.spec.ts
```

Run at 09:00 or later (lead, from the 12:30 batch on):

```bash
E2E_BASE_URL="https://<production-domain>" npx playwright test e2e/demo-path.spec.ts
```

---

## 7. Scaffold traps from research-stack.md, each with its fix

### 7.1 The traps

Every fix below runs at 09:00 or later.

| # | Trap | Fix, run at 09:00 or later |
|---|---|---|
| 1 | create-next-app refuses this folder, because `README.md` and `.env.local` exist. Its allow-list covers only `.git`, `.gitignore`, `docs` and `.claude` | Scaffold in the sibling folder `~/Desktop/Personal/jashn-scaffold`, rsync into `Jashn` excluding `.git`, `.gitignore` and `README.md`, then delete the sibling (7.2, step 2) |
| 2 | create-next-app 16.4.6 turns Cache Components on. Then `cookies()` outside Suspense is a build error, and the `runtime` export is banned | Pass `--no-cache-components`. Check that `next.config.ts` has no `cacheComponents` entry. AGENTS.md bans `'use cache'` |
| 3 | shadcn now defaults to Base UI | Run `shadcn@4.23.0 init --base radix`. If init can't find Tailwind (Turbopack loader, no PostCSS config), rerun it without `--yes` and point it at `src/app/globals.css` |
| 4 | postgres.js 4 breaks Drizzle, and npm latest is 4.1.1 | Install `postgres@3.4.9` with `--save-exact`; `npm ls postgres` must print 3.4.9 |
| 5 | Vercel defaults to Node 26 | `npm pkg set engines.node=24.x`, and choose Node.js 24.x in the Vercel project settings |
| 6 | The Drizzle docs site shows v1 (1.0.0-rc.6) syntax | Pin drizzle-orm 0.45.4 and drizzle-kit 0.31.11. Use the core query builder with explicit joins. When an example fails, read the types in `node_modules` |
| 7 | npm latest is TypeScript 7.0.2, ESLint 10.15.0 and Tailwind 4.3.5 | Keep the template's 5.9.3, 9.39.5 and 4.3.3; check with `npm ls` |
| 8 | The newest Chromium releases: @sparticuz/chromium 158.0.0 (24 Nov) and puppeteer-core 25.18.1 | Install 153.0.0 and 25.11.0 exactly |
| 9 | research-stack §4 lists the deprecated `flagsmith-nodejs` 8.1.2, which can't send experiment events | Install `@flagsmith/nodejs@9.5.0` instead, with no browser SDK. The fallback pin is 9.4.0, which loses `reason` |
| 10 | The template's `@types/node` is ^20 | Install 24.19.2 exactly |
| 11 | `server-only` throws in plain Node (tsx scripts, Vitest) | Keep it out of `src/db/`. Scripts never import `src/server/`. `vitest.config.ts` aliases `server-only` to an empty module |
| 12 | `next lint` is gone in Next 16 | The `lint` script runs ESLint directly (the template's default); `check` runs typecheck plus lint |
| 13 | Two `next dev` runs can't share a folder, and Turbopack won't resolve a symlinked `node_modules` | One worktree per session, each with its own `npm ci`, on ports 3001–3004 |
| 14 | `middleware.ts` is now `proxy.ts`, and with `src/` it lives in `src/` | Lane A creates `src/proxy.ts`, with the matcher exclusions from 2.1 |
| 15 | `cookies()`, `headers()`, `params` and `searchParams` are async only | AGENTS.md rule 3 |
| 16 | Server actions accept only 1 MB bodies by default | Files never go through server actions: audio goes to `/api/voice/turn`, printed-card photos to `/api/card-imports`, stored images to signed uploads |
| 17 | Vercel functions run in UTC | Format every date and time in Asia/Kolkata; store instants as timestamptz |
| 18 | Google Fonts keeps ₹ out of the `latin` subset | `src/lib/fonts.ts` loads latin, latin-ext and devanagari for every family |
| 19 | Supabase requires email confirmation by default, and its mailer sends only 2 emails an hour | Switch "Confirm email" off: L through the Management API if `SUPABASE_ACCESS_TOKEN` is present, otherwise the user's one dashboard click (3.5, D116). Create the demo users with the Auth admin API in the seed |
| 20 | The direct database host is IPv6-only, and the transaction pooler has no prepared statements | Runtime uses `DATABASE_URL` (6543) with prepared statements off; migrations and seed use `DATABASE_URL_SESSION` (5432) |
| 21 | The Vercel CLI isn't installed globally, and research-stack's `vercel git connect` can fail before the Vercel GitHub app is installed | Run it as `npx vercel@66.6.0`, already logged in as omiiii21 (D5); never install it. The user creates the project by the dashboard import (6.5). L adds env vars with the CLI from `~/jashn-vercel-cli`. Only if the import fails twice, L tries `npx vercel@66.6.0 git connect` once the GitHub app is installed |
| 22 | gh's active account isn't omiiii21 | Prefix every gh command with `GH_TOKEN` from `gh auth token --user omiiii21`, and pass `--repo omiiii21/Jashn`. `git push` already authenticates as omiiii21 |
| 23 | The repo already exists (origin plus 3 commits on `main`), so research-stack's `gh repo create` would fail | Skip it. All work goes through branches and PRs |
| 24 | Squash or rebase merges break a branch cut from an open PR | Merge commits only; turn squash and rebase merging off (6.3) |
| 25 | The commit-msg hook rejects any message containing "claude" | Never name `CLAUDE.md` or `CLAUDE.local.md` in a message |
| 26 | research-stack's AGENTS.md rule 10 adds an AI co-author footer to every commit | Replace it with rule 12 in 7.3 |
| 27 | Next refuses two different names for one dynamic segment (`[wedding_id]` in one lane, `[weddingId]` in another), and the build fails | Use exactly the segment names in 4.1 (AGENTS.md rule 15) |
| 28 | research-stack's env loop pushes retired names and the Development Flagsmith key to Vercel | Add each name marked "Yes" in 5.1, Production only. `FLAGSMITH_SERVER_KEY` gets the Production server key. `NEXT_PUBLIC_FLAGSMITH_ENVIRONMENT_ID` gets the Production client-side key from the user, by hand at the import, and L's loop skips it (D119) |
| 29 | Link prefetch would render `/setup` and record experiment exposures | Prefetch off on every link to `/setup` (Lane C; flagsmith.md 5.3) |
| 30 | A static route would freeze flag values at build time | Every flag-reading route is dynamic; the `next build` route table must show them as ƒ |
| 31 | Playwright's default browser download is large on venue Wi-Fi | `channel: 'chrome'`; never run the install step |
| 32 | shadcn ships Lucide, but the design locks Phosphor | Install `@phosphor-icons/react@2.1.10`; app code imports Phosphor only |

### 7.2 The lead's 09:00 sequence

**Step 1, about 09:05. Notes PR,** right after step 0, the user's force-push (PLAN, build-kickoff step 0), and after the 09:03 scheduled prompt (decision D11). Run at 09:00 or later:

```bash
cd "$HOME/Desktop/Personal/Jashn"
git switch -c lane-lead-notes
git add docs/prep
git commit -m "Add pre-hackathon notes and build specs"
git push -u origin lane-lead-notes
GH_TOKEN="$(gh auth token --user omiiii21)" gh pr create --draft --repo omiiii21/Jashn --base main --head lane-lead-notes --title "L: pre-hackathon notes and build specs" --body "Notes, research and specs written before 09:00. No code."
GH_TOKEN="$(gh auth token --user omiiii21)" gh pr ready lane-lead-notes --repo omiiii21/Jashn
GH_TOKEN="$(gh auth token --user omiiii21)" gh pr merge lane-lead-notes --repo omiiii21/Jashn --merge
git switch main && git pull --ff-only && git switch -c lane-lead-scaffold
```

**Step 2, 09:06. Scaffold in a sibling folder and copy it across.** Run at 09:00 or later:

```bash
cd "$HOME/Desktop/Personal"
npx --yes create-next-app@16.4.6 jashn-scaffold --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --no-cache-components --no-react-compiler --agents-md --no-agent-feedback --disable-git --skip-install --yes
rsync -a --exclude .git --exclude .gitignore --exclude README.md jashn-scaffold/ Jashn/
rm -rf jashn-scaffold
cd Jashn
```

**Step 3, 09:06. Package metadata.** Run at 09:00 or later:

```bash
npm pkg set name=jashn engines.node=24.x
npm pkg set "scripts.typecheck=tsc --noEmit" "scripts.check=npm run typecheck && npm run lint" "scripts.db:generate=drizzle-kit generate" "scripts.db:migrate=drizzle-kit migrate" "scripts.db:seed=tsx scripts/seed.ts" "scripts.test=vitest run --passWithNoTests" "scripts.test:db=RUN_DB_TESTS=1 vitest run" "scripts.e2e=playwright test"
```

Then add these ignore rules to `.gitignore`:
- `*.pem`
- `*.local.md`, which covers `demo-links.local.md`
- `CLAUDE.md` and `CLAUDE.local.md`, named explicitly (decision D1)
- the whole `.claude/` folder (it already holds a lock file, and later the Stop hook in `settings.local.json`) and `.impeccable/` (D1)
- `e2e/.auth/`, `playwright-report/` and `test-results/`

`git check-ignore -v CLAUDE.md CLAUDE.local.md .claude/scheduled_tasks.lock .impeccable/x .env.local` must print a rule for each. It tests `.impeccable/x`, a path inside the folder, because `.impeccable/` matches only a directory that exists, and the folder doesn't exist before the 09:10 design round (decision D119).

`.env.local` is already covered by `.env.*`. That rule also matches `.env.example`, so add the exception `!.env.example` after it (decision D51).

**Step 4, 09:08. Pinned install.** Only the lead installs. Run at 09:00 or later:

```bash
npm install
npm install --save-exact @supabase/supabase-js@2.119.2 @supabase/ssr@0.12.7 drizzle-orm@0.45.4 postgres@3.4.9 zod@4.6.7 sarvamai@1.1.22 @flagsmith/nodejs@9.5.0 puppeteer-core@25.11.0 @sparticuz/chromium@153.0.0 server-only@0.0.1 @phosphor-icons/react@2.1.10
npm install --save-exact -D drizzle-kit@0.31.11 @next/env@16.4.6 tsx@4.23.15 vitest@5.1.1 @types/node@24.19.2 @playwright/test@1.65.1
npm ls next react tailwindcss typescript eslint drizzle-orm postgres @flagsmith/nodejs @sparticuz/chromium puppeteer-core
```

**Alongside steps 4–7, 09:10–09:27. Design direction round, in the lead session with the user** (decision D3; build-kickoff step 6).
- L runs the impeccable init (it writes PRODUCT.md) and its direction step, with design-direction.md as the input.
- The user picks the direction during the round, in about 15 minutes. That pick is the approval. L writes DESIGN.md from it, then the `globals.css` token layer (D4).
- PRODUCT.md and DESIGN.md stay out of the scaffold commit and merge in the contracts PR (step 10). Lane B owns both afterwards.
- No pick by 09:45: commit both marked "Proposed"; the user approves one screen at the 10:45 batch.
- L keeps its turns short, answers the user's design messages first, and runs the other steps in between, with long commands in the background (decision D119).

L also runs Sarvam T0–T4 at about 09:14, in the background while the install runs (section 8 row 3).

**Step 5, 09:15. shadcn on Radix.** Start it only after step 4's install passes its `npm ls` check. If the install is still running at 09:15, write step 6's config files first (decision D119). Run at 09:00 or later:

```bash
npx --yes shadcn@4.23.0 init --base radix --yes --no-monorepo
npx --yes shadcn@4.23.0 add button card input label textarea select checkbox switch dialog sheet tabs badge separator skeleton table sonner dropdown-menu avatar tooltip popover scroll-area --yes
```

**Step 6, 09:16. Config files.** The lead's session writes these; still no feature code.
- `AGENTS.md`: our rules from 7.3, below Next's managed block. This is the committed rules file.
- `CLAUDE.md`: one line pointing to AGENTS.md. It is local and gitignored, never committed (D1); step 11 copies it into each worktree.
- `.env.example`: the names from 5.1.
- `src/app/api/health/`: liveness only, 200 with the commit SHA. The `flags` summary arrives with the contracts PR (decision D12). One unit test next to it checks that response, so CI has a test from the first PR (decision D42).
- `vercel.json`: `regions` set to `bom1`; Git deployments off for `lane-*`.
- `next.config.ts`:
  - keep the Turbopack CSS rule that create-next-app wrote;
  - add `allowedDevOrigins` for `*.trycloudflare.com`;
  - add the three privacy headers on `/i/:path*`, `/api/i/:path*` and `/render/:path*`;
  - nothing for Chromium yet: Next already treats both packages as server-external, and the file-tracing include comes only if the 10:30 probe reports a missing file (2.2).
- `vitest.config.ts`, with the `server-only` alias (trap 11). It excludes `*.db.test.ts` unless `RUN_DB_TESTS=1`, and loads `.env.local` with `@next/env`'s `loadEnvConfig` (6.3, decision D103).
- The CI workflow and PR template (6.3).
- `playwright.config.ts` (6.7), which loads `.env.local` (D120).

**Step 7, 09:20. Check, commit, push and open the PR.** Run at 09:00 or later:

```bash
npm run check && npm test && npm run build
git check-ignore -v .env.local
git status --short
git add -A -- . ':!PRODUCT.md' ':!DESIGN.md'
git commit -m "Scaffold Next.js 16.4.6 with pinned packages, agent instructions and deploy config"
git ls-files --error-unmatch .env.example
git push -u origin lane-lead-scaffold
GH_TOKEN="$(gh auth token --user omiiii21)" gh pr create --draft --repo omiiii21/Jashn --base main --head lane-lead-scaffold --title "L: scaffold with pinned packages and deploy config" --body "Scaffold only; no feature code."
```

`npm test` is the same `vitest run --passWithNoTests` command CI runs (D42). `git check-ignore` must print the `.env.*` rule, and `git ls-files` must print `.env.example`, which proves the values-free setup file is tracked (decision D51). `git status --short` must show no `.env.local`, `CLAUDE.md`, `CLAUDE.local.md`, `.claude` or `.impeccable` path (D1), and the commit leaves PRODUCT.md and DESIGN.md for the contracts PR (D3).

**Step 8, 09:22. GitHub settings, env file changes and the Supabase check.** This runs while CI checks the PR.
1. Apply 6.3: the repo settings, and the ruleset with `gh api` (decision D69).
2. In the main `.env.local`, never printed: L appends `RENDER_TOKEN_SECRET` and `FLAGSMITH_ID_SALT`, generated straight into the file, and `DEMO_RESET_ENABLED` (5.1; build-kickoff step 10). The user types `SEED_PASSWORD` (a passphrase they choose and save in their password manager) and `INTERNAL_USER_EMAILS` in an editor at 09:27. If `SEED_PASSWORD` is still unset at 09:50, L generates one and the user copies it into the password manager (decision D118).
3. "Confirm email": if `SUPABASE_ACCESS_TOKEN` is in `.env.local`, L turns it off through the Management API; otherwise it stays the user's one dashboard click (3.5, decision D116). Then run the 09:25 database check and the Auth check (section 8, decision D68), and flagsmith.md's FV1 warehouse check (its 7.5).

**Step 9, 09:28. Merge the scaffold once CI is green (decision D42); the user imports the project into Vercel at about 09:32.** Run at 09:00 or later:

```bash
GH_TOKEN="$(gh auth token --user omiiii21)" gh pr ready lane-lead-scaffold --repo omiiii21/Jashn
GH_TOKEN="$(gh auth token --user omiiii21)" gh pr merge lane-lead-scaffold --repo omiiii21/Jashn --merge
git switch main && git pull --ff-only
```

Then 6.5: the user imports the project in the dashboard at about 09:32, sets Node 24.x and adds `NEXT_PUBLIC_FLAGSMITH_ENVIRONMENT_ID` by hand; L adds the other Production env vars with the CLI at about 09:35 (D5, D119). Open the production URL on both phones and bookmark it.

**Step 10, 09:35–09:55, merged at about 09:50–09:55. Contracts PR** (decision D121 sets the writing window). Write the contracts on `lane-lead-contracts` (4.3): only the minimum that compiles all four first branches (D44). Then commit, push, open the draft PR, mark it ready and merge it, as in steps 7 and 9. The PR also carries PRODUCT.md and DESIGN.md from the design round (D3), the `globals.css` token layer (D4) and the `flags` summary in `/api/health` from the stub (D12). The card-import contract and the remaining metadata follow in `lane-lead-contracts-2` at about 10:30.

**Step 11, right after the contracts merge (about 09:50–09:55). Worktrees from the updated `main`** (decision D70). Start the worktree installs at once; the Vercel deploy of the merge finishes in parallel, and only Lane D's production probe waits for its deployed SHA (D44). Run at 09:00 or later:

```bash
git switch main && git pull --ff-only
git worktree add ../jashn-a -b lane-a-schema main
git worktree add ../jashn-b -b lane-b-shell main
git worktree add ../jashn-c -b lane-c-voice main
git worktree add ../jashn-d -b lane-d-render-probe main
```

Then copy the env file into each worktree without the admin-only secrets (5.3). It prints nothing. Run at 09:00 or later, once each for `jashn-a`, `jashn-b` and `jashn-d` (`jashn-a` shown):

```bash
grep -v -E '^(SUPABASE_ACCESS_TOKEN|SUPABASE_DB_PASSWORD|FLAGSMITH_SERVER_KEY_PRODUCTION|NUDGEBEE_AGENT_AUTH_KEY|FLAGSMITH_ORG_API_KEY|FLAGSMITH_SERVER_KEY_SYNTHETIC)=' .env.local > ../jashn-a/.env.local
```

Lane C's copy keeps `FLAGSMITH_SERVER_KEY_SYNTHETIC` for the synthetic run (flagsmith.md 5.8). Run at 09:00 or later:

```bash
grep -v -E '^(SUPABASE_ACCESS_TOKEN|SUPABASE_DB_PASSWORD|FLAGSMITH_SERVER_KEY_PRODUCTION|NUDGEBEE_AGENT_AUTH_KEY|FLAGSMITH_ORG_API_KEY)=' .env.local > ../jashn-c/.env.local
```

Then, in each worktree:
1. Add the lane's `APP_BASE_URL`, plus `CHROME_EXECUTABLE_PATH` for Lane D, in an editor.
2. Run `npm ci`.
3. Copy in the local, gitignored agent files (D1): `CLAUDE.md` from the repo root, `CLAUDE.local.md` from `docs/prep/lanes/lane-<letter>.md`, and `.claude/settings.local.json` with the Stop hook, which L writes once in `jashn-a` and then copies to B–D; `.impeccable/` for B and D only, and only if it exists (build-kickoff step 18, decision D119).
4. At about 09:58–10:05, once the contracts PR has merged, the user starts one coding session per worktree and pastes its start prompt (build-kickoff §5; decision D10).

### 7.3 AGENTS.md rules

These replace research-stack §5.

1. **Next.js API use.** This is Next 16.4.6. Read `node_modules/next/dist/docs/` before using any Next.js API.
2. **Runtime and caching.** Node runtime only; never `runtime = 'edge'`. Cache Components are off, so never add `'use cache'`.
3. **Async request APIs.** Use `await cookies()`, `await headers()` and `await params`. Session refresh lives only in `src/proxy.ts`.
4. **One write path, one read path.**
   - Every write goes through the dispatcher, with a command from `src/contracts/commands.ts`, an idempotency key and a `source`.
   - Forms submit through the one server action, `dispatchCommand` from `src/server/actions/dispatch.ts`. Client components never import `src/server/`, so a server component passes `dispatchCommand` to the client form as a prop. Never write your own command wrapper. Sign-in, sign-up and sign-out stay Lane A's own actions, and the flag drawer's actions stay in Lane C's `flags/` (decision D98).
   - Every page read goes through a read model that returns a DTO.
   - No database or Supabase data call happens in the browser.
5. **Server-only code.** Every file in `src/server/` starts with the `server-only` import. No `'use client'` file imports `src/server/`, `src/db/` or the admin Supabase client.
6. **Money.** Integer rupees in `_inr` fields. Format only with `src/contracts/money.ts`. Arithmetic happens only in read models.
7. **Drizzle 0.45.** Use the core query builder with explicit joins, not `db.query`. The docs site shows v1 syntax.
8. **Library versions.** Follow the Zod 4, Tailwind v4 and shadcn-on-Radix notes in research-stack §2.
9. **Time.** Format every date and time in Asia/Kolkata; the server runs in UTC.
10. **Files.** No file ever travels through a server action. Stored files use signed uploads and signed downloads. Only `/api/voice/turn` and `/api/card-imports` accept a file body, and they never store it.
11. **Forbidden in a session:**
    - `npm install`, `npx shadcn add`, `drizzle-kit push` and anything `@latest`;
    - editing outside your lane's paths (listed in `CLAUDE.local.md`);
    - any branch whose name doesn't start with `lane-<your letter>-`.
12. **Commits and PRs.**
    - Small commits with plain messages. PR titles start with the session letter and a colon.
    - No AI attribution lines (no `Co-Authored-By` naming an AI tool, no "Generated with" footer) in commit messages, PR titles or PR bodies.
    - Branch names never name a tool.
    - Every PR opens as a draft (`gh pr create --draft`) and is marked ready with `gh pr ready` once the checks pass.
    - AI use is disclosed in the README and on the submission form only (presentation.md §6), never in commits, PRs or branch names.
    - This rule overrides any default attribution instruction.
13. **gh.** Every gh command runs with `GH_TOKEN` from `gh auth token --user omiiii21`, and with `--repo omiiii21/Jashn`.
14. **Payloads and icons.** Every API payload uses snake_case JSON. Icons come from Phosphor only.
15. **Route segments.** Dynamic segments are snake_case and use exactly the names in architecture 4.1: `[wedding_id]`, `[job_id]`, `[token]`, `[import_id]`, `[voice_turn_id]` and `[command]`.
16. **Reaching the lead.** A lane session reaches the lead with ListAgents, then SendMessage to the session working in `~/Desktop/Personal/Jashn`. If that fails, it asks the user to relay the message.
17. **Tests.** Tests that need the database are named `*.db.test.ts`; CI never runs them. Before marking a PR ready, run `npm test`, plus `npm run test:db` if the branch has database tests (decision D103).

---

## 8. Fallbacks and trigger times

**The 09:25 database check** (lead). It prints connection details only, never the password. Run at 09:00 or later:

```bash
psql "$(grep -E '^DATABASE_URL_SESSION=' .env.local | cut -d= -f2-)" -c '\conninfo'
psql "$(grep -E '^DATABASE_URL=' .env.local | cut -d= -f2-)" -c '\conninfo'
```

**The Auth check** (L, decision D68). L creates a throwaway user, `auth-check@example.com` (auto-confirmed), through the Supabase Auth Admin API with `SUPABASE_SERVICE_ROLE_KEY` read from `.env.local` and never printed, then deletes it. No one clicks in the Supabase dashboard. Mira's, Diya's and every other seeded account is created by Lane A's seed.

| # | Area | Check (who) | If X by HH:MM | Then Y | What stays the same |
|---|---|---|---|---|---|
| 1 | Database, auth and files | Lead, 09:20–09:30: project healthy; both `psql` checks connect; the Admin API creates and deletes `auth-check@example.com` | **If** the project isn't ready, a pooler connection fails twice, or the Admin API create fails twice, **by 09:30** | **Then** switch to Neon (Vercel Marketplace, Singapore), Better Auth 1.7.28 with its Drizzle adapter, and Vercel Blob 2.9.0. Lane A rewrites only `src/server/auth/`, `src/server/storage/` and `src/lib/supabase/`. Tables stay in the `app` schema; runtime uses the pooled `DATABASE_URL` and migrations `DATABASE_URL_UNPOOLED`. Blob URLs are random but public, so the README says so | Contracts, dispatcher, guard, read models, UI, voice, flags, export, jobs, polling |
| 2 | Card renderer | Lane D, from its ~10:30 probe, on production. The next/og renderer ships dormant in the 11:40 batch whatever the probe says, with Chromium still selected, and Lane D rehearses the switch locally (decision D48). If the 10:40 probe fails, the og renderer becomes Lane D's top priority, and Lane D verifies a real PNG from it | **If** no production export of the Lotus Hall card (REV-3, PNG, with both Hindi lines) has succeeded **by 12:15** | **Then** the user (Flagsmith's one seat, D9) sets the flag `card_renderer` to `og` (default `chromium`, flagsmith.md 3.7), with no deploy. That uses next/og with Latin-only dynamic text. The two Hindi lines become a static PNG in `public/card/`, captured from the render page in local Chrome. The README marks dynamic Hindi on the card as Partial | Export jobs, `export_key`, the retry routes, the NudgeBee workflow |
| 3 | Sarvam access | L, at about 09:14, runs T0–T4 (research-sarvam §7) from `~/sarvam-smoke`, reading the key from `.env.local` without printing it, so the teammate needs no Sarvam key. T5 and T6 run from about 10:05 (row 11). Then Lane C (decision D7) | **If** the key fails T0 or the balance is ₹0 (402) **by 09:45** | **Then** Lane C sets `VOICE_FIXTURE_MODE=on` in its worktree: recorded responses for the live lines and the voice-test-set rows, shown in the dock as "Fixture, not Sarvam". The lead tops up or makes a new key, and Lane C turns fixtures off once live calls pass. Production never runs fixtures | The dispatcher path, the review card, the kill switch, the experiment |
| 4 | Live voice quality | Lane C and the lead, voice-test-set runs | **If** the live lines still miss five passes in a row **by 14:45** | **Then** mark voice Partial. Demo those beats by typing (the same commands), plus the labelled rehearsal clip (demo-script §3) | Everything else |
| 5 | Sarvam during the demo | Live | **If** a call returns 402, a 5xx or times out on any beat | **Then** use the typed path at once: "Sarvam timed out; here is the same correction by typing". Never switch to fixtures | – |
| 6 | NudgeBee runner | The teammate runs NudgeBee tests T1, T2 (HTTP step) and T4 (in-app approval) at 09:10–09:28, but only if the user has invited them to the NudgeBee account; otherwise the user runs them from about 10:05, after any unfinished Flagsmith steps A–E (hard limit 10:30), and the kind decision moves with them (export-and-recovery.md 6.7, decisions D8 and D119) | **If** T2 or T4 fails in the account with no agent connected **at 09:30** (about **10:20** when the user runs the tests) | **Then** kind and the agent go on the user's MacBook (15–25 minutes, Docker running), from the main worktree (D119): L runs Docker, `kind create cluster` and the download; the user runs `read -s` and the installation line in a plain Terminal tab, pasting `NUDGEBEE_AGENT_AUTH_KEY`; L runs the kubectl checks. Keep it connected through judging | The app's ops endpoints |
| 7 | NudgeBee reach | Lane D and the NudgeBee operator (the invited teammate, otherwise the user; D72). By 11:10 the user pastes `JOBS_API_TOKEN` into the Secret `jashn_ops_token` (D117). At 11:15 they run an authenticated read against a real Jashn job through Lane D's tunnel; at about 11:50 the same read on production, keeping the first successful run id (decisions D43 and D62) | **If** that read fails through the tunnel **by 11:30**, or from production **by about 11:50**, after the 11:40 batch (decision D13) | **Then** Lane D owns the fix: the exact https URL (no redirect, no challenge), the `jashn_ops_token` Secret and the response shape. A manual start doesn't help here, because it calls the same URL with the same credential. Ask the sponsor's team at once | – |
| 8 | NudgeBee writes | The lead and the user (D43) | **If** the full drill (NB-T10) hasn't passed **by 12:45** | **Then** choose the recording path at 12:45. If only the webhook fails, start the workflow manually (the webhook fallback itself triggers at 12:50, with filter debugging until 13:00 only; D121). If only the retry is broken, record NudgeBee reading the failed job, then the user retrying in Jashn, then NudgeBee reading the completion, and label who retried. Disclose it in the README. 13:00–13:30 stays protected for V15 | – |
| 9 | Flagsmith warehouse | Lane C | **If** it isn't Connected **by 12:30** | **Then** show labelled app-side counts from `experiment_exposures`, and follow research-flagsmith risk R1 | – |
| 10 | Hosting | Lead | **If** no Ready production deploy exists **by 09:50**, or still none **by 10:40** (decision D119); or a Vercel deploy of `main` fails for a platform reason a second time, at any hour (decision D48). Nobody waits for 15:00 | **Then, at 09:50,** L tells Lane D the probe waits, and the user retries the import at 10:05. **At 10:40,** the og renderer becomes Lane D's top priority (D48), and L brings up the tunnel host as below. **After a second platform failure,** L brings up the tunnel at once: build and run `next start` on the laptop behind a cloudflared quick tunnel, and Lane D verifies its authenticated ops endpoint. Tunnel evidence is tracked apart from the still-open Vercel production gate. Both the build and the start get the Production Flagsmith server key and the Production client-side key in `NEXT_PUBLIC_FLAGSMITH_ENVIRONMENT_ID` (flagsmith.md 7.5 command 4, F19). Point NudgeBee's base-URL Config and both phones at the tunnel, and set `APP_BASE_URL`. A quick tunnel has no uptime guarantee and a new hostname on every start, so start it once and leave it | – |
| 11 | Card reading (Should #11) | The teammate or L (T5 at about 10:05–10:15, then T6, once the Arora card image exists; decisions D7 and D119). If the teammate hasn't laid the card out in Keynote or Slides by 09:50, L builds it as an HTML page outside the repo and renders it to JPEG with headless Chrome in `~/sarvam-smoke` at about 10:00–10:05, after the worktrees are cut: a fictional printer proof, never made with an image generator (decisions D73 and D119). Then Lane C and the lead (doc-ai.md 5.1, 5.2) | **If** T5 and T6 both fail at about 10:15, or #11's build hasn't started **by 13:00** (its four build steps take about 80 minutes, doc-ai.md 5.2 and 5.4), or its PR isn't in the **14:30** batch with AC-1 and AC-3 to AC-12 passing locally and AC-2 through the tunnel, or AC-1, AC-2 and AC-9 don't pass on production **by the 14:45 freeze** | **Then** `image_extraction_provider` stays `off` (or is never created), and the README marks #11 Future or Partial | Setup by voice and by hand |
| 12 | Live updates | Lead, at the freeze smoke test and take 1, which doubles as the first stopwatch rehearsal (decisions D50 and D121) | **If** Diya's change takes more than 5 s to reach the owner in both | **Then** the script adds a manual refresh at 1:02 (demo-script §3). Polling stays | – |

---

## 9. Changes needed in domain-and-data.md

domain-and-data.md (checked again at 03:55, unchanged since 03:25) already puts every table in `app`, writes through one dispatcher, reads through read models and polls a version number. These edits remove what is left of the RLS-and-Realtime design and align it with this file and the other specs.

Items 7, 9, 10, 11 and 14 keep the numbers that flagsmith.md, export-and-recovery.md and acceptance.md cite; acceptance.md's "items 9 and 10" are both in item 10 now. export-and-recovery.md §11 lists further export changes, and this file agrees with them.

1. **§0.1, Tables row.** Name only `auth` and `storage` among Supabase's own schemas. `realtime` is unused.
2. **§0.2.** Replace the RLS-and-Realtime bullet with: "RLS is switched on with zero policies on every `app` table, and the API roles have no grants, so the Data API reads nothing. Authorization lives only in the server guard (6.1, 6.2). Live updates are polling only (5.6). Supabase Storage with private buckets."
3. **§3.0, step 7.** Delete "send the Realtime doorbell (5.6)". After commit: the export kick when the command queued a job, the setup-saved conversion (flagsmith.md 5.4) and the spoken reply's read models. The NudgeBee failure webhook is sent by the export worker after a failed attempt (export-and-recovery.md 2.8), not by the dispatcher.
4. **§5.4, and §3.7's `reset_demo` Topic line.** Topics are stored on activity entries only and sent nowhere. Delete "sent as the doorbell's `topic`" and the "`demo.reset` (doorbell only)" entry. `reset_demo` writes no activity; its `version` bump refreshes open screens.
5. **§5.6.** Retitle it "Live updates: polling" and delete the Doorbell bullet: no Broadcast, no `wedding:{wedding_id}` channel, no `realtime.messages` policy and no `supabase_realtime` publication.
   - Keep the planner poll of `GET /api/w/{wedding_id}/version` (every 2.5 s while visible) and the guest poll of `GET /api/i/{token}/revision` (every 10 s).
   - Add that every screen also refreshes when its tab regains focus or becomes visible (flagsmith.md 6.9), except `/setup`, which has no poll and no focus refresh (decision D79).
   - Add that the revision endpoint answers a bad token with the same 404 as the page (G5).
6. **§6.2.**
   - Replace the `auth.uid()` membership predicate with a server-code check: the session's user id (the `sub` claim from `getClaims()`) equals `members.user_id` for that wedding, with `removed_at` empty.
   - Delete the Realtime policy and the Realtime line.
   - Add: no SQL functions, `SECURITY DEFINER` functions, RPCs or database-side JWT checks.
   - The browser holds only `NEXT_PUBLIC_SUPABASE_ANON_KEY`, for the signed upload. Sign-in runs in server actions, so there is no browser Supabase auth client.
7. **Env names, in §0.3, §2.7 G8, §3.0, §3.7, §6.2 and §6.4.**
   - `SUPABASE_SECRET_KEY` becomes `SUPABASE_SERVICE_ROLE_KEY`.
   - `OPS_API_TOKEN` becomes `JOBS_API_TOKEN`, including §0.3's `OPS_RECOVERY_TOKEN` row.
   - `NUDGEBEE_WEBHOOK_URL` becomes `NUDGEBEE_EXPORT_WEBHOOK_URL`.
   - The browser key is `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
   - G8's list gains `FLAGSMITH_ID_SALT`, `FLAGSMITH_SERVER_KEY_PRODUCTION`, `FLAGSMITH_SERVER_KEY_SYNTHETIC`, `FLAGSMITH_ORG_API_KEY`, `INTERNAL_USER_EMAILS` (which holds personal data), `RENDER_TOKEN_SECRET` and `NUDGEBEE_EXPORT_WEBHOOK_URL` (flagsmith.md 10.1, item 9).
8. **§5.0, no triggers and no `auth` foreign keys.**
   - No database trigger or function implements app behaviour. Activity entries, `version` and `draft_version` bumps, `updated_at`, version supersession and receipts are written by the dispatcher in the command's transaction.
   - No foreign key points into the `auth` schema. `members.user_id`, `weddings.created_by_user_id`, `voice_turns.user_id` and `card_imports.user_id` store the Supabase user id without a constraint, because drizzle-kit is limited to `app`.
9. **§3.0 transports.** Add:
   - `POST /api/w/{wedding_id}/exports` for `request_card_export` (owner or manager);
   - `POST /api/w/{wedding_id}/exports/{job_id}/retry` for the owner's Retry button, with `wait` 0 and an `Idempotency-Key` per press;
   - `POST /api/card-imports/{import_id}/apply`, which runs `create_event` per function with keys `{import_id}:{index}` (doc-ai.md 1.5).

   Voice and the generic command route may also run `request_card_export`. The kick after commit starts the worker wherever the command ran, so no transport refuses an export command. The ops-token row also covers the internal worker `POST /api/ops/export-jobs/{job_id}/run`.
10. **Sample copies and seeded ids** (§3.7 `reset_demo`, `weddings.is_sample`, §0.1, §5.0).
    - The seed creates the demo copy (D0, for judging and recording only), rehearsal copies `a` to `d` and an `e2e` copy, all with `is_sample` true.
    - Each rehearsal copy has its own `mira.<copy>@example.com` owner and `diya.<copy>@example.com` manager.
    - `reset_demo` acts on one copy and never touches another.
    - Seeded links are printed once and written to the gitignored `demo-links.local.md`, which is §6.3's "team's demo notes".
    - Live rows keep the `gen_random_uuid()` default. Seeded rows get fixed UUIDv5 ids from the helper `src/db/ids.ts` (namespace `75e13aff-00d4-427e-8e6b-7bd1798f1316`; names as domain 0.1 records them, decision D100), so fixtures, tests and bookmarks agree even after a wipe and reseed.
11. **Storage keys, in §3.2 and §3.7.** Write object keys without the bucket name, as §5.5 does: `{wedding_id}/{asset_id}.{ext}` in `uploads` and `{wedding_id}/card-rev{revision}.png` in `exports`. `assets.storage_path` and `export_jobs.artifact_path` store the key.
12. **Card photos are never stored** (doc-ai.md 3.1). Remove `invite_scan` from `asset_kind` (§3.2, §5.2), the scan activity template in `add_asset`, and §5.5's "An invitation scan goes from the server to Sarvam Document AI". `uploads` holds couple photos only.
13. **§5.1, tables that other specs define,** so Lane A has one list: `experiment_exposures` (flagsmith.md 5.10) and `card_imports` (doc-ai.md 1.8). Neither moves `weddings.version`.
14. **§0.1, Writes row: operational writes.** `voice_turns`, `experiment_exposures`, `card_imports`, `export_jobs` and `export_attempts` are written by their owning server modules, never by the browser. When a screen must change, the same transaction uses Lane A's append-activity and bump-version helpers.
15. **Rate limits** (§3.4 `submit_rsvp`, §6.3; decision D108). Domain 6.3's numbers win: per token hash, about 120 GETs and 30 POSTs a minute, plus a loose 600-a-minute ceiling per IP, counted in memory per server instance by Lane A's one limiter (D57; applied by domain-and-data at 05:05). They are best effort, so a test checks that a burst gets 429s, not which exact request does. On a 429 the guest page backs off to 30 s and keeps its content (decision D90).
16. **§8, question 6, is settled** by spec/flagsmith.md, which is binding for flag names:
    - the flag `voice_pilot` gates the mic and `/api/voice/*` (403 `voice_unavailable`);
    - the flag `spoken_replies` gates spoken replies;
    - `voice_rollout` is the segment.

    `voice_mode` and `voice_tts_enabled` are not created, and demo-script.md needs no change.
17. **§3.0 step 4, and V3.** The dispatcher reads the kill switch through the voice-gate interface in `src/contracts/flags.ts`, which Lane C implements and which fails closed (flagsmith.md 6.8).
18. **§3.7 and §6.4, the export worker and the render page.** Adopt export-and-recovery.md §11, items 3 and 4:
    - Chromium runs only in `POST /api/ops/export-jobs/{job_id}/run`, which commands kick after commit.
    - The claim moves `weddings.version` without an activity entry.
    - The render page is `/render/card/{job_id}?t=…`. Its token signs the job id and the expiry, and the page reads only the job's publication snapshot, `card_event_ids` and `is_sample`.

---

## 10. Open questions for the lead at 09:00

1. **Voice routes: settled.** voice.md 0.2 names all five: `/api/voice/turn`, `/confirm`, `/cancel`, `GET /api/voice/turns/{voice_turn_id}/reply-audio` and `GET /api/voice/turns/{voice_turn_id}/trace` (2.2, 4.1). The fixture switch is `VOICE_FIXTURE_MODE`. There is no `/api/voice/state` route: the dock learns of flag changes from the focus refresh and from each voice response (flagsmith.md 6.9).
2. **Lane C's branches: settled.** Every lane uses topic branches (6.1). flagsmith.md 7.7 lists Lane C's: `lane-c-voice` first, then `lane-c-synthetic-run`, `lane-c-flags-drawer`, `lane-c-setup-experiment` and, for Should #11, `lane-c-card-reader` (doc-ai.md 5.6).
3. **The drill's value: settled.** `export_failure_drill` arms a new job only when the flag is enabled and its value equals that job's wedding id, on an `is_sample` wedding. `EXPORT_FAILURE_DRILL` holds a wedding id and applies only when Flagsmith can't be read. export-and-recovery.md 4.1 and flagsmith.md 3.6, 6.8, 6.10 and 7.4 step B all say this now.
4. **NudgeBee retry timing.** NudgeBee documents the HTTP task's `timeout` option (default 30 s, research-nudgebee F15), the fact that any status of 400 or above fails the step (F16) and the per-task retry policy (F34). None of it has been run on NudgeBee Cloud, and no maximum for the timeout is documented. So the workflow leaves the HTTP steps at the documented 30 s, NudgeBee sends `wait=20`, and the retry route answers within its `wait` window (at most 25 s) inside a 60 s `maxDuration`. Test T5, in the NudgeBee account checks (export-and-recovery.md 6.7), checks the failure policy; ask about a maximum at the 11:10 NudgeBee demo.
5. **Chromium cold start.** Its duration in `bom1` is unmeasured, and so is whether Vercel gives `/run` a function of its own (export-and-recovery.md 13, question 4). Lane D records both from the ~10:30 probe's timing headers, and the lead decides the warm-up routine before the freeze smoke test and take 1 (D50).
6. **Extra sample data: settled (decision D27).** The rehearsal copies `a` to `d` and the `e2e` copy are accepted, each with its own `@example.com` owner and manager. They are fictional and carry the sample badge, and demo-data.md records them.

---

## 11. Changes the other specs need

State at the 04:50 fact-check:

- **flagsmith.md (04:42): nothing outstanding.** Its fourth version applies every earlier request: topic branches and "C:" titles (7.7), the drill value as a wedding id (3.6, 6.8, 6.10, 7.4 step B), Vercel values added straight after the import (6.10, 7.3; decision D71 times the user's import at about 09:32 and L's env vars at about 09:35), and the SDK pin cited as 1.1. This file in turn applies its 10.2 requests: the 60-second cache on the `flags` summary (2.2) and the client-side key at build time in the hosting fallback (section 8 row 10).
- **export-and-recovery.md: nothing outstanding.** This file adopts all of its §12, and its 0.2 table now records that. Its 10.4 has L add the webhook URL with `npx vercel@66.6.0 env add` from `~/jashn-vercel-cli`, with the dashboard as the fallback (1.3, decision D5). Its 5.3 kicks `/run` before the retry's wait loop, as 2.3 says (D53).
- **doc-ai.md: nothing outstanding.** Its 5.3 uses this file's paths (`src/lib/card-import/`, `src/server/card-import/`, `src/components/setup/card-import/`, `public/samples/`), its branch is `lane-c-card-reader`, and its gate times match section 8 row 11.
- **voice.md (04:43): nothing outstanding.** It names the reply-audio and trace routes, keeps `VOICE_FIXTURE_MODE` and has no `/api/voice/state` route.
- **acceptance.md (another workflow owns it; not edited here):**
  - 8.1 items 23 and 24 and 8.2 question 10 are settled: no spec describes `GET /api/flags/health` or `GET /api/voice/state` any more. Check `/api/health`'s `flags.ok`, or the flags drawer's Health part (flagsmith.md 6.7).
  - 8.1 item 19: section 8 row 11 now says 13:00, as doc-ai.md does. Its "AC-1 to AC-12 by 14:30" should read as row 11 does: in the 14:30 batch with the local checks passing, and AC-1, AC-2 and AC-9 on production by the 14:45 freeze.
  - Its "architecture §9, items 9 and 10" is item 10 alone now.
  - Its demo checklist changes are listed in flagsmith.md 10.5.

**05:25 IST, 25 Nov 2026:** the lead's decisions D1, D3, D4, D5, D6, D7, D8, D10, D11, D12, D13, D15, D16, D30, D31 and D39 (`decisions.md`) were applied to this file.

**05:35 IST:** rounds 2 and 3 applied where they touch this file: D41, D42, D44, D46/D54, D47, D48, D51, D52, D53, D57, D58, D59, D63, D66, D67, D68, D69, D70, D73, D79, D90 and D92, plus D18 and D27, and the domain reconciliation's dispatcher lock order and guest rate limits. Where this file still disagrees with `decisions.md`, `decisions.md` wins.

**06:15 IST:** round 4 applied where it touches this file: D95 (4.1, 3.3), D96 (4.3, 6.4), D97 (4.3 stub props), D98 (2.1, 3.3, 4.1, 4.3, 7.3 rule 4), D99 (4.3), D100 (4.1, 4.3, §9 item 10), D101 (2.3, 4.1, 4.3), D102 (3.3, 3.4, 3.6, 3.7, 4.2, 4.3), D103 (6.3, 7.2, 7.3 rule 17), D104 (6.4), D105 and D106 (6.4), D107 (3.3, 3.6, 4.1, 6.4, 6.7), D108 (2.4, 3.4, §9 item 15), D109 (4.1), D110 (3.3), D113 (FV1), D114, D115 (4.3), D116 (3.5, 7.2 step 8), D117, D118 (§0, 5.1, 7.2 step 8), D119 (5.1, 6.3, 6.5, 7.2 steps 3, 5 and 11, §8 rows 6, 10 and 11), D120 (6.7), D121 (4.3, 7.2 step 10, §8 rows 8 and 12) and D122. This file follows D1–D122.
