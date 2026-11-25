# Jashn

Say it in Hindi, English or Hinglish, and Jashn keeps an Indian wedding's plans, people and payments in sync.

- **Live:** https://jashn-delta.vercel.app (`/api/health` shows the deployed commit)
- **All demo data is fictional.** The couple in the photos is AI-generated and does not exist.

Built in one day at FestiveHacks (BIEC Bengaluru, 25 November 2026), with Sarvam AI for voice and Flagsmith for gating voice writes. A NudgeBee recovery path for failed card exports is built on Jashn's side but wasn't connected in time (see [NudgeBee](#nudgebee)).

**Contents:** [What it does](#what-it-does) · [Working, partial, future](#working-partial-future) · [Try it](#try-it) · [Run it yourself](#run-it-yourself) · [How it works](#how-it-works) · [Project layout](#project-layout) · [Sarvam AI](#sarvam-ai) · [Flagsmith](#flagsmith) · [NudgeBee](#nudgebee) · [Privacy and roles](#privacy-and-roles) · [AI assistance](#ai-assistance) · [Credits](#credits)

## What it does

1. **Voice setup.** Speak the couple's names, the date, the budget and the guest count. Jashn asks for anything missing, such as the year, instead of guessing. You review it, then save.
2. **Voice actions and answers.** Push to talk in English, Hindi or Hinglish. Jashn shows what it understood on a review card, you confirm, and only then is it saved. It replies aloud in Hindi or English, and it answers questions like "kitna baaki hai?" from saved records.
3. **Events and itinerary.** Mehendi, haldi, sangeet, wedding and reception, each with a time, venue and dress code. Edits stay in draft until the owner publishes them, and overlapping functions get a warning.
4. **Guests and RSVP.** Households, invitations per function, and a private link for each household. An RSVP from a phone is counted exactly once. The owner can turn a link off or issue a new one.
5. **Money ledger.** Budget, committed, paid and outstanding are shown separately. "Caterer ko chaalis hazaar advance diya tha" corrects the ₹50,000 advance to ₹40,000: the same payment, with its history kept, so the balance moves exactly once.
6. **Vendors and catering.** Quotes, agreed amounts, advances and balances. The RSVP-based estimate (230 × ₹800 = ₹1,84,000) sits beside the fixed ₹2,00,000 contract, labelled as an estimate.
7. **Invitation and wedding website.** A maroon-and-gold invitation with the couple's photo, a published guest site, and an exported invitation card with correctly shaped Hindi.
8. **Owner and manager.** Two real logins. The owner sees the manager's changes, with who changed what and when, and approves publishing and spending. The owner manages the team and what managers can see.
9. **Privacy by role.** A guest's link never shows money, vendors, or functions the guest isn't invited to. The server enforces this, not the screen.

## Working, partial, future

Statuses as submitted, 25 November 2026.

| Item | Status |
|---|---|
| Voice setup: speak, missing-year prompt, review, save, reopen | **Partial.** The typed setup saves and reopens on production. Voice saves were switched on in production at 16:11, close to the deadline, so voice setup has had less testing there than the typed path. |
| Voice actions and spoken answers | **Working.** Spoken answers from saved records work in Hindi and English. The payment correction gives "Correction, not a new payment: ₹50,000 → ₹40,000" on 16 of 16 live model calls, and on production it saved exactly once. |
| Events and itinerary, draft vs published, conflict warning | **Working** |
| Guests and RSVP through private links, counted once | **Working** |
| Money ledger: planned, committed, paid, outstanding; corrections with history | **Working** |
| Vendors and catering: estimate beside the fixed contract | **Working** |
| Invitation studio, wedding website, exported card | **Working.** Styling the invitation by voice is not in today's build. |
| Owner and manager collaboration, activity feed, team and sharing | **Working** |
| Server-enforced privacy by role | **Working** |
| Sarvam: speech to text, language model, spoken replies | **Working** |
| Flagsmith: voice gate and kill switch, rollout, experiment | **Partial.** Production evaluates flags live on the server, and the kill-switch path is built and tested. Most flags hadn't been created in the Flagsmith dashboard by submission time, so they ran on their fail-closed defaults: voice for internal accounts only, and setup form-first. The percentage rollout and the experiment weren't launched. |
| NudgeBee: failed-export recovery with approval and a safe retry | **Partial.** Jashn's side is built and tested: failed exports become jobs, an ops API reads them, and an export-only retry route takes an idempotency key. NudgeBee itself wasn't connected in time, so no NudgeBee run happened. |
| Reading an existing printed invitation into a draft; the overview dashboard; requirements by voice; the shagun register | **Future** |
| The full décor, menu and music workspace; receipt attachments; task boards; live guest location; real payments; WhatsApp reminders; seating | **Future** |

### Known limits today

- **Quotes said together with a new vendor:** "I got 2 florists… 15,000 aur 10,000 ka quotation" adds the two vendors but not their quotes, and a function name such as "Mehendi" can be read as a vendor. Add the vendors first, then say each quote.
- **A missing detail while voice writes are off:** the refusal comes before the question, so "Kis vendor ka advance?" isn't asked.
- **Live updates** come from polling every 2.5 seconds, so a change on one device takes a few seconds to show on the other.

## Try it

Open https://jashn-delta.vercel.app, choose **Go to dashboard**, and sign up as a new owner. Then speak or type a wedding brief.

## Run it yourself

1. **You need:** Node 24 and npm 11, a Supabase project (Mumbai region), a Sarvam API key with credits, a Flagsmith project with Development, Production and Synthetic environments and their server-side keys, and Google Chrome for the card export.
2. Clone the repo, then run `npm ci`.
3. Copy `.env.example` to `.env.local` and fill in each name.
4. Run `npm run db:migrate`, then `npm run db:seed`. The seed creates the fictional sample weddings, prints each new guest link once, and saves it to a file that git ignores.
5. Run `npm run dev`, open http://localhost:3000, and sign in with a seeded owner and the `SEED_PASSWORD` you chose.
6. Without a Sarvam key, voice runs in a labelled fixture mode ("Fixture, not Sarvam"). Everything else works.
7. **Phones:** `cloudflared tunnel --url http://localhost:3000` gives you an HTTPS address, which the microphone needs.
8. **Tests:** `npm test` runs the unit tests (1,437 on the final build), `npm run test:db` the database tests against your own project, and `npm run e2e` the Playwright tests in local Chrome.

## How it works

- One Next.js 16 app on Vercel in Mumbai, with Supabase in Mumbai for Postgres, sign-in and private file storage.
- The browser never talks to the database: Supabase's Data API exposes none of our tables. Every change goes through one server-side command path, which checks the person's role, validates the input and records who changed what.
- Screens stay live by polling: every 2.5 seconds on planner screens, every 10 seconds on the guest page, and whenever the tab regains focus.
- Money is stored as whole rupees and shown in lakh grouping (₹12,00,000). Every date and time is shown in India time (Asia/Kolkata).
- The invitation card is rendered by headless Chromium on Vercel, so Hindi is shaped correctly, and stored privately in Supabase Storage.

## Project layout

| Path | What's there |
|---|---|
| `src/app/(planner)/w/[wedding_id]/` | The planner: functions, guests, money, vendors, invite and activity |
| `src/app/(planner)/setup/` | Wedding setup, voice-first or form-first |
| `src/app/(public)/i/[token]/` | A guest's private invitation and RSVP page |
| `src/app/api/voice/` | Voice turns: record, review, confirm or cancel |
| `src/contracts/` | Shared types: commands, read models, permissions, money formatting |
| `src/server/` | Server-only code: the command dispatcher, read models, roles, voice, flags and export jobs |
| `src/db/`, `drizzle/` | The Drizzle schema and its migrations |
| `src/components/` | UI components, including the voice dock, the landing page and the shared UI kit |
| `scripts/seed.ts` | The fictional sample weddings |
| `ops/nudgebee/` | The NudgeBee recovery workflow and its setup |
| `e2e/` | Playwright tests |
| `docs/prep/` | The planning notes written before the hackathon; `decisions.md` is the final word |

## Sarvam AI

- **Speech to text:** `saaras:v4` in codemix mode, so Hinglish comes back the way people say it.
- **Understanding:** `sarvam-105b`, with one forced tool, `propose_actions`. The model only proposes. The app re-reads every amount from the words heard and checks every value, the person confirms on a review card, and only then is anything saved.
- **Spoken replies:** `bulbul:v4-flash` reads back text that the app builds from saved records, never numbers the model made up. Hindi amounts and dates are spoken in words ("एक लाख पचास हज़ार रुपये बाकी हैं।").
- **What is sent:** the push-to-talk clip, and a compact snapshot of the one wedding the request is about. Audio is not stored.

## Flagsmith

- **Server-side only:** flags are evaluated on the server with Flagsmith's Node SDK, never in the browser. People are identified by an opaque HMAC identity, never personal data.
- **Three environments:** Development for building, Production for real users, and Synthetic for a scripted, clearly labelled test run, so test traffic never touches real numbers.
- **The flags:**
  - `voice_writes_enabled` is the kill switch. Off: the server refuses every voice-originated write, at the turn and again in the command path. Questions and typing keep working.
  - `voice_pilot` decides who gets voice: the team first, then a percentage of owners.
  - `setup_entry` is the experiment: new owners split between form-first (control) and voice-first setup. `setup_entry_synthetic` is its twin, read only by the scripted run.
  - `spoken_replies`, `card_renderer` and `export_failure_drill` are operational switches. The drill fails one card export on purpose, so the recovery path can be shown on a real failure.
- **Fail closed:** if Flagsmith can't be reached, or a key is missing, voice writes are refused and setup opens form-first. Nothing else breaks. One temporary exception, added at 16:00 on build day (PR #49): while `voice_writes_enabled` hasn't been created in Flagsmith, a reachable Flagsmith with no such flag allows voice writes. Once the flag exists, it decides.
- **What ran today:** production read Flagsmith live on every voice turn and fell back safely for the flags not yet created. The rollout and the experiment weren't launched, so there are no experiment numbers. Jashn computes no statistics and shows no synthetic number.

## NudgeBee

When an invitation card export fails, Jashn records it as a job with its error. The recovery is designed for NudgeBee's `card-export-recovery` workflow: it picks up the failed job, reads its error, and pauses for a person to approve. Only after approval does it call Jashn's export-only retry route with its own token and an idempotency key, then checks that exactly one new card exists. The retry can't publish anything or touch the ledger. The workflow and its setup are in `ops/nudgebee/`.

**Status today:** Jashn's side (the jobs, the ops API and the retry route) is built and tested. NudgeBee's console needs a connected Kubernetes agent before its workflow builder opens, and we didn't connect it in time, so no NudgeBee run happened.

## Privacy and roles

- **Owner:** sees and approves everything for their wedding, and chooses what managers may see (budget, vendor dues, guest contacts).
- **Manager:** plans and records. Publishing and spending go to the owner for approval.
- **Guest:** a private link that shows only that household's own invitation, and only the functions they're invited to. It can never read money, vendors, other guests or guest counts.
- Voice clips are not stored.

## Future scope

The shagun register; the full décor, menu and music workspace; receipt attachments; task boards; live guest location; real payments; WhatsApp reminders; seating.

Later ideas (not in scope): continuous voice, more languages, hall-level tracking, turning one long voice note into tasks.

## Built at FestiveHacks

Before the hackathon started at 09:00 IST on 25 November 2026, we wrote research and planning notes (now in `docs/prep/`) and set up accounts. All code was written after 09:00, as the commit history shows.

## AI assistance

We used AI assistants, as the rules allow. Claude Code with Claude Opus 5.5 wrote the application code under our direction: we set the scope, made the product, design and architecture decisions, and reviewed every merge. Claude Fable 5.2 reviewed our plans and code at checkpoints. GPT-6.2-Sol and GPT-6.2-Astra (OpenAI), through the Codex CLI, reviewed plans and code. GPT-6.2-Sol generated the fictional couple portraits, and GPT-6.2-Astra drafted our integration slides. The UI design was explored on a Doop design canvas with Claude. Before the hackathon started at 09:00 IST on 25 November 2026, we produced research and notes only. All code was written after 09:00, as the commit history shows. We reviewed the code and can explain any part of it. Inside the product, Sarvam AI provides speech recognition, the language model and spoken replies.

## Credits

- **Fonts:** Geist and Geist Serif for the planner, with Eczar, Anek Devanagari and Tiro Devanagari Hindi for Hindi text and the invitation. All are under the SIL Open Font License; Geist Serif is committed in `public/brand/fonts/`, the rest load from Google Fonts.
- **Photos:** the six couple portraits are AI-generated and fictional.
- **Icons:** [Phosphor](https://phosphoricons.com) (MIT).
- **Team:** [omiiii21](https://github.com/omiiii21) and [thesagniksaha](https://github.com/thesagniksaha).
