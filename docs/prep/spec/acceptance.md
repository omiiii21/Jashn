# Jashn: acceptance tests (the definition of done)

Prep note written at about 03:30 IST on Wed 25 Nov 2026, before FestiveHacks coding starts at 09:00. It is notes only (Rule 4): prose, tables and checklists. It contains no SQL, TypeScript, JSX, CSS, config, shell scripts or pseudo-code. The lead owns this file. Every lane reads its own scenarios before marking a pull request ready. Done-checks come in two parts: on fixtures before the PR is marked ready, and on real data after the batch deploys (D104, 4.2). After each merge batch the lead runs the staged production checks of 4.2 (D46). The full Playwright demo path (section 4) and the smoke test (section 2) run after the 12:30 deploy, at the 14:45 freeze and before every recording take. After the freeze smoke test, take 1 is recorded at once and doubles as the first timed demo rehearsal (section 3); any second run is take 2, after the 15:30 playback check (D50, D121). Where this file and `decisions.md` disagree, `decisions.md` wins.

**Status: binding for "done".** A scope item is **Working** only when every scenario that section 7 lists for it passes on the production deployment, exercised by a person on the laptop and on a phone (astra-plan §2, demo-script §4.4). Otherwise it is **Partial** (name the scenarios that pass) or **Future**.

**Where the words come from.**
- Entity, table, field, command, read-model, error and topic names: `spec/domain-and-data.md` (cited as "domain").
- Data values (names, amounts, dates, counts, the fixed Hindi replies): `demo-data.md`.
- Flag, segment, trait and event keys: `spec/flagsmith.md`.
- Runtime layout, live updates, env var names and the Playwright setup: `spec/architecture.md`.
- Utterances and expected replies: `voice-test-set.md`. Live beats: `demo-script.md`. Card reading: `spec/doc-ai.md`. Visual rules: `design-direction.md`.

Where those files disagree with each other, section 8.1 records which version this file tests.

---

## 0. How to read and run these tests

### 0.1 Scenario format

