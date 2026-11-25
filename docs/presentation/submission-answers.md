# Festive Hacks submission: draft answers

Draft by Lane E, 13:55 IST, 25 Nov 2026. The form is at https://www.wemakedevs.org/hackathons/festivehacks/submit (WeMakeDevs sign-in; one submission for the team; editable until 17:00).

**Before pasting:**
- Every **[CONFIRM AT FREEZE]** marks a claim that has to match what actually works after the 15:35 freeze (acceptance §7). Delete a sentence rather than claim something that didn't ship.
- Sources: presentation.md §1, §3 and §6, scope.md, flagsmith.md, export-and-recovery.md and demo-data.md. Nothing here goes beyond them.
- **The demo video must be under 2 minutes** (the form's rule). The current plan is 2:40–2:45; cut it to about 1:55.

---

## Part 1 of 3: project details

### Project title *
Jashn: a voice-first planner for Indian weddings

### Repository *
https://github.com/omiiii21/Jashn

### Demo video *
[unlisted YouTube link, under 2:00. Check that it plays signed out]

### Live demo or deployment
https://jashn-delta.vercel.app

### What did you build and how does it work? *

**The festive problem.** November to February is shaadi season. One Indian wedding is five functions (haldi, mehendi, sangeet, wedding, reception), around 250 guests, a dozen vendors and lakhs of rupees, coordinated across family calls, WhatsApp voice notes and spreadsheets, in English, Hindi and Hinglish. The people who know the details (parents, relatives, the event manager) say them out loud, and then everyone remembers the numbers differently. "Caterer ko ab kitna dena hai?" is the question every family ends up asking.

**What Jashn does.** Jashn keeps a wedding's plans, people and payments together, and you run it by voice. You press the mic and speak in English, Hindi or Hinglish. Jashn shows what it understood as a review card: the words it heard, the record it will change, and the effect on totals. Only after you confirm does it save, through the same server functions as the forms. "Caterer ko chaalis hazaar advance diya tha" corrects the existing ₹50,000 advance to ₹40,000. It edits that same payment and keeps both versions in its history, so the outstanding amount moves by exactly ₹10,000 and no duplicate payment appears. Questions like "kitna baaki hai?" are answered from the saved records and spoken back.

**What's in it** [CONFIRM AT FREEZE: keep only the modules that work]:
- Voice setup: speak the names, date, budget and guest count. Jashn asks for anything missing, such as the year, and never invents it.
- Events and itinerary for all five functions. Edits stay in draft until the owner publishes them, and timing conflicts are flagged.
- Guests and RSVP: a private link per household. A guest sees only the functions they're invited to, and a tap from their phone is counted exactly once.
- A money ledger that keeps planned, committed, paid and outstanding separate. Vendors and catering show the RSVP-based estimate (230 × ₹800) beside the signed ₹2,00,000 contract, and an estimate never silently rewrites a contract.
- A maroon-and-gold invitation, a published guest site and an exported invitation card.
- Owner and event-manager collaboration with two real logins. The manager's changes show up for the owner with who changed what and when, and a manager's spending change becomes a proposal the owner approves.
- Privacy by role, enforced on the server: guest links can never see money, vendors or other guests.

**How it works.** One Next.js 16 app on Vercel (Mumbai) with Supabase Postgres, Auth and Storage. Every read and write goes through one server guard, and the browser never talks to the database. A voice turn goes: push-to-talk clip → Sarvam Saaras speech-to-text (codemix) → `sarvam-105b`, which may only call one tool, `propose_actions` → our code re-reads every number from the words heard and checks every field against the saved wedding → review card → confirm → the same command dispatcher the forms use → Sarvam Bulbul speaks the reply. The model only proposes. It never computes amounts and never writes. Flagsmith controls who gets voice and can switch voice writes off without a redeploy. NudgeBee recovers failed invitation-card exports behind a human approval. All people, venues and amounts in the demo are fictional.

**AI assistance.** We used AI assistants, as the rules allow. Claude Code with Claude Opus 5.5 wrote the application code under our direction: we set the scope, made the product, design and architecture decisions, and reviewed every merge. Claude Fable 5.2 reviewed our plans and code at checkpoints. GPT-6.2-Sol and GPT-6.2-Astra (OpenAI), through the Codex CLI, reviewed plans and code, and GPT-6.2-Sol generated the fictional couple portrait. The UI design system was explored on a Doop design canvas with Claude. Before the hackathon started at 09:00 IST we produced research and notes only; all code was written after 09:00, as the commit history shows. We reviewed the code and can explain any part of it. [CONFIRM AT FREEZE: match presentation.md §6 and the README word for word]

---

## Part 2 of 3: sponsor tools

### How have you used Flagsmith and what problem does it solve? *

Voice that writes money is risky to ship to everyone at once, and we wanted evidence on whether voice-first setup actually helps. Flagsmith is evaluated on our server only (Node SDK, never in the browser) and does three real jobs:

1. **An experiment, `setup_entry`:** a 50/50 split of new owners between voice-first and form-first wedding setup, with exposure and "wedding saved" events sent to Flagsmith's warehouse analytics. The Production experiment has real but small counts, so we don't claim a winner. A separate, bannered **Synthetic** environment with 800 scripted owners and a disclosed planted effect shows that the experiment wiring works end to end. [CONFIRM AT FREEZE]
2. **A staged rollout, `voice_pilot`:** voice is turned on for segments in steps (internal team first, then a percentage of owners), with no redeploy.
3. **A kill switch, `voice_writes_enabled`:** it's checked on every voice write. If voice starts mishearing amounts, one switch makes the server refuse voice writes. Voice questions still work and typed edits still save. In the demo we flip it live.

Users are identified to Flagsmith by an opaque HMAC identity and a few traits, never personal data. Without Flagsmith we'd have no experiment, no staged rollout, and no way to stop voice writes short of a redeploy.

### How have you used NudgeBee and what problem does it solve? *

Guests receive an exported invitation card (rendered with headless Chromium), and exports can fail: timeouts, a crashed render, a bad asset. A failed card means a guest gets an outdated venue, but blindly retrying could publish twice. We built an approval-gated recovery workflow in NudgeBee's Workflow Builder:

1. When an export job fails, Jashn sends a webhook to NudgeBee with only the job id.
2. NudgeBee reads the job's status from our ops API over HTTPS, with its token kept in NudgeBee Secrets.
3. It waits for a human approval that states exactly what will and won't change: one re-rendered card, no publish, no ledger change.
4. It calls our export-only retry endpoint with an Idempotency-Key, then reads the job again to verify the card.
5. It re-sends the same retry to prove a replay changes nothing: one card per published revision, no duplicates.

For the demo we deliberately inject one export failure with a Flagsmith flag scoped to the sample wedding. The fault is labelled as deliberate, and the recovery is real. [CONFIRM AT FREEZE: say whether the demo shows a recording of a real run (with the run id) or a live run, and whether a kind cluster agent was needed]

### How have you used Sarvam and what problem does it solve? *

Indian families plan weddings in Hinglish, with numbers like "chaalis hazaar", "dedh lakh" and "baarah lakh". Sarvam is the whole voice loop:

- **Saaras v4 speech-to-text in codemix mode** turns a push-to-talk clip into a transcript that keeps English words in Latin and Hindi in Devanagari, with numbers as digits.
- **`sarvam-105b`** turns the transcript plus a role-filtered snapshot of the wedding (no phone numbers, emails or tokens) into one proposed action through a single forced tool, `propose_actions`. It proposes, and our code checks and saves.
- **Bulbul text-to-speech** speaks the reply, in Hindi or English, built from the saved record after the commit.

We tested a 47-line set of English, Hindi and Hinglish utterances, including spoken amounts, and the live demo lines had to pass repeatedly. When the model mishears, the review card shows the heard words beside the rupee amount so the owner can fix it before anything is saved. Audio is never stored by us. [CONFIRM AT FREEZE: add Sarvam Document AI only if Should #11, reading a printed invitation, shipped]

---

## Part 3 of 3: feedback

These are a starting point from our research notes. **Edit them to what you actually experienced today.**

### What did you like about Flagsmith, and what would you improve? *

Liked: server-side evaluation in the Node SDK was simple, and segments, percentage rollouts and identity overrides let us run a real experiment, a staged rollout and a kill switch from one dashboard with no redeploys. Having separate environments (Development, Production, Synthetic) made it easy to keep real and scripted traffic apart.

Would improve: warehouse analytics take a while to start producing results after you enable them, which is hard on a one-day hackathon. Some guidance in the dashboard on minimum sample sizes, and a way to mark an environment as "synthetic" in the experiment views, would help teams avoid over-claiming early results.

### What did you like about NudgeBee, and what would you improve? *

Liked: the Workflow Builder's HTTP tasks, approvals and Secrets let us build a careful, human-approved recovery runbook for a plain web app, not just Kubernetes workloads. The approval step makes it clear who approved what.

Would improve: it wasn't clear at first whether an account with no connected Kubernetes agent can run HTTP and approval workflows. Clearer docs and a "web app / HTTP-only" quick start would help teams who don't run a cluster. Approvals in more chat tools than Slack, Teams and Google Chat would help too. [EDIT to what actually happened today]

### What did you like about Sarvam, and what would you improve? *

Liked: codemix speech-to-text handles Hinglish naturally, keeping English and Hindi words in their own scripts, which matters for Indian users. Having speech-to-text, an LLM with tool calling and text-to-speech under one API kept our voice loop simple.

Would improve: the docs disagree on whether rate limits apply per API key or per account. Loanwords sometimes come back in Devanagari (for example "बुक") even in codemix mode. A 30-second cap on REST speech-to-text means longer voice notes need the streaming API. [EDIT to what actually happened today]

### Paste your social posts links here *

[LinkedIn and/or X post URLs. Draft below. Check each sponsor's handle before posting]

> Spent today at Festive Hacks at WeAreDevelopers Conference India building Jashn: a voice-first planner for Indian weddings. 🪔
>
> Say "Caterer ko chaalis hazaar advance diya tha" and Jashn corrects that payment, keeps its history, and tells you what's still owed, in Hindi or English.
>
> 🎙 @Sarvam AI hears the Hinglish, proposes the change and speaks the answer
> 🚩 @Flagsmith runs a voice-first vs form-first experiment, a staged rollout and a kill switch for voice writes
> 🐝 @NudgeBee recovers failed invitation-card exports with a human approval
>
> Thanks @WeMakeDevs for a great day. Repo: https://github.com/omiiii21/Jashn
>
> #FestiveHacks #WeAreDevelopers
