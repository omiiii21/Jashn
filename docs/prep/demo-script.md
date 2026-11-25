# Jashn demo script: live demo, video, recording plan and judge Q&A

Prep note written at about 03:00 IST on 25 Nov 2026 and updated at about 06:15 to decisions D1–D122, before coding starts. `decisions.md` wins over this file. Every name and number comes from `demo-data.md`, and every spoken line comes from the live list in `voice-test-set.md`. If the build changes, update those two files first, then this one.

**What is live and what is recorded:**

- **Live:** every Sarvam voice turn, Diya's separate session, the publish, Tara's RSVP, the Flagsmith flag flip and the server's refusal, and the real experiment counts on Flagsmith's own Production experiment page. Its Synthetic experiment page is shown beside them and always named as synthetic.
- **Recorded:** the NudgeBee recovery. It is a labelled clip of the real run, recorded earlier in the day, with the run ID visible.
- **Upgrade:** if NudgeBee's run completes live in under 15 s in rehearsal, the lead session may pick live mode at 14:30; approve it live and say so. The default is the recording, with the drill off (D40).

Say "fictional" once at the start. A "Fictional demo data" badge stays on every screen.

## 1. Stage setup

### 1.1 Devices and who holds them

| Device | Holder | Signed in as | Shows |
|---|---|---|---|
| Laptop, projected over HDMI | **Lead** | **Mira** (owner), in Chrome profile "Mira" | The app in the left two-thirds, the phone mirror in the right third, the Flagsmith tabs (Features, the Production experiment and the Synthetic experiment; flagsmith 8.2), and the NudgeBee clip in a local player. Wired or USB headset mic for push-to-talk. |
| Phone | **Teammate** | Chrome: **Diya** (manager). Safari private tab: **Tara's** household link. | Mirrored into a laptop window (iPhone: macOS iPhone Mirroring or a QuickTime movie recording over USB; Android: scrcpy, installed after 09:00) |
| Second phone | Teammate's pocket | – | Hotspot, as the backup network |

**Solo fallback:** the lead runs the phone on a stand beside the laptop, and Diya's move becomes a tap edit instead of voice.

Hold push-to-talk **only** while speaking to the app. Narration to the judges is in English, and the mic must not hear it.

### 1.2 Ten-minute pre-flight (before every run)

1. The lead session runs `reset_demo` to **D0** through the command route (there is no reset button; D17). Check the overview: caterer ₹2,00,000 / ₹50,000 / **₹1,50,000**; reception **229/250**; Banyan Hall published; 5 activity items; mehendi conflict warning showing.
2. Flagsmith Production: `voice_writes_enabled` on and `spoken_replies` on. In recorded mode (the default), `export_failure_drill` is **disabled, with an empty value**. `card_renderer` is as decided at 12:15.
3. Flag health: `/api/health` on production shows `flags.ok` true, `env_label` `production` and `fallback_flags` empty. In Jashn as Mira, the flags drawer shows no flag marked "fallback", the chip reads "Voice · team preview", Health is green, and "Sent by Jashn" shows today's counts with a recent as-of time (flagsmith 8.3).
4. Laptop tabs in Mira's Chrome, in this order (flagsmith 8.2):
   1. the app on Money → Annapoorna Caterers;
   2. Flagsmith Production › Features, with `voice_writes_enabled` in view;
   3. Flagsmith Production › Experiments › "Setup entry: voice-first vs form-first (real new owners)";
   4. Flagsmith Synthetic › Experiments › "SYNTHETIC DATA: setup entry, 800 scripted owners, planted 50% vs 60%";
   5. in the background, the Reception "Add requirement" form with "Jain food" typed, ready for beat #8.

   Tabs 3 and 4 were reloaded within the last 10 minutes, each with its banner in view. The 14:30 screenshots of both experiment pages, with timestamps and banners, are to hand.
