# Lane D brief: invitation, guest site, RSVP, card export and NudgeBee recovery

Prep note, revised about 06:20 IST on Wed 25 Nov 2026 (decisions D1–D122 applied). Notes only (hackathon rule 4): no code. Right after the contracts PR merges (about 09:50–09:55, decision D70), the lead copies it into `~/Desktop/Personal/jashn-d` as `CLAUDE.local.md` (gitignored). Read it first, then `AGENTS.md`, then the spec sections in part 3. Specs live in `docs/prep/spec/` and are read-only for you.

## 1. Header

- **Lane D mission:** everything a guest or an outside system sees: the stationery (designer, publish, guest site and RSVP), the exported card, and the export-job contract NudgeBee recovers through.
- **Worktree:** `~/Desktop/Personal/jashn-d`. **Dev port:** 3004. **First branch:** `lane-d-render-probe` (the lead creates it). **Pattern:** `lane-d-<topic>` (architecture 6.1). You start at about 09:58–10:05 (D70).
- **Batches you aim for** (the lead merges A → B → C → D; freeze 14:45):

| Batch | Your PRs |
|---|---|
| ~10:30, out of batch | `lane-d-render-probe` (PR open by 10:25) |
| 11:40 | `lane-d-publish` (with the Invite page, D105), then `lane-d-export-jobs`, then `lane-d-og-fallback` (dormant, always, decision D48) |
| 12:30 | `lane-d-guest-site`, `lane-d-ops-recovery`, `lane-d-invite-minimum` (the minimum Invite studio, unconditionally, D105) |
| 13:45 | `lane-d-fix-<n>` for the demo path first; `lane-d-invite-studio` (the polish) only if L's post-12:30 demo-path run passed and its checks are green, else 14:30 or future scope (D106) |
| 14:30, the last batch | `lane-d-pdf` (only if approved at 13:30, D66), `lane-d-fix-<n>` |

- **Your test data:** rehearsal copy `d` only, with `mira.d@example.com` (owner) and `diya.d@example.com` (manager). The password is `SEED_PASSWORD` in your `.env.local`, which you never print. Ask the lead for copy `d`'s guest links (from the gitignored `demo-links.local.md`); never commit a link. You may run `reset_demo` on copy `d` only, as its owner (`checkpoint` d0, `confirm_text` RESET); the demo and `e2e` copies are L's (D17, D120). If copy `d` isn't seeded by 10:45, read the `e2e` copy (GETs only) and use fixtures for writes until 11:40 (D120). The demo copy is touched only for the V15 take (13:00 to 13:30), recorded with the user (D121).
- **Your env extras:** `CHROME_EXECUTABLE_PATH` (local Chrome) and `APP_BASE_URL` (`http://localhost:3004`, or your tunnel URL). Your copy has no `NUDGEBEE_AGENT_AUTH_KEY`: the kind fallback runs from the main folder, never from here.
- **Hooks:** the typecheck Stop hook (`npm run check`) and impeccable's design hook ("hooks on") are both on in this worktree. Treat the guest page, the card and the studio preview as stationery, not app chrome (design-direction §3, §6). Run `impeccable audit` at 390 px, and web-design-guidelines on the RSVP form.

## 2. Owned paths and the rules for every session

You write only these paths (architecture 4.2, row D), plus `e2e/lane-d.spec.ts` (rule 5):
- `src/app/(planner)/w/[wedding_id]/invite/`, `src/app/(public)/`, `src/app/render/`
- `src/app/api/i/`, `src/app/api/w/[wedding_id]/exports/`, `src/app/api/ops/`
- `src/server/{invite,export,jobs}/`, `src/components/invite/`
- `ops/nudgebee/`, `public/card/`, and one file under Lane A's `scripts/`: `scripts/seed-assets/card-rev2.png` (decision D15)

You import services, the dispatcher, the Storage adapter, the rate limiter, the activity and version helpers, the pure snapshot builder `src/db/itinerary-snapshot.ts` (D95) and the `dispatchCommand` server action (`src/server/actions/dispatch.ts`, D98) from Lane A, and the environment flags from Lane C. Server components pass `dispatchCommand` to client forms as a prop; never write your own command wrapper (D98). Your `export_job_status` read model lives in `src/server/jobs/status.ts`; Lane A's read-model index re-exports it (D16, D52). Export activity templates and their call sites live in `src/server/jobs/` or `src/server/invite/`. Lane A's append helper takes the finished entry; you never edit `src/server/activity/` (D63). You never edit another lane's files; ask the owner through the lead.

