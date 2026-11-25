# Lead decisions, 05:20 IST, 25 Nov 2026

The plan-pack writers found these contradictions between the notes. Each decision below settles one of them, and the files named are edited to match. Where a note still disagrees with this file, this file wins until the note is fixed.

## Repo and tools

- **D1. Claude-specific files stay out of git.**
  - CLAUDE.md, CLAUDE.local.md, `.claude/` and `.impeccable/` are gitignored.
  - AGENTS.md is the committed rules file. Each worktree's CLAUDE.md is a local copy that points to AGENTS.md.
  - Supersedes architecture 4.1 (CLAUDE.md as a committed lead file), architecture 7.2 steps 3 and 6–7, and skills-toolkit §3 ("commit CLAUDE.md").
- **D2. The typecheck Stop hook** lives in each worktree's gitignored `.claude/settings.local.json`. Supersedes skills-toolkit §7's `.claude/settings.json`.
- **D5. Vercel CLI.**
  - It runs as `npx vercel@66.6.0` and is already logged in as omiiii21 (checked 05:00).
  - The project is created by the dashboard import: the user, at about 09:32.
  - L adds the env vars with the CLI from an empty scratch folder (`~/jashn-vercel-cli`); the dashboard is the fallback.
  - Supersedes the "not installed" notes in architecture's header facts, 1.3 and trap 21 in 7.1.
- **D6. Playwright 1.65.1 is pinned in the scaffold install.** architecture 1.2 wins over skills-toolkit's unpinned install. Sessions never install packages.
- **D30. PRs open as drafts** (`gh pr create --draft …`) and are marked ready with `gh pr ready` when the checks pass. Architecture 6.2's example gains `--draft`.
- **D34. No Flagsmith code in the browser.**
  - The vercel:flags-sdk skill is not used. @flagsmith/nodejs 9.5.0 runs on the server only (flagsmith 6.1 and 6.9).
  - Supersedes skills-toolkit §3's lane 3 line.

## 09:00–10:45

- **D3. The impeccable direction round runs in the lead session, 09:10–09:27.**
  - The user picks the direction during it, which takes about 15 minutes. That pick is the approval.
  - PRODUCT.md and DESIGN.md merge in the contracts PR, and Lane B owns both afterwards.
  - Supersedes skills-toolkit §3–4 and design-direction §11, which had lane 2/B doing it at 09:00–09:30.
- **D4. Design tokens before the lanes start.**
  - Right after the design pick, L writes the token layer of `src/app/globals.css` into the contracts PR: colour, type and spacing tokens from DESIGN.md and design-direction.md.
  - This lets Lanes C and D style with real tokens from their first minute. Lane B owns `globals.css` from then on.
- **D7. Sarvam tests.**
  - L runs T0–T4 at about 09:14 from `~/sarvam-smoke` (created then). The key is read from `.env.local` and never printed, so the teammate needs no Sarvam key.
  - T5 and T6 (Document AI on the fictional Arora card) run at about 10:00–10:10, once the teammate or L has made the card image.
  - #11's latest build start stays 13:00.
  - Supersedes architecture 8 row 3 and doc-ai 5.1's 09:25 timing.
- **D8. NudgeBee checks.**
  - The teammate runs T1, T2 and T4 first (09:10–09:28), but only if the user has invited them to the NudgeBee account.
  - Otherwise the user runs them at about 10:05, and the kind decision moves from 09:30 to 10:20.
  - If the kind fallback is needed, L installs kind and the agent on the user's MacBook (architecture 8 row 6), and the user pastes the agent key at a hidden prompt.
  - Supersedes the teammate install in export-and-recovery 10.2.
- **D9. Flagsmith dashboard steps A–E** (flagsmith 7.4).
  - The user does them at 09:38–09:58. The hard limit is 10:30 (F20).
  - Flagsmith's free plan has one seat, so only the user can do them.
  - Supersedes flagsmith 7.3's 09:30–09:50 and PLAN's 10:00–10:25.
- **D10. Lane sessions start at about 09:58–10:05,** after the contracts PR merges. The user pastes the four start prompts (build-kickoff §5).
- **D11. The notes PR goes in right after step 0 (about 09:05).** It can't be 09:02, because the scheduled prompt fires at 09:03 and step 0 (the user's force-push) comes first.
- **D12. `/api/health`.**
  - It ships in the scaffold PR as a liveness check only: 200 with the commit SHA.
  - The contracts PR adds the `flags` summary from the stub.
  - `flags.ok` stays false until `lane-c-voice` merges at 10:45.
- **D13. NudgeBee's first authenticated status read** goes through a cloudflared tunnel by 11:30, and from production by about 11:50, after the 11:40 batch. Supersedes architecture 8 row 7's "production by 11:30".

## Build ownership and interfaces

- **D15. The REV-2 seed card.**
  - Lane D renders it from a Banyan Hall variant of the probe fixture at about 12:00.
  - Lane D commits it as `scripts/seed-assets/card-rev2.png`. This is a one-file exception to Lane A's ownership of `scripts/`, granted by the lead.
  - Lane A's seed uploads it when present. Until then, JOB-EXP-R2-PNG is seeded as Ready without a file, and rehearsals before 13:45 skip its download.
- **D16. The `export_job_status` read model** is implemented by Lane D in `src/server/jobs/`, because its computed fields (stalled, can_retry, card_summary) are job logic. Lane A's read-model index re-exports it.
- **D17. `reset_demo` has no UI control.** It runs through the command route only, driven by L (acceptance 8.2 question 2).
- **D18. The vendor page uses the query form** `/w/[wedding_id]/vendors?vendor_id=…`, because no `[vendor_id]` segment exists (architecture 4.1, AGENTS.md rule 15, voice.md §10).
- **D19. PublishSheet belongs to Lane D** (architecture 4.2–4.3). voice.md's mentions of "Lane B's publish sheet" are wrong.
- **D39. The setup-saved hook.** Lane A's dispatcher calls the no-op stub from the contracts PR from 10:45. Lane C replaces it with the real conversion in the 11:40 batch.

## Product, copy and data

- **D14. The couple photo** for the invitation (fictional Mira and Kabir).
  - L generates it with GPT-6.2-Sol through the codex wrapper between 10:00 and 11:00. That's after 09:00, because it is design work under rule 4.
  - It is labelled AI-generated in the README, and never cropped (acceptance 8.1 item 10).
  - Supersedes export-and-recovery 10.3 (which gave it to the teammate) and demo-data §11's "only cropped to fit".
