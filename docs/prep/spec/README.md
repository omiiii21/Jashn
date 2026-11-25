# Specs: what each is for and what to read first

These seven specs are prep notes, written before 09:00 IST on Wed 25 Nov 2026. They hold no app code, and `docs/prep/decisions.md` (D1–D122) wins over all of them.

Section numbers are the specs' own headings. "architecture 7.2" means section 7.2 of `docs/prep/spec/architecture.md`, and "domain" means `domain-and-data.md`. Other bare note names, such as `PLAN.md`, are in `docs/prep/`; `AGENTS.md`, `DESIGN.md` and `PRODUCT.md` are at the repo root.

## What each spec is for

- **`architecture.md`**: how the app fits together. The stack and pinned versions (1), what runs where (2), data access and the one server guard (3), the folder tree and who owns each path (4), env var names (5) and delivery (6).
  Also the scaffold traps (7.1), the lead's 09:00 sequence (7.2), the AGENTS.md rules (7.3) and the fallback trigger times (8).
- **`domain-and-data.md`**: the data contract. Lane A builds it, and every lane uses its names. The glossary (1), the rules M, C, E, R, P, A, G, L, V and I (2), the commands (3) and the read models (4).
  Then the tables in schema `app` (5), access control (6) and the demo story walked through the commands (7).
- **`voice.md`**: the voice path Lane C builds. Push-to-talk, Saaras, the review card, confirm and Bulbul (1), the `propose_actions` tool (2), and how amounts, dates and times are read and spoken (3).
  Then answers (4), corrections (5), failures and fixture mode (6), the test matrix (7) and the judge panel (8).
- **`flagsmith.md`**: every Flagsmith name and how it behaves. Lane C builds it. Environments (1), identities and traits (2), the flags (3), segments and rollout (4), the `setup_entry` experiment (5) and the server SDK (6).
  Section 7 is the 09:00 setup with the checks FV1 to FV15, and section 8 is the sponsor story.
- **`export-and-recovery.md`**: the card export and NudgeBee recovery Lane D builds. The card (1), the job's states, timers and keys (2), rendering on Vercel with the 10:30 probe and the 12:15 gate (3), and the failure drill (4).
  Then the ops HTTP contract NudgeBee calls (5), the NudgeBee workflow and its fallbacks (6), and the V15 recording (7).
- **`doc-ai.md`**: Should #11, reading a printed invitation with Sarvam Document AI into a setup draft. Lane C builds it; Lane A adds the `card_imports` table.
  It is built only if T5 or T6 passes (5.1), L verifies Must 1 to 9 by 13:00 and the build starts by 13:00 (5.2). Otherwise #11 is future scope.
- **`acceptance.md`**: the definition of done, owned by L. Scenarios AT-1.1 to AT-13.3 (1), the two-device smoke test (2), the 3-minute demo checklist (3), the Playwright demo path (4) and demo reset (5).
  Section 6 sets the speed, device and accessibility targets. Section 7 says when each scope item counts as Working.

## Which note wins

