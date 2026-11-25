# Jashn build day: the master plan (Wed 25 Nov 2026, 09:00–18:00 IST)

Prep note, written at about 05:15 IST and updated at about 06:15 to decisions D1–D122, before coding starts. Notes only (Rule 4). It covers the whole day. `build-kickoff.md` holds the lead's minute-by-minute 09:00 sequence. `decisions.md` wins, then the specs in `spec/` on detail. Owners: **U** is the user (team lead and presenter), **T** is the teammate (fallback: U), **NB** is whoever can sign in to U's NudgeBee account (T if U invited T, otherwise U; D72), **L** is the lead session, and **A–D** are the lane sessions. All times are IST, 24-hour.

## 1. The goal at 17:00

- Must 1–9 work on production, all three sponsors do real work the judges can see, and the public repo has a README with the AI disclosure.
- The demo video (2:40, never more than 2:45) is submitted by 16:35, and 16:45 is the latest. The deadline is 17:00.

**Git rules for every session:**
- Work lands through short-lived branches named `lane-<letter>-<topic>` or `lane-lead-<topic>`, and pull requests into `main`, merged as merge commits.
- Commit messages, PR titles, PR descriptions and branch names never name an AI tool, never carry a Co-Authored-By trailer for one and never say "Generated with". The commit-msg hook strips such trailers and rejects any message containing "claude", so write "agent instructions", never the file's name.
- Every gh command runs as `GH_TOKEN="$(gh auth token --user omiiii21)" gh ... --repo omiiii21/Jashn`. Never run `gh auth switch`: the machine's active gh account stays on the other user.
- AI help is disclosed only in the README's AI-assistance section and on the submission form.
- `CLAUDE.md`, `CLAUDE.local.md`, `.claude/` and `.impeccable/` are gitignored in the scaffold PR. AGENTS.md is committed and holds the team rules.

**Step 0, U, 09:00, before anything else is pushed.** The tool's safety check blocks the agent from force-pushing, so U runs it. It replaces GitHub's first docs commit (ed7debc, which carries an AI co-author trailer) with the cleaned local one (2bea221). It must run before 09:22, when the ruleset starts blocking force pushes.

Run at 09:00 or later:

```bash
cd ~/Desktop/Personal/Jashn && git push --force-with-lease=main:ed7debc origin main
```

**Done-check:** GitHub `main` shows 2bea221. U also says "yes" to the standing merge permission (section 8).

## 2. Timeline

The venue schedule is in the second column. A blank lane cell means the lane is building its next milestone (section 3).

