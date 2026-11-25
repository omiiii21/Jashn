# Product

<!-- impeccable:product-schema 1 -->

**Status: Proposed (built from docs/prep/design-direction.md; the live design round was skipped for time).**

The facts below come from `docs/prep/scope.md`, `docs/prep/demo-data.md` and `docs/prep/decisions.md`. No interview round ran, so nothing here was confirmed in a live session; the one inferred line is marked "(inferred)". `decisions.md` wins wherever this file disagrees. Lane B owns this file after the contracts PR (D3). The visual system lives in `DESIGN.md`.

## Platform

web

## Users

- **The owner.** The couple, or a parent running the wedding. In the demo this is Mira Deshpande, the bride, who speaks English, Hindi and Hinglish. She plans on a laptop at home and checks things on a phone at venues. She approves publishing and spending.
- **The event manager.** A professional planner the owner invites into the workspace. In the demo this is Diya Fernandes of Rangoli Lane Events (fictional), working from her phone. She edits drafts and proposes costs. The owner publishes and approves.
- **Guests.** They have no account. Each household gets a private link, opens it on a phone, sees only the functions it is invited to and replies to each one. Guests never see money, vendors, other guests or planning warnings, and the server enforces this.
- **Co-owner.** A second owner account can exist (Kabir Arora in the demo). Nobody signs in to it during the demo.

## Product Purpose

One line from the approved scope: **say it in Hindi, English or Hinglish, and Jashn keeps an Indian wedding's plans, people and payments in sync.**

The core jobs, from the must-work list:

1. **Set up a wedding by voice.** Speak the names, date, budget and guest count. Jashn asks for anything missing, such as the year, and you review the draft before saving.
2. **Act and ask by voice.** Push-to-talk in English, Hindi or Hinglish. Jashn shows what it heard and what it will do. You confirm, it saves, and it replies aloud from the saved record. Questions such as "kitna baaki hai?" are answered from saved records and need no confirmation.
3. **Run the functions.** Haldi, mehendi, sangeet, wedding and reception, each with a time, venue and dress code. Edits stay in draft until the owner publishes them.
4. **Guests and RSVP.** Households, an invitation per function and a private link per household. An RSVP from a phone is counted exactly once.
5. **Keep the accounts straight.** Planned, committed, paid and still owed are four separate figures. A spoken correction ("the advance was ₹40,000, not ₹50,000") corrects that same payment and keeps its history.
6. **Vendors and catering.** Quotes, agreed amounts, advances and balances. The RSVP-based estimate (230 × ₹800 = ₹1,84,000) sits beside the fixed ₹2,00,000 contract and never replaces it.
7. **Invitation and guest website.** A maroon-and-gold stationery design with the family's photo, a published guest site and an exported invitation card.
8. **Owner and manager together.** Two real logins. The manager's changes reach the owner with who changed what and when.
9. **Privacy by role.** Enforced on the server, never only hidden in the UI.

Should-haves once the must list passes: the Overview, reading an existing printed invitation into a draft, light per-function requirements ("Jain food for 12 at the reception") and the shagun register ("Sharma ji ne 5,100 shagun diya"). Success today means the demo path works live on production with real records, and every number on screen or in speech comes from saved records.

## Positioning

- **Voice that writes, with a review step.** Jashn is not a chatbot. Every spoken change is shown as a proposed action, confirmed by a person, saved, and only then spoken back from the saved record. Typing does the same job whenever voice is switched off.
- **An account book that keeps its corrections.** A corrected figure keeps its old value struck through beside the new one, with who changed it and when. Deleting a payment voids it, and the voided line stays listed.
- **An Indian wedding's own structure.** Several functions, each with its own guest list, households instead of single guests, money in lakh grouping (₹12,00,000), and Hinglish as a first-class input.

## Operating Context

- **Scenes.** Daylight venue visits, phones in bright living rooms and a laptop at home. Families also compare everything against printed invitation cards. In the demo, the owner runs on the projected laptop and the manager and a guest run on phones.
- **Two registers.** The planning workspace (owner and manager) and the guest invitation (guests). The studio joins them: workspace controls beside a live stationery preview.
- **Time and money.** Every date and time is shown in Asia/Kolkata. Money is whole rupees with en-IN grouping. Jashn records payments and never moves money: the verb is "Record payment", never "Pay".
- **Sponsor services in the flow.** Sarvam AI handles speech recognition, turning speech into proposed actions, spoken Hindi and English replies, and reading an uploaded invitation image. Flagsmith runs the voice-first versus form-first setup experiment, the staged voice rollout and the kill switch for voice writes. NudgeBee recovers a failed invitation-card export with a person's approval and without making a duplicate.
- **Audience today.** FestiveHacks judges, including a Berlin panel, watch the live demo and the video on 25 Nov 2026.

## Capabilities and Constraints

