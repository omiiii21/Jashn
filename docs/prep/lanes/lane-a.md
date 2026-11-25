# Lane A brief: data, roles and privacy

Written 05:10 IST on Wed 25 Nov 2026 and updated at 06:10 to decisions D1–D122, before coding starts at 09:00. At about 09:55, right after the contracts PR merges, the lead copies this file into the worktree as `CLAUDE.local.md`. Read it first, then `AGENTS.md`, then the spec sections in part 3. Where any note disagrees with `docs/prep/decisions.md`, the decision wins. All times are IST.

## 1. Header

**Mission:** build the one write path and the one read path that every screen, voice turn, guest link and NudgeBee call goes through, and seed the demo data exactly.

| Item | Value |
|---|---|
| Worktree | `~/Desktop/Personal/jashn-a` |
| Dev port | 3001. `APP_BASE_URL` is `http://localhost:3001` (or your tunnel URL while testing on a phone) |
| First branch | `lane-a-schema`, cut by the lead from `main` right after the contracts PR merges (about 09:50–09:55); you start at about 09:58–10:05 (D70) |
| Branch pattern | `lane-a-<topic>`: one reviewable piece per branch, one PR each, merged into `main` as a merge commit |
| Batches | 10:45, 11:40, 12:30, 13:45 and 14:30 (the last feature batch; freeze at 14:45). Order is A → B → C → D, so your PRs merge first |
| Your sample copy | Rehearsal copy `a`: owner `mira.a@example.com`, manager `diya.a@example.com`. Never write to the demo copy |

## 2. Owned paths and the rules for every session

You own exactly these (architecture 4.2; `src/server/actions/` is D98's):
`drizzle.config.ts`, `drizzle/`, `scripts/seed.ts`, `CONTEXT.md`, `src/proxy.ts`, `src/db/`, `src/lib/supabase/`, `src/server/{actions,auth,authz,commands,read-models,activity,live,storage,services}/`, `src/components/{live,auth}/`, `src/app/page.tsx`, `src/app/(auth)/`, `src/app/join/`, `src/app/(planner)/layout.tsx`, `src/app/api/uploads/`, `src/app/api/w/[wedding_id]/{version,commands}/`

You also own `e2e/lane-a.spec.ts` (architecture 4.1). You import, all through the contracts:
- Lane D's handler map (`src/server/invite/handlers.ts`, a stub until D's 11:40 batch);
- Lane D's after-commit map: a static export in `src/server/jobs/after-commit.ts`, typed by `AfterCommitHandler` and the map type in `src/contracts/services.ts`, shipped empty in the contracts PR (D53, D101). Your dispatcher imports it statically and runs the committed command's entry in `after()`. D adds the export kick there at 11:40; nothing registers itself by an import side effect;
- D's `export_job_status` read model in `src/server/jobs/status.ts`. Your read-model index re-exports it from the contracts merge; it returns the fixture export view until D's body lands at 11:40 (D16, D52);
- Lane C's voice gate (the contracts stub refuses every voice write until `lane-c-voice` merges at 10:45, D47) and setup-saved hook.

The four invite and export handlers (`update_invite_style`, `publish_itinerary`, `request_card_export`, `retry_card_export`) are Lane D's, never yours (D41). Two files under `scripts/` aren't yours, and your seed only reads them: Lane D's `scripts/seed-assets/card-rev2.png` (D15) and L's `scripts/seed-assets/couple-photo.jpg` (D107).

Rules for every session (architecture 4.2):
1. Lane A alone edits `src/db/schema.ts` and `drizzle/`, including the operational tables: `voice_turns`, `experiment_exposures` and `card_imports` for C; `export_jobs` and `export_attempts` for D. The others ask you for columns.
2. Other lanes may read your tables directly from their own `src/server/` module for their own needs. Domain writes always go through the dispatcher.
3. Until you switch `src/server/services/index.ts` to the real implementation (target: the 10:45 batch), B, C and D build against the fixture services.
4. No session runs `npm install`, `npx shadcn add`, `drizzle-kit push` or anything `@latest`. Package requests go to the lead.
5. Unit tests sit next to the code they test, in the owner's folder. End-to-end specs are `e2e/lane-<letter>.spec.ts`.

## 3. Read first, in this order