5. NudgeBee, recorded mode: the V15 clip is paused at 0:00 in a local player, with the run ID in its caption, and the NudgeBee console tab is open on the real run, as a backup.
6. NudgeBee, only if the lead chose the live upgrade at 14:30: the drill is **enabled with the demo copy's wedding id** as its value; the NudgeBee Executions tab is open; the warm-up ran 5 minutes before; and if export-and-recovery 6.8 was needed, the agent shows Connected.
7. Phone: Chrome (Diya) open on the Reception event; Safari private tab (Tara) open on her link. Brightness up, Do Not Disturb on, auto-lock off, charger in.
8. Mic check with one test question, volume up, and laptop audio routed to the room speakers.

## 2. The three-minute live demo

| Clock | Who · device | Spoken to the app (exact) | What judges see | Narration (lead, to the judges) |
|---|---|---|---|---|
| **0:00–0:12** Hook | Lead · laptop | – | Money → Annapoorna Caterers: Committed **₹2,00,000** · Paid **₹50,000** · Still owed **₹1,50,000** (the on-screen label; narration may say "outstanding"). The "Fictional demo data" badge. | "This is Jashn, a voice-first wedding planner. Mira and Kabir are fictional; the problem isn't: 250 invitations, twelve lakh, and a caterer advance the family remembers differently." |
| **0:12–0:22** Ask | Mira · laptop headset | **#1** "Caterer ko ab kitna dena hai?" | The transcript with a language chip, then an answer card linked to the caterer. The app says "एक लाख पचास हज़ार रुपये बाकी हैं।" | (Let it play.) "That answer comes from the saved ledger." |
| **0:22–0:50** Correct | Mira · laptop | **#2** "Caterer ko chaalis hazaar advance diya tha." Then **#3** "Haan, save karo." | Preview: "**Correction, not a new payment** · PAY-01 · ₹50,000 → ₹40,000 · heard 'chaalis hazaar'" (the heard words may show as digits, "heard '40000'", when Saaras writes digits; voice 3.1). After confirming, the balance goes from ₹1,50,000 to **₹1,60,000** and the app says "एक लाख साठ हज़ार रुपये बाकी हैं।" The lead opens PAY-01's history: version 1 ₹50,000 (20 Nov, typed), version 2 ₹40,000 (today, voice, with transcript). | "Her mother says it was forty thousand. Jashn doesn't add a second payment; it corrects the one we have." After saving: "One payment, two versions, nothing lost. The total moved by exactly ten thousand." |
| **0:50–1:02** Manager | **Diya** · phone (teammate) | **#4** "Reception Lotus Hall mein shift kar do." | The phone mirror shows Diya's preview, Banyan Hall → Lotus Hall. She taps **Save draft**. | "Diya, the event manager, is on her own phone with her own login. Banyan Hall seats 220 and 229 have said yes, so she moves the reception." |
| **1:02–1:12** Owner sees it | Mira · laptop | **#5** "Diya ne kya badla?" | The activity feed shows "**Diya moved the reception from Banyan Hall to Lotus Hall** · draft · just now". The app reads the change aloud. | "Mira sees who changed what, from the saved record." |
| **1:12–1:18** Guests unchanged | Teammate · phone → Safari (Tara) | – | Tara's invitation still shows the reception at **Banyan Hall** | "Guests still see Banyan Hall. Nothing reaches them until the owner publishes." |
| **1:18–1:25** Publish | Mira · laptop | **#6** "Schedule publish kar do." | Review sheet: "Publish revision 3 · 1 change: Reception venue". Mira taps **Publish**. | "Publishing always needs the owner's confirmation." |
| **1:25–1:50** RSVP | **Tara** · phone (teammate) | – (she taps) | Tara refreshes and sees **Lotus Hall** (her page also updates by itself within 12 s: one 10 s poll plus the refresh; D92), then taps **Attending** for the reception. On the laptop, reception attending goes **229 → 230**. The catering panel reads "Estimate from confirmed guests **₹1,84,000**" beside "Signed contract **₹2,00,000** · fixed, 250 covers". | "Tara sees Lotus Hall and taps Attending. Two hundred and thirty. Confirmed-guest estimate: one lakh eighty-four thousand. Signed contract: two lakh. An estimate never silently rewrites a contract." |
| **1:50–2:10** Ask again | Mira · laptop | **#7** "Reception ka venue kya hai, aur caterer ka kitna baaki hai?" | The app says "Reception: Lotus Hall. एक लाख साठ हज़ार रुपये बाकी हैं।" The lead clicks the two source links (the reception event and PAY-01). | "Both answers come from the records you just watched change. Sarvam Saaras hears the Hinglish, Sarvam's model proposes the action, and Bulbul speaks the answer." |
| **2:10–2:30** Flagsmith (≤20 s, live) | Lead · laptop | **#8** "Reception mein barah logon ke liye Jain khana add karo." | 2:10–2:15: tab 3 (Cmd+3), then tab 4 (Cmd+4 at about 2:12). Flagsmith's Production experiment page, under its red "PRODUCTION · real users" banner, shows voice-first vs form-first with **today's real exposures and saves per arm, and "Collecting data"**. Then Flagsmith's Synthetic experiment page, under its purple "Synthetic data" banner, shows the result for the 800 scripted owners. 2:15–2:18: tab 2 (Cmd+2), the lead switches `voice_writes_enabled` **off**. 2:18–2:25: tab 1 (Cmd+1) regains focus and shows "Questions only"; #8 is **refused** by the server and the app says "Abhi voice se badlav band hain. Aap type karke save kar sakte hain." (D93) The Reception's add-requirement form opens with the heard values, marked to check. 2:25–2:30: the lead clears the quantity, types "12" and taps Save. It saves. | Three sentences, around the actions (flagsmith 8.2). (2:10–2:15) "Flagsmith runs our voice-first versus form-first setup test: real counts, too small to call, beside a labelled synthetic run." (2:15–2:18) "Now suppose voice mishears amounts: one switch, and the server refuses voice writes." (2:25–2:30) "Questions still work; typing still saves." |
| **2:30–2:50** NudgeBee (≤20 s, **recorded**) | Lead · laptop | – | A 15 s clip captioned "**Recorded today, HH:MM, from this deployment · NudgeBee run <ID>**", with the real recording time (13:00–13:30, or the 14:00–14:30 retake; D33): export JOB-EXP-R3-PNG failed → NudgeBee reads the job status → **waits for approval** → approved → export-only retry → completed → `card-rev3.png`. Then 2 s of the downloaded card showing **Lotus Hall**. If the 12:45 path was "only the retry is broken" (D43), the clip shows NudgeBee reading the failed job, the user retrying in Jashn, then NudgeBee reading the completion, and the caption names who retried; say "I retried it in Jashn" in place of "called our export-only retry". | "We deliberately failed this card export once. NudgeBee read the job, waited for my approval, called our export-only retry and checked the result: one card, no duplicate publish, no ledger change. This is a recording of the real run; the ID is on screen." |
| **2:50–3:00** Close | Lead · laptop | – | The overview, with every updated number | "Tara has the right hall, and Mira knows exactly what she owes. Sarvam listens and speaks, Flagsmith controls voice, NudgeBee recovers failures." |

