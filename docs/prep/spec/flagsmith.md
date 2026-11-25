# Jashn: Flagsmith design and integration contract

Prep note written at about 04:30 IST on Wed 25 Nov 2026, before FestiveHacks coding starts at 09:00. This is the fourth version. It matches `architecture.md` (revised 04:07), `voice.md` (04:39), `export-and-recovery.md` (03:49), `doc-ai.md` (03:32) and `domain-and-data.md` (03:25). `acceptance.md` (04:36) matches it except for its demo checklist (10.5).

**Decisions pass, about 05:55:** updated for decisions.md D5, D9, D47, D70, D71, D93 and D94 (the stub that fails closed, the two kill-switch checks, the Vercel and contracts times, who clicks in the dashboard, "sakte hain" and the turn count). Where this file still disagrees with decisions.md, decisions.md wins.

**Round 4 pass, about 06:15:** updated for D113 (the checks in 7.6 are now FV1–FV15; video shots keep V01–V16, and "the V15 recording" is always the NudgeBee shot), D115 (the user sets `image_extraction_provider`'s Production default; its key arrives in `lane-lead-contracts-2`), D118 and D119 (who adds which env value), D121 (the chip beside the header mic, the prefill list, FV13 on local dev, the FV7 split rule, the 09:35–09:55 contracts window) and D70's worktree time. Smaller ones: D96 and D97 (the stubs Lane C compiles against), D103 (`npm test` before a PR is ready), D114 (the typed save), D120 (test accounts), and D9 with D48 (the user, not L, arms the drill and flips `card_renderer`).

It is notes only (Rule 4): prose, tables, one directory list, two short JSON examples of HTTP payloads, and a few commands marked "Run at 09:00 or later". It contains no code. Session C (voice and Flagsmith) owns this file and builds from it after 09:00. The other sessions build against the parts that touch them:
- **Lane A:** 2.3 (the actor's email), 3.2 (the voice gate), 5.4 (the setup-saved hook), 5.10 (the `experiment_exposures` table) and 6.9 (the focus refresh in `LiveRefresh`).
- **Lane B:** 6.2 and 6.9 (VoiceDock in the planner shell).
- **Lane D:** 3.6, 3.7 and 6.5 (the drill, the renderer and the environment-flag reader).
- **The lead:** 3.0 and sections 2, 4 and 5 for `src/contracts/flags.ts`; 6.7 for the `flags` summary in `/api/health`; section 7 for the 09:00 setup.

**Status: binding** for Flagsmith names: flag keys, variation keys, segment names, trait names, event and metric names, and identity formats. Every lane and the synthetic run uses these names exactly. `architecture.md` is binding for everything around them, including environment variable names (its decision 9 and section 5), routes and delivery. Section 6.10 here only repeats its Flagsmith rows.

Other names come from other files:
- Entity, table, command, field and error names: `domain-and-data.md`.
- Routes, the folder tree, file ownership, environment variables and delivery: `architecture.md`.
- What the export drill does to a job: `export-and-recovery.md`. The card reader: `doc-ai.md`.
- Pass and fail conditions: `acceptance.md`.

Where this file needs another spec to change, section 10 lists the change.

Fact-checked at about 04:50 against `research-flagsmith.md`: the plan limits, SDK versions, event rules, thresholds and the events endpoint all match it. Three small alignments were made: the card reader's latest start (3.8), and two architecture requests now marked applied (10.2).

Every Flagsmith fact here comes from `research-flagsmith.md`. Anything else is marked "(our judgement)" or "(our estimate)".

Read with: `scope.md`, `research-flagsmith.md`, `demo-data.md`, `demo-script.md` and `voice-test-set.md`, and in `spec/`: `architecture.md`, `domain-and-data.md`, `voice.md`, `acceptance.md`, `export-and-recovery.md` and `doc-ai.md`.

---

## 0. Summary

Flagsmith does three jobs in Jashn. Each one changes what the app does, so removing Flagsmith visibly breaks something. That is the organisers' own test for "real work".

1. **Experiment.** `setup_entry` splits eligible first-time owners 50/50 between voice-first and form-first wedding setup, using a stable opaque ID. The exposure is recorded when the setup screen renders. `setup_saved` is recorded after the database commits the new wedding.
2. **Staged rollout.** `voice_pilot` decides who gets voice at all: the team first, then 10%, 50% and 100% of owners and managers in Jashn's two UI languages. A reason chip beside the mic says why voice is on for this person.
3. **Kill switch.** The server checks `voice_writes_enabled` on every voice turn and every voice-sourced command. When it is off, voice still answers questions but writes nothing. Typing is untouched.

Supporting flags:
- `spoken_replies` mutes Bulbul.
- `env_label` proves which environment a key belongs to.
- `export_failure_drill` arms NudgeBee's deliberate export failure, for one named sample wedding.
- `card_renderer` switches card export to the 12:15 fallback.
- `image_extraction_provider` picks Should #11's card reader. It is created only if #11 is built.
- `setup_entry_synthetic`, a twin of `setup_entry`, carries the scripted run.

Judges see the experiment where Flagsmith computes it. First comes the Production experiment's page, under a red banner, with today's real counts and "Collecting data". Then comes the Synthetic experiment's page, under a purple "Synthetic data" banner, with the scripted run's result. Jashn itself computes no statistics and shows no synthetic number. The team's flags drawer shows only what Jashn sent, labelled as app-side counts.

Flagsmith never decides authorisation or privacy, never receives personal data, and never runs in the browser.

### 0.1 Decisions at a glance

| Decision | Choice | Why (short) |
|---|---|---|
| SDK | `@flagsmith/nodejs` 9.5.0, server only, remote evaluation | Experiments need events, and local evaluation isn't meant for serverless. Architecture 1.1 pins it, with 9.4.0 as the fallback pin. |
| Browser | No Flagsmith in the browser at all | The kill switch and exposures must be server-side. Client keys are public and can write traits. |
| Environments | Development, Production and Synthetic, with one key per deployment | Separate data, banners and warehouses. Scripted traffic can never touch Production. |
| Identity | `u_` plus an HMAC of the auth user id | Stable, unguessable, no personal data |
| Kill switch | Checked early at `/api/voice/turn`, and authoritatively in the dispatcher's guard (step 4). **Fails closed** (off) when Flagsmith can't be read, and the contracts stub refuses voice writes until Lane C's real gate merges (decision D47). | 3.2 and 6.8 |
| Exposure call | `trackExposureEvent` behind Jashn's own eligibility gate, not `getExperimentFlag` | No second request, and internal accounts are never exposed |
| Synthetic run | 800 identities on the twin flag `setup_entry_synthetic`, with save rates planted at 50% and 60% and a fixed seed. Lane C runs it once, from its worktree. | About 400 per arm matches the ~385 per arm that a 10-point effect needs. A separate flag can never block or touch the real experiment. |
| Setup method | The user uses the Flagsmith dashboard (the one seat; decision D9). The organisation API key stays on the laptop and is used only to read (FV1). | One seat on Free, and a beta wizard. A variation created through the API without a label is never counted. |
| What judges see | Flagsmith's own experiment pages: Production (red banner, real counts), then Synthetic (purple banner). Fallback: the 14:30 screenshots. | Every statistic is Flagsmith's, on Flagsmith's screen, under its environment's banner. Free has no read-only keys, so no deployment holds a key that can read results (architecture 5.1). |
| How a flip reaches an open page | The focus refresh (architecture 2.4) re-renders VoiceDock with fresh flags, and every voice response carries the dock's state | Real-time updates are Enterprise-only, and flags never move `version` |
| Health | Lane C's self-check runs once per instance. It also feeds the `flags` summary in the lead's public `/api/health`, and runs in full in the drawer. | One check for the lead's batch routine and Playwright, with no secrets in it (architecture 3.7) |

### 0.2 Names this file settles (earlier notes used other names)

| Earlier name (where) | Use instead |
|---|---|
| Flag `voice_mode` (research-flagsmith; domain-and-data 0.2 and open question 6) | Flag `voice_pilot` (scope, demo-data 13.1, demo-script; architecture 9 item 16) |
| Flag `voice_tts_enabled` (research-flagsmith, research-sarvam, domain-and-data) | `spoken_replies` |
| Segment `voice_pilot` (research-flagsmith, domain-and-data) | Segment `voice_rollout`, so it never shares a name with the flag |
| Segment `internal_testers` | Segment `internal_team` |
| `preferred_language` value `hinglish` (research-flagsmith) | Only `en` and `hi`, the `app_language` enum (domain-and-data 5.2). Hinglish is spoken under `hi`. |
| `is_internal` from a list of user ids (research-flagsmith) | From `INTERNAL_USER_EMAILS` plus the reserved `@example.com` domain (2.3) |
| 400 synthetic identities on `setup_entry` (research-flagsmith) | 800 identities on the twin flag `setup_entry_synthetic` (3.9) |
| Flag `stt_mode` | Not a flag today (3.8 and 3.10) |
| Flag `card_export_fault_once`, the `inject-failure` route (research-flagsmith, research-nudgebee) | `export_failure_drill`, whose value names the one sample wedding it may arm (3.6) |
| Segment `lang_hi_hinglish` | Not created |
| "Optional experiment card" (research-flagsmith); the drawer's experiment card (this file's third version) | Not built. Judges see Flagsmith's own experiment pages, and the drawer shows Jashn's sent counts (5.9). |
| A flag drawer opened from a footer chip (research-flagsmith) | The flags drawer, opened from the reason chip beside the mic (3.1 and 5.9) |
| `voice_writes_enabled` fails open (research-flagsmith) | Fails closed (6.8) |
| Rehearsals in a separate environment (demo-data 13.1, demo-script V02), or on a preview bound to Development (research-flagsmith) | Rehearsals run on the production deployment with internal accounts, which the experiment excludes (1.2). No previews exist (architecture 6.5). |
| `flagsmith-nodejs@8.1.2` and `flagsmith@10.0.0` (research-stack) | `@flagsmith/nodejs@9.5.0` only (architecture 1.1, 7.1 trap 9) |
| `FLAGSMITH_SERVER_KEY_DEV`, `_SYNTH`, `_PROD` (research-flagsmith) | `FLAGSMITH_SERVER_KEY` (each deployment's own key), `FLAGSMITH_SERVER_KEY_SYNTHETIC` and `FLAGSMITH_SERVER_KEY_PRODUCTION` (architecture 5.1 and 5.2) |
| `FLAGSMITH_SYNTHETIC_KEY` in `.env.synthetic.local` (this file's third version) | `FLAGSMITH_SERVER_KEY_SYNTHETIC`, in `.env.local`, copied only into Lane C's worktree (architecture 5.2 and 5.3) |
| `FLAGSMITH_INTERNAL_EMAILS` (third version) | `INTERNAL_USER_EMAILS` (architecture 5.2) |
| `GET /api/flags/health` (research-flagsmith; earlier drafts) | The `flags` summary inside the lead's `/api/health`, and the drawer's Health part (6.7) |
| `GET /api/voice/state` and the dock's focus check (third version) | The focus refresh (architecture 2.4) and every voice response (6.9) |
| `FLAGSMITH_EXPECTED_ENV`, `FLAGSMITH_PROD_ENV_ID`, `FLAGSMITH_SYNTH_ENV_ID`, `FLAGSMITH_PROD_EXPERIMENT_ID`, `FLAGSMITH_SYNTH_EXPERIMENT_ID`, `FLAGSMITH_WEBHOOK_SECRET` (third version) | Not created (architecture 5.1) |
| `NEXT_PUBLIC_FLAGSMITH_ENVIRONMENT_ID` "read by nothing" (third version) | Read by server code only, for the drawer's environment label. On Vercel it holds the Production client-side key (architecture 5.1). |
| `OPS_API_TOKEN` (earlier drafts) | `JOBS_API_TOKEN` (architecture 5.2). No Flagsmith route uses a bearer token now. |

---

## 1. Environments

### 1.1 The three environments

| Environment | What it is for | What talks to it | Server key: env var, and where it lives | Flagsmith banner | Warehouse | Experiment |
|---|---|---|---|---|---|---|
| **Development** | Building and testing on laptops: `next dev` in the main folder and the four worktrees (ports 3000–3004), and their cloudflared tunnels for phones. No Vercel previews exist (architecture 6.5). | Local dev servers only | `FLAGSMITH_SERVER_KEY` holds the Development `ser.` key, in `.env.local`, which is copied into every worktree | None | Managed ("Flagsmith"), enabled tonight | None |
| **Production** | The real product: the production deployment, used by judges, testers, both phones, NudgeBee and Chromium. Rehearsals happen here too, with internal accounts. | The production deployment, and the laptop hosting fallback (F19) | `FLAGSMITH_SERVER_KEY` in Vercel Production (Sensitive) holds the Production key. Its source copy is `FLAGSMITH_SERVER_KEY_PRODUCTION` in the main `.env.local`. No code reads that copy, and no worktree receives it (architecture 5.3). | Red: "PRODUCTION · real users" | Managed, enabled tonight | "Setup entry: voice-first vs form-first (real new owners)" on `setup_entry` |
| **Synthetic** | Simulated traffic with a disclosed planted effect, to prove the experiment's wiring end to end | Only `scripts/synthetic-setup-traffic.ts`, which Lane C runs once from its worktree (5.8) | `FLAGSMITH_SERVER_KEY_SYNTHETIC`, in the main `.env.local` and copied only into Lane C's worktree (architecture 5.3). Only the script reads it. It is never on Vercel. | Purple: "Synthetic data · scripted traffic, planted effect" | Managed, enabled tonight | "SYNTHETIC DATA: setup entry, 800 scripted owners, planted 50% vs 60%" on `setup_entry_synthetic` |

Each environment also has a client-side key (its environment ID). It is not secret, and no browser SDK uses it. It appears in two places:
- `NEXT_PUBLIC_FLAGSMITH_ENVIRONMENT_ID`, which server code reads for the drawer's environment label. It holds the Development key locally and the Production key on Vercel (architecture 5.1).
- The path of the lead's read-only warehouse check (7.5).

### 1.2 Rules

1. **One deployment, one key.** No code path chooses a Flagsmith key at run time.
   - Vercel holds only the Production key.
   - Local dev holds only the Development key.
   - Only the synthetic script reads the Synthetic key.
2. **`env_label` proves the binding.** Every environment has the flag `env_label` set to its own name. Each evaluation compares it with what the process expects (3.5). On a mismatch Jashn sends no experiment events, so a wrong key can never pollute another environment's experiment.
3. **Rehearsals use Production, with internal accounts.** Only the production domain is public: phones need HTTPS for the microphone, and NudgeBee and Chromium call it.
   - Every seeded, rehearsal and recording account is internal: its email ends in `@example.com` (2.3), such as the rehearsal copies' `mira.<copy>@example.com` and `diya.<copy>@example.com` (architecture 3.5). The experiment never enrols internal accounts, so the real counts stay honest.
   - **Setup tests use a fresh internal test owner,** a new `@example.com` account made for the run, such as `setup-c-<HHMM>@example.com` (acceptance Must 1; decision D120). It starts with no wedding, like a real new owner, but is never counted.
   - A rehearsal flip of the kill switch flips it for everyone on Production. Keep it short and restore it at once.
4. **Synthetic data is never passed off as real.**
   - The Synthetic environment holds only scripted traffic and is never connected to a deployment.
   - In Flagsmith, every page of it carries the purple banner. Its experiment's name starts "SYNTHETIC DATA", its flag is `setup_entry_synthetic`, its identities are named `synthetic-0001` onwards, and each identity carries the trait `traffic` = `synthetic`.
   - **Its results are shown only on Flagsmith's Synthetic experiment page,** under that banner (acceptance AT-1.8). On stage and in the video, the narration and the caption name it as synthetic every time it is on screen (8.2, 8.4).
   - **In Jashn no synthetic number appears anywhere.** The drawer only points to the Synthetic environment, inside a box with a purple "Synthetic data" banner and the disclosure text (5.9).
   - Its numbers are never added to, averaged with or quoted as real counts.
   - The pitch, the README, every slide and every video caption call it synthetic each time it appears. Screenshots keep the banner in frame.
   - **Safety net:** if a Jashn deployment ever found itself bound to Synthetic (`env_label` = `synthetic`), VoiceDock shows a "Synthetic data" banner on every planner screen, and experiment events stop because of the mismatch.
5. **The disclosure text**, used word for word in the drawer, the README and the video caption:
   > Synthetic data: 800 scripted owners in a separate Flagsmith environment, with save rates planted at 50% (form-first) and 60% (voice-first). It tests the experiment's wiring, not the product.
6. **Development mirrors Production's configuration:** the same flags, segments and overrides (7.4), so local behaviour matches production. The exceptions are the rollout's timing (Development gets the `voice_rollout` override at once, 4.3) and experiments, which Development never has.
7. **Free-plan facts that shape this:**
   - unlimited environments;
   - one team member, so only the user operates the dashboard (decision D9);
   - an audit log that probably shows nothing (the code says 0 days of history);
   - no scheduled flags, no change requests, no real-time updates, and no roles and permissions, so no read-only keys.

   Nothing in this design needs a paid feature.

---

## 2. Identities and traits

### 2.1 Who is identified

| Caller | Identified as | Traits sent |
|---|---|---|
| A signed-in user on planner pages, the setup screen, every `/api/voice/*` route and `POST /api/card-imports` | Their identity key `u_…` (2.2) | The user traits (2.3) |
| The dispatcher's voice gate (step 4) | Not identified: it reads environment flags | None |
| The setup-saved hook | Not identified for its check, which reads environment flags. Its event carries the user's identity key. | None |
| Guest pages, guest RSVP and dietary routes, and guest voice if it ships | **Never identified.** Guest voice reads environment flags only (`voice_writes_enabled`, `spoken_replies`). | None |
| The card render page, the version and revision polls, uploads, and the ops routes NudgeBee calls | Never identified. The polls, the render page and uploads never call Flagsmith. Export job creation and the export worker read environment flags only. | None |
| The self-check (at instance start, for `/api/health`, and the drawer's "Run check again") | Environment flags, plus probe events as `probe-selfcheck` | None |
| The drawer's probe mode | `probe-01` to `probe-50` | Fixed non-internal owner traits (6.7) |
| The synthetic run | `synthetic-0001` to `synthetic-0800`; `synthetic-dry-01` to `synthetic-dry-05` in the dry run | A real new owner's traits, plus `traffic` |

### 2.2 The identity key

- **Format:** `u_`, then the first 32 lowercase hexadecimal characters of an HMAC-SHA256.
  - The key is the server-only secret `FLAGSMITH_ID_SALT`.
  - The message is the auth user id: the Supabase Auth user UUID, or the Better Auth user id if the 09:30 fallback stack is chosen (architecture 8 row 1).
- **Properties:**
  - stable across devices, sessions and weddings;
  - unguessable (the SDK identity API is public by design, so Flagsmith asks for unguessable keys);
  - not reversible without the salt;
  - the same in every environment;
  - never the raw id, an email, a phone number or a name.
- **The salt** is added to the main `.env.local` at 09:22 (architecture 7.2 step 8), and L adds the same value to Vercel Production at about 09:35, right after the user's dashboard import at about 09:32 (architecture 7.2 step 9; decisions D5 and D71). **Never change it after the Production experiment starts.** A new salt gives every user a new identity, which re-buckets both the experiment and the rollout.
- **If the salt is missing,** the flags module identifies nobody and serves the fallbacks (6.8), and the self-check goes red.

### 2.3 Traits

| Trait | Values | Persisted or transient | Source (computed on the server) | Used by |
|---|---|---|---|---|
| `preferred_language` | `en`, `hi` | Persisted | The user's `members.preferred_language` in the wedding the request is about. On the setup screen and in setup turns (no membership yet), it is the UI language the page renders in, the same value `/api/voice/turn` receives. | Segment `voice_rollout` |
| `role` | `owner`, `manager` | Transient | The user's `members.role` in the request's wedding. It is `owner` on the setup screen, because the creator becomes the owner. | Segments `voice_rollout` and `new_owners` |
| `is_internal` | `true`, `false` | Transient | `true` when the signed-in user's email either is listed in `INTERNAL_USER_EMAILS` or ends in `@example.com`. Every seeded and rehearsal account uses that reserved domain (architecture 3.5). The comparison ignores case. The email comes from Lane A's session helper on the server (`src/server/auth/session.ts`, a contracts stub returning the fixture member until Lane A's body lands; decision D96), and in the dispatcher from the actor context (10.1 item 5). It never leaves the server. | Segments `internal_team` and `new_owners`; the experiment gate; the drawer |
| `is_first_wedding` | `true`, `false` | Transient | `true` when the user has no `members` row with role `owner` and no `removed_at`. Lane C reads `members` directly (architecture 4.2 rule 2). | Segment `new_owners`; the experiment gate |
| `traffic` | `synthetic` | Persisted | Sent only by the synthetic run | Labelling on the Synthetic environment's Identities page |

- Persisted traits show on Flagsmith's Identities page, so the dashboard can show why a segment matched. Transient traits are used for that one evaluation and never stored. A user in two weddings simply overwrites `preferred_language` on each request.
- Booleans are sent as booleans. Segment conditions compare them with the values `true` and `false`; FV4 checks that this matches.
- **Never sent to Flagsmith:** names, emails, phone numbers, wedding names, the city, dates, amounts, transcripts, guest data, card photos or their text, or database ids.
- Events carry only the identity key, the event name, a variant key or a number of seconds, and Flagsmith's own experiment id.

### 2.4 Flags never decide authorisation

- Role checks, privacy (domain-and-data G1–G9) and approvals (A1–A7) stay in the dispatcher's guard and the read models (architecture 3.3).
- Flagsmith's segment docs warn against using segments for access control.
- In Jashn, a flag can only take a capability away (voice, voice writes, spoken replies, the card reader) or choose between two equivalent paths (setup entry, card renderer). The drill flag only fails a sample wedding's export once, on purpose. No flag ever grants access to data.

### 2.5 Environment settings (once in each environment)

- "Persist traits when using client-side SDK keys": **off**.
- "Hide Sensitive Data": **off**. It nulls `reason`, which the reason chip needs.
- "Use Consistent Hashing": **never touch it.** Toggling it re-buckets variants and % splits.

---

## 3. Flags

### 3.0 The flag table

- Every flag is created once at project level and appears in all three environments.
- Every flag has "Server-side only" ticked.
- Nothing reads a flag in the browser. The "Read by" column names the server code that does.

| Flag | Type and values | Production | Development | Synthetic | Fallback when Flagsmith can't be read, or the flag is missing | Read by (all server) | Behaviour |
|---|---|---|---|---|---|---|---|
| `voice_pilot` | Boolean (standard flag, no value); tag `rollout` | Off. Overrides: `internal_team` on; `voice_rollout` on from rollout step 1. | Off. Overrides: `internal_team` on, `voice_rollout` on. | Off (unused) | On for internal accounts (Jashn computes `is_internal` itself), off for everyone else | VoiceDock, every `/api/voice/*` route, the setup screen | Whether this user has voice at all. Off means no mic, and voice routes answer 403 `voice_unavailable`. A reason chip says why it is on. (3.1) |
| `voice_writes_enabled` | Boolean kill switch; tags `kill-switch` and `protected`; **never any overrides** | On | On | On (unused) | **Off** (fails closed, 6.8) | `/api/voice/turn`; the dispatcher's voice gate (environment flags), which `/api/voice/confirm` reaches; VoiceDock; the setup screen | Off: the server writes nothing that came from voice. Questions are still answered. Typed paths never check it. (3.2) |
| `spoken_replies` | Boolean | On | On | On (unused) | On | Every voice route that would call Bulbul, before calling it | Off: no text-to-speech request; the reply text still shows. (3.3) |
| `setup_entry` | Multivariate string. Control value `form_first`; one variation with label (key) `voice_first` and value `voice_first`, weight 0% outside experiments. Tags `experiment` and `protected`. | Enabled; the experiment sets the split (50/50) | Enabled; weight 0%, so everyone gets the control | Enabled, unused | `form_first`, and an exposure is never recorded from a fallback | The setup screen's server render | Which input setup opens on for eligible first-time owners. (3.4) |
| `setup_entry_synthetic` | The same shape as `setup_entry`. Tags `synthetic`, `experiment` and `protected`. | Enabled, weight 0%, never read | Same as Production | Enabled; the Synthetic experiment sets the split | None: the synthetic run stops instead | The synthetic run only | Carries the scripted experiment. (3.9) |
| `env_label` | Standard flag, enabled, with a string value; tag `system` | `production` | `development` | `synthetic` | `unknown`: self-check red, experiment events off | Every user evaluation, the self-check, the drawer, the synthetic run's guard | Names the environment a key belongs to. (3.5) |
| `export_failure_drill` | Standard flag with a string value: empty, or one sample wedding's id; tag `ops` | Disabled with an empty value; armed only for the NudgeBee drill | Disabled, empty | Disabled (unused) | Disabled; then `EXPORT_FAILURE_DRILL` (a wedding id), if it is set | Lane D's `request_card_export` handler, through C's environment-flag reader, once per new job | Enabled, with the value equal to the new job's wedding id, on an `is_sample` wedding: the job's first attempt fails on purpose with `DRILL_INJECTED`, labelled as deliberate. (3.6) |
| `card_renderer` | Standard flag, enabled, with a string value: `chromium` or `og`; tag `ops` | `chromium` | `chromium` | Unused | `chromium` | Lane D's export worker, at each claim, through C's environment-flag reader | The 12:15 switch to the Latin-only next/og fallback (architecture 8 row 2). (3.7) |
| `image_extraction_provider` | Standard flag, enabled, with a string value: `docai`, `gemma4` or `off`. **Created only when Should #11's build starts.** | `off`, with an `internal_team` override set to the chosen reader until #11 passes its checks; then the chosen reader | The chosen reader | Unused | `off` | The setup screen's render and `POST /api/card-imports`, with the user's identity | `off` hides "Start from a printed card" and refuses new imports; otherwise it names the reader. (3.8) |

The lead's session copies this table's keys, variation keys, values and fallbacks into `src/contracts/flags.ts` at 09:35–09:55 (architecture 4.3, 7.2 step 10; decision D121). It copies the trait, segment, event and metric names from sections 2, 4 and 5 at the same time, and the chip keys and labels from 3.1. The `image_extraction_provider` key, values and fallback follow in `lane-lead-contracts-2` at about 10:30, with `src/contracts/card-import.ts` (decisions D44 and D115).

### 3.1 `voice_pilot` and the reason chip

- **Server enforcement.**
  - VoiceDock, a server component (6.2), shows the mic only when the user has `voice_pilot` on.
  - Every `/api/voice/*` route checks the flag again. When it is off, the route returns 403 `voice_unavailable` before anything is sent to Sarvam (acceptance AT-1.7, tested with a non-internal `nonint-c-<HHMM>@example.net` account on local dev only, never on production; decision D120).
  - Hiding the mic is a convenience; the route check is the rule.
- **Off-state text in the UI:** design-direction 7.1's "Voice is switched off right now. You can type or edit directly."
- **The reason chip** sits beside the header mic, on desktop and on the phone (decisions D20 and D121), for every owner and manager who has voice on.
  - It comes from the flag's `reason`, which SDK 9.5.0 returns.
  - The remote-evaluation reason strings are unconfirmed (U10), so the chip matches on the segment name inside the string and falls back to a neutral label.
  - The dock gets it from VoiceDock's server render, which the focus refresh repeats (6.9).

| Evaluation of `voice_pilot` for this user | Chip key | Chip, English | Chip, Hindi | Tapping it shows |
|---|---|---|---|---|
| On, and the reason names segment `internal_team` | `internal_team` | Voice · team preview | वॉइस · टीम प्रीव्यू | "Voice is on because this is a Jashn team or demo account." |
| On, and the reason names segment `voice_rollout` | `voice_rollout` | Voice · pilot group | वॉइस · पायलट ग्रुप | "Voice is on because you are in the voice pilot for owners and managers." |
| On for any other reason, such as the environment default | `voice_on` | Voice · on | वॉइस · चालू | "Voice is on for everyone." |
| On, but `voice_writes_enabled` is off | A second chip, `questions_only` | Questions only | सिर्फ़ सवाल | "Voice can answer questions. To change something, type it." |
| A fallback value (Flagsmith unreachable), internal account | `safe_mode` | Voice · safe mode | वॉइस · सेफ़ मोड | "Flagsmith can't be reached, so voice can answer questions but not save changes." |
| Off | None | No chip; the mic shows the off text above | | |

- For internal accounts, the chip's popover also has a "Flags and experiment" button, which opens the flags drawer (5.9). The button appears once `lane-c-flags-drawer` has merged (7.7).

### 3.2 `voice_writes_enabled`: the kill switch

**Where the server checks it:**

1. **`POST /api/voice/turn`** (the early check).
   - The user's flags are evaluated as soon as the audio arrives, in parallel with speech-to-text, so the check adds no wait.
   - When the switch is off and the validated proposal contains any write (any command, including a manager's gated action that would become `propose_change`):
     - no confirmable preview is offered;
     - the turn is stored with status `paused` and `refusal_code` `voice_writes_paused`;
     - the response (200) carries the fixed refusal reply and a prefill: a list with one `{command, input, labels}` entry per action, the same shape as the 423's `error.prefill` (domain-and-data 3.8; decision D121).
   - The reply is spoken if `spoken_replies` is on.
   - A spoken confirmation of an open turn ("haan, save karo") is a confirm, so the same refusal applies.
   - A question is never refused. voice.md decides how a turn that mixes a question and a change is phrased.
   - This early check is a change to domain-and-data V3, 3.8 and section 7 step 9 (10.1).
2. **The dispatcher's guard, step 4** (the authoritative check; architecture 3.3, domain-and-data 3.0).
   - For every command whose `source` is `voice`, the guard calls the voice gate: Lane C's implementation of the interface in `src/contracts/flags.ts`.
   - The gate reads `voice_writes_enabled` fresh from environment flags, once per command.
   - When the switch is off, or can't be read (6.8), the dispatcher writes nothing and returns 423 `voice_writes_paused`. Its body is domain-and-data 3.8's "Paused response", with the prefill inside `error`.
   - `/api/voice/confirm` reaches this check for each action. That covers a preview shown before the flip and confirmed after it (acceptance AT-2.7).
   - The dispatcher's 423 carries its single action's prefill entry. Before `/api/voice/confirm` answers 423, it rebuilds the full list, one entry per action, from the stored turn (decision D121).
   - Each refusal logs one line naming the command and the cause ("switch off" or "flags unreadable"), with no user data. demo-script's fallback "show the server's flag-evaluation log line" uses it.
   - Until `lane-c-voice` merges in the 10:45 batch, the lead's contracts stub **refuses every voice write**: it answers "paused" with the cause "unreadable", never "enabled" (architecture 4.3; decision D47). So the gate fails closed even if Lane A's dispatcher lands before Lane C's gate.
3. **The setup screen.** Enrolment in the experiment needs the switch on (5.2).
4. **VoiceDock** shows the "Questions only" chip. It learns the switch's state from its server render, which the focus refresh repeats whenever the tab regains focus (6.9), and at once from every voice response.

**Never checked by:**
- typed commands (`source` `ui`), including the prefilled form;
- the guest RSVP button;
- NudgeBee's retry.

Typing keeps working because it never asks.

**What the user sees after a refusal:**
- The fixed refusal line, never the model's own reply. voice.md owns the line; in the demo it must be voice-test-set R-03's: "Abhi voice se badlav band hain. Aap type karke save kar sakte hain." "sakte hain" is the respectful form, right for any speaker (decision D93).
- Then the matching typed form opens with the heard values filled in, each marked "from voice, please check". Saving it is an ordinary typed command.

**Other rules:**
- **One switch for everyone.** No segment or identity overrides, so the gate and guest voice can read the environment value without identifying anyone.
- **No change requests on this flag.** A kill switch must take effect at once, and change requests are a paid feature anyway.
- **Where a refusal is recorded.** A refused turn goes to `voice_turns` (status `paused`), not to the activity log (domain-and-data L1). It touches no money, itinerary or guest data, and doesn't move `version`.
- **What each turn records.** `voice_turns.flags` stores the values read for that turn, including `env_label` (10.1 item 7). Development and Production share one database (architecture 3.1), so the rollout gate (4.3) counts only turns recorded with `env_label` `production`.

### 3.3 `spoken_replies`

- On everywhere; the fallback is on.
- Every voice route that would call Bulbul reads it first: the turn and confirm responses, and voice.md's reply-audio route (`GET /api/voice/turns/{voice_turn_id}/reply-audio`), which then answers 204. When it is off, no text-to-speech request is made, and the response carries the reply text only. The dock shows the text, as voice-test-set pass criterion 4 requires anyway (acceptance AT-2.11).
- It is set at environment level only, with no targeting, so guest voice can read it too.
- Use it when Bulbul is slow on stage (demo-script's fallback for #7).

### 3.4 `setup_entry`

- **Shape.** Multivariate from the moment it is created, which avoids the "boolean converted late" mistake.
  - The control value is `form_first`.
  - One variation has label (key) `voice_first` and value `voice_first`.
  - A variation without a label is never counted, so check the label in the dashboard (FV3).
- **Never, today:**
  - identity overrides or segment overrides;
  - weight edits, or rollout % edits after launch;
  - switching the flag off while the Production experiment runs.

  Changing weights mid-test re-buckets users.
- **Read only by** the setup screen's server render, in `src/app/(planner)/setup/`.
- **Branch on the variant, not the value.** The variant key `voice_first` means voice-first. Anything else means form-first: the control, an empty variant or an unknown key. A variant is set even for identities outside the rollout, so also check `experiment.inExperiment` (row 6).
- **The entry decision.** The setup screen applies these rows top to bottom and stops at the first match:

| # | Case | Setup opens on | Exposure recorded? |
|---|---|---|---|
| 1 | Flagsmith couldn't be read, or `setup_entry` is a fallback value | Form-first | No |
| 2 | `env_label` doesn't match this process (3.5) | Form-first | No |
| 3 | The user already owns a wedding | Form-first | No |
| 4 | Internal account | Voice-first if this user has voice (`voice_pilot` on and `voice_writes_enabled` on), otherwise form-first | No |
| 5 | `voice_pilot` is off for this user, or `voice_writes_enabled` is off | Form-first | No |
| 6 | The flag is disabled, has no `experiment`, is not `inExperiment`, or has no variant | Form-first | No |
| 7 | Everything else: an eligible, enrolled first-time owner | `voice_first` → voice-first; anything else → form-first | **Yes** (5.3) |

- **One log line per render.** The setup page logs the matched row and the arm, with no user data. FV13 checks it on local dev (decision D121).
- **Both arms can switch input.** Voice-first opens on the mic with a "Type instead" link. Form-first opens on the form with a mic button. Switching never changes the arm, and the analysis is by assigned arm.
- **The same screen otherwise.** Anything else on the setup screen, such as #11's "Start from a printed card" (3.8), appears identically in both arms.

### 3.5 `env_label`

- A standard flag, enabled, whose value names the environment: `development`, `production` or `synthetic`.
- **What each process expects:**
  - `production` when `NODE_ENV` is `production`: Vercel, and any `next start`, including the hosting fallback (F19);
  - `development` under `next dev`;
  - the synthetic run always expects `synthetic`.

  There is no override variable (architecture 5.1).
- **On a mismatch:**
  - the self-check is red, and `/api/health`'s `flags` summary shows `ok` false with both labels;
  - the drawer says "Wrong Flagsmith environment";
  - exposures and conversions are not sent.

  Everything else carries on with the values it read.
- A local `next start` with the Development key reports a mismatch. That is the safe direction: nothing is polluted. Local testing uses `next dev`.

### 3.6 `export_failure_drill`

- **What it is:** a standard flag with a string value; tag `ops`. It is disabled with an empty value in every environment, except while the user (the one Flagsmith seat, decision D9) arms a NudgeBee drill in Production.
- **When it is read:** once, through environment flags (no identity), when `request_card_export` creates a job. Lane D's handler calls C's environment-flag reader, which returns both the enabled state and the value. It is never read for an existing job.
- **The rule** (export-and-recovery 4.1):

| `export_failure_drill` | Effect on a new job |
|---|---|
| Disabled (the default) | None |
| Enabled, but the value is empty, isn't this job's wedding id, or names a wedding that isn't `is_sample` | None; the server logs "drill ignored" |
| Enabled, the value equals this job's wedding id, and the wedding has `is_sample` | `fail_injection` `once` and `synthetic` true. Attempt 1 fails before Chromium starts, with `DRILL_INJECTED` and "Injected fault (deliberate): renderer timeout". The retry renders normally. |

- **When Flagsmith can't be read,** the drill is off, unless `EXPORT_FAILURE_DRILL` holds a wedding id. That value then stands in for the flag's value, under the same rule. Setting it needs a redeploy. Whenever Flagsmith answers, the env var is ignored.
- **Why a flag:**
  - the user arms the deliberate failure without a deploy, scoped to one sample copy, so other lanes' copies and real weddings never trip;
  - it links two sponsors on screen: Flagsmith arms the drill, and NudgeBee recovers it.
- **Nothing else can arm it:** no request field, header, voice phrase or ops call (2.4).
- **Operation** (export-and-recovery 4.4):
  1. In Flagsmith Production, set the value to the sample wedding's id (from the planner URL), then enable the flag.
  2. Export the card, and wait for "Failed" with the "Deliberate drill" chip.
  3. Disable the flag and clear the value at once.

  In live mode (the lead decides at 14:30; the default is the recorded NudgeBee beat with the drill off in the live run, unless the live run completes in under 15 s in rehearsal, decision D40), it is armed in the pre-flight and disarmed right after the run, together with turning `voice_writes_enabled` back on (8.3).

### 3.7 `card_renderer`

- A string: `chromium` (the default and the fallback) or `og`.
- Lane D's export worker reads it through environment flags once at each claim, and records it on the attempt row (export-and-recovery 3.3, step 3). A switch therefore applies to the next attempt, with no deploy.
- At the 12:15 gate, the user (the one Flagsmith seat) sets it to `og` in Production if no production export of the REV-3 card has succeeded (architecture 8 row 2; export-and-recovery 3.6 and 3.7; decisions D9 and D48). The README then marks dynamic Hindi on the exported card as Partial.

### 3.8 `image_extraction_provider` (Should #11 only)

- **Create it only when #11's build starts,** never during the 09:38–09:58 dashboard steps. doc-ai 5.2 and architecture 8 row 11 both set the latest start at 13:00; if the build hasn't started by then, the flag is never created and the reader stays off. Until the flag exists nothing reads it, and the self-check lists it under `not_created` without failing (6.7).
- **Shape:** a standard flag, enabled, with a string value: `docai` (Sarvam Document AI), `gemma4` (the backup reader) or `off` (hidden). "Server-side only" is ticked, like every flag.
- **Values per environment:**
  - **Production:** `off`, with a segment override for `internal_team` (4.1) set to the chosen reader, normally `docai`, so the team can test on the production domain. After #11's checks pass on production (doc-ai AC-1 to AC-12), the user, the only Flagsmith seat, sets the Production default to the chosen reader (decisions D9 and D115).
  - **Development:** the chosen reader.
  - **Synthetic:** unused.
- **Fallback: `off`.** An optional reader hides itself rather than running unconfigured. research-flagsmith's sketch used `docai`; doc-ai and this file replace it.
- **Read by,** with the user's identity:
  - the setup screen's render, to show "Start from a printed card";
  - `POST /api/card-imports`, to pick the reader, or to refuse a new import with 403 `card_reader_off` when the value is `off` (doc-ai 1.7).

  Never in the browser (6.9).
- **The experiment.** The card entry appears in both `setup_entry` arms, in the same place, so the arms stay comparable. Its going live is still a change in the middle of the experiment, so the README's experiment notes record the time (7.8).
- **This is also why `stt_mode` is rejected** (3.10): switching Saaras modes in Production would change the voice-first arm's treatment mid-run, and nothing in the card entry's design can offset that.
- **Turning it off later:** set `gemma4` (if doc-ai's T6 passed) or `off`. `off` stops new imports at once, and imports already in flight finish or time out (doc-ai 5.2).

### 3.9 `setup_entry_synthetic`

**Why a twin flag:** the Synthetic experiment runs on its own flag, never on `setup_entry`.
- **No blocking.** It removes unknown U3 (whether a flag can have only one active experiment across environments), so the scripted experiment can never block the real one.
- **No throwaway checks.** No experiment ever needs ending or re-creating to find out.
- **It labels itself.** The flag's own name says it is synthetic.

What this costs: the scripted run doesn't exercise `setup_entry` itself. It does exercise everything else: the same SDK calls, the same event and metric names, the same warehouse and the same experiment setup. Section 7.6 checks `setup_entry` separately (FV3 and FV14).

### 3.10 Not created today

| Name | Why not |
|---|---|
| `voice_mode`, `voice_tts_enabled` | Renamed to `voice_pilot` and `spoken_replies` |
| `stt_mode` | Switching Saaras modes in Production would change the experiment's treatment mid-run (3.8) |
| Segment `lang_hi_hinglish` | No flag needs it |
| Metric "Forced fallback to typing" | One primary metric and one guardrail, as the organisers advise. More metrics need more wiring, and possibly a second event (U11). |
| The environment webhook | Not planned. Which plans include webhooks isn't stated, it would add a public route and a secret, and the README's rollout and flip log is the record anyway (F13). |
| Routes `GET /api/voice/state` and `GET /api/flags/health` | Not built (architecture 2.2 and 10, question 1). The focus refresh (6.9) and `/api/health`'s `flags` summary (6.7) do their jobs. |

---

## 4. Segments and rollout steps

### 4.1 Segments

- Segments are defined at project level; segment overrides are set per environment.
- Conditions inside a segment are evaluated top to bottom, and all of them must match.
- Precedence is identity override, then segment override, then the environment default.
- The `In` operator is case-sensitive, so values are lowercase with no spaces.

| Segment | Conditions (all must match) | Used by | Members today |
|---|---|---|---|
| `internal_team` | `is_internal` Equal `true` | The `voice_pilot` override, priority 1 (Production and Development); the `image_extraction_provider` override in Production (3.8) | Mira, Kabir, Diya and every other `@example.com` account in every sample copy, fresh setup-test owners, and the team's own addresses |
| `voice_rollout` | `role` In `owner,manager`; then `preferred_language` In `en,hi`; then `% Split` 10 (later 50, then 100) | The `voice_pilot` override, priority 2 | Non-internal owners and managers whose identity falls inside the split |
| `new_owners` | `role` Equal `owner`; `is_first_wedding` Equal `true`; `is_internal` Equal `false` | The experiment audience, if the wizard offers one (one segment at most, set before launch) | First-time, non-internal owners |

- `voice_rollout` has exactly one `% Split` condition. That keeps membership deterministic: the bucket is a hash of the segment id and the identity, so everyone who was in at 10% stays in at 50%.
- The language condition limits voice to the two languages Jashn's voice is built and tested in. A future language added to `app_language` gets no voice from this rollout until someone adds it here.
- Jashn's own gate (5.2) mirrors `new_owners`, whether or not the wizard accepts an audience.

### 4.2 The split is shared by every environment

Segment rules live at project level, so the % in `voice_rollout` applies to Development and Production at the same moment. Only the overrides are per environment. So:
- Production gets its `voice_rollout` override only at rollout step 1. Until then, editing the % affects only Development.
- The determinism test (FV5: 10 → 50 → back to 10) runs before step 1.
- After step 1, every edit to the % is a Production rollout step. Record it in the README.

### 4.3 Rollout steps (Production)

| Step | Target time (IST) | Change in Flagsmith | Gate before taking the step | Recorded where |
|---|---|---|---|---|
| 0 | 09:38–09:58 (setup, 10:30 at the latest) | `voice_pilot` off, with the override `internal_team` on | None | README rollout log |
| 1 | ~12:30, after that batch's demo-path check | Add the `voice_rollout` override (on) in Production; the split is 10 | FV7 (the kill switch end to end) passed on laptop and phone, plus the turn gate below, counted since 11:30 | README log, with the gate numbers |
| 2 | ~13:45 | Edit `voice_rollout`'s split from 10 to 50 | The turn gate, counted since step 1 | README log |
| 3 | ~14:30, before the 14:45 freeze; 16:15 at the latest | Split from 50 to 100 | The turn gate, counted since step 2 | README log |

- **The turn gate** is read from Production's voice turns (`voice_turns` rows whose recorded `env_label` is `production`, 3.2):
  - at least 20 voice turns;
  - at most 1 turn with status `failed` (a forced fallback: speech-to-text or the model failed);
  - **0** command receipts with `source` `voice` whose voice turn has no `confirmed_at`. This should be impossible by construction; the count is the check.

  **Every voice turn counts** toward the 20, whatever its `input_mode` (speech, typed, tap or fixture), not only speech turns (decision D94).

  The lead's session reads these three counts from the database, read-only, at each step. The drawer's Health part shows the last two hours' totals as a quick view (5.9).
- **Honest labelling:** most gate turns will be the team's own rehearsals, and the README says so.
- **If the gate fails:**
  - hold the step and fix the cause;
  - if step 3 is still blocked at 16:15 only because there were too few turns (not too many failures), take it and note why;
  - if failures block it, stay where you are and mark the rollout Partial in the README.
- **The rollout limits the experiment.** Only users with voice can be enrolled (5.2), so at 10% few real owners qualify. That is one more reason the real counts will be small. Invite most first-time testers after step 3, or at least after step 2.

---

## 5. The experiment

### 5.1 Design

| Item | Production | Synthetic |
|---|---|---|
| Name | Setup entry: voice-first vs form-first (real new owners) | SYNTHETIC DATA: setup entry, 800 scripted owners, planted 50% vs 60% |
| Hypothesis (Flagsmith's format: change, metric, size, timeframe) | Opening new-wedding setup on the microphone will raise the share of new owners who save a reviewed wedding by at least 10 percentage points on 25 Nov 2026, without making setup slower. | The same, followed by "(scripted traffic; tests the wiring)" |
| Flag | `setup_entry` | `setup_entry_synthetic` |
| Arms | Control `form_first`; treatment `voice_first` | The same |
| Rollout and split | 100% of identities that reach the experiment; split 50/50 | The same |
| Audience | `new_owners`, if the wizard offers an audience (U4); otherwise none, and Jashn's gate does the work | The same |
| Primary metric | "Setup saved": Occurrence of `setup_saved`, higher is better, expected to increase | The same |
| Guardrail | "Seconds to save": Mean of the `setup_saved` value, lower is better, should not increase | The same |
| Start | After `lane-c-setup-experiment` is live in the 11:40 batch: target ~12:00, latest 12:45. **Never ended today**: an ended experiment can't be restarted. | ~10:50, just before the run |
| Engine | Flagsmith's Bayesian engine. Jashn computes no statistics of its own except the sample-size yardstick (5.7). | The same |

### 5.2 Eligibility: Jashn's gate

A user is enrolled only when row 7 of the entry decision (3.4) is reached. That requires all of these:
- Flagsmith was read (no fallback), and `env_label` matches;
- the user is a non-internal owner with no wedding yet;
- the user has `voice_pilot` on and `voice_writes_enabled` on;
- the evaluated `setup_entry` flag is enabled, carries an experiment, says the identity is `inExperiment`, and has a variant.

Notes:
- The switch is part of the gate, so enrolment pauses during a kill-switch incident.
- The rollout widens who is eligible during the day, but it never decides which arm anyone gets, so the comparison between arms stays fair (our judgement).

### 5.3 The exposure event

- **When:** the setup screen renders for an enrolled user. That is the moment they see their arm.
- **Where:** in the setup page's server render (`src/app/(planner)/setup/`, Lane C), after the entry decision. Never in a layout, never on any other page, never in a poll and never in a voice route.
- **How:**
  1. Use the evaluation already made for this render (the per-render cache, 6.4).
  2. Look up the user's `experiment_exposures` row (5.10) for (`setup_entry`, this `env_label`).
  3. Render `setup_opened_at` into the form for `set_wedding_profile` (domain-and-data 3.1). For an enrolled owner it is the row's `exposed_at` when the row exists, so a refresh doesn't reset the clock. Otherwise it is the render time.
  4. Schedule the rest with `after()` (5.5). The callback receives plain values: the identity key, the variant, Flagsmith's experiment id, the user id and the time.
     - Insert the row if there isn't one yet. An existing row is left alone, so the first variant and time stay.
     - Call `trackExposureEvent` for feature `setup_entry`, with the identity key and the variant key as the value. Pass the experiment id from the evaluated flag as metadata, matching research-flagsmith's REST shape, if the SDK doesn't add it itself.
     - Flush.
- **Every enrolled render sends the exposure again.** Flagsmith deduplicates exposures per identity, under the first variant seen, so repeats are harmless, and a lost first send gets another chance. The app row is written only once.
- **Why not `getExperimentFlag`:**
  - it would make a second billable evaluation;
  - it records an exposure for every identity in the experiment, so internal accounts would be exposed unless the audience segment exists.

  One evaluation followed by `trackExposureEvent` behind Jashn's gate does the same job without either problem.
- **Prefetch off** (architecture 7.1 trap 29). A link prefetch renders `/setup` on the server and would record an exposure for an owner who never opened it.
  - Every `Link` to `/setup` sets prefetch off, and nothing prefetches `/setup` from code.
  - Server redirects to `/setup` (the root redirect, and the sign-up redirect of architecture 3.5) are real visits and are fine.
  - `/setup` has no poller and no focus refresh (architecture 2.4; decision D79, the one exception to D37's polling), so nothing re-renders it behind the owner's back.
  - FV13 checks this.
- **Other leaks and wiring mistakes:** 5.11.

### 5.4 The conversion event

- **When:** after the dispatcher commits `set_wedding_profile` as a create (outcome `applied`), for both arms and both input paths. A voice confirm and the form run the same command.
- **Who triggers it:** the dispatcher's after-commit side effects (step 7), which run in `after()` (architecture 2.3 and 3.3 step 7; domain-and-data 3.1, "After commit").
  - The dispatcher calls Lane C's setup-saved hook. It passes the actor (the user id, and the email, server-only), the new wedding id, the outcome, whether this was a create, the `setup_opened_at` input and the commit time.
  - The hook never throws back into the dispatcher.
- **What it does:**
  1. **Check the case.** It does nothing unless this was a create with outcome `applied` (never `replayed` or `unchanged`), the user is not internal, and the user now owns exactly one wedding.
  2. **Check the environment.** It evaluates environment flags once and does nothing unless `env_label` matches and nothing was a fallback.
  3. **Work out the value.** The value is the whole seconds from the user's `experiment_exposures.exposed_at` to the commit. With no row, it is measured from the `setup_opened_at` input instead. It is clamped to 0–3600, and left out if there is no start time or the start is in the future.
  4. **Send it.** It calls `trackEvent` with event `setup_saved`, the identity key and the value. If the wizard won't attach two metrics to one event (U11), it also sends `setup_save_seconds` with the same value, and the guardrail metric uses that event.
  5. **Record it.** It sets `converted_at`, `seconds_to_save` and `wedding_id` on the user's `experiment_exposures` row, if one exists.
  6. **Flush.** It flushes the SDK buffer (5.5).
- **Sent even if the user was never enrolled.** Flagsmith counts a conversion only after that identity's first exposure, so a conversion from a non-enrolled owner is simply ignored. Sending it whatever the enrolment means the conversion can never fail to fire because of a missing app row.

### 5.5 Flushing in `after()`

- The SDK buffers events (up to 1,000) and sends them every 10 seconds. A Vercel function can be frozen right after the response, losing that buffer.
- Every place that records an exposure or a conversion flushes inside `after()`.
  - `after()` has been stable since Next 15.1. On Vercel it uses `waitUntil` and is bounded by the route's `maxDuration` (architecture 2.3).
  - `flushEvents` can be called repeatedly.
- **Never call `close()` in a request.** It is terminal for the shared client. Only the synthetic run, a short-lived process, calls it, once at the end.
- If FV9 shows events lost despite `after()`, the two experiment paths await the flush before responding (F3).

### 5.6 Warehouse requirements and processing delay

- **Required:** one warehouse connection per environment, in place before an experiment can be created. The ingestion service rejects events for an environment without one.
  - Jashn uses the managed "Flagsmith" warehouse in all three environments. It is Cloud-only and needs nothing provisioned. It was enabled tonight as access prep.
  - Development keeps one too, so the self-check's events probe passes locally.
  - Bring-your-own warehouses need Scale-Up, so they are out.
- **Status** goes Created → Pending Connection → Connected (or Errored). Any first event counts, including Flagsmith's own test event.
- **Delay:**
  - The first event can take "up to a few hours" to process, which is why the warehouses were enabled tonight.
  - Once Connected, Flagsmith's agent prompt implies results about a minute after traffic. That is an inference, not a promise.
  - Results refresh at most once every 5 minutes, and the results endpoints return null until computed.
  - So a real exposure at 14:20 may not show in Flagsmith's numbers until about 14:30. The drawer's "Sent by Jashn" counts carry their as-of time, so the team can tell a processing delay from a lost event (F18).
- **Rules that silently drop or skew data:**
  - events older than 10 days, or more than 24 hours in the future, are rejected;
  - event names that match no metric are ignored;
  - conversions count only after the identity's first exposure;
  - identities seen in two variants are quarantined;
  - a variation without a label is not counted;
  - delivery is at-least-once, so Count, Sum and Mean can inflate slightly (Occurrence and exposures can't);
  - a 401 or 403 makes the SDK drop every event and stop tracking, silently (6.6).

### 5.7 Thresholds and statistics, and why it may say "Collecting data"

- **Flagsmith shows "Collecting data" until every arm has at least 50 identities and, for a conversion metric, at least 5 conversions.** The sample-ratio-mismatch check starts at 100 identities.
- **Real traffic today** is first-time owners who sign up on the production domain (architecture 3.5: `/signup` leads to `/setup`):
  - testers invited 14:00–14:45, then judges after 17:00;
  - Jashn's own accounts are excluded.

  Expect a total in single or low double digits. The Production experiment will almost certainly still say "Collecting data" at judging, and that is the honest result.
- **What Flagsmith reports once the thresholds are met:**
  - scorecards: users enrolled, winning variation, chance to be best, and lift against the control;
  - per variation: exposures, the metric value, delta %, the 95% credible interval and win probability.

  Above 95% chance to be best is "winning", below 5% is "losing", and anything between is inconclusive.
- **Lift is relative.** A planted 50% → 60% shows as about +20% lift, not +10. Say "ten percentage points" for the plant, and read Flagsmith's lift as it is.
- **Our yardstick (our estimate, not Flagsmith's):** detecting +10 points from about 50%, with two proportions, α 0.05 and power 0.8, needs about 385 owners per arm. The drawer shows it as one line (5.9), and the narration uses it (8.2).
- **Never claim a winner** from the Production experiment, and never quote the synthetic result as evidence about voice.

### 5.8 The synthetic run

Lane C writes `scripts/synthetic-setup-traffic.ts` after 09:00 (topic `lane-c-synthetic-run`, 10:45 batch). **Lane C runs it once, from its worktree** `~/Desktop/Personal/jashn-c`, the only worktree whose `.env.local` holds `FLAGSMITH_SERVER_KEY_SYNTHETIC` (architecture 5.3, 7.2 step 11). It runs after the user launches the Synthetic experiment (step F1; decision D9) and Lane C gets the go-ahead, at about 10:55.

| Item | Value |
|---|---|
| Key | Only `FLAGSMITH_SERVER_KEY_SYNTHETIC`, from the worktree's `.env.local`, loaded by Node's env-file option (7.5). The same file holds the Development key as `FLAGSMITH_SERVER_KEY`; the script never reads that name, and its guard stops on any environment but Synthetic anyway. |
| Imports | Only `src/contracts/flags.ts` and the SDK. Never `src/server/` (architecture 7.1 trap 11). |
| Guards | It first evaluates `env_label` with that key and stops unless the value is `synthetic`. It also stops if the first identity's `setup_entry_synthetic` carries no experiment, or if the key is missing. |
| Dry run first | Evaluate `synthetic-dry-01` to `synthetic-dry-05` and print their variants and `inExperiment`. Send no events. |
| Identities | `synthetic-0001` to `synthetic-0800`, in order. Never reused: a re-run starts at `synthetic-0801`, against a new Synthetic experiment. |
| Traits | Exactly a real new owner's: `role` owner, `is_first_wedding` true and `is_internal` false (all transient); `preferred_language` alternating `en` and `hi` (persisted); plus `traffic` = `synthetic` (persisted) |
| Per identity | Evaluate the identity's flags once. If it is `inExperiment` with a variant, record the exposure with the same call shape as the app (`trackExposureEvent`, the variant as value). Then draw from a seeded generator (seed `20261125`). Convert when the draw is below **0.60** for `voice_first`, and below **0.50** for the control. If it converts, record `setup_saved` with value 60 plus a seeded whole number from 0 to 240 (seconds). Both arms use the same seconds distribution, so no guardrail effect is planted. |
| Pace | Sequential, at most about 10 identities a second; a flush every 100 identities; `close()` once at the end |
| Output | Counts per arm: identities, exposures sent and conversions sent. These are not results; results come from Flagsmith. |
| Cost | About 805 billable requests; 2–4 minutes |
| Record | The run time, the printed counts and the seed, in the README |

- **Before merging,** Lane C tests the guards without any key (the script must stop with nothing sent) and unit-tests the conversion draw. The dry run is the first call with the real key, and Lane C reads its output before the real run.
- The run makes the same SDK calls as the app, with the same event names. So a working synthetic result also proves Jashn's event shape, metrics, warehouse and experiment setup. It can't prove the page placement or the `after()` flush; FV9, FV13 and FV14 cover those.
- Expected outcome (our estimate): with about 400 per arm, a planted 10-point difference crosses Flagsmith's 95% "chance to be best" roughly 9 times in 10. Whatever Flagsmith shows is what we show, including an inconclusive result.

### 5.9 What the judges see: Flagsmith's experiment pages, and the team's flags drawer

**On stage and in the video: Flagsmith's own pages.** The experiment's numbers are shown where Flagsmith computes them, one page after the other in the same beat (8.2, 8.4):
- **Real:** Production › Experiments › "Setup entry: voice-first vs form-first (real new owners)", under the red "PRODUCTION · real users" banner. It shows today's exposures and saves per arm, and "Collecting data" while any arm is below 50 owners or 5 saves.
- **Synthetic:** Synthetic › Experiments › "SYNTHETIC DATA: setup entry, 800 scripted owners, planted 50% vs 60%", under the purple "Synthetic data · scripted traffic, planted effect" banner. It shows Flagsmith's result for the scripted run.

These two pages are the "real counts beside the bannered Synthetic results". Every statistic on them is Flagsmith's, and each carries its own environment's banner. The narration names which is which (8.2).

**Why not inside Jashn.** Reading results needs the organisation API key. Free has no read-only keys, so that key can also change flags, and architecture 5.1 keeps it on the laptop. So Jashn holds no key that can read results, computes no Flagsmith statistic, and shows no synthetic number. Flagsmith's own screen is also the more convincing proof (our judgement).

**The flags drawer** (internal accounts only; acceptance 0.2).
- The reason chip opens a popover with the reason (3.1). For internal accounts, the popover has a "Flags and experiment" button, which opens the drawer: a right-hand panel on desktop, a sheet on the phone.
- Non-internal users and guests never see it, and the server never sends them its data.
- Part 1 comes with VoiceDock's render. Parts 2 to 4 load through Lane C's server actions (6.2), and each action checks again that the caller is internal.

Its four parts:
1. **This session,** from VoiceDock's own evaluation, so it costs no extra request:
   - the identity key;
   - `env_label`, and the last four characters of the environment's client-side key, from `NEXT_PUBLIC_FLAGSMITH_ENVIRONMENT_ID`;
   - every flag with on or off, its value or variant, its raw `reason`, and "fallback" when the value didn't come from Flagsmith.
2. **Sent by Jashn** (Production only):
   - exposures and saves per arm, counted from `experiment_exposures` rows with `flagsmith_env` `production` (5.10), with their as-of time;
   - the heading "Sent by Jashn (app-side counts, not Flagsmith's statistics)";
   - below it, word for word (acceptance AT-1.8): "Flagsmith shows statistics from 50 owners and 5 saves per arm. A 10-point effect needs about 385 per arm. We claim no winner."

   It computes nothing else. It is also architecture 8 row 9's labelled fallback, if the Production warehouse never connects (F1).
3. **Synthetic data:** a box with a purple "Synthetic data" banner and the disclosure text (1.2). It says the scripted run's results are in Flagsmith's Synthetic environment, and it shows no numbers.
4. **Health:**
   - the latest self-check result (6.7);
   - "Run check again": the full check, including the SDK probe;
   - "Run 50 probes": evaluation only, never events (6.7);
   - Production's voice turns in the last two hours (total, failed and paused), as a quick view of the rollout gate (4.3).

**In Flagsmith, for questions:**
- `voice_rollout` with its % split;
- `voice_writes_enabled` with its `kill-switch` and `protected` tags;
- the Identities page, which shows persisted traits and no personal data.

**In Jashn, during the beat:** the reason chip, the "Questions only" chip after the flip, the refusal, and the typed save.

### 5.10 The `experiment_exposures` table

- Lane A creates it in the `app` schema (architecture 4.2 rule 1, and 9 item 13).
- Lane C's module writes it outside the dispatcher, as it writes `voice_turns` (architecture 3.3, and 9 item 14). It never moves `weddings.version`.
- Development and Production share one database (architecture 3.1), so every row records its Flagsmith environment.
- The drawer reads it only as aggregates (5.9).

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | uuid | no | Primary key |
| `user_id` | uuid | no | The auth user id. Unique together with `experiment` and `flagsmith_env`. |
| `experiment` | text | no | `setup_entry` |
| `flagsmith_env` | text | no | The `env_label` value at exposure |
| `flagsmith_experiment_id` | text | yes | From the evaluated flag |
| `identity_key` | text | no | The `u_…` key |
| `variant` | text | no | `voice_first` or `form_first` |
| `exposed_at` | timestamptz | no | The first exposure |
| `converted_at` | timestamptz | yes | Set by the setup-saved hook |
| `seconds_to_save` | integer | yes | The value sent with `setup_saved` |
| `wedding_id` | uuid | yes | The wedding created at conversion |

### 5.11 Exposure leaks, and the wiring mistakes the organisers name

| Mistake or leak | How Jashn avoids it |
|---|---|
| An unstable identifier (Kunal Kushwaha, "How to Win Toggle Wars") | One HMAC identity key per user, everywhere (2.2) |
| Exposures on one side only (Kunal) | Both arms are exposed at the same place in the same render, before the UI branches (5.3) |
| A conversion event that never fires (Kunal) | Sent after every committed first-wedding create, for both arms and both input paths, whatever the enrolment (5.4). The synthetic run proves the event path (FV11). |
| A boolean flag converted late (Kunal) | `setup_entry` is multivariate from creation (3.4) |
| No guardrail (Kunal's advice) | "Seconds to save" (5.1) |
| Link prefetch renders `/setup` and records an exposure for an owner who never opened it | Prefetch off on every link to `/setup` (5.3; architecture 7.1 trap 29). FV13 checks it. |
| Internal accounts enrolled | Jashn's gate (5.2), whatever the wizard's audience does |
| An exposure from a fallback value or the wrong environment | Rows 1 and 2 of the entry decision (3.4) |
| Flags frozen into a static page at build time | Every flag-reading route is dynamic (6.4; architecture 7.1 trap 30); FV12 |
| Events lost when the function freezes | Flushes in `after()` (5.5); FV9 |

---

## 6. Server SDK usage

### 6.1 Package and mode

- **Package:** `@flagsmith/nodejs` **9.5.0**, pinned exactly; it shipped on 23 Nov.
  - It needs Node 20 or later, and Jashn runs on Node 24.
  - Experiments need 9.1.0 or later. 9.4.0 added event retries and a bounded buffer. 9.5.0 added `reason`.
  - 9.4.0 is architecture's fallback pin (1.1), which loses `reason`.
- **Remote evaluation** (the SDK default). Each evaluation is one blocking request to the Edge API, which has a Mumbai region next to Vercel's `bom1`. Traits sent with a request are used in that same request.
- **No local evaluation.** Flagsmith's docs say it expects long-lived processes and is not recommended on platforms like Lambda, and Vercel functions are serverless.
- **No flag analytics.** Its counts appear 30–60 minutes later and add another buffer to flush.
- **No `startListening`.** Real-time updates are Enterprise-only, and the Node SDK isn't on that list.
- **No Flagsmith code in the browser, and no Vercel Flags SDK.** The vercel:flags-sdk skill is not used. `@flagsmith/nodejs` runs on the server only, and the browser gets flag results through the focus refresh (6.9; decision D34).

### 6.2 Module layout and owners (within architecture 4.1)

- `src/contracts/flags.ts` [L; changes requested by C and D] (architecture 4.3). It holds:
  - flag keys, variation keys, values and fallbacks, including `card_renderer`, `export_failure_drill` and `image_extraction_provider` (which `lane-lead-contracts-2` adds at about 10:30; decision D115);
  - trait, segment, event and metric names;
  - identity prefixes, and the chip keys and labels;
  - **the voice gate interface:** given a voice command's name, it answers "enabled", or "paused" with the cause "switch off" or "unreadable". The dispatcher turns "paused" into 423 `voice_writes_paused`.
  - **the setup-saved hook interface:** it takes the actor, the outcome, whether it was a create, the new wedding id, the `setup_opened_at` input and the commit time. It returns nothing and never throws.
  - **the self-check summary's shape,** which `/api/health` returns under `flags` (6.7).
- `src/server/flags/` [C]. Every file is server-only. Architecture 4.1 lists the parts; the file names are C's choice.
  - `index.ts` is the only surface other lanes import: the user evaluation, the environment-flag reader, the voice gate, the setup-saved hook and the self-check summary. It starts as the lead's stub: a gate that refuses every voice write ("paused", cause "unreadable"; decision D47), a reader that returns the fallbacks, a hook that does nothing, and a summary that says "not built yet" (architecture 4.3).
  - The client: the single SDK instance, its settings and the 30-second breaker.
  - Identity: the identity key and the traits for a user.
  - Evaluation: the per-render cached user evaluation, and the environment evaluation for callers with no identity.
  - Gates: voice availability, the voice gate, setup eligibility and the entry decision.
  - Experiment events: exposure, conversion, `experiment_exposures` writes and the `after()` flushes.
  - Self-check: the once-per-instance check, the cached summary, the full check and probe mode.
  - Reason labels: maps a flag's reason to a chip key.
  - The drawer's server actions: "Run check again", "Run 50 probes", the "Sent by Jashn" counts and the voice-turn counts. Each checks again that the caller is internal.
- `src/components/voice/` [C]: `VoiceDock` (a server component), the client dock, `ReasonChip`, `FlagDrawer` and the review card (architecture 4.1).
  - VoiceDock evaluates the user's flags (cached per render) and renders the client dock with plain props.
  - For internal accounts it also passes the drawer's session data and its server actions, because client components never import `src/server/` (architecture 7.3 rule 5).
- `src/app/(planner)/setup/` and `src/components/setup/` [C]: the setup screen, both arms, the entry decision and the exposure.
- `src/app/api/voice/` [C]: `turn/`, `confirm/` and `cancel/` (domain-and-data 3.8), and voice.md's reply-audio and trace routes under `turns/`. There is no `state/` route.
- `src/app/api/health/` [L]: the lead's public route, which returns Lane C's `flags` summary (6.7).
- `scripts/synthetic-setup-traffic.ts` [C]: the synthetic run (5.8). It can't import `server-only` files, so it shares only `src/contracts/flags.ts`.
- **Not created:** `src/app/api/flags/`, `src/app/api/webhooks/` and `src/components/flags/`.

**What other lanes call (they never import the SDK):**
- **B's planner shell** renders `VoiceDock` with the wedding id; the setup screen passes null. The contracts stub already carries VoiceDock's final props, and only L changes them (decision D97). Nothing else in B reads flags.
- **A's `LiveRefresh`,** mounted in that shell, makes the focus refresh that re-renders VoiceDock (architecture 2.4). It never calls Flagsmith itself.
- **A's dispatcher** calls the voice gate at step 4, and the setup-saved hook after commit (5.4).
- **D's `request_card_export` handler and export worker** call the environment-flag reader for `export_failure_drill` (enabled state and value) and `card_renderer`.
- **The lead's `/api/health`** calls the self-check summary.

### 6.3 Client settings

- The server-side environment key from `FLAGSMITH_SERVER_KEY`.
- `enableEvents` on. `getExperimentFlag` throws without it, and both `trackEvent` and `trackExposureEvent` need it.
- `requestTimeoutSeconds` 2 and `retries` 1, then the fallback values (6.8).
- A default flag handler that returns the fallback value from `src/contracts/flags.ts` for any flag. A missing flag or a failed request never throws into a page.
- **The breaker:** after a timeout, a network error or a 5xx, that server instance serves fallbacks for 30 seconds without calling Flagsmith, then tries again. This stops every request on an instance from waiting about 4 seconds during an outage.
- Any error the SDK throws anyway is treated exactly like "unreachable".
- The client is created once per server instance, lazily, on first use.

### 6.4 Caching per request

- **Server components:** one evaluation per user and wedding per render, through React's per-render cache.
  - The key is the user id plus the wedding id ("none" on the setup screen), as strings.
  - VoiceDock, the page and the drawer's session part share it.
  - One identity evaluation returns every flag, so the drawer can list them all at no extra cost.
- **Route handlers:** React's cache doesn't apply there. Each `/api/voice/*` request and each `POST /api/card-imports` evaluates the user once at its start and passes the result down. `/api/voice/turn` starts the evaluation in parallel with speech-to-text.
- **The dispatcher's voice gate** reads environment flags fresh for each voice command. A confirm with three actions therefore costs three more requests (fine for the budget), and every action sees the switch as it is at that moment.
- **The one cached result** is the self-check summary that `/api/health` returns: each instance keeps its latest result for 60 seconds (6.7).
- **No caching of flag evaluations across requests,** so a flipped kill switch applies to the very next request.
- **Routes that read flags must be dynamic** (architecture 7.1 trap 30). Otherwise Next prerenders them at build time and freezes the flags. Every planner route reads the session cookie, which makes it dynamic (architecture 2.1). FV12 checks the build's route table.

### 6.5 Who calls Flagsmith, and who never does

| Caller | Evaluation | Flags it uses |
|---|---|---|
| VoiceDock on planner screens (C's component, rendered by B's shell) | User identity, once per render: a navigation, a focus refresh, or a `router.refresh()` after `version` moves (architecture 2.4) | `voice_pilot`, `voice_writes_enabled`, `spoken_replies` and `env_label` |
| The setup screen (C) | User identity, the same render | The same four, plus `setup_entry` and, once created, `image_extraction_provider` |
| `/api/voice/turn`, `/api/voice/confirm`, `/api/voice/cancel`, and voice.md's reply-audio and trace routes (C) | User identity, once per request | `voice_pilot`, `voice_writes_enabled`, `spoken_replies` and `env_label` |
| `POST /api/card-imports` (C, doc-ai 1.7) | User identity, once per request | `image_extraction_provider` |
| The dispatcher's voice gate (A calls C) | Environment flags, once per voice command | `voice_writes_enabled` |
| The setup-saved hook (A calls C) | Environment flags, once per new wedding | `env_label` |
| Guest voice, if it ships (C) | Environment flags, no identity | `voice_writes_enabled`, `spoken_replies` |
| `request_card_export` (D) | Environment flags, once per new job | `export_failure_drill` |
| The export worker, including NudgeBee's retry (D) | Environment flags, once per claim | `card_renderer` |
| The self-check (C): at instance start, for `/api/health` at most once a minute per instance, and the drawer's "Run check again" | Environment flags, plus one or two probe events | All |
| The drawer's probe mode (C) | 50 probe identities, and no events | `voice_pilot` and `setup_entry` |
| **Never:** the version and revision polls, guest pages and their RSVP, dietary and revision routes, the card render page, uploads, ops status reads and `src/proxy.ts` | – | – |

The version poll itself never calls Flagsmith (architecture 2.4). A refresh it triggers, or a focus refresh, re-renders the page, and that render costs one evaluation.

### 6.6 Failure modes

| Failure | What happens with no protection | How Jashn notices | What Jashn does |
|---|---|---|---|
| Wrong or revoked server key | Evaluations fail, so you get defaults. Events get 401 or 403, and **the SDK silently drops every event and stops tracking for the life of that instance.** | Self-check: the flags are fallbacks, and the events probe gets a non-2xx | Fallbacks (6.8); self-check red; the drawer shows "fallback" |
| A real key from the wrong environment (the Development key on Production) | **No error at all.** Flags come from the wrong environment, and exposures go to the wrong experiment. | `env_label` mismatch | Experiment events off; self-check red; fix the Vercel value |
| A client-side key used as the server key | Flags probably still evaluate (our inference; not tested), and events are accepted with either key type (research-flagsmith), but traits aren't persisted, because 2.5 switches that off for client keys | Self-check: the key doesn't start with `ser.` | `flags.ok` false with `key_type` `client`; replace the key |
| A flag missing or misspelled | The default handler answers for that one flag, silently | Self-check: that flag is a fallback | The summary lists it under `fallback_flags` |
| An environment without a warehouse | Ingestion rejects its events | The events probe is non-2xx; FV1 | Enable the warehouse |
| Flagsmith slow or down | Each request waits for the timeout | Timeouts counted by the breaker | Fallbacks at once, for 30 seconds |
| The function freezes before the 10-second batch | Buffered events are lost | FV9 | Flush in `after()` (5.5) |
| `FLAGSMITH_ID_SALT` missing | Identities can't be made | Self-check | Nobody is identified; fallbacks |
| `/api/health` called in a loop (it is public) | Each call would cost an evaluation and a probe event | Usage (FV15) | The summary is served from the instance's cached result for 60 seconds (6.7) |

### 6.7 The self-check, and the `flags` summary in `/api/health`

**When it runs:**
- **Once per server instance,** the first time the flags module is used. It runs inside `after()`, so it never delays a response. On serverless that is each instance's start-up.
- **For `/api/health`** (the lead's public route; architecture 2.2 and 3.7):
  - The route asks Lane C's module for the summary.
  - The module returns the instance's latest result if it is under 60 seconds old. Otherwise it runs items 1–5 first, waiting at most for the 2-second timeout and one retry. Concurrent calls share one run.
  - So the public route costs at most one evaluation and one probe event per instance per minute (our judgement).
  - The lead reads it after every batch (architecture 6.4) and in every pre-flight, and Playwright's demo-path spec checks `flags.ok` (architecture 6.7, item 10).
- **From the drawer** (internal accounts only): "Run check again" runs the full check, items 1–6, at once, whatever the cache.

Every run logs one line, starting `flagsmith-selfcheck ok` or `flagsmith-selfcheck FAILED` and naming the failed items. It never logs a key.

**What it checks:**
1. `FLAGSMITH_SERVER_KEY` and `FLAGSMITH_ID_SALT` are set, and the key starts with `ser.`.
2. The environment flags evaluate within the timeout, with no fallback.
3. Every flag in `src/contracts/flags.ts` came from Flagsmith rather than the default handler. `image_extraction_provider` is listed under `not_created` until #11 starts, without failing the check.
4. `env_label` equals the expected label (3.5).
5. **The events probe:** one direct HTTPS POST to the events endpoint with this key, carrying a single event named `jashn_selfcheck` that matches no metric. It needs a 2xx response. A 401 or 403 means the SDK would be silently dropping every event.
6. The drawer only: an SDK `trackEvent` named `jashn_selfcheck_sdk` for `probe-selfcheck`, flushed in `after()`. This proves the serverless flush (FV9).

`ok` is true only when items 1–5 pass. Experiment events don't wait for the check: each exposure and conversion checks its own evaluation's `env_label` and fallback state. A failing events probe means the SDK is dropping events anyway, so the check is a diagnosis, not a gate.

**The events probe** is `POST https://events.api.flagsmith.com/v1/events` with the header `X-Environment-Key: <server key>`.
- The shape comes from the SDK source; there is no public docs page for it.
- The timestamp is the current time in epoch milliseconds, because events more than 10 days old or more than 24 hours ahead are rejected.

```json
{
  "events": [
    {
      "event": "jashn_selfcheck",
      "feature_name": null,
      "identifier": "probe-selfcheck",
      "value": null,
      "traits": null,
      "metadata": null,
      "timestamp": 1795583467000
    }
  ]
}
```

**The `flags` summary** inside `/api/health`'s response. It holds no secrets and no user data, and the lead's route adds liveness and the commit SHA around it (architecture 3.7):

```json
{
  "flags": {
    "ok": true,
    "expected_env": "production",
    "env_label": "production",
    "key_type": "server",
    "fallback_flags": [],
    "not_created": ["image_extraction_provider"],
    "events_probe_status": 202,
    "experiment_events": "enabled",
    "latency_ms": 38,
    "sdk": "@flagsmith/nodejs 9.5.0",
    "checked_at": "2026-11-25T10:41:07+05:30"
  }
}
```

- `fallback_flags` lists every flag the default handler answered. When Flagsmith can't be read it lists them all, and `ok` is false (acceptance AT-1.9).
- `key_type` is `server`, `client` or `missing`.
- `experiment_events` is `enabled`, or `off` when `env_label` mismatches or a value was a fallback.
- Before Lane C's module ships, the lead's stub returns a summary that says "not built yet", with `ok` false (architecture 4.3).
- The drawer's full check adds each flag's value and `reason`, and the SDK probe.

**Probe mode** is the drawer's "Run 50 probes" (internal accounts only; FV4, FV5 and FV14):
- It evaluates `probe-01` to `probe-50`. Each has `role` owner, `preferred_language` `hi`, `is_internal` false and `is_first_wedding` true.
- For each probe it shows `voice_pilot` with its reason, and the `setup_entry` variant with `inExperiment`.
- It **never sends events**, so probes are never exposed. It costs 50 requests per press.

### 6.8 When Flagsmith can't be read: timeouts and fallbacks

After the 2-second timeout and one retry, or at once while the breaker is open, these values apply:

| Flag | Fallback | Reason |
|---|---|---|
| `voice_pilot` | On for internal accounts, off for everyone else | The team can still demo questions, and no rollout step is taken by accident |
| `voice_writes_enabled` | **Off** | See the decision below |
| `spoken_replies` | On | Harmless: the text is always on screen |
| `setup_entry` | `form_first`, with no exposure | An exposure is never recorded from a value Flagsmith didn't serve |
| `setup_entry_synthetic` | None: the run stops | Synthetic data must come from Flagsmith or not at all |
| `env_label` | `unknown` | The self-check goes red and experiment events stay off |
| `export_failure_drill` | Disabled, unless `EXPORT_FAILURE_DRILL` holds a wedding id (3.6) | Never inject a fault by default |
| `card_renderer` | `chromium` | The primary renderer |
| `image_extraction_provider` | `off` | An optional reader hides itself rather than running unconfigured (3.8) |

What a user sees (acceptance AT-1.9):
- pages render;
- setup opens on the form and records no exposure;
- internal accounts get the "Voice · safe mode" chip and can ask questions but not save by voice;
- other accounts get no mic;
- the drawer marks every flag "fallback", and the self-check is red;
- `/api/health`'s `flags` summary reports `ok` false, with every flag under `fallback_flags`.

**Decision: the kill switch fails closed.** When Jashn can't read `voice_writes_enabled`, voice writes are off. Questions, spoken answers and all typing keep working. Reasons:

1. **It protects money and the guest-facing schedule.** The switch exists for the moment voice is doing harm, such as mishearing amounts. If we can't see the switch, we can't know whether the operator pulled it, so the only safe reading is "pulled". The typed path is never affected, so nobody loses a capability, only a shortcut.
2. **A broken integration fails loudly.** A wrong or missing key stops voice writes at once, and the drawer shows "fallback". Failing open would hide a broken Flagsmith setup behind a working demo.
3. **The demo risk is small and has a fallback.** Vercel's `bom1` and Flagsmith's Mumbai edge are a datacentre hop apart, not venue Wi-Fi. The self-check and the pre-flight catch problems before the demo, and every voice beat in demo-script already has a typed fallback.

Research-flagsmith argued the other way: every voice write needs a human confirmation anyway. That is true, but a confirmation of a misheard amount is exactly what the switch exists to stop.

### 6.9 Does the browser need flags? No. The focus refresh carries them

- **What the browser gets instead:** plain props from server components.
  - The dock gets the dock fields below. For internal accounts it also gets the drawer's session data and server actions.
  - The setup screen gets its entry, and whether to show the card reader.
- **No Flagsmith in the browser:** no SDK, no identity, no traits and no key.
  - The `@flagsmith/flagsmith` package is not installed.
  - `NEXT_PUBLIC_FLAGSMITH_ENVIRONMENT_ID` is read only by server code (the drawer's label), so no client code references it and no client bundle carries it (architecture 5.1).
- **Reasons:**
  - The judged behaviour (kill switch, exposure and conversion) must be enforced on the server anyway.
  - Client keys are public, and client SDKs can write traits, which would add a second identity path.
  - Guests must never be identified.
  - It saves request budget.
- **How a flag change reaches an open page:**
  - Real-time updates are Enterprise-only, so they aren't available.
  - A flip doesn't move `version`, so the version poll never refreshes for it.
  - **The focus refresh** (architecture 2.4). A planner screen calls `router.refresh()` once whenever its tab becomes visible or gains focus, whatever the version. The server re-renders VoiceDock with a fresh evaluation. So switching back from the Flagsmith tab shows "Questions only" within one render: acceptance AT-2.7 allows 5 seconds, and FV6 aims for 3.
  - Every voice response carries the same dock fields (voice.md adopts them), so the first refused turn updates the dock at once, even if the focus refresh came too early for the flip.
  - A navigation, or a refresh after `version` moves, also re-renders VoiceDock.
  - **`/setup` has no poller and no focus refresh** (architecture 2.4), so a flip shows there on the next navigation or voice response.
  - The server enforces the switch on the next request, whatever any page shows.
- **Cost:** each focus refresh is one evaluation (6.10).

**The dock fields,** in VoiceDock's props and in every voice response:
- `voice_available`;
- `writes_enabled`: false adds the second chip, "Questions only";
- `spoken_replies`;
- `chip`: the chip key and both labels (3.1). It is null when voice is off, and its key is `safe_mode` when `fallback` is true for an internal account;
- `fallback`: true when any value came from the default handler.

### 6.10 Environment variables and the request budget

Architecture 5.1 is binding for these names and where they live; this table repeats its Flagsmith rows.

| Name | Read by | Main `.env.local` | Worktrees | Vercel Production |
|---|---|---|---|---|
| `FLAGSMITH_SERVER_KEY` | `src/server/flags/` (the client) | The **Development** `ser.` key | Yes (Development) | The **Production** server key, Sensitive |
| `NEXT_PUBLIC_FLAGSMITH_ENVIRONMENT_ID` | Server code only: the drawer's environment label (5.9). No client code reads it. | Present (the Development client-side key) | Yes | The Production client-side key, added by the user at the import (decision D119) |
| `FLAGSMITH_SERVER_KEY_PRODUCTION` | Nobody in app code. It is the value pasted into Vercel's `FLAGSMITH_SERVER_KEY`, and the source for the hosting fallback (F19). | Present | **No** | No |
| `FLAGSMITH_SERVER_KEY_SYNTHETIC` | `scripts/synthetic-setup-traffic.ts` only (5.8) | Present | **Lane C's worktree only** | No |
| `FLAGSMITH_ORG_API_KEY` | Laptop only: the lead's read-only checks (7.5, FV1). Never used to write, and never by lane code. | Present | **No** | **No** |
| `FLAGSMITH_ID_SALT` | Identity (2.2) | Added at 09:22 | Yes | Yes, the same value, Sensitive |
| `INTERNAL_USER_EMAILS` | Identity (2.3). It holds personal data: the team's real emails, lowercase, comma-separated. `@example.com` accounts are internal by domain and need not be listed. | Typed by the user at 09:27 (decision D118) | Yes | Yes |
| `EXPORT_FAILURE_DRILL` (D's) | Lane D's `request_card_export` handler, only when Flagsmith can't be read (3.6). A sample wedding's id. | Unset | Unset | Unset |

- **Vercel values** can only be added once the project exists. The user imports it in the Vercel dashboard at about 09:32 and adds `NEXT_PUBLIC_FLAGSMITH_ENVIRONMENT_ID` (the Production client-side key) by hand there. L adds the other Production values at about 09:35 with `npx vercel@66.6.0` from the empty scratch folder `~/jashn-vercel-cli`, and skips that one, because the main `.env.local` holds the Development key; the dashboard is the fallback (architecture 7.2 step 9; decisions D5, D71 and D119). They apply from the deploy of the contracts merge at about 09:50–09:55 (decision D70), before any code reads them. `NEXT_PUBLIC_` values must be set before that merge (architecture 5.3). A later change takes effect at the next production deploy.
- **Worktree copies** drop `FLAGSMITH_SERVER_KEY_PRODUCTION` and `FLAGSMITH_ORG_API_KEY`, and every copy except Lane C's also drops `FLAGSMITH_SERVER_KEY_SYNTHETIC` (architecture 5.3, 7.2 step 11). Server-side environment keys can't change flags, so no coding session holds a flag-changing credential.
- **Values are never printed.** Secrets go to the clipboard with `pbcopy` (architecture 5.3).
- There are no Preview-scoped values, because no preview is ever built (architecture 5.3).
- **Not created:** `FLAGSMITH_PROD_ENV_ID`, `FLAGSMITH_SYNTH_ENV_ID`, `FLAGSMITH_PROD_EXPERIMENT_ID`, `FLAGSMITH_SYNTH_EXPERIMENT_ID`, `FLAGSMITH_EXPECTED_ENV` and `FLAGSMITH_WEBHOOK_SECRET` (architecture 5.1). No Flagsmith code uses `JOBS_API_TOKEN`.

**Request budget (Free: 50,000 billable requests a month):**
- Billable calls are `/flags`, `/identities`, `/traits` and `/environment-document`. Management API calls aren't billable. Whether event posts count is unknown (U7).
- What one action costs:
  - a page render, a navigation or a refresh after `version` moves: 1;
  - a focus refresh on a planner screen: 1 (architecture 2.4);
  - a voice turn: 1;
  - a confirm: 1, plus 1 per voice action;
  - a new wedding: 1;
  - an export job: 1, plus 1 per claim;
  - an instance start: 1;
  - `/api/health`: at most 1 a minute per instance;
  - the synthetic run: about 805;
  - the drawer's probes: 50 per press.
- Expect a few thousand requests today, mostly focus refreshes (our estimate). Polls, guest pages and the render page cost nothing.
- Going over wouldn't block today anyway: Flagsmith warns by email 7 days before blocking.

---

## 7. The 09:00 setup

**Who is who in this section.** **The user** is the human lead. Flagsmith's free plan has one seat, so the user makes every dashboard change: setup, experiments, flips and rollout steps (decision D9). **L** is the lead's coding session: it writes the contracts, merges the batches and runs the command-line checks.

### 7.1 What should already exist from tonight (access prep only)

These come from research-flagsmith's tonight list:
- the account and organisation (Free);
- one empty project with Development, Production and a third, empty environment, Synthetic;
- the managed warehouse enabled in all three, each with Flagsmith's own test event;
- in the main `.env.local`, under the names in 6.10: `FLAGSMITH_SERVER_KEY` (Development), `FLAGSMITH_SERVER_KEY_PRODUCTION`, `FLAGSMITH_SERVER_KEY_SYNTHETIC`, `NEXT_PUBLIC_FLAGSMITH_ENVIRONMENT_ID` (Development) and `FLAGSMITH_ORG_API_KEY`.

Nothing else exists: no flags, segments, metrics, experiments, banners or trait settings. If any of the prep wasn't done tonight, do it first, at 09:25.

### 7.2 Dashboard, not the Admin API

**Decision:** the user creates everything in the Flagsmith dashboard (decision D9). The organisation API key (`FLAGSMITH_ORG_API_KEY`) stays on the laptop and is used only to read: the warehouse check (FV1). It is never on Vercel, never in a worktree and never used to write (architecture 5.1 and 5.3).

Flagsmith's coding-agent prompt is used neither for setup nor for instrumentation.

Reasons:
- **One seat.** Free allows one team member, so the user clicks either way. Twenty minutes of clicking needs no script.
- **The experiment features are in beta.** The wizard is the documented path. The API has undocumented fields (`audience` and the variation `key`), and a variation created through the API without a `key` is silently never counted.
- **The agent prompt would instrument the code its own way** and conflict with this spec. It also needs the Flagsmith CLI.
- **The dashboard shows each object as it is made,** which doubles as verification.

### 7.3 Order relative to the code

| IST | Who | Flagsmith step | Depends on |
|---|---|---|---|
| 09:06 | L | The pinned install includes `@flagsmith/nodejs@9.5.0`, and `npm ls` must show 9.5.0 (architecture 7.2 step 4) | The scaffold |
| 09:22 | L | In the main `.env.local`, never printed: generate `FLAGSMITH_ID_SALT` (architecture 7.2 step 8; build-kickoff step 10) | Tonight's keys |
| 09:25 | L | FV1: every warehouse says Connected (architecture 7.2 step 8) | Tonight's prep |
| 09:27 | The user | Types `INTERNAL_USER_EMAILS` into the main `.env.local`, in an editor (decision D118) | |
| ~09:32 | The user | Imports the project in the Vercel dashboard (decision D5), then adds one Production variable by hand: `NEXT_PUBLIC_FLAGSMITH_ENVIRONMENT_ID` = the Production client-side key (decision D119) | The scaffold PR merged (09:28) |
| ~09:35 | L | Adds the other Production values with `npx vercel@66.6.0` from `~/jashn-vercel-cli` (dashboard as fallback; architecture 7.2 step 9, 6.5; decisions D5 and D71): `FLAGSMITH_SERVER_KEY` (the Production server key, from `FLAGSMITH_SERVER_KEY_PRODUCTION`, never printed), `FLAGSMITH_ID_SALT` and `INTERNAL_USER_EMAILS`. It skips `NEXT_PUBLIC_FLAGSMITH_ENVIRONMENT_ID`, which is the user's, because the main `.env.local` holds the Development key (decision D119). They apply from the contracts-merge deploy at about 09:50–09:55. | The Vercel project |
| 09:35–09:55 | L | `src/contracts/flags.ts` from sections 2–5, and the stubs: `src/server/flags/index.ts` (its voice gate refuses every voice write, decision D47) and the disabled `VoiceDock` (architecture 4.3, 7.2 step 10; decision D121). The contracts PR merges at about 09:50–09:55 (decision D70). | This file |
| 09:38–09:58 | The user (the free plan's one seat means only the user can do this), while L writes the contracts | Dashboard steps A–E (7.4). Hard limit 10:30 (F20; decision D9). Anything unfinished comes first in the user's 10:00–10:45 (decision D119). | Nothing in code. Flags that exist before the code reads them do nothing. |
| ~09:55 | L | Worktrees, cut right after the contracts merge (decision D70). Lane C's env copy keeps `FLAGSMITH_SERVER_KEY_SYNTHETIC` (architecture 7.2 step 11). | The contracts merged |
| ~09:58–10:40 | C | Session C starts at about 09:58–10:05 (decision D70). `lane-c-voice` (7.7): the flags core first, with FV2 and FV8's health part on local dev by ~10:20; then VoiceDock, the chip, the real kill switch and voice.md's pipeline. `lane-c-synthetic-run` alongside. | The contracts |
| 10:45 | L | Batch (A → B → C → D): `lane-c-voice` and `lane-c-synthetic-run`. Then FV2 on production (architecture 6.4, step 3). From here, D builds on the environment-flag reader, and the real voice gate replaces the stub. | |
| ~10:50 | The user | Step F1: create and launch the Synthetic experiment, then tell Lane C to run | Metrics in Synthetic; its warehouse Connected |
| ~10:55 | C | The synthetic run from `jashn-c`: dry run, then the real run (5.8, 7.5 command 3) | F1; the script in `main` |
| 11:00 | The user | At the Flagsmith sponsor demo, ask about U1, U2, U4, U6, U7, U10 and U11 | |
| 11:00–11:40 | C | FV6 on local dev. FV10 and FV11 once Flagsmith has processed the run. Before the 11:40 batch, on local dev: FV4, FV5, FV13 and the rest of FV8. | The 10:45 batch |
| 11:15 | The user, then C | FV7 stage 1 (decision D47): the user turns `voice_writes_enabled` off in Production; C checks the deployed behaviour (7.6 FV7); the user turns it back on at once. If Lane C's pipeline splits (`lane-c-voice-pipeline`, D55), stage 1 moves to right after the 11:40 deploy, and the user flips the switch then (decision D121). | The 10:45 batch live |
| 11:40 | L | Batch: A's `experiment_exposures` migration first (if it didn't land at 10:45), then `lane-c-flags-drawer` and `lane-c-setup-experiment`. Then FV9. | |
| ~12:00 (12:45 at the latest) | The user | Step F2: create and launch the Production experiment. Then FV14 (a). | The 11:40 batch live |
| 12:30 | L, then the user | Batch. After its deploy, FV7 stage 2, the full kill-switch check (decision D47), and the batch's demo-path check. Then the user takes rollout step 1, once L says the turn gate holds. | FV7, the turn gate |
| 13:00–14:30 | The user | The NudgeBee recording with the drill (3.6) first, in the protected 13:00–13:30 slot (decisions D33 and D43). Then, 13:30–14:30: timestamped screenshots of both Flagsmith experiment pages, banners in frame, and of the drawer, and the 10-second refusal clip | |
| ~13:45 | The user | Rollout step 2 | The turn gate |
| 14:00 | The user | FV15 (usage) | |
| 14:00–14:45 | Team | Invite first-time testers (not internal). Then FV14 (b) on the first one. | F2 running |
| ~14:30 | The user and L | Rollout step 3. Decide the NudgeBee beat's mode (3.6; decision D40). | The turn gate |
| 14:45 | Everyone | Freeze. The README rollout log is complete. | |

- FV12 runs on every batch's build.
- Start the Production experiment only after its exposure and conversion code is live in production. Starting earlier records nothing useful, and the flag can't be edited while its experiment runs.
- If `lane-c-flags-drawer` misses the 11:40 batch, F2 still launches after it, because the experiment doesn't need the drawer. FV9 and FV14 (a) then run after the 12:30 batch.

### 7.4 Dashboard steps, with exact values

Dashboard labels may differ slightly from the words here. The values must not.

**Step A: environment settings, in Development, Synthetic and Production.**
1. Banner:
   - Production: on, red, "PRODUCTION · real users".
   - Synthetic: on, purple, "Synthetic data · scripted traffic, planted effect".
   - Development: off.
2. "Persist traits when using client-side SDK keys": off.
3. "Hide Sensitive Data": off.
4. "Use Consistent Hashing": leave it untouched.
5. Environment Settings › Warehouse: confirm Connected. If it isn't, use "Send your first event" again.

**Step B: flags.** Create each one once; it then appears in every environment. For each, paste the description shown, tick "Server-side only", and add the tags.

| Flag | Create as | Description (paste) | Then per environment |
|---|---|---|---|
| `voice_pilot` | Standard, no value, not enabled by default; tag `rollout` | "Who gets voice (mic and voice routes). Off by default; on for segment internal_team and for segment voice_rollout (10 → 50 → 100%). Server-side only." | Off in all three |
| `voice_writes_enabled` | Standard, enabled by default; tags `kill-switch` and `protected` | "KILL SWITCH. Off: the server refuses every voice-originated write, at the turn and in the dispatcher. Questions and typing keep working. Fails closed. Never add overrides." | On in all three |
| `spoken_replies` | Standard, enabled by default | "Off: no Bulbul audio; the reply text still shows." | On in all three |
| `setup_entry` | Multivariate, enabled by default, control value `form_first`. Add one variation with value `voice_first`, label `voice_first` and weight 0%. Tags `experiment` and `protected`. | "EXPERIMENT. Which input new-wedding setup opens on: control form_first, variation voice_first. Never add overrides or change weights." | Enabled in all three; check that the variation shows its label |
| `setup_entry_synthetic` | Exactly like `setup_entry`; tags `synthetic`, `experiment` and `protected` | "SYNTHETIC ONLY. Twin of setup_entry, read only by the scripted run in the Synthetic environment, so it never touches the real experiment." | Enabled in all three; check the label |
| `env_label` | Standard, enabled by default, value `development`; tag `system` | "Names this environment. Read by Jashn's self-check and the synthetic run's guard." | Set the value to `synthetic` in Synthetic and to `production` in Production |
| `export_failure_drill` | Standard, not enabled by default, with an empty value; tag `ops` | "OPS DRILL. Set the value to the sample wedding's id, then enable: that wedding's next card export fails once on purpose (DRILL_INJECTED) so NudgeBee can recover it. Disable and clear the value straight after." | Disabled and empty in all three |
| `card_renderer` | Standard, enabled by default, value `chromium`; tag `ops` | "Card export renderer: chromium (Hindi shaping) or og (Latin-only fallback). Read at each render claim." | `chromium` in Development and Production |
| `image_extraction_provider` | **Only when #11's build starts (step G).** Standard, enabled by default, value `off` | "Should #11 card reader: docai (Sarvam Document AI), gemma4 (backup reader) or off (hidden). Fallback off. Server-side only." | Step G |

**Step C: segments, at project level.** Enter the trait names and values exactly, in lowercase.
1. `internal_team`: one condition, `is_internal` Equal `true`. Description: "Jashn team and fictional demo accounts."
2. `voice_rollout`: conditions `role` In `owner,manager`; `preferred_language` In `en,hi`; `% Split` 10. Description: "Voice pilot rollout. Split 10 → 50 → 100; times in the README."
3. `new_owners`: conditions `role` Equal `owner`; `is_first_wedding` Equal `true`; `is_internal` Equal `false`. Description: "First-time, non-internal owners: the experiment audience."

**Step D: segment overrides on `voice_pilot`.**
- Development: add `internal_team` → on (priority 1), then `voice_rollout` → on (priority 2).
- Production: add `internal_team` → on only. `voice_rollout` is added at rollout step 1.
- Synthetic: none.

**Step E: metrics, in Synthetic and Production** (metrics are defined per environment).
1. "Setup saved": event `setup_saved`, aggregation Occurrence, higher is better.
2. "Seconds to save": event `setup_saved`, aggregation Mean, lower is better.

If the form won't allow a second metric on the same event (U11), use event `setup_save_seconds` for the second metric instead, and tell session C. That is one line in `src/contracts/flags.ts`, and the conversion then sends both events (5.4).

**Step F: the experiments (later; see 7.3).** Create them only once the environment's warehouse says Connected.
- **F1, Synthetic (~10:50).**
  1. Name and hypothesis from 5.1's Synthetic column.
  2. Flag `setup_entry_synthetic`; rollout 100%; split 50/50.
  3. Audience `new_owners`, if the wizard offers one (U4).
  4. Primary metric "Setup saved" (increase); "Seconds to save" (should not increase), if a second metric is allowed.
  5. Launch it, then tell Lane C to start the synthetic run (7.5 command 3).
- **F2, Production (~12:00, after the 11:40 batch is live).**
  1. Name and hypothesis from 5.1's Production column.
  2. Flag `setup_entry`; rollout 100%; split 50/50.
  3. The same audience and metrics as F1.
  4. Launch it, and note the launch time in the README.
  5. Never end it today.

**Step G: `image_extraction_provider`, only when #11's build starts** (doc-ai 5.2).
1. Create it as in step B, with value `off`.
2. Production: default `off`; add a segment override for `internal_team` with the chosen reader (normally `docai`).
3. Development: set the value to the chosen reader.
4. Later, once #11's checks pass on production, set the Production default to the chosen reader and note the time in the README's experiment notes (7.8).

**Step H: the Usage page.** Look at Organisation › Usage at 14:00 (FV15).

### 7.5 Commands (Run at 09:00 or later)

Architecture 7.2 already covers the install, the `.env.local` edits, the worktree copies and the Vercel values. L adds those with `npx vercel@66.6.0` from `~/jashn-vercel-cli`, Production scope only, with the dashboard as the fallback (architecture 7.1 trap 28; decision D5). `NEXT_PUBLIC_FLAGSMITH_ENVIRONMENT_ID` is the one exception: the user adds it at the import (decision D119). Flagsmith adds these four.

**1. FV1, the warehouse check** (lead, at 09:25, from the main folder). It reads the organisation key from the main `.env.local` without printing it. Repeat it with each environment's client-side key, copied from the dashboard; Development's is also in `NEXT_PUBLIC_FLAGSMITH_ENVIRONMENT_ID`. It prints the connection's `status` and `total_events_received`.

Run at 09:00 or later, from `~/Desktop/Personal/Jashn`:

```bash
curl -s -H "Authorization: Api-Key $(grep -E '^FLAGSMITH_ORG_API_KEY=' .env.local | cut -d= -f2-)" "https://api.flagsmith.com/api/v1/environments/<client-side key>/warehouse-connections/"
```

**2. The health check** (lead, after every batch and in every pre-flight). The route is public and its answer holds no secrets. Check that `flags.ok` is true, `env_label` is `production` and `fallback_flags` is empty. On local dev, use the same path on the worktree's port, such as `http://localhost:3003` for Lane C.

Run at 09:00 or later:

```bash
curl -s "https://<production domain>/api/health"
```

**3. The synthetic run** (Lane C, after F1 and the lead's go-ahead). The dry run sends no events. Read its output, then start the real run.

Run at 09:00 or later, from `~/Desktop/Personal/jashn-c`:

```bash
node --env-file=.env.local --import tsx scripts/synthetic-setup-traffic.ts --dry-run
node --env-file=.env.local --import tsx scripts/synthetic-setup-traffic.ts --start 1 --count 800
```

**4. Only if the hosting fallback is triggered** (architecture 8 row 10, by 15:00). Build and serve with the Production values. The server key is read from the main `.env.local` without printing it, and values set in the shell take precedence over `.env.local`. The build gets the client-side key too, in case Next inlines `NEXT_PUBLIC_` values into server code at build time (our caution). `next start` runs with `NODE_ENV` set to production, so `env_label` expects `production` (3.5).

Run at 09:00 or later, from `~/Desktop/Personal/Jashn`:

```bash
NEXT_PUBLIC_FLAGSMITH_ENVIRONMENT_ID="<Production client-side key>" npm run build
FLAGSMITH_SERVER_KEY="$(grep -E '^FLAGSMITH_SERVER_KEY_PRODUCTION=' .env.local | cut -d= -f2-)" NEXT_PUBLIC_FLAGSMITH_ENVIRONMENT_ID="<Production client-side key>" npx next start --port 3000
```

### 7.6 How to verify each item

| # | What | How | Pass | When |
|---|---|---|---|---|
| FV1 | Warehouses | Environment Settings › Warehouse in each environment, or 7.5 command 1 | Connected, with events received ≥ 1 | 09:25 |
| FV2 | Flags exist, and each process is bound to the right environment | `/api/health` (7.5 command 2), on local dev and on production | `flags.ok` true; `fallback_flags` empty; `not_created` holds at most `image_extraction_provider`; `env_label` `development` locally and `production` on production; `events_probe_status` 2xx | Locally before `lane-c-voice` is marked ready; on production after the 10:45 batch and after every batch |
| FV3 | Settings, tags, descriptions and variation labels | The Features list in each environment | As in step B. `voice_writes_enabled` is tagged `kill-switch` and `protected`. Both multivariate flags show the `voice_first` label. | ~09:58, when step E is done (10:30 at the latest) |
| FV4 | Segment matching | The drawer on local dev: "Run 50 probes", and Mira's own reason under "This session" | Mira's reason names `internal_team`. At 10%, about 5 of the 50 probes are on with a reason naming `voice_rollout`; the rest are off. | ~11:20, on `lane-c-flags-drawer` |
| FV5 | Split determinism | The same probes on local dev, with the split at 10, then 50, then back to 10. All of it happens before rollout step 1. | Every probe that was on at 10 is still on at 50; back at 10, exactly the first set is on | ~11:25, and before 12:30 |
| FV6 | Flip-to-effect time | Local dev, as Mira on a planner screen: switch to Flagsmith Development, turn `voice_writes_enabled` off, switch back to Jashn. Then turn it on again. | "Questions only" appears within 3 seconds of the tab regaining focus, and goes on the next focus after turning it on (the live beat needs this) | ~11:00, once the 10:45 batch has merged `LiveRefresh` and VoiceDock |
| FV7 | Kill switch end to end (decision D47) | On production, laptop and phone, signed in as an internal account. The user turns writes off in Flagsmith, and C checks. **Stage 1, 11:15** (right after the 11:40 deploy if Lane C's pipeline splits, decision D121), only what is deployed: (a) speak a change: refused at the turn, status `paused`, the "Questions only" chip; (b) if a write handler is live, confirm a preview made before the flip: 423. **Stage 2, after the 12:30 deploy:** (b) a voice write pending from before the flip, confirmed after it: 423; (c) type the same change: saved once (R-03's requirement form, or, if the requirement form isn't merged, an Events edit such as a dress code; decision D114); (d) ask O-03, or another read-only question: answered (X-06). Then the user turns writes back on, and L logs the result for the README. | Nothing written with `source` `voice` while off; the typed save lands exactly once; the question is answered | Stage 1 at 11:15 (after the 11:40 deploy if the pipeline splits); stage 2 after the 12:30 deploy, before rollout step 1; then in every rehearsal |
| FV8 | Fallbacks | Local dev in C's worktree with a deliberately wrong `FLAGSMITH_SERVER_KEY`, restored afterwards | `/api/health` shows `flags.ok` false with every flag under `fallback_flags`, and the start-up line says FAILED. Pages render; setup opens form-first with no exposure; no conversion is sent; internal accounts get "Voice · safe mode" and questions only; others get no mic; the drawer shows "fallback" for every flag. | The health part by ~10:20; the dock part before 10:45; the setup and drawer parts before 11:40 |
| FV9 | Serverless flush | On production as an internal account, the drawer's "Run check again" (it sends the direct probe and the SDK probe), then the Production warehouse card | Events received rises by at least 2 within ~5 minutes. FV14 (b) is the final proof, because a real exposure takes the same `after()` path. | After the 11:40 batch |
| FV10 | Exposures on both arms | The Synthetic experiment, after the run | Both arms above 0, close to 50/50 | ~11:15 |
| FV11 | Conversions | The same experiment's metrics | Conversions counted per arm. "Collecting data" with counts is fine for the first minutes. | ~11:30 |
| FV12 | Dynamic routes | The `next build` route table | Every flag-reading route is dynamic (ƒ) | Every batch |
| FV13 | No exposure from prefetch (decision D121) | Development has no experiment and test owners are internal, so no exposure is ever recorded locally. Instead: (a) watch the server log for the setup page's entry-decision line (row and arm, 3.4) while visiting pages that link to `/setup` without opening it, then open `/setup`; (b) a unit test injects an in-experiment evaluation and asserts one exposure per render. | (a) The line appears only on a real `/setup` render; (b) the test passes. The real exposure is FV14 (b) on production. | Before the 11:40 batch, on local dev |
| FV14 | The Production experiment is live | (a) The drawer's "Run 50 probes" on production right after F2. (b) The first non-internal tester. | (a) Every probe shows `inExperiment` true, with both variants present. (b) Their row appears in `experiment_exposures` at once (the drawer's "Sent by Jashn" count rises), and the exposure in Flagsmith within ~10 minutes (acceptance AT-1.8). No internal identity ever appears. | (a) ~12:00; (b) 14:00–14:45 |
| FV15 | Budget | Organisation › Usage | Under 10,000 | 14:00 |

### 7.7 Delivery: topic branches, pull requests and team rules

These follow architecture 6.1–6.4.

- **Worktree:** `~/Desktop/Personal/jashn-c`, dev port 3003. L creates it right after the contracts merge, at about 09:55, on the first branch, `lane-c-voice` (architecture 7.2 step 11). Session C starts at about 09:58–10:05 (decision D70).
- **Topic branches.** After `lane-c-voice`, session C cuts one short-lived `lane-c-<topic>` branch per reviewable piece (architecture 6.1). It cuts from `origin/main`, or from an open branch when the topic depends on it; merge commits keep that safe (architecture 7.1 trap 24). Every branch name starts with `lane-`, so Vercel never builds it (architecture 6.5).
- **Pull requests.** Every change reaches `main` through a pull request on github.com/omiiii21/Jashn. Session C opens each PR as a draft (`gh pr create --draft`) and marks it ready with `gh pr ready` once its checks pass (decision D30). The lead merges it as a merge commit, in the batch order A → B → C → D, at 10:45, 11:40, 12:30, 13:45 and 14:30 (architecture 6.4). Merged topic branches are deleted on GitHub automatically.
- **PR titles** are the session letter, a colon and what the PR delivers, such as "C: setup screen with the voice-first experiment" (architecture 6.2). The body says what changed, how it was tested (laptop, phone, production), schema and env changes, and follow-ups.
- **No AI tool names.** Branch names, commit messages, PR titles and PR descriptions never mention Claude or any AI tool, and carry no AI attribution line, Co-Authored-By trailer or "Generated with" footer.
  - A local commit-msg hook strips AI footers, and then rejects any message that still contains the word "claude". So write "agent instructions", never the agent-instructions file's name.
- **AI disclosure.** AI assistance is disclosed in the README and on the submission form, as the hackathon requires (decision D31; presentation.md §6 holds the text).
- **gh.** Every gh command for this repo runs with `GH_TOKEN` taken from `gh auth token --user omiiii21`, and with `--repo omiiii21/Jashn`. Never run `gh auth switch`.

Session C's Flagsmith topics (doc-ai 5.6 adds `lane-c-card-reader`; voice.md adds its own voice topics):

| Branch | Batch | PR title | Flagsmith contents | Verified by |
|---|---|---|---|---|
| `lane-c-voice` | 10:45 | C: voice dock with server-side flags and the voice write switch | `src/server/flags/`: client, identity, evaluation, gates (voice availability, and the real voice gate, failing closed), reason labels, the self-check and its summary for `/api/health`, and the environment-flag reader for D. `index.ts` replaces the stub; the setup-saved hook stays a no-op. VoiceDock with the reason chip, the "Questions only" and "safe mode" chips, the turn-time refusal and `voice_turns.flags`; voice.md's record, transcribe, preview and confirm. | FV2 and FV8 (health and dock parts) locally; FV2 on production after the batch; then FV6 and FV7 |
| `lane-c-synthetic-run` | 10:45 | C: scripted traffic run for the synthetic Flagsmith environment | `scripts/synthetic-setup-traffic.ts` | The guard tests (5.8); C's dry run |
| `lane-c-flags-drawer` | 11:40 (12:30 at the latest) | C: team flags drawer with session flags, health and probes | The chip popover's button; `FlagDrawer` with its four parts (5.9) and its server actions, including probe mode and the "Sent by Jashn" counts (needs A's `experiment_exposures` migration) | FV4, FV5 and the drawer part of FV8 locally; FV9 on production |
| `lane-c-setup-experiment` | 11:40 | C: setup screen with the voice-first experiment | Both arms, the entry decision and its log line, the exposure and its `experiment_exposures` row, the setup-saved hook, the `after()` flushes, prefetch off | FV8's setup part, FV12 and FV13 locally; FV14 after F2 |
| `lane-c-<fix>` | 12:30, 13:45, 14:30 | "C:" and one plain line per fix | Fixes from FV14 and the rehearsals | The demo-path spec |

Example routine for the first PR and the next topic, following architecture 6.2. The first line runs the checks: `npm test` always, plus `npm run test:db` if the branch has database tests (`*.db.test.ts`; decision D103). The `gh pr ready` line runs once they and CI pass; the last two lines run after the 10:45 merge.

Run at 09:00 or later, from `~/Desktop/Personal/jashn-c`:

```bash
npm run check && npm test && npm run build
git push -u origin lane-c-voice
GH_TOKEN="$(gh auth token --user omiiii21)" gh pr create --draft --repo omiiii21/Jashn --base main --head lane-c-voice --title "C: voice dock with server-side flags and the voice write switch" --body "What changed, how it was tested (laptop, phone, production), schema and env changes, follow-ups."
GH_TOKEN="$(gh auth token --user omiiii21)" gh pr ready lane-c-voice --repo omiiii21/Jashn
git fetch origin
git switch --no-track -c lane-c-setup-experiment origin/main
```

### 7.8 What the README must say about Flagsmith

The lead writes it from these points:
1. **Before 09:00:** "Before 09:00 we only created the Flagsmith account, an empty project with three environments, server keys and an organisation key, and enabled the managed warehouse. Everything else was created after 09:00." Correct it to what was actually done.
2. **The three environments** and what each is for (1.1).
3. **The flags table,** in short (3.0).
4. **The rollout log:** the time of each step, its gate numbers, and the note that most gate turns were team rehearsals.
5. **The experiment:**
   - the hypothesis and the launch time;
   - the real n per arm and the saves per arm at submission, as Flagsmith's page shows them;
   - "Collecting data", and the 385-per-arm yardstick;
   - the experiment notes: the time any setup-screen change went live in both arms, such as #11's card entry (3.8).
6. **The synthetic disclosure text** (1.2), and the run's time, counts and seed.
7. **Every kill-switch flip and drill arming** made during the demo or a recording, with its time.
8. **The fail-closed decision,** in one sentence.
9. **Where the numbers live:** Flagsmith's own experiment pages. Jashn computes no statistics, shows no synthetic number, and keeps the organisation key off every deployment.

---

## 8. The "best use of Flagsmith" story

### 8.1 Why this is a strong use

- **Three flags do real work.** Remove Flagsmith and there is no experiment, no staged voice rollout, and no way to stop voice writes short of a redeploy.
- **The experiment is wired by the book:**
  - a stable opaque identity;
  - the exposure at render, for both arms, behind an eligibility gate, with prefetch off;
  - the conversion after commit, flushed in `after()`;
  - multivariate from the start;
  - one guardrail metric (5.11).
- **The statistics are honest:**
  - real n, marked "Collecting data", on Flagsmith's own page;
  - a separately flagged, bannered synthetic run with a disclosed planted effect;
  - our own sample-size yardstick.
- **Operational care:**
  - a server-enforced kill switch that fails closed;
  - a self-check that catches a wrong key or the wrong environment;
  - a drill flag that hands NudgeBee a real failure to recover.
- **Visible in the product:** the reason chip; the "Questions only" state; the refusal that hands over a prefilled form.
- **Visible in Flagsmith:** the real experiment beside the bannered synthetic one, the % rollout, and the tagged kill switch.

### 8.2 The live demo: 20 seconds (demo-script 2:10–2:30)

**Laptop layout** (demo-script 1): Mira's Chrome window fills the left two-thirds, and the phone mirror fills the right third. Mira's window has these tabs:
1. Jashn, signed in as Mira. It starts on Money → Annapoorna Caterers, and at 2:10 it is wherever beat #7 left it;
2. Flagsmith Production › Features, with `voice_writes_enabled` in view;
3. Flagsmith Production › Experiments › "Setup entry: voice-first vs form-first (real new owners)";
4. Flagsmith Synthetic › Experiments › "SYNTHETIC DATA: setup entry, 800 scripted owners, planted 50% vs 60%";
5. in the background, the Reception "Add requirement" form with "Jain food" typed (demo-script's fallback).

Acceptance 3.1 already lists the tabs in this order.

| Clock | Keys | Screen | What judges see |
|---|---|---|---|
| 2:10–2:15 | Cmd+3, then Cmd+4 at about 2:12 | Flagsmith's two experiment pages | Under the red "PRODUCTION · real users" banner: today's real exposures and saves per arm, and "Collecting data". Then, under the purple "Synthetic data" banner: Flagsmith's result for the 800 scripted owners. |
| 2:15–2:18 | Cmd+2 | Flagsmith Production › Features | `voice_writes_enabled` toggled off and confirmed |
| 2:18–2:25 | Cmd+1 | Jashn | The tab regains focus, and the focus refresh shows "Questions only" next to "Voice · team preview". The lead speaks #8: "Reception mein barah logon ke liye Jain khana add karo." The server refuses the write, and the app says R-03's line. The Reception's add-requirement form opens with the heard values, marked to check. |
| 2:25–2:30 | – | Jashn | The lead clears the quantity, types 12 and taps Save. REQ-10 is saved by typing, and ACT-10 appears (demo-data D5). |

**What to say:** three sentences, spoken around the actions and the app's own reply.
1. (2:10–2:15) "Flagsmith runs our voice-first versus form-first setup test: real counts, too small to call, beside a labelled synthetic run."
2. (2:15–2:18) "Now suppose voice mishears amounts: one switch, and the server refuses voice writes."
3. (2:25–2:30) "Questions still work; typing still saves."

**Notes for this beat:**
- This keeps demo-script's order and timing. It adds the Synthetic page, and sentence 1 names it as synthetic, which the pitch must do whenever it is on screen.
- If FV6 measured more than 3 seconds from flip to effect, flip first (Cmd+2 at 2:10), then show tabs 3 and 4 (2:13–2:18) while the change spreads, then Cmd+1.
- If the chip hasn't changed when the tab regains focus, speak #8 anyway. The turn reads the switch afresh, and the refused turn's response turns the chip on (6.9).
- If an experiment page is slow, show its 14:30 screenshot, labelled "screenshot, 14:30" (F7).
- If the prefilled form doesn't open, use tab 5.
- If running behind (demo-script), skip tabs 3 and 4, say sentence 1 anyway, and do only the flip and the refusal.
- Straight after the run, turn `voice_writes_enabled` back on (and disarm the drill in live mode), and log both times for the README.

### 8.3 Pre-flight additions for this beat (before every run)

1. **In Flagsmith Production:**
   - `voice_writes_enabled` is on;
   - `spoken_replies` is on;
   - `export_failure_drill` is disabled with an empty value, unless the lead chose live mode at 14:30; then it is enabled with the demo copy's wedding id (export-and-recovery 4.4);
   - `card_renderer` is as decided at 12:15;
   - `image_extraction_provider`, if it exists, is as decided.
2. **`/api/health` on production** (7.5 command 2): `flags.ok` true, `env_label` `production`, `fallback_flags` empty.
3. **In Jashn as Mira, open the drawer and check:**
   - no flag is marked "fallback";
   - the chip reads "Voice · team preview";
   - Health is green;
   - "Sent by Jashn" shows today's counts with a recent as-of time.
4. **The Flagsmith dashboard** is signed in inside Mira's Chrome profile, with tabs 2–4 loaded and both experiment pages reloaded within the last 10 minutes, each with its banner in view.
5. **Tab 5** is open with "Jain food" typed.
6. **The 14:30 screenshots** of both experiment pages, with their timestamps and banners in frame, are ready as the last fallback (F7).

### 8.4 The submission video: 20 seconds (demo-script 1:55–2:15, shots V13 and V14)

| Seconds | Shot | Caption |
|---|---|---|
| 0–3 (V13) | Flagsmith's Production experiment page, red banner, "Collecting data" | "setup_entry: voice_first vs form_first · real users · n = ⟨real count⟩ · too small to call" |
| 3–6 (V13) | Flagsmith's Synthetic experiment page, purple banner | "Synthetic data: 800 scripted owners, planted 50% vs 60%. Tests the wiring, not the product." |
| 6–8 (V13) | `voice_writes_enabled` switched off | "voice_pilot rolled out 10 → 50 → 100% · voice_writes_enabled → off" |
| 8–15 (V14) | R-03 refused, with the "Questions only" chip; the reply plays | The R-03 line, in Devanagari with an English translation |
| 15–20 (V14) | The typed save | "Typing still saves" |

**Voice-over** (about 45 words; it replaces demo-script's line for 1:55–2:15): "Flagsmith splits new owners between voice-first and form-first setup. Today's real counts are too small to call; a clearly labelled synthetic run proves the wiring. Voice reached people in steps, and one switch makes the server refuse voice writes, while typing keeps working."

- Fill the ⟨real count⟩ slot only from what Flagsmith shows at recording time.
- Write the rollout caption from the README log at recording time. If step 3 hasn't happened yet, the caption says "10 → 50%".
- Every frame of the Synthetic page keeps its banner in view.
- Restore the flag straight after V14 (demo-script).

### 8.5 Flagsmith questions judges are likely to ask

1. **"What breaks if you delete Flagsmith?"** There would be no experiment, no staged rollout and no kill switch short of a redeploy. The setup screen, the mic, the voice routes and the dispatcher's voice gate all read flags on the server for every request.
2. **"Why is your experiment inconclusive?"** Because it is real. Flagsmith withholds statistics below 50 owners and 5 saves per arm, and a 10-point effect would need about 385 per arm. The synthetic environment, with its own flag and banner, proves the instrument works, and we label it every time.
3. **"Where do the numbers come from?"** From Flagsmith: the experiment pages are Flagsmith's own, under each environment's banner. Jashn computes no statistics. Our team drawer shows only what Jashn sent, labelled as app-side counts, so we can tell a processing delay from a lost event.
4. **"What happens if Flagsmith is down?"** Pages still render. Voice drops to questions only, because the kill switch fails closed. Setup opens form-first with no exposure recorded, and the drawer says "fallback".
5. **"How do you know events actually arrive?"**
   - The self-check posts a probe with the deployment's key and needs a 2xx.
   - `env_label` catches a key from the wrong environment.
   - The drawer's "Sent by Jashn" counts can be compared with Flagsmith's page.
6. **"Why not show the results inside Jashn?"** Reading results needs Flagsmith's organisation key, which on Free can also change flags. So it never goes near a deployment, and Flagsmith's page is the source of truth anyway.

---

## 9. Risks

| # | Risk | Trigger (time and signal) | Fallback |
|---|---|---|---|
| F1 | A warehouse never reaches Connected | 09:25, FV1 shows Pending or Errored | Send the test event again. Ask in the Flagsmith Discord and at the 11:00 sponsor demo. If Production still isn't Connected by 12:30 (architecture 8 row 9), the drawer's labelled "Sent by Jashn" counts are the real result, and research-flagsmith's risk R1 applies. Claim no Flagsmith statistics, and say why. |
| F2 | Wrong or missing key in a process, including the Development key on Production | After every batch: `/api/health` shows `flags.ok` false, or an `env_label` mismatch | Fix the value in Vercel and redeploy (about 5 minutes). Experiment events stay off while it's red, so no environment is polluted. |
| F3 | Events silently dropped (401/403), or lost when the function freezes | `events_probe_status` non-2xx, or FV9 shows no rise by 11:55 | Check the key type and value. If only the `after()` flush loses events, await the flush before responding, on the setup render and the conversion only. |
| F4 | A Pending warehouse blocks creating an experiment (U2), or the wizard refuses | 10:50, at F1 | Create each experiment once its environment is Connected. F2 may slide to 12:45 at the latest; if it is still blocked then, follow F1. |
| F5 | The flip takes too long to reach the server | ~11:00, FV6 above 3 seconds | Reorder the live beat (8.2 notes). Above 20 seconds, play the 10-second refusal clip recorded 13:30–14:30, labelled "recorded". demo-script's other fallback, the refusal's log line (3.2), needs the Vercel logs tab, which keeps 1 hour. |
| F6 | Flagsmith unreachable on stage | Pre-flight: `/api/health` shows `flags.ok` false, or the drawer shows "fallback" | Voice writes are off (fail closed). Do the voice beats by typing, per demo-script's fallbacks, and say "Flagsmith is unreachable, so voice is in safe mode." Show the experiment from the 14:30 screenshots. |
| F7 | A Flagsmith page is slow, or the dashboard has signed out | During the beat, or at the pre-flight | Show the 14:30 screenshots, labelled "screenshot, 14:30" (demo-script). If the flip can't be made, play the refusal clip. |
| F8 | No real traffic | 14:30, fewer than 2 Production exposures | Invite first-time testers in the 14:00–14:45 window. Report the true n, even 0. Never top up with team accounts or synthetic traffic. |
| F9 | Exposure leak: prefetch, an internal account, an ineligible user | FV13 before the 11:40 batch, or an internal identity showing up later | Prefetch off. If needed, move the exposure into a server action called when the setup screen mounts. Fix the gate, and disclose the leaked count in the README. |
| F10 | The Production experiment ended or edited by mistake | Any time after F2 (~12:00); its page is checked in every pre-flight | Never end it today. If it happens, launch a new one, and report both, with times. |
| F11 | Synthetic data shown without its label | The 14:45 freeze review, and before recording at 15:30 | Check every screen, slide, caption and clip for the banner or caption. Cut anything unlabelled. |
| F12 | The kill switch or the drill left in the wrong state | Pre-flight before every run, and again at 16:35 | Restore both. The drawer and the pre-flight show them. |
| F13 | Free-plan gaps: an empty audit log, webhooks unknown | 09:38, step A | The README's rollout and flip log, with times, is the record |
| F14 | A bug in SDK 9.5.0 (published 23 Nov) | 11:30: events missing, evaluation errors or `reason` empty | The lead switches to the 9.4.0 fallback pin (architecture 1.1) in a `lane-lead-` PR. The chip then shows the neutral label, because 9.4.0 has no `reason`. |
| F15 | Request budget | 14:00, Usage above 10,000 | Find the loop: a focus-refresh storm, or `/api/health` called past its cache. The polls themselves never evaluate flags. |
| F16 | The rollout gate isn't met for step 3 | 16:15 | Too few turns: take the step and note it. Too many failures: hold, and mark the rollout Partial in the README. |
| F17 | Rule 4 perception | Judging, after 17:00, when a judge asks | The README line in 7.8 item 1 |
| F18 | Jashn's counts and Flagsmith's disagree | 14:30 | Expected while Flagsmith processes, so the drawer's counts carry their as-of time. If they still differ after 15 minutes, check deduplication and the gate, and report it. |
| F19 | Hosting fallback: the laptop behind a cloudflared tunnel (architecture 8 row 10, decided by 15:00) | Vercel can't deploy `main` | Build and start with the Production server key and client-side key (7.5 command 4). Confirm `/api/health` shows `flags.ok` true and `env_label` `production` before any phone uses it. The experiment pages and the switch are in Flagsmith, so the beat is unchanged. |
| F20 | The user's dashboard time slips (decision D9) | No flags by 10:15 | Lane C keeps building on fallbacks. Unfinished steps come first in the user's 10:00–10:45 (decision D119). The dashboard must be done by 10:30, before the 10:45 batch puts real flag reads on production. |

### 9.1 Unknowns to close between 09:00 and 11:30

| # | Unknown (research-flagsmith numbering) | Closed by |
|---|---|---|
| U1 | Real ingestion latency once Connected | FV9, then the 11:00 sponsor demo |
| U2 | Whether Pending Connection blocks creating or starting an experiment | F1 |
| U3 | One active experiment per flag across environments | No longer blocks anything: the twin flag (3.9) |
| U4 | Whether the wizard offers an audience | F1 |
| U6 | How fast a flag change propagates | FV6 |
| U7 | Whether event posts count towards the 50,000 requests | The Usage page at 14:00 |
| U8 | The JSON shape of `results` and `exposures` | Not needed: Jashn doesn't read results |
| U9 | What `pause` does | Not needed: nothing here pauses an experiment |
| U10 | Remote-evaluation `reason` strings | FV4. The chip matches on the segment name, so any format works. |
| U11 | Two metrics on one event | Step E |

---

## 10. Changes other specs need

### 10.1 domain-and-data.md

1. **Flag names** (0.2's rename row, the `voice_unavailable` error row and open question 6). Use `voice_pilot` (the mic and the `/api/voice/*` gate), `spoken_replies`, `voice_writes_enabled` and `setup_entry`. The rollout segment is `voice_rollout`. Architecture 9 item 16 already settles this.
2. **V3, 3.8 and section 7 step 9 (R-03).** Add the early check at `/api/voice/turn`. When the switch is off and the proposal has a write:
   - the turn is stored `paused` with `refusal_code` `voice_writes_paused`;
   - no confirm is offered;
   - the response is 200, with the fixed refusal reply and the prefill;
   - questions are still answered.

   The dispatcher's step 4 and `/api/voice/confirm` keep the authoritative 423. The R-03 walkthrough becomes: no preview, and the turn is paused at once.
3. **A new table, `experiment_exposures`,** in section 5, with the columns in 5.10. Lane A creates it, Lane C's module writes it outside the dispatcher, and it never moves `version` (architecture 9 items 13 and 14).
4. **`set_wedding_profile`, after commit (3.1).** The conversion goes only to a create with outcome `applied`, by a non-internal user who now owns exactly one wedding. It is never sent for `replayed` or `unchanged`.
   - The value comes from `experiment_exposures.exposed_at`, or from `setup_opened_at` when there is no row, and is clamped to 0–3600 seconds.
   - It runs in `after()` and never fails the command.
5. **The dispatcher's actor context** includes the signed-in user's email, server-only, so Lane C can compute `is_internal`. The email is never sent to Flagsmith, logged or returned.
6. **`request_card_export` (3.7).** Honour `export_failure_drill` only when it is enabled and its value equals the job's `wedding_id`, on a wedding with `is_sample` true. The env fallback `EXPORT_FAILURE_DRILL` holds a wedding id, not `once`, and applies only when Flagsmith can't be read. export-and-recovery 11 asks for the same change.
7. **`voice_turns.flags`** records `voice_pilot`, `voice_writes_enabled`, `spoken_replies`, `env_label`, the setup variant (in setup turns) and `fallback` (true when any value was a fallback).
8. **`voice_unavailable` (403)** is also the answer when Flagsmith can't be read and the user isn't internal.
9. **G8.** Add `FLAGSMITH_ID_SALT`, `FLAGSMITH_SERVER_KEY_PRODUCTION`, `FLAGSMITH_SERVER_KEY_SYNTHETIC`, `FLAGSMITH_ORG_API_KEY` and `INTERNAL_USER_EMAILS` (which holds personal data). Architecture 9 item 7 lists them, with `RENDER_TOKEN_SECRET` and `NUDGEBEE_EXPORT_WEBHOOK_URL`. Apply that item's renames as well: `JOBS_API_TOKEN` for `OPS_API_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY` for `SUPABASE_SECRET_KEY`, and `NUDGEBEE_EXPORT_WEBHOOK_URL` for `NUDGEBEE_WEBHOOK_URL`. `FLAGSMITH_SYNTHETIC_KEY`, `FLAGSMITH_INTERNAL_EMAILS` and `FLAGSMITH_WEBHOOK_SECRET` don't exist.

Architecture 9 also asks domain-and-data for the focus refresh (item 5), the operational-write rule (item 14) and the fail-closed voice gate (item 17). This file agrees, and adds nothing to them.

### 10.2 architecture.md

1. **No conflicts** with its 04:07 revision. Its section 11 requests for this file are applied:
   - 7.7 uses topic branches and "C:" titles;
   - the drill's value is a sample wedding's id, and `EXPORT_FAILURE_DRILL` is a wedding id (3.6, 6.8, 6.10, 7.4 step B);
   - Vercel values are added by L at about 09:35, after the user's dashboard import at about 09:32, except `NEXT_PUBLIC_FLAGSMITH_ENVIRONMENT_ID`, which the user adds at the import (6.10, 7.3; decisions D5, D71 and D119);
   - the SDK pin is cited as 1.1.
2. **Open question 1 (voice routes):** agreed. There is no `/api/voice/state` (6.9).
3. **Open question 2 (Lane C's branches):** settled as architecture says. `lane-c-voice` is the first branch, with the 10:45 title "C: voice dock with server-side flags and the voice write switch" (7.7).
4. **2.2's `/api/health` row (applied at 04:50):** it records that the `flags` summary is cached for 60 seconds per instance (6.7), so the public route can't spend the request budget.
5. **8 row 10, hosting (applied at 04:50):** it says the laptop build needs `NEXT_PUBLIC_FLAGSMITH_ENVIRONMENT_ID` set to the Production client-side key at build time as well as at start (7.5 command 4).
6. **6.4 step 3 and 6.7 item 10:** `flags.ok` means what 6.7 here defines, and is false until Lane C's summary ships.

### 10.3 voice.md

voice.md adopts these from this file. Its 04:39 revision (0.2 and 1.15) already has all of them, so it needs no change:
- the flag names;
- the early refusal at `/api/voice/turn`, and the fixed refusal line;
- VoiceDock as a server component, which the focus refresh re-renders. There is no `/api/voice/state` route (6.9).
- the same dock fields in every voice response, under its `voice` key, so the first refused turn updates the mic (6.9);
- the `voice_turns.flags` keys (10.1 item 7), and the fallback answer for non-internal users (10.1 item 8);
- the reply-audio route checking `spoken_replies` before calling Bulbul (3.3).

R-03's line uses "sakte hain", the respectful form, which fits any speaker, Kabir or a judge included (decision D93). It replaces the earlier "sakti hain" here, in 3.2 and in voice.md. acceptance AT-2.7 follows the same decision.

### 10.4 demo-script.md

- **2:10–2:15:** show Flagsmith's Production experiment page, then its Synthetic experiment page (tabs 3 and 4 in 8.2). Name the synthetic run in the narration, as 8.2's sentence 1 does.
- **Laptop tabs:** as in 8.2, including the Synthetic experiment tab.
- **V13:** the Production page, then the Synthetic page, then the flip, with 8.4's captions. Use 8.4's voice-over for the video's 1:55–2:15 beat.
- **V02 and the recording note at 15:45:** a "rehearsal environment" doesn't exist. Use a fresh internal (`@example.com`) test owner on production, whom the experiment excludes (1.2).

### 10.5 export-and-recovery.md, doc-ai.md and acceptance.md

- **export-and-recovery.md:** no change. This file adopts its drill rule (3.6), its once-per-claim renderer reading (3.7) and its 7.4 description (step B).
- **doc-ai.md:** its 5.7 requests are applied (3.0, 3.8, 6.5, 6.8, 7.4 steps B and G, and 7.8). Its branch is `lane-c-card-reader` (its 5.6; architecture 6.1), and its server code lives in `src/server/card-import/`, not `src/server/voice/` (its 5.3; architecture 4.1). Its "flags §3.8 expects `docai`" holds: the Production default becomes the chosen reader, normally `docai`.
- **acceptance.md** (revised 04:36). Its scenarios need no change. Its references to 1.2, 3.1, 3.2, 3.4 row 4, 5.2–5.5, 5.9, 6.4, 6.7, 6.8, 8.2 and 10.2 hold in this version, and its check references become FV1–FV15 (decision D113). AT-1.9 already checks `/api/health`'s `flags` summary, and 5.9 uses AT-1.8's drawer line word for word. Its demo checklist (its section 3) still follows this file's third version, so:
  - **3.1, the drawer check:** replace the experiment-card bullet with "'Sent by Jashn' shows today's counts with a recent as-of time", and add the `/api/health` check (8.3 here). Its tab list is already right.
  - **3.2, the 2:10–2:30 row:** 2:10–2:15 is tabs 3 and 4: Flagsmith's Production experiment page (red banner, today's exposures and saves, "Collecting data"), then the Synthetic one (purple banner). The rest of the row stands.
  - **3.4:** "then show the card (2:13–2:18)" becomes "then show tabs 3 and 4". When the experiment pages are slow, the fallback is the 14:30 screenshots.
  - **3.5:** "skip the experiment card" becomes "skip tabs 3 and 4".
  - **8.1 items 23 and 24, and 8.2 question 10,** are settled: this version has neither `GET /api/flags/health` nor `GET /api/voice/state`.
  - **Optional:** its freeze-time search of the client bundle could also look for the `INTERNAL_USER_EMAILS` values, since they are personal data.
