# Wedding Planner — Shipping Brief
(The team's approved product brief, from Notion, last edited 24 Nov 2026.)

Status: approved product direction, proposed implementation plan. No application has been built or tested as part of this brief. Product name remains open.

## Product decision

Build a complete wedding planning platform whose primary interface is conversation. Couples and families describe their wedding by voice, text and uploaded images. The platform creates and maintains invitations, events, finances, vendors, preferences and guest attendance. Event managers work in the same wedding workspace, so the family can see what changed and what needs a decision.

Product promise: **Tell us about your wedding. Keep the plans, people and payments together.**

Every requested module remains in the build scope. Build order determines what gets implemented first; it does not remove later modules from the product. Anything unfinished at submission is explicitly described as future scope. Location tracking and locating guests inside halls are already future scope.

## People and access

| Person | First-version access |
| --- | --- |
| Couple / wedding owner | Manage the wedding, finances, vendors, invitations, guest access and collaborators; approve publication and spending changes. |
| Event manager | Add and update events, vendor details, requirements and tasks; propose expense changes; see financial information explicitly shared by the owner. |
| Guest | View the published invitation and events they are invited to; submit their own RSVP and permitted dietary information. Guest-directory visibility is an owner setting and opt-in for guests. |

A manager's edits must be visible from another signed-in session. A decorative role selector is not collaboration. Guest links must never grant access to private financial or vendor records.

## Shipping scope

| Module | Working first version | Definition of done |
| --- | --- | --- |
| Voice-led wedding setup | Describe names, dates, budget, venues, approximate attendance and preferences. Upload couple photos, an existing invite, reference images or documents. Extract supported details into a reviewable draft and ask about missing information. | A new wedding saves successfully and can be reopened. Uncertain names, dates and amounts are editable; the system does not invent them. |
| Invitation studio | Create invitation wording, select a polished layout, place the uploaded photos, customise colours and fonts, and preview a mobile wedding website. Publish a shareable link and export an invitation card. | Reviewed names, venue and date appear correctly on the website and exported card. Photos are used as uploaded unless explicitly edited. |
| Events and itinerary | Add functions such as mehendi, haldi, sangeet, wedding and reception. Each has a date, time, venue, description, dress code, owner and invited guest group. | Owner and manager can edit the schedule; the guest itinerary reflects the latest published version. Obvious timing conflicts are surfaced. |
| Guest list and RSVP | Add guests or households, assign invitations per function, collect yes/no/pending responses, count attendees, and capture dietary notes. | A guest responds from a separate phone; the correct event's attendance updates without double counting. Guest-list visibility respects permissions. |
| Financial ledger | Set an overall and category budget. Record vendor commitments, payments already made, due dates, miscellaneous expenses and receipt attachments. Show planned, committed, paid and outstanding amounts separately. | A recorded payment changes the vendor balance and wedding totals exactly once. Corrections update the intended record and leave history. This records money; it does not transfer money. |
| Vendors and catering | Store caterers, decorators, photographers, venues and other vendors with contacts, status, linked functions, quotations, agreed amounts, advances and balances. Catering includes menus, per-person rates and headcounts. | A vendor is connected to its event and ledger. Attendance can update a clearly labelled catering estimate without silently changing the agreed contract. |
| Customisations and requirements | Track themes, decor references, menus, dietary requirements, music, dress codes and special requests by event. Allow voice instructions and uploaded reference images. | Preferences persist and are visible to the manager; a reference image remains attached to the appropriate requirement. |
| Manager collaboration | Shared wedding workspace, tasks, assignees, due dates, status, change history and a family-facing activity feed. | A manager adds or changes an event; the owner sees what changed and who changed it. Cost-changing proposals remain distinct from approved commitments. |
| Wedding overview | Upcoming events, RSVP totals, budget position, vendor dues, open tasks and recent manager updates, plus a persistent microphone control. | Every displayed number comes from saved records. The voice assistant can answer questions using those same records. |

These are implementation targets, not claims of completed functionality.

## Voice is the main interaction

Every core module should support at least one real spoken action and one spoken question. Text and direct editing remain available for precision and noisy venues.

| Example utterance | Expected action |
| --- | --- |
| "Our wedding is on 14 December in Bengaluru. Budget is twelve lakh, roughly 250 guests." | Create a draft wedding profile; ask for the year, names and other missing essentials. |
| "Add the sangeet on the thirteenth at seven in the evening, at Garden Hall." | Preview an event with a resolved date, timezone and venue, then save it after confirmation. |
| "Make the invite maroon and gold. Use this photo." | Update the invitation preview using selected design settings and the supplied asset. |
| "The caterer is charging eight hundred per person for 250 people. I paid a fifty-thousand advance." | Preview a ₹2,00,000 catering commitment and ₹50,000 payment against the selected vendor. After confirmation, show ₹1,50,000 outstanding. |
| "Actually, that advance was forty thousand." | Confirm correction of the referenced payment. Do not add another payment. New outstanding balance: ₹1,60,000. |
| "What did the event manager change today?" | Summarise saved changes with links to the affected events, tasks or proposals. |
| "Who's attending the reception?" | Show the permitted guest list and event-specific RSVP counts. |
| "Add Jain food for twelve guests at the reception." | Save an event catering requirement; surface any quoted cost change for review. |

Interaction pattern: **speak → see the interpretation → review the proposed action → save → see the updated screen and a short spoken confirmation.** Read-only questions do not need a confirmation step. Publishing, financial changes and destructive edits do.

First language target: English and Hindi/Hinglish, tested with actual speakers. Other languages are future scope until demonstrated. Start with push-to-talk; uninterrupted phone-style conversation is a later enhancement.

## The connected behaviour that makes the product valuable

- Events entered once supply both the planner and the invitation itinerary. Draft edits are visible to collaborators; guest pages use the published version.
- RSVP totals feed catering headcount estimates. For example, 250 people at ₹800 gives ₹2,00,000; 230 gives an estimate of ₹1,84,000. A contracted minimum or fixed quote does not change automatically.
- A payment attached to a vendor updates both that vendor's balance and the wedding ledger. It is not counted twice as a separate expense.
- Manager changes appear in the family activity feed, and the assistant can explain them from saved records.
- Photo and style changes update the invitation preview. Published website changes require publication. Previously downloaded cards are static and must be regenerated after a date or venue change.

## Interface direction

Mobile-first guest experience; responsive planning workspace for the family and event manager.

Planning navigation: **Overview · Events · Guests · Money · Vendors · Invite**. Requirements, tasks and activity live inside their related events and on Overview. A persistent microphone opens a conversation panel and takes the user to the affected view after an action.

Use warm ivory, deep maroon and restrained gold as an initial visual direction, with one alternative theme if time permits. Invitation pages should look like wedding stationery; the planning screens should make dates, amounts and responsibilities easy to read.

## Sponsor implementation

| Sponsor | Proposed integration | Evidence to show |
| --- | --- | --- |
| Sarvam AI | Speech recognition and short spoken responses for wedding setup, schedule edits and finance queries. Use a verified document/vision endpoint for image extraction; do not assume speech recognition reads images. | A real spoken request changes a saved record, and a follow-up query returns the current value. |
| Flagsmith | Control voice-mode rollout and a voice-first versus form-first setup experiment. Include a flag that disables a failing optional AI capability while keeping direct editing usable. | Actual flag evaluation changes behaviour; exposure and successful setup events arrive in the experiment. Report sample size, not an unsupported winner. |
| NudgeBee | Operational workflow for a failed invitation-export/background job: inspect status, require operator approval, call a narrowly scoped retry endpoint, and inspect the result. | A real workflow execution, approval and successful retry with no duplicated publication or finance effects. |

Sarvam documentation supports speech-to-text, text-to-speech and other model APIs. Flagsmith documentation supports multivariate experiments and exposure/conversion tracking. NudgeBee documents REST calls and approval steps; the application must implement its own job status and safe retry endpoints. These are proposed integrations, not pre-existing integrations with this application.

Check access to the required sponsor capabilities before depending on them. A workflow retry may repeat earlier tasks, so the application must make repeated requests safe. The first demonstration can use manual workflow initiation if automatic triggering is not complete; describe it accurately.

All three sponsors must do real work for the Berlin prize target. Required sponsor integrations cannot be described as finished if they are only future scope.

## Build sequence for 25 November

Assumption: one lead builder with coding assistance; team size is not yet confirmed. This is an aggressive allocation of eight hours, not a delivery guarantee. Talks, setup problems and judging preparation reduce hands-on time.

| Work block | Intended outcome |
| --- | --- |
| First 60 minutes | App shell, persistent wedding records, owner/manager/guest access boundaries, basic deployment, sponsor credentials and connectivity verified. |
| Next 120 minutes | Events, vendors, finances, requirements, tasks and guest records connected through shared data; correct totals and activity history. |
| Next 90 minutes | Voice actions and queries connected to the same functions as forms; structured previews, corrections and confirmations. |
| Next 60 minutes | Invitation creation, image/context input, card export, published guest page and RSVP flow. |
| Next 45 minutes | Complete the Flagsmith experiment and NudgeBee recovery workflow; verify each sponsor has a demonstrable role. |
| Final 105 minutes | Finish viable gaps, test owner/manager/guest flows on two devices, fix mobile layout, record the demo, complete README and submit before 5 PM IST. Stop adding features during the final hour. |

Within each block, finish one complete action before adding another. If more builders join, assign stable module ownership around a shared data model; avoid separate incompatible apps for each role.

## Demonstration story

Use clearly labelled fictional wedding data.

1. The family speaks a wedding brief and uploads a couple photo; the reviewed wedding record is created.
2. The invitation preview appears, and a voice instruction changes its theme.
3. Record the caterer's ₹2,00,000 commitment and ₹50,000 advance. Show ₹1,50,000 outstanding; correct the advance and show the revised balance.
4. In a second session, the event manager adds a function or changes a venue. The family sees the update, reviews it and publishes the guest-facing schedule.
5. A guest opens their link and RSVPs. Attendance and the clearly labelled catering estimate update.
6. Ask, "What changed today, and how much do we still owe?" The answer comes from saved events and ledger records.
7. Briefly show the Flagsmith variant and a controlled NudgeBee recovery, live or in an honestly labelled recording of the actual system.

The strongest moment is the same spoken instruction updating the relevant screens consistently, followed by another person's real change appearing in the workspace.

## Verification and submission

- Confirm a voice action persists across refresh and another signed-in session.
- Confirm the ledger arithmetic, payment correction and repeated-request handling.
- Confirm guest links cannot read finances, uninvited events or unrestricted guest details.
- Confirm a manager's event change appears to the owner and the approved published version appears to guests.
- Confirm image extraction offers corrections; it never silently invents names, dates or amounts.
- Confirm each sponsor integration actually executes. Keep synthetic traffic labelled as synthetic.
- Capture a working demo, publish the required public repository, include setup instructions and disclose AI coding assistance.
- Maintain a simple implementation list: Working / Partial / Future. Mark every incomplete feature honestly and keep broken controls out of the primary demo flow.

## Future scope

Already agreed: live guest location, hall-level tracking and locating people during the wedding.

Possible later extensions: direct vendor portals and sourcing, actual payment collection, WhatsApp delivery and reminders, seating plans, room/shuttle allocation, richer AI artwork, advanced contract extraction and continuous voice conversations. These are optional expansion ideas, not additions to the promised hackathon scope.

Any requested core feature that is incomplete at the cutoff remains on the product roadmap and is presented as future scope or partial, according to what actually works.

## Preparation boundary and references

Tonight's work is planning, research, assets and access preparation. The event rules require main project coding and design to begin after the hackathon starts. Use 5 PM IST as the submission deadline: the event submission instructions say 5 PM even though the general rules page also mentions a 6 PM event window.

Sources checked on 24 November 2026:
- Festive Hacks overview and submission instructions: https://www.wemakedevs.org/hackathons/festivehacks
- Festive Hacks rules: https://www.wemakedevs.org/hackathons/festivehacks/rules
- Sarvam developer quickstart: https://docs.sarvam.ai/api/getting-started/quickstart
- Flagsmith Experimentation: https://docs.flagsmith.com/experimentation
- NudgeBee HTTP integration tasks: https://docs.nudgebee.com/docs/features/workflow-builder/integration-tasks/
- NudgeBee approvals and execution retries: https://docs.nudgebee.com/docs/features/workflow-builder/workflow-operations-approvals/
