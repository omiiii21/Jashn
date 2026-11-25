> **Superseded draft (decision D38).** This is the 01:20 strategy draft, kept for its reasoning. Wherever it conflicts with `scope.md`, the specs in `spec/`, `demo-data.md` or `demo-script.md`, those files win. For example, the reception's original hall is Banyan Hall, not Garden Hall (Garden Hall is the sangeet venue), and spoken replies use Bulbul `bulbul:v4-flash` (voice.md 1.14), not Bulbul v3. The rest of this file is left as written at 01:20.

## 1. Winning thesis

Open **Jashn** (working title) with a question any wedding family recognises. “Caterer ko ab kitna dena hai?” A parent corrects an advance in Hinglish. A guest accepts on another phone. The family sees exactly why the meal estimate moved and what it owes. Give Kunal Kushwaha of WeMakeDevs a repo another builder can run, Hitesh Choudhary of Chai aur Code a spoken correction he can follow down to the payment, and Saiyam Pathak of Kubesimplify an actual failed export recovered under approval. Berlin requires all three sponsors, second place rewards Flagsmith, and the organisers publish no judging weights. [Event and judges](https://www.wemakedevs.org/hackathons/festivehacks)

## 2. Scope cut

Build one Bengaluru reception end to end. Seven modules contribute a small piece to that story. Mark a feature **Working** only after a human reviews it and exercises it on both laptop and phone.

| Priority | Brief module | What earns its place |
|---|---|---|
| MUST WORK | Voice-led wedding setup | Speak names, date and budget, supply a missing year, review, save and reopen. This gives the setup experiment a meaningful finish line. |
| MUST WORK | Invitation studio | One maroon-and-gold mobile layout places the uploaded photo beside the reviewed details. The owner publishes a link and exports a card the family can share. |
| MUST WORK | Events and itinerary | A manager changes one reception venue. Collaborators see the draft, and guests see the revision when the owner publishes it. |
| MUST WORK | Guest list and RSVP | A guest-specific link opens the invited function. Repeating the same response from a phone counts that person once. |
| MUST WORK | Financial ledger | Show budget, committed, paid and outstanding separately. Correcting one identified payment preserves its history and reconciles vendor and wedding totals. |
| MUST WORK | Vendors and catering | One caterer has a fixed commitment and a separate estimate based on confirmed guests. A single RSVP makes the distinction visible. |
| MUST WORK | Manager collaboration | Two signed-in accounts and an attributed activity entry establish who moved the reception. The owner controls publication and spending. |
| SHOULD | Wedding overview | Build the dedicated dashboard after the other flows pass. The required spoken answer can open its supporting event and payment from Money. |
| HONEST FUTURE SCOPE | Customisations and requirements | Defer the event-by-event workspace for décor references, menus, music and special requests. It deserves a manager workflow of its own. |

Track unfinished parts of each module in the README. Receipt attachments, conflict detection, task assignment, document extraction and voice coverage across every module need their own acceptance tests.

## 3. The wow moments

- **A correction worth ₹10,000.** The judge hears “Advance chaalis hazaar tha” and sees ₹50,000 become ₹40,000 on the same payment. After confirmation, the app says “एक लाख साठ हज़ार रुपये बाकी हैं” and shows the matching vendor balance.
- **A venue changes hands.** Diya saves Lotus Hall. The owner sees “Diya moved the reception from Garden Hall.” The phone shows Garden Hall until the owner presses Publish, then the guest opens the revised invitation.
- **One plate has a price.** Tara taps Attending. The family sees 229 become 230. Read the neighbouring figures aloud. “Confirmed-guest estimate, ₹1,84,000. Signed contract, ₹2,00,000.”
- **An owner finishes through an outage.** Say “Suppose voice starts timing out.” Flip a real Flagsmith switch. A second owner finishes an open draft by typing on the same deployment.
- **A recoverable failure.** Say “We deliberately failed this card export once.” Show the NudgeBee run waiting for approval, the completed job and the downloaded Lotus Hall card. Keep the run ID visible.

## 4. Sponsor strategy

**Sarvam AI.** Use short push-to-talk recordings with Saaras v4 Speech-to-Text. Choose `transcribe` for English or Hindi and `codemix` for Hinglish so English words can appear alongside Devanagari. Send the transcript to Sarvam Chat Completions for a proposed action. The app validates fields, resolves the selected vendor and asks about ambiguous dates or amounts. Show the original words beside Indian-formatted numbers. On confirmation, the same service used by the form writes the record. Bulbul v3 speaks a short Hindi or English reply from the saved result. Test “pachaas,” “chaalis” and “baarah lakh” with fluent speakers. [Speech modes](https://docs.sarvam.ai/api/api-guides-tutorials/speech-to-text/how-to/select-output-mode) · [Chat Completions](https://docs.sarvam.ai/api/token-factory/chat-completions) · [Bulbul](https://docs.sarvam.ai/api/api-guides-tutorials/models/bulbul)

**Flagsmith.** Test whether opening setup on the microphone increases the share of first-time owners who save a reviewed wedding in their first session. Use `setup_entry` with a stable opaque owner ID and a 50/50 voice-first/form-first split. Both arms can switch input. Record exposure when the entry screen renders and `setup_saved` after database confirmation, using the same identity. Show unique saves divided by exposed owners per arm. Track recognition failures that force a switch to typing. Target Hindi- and English-speaking owners with `voice_pilot`, starting internally, then at 10% of eligible owners. Gate 50% and 100% rollout on at least 20 pilot voice attempts with at most one forced fallback and zero unconfirmed writes. Have the server check an independent `voice_writes_enabled` kill switch before accepting voice changes. A separate `spoken_replies` flag can mute slow synthesis. Keep rehearsals in a separate environment and report actual sample sizes. Enable the managed warehouse at 09:00 because first ingestion can take hours. [Experiments](https://docs.flagsmith.com/experimentation) · [Event collection](https://docs.flagsmith.com/experimentation/run-an-experiment) · [Warehouse timing](https://docs.flagsmith.com/experimentation/connect-a-warehouse)

**NudgeBee.** Recover a failed invitation-card export for a specific published revision. The workflow reads our job status over HTTPS, branches on failure, requests in-app approval, calls our export-only retry endpoint on approval, then reads back the result and artifact ID. Rejection ends the run. Key the export by publication revision and format so replaying the workflow produces one card. Verify the team tenant can run Workflow Builder, reach the deployment, use a stored credential and approve an execution. Ask whether a connected cluster is necessary. If the failure webhook is unavailable, launch the same workflow manually with its job ID. If only reads work, use NudgeBee for diagnosis and verification around a manual app retry. If no real NudgeBee execution succeeds, disclose the missing Berlin requirement. [HTTP tasks](https://docs.nudgebee.com/docs/features/workflow-builder/integration-tasks/) · [Approvals and replay](https://docs.nudgebee.com/docs/features/workflow-builder/workflow-operations-approvals/)

## 5. Build day, 09:00–17:00 IST

Assume one lead, one Next.js deployment on Vercel and Supabase for authentication, Postgres and file storage. Opus 5.5 writes all code in four parallel worktrees covering data and permissions, user views, speech and flags, and exports and recovery. Agree on record IDs and write operations before branching. The lead reviews merges. Fable advises on failure cases, Astra owns scope, and Sol reviews small changes and supplies the portrait. Additional accepted teammates take mobile QA, sponsor operations and recording, respectively. Treat 17:00 as binding despite the rules page’s 18:00 event window. [Official schedule](https://www.wemakedevs.org/hackathons/festivehacks/schedule)

| IST | Lead and event | Opus work and exit check |
|---|---|---|
| 09:00–09:30 | Check in at BIEC, get submission instructions, start the repo and enable the warehouse. | Establish the schema and test identities. Deploy an HTTPS shell. |
| 09:30–10:00 | Open the deployment on both devices. Check credentials and leave the laptop powered and awake. | Land the first reviewed save/read, separate owner and manager sessions, and a scoped guest link. |
| 10:00–11:00 | Attend the keynote and opening conversation. | Agents build payment corrections, published invitations and speech/flag integrations. Run tests and queue changes for review. |
| 11:00–11:30 | At 11:00 ask Flagsmith about ingestion, at 11:10 ask NudgeBee about runner access, at 11:20 confirm Hinglish settings with Sarvam. | Exercise sponsor calls. Prepare the export job and repeat-RSVP tests. |
| 11:30–12:15 | Review and merge the financial and voice paths. Speak, confirm, refresh and inspect payment history on both devices. | Fix integration defects and connect spoken readback to persisted data. |
| 12:15–13:00 | Run manager edit, owner publish and guest RSVP. Start the experiment and first recovery drill. | Complete card rendering, authenticated retry and exposure/conversion instrumentation. |
| 13:00–14:00 | Take lunch. Leave agents the failures from the morning run. | Test repeated submissions and permissions, fix reproducible failures, prepare fresh fictional data and draft setup instructions. Queue merges. |
| 14:00–14:45 | Review lunch changes. Test each role on both devices, capture sponsor proof and invite willing first-time testers to try setup. | Fix failed checks. Freeze features at 14:45 and mark unverified work Partial or Future. |
| 14:45–15:30 | Rehearse twice with a stopwatch. Upload the first clean take as a fallback. Check guest permissions and the venue on the old downloaded card. | Fix release blockers only. Prepare a fresh copy of the fictional wedding for judging. |
| 15:30–16:15 | Record, caption and upload the final video. Explain the permission, payment and retry paths aloud. | Run setup from a clean checkout, update feature status and disclose AI assistance. |
| 16:15–17:00 | Submit public repo, setup README and video by **16:35**. Open links signed out, keep the receipt and be ready for judging at 17:00. | Keep the tested release available during the submission buffer. |

## 6. Tonight, 01:20–09:00 IST

1. **01:20–01:30.** Confirm Luma acceptance and registration for each teammate, the route to BIEC and the 17:00 cutoff. Plan for the lead to operate both devices solo.
2. **01:30–02:00, parallel.** The lead signs into GitHub, Vercel, Supabase and the sponsor consoles. Store the Sarvam API key in a password manager, run a stock playground sample and check credits. Locate Flagsmith’s environment key and warehouse settings. Check NudgeBee run/approve permissions. Fable reads official examples and lists unresolved access questions.
3. **02:00–02:20, parallel.** Write a plain-language data sheet for Mira and Kabir, Bengaluru, 14 December 2026, ₹12 lakh budget, manager Diya and guest Tara. Specify 250 invited, 229 attending, Tara pending and a fixed 250-cover commitment at ₹800 per person. Collect a licensed raw photo and attribution. Sol prepares the fictional portrait prompt for generation after opening.
4. **02:20–02:40.** Sketch six video frames on paper, write the spoken lines and expected balances, and mark the cut forward to the populated wedding. Pack phone, laptop, headset, chargers and display cable. Check screen recording and audio on a generic page.
5. **02:40–07:00** sleep. **07:00–08:30** eat and travel to BIEC. **08:30–09:00** rehearse handoffs aloud, check the hotspot and queue written agent assignments. Project code, migrations, final designs, custom flags and workflows start at 09:00. [Event rules](https://www.wemakedevs.org/hackathons/festivehacks/rules)

## 7. Live demo and submission video

**Three-minute live script.** Project the owner’s laptop, keep Diya signed into a second browser profile and mirror Tara’s phone. Start with the labelled fictional wedding already in progress.

| Clock | Action and line |
|---|---|
| 0:00–0:18 | “Mira has 250 invitations out and one disputed caterer advance.” Point to ₹2,00,000 committed, ₹50,000 paid and ₹1,50,000 outstanding. |
| 0:18–0:52 | Say “Caterer ko chaalis hazaar advance diya tha.” Review the correction, confirm and reopen the vendor. Let the room hear the new balance. |
| 0:52–1:26 | Change Garden Hall to Lotus Hall as Diya. Show the old invitation on the phone, the attributed change on the laptop, then publish as Mira. |
| 1:26–1:50 | Refresh Tara’s invite and tap Attending. Point to 230 guests, the ₹1,84,000 estimate and the ₹2,00,000 commitment. |
| 1:50–2:12 | Ask “Venue kya hai, aur caterer ka kitna baaki hai?” Play “Lotus Hall. एक लाख साठ हज़ार रुपये बाकी हैं।” Open the supporting records. |
| 2:12–2:40 | Show the two setup variants and observed counts. Disable voice writes in rehearsal, refresh the flags and save an open draft by typing. |
| 2:40–3:00 | Play a labelled recording of the real NudgeBee approval and recovered PNG. Close with “Tara has the right address. Mira knows exactly what to pay.” |

**Submission video, 2:45.** Give 0:00–0:30 to a new spoken wedding, the missing-year prompt and photo upload. At 0:30 cut explicitly to the populated fictional wedding. Show the original commitment, advance and correction through 1:05, publication and RSVP through 1:40, and the spoken answer through 1:55. Use 1:55–2:20 for Flagsmith and 2:20–2:45 for NudgeBee, the recovered card and repo link. Caption actual screens, retain a local MP4 and verify signed-out playback. The length is a production choice. [Submission instructions](https://www.wemakedevs.org/hackathons/festivehacks)

## 8. Eight risks and their triggers

1. **NudgeBee access.** Request a runnable workspace early. If the first authenticated status read fails by **11:30**, ask the sponsor for an enabled sandbox and use manual initiation. If writes still fail by **14:30**, demonstrate the verified read-only workflow.
2. **Flagsmith ingestion.** Start the warehouse early and retain event receipts. If native counts are missing by **14:30**, show real SDK evaluations and app-recorded saves, labelled with their source and sample size.
3. **Hinglish errors.** Rehearse with the stage headset. If two of five amount-bearing turns fail by **12:15**, shorten the utterance, expose editable numbers and record a successful Sarvam run for the noisy-room fallback.
4. **Duplicate money.** Use one payment ID, an atomic correction and a repeat-request test. If duplicate confirmation posts twice at **12:30**, disable financial writes until both devices pass. Mark the edit Partial if it misses the freeze.
5. **Guest privacy.** Enforce access on the server. Test an uninvited event, a draft and Money as Tara. If any is readable by **13:00**, take the guest link offline until all three checks pass.
6. **Solo review overload.** Give schema changes one owner. If the connected flow fails by **14:00**, drop the optional dashboard and assign every agent a reproducible failure on the demo path.
7. **Venue network or projection.** Carry a hotspot and local recording. If either device misses two rehearsed transitions by **15:30**, switch to the hotspot. If the handoff still stalls, announce and play the last successful recording of that step.
8. **Late submission.** Upload a usable rehearsal take early. If the polished upload is incomplete by **16:20**, submit the tested rehearsal video with the public repo and setup instructions, then verify receipt.

## 9. What NOT to do

Skip the template gallery, continuous listening, live payments, WhatsApp delivery and guest tracking. Avoid a Kubernetes migration for the pitch. Cut decorative role selectors, hard-coded balances and synthetic conversion leaderboards. Spend the last hour proving another person can open the repo, run the app and see the same wedding the judges saw.