# Jashn

Say it in Hindi, English or Hinglish, and Jashn keeps an Indian wedding's plans, people and payments in sync.

- **Live:** https://jashn-delta.vercel.app (`/api/health` shows the deployed commit)
- **Video:** <!-- TODO(L, 16:22): the video link -->
- **All demo data is fictional.** The couple in the photos is AI-generated and does not exist.

Built in one day at FestiveHacks (BIEC Bengaluru, 25 November 2026), with Sarvam AI for voice, Flagsmith for the voice rollout, the setup experiment and the kill switch, and NudgeBee for recovering failed card exports.

## What it does

1. **Voice setup.** Speak the couple's names, the date, the budget and the guest count. Jashn asks for anything missing, such as the year, instead of guessing. You review it, then save.
2. **Voice actions and answers.** Push to talk in English, Hindi or Hinglish. Jashn shows what it understood on a review card, you confirm, and only then is it saved. It replies aloud in Hindi or English, and it answers questions like "kitna baaki hai?" from saved records.
3. **Events and itinerary.** Mehendi, haldi, sangeet, wedding and reception, each with a time, venue and dress code. Edits stay in draft until the owner publishes them, and overlapping functions get a warning.
4. **Guests and RSVP.** Households, invitations per function, and a private link for each household. An RSVP from a phone is counted exactly once. The owner can turn a link off or issue a new one.
5. **Money ledger.** Budget, committed, paid and outstanding are shown separately. "The advance was ₹40,000, not ₹50,000" corrects that same payment and keeps its history, so the balance moves exactly once.
6. **Vendors and catering.** Quotes, agreed amounts, advances and balances. The RSVP-based estimate (230 × ₹800 = ₹1,84,000) sits beside the fixed ₹2,00,000 contract, labelled as an estimate.
7. **Invitation and wedding website.** A maroon-and-gold invitation with the couple's photo, a published guest site, and an exported invitation card with correctly shaped Hindi.
8. **Owner and manager.** Two real logins. The owner sees the manager's changes, with who changed what and when, and approves publishing and spending. The owner manages the team and what managers can see.
9. **Privacy by role.** A guest's link never shows money, vendors, or functions the guest isn't invited to. The server enforces this, not the screen.

## Working, partial, future

<!-- TODO(L, 16:05): confirm each status against the recorded takes. "Working" only after a person ran it on a laptop and a phone. -->

| Item | Status |
|---|---|
| Voice setup: speak, missing-year prompt, review, save, reopen | **Partial.** The typed setup saves and reopens on production. Voice setup needs Flagsmith's write gate open in production. |
| Voice actions and spoken answers | **Partial.** Spoken answers from saved records work in Hindi and English (6 of the 8 live lines passed on Sarvam). The payment correction line (M-03) sometimes loses the amount, so a retake may be needed. |
| Events and itinerary, draft vs published, conflict warning | **Working** |
| Guests and RSVP through private links, counted once | **Working** |
| Money ledger: planned, committed, paid, outstanding; corrections with history | **Working** |
| Vendors and catering: estimate beside the fixed contract | **Working** |
| Invitation studio, wedding website, exported card | **Working.** Styling the invitation by voice is not in today's build. |
| Owner and manager collaboration, activity feed, team and sharing | **Working** |
| Server-enforced privacy by role | **Working** |
| Sarvam: speech to text, language model, spoken replies | **Working** |
| Flagsmith: experiment, voice rollout, kill switch for voice writes | <!-- TODO(L, 16:05) --> **Partial** |
| NudgeBee: failed-export recovery with approval and a safe retry | <!-- TODO(L, 16:05) --> **Partial** |
| Reading an existing printed invitation into a draft; the overview dashboard; requirements by voice; the shagun register | **Future** |
| The full décor, menu and music workspace; receipt attachments; task boards; live guest location; real payments; WhatsApp reminders; seating | **Future** |

### Known limits today

- **M-03, the payment correction by voice:** in about half of the live runs, the model attaches the corrected amount to the wrong part of its answer. Then the review card shows no new amount, and you say it again or edit the card.
- **A missing detail while voice writes are off:** the refusal comes before the question, so "Kis vendor ka advance?" isn't asked.
- **Live updates** come from polling every 2.5 seconds, so a change on one device takes a few seconds to show on the other.

## Try it

Open https://jashn-delta.vercel.app and sign up as a new owner. Setup opens either voice-first or form-first: that's the live Flagsmith experiment. Then speak or type a wedding brief.

## Run it yourself

1. **You need:** Node 24 and npm 11, a Supabase project (Mumbai region), a Sarvam API key with credits, a Flagsmith project with Development, Production and Synthetic environments and their server-side keys, and Google Chrome for the card export.
2. Clone the repo, then run `npm ci`.
3. Copy `.env.example` to `.env.local` and fill in each name.
4. Run `npm run db:migrate`, then `npm run db:seed`. The seed creates the fictional sample weddings and saves their guest links to a local file that git ignores.
5. Run `npm run dev`, open http://localhost:3000, and sign in with a seeded owner and the `SEED_PASSWORD` you chose.
6. Without a Sarvam key, voice runs in a labelled fixture mode ("Fixture, not Sarvam"). Everything else works.
7. **Phones:** `cloudflared tunnel --url http://localhost:3000` gives you an HTTPS address, which the microphone needs.
8. **Tests:** `npm test` runs the unit tests (1,419 on the final build), `npm run test:db` the database tests against your own project, and `npm run e2e` the Playwright tests in local Chrome.

