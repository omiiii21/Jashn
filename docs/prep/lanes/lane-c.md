# Lane C brief: voice, Flagsmith and the setup experiment

Prep note, revised about 06:20 IST on Wed 25 Nov 2026 (decisions D1–D122 applied). Notes only (hackathon rule 4): no code. Right after the contracts PR merges (about 09:50–09:55, decision D70), the lead copies it into `~/Desktop/Personal/jashn-c` as `CLAUDE.local.md` (gitignored). Read it first, then `AGENTS.md`, then the spec sections in part 3. Specs live in `docs/prep/spec/` and are read-only for you.

## 1. Header

- **Lane C mission:** voice that proposes and never writes by itself, every Flagsmith flag behind it, the voice-first vs form-first setup experiment, and (only after its gate) the printed-card reader.
- **Worktree:** `~/Desktop/Personal/jashn-c`. **Dev port:** 3003. **First branch:** `lane-c-voice` (the lead creates it). **Pattern:** `lane-c-<topic>` (architecture 6.1). You start at about 09:58–10:05 (D70).
- **Batches you aim for** (the lead merges A → B → C → D; freeze 14:45):

| Batch | Your PRs |
|---|---|
| 10:45 | `lane-c-voice`, `lane-c-synthetic-run` |
| 11:40 | `lane-c-setup-experiment`, `lane-c-flags-drawer` (12:30 at the latest), `lane-c-voice-pipeline` (only if topic 1 splits) |
| 12:30 | `lane-c-voice-answers`, with I-02 and E-05 by voice (decision D59) |
| 13:45 | `lane-c-fix-<n>` (demo-path fixes go first), `lane-c-invite-voice` (topic 10, I-01, D121); `lane-c-judge-panel` only if L's post-12:30 demo-path run passed and its checks are green, else 14:30 or future scope (D106) |
| 14:30, the last batch | `lane-c-card-reader` (topic 8) and `lane-c-shagun-voice` (topic 9), each only if its gate opens; `lane-c-fix-<n>` |

- **Your test data:** rehearsal copy `c` only. Accounts `mira.c@example.com` (owner) and `diya.c@example.com` (manager); the password is `SEED_PASSWORD` in your `.env.local`, which you never print. Every `@example.com` account is internal, so the experiment never enrols it. Fresh owners sign up as `setup-c-<HHMM>@example.com`; AT-1.7's non-internal tester is `nonint-c-<HHMM>@example.net`, on local dev only, never on production (D120). You may run `reset_demo` on copy `c` only, as its owner (`checkpoint` d0, `confirm_text` RESET). The demo and `e2e` copies are L's (D17): never write to them. If copy `c` isn't seeded by 10:45, read the `e2e` copy (GETs only) and use fixtures for writes until 11:40 (D120).
- **The 09:00 checks:** the lead runs Sarvam T0 to T4 at about 09:14 from `~/sarvam-smoke`, with V-T1, V-T2 and the Bulbul audition (D78); the teammate holds no Sarvam key. The user picks the two Bulbul voices by 10:30, or voice.md's defaults stand. T5 and T6 (Document AI on the fictional Arora card) run at about 10:05–10:15 (D7, D119). If the teammate hasn't laid the card out by 09:50, L renders it at about 10:00–10:05 from an HTML page outside the repo, never with an image generator (D73, D119). The lead passes you the results.
- **V-T3 and V-T4 are yours** (D112). V-T4: the live 8 through the turn route's `text` input as soon as it answers (about 10:25), 3 runs each, before `lane-c-voice` is marked ready. V-T3: both phones through your tunnel before 10:40 if the route records by then, otherwise by 11:30 at the latest, with the WAV fallback off until then. If the iPhone runs iOS older than 18.4, expect `audio/mp4` (voice 1.3).
- **Hooks:** the typecheck Stop hook (`npm run check`) is in your gitignored `.claude/settings.local.json`. There is no design hook in this worktree. Use impeccable only for the mic panel states (skills-toolkit §3).

## 2. Owned paths and the rules for every session

You write only these paths (architecture 4.2, row C), plus `e2e/lane-c.spec.ts` (rule 5):
- `src/app/(planner)/setup/`, `src/app/api/{voice,card-imports}/`
- `src/server/{voice,flags,card-import}/`, `src/lib/card-import/`
- `src/components/{voice,setup}/`
- `scripts/synthetic-setup-traffic.ts`, `public/{voice-fixtures,samples}/`

You import services and the dispatcher from Lane A. You never edit another lane's files; ask the owner through the lead.