Each scenario has an id, `AT-<feature>.<n>`, and a tag line:
- **Kind:** Happy; Fail (wrong role, invalid input, kill switch, privacy, replay or concurrency); Live (a beat of the 3-minute demo); Video (submission video only); Rehearsal only (it changes data beyond D5, so never on the demo copy).
- **Start:** the starting state from 0.4.
- **Refs:** domain rule ids (M4, C6, R7 …), voice-test-set rows (M-03, X-01 …) and live beats (#1 to #8).

Then **Given / When / Then**. "Then" is what a person sees: the screen, the exact words and the exact figures. **And (records)** is what a test checks through a read model, the command route or the ops endpoint. Nobody checks the database by eye.

### 0.2 Screens and routes named in this file

| Name here | What and where |
|---|---|
| Overview, Events, Guests, Money, Vendors, Invite | The six planner sections (brief), under `/w/{wedding_id}`. Phone: a tab row in the maroon header. Desktop: the maroon rail |
| Activity, Shagun | The full activity feed and the owner-only shagun register, also under `/w/{wedding_id}` |
| Vendor page | One vendor's ledger (`vendor_ledger`), opened from Money or Vendors. "Money → Annapoorna Caterers" means this page |
| Setup | `/setup`, opening voice-first or form-first (flagsmith §3.4) |
| Mic, voice panel, review card | The mic sits in the header on every screen, on desktop and on the phone (D20). There is no bottom speak bar. The voice panel docks right at 400 px on desktop and is a bottom sheet on the phone. A review card is the preview of a proposed write (design-direction §7.1) |
| Publish sheet | "Review and publish": the list of unpublished changes and the Publish button |
| Exports panel | Inside Invite: export jobs, their attempts and their downloads |
| Flags drawer | Internal accounts only, opened from the reason chip beside the mic (flagsmith §5.9) |
| Guest page | `/i/{token}`: the household's invitation, inserts and RSVP |
| Badge | "Fictional demo data", on every planner screen and guest page of a sample wedding |
| Voice routes | `POST /api/voice/turn`, `POST /api/voice/confirm`, `POST /api/voice/cancel`, `GET /api/voice/turns/{voice_turn_id}/reply-audio?part={n}` and `GET /api/voice/turns/{voice_turn_id}/trace` (voice 1.17; architecture §2.2). There is no `/api/voice/state` and no `/api/flags/health` |
| Polls | `GET /api/w/{wedding_id}/version` every 2.5 s on planner screens, and `GET /api/i/{token}/revision` every 10 s on the guest page, both while visible, plus a refresh on tab focus (architecture §2.4; D37). `/setup` is the one exception: no poll and no focus refresh (D79). There is no Realtime anywhere |
| Export worker and render page | `POST /api/ops/export-jobs/{job_id}/run`, the only route that loads Chromium, kicked after commit with `JOBS_API_TOKEN`; it opens `/render/card/{job_id}?t=…` (export-and-recovery 1.6, 3.2) |
| Ops routes (NudgeBee) | `GET /api/ops/export-jobs/{job_id}` and `POST /api/ops/export-jobs/{job_id}/retry`, with the bearer `JOBS_API_TOKEN` (export-and-recovery 5) |
| Health | `GET /api/health`: liveness and the commit SHA from the scaffold PR, plus the `flags` summary from the contracts PR, whose `ok` is the flag health this file checks (flagsmith §6.7). `flags.ok` stays false until `lane-c-voice` merges at 10:45 (D12) |

### 0.3 Which copy of the sample wedding

The seed creates several sample weddings, all with `is_sample` true and fixed ids (architecture §9, item 10; domain 0.1 and D100).

| Copy | Used for | Rule |
|---|---|---|
| Demo copy | Judging, the stopwatch rehearsals of section 3 and the recorded takes (the NudgeBee clip V15 included) | Every run ends with `voice_writes_enabled` back on, the drill off and a reset to D0 (section 5). No other scenario in this file writes to it |
| Rehearsal copies, one per lane A–D | Every scenario that writes, and the rehearsals of sections 2 and 3 | Reset to D0 (section 5) after each run. A lane resets only its own copy, as that copy's owner; the demo and Playwright copies are L's (D17, D120) |
| Playwright copy | The demo-path spec (section 4) | The spec resets it at its start and its end |

`reset_demo` on one copy never touches another. The seed prints each copy's household links once and writes them to the gitignored `demo-links.local.md`. Tara's link never goes into the repo.

### 0.4 States and their figures

Every scenario starts from one of these states. The figures are demo-data §7.3 and §9.3; the activity counts are the owner's view. Diya's feed leaves out the owner-only entries (domain L5): ACT-03, the proposal, from S0, and ACT-06, the correction, from D1. So she sees 4 entries at S0, D0 and D1, then 5 to 8 at D2 to D5 (AT-8.5).

| State | How you reach it | Caterer committed / paid / still owed | Wedding committed / paid / still owed | Not yet committed | Reception attending / declined / pending (headcount) | Catering estimate (contract stays ₹2,00,000) | Reception venue: guests see / draft | Published revision | Activity entries |
|---|---|---|---|---|---|---|---|---|---|
| T0 | A signed-in owner with no wedding | – | – | – | – | – | – | – | – |
| T1 | After AT-1.2 | – | ₹0 / ₹0 / ₹0 | ₹12,00,000 | no functions yet | – | – | none | 1 |
| S0 | `reset_demo` with checkpoint `s0` (video only) | ₹0 / ₹0 / ₹0, quote ₹2,12,500 open | ₹7,27,000 / ₹3,47,000 / ₹3,80,000 | ₹4,73,000 | 229 / 9 / 12 (229) | none (no commitment) | Banyan Hall / Banyan Hall | 2 | 5 |
| **D0** | `reset_demo` with checkpoint `d0`: the live start | ₹2,00,000 / ₹50,000 / **₹1,50,000** | ₹9,27,000 / ₹3,97,000 / ₹5,30,000 | ₹2,73,000 | 229 / 9 / 12 (229) | ≈ ₹1,83,200 | Banyan Hall / Banyan Hall | 2 | 5 |
| D1 | AT-5.2, the correction | ₹2,00,000 / ₹40,000 / **₹1,60,000** | ₹9,27,000 / ₹3,87,000 / ₹5,40,000 | ₹2,73,000 | 229 / 9 / 12 (229) | ≈ ₹1,83,200 | Banyan Hall / Banyan Hall | 2 | 6 |
| D2 | AT-3.3, Diya's venue move | as D1 | as D1 | ₹2,73,000 | 229 / 9 / 12 (229) | ≈ ₹1,83,200 | Banyan Hall / **Lotus Hall** | 2 | 7 |
| D3 | AT-3.4, Mira publishes | as D1 | as D1 | ₹2,73,000 | 229 / 9 / 12 (229) | ≈ ₹1,83,200 | **Lotus Hall** / Lotus Hall | 3 | 8 |
| D4 | AT-4.2, Tara accepts | as D1 | as D1 | ₹2,73,000 | **230 / 9 / 11 (230)** | **≈ ₹1,84,000** | Lotus Hall / Lotus Hall | 3 | 9 |
| D5 | AT-2.7, the typed requirement | as D1 | as D1 | ₹2,73,000 | 230 / 9 / 11 (230) | ≈ ₹1,84,000 | Lotus Hall / Lotus Hall | 3 | 10 |

The sangeet reads 150 invited / 136 attending / 8 declined / 6 pending in every state from S0 to D5.

### 0.5 Pass rules for every scenario

1. **Money format (M7).** The rupee sign, Indian grouping, whole rupees, no space: ₹1,60,000, ₹12,00,000, ₹1,20,00,000. "Rs", "INR", "₹160,000", "₹1,60,000.00" or "1.6L" anywhere in the product fails the scenario (a chart axis may use "L"). Owed amounts are never negative; an overpayment reads "Overpaid ₹5,000".
2. **Persistence.** A write passes only if it survives a page reload, and appears in the other signed-in session within the times in section 2.3 (voice-test-set X-05).
3. **Fixed replies.** The three replies in demo-data §14 match character for character, including the nukta in हज़ार and the full stop ।. Every other reply passes on meaning: the same intent, every number equal to what a read model returns (M8), two short sentences or fewer, in the speaker's language (Hindi or Hinglish for Hindi input, English for English input).
4. **Voice rows** pass on the action, not on the transcript's spelling. Saaras codemix may return "Caterer को 40000 advance दिया था"; that passes if the action is right.
5. **Failures write nothing.** No activity entry, no change to `weddings.version`, no receipt with outcome `applied`, no partial row. Errors appear next to their field or in the voice panel, in plain words, without apologising. Money confirmations are never vanishing toasts (design-direction §9, ban 27).
6. **Clock times** on screen are compared without regard to "am/pm" or "AM/PM" case.

---

## 1. Feature scenarios

Must 1–9 first, then Should 10–13, then the sponsor coverage table.

### Must 1. Voice setup

Done when (scope): "You speak the names, date, budget and guest count. Jashn asks for anything missing, such as the year; you review and save." The brief adds: "A new wedding saves successfully and can be reopened. Uncertain names, dates and amounts are editable; the system does not invent them."

Setup scenarios use a fresh internal test owner (a new account made for the run, `setup-<lane>-<HHMM>@example.com`, D120), so the real experiment never counts them (flagsmith §1.2). Internal accounts with voice open Setup voice-first (flagsmith §3.4, row 4).

#### AT-1.1 Speak the brief; Jashn asks for the year and the names
*Kind: Happy, Video · Start: T0 · Refs: S-01, V5, setup turns (domain 3.8)*
- **Given** a fresh internal test owner on Setup, with the mic ready.
- **When** they hold the mic and say "Our wedding is on 14 December in Bengaluru. Budget is twelve lakh, roughly 250 guests." and release.
- **Then** the voice panel shows the transcript, with "14 December", "twelve lakh" and "250 guests" underlined as recognised, and a review card for a new wedding:
  - City: Bengaluru. Budget: ₹12,00,000, with "heard 'twelve lakh'". Guests: about 250.
  - Date: "14 December", with Year empty and marked "?".
  - Bride and Groom: empty and marked "?".
  - The save button is disabled, with the reason written beside it (the year and the couple's names are missing).
- **And** the reply, shown and spoken in English, asks for the year and the names: "Got it: 14 December in Bengaluru, twelve lakh, about 250 guests. Which year is it, and what are the couple's names?"
- **And (records)** no `weddings` row exists for this user. One `voice_turns` row with status `proposed` and `missing_fields` naming the year, `bride_name` and `groom_name`.

#### AT-1.2 Give the year and the names; save; reopen
*Kind: Happy, Video · Start: AT-1.1's open review card · Refs: S-02, V2, `set_wedding_profile`*
- **When** they say "Saal 2026 hai. Dulhan Mira hai aur dulha Kabir."
- **Then** the same review card fills in: Bride Mira, Groom Kabir, Date Mon 14 Dec 2026, City Bengaluru, Budget ₹12,00,000, Guests 250. Nothing is marked "?", and the save button ("Save wedding") is enabled.
- **When** they confirm, by tapping Save wedding or saying "Haan, save karo".
- **Then** the app opens the new wedding's landing view, headed "Mira & Kabir" with "Mon 14 Dec 2026", "Bengaluru" and Budget ₹12,00,000, read through Lane A's `wedding_profile` read model (domain 4.11, D99). Until B5's full Overview ships, this is B1's minimal, member-guarded landing view (D60); once the Overview ships, it also shows Committed ₹0 and Still owed ₹0. The reply says it was saved ("Mira aur Kabir ki shaadi, 14 December 2026, Bengaluru. Save ho gayi.").
- **When** they reload, then sign out and sign in again.
- **Then** the root page opens the same wedding with the same values. Check AT-1.2 and AT-1.5 with a fresh owner from the 11:40 batch on (D60).
- **And (records)** one `weddings` row: `bride_name` Mira, `groom_name` Kabir, `wedding_date` 2026-12-14, `city` Bengaluru, `expected_guests` 250. `budgets.total_inr` is 1200000. One owner `members` row, one `invite_styles` row with defaults, and all three `managers_can_see_*` flags off. The S-01 turn is `superseded`; the S-02 turn is `confirmed`. Exactly one activity entry, topic `wedding.created`.

#### AT-1.3 Hinglish, with a month and no day
*Kind: Happy · Start: T0 · Refs: S-03*
- **When** the owner says "Shaadi Bengaluru mein hai, December mein. Budget baarah lakh hai."
- **Then** the review card shows City Bengaluru, Budget ₹12,00,000 ("heard 'baarah lakh'") and Month December, with Day, Year, Bride and Groom marked "?". Save is disabled. The reply asks for the date, the year and the names ("Baarah lakh note kar liya. December mein kaunsi tareekh, kaunsa saal, aur dulha-dulhan ke naam?").
- **And (records)** no `weddings` row.

#### AT-1.4 Jashn never fills in a year
*Kind: Fail (invalid input) · Start: T0 · Refs: V5, `year_required`*
- **When** the owner gives a date without a year, by voice ("14 December") or on the form (day and month only).
- **Then** Year stays empty and marked "?", and Save stays disabled. The preview may say that 14 December 2026 is a Monday, but it never selects 2026.
- **When** a script sends `set_wedding_profile` (create) without `wedding_date`, or with a date outside 2026-01-01 to 2030-12-31.
- **Then** the command answers 422 `validation_failed` with `field` `wedding_date` and `message` `year_required` (missing) or `out_of_range` (outside the range). Nothing is written.

#### AT-1.5 Typed setup gives the same wedding, exactly once
*Kind: Happy, Fail (replay) · Start: T0 · Refs: form-first arm, I1, I2*
- **Given** Setup open on the form (the form-first arm, or the "Type instead" link of the voice-first arm).
- **When** the owner types Bride Mira, Groom Kabir, Date 14/12/2026, City Bengaluru, Budget 12,00,000 and Guests 250, then double-taps Save wedding (or the network retries the request).
- **Then** the result equals AT-1.2: one wedding, the same Overview, the same figures.
- **And (records)** one `weddings` row; the second request returns outcome `replayed`. The budget field accepts "12,00,000" and "1200000" and stores the integer 1200000.

#### AT-1.6 Voice writes switched off during setup
*Kind: Fail (kill switch) · Start: T0 with `voice_writes_enabled` off · Refs: V3, flagsmith §3.2 and §3.4 row 4*
- **Then** Setup opens on the form, and the mic carries the chip "Questions only" (सिर्फ़ सवाल).
- **When** the owner speaks the S-01 line anyway.
- **Then** no review card with a Save button appears. The reply says voice changes are paused, and the form is prefilled with Bengaluru, ₹12,00,000 and 250, each marked "from voice, please check".
- **When** the owner completes the form and taps Save wedding.
- **Then** the wedding saves, because typing never checks the flag.
- **And (records)** the voice turn has status `paused` and `refusal_code` `voice_writes_paused`. The only write is the typed `set_wedding_profile`, with `source` `ui`.

#### AT-1.7 Someone without voice
*Kind: Fail (rollout) · Start: T0 on local dev only, never on production: a non-internal owner, `nonint-c-<HHMM>@example.net`, for whom `voice_pilot` is off (D120) · Refs: flagsmith §3.1*
- **Then** Setup and every planner screen show the mic disabled, with "Voice is switched off right now. You can type or edit directly." and no reason chip. Setup opens on the form.
- **And (records)** a direct `POST /api/voice/turn` from this session answers 403 `voice_unavailable` before anything is sent to Sarvam.

#### AT-1.8 The setup experiment records exposure and conversion
*Kind: Happy (sponsor: Flagsmith) · Start: T0 on production, a first-time tester whose email is neither `@example.com` nor on the internal list, with `voice_pilot` and `voice_writes_enabled` on for them · Refs: flagsmith §5.2–5.5, FV13, FV14 (b)*
- **When** the tester signs up and Setup renders.
- **Then** Setup opens on the assigned arm: `voice_first` opens on the mic with a "Type instead" link; `form_first` opens on the form with a mic button. Switching input never changes the arm.
- **And (records)** exactly one `experiment_exposures` row for the tester, with the variant and `exposed_at`. Flagsmith's Production experiment shows the exposure within about 10 minutes. Reloading Setup adds nothing.
- **When** the tester saves a reviewed wedding, by either input.
- **Then** `setup_saved` is sent once, with a whole number of seconds since `setup_opened_at` (0 to 3600), and the exposure row gets `converted_at` and `seconds_to_save`.
- **Never:** an exposure for an internal account; an exposure from visiting a page that links to Setup without opening it; a conversion for an outcome of `replayed` or `unchanged`; a name, email, phone, city, amount or id in any trait or event.
- **And** the Flags drawer (internal accounts only) shows Jashn's own sent counts per arm for Production, with their as-of time, and the line "Flagsmith shows statistics from 50 owners and 5 saves per arm. A 10-point effect needs about 385 per arm. We claim no winner." Flagsmith's own Production experiment page shows the same exposures after its processing delay, still "Collecting data". The synthetic result is shown only from Flagsmith's Synthetic environment, under its "Synthetic data" banner, with the disclosure text. No screen, caption or README line claims a winner.

#### AT-1.9 Flagsmith unreachable
*Kind: Fail · Start: T0 in local dev with a deliberately invalid Flagsmith server key · Refs: flagsmith §6.8, FV8*
- **Then** Setup still renders, opens on the form and records no exposure. An internal account gets the chip "Voice · safe mode" and can ask questions but not save by voice. Other accounts get no mic. The Flags drawer marks every flag "fallback", the self-check is red, `/api/health` reports `flags.ok` false with every flag in `fallback_flags`, and the drawer's Health section shows each flag as `fallback` (flagsmith §6.7; architecture §2.2's `/api/health` row). Either one is enough to see the failure. No exposure or conversion is sent.

### Must 2. Voice actions and answers

Done when (scope): "Push-to-talk in English, Hindi or Hinglish. Jashn shows what it understood, you confirm, and it's saved; Jashn replies aloud in Hindi or English. Questions like 'kitna baaki hai?' are answered from saved records."

#### AT-2.1 A question is answered from the saved ledger
*Kind: Happy, Live #1 · Start: D0 · Refs: O-01, V4, M7, M8*
- **Given** Mira on Money → Annapoorna Caterers, showing Committed ₹2,00,000, Paid ₹50,000 and Still owed ₹1,50,000.
- **When** she holds the mic, says "Caterer ko ab kitna dena hai?" and releases.
- **Then** the voice panel shows the transcript with a language chip (English, हिंदी or Hinglish), then an answer card that names Annapoorna Caterers, shows ₹1,50,000 still owed and links to the vendor page. It has no Save button. The reply text reads exactly "एक लाख पचास हज़ार रुपये बाकी हैं।" and Bulbul speaks it. The ₹1,50,000 on the page is highlighted as the spoken figure.
- **And (records)** the turn's status is `answered`. No activity entry, no receipt, and `weddings.version` is unchanged.

#### AT-2.2 A spoken change waits for the speaker's confirmation
*Kind: Happy, Live #2 and #3 · Start: D0 · Refs: M-03, C-01, V1, V2, V9*
- **When** Mira says "Caterer ko chaalis hazaar advance diya tha."
- **Then** the review card of AT-5.2 appears, and nothing is saved: the vendor page still reads Still owed ₹1,50,000, and PAY-01 still has one version.
- **When** she says "Haan, save karo." (matched in code, with no model call), or taps Save correction.
- **Then** the correction saves once (AT-5.2). The page updates first; only then does the reply play: "एक लाख साठ हज़ार रुपये बाकी हैं।"
- **And (records)** the turn is `confirmed`, with `confirmed_via` `phrase` or `tap`. The new payment version carries `source` `voice`, the `voice_turn_id` and the spoken text. The command ran through the same dispatcher as the payment form.

#### AT-2.3 Cancelling writes nothing
*Kind: Happy · Start: D0 with M-03's review card open · Refs: C-02*
- **When** Mira says "नहीं, रहने दो।" or taps Cancel.
- **Then** the card closes, the reply is "ठीक है, कुछ नहीं बदला।", and the vendor page still reads ₹1,50,000.
- **And (records)** the turn is `cancelled`. No version, no activity entry, and `weddings.version` is unchanged.

#### AT-2.4 English in, English out; questions about people and changes
*Kind: Happy · Start: D0 · Refs: O-04, G-01*
- **When** Mira says "What did the event manager change today?"
- **Then** an answer card lists Diya's two changes today, each linking to its function: the sugar-free dessert for Kamla Arora at the reception (ACT-04, 8:30 am) and the marigold and fairy-light canopy over the sangeet stage (ACT-05, 8:45 am). The English reply says the same in at most two sentences. Nothing is written.
- **When** she says "Who's attending the reception?"
- **Then** Guests opens filtered to the reception's attending guests (32 named rows plus one row "197 imported guests"), and the reply says "229 of 250 have confirmed for the reception. 9 declined and 12 haven't replied yet."

#### AT-2.5 Ambiguity is asked about, never guessed
*Kind: Fail (invalid input) · Start: D0, a fresh conversation · Refs: M-05, E-07, E-08, M-13*

| Mira says | Jashn replies (no review card, nothing written) |
|---|---|
| "Advance chaalis hazaar tha." | "Kis vendor ka advance? Caterer, venue, decorator, photographer, mehendi artist ya DJ?" |
| "Venue kya hai?" | "Kis function ka venue? Mehendi, haldi, sangeet, shaadi ya reception?" |
| "Haldi kal subah rakhte hain." | "Kal matlab 26 November? Haldi abhi 13 December subah hai. Kaunsi tareekh rakhun?" |
| "Mehendi artist ko advance de diya." | "Kitna diya? ₹5,000 ka advance pehle se likha hai. Kya yeh naya payment hai?" |

- **And (records)** each turn ends `answered` with `missing_fields` set. No write.

#### AT-2.6 A wrong premise is corrected, not agreed with
*Kind: Fail · Start: D0 · Refs: M-09, M8*
- **When** Mira says "Venue ka ₹1.5L baaki hai na?"
- **Then** the reply is "Nahi, venue ka ₹1,40,000 baaki hai. ₹2,80,000 mein se ₹1,40,000 diye ja chuke hain." and the answer card links to Mallige Gardens. Nothing is written.

#### AT-2.7 Kill switch off: voice writes are refused; typing and questions keep working
*Kind: Fail (kill switch), Live #8 · Start: D4 · Refs: R-03, X-06, V3, V4, flagsmith §3.2 and FV7*
- **Given** Mira on the laptop, and `voice_writes_enabled` switched off in Flagsmith Production.
- **When** the Jashn tab regains focus.
- **Then** within 5 seconds the mic shows a second chip, "Questions only", beside "Voice · team preview".
- **When** she says "Reception mein barah logon ke liye Jain khana add karo."
- **Then** no review card with a Save button appears. The panel shows the transcript and the fixed refusal line, which is also spoken: "Abhi voice se badlav band hain. Aap type karke save kar sakte hain." (the respectful form, for any speaker; D93) The Reception's add-requirement form opens prefilled with Requirement "Jain food", Quantity 12, Category Catering and Vendor Annapoorna Caterers, each marked "from voice, please check".
- **And (records)** the turn is `paused` with `refusal_code` `voice_writes_paused`. No requirement row, no activity entry, and `weddings.version` unchanged.
- **When** she checks the form and taps Save.
- **Then** the reception's requirements list shows "Jain food for 12 · Catering · Annapoorna Caterers", and Activity shows "Mira added "Jain food for 12" to the reception." The ledger is unchanged (₹9,27,000 / ₹3,87,000 / ₹5,40,000). Diya sees the requirement within 5 seconds. This is state D5.
- **And (records)** REQ-10 with `source` `ui`, ACT-10, one receipt.
- **When**, still with the switch off, she asks "Reception ka venue kya hai, aur caterer ka kitna baaki hai?"
- **Then** it is answered, because questions never check the switch (O-03, X-06, V4): "Reception: Lotus Hall. एक लाख साठ हज़ार रुपये बाकी हैं।"
- **Also:** a review card shown before the flip and confirmed after it gets 423 `voice_writes_paused` with the same prefill, and nothing is written. When the switch is turned back on, the "Questions only" chip goes on the next focus, and a voice write works again.
- **Staged checks (D55, D47, D104).** Until Lane C's real gate merges, the contracts stub refuses every voice write.
  - 10:45: Lane C checks the preview, the gate, the refusal payload and the confirm envelope, with fixtures or an injected dispatcher.
  - 11:15: the user turns `voice_writes_enabled` off on production, and Lane C checks the deployed refusal. If Lane C's pipeline splits, this stage moves to right after the 11:40 deploy, and the user flips the switch then (D121).
  - After A3 merges at 11:40: the persisted M-03 and C-01 replay check (AT-2.2, AT-2.9).
  - After the 12:30 integrations: the full AT-2.7, with a pending voice write, one typed save and a read-only question. If the requirement form isn't merged by then, the typed save is an Events edit, such as a dress code (D114). Then the flag is restored, and the result is logged for the README.

#### AT-2.8 Only the speaker can confirm, and only within 10 minutes
*Kind: Fail (wrong role) · Start: D0 with Mira's M-03 review card open · Refs: V2*
- **When** Diya's session sends `POST /api/voice/confirm` with Mira's `voice_turn_id`.
- **Then** it answers 403 `forbidden`, and nothing is written.
- **When** Mira confirms more than 10 minutes after she spoke.
- **Then** it answers 410 `voice_turn_expired`. The panel says the request expired and offers to say it again. The turn is `expired`, and nothing is written.

#### AT-2.9 Confirming twice saves once
*Kind: Fail (replay) · Start: D0 · Refs: X-01, V7, I2*
- **When** Mira says "Haan, save karo." twice, or double-taps Save correction, or the network retries the confirm.
- **Then** see AT-5.4: one correction, PAY-01 with exactly two versions, and Still owed ₹1,60,000. The second confirm returns each action's stored result with outcome `replayed`.

#### AT-2.10 Speech or model failures fail safe
*Kind: Fail · Start: D0 · Refs: design-direction §7.1, architecture §8 rows 3 and 5, voice 6.1*
- **No speech heard:** "I didn't hear anything. Hold the mic and speak, or type." The mic stays ready.
- **Sarvam unreachable, 402, a 5xx or a timeout:** "Couldn't reach the speech service. Nothing was saved. Try again or type." The turn is `failed`, nothing is written, and the same change saves through its form (AT-5.3).
- **The model unreachable** (429, a 5xx, a timeout, or 401, 402 or 403, after its retry; voice 6.1 row 10): "Couldn't reach the assistant. Nothing was saved. Edit what I heard, or type it." The turn is `failed` with `llm_unavailable`, the transcript stays editable, and Retry is offered.
- **No usable tool call** after the retry (voice 6.1 row 11): "Couldn't work out what to do. Nothing was saved. Edit what I heard, or type it." The turn is `failed` with `llm_no_action`, and no Retry is offered: the person speaks again or edits what was heard.
- **Length:** recording stops by itself at 25 seconds, with the timer visible. The turn route rejects audio over 30 seconds or 2 MB.
- **Slow:** after 4 seconds without a result, the panel says "Still working. You can keep using the page."
- **Production never serves voice fixtures.** `VOICE_FIXTURE_MODE` is never set in Vercel Production. When it is on locally, the dock labels every turn "Fixture, not Sarvam" (architecture §8, row 3).

#### AT-2.11 Spoken replies muted
*Kind: Happy · Start: D0 with `spoken_replies` off*
- **Then** every reply appears as text and no audio is requested. Questions, previews and confirmations work as before.

#### AT-2.12 The mic is on every planner screen
*Kind: Happy · Start: D0 · Refs: scope decision on #10*
- **Then** Overview, Events, Guests, Money, Vendors, Invite, Activity and Shagun each show the mic in the same place: in the header, on desktop (1024 px and wider) and on the phone (D20). There is no bottom speak bar. Beside it, Mira and Diya see the chip "Voice · team preview".
- **And** after a saved action, the app routes to the affected record and highlights the changed figures (the wash), on the device that spoke. Lane C appends `routes.ts`'s `highlight` query parameter (comma-separated field keys) to `navigate.path`, and Lane B's page applies the highlight once (D121).

#### AT-2.13 Push-to-talk only; audio is never kept
*Kind: Privacy · Start: D0 · Refs: domain 5.0, G9*
- **Then** the mic records only while held, or after a tap that locks it, and never listens on its own. After each clip the browser's recording indicator goes off.
- **And (records)** Storage holds no audio object. `voice_turns` holds the transcript only. The snapshot sent to Sarvam with a turn carries ids, names and the figures the speaker may see, and no phone number, email or token.

### Must 3. Events and itinerary

Done when (scope): "Mehendi, haldi, sangeet, wedding and reception, each with time, venue and dress code. Edits stay in draft until the owner publishes them."

#### AT-3.1 The five functions at D0
*Kind: Happy · Start: D0 · Refs: demo-data §3, P8, domain 4.3*
- **Given** Mira (or Diya) on Events.
- **Then** the functions are grouped by day, in this order:

| Day | Time | Function | Venue | Dress code | Lead |
|---|---|---|---|---|---|
| Sun 13 Dec 2026 | 9:30 am – 11:30 am | Haldi हल्दी | Courtyard Lawn, Mallige Gardens | Yellow; clothes that can get stained | Neelam Arora |
| Sun 13 Dec 2026 | 3:00 pm – 7:30 pm | Mehendi मेहंदी | Terrace, Deshpande family home, Jayanagar | Green and pink, festive casual | Sunita Deshpande |
| Sun 13 Dec 2026 | 7:00 pm – 11:00 pm | Sangeet संगीत | Garden Hall, Mallige Gardens | Indo-western, some sparkle | Diya Fernandes |
| Mon 14 Dec 2026 | 10:30 am – 1:30 pm, muhurat 11:15 am | Wedding विवाह | Mandap Lawn, Mallige Gardens | Traditional: sarees, kurtas, sherwanis; pastels | Anil Deshpande |
| Mon 14 Dec 2026 | 7:30 pm – 11:00 pm | Reception रिसेप्शन | Banyan Hall, Mallige Gardens | Formal evening | Diya Fernandes |

- **And** exactly two warnings, both only for members: "The Mehendi ends at 19:30 but the Sangeet starts at 19:00: 30 minutes overlap." on the Mehendi row, and "Banyan Hall seats 220; 229 are attending the reception." on the Reception row.
- **And** the header says there are no unpublished changes, and the schedule is published as revision 2 (24 Nov, 9:00 pm, by Mira).
- **And (records)** `itinerary`: five functions, `conflicts` with one `overlap` (30 minutes) and one `over_capacity`, `unpublished_changes` empty, `published_revision` 2, and `venues` with each venue's capacity, Banyan Hall 220 and Lotus Hall 300 among them (D99).

#### AT-3.2 Add a function by voice
*Kind: Happy, Video · Start: T1 · Refs: E-01, E-02, `create_event`*
- **When** the owner says "Add the sangeet on the thirteenth at seven in the evening, at Garden Hall."
- **Then** the review card reads: Sangeet, Sun 13 Dec 2026 (the date worked out from the wedding's month and year, and shown), 7:00 pm IST, Garden Hall marked "New venue". The button says what it does (for example "Add sangeet").
- **When** they confirm.
- **Then** Events shows the Sangeet in the draft, marked "Not published", and the reply is "Sangeet added for Sunday 13 December at 7 PM, Garden Hall." Nothing reaches any guest page, because nothing is published.
- **And (records)** one `events` row (version 1), one new `venues` row, `draft_version` + 1, and one activity entry, topic `event.created`. The Hinglish line E-02, "Sangeet terah tareekh ko shaam saat baje Garden Hall mein rakho.", gives the same record.

#### AT-3.3 The manager moves the reception; it stays in the draft
*Kind: Happy, Live #4 · Start: D1 · Refs: E-04, P1, P8, ACT-07*
- **Given** Diya signed in with her own login, on Events → Reception.
- **When** she says "Reception Lotus Hall mein shift kar do." (or taps Venue → Lotus Hall).
- **Then** her review card reads "Reception venue: Banyan Hall → Lotus Hall (Mallige Gardens, seats 300)" with the button "Save draft". After she taps it:
  - The reception's venue reads Lotus Hall, with "was Banyan Hall" and "Changed by Diya, <time>", and the row is marked "Not published".
  - Events shows exactly one unpublished change (the reception venue), and its activity line carries "Draft. Guests still see Banyan Hall."
  - The over-capacity warning has gone. The mehendi overlap warning remains.
  - The reply: "Draft mein reception ab Lotus Hall mein hai. Guests ko publish ke baad dikhega."
- **And** Mira sees the change within 5 seconds (AT-8.2), and Tara still sees Banyan Hall (AT-9.3).
- **And (records)** EVT-REC `version` + 1; `draft_version` + 1; no new venue (the existing Lotus Hall at Mallige Gardens matched); no money record touched. ACT-07, visibility `members`: "Diya moved the reception from Banyan Hall to Lotus Hall.", with `awaiting_publish` true. `unpublished_changes` holds exactly one item: the reception venue, Banyan Hall → Lotus Hall, by Diya.

#### AT-3.4 The owner publishes revision 3
*Kind: Happy, Live #6 · Start: D2 · Refs: E-05, P3–P9, ACT-08*
- **Given** Mira on the laptop.
- **When** she says "Schedule publish kar do." (or clicks Review and publish).
- **Then** the publish sheet reads "Publish revision 3 · 1 change: Reception venue", showing ~~Banyan Hall~~ Lotus Hall. Its primary button's label starts with "Publish".
- **When** she taps it.
- **Then** Events shows no unpublished changes and published revision 3, with today's time and Mira's name. The Invite exports panel marks the earlier card (JOB-EXP-R2-PNG) "Out of date. Export a new card." The reply: "Schedule publish ho gaya. Guests ko ab Lotus Hall dikhega." Diya's Events shows revision 3 within 5 seconds. Tara's open guest page shows Lotus Hall at its next revision poll without being touched (it polls every 10 s, so 12 s at most with the refresh; 2.3), and at once when she reloads or the tab regains focus.
- **And (records)** a `publications` row with revision 3 and `changes` equal to one item (event, venue, from Banyan Hall, to Lotus Hall); `weddings.published_revision` 3. ACT-08: "Mira published the schedule, revision 3: reception venue Banyan Hall to Lotus Hall."

#### AT-3.5 A manager cannot publish
*Kind: Fail (wrong role) · Start: D2 · Refs: E-06, P3*
- **When** Diya says "Schedule publish kar do."
- **Then** the server refuses it, and the reply is "Publish sirf Mira ya Kabir kar sakte hain. Aapka badlav draft mein safe hai." Diya's Events has no Publish button; it says that only an owner can publish. Her draft change is still there.
- **And (records)** a direct `publish_itinerary` with Diya's session answers 403 `forbidden`, and `propose_change` with that command answers 422 `validation_failed` (publishing is not proposable). No publication.

#### AT-3.6 Publish exactly what was reviewed
*Kind: Fail (concurrency) · Start: D2 · Refs: P6, P7*
- **When** Mira opens the publish sheet, Diya then changes the reception's dress code, and Mira taps Publish.
- **Then** the publish answers 409 `draft_changed`. The sheet refreshes to "2 changes" with both listed, and nothing is published until Mira taps again.
- **When** Mira publishes at D3 with nothing changed.
- **Then** the outcome is `unchanged`, no revision 4 is created, and the sheet says there is nothing to publish.

#### AT-3.7 Two edits to the same function
*Kind: Fail (concurrency) · Start: D1 · Refs: I4, design-direction §7.2*
- **Given** Mira and Diya both have the reception open at the same version.
- **When** Diya saves Lotus Hall, and then Mira saves a new start time.
- **Then** Mira's save answers 409 `stale_version`, carrying the current function and who changed it last. Her form keeps what she typed and says inline that Diya changed the reception while she was editing, with the choices "Keep yours" and "Use Diya's" (design-direction 7.2). Nothing of Mira's is written until she chooses, and "Keep yours" saves against the new version.

#### AT-3.8 Invalid times and dates
*Kind: Fail (invalid input) · Start: D0*

| Input on the reception form | Answer, shown next to the field |
|---|---|
| End 7:00 pm with start 7:30 pm | 422 `validation_failed`, `time_order` |
| Date 2025-12-14 or 2031-01-01 | 422 `validation_failed`, `out_of_range` |
| Muhurat 11:30 pm, outside 7:30–11:00 pm | 422 `validation_failed` |
| A title of 41 characters | 422 `validation_failed`, `too_long` |

Nothing is written in any row.

#### AT-3.9 Fixing the timing conflict by voice
*Kind: Happy, Rehearsal only · Start: D0 · Refs: E-03*
- **When** Mira says "मेहंदी शाम साढ़े पाँच बजे तक ख़त्म कर दो।"
- **Then** the review card reads "Mehendi ends: ~~7:30 pm~~ 5:30 pm". After confirming, the draft Mehendi ends at 5:30 pm, the overlap warning disappears for members, and the guest pages still show 7:30 pm until a publish. The reply: "मेहंदी अब शाम साढ़े पाँच बजे ख़त्म होगी। संगीत से टकराव हट गया।"

### Must 4. Guests and RSVP

Done when (scope): "Households, invitations per function and a private link for each guest. An RSVP from a phone is counted exactly once."

#### AT-4.1 Tara's link shows her household's published functions, and nothing else
*Kind: Happy, Privacy · Start: D0 · Refs: G1–G3, P5, P10, R9, demo-data 11.3*
- **Given** the H16 (Bhat) link from `demo-links.local.md`, opened in a Safari private tab on the phone, with no session.
- **Then** the page shows the maroon-and-gold invitation: the seal, शुभ विवाह, "With the blessings of our families", "Mira & Kabir", "invite you to celebrate their wedding", the couple photo as uploaded with "AI-generated, fictional" (part of D0 from the 11:40 photo step, D107), the line "Mira & Kabir · 14 December 2026 · Bengaluru", and the "Fictional demo data" badge.
- **And** exactly two function inserts, in this order:

| Insert | When | Where | Dress code | Her answer |
|---|---|---|---|---|
| Sangeet संगीत | Sun 13 Dec 2026, 7:00 pm | Garden Hall, Mallige Gardens, Whitefield | Indo-western, some sparkle | Attending |
| Reception रिसेप्शन | Mon 14 Dec 2026, 7:30 pm | Banyan Hall, Mallige Gardens, Whitefield | Formal evening | Not replied |

- **And** each insert offers "Yes, attending" and "Can't come" (48 px targets) and Directions. Below them sit the food preferences field, "Send reply to the families" and "You can change your reply later from this link." The English / हिंदी toggle switches the page language, and every Hindi string renders without boxes or broken conjuncts.
- **Never on the page:** the mehendi, haldi or wedding function (not their names, not that they exist, not a count of functions); any amount or ₹ sign; any vendor; any other household or guest; any count; the overlap or hall-capacity warnings; any draft value.
- **And (records)** the page is built only from `guest_invitation_view`: `revision` 2, `household` Bhat with the one guest Tara Bhat, and `functions` holding EVT-SAN and EVT-REC. `GET /api/i/{token}/revision` answers `{"revision": 2}`.

#### AT-4.2 Tara accepts the reception (D3 → D4)
*Kind: Happy, Live (1:25–1:50) · Start: D3 · Refs: R4–R8, R12, E2, E5, ACT-09*
- **Given** Tara's page after revision 3 (it updates by itself at the next 10 s poll, 12 s at most, or at once on reload): the reception insert reads Lotus Hall, Mallige Gardens, Whitefield. The sangeet insert is unchanged.
- **When** she taps "Yes, attending" on the reception, then "Send reply to the families".
- **Then** the send button is replaced by a thank-you line that starts "Thank you, Tara. The families have your reply" and a "Change reply" link. Her sangeet answer is still Attending.
- **And** on the laptop, with no reload and within 5 s (target 1–3.5 s), on whichever screen Mira has open:
  - the reception reads 250 invited, **230** attending, 9 declined, **11** pending;
  - the catering box reads "≈ ₹1,84,000", "230 attending × ₹800" and "Estimate, not the contract", beside the unchanged contract line "250 plates × ₹800 = ₹2,00,000" (fixed, 250 covers), with "₹16,000 below the contract. The contract changes only if you renegotiate it.";
  - the sangeet still reads 136 attending.
- **And** Activity, for Mira and for Diya, reads "Tara Bhat is attending the reception." (ACT-09). Diya's Guests screen shows the same counts within 5 s.
- **And (records)**
  - Tara's one EVT-REC invitation row keeps its id and is now `attending`, `plus_ones` 0, `responded_via` `guest_link`.
  - `rsvp_totals` for the reception: 250 / 230 / 9 / 11, `confirmed_headcount` 230.
  - `catering_estimate`: `estimate_inr` 184000, `difference_inr` 16000, `direction` `below`.
  - COM-01 is unchanged: one version, ₹2,00,000 (E5).
  - One activity entry, topic `rsvp.submitted`, `actor_type` `guest`. `weddings.version` + 1.
- Wording such as demo-script's "Estimate from confirmed guests ₹1,84,000" and "Signed contract ₹2,00,000 · fixed, 250 covers" may appear as well; the E6 elements above are required.

The request the page sends (domain 7.3):

```json
{
  "idempotency_key": "3d0b9c2e-…",
  "responses": [
    { "guest_id": "9a3f…(Tara Bhat)", "event_id": "e5d1…(EVT-REC)", "rsvp_status": "attending", "plus_ones": 0 }
  ]
}
```

#### AT-4.3 Counted exactly once: double tap, retry and reload
*Kind: Fail (replay) · Start: D3 · Refs: R7, R8, I2, X-02*
- **When** Tara double-taps "Send reply to the families", or the network retries the request with the same `idempotency_key`.
- **Then** the reception reads 230 once. The second response has outcome `replayed`, there is one ACT-09, and `weddings.version` rose by exactly 1.
- **When** she reloads, taps "Change reply", leaves Attending selected and sends again (a new key).
- **Then** the outcome is `unchanged`: still 230, no new activity entry, no version change.
- **When** a script resends the first key with a different body (`declined`).
- **Then** it answers 409 `idempotency_key_reused`, and nothing is written.

#### AT-4.4 Two devices answer at the same moment
*Kind: Fail (concurrency) · Start: D3 · Refs: R7*
- **Given** Tara's link open on the phone and in a laptop private window.
- **When** both send Attending for the reception within the same second, with different keys.
- **Then** one request is `applied` and the other `unchanged`. The reception reads 230, Tara still has exactly one reception invitation row, and there is one ACT-09.
- The unit tests (4.3) repeat this with 10 parallel requests.

#### AT-4.5 Changing an answer updates the same row
*Kind: Happy, Rehearsal only · Start: D4 · Refs: R6*
- **When** Tara taps "Change reply", picks "Can't come" for the reception and sends.
- **Then** within 5 s the laptop shows 250 / 229 / 10 / 11 for the reception and the estimate "≈ ₹1,83,200", and Activity reads "Tara Bhat can't attend the reception." Her row keeps its id; no row is added.

#### AT-4.6 Invalid or out-of-scope guest requests
*Kind: Fail (invalid input, privacy) · Start: D3 · Refs: R2, R9, G5, domain open question 19*

Each request goes to `POST /api/i/{token}/rsvp` with Tara's token. Nothing is written in any row.

| Request | Answer |
|---|---|
| `rsvp_status` `pending` (guests cannot choose "not replied") | 422 `validation_failed`, field `rsvp_status` |
| The `event_id` of EVT-MEH, to which Tara is not invited | 404 `not_found`, the same body as an unknown token |
| The `guest_id` of a guest in another household (Nikhil Jain, H13) | 404 `not_found`, the same body |
| An `event_id` or `guest_id` from another sample copy | 404 `not_found`, the same body |
| `plus_ones` 1 (her `max_plus_ones` is 0) | 422 `plus_ones_exceeds_limit` |
| No `idempotency_key` | 422 `validation_failed`, field `idempotency_key` |
| 21 items in `responses` | 422 `validation_failed` |
| A burst of more than 30 submissions from this token within one minute (the limit is 30 POSTs a minute per token hash; domain 6.3, D108) | Some answers are 429 `rate_limited`. The limit is best effort and counted per server instance, so the test checks that 429s appear, not which request gets the first one (domain 6.3). After a 429 the page keeps showing its content and polls again after 30 s (D90) |

#### AT-4.7 Members record a reply on a guest's behalf
*Kind: Happy, Fail (invalid input) · Start: D0, rehearsal copy · Refs: R10, G-02, `set_rsvp`*
- **When** Mira marks Nikhil Jain and Prachi Jain as attending the reception on Guests (or says G-02, "Nikhil aur Prachi Jain reception mein aa rahe hain.", and confirms).
- **Then** within 5 s both members' screens show 250 / 231 / 9 / 10 for the reception, and the two guests' wedding replies stay pending. G-02's reply is "Nikhil aur Prachi reception ke liye confirm ho gaye. Ab 231 log aa rahe hain." Activity reads "Mira marked 2 guests as attending for the reception: Nikhil Jain, Prachi Jain."
- **And (records)** both rows have `responded_via` `member` and `rsvp_updated_by_member_id` Mira; topic `rsvp.updated`.
- **When** Diya marks Tara Bhat as attending the mehendi.
- **Then** it answers 409 `not_invited` naming Tara Bhat, and nothing is written.

#### AT-4.8 Households, invitations and links on the Guests screen
*Kind: Happy, Privacy · Start: D0 · Refs: R1, R5, E7, G7, domain 4.4 and 6.3*
- **Given** Mira on Guests.
- **Then** there are 16 named households with 40 named guests, plus one collapsed row, "210 imported guests (synthetic placeholders)". Each guest shows the functions they are invited to and their reply for each. The reply table reads:

| Function | Invited | Attending | Declined | Pending | Expected (planning) |
|---|---|---|---|---|---|
| Haldi | 30 | 25 | 2 | 3 | 30 |
| Mehendi | 60 | 50 | 6 | 4 | 60 |
| Sangeet | 150 | 136 | 8 | 6 | 150 |
| Wedding | 180 | 165 | 6 | 9 | 180 |
| Reception | 250 | 229 | 9 | 12 | 250 |

- The "Expected" column is labelled as a planning number and never added into the counts (E7).
- Mira sees phone numbers (Tara Bhat: +91 90000 01601). Diya sees the same names, replies and dietary notes, but no phone number or email on any of her screens (contacts are not shared, G7).
- **Links** (rehearsal copy only). The Guests screen's link controls ship in `lane-b-guests-links` at 13:45 (D121); until then, check these through the command route:
  - `create_invitation_links` is owner-only. The URL appears once; a replay returns `tokens_already_issued: true` and no URLs. Diya gets 403 `forbidden`.
  - After `revoke_invitation_link`, the household's old URL answers the same 404 as an unknown token at once, and its replies stay as they were.
  - A reset never restores a revoked link, so rotate H16 afterwards and update `demo-links.local.md`. Never revoke or rotate H16 on the demo copy.

#### AT-4.9 Dietary notes from the guest page
*Kind: Happy · Start: D4, rehearsal copy · Refs: `set_dietary`, G-07*
- **When** Tara types "Mushroom allergy" in the food preferences field and sends.
- **Then** Mira and Diya see "Mushroom allergy" on Tara's guest row within 5 s. There is one activity entry, topic `dietary.updated`, and no count changes.
- A dietary request for a guest outside her household answers 404 `not_found`.

### Must 5. Money ledger

Done when (scope): "Budget, committed, paid and outstanding are shown separately. 'The advance was ₹40,000, not ₹50,000' corrects that same payment and keeps its history."

#### AT-5.1 The ledger at D0
*Kind: Happy · Start: D0 · Refs: M4–M7, demo-data §5–§7*
- **Given** Mira on Money.
- **Then** four figures, each on its own: Budget ₹12,00,000 · Committed ₹9,27,000 · Paid ₹3,97,000 · Still owed ₹5,30,000, plus "Not yet committed ₹2,73,000". Totals have a single rule above and a double rule below. Amounts use tabular figures and are right-aligned.
- **And** the category table, in this order:

| Category | Planned | Committed | Paid | Still owed | Not yet committed |
|---|---|---|---|---|---|
| Venue and halls | ₹3,00,000 | ₹2,80,000 | ₹1,40,000 | ₹1,40,000 | ₹20,000 |
| Catering | ₹2,40,000 | ₹2,00,000 | ₹50,000 | ₹1,50,000 | ₹40,000 |
| Decor and flowers | ₹1,60,000 | ₹1,50,000 | ₹50,000 | ₹1,00,000 | ₹10,000 |
| Photography and video | ₹1,20,000 | ₹1,10,000 | ₹30,000 | ₹80,000 | ₹10,000 |
| Attire and jewellery | ₹1,50,000 | ₹95,000 | ₹95,000 | ₹0 | ₹55,000 |
| Music and entertainment | ₹70,000 | ₹55,000 | ₹15,000 | ₹40,000 | ₹15,000 |
| Mehendi and makeup | ₹50,000 | ₹25,000 | ₹5,000 | ₹20,000 | ₹25,000 |
| Invitations and gifts | ₹40,000 | ₹12,000 | ₹12,000 | ₹0 | ₹28,000 |
| Transport and logistics | ₹30,000 | ₹0 | ₹0 | ₹0 | ₹30,000 |
| Contingency | ₹40,000 | ₹0 | ₹0 | ₹0 | ₹40,000 |
| **Total** | **₹12,00,000** | **₹9,27,000** | **₹3,97,000** | **₹5,30,000** | **₹2,73,000** |

- **And** PRP-01 shows as "Proposed": Dhol player, ₹15,000, Music and entertainment, by Diya. It is in no total. Beside it: Music ₹70,000 if approved, and the wedding's committed ₹9,42,000 if approved.
- **And** the vendor rows:

| Vendor | Committed | Paid | Still owed | Balance due |
|---|---|---|---|---|
| Annapoorna Caterers | ₹2,00,000 | ₹50,000 | ₹1,50,000 | Sat 12 Dec |
| Mallige Gardens | ₹2,80,000 | ₹1,40,000 | ₹1,40,000 | Tue 1 Dec, due soon |
| Marigold Lane Decor | ₹1,50,000 | ₹50,000 | ₹1,00,000 | Thu 10 Dec |
| Frame & Phera Studio | ₹1,10,000 | ₹30,000 | ₹80,000 | Mon 14 Dec |
| Mehendi Mahal Artists | ₹25,000 | ₹5,000 | ₹20,000 | Sun 13 Dec |
| Bass Baraat Sound | ₹55,000 | ₹15,000 | ₹40,000 | Sun 13 Dec |
| EXP-01, the printer (fictional), one-off | ₹12,000 | ₹12,000 | ₹0 | – |
| EXP-02, the boutique (fictional), one-off | ₹95,000 | ₹95,000 | ₹0 | – |

- **And** Mallige Gardens is the only vendor marked due soon: "Due 1 Dec, in 6 days".
- **And (records)** `money_summary`: `total_committed_inr` 927000, `total_paid_inr` 397000, `total_outstanding_inr` 530000, `total_overpaid_inr` 0, `budget_inr` 1200000, `uncommitted_inr` 273000, `unallocated_inr` 0, `pending_proposals_inr` 15000, `if_approved_committed_inr` 942000. Mallige Gardens' due item has `days_until_due` 6 (D99).

#### AT-5.2 The correction by voice (D0 → D1)
*Kind: Happy, Live #2 and #3 · Start: D0 · Refs: M-03, C-01, C1–C7, V1, V2, V9, ACT-06*
- **Given** Mira on Money → Annapoorna Caterers: Committed ₹2,00,000 · Paid ₹50,000 · Still owed ₹1,50,000.
- **When** she says "Caterer ko chaalis hazaar advance diya tha."
- **Then** the review card reads "Correction, not a new payment · PAY-01 · ₹50,000 → ₹40,000 · heard 'chaalis hazaar'". The ₹50,000 is struck through, an "After saving" block shows Paid ₹40,000 and Still owed ₹1,60,000, and the button is named for the action. Nothing has changed yet: the page still reads ₹1,50,000.
- **When** she says "Haan, save karo." or taps the button.
- **Then**, after the save and before any audio:
  - the vendor page reads Paid ~~₹50,000~~ ₹40,000 and Still owed ₹1,60,000, with "Corrected by Mira, 25 Nov, <time>", and the changed figures take the wash;
  - the payments list still has one payment: PAY-01, Advance, Fri 20 Nov 2026, UPI;
  - History, oldest first: version 1, ₹50,000, recorded 20 Nov by Mira, typed; version 2, ₹40,000, today, by Mira, by voice, with the transcript as heard;
  - Money reads Committed ₹9,27,000 · Paid ₹3,87,000 · Still owed ₹5,40,000, and the Catering line reads ₹40,000 paid, ₹1,60,000 still owed.
- **Then** the reply plays: "एक लाख साठ हज़ार रुपये बाकी हैं।"
- **And** Mira's Activity shows "Mira corrected the advance to Annapoorna Caterers from ₹50,000 to ₹40,000." (ACT-06). Diya's feed does not show it (L5, domain open question 1). Her vendor page shows ₹1,60,000 within 5 s, because vendor dues are shared with her.
- **And (records)**
  - PAY-01 has `current_version_no` 2 and two `payment_versions`; version 1 has `superseded_at` set.
  - The caterer has exactly one payment, and total paid fell by exactly ₹10,000.
  - Version 2 carries `source` `voice`, the `voice_turn_id` and the `spoken_text`.
  - One receipt, with key `{voice_turn_id}:0`. Topic `payment.corrected`. `weddings.version` + 1.
  - The dispatcher call is the envelope in domain 7.3.

#### AT-5.3 The same correction by typing
*Kind: Happy (the fallback when Sarvam is down) · Start: D0 · Refs: V1, C2*
- **When** Mira opens PAY-01, chooses to correct it, types 40,000, adds the reason "Advance was ₹40,000, not ₹50,000" and saves.
- **Then** every figure, line and record of AT-5.2 holds, except that `source` is `ui`, there is no transcript, History shows the reason, and no audio plays.
- **Also:** tapping the amount on the voice review card and typing 40,000 there sends the same correction through the voice confirm, with `edits` (demo-script's fallback for a misheard amount).

#### AT-5.4 Confirming twice writes once
*Kind: Fail (replay) · Start: D0, three runs · Refs: X-01, V7, I2, C6*
- **When** the M-03 preview is confirmed twice: by a double tap in run 1, by a network retry of the confirm in run 2, and by saying "Haan, save karo." twice in run 3.
- **Then**, in every run, PAY-01 has exactly two versions, paid is ₹40,000, still owed is ₹1,60,000, there is one ACT-06 and `weddings.version` rose by 1 in total. A repeated confirm returns the stored result for action 0 with outcome `replayed`. A second spoken "haan" finds no open turn and writes nothing.

#### AT-5.5 Stale, unchanged, undone and voided payments
*Kind: Fail (concurrency); undo and void are Rehearsal only · Start: D0 · Refs: C4, C8, C9*
- **Stale.** Two tabs show PAY-01 at version 1. Tab A saves ₹40,000. Tab B then saves ₹45,000 and gets 409 `stale_version`: it shows the current ₹40,000 and who set it, and nothing is written.
- **Unchanged.** At D1, correcting PAY-01 to ₹40,000 again returns `unchanged`: no version 3, no activity entry, no version change.
- **Undo.** "Undo" on the correction receipt writes version 3 at ₹50,000, and version 2 stays in History. Activity reads "Mira corrected the advance to Annapoorna Caterers from ₹40,000 to ₹50,000.", and still owed is ₹1,50,000 again.
- **Void.** A voided payment stays listed, struck through and labelled "Void", and leaves every total. Nothing is ever deleted.

#### AT-5.6 Invalid amounts are refused
*Kind: Fail (invalid input) · Start: D0 · Refs: M1, M2, M3*

Sent through the command route (`correct_payment` on PAY-01, or `record_commitment` where named). Each answers before anything is written.

| Input | Answer |
|---|---|
| `amount_inr` 0 | 422 `validation_failed`, `out_of_range` |
| `amount_inr` −5000 | 422 `validation_failed` |
| `amount_inr` 40000.5 | 422 `validation_failed`, `not_integer` |
| `amount_inr` "40000", a string | 422 `validation_failed`, `not_integer` |
| `amount_inr` 4e4, exponent form | 422 `validation_failed` |
| `amount_inr` 1000000001, over ₹100 crore | 422 `validation_failed`, `out_of_range` |
| `paid_on` 2026-11-26, after today | 422 `validation_failed`, field `paid_on` |
| `record_commitment` per unit, 800 × 250, with `amount_inr` 210000 | 422 `amount_mismatch` |
| `record_commitment` per unit with `unit_price_inr` 1000001 | 422 `validation_failed`, `out_of_range` |

- **On the forms,** an amount field accepts digits with or without Indian commas ("40,000", "40000"). Anything else ("40k", "40,000.50", "forty thousand", "-5,000") is refused next to the field before anything is sent.

#### AT-5.7 A manager's money change becomes a proposal
*Kind: Fail (wrong role), Rehearsal only · Start: D0 · Refs: A1, A2, A5, V8, M-12, X-04*
- **When** Diya says "Decorator ko bees hazaar de diye." and confirms (or uses the payment form).
- **Then** her review card says the payment goes to Mira for approval. After she confirms, the reply is "Yeh ₹20,000 ka payment Mira ki approval ke liye bhej diya. Ledger abhi nahi badla." Marigold Lane Decor still reads ₹1,50,000 / ₹50,000 / ₹1,00,000, and Diya's proposals list shows PRP-02, pending, ₹20,000.
- **And** Mira's Overview lists two pending proposals (PRP-01 and PRP-02), each with Approve and Decline. Her Activity reads "Diya proposed a payment of ₹20,000 to Marigold Lane Decor. It needs an owner's approval."
- **And (records)** HTTP 202, outcome `proposed`; a `pending` proposal with command `record_payment` and `committed_delta_inr` 0; no payment row.
- **And** `record_payment` sent directly with Diya's session answers 403 `approval_required`, as does every gated command in A1.

#### AT-5.8 The owner approves or declines
*Kind: Happy, Rehearsal only · Start: D0 · Refs: A4, A6, domain open question 10*
- **When** Mira approves PRP-01.
- **Then**:
  - Music reads ₹70,000 committed, equal to its ₹70,000 budget, so ₹0 not yet committed.
  - The wedding reads Committed ₹9,42,000 · Paid ₹3,97,000 · Still owed ₹5,45,000 · Not yet committed ₹2,58,000.
  - Activity reads "Mira recorded an expense of ₹15,000 to Dhol player (Music and entertainment). Proposed by Diya."
  - Diya's proposals list shows it approved.
- **When**, on a fresh D0, Mira declines it instead.
- **Then** nothing in the ledger changes, and Activity reads "Mira declined Diya's proposal: an expense of ₹15,000 to Dhol player (Music and entertainment), not yet paid." (the seeded summary follows the template, D91)
- Deciding a proposal a second time answers 409 `proposal_not_pending`. Diya approving anything answers 403 `forbidden`.

#### AT-5.9 What the manager sees of money
*Kind: Privacy · Start: D0 · Refs: G7, domain 4.2, M-14*
- **Given** Diya on Money.
- **Then** she sees the vendor rows with their figures, because vendor dues are shared. In place of the budget, the totals and the category lines she sees "Not shared with you". No zero stands in for a hidden figure.
- **And** the server refuses M-14, "What's our total budget, and how much shagun came in?": "The budget and the Shagun register haven't been shared with you. I can help with vendor dues."
- **And (records)** Diya's `money_summary` lists `budget` in `hidden` and carries no total fields.

### Must 6. Vendors and catering

Done when (scope): "Quotes, agreed amounts, advances and balances. The RSVP-based estimate (230 × ₹800 = ₹1,84,000) sits beside the fixed ₹2,00,000 contract."

#### AT-6.1 Annapoorna Caterers at D0
*Kind: Happy · Start: D0 · Refs: E1–E7, domain 4.2 and 4.5, demo-data 6.1*
- **Given** Mira on Vendors → Annapoorna Caterers.
- **Then**, top to bottom:
  - Catering, contracted (status `booked`, domain value sets), contact Suresh, +91 90000 02001, serving the Reception.
  - Quote: ₹850 × 250 = ₹2,12,500, accepted. It is never in a total.
  - Contract (COM-01): "250 plates × ₹800 = ₹2,00,000", a fixed minimum of 250 covers, recorded 20 Nov by Mira, balance due Sat 12 Dec.
  - Payment: PAY-01, Advance, ₹50,000, Fri 20 Nov 2026, UPI.
  - Committed ₹2,00,000 · Paid ₹50,000 · Still owed ₹1,50,000.
  - In its own dashed box beside the contract: "Estimate, not the contract", "≈ ₹1,83,200", "229 attending × ₹800" and "₹16,800 below the contract. The contract changes only if you renegotiate it." Beside it, both headcounts: 250 expected (planning) and 229 confirmed.
- **And (records)** the commitment's `formula_text` in `vendor_ledger` is "250 plates × ₹800 = ₹2,00,000". `catering_estimate`: `estimate_inr` 183200, `difference_inr` 16800, `direction` `below`, `contract_amount_inr` 200000.

#### AT-6.2 The estimate after Tara's reply
*Kind: Happy, Live (1:25–1:50) · Start: D4 · Refs: E2–E5, V-01*
- **Then** the box reads "≈ ₹1,84,000", "230 attending × ₹800" and "₹16,000 below the contract. The contract changes only if you renegotiate it." The contract line is unchanged, and no figure in Committed, Paid, Still owed or any total moved (E4).
- **When** Mira asks "Caterer ka estimate kitna hai?"
- **Then** the reply is "Confirmed guests ke hisaab se estimate ₹1,84,000 hai. Contract fixed ₹2,00,000 ka hi hai."

#### AT-6.3 The commitment and advance by voice (S0 → D0)
*Kind: Happy, Video · Start: S0, rehearsal copy · Refs: M-01, M3, domain 7.1 step 1*
- **Given** Annapoorna Caterers with its ₹2,12,500 quote and no contract. Money reads ₹7,27,000 / ₹3,47,000 / ₹3,80,000, with ₹4,73,000 not yet committed.
- **When** Mira says "The caterer is charging eight hundred per person for 250 people. I paid a fifty-thousand advance."
- **Then** one review card shows two actions: the contract, "250 × ₹800 = ₹2,00,000", worked out by Jashn and not by the model; and an advance of ₹50,000, marked "Date not given". One button names both (for example "Save contract and payment").
- **When** she confirms once.
- **Then** the caterer reads ₹2,00,000 / ₹50,000 / ₹1,50,000; Money reads ₹9,27,000 / ₹3,97,000 / ₹5,30,000, with ₹2,73,000 not yet committed; the quote is accepted. The reply is "Saved a ₹2,00,000 catering commitment and a ₹50,000 advance. ₹1,50,000 is outstanding."
- **And (records)** a `per_unit` commitment (`unit` `plate` or `person`, 800 × 250, `event_id` EVT-REC) and an `advance` payment with `paid_on` empty, linked to it. Keys `{voice_turn_id}:0` and `{voice_turn_id}:1`; two activity entries; `weddings.version` + 2.

#### AT-6.4 More money by voice (rehearsal rows)
*Kind: Happy, Rehearsal only · Refs: M-06, M-07, M-08, M4, M5*

| Start | Mira says | After confirming | Reply |
|---|---|---|---|
| D0 | "Decorator ko pachaas hazaar aur de diye." | A new PAY-07, an instalment and not a correction. Marigold Lane Decor still owes ₹50,000; the wedding has paid ₹4,47,000 and still owes ₹4,80,000 | "Decorator ko ₹50,000 ka payment save hua. Ab ₹50,000 baaki hai." |
| D1 | "Caterer ko dedh lakh de diye." The preview shows "dedh lakh = ₹1,50,000" | A new PAY-08. The caterer still owes ₹10,000, and the wedding ₹3,90,000 | "Caterer ko ₹1,50,000 ka payment save hua. Ab sirf ₹10,000 baaki hai." |
| D0 | "Photographer ka total sava lakh ho gaya hai." | COM-04 version 2 at ₹1,25,000. Frame & Phera Studio still owes ₹95,000; committed is ₹9,42,000; the warning `over_budget` says Photography is ₹5,000 over its ₹1,20,000 line | "Photographer ka contract ₹1,25,000 ho gaya. ₹95,000 baaki hai, aur photography budget se ₹5,000 upar hai." |

- **Reply wording.** M-06 and M-08's replies show ₹ figures, as voice-test-set now does, because generated replies never use dedh-style words (M7; voice 4.10). Their spoken forms are built in code.
- **Overpaid.** At D1, a typed ₹1,70,000 instalment to the caterer saves with the warning `overpaid`. The caterer reads "Overpaid ₹10,000" in amber, with an explanation, and Still owed ₹0, never a negative number. The wedding reads ₹3,80,000 still owed and ₹10,000 overpaid: one vendor's overpayment never hides another vendor's due (M5).

#### AT-6.5 Vendor input errors and sharing
*Kind: Fail (invalid input, wrong role) · Start: D0 · Refs: `add_vendor`, `add_quote`, M3, G7*
- Adding a vendor named " annapoorna caterers " answers 409 `duplicate_vendor`, with the existing vendor in `current`, so voice offers it instead.
- A per-unit quote or commitment whose sent amount differs from rate × quantity answers 422 `amount_mismatch`.
- With vendor-dues sharing switched off (rehearsal), Diya's vendor pages lose every figure and say "Not shared with you", and her `add_quote` answers 403 `forbidden`.

### Must 7. Invitation and wedding website

Done when (scope): "A maroon-and-gold stationery design with your photo, a published guest site and an exported invitation card."

#### AT-7.1 Style the invitation by voice
*Kind: Happy, Video · Start: T1, rehearsal copy · Refs: I-01, `update_invite_style`, `add_asset`*
- **Given** Invite, with the fictional AI-generated portrait uploaded through the studio as a JPEG under 10 MB.
- **When** Mira says "Make the invite maroon and gold. Use this photo."
- **Then** the preview shows the Maroon & Gold theme with the photo. After she confirms, the studio's draft uses:
  - ground #4E0C1A, card stock #F7EFDF, names and headings #6A1224, foil #C9A24E, wording and Hindi lines #7D5B17, details #2B1D1A (the `maroon_gold` row in export-and-recovery 1.3);
  - Eczar for the names, function names and wording, and Anek Devanagari for the logistics;
  - the photo as uploaded, never filtered or retouched, labelled "AI-generated, fictional".
- **And** the reply is "Your invite is now maroon and gold, with this photo. Publish it when you're happy." No guest page changes until an owner publishes (P1, P5).
- **And (records)** `invite_styles.theme` is `maroon_gold` and `photo_asset_id` is set; `draft_version` + 1; topic `invite_style.updated`.
- **Upload limits:** a GIF, or a JPEG over 10 MB, is refused next to the field, and nothing is stored. Objects go to the private `uploads` bucket at `{wedding_id}/{asset_id}.{ext}`.
- **Batches.** The typed path (the style, and the couple photo through A6's upload) ships in the 12:30 minimum Invite studio, whether or not #11 is in play (D105). The voice half, I-01 with the dock paperclip's "Couple photo" upload, is Lane C's 13:45 item, after A6 (12:30) and Lane D's `update_invite_style` (11:40). If it misses 13:45, the README marks AT-7.1's voice half Partial (D121).

#### AT-7.2 The published guest site
*Kind: Happy · Start: D0, D2 and D3 · Refs: P4, P5, demo-data 11.3*
- The guest site is Tara's page: AT-4.1 at revision 2 and AT-4.2 at revision 3. It is built from the published snapshot, never the draft, so at D2 Tara still sees Banyan Hall (AT-9.3) and at D3 she sees Lotus Hall.
- A style change in the draft (any `update_invite_style` change, rehearsal) shows on Invite at once, appears in the publish sheet as a change, and reaches guests only after the publish.
- The site sends `X-Robots-Tag: noindex` (AT-9.5).

#### AT-7.3 Export the revision 3 card
*Kind: Happy · Start: D3, rehearsal copy, drill off · Refs: I-02, `request_card_export`, P9, export-and-recovery 1.1–1.5 and 2.7*
- **When** Mira (or Diya) taps "Export card" on Invite.
- **Then** the exports panel goes Queued → Rendering → Ready ("Ready at <time>, attempt 1 of 3."), with a thumbnail, within 5 s warm and 15 s cold. Download saves `jashn-card-rev3.png`. (From attempt 2, the in-progress label reads "Retrying" instead of "Rendering".)
- **And** the PNG is 1080 × 1350 and shows, top to bottom:
  - the MK seal and शुभ विवाह;
  - "With the blessings of our families", "Mira & Kabir", "invite you to celebrate their wedding";
  - the photo, uncropped (the template also renders without one, so the 11:50 card passes either way; D107);
  - "Reception" with रिसेप्शन, then "Monday, 14 December 2026", "7:30 PM onwards" and "Lotus Hall, Mallige Gardens, Whitefield, Bengaluru", each on its own line;
  - "आपकी उपस्थिति से हमें अत्यंत प्रसन्नता होगी।";
  - "Kindly reply through your personal invitation link";
  - the footer "Fictional demo data. AI-generated photo."
- **Never on the card:** any amount, vendor, guest name or count, draft value, warning, reply state, QR code, link or token. No other function appears either: the card lists only the functions every invited guest is invited to, which in the demo is the Reception alone.
- **And** the REV-2 card's row reads "Out of date. Export a new card." and "Made 24 Nov for revision 2. The reception venue has changed since." Its download returns the seeded `card-rev2.png`, showing Banyan Hall, once Lane D's `scripts/seed-assets/card-rev2.png` is seeded; before 13:45 the job is seeded Ready with no file, and rehearsals skip that download (D15).
- **And (records)** one job with `export_key` `export:{wedding_id}:rev3:png`, status `succeeded`, one attempt and `artifact_id` `card-rev3.png`; the object is `{wedding_id}/card-rev3.png` in the `exports` bucket (architecture §9, item 11). Activity reads "Mira started a card export for revision 3." and then "The card for revision 3 is ready."
- **And (records), where it ran:** the request route renders nothing. After commit it kicks `POST /api/ops/export-jobs/{job_id}/run`, which claims the job (`queued` → `rendering`, moving `weddings.version` with no activity entry), opens `/render/card/{job_id}?t=…` in Chromium and stores the PNG. The attempt's `renderer` is `chromium`, or `og` once the user flips `card_renderer` at 12:15 (export-and-recovery 3.7). The og renderer ships dormant in the 11:40 batch, so the flip needs no deploy, and Lane D checks both branches against 6.6 (D48).
- **By voice:** "Naya card export karo." needs one confirming tap (domain open question 11), runs the same command and replies "Lotus Hall wala naya card ban raha hai. Pehle download kiya card purana hai."

#### AT-7.4 Export guards
*Kind: Fail · Refs: export-and-recovery EX-15, EX-18, EX-20, `nothing_published`*
- Exporting again at D3 returns `unchanged` with the same job: no second row and no second file, even when two clicks race.
- Before any publish (a T1 wedding with draft functions), the export answers 409 `nothing_published`, the panel explains that a card needs a published schedule, and nothing is written.
- A download link stops working after 10 minutes; reloading the panel signs a new one.
- Diya can export but sees no Retry, and the owner's retry route answers her 403 `forbidden`. A guest token on any export route answers 401.
- The render page, `/render/card/{job_id}?t=…`, with a wrong or expired token, or a token signed for another job, answers the plain 404 page. Its HTML holds no money, vendor, guest name, count or draft value.
- `POST /api/ops/export-jobs/{job_id}/run` without the bearer `JOBS_API_TOKEN`, or with a member session, answers 401 and renders nothing.

#### AT-7.5 The NudgeBee recovery drill
*Kind: Happy (sponsor), Video · Start: D3, on Lane D's rehearsal copy, or on the demo copy for the V15 take · Refs: export-and-recovery 4–7, NB-T10, demo-data 13.2*
- **Given** `export_failure_drill` enabled in Flagsmith Production with that copy's wedding id as its value, and the NudgeBee workflow `card-export-recovery` active.
- **When** Mira taps "Export card".
- **Then** the panel shows Failed with the "Deliberate drill" chip and "Renderer timeout, <time>. Sent to NudgeBee for recovery. The retry waits for an operator's approval." The attempt line reads "Attempt 1 failed at <time>: renderer timeout (deliberate drill). Started by Mira."
- **And** within 10 s a NudgeBee run starts from the webhook. `resolve_job` and `read_status` succeed, and `approve_retry` waits with the approval message (export-and-recovery 6.4). The message shows JOB-EXP-R3-PNG, "Mira & Kabir, Reception, Monday, 14 December 2026, Lotus Hall", "DRILL_INJECTED: Injected fault (deliberate): renderer timeout", and the "If you approve" and "If you reject" lines.
- **When** the approver clicks Approve.
- **Then**:
  - `retry_export` answers 200 with outcome `retried` and status `succeeded`;
  - `verify` answers 200;
  - `replay_check` answers `replayed` "true" with the same attempt, "2", and the same artifact;
  - `verdict` prints "Card card-rev3.png ready (sha256 …). Retry retried; resend replayed true; one card for export:…:rev3:png. No publish, guest page, RSVP or ledger change."
- **And** in Jashn the panel reads Ready, with "Attempt 2 ready at <time>. NudgeBee run <first 8 characters of the run id>, approved by lead." Activity has four entries, in order: requested, failed (with " (deliberate drill)"), retried by NudgeBee, ready. The card shows Lotus Hall.
- **Unchanged throughout:** `published_revision` stays 3 with no new publication; every money figure and every reply count stays the same; the guest page does not change.
- **After the take:** disable the drill and clear its value; note the run id and time for the caption; keep the three screenshots and `card-rev3.png`; reset the copy to D0.

#### AT-7.6 Recovery failure paths
*Kind: Fail · Refs: export-and-recovery EX-01–EX-14, NB-T11–NB-T13*

| Case | Expected |
|---|---|
| The approver rejects | NudgeBee prints "Rejected by {approver}. The job stays failed; nothing was re-rendered." The job stays failed with one attempt, and the owner's "Retry here" still works |
| The finished run is retried in NudgeBee | It ends at `nothing_to_retry` |
| A direct retry with a new key after success | 200 `already_succeeded`, with the same `artifact_id` and sha256; no new attempt, activity entry or version change |
| The same key sent three times to a failed job | `retried` once, then two replays with `replayed` "true"; 2 attempts in all; one file |
| No token, a wrong token, a `Basic` scheme, or a member session cookie instead of the token | 401 `unauthenticated` with no detail. Nothing is written, and the token is never echoed |
| No `Idempotency-Key`, or one of 7 or 201 characters | 400 `validation_failed`, field `idempotency_key` |
| An unknown job id, or one that is not a UUID | 404, with identical bodies |
| The same key with another job or body | 409 `idempotency_key_reused` |
| A revision 2 job while revision 3 is published | 200 `stale_revision`, and no attempt |
| A job with 3 attempts | 200 `not_retryable` |
| A job left `queued` for more than 60 s, because the kick was lost (EX-09) | The next ops GET, retry or export request expires it lazily to `failed` with `NOT_STARTED` ("the render never started"), and it is retryable. Member read models never write; the panel shows it as "stopped responding" |
| No approval in time | NB-T13 runs a copy of the workflow with a 2-minute approval: the step and the run fail after 2 minutes, the job stays failed, and the owner's Retry still works. The real workflow waits 45 minutes; 45 minutes after notifying, the panel reads "No approval came within 45 minutes." |

- Every ops response is JSON in which every scalar is a string, with `Cache-Control: no-store` and no CORS headers. It never carries a URL, path, token or signed link (export-and-recovery 5.1, domain 4.8).

### Must 8. Owner and manager collaboration

Done when (scope): "Two real logins. The manager's changes appear for the owner, showing who changed what and when, and the owner approves publishing and spending."

#### AT-8.1 Two real logins
*Kind: Happy · Start: D0 · Refs: architecture 3.5, `invite_member`, `accept_member_invite`*
- Mira signs in on the laptop and Diya on her own browser, each with her own email and password. Each sees her own name and role (Owner, Event manager) and the same wedding. Signing out in one leaves the other signed in.
- **Joining** (rehearsal, with a fresh `@example.com` invitee):
  - Mira invites the address as a manager, and the `/join/{token}` link is shown once.
  - The invitee signs up with that email and joins. Activity (owners) reads "Mira invited {email} as manager." and then "{email} accepted the invite as manager." (domain 3.1).
  - A different signed-in email opening the link gets 403 `forbidden`. Using the link twice, or after 48 hours, gets 404 `invite_invalid`. Diya inviting anyone gets 403 `forbidden`.
- **Cancelling and removing** (rehearsal):
  - Mira cancels a second, pending invite (`revoke_member_invite`). Its link answers 404 `invite_invalid` at once, and Activity (owners) reads "Mira cancelled the invite to {email}."
  - Mira removes the member who joined (`remove_member`). From their next request they get no planner data, and the version poll answers them 403. Activity (owners) reads "Mira removed {member} from the wedding."
  - Removing the wedding's only owner answers 409 `last_owner`. Diya calling either command gets 403 `forbidden`.
- **Who builds it (D64, D109):** the owners-only "Team and sharing" sheet (the invite and sharing controls, and the one-time join URL display) opens from the shell's wedding menu, with no new route segment. It is Lane B's B4 sheet at 13:45, after A6 (12:30), reading `team` (domain 4.11) and sending commands through `dispatchCommand` (D98). `/join/{token}` and the member commands are Lane A's; A6 adds `remove_member` and `revoke_member_invite`. The two-login demo doesn't depend on the sheet: the seed creates Diya's membership (D68).

#### AT-8.2 Diya's change reaches Mira, attributed, within 5 s
*Kind: Happy, Live (1:02–1:12) · Start: D1 · Refs: L1–L3, domain 4.7, design-direction 7.2, architecture 2.3*
- **Given** Mira on Overview, Activity or Events, not touching the laptop.
- **When** Diya saves the venue move (AT-3.3).
- **Then**, within 5 s (target 1–3.5 s), with no reload, no toast, no scroll jump and no focus move:
  - Activity's newest entry reads "Diya moved the reception from Banyan Hall to Lotus Hall.", marked "Draft. Guests still see Banyan Hall." and "just now";
  - on Events, if it is open, the reception venue takes the wash with "Changed by Diya, <time>"; if Events is not on screen, its nav item gets the gold dot;
  - Overview's decisions show 1 unpublished change.
- **When** Mira asks "Diya ne kya badla?"
- **Then** the reply is "Diya ne reception Banyan Hall se Lotus Hall mein shift kiya. Yeh abhi draft hai, guests ko Banyan Hall hi dikh raha hai.", with a link to the entry.
- **And (records)** ACT-07: `actor_label` Diya, topic `event.updated`, `before` venue Banyan Hall, `after` venue Lotus Hall, visibility `members`, `awaiting_publish` true.

#### AT-8.3 Who changed what today, and what is owed
*Kind: Happy · Refs: M-10, M-11, O-04*

| Start | Mira says | Reply (nothing is written) |
|---|---|---|
| D3 | "What changed today, and how much do we still owe?" | "Diya made three changes today, including moving the reception to Lotus Hall, which is now published. You still owe ₹5,40,000, including ₹1,60,000 to the caterer." It links to ACT-04 to ACT-08 and to Money |
| D1 | "कुल कितना बाकी है?" | "कुल पाँच लाख चालीस हज़ार रुपये बाकी हैं।" |
| D0 | "What did the event manager change today?" | As in AT-2.4 |

#### AT-8.4 The owner approves publishing and spending; the manager cannot
*Kind: Fail (wrong role) · Start: D0 · Refs: A1–A3, P3, domain 6.1*
- Publishing: AT-3.4 (the owner publishes) and AT-3.5 (the manager is refused). Spending: AT-5.7 (the proposal) and AT-5.8 (the approval).
- With Diya's session, each of these answers 403 `forbidden` and writes nothing: `set_wedding_profile` (update), `set_budget_line`, `set_sharing`, `invite_member`, `revoke_member_invite`, `remove_member`, `set_invitations`, `create_invitation_links`, `revoke_invitation_link`, `publish_itinerary`, `approve_proposal`, `reject_proposal`, `record_shagun`, `mark_shagun_thanked` and `reset_demo`.
- **Beside X-04:** Diya's `set_invitations` for any guest answers 403 `forbidden`, and the guest's invitations are unchanged (domain A3, P10). Her `add_guest` with `event_ids` or `max_plus_ones`, or into a household with an active link (H16), also answers 403 `forbidden` and writes nothing (domain 3.4).
- With Diya's session, each gated command answers 403 `approval_required`: `record_commitment`, `update_commitment`, `void_commitment`, `record_payment`, `correct_payment`, `void_payment` and `record_expense`.
- With Mira's session, `propose_change` answers 403 `forbidden`.
- With Diya's session, these work: `create_event`, `update_event`, `update_invite_style`, `add_asset`, `add_vendor`, `update_vendor`, `add_requirement`, `add_guest` (without `event_ids` or `max_plus_ones`, and not into a household with an active link), `set_rsvp`, `set_dietary`, `request_card_export`, and `add_quote` while vendor dues are shared.

#### AT-8.5 What each feed shows
*Kind: Privacy · Refs: L5, A7, domain open question 1*

| State | Mira's Activity | Diya's Activity |
|---|---|---|
| D0 | 5 entries: ACT-01 to ACT-05 | 4: ACT-01, ACT-02, ACT-04 and ACT-05. ACT-03 is a money entry; Diya follows PRP-01 on her proposals list |
| D1 | 6 (+ ACT-06) | 4 |
| D2 | 7 (+ ACT-07) | 5 |
| D3 | 8 (+ ACT-08) | 6 |
| D4 | 9 (+ ACT-09) | 7 |
| D5 | 10 (+ ACT-10) | 8 |

- Diya's feed never shows an entry about commitments, payments, quotes, expenses, the budget, shagun, members or links.

#### AT-8.6 Everything survives a reload
*Kind: Happy · Refs: X-05*
- After each live step, reload both members' screens and the guest page. Every number equals section 0.4 for that state, each voice-made change is still there, and each change appears in the other session.

### Must 9. Privacy by role

Done when (scope): "Guest links can never see money, vendors or functions the guest isn't invited to. The server enforces it."

#### AT-9.1 Tara's view is the allowlist, at every state
*Kind: Privacy · Start: D0, D2, D3, D4 and D5 · Refs: G2, G3, domain 4.6 and 7.4*
- At each state, Tara's page and every guest-route response carry only the fields of `guest_invitation_view` (domain 4.6). The check is made on the structured fields, not on free text (domain open question 16):
  - no field ending `_inr`, and no ₹ sign anywhere on the page;
  - no count of any kind;
  - the functions are exactly EVT-SAN and EVT-REC;
  - the only guest is Tara Bhat;
  - no vendor record, quote, requirement, proposal, activity entry, member, warning, draft value, export job, contact or token.
- `revision` is 2 at D0 and D2, and 3 from D3.
- The seeded reception description reads "Dinner follows." (domain open question 16), so no vendor name reaches guests through free text either.

#### AT-9.2 A guest link opens nothing else
*Kind: Privacy · Start: D4 · Refs: G4, X-03, domain 6.1, demo-script judge answer 4*

With only Tara's token, in a browser with no session. No response in this table carries wedding data.

| Request | Answer |
|---|---|
| Any planner page: `/w/{wedding_id}` and its money, vendors, guests, events, activity, shagun and invite pages | The sign-in page (the planner layout sends signed-out users to `/login`), with no wedding data in the HTML |
| `GET /api/w/{wedding_id}/version` | 401 |
| `POST /api/w/{wedding_id}/commands/{command}`, for any command | 401 |
| The exports routes, or a card download | 401 |
| Every voice route: `/api/voice/turn`, `/api/voice/confirm`, `/api/voice/cancel`, and `/api/voice/turns/{voice_turn_id}/reply-audio` and `/trace` | 401 (guest voice is not built, and a guest link carries no session) |
| `/api/ops/export-jobs/{job_id}`, its `/retry` and its `/run`, with the guest token as the bearer | 401 |
| Mehendi details through the guest RSVP route | 404 `not_found` (AT-4.6) |

- A signed-in member of another sample copy opening this wedding's planner URLs gets no data either: 401, 403 or 404, never a 200 with data.

#### AT-9.3 Drafts never reach guests
*Kind: Privacy, Live (1:12–1:18) · Start: D2 · Refs: P1, P5, P8*
- **Given** Diya has moved the reception to Lotus Hall in the draft.
- **When** Tara reloads her page.
- **Then** the reception insert still reads Banyan Hall, Mallige Gardens. `GET /api/i/{token}/revision` answers `{"revision": 2}`, "Lotus Hall" appears nowhere on her page, and the REV-2 card still shows Banyan Hall.
- From D3 she sees Lotus Hall (AT-4.2).

#### AT-9.4 Every bad token looks the same
*Kind: Privacy · Refs: G5, domain 6.3*
- An unknown token of the right format, a malformed one (42 characters, or characters outside base64url) and a revoked one each get the same 404 status and body as a missing page, on `/i/{token}`, `/api/i/{token}/revision` and `/api/i/{token}/rsvp`.
- A burst from one IP to `/i/` and `/api/i/` routes, above the per-IP ceiling, gets some 429 `rate_limited` answers. This is best effort, counted per server instance, in Lane A's single rate limiter (D57). The ceiling is a loose 600 requests a minute per IP, beside about 120 GETs and 30 POSTs a minute per token hash (domain 6.3, D108).

#### AT-9.5 Guest pages leak nothing on the way out
*Kind: Privacy · Refs: G6, architecture 3.4*
- `/i/*`, `/api/i/*` and `/render/*` send `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex` and `Cache-Control: private, no-store`.
- The guest page loads no Supabase client, opens no WebSocket and loads no third-party script: the browser's network panel shows only the app's own origin.
- Tapping Directions sends no Referer, so the token never reaches the maps site.
- The couple photo comes through a signed URL that is valid for 1 hour.

#### AT-9.6 The server enforces the manager's limits
*Kind: Privacy · Start: D0 · Refs: G7, G9, M-14, X-04*
- Diya's screens show no budget, totals, category lines, shagun, phone numbers or emails. Hidden blocks say "Not shared with you". She has no Shagun nav item, and its URL shows her no shagun data.
- Called directly with her session, the budget, shagun and record-payment routes refuse her with 403; record-payment answers `approval_required` (X-04).
- The snapshot sent to Sarvam for her voice turns carries no budget, totals, shagun, phone numbers or emails (G9). A unit test of the voice snapshot builder (voice.md 1.9) checks this for an owner and for a manager.

#### AT-9.7 Ids from another wedding are not found
*Kind: Privacy · Refs: domain 3.0 step 3, 5.0*
- A command from Mira's session on one copy that carries an id from another copy (for example that copy's PAY-01) answers 404 `not_found`, and nothing is written.

#### AT-9.8 Secrets stay on the server
*Kind: Privacy · Refs: G8, architecture 5.1 and 5.3*
- Only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` reach the browser.
- A search of the production client bundle, the page HTML and sample API and ops responses finds none of the server-only values: `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `SARVAM_API_KEY`, `FLAGSMITH_SERVER_KEY`, `FLAGSMITH_ORG_API_KEY`, `FLAGSMITH_ID_SALT`, `JOBS_API_TOKEN`, `RENDER_TOKEN_SECRET` and `NUDGEBEE_EXPORT_WEBHOOK_URL`. The same search looks for the addresses in `INTERNAL_USER_EMAILS`, which are personal data (flagsmith §10.5). The lead runs the search locally at the 14:45 freeze, alongside `/security-review`, and never prints a value.
- `VOICE_FIXTURE_MODE` is not set in Vercel Production.

### Should 10. Overview dashboard

Done when (scope): "Upcoming functions, RSVP totals, budget position, dues and recent manager updates. The mic sits in the header on every screen from the start."

#### AT-10.1 Mira's overview at D0
*Kind: Happy · Start: D0 · Refs: domain 4.1, design-direction 8*
- **Header:** "Mira & Kabir", Bengaluru, Mon 14 Dec 2026, the range Sun 13 to Mon 14 Dec 2026, and the "Fictional demo data" badge.
- **Next function,** as a sentence and not a countdown: "First function in 18 days (Haldi, Sun 13 Dec).", with 9:30 am and Courtyard Lawn.
- **Decisions:** PRP-01 (Dhol player, ₹15,000, proposed by Diya) with Approve and Decline; 0 unpublished changes; 2 warnings, the mehendi–sangeet overlap and Banyan Hall's capacity.
- **Money,** as a sentence and one segmented bar with the values printed beside it (no donut, no tiles): ₹9,27,000 committed of ₹12,00,000; ₹3,97,000 paid; ₹5,30,000 still owed; ₹2,73,000 not yet committed.
- **Dues:** Mallige Gardens, ₹1,40,000, "Due 1 Dec, in 6 days". No other vendor is due within 7 days.
- **Replies:** the table in AT-4.8.
- **Today:** Diya's two entries, newest first: the canopy over the sangeet stage (ACT-05, 8:45 am) and the sugar-free dessert for Kamla Arora (ACT-04, 8:30 am).
- The mic is in the header (AT-2.12), and tapping any total opens the records that sum to it.

#### AT-10.2 The overview at the close of the demo
*Kind: Happy, Live (2:50–3:00) · Start: D5*
- **Money:** ₹9,27,000 committed; ₹3,87,000 paid; ₹5,40,000 still owed; ₹2,73,000 not yet committed.
- **Replies:** the reception reads 250 / 230 / 9 / 11, and the sangeet 150 / 136 / 8 / 6.
- **Decisions:** PRP-01 still pending; 0 unpublished changes; 1 warning, the overlap (Lotus Hall seats 300).
- **Today,** for Mira: the latest five, ACT-10, ACT-09, ACT-08, ACT-07 and ACT-06.

#### AT-10.3 Diya's overview
*Kind: Privacy · Start: D0*
- She sees the same header, next function and replies, today's entries within her visibility, and the dues block (vendor dues are shared). The money block says "Not shared with you". Her decisions show the unpublished count and the warnings, with no proposals list; she follows her own proposals on her proposals list.

### Should 11. Read an existing invitation

Done when (scope): "Upload a photo of an old card, and Jashn drafts the details for you to review without inventing missing ones." It is built behind the flag `image_extraction_provider`, and only while Must 1–9 hold. The minimum Guests screen (AT-4.7, AT-4.8) and the minimum Invite studio (AT-7.1's typed path) ship in the 12:30 batch whether or not #11 is in play, with their polish at 13:45 (D105). If L can't verify Must 1–9 on production by 13:00, #11 is Future (D56, which still stands). Its gate (doc-ai 5.2 and architecture §8 row 11 now agree): the latest build start is 13:00; the PR joins the 14:30 batch with AC-1 and AC-3 to AC-12 passing locally and AC-2 through the tunnel; and AC-1, AC-2 and AC-9 pass on production by the 14:45 freeze (section 8.1, item 19). If either is missed, `image_extraction_provider` stays `off`, and the README marks #11 Partial or Future. Its definition of done is doc-ai AC-1 to AC-12; the scenarios below restate the visible results.

#### AT-11.1 The sample card becomes a draft, with nothing invented
*Kind: Happy · Start: T0, a fresh internal test owner on Setup · Refs: AC-1, AC-2, AC-6, doc-ai 4.2*
- **When** they choose "Start from a printed card" (the Phosphor Image icon), then "Try the sample card (fictional)" on the laptop, or "Take a photo" of `arora-printer-proof.jpg` on the iPhone in Safari.
- **Then** the review form shows:
  - Groom Kabir and Bride Mira, with no surnames added;
  - the date "Monday, 14th December", with day and month marked as read;
  - "Year: not printed. Which year is it?" with the chips 2026, 2027 and "Other year", none preselected, and the hint "14 December 2026 is a Monday, as printed.";
  - the wedding function with muhurat 11:15 and "Mandap Lawn, Mallige Gardens, Whitefield, Bengaluru", its start time marked "Not printed";
  - the reception on 14 December marked "Please check", its time and hall marked "Not printed";
  - the hosts and the RSVP contact, for reference only.
- **And** "Use these details" stays disabled until a year is picked and every "Please check" field is ticked. No year, reception time or hall is ever prefilled.
- On the iPhone, the upload is a JPEG under 4 MB.

#### AT-11.2 Nothing is saved until Save, and then exactly once
*Kind: Happy, Fail (replay) · Refs: AC-3, AC-4, AC-5*
- After "Use these details" and before "Save wedding", no wedding, function or activity row exists for this owner.
- They pick 2026, type Reception 19:30 and "Banyan Hall, Mallige Gardens", tap Use these details and save. The result is a wedding for Mira and Kabir on 2026-12-14 with two draft functions: the wedding with muhurat 11:15, and the reception at 19:30. Both survive a refresh, show as unpublished on Events, and have one activity entry each.
- A double tap on Save, or a replay of the apply request, still leaves two functions, and `command_receipts` holds `{import_id}:0` and `{import_id}:1` once each.

#### AT-11.3 Privacy, roles, the flag and failures
*Kind: Fail · Refs: AC-7 to AC-12*

| Case | Expected |
|---|---|
| After apply | No Storage object for the import; the import row holds no image and an empty draft; the logs show the field names sent to Sarvam and no values |
| Diya's session calls GET or apply on the owner's import | 404 |
| A request with only Tara's link | 401 |
| The flag is `off` | The entry action is hidden, POST answers 403 `card_reader_off`, and setup still works by hand |
| A photo without a card | "We couldn't find wedding details in this photo.", and nothing is prefilled |
| Sarvam refuses or times out | "Card reading isn't available right now". After a network cut, polling resumes, then finishes or stops at 180 s; "Try again" makes a new import |

- **Voice (optional, I-03):** with a photo attached through the dock's paperclip, "Yeh purana card hai, isse details le lo." opens the same sheet (voice has no kind for it, and the model never sees the image; doc-ai 1.6, voice 7.3), gives the same draft and the reply "Card se Kabir, Mira aur 14 December mil gaye. Saal aur reception ka time card par nahi hai. Bata dijiye."

### Should 12. Requirements (light)

Done when (scope): "Notes on each function, such as 'Jain food for 12 at the reception', added by voice. Light version only, not the full workspace."

#### AT-12.1 Requirements per function at D0
*Kind: Happy · Start: D0 · Refs: demo-data §8*
- Each function lists its requirements for Mira and for Diya: Mehendi REQ-01 and REQ-02; Haldi REQ-03; Sangeet REQ-04 and REQ-05; Wedding REQ-06 and REQ-07; Reception REQ-08 ("Sugar-free dessert option, for Kamla Arora", Annapoorna Caterers, added by Diya) and REQ-09 ("Peanut-free kids' counter, for Myra"). Guests never see requirements (G2).
- **And (records)** `itinerary` returns them in each function's `requirements` (domain 4.3, D99).

#### AT-12.2 Add one by voice
*Kind: Happy, Fail (duplicate), Rehearsal only · Start: D0 · Refs: R-01, R-02, `add_requirement`*
- **When** Mira says "Add Jain food for twelve guests at the reception." and confirms.
- **Then** the reception lists "Jain food for 12 · Catering · Annapoorna Caterers", and the reply is "Added Jain food for 12 at the reception. It doesn't change what you owe the caterer." (voice 4.10: a requirement never touches the ledger, and no record holds a quote check). No money figure changes. Diya sees it within 5 s, and Activity reads "Mira added "Jain food for 12" to the reception."
- **When** she then says "रिसेप्शन में बारह लोगों के लिए जैन खाना चाहिए।"
- **Then** Jashn asks instead of adding (the command answers 409 `duplicate_requirement`, with the existing one in `current`), and there is still only one such requirement.
- A quantity of 0 or 10,001, or text over 200 characters, is refused next to the field (422 `validation_failed`).

#### AT-12.3 The kill-switch path
- The live version is AT-2.7: refused by voice, saved by typing, D4 → D5.

### Should 13. Shagun register

Done when (scope): "'Sharma ji ne 5,100 shagun diya' is logged as a gift received, with a thank-you list."

Timing (D65, D106, D121): the Shagun backend must merge in the 13:45 batch, which takes a Should PR only if L's post-12:30 demo-path run passed and the PR's own checks are green (D106). Lane B's B6 Shagun page (D65's "B5") starts on fixtures by 13:30, alongside B5 (Overview), and checks real reads after 13:45. Lane C's gated 14:30 topic adds SH-01 and SH-02 by voice (AT-13.2). If the backend misses 13:45, #13 is Future.

#### AT-13.1 The register at D0
*Kind: Happy · Start: D0 · Refs: demo-data §10, domain 4.10*
- Mira's Shagun page lists:

| From | Amount | Received | How | Thank-you |
|---|---|---|---|---|
| Kamla Arora (Dadi) | ₹21,000 | Sun 15 Nov | At the roka | Done: Kabir called her on 16 Nov |
| Prakash & Vandana Kulkarni (Mama–Mami) | ₹11,000 | Wed 18 Nov | Home visit | Pending |
| Leena & Glen D'Souza | ₹2,100 | Fri 20 Nov | UPI | Pending |
| Rukhsana Siddiqui | ₹1,100 | Sun 22 Nov | Cash via Yusuf | Done |
| Naveen & Ritu Arora (Chacha–Chachi) | ₹5,100 | Mon 23 Nov | Home visit | Pending |

- Total received ₹40,300, with 3 thank-yous pending. No shagun figure appears in Money, and no Money figure includes shagun.

#### AT-13.2 Record a gift by voice
*Kind: Happy, Rehearsal only · Start: D0 · Refs: SH-01, SH-02, `record_shagun`*
- **When** Mira says "Sharma ji ne 5,100 shagun diya." (also try it with "ikyavan sau").
- **Then** the preview names the household before saving: Ramesh & Kavita Sharma (H05), ₹5,100, received 25 Nov 2026.
- **When** she confirms.
- **Then** the register shows SHG-06, pending; the total is ₹45,400, with 4 pending. The reply is "Sharma ji ka ₹5,100 shagun likh liya, aur thank-you list mein jod diya." Money is unchanged, and Activity (owners) reads "Mira recorded shagun of ₹5,100 from Ramesh & Kavita Sharma."
- **When** she asks "किस किस को थैंक यू बोलना बाकी है?"
- **Then** the reply is "चार लोग: Prakash & Vandana Kulkarni, Leena & Glen D'Souza, Naveen & Ritu Arora, Ramesh & Kavita Sharma।", spoken in two parts. The names are the register's, as stored, as in voice-test-set's SH-02 (voice 7.3).
- Marking a thank-you done drops the pending count by one, and undoing it puts it back.

#### AT-13.3 Nobody else sees shagun
*Kind: Privacy · Refs: A3, G2, G7, M-14*
- Diya has no Shagun nav item. `record_shagun` and `mark_shagun_thanked` answer her 403 `forbidden`, M-14 is refused, and her feed has no shagun entries.
- Nothing about shagun reaches any guest route.

### Sponsor coverage

| Sponsor | What must be seen working | Scenarios |
|---|---|---|
| Sarvam AI | Saaras speech-to-text (codemix) on Hinglish, Hindi and English; `propose_actions` turning speech into checked actions; Bulbul speaking replies built from read models; Document AI reading a card (Should #11) | AT-1.1–1.3, AT-2.1–2.6, AT-3.2–3.5, AT-5.2, AT-6.3, AT-8.2, AT-8.3, AT-11.1; the voice test set's pass criteria |
| Flagsmith | The setup experiment (exposure at render, conversion after commit, real counts, no winner claimed); the `voice_pilot` rollout with its reason chip; the `voice_writes_enabled` kill switch, enforced on the server | AT-1.6–1.9, AT-2.7, AT-2.11, AT-2.12; flagsmith FV1–FV15 |
| NudgeBee | A failed card export read over HTTPS, an in-app approval, an export-only retry, a verification, and a replay that changes nothing | AT-7.5, AT-7.6; export-and-recovery EX-01–EX-20 and NB-T10–NB-T15 |

---

## 2. The two-device smoke test

This test runs the live path across three real sessions on production before anyone rehearses on the demo copy. Run it on a rehearsal copy (0.3):
- after the 12:30 deploy, at about 12:35–12:55 with the first end-to-end run, and after each later batch once it is deployed (it needs the guest page and the RSVP route from the 12:30 batch; earlier batches get 4.2's staged checks, D46). At 12:15 only the renderer gate, the capture and Bulbul-audio test and D46's staged checks run (D111);
- at the 14:45 freeze;
- before each recording take.

It takes about 12 minutes. Nobody touches the receiving device while a time is being measured.

### 2.1 Set-up

| Session | Device and browser | Signed in as | Starts on |
|---|---|---|---|
| Mira, owner | Laptop: Chrome profile "Mira", left half of the screen | `mira.<copy>@example.com` | Money → Annapoorna Caterers |
| Diya, manager | Laptop: a second browser window, Chrome profile "Diya", right half of the screen | `diya.<copy>@example.com` | Money → Annapoorna Caterers (vendor dues are shared with her) |
| Tara, guest | Phone: a Safari private tab on the iPhone. Repeat the whole run once in Chrome on Android | No session: the copy's H16 link from `demo-links.local.md` | Her invitation |

Before step 0:
- Use the production URL over HTTPS; the mic needs it (research-stack §8). The phone is on the venue Wi-Fi, and the hotspot is the backup.
- The copy is at D0, and the checks in 5.3 pass.
- In Flagsmith Production, `voice_writes_enabled` and `spoken_replies` are on. `export_failure_drill` is disabled, with an empty value. The internal accounts get voice through `voice_pilot`.
- Keep both laptop windows visible side by side, neither minimised nor covered. A hidden tab stops polling until it is shown again (architecture §2.4).
- Use a stopwatch, held by a second person where possible. Each time runs from the tap, or the end of speech, on one device to the change appearing on another.

### 2.2 Steps

| # | Action | Mira's window | Diya's window | Tara's phone | Limit |
|---|---|---|---|---|---|
| 0 | Open all three | The D0 figures ₹2,00,000 / ₹50,000 / ₹1,50,000, the badge and the chip "Voice · team preview" | The same vendor figures (vendor dues are shared with her) and the same chip | AT-4.1: the sangeet (attending) and the reception at Banyan Hall (not replied), and nothing else | First loads as in 6.2 |
| 1 | Mira asks O-01: "Caterer ko ab kitna dena hai?" | The answer card; "एक लाख पचास हज़ार रुपये बाकी हैं।" is spoken | No change, no wash | No change | Speech end to reply as in 6.1 |
| 2 | Mira says M-03, then "Haan, save karo." | Still owed ₹1,60,000, and PAY-01 has two versions (AT-5.2) | ₹1,60,000 appears with the wash and the trail ~~₹50,000~~ ₹40,000. Her Activity gets no entry | No change | Mira: confirm to update ≤1.5 s. Diya: ≤5 s |
| 3 | Mira opens Activity. Diya opens Events → Reception, says E-04 ("Reception Lotus Hall mein shift kar do.") and taps Save draft | ACT-07 at the top: "Diya moved the reception from Banyan Hall to Lotus Hall.", "Draft. Guests still see Banyan Hall." and "just now". The gold dot on Events | The draft venue is Lotus Hall; E-04's reply | After a reload: still Banyan Hall (AT-9.3) | Mira: ≤5 s, target 1–3.5 s |
| 4 | Diya says E-06 ("Schedule publish kar do.") | Nothing new | E-06's refusal. Her draft stays | Banyan Hall | – |
| 5 | Mira asks O-02: "Diya ne kya badla?" | O-02's reply, linked to ACT-07 | No change | Banyan Hall | – |
| 6 | Mira opens Events, says E-05 ("Schedule publish kar do.") and taps Publish on the sheet | Revision 3, no unpublished changes, ACT-08 | Revision 3 and Lotus Hall, with no draft marker | Lotus Hall, untouched | Diya: ≤5 s. Tara: ≤12 s without touching the phone (one 10 s poll plus the refresh) |
| 7 | Mira opens Money → Annapoorna Caterers, and Diya opens Guests. Tara taps "Yes, attending" on the reception, then double-taps "Send reply to the families" | 230 attending; "≈ ₹1,84,000" and "230 attending × ₹800", beside the unchanged ₹2,00,000 contract | Reception 250 / 230 / 9 / 11; ACT-09 in her feed | The thank-you line and "Change reply" | Both: ≤5 s. The count never reads 231 |
| 8 | Tara reloads, taps "Change reply", keeps Attending and sends | No change, no wash | No change | The same thank-you line | Outcome `unchanged` |
| 9 | Mira asks O-03: "Reception ka venue kya hai, aur caterer ka kitna baaki hai?" | "Reception: Lotus Hall. एक लाख साठ हज़ार रुपये बाकी हैं।", with links to the reception and PAY-01 | No change | No change | – |
| 10 | In a Flagsmith Production tab in Mira's Chrome, switch `voice_writes_enabled` off. Return to the Jashn tab, then click into Diya's window | "Questions only" beside "Voice · team preview" | "Questions only", once her window has focus | No change | ≤3 s after focus (FV6), 5 s at most |
| 11 | Mira opens Events → Reception and says R-03 | AT-2.7: the refusal is spoken, and the add-requirement form opens prefilled, marked "from voice, please check". Nothing is saved | No change | No change | – |
| 12 | Mira checks the form and taps Save. Diya opens Events → Reception first | "Jain food for 12 · Catering · Annapoorna Caterers", and ACT-10 | The requirement appears, and ACT-10 is in her feed | No change | Diya: ≤5 s |
| 13 | Mira asks O-03 again | Answered, as in step 9 | – | – | – |
| 14 | Switch `voice_writes_enabled` back on and refocus both windows. Mira says M-06 ("Decorator ko pachaas hazaar aur de diye."), sees a review card with its Save button, then says "नहीं, रहने दो।" | "Questions only" is gone. The review card appears, then C-02's reply. Nothing is saved | "Questions only" is gone | No change | ≤5 s after focus |
| 15 | In Tara's private tab, type the URL of Mira's Money page | – | – | The sign-in page, with no wedding data (AT-9.2) | – |
| 16 | Mira resets the copy to D0 (section 5) | The D0 figures, without a reload | The D0 figures | Banyan Hall, with the reception not replied | Planner ≤5 s. Guest ≤12 s, untouched |

**Pass rule.** The run passes when every cell holds on the first try, in both the iPhone run and the Android run. A time over its limit fails that step.
- If Diya's change takes more than 5 s to reach Mira in two rehearsals, architecture §8 fallback 12 applies. The demo adds a manual refresh at 1:02, and polling stays.
- For each run, write down the time, the copy, the devices, every measured time and every failed cell. The lead keeps this log with the 14:45 Working/Partial/Future list.

### 2.3 Live-update times

| Change | Reaches | How (architecture §2.4) | Target | Limit |
|---|---|---|---|---|
| A member's write | The other member's open planner screen | The version poll, every 2.5 s while the tab is visible, then a refresh | 1–3.5 s | 5 s |
| Tara's reply | Every open planner screen | The same poll | 1–3.5 s | 5 s |
| A publish, or a reset | Tara's open page | The revision poll, every 10 s while the page is visible, then a refresh | ≤10 s untouched | 12 s: one poll interval plus the refresh. At once on reload, or when the tab regains focus |
| A reset | Open planner screens | The version poll | 1–3.5 s | 5 s |
| A flag flip | The chip and the dock | The refresh when the tab regains focus, and the next voice response. A flip does not move the version | ≤3 s after focus (FV6) | 5 s after focus |
| A flag flip | The server's decision | Flags are read fresh for each request (flagsmith §6.4) | The next request after Flagsmith serves the new value | ≤3 s from the flip (FV6) |
| Any write | The device that made it | The command's own response | The figure moves before any audio, ≤1.5 s after confirming | 3 s |

**Why these numbers.** Every live update is a poll; nothing is pushed, and there is no Realtime channel or WebSocket anywhere. A planner change waits at most one 2.5 s interval for the next version poll, plus about 1 s for the refresh, hence the 1–3.5 s target and the 5 s limit. A guest change waits at most one 10 s interval plus the refresh, hence 12 s. A hidden tab doesn't poll; it refreshes as soon as it is shown or gains focus.

**What never moves the version,** so it never washes or refreshes another screen: questions, replays, `unchanged` outcomes, refused or cancelled voice turns, flag flips and plain reads. Every write, every guest reply, every publish, every export-job transition and every reset moves it.

---

## 3. The 3-minute demo, as a checklist

This runs on the demo copy only (0.3). The clock times, lines and screens are demo-script §2, the Flagsmith tabs are flagsmith §8.2, and the NudgeBee steps are export-and-recovery §7. After the 14:45 freeze smoke test, take 1 is recorded at once and doubles as the first stopwatch rehearsal; any second run is take 2, after the 15:30 playback check (D50, D121; demo-script §5).

### 3.1 Pre-flight, ten minutes before every run

**Data and flags**
- [ ] Reset the demo copy to D0 (section 5). Overview reads: caterer ₹2,00,000 / ₹50,000 / ₹1,50,000; reception 229 of 250; Banyan Hall published; 5 activity items; the mehendi–sangeet overlap warning.
- [ ] Flagsmith Production:
  - `voice_writes_enabled` on;
  - `spoken_replies` on;
  - `export_failure_drill` disabled, with an empty value (recorded mode);
  - `card_renderer` as decided at 12:15;
  - `image_extraction_provider`, if it exists, as decided.
- [ ] The flags drawer, as Mira:
  - `env_label` reads `production`, and no flag is marked "fallback";
  - the chip reads "Voice · team preview";
  - Health is green;
  - "Sent by Jashn" shows today's counts with a recent as-of time.
- [ ] `/api/health` on production (flagsmith §7.5 command 2): `flags.ok` true, `env_label` `production`, and `fallback_flags` empty. If `flags.ok` is false, follow the "Flagsmith unreachable" row of 3.4.

**Laptop**
- [ ] Mira's Chrome profile, with the tabs in this order:
  1. Jashn on Money → Annapoorna Caterers;
  2. Flagsmith Production › Features, with `voice_writes_enabled` in view;
  3. Flagsmith Production › Experiments, the real experiment;
  4. Flagsmith Synthetic › Experiments, the scripted run;
  5. in the background, the Reception "Add requirement" form with "Jain food" typed.

  The Flagsmith dashboard is signed in inside Mira's Chrome profile. Tabs 2–4 are loaded, and both experiment pages (tabs 3 and 4) were reloaded within the last 10 minutes, each with its banner in view: red "PRODUCTION · real users" on tab 3, purple "Synthetic data" on tab 4 (flagsmith §8.3). Jashn shows no experiment card; the results are Flagsmith's own pages.
- [ ] The NudgeBee clip (V15) is paused at 0:00 in a local player, captioned with its run id. The NudgeBee console is open on the real run, as a backup.
- [ ] Jashn fills the left two-thirds and the phone mirror the right third, projected over HDMI.
- [ ] A wired or USB headset mic for push-to-talk. Ask one test question (O-01 writes nothing), turn the volume up, and route the laptop audio to the room speakers.

**Phone**
- [ ] Chrome (Diya) is open on Events → Reception. The Safari private tab (Tara) is on her link, showing Banyan Hall with the reception not replied.
- [ ] Brightness up, Do Not Disturb on, auto-lock off, charger in, mirrored into the laptop window.
- [ ] The second phone's hotspot is on, as the backup network.

**Fallbacks to hand**
- [ ] The 14:30 screenshots of both experiment pages, with their timestamps and banners in frame (flagsmith F7).
- [ ] The 10 s Flagsmith refusal clip and the 8 s voice-correction clip, both labelled "recorded".
- [ ] The three NudgeBee screenshots: failed, awaiting approval, completed.
- [ ] The local MP4 of the submission video.

**Only for the live NudgeBee upgrade** (the lead decides at 14:30):
- [ ] The drill is enabled, with the demo copy's wedding id as its value.
- [ ] The NudgeBee Executions tab is open.
- [ ] The warm-up ran 5 minutes before: the probe twice, then one full drill on Lane D's rehearsal copy.
- [ ] If export-and-recovery 6.8 was needed, the agent shows Connected.

### 3.2 The run

| Clock | Beat · who · device | Spoken to the app (exact) | The laptop must show | The phone must show | Pass check |
|---|---|---|---|---|---|
| 0:00–0:12 | Hook · lead · laptop | – | Money → Annapoorna Caterers: Committed ₹2,00,000 · Paid ₹50,000 · Still owed ₹1,50,000, and the badge | Diya's Events → Reception, in the mirror | The D0 row of 0.4 |
| 0:12–0:22 | #1 Ask · Mira · headset | "Caterer ko ab kitna dena hai?" | The transcript with its language chip, then the answer card linked to the caterer. The app says "एक लाख पचास हज़ार रुपये बाकी हैं।" | – | AT-2.1. The reply matches character for character, and nothing is written |
| 0:22–0:50 | #2 Correct and #3 Confirm · Mira | "Caterer ko chaalis hazaar advance diya tha." Then "Haan, save karo." | The review card "Correction, not a new payment · PAY-01 · ₹50,000 → ₹40,000 · heard 'chaalis hazaar'". After confirming: Still owed ₹1,60,000, then "एक लाख साठ हज़ार रुपये बाकी हैं।". PAY-01's history: version 1 ₹50,000 (20 Nov, typed), version 2 ₹40,000 (today, voice, with the transcript) | – | AT-5.2: one payment with two versions, and the figure moves before the audio |
| 0:50–1:02 | #4 Manager · Diya · phone (teammate) | "Reception Lotus Hall mein shift kar do." | The mirror shows Diya's review card: Banyan Hall → Lotus Hall. Meanwhile the lead opens Activity | Diya taps Save draft, and E-04's reply plays | AT-3.3 |
| 1:02–1:12 | #5 Owner sees it · Mira | "Diya ne kya badla?" | Activity shows "Diya moved the reception from Banyan Hall to Lotus Hall." with "Draft" and "just now", before Mira speaks. Then O-02's reply is read aloud | – | AT-8.2. The entry arrived within 5 s of Diya's tap, with no reload (timed in rehearsal) |
| 1:12–1:18 | Guests unchanged · teammate · Safari | – | The mirror | Tara's invitation still shows the reception at Banyan Hall | AT-9.3 |
| 1:18–1:25 | #6 Publish · Mira | "Schedule publish kar do." | The sheet "Publish revision 3 · 1 change: Reception venue". Mira taps Publish, and E-05's reply plays | – | AT-3.4 |
| 1:25–1:50 | RSVP · Tara · phone (teammate) | – (she taps) | The lead opens Money → Annapoorna Caterers while Tara refreshes. Reception attending goes from 229 to 230. The catering box reads "≈ ₹1,84,000", "230 attending × ₹800" and "Estimate, not the contract", beside the ₹2,00,000 contract (fixed, 250 covers) | Tara refreshes and sees Lotus Hall. She taps "Yes, attending", then "Send reply to the families", and sees the thank-you line | AT-4.2 and AT-6.2: 230 within 5 s, counted once |
| 1:50–2:10 | #7 Ask again · Mira | "Reception ka venue kya hai, aur caterer ka kitna baaki hai?" | "Reception: Lotus Hall. एक लाख साठ हज़ार रुपये बाकी हैं।" The lead clicks both source links (the reception and PAY-01) | – | O-03. The reply matches character for character, and both links open the right records |
| 2:10–2:30 | Flagsmith · lead | #8 "Reception mein barah logon ke liye Jain khana add karo." | 2:10–2:15: tabs 3 and 4 (Cmd+3, then Cmd+4 at about 2:12): Flagsmith's Production experiment page under its red "PRODUCTION · real users" banner, with today's real exposures and saves per arm and "Collecting data"; then Flagsmith's Synthetic experiment page under its purple "Synthetic data" banner, with the result for the 800 scripted owners. The lead's sentence names the synthetic run as synthetic. 2:15–2:18: tab 2, `voice_writes_enabled` switched off. 2:18–2:25: tab 1 shows "Questions only"; #8 is refused with R-03's line, and the prefilled form opens. 2:25–2:30: the lead clears the quantity, types 12 and taps Save; "Jain food for 12" and ACT-10 appear | – | AT-1.8 and AT-2.7: nothing is written by voice, and the typed save works |
| 2:30–2:50 | NudgeBee, recorded · lead | – | The V15 clip, captioned "Recorded today, HH:MM, from this deployment · NudgeBee run <ID>", with the real time of the 13:00–13:30 take (retake 14:00–14:30) filled in (D33): JOB-EXP-R3-PNG failed, the status read, waiting for approval, approved, the export-only retry, completed, `card-rev3.png`. Then 2 s of the card showing Lotus Hall | – | AT-7.5, the recorded take. The run id matches the README and the NudgeBee console |
| 2:50–3:00 | Close · lead | – | Overview at D5 (AT-10.2) | – | AT-10.2. The run ends by 3:00 |

**Pass rule.** A rehearsal passes when every pass check holds and the run ends by 3:00. Write down each beat's end time. A beat that ends more than 5 s late is fixed before the next rehearsal, or cut as in 3.5.

### 3.3 Straight after every run

1. Switch `voice_writes_enabled` back on. In live mode, also disable the drill and clear its value. Log both times for the README (flagsmith §8.2).
2. Reset the demo copy to D0, and run the checks in 5.3.
3. Reload Tara's tab (Banyan Hall, the reception not replied) and put Diya back on Events → Reception.
4. Never restart the recorded NudgeBee run after a reset. Its job is gone, so `read_status` answers 404 (export-and-recovery 7.5).

### 3.4 Fallback triggers

Say what happened plainly, and never fake a number (demo-script §3).

| Beat | Trigger | Do | Must still hold |
|---|---|---|---|
| Hook | The projector fails | Turn the laptop toward the judges and carry on | – |
| #1 | Speech or the model takes more than 8 s, or the answer is wrong | Point at ₹1,50,000 on screen and go on to #2 | Nothing written |
| #2 | The amount is misheard | Tap the amount on the review card, type 40,000 and confirm (AT-5.3, with `edits`) | It is still a correction of PAY-01 |
| #2 | Sarvam is unreachable: 402, a 5xx or a timeout | The payment form, saying "Sarvam timed out; here is the same correction by typing". Optionally play the 8 s clip, labelled "recorded". Never switch to fixtures (architecture §8 row 5) | AT-5.3's figures |
| #3 | "Haan, save karo." isn't recognised | Tap Confirm | – |
| #4 | The phone mic fails in the noise | Diya taps Reception → Venue → Lotus Hall → Save draft | AT-3.3's records |
| #5 | The entry hasn't appeared after 5 s | Refresh the laptop; the record is saved. If the question is slow, read the entry aloud. After two slow rehearsals, the manual refresh at 1:02 is already in the script (architecture §8 row 12) | – |
| #6 | Voice fails | Review & publish, then Publish | – |
| RSVP | The phone network drops | Switch the phone to the hotspot. If it still fails, open Tara's link in a laptop private window and tap Attending there | – |
| RSVP | The count still says 229 after a refresh | Say so. Open Tara's guest record to show her reply row, and never claim 230 | – |
| #7 | Bulbul fails | Read the on-screen reply aloud. `spoken_replies` can mute speech | – |
| Flagsmith | The flip took more than 3 s in FV6 | Flip first (Cmd+2 at 2:10), then show tabs 3 and 4 (2:13–2:18) while the change spreads, then Cmd+1 and speak #8 (flagsmith §8.2) | – |
| Flagsmith | The "Questions only" chip hasn't appeared when the Jashn tab regains focus | Speak #8 anyway. The turn reads the switch afresh, and the refused turn's response turns the chip on (flagsmith §6.9) | The refusal comes from the server |
| Flagsmith | Flagsmith unreachable: at the pre-flight `/api/health` shows `flags.ok` false, or the drawer's Health section shows "fallback" | Voice writes are off (fail closed). Do the voice beats by typing, as in the rows above, and say "Flagsmith is unreachable, so voice is in safe mode." Show the experiment from the 14:30 screenshots (flagsmith F6) | Nothing written by voice |
| Flagsmith | The flip doesn't take effect on stage | Show the server's flag-evaluation log line, or play the 10 s clip labelled "recorded". Restore the flag either way | The refusal comes from the server |
| Flagsmith | An experiment page is slow, or the dashboard has signed out | Show that page's 14:30 screenshot, labelled "screenshot, 14:30" (flagsmith F7). If the flip can't be made, play the 10 s refusal clip labelled "recorded" | – |
| Flagsmith | The prefilled form doesn't open | Tab 5 | – |
| NudgeBee | The clip won't play | The three screenshots, and the run id in the NudgeBee console | – |
| NudgeBee, live mode | The run hasn't reached the approval by 2:38 | Play the V15 clip and say "Here is the same run recorded earlier today." | – |
| Voice, at rehearsal | The median from speech end to preview passes 8 s | Cut LIVE #1 and #5, and narrate them instead (voice-test-set pass criterion 5) | – |
| Voice, by 12:15 | Two of five amount-bearing turns fail | Shorten the line, keep the editable-number fallback, and record a successful run for the noisy-room fallback (voice-test-set pass criterion 3) | – |
| Anything | A total outage | Play the local MP4 of the submission video from the matching time, and say that it is the recording | – |

### 3.5 Running behind

- At 1:50, drop the narration in the 1:50–2:10 beat and let the app answer.
- At 2:10, skip tabs 3 and 4. Say flagsmith §8.2's sentence 1 anyway, and do only the flip and the refusal.
- Nothing else is cut. These cuts remove narration and one view, never a pass check of 3.2 for the beats that remain.

---

## 4. The Playwright demo-path spec, in prose

The lead writes it after 09:00 (architecture §6.7). This section says what it must do and check, not how.

### 4.1 Set-up

- **Package and browser.** `@playwright/test` 1.65.1 with `channel: 'chrome'`, which drives the installed Google Chrome. Never run Playwright's own browser download.
- **Base URL** from `E2E_BASE_URL`, defaulting to `http://localhost:3000`. Every lane command sets it to the lane's own port: 3001 (A), 3002 (B), 3003 (C) or 3004 (D) (D54).
- **Two projects:** desktop Chrome for Mira, the owner; Chrome at 390 × 844 with touch for Diya, the manager, and for Tara, the guest.
- **Retries and traces:** 1 retry against production and 0 locally. Traces are kept on the first retry.
- **Global setup** belongs to the lead's demo-path project only; lane specs never run it (D46, D54). It works on the `e2e` copy only, never the demo copy:
  1. sign in `mira.e2e@example.com` and `diya.e2e@example.com` through the login page, and keep their sessions under `e2e/.auth/` (gitignored);
  2. run `reset_demo` (`d0`, `confirm_text` RESET) through the command route, as Mira;
  3. from the 12:30 batch on only, rotate H16's link with `create_invitation_links` (`rotate` true), and keep the new URL in memory for the guest steps. It is never written to a file or printed in the report. Before 12:30 the setup stops after step 2.
- **Lane specs** (`e2e/lane-<x>.spec.ts`) exercise only what that lane's open PR delivers, against its own port. Lane D's probe spec runs with no seeded data and no login (D54).
- **Lane test data (D120).** A lane's spec starts its own dev server first (`npm run dev -- --port 300N`, in the background). It signs in or signs up its own `@example.com` accounts through the login page, with its own storage state, and never touches `e2e/.auth/` or the `e2e` copy. The one exception: if copies c and d aren't seeded by 10:45, Lanes C and D read the `e2e` copy (GETs only) and use fixtures for writes until 11:40. The lead's `playwright.config.ts` loads `.env.local`.
- **A guard before step 1:** the spec checks that the wedding it signed into is the `e2e` copy (`is_sample` true, owned by `mira.e2e@example.com`), and stops otherwise.
- **No microphone.** The spec drives forms and buttons only, so it never depends on Sarvam. Voice belongs to Lane C: fixture mode locally, and Chrome's fake audio capture with a recorded WAV for the real pipeline.
- **Waiting.** Each step waits for what the screen shows (a heading, a figure, a button), not for a fixed time. The exceptions are steps 3 and 7, where the time limit is what is being tested: each fails after 5 s.
- Reports, traces and `e2e/.auth/` stay out of git.

### 4.2 The steps

| # | Who (project) | Does | Passes when |
|---|---|---|---|
| 1 | Mira (desktop) | Opens Money → Annapoorna Caterers | Still owed reads ₹1,50,000, the figure O-01 speaks, beside Committed ₹2,00,000 and Paid ₹50,000 |
| 2 | Mira | Opens PAY-01, corrects it to 40,000 with a reason, and saves | Still owed reads ₹1,60,000. PAY-01's History lists exactly two versions, ₹50,000 then ₹40,000. Money reads Paid ₹3,87,000 and Still owed ₹5,40,000 (X-01) |
| 3 | Diya (390, touch) | Events → Reception → venue Lotus Hall → Save draft | Mira's Activity page, open and never reloaded, shows "Diya moved the reception from Banyan Hall to Lotus Hall." within 5 s |
| 4 | Tara (390, touch, no session) | Opens the rotated H16 URL | The reception insert reads Banyan Hall, and "Lotus Hall" appears nowhere on the page |
| 5 | Mira | Events → Review and publish → Publish | Events shows revision 3 and no unpublished changes |
| 6 | Tara | Reloads | The reception insert reads Lotus Hall |
| 7 | Tara | Taps "Yes, attending" on the reception, then "Send reply to the families" twice in quick succession | Mira's vendor page, open and never reloaded, shows 230 attending within 5 s, never 231, and "≈ ₹1,84,000" beside the unchanged "250 plates × ₹800 = ₹2,00,000" (X-02) |
| 8 | Tara's browser context | Opens Mira's Money URL, then requests the version route and one command route | The sign-in page, with no wedding data in the HTML. Both routes answer 401 |
| 9 | Mira, on production only | Invite → Export card | Within 15 s the panel reads Ready and the job is `succeeded`. The download is named `jashn-card-rev3.png` |
| 10 | – | Requests `/api/health` | `flags.ok` is true, from the 10:45 batch, once `lane-c-voice` has merged (D12; flagsmith §10.2) |

**Version and activity checks,** read as Mira through the version route and the activity feed. They are deltas, because global setup's link rotation adds one owner-only entry ("Mira created invitation links for 1 households.") before step 1.

| Step | `version` | Mira's activity entries |
|---|---|---|
| 1, 4, 6, 8 and 10 | Unchanged | None |
| 2 | +1 | +1 (ACT-06) |
| 3 | +1 | +1 (ACT-07) |
| 5 | +1 | +1 (ACT-08) |
| 7 | +1 in total for both sends; the second answers `replayed` | +1 (ACT-09) |
| 9 | +1 for each job transition (not counted) | +2: "Mira started a card export for revision 3." and "The card for revision 3 is ready." |

**Teardown:** `reset_demo` (`d0`) on the `e2e` copy, then the D0 figures of 5.3. The teardown runs even when a step fails.

**When it runs** (architecture §6.7; D46, D104). Each lane runs its own spec before marking a pull request ready, on fixture services or injected dependencies, on its own copy. After the batch deploys, the lane merges `origin/main` and reruns the real-data part on its own rehearsal copy, or on production where its brief says so; a failure there becomes the first item of the next batch and doesn't hold the current one. L never holds a batch for a real-data check, except these demo-path checks. On production, the lead runs what each batch makes checkable, never a fixture standing in for a write:

| After | The lead checks on production |
|---|---|
| 10:45 batch | Sign-in, and `/api/health` (step 10) |
| 11:40 batch | A persisted payment correction: step 2, then a reload (0.5 rule 2) |
| 12:15 | Whichever voice, audio and renderer checks exist by then (6.1, 6.3's audio checks, 6.6). The smoke test waits for the 12:30 deploy (D111) |
| 12:30 deploy | The served commit SHA, then the H16 rotation, then steps 1–10 on the `e2e` copy. The run must include a refresh, a second session, exactly one RSVP and the guest-privacy check (steps 3, 6, 7 and 8). A Should PR merges at 13:45 only if this run passed and the PR's own checks are green (D106) |
| 13:45 batch | Steps 1–10 again. L records which steps passed before calling the demo path ready |
| The 14:45 freeze, and before each recording take | Steps 1–10 |

A failing step is fixed before the next batch merges. In the 13:45 batch, demo-path fixes go first, then Must polish, then Should work that passed its gate (D106).

### 4.3 Unit tests (Vitest 5.1.1)

They sit next to the code, in the owner's folder (architecture §4.2, rule 5). Pure tests run in CI with `npm test`. Tests that need the database are named `*.db.test.ts` and run only with `RUN_DB_TESTS=1` (`npm run test:db`), locally, because CI has no database credentials (D103). Every lane runs `npm test`, and `npm run test:db` if it has database tests, before marking a PR ready. Each database test makes and deletes its own throwaway sample wedding (the export-and-recovery 8.1 pattern), except A5's `submit_rsvp` checks, which run on copy a, never the `e2e` copy (D104, D120).

**Ledger maths** (Lane A):

| Case | Input | Expected |
|---|---|---|
| Per-unit total (M3) | 800 × 250 | `amount_inr` 200000 |
| Sent total differs (M3) | 800 × 250 with `amount_inr` 210000 | `amount_mismatch` |
| Ranges (M2) | `unit_price_inr` 0 or 1000001; `quantity` 0 or 100001; 1000000 × 1001 | `validation_failed`, `out_of_range`. The last fails because the product passes ₹100 crore |
| Range edge (M2) | 1000000 × 1000 | Accepted: exactly ₹100 crore |
| Integers only (M1) | 40000.5, "40000", 4e4, −5000, 0 | `validation_failed` |
| Totals at D0 (M4, M5) | The seeded ledger | Committed 927000, paid 397000, outstanding 530000, overpaid 0, uncommitted 273000 |
| Totals at D1 (C6) | PAY-01 version 2 at 40000 | Paid 387000 and outstanding 540000. The caterer has 1 payment, and PAY-01 has 2 versions |
| Overpaid (M4, M5) | D1 plus a 170000 instalment to the caterer | The caterer: outstanding 0, overpaid 10000. The wedding: outstanding 380000, overpaid 10000. The check: outstanding − overpaid = committed − paid = 370000 |
| Budget (M6) | COM-04 updated to 125000 | Photography over budget by 5000; the wedding's committed 942000 and uncommitted 258000 |
| Proposals (M6, A5) | PRP-01 pending | `pending_proposals_inr` 15000 and `if_approved_committed_inr` 942000, while committed stays 927000 |
| Corrections (C2–C4, C8) | PAY-01 to 40000 with `expected_version` 1; the same again with `expected_version` 1; then 40000 with `expected_version` 2 | Version 2 written and version 1 superseded; then `stale_version`; then `unchanged` |
| Undo and void (C9) | Undo the correction; void a payment | Undo writes version 3 at 50000 and keeps version 2. A void stays listed and leaves every total |
| Estimate (E1–E3) | Confirmed 229, 230, 250 and 260 at ₹800; a `lump_sum` commitment; a `per_unit` commitment with `unit` `item` | 183200 below by 16800; 184000 below by 16000; 200000 `equal`, 0; 208000 above by 8000; no estimate; no estimate |
| Display (M7) | 0, 5000, 150000, 1200000, 12000000, 1000000000 | ₹0, ₹5,000, ₹1,50,000, ₹12,00,000, ₹1,20,00,000, ₹1,00,00,00,000 |
| Spoken Hindi (M7, demo-data §14) | 150000, 160000, 540000, 184000, 1200000 | "एक लाख पचास हज़ार रुपये", "एक लाख साठ हज़ार रुपये", "पाँच लाख चालीस हज़ार रुपये", "एक लाख चौरासी हज़ार रुपये", "बारह लाख रुपये". Never a colloquial form such as डेढ़ लाख |

**RSVP idempotency** (Lanes A and D; the concurrency rows need the database):

| Case | Expected |
|---|---|
| The same key and body, twice | `applied`, then `replayed`. One activity entry; `version` +1 |
| The same key with a different body | 409 `idempotency_key_reused`, and nothing written |
| A new key with the stored answer | `unchanged`: no activity entry, no version change |
| 10 parallel submissions from a pending row, different keys, the same answer | Exactly one `applied` and nine `unchanged`. One row; attending +1 |
| 10 parallel submissions alternating attending and declined | Each is `applied` or `unchanged`. The counts always equal the stored rows, and invited stays 250 |
| `set_rsvp` by a member, then `submit_rsvp` with the same answer | `unchanged` |
| Tara's token with EVT-MEH, or with another household's guest | 404, with the same body as an unknown token |
| `rsvp_status` `pending` from a guest | 422 `validation_failed` |
| `plus_ones` above `max_plus_ones` | 422 `plus_ones_exceeds_limit` |
| A revoked token | 404 |
| Any `submit_rsvp` or `set_rsvp` | The commitment rows are identical before and after (E5) |

**Also in the unit tests,** listed so that nobody writes them twice:
- Lane A's set (architecture §3.3): the permission matrix with `approval_required` and the owner-only list; the guest view type has no money fields; an uninvited function is absent from the guest view; a draft change stays invisible until it is published; an RSVP for an uninvited function returns 404; a revoked token returns 404.
- The role-filtered snapshot sent to Sarvam (G9, AT-9.6), for an owner and for a manager.
- Lane D's EX-01 to EX-04 and EX-15: retry and export idempotency (export-and-recovery 8.1).
- Lane C's flag fallbacks (flagsmith FV8).

---

## 5. Demo reset

### 5.1 What one reset restores

`reset_demo` takes `checkpoint` `d0` (the default) and `confirm_text` RESET. Only an owner of a sample copy can run it, and it runs in one transaction (domain §3.7).

| Restored to its seeded values | Deleted (rows without a `seed_key`) | Kept as it is |
|---|---|---|
| Every seeded row: PAY-01 at ₹50,000 as its only version, EVT-REC at Banyan Hall in the draft, Tara's reception reply pending, PRP-01 pending. Also `published_revision` (2) and the seeded `draft_version` | PAY-01 version 2 and any other new version; REV-3; REQ-10; ACT-06 to ACT-10 and every other live activity entry; live proposals such as PRP-02; new payments; export jobs and attempts without a `seed_key`; voice turns; receipts | Auth users and `members`. `invitation_links`, so Tara's bookmarked link still works and a revoked link stays revoked. `assets`, such as the couple photo, part of D0 from the 11:40 photo step (D107). Storage files: a re-export overwrites the same path. `weddings.version` still goes up, so every open screen refreshes |

- **Not touched by any reset:** Flagsmith (flags, segments, the experiment and its counts), `experiment_exposures`, NudgeBee and its run history, and every other copy.
- **The `s0` checkpoint** also removes COM-01 and PAY-01 and reopens QUO-01, so the caterer has only its ₹2,12,500 quote (state S0). It is for the video's M-01 take (V04), and is followed straight away by a `d0` reset.
- **No activity entry and no topic.** Architecture §9 (item 4) drops domain's `demo.reset` topic, so the version bump is the only signal. The server logs the reset.

### 5.2 Guards

| Case | Answer | Written |
|---|---|---|
| Diya's session | 403 `forbidden` | Nothing |
| A guest token, or no session | 401 | Nothing |
| `DEMO_RESET_ENABLED` is not `true` in that environment | 403 `demo_reset_disabled` | Nothing |
| A wedding without `is_sample`, such as a real owner's wedding | 403 `not_sample_wedding` | Nothing |
| `confirm_text` "reset", "RESET " (with a trailing space) or empty | 422 `validation_failed`, field `confirm_text` | Nothing |
| A `checkpoint` other than `s0` or `d0` | 422 `validation_failed`, field `checkpoint` | Nothing |
| A reset of copy B | Copy A is untouched: its version, rows and open screens stay as they were | – |
| A review card left open from before the reset | Its turn is gone, so confirming it is refused | Nothing |

### 5.3 Checking a reset (about two minutes, after every reset)

- [ ] **Overview (Mira):** caterer ₹2,00,000 / ₹50,000 / ₹1,50,000; Money ₹9,27,000 / ₹3,97,000 / ₹5,30,000, with ₹2,73,000 not yet committed; reception 229 of 250 (229 / 9 / 12); sangeet 136 attending; 2 warnings, the overlap and Banyan Hall's capacity; 0 unpublished changes; PRP-01 the only pending proposal.
- [ ] **PAY-01's History:** one version, ₹50,000, 20 Nov, typed.
- [ ] **Events:** published revision 2, and the reception at Banyan Hall in both the draft and the published schedule.
- [ ] **The reception's requirements:** REQ-08 and REQ-09 only, with no "Jain food for 12".
- [ ] **Activity:** 5 entries for Mira (ACT-01 to ACT-05), and 4 for Diya.
- [ ] **Invite → exports panel:** no job for revision 3, and the REV-2 card (JOB-EXP-R2-PNG) is not marked out of date.
- [ ] **Shagun:** 5 gifts, ₹40,300, 3 thank-yous pending.
- [ ] **Tara's page, on the same link as before:** the sangeet attending; the reception at Banyan Hall, not replied; `revision` 2.
- [ ] **Flags,** which a reset doesn't touch: `voice_writes_enabled` on, and `export_failure_drill` disabled with an empty value.
- [ ] **The version** is higher than before the reset.
- [ ] **Reload every open page,** planner and guest, so no form or review card survives from the last run.

The Playwright teardown (4.2) makes the same checks on the `e2e` copy.

---

## 6. Non-functional targets

Numbers marked "ours" are this file's targets; no other note sets them (8.2, question 4). A miss is written down with the measured figure.

### 6.1 Voice round trip

**Definitions:**
- **Round trip for a write:** from the end of speech (the mic released, or the second tap) to the review card on screen.
- **Round trip for a question:** from the end of speech to the answer text on screen. Speech follows the text.
- **Confirm to update:** from the confirm tap to the changed figure on the speaker's screen. A spoken confirm adds one speech-to-text call, but no model call.
- **Save to speech:** from the save confirmation to the first audio.

| Interval | Target | Pass bar | If missed |
|---|---|---|---|
| Round trip, on the venue Wi-Fi with the stage headset | Median about 4 s or less | Median ≤5 s over the full set in the hall (voice-test-set criterion 5), and p90 ≤6 s (ours) | A median over 8 s cuts LIVE #1 and #5 (3.4) |
| Spoken confirm ("Haan, save karo.") to update | ≤2.5 s (ours) | 4 s | Tap Confirm |
| Confirm tap to update | ≤1.5 s (ours) | 3 s | – |
| Save to speech | ≤700 ms (design-direction §7) | 1.5 s | The reply is on screen anyway |
| Answer text to speech | ≤1.5 s (ours) | 3 s | `spoken_replies` can mute speech |
| No result after 4 s | "Still working. You can keep using the page." appears | – | – |

**Budget per stage.** These are our estimates, because Sarvam publishes no latency figures (research-sarvam B37).

| Stage | Budget |
|---|---|
| Uploading a 3–5 s clip from the browser | 0.1–0.3 s |
| Saaras speech-to-text, codemix | 0.8–1.5 s |
| sarvam-105b with `propose_actions`, one call (the one allowed retry with a JSON schema doubles this) | 1.0–2.0 s |
| Validation, id resolution and building the preview | 0.1–0.2 s |
| The response, and the render | 0.1–0.2 s |
| **Total** | **2.1–4.2 s** |

**How it is measured:**
- The client times each round trip, from the end of speech to the card. The server logs each stage's duration for every turn (8.2, question 6).
- L's T0–T4 at about 09:14 (D7) give the first figures. The full voice test set runs at 12:45 and 14:00 (D29), and those runs give the medians that the pass bar uses.
- V-T3 and V-T4 are Lane C's (D112). V-T4: 3 runs of the live 8 through the turn route's `text` input as soon as it answers (about 10:25), before `lane-c-voice` is marked ready. V-T3: both phones through C's tunnel before 10:40 if the route records by then, otherwise by 11:30 at the latest, with the WAV fallback off until then.
- The full runs use a rehearsal copy and a separate device, and run independently of the presenter. The teammate or one of the two booked Hindi speakers runs them; Lane C provides the resets, the timings and the results log (D49). So the 12:45 run can overlap the smoke test (D111).
- Measure on the venue Wi-Fi first, then repeat the eight live lines once over the hotspot.

### 6.2 First load (all ours)

| Page | Device and network | Target | Limit |
|---|---|---|---|
| Tara's guest page | iPhone Safari, on the venue Wi-Fi and on the hotspot | Inserts and reply buttons usable in ≤2.5 s | 3 s |
| Overview | Laptop Chrome, venue Wi-Fi | ≤2 s | 3 s |
| The vendor page (Money → Annapoorna Caterers) | The phone | ≤2.5 s | 3 s |
| Setup, voice-first | Laptop | The page in ≤2 s, the mic ready in ≤3 s | 4 s |
| Moving between planner sections | Both | ≤1 s | 2 s |
| Any page on the first request after a deploy or an idle spell (a cold start) | Both | ≤5 s | Covered by the warm-up before every take: open every page once and run one export (research-stack §13, risk 17) |

- Measure with a stopwatch from the tap to usable content, and with the browser's network panel, on a first visit and on a repeat visit.
- Text does not jump when the Eczar and Anek Devanagari faces arrive.

### 6.3 Browsers and devices

| Browser | Device | Sessions | Must pass |
|---|---|---|---|
| Chrome, current stable | The laptop (macOS) | Mira; Diya's second window; Playwright (`channel: 'chrome'`) | Every planner scenario, the voice dock and panel, the flags drawer, the card download |
| Safari on iOS (write down the iOS version tonight) | The iPhone | Tara on stage. Also Diya, if her phone is an iPhone: Chrome on an iPhone is WebKit, so the iOS audio rules apply to it too | The guest page (AT-4.1 to AT-4.6, AT-9.1 to AT-9.5), the audio checks below, and AT-11.1 on the phone (doc-ai AC-2) |
| Chrome on Android | The Android phone | Tara in the second smoke run; Diya, if her phone is Android | The guest page and the audio checks |

**Audio checks on every device** (research-stack §8):
1. The first permission prompt appears only after the mic tap.
2. A 5 s Hinglish clip returns a transcript.
3. The reply plays. On iOS, if playback is blocked, a "Play reply" button appears, and it works.
4. A second clip asks for no new permission.
5. After the tab goes to the background and comes back, the mic still works.

Also check that the recording indicator goes off after each clip, and that recording stops by itself at 25 s with the timer visible.

### 6.4 The 390 px layout

- Check every planner screen and the guest page at 390 × 844, and also at 360, 768, 1280 and 1440 px (design-direction).
- At 360 and 390 there is no horizontal page scroll. A wide table scrolls inside its own box or turns into stacked rows, and the money columns stay aligned.
- No amount is cut off or broken across lines. The widest demo figures, such as ₹12,00,000 and ₹9,27,000, fit their cells.
- The mic sits in the maroon header, top right, on every screen, with a touch target of at least 44 × 44 px (D20). There is no bottom speak bar. The voice panel is a bottom sheet about 60% of the screen high. The review card's confirm and cancel buttons stay visible above the keyboard.
- Touch targets are at least 44 × 44 px with 8 px gaps. The RSVP buttons are 48 px.
- All six sections can be reached from the header's tab row without a horizontal page scroll.
- On the guest page the inserts stack, and "Send reply to the families" can be reached with one thumb.

### 6.5 Accessibility basics

- **Contrast:** 4.5:1 for text and 3:1 for controls and focus rings. Gold #C9A24E is foil only and never sets text on ivory (2.10:1).
- **Keyboard:** every control works from the keyboard alone, the mic included. The focus ring is visible: 2 px maroon with a 2 px offset, and gold inside the maroon shell. Esc closes the voice panel, the publish sheet and the flags drawer.
- **Labels:** every field has a visible label, and errors sit next to their field, in words. The mic has an accessible name in both languages.
- **Status:** "Still working…", saves, refusals and the RSVP thank-you line are announced through a polite live region. Every spoken reply also appears as text, with Stop.
- **Focus:** after a route change, focus moves to the main content. On the card-reader form, it moves to the first field that needs the owner.
- **Motion:** with reduced motion on, the wash shows for 3 s without the fade.
- **Language:** Hindi text is marked as Hindi, so a screen reader switches to a Hindi voice.
- **Checks (ours):** Lighthouse accessibility ≥90 on Overview, the vendor page, Events and the guest page. One VoiceOver pass on the iPhone, in which Tara sends her reply using VoiceOver alone.

### 6.6 Devanagari, in the UI and on the card

**The UI:**
- Anek Devanagari sets the controls and logistics, and Eczar the names and titles. The Devanagari line height is 0.1 above the Latin one.
- The test strings render with joined conjuncts, matras on the right consonant, no boxes and no dotted circles, in Chrome desktop, Safari iOS and Chrome Android, in the pages and in the review card. The strings are:
  - कृष्ण, प्रीतिभोज and स्वागत समारोह;
  - the three fixed replies, with the nukta in हज़ार and the danda ।;
  - शुभ विवाह and रिसेप्शन.
- Check on production, not just locally. macOS has system Devanagari fonts that hide a missing web font (export-and-recovery 1.5).
- The हिंदी toggle on the guest page switches every string, and no Hindi line shows a missing glyph.

**The card, with the `chromium` renderer:**
- शुभ विवाह, रिसेप्शन and "आपकी उपस्थिति से हमें अत्यंत प्रसन्नता होगी।" are shaped correctly in the PNG, and match the same page in local Chrome by eye (P1 at 10:40, P3 at 12:00–12:15).
- If the Devanagari face hasn't loaded, the attempt fails with `FONT_NOT_LOADED` and stores nothing (EX-17). A card with boxes in it never ships.

**The card, with the `og` fallback after 12:15** (export-and-recovery 3.7):
- The Hindi heading and Hindi line come from two transparent PNGs captured at 2× from the render page. They are sharp and identical to the text.
- `title_hi` (रिसेप्शन) is left out, never shown wrong.
- The README marks dynamic Hindi on the exported card as Partial.

---

## 7. What "done" means for each item

Fill this in at the 14:45 freeze (demo-script §4.4). An item is **Working** only when every scenario listed for it passes on production, exercised by a person on the laptop and on a phone. Sections 2 and 3 must also pass. Otherwise it is **Partial**, naming the scenarios that pass, or **Future**.

| Item (demo-script §4.4) | Priority | Working when these pass |
|---|---|---|
| Voice setup: speak, missing-year prompt, review, save, reopen | MUST | AT-1.1 to AT-1.7, AT-1.9 |
| Voice actions and spoken answers (the 8 live lines) | MUST | AT-2.1 to AT-2.13, and the live set passing 5 runs in a row (voice-test-set criterion 3) |
| Events and itinerary, draft vs published, conflict warning | MUST | AT-3.1 to AT-3.8 (AT-3.9 is a rehearsal row) |
| Guests and RSVP through private links, counted once | MUST | AT-4.1 to AT-4.8 (AT-4.9, dietary notes, is tested but not required) |
| Money ledger: planned, committed, paid, outstanding; corrections with history | MUST | AT-5.1 to AT-5.9 |
| Vendors and catering: the estimate beside the fixed contract | MUST | AT-6.1 to AT-6.5 |
| Invitation studio, wedding website, exported card | MUST | AT-7.1 to AT-7.4, and 6.6 for the card. If I-01 misses 13:45, the README marks AT-7.1's voice half Partial (D121) |
| Owner and manager collaboration, and the activity feed | MUST | AT-8.1 to AT-8.6, and 2.3's times |
| Server-enforced privacy by role | MUST | AT-9.1 to AT-9.8 |
| Overview dashboard | SHOULD | AT-10.1 to AT-10.3 |
| Reading an existing invitation image into a reviewable draft | SHOULD | AT-11.1 to AT-11.3 (doc-ai AC-1 to AC-12) |
| Light requirements by voice (such as Jain food for 12) | SHOULD | AT-12.1 to AT-12.3 |
| Shagun register and thank-you list | SHOULD | AT-13.1 to AT-13.3 |
| Sarvam: STT, LLM, TTS, Document AI | Sponsor | The Sarvam row of the sponsor table, and voice-test-set criteria 1 to 6. The full set passes when at most three of the rows that apply fail: 36 of 39 while #11 and #13 are unbuilt, and their rows apply again if either ships (voice 7.3; D82). Document AI counts only if #11 is Working |
| Flagsmith: experiment, voice rollout, kill switch for voice writes | Sponsor | AT-1.6 to AT-1.9, AT-2.7, AT-2.11, AT-2.12, and flagsmith FV1 to FV15 |
| NudgeBee: failed-export recovery with approval and a safe retry | Sponsor | AT-7.5 and AT-7.6, NB-T10 to NB-T15, and EX-01 to EX-20 |
| The full décor, menu and music workspace; receipt attachments; task boards; live guest location; real payments; WhatsApp reminders; seating | Future (`scope.md`) | Not tested |
| Continuous voice, more languages, hall-level tracking | Later ideas (not in scope, D36) | Not tested |

**Lane checks tied to scenarios** (Sol 23). A lane marks these done only when the named scenario passes, in the two parts of D104: on fixtures before the PR is marked ready, then on real data after the batch deploys:
- Lane A, A9 (the REV-2 seed card): AT-7.3's REV-2 row and its download (D15).
- Lane C, topic 2 (the synthetic run): the synthetic evidence in AT-1.8, and flagsmith FV10 and FV11.
- Lane C, topic 5 (voice answers): AT-8.3, and AT-2.4, whose RSVP half is checked after the 12:30 deploy (D104).
- Lane D, topics 2 and 3 (publish, export jobs): the 11:50 key signal on production, copy d. Diya's `update_event` (reception to Lotus Hall) goes through the command route, Mira publishes through PublishSheet on Lane D's own Invite page, and the export job's PNG downloads (AT-3.3, AT-3.4, AT-7.3; D104, D107).
- Lane C, topic 6 (the judge panel): voice §8's trace checks. The panel has no AT id of its own.
- Lane D, topic 4 (the guest page): AT-4.1 to AT-4.6, including AT-4.5's changed answer. Tara's double tap (AT-4.3) is checked on production after the 12:30 deploy (D104).
- Lane D, topic 6 (the og renderer): AT-7.3's renderer line and 6.6's two card branches (D48).

---

## 8. Conflicts settled here, and open questions

### 8.1 Where the notes disagree, this file tests

1. **Flag keys:** `voice_pilot` and `spoken_replies` (flagsmith, binding for keys; architecture §9 item 16). Domain now agrees; its 0.3 table and open question 6 list the retired names.
2. **Env var names:** architecture's `JOBS_API_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY` and `NUDGEBEE_EXPORT_WEBHOOK_URL`. Domain now agrees; its 0.3 table lists the retired names.
3. **Export job states:** `rendering` (export-and-recovery 2.1). Domain now agrees (0.3).
4. **Ops JSON:** every scalar is a string, never null, on the ops routes only (export-and-recovery 5.1). Member routes keep domain's types.
5. **The drill:** it arms only when the value of `export_failure_drill` equals that sample wedding's id (export-and-recovery 4.1). It is off for the live demo, as demo-data §13.2 says, unless the lead picks the live upgrade at 14:30. Export-and-recovery 7.1 allows that, and the lead then says so on stage.
6. **The kill switch:** both paths are tested. A turn made while the switch is off gets the 200 `paused` refusal with no Save button (flagsmith §3.2, FV7). A card shown before the flip and confirmed after it gets 423 `voice_writes_paused`. Domain 7.1 step 9 now describes both paths.
7. **Live updates:** polling only (architecture §2.4; domain 5.6 now agrees), with no Realtime, over research-stack's doorbell. Planner screens poll every 2.5 s and the guest page every 10 s. The Playwright spec reloads the guest page.
8. **Voice latency:** this file's target is a median of about 4 s. The pass bar stays at voice-test-set's 5 s median, and the cut is at 8 s.
9. **Estimate wording:** domain E6's elements are required: "Estimate, not the contract", the ≈ sign, "230 attending × ₹800" and its own box. Demo-script's "Estimate from confirmed guests ₹1,84,000" and "Signed contract ₹2,00,000 · fixed, 250 covers" may appear as well.
10. **The photo on the card** is never cropped or retouched (export-and-recovery 1.3, design-direction), over demo-data 11.3's "only cropped to fit".
11. **Functions on the shared card:** only those every invited guest is invited to, which in the demo is the Reception alone (export-and-recovery 1.1–1.2). Demo-data 11.1 describes a household's link, not the shared card.
12. **A guest token on member surfaces:** planner pages show the sign-in page with no data, and member API routes answer 401 (architecture §2.4 and §3.4, domain G4, EX-20). X-03 ("403 or not-found") is checked as "no data". Demo-script's video caption and judge answer 4 now say "no access" and "no data" instead of 403 (applied at 05:05; 8.2, question 1).
13. **Voice export:** one confirming tap (domain open question 11), over voice-test-set I-02's "no confirmation".
14. **Command names:** voice-test-set's `publish_schedule`, `export_card`, `propose_expense`, `confirm` and `cancel`, and `extract_invite` are tested under domain's names. Those are `publish_itinerary`, `request_card_export`, `propose_change` wrapping `record_expense`, the voice confirm and cancel routes, and the card reader's draft.
15. **Card imports** answer 404 to any other signed-in user, Diya included, and 401 to a guest link (doc-ai AC-8). An import belongs to one user, not to a wedding, so the usual 403 `forbidden` doesn't apply.
16. **The demo copy** takes only section 3's rehearsals and the recorded takes, each followed by a reset (0.3).
17. **Playwright** drives forms and buttons only, in 10 steps: architecture §6.7 adds step 10, `/api/health`.
18. **Hindi amounts:** M7 forbids colloquial forms such as डेढ़ लाख in generated replies. That overrides design-direction §7's sample reply "…के डेढ़ लाख रुपये बाकी हैं।". Design-direction's other sample names and figures (Neha, Annapurna Caterers, Lotus Lawn) are illustrations; demo-data's names and figures win. The bride is Mira everywhere (D22).
19. **The card-reader gate (settled at 05:05):** doc-ai 5.2 and architecture §8 row 11 agree. The latest build start is 13:00. The PR joins the 14:30 batch with AC-1 and AC-3 to AC-12 passing locally and AC-2 through Lane C's tunnel, and AC-1, AC-2 and AC-9 pass on production by the 14:45 freeze. If any of these is missed, `image_extraction_provider` stays `off`. So is #11 if L can't verify Must 1–9 on production by 13:00 (D56). The minimum Guests and Invite screens ship in the 12:30 batch whether or not #11 is in play (D105).
20. **The reception description:** "Dinner follows." (domain open question 16), over demo-data §3's "Dinner by Annapoorna Caterers.", so no vendor name reaches guests.
21. **The reset topic:** there is no `demo.reset` topic (architecture §9 item 4; domain 5.4 now agrees). A reset writes no activity, and open screens refresh from the version bump.
22. **The on-screen label** for `outstanding_inr` is "Still owed" (design-direction). Demo-script's narration says "Outstanding".
23. **Flag health (settled at 05:05):** there is no `GET /api/flags/health` in any spec. Flag health is `/api/health`'s `flags.ok` (flagsmith §6.7, cached 60 s per instance) or the flags drawer's Health section.
24. **How a flip reaches an open dock (settled at 05:05):** there is no `GET /api/voice/state` in any spec. VoiceDock is a server component that the focus refresh re-renders, and every voice response carries the dock fields under its `voice` key (flagsmith §6.9, voice 0.2). This file tests what is visible: the chip changes within 3 s of focus (FV6), and the server refuses on the next request.
25. **Guest live-update limit:** 12 s, one 10 s revision poll plus the refresh (2.3), over the earlier "within 10 s", which a 10 s poll can't guarantee. The target stays ≤10 s.
26. **Voice reply wording:** M-06, M-08 and R-01 follow voice 4.10, and SH-02 follows voice 7.3 (AT-6.4, AT-12.2, AT-13.2). Voice-test-set now has the same replies.

### 8.2 Open questions, each with a default

| # | Question | Default if nobody decides |
|---|---|---|
| 1 | ~~V12's caption and judge answer 4 said 403~~ **Settled at 05:05:** demo-script 4.1 now captions "Guest link → Money: no access", and judge answer 4 says the server returns no data to a guest link (the sign-in page, or 401) | – |
| 2 | ~~No note says where an owner triggers `reset_demo`~~ **Settled (D17, D120):** there is no UI control. L runs it through the command route only, with the copy owner's session, as Playwright's setup does. A lane may reset its own rehearsal copy only, as that copy's owner (`checkpoint` d0, `confirm_text` RESET); the demo and `e2e` copies stay L's | – |
| 3 | Playwright traces and reports contain the rotated `e2e` guest URL, a live token | Keep them local and out of git, and never upload them as CI artefacts. The token is rotated at the start of every run anyway |
| 4 | The first-load, p90, spoken-confirm, answer-to-speech and accessibility numbers in section 6 are this file's own | Keep them as targets. A miss is written down with its figure, and it makes an item Partial only if it breaks a live beat's time |
| 5 | The smoke test puts Diya in a second laptop browser, as asked, but on stage she is on the teammate's phone in Chrome | Run section 2 as written. In the 14:45 freeze smoke test, run steps 3 to 6 once more with Diya on the phone, so that the stage layout is timed before take 1, the first stopwatch rehearsal (D50, D121) |
| 6 | Who logs the per-stage voice timings in 6.1, and where | Lane C, on the server, for every voice turn. The lead reads the medians after the 12:45 and 14:00 full runs (D29) |
| 7 | Guest voice (G-03 to G-07) has no scenarios, because it isn't built (domain open question 7) | If it ships, add those rows and a guest-voice privacy check (G-04, G-05) before it counts as Working |
| 8 | `create_invitation_links`' activity template reads "created invitation links for 1 households" when n is 1 | Say "1 household" when n is 1, and use the same rule in Hindi |
| 9 | Dietary notes (AT-4.9) aren't part of Must 4's wording in scope | Test them, but don't require them for Must 4 to be Working |
| 10 | ~~Do `GET /api/flags/health` and `GET /api/voice/state` exist?~~ **Settled at 05:05:** neither exists in any spec (8.1, items 23 and 24) | – |
| 11 | ~~The guest rate limits differed between architecture and domain~~ **Settled (D108):** domain 6.3's numbers win: per token hash about 120 GETs and 30 POSTs a minute, plus a loose 600 a minute per IP, in Lane A's one limiter (D57). AT-4.6 tests the 30 POSTs a minute per token hash, and AT-9.4 the per-IP ceiling; both check only that a burst gets 429s | – |

---

## 9. Reconciliation log (05:05)

One line per change, against flagsmith §8.2–8.4 and §10.5, architecture §11 (04:50), voice §10, export-and-recovery §7.5 and §11, and doc-ai §5.7.

**acceptance.md**
1. 0.2: added rows for the five voice routes (with `{voice_turn_id}`), the two polls, the export worker and render page, the ops routes, and `/api/health`.
2. AT-1.9: `/api/health` shows `flags.ok` false with every flag in `fallback_flags`, or the drawer's Health section does; the citation is now architecture §2.2, not §11.
3. 0.3 already cited architecture §9 item 10 alone; no "items 9 and 10" remained.
4. AT-2.10: added the model-unreachable (`llm_unavailable`) and no-tool-call (`llm_no_action`) copy from voice 6.1 rows 10 and 11.
5. AT-3.4 and AT-4.2: Tara's page updates at the next 10 s poll, 12 s at most.
6. AT-6.4: M-06 and M-08 replies use ₹ figures (voice 4.10), with a note on why.
7. AT-7.3: "Retrying" label from attempt 2; a records line saying Chromium runs only in `POST /api/ops/export-jobs/{job_id}/run`, which claims `queued` → `rendering` and opens `/render/card/{job_id}?t=…`.
8. AT-7.4: the render page path is named; `/run` without `JOBS_API_TOKEN` answers 401.
9. AT-7.6: new row for a job left `queued` over 60 s, which expires lazily to `NOT_STARTED` (EX-09).
10. AT-9.2: every voice route, and the ops `/retry` and `/run`, answer 401 to a guest link.
11. AT-9.8: the freeze-time bundle search also looks for the `INTERNAL_USER_EMAILS` addresses.
12. Should 11 intro: the gate is now a 13:00 latest start, the 14:30 batch with local ACs, and AC-1, AC-2 and AC-9 on production by 14:45.
13. AT-11.3: the I-03 voice path opens the card sheet through the dock's paperclip; voice has no kind for it.
14. AT-12.2: R-01's reply is "…It doesn't change what you owe the caterer." (voice 4.10).
15. AT-13.2: SH-02's reply uses the register's stored names, spoken in two parts (voice 7.3).
16. 2.2 steps 6 and 16: the guest limit is 12 s.
17. 2.3: the guest row's limit is 12 s, and a new "Why these numbers" paragraph ties every time to 2.5 s and 10 s polling with no Realtime.
18. 3.1: the experiment-card bullet is replaced by the "Sent by Jashn" check; added the `/api/health` check; tabs 2–4 are signed in, with banners in view; the screenshots are of both experiment pages.
19. 3.2, the 2:10–2:30 row: 2:10–2:15 is tabs 3 and 4, Flagsmith's Production and Synthetic experiment pages.
20. 3.4: the slow-flip row shows tabs 3 and 4; added the chip-not-changed row and the Flagsmith-unreachable row (F6); slow pages fall back to the 14:30 screenshots (F7).
21. 3.5: "skip the experiment card" is now "skip tabs 3 and 4".
22. 8.1 item 12: demo-script now says "no access" and "no data" instead of 403.
23. 8.1 item 19: settled as in line 12.
24. 8.1 items 23 and 24: settled; neither `/api/flags/health` nor `/api/voice/state` exists.
25. 8.1: added items 25 (the 12 s guest limit) and 26 (the reply wording follows voice 4.10 and 7.3).
26. 8.2 questions 1 and 10: marked settled.

**demo-script.md**
27. 1.1: the laptop shows the three Flagsmith tabs.
28. 1.2: flags per flagsmith 8.3 (the drill disabled with an empty value, `card_renderer`); the `/api/health` and drawer checks; five laptop tabs in flagsmith 8.2's order, with banners and screenshots; the NudgeBee recorded and live-mode items from export-and-recovery 7.5.
29. 2, the hook row: the on-screen label is "Still owed".
30. 2, the 0:22 row: the heard words may show as digits (voice §10).
31. 2, the 2:10–2:30 row: tabs 3 and 4 at 2:10–2:15, flagsmith 8.2's keys and its three sentences; sentence 1 names the synthetic run.
32. 2, after the run: disarm the drill in live mode, log the times, and never replay the recorded run after a reset (export-and-recovery 7.5).
33. 2, running behind: skip tabs 3 and 4, and say sentence 1 anyway.
34. 3, #5: the "realtime lag" wording is replaced by polling, and the 1:02 manual-refresh rule is added.
35. 3, Flagsmith rows: the slow-flip reorder, chip not changed, slow page or signed out, unreachable (F6), and tab 5.
36. 4.1, 1:40–1:55: the caption reads "Guest link → Money: no access".
37. 4.1, 1:55–2:15: V13 and V14 content, flagsmith 8.4's voice-over and captions.
38. 4.2 V02: a fresh internal test owner on production; there is no rehearsal environment.
39. 4.2 V13: Production page, then Synthetic, then the flip, with the caption rules.
40. 5, 13:00–14:30: screenshots of both experiment pages; the 15:45 note uses an internal test owner on production.
41. Top note, 6 Q1, Q4 and Q9: the synthetic page is named as synthetic; Q1 opens the judge panel; Q4 drops 403 and the guest assistant; Q9 labels the synthetic run.

**Lead decisions, rounds 1 to 3 (about 05:50, acceptance.md)**
42. Top note: staged production checks after each batch; the full demo path and the smoke test from the 12:30 deploy (D46); rehearsals at 14:45–15:15 (D29).
43. 0.2: the mic is in the header on every screen, with no bottom speak bar (D20); `/setup` neither polls nor refreshes on focus (D79); `/api/health`'s staging (D12).
44. AT-1.2: B1's minimal landing view until B5's Overview ships, checked with a fresh owner from 11:40 (D60, Sol 14).
45. AT-2.7: "sakte hain" (D93); staged checks at 10:45, 11:15, after 11:40 and after 12:30 (D55, D47, Sol 5).
46. AT-2.12 and 6.4: the mic sits in the header on the phone too (D20, Sol 10).
47. AT-4.6 and AT-9.4: the 30 s back-off (D90) and Lane A's one rate limiter (D57); the per-IP number is open (8.2, question 11).
48. AT-5.8: the declined PRP-01 summary ends ", not yet paid" (D91).
49. AT-7.3: the REV-2 download waits for the seeded file (D15); the og renderer is dormant from 11:40 and flipped at 12:15 (D48).
50. AT-8.1: accepting an invite writes the owners entry "{email} accepted the invite as manager."; 48-hour expiry; cancel, remove and `last_owner` checks; Lane B's controls, Lane A's `/join/{token}` (D64, Sol 18).
51. AT-8.4: Diya loses `set_invitations` and gets the manager limits on `add_guest`, with a test beside X-04 (domain A3, 3.4).
52. Should 11 and 8.1 item 19: the minimum Guests and Invite screens move to 12:30; #11 is Future if Must 1–9 aren't verified by 13:00 (D56, Sol 7).
53. Should 13: the 13:45 backend deadline, B5 on fixtures by 13:30, Lane C's gated 14:30 voice topic (D65, Sol 19).
54. Section 2: the smoke test runs from the 12:30 deploy (D46).
55. 3.2: the V15 caption is "Recorded today, HH:MM", from the 13:00–13:30 take (D33).
56. 4.1 and 4.2: lane ports in `E2E_BASE_URL`; global setup for the lead's demo path only, with the H16 rotation from 12:30; lane specs and Lane D's probe spec; the staged run table (D46, D54, Astra 6, Sol 4).
57. 6.1 and 8.2 question 6: the full voice runs at 12:45 and 14:00, run apart from the presenter (D29, D49); T0–T4 at 09:14 (D7).
58. Section 7: the 36-of-39 rule (D82); lane checks tied to scenarios (Sol 23).
59. 8.1 item 18: no Meera (D22). 8.2 question 2: `reset_demo` has no UI control (D17).

**Lead decisions, round 4 (about 06:15, acceptance.md)**
60. Top note: done-checks in two parts (D104); take 1 right after the freeze smoke test is the first stopwatch rehearsal, take 2 after the 15:30 playback check (D50, D121). Section 3's intro and 8.2 question 5 follow.
61. 0.3: seeded ids cite domain 0.1 (D100); a lane resets only its own copy, and the demo and Playwright copies are L's (D17, D120). 8.2 question 2 says the same.
62. Must 1 intro and AT-1.7: `setup-<lane>-<HHMM>@example.com` owners; AT-1.7's `nonint-c-<HHMM>@example.net` on local dev only (D120). AT-1.2 reads `wedding_profile` (D99).
63. AT-1.8, AT-1.9, AT-2.7, 2.2, 2.3, 3.4, 4.3, the sponsor table, section 7 and 8.1 items 6 and 24: flagsmith checks are FV1–FV15; video shots keep V01–V16 (D113).
64. AT-2.7's staged checks: D104; stage 1 moves to right after the 11:40 deploy if C's pipeline splits (D121); the typed save may be an Events edit (D114).
65. AT-2.12: the `highlight` query parameter, applied once (D121).
66. AT-3.1, AT-5.1 and AT-12.1: `venues`, `days_until_due` and `requirements` (D99).
67. AT-4.1, AT-7.3 and 5.1: the couple photo is part of D0 from the 11:40 photo step, and the card renders with or without it (D107).
68. AT-4.6, AT-9.4 and 8.2 question 11 (closed): domain 6.3's guest limits (D108).
69. AT-4.8: link controls in `lane-b-guests-links` at 13:45 (D121). AT-8.1: the Team and sharing sheet is B4 at 13:45, through `dispatchCommand` (D98, D109).
70. AT-6.4, AT-13.2 and 8.1 item 26: voice-test-set now has the same replies.
71. AT-7.1 and section 7: the typed path in the 12:30 minimum studio (D105); I-01 is Lane C's 13:45 item, Partial in the README if it misses (D121).
72. AT-9.6: "the voice snapshot builder (voice.md 1.9)", not D95's itinerary builder.
73. Should 11 and 8.1 item 19: the minimum Guests and Invite screens ship at 12:30 unconditionally (D105); D56's 13:00 rule stands.
74. Should 13: B6 is the Shagun page, alongside B5 (Overview) (D121); the 13:45 Should gate (D106).
75. Section 2: the smoke test at about 12:35–12:55, and only the renderer gate, the capture and Bulbul-audio test and D46's checks at 12:15 (D111).
76. 4.1: lane test data (D120). 4.2: D104's two parts, the post-12:30 run as the 13:45 Should gate and demo-path fixes first (D106). 4.3: `*.db.test.ts` and `npm run test:db` (D103); A5's checks on copy a (D104, D120).
77. 6.1: V-T3 and V-T4 are Lane C's (D112); the 12:45 run can overlap the smoke test (D111).
78. Section 7: the Future row is scope.md's list, and the rest are "Later ideas (not in scope, D36)" (D121); lane checks in D104's two parts, with Lane D's 11:50 key signal (D107).
79. 8.1 items 1, 2, 3, 6, 7 and 21: domain now agrees (domain 0.3, 5.4, 5.6 and 7.1 step 9).