| IST | Venue | L (lead session) | A | B | C | D | U (user) | T (teammate; fallback U) | Gate or decision |
|---|---|---|---|---|---|---|---|---|---|
| 09:00 | Check-in | Waits for the 09:03 prompt | – | – | – | – | Before 09:00: T's registration, the NudgeBee invite, account access and how check-in works (D45). 09:00 step 0; 09:01 merge permission | Check-in queue | Step 0 before any push |
| 09:03–09:20 | Check-in | `build-kickoff.md`: ~09:05 notes PR, after step 0 (D11); 09:07 scaffold, pinned install; 09:10–09:27 impeccable init and direction round with U, in short turns that answer U's design messages first (D3, D119); 09:14 Sarvam T0–T4, V-T1, V-T2 and the Bulbul audition samples from `~/sarvam-smoke` (D7, D78); 09:15–09:21 shadcn (only after the install's `npm ls` check, D119), config with the database-test exclusion and `test:db` (D103), AGENTS.md, the health unit test, CI's test command run locally (D42) | – | – | – | – | ~09:05–09:10, after the notes PR: check-in desk; opens the real submission form and notes its fields and video-link format (D45, D51). 09:10–09:27 design round in the lead session, picks the direction (the pick is the approval; protected) | 09:10–09:28 NudgeBee T1, T2, T4, only if U invited T to the account (D8) | – |
| 09:20–09:30 | Check-in | 09:21 scaffold PR; 09:22 gh repo settings and the ruleset by `gh api` (D69); `RENDER_TOKEN_SECRET`, `FLAGSMITH_ID_SALT` and `DEMO_RESET_ENABLED` into `.env.local` (D118); 09:24 DB check and FV1 warehouse check; ~09:28 auth check with a throwaway `auth-check@example.com` made and deleted through the Admin API (D68); "Confirm email" off through the Management API if `SUPABASE_ACCESS_TOKEN` is set, checked by `check-keys.py` and a sign-up test (D116); 09:28 merges the scaffold once CI is green (D42) | – | – | – | – | 09:27–09:30 browser block 1: any missing credential first, then `SEED_PASSWORD` (a passphrase U chooses and saves in the password manager) and `INTERNAL_USER_EMAILS` in `.env.local` (D118); "Confirm email" off by one dashboard click only if there is no `SUPABASE_ACCESS_TOKEN` and it wasn't done at home (D116) | NudgeBee T1, T2, T4 to 09:28 | 09:25 FV1; 09:30 DB and auth check; 09:30 NudgeBee T2/T4 (10:20 if U runs them, D8); 09:30 T accepted? |
| 09:30–09:50 | Check-in | 09:30 NudgeBee decision; 09:35 Production env vars by CLI from `~/jashn-vercel-cli`, then the Vercel readiness checks (deploy Ready, Node 24; D45); 09:35–09:55 the minimum contracts that compile all four first branches: fixtures, fonts, handler stubs, component stubs with their final props (D97), A's session helper, `dispatchCommand` and `src/db/ids.ts` stubs (D96, D98, D100), the `wedding_profile` and `itinerary` types (D99), typed signatures for A's 11:40 items (D102), the `export_job_status` stub (D52), the empty after-commit map (D53, D101), the Invite placeholder under D's path (D121), a voice gate stub that refuses voice writes (D47), PRODUCT.md, DESIGN.md and the token layer (D4, D44) | – | – | – | – | 09:32–09:38 Vercel import, Node 24, the one Production client key; phone bookmarks wait (D45). 09:38–09:58 Flagsmith dashboard steps A–E (one seat, so U only; D9; protected) | NB: NudgeBee T3, T5–T9 (D72); T: Arora card by 09:50 (doc-ai 4.1) | 09:45 Sarvam; 09:45 direction; 09:50 Arora card; 09:50 deploy Ready (D119) |
| 09:50–10:00 | Check-in | 09:50–09:55 merges contracts; cuts the 4 worktrees right after and starts `npm ci` at once, while the deploy finishes (D44, D70); env copies, agent files, the Stop hook written in `jashn-a` and copied to B–D, `.impeccable` to B and D if it exists (D119); Notion. `SEED_PASSWORD` still unset at 09:50: L generates it and U copies it into the password manager (D118) | `lane-a-schema` | `lane-b-shell` | `lane-c-voice`, on fixtures until A's schema is pushed (D96) | `lane-d-render-probe` | Flagsmith A–E to 09:58; 09:58–10:05 starts the 4 lane sessions ("ultracode", D10) | – | Worktrees only after contracts merge; D's prod probe waits for the deployed SHA (D44) |
| 10:00–10:30 | Keynote | 10:00–10:05 no card from T: L builds the Arora card as an HTML page outside the repo and renders a JPEG with headless Chrome in `~/sarvam-smoke` (D73, D119); ~10:05–10:15 Sarvam T5/T6 on the card (D7); Fable contracts review; Sol portrait, committed as `scripts/seed-assets/couple-photo.jpg` in a lead PR by 11:00 (D14, D107); demo-path spec; ~10:30 `lane-lead-contracts-2`: the card-import contract with the `image_extraction_provider` key (D115), the `team` and link-field types and fixtures (D99) and the rest (D44); reviews PRs as they open | `lane-a-schema` pushed as a draft PR by 10:20 (D96); seed copies built with the snapshot builder (D95); sign-in, guard, dispatcher, `dispatchCommand`, `wedding_profile` (D102) | Shell, Money vendor page on fixtures | Flags core, real gate, FV2 locally ~10:20; merges `origin/lane-a-schema` once it is pushed (D96); ~10:25 V-T4 through the turn route's `text` input, 3 runs of the live 8 (D112) | Probe PR ~10:25; builds against A's typed 11:40 signatures (D102) | Keynote; first any unfinished Flagsmith A–E (hard limit 10:30); then, only if T wasn't invited, NudgeBee T1, T2, T4 (~10:05) and the workflow build to 11:00 (export 6.1–6.4; D8, D72, D119); ~10:25 picks the two Bulbul voices (or T; 2 min, by 10:30; D78) | NB: the NudgeBee workflow vs httpbin | ~10:15 #11 reader; 10:15 F20; 10:20 kind decision if U ran the checks (it moves with them, D119); 10:25 A's schema pushed (D96); 10:30 voices |
| 10:30–10:45 | Keynote | 10:25–10:40 merges D's probe out of batch; logs timings | PR ready | PR ready | V-T3 on both phones through C's tunnel before 10:40 if the route records, else by 11:30 (D112); PRs ready | Runs the probe on prod at ~10:40; if it fails, the og renderer becomes D's top priority (D48); then `lane-d-publish` | ~10:40 approves the Sol photo (2 min, D119); eyeballs the probe PNG's Hindi | NB: NudgeBee workflow | ~10:40 probe pass; 10:40 deploy Ready (D119) |
| 10:45–11:00 | Keynote | **Batch 1** A→B→C→D, A's PRs first (D96); check, build, deploy, `flags.ok`; on prod only sign-in and `/api/health` (D46); Notion | | | | | 10:45 approves one screen only if the direction is "Proposed" (D86, D121); ~10:50 F1: launches the Synthetic experiment, tells C | NB: NudgeBee workflow | 10:50 F1/F4 |
| 11:00–11:15 | Flagsmith 11:00, NudgeBee 11:10 | Sol on small diffs | | | ~10:55 synthetic run; FV6 locally | | Asks the question lists at both demos; by 11:10 pastes `JOBS_API_TOKEN` into the NudgeBee Secret `jashn_ops_token`, from the password manager or `.env.local` in an editor, never through chat, Notion or a terminal (D117) | NB: NudgeBee workflow | ~11:00 F5 |
| 11:15–11:30 | Sarvam 11:20 | Sol on small diffs | | | 11:15 checks the deployed kill switch (D47): FV7 stage 1 on prod, or right after the 11:40 deploy if the pipeline split (D121); FV10; V-T3 by 11:30 at the latest (D112) | 11:15 authenticated read of a real Jashn job through the tunnel, with NB (D43) | 11:15 turns `voice_writes_enabled` off for C, then on (D47; after the 11:40 deploy instead if C's pipeline split, D121); asks the Sarvam questions; by 11:30 books two fluent Hindi speakers (one from outside the team), a separate device and a rehearsal copy (D49) | NB: 11:15 tunnel read with D | 11:15 tunnel read; 11:15 kill switch |
| 11:30–11:45 | Hacking | **Batch 2** at 11:40: L's photo PR first (D107), then A→B→C→D; then a persisted payment correction on prod (D46) | | | | | Laptop: speak, confirm, refresh, payment history | Phones with U | 11:30 F14 |
| 11:45–12:15 | Hacking | Right after the 11:40 deploy, the seed's photo step for every copy, so the photo is part of D0 (D107); 11:50 Lotus Hall check with D (D41, D107); Fable gate review of `main`; ~12:15 adds `NUDGEBEE_EXPORT_WEBHOOK_URL` by CLI from NB's workflow (D5, export 10.4); Notion | | | | ~11:50 on prod, copy d: Diya's `update_event` through `POST /api/w/[wedding_id]/commands/update_event`, Mira publishes through PublishSheet on D's own Invite page, then the PNG downloads from a real export job (D41, D107); the same NudgeBee read on prod, keeping the first run id (D43); P2, P3; ~12:00 renders and commits `scripts/seed-assets/card-rev2.png` (D15) | ~12:00 F2: launches the Production experiment | NB: production objects, 12:15–13:00 (export 6.1, D72); the `jashn_ops_token` Secret is U's, from 11:10 (D117) | 11:50 Lotus Hall card and prod read; 11:55 F3 |
| 12:15–12:30 | Hacking | Renderer gate with D; voice medians; the voice, audio and renderer checks that exist (D46) | | | | | Capture and Bulbul-audio test; flips `card_renderer` to `og` if the gate fails, no deploy (D48). No smoke test before the 12:30 deploy (D111) | – | 12:15 renderer; 12:15 voice |
| 12:30–12:45 | Hacking | **Batch 3**; then checks the served SHA, rotates H16 and runs the connected demo-path spec on `e2e`: refresh, second session, one RSVP, guest privacy (D46); turn gate; Astra only if behind | | | Full kill-switch check with U after the deploy (D47); full AT-2.7 (D55) | NB-T10–T15, P4, P5 after the deploy; run ids in a follow-up PR (D62) | ~12:35–12:55 the two-device smoke test and first end-to-end run with T (acceptance 2, D111); rollout step 1 if the gate passes; the kill-switch check with C: a pending voice write, one typed save (an Events edit such as a dress code if the requirement form isn't merged, D114), a read-only question, flag restored, result logged (D47); by 12:45 picks the NudgeBee recording path with L (D43) | ~12:35–12:55 phones in the smoke test (D111); NB: NB-T10–T15 with D | 12:30 cut round 1 and more; 12:45 recording path |
| 12:45–13:00 | Hacking | Must check on prod; Notion | | | Resets, timings and the results log for voice run 1 (D49) | NB-T10–T15 | Prepares V15 | NB-T10–T15; a booked speaker runs voice run 1 on the separate device, apart from U, overlapping the smoke test (D49, D111) | 12:45 F2 latest; 12:45 voice run 1; 12:50 webhook |
| 13:00–13:30 | Lunch | #11 go/no-go (Must 1–9 verified by 13:00, D56) | Lunch at the seat in turns | | | Records V15 with U (protected; needs one full drill that passed, D43) | Records V15 with D | Lunch | 13:00 privacy; 13:00 #11 |
| 13:30–13:45 | Lunch | Option B and PDF gates (D66); writes down which demo-path steps passed before calling the path ready at 13:45 (D46) | | | | | 10 s refusal clip; 8 s correction clip | – | 13:30 gates; 13:45 path ready |
| 13:45–14:00 | Hacking | **Batch 4**: demo-path fixes first, then Must polish, then Shoulds that passed their gate, only if the post-12:30 demo-path run passed and their checks are green (D106); Notion | | | | | Rollout step 2 | – | 13:45 cut round 2; 13:45 #13 backend |
| 14:00–14:30 | Hacking | README W/P/F draft; sponsor clips into the HyperFrames shell, outside the repo, by 14:40 (D50); 14:15 Fable release review | | | Resets and log for voice run 2 (D49) | Live-mode rehearsals with U | 14:00 Flagsmith Usage; NudgeBee rehearsals; V15 retake if needed | Invites first-time testers; a booked speaker runs voice run 2 (D49) | 14:00 connected flow; 14:00 voice run 2; F15 |
| 14:30–14:45 | Hacking | **Batch 5**, the last batch: Should voice items, PDF if approved, fixes (D106); decides the NudgeBee mode (D40); 14:40 clips assembled: audio, labels, run id checked (D50) | | | | | Experiment screenshots; rollout step 3 | Testers | 14:30 gates; 14:40 clips |
| 14:45–15:15 | Hacking | **Freeze**: security review, `/code-review high`, Sol on the correction diff; W/P/F; 15:00 hosting gate; 15:00 setup test from a fresh public clone: `npm ci`, build, start against the existing project (D51, D74) | Blockers only | Blockers only | Blockers only | Blockers only | Freeze smoke test; then take 1 at once, the submission-safe take, which doubles as stopwatch rehearsal 1; any second run is take 2, after the 15:30 check (D50, D121) | Phones | 14:45 voice, #11, live updates; 15:00 hosting |
| 15:15–15:30 | Hacking | README draft on `main` for U's 15:30 check | | | | | Uploads take 1 unlisted; by 15:30 checks signed out that all three sponsor beats play (D50) | Phones | 15:30 take 1 plays |
| 15:30–16:00 | Hacking | Playwright before each take | | | | | 15:30 checks the signed-out README and video: AI use, what existed before 09:00, sponsor evidence, fallback video (D51, D74); then final takes (≤3); last start 15:45 | Phones | 15:30 README; 15:30 network; F11 |
| 16:00–16:10 | Hacking | 16:00 merges the final README (D74); edits: shell, ffmpeg cuts, captions; exports the MP4 | | | | | Approves the cut | – | 16:00 footage locked; 16:00 README |
| 16:10–16:20 | Hacking | Uploads the final | | | | | – | Checks signed-out playback on the phone | 16:10 edit |
| 16:20–16:35 | Final build and submissions | Notion | | | | | 16:35 submits; keeps the receipt | 16:20–16:30 checks every link in a private window (U if T is absent; D74) | 16:20 playback; 16:35 target |
| 16:35–17:00 | Final build | Runs `reset_demo` to D0 through the command route (no UI control, D17) | | | | | Restores flags, charges devices | Charges the phone | 16:45 latest; 17:00 deadline |
| 17:00–17:45 | Judging | Runs `reset_demo` after each judge, on U's word | | | | | Presents | Holds the guest phone (Tara) | – |
| 17:45–18:00 | Awards | – | | | | | – | – | – |

**Sarvam:** L runs T0–T4, V-T1, V-T2 and the Bulbul audition samples at 09:14 in every case, reading the key from `.env.local` without printing it, so T needs no Sarvam key (D7, D78).

**If T is absent, or U couldn't invite T to NudgeBee:** U is NB. U runs NudgeBee T1, T2 and T4 at about 10:05, after any unfinished Flagsmith steps, so the kind decision moves to 10:20 (D8, D119). U also builds the workflow 10:05–11:00 during the keynote, following export 6.1–6.4 click by click, and does the 11:15 tunnel read and the 12:15–13:00 objects (D72). If T is absent, U also holds the phones, using demo-script 1.1's solo layout.

## 3. Milestones per lane per batch

**Done-check for every batch.** CI is green. Before a PR is marked ready, `npm test` (plus `npm run test:db` for `*.db.test.ts` files, D103), `npm run build` and the lane's own spec pass on fixtures or injected dependencies, on the lane's own copy; the spec starts its own dev server on its port (3001–3004) and uses its own `@example.com` accounts (D104, D120). L's `npm ci`, check and build on `main` pass; `/api/health` shows `flags.ok` true from 10:45; Notion is updated. After each deploy, every lane merges `origin/main` and reruns the real-data part on its own copy; a failure becomes the next batch's first item, and L holds a batch only for D46's demo-path checks (D104). Must items land by batch 3; Shoulds come only after their gates (section 4).

**Staged production checks (D46).** 10:45: sign-in and `/api/health`. After 11:40: a persisted payment correction, and at 11:50 D's Lotus Hall publish (on its own Invite page, D107) and PNG download. 12:15: the voice, audio and renderer checks that exist, with no smoke test yet (D111). After the 12:30 deploy: L checks the served SHA, rotates H16 and runs the connected demo-path spec on `e2e`. Playwright's global set-up (sign-in, reset, H16 rotation) belongs to L's demo-path project only, and rotates H16 only from 12:30. L writes down which steps passed before calling the path ready at 13:45.

**The two-device smoke test** (acceptance 2, 12 minutes of U and T) runs first at about 12:35–12:55, after the 12:30 deploy and with the first end-to-end run, then at the freeze and before each take (D111). The 12:45 voice run may overlap it, because it uses the booked speakers on a separate device (D49).

| Batch | A: data, roles, privacy, dispatcher, seed | B: planning screens, design system | C: voice, Flagsmith, setup, #11 | D: invite, guest site, RSVP, export, NudgeBee |
|---|---|---|---|---|
| ~10:25, out of batch | – | – | – | `lane-d-render-probe`: render page, Chromium, `/run` probe with a temporary bearer check (export 3.6, D58) |
| 10:45 | `lane-a-schema` (draft PR by 10:20, D96): every table, including `voice_turns`, `experiment_exposures`, `export_jobs`, `export_attempts` and `card_imports`; the seed for every copy (demo, a–d, e2e), with REV-1 and REV-2 from the pure snapshot builder `src/db/itinerary-snapshot.ts` (D95). `lane-a-dispatcher`: sign-in and the real session helper, the dispatcher with the guard and the receipt re-check, the real `dispatchCommand` (D98), the after-commit map run in `after()` (D101), version poll, `LiveRefresh`, `wedding_profile` (D99, D102). AT-8.1, AT-9.2, AT-9.7 | `lane-b-shell`: planner shell with the header mic (D20), reading `wedding_profile` (D99), its nav linking to `routes.invite` (D's page, D121), the token layer finished; Money vendor page on fixtures. AT-2.12, AT-6.1 (fixtures) | `lane-c-voice`: flags core, real voice gate (fails closed, D47), VoiceDock, chips, record → preview → confirm, checked on fixtures (D55); `voice_turns` written through `origin/lane-a-schema`, or behind an in-memory fake if it wasn't pushed by 10:25 (D96); the pipeline may split to `lane-c-voice-pipeline` at 11:40. Also `lane-c-synthetic-run`. AT-2.2, 2.3, 2.8, 2.10, 2.13; FV2 | – (`lane-d-publish` in progress) |
| 11:40 | Merged ahead of D, unless A shipped them at 10:45 (D102): the Storage adapter and signing helpers (D41), the guest token resolver (D57), the `JOBS_API_TOKEN` system verifier (D58) and `reset_demo` (command route only, D17). `lane-a-ledger`: money commands, corrections with versions, proposals, ledger read models. AT-5.1–5.9, AT-6.1–6.5 (records). `lane-a-events` (A4): `create_event`, the draft venue change `update_event` (D41), `add_requirement`, the itinerary read model with `venues[]` and `requirements[]` (D99), activity feed. AT-3.1–3.3, 3.7, 3.8, AT-8.2, 8.5 | `lane-b-money`: Money, vendor pages on real data, corrections, approvals, the wash helper and vendor highlight targets (D61). AT-5.1–5.9, AT-6.1, 6.2, 6.4, 6.5. B1's landing view on A's `wedding_profile`, kept after sign-out and sign-in (D60, D99; AT-1.2, 1.5) | `lane-c-setup-experiment`: AT-1.1–1.6, 1.8, 1.9; the real setup-saved hook (D39); FV9 after the batch. The typed prefill store (D61). `lane-c-flags-drawer` (12:30 at the latest). After A3: the persisted M-03 and C-01 replay (D55) | `lane-d-publish`: `publish_itinerary` (importing A's snapshot builder, D95), `update_invite_style`, the reusable PublishSheet (D41, D59) and D's own Invite page mounting it for the 11:50 check (D105, D107). AT-3.4–3.6, AT-9.3. `lane-d-export-jobs`: `request_card_export`, `retry_card_export`, the worker's upsert and size check through A's adapter, the real `export_job_status` (D52), the export kick in `after-commit.ts` (D101), the retry starting `/run` before its wait (D53). EX-01–EX-16, AT-7.3, 7.4. The og renderer, dormant, Chromium still selected (D48) |
| 12:30 | `lane-a-guests`: guest DTO, revision read, RSVP and dietary handlers, `submit_rsvp`, links with `link_status` and `last_rotated_at` (D99), the one rate limiter: per token hash about 120 GETs and 30 POSTs a minute, a loose 600 a minute per IP (D57, D108). AT-4.1–4.9 (records), AT-9.1, 9.3, 9.4. `lane-a-members-files`: sharing, member invites, `remove_member` and `revoke_member_invite` (D64), the `team` read model (D99), uploads, `add_asset`. AT-9.6, AT-9.8 | `lane-b-events` (B3): events, draft-and-publish view with D's PublishSheet, activity feed. AT-3.1, 3.3, 3.5, 3.7, 3.8, AT-8.2, 8.5, 8.6, AT-2.7 typed save. `lane-b-guests`: the minimum Guests screen, AT-4.7, 4.8, whether or not #11 is in play (D105, D121). The visible RSVP count: the reply table's totals and the vendor page's estimate headcount (230 × ₹800), both from `rsvp_totals` (D41, D110) | `lane-c-voice-answers`: answers, reply audio, refusals, the `add_requirement` kind, I-02 (export) and E-05 (publish) through D's sheet (D59). AT-2.1, 2.4–2.6, 2.11, AT-12.2, 12.3 | `lane-d-guest-site`: guest page and routes, one call to A's limiter per request (D57). AT-4.1–4.4, 4.6, 4.9, AT-7.2, AT-9.1–9.5. `lane-d-ops-recovery`: panel, webhook, `ops/nudgebee/`, gated on tunnel or manual checks (D62). The REV-2 seed card (D15). The minimum Invite studio on D's Invite page, always: AT-7.1's typed path, the style and the couple photo through A6's upload (D105) |
| 13:45 | Demo-path fixes. Gated Shoulds (D106): `lane-a-overview` (#10), `lane-a-shagun` (#13; the shared Shagun deadline, D65), `lane-a-seed-card` (D15). `lane-a-pdf-format` merges out of batch at 13:30 only if PDF is approved (D66) | Demo-path fixes; `lane-b-guests-links` (D121): Guests polish (AT-4.9, 9.6) and B4's owners-only team and sharing sheet, opened from the shell's wedding menu with no new route segment, with the one-time join URL, reading `team` and the link fields (D64, D109). B5 (Overview) and B6 (Shagun) start on fixtures by 13:30 and check real reads after 13:45 (D65, D121) | Fixes from voice run 1; `lane-c-judge-panel` (gated, D106); I-01 by voice with the dock's "Couple photo" upload, after A6 and D's `update_invite_style`; if it misses, AT-7.1's voice half is Partial (D121) | Demo-path fixes; Invite studio polish (`lane-d-invite-studio`, gated, D105, D106) |
| 14:30 | Fixes; any Should moved from 13:45 (D106) | `lane-b-overview` (#10, real reads after 13:45), `lane-b-shagun` (#13); impeccable polish on the five video screens | SH-01 and SH-02 by voice, only if #13's backend made 13:45 (D65). #11 `lane-c-card-reader` (AT-11.1–11.3, doc-ai AC-1 to AC-12), only if it started by 13:00 | `lane-d-pdf`, only if approved at 13:30 (D66); fixes (Option B is a cluster run, not a merge) |

**Order among the Shoulds:** #12 first, because the Flagsmith beat's typed save uses it. Then #10, because the demo closes on the overview. Then #13, then #11 (doc-ai 5.2).

## 4. Gates and fallbacks

### 4.1 If an account is missing at 09:00

U checks every account before 09:00 (D45). Each one still missing at 09:00 costs U 5–10 minutes: U fixes it in the ~09:05–09:10 queue window, and whatever is left goes first in the 09:27 block. The design block (09:10–09:27), the Flagsmith block (09:38–09:58) and the 09:50–09:55 contracts merge don't move. If the design pick slips anyway, the 09:45 row below applies.

| Missing | Who, when | Do | If it is still missing |
|---|---|---|---|
| Supabase project (Mumbai) or access token | U, before 09:00; else ~09:05 | Create the project; paste its values into `.env.local` by hand | 09:30: Neon, Better Auth and Vercel Blob (arch 8 row 1) |
| Flagsmith account, project "Jashn", its 3 environments, warehouses or keys | U, straight after Supabase | Create them; enable the warehouse in all three and send the test event at once, because first ingestion can take hours | 12:30: labelled app-side counts (arch 8 row 9). The dashboard steps are still due by 10:30 (F20) |
| Sarvam key or credits | U, before 09:00; at the latest first in the 09:27 block | Create the key; check Billing; top up ₹300–500 | 09:45: `VOICE_FIXTURE_MODE=on` in C's worktree only (arch 8 row 3) |
| NudgeBee account or `jashn-kind` | U, before 09:00: creates the account and invites T if NudgeBee allows it; `jashn-kind` is T1 for NB | – | Ask at 11:10. 14:30: the README says so (export 6.10 step 5) |
| T's registration | U, before 09:00, confirmed again at the check-in desk | – | 09:30: T stays off the project; U takes every T task |
| iPhone iOS version | U before leaving (morning checklist), in Settings › General › About | iOS 18 or later: iPhone Mirroring. Otherwise QuickTime over USB | Tara on Android Chrome with scrcpy |

### 4.2 Every trigger, by time

| By | If | Then | Owner |
|---|---|---|---|
| 09:22 | The `gh api` ruleset call fails | Skip it; L enforces the PR flow anyway. U has no ruleset click (D69) | L |
| 09:25 | FV1: a warehouse isn't Connected | Resend the test event; ask at 11:00 (flagsmith F1) | L, U |
| 09:30 | The Supabase project isn't ready, or `psql` or L's Admin-API auth check fails twice (D68) | Neon, Better Auth and Blob; A rewrites only auth, storage and `lib/supabase` (arch 8 row 1) | L |
| 09:30 (10:20 if U runs the checks at ~10:05, D8) | NudgeBee T2 or T4 fails with no agent | On U's MacBook, L runs Docker, `kind create cluster` and the download; U runs `read -s` and the installation line in a plain Terminal tab, as in step 0; L runs the kubectl checks (15–25 min, Docker running; D119); then `caffeinate` until judging (arch 8 row 6) | NB, then L and U |
| 09:30 (10:20) | T4: in-app approval is unusable | Use `email` approval to U (export 6.10 step 2) | NB |
| 09:45 | The Sarvam key fails T0, or credits are at ₹0 (402) | C uses fixture mode in its worktree; U fixes the key; production never runs fixtures (arch 8 row 3) | L, C, U |
| 09:45 | The design direction isn't picked | L commits PRODUCT.md and DESIGN.md marked "Proposed" in the contracts PR, with the tokens (D4); Lane B finishes; U approves one screen at the 10:45 batch. With a pick, L checks B's vendor-page screenshot against design-direction itself (D121) | U, L, B |
| 09:50 | No Ready production deploy | L tells D the probe waits; U retries the import at 10:05 (D119) | L, U |
| ~10:15 | Card-reader T5 and T6 both fail | #11 is Future, and `image_extraction_provider` is never created (arch 8 row 11) | L |
| 10:15 | There are no Flagsmith flags yet | C builds on fallbacks. 10:30 is the hard stop, before batch 1 (F20) | U |
| 10:25 | `lane-a-schema` isn't pushed | C's 10:45 PR keeps `voice_turns` writes behind its own small store interface with an in-memory fake; the real write moves to 11:40 (D96) | C, A |
| ~10:40 | The probe fails: launch error, timing over 30 s, or bad Hindi | The og renderer becomes D's top priority, and D verifies a real PNG from it; D also fixes Chromium (file tracing, launch arguments) before the 12:15 gate (D48) | D |
| 10:40 | Still no Ready production deploy | The og renderer becomes D's top priority (D48); L brings up the tunnel host (arch 8 row 10; D119) | L, D |
| 10:45 | Copies c and d aren't seeded | C and D read the e2e copy (GETs only) and use fixtures for writes until 11:40 (D120) | C, D |
| 10:50 | A Pending warehouse blocks F1 | Create each experiment once its warehouse is Connected; F2 may slide to 12:45 (F4) | U |
| ~11:00 | FV6: the flip takes over 3 s | Reorder the beat: flip first. Over 20 s, use the refusal clip (F5) | C |
| 11:15 | The first authenticated read of a real Jashn job through the tunnel fails | D owns URL, credential and response failures: check the URL, https, redirects and challenges; ask the sponsor; start runs manually by job id (arch 8 row 7, D43) | D, NB |
| 11:15 | The flag flip doesn't refuse voice writes on the deploy | C fixes the gate before 12:30; U restores the flag (D47) | C, U |
| 11:30 | SDK 9.5.0 is faulty: events missing or `reason` empty | L moves to the 9.4.0 pin in a `lane-lead-` PR (F14) | L |
| 11:50 | The Lotus Hall publish or the PNG download from a real export job fails on prod | D fixes it first; A joins if Storage or `update_event` is the cause (D41) | D, A |
| 11:50 | The first production read fails | Same as 11:15; manual runs (export 6.10 step 3) | D |
| 11:55 | FV9: no rise in events | Check the key; await the flush on setup and conversion (F3) | C |
| 12:15 | No production REV-3 PNG with both Hindi lines | U sets `card_renderer` to `og` in Production; the og renderer shipped dormant at 11:40, so no deploy is needed (D48). The README marks dynamic Hindi Partial. If batch 2 slipped, a passing REV-3 probe counts, and the real job must pass by 12:45 (export 3.6) | D, U |
| 12:15 | Two of five amount-bearing turns fail | Shorten the line; keep editable numbers; record a good run (voice-test-set 3) | C, U |
| 12:15 | Bulbul is missing from the screen capture | Caption the replies (V01) | U |
| 12:30 | The Production warehouse isn't Connected | Labelled "Sent by Jashn" counts; claim no Flagsmith statistics (arch 8 row 9) | C, L |
| 12:30 | A duplicate confirmation posts twice | Turn off financial writes until both devices pass; Partial if it misses the freeze | A, L |
| 12:30 | Behind: demo-path steps 1–8 fail on production, or a Must PR missed batch 2 | Cut round 1 (section 5); Astra replans by 12:45 | L |
| 12:30 | Rollout step 1: FV7 passed and the turn gate holds | Step 1. If not, hold and fix (flagsmith 4.3) | L, U |
| 12:45 | F2 is still blocked | Follow F1: app-side counts, labelled | U |
| 12:45 | The NudgeBee recording path | Webhook broken: start the workflow manually. Only the retry broken: record NudgeBee reading the failed job, then U retrying in Jashn, then NudgeBee reading the completion, labelled with who retried (D43) | L, U |
| 12:50 | NB-T10: the webhook doesn't start a run | Manual trigger by job id; stop debugging the filter at 13:00 (export 6.10 step 1) | NB, D |
| 13:00 | Tara can read an uninvited function, a draft or Money | Take the guest link offline until all three checks pass | D, A |
| 13:00 | #11's build hasn't started, or L can't verify Must 1–9 | #11 is Future; the flag is never created (doc-ai 5.2, D56) | L |
| 13:30 | Option B: V15 recorded, NB-T10–T12 pass, D's Musts merged, agent fits in 25 min | Go, with a hard stop at 14:30. Otherwise drop it | L |
| 13:30 | PDF approved (export 1.4) | A's additive `pdf` enum and bucket type merge out of batch; D's one-page PDF goes in the 14:30 batch (D66). Not approved: no PDF | L |
| 13:45 | Still behind after batch 4 | Cut round 2 (section 5); rollout step 2 only if the turn gate holds | L |
| 13:45 | #13's backend missed batch 4 | #13 is Future (D65) | L |
| 14:00 | The connected demo flow fails | Drop #10; every lane works on a reproducible demo-path failure | L |
| 14:00 | Flagsmith usage is over 10,000 | Find the loop: a focus storm or `/api/health` (F15) | C |
| 14:30 | V15 still has no real NudgeBee run on a Jashn job | The README says so (arch 8 row 8); the 12:45 path stays the only fallback | D, L |
| 14:30 | The live run finishes in under 15 s in rehearsal | Live NudgeBee beat. Otherwise, the default: the recorded beat, with the drill off in the live run (D40, export 7.1) | L decides |
| 14:30 | Fewer than 2 Production exposures | Invite testers until 14:45; report the true n (F8) | T |
| 14:30 | #11's PR isn't in batch 5 with its local checks passing | The flag stays `off` | L |
| 14:30 | Rollout step 3 gate | Take step 3; 16:15 at the latest (F16) | L, U |
| 14:45 | The live lines still miss 5 passes in a row | Voice is Partial; those beats are typed, plus the labelled clip (arch 8 row 4) | C, L |
| 14:45 | AC-1, AC-2 and AC-9 don't pass on production | #11 stays `off`, Partial or Future | C |
| 14:45–15:15 | Diya's change takes over 5 s in two rehearsals | Add a manual refresh at 1:02 (arch 8 row 12) | U |
| 14:45–15:15 | The median from speech end to preview is over 8 s | Cut LIVE #1 and #5 and narrate them | U |
| Any time | A second Vercel deploy failure caused by the platform | L brings up the cloudflared tunnel at once and D verifies its authenticated endpoint; nobody waits for 15:00 (D48) | L, D |
| 15:00 | Vercel can't deploy `main` | `next start` on the laptop behind a tunnel, with the Production Flagsmith keys (arch 8 row 10) | L |
| 15:30 | Take 1 misses a sponsor beat signed out | The next take fixes that beat first; no other take before it (D50) | U |
| 15:30 | A device misses two rehearsed transitions | Switch to the hotspot; play the recording of that step | U, T |
| 15:30 | Synthetic data shows without its label | Cut it (F11) | L |
| 15:45 | The last take hasn't started | No new take; use the best take so far | U |
| 16:10 | The edit isn't exported | Stop editing. Upload an ffmpeg concat of the raw takes, or keep take 1 (already uploaded) | L, U |
| 16:20 | The final doesn't play signed out | Submit take 1's link | U |
| 16:35 | The drill is armed or the kill switch is off | Restore both (F12) | U |
| 16:45 | Not submitted | Submit whatever is up, now | U |

**Times moved from the specs:**
- Sarvam T0–T4: L at 09:14, not T (D7). T5/T6: 09:25 → ~10:05–10:15, once the card image exists (D7, D119).
- Flagsmith dashboard: 09:30–09:50 → 09:38–09:58, after the design pick and the Vercel import; hard limit 10:30 (D9).
- Contracts merge 09:50–09:55, lanes start 09:58–10:05 (D70).
- Smoke test and first end-to-end run: 12:15 → ~12:35–12:55, after the 12:30 deploy (D111).
- Webhook check: 12:30 → 12:50, after the 12:30 deploy; filter debugging until 13:00 only (D121).
- NudgeBee reads: 11:15 through the tunnel, about 11:50 on production (D43). The recording path is chosen by 12:45, not 14:30.
- Submission checks: 15:00 public-clone test, 15:30 signed-out README and video, 16:00 final README, 16:20–16:30 links, 16:35 submit (D74).

## 5. The cut list

**Round 1, at 12:30, if behind.** Drop these in order: Option B; the PDF card; #11 (Future, flag never created, V02b gone); #13; D's extras (`ai_note`, the stalled-state copy); the live NudgeBee upgrade (stays recorded); #10, with the demo closing on Money instead. Freed lanes take the failing demo-path steps.

**Round 2, at 13:45, if still behind:**
1. #12 by voice. Keep the typed form. If that isn't ready either, the Flagsmith beat refuses a Must voice write (E-03, the mehendi end time) and then saves it in the Events form.
2. Flags drawer parts 2–4. Show Flagsmith's own pages, and run the pre-flight on `/api/health`.
3. Mark these Partial without finishing them: AT-1.3, AT-3.7, AT-4.4, AT-4.7, AT-6.4, AT-6.5, AT-8.5.
4. Polish beyond the five video screens.

**Never cut:**
- The demo path: the 8 live lines, Tara's RSVP (229 → 230), the estimate beside the contract, the kill-switch flip with its server refusal and typed save, and the recorded V15.
- Voice setup S-01/S-02 for the video.
- Server privacy (AT-9.1–9.3) and exactly-once (AT-4.3, AT-5.4).
- The experiment's exposure and conversion events.
- The export job, the ops routes and the drill.
- The README with W/P/F and the disclosure, take 1 as the fallback video, and every honest label.

## 6. Sponsor proof

| Sponsor | Live demo (demo-script 2) | Video (demo-script 4) | Console or repo | Honest label |
|---|---|---|---|---|
| Sarvam | 0:12–2:10: lines #1–#7, with the transcript, the language chip and Bulbul audio. In Q&A, "How Jashn heard you" (voice.md 8) shows the Saaras request id, `sarvam-105b`'s attempts and Bulbul | 0:00–0:07 (V01), 0:07–0:32 setup (V02), 0:35–1:05 money (V04), 1:40–1:55 (V11); +4 s Document AI (V02b), only if #11 is Working | Backup: indus.sarvam.ai › Billing shows today's usage | Production never shows "Fixture, not Sarvam". On an outage, say "Sarvam timed out; here is the same correction by typing" |
| Flagsmith | 2:10–2:30: tab 3, Production › Experiments (red banner, real counts, "Collecting data", n); tab 4, Synthetic (purple banner); tab 2, flip `voice_writes_enabled` off; R-03 refused by the server; typed save | 1:55–2:15 (V13, V14) | `voice_rollout` and its split, the Identities page, and the README rollout and flip log with times | Synthetic: "SYNTHETIC DATA … planted 50% vs 60%". Real: "too small to call a winner". Fallback: "screenshot, 14:30" |
| NudgeBee | 2:30–2:50: V15 clip of the real run (failed → read status → approval → retry → completed → `card-rev3.png` showing Lotus Hall); live only if L picks it at 14:30 (D40) | 2:15–2:35 (V15) | NudgeBee Executions with the run id; `ops/nudgebee/card-export-recovery.yaml`; the run id in the README | "Deliberate fault"; caption "Recorded today, <actual time>, from this deployment · NudgeBee run <ID>". Read-only fallback disclosed |

## 7. Demo and video

**Who:** U presents and speaks Mira's lines on the laptop headset. T is Diya (Chrome) and Tara (Safari private tab) on the phone. If T is absent, U uses the solo layout. Pre-flight: acceptance 3.1, ten minutes before every run.

| IST | Slot | Owner | Done-check |
|---|---|---|---|
| 12:15 | Capture test, including Bulbul's system audio (D111) | U, L | V01 audio heard |
| 12:35–12:55 | After the 12:30 deploy: the two-device smoke test and the first end-to-end run (acceptance 2, D111) | U, T, L | The smoke-test log |
| by 12:45 | Choose the V15 recording path (4.2, D43) | L, U | Path written on Notion |
| 13:00–13:30 | Record V15 on the demo copy (export 7.2), protected, after one full drill that passed; retake 14:00–14:30 only if needed (D33, D43) | U, D | Run id and time written down; 3 screenshots; drill disarmed |
| 13:30–13:45 | The 10 s refusal clip and the 8 s correction clip, labelled "recorded"; bank a real Sarvam correction with audible playback as soon as one succeeds (D49) | U | Files saved locally |
| 14:30 | Timestamped screenshots of both experiment pages and the drawer | U | Banners in frame |
| by 14:40 | Sponsor clips assembled in the HyperFrames shell, outside the repo (D50) | L | Audio, labels and run id checked |
| 14:45–15:15 | Freeze smoke test; then take 1 at once, the submission-safe take, which doubles as the first stopwatch rehearsal (acceptance 3.2 pass rule). Any second run is take 2, after the 15:30 playback check (D50, D121) | U, T | Beat times logged; take 1 saved |
| 15:15–15:30 | Upload take 1, unlisted | U | By 15:30 all three sponsor beats play signed out (D50) |
| 15:30–16:00 | 15:30 signed-out README and video check (D74); then final takes, at most 3; the last starts by 15:45. V02 uses a fresh internal `@example.com` owner on production (flagsmith 10.4) | U, T | Footage locked at 16:00 |
| 16:00–16:10 | Edit with L's HyperFrames shell and ffmpeg; hand-written captions; export H.264 at 1080p | L, U | Under 2:45; local copy kept |
| 16:10–16:20 | Upload the final; check it signed out on the phone | L, T | It plays |
| 16:20–16:35 | 16:20–16:30 every link in a private window (T, else U); 16:35 submit (steps below; D74) | U, T | Receipt screenshot |

**Submission steps (U with L, 16:20–16:35; 16:45 at the latest):**
1. Open the repo signed out: public, and the README renders.
2. The README (final, merged at 16:00) has the setup steps (tested from a fresh public clone at 15:00), the W/P/F table from the freeze, the AI disclosure (presentation §6, corrected; D31) with the "existed before 09:00" line, the rollout log, the synthetic run record and the NudgeBee run id.
3. Paste the repo URL and video link into the form named at check-in, and fill its AI-disclosure field.
4. Keep the receipt and post it on Notion.

## 8. Reviews and status

| When | Who | Reviews | Result goes to |
|---|---|---|---|
| Every PR, before "ready" | The lane | `/code-review medium --fix`, then the check, `npm test` (plus `npm run test:db` if it has database tests, D103), the build and its lane spec | PR body |
| Each PR touching money, RSVP, the guard, tokens or ops | Sol (`gpt-6.2-sol`, medium effort, read-only) through L's codex wrapper. Always pass `-m` and the effort | The diff | L reads it before the batch |
| 10:00–11:00 | Sol, through L's codex wrapper (D14) | Generates the fictional couple portrait (3:2, at least 1500 × 1000), approved by U at ~10:40 (D119); labelled AI-generated in the README, never cropped | `scripts/seed-assets/couple-photo.jpg` in L's PR by 11:00, merged first at 11:40 (D107) |
| 11:55–12:15 | Fable 5.2 | `main` after batch 2: corrections, exactly-once RSVP, guest privacy, the kill switch failing closed, export idempotency | Fix PRs for batch 3 |
| 12:30, only if behind | Astra | A replan from Notion and the failing Playwright steps | Reassignment by 12:45 |
| 14:15–14:40 | Fable 5.2 | Release review: the demo path, W/P/F honesty, sponsor labels, the README | Blocker list for the freeze |
| 14:45 | L | `/security-review`, `/code-review high` on money and RSVP, Sol on the correction diff | Blocker fixes only |

**How lanes reach the lead:** ListAgents, then SendMessage to the session working in `~/Desktop/Personal/Jashn`. If that fails, the lane says so in its reply and U relays the message.

**Status:** L keeps the Notion page "Jashn — Build HQ" current:
- 5 minutes before each batch, it lists the batch's PRs, and U can stop any of them;
- within 10 minutes after the batch, it posts what merged, Playwright, `flags.ok`, the gate results, the cuts, the W/P/F draft and the next owners;
- it records every gate decision at its time.

## 9. Top risks

| Risk | Early signal | Owner | Pre-decided response |
|---|---|---|---|
| An account is still missing | 09:25 checks fail | U | Table 4.1 |
| U is overloaded from 09:00 to 10:30 | The design pick or the flags slip past 09:45 or 10:15 | U, L | Accounts checked before 09:00; the design and Flagsmith blocks protected; L does the ruleset, the auth check, "Confirm email" when the access token is there, and the Vercel readiness checks (D45, D68, D69, D116); L commits the direction marked "Proposed"; flags by 10:30 (F20), U only (one seat); T takes the NudgeBee checks if invited |
| T is absent or unregistered | Not accepted by 09:30 | U | Solo layout; U is NB; L runs the curl checks |
| A's schema misses batch 1 | No `lane-a-schema` draft PR by 10:20 (D96) | A, L | From 10:25, C keeps `voice_turns` behind its in-memory fake (D96); B, C and D stay on fixtures; A's PR merges out of batch once green |
| The A-to-D handoff slips (Storage, `update_event`) | No Lotus Hall card on prod at 11:50 | A, D | Storage helpers and `update_event` by 11:40 at the latest, ahead of member invites (D41); their signatures are typed in the contracts, and A merges ahead of D (D102) |
| Chromium or Hindi fails on Vercel | 10:40 probe | D, U | og renderer dormant from 11:40; U flips `card_renderer` at 12:15 without a deploy (D48) |
| NudgeBee can't run, reach or retry | 09:30, 11:15, 11:50, 12:45 | NB, D | kind plus agent; manual runs; the 12:45 recording path (D43) |
| Hinglish misheard or slow in the hall | 12:15 runs; median over 8 s | C, U | Shorter lines, editable numbers, cut #1 and #5, typed path |
| Money doubled or a guest leak | 12:30 and 13:00 checks | A, D | Writes off, or the link offline, until both devices pass |
| Venue network or Vercel down | Two missed transitions; failed deploys | U, L | Hotspot; tunnel at the second platform failure (D48); laptop plus tunnel by 15:00 |
| The video is late | Edit not exported by 16:10 | U, L | Take 1, uploaded and checked by 15:30, is submitted |