Rules for every session (architecture 4.2):
1. Lane A alone edits `src/db/schema.ts` and `drizzle/`, including your tables `voice_turns`, `experiment_exposures` and `card_imports`. Ask Lane A for columns.
2. You may read Lane A's tables directly from your own `src/server/` module for your own needs (for example `members` for `is_first_wedding`). Domain writes always go through the dispatcher.
3. Until Lane A switches `src/server/services/index.ts` to the real implementation (target: the 10:45 batch), build against the fixture services from the contracts.
4. Never run `npm install`, `npx shadcn add`, `drizzle-kit push` or anything `@latest`. Package requests go to the lead, who adds them in a `lane-lead-*` PR.
5. Unit tests sit next to the code they test, in your folders. Your end-to-end spec is `e2e/lane-c.spec.ts`.

## 3. Read first

In this order, one line on why:
1. `AGENTS.md`: the 15 team rules (architecture 7.3). They override any default you carry.
2. voice.md 0 to 1.17: the pipeline, routes, checks, review card, confirm and Bulbul. Binding for voice.
3. voice.md 2 (the `propose_actions` tool), 6 (failures and fixture mode), 7.1 (the live 8) and 9 (the `voice_turns` columns you ask Lane A for).
4. flagsmith.md 3 (every flag, chip and fallback), 6 (SDK, module layout, self-check, fallbacks, focus refresh) and 2 (identity and traits).
5. flagsmith.md 3.4 and 5.2 to 5.11 (entry decision, exposure, conversion, flushes, synthetic run, drawer, table), then 7.3, 7.6 and 7.7 (order, the checks FV1 to FV15, your topics; D113).
6. architecture 2.1 to 2.4, 3.3, 4.1 to 4.3, 5.1 and 6: where code runs, the guard, ownership, env names, delivery.
7. domain-and-data 2.9 (V1 to V11: V10 is the voice rate limit, without its reply-audio sentence, D121; V11 keeps `publish_itinerary` alone in its turn), 3.0 (how every command runs), A3 and 3.4 (a manager's limits), 3.8, 3.9 and 4.9. Apply the change lists in architecture 9, flagsmith 10.1 and voice 10 on top.
8. acceptance 0.2 to 0.5, Must 1 (AT-1.1 to AT-1.9), Must 2 (AT-2.1 to AT-2.13), AT-7.1's voice half (topic 10), AT-9.6, AT-12.2, AT-12.3, sections 2, 4.3, 6.1, 6.3, 6.6 and 7.
9. voice-test-set.md (47 rows, live 8). Its 43-of-47 rule is superseded. At most three of the rows that apply may fail (decision D82): 36 of 39 while #11 and #13 are unbuilt (47, minus G-03 to G-07, minus SH-01, SH-02 and I-03). If #11 or #13 ships, its rows apply again. Then demo-data §1, §5 to §7, §9.3, §13.1 and §14 (the three fixed replies, character for character).
10. design-direction 7.1 (voice panel states) and §6 (Phosphor icons; never `Sparkle`).
11. doc-ai.md in full, only when topic 8's gate opens.

Where a research note and a spec disagree, the spec wins. **Do not use these stale names** you will meet in older notes:

| Stale (where) | Use instead |
|---|---|
| Packages `flagsmith-nodejs` 8.1.2, `flagsmith` 10.0.0, `@flagsmith/flagsmith` (research-stack, research-flagsmith); the Vercel Flags SDK adapter and the vercel:flags-sdk skill (skills-toolkit) | `@flagsmith/nodejs` 9.5.0, server only, already installed. No Flagsmith code in the browser; never load the flags-sdk skill (decision D34) |
| Flags `voice_mode`, `voice_tts_enabled`, `stt_mode`, `card_export_fault_once`; segments `voice_pilot`, `internal_testers`, `lang_hi_hinglish` | Flags `voice_pilot`, `spoken_replies`, `export_failure_drill`; segments `voice_rollout`, `internal_team` (flagsmith 0.2) |
| `GET /api/flags/health`, `GET /api/voice/state`, `src/app/api/flags/` | The `flags` summary in the lead's `/api/health` (flagsmith 6.7); the focus refresh plus the `voice` block in every voice response (6.9) |
| `FLAGSMITH_SERVER_KEY_DEV`, `_SYNTH`, `_PROD`, `FLAGSMITH_SYNTHETIC_KEY`, `.env.synthetic.local`, `FLAGSMITH_INTERNAL_EMAILS`, `FLAGSMITH_EXPECTED_ENV` | `_DEV` is `FLAGSMITH_SERVER_KEY`; `_SYNTH` is `FLAGSMITH_SERVER_KEY_SYNTHETIC`; `_PROD` is `FLAGSMITH_SERVER_KEY_PRODUCTION`, which is never in your copy (the lead deploys it as Production's `FLAGSMITH_SERVER_KEY`). `INTERNAL_USER_EMAILS` (architecture 5.1–5.3). No expected-env variable |
| `OPS_API_TOKEN`, `SUPABASE_SECRET_KEY`, `NUDGEBEE_WEBHOOK_URL` (domain, research-stack) | `JOBS_API_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`, `NUDGEBEE_EXPORT_WEBHOOK_URL` |
| Kill switch fails open; 400 identities on `setup_entry`; `is_internal` from user ids; trait value `hinglish` (research-flagsmith) | Fails closed; 800 on `setup_entry_synthetic`; `INTERNAL_USER_EMAILS` plus `@example.com`; only `en` and `hi` |
| Kinds `publish_schedule`, `export_card`, `propose_expense`, `extract_invite`, `confirm`, `cancel`; `voice_attempts`; `preview_id`; route segments `[id]`, `[turn_id]` (voice-test-set, older plans) | voice 0.2–0.3 and 2.6: `publish_itinerary`, `request_card_export`, server-made `propose_change`, the paperclip's "Printed card" (setup only), fixed phrases; `voice_turns`; `voice_turn_id`; the segment is always `[voice_turn_id]` |
| R-03's "Aap type karke save kar sakti hain" (voice.md, flagsmith 3.2, AT-2.7, voice-test-set) | "sakte hain", the respectful form for any speaker (decision D93) |
| Kill switch checked only at confirm (domain V3, 7.1 step 9); domain 3.8's short phrase list | Also the early refusal at `/api/voice/turn` (flagsmith 3.2); voice 1.8's full list |
| Realtime doorbell, browser Supabase client (domain 5.6, research-stack §6.5) | Polling plus the focus refresh (architecture 2.4). No Realtime, RLS on with zero policies, authorization only in the server guard |
| Publish review sheet owned by Lane B (voice.md header and 7.1 #6) | `PublishSheet` is Lane D's (architecture 4.1, 4.3; decision D19). Voice E-05 opens D's sheet |
| A vendor path with its own segment; a bottom speak bar on the phone | `/w/[wedding_id]/vendors?vendor_id=…` from the `routes.ts` builder (decision D18); the mic sits in the header on every screen, desktop and phone (decision D20) |
| "Realtime" updates; a 403 for a guest link | Polling: 2.5 s on planner screens, 10 s on the guest page, plus the focus refresh (decision D37). A guest link gets 401 on voice routes (decision D35) |
| Flagsmith checks V1 to V15 (flagsmith 7.3 and 7.6, PLAN, older notes) | FV1 to FV15 (D113). Domain 2.9's V1 to V11 and the video shots V01 to V16 keep their names |

## 4. Contracts

**You consume** (the contracts PR merges about 09:50–09:55, decision D70; contracts change only through a `lane-lead-contracts-<n>` PR):
- `src/contracts/flags.ts`: flag keys, variations, fallbacks, traits, segments, events, chip keys and labels, the voice-gate and setup-saved interfaces, the `flags` summary shape. You request its changes (with D).
- `src/contracts/api.ts`: the voice routes, the card-import routes and the `propose_actions` schema. You request changes for your routes.
- `src/contracts/commands.ts`, `domain.ts`, `read-models.ts` (every row carries `seed_key`, null for live rows, so voice 1.9's snapshot can name records, D99), `money.ts` (en-IN display and the Hindi amount words, Lane A's), `routes.ts` (with the `highlight` query parameter, comma-separated field keys, D121), `services.ts` (fixtures until about 10:45), `fixtures.ts`. `card-import.ts` (types only, for #11) and the `image_extraction_provider` key come later, in `lane-lead-contracts-2` at about 10:30 (D44, D115).
- Lane A's stubs: `src/server/auth/session.ts`, the session helper's final signature, returning the fixture member with the actor fields (D96; real in `lane-a-dispatcher`), and `src/server/actions/dispatch.ts`, whose `dispatchCommand` server action takes and returns domain §3.0's envelopes (D98). Server components pass it to client forms as a prop. Never write your own command wrapper; the drawer's actions stay in your `flags/`.
- The design tokens in `src/app/globals.css`, in the contracts PR from your first minute (decision D4). Lane B owns the file; style the mic panel with tokens only.

**You replace these stubs** and own them from then on:

| Stub | Starts as | Real by |
|---|---|---|
| `src/server/flags/index.ts` | Gate refuses every voice write (fails closed, decision D47), reader returns fallbacks, hook does nothing, summary "not built yet" (so `/api/health` shows `flags.ok` false until `lane-c-voice` merges, decision D12) | 10:45 (`lane-c-voice`): user evaluation, environment-flag reader, real voice gate (fails closed), self-check summary. The setup-saved hook stays a no-op until 11:40; Lane A's dispatcher calls it from 10:45 (decision D39) |
| `src/components/voice/VoiceDock.tsx` | A disabled mic that already declares its final props: `wedding_id` (null on `/setup`) and the props voice.md names. Keep them; a props change is a contracts change, made by L (D97) | 10:45 (`lane-c-voice`) |

**Others need from you:**

| Who | What | Batch |
|---|---|---|
| A (dispatcher step 4 and after commit) | The voice gate; then the setup-saved hook | 10:45; 11:40 |
| B (shell; then forms, B3's requirement form first) | `VoiceDock` with its final props (D97). Then a typed prefill store exported from `src/components/voice/`, with one consumer contract (D61). The prefill is always a list of `{command, input, labels}`, one entry per action, for both the early refusal and the 423's `error.prefill` (D121) | 10:45; store by 11:40 |
| D (export handler and worker) | The environment-flag reader: `export_failure_drill` (enabled and value), `card_renderer` | 10:45 |
| D and L (I-02, E-05) | `request_card_export` and `publish_itinerary` as confirmed voice actions through D's handlers. E-05 opens D's `PublishSheet` and passes your voice confirm as its callback: one write (decision D59) | 12:30 |
| L (`/api/health`, Playwright step 10) | The `flags` summary from your module | 10:45 |

**You need from others:** Lane A's `voice_turns` (with voice 9's columns), `experiment_exposures` and `card_imports`, all in `lane-a-schema` (the first migration), pushed as a draft PR by 10:20 (D96); the actor's email in the dispatcher context and `set_wedding_profile` (10:45); A3's money commands (`lane-a-ledger`) for the persisted M-03 check, and the read models your answers use (11:40 and 12:30, with A5's `rsvp_totals` for AT-2.4); A6's `/api/uploads/sign` and `add_asset` for I-01 (12:30); the Shagun backend by the 13:45 batch (decision D65). Lane B renders `VoiceDock` in the header slot on every screen and sets prefetch off on its links to `/setup` (10:45). B2 brings the wash helper and the vendor highlight targets (11:40, D61); B's pages read the `highlight` parameter and apply it once (D121). B1 brings a member-guarded landing view with the saved name, date, city and budget (11:40, D60). Lane D brings its four handlers and a reusable `PublishSheet` (`wedding_id`, the `unpublished_changes` list, `expected_draft_version`, `on_confirm`; 11:40, D59, D97).

## 5. Topics, in order

Must 1 and 2 come first. Should #12 (voice requirements) rides inside topic 5. Topic 10 (I-01, Must 7's voice half) follows topic 5, for 13:45; numbers stay as the other notes cite them. Should #11 (topic 8) and Shagun by voice (topic 9) are last, and each is gated.

**1. `lane-c-voice` → 10:45.** Target: PR open by 10:35.
- Scope:
  - The flags core first: client (2 s timeout, 1 retry, 30 s breaker, default handler), `u_` HMAC identity, traits, per-render cache, environment evaluation, gates, reason labels, self-check with the 60 s cached summary, environment-flag reader.
  - VoiceDock (server) and the client dock: hold to talk, tap to lock, recorder type order, every mic track stopped, chips `internal_team`, `voice_rollout`, `voice_on`, `safe_mode` and `questions_only`.
  - `POST /api/voice/turn`: checks 1 to 6, Saaras, the `heard` event, phrases, the role-filtered snapshot (records named by `seed_key`, D99), sarvam-105b, voice 1.11's checks, the NDJSON stream, the `voice_turns` row.
  - `/api/voice/confirm` and `/cancel`: keys `{voice_turn_id}:{index}`, 423, 409 refresh, replay. The dispatcher returns only its single action's prefill entry, so confirm rebuilds the full list from the stored turn before answering 423 (D121). Append `routes.ts`'s `highlight` parameter to `navigate.path` (D121). Also the early kill-switch refusal with its prefill list, the typed prefill store (D61), and fixture mode for the live 8. All five voice routes (turn, confirm, cancel, reply-audio, trace) answer 403 `voice_unavailable` when `voice_pilot` is off, before any Sarvam call.
  - Server checks (voice 1.11): `publish_itinerary` with any other action becomes a question with nothing to confirm (V11). A manager's A1 proposal needs `managers_can_see_vendor_dues` (refused `not_shared` at the turn; the dispatcher answers 403 `forbidden`). A manager's `add_guest` with `event_ids` or `max_plus_ones`, or into a household with an active link, gets 403 `forbidden` at the dispatcher (domain A3, 3.4).
- Schema (D96): before 10:20, build the pipeline on fixtures. Once Lane A pushes `lane-a-schema` (a draft PR, by 10:20), merge `origin/lane-a-schema` into `lane-c-voice` (merge commits only, architecture 6.3) and write `voice_turns` through it. L merges A's PRs first at 10:45, so your PR then shows only your own diff. If it isn't pushed by 10:25, keep `voice_turns` writes behind your own small store interface with an in-memory fake, and move the real write to 11:40.
- Files: `src/server/flags/`, `src/server/voice/`, `src/components/voice/`, `src/app/api/voice/{turn,confirm,cancel}/`, `public/voice-fixtures/`.
- Tests: FV2, FV8 (health and dock parts), V-T4 and V-T3 (§1, D112), AT-1.7, AT-2.2, AT-2.3, AT-2.8, AT-2.9, AT-2.10, AT-2.13, X-01, and AT-2.7 in stages (below). Unit tests for the flag fallbacks (FV8), the phrase matcher, V11, the manager limits and the role-filtered snapshot (AT-9.6).
- Done when, staged (D55, D104): at 10:45, on 3003 with fixtures or an injected dispatcher: the M-03 preview, the real gate, R-03's refusal payload with its prefill (`voice_writes_enabled` off in Development) and the confirm envelope are right; `/api/health` on 3003 shows `flags.ok` true and `env_label` `development`; V-T4 has run. After A3 merges at 11:40 and the batch deploys, on copy `c`: the persisted M-03 and C-01 replay check ("haan, save karo" saves PAY-01 version 2 exactly once). After the 12:30 integrations: the full AT-2.7.
- **Kill-switch checks on production (decision D47):** at 11:15 the user turns `voice_writes_enabled` off and you check the deployed behaviour (FV7). After 12:30, the full check: a pending voice write (423), one typed save and a read-only question. If the requirement form isn't merged by then, the typed save is an Events edit, such as a dress code; it counts as the README proof (D114). The user restores the flag, and you log the result for the README.
- **Split rule:** if the pipeline isn't ready at 10:35, ship the flags core, VoiceDock, the chips and the real gate as `lane-c-voice` for 10:45. Move the turn and confirm routes and the prefill store to `lane-c-voice-pipeline` for 11:40. It is then an explicit 11:40 dependency of `lane-c-setup-experiment` (D55). FV7 stage 1 then moves to right after the 11:40 deploy, and the user flips `voice_writes_enabled` then (D121). Other lanes need the flags core at 10:45, not the pipeline.

**2. `lane-c-synthetic-run` → 10:45.** About 10 minutes, cut from `origin/main` after topic 1's PR.
- Scope: `scripts/synthetic-setup-traffic.ts` per flagsmith 5.8. It imports only `src/contracts/flags.ts` and the SDK. It has the `env_label` guard, the dry run, identities `synthetic-0001` onward, seed `20261125`, planted 0.60 and 0.50, a flush every 100, and `close()` once.
- Tests: the guard stops with no key and sends nothing; a unit test of the seeded draw.
- Done when: merged, then at about 10:55, **after the lead's go-ahead** (step F1), you run the dry run, read its output, then run the real run once (flagsmith 7.5 command 3). Hand the counts, time and seed to the lead for the README. FV10 at about 11:15, FV11 at about 11:30. Together they are AT-1.8's synthetic evidence.

**3. `lane-c-setup-experiment` → 11:40** (the Production experiment starts about 12:00, 12:45 at the latest).
- Scope:
  - `/setup` in both arms, applying flagsmith 3.4's entry rows 1 to 7. The exposure in `after()` with its `experiment_exposures` row, and `setup_opened_at`.
  - The real setup-saved conversion, replacing the no-op stub Lane A's dispatcher has called since 10:45 (decision D39), with the flush in `after()`. Prefetch off on every link to `/setup`. No version poll and no focus refresh on `/setup` (decision D79).
  - Voice setup, with the mic trigger in the setup header, as in the planner header (D20): S-01, S-02 and S-03 drafts that merge across turns; `set_wedding_profile` saved only after confirm. Form-first uses Lane A's `dispatchCommand`, passed in as a prop (D98).
- Files: `src/app/(planner)/setup/`, `src/components/setup/`, `src/server/flags/`.
- Tests: AT-1.1 to AT-1.6, AT-1.8, AT-1.9; FV8 (setup part), FV12, FV13; unit tests for all 7 entry rows; the typed setup in `e2e/lane-c.spec.ts`.
- Done when: the 7-row unit tests pass, and a typed setup creates exactly one wedding. FV13 on local dev (D121): the entry-decision log line (row and arm) appears only on a real `/setup` render, never on pages that link to it, plus a unit test that injects an in-experiment evaluation and asserts one exposure per render. The real exposure is FV14 (b) on production. AT-1.2 and AT-1.5 pass with a fresh owner (`setup-c-<HHMM>@example.com`), through B1's landing view, after a sign-out and sign-in (D60). If topic 1 split, cut this branch from `lane-c-voice-pipeline` or wait for it to merge.

**4. `lane-c-flags-drawer` → 11:40, 12:30 at the latest.**
- Scope: the chip popover's "Flags and experiment" button; `FlagDrawer` with flagsmith 5.9's four parts; its server actions, each re-checking that the caller is internal; "Run 50 probes" (no events); the "Sent by Jashn" counts; AT-1.8's drawer line word for word; the 2-hour voice-turn counts.
- Tests: FV4 and FV5 (about 11:20, on local dev), FV8 (drawer part); FV9 on production after the merge.
- Done when: the drawer opens for `mira.c@example.com`, never renders for a non-internal user, and at a 10% split about 5 of 50 probes are on with a `voice_rollout` reason. If it misses 11:40, the experiment still starts; FV9 and FV14 (a) move after 12:30.

**5. `lane-c-voice-answers` → 12:30.**
- Scope:
  - Answers from read models through voice 4's templates, with numbers, dates and amounts in words built in code (voice 3.5). Never डेढ़, ढाई, सवा, साढ़े or पौने. Refusals (E-06, M-14), questions with options (voice 6.2), corrections M-04 and M-05, the `add_requirement` kind (Should #12). Answer-card links carry the same `highlight` parameter (D121).
  - `GET /api/voice/turns/[voice_turn_id]/reply-audio?part={n}`, speaker only: session, own turn, then `voice_pilot` (403 `voice_unavailable`), then `spoken_replies` (204 when off). Bulbul streaming, speech parts of at most 140 characters, the iOS silent-clip unlock. No rate limit of its own: a turn's audio parts are capped by its stored speech parts (D121).
  - I-02 (`request_card_export`) and E-05 (`publish_itinerary`, alone in its turn) through Lane D's handlers. E-05's preview is D's `PublishSheet` with the reviewed `expected_draft_version`; your voice confirm is its callback, with exactly one write (D59).
- Tests: AT-2.1, AT-2.4 (its RSVP half after the 12:30 deploy, on copy `c`, D104), AT-2.5, AT-2.6, AT-2.7 (full), AT-2.11, AT-2.12, AT-8.3, AT-12.2, AT-12.3; the live 8 in order, also on the iPhone and the Android phone through your tunnel (V-T3 itself runs earlier, §1, D112).
- Done when: the live 8 pass three runs in a row on 3003 with live Sarvam (fixtures if fallback row 1 below is active), and the three fixed replies match demo-data §14 character for character. As soon as one real Sarvam correction succeeds with audible playback, bank it for the video (D49).

**6. `lane-c-judge-panel` → 13:45, a gated Should (D106).** It merges at 13:45 only if L's post-12:30 demo-path run passed and its own checks are green; otherwise it moves to 14:30 or becomes future scope.
- Scope: `GET /api/voice/turns/[voice_turn_id]/trace` and the "How Jashn heard you" sheet (voice 8), with Copy summary and "Save as fixture" when running locally.
- Tests (voice §8 checks; the panel has no acceptance id): speaker and owner get 200, other members 403 `forbidden`, a guest link 401 (decision D35), and 403 `voice_unavailable` with `voice_pilot` off. No key, header, snapshot or audio in the response. Done when: the panel shows request ids, `reasoning_tokens` 0, the checks and the flags for a live M-03 turn.

**7. `lane-c-fix-<n>` → 13:45 and 14:30.** Fixes from the full voice-test-set runs at 12:45 and 14:00 (D29; at most three failures among the rows that apply, D82; the live 8 in 5 runs in a row), the rehearsals and FV14. At 13:45, demo-path fixes go first (D106). One plain line per fix in the PR title. The teammate or a booked fluent Hindi speaker runs each full set on a separate device and rehearsal copy, independent of the presenter. You provide the resets, the timings and the results log (decision D49).

**8. `lane-c-card-reader` (Should #11) → 14:30.**
- **Gate, all four:** the lead confirms Must 1 to 9 pass by 13:00, or #11 is future scope (D56); T5 or T6 passed at about 10:15 (D7, D119); the build starts by **13:00**; `card_imports` is on `main`.
- When it starts: the user, the only Flagsmith seat, creates `image_extraction_provider` in the dashboard (flagsmith 7.4 step G; D9, D115): Production `off`, with an `internal_team` override set to the chosen reader. Its key is already in `lane-lead-contracts-2`. Recommended order among the Shoulds: #12 and #10 before #11 (doc-ai 5.2).
- Scope: doc-ai 5.3's files, the four routes (doc-ai 1.7), the sheet, the review form, the rules and their unit tests. The sheet opens from the paperclip's "Printed card" choice, on the setup screen only, while the setup render's `image_extraction_provider` isn't `off` (passed to the dock as a prop). "Couple photo" stays everywhere. A spoken request with no card gets voice 2.3's "can't do that by voice yet" reply (voice 7.3 I-03).
- Tests: AC-1 and AC-3 to AC-12 locally, and AC-2 through your tunnel, before the PR is ready. AC-1, AC-2 and AC-9 on production by 14:45 (AT-11.1 to AT-11.3).
- Done when: the PR is in the 14:30 batch with those checks passing, and I-03 counts in the test set again (D82). Otherwise the flag stays `off` and the README says Future or Partial.

**9. `lane-c-shagun-voice` (Should #13 by voice) → 14:30, gated (decision D65).**
- **Gate:** Lane A's Shagun backend (`lane-a-shagun`) is in the 13:45 batch. If it misses 13:45, #13 is future scope and SH-01 and SH-02 stay out of the test set (D82). Scope: SH-01 (`record_shagun`, owners only, the household named on the preview; a manager gets `not_shared`) and SH-02 (who still needs a thank-you, names as stored).
- Tests: AT-13.2, and AT-13.3's M-14 refusal. Done when: both rows pass on 3003 and the PR is in the 14:30 batch.

**10. `lane-c-invite-voice` (I-01, Must 7's voice half) → 13:45 (decision D121).**
- Scope: I-01 ("Make the invite maroon and gold. Use this photo."): the dock paperclip's "Couple photo" upload through A6's `/api/uploads/sign` and `add_asset` (12:30, typed), sent with the turn as `attached_asset_id` (voice 1.4); then `update_invite_style` with `photo_asset_id` `ASSET-NEW` (voice 7.2) through D's handler (11:40). Build on fixtures until A6 merges.
- Tests: AT-7.1's voice half. Done when: the PR is in the 13:45 batch. If it misses 13:45, the README marks AT-7.1's voice half Partial.

## 6. Traps and fallbacks

**Sarvam:**
- **Chat:** send `reasoning_effort` as `null` on `/v1` (`"none"` is v2 only); the one retry uses `"low"` with `max_tokens` 3000. One forced tool; read `tool_calls[0].function.arguments`, a JSON string. **No `["string","null"]` unions and no open objects** in the tool schema, only explicit optional fields. If T4 fails, use the `json_schema` strict variant (voice 1.10).
- **Speech to text:** `saaras:v4`, `codemix` and `language_code` `hi-IN` on every call. Keyterms go as one JSON-encoded field (50 terms, 64 characters each, v4 only). Upload the base type without `;codecs=`, refuse 0-byte blobs, record with no timeslice; Saaras stops at 30 s. Pick the chip from the transcript's script, never from `language_code`.
- **Text to speech:** always send `model` `bulbul:v4-flash` (omitting it routes to v3, which rejects v4 voices) and **always send `language_code`** (the docs disagree on whether it is required). Check the status and `audio/mpeg` before piping, because errors come back as JSON. Play the silent clip before any `await` (iOS).
- **Retries:** never retry 400, 401, 402, 403, 422 or `seat_budget_exhausted_error`. No new attempt after 30 s of route time. The account shares 60 requests a minute. Plain `fetch` for chat and Document AI; `sarvamai` 1.1.22 for speech.

**Flagsmith:**
- **A wrong or revoked key silently drops every event and stops tracking for that instance's life.** Only the self-check's events probe shows it. The right key from the wrong environment gives no error, only an `env_label` mismatch. A server key starts with `ser.`.
- **Flush both the exposure and the conversion inside `after()`.** Never call `close()` in a request.
- "Hide Sensitive Data" nulls `reason`, which the chip needs. A variation without a label is never counted.
- Never touch `setup_entry`'s weights or overrides, never end the experiment, never change `FLAGSMITH_ID_SALT`. `voice_writes_enabled` has no overrides and fails closed.
- A link prefetch to `/setup` leaks exposures. A static route freezes flags (FV12 needs ƒ). Cache per render (user plus wedding), never across requests. Development and Production share one database, so rows record `env_label`.

**Stack:** audio goes only to `/api/voice/turn` (2 MB, 30 s), never through a server action, and is never stored. Node runtime only. `/setup` has no poller and no focus refresh: the one exception to the 2.5 s planner poll (decision D79).

**Fallbacks you own** (architecture 8; flagsmith 9):

| # | If, by when | Then |
|---|---|---|
| 1 | Sarvam T0 fails or the balance is ₹0 (402), by 09:45 | `VOICE_FIXTURE_MODE=on` in your worktree only, labelled "Fixture, not Sarvam". Fixtures go off once live calls pass. Never in production |
| 2 | T4 fails at about 09:15 | The `json_schema` strict variant for the first call |
| 3 | No flags in the dashboard by 10:15 (F20) | Keep building on fallbacks. Tell the lead: the dashboard must be done by 10:30 |
| 4 | Two of five amount-bearing live turns fail, by 12:15 | Shorten the line, keep the editable number, record a good run (voice-test-set criterion 3) |
| 5 | The Production warehouse isn't Connected by 12:30 | The drawer's labelled app-side counts are the result. The lead decides |
| 6 | Median speech-end to card above 8 s | Cut live #1 and #5 and narrate them (voice 1.1) |
| 7 | Card reader not started by 13:00, not in the 14:30 batch, or AC-1, AC-2 and AC-9 failing on production at 14:45 | `image_extraction_provider` stays `off`; the README says Future or Partial |
| 8 | The live lines miss five passes in a row by 14:45 | Voice is Partial. Those beats are typed, plus the labelled rehearsal clip |
| 9 | On stage, Sarvam answers 402, a 5xx or times out | The typed path at once. Never fixtures |
| 10 | SDK 9.5.0 misbehaves at 11:30 (F14), or FV13 shows an exposure leak (F9) | Ask the lead for the 9.4.0 pin. For a leak, fix the gate, or move the exposure into a server action on mount |

## 7. Working routine

For each PR (architecture 6.2 and 6.4):
1. Merge `origin/main` into your branch, then run `npm run check`, `npm test` (plus `npm run test:db` if you have `*.db.test.ts` files, which CI never runs; D103), `npm run build` and your spec. Start your dev server first, in the background (`npm run dev -- --port 3003`), then run the spec with `E2E_BASE_URL` set to `http://localhost:3003`. It covers only what your open PR delivers, and signs in or signs up its own `@example.com` accounts through the login page with its own storage state. It never touches `e2e/.auth/` or the `e2e` copy; the lead's `playwright.config.ts` loads `.env.local` (D120). Global sign-in, reset and H16 rotation belong to the lead's demo-path project (D46, D54).
2. Push and open a draft PR titled "C: <what it delivers>". The body says what changed, how you tested it (laptop, phone, production), schema and env changes, and follow-ups.
3. When CI is green and the checks pass on fixtures or injected dependencies (D104), mark the PR ready and tell the lead, with the batch it is for.
4. Cut the next topic at once: from `origin/main`, or from the open branch when it depends on it. Merge commits only; the lead merges.
5. After every batch, merge `origin/main` again, as soon as the lead says the batch is in. Then rerun the real-data part of that batch's done-checks on copy `c` (or production where a topic says so). A failure there is the first item of your next batch; it doesn't hold the current one (D104).

Run at 09:00 or later, from `~/Desktop/Personal/jashn-c`. The first branch is `lane-c-voice` (D67). The second line runs once Lane A has pushed `lane-a-schema` (D96); the last line is a follow-up, run after that PR is open:

```bash
git fetch origin && git merge origin/main
git merge origin/lane-a-schema
npm run check && npm test && npm run build && E2E_BASE_URL=http://localhost:3003 npx playwright test e2e/lane-c.spec.ts
git push -u origin lane-c-voice
GH_TOKEN="$(gh auth token --user omiiii21)" gh pr create --repo omiiii21/Jashn --base main --head lane-c-voice --draft --title "C: voice dock with server-side flags and the voice write switch" --body "What changed. How it was tested. Schema and env changes. Follow-ups."
GH_TOKEN="$(gh auth token --user omiiii21)" gh pr checks lane-c-voice --repo omiiii21/Jashn
GH_TOKEN="$(gh auth token --user omiiii21)" gh pr ready lane-c-voice --repo omiiii21/Jashn
git switch --no-track -c lane-c-synthetic-run origin/main
```

- **Phones:** start a cloudflared quick tunnel to port 3003, set `APP_BASE_URL` to its URL, and sign in again on that origin (architecture 6.6). The microphone needs HTTPS.
- **Packages, config and env:** never install anything or edit root config. Ask the lead.
- **No AI tool names in git.** Branch names, commit messages, PR titles and PR bodies never name an AI tool, carry no `Co-Authored-By` trailer at all and never say "Generated with". The commit-msg hook strips such trailers and rejects any message containing "claude". So never name the agent-instructions files in a message; write "agent instructions". AI help is disclosed only in the README and on the submission form.
- **gh:** every gh command runs as `GH_TOKEN="$(gh auth token --user omiiii21)" gh ... --repo omiiii21/Jashn`. Never run `gh auth switch`.
- **Secrets:** never print, echo or commit a value from `.env.local`. That includes the Sarvam key, the Flagsmith keys and `INTERNAL_USER_EMAILS`, which holds personal data.

## 8. When to stop and ask the lead

Reach the lead with ListAgents, then SendMessage to the session working in `~/Desktop/Personal/Jashn`; if that fails, stop and ask the user to relay. Stop and ask when:
- you would edit a file outside part 2's paths, or need a contract change, a column, a package, an env var or a `next.config` change;
- a contract shape doesn't fit what a spec needs, or two binding specs disagree and the authority order doesn't settle it;
- a trigger in part 6 fires: say which one before you switch;
- you are about to run the synthetic run (you need the lead's go-ahead after F1), start topic 8 (the lead confirms Must 1 to 9 by 13:00), or start topic 9 (the Shagun backend is on `main`);
- you need a person in a browser (the Flagsmith or Sarvam dashboard, a phone test, a flag flip). The lead batches these for the user or the teammate; the user covers every teammate task;
- a key fails (401, 402 or 403), or a step would print, log or commit a secret;
- CI stays red after 10 minutes of fixing, or a merge conflict lands in a file you don't own;
- a test seems to need the demo or `e2e` copy. Use copy `c` instead (D120).