**Immediately after the run:** switch `voice_writes_enabled` back **on**. In live NudgeBee mode, also disable the drill and clear its value. Log both times for the README. Then the lead session runs `reset_demo` to D0 through the command route for the next judge (D17). Never replay the recorded NudgeBee run after a reset: its job is gone, and `read_status` answers 404 (export-and-recovery 7.5).

**If you are running behind:** at 1:50, drop the narration in beat 1:50–2:10 and let the app answer. At 2:10, skip tabs 3 and 4, say sentence 1 anyway (it names the synthetic run), and do only the flip and the refusal.

## 3. Fallbacks per beat

| Beat | Likely failure | Fallback (say it plainly; never fake a number) |
|---|---|---|
| Hook | The projector fails | Turn the laptop toward the judges and carry on. |
| #1 Ask | Speech or model slower than 8 s, or the answer is wrong | Point at ₹1,50,000 on screen and move on to #2. |
| #2 Correct | Amount misheard | Tap the amount on the preview, type 40,000 (the same correction path) and confirm. |
| #2 Correct | Sarvam is unreachable | Do the same correction through the payment form, and say "Sarvam timed out; here is the same correction by typing". Optionally play the 8 s rehearsal clip of the voice correction, labelled "recorded". |
| #3 Confirm | "Haan, save karo" not recognised | Tap **Confirm**. |
| #4 Manager | Phone mic fails in the noise | Diya taps Reception → Venue → Lotus Hall → Save draft. |
| #5 Owner sees it | The activity item hasn't appeared after 5 s (the planner screen polls every 2.5 s; there is no Realtime) | Refresh the laptop. The record is saved, and the poll is only a convenience. If the question is slow, read the activity item aloud. After two slow rehearsals, a manual refresh at 1:02 joins the script (architecture §8 row 12). |
| #6 Publish | Voice fails | Click **Review & publish**, then **Publish**. |
| RSVP | Phone network drops | Switch the phone to the hotspot. If it still fails, open Tara's link in a laptop private window and tap Attending there. |
| RSVP | The count still says 229 after a refresh | Say so. Open Tara's guest record to show her RSVP row, and don't claim 230. |
| #7 Ask again | Bulbul fails | The reply text is on screen; read it aloud. `spoken_replies` can mute speech. |
| Flagsmith | The flip took more than 3 s in rehearsal (FV6) | Flip first (Cmd+2 at 2:10), then show tabs 3 and 4 (2:13–2:18) while the change spreads, then Cmd+1 and speak #8. |
| Flagsmith | The "Questions only" chip hasn't appeared when the Jashn tab regains focus | Speak #8 anyway. The turn reads the switch afresh, and the refused turn's response turns the chip on. |
| Flagsmith | The flip doesn't take effect on stage | Show the server's flag-evaluation log line, or play the 10 s rehearsal clip of the refusal, labelled "recorded". Restore the flag either way. |
| Flagsmith | An experiment page is slow, or the dashboard has signed out | Show that page's 14:30 screenshot with its timestamp and banner, labelled "screenshot, 14:30". |
| Flagsmith | Flagsmith unreachable (pre-flight: `flags.ok` false, or "fallback" in the drawer) | Voice writes are off (fail closed). Do the voice beats by typing, as in the rows above, and say "Flagsmith is unreachable, so voice is in safe mode." Show the experiment from the 14:30 screenshots. |
| Flagsmith | The prefilled Jain-food form doesn't open | Use tab 5. |
| NudgeBee | The clip won't play | Show three screenshots (failed, awaiting approval, completed) and the run ID in the NudgeBee console. |
| Anything | Total outage | Play the local MP4 of the submission video from the matching timestamp, and say that it is the recording. |

