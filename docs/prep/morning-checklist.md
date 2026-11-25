# Morning checklist (for you, not the agents)

Wed 25 Nov 2026. Coding starts at 09:00 at BIEC. The runbook to 10:45 is `build-kickoff.md`, then `PLAN.md` §2; this page is the short version.

Keys go into `.env.local` in a text editor. Never paste a key into a chat, the Claude session, a doc or a commit.

## Before you leave: accounts and keys, most important first

1. **Supabase** (our database, logins and file storage). Create a Free project in the Mumbai region. Paste these values into `.env.local`: the project URL, the anon key, the service-role key, the database password, the two connection links (port 6543 is `DATABASE_URL`, port 5432 is `DATABASE_URL_SESSION`), and an access token if you have time. With the token, the lead session turns "Confirm email" off for you; without it, turn it off yourself (Authentication → Providers → Email). If it isn't working by 09:30, we switch to a backup database.
2. **Teammate's registration.** The organisers must accept every team member. Check it is confirmed. Without it, they can't join the team. Also find out how check-in works.
3. **Flagsmith** (feature flags). Account, a project named "Jashn" with three environments (Development, Production, Synthetic), the warehouse (where Flagsmith stores experiment events) switched on in each, and the keys in `.env.local`. Create nothing else: no flags. The free plan has one seat, so only you can do its steps (09:38 tomorrow).
4. **Sarvam** (speech and Hindi). One API key into `.env.local` as `SARVAM_API_KEY`. Check the credit; a ₹300–500 top-up avoids running out mid-demo. Your teammate needs no Sarvam key: the lead session runs the tests.
5. **NudgeBee** (the ops tool). Account, plus a Kubernetes account named `jashn-kind`, marked Non-production. Keep its agent key in your password manager.
6. **Invite your teammate to NudgeBee,** if NudgeBee allows team invites. Then they do all the NudgeBee work, starting with its first checks (T1, T2, T4) at 09:10. If it doesn't, you do it: the checks at about 10:05, then building the NudgeBee workflow during the keynote (10:05–11:00), step by step from the notes.
7. **iPhone iOS version.** Settings → General → About. Write it down.
8. **Hindi speakers for the voice tests.** The tests want two fluent Hindi speakers, one of them from outside the team, on a separate phone or laptop. Think of who you could ask at the venue. Book them by 11:30.

Short on time? Do 1 and 2. Everything else has a later path in the runbook, but it costs you time after 09:00.

## Pack

- Laptop and its charger
- Phone and its cable
- Power bank
- Mobile data for a hotspot (backup Wi-Fi)
- ID and the registration QR for check-in
- Earphones

## Leaving the house

- Let any Claude session finish what it is doing. Leave none mid-task.
- Keep the lead session open and idle. It holds the 09:03 reminder; quitting it loses that.
- Close the lid only while travelling. Open it again as soon as you arrive.

## On arrival, and at 09:00

1. Sit near a power socket. Plug the charger in.
2. Join the venue Wi-Fi. Keep the phone hotspot ready.
3. Open the lid. Check the lead session answers.
4. Before 09:00: check your teammate is registered and invited to NudgeBee, that every account above signs in, and how check-in works.
5. **At 09:00 exactly,** open a plain Terminal window (not the session) and run step 0:
   `cd ~/Desktop/Personal/Jashn && git push --force-with-lease=main:ed7debc origin main`
   This swaps GitHub's first commit for the cleaned one. Only you can run it. Then give the merge permission (below).
6. About 09:05, once the lead session has put the notes up, go to check-in with your teammate. Open the real submission form there and note its fields and how it wants the video link. Be back by 09:10.

## The things only you can do, 09:00–10:00

| Time | What | About |
|---|---|---|
| 09:00 | Step 0 (above). Then type into the lead session: "Confirmed: merge each batch once CI is green and the checks pass, and report on Notion. I can stop any merge." | 2 min |
| 09:05 | Check-in and the submission form (above). | 5 min |
| 09:10 | Design direction: answer the lead session's questions and pick the look. Your pick is the approval. Nothing interrupts this. | 15 min |
| 09:27 | Any missing key first. Then, in `.env.local`: `SEED_PASSWORD`, a passphrase you choose for the demo logins (your teammate types it on a phone as Diya, so save it in your password manager), and your team's emails. "Confirm email" off, only if you didn't paste an access token and haven't done it (step 12). The lead session does the GitHub rule and the login test. | 3 min |
| 09:32 | Vercel: import the GitHub repo, set Node 24.x, add the Flagsmith Production client key (step 14). Phone bookmarks can wait. | 5 min |
| 09:38 | Flagsmith dashboard steps A–E, exact values in flagsmith.md 7.4 (step 17). Nothing interrupts this. Must finish by 10:30. | 20 min |

Words used above:
- "CI": the automatic checks GitHub runs on each change.
- "Batch": a group of changes merged together.
- "Node 24.x": the server software version Vercel must use.

## After 09:58

- 09:58–10:05: start the four lane sessions, one terminal tab each, with the prompts in `build-kickoff.md` section 5.
- 10:00: keynote. Keep the laptop open, on power and online.
- First, finish any Flagsmith steps A–E still open. 10:30 is the hard limit.
- Then, about 10:05, only if your teammate couldn't be invited to NudgeBee: run its checks T1, T2 and T4, then build the workflow until 11:00.
- About 10:25: listen to the voice samples the lead session saved and pick two voices (2 min, by 10:30).
- About 10:40: approve the AI-generated couple photo (2 min).
- 10:45: only if the design was marked "Proposed" because the pick was late, approve one screen (2 min).
- 10:50: Flagsmith step F1, the Synthetic experiment (about 3 min).
- 11:00, 11:10, 11:20: ask Flagsmith, NudgeBee and Sarvam the questions in `build-kickoff.md` section 4.
- By 11:10: paste `JOBS_API_TOKEN` into the NudgeBee Secret `jashn_ops_token`, from your password manager or copied from `.env.local` in an editor. Never send it through chat, Notion or a terminal.
- 11:15: switch `voice_writes_enabled` off in Flagsmith while Lane C checks it, then back on. If the lead session says Lane C's work split, do this right after the 11:40 deploy instead.
- By 11:30: book the two Hindi speakers and a separate device for their test.

## Later today, in short

- About 12:00 (12:45 at the latest): Flagsmith step F2, which launches the Production experiment.
- 12:15: test the screen capture with Bulbul's audio. If the card check fails, switch `card_renderer` to `og` in Flagsmith (no deploy needed). No smoke test yet.
- 12:30, 13:45 and 14:30: rollout steps 1, 2 and 3, each only when the lead session says the gate holds.
- About 12:35–12:55, after the 12:30 deploy: the two-device smoke test with your teammate.
- After 12:30: the kill-switch check with Lane C. Switch `voice_writes_enabled` off for a pending voice write, one typed save and a question, then back on.
- By 12:45: pick how the NudgeBee recording is made, with the lead session.
- Only if the lead session says the card reader (#11) has started (by 13:00 at the latest): Flagsmith step G, which creates `image_extraction_provider` (flagsmith.md 7.4).
- 13:00–13:30: record the NudgeBee clip with Lane D. This slot is protected.
- 14:30: screenshots of both experiment pages, Production and Synthetic, with the time and banner in view.
- 14:45–15:15: after the freeze smoke test, record the first video take at once, the safe one. It is also the first stopwatch rehearsal. Any second run is take 2, after 15:30.
- 15:30: check, signed out, that the README and the first video play and show all three sponsors.
- 16:35: submit and keep the receipt. 16:45 is the latest.
