# Jashn: approved scope

Approved by the team lead on 25 Nov 2026 (night before the build). This list is binding for the build. Anything not on it is future scope.

**One line:** say it in Hindi, English or Hinglish, and Jashn keeps an Indian wedding's plans, people and payments in sync.

## Must work (the demo path)

| # | Feature | What the judges see |
|---|---|---|
| 1 | Voice setup | You speak the names, date, budget and guest count. Jashn asks for anything missing, such as the year; you review and save. |
| 2 | Voice actions and answers | Push-to-talk in English, Hindi or Hinglish. Jashn shows what it understood, you confirm, and it's saved; Jashn replies aloud in Hindi or English. Questions like "kitna baaki hai?" are answered from saved records. |
| 3 | Events and itinerary | Mehendi, haldi, sangeet, wedding and reception, each with time, venue and dress code. Edits stay in draft until the owner publishes them. |
| 4 | Guests and RSVP | Households, invitations per function and a private link for each guest. An RSVP from a phone is counted exactly once. |
| 5 | Money ledger | Budget, committed, paid and outstanding are shown separately. "The advance was ₹40,000, not ₹50,000" corrects that same payment and keeps its history. |
| 6 | Vendors and catering | Quotes, agreed amounts, advances and balances. The RSVP-based estimate (230 × ₹800 = ₹1,84,000) sits beside the fixed ₹2,00,000 contract. |
| 7 | Invitation and wedding website | A maroon-and-gold stationery design with your photo, a published guest site and an exported invitation card. |
| 8 | Owner + manager collaboration | Two real logins. The manager's changes appear for the owner, showing who changed what and when, and the owner approves publishing and spending. |
| 9 | Privacy by role | Guest links can never see money, vendors or functions the guest isn't invited to. The server enforces it. |

## Should (once the must-work list passes)

| # | Feature | What it adds |
|---|---|---|
| 10 | Overview dashboard | Upcoming functions, RSVP totals, budget position, dues and recent manager updates. The mic sits in the header on every screen from the start. |
| 11 | Read an existing invitation | Upload a photo of an old card, and Jashn drafts the details for you to review without inventing missing ones. Depends on Sarvam's document reading passing the checks. |
| 12 | Requirements (light) | Notes on each function, such as "Jain food for 12 at the reception", added by voice. Light version only, not the full workspace. |
| 13 | Shagun register | "Sharma ji ne 5,100 shagun diya" is logged as a gift received, with a thank-you list. (New idea, not in the original brief; on the organisers' idea list.) |

## Future scope (said honestly in the pitch and README)

The full décor, menu and music workspace; receipt attachments; task boards; live guest location; real payments; WhatsApp reminders; seating.

## Sponsors: what each one does

- **Sarvam AI:**
  - Hinglish speech recognition.
  - An AI model that turns speech into proposed actions.
  - Spoken Hindi and English replies.
  - Reading an uploaded invitation image (#11).
- **Flagsmith:**
  - A real A/B test: voice-first vs form-first setup, measured by weddings saved.
  - Voice mode rolled out to groups of users step by step.
  - A kill switch that turns off voice changes while typing keeps working.
- **NudgeBee:** when an invitation-card export fails, a NudgeBee workflow checks the job, waits for a person to approve, retries safely without making a duplicate card, and confirms the result.

## Decisions taken with the approval

- #12 is the light version.
- #13 is in, as a Should.
- #10 stays a Should. The header mic is on every screen from the start.
