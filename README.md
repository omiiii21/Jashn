# Jashn

Say it in Hindi, English or Hinglish, and Jashn keeps an Indian wedding's plans, people and payments in sync.

- **Live:** https://jashn-delta.vercel.app
- **Video:** <!-- TODO(L, 16:22): the video link -->
- **All demo data is fictional.** The couple in the photo is AI-generated and does not exist.

Built in one day at FestiveHacks (BIEC Bengaluru, 25 November 2026), with Sarvam AI for voice, Flagsmith for the voice rollout and experiment, and NudgeBee for recovering failed exports.

## What it does

1. **Voice setup.** Speak the couple's names, the date, the budget and the guest count. Jashn asks for anything missing, such as the year. You review it, then save.
2. **Voice actions and answers.** Push to talk in English, Hindi or Hinglish. Jashn shows what it understood, you confirm, and it's saved. It replies aloud in Hindi or English, and it answers questions like "kitna baaki hai?" from saved records.
3. **Events and itinerary.** Mehendi, haldi, sangeet, wedding and reception, each with a time, venue and dress code. Edits stay in draft until the owner publishes them.
4. **Guests and RSVP.** Households, invitations per function, and a private link for each guest. An RSVP from a phone is counted exactly once.
5. **Money ledger.** Budget, committed, paid and outstanding are shown separately. "The advance was ₹40,000, not ₹50,000" corrects that same payment and keeps its history.
6. **Vendors and catering.** Quotes, agreed amounts, advances and balances. The RSVP-based estimate (230 × ₹800 = ₹1,84,000) sits beside the fixed ₹2,00,000 contract.
7. **Invitation and wedding website.** A maroon-and-gold invitation with the couple's photo, a published guest site, and an exported invitation card.
8. **Owner and manager.** Two real logins. The owner sees the manager's changes, with who changed what and when, and approves publishing and spending.
9. **Privacy by role.** A guest's link never shows money, vendors, or functions the guest isn't invited to. The server enforces this, not the screen.

## Working, partial, future

<!-- TODO(L, 15:35): fill from demo-script 4.4 at the freeze. "Working" only after a person ran it on a laptop and a phone; otherwise "Partial" with exactly what works, or "Future". -->

| Item | Status |
|---|---|
| Voice setup: speak, missing-year prompt, review, save, reopen | |
| Voice actions and spoken answers | |
| Events and itinerary, draft vs published, conflict warning | |
| Guests and RSVP through private links, counted once | |
| Money ledger: planned, committed, paid, outstanding; corrections with history | |
| Vendors and catering: estimate beside the fixed contract | |
| Invitation studio, wedding website, exported card | |
| Owner and manager collaboration, activity feed | |
| Server-enforced privacy by role | |
| Sarvam: speech to text, language model, spoken replies | |
| Flagsmith: experiment, voice rollout, kill switch for voice writes | |
| NudgeBee: failed-export recovery with approval and a safe retry | |
| The full décor, menu and music workspace; receipt attachments; task boards; live guest location; real payments; WhatsApp reminders; seating | **Future** |

## Try it

Open https://jashn-delta.vercel.app, sign up as a new owner, and speak a wedding brief. Signing up puts you in the live Flagsmith experiment, which compares voice-first and form-first setup.

## Run it yourself

1. **You need:** Node 24 and npm 11, a Supabase project (Mumbai region), a Sarvam API key with credits, a Flagsmith environment and its server-side key, and Google Chrome for the card export.
2. Clone the repo, then run `npm ci`.
3. Copy `.env.example` to `.env.local` and fill in each name.
4. Run `npm run db:migrate`, then `npm run db:seed`. The seed creates the fictional sample wedding and prints its guest links.
5. Run `npm run dev`, open http://localhost:3000, and sign in with a seeded owner and the `SEED_PASSWORD` you chose.
6. Without a Sarvam key, voice runs in a labelled fixture mode ("Fixture, not Sarvam"). Everything else works.
7. **Phones:** `cloudflared tunnel --url http://localhost:3000` gives you an HTTPS address, which the microphone needs.
8. **Tests:** `npm test` runs the unit tests, `npm run test:db` the database tests against your own project, and `npm run e2e` the Playwright tests in local Chrome.