Rules for every session (architecture 4.2):
1. Lane A alone edits `src/db/schema.ts` and `drizzle/`, including your `export_jobs` and `export_attempts` (with `card_event_ids` and `renderer`). Ask Lane A for columns and enum values.
2. You may read Lane A's tables directly from your own `src/server/` module for your own needs. For example, the worker and the render page read `publications`. Domain writes always go through the dispatcher.
3. Until Lane A switches `src/server/services/index.ts` to the real implementation (target: the 10:45 batch), build against the fixture services from the contracts.
4. Never run `npm install`, `npx shadcn add`, `drizzle-kit push` or anything `@latest`. Package requests go to the lead, who adds them in a `lane-lead-*` PR.
5. Unit tests sit next to the code they test, in your folders. Your end-to-end spec is `e2e/lane-d.spec.ts`.

## 3. Read first

In this order, one line on why:
1. `AGENTS.md`: the 15 team rules (architecture 7.3). They override any default you carry.
2. export-and-recovery.md in full. It is binding for the card, the job states and timers, the ops JSON, the drill and the NudgeBee workflow. Read 0 to 5 closely, then 6 to 10.
3. architecture 2.1 to 2.4 (Chromium in `/run` only, `after()`, the kick, polling), 3.4 and 3.6 to 3.7 (tokens, storage, credentials), 4.1 to 4.3, 5.1, 6 and 8 rows 2, 6, 7 and 8.
4. domain-and-data 2.5 (P), 2.7 (G), 3.2 (`update_invite_style`, `publish_itinerary`), 3.4 (`submit_rsvp`, `set_dietary`, links), 3.7, 4.6 (`guest_invitation_view`), 4.8, the export tables in 5.1, 6.3 and 6.4. Apply export-and-recovery 11 and architecture 9 on top.
5. acceptance 0.2 to 0.5, AT-3.4 to AT-3.6, AT-4.1 to AT-4.6, AT-4.9, AT-7.1 to AT-7.6, AT-9.1 to AT-9.5, and sections 2, 4.3, 6.6 and 7.
6. design-direction §0, §3 to §6, 10.6 (the guest page) and 10.7 (the studio). demo-data §3, §4, §11 and §13.2 for the values.
7. flagsmith 3.6 and 3.7 (`export_failure_drill`, `card_renderer`), read through Lane C's environment-flag reader only.

Where a research note and a spec disagree, the spec wins. **Do not use these stale names** you will meet in older notes:

