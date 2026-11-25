# Jashn build kickoff: 09:00 to the 10:45 batch

Runbook written at about 05:15 IST on Wed 25 Nov 2026, updated at about 06:15 to decisions D1–D122. Notes only (rule 4): prose, tables, short JSON payloads and setup commands, each block labelled "Run at 09:00 or later". The lead session (L) follows it top to bottom. A scheduled prompt fires in L at 09:03 and points here.

**How to use it.** Check the time with `TZ=Asia/Kolkata date` at every step. If a step runs late, keep the order and shift the step, but never move a fallback trigger time. Every detail lives in the spec section named; this file says who, when and how you know it is done. `decisions.md` wins, then the specs, then research notes. For names, always use the new ones (architecture 9, export-and-recovery 11, flagsmith 10.1, doc-ai 5.7): `JOBS_API_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`, `NUDGEBEE_EXPORT_WEBHOOK_URL`, status `rendering`, `/render/card/[job_id]`, polling only, RLS on with zero policies.

**Git rules for the whole day.**
- Work lands through short-lived branches named `lane-<letter>-<topic>` or `lane-lead-<topic>`, and pull requests into `main`, merged as merge commits.
- Commit messages, PR titles, PR descriptions and branch names never name an AI tool, never carry a `Co-Authored-By` line for one and never say "Generated with". The commit-msg hook strips such trailers and rejects any message containing "claude"; write "agent instructions" instead.
- Every gh command runs as `GH_TOKEN="$(gh auth token --user omiiii21)" gh ... --repo omiiii21/Jashn` (`gh repo edit` and `gh repo view` take `omiiii21/Jashn` as an argument instead). Never run `gh auth switch`; the active account stays on the other user.
- AI help is disclosed only in the README's AI-assistance section and on the submission form.
- Never print a secret: no viewing `.env.local`, no echoing values (architecture 5.3).

---

## 1. Who does what

