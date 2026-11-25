# Jashn: presenting and submitting

Prep note written at about 05:00 IST on Wed 25 Nov 2026 and updated at about 06:15 to decisions D1–D122, before coding starts. Notes only (Rule 4). It covers the pitch, the live-demo talk track, judge Q&A, the submission checklist, the README outline, the AI disclosure and the video.

**Who is who in this file.**
- **User:** the team lead. Presents, owns every account, submits.
- **Teammate:** holds the phone (Diya and Tara). Not yet confirmed, so the user is the fallback for every teammate step (solo fallback: demo-script §1.1).
- **L:** the lead Claude Code session on the MacBook. It writes the README and keeps the Notion "Jashn — Build HQ" page current.

**Sources it must not contradict:** `scope.md` (what we may claim), demo-script §2 and §4 (beats and times), acceptance §3.2 (pass checks), flagsmith §8.2 and §8.4 (the Flagsmith beat, which replaces the older drawer card in acceptance §3.2), export-and-recovery §7.1–§7.6 (the NudgeBee beat), demo-data (every name and number).

**Honesty rules for every word we say or write.**
- Claim only what `scope.md` lists, and only at the status the 14:45 freeze gives it (acceptance §7). Should items #10–#13 are mentioned only if Working.
- "Fictional" is said once at the start. The "Fictional demo data" badge is on every screen.
- The Production experiment has real, small counts. Never claim a winner. The Synthetic experiment is always named "synthetic" when it is on screen (flagsmith §8.2).
- The NudgeBee beat is a **recording** of a real run, with the drill off in the live run, unless L chose live mode at 14:30 because the live run finished in under 15 s in rehearsal (decision D40). The fault is deliberate and is called deliberate.
- Live updates are polling: every 2.5 s on planner screens and every 10 s on the guest page, plus a refresh when a tab regains focus. Never say "realtime" or "websocket" (D37).

---

## 1. The 60-second pitch (spoken; about 150 words)

Say it slowly. The first line is the only Hinglish.

> "Caterer ko ab kitna dena hai?" Every Indian wedding family asks that question.
>
> A wedding is five functions, two hundred and fifty guests, a dozen vendors, and a family that remembers every number differently, across calls and voice notes in three languages.
>
> Jashn is a voice-first wedding planner. You speak in English, Hindi or Hinglish. Jashn shows what it understood, you confirm, and the schedule, the guest list and the money stay in sync. A correction fixes the same payment and keeps its history. The event manager works in her own login, and guests see only what the owner publishes.
>
> Sarvam hears the Hinglish, turns it into a proposed action, and speaks the answer back.
> Flagsmith runs a real voice-first versus form-first experiment, rolls voice out step by step, and holds a kill switch for voice writes.
> NudgeBee recovers a failed invitation-card export, with a human's approval and no duplicate card.
>
> Plans, people and payments, kept together.

---

## 2. The 3-minute live-demo talk track

Clock times and beat names are demo-script §2 and acceptance §3.2. The words below are what the **user says to the judges**. The lines spoken **to the app** are in the "To the app" column; hold push-to-talk only for those. Pass checks live in acceptance §3.2; fallbacks in acceptance §3.4.

