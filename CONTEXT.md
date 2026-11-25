# Jashn

Jashn is a shared planner for one Indian wedding. The couple and their event manager keep the functions, guests, RSVPs, vendors and money in one place, and guests answer through a private link. This file is the glossary only. The binding contract for every name is `docs/prep/spec/domain-and-data.md`, and `docs/prep/decisions.md` wins over it.

## Language

### People and access

**Wedding** (`weddings`):
One planning workspace for one couple. Everything else belongs to exactly one wedding.
_Avoid_: project, workspace, event (an event is a function)

**Member** (`members`):
A signed-in person who works on a wedding. Guests are never members.
_Avoid_: user (one account can be a member of several weddings), collaborator

**Role** (`member_role`):
`owner` is the couple or family: full control, publishes, approves spending. `manager` is the event manager: edits the draft and logistics, proposes spending.
_Avoid_: admin, planner, editor

**Member invite** (`member_invites`):
A one-time join link that makes someone a member with a set role. It expires after 48 hours.
_Avoid_: invitation (that word belongs to guests)

**Sharing settings**:
The owner's switches for what a manager may see: the budget, vendor money, guest contacts. Shagun is never shared.

**Sample copy**:
A seeded wedding marked `is_sample`: the demo copy (D0), rehearsal copies `a` to `d`, and the `e2e` copy. Only a sample copy can be reset.

**Checkpoint**:
A state a sample copy can be reset to: `d0` is the demo's starting state; `s0` is the earlier state before the catering contract and its advance.

**Seed key**:
The short human name of a seeded record, such as `PAY-01`, `EVT-REC` or `H16`. Live records have none.

### Functions and the invitation

**Function** (`events`):
One ceremony or party: mehendi, haldi, sangeet, wedding or reception. The UI says "function" or "event"; the code says `event`.
_Avoid_: `kind` (use `event_kind`)

**Venue** (`venues`):
A named space, such as Lotus Hall at Mallige Gardens. A function points at one venue.

**Requirement** (`requirements`):
A light note on a function, such as "Jain food for 12 guests", optionally linked to a vendor. Members only.
_Avoid_: `count` (use `quantity`)

**Draft itinerary**:
The current, editable functions, venues, invitation wording and style. Members see it; guests never do.

**Published revision**:
A numbered, frozen copy of the guest-visible part of the draft (REV-1, REV-2, REV-3). Guests and exported cards read only the latest one.
_Avoid_: version (versions belong to payments and commitments), release

**Publication** (`publications`):
The record of one publish: the revision number, the snapshot, who published, when, and what changed.
_Avoid_: `publish_schedule`

**Unpublished change**:
A draft edit that guests can't see yet because nobody has published since.

**Invite style** (`invite_styles`):
How the invitation card looks and reads.
_Avoid_: `palette` (use `theme`)

**Couple photo** (asset kind `couple_photo`):
The one kind of image a wedding stores. Photos of printed cards are never stored.
_Avoid_: `invite_scan`

**Card import** (`card_imports`):
A draft read from a photo of a printed card. It saves nothing until the planner applies it.
_Avoid_: `extract_invite`

**Export job** (`export_jobs`):
Rendering one invitation card image for one published revision and format. At most one per revision and format. While it works its status is `rendering`.
_Avoid_: `export_card`, status `running`

**Export attempt** (`export_attempts`):
One try at an export job. A retry adds an attempt; it never adds a job.

### Guests and RSVPs

**Household** (`households`):
A family unit that shares one invitation link, such as H16 Bhat (Tara alone) or H02 Deshpande (three people). Every guest belongs to one household.

**Guest** (`guests`):
One invited person. The demo has 40 named guests and 210 labelled synthetic placeholders.

**Synthetic guest**:
A labelled placeholder that fills out the demo's numbers. Synthetic households have no link and show as one collapsed row.

**Invitation** (`invitations`):
One row per guest per function: this guest is invited to this function. It also holds that guest's RSVP for that function.
_Avoid_: `invitation_events`

**Invitation link** (`invitation_links`):
The private address `/i/{token}` for one household. The token is random, stored only as a hash, and can be rotated or revoked.
_Avoid_: invite link for members (that is a member invite), `token_hash` on invitations

**RSVP**:
The answer on an invitation: `attending`, `declined` or `pending`, plus how many plus-ones attend. Exactly one current RSVP per guest per function.
_Avoid_: `status`, yes/no

**Plus-one**:
An unnamed extra person a guest may bring, up to the invitation's limit. Plus-ones have no rows of their own.

**Headcount**:
People expected at a function: each attending guest counts 1 plus their attending plus-ones.

### Money

All money is whole rupees.

**Vendor** (`vendors`):
A business the family deals with: caterer, venue, decorator. A one-off payee, such as a boutique, is a vendor flagged `is_one_off`.
_Avoid_: supplier, `category` (use `vendor_category`)

**Quote** (`quotes`):
A price a vendor offered. Never counted in any total. Annapoorna quoted ₹850 a plate.
_Avoid_: estimate (an estimate is something else)

**Commitment** (`commitments`):
An agreed amount with a vendor: a contract. Either `lump_sum` or `per_unit` (₹800 a plate × 250 plates). It changes only by a new version.
_Avoid_: booking, order, `rate_inr` and `covers` (use `unit_price_inr` and `quantity`)

**Contract**:
The commitment as agreed. The demo's catering contract is ₹2,00,000, fixed.