| Who | 09:00–10:00 | 10:00–10:45 |
|---|---|---|
| **User** (team lead, owns every account) | Before 09:00: the teammate's registration, the NudgeBee invite, account access, how check-in works (D45). Then step 0, the merge permission, check-in after the notes PR (~09:05–09:10, with the real submission form), the design direction in the lead session (09:10–09:27, protected), two short blocks (09:27 credentials and `SEED_PASSWORD`, 09:32 Vercel import), Flagsmith dashboard steps A–E (09:38–09:58; one seat, so only the user), then starts the four lane sessions (09:58–10:05) | Keynote with the laptop open on power. Unfinished Flagsmith A–E first (hard limit 10:30), then NudgeBee T1, T2, T4 (~10:05) and the workflow build to 11:00 if the teammate wasn't invited; the kind decision moves with them (D8, D72, D119). Two 2-minute breaks: the Bulbul voice pick at ~10:25 (D78) and the photo approval at ~10:40 (D119). By 11:10, pastes `JOBS_API_TOKEN` into the NudgeBee Secret `jashn_ops_token` (D117); asks the sponsor questions at 11:00, 11:10, 11:20 (section 4) |
| **Teammate** (not confirmed; the user is fallback for each task) | Check-in, NudgeBee T1–T9 in the browser (09:10 on, only if invited to the account; D8, D72), the fictional Arora card in Keynote or Slides by 09:50 (D73). Needs no Sarvam key (D7) | If invited: builds the NudgeBee workflow on httpbin stand-ins (export-and-recovery 10.2, D72) |
| **L** (lead session, `~/Desktop/Personal/Jashn`, port 3000) | Notes PR, scaffold, install, config, CI, the ruleset (D69), env vars, Supabase, auth (D68), "Confirm email" if the access token is there (D116) and Flagsmith checks, Sarvam T0–T4 with V-T1, V-T2 and the Bulbul samples (D78), design round, Vercel readiness checks (D45), contracts PR, worktrees | The Arora card if the teammate has none (10:00–10:05, D73), Sarvam T5/T6 (~10:05–10:15, D119), Notion updates, Fable review of contracts, the photo PR (D107), `lane-lead-contracts-2` (~10:30, D44), Lane D probe merge (10:25–10:40), the 10:45 batch |
| **Lane A** (`jashn-a`, 3001; all lanes start at ~09:58–10:05) | – | `lane-a-schema` pushed as a draft PR by 10:20 (D96), then `lane-a-dispatcher`: the 10:45 list in section 5 (D102) |
| **Lane B** (`jashn-b`, 3002) | – | `lane-b-shell`: shell and Money vendor page on fixtures; owns PRODUCT.md, DESIGN.md and `src/app/globals.css` |
| **Lane C** (`jashn-c`, 3003) | – | `lane-c-voice` and `lane-c-synthetic-run` (flagsmith 7.7); V-T4 at ~10:25 and V-T3 by 10:40 or 11:30 (D112) |
| **Lane D** (`jashn-d`, 3004) | – | `lane-d-render-probe`, PR at ~10:25, merged out of batch 10:25–10:40 (export-and-recovery 3.6) |
| **Advisors** (through L's codex wrapper) | – | Fable reviews the contracts at ~10:00; L has Sol generate the couple photo between 10:00 and 11:00 and commits it as `scripts/seed-assets/couple-photo.jpg` in a lead PR by 11:00 (D14, D107) |

L keeps the Notion page "Jashn — Build HQ" current at 09:30, 09:50, 10:05 and after the 10:45 batch. Sponsor test results go there (codes and timings only, never keys).

## 2. Preconditions at 09:00

| Item | Check (who) | If missing |
|---|---|---|
| Laptop on power, awake, online | User: charger in, venue Wi-Fi joined, phone hotspot ready. L keeps the Mac awake with caffeinate (export-and-recovery 6.8) | No socket: sit by one before 09:00. Wi-Fi blocks npm or wss: switch to the hotspot at once |
| Lead session open and idle | User: the session answers a prompt | Start it in the repo root and type "Follow docs/prep/build-kickoff.md from the top" |
| Supabase project (Mumbai) and its values in `.env.local` | L, 09:24: the psql checks in architecture 8 | User creates it before 09:00 (D45), else in the ~09:05 queue window (Free, Mumbai), and pastes the values into `.env.local` in an editor. The design block doesn't move (PLAN 4.1). Not working by **09:30**: Neon fallback (architecture 8 row 1) |
| `SUPABASE_ACCESS_TOKEN` | L, laptop-only checks; with it, L turns "Confirm email" off (step 12, D116) | Not blocking. Without it, "Confirm email" stays the user's one dashboard click. User adds it after 10:00 |
| Flagsmith account, project "Jashn", Development, Production, Synthetic, warehouse on, keys and org key | User, 09:38–09:58 in the dashboard; L runs FV1 at 09:24 for Development | User does flagsmith 7.1 straight after Supabase (PLAN 4.1), with the warehouse on and the test event sent at once; steps A–E stay at 09:38–09:58. Lane C builds on fallbacks meanwhile. Hard limit **10:30** (flagsmith F20) |
| Sarvam key and credit | L, 09:14: T0 | User creates the key before 09:00, at the latest first in the 09:27 block, and pastes it into `.env.local`. T0 fails or ₹0 by **09:45**: Lane C uses fixture mode (architecture 8 row 3) |
| NudgeBee account and `jashn-kind` (Non-production) | Teammate, 09:10–09:28: T1, T2, T4, only if the user invited them (D8) | User creates the account and invites the teammate before 09:00 (D45); `jashn-kind` is T1. Teammate not invited: the user does all NudgeBee account work: T1, T2, T4 at ~10:05 (decision at 10:20), the workflow 10:05–11:00, the 11:15 tunnel read and the 12:15–13:00 objects (D72). T2 or T4 fail: kind plus the agent (step 13) |
| Vercel login | L: `npx --yes vercel@66.6.0 whoami` shows the right account | User runs `npx --yes vercel@66.6.0 login` in a plain Terminal |
| Teammate present and registered | User before 09:00, again at check-in (D45) | Every teammate task falls to the user after Flagsmith; the Arora card falls to L (D73). The guest phone in the demo becomes the user's second device |
| iPhone iOS version | User notes it (acceptance device table) | Not blocking. 18.4 or later records WebM/Opus, older records MP4/AAC; both work |

## 3. Timeline, 09:00–10:45

### Step 0 · 09:00 · User · Replace GitHub's first docs commit
- Do: in a plain Terminal window (not the session), run the push below. The agent's safety check blocks force pushes, so only the user runs it. It swaps GitHub's ed7debc (which carries an AI co-author trailer) for the cleaned local 2bea221.
- Done: the user says so, or L sees `origin/main` at 2bea221 after `git fetch origin` (D119).
- If not: "stale info" or rejected means GitHub moved. Stop. L shows `git log --oneline origin/main -3`; the user decides. Nothing is pushed until step 0 is done. If the user is late, L runs the local parts of steps 4–8 and holds every push.

Run at 09:00 or later:

```bash
cd ~/Desktop/Personal/Jashn && git push --force-with-lease=main:ed7debc origin main
```

### Step 1 · 09:01 · User · Confirm the standing merge permission
- Do: type into L: "Confirmed: merge each batch once CI is green and the architecture 6.4 checks pass, and report on Notion. I can stop any merge."
- Done: L quotes it on the Notion page.
- If not: L asks before every merge until it is given.

### Step 2 · 09:03 · L · Start
- Do: first tell the user in chat what is still open: step 0 and step 1 unless already done in the chat, check-in after the notes PR (~09:05), the design round at 09:10, credentials at 09:27 (D119). Then time check; `git fetch origin`; confirm `origin/main` is 2bea221; `git status --short`; confirm gh works for this repo (`GH_TOKEN=... gh pr list --repo omiiii21/Jashn`). Post "kickoff started" on Notion.
- Done: gh answers without an auth error; status shows only `docs/prep` paths: astra-plan.md and skills-toolkit.md modified, everything else untracked, and nothing outside `docs/prep` (D119).
- If not: gh auth error means the token form is wrong (rule above). Never switch accounts.

### Step 3 · ~09:05, after step 0 · L · Notes PR (`lane-lead-notes`)
- Do: architecture 7.2 step 1, with a status check between add and commit. It covers all of `docs/prep` except `raw/` (already ignored): research notes, demo files, scope, `spec/`, `lanes/`, this file and `morning-checklist.md`. Like every PR today, it opens as a draft and is marked ready before the merge (D30, D85).
- Done: the merged PR is on `main`; `git status --short` lists no `docs/prep/raw` path, no `.env` file and no `.claude` path. The user goes to check-in now (D45).
- If not: `raw/` appears: unstage it and fix `.gitignore` first. `lanes/` missing: carry on; L writes the four briefs from architecture 4.2 and 6.1 at 09:45 and adds them to the contracts PR.

Run at 09:00 or later:

```bash
cd "$HOME/Desktop/Personal/Jashn"
git switch -c lane-lead-notes
git add docs/prep && git status --short
git commit -m "Add pre-hackathon notes and build specs"
git push -u origin lane-lead-notes
GH_TOKEN="$(gh auth token --user omiiii21)" gh pr create --draft --repo omiiii21/Jashn --base main --head lane-lead-notes --title "L: pre-hackathon notes and build specs" --body "Notes, research and specs written before 09:00. No code."
GH_TOKEN="$(gh auth token --user omiiii21)" gh pr ready lane-lead-notes --repo omiiii21/Jashn
GH_TOKEN="$(gh auth token --user omiiii21)" gh pr merge lane-lead-notes --repo omiiii21/Jashn --merge
git switch main && git pull --ff-only && git switch -c lane-lead-scaffold
```

### Step 4 · 09:07 · L · Scaffold in a sibling folder, rsync, package metadata
- Do: architecture 7.2 steps 2 and 3 exactly (create-next-app 16.4.6 in `jashn-scaffold`, rsync excluding `.git`, `.gitignore` and `README.md`, delete the sibling, `npm pkg set`).
- `.gitignore` additions: architecture 7.2 step 3's list (`*.pem`, `*.local.md`, `e2e/.auth/`, `playwright-report/`, `test-results/`), plus D1: `CLAUDE.md`, the whole `.claude/` folder and `.impeccable/`. The `.env*` rule gets an exception for `.env.example`, so the values-free example is tracked (D51).
- Done: `git check-ignore -v CLAUDE.md CLAUDE.local.md .claude/scheduled_tasks.lock .impeccable/x .env.local` prints a rule for each (a path inside `.impeccable/`, because the folder doesn't exist yet; D119), and `git check-ignore .env.example` prints nothing.
- If not: create-next-app refuses the folder: you are in the wrong folder (trap 1).

### Step 5 · 09:08 · L · Pinned install (runs in the background)
- Do: architecture 7.2 step 4, with Playwright 1.65.1 as a pinned dev dependency (no browser download, `channel: 'chrome'`). Then check Anek Devanagari in next/font's font data; use Mukta if it is missing (architecture 4.1, export-and-recovery 1.5).
- Done: `npm ls` shows next 16.4.6, react 19.3.0, tailwindcss 4.3.3, typescript 5.9.3, eslint 9.39.5, drizzle-orm 0.45.4, postgres 3.4.9, @flagsmith/nodejs 9.5.0, @sparticuz/chromium 153.0.0, puppeteer-core 25.11.0, @playwright/test 1.65.1.
- If not: a timeout or ECONNRESET: hotspot and rerun. A wrong version: reinstall with `--save-exact` (traps 4, 7, 8, 9, 10).

### Step 6 · 09:10–09:27 · L with the user · Design direction round, in the lead session (decision D3)
- Do: run `impeccable init` (writes PRODUCT.md), then its direction step, with design-direction.md ("card and khata") as the input. Check the result against the frontend-design tells (skills-toolkit 4). Lock a type pairing with Devanagari and the Phosphor icon set. The user answers and picks the direction (about 15 minutes); the pick is the approval. L writes DESIGN.md from the choice afterwards.
- While the round runs, keep each turn short and answer the user's design messages first. Run steps 7–11 in between, with long commands (install, build, Sarvam) in the background (D119).
- Do not stage PRODUCT.md or DESIGN.md in the scaffold commit. They go in the contracts PR (step 16). Lane B owns both from then on.
- Done: the user has said which direction; both files exist.
- If not: the impeccable launcher fails: read its SKILL.md files directly (skills-toolkit 9, risk 2). No user pick by 09:45: commit both marked "Proposed", with the tokens from the leading option (step 16); Lane B finishes and the user approves one screen at the 10:45 batch. With a pick, L checks Lane B's vendor-page screenshot against design-direction itself (D121).

### Step 7 · 09:14 · L · Sarvam T0–T4 (background, while the install runs)
- Do: research-sarvam 7, T0 to T4 (with T4b and T4c), plus V-T1, V-T2 and the Bulbul audition samples (voice.md 1.16, D78), from `~/sarvam-smoke`, outside the repo. Load `SARVAM_API_KEY` from `.env.local` into the command's environment without printing it, as architecture 8's psql check reads values. L can't listen: for T1 check the 200, `audio/mpeg` and a non-empty file. The user (or the teammate) listens to the samples and picks the two voices by 10:30, about 2 minutes; with no pick, voice.md's defaults stand. Skip T3's live-mic line; Lane C's device matrix covers real browsers (architecture 6.6).
- Done: codes and timings on Notion; the T4 pass condition met; the fastest reasoning-off combination named for Lane C; the audition files saved in `~/sarvam-smoke`.
- If not: key missing: the user adds it at the latest in the 09:27 block. The teammate never needs the key (D7). T0 fails or 402 by **09:45**: Lane C starts with `VOICE_FIXTURE_MODE=on` locally; the user tops up or makes a new key (architecture 8 row 3).

### Step 8 · 09:15–09:21 · L · shadcn, config files, check, PR (`lane-lead-scaffold`)
- Do: architecture 7.2 steps 5, 6 and 7. Start shadcn only after step 5's `npm ls` check passes; if the install is still running at 09:15, write the config files (architecture 7.2 step 6) first (D119). Config files: AGENTS.md (Next's managed block, then the rules in architecture 7.3), CLAUDE.md (one line pointing to AGENTS.md; gitignored), `.env.example` (every name in architecture 5.1), `vercel.json`, `next.config.ts`, `vitest.config.ts` (excludes `*.db.test.ts` unless `RUN_DB_TESTS=1`, and loads `.env.local` with `@next/env`'s `loadEnvConfig`), the `package.json` script `"test:db": "RUN_DB_TESTS=1 vitest run"` (D103), `playwright.config.ts` (loads `.env.local`, D120), the CI workflow and PR template (architecture 6.3), and a liveness-only `/api/health` (200 with the commit SHA) with one unit test for its response. CI and `npm test` both run `vitest run --passWithNoTests` and never touch a database (D42, D103).
- Stage everything except PRODUCT.md and DESIGN.md: `git add -A -- . ':!PRODUCT.md' ':!DESIGN.md'`.
- Done: check, `npm test` (the same command CI runs) and build pass locally before the PR opens (D42); `git status --short` shows no `.env.local`, CLAUDE.md, `.claude` or `.impeccable` path; after the commit, `git ls-files .env.example` lists it (D51); the draft PR is open and CI is running.
- If not: shadcn can't find Tailwind: rerun init without `--yes` (trap 3). A `cacheComponents` entry: remove it (trap 2). Build red after 5 minutes of fixing: commit the fix, keep going; the import waits for green.

### Step 9 · 09:22 · L · GitHub settings and the ruleset (D69)
- Do: the `gh repo edit` command in architecture 6.3 (merge commits only, delete branches on merge). Then the branch ruleset through `gh api`, only after step 0: write the payload below to `~/jashn-ruleset.json` (outside the repo) and post it. The path names the repo, which satisfies the "always name the repo" rule. It requires a PR (0 approvals), blocks force pushes and restricts deletions (architecture 6.3).
- Done: `gh repo view` (below) shows true, false, false, and `gh api repos/omiiii21/Jashn/rulesets` lists the "main" ruleset. If the call fails, skip it: L enforces the PR flow anyway, and the user has no ruleset click.

```json
{"name": "main", "target": "branch", "enforcement": "active",
 "conditions": {"ref_name": {"include": ["~DEFAULT_BRANCH"], "exclude": []}},
 "rules": [{"type": "pull_request", "parameters": {"required_approving_review_count": 0, "dismiss_stale_reviews_on_push": false, "require_code_owner_review": false, "require_last_push_approval": false, "required_review_thread_resolution": false}},
  {"type": "non_fast_forward"}, {"type": "deletion"}]}
```

Run at 09:00 or later:

```bash
GH_TOKEN="$(gh auth token --user omiiii21)" gh api --method POST repos/omiiii21/Jashn/rulesets --input "$HOME/jashn-ruleset.json"
GH_TOKEN="$(gh auth token --user omiiii21)" gh repo view omiiii21/Jashn --json mergeCommitAllowed,squashMergeAllowed,rebaseMergeAllowed
```

### Step 10 · 09:22 · L · The five new env vars (architecture 5.1, 7.2 step 8)
- Do: first `cp .env.local .env.backup.local` (still ignored by `.env.*`). Then append an empty line, and after it, without printing anything: `RENDER_TOKEN_SECRET` and `FLAGSMITH_ID_SALT`, each generated with `openssl rand -base64 32` straight into the file, and `DEMO_RESET_ENABLED=true`. At 09:27 the user types `SEED_PASSWORD` (a passphrase they choose and save in their password manager, because the teammate types it on a phone as Diya) and `INTERNAL_USER_EMAILS` (the team's real emails, lowercase, comma-separated) in an editor (D118).
- Done: an anchored count, `grep -c '^NAME=' .env.local`, is 1 for each of L's three names now and for the user's two after step 12 (counts only, never values). A 0: restore from `.env.backup.local` and retry (D119).
- If not: `SEED_PASSWORD` still unset at 09:50: L generates one the same way and the user copies it from `.env.local` into the password manager (D118). `INTERNAL_USER_EMAILS` not typed by 09:50: leave it unset; `@example.com` accounts count as internal anyway (flagsmith 2.3). The user adds it by 12:00.

### Step 11 · 09:24 · L · Supabase and Flagsmith checks
- Do: the 09:25 database check (architecture 8, both psql lines); flagsmith FV1 for Development (flagsmith 7.5 command 1).
- Done: both psql lines connect; FV1 shows Connected with events received ≥ 1.
- If not: a pooler fails twice, or L's auth check (step 12) fails twice, by **09:30**: L switches to the fallback stack (architecture 8 row 1: Neon through the Vercel Marketplace, Better Auth 1.7.28, Vercel Blob 2.9.0) and tells the user; the user adds the Neon integration in step 14. FV1 Pending: flagsmith F1 (resend the test event, ask at 11:00).

### Step 12 · 09:27–09:30 · User, then L · Credentials first, then the auth check (D45, D68)
- User, in `.env.local` in an editor: any key still missing first (Supabase, Sarvam, Flagsmith), then `SEED_PASSWORD` and `INTERNAL_USER_EMAILS` (step 10, D118). "Confirm email" (Authentication → Providers → Email) is the user's one click only if `SUPABASE_ACCESS_TOKEN` is missing and it wasn't done at home (D116). Phone bookmarks wait.
- L, "Confirm email": with `SUPABASE_ACCESS_TOKEN` in `.env.local`, turn it off through the Management API (`PATCH /v1/projects/{ref}/config/auth` with `mailer_autoconfirm: true`); nobody clicks (D116).
- L, the auth check: create `auth-check@example.com` through the Supabase Admin API (`/auth/v1/admin/users`, confirmed, random password) with `SUPABASE_SERVICE_ROLE_KEY`, read from `.env.local` and never printed; sign in once with the anon key; then delete the user. No one adds users in the Supabase dashboard (D68). Lane A's seed creates Mira, Diya and every other account. Then verify "Confirm email" is off: `check-keys.py` passes, and the sign-up test (a throwaway `@example.com` signed up with the anon key) returns a session at once; delete that user too (D116).
- Done: the user says "block 1 done"; L reruns step 11 if values changed; the sign-in and the sign-up returned sessions, and the deletes returned 200.

### Step 13 · 09:28 · L · Merge the scaffold; NudgeBee 09:30 decision
- Do: only when CI is green (D42), architecture 7.2 step 9's commands: `gh pr ready`, then merge (D85). At 09:30 read the teammate's T2 and T4 (export-and-recovery 6.7).
- Done: `main` holds the scaffold. T2 and T4 pass: Option A, no agent, no cluster.
- If not: CI red: fix on the branch, never merge red. T2 or T4 failed: kind plus the agent on this laptop (export-and-recovery 6.8; Docker running, 8 GB). L runs `open -a Docker`, `kind create cluster` and the download; the user runs `read -s NB_AGENT_KEY` and the installation line in a plain Terminal tab, as in step 0; L then runs the kubectl checks (D119). If the teammate is absent or wasn't invited to NudgeBee, the user runs T1, T2 and T4 at about 10:05 from a seat, after any unfinished Flagsmith steps, and the kind decision moves to 10:20 (D8, D119). The user then builds the workflow 10:05–11:00, click by click from export-and-recovery 6.1–6.4 (D72).

### Step 14 · 09:32 · User · Vercel import (architecture 6.5)
- Do: Vercel → Add New → Project → Import `omiiii21/Jashn` (installs the Vercel GitHub app). Framework Next.js, defaults, production branch `main`. Settings: Node.js 24.x; Fluid compute on; leave Attack Challenge Mode and bot rules off. Then add one Production variable by hand: `NEXT_PUBLIC_FLAGSMITH_ENVIRONMENT_ID` = the **Production** client-side key from Flagsmith (not secret). Neon fallback only: add the Neon integration (Singapore) here.
- Done: L does the readiness checks after step 15's link: `npx --yes vercel@66.6.0 ls --cwd "$HOME/jashn-vercel-cli"` shows the first production deployment Ready, and `npx --yes vercel@66.6.0 project inspect jashn --cwd "$HOME/jashn-vercel-cli"` shows Node.js Version 24.x, or the user confirms 24.x on the Settings page at 09:32 (D45, D119). The phones get the bookmark after 10:05.
- If not: the import fails twice: L tries `npx --yes vercel@66.6.0 git connect` after the GitHub app is installed (trap 21). No Ready production deployment by 09:50: L tells Lane D the probe waits, and the user retries the import at 10:05. Still none by 10:40: the og renderer becomes Lane D's top priority (D48), and L brings up the tunnel host (architecture 8 row 10; D119).

### Step 15 · 09:35 · L · Production env vars through the CLI
- Do: make an empty folder `~/jashn-vercel-cli` and link it there, so the CLI never touches the repo's `.env.local`. For each name marked "Yes" in architecture 5.1, run `npx --yes vercel@66.6.0 env add <NAME> --environment production --sensitive --yes --cwd "$HOME/jashn-vercel-cli"`, feeding the value on stdin straight from the main `.env.local` (the same grep-and-cut read as architecture 8), so it never reaches the screen (D119). Skip `NEXT_PUBLIC_FLAGSMITH_ENVIRONMENT_ID`: the user set the Production client-side key at step 14, and `.env.local` holds the Development one. Its one owner is the user (D119). `FLAGSMITH_SERVER_KEY` takes the `FLAGSMITH_SERVER_KEY_PRODUCTION` value (trap 28). `DEMO_RESET_ENABLED` is `true`. Skip names still empty, and add them when they arrive (a `NEXT_PUBLIC_` change needs a redeploy).
- Done: `env ls production` (or `env ls --environment production` if the bare form is rejected) lists every "Yes" name with no Preview or Development scope.
- If not: `--sensitive` refused: add without it and the user ticks Sensitive later. The CLI fails twice: the user pastes the values in the dashboard (Production only, Sensitive) right after the Flagsmith steps, by 10:05.

Run at 09:00 or later:

```bash
npx --yes vercel@66.6.0 link --yes --project jashn --cwd "$HOME/jashn-vercel-cli"
npx --yes vercel@66.6.0 env ls production --cwd "$HOME/jashn-vercel-cli"
```

### Step 16 · 09:35–09:55 · L · Contracts PR (`lane-lead-contracts`; D44)
- Do: the minimum from architecture 4.3 that compiles all four first branches (`lane-a-schema`, `lane-b-shell`, `lane-c-voice`, `lane-d-render-probe`), written from domain-and-data (new names only), flagsmith 2–5, voice.md and export-and-recovery 10.5:
  - the fixtures, `src/lib/fonts.ts`, and the handler stubs; `src/server/jobs/status.ts`, owned by Lane D, whose stub returns the fixture export view; Lane A's read-model index re-exports it from now on (D52);
  - component stubs with their final props, which their owners keep (D97): `VoiceDock` takes `wedding_id` (null on `/setup`) and the props voice.md names; `PublishSheet` takes `wedding_id`, the `unpublished_changes` list, `expected_draft_version` and an `on_confirm` callback (D59); `LiveRefresh` and the shell layout take the props architecture 4.3 names. Changing a stub's props is a contracts change, made by L;
  - Lane A's stubs, whose bodies A replaces at 10:45: `src/server/auth/session.ts`, the session helper's final signature, returning the fixture member with the actor fields domain §1 and flagsmith 4 need (D96); `src/server/actions/dispatch.ts`, a `'use server'` module whose `dispatchCommand` takes the domain §3.0 command envelope and returns its response envelope, backed by the fixture services (D98); `src/db/ids.ts`, UUIDv5 under the namespace `75e13aff-00d4-427e-8e6b-7bd1798f1316` with names `<table>:<seed_key>`, which the fixtures use (D100);
  - read-model types and fixtures: `wedding_profile` (wedding_id, display name, dates, city, budget, `is_sample`, the current member's role and display name), `itinerary` with `venues[]` and each function's `requirements[]`, `days_until_due` on `money_summary`'s due items, and `seed_key` on every row (D99);
  - in `src/contracts/services.ts`: the typed signatures of Lane A's 11:40 items (the Storage adapter and signing helpers, the guest token resolver, the `JOBS_API_TOKEN` verifier, `reset_demo`, `update_event`), so Lane D builds against them from 10:00 (D102); and the after-commit types (`AfterCommitHandler` and the map type). The map itself is `src/server/jobs/after-commit.ts` [D], a static export shipped empty: Lane A's dispatcher imports it statically and runs the committed command's entry in `after()`, Lane D adds the export kick at 11:40, and nothing registers itself by an import side effect (D53, D101);
  - `routes.ts` with `routes.invite` and the `highlight` query parameter (comma-separated field keys), and the Invite placeholder page under Lane D's path, `src/app/(planner)/w/[wedding_id]/invite/`; Lane B's nav links to `routes.invite` (D121);
  - a voice gate stub that refuses voice writes; it never answers "enabled" (D47). `/api/health` gains the `flags` summary ("not built yet", so `flags.ok` is false until `lane-c-voice` merges, D12);
  - PRODUCT.md and DESIGN.md, `docs/prep/lanes/` if step 3 lacked it, and, right after the design pick, the token layer of `src/app/globals.css` (colour, type and spacing tokens from DESIGN.md and design-direction.md); Lane B owns the file from then on (D4).
- `lane-lead-contracts-2` at about 10:30 carries the card-import contract (doc-ai 1.7 and 5.3) with the `image_extraction_provider` flag key (D115), the `team` and link-field (`link_status`, `last_rotated_at`) types and fixtures (D99), and other non-essential metadata.
- Check, commit, push, draft PR, CI, ready and merge as in steps 8 and 13. Done: merged at 09:50–09:55 (D70). Step 18 starts at once; the Vercel deploy finishes in parallel. When it is Ready, `curl -s https://<production domain>/api/health` returns 200 with the merge's SHA; Lane D's production probe waits for that SHA. Not ready at 09:55: merge the part that compiles the four first branches by 10:00 and move the rest to `lane-lead-contracts-2`.

### Step 17 · 09:38–09:58 · User · Flagsmith dashboard (flagsmith 7.4, decision D9)
- Do: only the user, because Flagsmith's free plan has one seat. Steps A to E with the exact values in 7.4: environment settings and banners, the eight flags (not `image_extraction_provider`), three segments, the `voice_pilot` overrides, the two metrics in Synthetic and Production. Step A item 5 confirms the Production and Synthetic warehouses (FV1). Dashboard only, never the Admin API.
- Done: FV3 (flagsmith 7.6): tags, descriptions and the `voice_first` labels as in step B.
- If not: no flags by 10:15: Lane C keeps building on fallbacks. Must be done by **10:30**, before the batch (F20). Two metrics on one event refused: use `setup_save_seconds` and tell Lane C (U11).

### Step 18 · ~09:55, right after the contracts merge · L · Worktrees, env copies, hooks and briefs (D44, D70)
- Do: architecture 7.2 step 11: the four `git worktree add` lines below, then the env copies with its grep commands (C keeps `FLAGSMITH_SERVER_KEY_SYNTHETIC`). Append `APP_BASE_URL=http://localhost:300N`, and for D `CHROME_EXECUTABLE_PATH` (the Chrome app binary). Start `npm ci` in all four at once; don't wait for the deploy.
- Copy into each worktree: CLAUDE.md, `CLAUDE.local.md` from `docs/prep/lanes/lane-<letter>.md`, and `.claude/settings.local.json` holding the typecheck Stop hook (`npm run check`). L writes that file in `jashn-a` with the update-config skill (decision D2) between the two blocks below, then copies it to B–D. `.impeccable/` goes to B and D only, if the design round made one (D119).
- Done: in each worktree, `git branch --show-current` is the first branch, `git status --short` is empty, and `git check-ignore -v .env.local CLAUDE.md CLAUDE.local.md .claude/settings.local.json` prints four rules.
- If not: `npm ci` fails on Wi-Fi: hotspot and rerun one at a time.

Run at 09:00 or later:

```bash
cd "$HOME/Desktop/Personal/Jashn" && git switch main && git pull --ff-only
git worktree add ../jashn-a -b lane-a-schema main
git worktree add ../jashn-b -b lane-b-shell main
git worktree add ../jashn-c -b lane-c-voice main
git worktree add ../jashn-d -b lane-d-render-probe main
for l in a b c d; do cp CLAUDE.md ../jashn-$l/ && cp docs/prep/lanes/lane-$l.md ../jashn-$l/CLAUDE.local.md; done
```

Now write `jashn-a/.claude/settings.local.json` with the update-config skill. Then, run at 09:00 or later:

```bash
cd "$HOME/Desktop/Personal/Jashn"
for l in b c d; do cp -R ../jashn-a/.claude ../jashn-$l/; done
if [ -d .impeccable ]; then cp -R .impeccable ../jashn-b/ && cp -R .impeccable ../jashn-d/; fi
for l in a b c d; do (cd "$HOME/Desktop/Personal/jashn-$l" && npm ci) & done; wait
```

### Step 19 · 09:58–10:05 · User · Start the four lane sessions
- Do: after the contracts PR has merged and the Flagsmith steps are done (D10), one terminal tab per worktree, start a session (Opus 5.5) in it, paste that lane's prompt from section 5.
- Done: each session answers with its letter, branch, port and first deliverable. L sees four sessions with ListAgents.
- If not: the user is away: the teammate pastes the prompts. A session edits outside its paths: L stops it and points to CLAUDE.local.md.

### Step 20 · 10:00–10:15 · L · Card test, reviews, the photo, Notion
- Card: if the teammate hasn't laid the fictional Arora card out in Keynote or Slides by 09:50, L builds it at 10:00–10:05, after step 18, as an HTML page in `~/sarvam-smoke`, outside the repo, and renders it to JPEG with headless Chrome. It is a fictional printer proof, never made with an image generator (D73, D119). Then, when the card is in `~/sarvam-smoke/invite.jpg` (doc-ai 4.1 step 2), run T5 at about 10:05–10:15, then T6 only if T5 is slow or wrong (doc-ai 5.1); send the decision row to Lane C. Ask Fable to review the merged contracts against the specs. Put the three sponsor lists (section 4) on Notion.
- Photo: between 10:00 and 11:00, have Sol generate the fictional couple photo (3:2, ≥ 1500 × 1000) through the codex wrapper, approved by the user at ~10:40, never cropped, labelled AI-generated in the README (D14). Commit it as `scripts/seed-assets/couple-photo.jpg` by 11:00 in a lead PR, merged first in the 11:40 batch. Right after the 11:40 deploy, L runs the seed's photo step for every copy; it uploads the file and upserts the asset row by seed_key, so the photo is part of D0 from then on (D107).
- Done: Notion shows the Sarvam, NudgeBee and Flagsmith results, the T5 decision and the contracts review.
- If not: no card by 11:30: T5 waits for Lane C, before #11's latest start at 13:00 (doc-ai 5.2). A Fable finding becomes `lane-lead-contracts-2`, merged at once.

### Step 21 · 10:25–10:40 · L and Lane D · The probe, out of batch
- Do: merge `lane-d-render-probe` once CI is green, D's local Chrome check passed and production serves the contracts SHA (architecture 6.4, export-and-recovery 3.6, D44). After the deploy, D posts to `/api/ops/export-jobs/probe/run` from its worktree, with the token from its env file, never typed; the probe uses D's temporary bearer check until Lane A's `JOBS_API_TOKEN` verifier lands, 11:40 at the latest (D58, D102).
- Done: 3.6's pass list: 200 within 30 s cold and 6 s warm, 1080 × 1350, Hindi shaped as in local Chrome, Eczar names, no boxes, photo or placeholder present. Timing headers on Notion.
- If not: a missing file: L adds the file-tracing include in a `lane-lead-fix-1` PR (architecture 2.2). Still failing: the og renderer becomes Lane D's top priority, and D verifies a real PNG from it (D48). It ships dormant in the 11:40 batch either way, so the user can flip `card_renderer` to `og` at the **12:15** gate without a deploy (architecture 8 row 2).

### Step 22 · 10:45 · L · First batch (architecture 6.4)
- Before merging each ready PR, check: CI green; not a draft; the branch has merged `origin/main`; `gh pr diff --name-only` stays inside the owner's paths (architecture 4.2); the title is "X: what it delivers"; no AI tool name, `Co-Authored-By` or "Generated with" in the title, body, commits or branch.
- Merge in order **A → B → C → D**, each session's oldest PR first; Lane A's go first, so C's PR then shows only C's own diff (D96). Then on `main` in the repo root: `npm ci`, `npm run check`, `npm run build` (FV12: flag routes show ƒ). Wait for the deploy, then check only sign-in and `/api/health` on production (`flags.ok` true once `lane-c-voice` is in; FV2; D46). The demo-path project's global set-up doesn't rotate H16 before the 12:30 batch. Tell each session to merge `origin/main` and rerun the real-data part of its done-check on its own copy; a failure there becomes the first item of the next batch, and L never holds a batch for it (D104). Report on Notion.
- Done: every merged PR is live; the health check holds; the sessions have merged `main`.
- If not: a red PR waits for 11:40. Copies c and d not seeded: Lanes C and D read the e2e copy (GETs only) and use fixtures for writes until 11:40 (D120). A production build fails: the last good deploy keeps serving; fix forward with `lane-lead-fix-<n>` or revert the merge through a PR (architecture 6.5).
- Next: at ~10:50 the user runs Flagsmith step F1 (Synthetic experiment), then L tells Lane C to start the synthetic run (flagsmith 7.3).

Run at 09:00 or later:

```bash
GH_TOKEN="$(gh auth token --user omiiii21)" gh pr list --repo omiiii21/Jashn --state open
GH_TOKEN="$(gh auth token --user omiiii21)" gh pr view lane-a-schema --repo omiiii21/Jashn --json title,body,commits,isDraft,mergeable
GH_TOKEN="$(gh auth token --user omiiii21)" gh pr checks lane-a-schema --repo omiiii21/Jashn
GH_TOKEN="$(gh auth token --user omiiii21)" gh pr merge lane-a-schema --repo omiiii21/Jashn --merge
```

## 4. Sponsor-demo questions (the user asks; the teammate writes the answers on Notion)

**11:00 Flagsmith** (flagsmith 9.1)
1. How long does a warehouse take to show events once Connected? (U1) Ours is stuck Pending: what now? (F1, if so)
2. Does Pending Connection block creating or starting an experiment? (U2)
3. Does the experiment wizard offer an audience segment? (U4)
4. How fast does a flag change reach a remote-evaluation server SDK? (U6)
5. Do event posts count towards the 50,000 requests? (U7)
6. What do remote-evaluation `reason` strings look like? (U10)
7. Can two metrics use the same event? (U11)

**11:10 NudgeBee** (export-and-recovery 6.7 and 13; research-nudgebee Unknowns)
1. Can an account with no connected agent run HTTP and approval steps on Cloud? (U1; only if T2 or T4 were unclear)
2. Free-tier limits on runs, AI and webhooks? (U2)
3. Jinja: does `or` work, and how do numbers and booleans render? (U4) What is the webhook filter key? (U5)
4. Does a failed step under a `continue` policy let later steps run? (U6)
5. Does an email approval link need a login? (U7) Does a pending in-app approval notify anyone? (U8)
6. What does Retry do to a run waiting at an approval? (U17)
7. What is the HTTP task's maximum timeout? Any SSRF guard or redirect rule that could block our production URL?
8. Does the Executions view refresh by itself? How long are runs kept, and can a run page be shared by link?

**11:20 Sarvam** (doc-ai 5.8 question 8, research-sarvam 9, astra-plan 5)
1. For Hinglish push-to-talk, is `saaras:v4` with `mode=codemix` and `hi-IN` the right setting, and should English-only speech use `en-IN`?
2. Can a Document AI job be deleted before its 8 days?
3. Do Document AI status polls count towards Extract's 30 a minute?
4. On `/v2`, does `reasoning_effort: null` turn reasoning off? (only if T4b and T4c disagreed)
5. Are there hackathon credits, and is there a top-up minimum?

## 5. Lane start prompts (paste one per session)

**Lane A** (`~/Desktop/Personal/jashn-a`)

```text
ultracode. You are Lane A of Jashn: data, roles, privacy, the command dispatcher and the seed. Read CLAUDE.local.md and AGENTS.md first, then docs/prep/spec/architecture.md 3, 4.2 and 9, and domain-and-data.md; where domain-and-data still has an old name, architecture 9 and export-and-recovery 11 win. You are on branch lane-a-schema, dev port 3001. Push lane-a-schema (src/db/schema.ts and the first migration) as a draft PR by 10:20, because Lane C merges it to write voice_turns (decision D96). Target for the 10:45 batch (D102): the schema and first migration; the seed for every copy, with REV-1 and REV-2 built by the pure snapshot builder src/db/itinerary-snapshot.ts (D95); sign-in and the real session helper; the dispatcher with the guard and the receipt re-check; the real dispatchCommand (D98); the version poll and LiveRefresh; wedding_profile (D99). By 11:40 at the latest, merged ahead of Lane D: the Storage adapter and signing helpers, the guest token resolver, the JOBS_API_TOKEN system verifier, reset_demo, and A4 (update_event and the itinerary read model); their signatures are already typed in src/contracts/services.ts. Edit only your lane's paths, never run npm install, and open PRs with the routine in architecture 6.2. Commit messages, PR titles, PR descriptions and branch names never name an AI tool and carry no co-author or "Generated with" line. Reply with your plan in five lines, then start.
```

**Lane B** (`~/Desktop/Personal/jashn-b`)

```text
ultracode. You are Lane B of Jashn: the planning screens and the design system. Read CLAUDE.local.md and AGENTS.md first, then PRODUCT.md, DESIGN.md, docs/prep/design-direction.md and architecture.md 4.2; you own PRODUCT.md, DESIGN.md and src/app/globals.css (its token layer came in the contracts PR) from now on. First run impeccable "hooks on", then check that .claude/settings.local.json still holds the npm run check Stop hook. You are on branch lane-b-shell, dev port 3002. Target for the 10:45 batch: the planner shell, reading wedding_profile (decision D99), and the Money vendor page on the fixture services. Your nav links to routes.invite; the Invite page is Lane D's, so B1 has no Invite placeholder (D121). Edit only your lane's paths, never run npm install, and open PRs with the routine in architecture 6.2. Commit messages, PR titles, PR descriptions and branch names never name an AI tool and carry no co-author or "Generated with" line. Reply with your plan in five lines, then start.
```

**Lane C** (`~/Desktop/Personal/jashn-c`)

```text
ultracode. You are Lane C of Jashn: voice, Flagsmith, the setup experiment and later the Should #11 card reader. Read CLAUDE.local.md and AGENTS.md first, then docs/prep/spec/flagsmith.md 6 and 7.7, voice.md, and the Sarvam test results on the Notion build page. You are on branch lane-c-voice, dev port 3003. Target for the 10:45 batch: the flags core first (FV2 and FV8's health part locally by about 10:20), then VoiceDock with the reason chip and the kill switch, and record, transcribe, preview and confirm through the dispatcher; lane-c-synthetic-run alongside. Build the pipeline on fixtures until Lane A pushes lane-a-schema as a draft PR (by 10:20); then merge origin/lane-a-schema into lane-c-voice (merge commits only) and write voice_turns through it. If it isn't pushed by 10:25, keep voice_turns writes behind your own small store interface with an in-memory fake, and move the real write to 11:40 (decision D96). Run V-T4 through the turn route's text input as soon as it answers (about 10:25), 3 runs of the live 8, before marking lane-c-voice ready. Run V-T3 on both phones through your tunnel before 10:40 if the route records by then, otherwise by 11:30 at the latest, with the WAV fallback off until then (D112). If Sarvam failed the lead's 09:14 tests, set VOICE_FIXTURE_MODE=on locally only. Edit only your lane's paths, never run npm install, and open PRs with the routine in architecture 6.2. Commit messages, PR titles, PR descriptions and branch names never name an AI tool and carry no co-author or "Generated with" line. Reply with your plan in five lines, then start.
```

**Lane D** (`~/Desktop/Personal/jashn-d`)

```text
ultracode. You are Lane D of Jashn: the invitation, guest site, RSVP, card export and NudgeBee recovery. Read CLAUDE.local.md and AGENTS.md first, then docs/prep/spec/export-and-recovery.md 3, 10 and 11. First run impeccable "hooks on", then check that .claude/settings.local.json still holds the npm run check Stop hook. You are on branch lane-d-render-probe, dev port 3004. Target: the render page at /render/card/[job_id] with the probe fixture, the Chromium module and /run with the probe id, checked in local Chrome, as a PR by 10:25 for an out-of-batch merge; then, once the probe has merged, lane-d-publish cut from origin/main and lane-d-export-jobs, both for 11:40. Build against the signatures of Lane A's 11:40 items, typed in src/contracts/services.ts from 10:00 (the Storage adapter, the token resolver, the JOBS_API_TOKEN verifier); your temporary probe check lives until that verifier lands (decision D102). lane-d-publish extends your Invite placeholder into your own Invite page mounting PublishSheet, because at about 11:50, on copy d on production, Diya's update_event goes through POST /api/w/[wedding_id]/commands/update_event, Mira publishes through that sheet, and the export job's PNG downloads (D107). Edit only your lane's paths, never run npm install, and open PRs with the routine in architecture 6.2. Commit messages, PR titles, PR descriptions and branch names never name an AI tool and carry no co-author or "Generated with" line. Reply with your plan in five lines, then start.
```

## 6. When something breaks

| Symptom | First check | Fallback | Who decides |
|---|---|---|---|
| Step 0 rejected | `git fetch origin` and `git log --oneline origin/main -3` | Hold every push; the user picks the lease target | User |
| A commit is rejected by the hook | The message names an agent file or AI tool | Reword: "agent instructions" | L |
| gh says not found or no permission | The command lacks the `GH_TOKEN` prefix or `--repo` | Rerun in the standard form; never `gh auth switch` | L |
| npm install or `npm ci` times out | Venue Wi-Fi | Phone hotspot; rerun | L |
| create-next-app refuses the folder | Running in `Jashn` instead of the sibling | architecture 7.1 trap 1 | L |
| Scaffold build red | trap 2 (Cache Components), trap 3 (shadcn), trap 12 (lint) | Fix on the branch; never merge red | L |
| CI red on a lane PR | `gh pr checks` and the log | The PR waits for the next batch | L |
| psql or the Admin-API auth check fails twice | Pooler links, project status page | **09:30**: Neon stack (architecture 8 row 1) | L, tells the user |
| The ruleset call fails | The `gh api` error | Skip it; L enforces the PR flow (D69) | L |
| Vercel import fails | GitHub app installed on the repo? | `vercel git connect` (trap 21); hosting fallback by 15:00 | User |
| No Ready production deploy | `vercel ls` | **09:50**: Lane D's probe waits and the user retries the import at 10:05. **10:40**: og renderer first for D, and L brings up the tunnel host (D119) | L |
| Production build fails | Vercel build log | Last good deploy serves; `lane-lead-fix-<n>` or revert PR. A second failure caused by the platform: L brings up the cloudflared tunnel at once and Lane D verifies its authenticated endpoint (D48) | L |
| `/api/health` `flags.ok` false after the batch | `env_label`, `fallback_flags`, wrong key (F2) | Fix the Vercel value, redeploy (about 5 min) | L |
| Flagsmith warehouse Pending | FV1 | Resend the test event; ask at 11:00; labelled app counts by 12:30 (F1) | User |
| Flagsmith steps not done | The Features list | Lane C on fallbacks; hard limit **10:30** (F20) | User |
| Sarvam 401, 402 or no key | T0 | **09:45**: fixture mode in Lane C only; top up | User |
| NudgeBee T2 or T4 fails | Account type, the runner | **09:30** (10:20 if the user ran the checks at ~10:05): kind plus the agent on this laptop (export-and-recovery 6.8); the user types the key in a plain Terminal tab (step 13, D119) | L |
| Docker won't start | Docker Desktop memory set to 8 GB | Restart Docker; the Helm 3 path if the installer fails on Helm | L |
| A lane edits another lane's file | `gh pr diff --name-only` | The owner resolves it; the PR waits | L |
| A session stops or loops | Its last message | The user restarts it with the same prompt; the branch keeps the work | User |
| Probe fails on production | D's timing headers and error code | File-tracing include PR; og renderer first for D, dormant at 11:40, the user flips at **12:15** (D48) | L with D |
| The laptop slept or lost power | Lid, charger | Reopen; L reruns the last step's done-check | User |

## 7. Kickoff done

Kickoff is done when all of these hold, and L posts them on Notion:
1. The production URL serves the scaffold, and `/api/health` returns 200 with the SHA of `main` (`flags.ok` true from the 10:45 batch, once `lane-c-voice` is in).
2. `lane-lead-notes`, `lane-lead-scaffold` and `lane-lead-contracts` are merged, with PRODUCT.md and DESIGN.md on `main`.
3. Four lane sessions are running, each on its first branch in its own worktree.
4. The sponsor checks are on Notion: Flagsmith FV1 and FV3, Sarvam T0–T4 (T5 and T6 when the card exists), NudgeBee T1–T4 and the 09:30 decision, and the probe timings.