| Clock · beat | To the app | The user says to the judges |
|---|---|---|
| 0:00–0:12 · Hook | – | "This is Jashn, a voice-first wedding planner. Mira and Kabir are fictional; the problem isn't: 250 invitations, twelve lakh, and a caterer advance the family remembers differently." |
| 0:12–0:22 · #1 Ask | "Caterer ko ab kitna dena hai?" | (Let the app answer.) "That answer comes from the saved ledger." |
| 0:22–0:50 · #2 Correct, #3 Confirm | "Caterer ko chaalis hazaar advance diya tha." then "Haan, save karo." | Before confirming: "Her mother says it was forty thousand. Jashn doesn't add a second payment; it corrects the one we have." After, on PAY-01's history: "One payment, two versions, nothing lost. The total moved by exactly ten thousand." |
| 0:50–1:02 · #4 Manager (teammate, phone) | Diya: "Reception Lotus Hall mein shift kar do." | "Diya, the event manager, is on her own phone with her own login. Banyan Hall seats 220 and 229 have said yes, so she moves the reception." |
| 1:02–1:12 · #5 Owner sees it | "Diya ne kya badla?" | "Mira sees who changed what, from the saved record." |
| 1:12–1:18 · Guests unchanged | – | "Guests still see Banyan Hall. Nothing reaches them until the owner publishes." |
| 1:18–1:25 · #6 Publish | "Schedule publish kar do." | "Publishing always needs the owner's confirmation." |
| 1:25–1:50 · RSVP (Tara, phone) | – (Tara taps) | "Tara sees Lotus Hall and taps Attending. Two hundred and thirty. Confirmed-guest estimate: one lakh eighty-four thousand. Signed contract: two lakh. An estimate never silently rewrites a contract." |
| 1:50–2:10 · #7 Ask again | "Reception ka venue kya hai, aur caterer ka kitna baaki hai?" | "Both answers come from the records you just watched change. Sarvam Saaras hears the Hinglish, Sarvam's model proposes the action, and Bulbul speaks the answer." |
| 2:10–2:30 · **Flagsmith, live, ≤20 s** | #8 at 2:18: "Reception mein barah logon ke liye Jain khana add karo." | 2:10 (tabs 3 then 4): "Flagsmith runs our voice-first versus form-first setup test: real counts, too small to call, beside a labelled synthetic run." 2:15 (tab 2, flip `voice_writes_enabled` off): "Now suppose voice mishears amounts: one switch, and the server refuses voice writes." 2:25 (typed save of 12): "Questions still work; typing still saves." |
| 2:30–2:50 · **NudgeBee, recorded, ≤20 s** | – | Over the V15 clip, word for word: "We deliberately failed this card export once. NudgeBee read the job, waited for my approval, called our export-only retry and checked the result: one card, no duplicate publish, no ledger change. This is a recording of the real run; the ID is on screen." |
| 2:50–3:00 · Close | – | "Tara has the right hall, and Mira knows exactly what she owes. Sarvam listens and speaks, Flagsmith controls voice, NudgeBee recovers failures." |

**Labels to keep honest on stage.**
- Flagsmith beat (flagsmith §8.2): the Production page under its red "PRODUCTION · real users" banner says "Collecting data". The Synthetic page stays under its purple "Synthetic data" banner. Sentence 1 names it as synthetic.
- NudgeBee beat: the clip caption reads "Recorded today, HH:MM, from this deployment · NudgeBee run <ID>", with the real recording time filled in (13:00–13:30, or the 14:00–14:30 retake; D33). If the 12:45 recording path was "NudgeBee reads, the user retries in Jashn" (D43), say instead: "We deliberately failed this card export once. NudgeBee read the failed job, I retried it in Jashn, and NudgeBee read the completed job: one card, no duplicate publish, no ledger change. This is a recording of the real run; the ID is on screen." The caption names who retried. If L chose **live mode** at 14:30, use export-and-recovery §7.3's five lines instead and say "Live now: I'll break this card export on purpose. It's labelled as a drill."
- Close: if Should #10 (Overview) isn't Working, close on Money → Annapoorna Caterers instead and say the same line.

**Running behind** (acceptance §3.5): at 1:50 drop the narration and let the app answer. At 2:10 skip tabs 3 and 4, say sentence 1 anyway, do only the flip and the refusal.

**Straight after every run** (acceptance §3.3): `voice_writes_enabled` back on, L runs `reset_demo` to D0 through the command route (there is no reset button; D17), log both flip times for the README.

---

## 3. Judge Q&A: the 20 likeliest questions

Rule: answer in at most three sentences, then offer to show it. At the 14:45 freeze, L corrects any answer the build didn't meet and marks it here.

**Product and voice**