- **Terminology.** Use these words in the UI and in speech: function (not "event") for haldi, mehendi, sangeet, wedding and reception; household; invitation (one per guest per function); draft and published revision; commitment; payment (voided, never deleted); estimate; proposal (a manager's cost change awaiting the owner); shagun (a cash gift received).
- **Voice.** Push-to-talk only, with no always-on listening. Replies run one or two sentences, in the language the user spoke, after the save is confirmed. Hindi amounts use full words built in code ("एक लाख पचास हज़ार रुपये"), never colloquial forms such as डेढ़ लाख (D22). When voice writes are switched off, questions are still answered and typing keeps working.
- **Data.** All demo data is Indian, fictional and labelled "Fictional demo data" on every screen (D21). Unknown values show "?" and ask; nothing is invented.
- **Future scope (say it honestly).** The full décor, menu and music workspace; receipt attachments; task boards; live guest location; real payments; WhatsApp reminders; seating.
- **Open decisions.** The product name on the seal, the guest-page footer and the README (design-direction §12). The blessing line defaults to none, and the family picks one. The Peacock invitation theme ships only after the money and guest flows work.

## Brand Commitments

- **Name.** Jashn (working name; see the open decisions).
- **Tone.** Calm, precise and warm, in the register of a family that keeps good accounts. Sentences say what happened and what to do next. Buttons name the action ("Save correction", "Record payment", "Review and publish"). Errors say what went wrong and what to do, without apologising. There are no exclamation marks and no "Oops", "Unlock", "Seamless" or "Get started".
- **No persona.** No assistant name, avatar, greeting or typing dots. The voice panel is a log of requests and results.
- **Hindi as an equal.** Hindi labels use the words families use for this: हिसाब for the accounts, बाकी for what is still owed. Native speakers check the draft labels.
- **Every family is welcome.** Families are Hindu, Muslim, Sikh, Jain and Christian. No religious mark is ever decoration. A blessing line is optional text the family chooses.
- **The binding visual brief.** Ivory, maroon and gold, with stationery for the guest side. The details are in `DESIGN.md`.

## Evidence on Hand

- `docs/prep/demo-data.md` holds every person, household, venue, function, figure and demo state. It is the source for fixtures and seeds (D100, D123).
- The couple photo is a fictional, AI-generated portrait, labelled as such and used exactly as uploaded (D14).
- There are no real customers, testimonials, usage metrics, prices or press. Never invent them.

## Demo Story

The live path runs on one demo copy and resets to D0 after each run (demo-data §9.3):

1. **D0, a question.** Mira asks "Caterer ko ab kitna dena hai?" Jashn answers from saved records and writes nothing.
2. **D1, the correction.** "Actually, that advance was forty thousand." The review card shows ₹50,000 struck through beside ₹40,000. Mira confirms, and the payment to Annapoorna Caterers keeps its history: "Mira corrected the advance to Annapoorna Caterers from ₹50,000 to ₹40,000."
3. **D2, the manager's change.** On her phone, Diya moves the reception from Banyan Hall (220 seats; 229 have confirmed) to Lotus Hall. The move is a draft: guests still see Banyan Hall, and Mira sees "Changed by Diya" with the time. Mira asks "Diya ne kya badla?"
4. **D3, publish.** Mira publishes revision 3. The old card is marked out of date, and guests now see Lotus Hall.
5. **D4, a guest replies.** Tara Bhat taps Attending for the reception on her private link. Reception attendance goes from 229 to 230, and the catering estimate moves to 230 × ₹800 = ₹1,84,000, still beside the ₹2,00,000 contract. Mira asks "Reception ka venue kya hai, aur caterer ka kitna baaki hai?"
6. **D5, the kill switch.** Voice writes are switched off. The spoken request is refused with the reason shown, and Mira types "Jain food for 12" for the reception instead.
7. **The recording.** NudgeBee recovers a failed card export without a duplicate. The video also shows voice setup and the Invite studio, where Mira picks maroon and gold and attaches the photo.

## Product Principles

1. **Every number comes from saved records.** On screen and in speech, and every total opens the records behind it.
2. **Voice proposes, people decide.** Show what we heard, review, save, then speak. Typing is always a full alternative.
3. **History is kept, never erased.** Corrections strike through, deletes become voids, and every change records who made it and when.
4. **Drafts stay private until the owner publishes.** Guests see only their own published functions.
5. **English and Hindi are equals.** The same screens, the same numbers and the same care in both.

## Accessibility & Inclusion

- WCAG 2.x AA: text at 4.5:1 or more, large text and control boundaries at 3:1 or more, and touch targets of at least 44 × 44 px with 8 px gaps.
- Reduced motion is honoured everywhere. Status messages use polite live regions, and focus moves to the main content after a route change.
- Hindi text is never clipped, and Hindi spans carry `lang="hi"`.
- Status is never carried by colour alone: every status colour comes with an icon and a word.
- Guests open their link on whatever phone they have, without an account or an app install (inferred).