- **D20. The mic sits in the header on every screen,** on desktop and phone (scope Should 10). design-direction 10.1's desktop speak bar at the foot of the content column is superseded.
- **D21. The sample badge reads "Fictional demo data" everywhere** (acceptance 0.2, AT-4.1 and demo-data).
- **D22. Names and amount words.** Hindi amount words never use colloquial forms such as डेढ़ लाख (domain M7, acceptance 8.1 item 18). The bride is Mira everywhere, never Meera.
- **D23. Activity templates in domain-and-data.md win over demo-data's paraphrases.** For example, the correction reads: "Mira corrected the advance to Annapoorna Caterers from ₹50,000 to ₹40,000."
- **D24. The reception's guest-visible description is "Dinner follows."** Guests never see vendor names (domain open question 16, acceptance 8.1 item 20, AT-9.1).
- **D25. No rehearsal Flagsmith environment exists.** Rehearsals and the recording use internal @example.com accounts on production (flagsmith 0.2, 1.2 and 10.4).
- **D26. Naming the two keys.** demo-data 13.2's "Idempotency key `export:<wedding-id>:rev3:png`" is really the `export_key`. NudgeBee's retry Idempotency-Key is `nb-{execution_id}-{job_id}` (export-and-recovery 2.3).
- **D27. The extra sample copies are accepted:** rehearsal copies a–d and the e2e copy, each with its own @example.com owner and manager. demo-data.md records them.
- **D35. Guest-link denials.** A guest link gets 401 on money, planner, export and voice routes, and 404 for an out-of-scope function through the RSVP route (acceptance Must 9, AT-9). Captions and answers that say 403 are wrong.
- **D36. Future scope wording is scope.md's list, word for word.** Extra ideas from brief.md (continuous voice, more languages, hall-level tracking) may appear only labelled "later ideas".
- **D37. Live updates are polling:** every 2.5 s on planner screens and every 10 s on the guest page, plus a refresh when a tab regains focus. Any "realtime" wording in demo-script or presentation is wrong.
- **D38. astra-plan.md is superseded** wherever it conflicts with scope.md, the specs, demo-data.md or demo-script.md (for example, Garden Hall as the original reception venue, or Bulbul v3). A note at its top says so.

## Tests, demo and submission

- **D28. The voice test-set pass rule is voice.md 7.3:** 36 of the 39 rows that apply. Guest-voice rows G-03 to G-07 don't apply, because guest voice isn't built. voice-test-set.md's 43-of-47 is superseded.
- **D29. Full voice test-set runs at 12:45 and 14:00** (PLAN), replacing acceptance 6.1's 12:15 and 14:45. The 14:45–15:15 slot holds the two stopwatch rehearsals.
- **D31. AI assistance is disclosed in the README and on the submission form,** as the hackathon rules require.
  - presentation.md §6 holds the canonical text, using the full names: Claude Code with Claude Opus 5.5; Claude Fable 5.2; and GPT-6.2-Sol and GPT-6.2-Astra (OpenAI) through the Codex CLI.
  - demo-script §4.3 points to it.