1. **"What is Jashn, in one line?"** Say it in Hindi, English or Hinglish, and Jashn keeps an Indian wedding's plans, people and payments in sync. Owner, event manager and guests each see their own part, enforced on the server.
2. **"Why voice, when families already use WhatsApp and spreadsheets?"** The people who know the details, parents and relatives, describe them in Hinglish on calls and voice notes, and the details get scattered. Jashn turns that speech into checked records the family and the planner share. Typing stays available for precision and noisy halls.
3. **"How well does Hinglish work, with numbers like 'dedh lakh', in a noisy hall?"** We ran a 47-line test set on the stage headset with fluent speakers, one from outside the team, covering spoken forms like baarah lakh, dedh lakh, sava lakh and ₹1.5L, and the live lines had to pass five runs in a row. Jashn understands those forms, and its own replies always use plain number words (D75). When it mishears, the preview shows the heard words beside the rupee amount, and the owner fixes the number before anything is saved.

**Sponsors**

4. **"Is that really live Sarvam, or canned?"** It's live: the push-to-talk clip goes from our server to Saaras v4 speech-to-text in codemix mode, `sarvam-105b` turns the transcript into one proposed action, and Bulbul speaks a reply built from the saved record. Say any line of your own and watch the transcript, the preview and the saved record.
5. **"What stops the model inventing amounts, dates or names?"** The model only proposes; it never computes and never writes. Code re-reads every number from the words heard, checks every field against the saved wedding, and saves through the same server functions as the forms, only after the speaker confirms. Anything missing stays empty and is asked for, like the year at setup.
6. **"What does Flagsmith actually do? What breaks without it?"** Three flags do real work on the server: `setup_entry` splits new owners 50/50 between voice-first and form-first setup, `voice_pilot` rolls voice out in steps, and `voice_writes_enabled` is a kill switch checked on every voice write. Remove Flagsmith and there is no experiment, no staged rollout and no way to stop voice writes short of a redeploy.
7. **"Why is your experiment inconclusive?"** Because it's real: Flagsmith shows no statistics below 50 owners and 5 saves per arm, and a 10-point effect needs about 385 per arm (our estimate). A separate, bannered Synthetic environment with 800 scripted owners and a disclosed planted effect proves the wiring. We never quote it as evidence about voice.
8. **"What happens if Flagsmith is down?"** Pages still render. The kill switch fails closed, so voice drops to questions only while typing still saves. Setup opens form-first and records no exposure.
9. **"Is the NudgeBee failure real? Where's Kubernetes?"** The fault is injected on purpose by a Flagsmith flag scoped to the sample wedding, and labelled; the recovery is real. NudgeBee's workflow reads our job over HTTPS, waits for a human approval, calls an export-only retry, verifies the card and re-sends the retry to prove a replay changes nothing. We're a web app, so the workflow uses HTTP tasks; *(if the 09:30 or 10:20 check needed it: "NudgeBee's agent runs in a local kind cluster linked as our non-production account").*
10. **"Why does a re-render need a human, and what if NudgeBee retries twice?"** It acts on what guests receive, so the approval says exactly what will and won't change, and the run records who approved. The same Idempotency-Key replays the first answer, and a new key can only claim a failed job once. There is one card per published revision and format.

**Privacy, corrections and collaboration**

11. **"Can a guest link see money or other guests?"** No. Tara's link is a token checked on the server; it reads only her household's invitations from the published schedule. Money, planner, export and voice routes refuse it with 401, and a function she isn't invited to returns 404 through the RSVP route (D35). The browser never talks to the database at all; every read and write goes through one server guard.
12. **"What do you send to Sarvam and Flagsmith?"** Sarvam gets the audio clip and a role-filtered snapshot of the wedding with no phone numbers, emails or tokens; audio is never stored by us. Flagsmith gets an opaque HMAC identity and a few traits, never personal data, and never runs in the browser.
13. **"How do corrections and history work?"** "The advance was forty, not fifty" targets the one identified payment, PAY-01, and writes version 2 in one transaction; version 1 stays in its history with who, when and the transcript. Confirming twice or a network retry replays the saved result, so the caterer still has one payment and the total moves once. Only the speaker can confirm, within 10 minutes.
14. **"How do the manager's changes reach the owner?"** Each change is saved with who made it, as an activity entry, and the owner's screen polls a version number every 2.5 s and refreshes. A manager's edits stay in draft until the owner publishes, and a manager's money change becomes a proposal the owner approves or declines.

**Honesty and process**