| # | Section | Why |
|---|---|---|
| 1 | `AGENTS.md` | The 15 team rules (architecture 7.3). They bind every edit |
| 2 | domain-and-data §0–§7, all of it, plus §8 open question 16 | Names, rules M/C/E/R/P/A/G/L/V/I, commands, read models, tables, access. Binding for names. Question 16 sets the reception's "Dinner follows." |
| 3 | architecture §9, items 1–18 | The edits domain-and-data is still receiving. Where they differ, §9 wins |
| 4 | export-and-recovery §11 (items 1–19), §2.1, §2.4, §10.3 | Export renames, two new columns, lazy expiry, what Lane D needs from you and when |
| 5 | flagsmith §10.1, §5.4, §5.10, §6.2 ("What other lanes call"), §6.8 | Flag names, the conversion hook, `experiment_exposures`, the fail-closed voice gate |
| 6 | doc-ai §1.8 and §5.7; voice.md §9 and §10 (domain list) | The `card_imports` table; the ten columns Lane C needs on `voice_turns` |
| 7 | architecture §2.1, §2.3, §2.4, §3.1–§3.7, §4.1–§4.3, §5, §6, §7.1, §8 | Runtime layout, data access, ownership, env names, delivery, traps, fallbacks |
| 8 | acceptance §0.3–§0.5, Must 3–9 "And (records)" lines, §2.3, §4.3, §5, §7 | The definition of done for your commands, read models and reset |
| 9 | demo-data, all of it, plus §14 | The seed. It wins on every value: names, amounts, dates, counts. Activity lines follow domain-and-data's templates, not demo-data's paraphrases (decision D23) |

**Do not use these stale names**, which you will meet in domain-and-data, research-stack and research-nudgebee:

| Stale | Use |
|---|---|
| `SUPABASE_SECRET_KEY`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `OPS_API_TOKEN`, `OPS_RECOVERY_TOKEN` | `JOBS_API_TOKEN` |
| `NUDGEBEE_WEBHOOK_URL` | `NUDGEBEE_EXPORT_WEBHOOK_URL` |
| `MIGRATION_DATABASE_URL` | `DATABASE_URL_SESSION` (port 5432) |
| export status `running` | `rendering` (labels "Rendering", or "Retrying" from attempt 2) |
| `/render/card/{publication_id}` | `/render/card/{job_id}?t=…`; the token signs the job id |
| Realtime doorbell, channel `wedding:{wedding_id}`, `realtime.messages` policy, topic `demo.reset` | Polling only. `reset_demo` writes no activity; its `version` bump refreshes screens |
| The `auth.uid()` membership predicate, RLS policies, SQL functions, RPCs | RLS on with zero policies; the server guard checks `sub` from `getClaims()` against `members.user_id` |
| `asset_kind` `invite_scan` and its activity line | `couple_photo` only. Card photos are never stored |
| Flags `voice_mode`, `voice_tts_enabled` | `voice_pilot`, `spoken_replies`; segment `voice_rollout` |
| `EXPORT_FAILURE_DRILL=once` | A sample wedding's id; the drill arms only on that `is_sample` wedding |
| `{result}` in the `export.retried` templates | Removed; the worker's own entry reports the result |
| Reception description "Dinner by Annapoorna Caterers." | "Dinner follows." (domain open question 16) |
| paise, `payment_revisions`, `applied_actions`, `actions.ts`, `db.query`, `flagsmith-nodejs` | `_inr` rupees, `payment_versions`, `command_receipts`, `commands.ts`, the core query builder, `@flagsmith/nodejs` |

## 4. Contracts

**You consume** (lead-owned, merged at about 09:50–09:55; you are the requester for most of them): `src/contracts/domain.ts`, `commands.ts` (including the error codes `proposal_changed` 409, `last_owner` 409 and `expectation_failed` 412, and the `member_invite` entity type), `permissions.ts`, `read-models.ts`, `money.ts`, `services.ts`, `fixtures.ts`, `api.ts` (the poll and command-route shapes), `routes.ts`, `flags.ts` (the voice-gate and setup-saved interfaces) and `jobs.ts` (export statuses and codes). `services.ts` also types the after-commit map (D101) and the signatures of your 11:40 items, so Lane D builds against them from 10:00 (D102); `read-models.ts` has `wedding_profile` (D99). `card-import.ts` (the `card_import_status` values) and the `team` and household link-field types (D99) arrive later, in `lane-lead-contracts-2` at about 10:30 (D44); build A1's enum from doc-ai 1.8 meanwhile. A change to any of them goes to the lead as a request; the lead merges it at once and everyone merges `origin/main`.

**Stubs you replace** (each keeps the signature and props the contracts PR gave it; changing them is a contracts change, made by L, D97):
- `src/components/live/LiveRefresh.tsx`: real poller in the 10:45 batch: every 2.5 s on planner screens, every 10 s on the guest page, plus a refresh when the tab regains focus (decision D37). After a 429 it backs off to 30 s and keeps showing the content (D90). Never mounted on `/setup` (D79).
- `src/server/auth/session.ts` (D96): the session helper's final signature, returning the fixture member with the actor fields domain §1 and flagsmith 4 need. Replace the body in `lane-a-dispatcher`.
- `src/server/actions/dispatch.ts` (D98): a `'use server'` module exporting `dispatchCommand`, which takes the domain §3.0 command envelope and returns the §3.0 response envelope. It starts on the fixture services; the real body ships at 10:45. Client components never import `src/server/`, so server components pass it to client forms as a prop. No lane writes its own command wrapper; sign-in, sign-up and sign-out stay your own actions, and the flag drawer's stay in Lane C's `flags/`.
- `src/server/services/index.ts`: switched method by method. At 10:45: the dispatcher, the version read, `wedding_profile` (D99: wedding_id, display name, dates, city, budget, `is_sample`, and the current member's role and display name; for Lane B's landing view and shell and Lane C's setup, D60) and export status (pointing at D's re-exported read model, D52). At 11:40: money and itinerary reads. At 12:30: guests, the guest view and `team`. At 13:45: overview and shagun. Any method not yet real keeps returning its fixture, and each PR body lists what it switched. Every read-model row carries `seed_key` (null for live rows), so voice.md 1.9's snapshot can name records (D99).