| Stale (where) | Use instead |
|---|---|
| `OPS_API_TOKEN` (research-stack, domain), `OPS_RECOVERY_TOKEN` (research-nudgebee) | `JOBS_API_TOKEN`; the NudgeBee Secret is `jashn_ops_token` |
| `NUDGEBEE_WEBHOOK_URL`, `SUPABASE_SECRET_KEY` | `NUDGEBEE_EXPORT_WEBHOOK_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| Routes `/api/ops/jobs/…`, the `inject-failure` route; a **409 for max attempts** (research-stack §9) | `/api/ops/export-jobs/[job_id]`, `/retry` and `/run`. Every business state answers 200; max attempts is 200 `not_retryable` |
| Job status `running`; render page `/render/card/{publication_id}`; the worker in the requesting route's `after()` (domain 3.7) | Job status `rendering`; `/render/card/[job_id]?t=…`; Chromium only in `/run`, kicked after commit |
| `EXPORT_FAILURE_DRILL=once`; the drill arming any new job; `card_export_fault_once`; `SYNTHETIC_RENDER_FAILURE` | `EXPORT_FAILURE_DRILL` holds a wedding id; `export_failure_drill` arms only when its value equals an `is_sample` wedding's id; code `DRILL_INJECTED` |
| Booleans and nulls in ops JSON (domain 4.8 and 3.7 examples) | Every ops scalar is a string, nothing is null, and `artifact`, `last_error` and `last_recovery` are always objects (export 5.1) |
| `{result}` in the retried activity line (domain 3.7) | export 2.4's templates; the worker's own entry reports the result |
| Workflow `jashn-invite-export-recovery` (research-nudgebee) | `card-export-recovery` |
| `flagsmith-nodejs`; the Realtime doorbell; a browser Supabase client on guest pages | Lane C's flag reader only; polling (`/api/i/[token]/revision` every 10 s); no Supabase client on guest pages |
| "Idempotency key `export:<id>:rev3:png`" (demo-data 13.2) | That is the `export_key`. NudgeBee's retry key is `nb-{execution_id}-{job_id}` |
| `publish_itinerary` as Lane A's (older PLAN); Storage helpers in A6 at 12:30; the ops retry kicking `/run` only in `after()` | All four invite and export handlers are yours (D41). Lane A's Storage adapter lands in A2 (D41). A committed `retried` outcome starts `/run` fire-and-forget before the wait loop (D53) |
| Guest limits of 30 a minute per token and 60 per IP (architecture 9 item 15); Tara's page "within 10 s"; NudgeBee work as the teammate's | Lane A's one limiter: per token hash, about 120 GETs and 30 POSTs a minute, plus a loose 600-a-minute IP ceiling (domain 6.3). Within 12 s (D92). NudgeBee work is whoever can sign in to the user's account (D72) |
| "Only cropped to fit" (demo-data 11.3); a card listing a household's own functions (demo-data 11.1) | Never cropped. The shared card lists only the functions every invited guest is invited to: the Reception in the demo (acceptance 8.1 items 10 and 11) |
| The snapshot builder in your `invite/`; a post-commit registration interface (architecture 4.1 and 4.3, D53) | Lane A's pure `src/db/itinerary-snapshot.ts`, imported, never a second builder (D95). A static map in your `src/server/jobs/after-commit.ts`; nothing registers itself by an import side effect (D101) |

## 4. Contracts

**You consume** (the contracts PR merges about 09:50–09:55, D70, with fonts, fixtures and every stub you compile against, D44; contracts change only through a `lane-lead-contracts-<n>` PR):
- `src/contracts/jobs.ts` (its content is yours to request, export 10.5), `flags.ts` (the drill and the renderer), `api.ts` (ops GET and retry, `/run`, guest RSVP and dietary, revision poll, member export routes), `routes.ts`.
- `domain.ts` (the guest view as an allowlist type with no money fields), `commands.ts`, `read-models.ts`, `permissions.ts`, `services.ts` (fixtures until about 10:45; it also types Lane A's 11:40 items, so you build against them from 10:00, D102, and holds `AfterCommitHandler` and the map type, D101), `fixtures.ts`, and the lead's `src/lib/fonts.ts`. The design tokens in `src/app/globals.css` are in the contracts PR from your first minute (decision D4; Lane B's file, read-only for you).

**You replace these stubs** and own them from then on:

| Stub | Starts as | Real by |
|---|---|---|
| `src/server/invite/handlers.ts` | An empty handler map | 11:40: `update_invite_style` and `publish_itinerary` (`lane-d-publish`); `request_card_export` and `retry_card_export` (`lane-d-export-jobs`) |
| `src/components/invite/PublishSheet.tsx` | A disabled "Review and publish" button that already declares its final props: `wedding_id`, the `unpublished_changes` list, `expected_draft_version` and an `on_confirm` callback. Keep them; a props change is a contracts change, made by L (D97) | 11:40 (`lane-d-publish`): reusable, taking the reviewed `expected_draft_version` and a confirm callback (D59) |
| `src/server/jobs/status.ts` | Returns the fixture export view (D52) | 11:40 (`lane-d-export-jobs`) |
| `src/server/jobs/after-commit.ts` | An empty static map (D101) | 11:40 (`lane-d-export-jobs`): the export kick's entry |
| The Invite placeholder page under `src/app/(planner)/w/[wedding_id]/invite/` (B's nav links to `routes.invite`, D121) | A placeholder | 11:40 (`lane-d-publish`): the Invite page with `PublishSheet` mounted (D105, D107); the studio minimum extends it at 12:30 |

The after-commit map (D101): its types (`AfterCommitHandler` and the map type) are in `src/contracts/services.ts`. Lane A's dispatcher imports your map statically and runs the committed command's entry in `after()`. You add the export kick there at 11:40.

**Others need from you:**

| Who | What | Batch |
|---|---|---|
| A (handler registry, dispatcher) | The four handlers; the export kick's entry in `after-commit.ts` (D101) | 11:40 |
| B (Events, B3 at 12:30) | The real `PublishSheet`; B passes the planner action as its callback | 11:40 |
| C (voice I-02, E-05 at 12:30; I-01 at 13:45) | `request_card_export` and `publish_itinerary` through the dispatcher; the sheet takes C's voice confirm as its callback. One write on either path (D59). `update_invite_style` for I-01 (D121) | 11:40 |
| L (demo path, warm-up) | Guest page, publish, RSVP and export for the demo-path spec on `e2e`; `/run` with `probe` | 12:30; ~10:30 |
| NudgeBee account operator (D72) | An authenticated ops read against a real Jashn job: through your tunnel, then on production | 11:15; ~11:50 |
| A (read-model index; seed) | `export_job_status` with `stalled`, `can_retry` and `card_summary` (D16, D52); `scripts/seed-assets/card-rev2.png` for JOB-EXP-R2-PNG (D15) | 11:40; committed ~12:00 for the 12:30 batch |

**You need from others** (export 10.3):
- **Lead:** the exact Chromium pins, `fonts.ts`, a bare root layout, the `/i/*`, `/api/i/*` and `/render/*` headers, and `RENDER_TOKEN_SECRET` and `JOBS_API_TOKEN` in Vercel Production. A file-tracing include for `/run`, only if the probe asks for it. The couple photo `scripts/seed-assets/couple-photo.jpg`, committed by 11:00 in a lead PR merged first at 11:40; L runs the seed's photo step for every copy right after that deploy, so it's part of D0 from then on (D107).
- **The user:** `JOBS_API_TOKEN` pasted into the NudgeBee Secret `jashn_ops_token` by 11:10, before the 11:15 tunnel read. Nobody sends it through chat, Notion or a terminal (D117).
- **Lane A at 10:45 (A1, A2):** the export tables, the pure snapshot builder (`src/db/itinerary-snapshot.ts`: build and diff, P2's fields; D95), the handler registry, the dispatcher importing your `after-commit.ts` (D101), the real `dispatchCommand` (D98), the activity and version helpers, `LiveRefresh` (D57) and the proxy skipping `/api/ops/*` and `/render/*`.
- **Lane A by 11:40 at the latest, merged ahead of you in the batch** (D102; any may come at 10:45): the Storage adapter with signing helpers (exports-bucket write, signed download, upload signing; D41), the guest token resolver (D57), the `JOBS_API_TOKEN` system verifier (D58; your temporary probe check lives until then), `reset_demo` removing non-seeded jobs, and A4: `update_event` for the draft venue change, `draft_version` and the latest snapshot (D41). You own the worker's upsert and size check through the adapter.
- **Lane A at 12:30** (merged just before you): A5's guest DTO, the revision read, the `submit_rsvp` and `set_dietary` handlers and the single rate limiter (D57), so build on fixtures until then; A6's `/api/uploads/sign` and `add_asset` for the studio's couple photo (D105). **At 13:30, if PDF is approved:** the additive `pdf` migration (D66).
- **Lane C (10:45 batch):** the environment-flag reader. **The lead:** a deployed SHA before your production probe (D44).

## 5. Topics, in order

All of these are Must 4, 7 and 9, except PDF (a Should behind its gate), the studio polish (gated, D106) and Option B (a stretch). Work order: 1, 2, 3, 6 (all by 11:40), then 4, 5 and topic 7's minimum (12:30), then 7's polish and 8. Numbers stay as the other notes cite them.

**1. `lane-d-render-probe` → out of batch, merge about 10:30.**
- Scope:
  - `/render/card/[job_id]`: the token check (an HMAC of the job id and an expiry at most 5 minutes ahead), and the `probe` fixture (demo names, Hindi lines, Lotus Hall, plus the test-string line).
  - The card layout from export 1.2 to 1.5: 1080 × 1350, the colour tokens, Eczar and Anek, the fit rule, the `hi` language marks. It renders with and without the couple photo, so the 11:50 card passes either way (D107). `src/server/export/`: Chromium by dynamic import, one browser per instance, one render slot, the readiness guard.
  - `/run` with a temporary constant-time bearer check inside your own path (D58): `probe` answers with a PNG and the six `X-Render-*` timing headers. Other ids answer 404 until topic 3.
- Tests: EX-05 (on `/run`), EX-17, and EX-18 (token and headers part). Your probe spec runs with no seeded data and no login (D54).
- Done when: locally, the probe PNG is 1080 × 1350 and the Hindi shapes. After the deploy (check that `/api/health` serves the probe's SHA first, D44; with no Ready production deploy by 09:50, the probe waits while the user retries the import at 10:05, D119), P1 at about 10:40: 200 within 30 s cold and 6 s warm. Give the timing headers to the lead (architecture 10, question 5). If P1 fails, the og renderer becomes your top priority (D48).

**2. `lane-d-publish` → 11:40.** First, so that a REV-3 export can be tested end to end. At D0 the seeded JOB-EXP-R2-PNG makes a REV-2 export answer `unchanged`. Fetch and merge the probe before cutting this from `origin/main`, or stack it on the open probe branch (D67).
- Scope:
  - `publish_itinerary` (P3 to P7, the `changes` list, `draft_changed`) on Lane A's pure snapshot builder, `src/db/itinerary-snapshot.ts` (build and diff, P2's fields; A1, 10:45). Import it; never write a second builder (D95). `update_invite_style` (`wording_en` as two paragraphs, export 1.2).
  - `PublishSheet`: changes with old values struck through, "Publish revision N", owners only. It takes the reviewed `expected_draft_version` and a confirm callback, so B's planner action and C's voice confirm each make exactly one write (D59).
  - The Invite page, replacing the contracts placeholder, with `PublishSheet` mounted for owners, so the 11:50 check needs no Lane B screen (D105, D107).
- Tests: AT-3.4, AT-3.5, AT-3.6, AT-9.3 (draft invisible). Done when, staged (D104): before ready, with fixture services or an injected draft change, Diya's draft venue move plus Mira's publish gives REV-3 with one change, and Diya's publish gets 403 `forbidden`. After the 11:40 deploy, the real run is topic 3's 11:50 check on copy `d` (D107).

**3. `lane-d-export-jobs` → 11:40.** Cut from `lane-d-publish`. It must make 11:40 for the 12:15 gate.
- Scope:
  - The state machine: compare-and-set claim, lease, lazy expiry, and the worker's steps 3.3. The real body of `src/server/jobs/status.ts`: domain 4.8's fields plus export 11 item 16's, and `seed_key` on every row, null for live jobs (D16, D52, D99).
  - The kick: one entry in your static map in `src/server/jobs/after-commit.ts` (D101); ordinary commands kick `/run` in `after()`. `request_card_export` (with `card_event_ids` frozen and the drill scoped) and `retry_card_export`.
  - Ops GET (with `wait` and `expect`) and retry (`Idempotency-Key`, the outcome table, polling every 500 ms, the strings rule). When the retry commits `retried`, it starts `/run` with a fire-and-forget request before its wait loop (D53). Switch `/run`, the GET and the retry to Lane A's system verifier once it lands (11:40 at the latest, merged ahead of you), and delete the temporary check (D58, D102).
  - The member export and owner-retry routes; the upsert and size check through Lane A's Storage adapter (D41); the webhook sender; exports panel v1; the export activity templates (D63).
- Tests: EX-01 to EX-16, EX-19, EX-20; AT-7.3, AT-7.4. Database tests are `*.db.test.ts`, run with `npm run test:db` before ready; CI never runs them (D103). Ops GET works on 3004 by 11:10 for the 11:15 tunnel read (D43, D117). Then P2 at 11:50, and P3 from 12:00 to 12:15 (the gate).
- Done when, staged (D104): before ready, EX-01 to EX-15 pass locally, and copy `d`'s REV-3 export (from an injected draft change until A4 merges) reaches Ready with `card-rev3.png` in local Chrome. At about 11:50, after the 11:40 deploy, on production on copy `d` (D107): as `diya.d`, move the reception to Lotus Hall through `POST /api/w/[wedding_id]/commands/update_event`; as `mira.d`, publish through `PublishSheet` on your Invite page; then download the export job's PNG. That's the day's key signal (D41); Lane B's Events screen isn't needed.

**4. `lane-d-guest-site` → 12:30.**
- Scope:
  - `/i/[token]` in the stationery register (design-direction 10.6): seal, foil hairline, inserts with the RSVP inside, Directions with no referrer, the English / हिंदी toggle, food preferences, "Send reply to the families", the thank-you line and "Change reply". It is built only from `guest_invitation_view`, with `LiveRefresh` polling `/api/i/[token]/revision` every 10 s and when the tab regains focus (decision D37). A publish reaches Tara's page within 12 s (D92). On a 429 the page backs off to 30 s and keeps showing its content (D90).
  - The RSVP and dietary routes run through the dispatcher as the guest, with one key per press, created when the button appears.
  - The same 404 body for every bad token. A valid guest link gets 401 on money, planner, export and voice routes, and 404 for an out-of-scope function through the RSVP route; never 403 (decision D35). Call Lane A's single rate limiter once per guest request (per token hash about 120 GETs and 30 POSTs a minute, plus a loose 600 a minute per IP; domain 6.3, D108); never add counters of your own, and test the 429s through your routes (D57).
- Tests: AT-4.1 to AT-4.6 (AT-4.5's changed answer keeps the same row), AT-4.9, AT-7.2, AT-9.1 to AT-9.5; the RSVP idempotency rows in acceptance 4.3 (with Lane A).
- Done when, staged (D104): before ready, on fixtures for A5's DTO and handlers, Tara's equivalent sees exactly two inserts and a double tap counts once. After the 12:30 deploy, merge `origin/main` and rerun it on copy `d`, on the iPhone through your tunnel: two inserts, and a double tap counts once (229 becomes 230). L's demo-path run then needs exactly one RSVP and the guest-privacy check (D46).

**5. `lane-d-ops-recovery` → 12:30.**
- Scope:
  - Exports panel polish: every export 2.7 state, the attempts list, "stopped responding", the 45-minute line, and out of date with its reason. The webhook live once the lead adds `NUDGEBEE_EXPORT_WEBHOOK_URL` (about 12:15).
  - `ops/nudgebee/card-export-recovery.yaml`, exported from NudgeBee once it works, with no secrets, plus a README with the workflow and object names (D43, D62).
  - At about 12:00, render the REV-2 seed card from a Banyan Hall variant of the probe fixture and commit it as `scripts/seed-assets/card-rev2.png` (decision D15). Lane A's seed uploads it; until then JOB-EXP-R2-PNG is Ready without a file and rehearsals before 13:45 skip its download.
- Tests: AT-7.5, AT-7.6. The PR is gated on tunnel or manual checks only. NB-T10 to NB-T15, P4 and P5 run after the 12:30 deploy, with the NudgeBee account operator (D72); append their run ids in a follow-up PR.
- Done when: the PR is in the 12:30 batch. Then NB-T10 (by 12:50, D121) runs end to end on copy `d` with the run id and approver shown, four activity entries, and one object. Keep the first successful run id. V15 (13:00–13:30) needs one successful full drill (D43).

**6. `lane-d-og-fallback` → 11:40, dormant, whatever the probe says (decision D48).** Chromium stays selected. If P1 fails at 10:40, this topic jumps ahead of topics 2 and 3.
- Scope (export 3.7): next/og at 1080 × 1350 with Latin-only text; the two Hindi lines as 2× PNGs in `public/card/`, captured from the render page in local Chrome; Eczar and Anek Latin TTF files with their OFL licence; `renderer` recorded on the attempt.
- Tests: the renderer branch of AT-7.3 and acceptance 6.6. Rehearse the switch locally, so that at 12:15 the user can flip `card_renderer` without a deploy. Done when: with `card_renderer` `og` on local dev, a job reaches Ready with a real PNG, and `title_hi` is omitted, never wrong.

**7. `lane-d-invite-minimum` → 12:30 for the minimum, `lane-d-invite-studio` → 13:45 for the polish.**
- The minimum ships at 12:30 whether or not #11 is in play (D105): AT-7.1's typed path (the style, and the couple photo through A6's upload), extending the Invite page from `lane-d-publish`. The polish merges at 13:45 only if L's post-12:30 demo-path run passed and its own checks are green; otherwise it moves to 14:30 or becomes future scope (D106).
- Scope (design-direction 10.7): workspace controls on the left and the live stationery preview on the right, from the draft. Theme `maroon_gold` (Peacock only if time is left), typeface, frame, layout, wording in English and Hindi, and the blessing line (none by default).
- The photo goes through Lane A's `/api/uploads/sign` and `add_asset`: JPEG, PNG or WEBP up to 10 MB, never a GIF, labelled "AI-generated, fictional". Tests: AT-7.1 (the typed path; I-01 by voice is Lane C's 13:45 item, D121) and AT-7.2.
- Done when: a style change shows at once in the preview and in the publish sheet, and reaches guests only after a publish.

**8. `lane-d-pdf` → 14:30, Should, only if the lead approves it at 13:30 (decision D66).** About 30 minutes. It needs Lane A's additive `lane-a-pdf-format` (`pdf` in `export_format`, `application/pdf` on the `exports` bucket); remind the lead at 13:15. Scope: a one-page PDF render, its download, and its own `export_key` check (export 1.4). Cut it before anything else (export 9, risk 24).

**Option B stretch (export 6.9).** Gate at 13:30, hard stop 14:30. The cluster work runs from the main folder (lead and user). Your only part is a line in `ops/nudgebee/README`.

## 6. Traps and fallbacks

**NudgeBee:**
- **Any HTTP status of 400 or above fails a step.** Every business state answers 200. 412 comes only with `expect`.
- **Retries can resend the same POST:** step attempts, and a workflow Retry, which starts a new execution from the top (F33). The retry key replays the stored answer. The compare-and-set on `export_key` stops a second claim under a new key. The HTTP step's default timeout is 30 s, so the retry answers within `wait` (at most 25 s; NudgeBee sends 20).
- Task outputs are not masked, so ops responses and error messages carry no URL, path, token or signed link.
- Use the exact https base URL: no redirect (a 301 or 302 turns a POST into a GET), never `VERCEL_URL`, and no Vercel challenge on `/api/ops/*`.
- The webhook URL carries a token, so it is never logged. The webhook fires at most once per job, and never for a lazy failure an ops route found.

**Chromium and the card:**
- **Devanagari fonts.** Sparticuz ships only Open Sans, so Hindi turns to boxes without the web fonts. macOS Chrome's system Devanagari fonts hide a missing web font locally. Guard step 3 checks the web faces themselves, and P1 checks on production. next/og (Satori) can't shape Devanagari and can't read WOFF2.
- Concurrent launches fail with `spawn ETXTBSY`: one browser per instance behind a module-level promise, one page at a time.
- Pins are 153.0.0 and 25.11.0, never 158 or 25.18.1. Import Chromium only in `src/server/export/`, only from `/run`.
- Self-calls use `VERCEL_PROJECT_PRODUCTION_URL` (local: `APP_BASE_URL`). Linux Chromium is testable only on production. Warm up 5 minutes before every take (export 3.4).

**Guests and data:**
- Build the guest view by copying allowed fields, never by deleting. No counts and no ₹ anywhere on guest pages. Guests never see vendor names: the reception's description is "Dinner follows." (D24). Format every date and time in IST: functions run in UTC.
- A double click racing on `export_key` answers `unchanged`, never a 500. The drill is consumed in the claim write, and nothing but the flag arms it.

**Fallbacks you own** (architecture 8; export 6.10 and 9):

| # | If, by when | Then (owner) |
|---|---|---|
| 1 | NudgeBee T1, T2 or T4 fails (teammate 09:10–09:28 if invited, else the user at about 10:05, after any unfinished Flagsmith steps, deciding at about 10:20; D8, D119) | From the main folder, L runs Docker, `kind create cluster`, the download and the kubectl checks; the user runs `read -s` and the install line in a plain Terminal tab (D8, D119). You change nothing |
| 2 | P1 fails at 10:40 (launch error, missing file, boxes), or there's no Ready production deploy by 10:40 (D119) | Ask the lead for the tracing include; check the launch arguments. Topic 6 becomes your top priority, and you verify a real PNG from it (D48). With no deploy, L also brings up the tunnel host (architecture 8 row 10) |
| 3 | The tunnel read fails at 11:15, or the first production read fails at 11:50 | You own URL, credential and response failures (D43): check the exact URL, https, no redirect, no challenge, the token. The user asks the sponsor's team (D121) |
| 4 | No real REV-3 PNG has succeeded on production by **12:15** | The user flips `card_renderer` to `og` (topic 6 is dormant on production since 11:40); the README says Partial. If 11:40 slipped, a passing REV-3 probe counts at 12:15 and the real job must pass by 12:45 |
| 5 | NB-T10: the webhook starts no run by 12:50, after the 12:30 deploy (D121) | Manual trigger with the job id; debug the filter until 13:00 only |
| 6 | In-app approval unusable (T4, or later) | Email approval to the user (D121) |
| 7 | By **12:45** the retry through NudgeBee is still broken | The lead and the user pick the recording path (D43): record NudgeBee reading the failed job, the user retrying in Jashn, then NudgeBee reading the completion, labelled with who retried |
| 7a | A second Vercel deploy failure caused by the platform | L brings up the cloudflared tunnel at once; you verify its authenticated endpoint (D48) |
| 8 | Lane D overloaded at 11:40 | Cut in order: PDF, `ai_note`, the stalled-state copy, Option B. Keep the card, the ops routes and the drill |

## 7. Working routine

For each PR (architecture 6.2 and 6.4):
1. Merge `origin/main` into your branch, then run `npm run check`, `npm test` (plus `npm run test:db` once you have `*.db.test.ts` files, which CI never runs; D103), `npm run build` and your spec. Start your dev server first, in the background (`npm run dev -- --port 3004`), then run the spec with `E2E_BASE_URL` set to `http://localhost:3004`. It covers only what your open PR delivers. It signs in its own `@example.com` accounts through the login page with its own storage state (the probe spec needs no login, D54), and never touches `e2e/.auth/` or the `e2e` copy. The lead's `playwright.config.ts` loads `.env.local`, so the spec reads `SEED_PASSWORD` and `JOBS_API_TOKEN` without printing them (D120). Global sign-in, reset and H16 rotation belong to the lead's demo-path project (D46, D54).
2. Push and open a draft PR titled "D: <what it delivers>". The body says what changed, how you tested it (laptop, phone, production), schema and env changes, and follow-ups.
3. When CI is green and the checks pass on fixtures or injected dependencies (D104), mark the PR ready and tell the lead, with the batch it is for.
4. Cut the next topic at once: from `origin/main`, or from the open branch when it depends on it. Merge commits only; the lead merges.
5. After every batch, merge `origin/main` again, as soon as the lead says the batch is in. Then rerun the real-data part of that batch's done-checks on copy `d` (or production where a topic says so). A failure there is the first item of your next batch; it doesn't hold the current one (D104).

Run at 09:00 or later, from `~/Desktop/Personal/jashn-d`. The first branch is `lane-d-render-probe` (D67). The last two lines are follow-ups: cut `lane-d-publish` only after the probe has merged, and run P1 after the deploy:

```bash
git fetch origin && git merge origin/main
npm run check && npm test && npm run build && E2E_BASE_URL=http://localhost:3004 npx playwright test e2e/lane-d.spec.ts
git push -u origin lane-d-render-probe
GH_TOKEN="$(gh auth token --user omiiii21)" gh pr create --repo omiiii21/Jashn --base main --head lane-d-render-probe --draft --title "D: card render page and Chromium probe" --body "What changed. How it was tested. Needs RENDER_TOKEN_SECRET and JOBS_API_TOKEN in Production."
GH_TOKEN="$(gh auth token --user omiiii21)" gh pr checks lane-d-render-probe --repo omiiii21/Jashn
GH_TOKEN="$(gh auth token --user omiiii21)" gh pr ready lane-d-render-probe --repo omiiii21/Jashn
git fetch origin && git switch --no-track -c lane-d-publish origin/main
curl -s -X POST -H "Authorization: Bearer $(grep -E '^JOBS_API_TOKEN=' .env.local | cut -d= -f2-)" -D probe-headers.txt -o probe.png "https://<production domain>/api/ops/export-jobs/probe/run"
```

- The last line is P1. It never prints the token. Delete `probe.png` and `probe-headers.txt` afterwards, and never commit them.
- **Phones and NudgeBee dry runs:** start a cloudflared quick tunnel to port 3004 and set `APP_BASE_URL` to its URL (architecture 6.6, export 3.5).
- **No AI tool names in git.** Branch names, commit messages, PR titles and PR bodies never name an AI tool, carry no `Co-Authored-By` trailer at all and never say "Generated with". The commit-msg hook strips such trailers and rejects any message containing "claude". So write "agent instructions", never the file names. AI help is disclosed only in the README and on the submission form.
- **gh:** every gh command runs as `GH_TOKEN="$(gh auth token --user omiiii21)" gh ... --repo omiiii21/Jashn`. Never run `gh auth switch`.
- **Packages, config and env:** never install anything or edit root config; ask the lead. **Secrets:** never print, echo or commit `JOBS_API_TOKEN`, `RENDER_TOKEN_SECRET`, the webhook URL or any signed URL.

## 8. When to stop and ask the lead

Reach the lead with ListAgents, then SendMessage to the session working in `~/Desktop/Personal/Jashn`; if that fails, stop and ask the user to relay. Stop and ask when:
- you would edit a file outside part 2's paths, or need a contract change, a column or enum value, a package, an env var, or a `next.config` or root-layout change;
- a contract shape doesn't fit what a spec needs, or two binding specs disagree and the authority order doesn't settle it;
- a trigger in part 6 fires: say which one before you switch;
- you are about to arm or disarm the drill, wire `retry_export` to a real job (only after EX-01 to EX-04 pass), or touch the demo copy;
- you need a person in a browser (NudgeBee objects, an approval click, Flagsmith, a phone test). The lead batches these for the NudgeBee account operator (the invited teammate, else the user, D72) or the user, who covers every teammate task;
- a token or secret would be printed, logged, committed or returned in an ops response;
- CI stays red after 10 minutes of fixing, or a merge conflict lands in a file you don't own;
- the REV-2 seed card can't be rendered from the Banyan Hall probe variant by about 12:00, or committing `scripts/seed-assets/card-rev2.png` would touch any other file under `scripts/` (decision D15).