15. **"What's real, what's recorded, what's synthetic?"** Every Sarvam call, both logins, the publish, Tara's RSVP and the Flagsmith flip ran live on our deployment. The NudgeBee beat is a labelled recording of a real run from today, with its run ID, and the Synthetic experiment is scripted traffic under its own banner. All people and amounts are fictional, and the couple's photo is AI-generated.
16. **"What did you prepare before 09:00, and what did you build today?"** Before 09:00: research, specs, the scope, the demo data and script, design notes, account sign-ups and an empty repo with notes. Every line of code, the design system, the flags, the experiment and the NudgeBee workflow were made after 09:00, and the commit history shows it.
17. **"How much did AI write, and can you explain it?"** Claude Code with Claude Opus 5.5 wrote the code under our direction; Claude Fable 5.2, and GPT-6.2-Sol and GPT-6.2-Astra (OpenAI) through the Codex CLI, reviewed plans and code; the README and form disclose this (section 6). Pick any path and we'll walk it, for example voice → transcript → proposed action → checks → preview → confirm → the same server function the form uses.

**Scale, cost and next**

18. **"Does this scale? What does it cost?"** One Next.js app on Vercel in Mumbai and one Supabase Postgres, with every request authorised in one guard, so it scales like any stateless web app. Our estimate from Sarvam's list prices is under ₹0.30 per voice turn (speech, model and spoken reply), and Flagsmith's Free plan covers 50,000 requests a month. Later ideas (not in scope): at real scale, swap polling for push and raise Sarvam's per-account rate limits.
19. **"What doesn't work yet?"** *(At the freeze, name the weakest Partial item from the README table.)* Everything outside `scope.md` is future scope, listed in the README.
20. **"What would you build next?"** Our future scope, from `scope.md` word for word: "The full décor, menu and music workspace; receipt attachments; task boards; live guest location; real payments; WhatsApp reminders; seating." Later ideas (not in scope): continuous voice, more languages and hall-level tracking (D36, D121).

---

## 4. Submission checklist (target 16:35, latest 16:45; deadline 17:00)

Target submit time is 16:35; 16:45 is the latest the team allows (D32). The video has two fallback triggers: 16:10 (the edit isn't exported: cut the raw takes) and 16:20 (the final doesn't play signed out). The submission platform is not named yet (hackathon-facts), so the user finds it at check-in.

| IST | Step | Owner (fallback) | Done when |
|---|---|---|---|
| before 09:00 | Confirm every member is accepted and registered, and how check-in works (D45) | User | Both names show as registered |
| ~09:05–09:10 | Check-in, after the notes PR: open the actual submission form; note its fields and video-link format (D45, D51) | User | Form URL and fields written on the Notion page |
| by 10:00 | If the teammate isn't accepted: the team is the user alone, and the teammate doesn't touch the build or the demo | User | Solo fallback (demo-script §1.1) noted on Notion |
| 14:45 | Freeze; fill the Working / Partial / Future table (acceptance §7) | L, user approves | Table in README draft; Q&A 19 updated |
| 14:45–15:15 | Take 1, the submission-safe take, recorded at once after the freeze smoke test; it doubles as the first stopwatch rehearsal. Any second run is take 2, after the 15:30 check (D50, D121) | User | Take 1 saved |
| 15:00 | Setup tested from a fresh public clone (README §5 below): `npm ci`, build, start against the existing project (D51, D74) | L | All three pass in a fresh folder |
| 15:15–15:30 | Upload fallback video (take 1), unlisted; README draft on `main` | User, L | Plays in a private window, signed out |
| 15:30 | Signed-out check of the README (AI use, what existed before 09:00, sponsor evidence, the fallback video) and of take 1's three sponsor beats (D50, D51, D74) | User | Each item seen signed out |
| 16:00 | README final: setup steps, sponsor sections, AI disclosure, W/P/F table, run ID, Flagsmith log (D74) | L | PR "L: README for submission" merged; renders on GitHub |
| 16:10–16:20 | Final video uploaded; triggers at 16:10 (the edit isn't exported: cut the raw takes) and 16:20 (it doesn't play signed out: submit the fallback) | User | Plays on the phone, signed out |
| 16:20 | Repo checks (commands below) | L | Public; no secrets or Claude files tracked; no AI names in commit messages |
| 16:20–16:30 | Every link tested in a **private window**: repo, README, video, live app, guest site (D74) | Teammate (user) | Each opens signed out |
| 16:35 (latest 16:45) | Submit: repo URL, video URL, live URL, AI disclosure (section 6) pasted into the form | User | Confirmation screen screenshotted; receipt saved; logged on Notion |
| 16:45–17:00 | L runs `reset_demo` to D0 through the command route; flags restored, both devices charging | L, user, teammate | acceptance §3.1 pre-flight passes |