1. `decisions.md` wins over every note, specs included.
2. Then the specs, then the research notes (build-kickoff, "How to use it"). `PLAN.md` and `build-kickoff.md` say who and when; for detail they defer to the spec section they name.
3. architecture is binding for the runtime layout, the folder tree and file ownership, env var names, delivery and the fallback triggers. Four specs win on their own names (architecture's opening):
   - domain-and-data: tables, columns, commands, read models, errors and payloads;
   - flagsmith: flags, traits, segments, events, metrics and identities;
   - doc-ai: the card-import routes and table;
   - export-and-recovery: the export routes, job states and timers, the ops JSON, the drill and the NudgeBee workflow.
4. voice.md (with flagsmith 3.2) wins on the rest of the voice path. acceptance is binding for "done", and its 8.1 records which version it tests where notes disagree.
5. `demo-data.md` wins on data values: names, amounts, dates and counts. domain wins on names and rules, and its activity templates beat demo-data's wording (D23).
6. architecture supersedes `research-stack.md` where they differ. `astra-plan.md` (D38) and `skills-toolkit.md` are superseded wherever they disagree.

## Reading order by session

Each lane reads its brief first (`docs/prep/lanes/lane-x.md`, copied into its worktree as `CLAUDE.local.md`), then `AGENTS.md` (architecture 7.3), then the sections below. Part 3 of the brief has the full list and the reasons.

- **L (the lead).** L works from `build-kickoff.md`, which names the section for each step.
  1. architecture 7.2, 4.2–4.3, 5, 6.3–6.5 and 8: the 09:00 sequence, ownership, contract files, env vars, CI, merge order, Vercel and the fallback triggers.
  2. For the contracts PR (09:35–09:55): domain 0.3, 3.0 and 4; flagsmith 2 to 5 and 6.7; voice 0.2; export-and-recovery 10.5. For `lane-lead-contracts-2` (about 10:30): doc-ai 1.7 and 5.3.
  3. For the morning tests: voice 1.16 and doc-ai 5.1. The user's Flagsmith dashboard steps are flagsmith 7.4.
  4. From the 10:45 batch on: acceptance 4 (the demo-path spec), 2 (smoke test), 3 (demo checklist), 5 (reset) and 7 (done).
- **Lane A** (data, roles and privacy).
  1. domain 0 to 7, all of it, plus open question 16 in section 8.
  2. The change lists on top of it: architecture 9, export-and-recovery 11, flagsmith 10.1, doc-ai 5.7, and voice 9 and 10.
  3. architecture 2.1, 2.3–2.4, 3.1–3.7, 4.1–4.3, 5, 6, 7.1 and 8; export-and-recovery 2.1, 2.4 and 10.3; flagsmith 5.4, 5.10, 6.2 and 6.8; doc-ai 1.8.
  4. acceptance 0.3–0.5, the "And (records)" lines of Must 3 to 9, 2.3, 4.3, 5 and 7. Then `demo-data.md` in full: it is the seed.
- **Lane B** (planning screens and the design system). First `DESIGN.md` and `PRODUCT.md`, which win over design-direction, then design-direction §0, §3–§9, §10.1–§10.4 and §11.
  1. acceptance 0.2, 0.4–0.5, Must 3, 5, 6 and 8, AT-1.2, AT-1.5, AT-2.12, AT-4.7 to AT-4.9, Should 10, 12 and 13, 2.3 and 6.4–6.6.
  2. domain 3.1, 3.5, 4.1–4.5, 4.7, 4.10, 4.11 and 6.1, with the rules M7, C7, C9, E6, P8, A3, A5 and G7.
  3. architecture 2.4, 4.1–4.3, 6, 7.1 and 7.3; voice 1.12, 1.13, 4.7 and 6.3; flagsmith 6.2 and 6.9; export-and-recovery 2.4 and 2.7.
- **Lane C** (voice, Flagsmith and the setup experiment).
  1. voice 0 to 1.17, then 2, 6, 7.1 and 9.
  2. flagsmith 3, 6 and 2, then 3.4, 5.2 to 5.11, 7.3, 7.6 and 7.7.
  3. architecture 2.1–2.4, 3.3, 4.1–4.3, 5.1 and 6; domain 2.9, 3.0, A3, 3.4, 3.8, 3.9 and 4.9, with architecture 9, flagsmith 10.1 and voice 10 on top.
  4. acceptance 0.2–0.5, Must 1, Must 2, AT-7.1, AT-9.6, AT-12.2, AT-12.3, 2, 4.3, 6.1, 6.3, 6.6 and 7. Read doc-ai in full only once its gate opens (doc-ai 5.2).
- **Lane D** (invitation, guest site, RSVP, card export and NudgeBee recovery).
  1. export-and-recovery in full: 0 to 5 closely, then 6 to 10.
  2. architecture 2.1–2.4, 3.4, 3.6–3.7, 4.1–4.3, 5.1, 6 and 8 (rows 2, 6, 7 and 8).
  3. domain 2.5, 2.7, 3.2, 3.4, 3.7, 4.6, 4.8, the export tables in 5.1, 6.3 and 6.4, with export-and-recovery 11 and architecture 9 on top.
  4. acceptance 0.2–0.5, AT-3.4 to AT-3.6, AT-4.1 to AT-4.6, AT-4.9, AT-7.1 to AT-7.6, AT-9.1 to AT-9.5, 2, 4.3, 6.6 and 7; flagsmith 3.6 and 3.7.

## Decisions sessions most often miss

The newest decisions moved owners and times. Check these before you build.

- **D41**: all four invite and export handlers are Lane D's, `publish_itinerary` included. Any note that gives it to Lane A is wrong.
- **D47**: the contracts voice gate refuses voice writes until Lane C's real gate merges at 10:45. It never answers "enabled".
- **D95**: the itinerary snapshot builder is Lane A's pure `src/db/itinerary-snapshot.ts`, shipped at 10:45. Lane D imports it and never writes a second one.
- **D96**: Lane A pushes `lane-a-schema` as a draft PR by 10:20. Lane C merges it to write `voice_turns`, and L merges A's PRs first at 10:45.
- **D97**: the contract stubs (`VoiceDock`, `PublishSheet`, `LiveRefresh`, the shell) carry their final props, and only L changes them. `PublishSheet` is Lane D's (D19).
- **D98**: commands go through one server action, `dispatchCommand` in `src/server/actions/dispatch.ts`. No lane writes its own command wrapper.
- **D101**: the after-commit map is a static export in Lane D's `src/server/jobs/after-commit.ts`, shipped empty. Nothing registers itself by an import side effect.
- **D102**: Lane A's 10:45 must-list is the schema, seed, sign-in, dispatcher, `dispatchCommand`, version poll and `wedding_profile`. Storage, the guest token resolver, the `JOBS_API_TOKEN` verifier, `reset_demo` and `update_event` land by 11:40, ahead of Lane D.
- **D103**: database tests are named `*.db.test.ts` and run only with `npm run test:db`; CI never touches a database. Run `npm test` before marking a PR ready.
- **D104**: done-checks come in two parts: fixtures before the PR is ready, real data after the batch deploys. A real-data failure leads the next batch; it doesn't hold this one.
- **D105**: the minimum Guests screen and Invite studio ship in the 12:30 batch, whatever #11's state. Polish waits for 13:45.
- **D106**: 13:45 takes demo-path fixes, then Must polish, then Should work. A Should PR merges only if L's post-12:30 demo-path run passed. 14:30 is the last batch, and the freeze is 14:45.
- **D107**: the 11:50 key signal runs on Lane D's own Invite page, on copy d in production: Diya moves the reception, Mira publishes through `PublishSheet`, the PNG downloads. Lane B's Events screen isn't needed.
- **D108**: guest rate limits are domain 6.3's: about 120 GETs and 30 POSTs a minute per token hash and 600 a minute per IP, in Lane A's one limiter. After a 429 the page backs off to 30 s (D90).
- **D120**: lanes test with their own @example.com accounts and rehearsal copies. A lane runs `reset_demo` only on its own copy; the demo and e2e copies stay L's.

## Retired names

Always use the new names: `JOBS_API_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`, `NUDGEBEE_EXPORT_WEBHOOK_URL`, job status `rendering`, `/render/card/[job_id]`, polling only (D37) and RLS on with zero policies. The old names are retired in four change lists:

- **architecture 9**: 18 changes domain-and-data needed, including env names, no Realtime, Storage keys, rate limits and flag names.
- **export-and-recovery 11**: 19 export changes, including the token and webhook names, `rendering`, the render page and the new columns.
- **flagsmith 10.1**: the flag renames (`voice_pilot`, `spoken_replies`, segment `voice_rollout`), the early kill-switch check and the Flagsmith env names.
- **doc-ai 5.7**: the card reader's changes: `card_imports`, the `{uuid}:{index}` key and no `invite_scan`.

domain-and-data applied all four lists at 05:05–05:20 (its section 9), so they now stand as a record. The old-to-new tables are domain 0.3, voice 0.3, flagsmith 0.2, export-and-recovery 0.2 and architecture 5.2. Part 3 of each lane brief adds a stale-names table of its own.