## 4. Submission video (target 2:40, hard maximum 2:45)

Show only real screens of our deployment. Captions are burned in, in English. Each Hindi line appears in Devanagari with an English translation. A persistent corner label reads "Jashn · all data fictional".

### 4.1 Beats

| Clock | Beat | What is on screen | Voice-over (the lead's own voice) | Captions |
|---|---|---|---|---|
| 0:00–0:07 | Cold open | The Money card; Mira asks O-01 and the app answers | None; let the app speak | "Caterer ko ab kitna dena hai?" (How much do we still owe the caterer?) · "एक लाख पचास हज़ार रुपये बाकी हैं।" (₹1,50,000 is still due.) |
| 0:07–0:32 | Setup by voice | S-01 spoken; review card with the year empty; Jashn asks; S-02; saved; a page refresh shows it persisted; I-01 turns the invite maroon and gold with the AI-generated fictional portrait | "Setup starts with one sentence. Jashn fills what it heard, asks for the year instead of guessing, and the wedding survives a refresh. One more line styles the invitation." | "Year not given → asked, not guessed" · "Photo: AI-generated, fictional" |
| (+4 s, only if it is Working) | Reading a printed card | I-03: upload `arora-printer-proof.jpg`; the draft shows "Year: not printed" | "It reads an existing printed card too, and flags what isn't printed." | "Sarvam Document AI · Year: not printed". Take these 4 s out of the setup beat. |
| 0:32–0:35 | Cut card | Ivory-and-maroon title card | – | "Jump ahead: the same app with a populated fictional wedding" |
| 0:35–1:05 | Money | M-01 creates ₹2,00,000 and ₹50,000, leaving ₹1,50,000; M-03 shows "Correction, not a new payment"; C-01 leaves ₹1,60,000; then PAY-01's history | "The caterer charges eight hundred a plate for 250. The advance was recorded as fifty thousand, but it was forty. Jashn corrects the same payment, keeps the history, and the balance moves exactly once." | "₹800 × 250 = ₹2,00,000" · "1 payment · 2 versions" · "एक लाख साठ हज़ार रुपये बाकी हैं।" (₹1,60,000 is still due.) |
| 1:05–1:40 | Manager, publish, RSVP | Phone: Diya's E-04. Laptop: the attributed activity item. Phone: Tara still sees Banyan Hall. Laptop: Mira publishes. Phone: Tara sees Lotus Hall and taps Attending. Laptop: 229 → 230, estimate ₹1,84,000 beside the ₹2,00,000 contract | "Diya, the event manager, moves the reception on her own phone. Mira sees who changed what. Guests see nothing until she publishes. Then Tara accepts: 230 confirmed, a labelled estimate of ₹1,84,000, and the ₹2,00,000 contract untouched." | "Two signed-in sessions" · "Draft vs published" · "Estimate, not the contract" |
| 1:40–1:55 | Spoken answer and privacy | O-03 with its source links; then Tara's link tries the Money page and gets "Not available" | "Ask again and the answer comes from those same records. And Tara's link can't read money; the server enforces it." | "Reception: Lotus Hall. ₹1,60,000 still due." · "Guest link → Money: no access" |
| 1:55–2:15 | Flagsmith | V13: Flagsmith's Production experiment page (red banner, "Collecting data"), then its Synthetic experiment page (purple banner, kept in view in every frame), then `voice_writes_enabled` switched off. V14: R-03 refused with the "Questions only" chip and the reply; the typed save; the flag restored straight after | "Flagsmith splits new owners between voice-first and form-first setup. Today's real counts are too small to call; a clearly labelled synthetic run proves the wiring. Voice reached people in steps, and one switch makes the server refuse voice writes, while typing keeps working." (flagsmith 8.4) | 0–3 s: "setup_entry: voice_first vs form_first · real users · n = <real count> · too small to call" · 3–6 s: "Synthetic data: 800 scripted owners, planted 50% vs 60%. Tests the wiring, not the product." · 6–8 s: "voice_pilot rolled out 10 → 50 → 100% · voice_writes_enabled → off" · 8–15 s: the R-03 line in Devanagari with an English translation · 15–20 s: "Typing still saves" |
| 2:15–2:35 | NudgeBee | The failed export JOB-EXP-R3-PNG (deliberate fault); the NudgeBee run paused at the approval step; approved; retry; completed; the card showing Lotus Hall | "We failed one card export on purpose. NudgeBee reads the job, waits for a human approval, calls our export-only retry, and verifies one card, with no duplicate publish and no ledger change." | "Deliberate fault · NudgeBee run <ID> · approval required" |
| 2:35–2:45 | End card | The Working/Partial/Future summary, the AI disclosure and the repo URL | "Jashn: plans, people and payments together. Built today with AI coding assistance, disclosed in the README." | The disclosure text below, and the repo URL |

Trim pauses in the edit to land on 2:40. **Never go past 2:45.**

### 4.2 Shot list

| Shot | Source | Length | Content | Note |
|---|---|---|---|---|
| V01 | Laptop screen capture, 1080p 30 fps, with system audio | 7 s | Money card and O-01 | Check at 12:15 that Bulbul's audio is captured. If it isn't, caption the reply instead. |
| V02 | Laptop | 25 s | Setup T0 → T1, a refresh, I-01 | Use a fresh internal (`@example.com`) test owner **on production**, whom the experiment excludes (flagsmith 1.2), so the real counts stay honest. There is no separate rehearsal environment. I-01 by voice is Lane C's 13:45 item; if it missed, AT-7.1's voice half is Partial in the README, so don't show it as Working (D121) |
| V02b | Laptop | (4 s) | I-03 card read | Only if it is Working |
| V03 | Title card | 3 s | "Jump ahead…" | Ivory `#F7EFDF`, maroon `#6A1224` (design-direction tokens) |
| V04 | Laptop | 30 s | M-01 from S0, M-03, C-01, history | |
| V05 | Phone screen recording | 10 s | Diya's E-04 | Clap once at the start so phone and laptop clips can be synced |
| V06 | Laptop | 5 s | The activity item appears | |
| V07 | Phone | 5 s | Tara's link still shows Banyan Hall | |
| V08 | Laptop | 4 s | Review & publish | |
| V09 | Phone | 5 s | Tara sees Lotus Hall and taps Attending | |
| V10 | Laptop | 6 s | 229 → 230, the estimate beside the contract | Zoom in on the numbers in the edit |
| V11 | Laptop | 10 s | O-03 and its source links | |
| V12 | Phone | 5 s | Tara's link → Money → "Not available" | |
| V13 | Flagsmith dashboard | 8 s | The Production experiment page (0–3 s), then the Synthetic experiment page (3–6 s), then the flip (6–8 s), with 4.1's captions | Fill `<real count>` only from what Flagsmith shows at recording time. Write the rollout caption from the README log; if step 3 hasn't happened, it says "10 → 50%". The Synthetic banner stays in every frame (flagsmith 8.4) |
| V14 | Laptop | 12 s | R-03 refused, then the typed save | Restore the flag straight after |
| V15 | NudgeBee console and the app's job page | 20 s | The real run: failed → awaiting approval → approved → completed | Recorded 13:00–13:30, after one full drill that passed; retake 14:00–14:30 only if needed (D33, D43). Keep the run ID in frame |
| V16 | End card | 10 s | W/P/F, disclosure, repo | |

### 4.3 AI-assistance disclosure (end card and README; correct it to what was actually used)

Use the canonical text in `presentation.md` §6, word for word, corrected to what was actually used (D31). It names Claude Code with Claude Opus 5.5; Claude Fable 5.2; and GPT-6.2-Sol and GPT-6.2-Astra (OpenAI) through the Codex CLI. The end card adds one line: "All people, phone numbers and amounts in the demo are fictional." AI tools are named only here, in the README and on the submission form, never in commits, PR titles, PR bodies or branch names.

### 4.4 Working / Partial / Future list (for the end card and README)

Fill in the status column at the **14:45 freeze**. Mark an item **Working** only after a person has exercised it on both the laptop and the phone. Otherwise mark it **Partial**, saying exactly what works, or **Future**. Keep broken controls out of the main flow.

| Item | Priority | Status at 14:45 |
|---|---|---|
| Voice setup: speak, missing-year prompt, review, save, reopen | MUST | |
| Voice actions and spoken answers (the 8 live lines) | MUST | |
| Events and itinerary, draft vs published, conflict warning | MUST | |
| Guests and RSVP through private links, counted once | MUST | |
| Money ledger: planned/committed/paid/outstanding, corrections with history | MUST | |
| Vendors and catering: estimate beside the fixed contract | MUST | |
| Invitation studio, wedding website, exported card | MUST | |
| Owner + manager collaboration and activity feed | MUST | |
| Server-enforced privacy by role | MUST | |
| Overview dashboard | SHOULD | |
| Reading an existing invitation image into a reviewable draft | SHOULD | |
| Light requirements by voice (such as Jain food for 12) | SHOULD | |
| Shagun register and thank-you list | SHOULD | |
| Sarvam: STT, LLM, TTS, Document AI | Sponsor | |
| Flagsmith: experiment, voice rollout, kill switch for voice writes | Sponsor | |
| NudgeBee: failed-export recovery with approval and a safe retry | Sponsor | |
| The full décor, menu and music workspace; receipt attachments; task boards; live guest location; real payments; WhatsApp reminders; seating | Future scope, `scope.md` word for word (D36) | **Future** |
| Later ideas: continuous voice, more languages, hall-level tracking | Later ideas, not in scope (D36) | **Future** |

## 5. Recording plan

| IST | Action |
|---|---|
| 12:15 | Test the screen and audio capture, including system audio for Bulbul. No smoke test yet: it needs the 12:30 batch (D111). |
| 12:35–12:55 | After the 12:30 deploy: the two-device smoke test and the first full end-to-end run on the deployment (acceptance §2, D111). The 12:45 voice test-set run may overlap it, with the booked speakers on a separate device (D49). |
| by 12:45 | The lead session and the user choose the NudgeBee recording path (D43): webhook broken, start the workflow manually; only the retry broken, record NudgeBee reading the failed job, the user retrying in Jashn, then NudgeBee reading the completion. |
| 13:00–13:30 | **Protected.** Record the NudgeBee run (V15) after one full drill that passed, and write down its run ID and time. Retake 14:00–14:30 only if needed (D33). |
| 13:30–13:45 | Record a 10 s Flagsmith refusal clip and an 8 s voice-correction clip as live-demo fallbacks. Bank one real Sarvam correction with audible playback as soon as one succeeds (D49). |
| 14:30 | Screenshots of both Flagsmith experiment pages, Production and Synthetic, each with a visible timestamp and its banner in frame. |
| by 14:40 | The lead session has the sponsor clips in the HyperFrames shell, with audio, labels and the run ID checked (D50). |
| **14:45** | **Feature freeze.** Fill in the Working/Partial/Future list. |
| 14:45–15:15 | The freeze smoke test. Then **take 1** at once, the submission-safe take; it doubles as the first stopwatch rehearsal. Any second run is take 2, after the 15:30 playback check (D50, D121). |
| 15:15–15:30 | Upload the fallback (unlisted). By 15:30, check signed out that all three sponsor beats play, before any further take (D50). |
| 15:30–16:00 | 15:30: the user checks the signed-out README and video (D74). Then final takes, at most three. **The last take must start by 15:45**, and all footage is locked by **16:00**. |
| 16:00–16:10 | The lead session merges the final README (D74). Edit: cuts, captions, labels and end card. Export MP4 (H.264, 1080p) and keep the local copy. |
| **16:10** | **Trigger:** if the edit isn't exported, stop editing and upload an ffmpeg concat of the raw takes, or keep take 1 (D32). |
| 16:10–16:20 | Upload, then check playback signed out on the phone. |
| **16:20** | **Trigger:** if the final video does not play signed out, submit the 15:30 fallback (D32). |
| 16:20–16:30 | The teammate (otherwise the user) opens every link in a private window: repo, README, video, live app, guest site (D74). |
| 16:35 | Submit the public repo, the README (setup steps, AI disclosure, W/P/F table) and the video link, and keep the receipt. **16:45** is the latest. |
| 16:35–17:00 | **25-minute buffer.** The lead session runs `reset_demo` to D0 through the command route (D17); restore the flags and charge both devices for judging at 17:00. |

The latest safe recording time is **15:45**, for the start of the last take. The buffer is the fallback video, uploaded by 15:30, plus 25 minutes between submitting at 16:35 and the 17:00 deadline. Record the setup segment with a fresh internal (`@example.com`) test owner on production, whom the experiment excludes, so that Flagsmith's real counts are not inflated. There is no rehearsal environment; Flagsmith has only Development, Production and Synthetic (flagsmith 1.1).

## 6. The 10 likeliest judge questions

These answers assume the plan held. At the 14:45 freeze, replace anything that did not.

1. **"Is that really live Sarvam, or a canned transcript?"** It's live: our server sends the push-to-talk audio to Sarvam's Saaras speech-to-text in codemix mode, Sarvam's chat model turns the transcript into a structured action, and Bulbul speaks a reply built from the saved record. Say any line, ours or your own, and you'll see the transcript, the preview and the saved record change. Then open the judge panel (voice.md section 8) on the turn just spoken, to show its stages and timings.
2. **"What stops the model from inventing amounts, dates or names?"** The model only proposes, while code checks every field against the saved wedding, resolves the IDs, does all the arithmetic, and writes through the same functions as the forms after the owner confirms. Anything missing stays empty and is asked for, like the year at setup or the reception time the printed card never mentions.
3. **"What if the correction is sent twice, or the network retries?"** A correction targets one identified payment with an idempotency key, in one transaction that keeps the old value as history. A replay returns the saved result instead of writing again, so the caterer still has one payment and the totals move exactly once.
4. **"Can a guest link see money or other guests?"** No: Tara's link is a scoped token checked on the server, it reads only her household's invitations from the published schedule, and the server returns no data to a guest link anywhere else: planner pages show the sign-in page, and the money, vendor, Shagun, guest-list and voice routes answer 401, because a guest link carries no session. There is no guest voice today, so the guest page has no mic at all.
5. **"What does Flagsmith actually do? What breaks if you delete it?"** It assigns each new owner to voice-first or form-first setup by a stable ID, records exposure and "setup saved" events for the experiment, and holds the voice rollout segment and the server-checked kill switch for voice writes. Without it there is no experiment, no gradual rollout and no way to stop voice writes short of redeploying, and we report the sample size, not a winner.
6. **"Is the NudgeBee failure real? Where's Kubernetes?"** The fault is deliberately injected and labelled, but the recovery is real: the NudgeBee workflow reads our job status over HTTPS, pauses for a human approval, then calls an export-only retry keyed by publication revision and format. We're a web app, so the workflow uses HTTP tasks rather than a cluster, and a replay still produces one card and touches no publication or ledger data.
7. **"How well does Hinglish work in a noisy hall, with numbers like 'dedh lakh'?"** Native speakers ran our 47-line test set on the stage headset, covering baarah lakh, dedh lakh, sava lakh, pachaas hazaar and ₹1.5L, and the live lines had to pass five runs in a row. When it mishears, the preview shows the heard words beside the rupee amount, and the owner fixes the number before anything is saved.
8. **"Why voice, when families already use WhatsApp and spreadsheets?"** The people who know the details, the parents and relatives, describe them in Hinglish on calls and in voice notes, and the details get scattered or lost. Jashn turns that speech into checked records that the family and the planner share, and typing stays available when precision matters.
9. **"What's real, and what doesn't work yet?"** Everything in the live demo ran on our deployment except the NudgeBee clip, which is a labelled recording of the real run, and the Flagsmith counts are small, real samples. The synthetic run beside them is labelled synthetic every time it is shown. The README's Working/Partial/Future table lists the rest honestly. *(At the freeze, name the weakest Partial item here.)*
10. **"How much did AI write, and can you explain it?"** Claude Code with Claude Opus 5.5 wrote the code under our review; Claude Fable 5.2, and GPT-6.2-Sol and GPT-6.2-Astra (OpenAI) through the Codex CLI, reviewed plans and code; the README discloses this as Rule 7 requires (presentation §6). Pick any path and we'll walk it, for example voice → transcript → structured action → validation → preview → confirmation → the same server function the form uses.