Run at 09:00 or later (L, at 16:20; each check prints nothing or `200`):

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://github.com/omiiii21/Jashn
git -C ~/Desktop/Personal/Jashn fetch origin
git -C ~/Desktop/Personal/Jashn ls-tree -r --name-only origin/main | grep -E '(^|/)\.env|CLAUDE|^\.claude/|^\.impeccable/|^docs/prep/raw/'
git -C ~/Desktop/Personal/Jashn log origin/main --format=%B | grep -i -E 'claude|co-authored-by|generated with'
GH_TOKEN="$(gh auth token --user omiiii21)" gh pr list --repo omiiii21/Jashn --state open
```

- The first line must print `200` (public, signed out). Lines 3 and 4 must print nothing. Line 5 lists open PRs; none should be needed for the demo.
- `.env.example` (names only) is allowed; the grep on line 3 flags it, so check by eye that only `.env.example` appears.
- If line 4 finds the old trailer, Step 0's force-push (09:00) didn't happen: the user runs it now, before submitting.

---

## 5. README outline (L writes it; one line per section)

1. **Jashn** — the one-liner from `scope.md`, the live URL, the video link, and "All demo data is fictional".
2. **What it does** — Must #1–#9 in one sentence each, Should #10–#13 only at their freeze status.
3. **Working / Partial / Future** — demo-script §4.4's table, filled at 14:45 by acceptance §7's rules.
4. **Try it** — sign up on the live URL as a new owner and speak a wedding brief; note this enrols you in the real experiment.
5. **Run it yourself** — the steps below, tested from a fresh public clone at 15:00 (D74).
6. **How it works** — one Next.js app on Vercel (Mumbai), Supabase Postgres, Auth and private Storage; the browser never touches the database; one server guard; live updates by polling (2.5 s on planner screens, 10 s on the guest page, and on tab focus).
7. **Sarvam AI** — Saaras v4 codemix speech-to-text, `sarvam-105b` proposing one action, Bulbul spoken replies, Document AI for #11 if Working; what is sent and what is never sent.
8. **Flagsmith** — flagsmith §7.8's nine points: pre-09:00 state, three environments, flags, rollout log, experiment with real n, synthetic disclosure with time and seed, flip log, fail-closed, where the numbers live.
9. **NudgeBee** — the `card-export-recovery` workflow's steps, the run ID, "recorded" or "live", and any fallback used (export-and-recovery §6.10).
10. **Privacy and roles** — owner, manager, guest; what a guest link can never read; audio and card photos never stored; Sarvam's 8-day Document AI retention.
11. **Future scope** — `scope.md` word for word: "The full décor, menu and music workspace; receipt attachments; task boards; live guest location; real payments; WhatsApp reminders; seating." Anything else goes on a separate line labelled "Later ideas (not in scope)": continuous voice, more languages, hall-level tracking (D36, D121).
12. **Built at FestiveHacks** — what existed before 09:00 (notes and accounts only), and "all code after 09:00; see the commit history".
13. **AI assistance** — section 6's text.
14. **Credits** — fonts (Eczar, Anek Devanagari), the AI-generated fictional portrait, the team.

**"Run it yourself" steps** (the README holds the commands; scripts come from architecture §7.2):
1. Prerequisites: Node 24 and npm 11; a Supabase project (Mumbai); a Sarvam API key with credits; a Flagsmith environment and its server key; Google Chrome for card export.
2. Clone the repo, then `npm ci`.
3. Copy `.env.example` to `.env.local` and fill each name (the README table says where each value comes from; architecture §5.1).
4. `npm run db:migrate`, then `npm run db:seed` (creates the fictional sample wedding and prints its guest links).
5. `npm run dev`, open http://localhost:3000, sign in with a seeded owner and the `SEED_PASSWORD` you chose.
6. Without a Sarvam key, voice runs in labelled fixture mode ("Fixture, not Sarvam"); everything else works.
7. Phones: `cloudflared tunnel --url http://localhost:3000` gives an HTTPS URL, which the microphone needs.
8. Tests: `npm run test` (Vitest unit tests), `npm run test:db` (the `*.db.test.ts` database tests, against your own project; D103) and `npm run e2e` (Playwright, local Chrome).