**Estimate**:
What catering would cost at today's confirmed headcount: headcount × per-plate rate. Shown beside the contract as "Estimate, not the contract". Never stored, never a total.

**Payment** (`payments`):
Money the family records as paid to a vendor, of kind `advance`, `instalment` or `final`. Jashn records money; it never moves it.
_Avoid_: transfer, transaction, `installment`

**Payment version** (`payment_versions`):
One unchangeable state of a payment. A correction adds version 2 and supersedes version 1.
_Avoid_: payment revision

**Payment correction**:
Fixing a recorded payment ("it was ₹40,000, not ₹50,000") by adding a new version of the same payment. Never a second payment, never an edit in place.
_Avoid_: edit, update

**Void**:
Taking a payment or commitment out of the totals for good. It stays listed, struck through.
_Avoid_: delete

**Expense**:
A one-off cost to a payee who isn't a regular vendor, such as printed cards or the bridal lehenga. It becomes a one-off vendor with a commitment, and a payment when paid in full.

**Committed / paid / outstanding**:
Committed is the sum of current commitment amounts; paid is the sum of current payment amounts; outstanding is what each vendor is still owed, summed over vendors.

**Budget** (`budgets`, `budget_lines`):
What the family means to spend: one overall total plus optional amounts per category. A category with no line has no limit; it is not a line of ₹0.

**Proposal** (`proposals`):
A manager's money change waiting for an owner. Approved, it runs; rejected or withdrawn, it doesn't. Never in totals while pending.

**Shagun** (`shagun_entries`):
A gift the couple received, usually cash, with a thank-you status. Owners only. Never part of the expense ledger.
_Avoid_: gift expense, income

### History and how things change

**Command**:
A named write, such as `correct_payment`. The only way anything changes.
_Avoid_: action, mutation, `query_*` kinds for writes

**Read model**:
A named server-side view with fixed formulas, such as `money_summary`. The only way numbers reach a screen or a spoken reply.
_Avoid_: `query_balance`, `query_rsvp`

**Command receipt** (`command_receipts`):
The stored result of a command for one idempotency key, so sending the same request twice gives the same answer.
_Avoid_: `applied_actions`, `ops_requests`

**Activity entry** (`activity_entries`):
One line in the history: who did what, when, with the values before and after, in English and Hindi.
_Avoid_: activity, log line

**Wedding version**:
A counter that moves once for every change to a wedding. Screens poll it to know when to refresh.
_Avoid_: revision (that is a published revision)

**Voice turn** (`voice_turns`):
One push-to-talk recording: the transcript, the proposed actions, and whether the speaker confirmed, cancelled or was refused.
_Avoid_: voice attempt

## Relationships

- A **Wedding** has **Members** (each with one **Role**), **Functions**, **Households**, **Vendors**, one **Budget** and its **Sharing settings**.
- A **Function** is at one **Venue** and carries **Requirements**.
- A **Household** has one or more **Guests** and at most one active **Invitation link**.
- An **Invitation** joins one **Guest** to one **Function** and holds that guest's **RSVP**. A function's **Headcount** comes from its attending invitations.
- A **Vendor** has **Quotes**, **Commitments** and **Payments**. Totals use only the current version of each active commitment and non-void payment. Quotes, estimates and pending proposals never count.
- Publishing the **Draft itinerary** creates a **Publication** with the next **Published revision**. Guests and **Export jobs** read only the latest revision.
- Every applied **Command** writes exactly one **Activity entry** and moves the **Wedding version** once. A replay, a no-change result, a failure or a demo reset writes no entry.

## Names to avoid

Older notes use these names. Use the right-hand column.

| Old name | Use |
|---|---|
| `SUPABASE_SECRET_KEY`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `OPS_API_TOKEN`, `OPS_RECOVERY_TOKEN` | `JOBS_API_TOKEN` |
| `NUDGEBEE_WEBHOOK_URL` | `NUDGEBEE_EXPORT_WEBHOOK_URL` |
| `MIGRATION_DATABASE_URL` | `DATABASE_URL_SESSION` (port 5432) |
| Export status `running` | `rendering` (shown as "Rendering", or "Retrying" from attempt 2) |
| `/render/card/{publication_id}` | `/render/card/{job_id}?t=…` (the token signs the job id) |
| Realtime, channel `wedding:{wedding_id}`, topic `demo.reset` | Polling only. A demo reset writes no activity; its version bump refreshes screens |
| `auth.uid()` membership checks, RLS policies, SQL functions, RPCs | RLS on with zero policies; the server checks the signed-in user against `members.user_id` |
| Asset kind `invite_scan` | `couple_photo` only |
| Flags `voice_mode`, `voice_tts_enabled` | `voice_pilot`, `spoken_replies`; segment `voice_rollout` |
| `EXPORT_FAILURE_DRILL=once` | A sample wedding's id; the drill arms only on that sample wedding |
| `{result}` in the `export.retried` lines | Removed; the worker's own entry reports the result |
| Reception text "Dinner by Annapoorna Caterers." | "Dinner follows." |
| paise, `amount_paise` | whole rupees in `_inr` fields |
| `payment_revisions` | `payment_versions` |
| `applied_actions` | `command_receipts` |
| `actions.ts` | `commands.ts` |
| `db.query` | the core query builder |
| `flagsmith-nodejs` | `@flagsmith/nodejs` |