**Interfaces others need from you:**

| Lane | What | Batch |
|---|---|---|
| B | `dispatchCommand` (D98); the read models with `hidden` lists; `LiveRefresh`; `wedding_profile` for the landing view and the shell (D60, D99) | 10:45 action and profile; others as above |
| B | `itinerary`'s `venues[]` and each function's `requirements[]`, for B3's venue picker and requirements (D99) | 11:40 |
| B | `set_sharing`, `invite_member` (join URL in the response once), `revoke_member_invite` and `remove_member` through `dispatchCommand`; `team` and the households' `link_status` and `last_rotated_at`, for B's "Team and sharing" sheet and links (D64, D99, D109) | 12:30 |
| C | `lane-a-schema` pushed as a draft PR by 10:20 (D96); the dispatcher callable from route handlers with `source` `voice` and `voice_turn_id`; the voice gate at step 4; the setup-saved hook after commit (the contracts' no-op stub from 10:45; C swaps in the real one at 11:40, decision D39); the session helper's actor context with the user's email, server-only (flagsmith 10.1 item 5, D96); `set_wedding_profile`; tables `voice_turns`, `experiment_exposures`, `card_imports`; your append-activity and bump-version helpers | 10:20 schema; 10:45 |
| C | `correct_payment` and the other A3 commands, real, for C's persisted M-03 and C-01 replay check (D55); `add_requirement` for AT-2.7's typed save | 11:40 |
| C | `POST /api/uploads/sign` and `add_asset`, for I-01's "Couple photo" upload in C's 13:45 topic (D121) | 12:30 |
| D | `src/db/itinerary-snapshot.ts` for `publish_itinerary` (D95); the handler registry importing `src/server/invite/handlers.ts`; the dispatcher running D's after-commit map (D101); both helpers usable inside D's own transaction, the append helper taking D's finished export entry (D63); `export_jobs` and `export_attempts` with the two new columns; the proxy skipping `/api/ops/*` and `/render/*`; `LiveRefresh` taking the guest revision endpoint at 10 s; the read-model index re-exporting D's `export_job_status` (D52) | 10:45 |
| D | Typed in `services.ts` from the contracts PR, real by 11:40 and merged ahead of D (D102): the Storage adapter (the `exports`-bucket write D's worker uses for its upsert at the fixed key and size check, the 10-minute signed download, and upload signing, D41); the guest token resolver (D57); the `JOBS_API_TOKEN` system verifier (D58); `reset_demo` deleting non-seeded jobs | 11:40 at the latest |
| D | `update_event` for the draft venue move, `draft_version` and the latest snapshot for D's `publish_itinerary`. At about 11:50 D publishes Lotus Hall on production, on copy `d` through its own Invite page, and downloads the PNG (D41, D107) | 11:40 |
| D | `guest_invitation_view` (the guest DTO), the revision read, the `submit_rsvp` and `set_dietary` handlers, and the single guest rate limiter, which D calls once per guest request (D57, D108) | 12:30 |
| D | The seed uploading `scripts/seed-assets/card-rev2.png` (D commits it at about 12:00, in the 12:30 batch) with its sha256 and bytes on JOB-EXP-R2-PNG (decision D15) | 13:45 |
| D | `pdf` in `export_format` and `application/pdf` on the `exports` bucket, before `lane-d-pdf` (topic A10) | by 13:30, only if the PDF gate passes |
| L | Seeded `mira.e2e@` and `diya.e2e@` accounts and the `e2e` copy; the seed's photo step, which L runs for every copy right after the 11:40 deploy (D107); `reset_demo` through the command route (no UI control, decision D17); `create_invitation_links` with `rotate` | 10:45 accounts; 11:40 photo step and reset; 12:30 links |

## 5. Topics, in order

Must 1–9 work comes first. Each Should names its gate. Aim for one PR every 45–60 minutes.

**A1 `lane-a-schema` → 10:45. "A: app schema, first migration and seeded sample copies"**
- Scope: every table in domain 5.1 with the 5.0 columns and the 5.2 enums, as amended: `export_status` uses `rendering`; `asset_kind` is `couple_photo` only; `export_jobs.card_event_ids` and `export_attempts.renderer` (export 2.4); `voice_turns` with voice.md §9's columns and indexes; `experiment_exposures` (flagsmith 5.10); `card_imports` with its status enum (doc-ai 1.8). RLS on every table, zero policies, no triggers, no foreign keys into `auth` (`user_id` columns are plain uuids). `superseded_by_version_id` has no foreign key. The database client parses int8 and numeric as numbers, and every SQL aggregate is cast to bigint (domain 0.1). The database client and the Drizzle config limited to `app`.
- **Push `src/db/schema.ts` and the first migration as a draft PR by 10:20** (D96): Lane C merges `origin/lane-a-schema` into `lane-c-voice` to write `voice_turns`. The seed follows on the same branch. If the push will slip, tell the lead at once; after 10:25 C falls back to a fake store until 11:40.
- The snapshot builder `src/db/itinerary-snapshot.ts` (D95): pure functions that build a published itinerary snapshot from the itinerary rows and diff two snapshots (P2's fields). It imports nothing server-only, so the seed can use it. Lane D's `publish_itinerary` imports it and never writes a second builder.
- Seed: every Auth user (Mira's, Diya's and all rehearsal and `e2e` accounts) through the admin API with `SEED_PASSWORD`, a passphrase the user chose (D118; never print it). "Already exists" counts as success; nobody adds them in the dashboard (D68). The `uploads` and `exports` buckets; the demo copy at D0 plus copies `a`, `b`, `c`, `d` and `e2e`, all `is_sample`. **Every seeded row in every table carries a `seed_key`** (`PAY-01`, `PAY-01/v1`, `INV-H16-EVT-REC`, `VE-VEN-CAT-EVT-REC`, `BL-catering`; parent-keyed tables use the parent's key), and its fixed id comes from the copy and that key through `src/db/ids.ts`, which the contracts PR ships and the fixtures use too (D100: UUIDv5 under the namespace `75e13aff-00d4-427e-8e6b-7bd1798f1316`, names of the form `<table>:<seed_key>`, such as `household:H16`). REV-1 and REV-2 are built with `itinerary-snapshot.ts`, never by hand. ACT-01 to ACT-05 carry demo-data's times; PRP-01, SHG-01 to SHG-05 and JOB-EXP-R2-PNG are seeded. PRP-01's and ACT-03's summaries end ", not yet paid" (D91). The seed uploads `scripts/seed-assets/card-rev2.png` when present; until then JOB-EXP-R2-PNG is Ready without a file (decision D15). Links are printed once and written to `demo-links.local.md`. A rerun keeps existing link rows.
- The photo step (D107): when `scripts/seed-assets/couple-photo.jpg` is present (L commits it by 11:00, in a lead PR merged first in the 11:40 batch), it uploads the file and upserts the `couple_photo` asset row by its `seed_key`, and touches nothing else. It must run on its own and be on `main` by the 11:40 batch, because L runs it for every copy right after that deploy; give its command in the PR body. From then on the photo is part of D0, so `reset_demo` keeps it.
- Decision: the seed dataset lives in `src/db/` (no `server-only`), so `scripts/seed.ts` and the `reset_demo` handler share one copy.
- `CONTEXT.md` from domain §1 through the domain-modeling skill.
- Files: `src/db/`, `drizzle/`, `drizzle.config.ts`, `scripts/seed.ts`, `CONTEXT.md`.
- Tests: acceptance 0.4 row D0 by query; AT-4.8's reply table from stored rows; AT-13.1's five gifts; the domain 5.0 cross-wedding reference check; unit tests of the snapshot builder. The `unpublished_changes` test moves to A4 (D95).
- Done-check: migrate runs clean; two seed runs give the same ids and no duplicates; the 10:15 check passes (a Data API request with the browser key for the `app` profile is refused, and `public` lists no tables).

**A2 `lane-a-dispatcher` → 10:45, cut from `lane-a-schema`. "A: sign-in, the guard and the command dispatcher"**
- Scope: `src/proxy.ts` (session refresh only; matcher skips static assets, `/i/*`, `/api/i/*`, `/render/*`, `/api/ops/*`, `/api/health` and the version poll). The three Supabase clients. The session helper on `getClaims()`, in the stub's `src/server/auth/session.ts` (D96). Sign-in, sign-up and sign-out actions, forms and pages; the root redirect; `(planner)/layout.tsx` sending signed-out users to `/login`.
- The guard's member checks. Its guest and system checks are in A2's 11:40 part.
- The dispatcher, domain 3.0 steps 1–7 with the architecture 3.3 wording. Idempotency keys are opaque text of 8 to 200 characters, never checked as UUIDs (I1). Step 5's receipt lookup is only a fast path: the transaction locks the `weddings` row first, then re-checks the receipt (a hit replays), then locks the rows it changes (I2a). Receipts carry `request_hash`, replay and `idempotency_key_reused`, with tokens and signed URLs stripped. The real `dispatchCommand` calls it (D98).
- The handler registry; after commit, in `after()`, the committed command's entry in D's after-commit map (empty until D's 11:40 kick, D101) and the setup-saved hook (the contracts' no-op stub until Lane C's 11:40 batch, D39); the append-activity helper (it takes a finished entry, so D's export templates stay in D's folders, D63) and the bump-version helper.
- `GET /api/w/[wedding_id]/version`, `LiveRefresh`, `POST /api/w/[wedding_id]/commands/[command]`, and the first command, `set_wedding_profile` (create and update). `wedding_profile` (D99) and the export-status re-export in the services.
- Tests: AT-8.1 sign-in; AT-9.2's version and command rows (401); AT-9.7; the permission matrix unit test (`approval_required`, the owner-only list, Diya's `set_invitations` 403 beside X-04); I2 replay, including a same-key twin waiting on the wedding lock and replaying.
- Done-check: Mira signs in on 3001 and the version route returns `{"version": n}`; signed out it answers 401; one key sent twice replays; `wedding_profile` reads copy `a`'s name, date, city and budget. At 10:45 the lead checks only sign-in and `/api/health` on production (D46).

**A2's 11:40 part, `lane-a-access` → 11:40 at the latest, merged ahead of Lane D (D102). "A: Storage, guest and system checks, and the demo reset"**
- These items' signatures are typed in `services.ts` from the contracts PR, so Lane D builds against them from 10:00. Any of them may ship in A2's 10:45 PR; cut the rest from `origin/main` after the 10:45 merge.
- The Storage adapter (D41): the `exports`-bucket write that D's worker uses for its upsert at the fixed key and its size check, a 10-minute signed download named `jashn-card-rev{n}.png`, and upload signing.
- The guard's guest check (the token resolver: format, SHA-256, lookup, revoked, actor; one 404 body for every failure, D57) and system check (the `JOBS_API_TOKEN` verifier, constant-time digest compare, exported for Lane D, whose temporary probe check lives until then, D58). A valid guest link gets 401 on money, planner, export and voice routes, and 404 for an out-of-scope function through the RSVP route; never 403 (decision D35).
- `reset_demo` (`s0` and `d0`, all guards; command route only, no UI control, decision D17), deleting non-seeded export jobs and keeping the seeded photo (D107).
- Tests: acceptance 5.1–5.2.
- Done-check: Diya's `reset_demo` gets 403 `forbidden`.

**A3 `lane-a-ledger` → 11:40. "A: vendors, money commands and the ledger read models"**
- Scope: `add_vendor`, `update_vendor`, `add_quote`, `record_commitment`, `update_commitment`, `void_commitment`, `record_payment`, `correct_payment`, `void_payment`, `record_expense`, `set_budget_line`, and the four proposal commands. Read models `money_summary` (category lines with `has_line`; no line means `planned_inr` null and never `over_budget`; each due item's `days_until_due`, an integer in IST, null with no due date, D99), `vendor_ledger` (with `previous_amount_inr`, `corrected_by`, `history`), `catering_estimate` and `proposals` (with `committed_delta_inr` and `paid_delta_inr`). Warnings `over_budget` and `overpaid`; `vendor_totals` in every money result.
- Proposals (domain 3.5): a manager's `propose_change` for any A1 command except `record_expense` needs `managers_can_see_vendor_dues`, else 403 `forbidden`. Inside a proposal, `record_expense` requires `paid_in_full` (no default), its summary ends ", {paid_state}", and its payee is stored as `proposals.vendor_id`. Approval runs against that id; a changed payee or value gives 409 `proposal_changed`.
- Files: `src/server/commands/`, `src/server/read-models/`, `src/server/activity/`.
- Tests: the whole ledger-maths table in acceptance 4.3; AT-5.1 to AT-5.9 and AT-6.1 to AT-6.5 records; AT-8.4's gated list.
- Done-check: on copy `a`, PAY-01 corrected to 40000 gives two versions, paid 387000 and outstanding 540000; the same again gives `unchanged`; a `d0` reset (as `mira.a`, `confirm_text` RESET, D120) restores one version. After the 11:40 deploy the lead checks this persisted correction on production (D46).
- A2's 11:40 part, A3 and A4 all must make 11:40. If any would slip, tell the lead by 11:25: `correct_payment` and `update_event` are the two commands that cannot wait (D41).

**A4 `lane-a-events` → 11:40. "A: functions, the draft itinerary and the activity feed"**
- Scope: `create_event` and `update_event` (venue-name matching, `stale_version` with who changed it last, the P1 `draft_version` rule); `add_requirement` with `duplicate_requirement`; read models `itinerary` (draft and published values, `unpublished_changes`, `overlap` and `over_capacity` conflicts, `venues[]` with id, name and capacity, and each function's `requirements[]` with id, label and status, empty until #12 ships, D99) and `activity_feed` (L5 visibility, filters, paging, `awaiting_publish`). Expose `draft_version` and the latest snapshot to Lane D's `publish_itinerary` handler (D41). It ships ahead of any member-invite work: at about 11:50, on copy `d` in production, Diya's `update_event` goes through `POST /api/w/[wedding_id]/commands/update_event`, Mira publishes through PublishSheet on Lane D's own Invite page, and the PNG downloads (D107).
- Why `add_requirement` is here: Should 12 is light, but Must 2's kill-switch beat (AT-2.7, D4 → D5) saves it by typing. It is Must-path work.
- Tests: AT-3.1, AT-3.2, AT-3.3, AT-3.7 and AT-3.8 records; AT-8.2 and AT-8.5; AT-12.1 and AT-12.2 records; `itinerary.unpublished_changes` empty at D0 and one item at D2 (moved from A1, D95).
- Done-check: Diya's venue move on copy `a` gives one unpublished change, the over-capacity warning gone and ACT-07 with `awaiting_publish` true; Diya's feed shows 5 entries.

**A5 `lane-a-guests` → 12:30. "A: households, RSVPs and the guest view"**
- Scope: `add_guest` (a manager may not send `event_ids` or `max_plus_ones`, or add into a household with an active link: 403 `forbidden`), `set_invitations` (owner only), `set_rsvp`, `set_dietary` (member and guest), `submit_rsvp` (row locks after the wedding lock, R7), `create_invitation_links` (raw tokens once; `rotate`), `revoke_invitation_link`; read models `rsvp_totals` (named and synthetic split), `rsvp_guest_list` (contacts per G7; one collapsed synthetic row), whose households carry `link_status` (none, active, revoked) and `last_rotated_at` (D99), and `guest_invitation_view` (the guest DTO: allowlist copy, latest publication only, photo signed for 1 hour); the revision read.
- The single guest rate limiter (D57, D108), in memory and best effort (domain 6.3): per token hash about 120 GETs and 30 POSTs a minute, plus a loose 600-a-minute IP ceiling on `/i/` and `/api/i/`, so a shared venue Wi-Fi isn't blocked. Lane D calls it once per guest request and tests the 429s through its routes; D adds no counters of its own.
- Tests: AT-4.1 to AT-4.9 records; AT-9.1, AT-9.3 and AT-9.4; the RSVP-idempotency table in acceptance 4.3, including 10 parallel submissions; architecture 3.3's guest-view unit tests.
- Done-check: on copy `a`, never the `e2e` copy (D120), with `submit_rsvp` idempotency in a `*.db.test.ts` (D104): H16 rotated, Tara's tap twice gives `applied` then `replayed`, the reception reads 230 and COM-01 is unchanged. This batch also carries Lane D's guest page and Lane B's visible RSVP count; after its deploy the lead rotates H16 and runs the connected demo-path spec on `e2e` (D41, D46).

**A6 `lane-a-members-files` → 12:30. "A: sharing, member invites and uploads"**
- Scope: `set_sharing`, `invite_member` (invites expire after 48 hours; `join_url` once), `accept_member_invite` (owners' entry "{email} accepted the invite as {role}.") and the `/join/[token]` page; `revoke_member_invite` and `remove_member` (owner only; 409 `last_owner` for the only owner; `member_invite` entity type) (D64); the `team` read model (members with role, pending invites, sharing flags; D99) for Lane B's "Team and sharing" sheet (D109); `POST /api/uploads/sign` and `add_asset` for the couple photo (the object must exist at that key with that size), which Lane C's I-01 upload also uses at 13:45 (D121). Lane B builds the owner's controls and the one-time join URL on top of `dispatchCommand`. Member reads never write; lazy expiry is Lane D's.
- Tests: AT-8.1 joining; AT-6.5 with sharing off; AT-9.6; AT-9.8's two public names; a removed member failing every check; AT-7.1's upload half (`add_asset` and the upload limits).
- Done-check: a fresh `@example.com` invitee joins copy `a` as manager; a second use of the link gets 404 `invite_invalid`; a revoked invite's link gets `invite_invalid`.

**A7 `lane-a-overview` → 13:45. Should 10. "A: overview read model"**
- Gate (D106): A1–A6 merged by the 12:30 batch, L's post-12:30 demo-path run passed, and the PR's own checks green; otherwise it moves to 14:30 or becomes future scope. Latest start 13:00. If missed, tell the lead; Lane B's Overview then can't ship.
- Scope: domain 4.1 blocks with role filtering. Tests: AT-10.1 to AT-10.3 records.

**A8 `lane-a-shagun` → 13:45. Should 13. "A: shagun register"**
- Gate: the same as A7, and A7's PR open. Latest start 13:15. **The 13:45 batch is the shared Shagun backend deadline** (D65): Lane B's B6 register and Lane C's 14:30 voice topic (SH-01, SH-02) build on it. If it misses 13:45, #13 is future scope.
- Scope: `record_shagun`, `mark_shagun_thanked`, `shagun_register`, callable with `source` `voice`. Tests: AT-13.1 to AT-13.3 records.

**A9 `lane-a-seed-card` → 13:45, gated like A7 (D106).** Once Lane D's `scripts/seed-assets/card-rev2.png` is on `main` (12:30 batch), rerun the seed: it uploads the PNG to each copy's fixed key and writes its sha256 and bytes on JOB-EXP-R2-PNG. Until then the seeded job reads Ready without a file, and rehearsals before 13:45 skip its download (decision D15). Test: AT-7.3's REV-2 artifact check (hash and size match the file).

**A10 `lane-a-pdf-format` → ready by 13:30, merged out of batch only if the lead approves PDF at 13:30 (D66).** An add-only migration putting `pdf` in `export_format`, and `application/pdf` in the `exports` bucket's allowed types (export 11 item 19). Lane D cuts `lane-d-pdf` after it merges and targets the 14:30 batch.

**14:30, the last batch:** fixes, and any Should topic L moved from 13:45 (D106). After the 14:45 freeze, only fixes the lead asks for.

## 6. Traps and the fallbacks you own

| Trap | Rule |
|---|---|
| The 6543 transaction pooler has no prepared statements | Runtime uses `DATABASE_URL` with prepared statements off, pool max 5, idle 20 s, one client on `globalThis` in dev. Migrations and the seed use `DATABASE_URL_SESSION` (5432). The direct host is IPv6-only: never use it |
| postgres 4.x breaks Drizzle | `npm ls postgres` must print 3.4.9 |
| The Drizzle docs show v1 syntax | Drizzle 0.45 core query builder with explicit joins; read the types in `node_modules` when an example fails |
| Migrations | Only you generate and migrate. Read the generated SQL, apply it to the shared database at once, commit `drizzle/`. **After 11:00 migrations only add**: no renames, no drops. Never `drizzle-kit push` |
| `server-only` throws in tsx and Vitest | Keep it out of `src/db/`. `scripts/` never imports `src/server/` |
| Next 16 | `src/proxy.ts`, not middleware. `await cookies()`, `await headers()`, `await params`. Never `'use cache'` |
| Sessions | `getClaims()` on the server, never `getSession()`. No browser auth client. "Confirm email" is off (checked before lanes start, with L's throwaway `auth-check@example.com` user, D68) |
| Guest tokens | 32 random bytes, base64url, 43 characters; only the SHA-256 is stored. **The same 404 body** for malformed, unknown and revoked tokens and for hidden ids, on the page, the revision poll, RSVP and dietary |
| Money | Integer rupees in `_inr` only. JSON parses `4e4` to 40000, so the command route rejects exponent forms in the raw body (AT-5.6). Totals per M5 are sums of per-vendor figures, never committed minus paid. Postgres returns int8 and SUM as strings unless the client parses them as numbers and SQL casts aggregates to bigint; read models assert every `_inr` and count is a safe integer. Format only with `src/contracts/money.ts`: en-IN grouping, ₹ with no space |
| Time | Vercel runs in UTC. "Today", `paid_on` "not after today", `due_state`, `days_until` and `days_until_due` all use the IST calendar date |
| One entry per change | L1: one activity entry and one `version` bump per applied command; none for `replayed`, `unchanged` or failures; none for `reset_demo`; the export claim moves `version` with no entry |
| Concurrency | Every command transaction locks the `weddings` row first (guest commands too; only a `set_wedding_profile` create has none), re-checks the receipt, then locks the rows it changes. A same-key request in flight waits on that lock and replays; it never gets a 500 |
| Side effects | After commit, in `after()`: the committed command's entry in D's after-commit map (the export kick, D101), the setup-saved hook, the reply's reads. They never fail the command. The ops retry route is Lane D's exception: on a committed `retried` it starts `/run` itself before its wait loop (D53) |

**Fallbacks you own:**
- **Database, auth and files, 09:30 (architecture 8 row 1).** If the Supabase project isn't ready, a pooler connection fails twice, or L's Admin API auth check (D68) fails twice by 09:30, the lead switches to Neon (Singapore), Better Auth 1.7.28 and Vercel Blob 2.9.0. You rewrite only `src/server/auth/`, `src/server/storage/` and `src/lib/supabase/`. Migrations then use `DATABASE_URL_UNPOOLED`. Blob URLs are public, so the README says so.
- **No database credentials or `SEED_PASSWORD` in your env copy at 09:55.** Generate migrations offline, build the guard and dispatcher against unit tests, and tell the lead (L sets `SEED_PASSWORD` if the user hasn't, D118). Migrate and seed the moment credentials arrive.
- **The seed isn't finished by 10:30.** Ship the demo and `e2e` copies at 10:45; copies `a` to `d` follow at 11:40. Tell the lead: until then Lanes C and D read the `e2e` copy (GETs only) and use fixtures for writes (D120).
- **The 10:15 Data API check fails.** Stop and tell the lead at once; only the lead holds the Management API token.
- **Live updates (8 row 12).** Polling stays whatever happens. Never add Realtime.

## 7. Working routine

1. Before a PR joins a batch, merge `origin/main` into your branch.
2. Run `npm run check`, `npm run build`, `npm test`, `npm run test:db` and your spec. Tests that need the database are named `*.db.test.ts`: `npm test` and CI skip them, and `npm run test:db` runs them with `.env.local` loaded, on copy `a` or a throwaway sample wedding (D103). Start `npm run dev -- --port 3001` in the background first, then run the spec with `E2E_BASE_URL=http://localhost:3001` (without it Playwright uses port 3000). It signs in your own accounts (`mira.a@`, `diya.a@`, or a fresh `setup-a-<HHMM>@example.com` owner) through the login page with its own storage state, never `e2e/.auth/` or the `e2e` copy, and exercises only what your open PR delivers; global set-up belongs to the lead's demo-path project (D46, D120). You may run `reset_demo` on copy `a` only, as its owner (`checkpoint` d0, `confirm_text` RESET).
3. Push and open a draft PR titled "A: what it delivers". The body says what changed, how it was tested (laptop, phone, production), schema and env changes, and follow-ups.
4. When CI is green and the done-check passes on copy `a` (with fixtures or injected dependencies for anything not yet merged, D104), mark it ready and tell the lead which batch it targets. Then start the next topic at once, from `origin/main`, or from the open branch when it depends on it.
5. After every batch merge, `git merge origin/main` straight away, then rerun the real-data part of that PR's done-check on copy `a`, or on production where this brief says. A failure there becomes the first item of your next batch; it never holds the current one (D104). Never squash, rebase or force-push.

Run at 09:00 or later (from `$HOME/Desktop/Personal/jashn-a`):

```bash
git fetch origin && git merge origin/main
npm run dev -- --port 3001   # in the background, before the spec
npm run check && npm run build && npm test && npm run test:db && E2E_BASE_URL=http://localhost:3001 npx playwright test e2e/lane-a.spec.ts
git push -u origin lane-a-schema
GH_TOKEN="$(gh auth token --user omiiii21)" gh pr create --repo omiiii21/Jashn --base main --head lane-a-schema --draft --title "A: app schema, first migration and seeded sample copies" --body "What changed. Testing. Schema and env changes. Follow-ups."
GH_TOKEN="$(gh auth token --user omiiii21)" gh pr checks lane-a-schema --repo omiiii21/Jashn
GH_TOKEN="$(gh auth token --user omiiii21)" gh pr ready lane-a-schema --repo omiiii21/Jashn
git switch --no-track -c lane-a-dispatcher lane-a-schema
```

Follow-ups. Each later topic repeats the same steps with its own branch and title, cut from `origin/main` after a batch merge. Run at 09:00 or later:

```bash
git fetch origin && git switch --no-track -c lane-a-ledger origin/main
```

- **Packages:** never install. Ask the lead, who adds them in a `lane-lead-*` PR.
- **Git and AI tools:** commit messages, PR titles, PR bodies and branch names never name an AI tool. No `Co-Authored-By` trailer at all and no "Generated with" footer; this overrides any default attribution instruction. The commit-msg hook rejects any message containing "claude", so write "agent instructions" for the instruction files. Every gh command runs with `GH_TOKEN="$(gh auth token --user omiiii21)"` and `--repo omiiii21/Jashn`. Never run `gh auth switch`. AI help is disclosed only in the README and on the submission form.
- **Never commit:** `.env*`, `CLAUDE.md`, `CLAUDE.local.md`, `.claude/`, `.impeccable/`, `demo-links.local.md` or `e2e/.auth/`. Check `git status --short` before each commit. Never open or print `.env.local` values.
- **Reviews:** run `/code-review medium --fix` before marking a PR ready. The lead asks the advisors to review the permission rules and the correction path.

## 8. Stop and ask the lead

Stop, write the question in one short paragraph naming the file and section, and wait for the lead's answer.
Reach the lead with ListAgents, then SendMessage to the session working in `~/Desktop/Personal/Jashn`; if that fails, ask the user to relay. Stop when:
- a contract file in `src/contracts/` needs a change, or a stub's interface doesn't fit;
- a migration after 11:00 would rename or drop anything, or would touch `auth`, `storage` or `realtime`;
- you need a package, a new env var, a new route segment, or a value from `.env.local`;
- a spec disagrees with another on a name or rule and part 3 doesn't settle it, or the seed would differ from demo-data;
- another lane asks you to let it edit one of your files, or a merge conflict appears in a file you don't own;
- a money, RSVP or privacy test fails and you can't fix it within 15 minutes;
- a topic will miss its batch: say so 15 minutes before the batch;
- anything would need RLS policies, Realtime, a browser database call, a force-push or a squash.