## How it works

- One Next.js 16 app on Vercel in Mumbai, with Supabase in Mumbai for Postgres, sign-in and private file storage.
- The browser never talks to the database: Supabase's Data API exposes none of our tables. Every change goes through one server-side command path, which checks the person's role, validates the input and records who changed what.
- Screens stay live by polling: every 2.5 seconds on planner screens, every 10 seconds on the guest page, and whenever the tab regains focus.
- The invitation card is rendered by headless Chromium on Vercel, so Hindi is shaped correctly, and stored privately in Supabase Storage.

## Sarvam AI

- **Speech to text:** Saaras v4 in codemix mode, so Hinglish comes back the way people say it.
- **Understanding:** `sarvam-105b`, with one forced tool, `propose_actions`. The model only proposes. The app checks every value, the person confirms on a review card, and only then is anything saved.
- **Spoken replies:** Bulbul v4 reads back text that the app builds from saved records, never numbers the model made up. Hindi amounts and dates are spoken in words ("एक लाख पचास हज़ार रुपये बाकी हैं।").
- **What is sent:** the push-to-talk clip, and a compact snapshot of the one wedding the request is about. Audio is not stored.

## Flagsmith

<!-- TODO(L, 16:05): flagsmith 7.8 with real numbers: the rollout log with times, the experiment's launch time and real n per arm from Flagsmith's page, the synthetic run's time, counts and seed, and every kill-switch flip with its time. -->

- **Three environments:** Development for building, Production for real users, and Synthetic for a scripted, clearly labelled test run, so test traffic never touches real numbers.
- **The flags:**
  - `voice_pilot` decides who gets voice: on for the team, then rolled out to a percentage of owners.
  - `voice_writes_enabled` is the kill switch. Off: the server refuses every voice-originated write, at the turn and again in the command path. Questions and typing keep working.
  - `setup_entry` is the experiment: new owners are split between form-first (control) and voice-first setup. `setup_entry_synthetic` is its twin, read only by the scripted run.
  - `spoken_replies`, `card_renderer` and `export_failure_drill` are operational switches. The drill fails one card export on purpose, so the NudgeBee recovery can be shown on a real failure.
- **Fail closed:** if Flagsmith can't be reached, or a key is missing, voice writes are refused and setup opens form-first. Nothing else breaks.
- **Honest numbers:** the experiment's real counts are on Flagsmith's own experiment page, marked "Collecting data". A day's traffic is far too small to call. The Synthetic run (800 scripted owners with a planted effect) tests the wiring, not the product. Jashn computes no statistics and shows no synthetic number.

## NudgeBee

<!-- TODO(L, 16:05): the run ID, "recorded" or "live", and any fallback used (export-and-recovery 6.10). -->

When an invitation card export fails, NudgeBee's `card-export-recovery` workflow picks up the failed job, reads its error, and pauses for a person to approve. Only after approval does it call Jashn's export-only retry route, with its own token. It then checks that exactly one new card exists. The retry can't publish anything or touch the ledger. The workflow and its setup are in `ops/nudgebee/`.

## Privacy and roles

- **Owner:** sees and approves everything for their wedding, and chooses what managers may see (budget, vendor dues, guest contacts).
- **Manager:** plans and records. Publishing and spending go to the owner for approval.
- **Guest:** a private link that shows only that household's own invitation, and only the functions they're invited to. It can never read money, vendors, other guests or guest counts.
- Voice clips are not stored.

## Future scope

The full décor, menu and music workspace; receipt attachments; task boards; live guest location; real payments; WhatsApp reminders; seating.

Later ideas (not in scope): continuous voice, more languages, hall-level tracking, turning one long voice note into tasks.

## Built at FestiveHacks

Before the hackathon started at 09:00 IST on 25 November 2026, we wrote research and planning notes (now in `docs/prep/`) and set up accounts. Before 09:00 we only created the Flagsmith account and an empty project with three environments. Everything else was created after 09:00. All code was written after 09:00, as the commit history shows.

## AI assistance

We used AI assistants, as the rules allow. Claude Code with Claude Opus 5.5 wrote the application code under our direction: we set the scope, made the product, design and architecture decisions, and reviewed every merge. Claude Fable 5.2 reviewed our plans and code at checkpoints. GPT-6.2-Sol and GPT-6.2-Astra (OpenAI), through the Codex CLI, reviewed plans and code, and GPT-6.2-Sol generated the fictional couple portraits. Before the hackathon started at 09:00 IST on 25 November 2026, we produced research and notes only. All code was written after 09:00, as the commit history shows. We reviewed the code and can explain any part of it. Inside the product, Sarvam AI provides speech recognition, the language model and spoken replies.

## Credits

- **Fonts:** Geist and Geist Serif by Vercel, and Eczar, Anek Devanagari and Tiro Devanagari Hindi from Google Fonts, all under the SIL Open Font License.
- **Photos:** the six couple portraits are AI-generated and fictional.
- **Icons:** Phosphor Icons (MIT).
- **Team:** [omiiii21](https://github.com/omiiii21) and [thesagniksaha](https://github.com/thesagniksaha).