## How it works

- One Next.js 16 app on Vercel in Mumbai, with Supabase in Mumbai for Postgres, sign-in and private file storage.
- The browser never talks to the database. Every change goes through one server-side command path, which checks the person's role, validates the input and records who changed what.
- Screens stay live by polling: every 2.5 seconds on planner screens, every 10 seconds on the guest page, and whenever the tab regains focus.

## Sarvam AI

<!-- TODO(L, 15:35): check each line against Lane C's merged code. -->

- **Speech to text:** Saaras v4 in codemix mode, so Hinglish comes back the way people say it.
- **Understanding:** `sarvam-105b`, with one forced tool, `propose_actions`. The model only proposes. The app checks every value, the person confirms on a review card, and only then is anything saved.
- **Spoken replies:** Bulbul reads back text that the app builds from saved records, never numbers the model made up.
- **What is sent:** the push-to-talk clip, and a compact snapshot of the one wedding the request is about. Audio is not stored.

## Flagsmith

<!-- TODO(L, 15:35): flagsmith 7.8's points with real numbers: the three environments, the flags, the rollout log, the experiment with its real n, the synthetic run disclosed with its time and seed, the kill-switch flip log, and fail-closed behaviour. -->

- **Kill switch:** turning off `voice_writes_enabled` stops voice writes. If Flagsmith can't be reached, voice writes fail closed, and typing still works.
- **Rollout:** the voice pilot goes out to a percentage of owners.
- **Experiment:** new owners are split between voice-first and form-first setup.

## NudgeBee

<!-- TODO(L, 15:35): the card-export-recovery workflow's steps, the run ID, "recorded" or "live", and any fallback used (export-and-recovery 6.10). -->

When an invitation card export fails, NudgeBee's `card-export-recovery` workflow picks it up, asks a person to approve, and then retries it safely.

## Privacy and roles

- **Owner:** sees and approves everything for their wedding.
- **Manager:** plans and records; publishing and spending go to the owner for approval.
- **Guest:** a private link that shows only that guest's own invitation, and only the functions they're invited to. It can never read money, vendors, other guests or guest counts.
- Voice clips are not stored.

## Future scope

The full décor, menu and music workspace; receipt attachments; task boards; live guest location; real payments; WhatsApp reminders; seating.

Later ideas (not in scope): continuous voice, more languages, hall-level tracking, turning one long voice note into tasks.

## Built at FestiveHacks

Before the hackathon started at 09:00 IST on 25 November 2026, we wrote research and planning notes (now in `docs/prep/`) and set up accounts. All code was written after 09:00, as the commit history shows.

## AI assistance

We used AI assistants, as the rules allow. Claude Code with Claude Opus 5.5 wrote the application code under our direction: we set the scope, made the product, design and architecture decisions, and reviewed every merge. Claude Fable 5.2 reviewed our plans and code at checkpoints. GPT-6.2-Sol and GPT-6.2-Astra (OpenAI), through the Codex CLI, reviewed plans and code, and GPT-6.2-Sol generated the fictional couple portrait. Before the hackathon started at 09:00 IST on 25 November 2026, we produced research and notes only. All code was written after 09:00, as the commit history shows. We reviewed the code and can explain any part of it. Inside the product, Sarvam AI provides speech recognition, the language model and spoken replies.

## Credits

- **Fonts:** Eczar, Anek Devanagari and Tiro Devanagari Hindi, from Google Fonts under the SIL Open Font License. <!-- TODO(L): update if Lane E's design PR changes the UI font. -->
- **Photo:** the couple portrait is AI-generated and fictional.
- **Team:** [omiiii21](https://github.com/omiiii21) and [thesagniksaha](https://github.com/thesagniksaha).