- **D32. Submission and video.** The submission target is 16:35, latest 16:45 (deadline 17:00). The video has two fallback triggers: 16:10 (cut the raw takes) and 16:20 (the final doesn't play signed out).
- **D33. The V15 NudgeBee recording happens at 13:00–13:30,** with a retake at 14:00–14:30 only if needed. Its caption reads "Recorded today, HH:MM", with the real time filled in at recording.
- **D40. The drill in live mode** (export-and-recovery 7.1 vs demo-data 13.2) stays a lead decision at 14:30. The default is the recorded NudgeBee beat, with the drill off in the live run, unless the live run completes in under 15 s in rehearsal.

## Round 2, 05:26 IST: from the Astra plan review and the Sol lane-brief review

Astra's verdict on the 05:13 plan: the demo path was unlikely to be verified on production by 13:45, and the biggest risk was the A-to-D handoff. Sol's verdict on the lane briefs was "hold" for all four, mostly for cross-lane timing gaps. Every decision below is accepted and binding. The source of each finding is in brackets.

### Cross-lane handoffs

- **D41. The handoff from A to D for 11:40** [Astra 1, Sol 3].
  - The four invite and export handlers belong to Lane D, in `src/server/invite/handlers.ts` (architecture 3.3 and 4.3): `update_invite_style`, `publish_itinerary`, `request_card_export` and `retry_card_export`. Any note that gives `publish_itinerary` to Lane A is wrong.
  - Lane A ships the Storage adapter and signing helpers in A2. That covers the exports-bucket write and signed download Lane D's worker uses, plus upload signing. The target is 10:45, and 11:40 at the latest.
  - Lane D owns the worker's upsert and size check through that adapter. The couple-photo upload route and `add_asset` stay in Lane A's later topic.
  - Lane A also ships the draft venue change (`update_event`) by 11:40, ahead of member-invite work.
  - At about 11:50, after the 11:40 deploy, Lane D publishes a real draft (Lotus Hall) on production and downloads the PNG from a real export job. This is the day's key signal.
  - The 12:30 batch carries Lane A's guest view and RSVP transaction, Lane D's guest page and routes, and Lane B's visible RSVP count. The 13:45 batch takes fixes to the demo path only.
- **D52. A stub for `export_job_status` so the re-export compiles** [Sol 1].
  - The contracts PR adds `src/server/jobs/status.ts`, owned by Lane D. Its stub returns the fixture export view.
  - Lane A's read-model index re-exports it from 09:50. Lane D replaces the body in `lane-d-export-jobs` in the 11:40 batch.
- **D53. The after-commit interface, and how the retry route kicks the worker** [Sol 2].
  - The contracts PR defines a typed post-commit registration interface that compiles with an empty handler map. Lane A's dispatcher calls whatever is registered, and Lane D registers the export kick once.
  - Ordinary command responses kick `/run` in `after()`.
  - The ops retry route is the exception. When its outcome is committed as `retried`, it starts `/run` with a fire-and-forget request before it begins its wait loop. Otherwise the wait would end before the worker had started. export-and-recovery 5.3 and architecture 2.3 must say so.
- **D57. The guest backend, by batch, and one rate limiter** [Sol 11].
  - Lane A: the token resolver and `LiveRefresh` in A2 (10:45); the guest DTO, the revision read and the RSVP and dietary handlers in A5 (12:30).
  - Lane D: the guest page and its routes (12:30).
  - Lane A owns the single rate limiter. Lane D calls it once per guest request and tests the 429s through its own routes.
- **D58. Bearer auth for the probe** [Sol 12]. The 10:30 probe uses a temporary token check inside Lane D's own path. Lane A2 exports the system verifier (JOBS_API_TOKEN) at 10:45. Lane D then switches `/run`, the GET and the retry to it, and deletes the temporary check.
- **D59. Publish and export by voice** [Sol 13].
  - Lane D's handlers and a reusable PublishSheet ship at 11:40. The sheet takes the reviewed `expected_draft_version` and a confirm callback.
  - Lane B passes the planner action and Lane C passes the voice confirm, with exactly one write on either path.
  - Lane C's I-02 (export by voice) and E-05 (publish by voice) integrations ship at 12:30. export-and-recovery 10.3 changes to match.
- **D60. A landing view after setup** [Sol 14].
  - B1 includes a minimal, member-guarded wedding landing view. It shows the saved name, date, city and budget through Lane A's services by 11:40, including after a sign-out and sign-in.
  - The full Overview dashboard stays in B5. AT-1.2 and AT-1.5 are checked with a fresh owner.
- **D61. The wash helper and the prefill store** [Sol 15].
  - Lane B's wash helper and the vendor highlight targets move into B2 (11:40).
  - Lane C exports a typed prefill store in `src/components/voice/` by 11:40, with one consumer contract for both the early refusal and the confirm-time 423. B3 consumes it for the requirement form.
- **D63. Export activity entries** [Sol 17].
  - Export-specific activity templates and their call sites live in Lane D's `src/server/jobs/` or `src/server/invite/`.
  - Lane A's append helper takes the finished entry, and both briefs name that interface. Lane D never edits `src/server/activity/`.
- **D64. Member management** [Sol 18].
  - Lane A6 adds the `remove_member` and `revoke_member_invite` handlers.
  - Lane B owns the owner's invite and sharing controls, and the one-time join URL display, in its planner subtree, through Lane A's server action. `/join/[token]` stays with Lane A (AT-8.1).
- **D65. Shagun** [Sol 19].
  - The shared backend deadline for Shagun is the 13:45 batch. B5 starts on fixtures by 13:30 and checks real reads after 13:45.
  - Lane C gets a gated 14:30 topic for SH-01 and SH-02 by voice.
  - If the backend misses 13:45, #13 is future scope.
- **D66. PDF, only if approved at 13:30** [Sol 20]. Lane A adds the `pdf` enum value and the bucket MIME type in an additive migration. Lane D implements the export for the 14:30 batch, with a one-page PDF render, download and its own `export_key` check (export-and-recovery 1.4).

### Lead, CI and tests

- **D42. CI must pass on the scaffold** [Astra 2].
  - CI and `npm test` run `vitest run --passWithNoTests`, and the scaffold adds one unit test, for the `/api/health` response.
  - L runs the CI test command locally before opening the PR. The 09:28 merge waits for green CI.
- **D44. The contracts PR is the minimum that compiles all four first branches** [Astra 4].
  - It contains the fixtures, fonts, the handler and component stubs, the D52 stub, the D53 interface and the D4 token layer.
  - The card-import contract and non-essential metadata move to `lane-lead-contracts-2` at about 10:30.
  - Worktree installs start the moment contracts merge, while the Vercel deploy finishes in parallel. Lane D's production probe waits for the deployed SHA.
- **D47. The voice gate fails closed until Lane C's real gate merges** [Astra 7]. The contracts stub for the voice gate refuses voice writes; it does not answer "enabled". Lane C's real gate arrives in `lane-c-voice` at 10:45. Then:
  - at 11:15, the user turns `voice_writes_enabled` off and Lane C checks the deployed behaviour;
  - after 12:30, the full kill-switch check runs: a pending voice write, one typed save and a read-only question. The flag is then restored and the result logged for the README.
- **D46 and D54. Staged checks and the Playwright set-up** [Astra 6, Sol 4].
  - On production:
    - at 10:45, sign-in and `/api/health`;
    - after 11:40, a persisted payment correction;
    - at 12:15, whichever voice, audio and renderer checks exist by then;
    - after the 12:30 deploy, L verifies the served SHA, rotates H16 and runs the connected demo-path spec on the `e2e` copy. It requires a refresh, a second session, exactly one RSVP and the guest-privacy check.
  - Playwright's global set-up (sign-in, reset, H16 rotation) belongs to the lead's demo-path project only, and it rotates H16 only from the 12:30 batch on.
  - Each lane's own spec sets `E2E_BASE_URL` to its port (3001–3004) and exercises what that lane's open PR delivers. Lane D's probe spec runs without seeded data or a login.
  - L records which steps passed before calling the path ready at 13:45.
- **D55. Lane C's staged done-checks** [Sol 5].
  - At 10:45, verify the preview, the gate, the refusal payload and the confirm envelope, with fixtures or an injected dispatcher.
  - After A3 (11:40), run the persisted M-03 and C-01 replay check. After the 12:30 integrations, run the full AT-2.7.
  - If the pipeline splits, `lane-c-voice-pipeline` is an explicit 11:40 dependency of the setup PR.
- **D67. First-branch examples** [Sol 21].
  - Every brief's first shell example uses its first branch: `lane-a-schema`, `lane-b-shell`, `lane-c-voice` or `lane-d-render-probe`. Later commands are labelled follow-ups.
  - Lane D fetches and merges the probe before cutting `lane-d-publish` from `origin/main`, or stacks it on the open probe branch.

### Fallbacks and the NudgeBee proof

- **D43 and D62. NudgeBee proof timeline** [Astra 3, Sol 16].
  - 11:15: Lane D and the account operator run an authenticated read against a real Jashn job through the tunnel.
  - About 11:50: the same read on production. Keep the first successful run id. Lane D owns URL, credential and response failures.
  - The 12:30 recovery PR is gated on tunnel or manual checks, and commits the workflow and object names.
  - NB-T10 to NB-T15 and P4 and P5 run after that deploy, and their run ids are appended in a follow-up.
  - By 12:45, the lead and the user choose the recording path:
    - if the webhook fails, start the workflow manually;
    - if only the retry is broken, record NudgeBee reading the failed job, then the user retrying in Jashn, then NudgeBee reading the completion, and label who retried.
  - 13:00–13:30 is protected for the V15 recording, which depends on one successful full drill.
- **D48. Fallbacks start early** [Astra 8, Sol 6].
  - The next/og renderer ships dormant in the 11:40 batch, with Chromium still selected, whatever the probe says. The switch is rehearsed locally, so at 12:15 the user can flip `card_renderer` without a deploy.
  - If the 10:40 probe fails, the og renderer becomes Lane D's top priority, and Lane D verifies a real PNG from it.
  - After a second Vercel deploy failure caused by the platform, L brings up the cloudflared tunnel at once and Lane D verifies its authenticated endpoint. Nobody waits for 15:00.
- **D56. The card-reader gate needs the Must screens in time** [Sol 7].
  - If #11 is still in play, the minimum Guests screen (AT-4.7, AT-4.8) and the minimum Invite studio (AT-7.1) move to the 12:30 batch, with polish in 13:45.
  - If L cannot verify Must 1–9 by 13:00, #11 is future scope.

### The user's morning, the voice runs, the video and submission

- **D45. The user's morning** [Astra 5].
  - Before 09:00: confirm the teammate's registration, the NudgeBee invite, account access and how check-in works.
  - 09:00: force-push, then the standing merge permission, then the notes PR, in that order. Check-in comes after, including finding the submission form's URL.
  - The design block (09:10–09:27) and the Flagsmith block (09:38–09:58) are protected.
  - At 09:27, missing credentials and the auth test come first. L does the Vercel readiness checks, and phone bookmarks wait.
  - PLAN's timeline shows the Sarvam tests (L), the NudgeBee checks (invited teammate at 09:10, or the user alone at 10:05) and L's kind decision.
- **D49. The voice runs don't compete with the recording** [Astra 9].
  - By 11:30, the user books two fluent Hindi speakers (one from outside the team), a separate device and a rehearsal copy.
  - The full runs start at 12:45 and 14:00 and run independently of the presenter. The teammate or a speaker runs them; Lane C provides resets, timings and the results log.
  - Bank one real Sarvam correction with audible playback as soon as one succeeds.
- **D50. Take 1 first** [Astra 10].
  - By 14:40, L has the sponsor clips assembled in the HyperFrames shell.
  - After the freeze smoke test, the user records the submission-safe take first, with one stopwatch rehearsal folded into it.
  - By 15:30, the user checks signed-out playback of all three sponsor beats before any further take.
- **D51. Repo and form checks early** [Astra 11].
  - At check-in, the user opens the actual submission form and notes its fields and video-link format.
  - The scaffold PR verifies that `.env.example` is tracked.
  - At 15:00, L tests the README setup from a fresh public clone: `npm ci`, build, and start against the existing project.
  - By 15:30, the signed-out README is checked: AI use, what existed before 09:00, sponsor evidence and the fallback video.
  - 16:20–16:35: final links, submission and receipt. 16:45 is the latest.

## Round 3, 05:27 IST: leftovers from applying rounds 1 and 2

### Times and owners, 09:00–11:00

- **D68. The Supabase Auth check uses a throwaway user that L creates through the Admin API.**
  - L creates auth-check@example.com with the server key (never printed) and deletes it afterwards. No one clicks in the Supabase dashboard.
  - Mira's, Diya's and every other seeded account is created by Lane A's seed. architecture 8's "the lead creates Mira's user in the dashboard" is superseded.
- **D69. L applies the GitHub ruleset at about 09:22 with gh api.**
  - The call names the repo in its path (repos/omiiii21/Jashn/...), which satisfies the "always name the repo" rule.
  - If it fails, skip it: the lead enforces the PR flow anyway. The user has no ruleset click.
- **D70. One set of times for contracts and lane start.** The contracts PR merges at about 09:50–09:55, the worktrees are cut right after, and the lanes start at about 09:58–10:05. Every note that times the lane start or worktree creation at exactly 09:50 follows this: flagsmith 6.10, 7.3 and 7.7, export-and-recovery 10.2 and 10.3, doc-ai 5.6, and the lane briefs' §1 and §4.
- **D71. Vercel times in flagsmith.md.** In flagsmith 6.10 and 7.3, the Vercel import is the user's at about 09:32, and L adds the Production env vars at about 09:35 (D5). Neither is at 09:28.
- **D72. NudgeBee account work belongs to whoever can sign in to the user's NudgeBee account:** the invited teammate, otherwise the user.
  - That covers the checks T1–T9, building the card-export-recovery workflow, the 11:15 tunnel dry run and the 12:15–13:00 objects.
  - If it's the user, the workflow build happens 10:05–11:00 during the keynote, following export-and-recovery 6.1–6.4 click by click.
- **D73. The fictional Arora card for T5/T6.**
  - If the teammate hasn't laid it out in Keynote or Slides by 09:50, L builds it as an HTML page outside the repo and renders it to JPEG with headless Chrome, in ~/sarvam-smoke at about 09:50–10:00.
  - It is a fictional printer proof, never made with an image generator.
- **D78. The 09:14 voice checks and the Bulbul audition.**
  - L runs V-T1, V-T2 and the Bulbul audition samples with T0–T4 at about 09:14 (voice.md 1.16).
  - The user (or the teammate) listens and picks the two voices by 10:30, which takes about 2 minutes. With no pick, voice.md's defaults stand.

### The submission afternoon

- **D74. One time for each submission check:**
  - 15:00: L tests setup from a fresh public clone.
  - 15:30: the user checks the signed-out README and video.
  - 16:00: L merges the final README.
  - 16:20–16:30: the teammate (otherwise the user) checks every link in a private window.
  - 16:35: submit. 16:45 is the latest.

### Product and spec answers

- **D75. D22 covers Jashn's own Hindi output.**
  - Speakers may still say colloquial forms such as डेढ़ लाख or sava lakh, and Jashn must understand them. The test set covers that input.
  - presentation.md Q3 may say so.
- **D79. /setup is the one exception to D37.** It runs no version poll and no focus refresh, so the experiment exposure isn't re-recorded and the draft isn't disturbed (flagsmith 5.3 and lane-c §6).
- **D82. The voice test-set pass rule, restated:** at most three of the rows that apply may fail.
  - That is 36 of 39 while #11 and #13 are unbuilt: 47 rows, minus G-03 to G-07 (no guest voice), minus SH-01, SH-02 and I-03.
  - If #11 or #13 ships, its rows apply again. This replaces D28's arithmetic.
- **D83. skills-toolkit's lane numbers map to letters:** lane 1 = A, 2 = B, 3 = C, 4 = D.
- **D88. Domain open question 20 is closed.** An unknown venue named in a voice create_event or update_event gets voice.md's "New venue" card.
- **D89. Domain open question 21 is closed.**
  - Spoken confirm phrases work for multi-action turns, as voice.md 1.8 says.
  - The model snapshot follows voice.md 1.9 (role-filtered). Member-written and guest-written text is data, never instructions (G9).
- **D90. The guest page backs off to 30 s after a 429** and keeps showing its content. architecture 2.4 records it.
- **D91. Seeded summaries follow the template.** The seeded PRP-01 and ACT-03 summaries gain the template's ", not yet paid" suffix (D23).
- **D92. Tara's page updates within 12 s:** one 10 s poll plus the refresh. No note promises "within 10 s".
- **D93. R-03's refusal line uses "sakte hain",** the respectful form, which fits any speaker, including Kabir or a judge. It replaces "sakti hain" in voice.md, flagsmith 3.2 and 10.3, and acceptance AT-2.7.
- **D94. Voice open question 20 is closed.** flagsmith 4.3's rollout gate counts every voice turn, not only speech turns.

### Mechanical fixes, no decision needed

- **D84.** build-kickoff.md cites decisions by their D numbers ("decision 2" becomes D1, "decision 4" becomes D3, and so on).
- **D85.** The lead's own PRs follow D30 too: draft, then gh pr ready, then merge. build-kickoff step 3 gains --draft and gh pr ready.
- **D86.** PLAN.md follows D3, D7 and D8 everywhere:
  - the design round runs 09:10–09:27;
  - L runs T0–T4 at 09:14, with no password-manager key;
  - NudgeBee checks run at 10:05 with the decision at 10:20 when the teammate isn't invited;
  - if the direction isn't approved by 09:45, both files are committed marked "Proposed" in the contracts PR, and the user approves one screen at the 10:45 batch.

## Round 4, 06:00 IST: from the round-2 checks (two lane simulations, the kickoff dry run and the Fable audit)

Every decision below is binding. Brackets name the finding: simAB and simCD are the lane simulations, kick is the kickoff dry run, audit is the Fable audit, and "needs-lead" items came from the round-2 editors.

### Ownership and contracts

- **D95. The snapshot builder is Lane A's pure module** [simAB blocker, simCD blocker].
  - `src/db/itinerary-snapshot.ts` [A] holds pure functions: build a published itinerary snapshot from the itinerary rows, and diff two snapshots (P2's fields). It imports nothing server-only, so `scripts/seed.ts` can use it.
  - Lane A ships it in A1 (10:45). The seed builds REV-1 and REV-2 with it. Lane D's `publish_itinerary` handler imports it; Lane D never writes a second builder.
  - The test "`unpublished_changes` empty at D0, one item at D2" moves from A1 to A4 (11:40), where the itinerary read model lands.
  - Files: architecture 4.1 (the `invite/` row drops "plus the snapshot builder"; `src/db/` gains it), domain 5.0 and 5.3, lane-a A1 and A4, lane-d topic 2.
- **D96. Lane C compiles before Lane A's 10:45 merge** [simCD blocker].
  - The contracts PR adds the session helper's final signature as a stub: `src/server/auth/session.ts` [A], returning the fixture member with the actor fields domain §1 and flagsmith 4 need. Lane A replaces the body in `lane-a-dispatcher`.
  - Lane A pushes `lane-a-schema` (`src/db/schema.ts` and the first migration) as a draft PR by 10:20. Lane C merges `origin/lane-a-schema` into `lane-c-voice` (merge commits only, architecture 6.3) and writes `voice_turns` through it. Before 10:20, C builds the pipeline on fixtures.
  - L merges Lane A's PRs first in the 10:45 batch, so C's PR then shows only C's own diff.
  - If `lane-a-schema` isn't pushed by 10:25, C's 10:45 PR keeps `voice_turns` writes behind its own small store interface with an in-memory fake, and the real write moves to 11:40.
- **D97. Component stubs carry their final props** [simCD 18]. In the contracts PR every component stub declares its final props, and its owner keeps them unchanged:
  - `VoiceDock`: `wedding_id` (null on `/setup`) and the props voice.md names.
  - `PublishSheet`: `wedding_id`, the `unpublished_changes` list, `expected_draft_version` and an `on_confirm` callback (D59).
  - `LiveRefresh` and the shell layout: the props architecture 4.3 names.
  - Changing a stub's props is a contracts change, made by L.
- **D98. One server action for commands** [simAB 4].
  - `src/server/actions/dispatch.ts` [A] is a `'use server'` module exporting `dispatchCommand`. It takes the domain §3.0 command envelope and returns the §3.0 response envelope.
  - The contracts PR ships it backed by the fixture services; Lane A replaces the body at 10:45.
  - Client components never import `src/server/` (architecture 2), so server components pass `dispatchCommand` to client forms as a prop.
  - Lanes never write their own command wrappers. Sign-in, sign-up and sign-out stay Lane A's own actions; the flag drawer's actions stay in Lane C's `flags/`. AGENTS.md (architecture 7.3) repeats the rule.
- **D99. The read models the screens need** [simAB 1, 2, 3, 12; simCD 31; lanes-ab needs-lead].
  - `wedding_profile` (new, domain §4): wedding_id, display name, dates, city, budget, `is_sample`, and the current member's role and display name. Its type and fixture are in the D44 minimum contracts PR. Lane A makes it real at 10:45. It feeds D60's landing view and B1's shell.
  - `itinerary` gains `venues[]` (id, name, capacity) and, on each function, `requirements[]` (id, label, status; empty until #12 ships). The type is in the contracts PR; Lane A delivers it in A4 (11:40).
  - `team` (new): members with role, pending invites, sharing flags. Each household in `rsvp_guest_list` gains `link_status` (none, active, revoked) and `last_rotated_at`. Types and fixtures go in `lane-lead-contracts-2` (about 10:30). Lane A delivers the link fields in A5 and `team` in A6 (both 12:30).
  - Each due item in `money_summary` gains `days_until_due` (an integer in IST, null when there's no due date), computed by Lane A.
  - Every read-model row carries `seed_key` (null for live rows), so voice.md 1.9's snapshot can name records.
- **D100. Seeded ids** [simAB 14]. UUIDv5 under the namespace `75e13aff-00d4-427e-8e6b-7bd1798f1316`, with names of the form `<table>:<seed_key>` (for example `household:H16`). The helper `src/db/ids.ts` [A] ships in the contracts PR; the fixtures and the seed both use it. Domain 0.1 records this.
- **D101. Where D53's after-commit interface lives** [arch-export needs-lead].
  - The types (`AfterCommitHandler` and the map type) are in `src/contracts/services.ts`.
  - The map is a static export in `src/server/jobs/after-commit.ts` [D], which the contracts PR ships empty. Lane A's dispatcher imports it statically and runs the committed command's entry in `after()`. Lane D adds the export kick there at 11:40. Nothing registers itself by an import side effect.
- **D102. Lane A's first two batches, re-cut** [simAB 7].
  - 10:45 (must): the schema and first migration (pushed by 10:20, D96), the seed for every copy with D95's snapshots, sign-in, the dispatcher with the guard and the receipt re-check, the real `dispatchCommand`, the version poll and `LiveRefresh`, and `wedding_profile`.
  - 11:40 at the latest, merged ahead of Lane D in the batch: the Storage adapter and signing helpers (D41), the guest token resolver (D57), the `JOBS_API_TOKEN` system verifier (D58, so D's temporary probe check lives until then), `reset_demo`, and A4 (`update_event` and the itinerary read model).
  - The 11:40 items' signatures are typed in the contracts PR (`src/contracts/services.ts`), so Lane D builds against them from 10:00. Lane A may still ship any of them at 10:45.
- **D103. Database tests and CI** [simAB 5, simCD 20].
  - Tests that need the database are named `*.db.test.ts`. The scaffold's `vitest.config.ts` excludes them unless `RUN_DB_TESTS=1`, and loads `.env.local` with `@next/env`'s `loadEnvConfig`. `package.json` gets `"test:db": "RUN_DB_TESTS=1 vitest run"`.
  - CI keeps `npm test` and never touches a database. Every lane runs `npm test`, and `npm run test:db` if it has database tests, before marking a PR ready. lane-c and lane-d's routines gain `npm test`.
- **D104. Done-checks come in two parts** [simAB 6, simCD 19].
  - Before the PR is marked ready, the check passes on fixture services or injected dependencies, on the lane's own copy.
  - After the batch deploys, the lane merges `origin/main` and reruns the real-data part on its own rehearsal copy, or on production where its brief says so. A failure there becomes the first item of the next batch; it doesn't hold the current one.
  - L never holds a batch for a real-data check, except D46's demo-path checks.
  - Examples: Lane D's REV-3 at about 11:50 on production (D41, D107) and Tara's double tap after the 12:30 deploy; Lane C's AT-2.4 RSVP half after 12:30. A5 checks `submit_rsvp` idempotency with a `*.db.test.ts` on copy a.

### Batches and screens

- **D105. The Must screens' minimums ship at 12:30, unconditionally** [lanes-cd, pack and domain-acceptance needs-lead; replaces D56's "if #11 is still in play"].
  - The minimum Guests screen (AT-4.7, AT-4.8) and the minimum Invite studio (AT-7.1's typed path: the style, and the couple photo through A6's upload) ship in the 12:30 batch whether or not #11 is in play. Polish goes in 13:45.
  - Lane D's Invite page already exists from `lane-d-publish` at 11:40, where it mounts PublishSheet for the 11:50 check (D107); the studio minimum extends that page.
  - D56's "if L cannot verify Must 1–9 by 13:00, #11 is future scope" still stands.
- **D106. What the 13:45 batch takes** [lanes-cd, pack and arch-export needs-lead; replaces D41's last sentence].
  - Inside the batch: demo-path fixes first (any lane), then Must polish, then Should work that passed its gate.
  - A Should PR merges at 13:45 only if L's post-12:30 demo-path run (D46) passed and the PR's own checks are green. Otherwise it moves to 14:30 or becomes future scope. This covers Lane A's and Lane B's Should topics (Overview, Shagun with D65's deadline, the seeded card), `lane-c-judge-panel` and the Invite studio polish.
  - 14:30 is the last batch: the Should voice items (SH-01, SH-02, D65), PDF if approved (D66), and fixes. Freeze at 14:45.
- **D107. The 11:50 key signal runs on Lane D's own pages** [audit 48; arch-export needs-lead on the photo].
  - On production, on copy d: Diya's `update_event` (reception to Lotus Hall) goes through `POST /api/w/[wedding_id]/commands/update_event`; Mira publishes through PublishSheet on Lane D's own Invite page (in `lane-d-publish`); then the export job's PNG downloads. Lane B's Events screen isn't needed (B3 is 12:30). export-and-recovery 10.3's Lane B row moves to the 12:30 batch.
  - The couple photo: L commits the Sol photo as `scripts/seed-assets/couple-photo.jpg` by 11:00, in a lead PR merged first in the 11:40 batch. The seed's photo step is idempotent: it uploads the file and upserts the asset row by seed_key, and touches nothing else. L runs it for every copy right after the 11:40 deploy. From then on it's part of D0, so `reset_demo` keeps it.
  - The card template renders with and without a photo, so the 11:50 card passes either way.
- **D108. Guest rate limits** [needs-lead from three editors; simAB 10, audit 53].
  - Domain 6.3's numbers win: per token hash about 120 GETs and 30 POSTs a minute, and a loose 600 a minute per IP so a shared venue Wi-Fi isn't blocked. After a 429 the page backs off to 30 s (D90).
  - Lane A's one limiter owns them (D57). architecture 2.4 and §9 item 15, acceptance AT-4.6, AT-9.4 and 8.2 question 11 (now closed), lane-a A5 and lane-d all say this.
- **D109. Team and sharing** [lanes-ab and pack needs-lead; D64].
  - An owners-only sheet opened from the shell's wedding menu, with no new route segment (architecture 4.1). It's Lane B's B4 sheet at 13:45, after A6 (12:30), reading D99's `team` and link fields.
  - Must 8's demo doesn't depend on it: the seed creates Diya's membership (D68), and AT-8.1's `/join/[token]` stays Lane A's.
- **D110. "Lane B's visible RSVP count" (D41)** is the Guests reply table's totals and the vendor page's estimate headcount (230 × ₹800), both read from `rsvp_totals`, at 12:30. Lane B's 12:30 load is B3 (Events with the PublishSheet mount) plus the minimum Guests screen.

### Checks, the user's morning and the video

- **D111. The smoke test first runs after the 12:30 deploy** [domain-acceptance needs-lead; audit 47].
  - The two-device smoke test and the first end-to-end run happen at about 12:35–12:55. At 12:15 only the renderer gate, the capture and Bulbul-audio test and D46's staged checks run.
  - The 12:45 voice test-set run keeps D49's people (booked speakers on a separate device), so it can overlap the smoke test.
  - PLAN §2, §3 and §7, demo-script §5 and morning-checklist follow acceptance §2.
- **D112. V-T3 and V-T4 belong to Lane C** [area-notes needs-lead; simCD 23].
  - V-T4: through the turn route's `text` input as soon as it answers (about 10:25), 3 runs of the live 8, before `lane-c-voice` is marked ready.
  - V-T3: both phones through C's tunnel before 10:40 if the route records by then; otherwise by 11:30 at the latest, with the WAV fallback off until then.
  - voice.md 1.16, lane-c §1 and topic 5 say the same.
- **D113. Flagsmith checks are renamed FV1–FV15** [audit 59].
  - In flagsmith 7.3, 7.5 and 7.6, and wherever PLAN, build-kickoff, morning-checklist, lane-c, acceptance or another note cites one.
  - Video shots keep V01–V16. "V15" on its own (the V15 recording, take or clip) always means the NudgeBee video shot, so never rename it.
- **D114. The kill-switch proof's typed save** [area-notes needs-lead]. If the requirement form isn't merged by the post-12:30 check, the typed save is an Events edit, such as a dress code. That counts as D47's README proof.
- **D115. `image_extraction_provider`** [area-notes needs-lead]. Its key moves to `lane-lead-contracts-2` (about 10:30) with `card-import.ts` (D44). Its Production default is set by the user, the only Flagsmith seat (D9), not "the lead" (flagsmith 3.8).
- **D116. Turning off "Confirm email"** [pack needs-lead; D68].
  - If `SUPABASE_ACCESS_TOKEN` is in `.env.local`, L turns it off through the Management API (`PATCH /v1/projects/{ref}/config/auth` with `mailer_autoconfirm: true`), and nobody clicks.
  - Otherwise it stays the user's one dashboard click, at home or in the 09:27 block. `check-keys.py` and step 12's sign-up test verify it either way.
  - L creates the auth-check user through the Admin API (D68). Nobody adds users in the dashboard.
- **D117. `JOBS_API_TOKEN` in NudgeBee** [arch-export needs-lead]. The user pastes it into the NudgeBee Secret `jashn_ops_token` by 11:10, before the 11:15 tunnel read, from their password manager or by copying it from `.env.local` in an editor. That holds whoever operates the rest of NudgeBee. Nobody sends it through chat, Notion or a terminal.
- **D118. `SEED_PASSWORD` is a passphrase the user chooses** [audit 49].
  - The teammate types it on a phone as Diya, so it can't be a 44-character random string. The user saves it in their password manager and types it into `.env.local` at 09:27, with `INTERNAL_USER_EMAILS`.
  - Step 10 generates only `RENDER_TOKEN_SECRET` and `FLAGSMITH_ID_SALT`. If `SEED_PASSWORD` is still unset at 09:50, L generates one and the user copies it into the password manager.
- **D119. Kickoff fixes from the dry run, accepted as written** [kick 32–46].
  - Step 15 skips `NEXT_PUBLIC_FLAGSMITH_ENVIRONMENT_ID`: the user sets the Production client-side key at step 14, and `.env.local` holds the Development one. flagsmith 7.3's ~09:35 row matches. One owner: the user.
  - Step 8 (shadcn) starts only after step 5's install passes its `npm ls` check. If the install is still running at 09:15, do step 6's config files first.
  - The kind fallback: L runs Docker, `kind create cluster` and the download; the user runs `read -s` and the installation line in a plain Terminal tab, as in step 0; L runs the kubectl checks. export-and-recovery 6.8 says the same.
  - Step 2's done-check accepts the two modified tracked notes (astra-plan.md, skills-toolkit.md) and requires nothing outside `docs/prep`.
  - Ignore checks test a path inside the folder, `.impeccable/x` (step 4 and architecture 7.2 step 3).
  - The Vercel CLI uses the documented form `env add <NAME> --environment production --sensitive --yes`, with the value on stdin.
  - Vercel deadlines: no Ready production deploy by 09:50 means L tells Lane D the probe waits and the user retries the import at 10:05. None by 10:40 means the og renderer becomes D's top priority (D48) and L brings up the tunnel host (architecture 8 row 10).
  - 09:10–09:27: L keeps its turns short, answers the user's design messages first, and runs steps 7–11 in between with long commands in the background.
  - Step 20's card fallback moves to 10:00–10:05 (after step 18) and T5 to about 10:05–10:15. D73 and architecture 8 row 11 follow.
  - Step 2 opens by telling the user what's still open (step 0, step 1, check-in after the notes PR, design at 09:10, credentials at 09:27). Step 0 counts as done when the user says so or `git fetch origin` shows origin/main at 2bea221.
  - Step 18 writes `jashn-a/.claude/settings.local.json` before copying it to B–D, and copies `.impeccable` only if it exists.
  - Step 10 appends an empty line first, then counts each name with an anchored grep (each must be 1), restoring from `.env.backup.local` on a 0.
  - architecture 6.3 uses `$HOME/jashn-ruleset.json`, as the kickoff does.
  - Step 14's done-check confirms Node 24.x, with `vercel project inspect` or by the user on the Settings page at 09:32.
  - The user's 10:00–10:45: unfinished Flagsmith A–E comes first (hard limit 10:30), then NudgeBee T1, T2 and T4 (the kind decision moves with them). The voice pick and the photo approval are 2-minute breaks at about 10:25 and 10:40.
- **D120. Lane test data and resets** [simCD 25, 26, 27, 30; simAB 8, 15].
  - A lane's spec starts its own dev server first (`npm run dev -- --port 300N`, in the background). It signs in or signs up its own @example.com accounts through the login page with its own storage state, and never touches `e2e/.auth/` or the e2e copy. The lead's `playwright.config.ts` loads `.env.local`.
  - Fresh internal owners sign up as `setup-<lane>-<HHMM>@example.com`. AT-1.7's non-internal tester is `nonint-c-<HHMM>@example.net`, on local dev only, never on production.
  - A lane may run `reset_demo` on its own rehearsal copy only, as that copy's owner (`checkpoint` d0, `confirm_text` RESET). The demo and e2e copies stay L's (D17).
  - If copies c and d aren't seeded by 10:45, Lanes C and D read the e2e copy (GETs only) and use fixtures for writes until 11:40.
  - A5's checks run on copy a, not the e2e copy.
- **D121. Smaller answers** [simAB 11, 13; simCD 21, 22, 24, 28, 29; audit 50–61].
  - Highlights: `routes.ts` exports a `highlight` query parameter (comma-separated field keys). Lane C appends it to `navigate.path`; Lane B's pages read it and apply the highlight once.
  - B1's placeholder pages exclude Invite. The contracts PR ships the Invite placeholder under Lane D's path, and B's nav links to `routes.invite`.
  - I-01 by voice ("Make the invite maroon and gold. Use this photo.") is Lane C's 13:45 item, after A6 (12:30: `/api/uploads/sign`, `add_asset`) and D's `update_invite_style` (11:40). It includes the dock paperclip's "Couple photo" upload. If it misses 13:45, AT-7.1's voice half is marked Partial in the README.
  - FV13 on local dev checks that the entry-decision log line (row and arm) appears only on a real `/setup` render, plus a unit test that injects an in-experiment evaluation and asserts one exposure per render. The real exposure is FV14 (b) on production.
  - The prefill is always a list of `{command, input, labels}`, one entry per action, for both the early refusal and the 423's `error.prefill`. The dispatcher returns its single action's entry; `/api/voice/confirm` rebuilds the full list from the stored turn before answering 423. Domain 3.8's example changes.
  - Reply-audio isn't rate-limited on its own: each turn's audio parts are capped by its stored speech parts. V10 drops the reply-audio sentence.
  - If Lane C's pipeline splits, FV7 stage 1 moves to right after the 11:40 deploy, and the user flips `voice_writes_enabled` then.
  - NB-T10's webhook fallback triggers at 12:50 (after the 12:30 deploy), with filter debugging until 13:00 only.
  - PLAN's Lane B rows: `lane-b-guests` at 12:30 (the minimum Guests screen), `lane-b-guests-links` at 13:45.
  - D65's "B5" means lane-b's B6 (Shagun). B6 starts on fixtures by 13:30 alongside B5 (Overview) and checks real reads after 13:45.
  - flagsmith 3.1's reason chip sits beside the header mic, on desktop and phone (D20). No note mentions a bottom speak bar.
  - acceptance §7's Future row uses scope.md's list word for word. "Continuous voice, more languages, hall-level tracking" go under "Later ideas (not in scope, D36)".
  - morning-checklist's "Later today" gains the user's Flagsmith steps: F2 at about 12:00 (12:45 latest); rollout steps 1–3 at 12:30, 13:45 and 14:30 when L says the gate holds; the kill-switch check after 12:30; the 14:30 experiment screenshots. It calls build-kickoff "the runbook to 10:45".
  - export-and-recovery 10.2 says "User" for the human presenter (11:10 sponsor questions, the V15 recording, the email approval) and "L" for the lead session.
  - The contracts writing window is 09:35–09:55 everywhere (architecture 7.2 step 10, flagsmith 3.0 and 7.3, export 10.2, doc-ai).
  - The vendor-page screenshot needs the user only when the direction is "Proposed" (D86), at the 10:45 batch. Otherwise L checks it against design-direction.
  - D50 replaces D29's rehearsal timing: after the freeze smoke test, take 1 is recorded at once and doubles as the first stopwatch rehearsal. Any second run is take 2, after the 15:30 playback check.
  - The HyperFrames shell is L's (D50), possibly run in a spare session; it isn't Lane B's.
- **D122. Numbering.** D76, D77, D80, D81 and D87 were never issued. Notes that cite "D1–D94" now say "D1–D122".

## Round 5, 06:50 IST: leftovers from applying round 4

- **D123. Seeded ids include the copy** (corrects D100's name form).
  - Names have the form `<copy>:<table>:<seed_key>`, where `<copy>` is the sample copy's key (`demo`, `e2e`, `a`, `b`, `c`, `d`) and `<table>` is the table name as domain 5.1 writes it. For example `demo:households:H16`. The namespace stays D100's.
  - So each copy gets its own ids, and AT-9.7's cross-copy 404 holds. `src/db/ids.ts` takes the copy as its first argument.
- **D124. The order from 12:40 to 13:40** [pack needs-lead: the NudgeBee operator was double-booked].
  - 12:40–12:52: the two-device smoke test (U and T), once L has confirmed the 12:30 deploy's SHA.
  - 12:52–13:08: NB-T10 to NB-T15 (Lane D with the NudgeBee operator; the user flips `export_failure_drill`). NB-T10's manual-trigger fallback starts at 13:00 (replaces D121's 12:50), and filter debugging stops at 13:08.
  - By 13:08, L and the user choose the recording path (D43 and D62's choice, moved from 12:45).
  - 13:10–13:40: the V15 recording, protected, after one successful full drill (replaces D33's 13:00–13:30).
  - The 12:45 voice test-set run (booked speakers with Lane C, D49) runs alongside.
- **D125. If I-01 isn't Working** [pack and voice-design needs-lead].
  - The demo-script beat at 0:07–0:32 (shot V02) shows AT-7.1's typed path instead: Mira picks maroon and gold and attaches the photo in the Invite studio. The narration drops "one more line".
  - In the voice test set, I-01 applies only once it ships: it's out of the 12:45 run, in the 14:00 run if it merged at 13:45, and out for good if it missed 13:45 (AT-7.1's voice half is then Partial in the README). D82's bar stays "at most three applicable rows fail".
- **D126. The couple photo's asset row exists from 10:45** (amends D107) [domain-acceptance needs-lead].
  - The 10:45 seed inserts the photo's asset row by seed_key, with its storage path and no file yet, as D15 does for the REV-2 card. `invite_styles.photo_asset_id` and the REV-1 and REV-2 snapshots reference it from the start.
  - The photo step after the 11:40 deploy uploads the file to that path and fills the row's file fields, and touches nothing else.
  - Until the file exists, the card, the guest page and the studio render the no-photo layout.
- **D127. Corrections to D99's read models.**
  - `requirements[]` carries id and label only. Domain 5.1's requirements table has no status.
  - `venues[]` carries id, name, `place_name` and capacity, so voice.md 1.9's snapshot and live #4's card ("Lotus Hall (Mallige Gardens, seats 300)") work for venues no function uses yet.
  - `seed_key` is on member read models only. The guest view (domain 4.6, the G3 allowlist that AT-9.1 checks) and the ops view (4.8) don't carry it.
- **D128. Presence isn't built.** design-direction 10.1's presence marks ("who is here now", "Neha is in Events") come out of the wireframes. The activity line ("Diya changed …, 2 min ago") is what shows other people's changes (D37).
- **D129. Branch names.**
  - Adopted from the round-4 editors: `lane-a-access` (A2's 11:40 part: the Storage adapter, the guest token resolver, the `JOBS_API_TOKEN` verifier and `reset_demo`), `lane-d-invite-minimum` (12:30), `lane-c-invite-voice` (I-01, 13:45) and `lane-d-invite-studio` (13:45 polish). PLAN §3 names them.
  - D106's 14:30 batch also takes `lane-c-card-reader` (#11), as lane-c topic 8, PLAN, doc-ai and acceptance already say.
- **D130. Mechanical leftovers, no decision needed.**
  - Lane briefs say "the team rules (architecture 7.3)" without a count.
  - doc-ai 5.7, architecture 9's intro, export-and-recovery 0.2 and lane-a's part 3 say domain-and-data applied those changes at 05:05–05:20; none says they're still open.
  - voice.md's header times T5 and T6 at about 10:05–10:15 (D119).
  - demo-data's header: it wins on data values. Domain wins on names and rules, and domain's activity templates beat demo-data's paraphrases (D23).
  - architecture's opening says which decisions it follows, as the other specs do.
  - demo-script uses "U" (or "the presenter") for the human and "L" for the lead session, as D121 does for export 10.2.
  - build-kickoff step 15 lists with `env ls --environment production`, keeping one fallback sentence.
  - morning-checklist gains the user's kind-fallback step: only if L says NudgeBee needs the local cluster, paste the agent key at the hidden prompt in a plain Terminal tab and run the install line L gives (export-and-recovery 6.8).
  - The synthetic run's go-ahead: the user tells L once F1 is launched, and L tells Lane C (build-kickoff step 22, flagsmith 7.3 and 7.4).
  - The public repo never names the user's other GitHub account. Notes say "another gh account is active" instead.
  - Notes that cite "D1–D122" now say "D1–D130".

## Round 6, 12:35 IST: the late start, and a fifth lane

The laptop was offline from about 07:15 to 11:30, so the kickoff ran at 11:32 instead of 09:03. Where any note gives a clock time, these decisions win.

- **D131. The compressed day.**
  - **Kickoff:** notes merged at 12:04 and the scaffold at 12:21. The contracts merge at about 12:55; the worktrees are ready and the four sessions start at about 13:05. The design round is skipped: `DESIGN.md` as written is the direction, and Lane E approves or adjusts it by 13:45 (D132). Until then, lanes build on "Proposed" (D86).
  - **Scope:** Must 1–9 only. Should 10–13 are future scope. A lane that is ahead may take #10 (overview) or #12 (requirements, light), but only after L confirms that lane's Musts on production. #11 (the card reader) and #13 (shagun) are out. This is the default the user was offered; the user may still override it.
  - **Batches.** Merge order stays A → B → C → D, then E.

    | Old | New | Takes |
    |---|---|---|
    | 10:45 | **14:00** | The first branches, with the same content as the old 10:45 batch: A's must-list (D102), B's shell and vendor page on fixtures, C's flags core and VoiceDock, D's render probe |
    | 11:40 and 12:30 | **14:45** | Both old batches in one: A's access items, `update_event`, the guest view and RSVP; B's Guests, Events and money correction; C's setup and the voice integrations; D's publish, export jobs, guest page and routes, and the minimum Guests and Invite studio (D105) |
    | 13:45 | **15:20** | Demo-path fixes first, then Must polish, then the NudgeBee recovery pull request if it missed 14:45 |
    | 14:30 | none | Dropped; no Should batch |
    | Freeze at 14:45 | **Freeze at 15:35** | — |

  - **Sponsor steps, old → new:**
    - Flagsmith dashboard (build-kickoff step 17): 09:38 → 13:10–13:40, with a hard limit of 13:50 (was 10:30).
    - The user's first kill-switch flip (D47): 11:15 → about 14:15. The full kill-switch proof moves to after the 14:45 deploy.
    - NudgeBee: the user builds the workflow from 13:30 to 14:40 (was 10:05–11:00). The authenticated read through the tunnel moves to about 14:15, and the read on production to about 14:55. NB-T10 to NB-T15 run 14:55–15:10, the recording path is chosen at 15:10, and V15 is recorded 15:10–15:25 (D124's order).
    - Smoke test: 14:50–15:00, after the 14:45 deploy (D111). One voice test run of the live 8 lines follows it at about 15:00, with the booked speakers (D49).
    - Couple photo (D107): L has it generated at about 13:15; the user approves it by 13:45; it ships in a lead pull request in the 14:45 batch, and the seed's photo step runs after that deploy.
  - **Video and submission:**

    | Time | Step |
    |---|---|
    | 14:15 | Capture test |
    | by 15:25 | Sponsor clips |
    | 15:30 | Shell ready (Lane E) |
    | 15:35 | Freeze |
    | 15:35–15:45 | Freeze smoke test |
    | 15:45–16:00 | Take 1 |
    | by 16:05 | Fallback uploaded and checked signed out |
    | 16:00–16:12 | Edit and export (trigger at 16:12: the raw-take cut or take 1) |
    | by 16:22 | Final upload checked signed out (trigger at 16:22: submit the fallback) |
    | 16:22–16:32 | Link check |
    | 16:35 | Submit (16:45 at the latest) |
    | 16:35–17:00 | `reset_demo` to D0, restore the flags, charge both devices |
    | 17:00–17:45 | Judging |

- **D132. Lane E: Sagnik, on his own laptop, for the video, content, presentation and UI layer.**
  - **Owns from the contracts merge:**
    - `src/app/globals.css`, `DESIGN.md` and `PRODUCT.md`, moved from Lane B. Lane B keeps the screens.
    - `src/components/ui/`, `src/lib/fonts.ts` and `src/app/not-found.tsx`, moved from L.
    - New paths: `src/app/design/` (a preview page that returns 404 in production), `public/brand/`, `docs/presentation/`, `docs/media/` and `video/`.
  - **The contract:** token names, primitive exports and props, and `fonts.ts`'s exports are stable. Lane E changes values and adds names, and never renames or removes one. B, C and D style only through those names. A lane that needs a new token asks L, who passes the request on through Notion.
  - **Merging:** L merges Lane E's code pull requests at batch times, last in each batch. Lane E merges docs-only or video-only pull requests itself once CI is green.
  - **Packages:** Lane E runs no install either; package requests go to L (architecture 4.2 rule 4).
  - **Video files:** footage and renders never go in git.
  - **What this replaces:** D50 and skills-toolkit 6 gave the video shell to L; it is Lane E's now. The team lead still drives the app in the takes and does the voice-over. Where the notes say "the teammate", they mean Sagnik.
  - The brief is `docs/context/lane-e.md`.
- **D133. Keeping two laptops in step.** L can't message an agent on another laptop, so GitHub and Notion are the channels.
  - **Lane E:**
    - pushes at least every 30 minutes and at each milestone, with a draft pull request opened early;
    - keeps its own section of the Notion Build HQ page current (status, ETA, links) on the same rhythm;
    - writes its questions under "Questions and requests for the lead".
  - **L:**
    - reads Lane E's pull requests and section at every batch, and sooner when one changes;
    - answers there;
    - posts what Lane E needs: a batch merged, what is live, and when a clip is ready to record.
  - Each side edits only its own sections.
  - Secrets never go to GitHub, Notion or chat. The demo accounts' passphrase is passed in person.