---

## 6. AI-assistance disclosure (paste into the README and the submission form)

Correct it to what was actually used before the 15:30 signed-out check; it is final with the README at 16:00 (D74).

> **AI assistance.** We used AI assistants, as the rules allow. Claude Code with Claude Opus 5.5 wrote the application code under our direction: we set the scope, made the product, design and architecture decisions, and reviewed every merge. Claude Fable 5.2 reviewed our plans and code at checkpoints. GPT-6.2-Sol and GPT-6.2-Astra (OpenAI), through the Codex CLI, reviewed plans and code, and GPT-6.2-Sol generated the fictional couple portrait. Before the hackathon started at 09:00 IST on 25 Nov 2026 we produced research and notes only. All code was written after 09:00, as the commit history shows. We reviewed the code and can explain any part of it. Inside the product, Sarvam AI provides speech recognition, the language model, spoken replies and document reading.

---

## 7. The video

**Length:** target 2:40, hard maximum 2:45 (demo-script §4). Real screens of our deployment only. Not `brag` (skills-toolkit): HyperFrames makes only the title card, captions and end card around real footage.

**Structure** (demo-script §4.1; the shot list is demo-script §4.2, V01–V16):

| Clock | Beat |
|---|---|
| 0:00–0:07 | Cold open: Mira asks O-01, the app answers |
| 0:07–0:32 | Setup by voice: missing year asked, not guessed; refresh; invite turns maroon and gold (+4 s card read only if #11 is Working) |
| 0:32–0:35 | Title card: "Jump ahead: the same app with a populated fictional wedding" |
| 0:35–1:05 | Money: commitment, advance, correction, PAY-01 history |
| 1:05–1:40 | Manager edit, owner sees it, publish, Tara's RSVP, estimate beside contract |
| 1:40–1:55 | Spoken answer with source links; Tara's link refused on Money |
| 1:55–2:15 | Flagsmith: flagsmith §8.4's shots, captions and voice-over |
| 2:15–2:35 | NudgeBee: the real recorded run |
| 2:35–2:45 | End card: W/P/F summary, AI disclosure, repo URL |

**Caption and label rules.**
- **Persistent corner label** on every frame: "Jashn · all data fictional".
- Captions burned in, in English. Each Hindi line in Devanagari with an English translation.
- The portrait carries "Photo: AI-generated, fictional".
- **Synthetic data:** every frame of the Synthetic experiment page keeps its purple "Synthetic data" banner in view, captioned "Synthetic data: 800 scripted owners, planted 50% vs 60%. Tests the wiring, not the product." The Production page is captioned with the real n, "too small to call".
- **NudgeBee:** captioned "Recorded today, HH:MM, from this deployment · NudgeBee run <ID>" and "Deliberate fault · approval required". The run ID stays in frame.
- Fill every number slot (n, run ID, rollout steps) only from what the screen showed at recording time.
- The privacy shot is captioned "Guest link → Money: no access" (demo-script §4.1). Don't print a status code unless the screen shows it; a guest link gets 401 or the sign-in page, never 403 (D35).
- The setup segment uses a fresh `@example.com` owner on production, which the experiment excludes. There is no separate rehearsal environment (flagsmith §10.4).

**Recording times:** demo-script §5. Take 1 is recorded at once after the freeze smoke test and doubles as the first stopwatch rehearsal; any second run is take 2, after the 15:30 playback check (D50, D121). L has the sponsor clips in the HyperFrames shell by 14:40 (D50). The fallback is uploaded and its three sponsor beats checked signed out by 15:30, the last take starts by 15:45, and footage is locked at 16:00.
