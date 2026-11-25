# Jashn: domain and data contract

Prep note written at about 03:00 IST on Wed 25 Nov 2026, before FestiveHacks coding starts at 09:00. It is notes only (Rule 4): prose, tables and short JSON examples of payloads. It contains no SQL, TypeScript, config or pseudo-code. Lane A turns it into the schema and the dispatcher after 09:00; Lanes B, C and D build against it. Reconciled at 05:05 with the integration specs, and at about 05:50 and 06:15 with the lead decisions D1–D122 (`decisions.md`, which wins over this file); section 9 logs every change.

**Status: binding for names.** Every later document and every lane reuses the entity, table, field, enum, command, topic and error names in this file exactly. Where an earlier prep note used another name, section 0.3 lists the replacement. Where this file and `demo-data.md` disagree on a *data value* (a name, amount, date or count), `demo-data.md` wins; where they disagree on a *name or rule*, this file wins. Four exceptions: `spec/architecture.md` is the authority for the stack, routes and env var names; `spec/flagsmith.md` is binding for flag names and flag behaviour; `spec/export-and-recovery.md` is binding for the ops JSON shapes (5.2 to 5.5) and the export lifecycle; `spec/voice.md` (with flagsmith.md 3.2) wins on the voice path.

Read with: `scope.md` (binding feature list), `demo-data.md` (the dataset), `voice-test-set.md` (utterances), `spec/architecture.md`, `spec/voice.md`, `spec/flagsmith.md`, `spec/export-and-recovery.md` and `spec/doc-ai.md`. The research notes (`research-stack.md`, `research-nudgebee.md`, `research-flagsmith.md`) are background; where they differ from the spec files, the spec files win.

---

## 0. How to use this document

### 0.1 Conventions used everywhere

| Topic | Convention |
|---|---|
| Names | snake_case for tables, columns, JSON fields, enum values, commands and error codes. The same name is used in the database, the API JSON and the voice tool. No camelCase mapping layer in API payloads. |
| Ids | UUID v4. Live rows get the Postgres `gen_random_uuid()` default. Seeded rows get fixed name-based UUIDs from the sample copy and the row's `seed_key`: UUIDv5 under the namespace `75e13aff-00d4-427e-8e6b-7bd1798f1316`, with names of the form `<table>:<seed_key>` (for example `household:H16`). The helper `src/db/ids.ts` [A] ships in the contracts PR, and the fixtures and the seed both use it, so fixtures, tests and bookmarks agree after a wipe and reseed (D100). Every seeded row also carries a human-readable `seed_key` (such as `EVT-REC`, `PAY-01`, `PAY-01/v1`) from `demo-data.md` (5.0). |
| Money | Whole rupees as integers in columns and fields ending `_inr` (Postgres bigint). Never floats, never paise, never strings. Displayed only through the formatting rules in 2.1. The database client parses int8 and numeric values as JavaScript numbers (every value stays below 2^53); every SQL aggregate (SUM, COUNT) is cast to bigint; read models check that every `_inr` and count field is a safe integer before returning it, so no amount ever reaches a screen as a string. |
| Dates and times | Entered and shown in Asia/Kolkata (IST). Instants are stored as timestamptz in UTC; calendar dates (`paid_on`, `due_on`) as date. Command inputs use `date` = `YYYY-MM-DD` and `time` = `HH:MM` (24-hour, IST). |
| Tables | All application tables live in the Postgres schema `app` (architecture.md 3.2). Of Supabase's own schemas only `auth` and `storage` are used, as shipped; `realtime` is unused. |
| Writes | Domain writes only through the commands in section 3, via one server-side dispatcher. Forms, voice, the guest page, the card-import apply route and NudgeBee all call it. Operational tables (`voice_turns`, `experiment_exposures`, `card_imports`, `export_jobs`, `export_attempts`) are written by their owning server modules, never by the browser; when a screen must change, the same transaction uses Lane A's append-activity and bump-version helpers (architecture.md 3.3). |
| Reads | Only through the read models in section 4, built on the server. The browser never queries the database. |

### 0.2 Stack facts this contract assumes

- (`spec/architecture.md` is the authority.) One Next.js 16.4.6 app on Vercel Hobby, functions in `bom1` on Node 24.x. Each command runs in **one database transaction**.
- One Supabase Free project in Mumbai: Postgres, Auth (email and password, "Confirm email" off; guests have no account) and Storage (private buckets `uploads` and `exports`, signed URLs only).
- Only server code touches the database: Drizzle 0.45.4 over postgres 3.4.9, on schema `app`, which the Data API doesn't expose and which grants nothing to the API roles. RLS is on with zero policies.
- All authorization is one server guard plus one command dispatcher (6.1, 6.2): no SQL functions, no `SECURITY DEFINER`, no RPCs, no database triggers. Guest tokens are stored as SHA-256 hashes; every guest-token failure is the same 404.
- Live updates are polling only, with no Realtime (5.6): planner screens poll `GET /api/w/{wedding_id}/version` every 2.5 s, the guest page polls `GET /api/i/{token}/revision` every 10 s, and both refresh on tab focus. `/setup` is the one exception: no poll and no focus refresh (D79).
- Sarvam: `saaras:v4` (codemix) speech-to-text, `sarvam-105b` with the forced `propose_actions` tool, Bulbul speech, Document AI (Should #11).
- Flagsmith: `@flagsmith/nodejs` 9.5.0, remote evaluation; flags `voice_pilot`, `voice_writes_enabled`, `spoken_replies`, `setup_entry`, `env_label`, `export_failure_drill`, `card_renderer`, `image_extraction_provider` (flagsmith.md 3.0).
- Card export: Chromium only in `POST /api/ops/export-jobs/{job_id}/run`; NudgeBee calls the ops GET and retry routes with `JOBS_API_TOKEN` (3.7, 6.4). Env var names are architecture.md section 5's.

### 0.3 Names this document settles (earlier notes used other names)

| Earlier name (where) | Use instead |
|---|---|
| Money in integer paise, `amount_paise` (research-stack.md 6.2) | Whole rupees, `amount_inr` (the approved demo story requires rupee integers) |
| Payment corrected in place plus a `payment_revisions` row (research-stack.md 6.2) | Append-only `payment_versions`; the old version is never edited (rules C2 and C3) |
| `applied_actions`, `ops_requests` (research-stack.md) | `command_receipts` |
| `activity` table, `activity.summary` | `activity_entries`, with `summary_en` and `summary_hi` |
| Action kinds `event.update`, `payment.record` (research-stack.md contracts) | Command names: `update_event`, `record_payment` |
| `invitations.token_hash` + `invitation_events` (research-stack.md 6.4) | `invitation_links` (one per household, holds the token hash) + `invitations` (one row per guest per function, holds the RSVP) |
| `publish_schedule` (voice-test-set.md) | `publish_itinerary` |
| `export_card` (voice-test-set.md), `POST /api/exports` | `request_card_export` |
| `propose_expense` (voice-test-set.md) | Not a voice kind. A manager's money action is sent as `propose_change` by the server (rule A2) |
| `extract_invite` (voice-test-set.md) | Not a command and not a voice kind. Reading a card (Should #11) fills a draft in `card_imports`; nothing is saved until `set_wedding_profile` creates the wedding and `POST /api/card-imports/{import_id}/apply` runs `create_event` per function (doc-ai.md 1.5) |
| `confirm`, `cancel` (voice-test-set.md) | Voice-turn controls `confirm_voice_turn` and `cancel_voice_turn` (3.8), not domain commands |
| `query_balance`, `query_rsvp`, `query_changes` and the other `query_*` kinds | The read models in section 4 (mapping in 4.9) |
| `rate_inr`, `covers` | `unit_price_inr`, `quantity` (with `unit` = `plate`) |
| `type: advance`, `installment` | `payment_kind`: `advance`, `instalment`, `final` |
| `status` (RSVP), `rsvp: yes/no/pending` (research-sarvam.md) | `rsvp_status`: `attending`, `declined`, `pending` |
| `palette` | `theme` |
| `count` (requirements) | `quantity` |
| `kind` (event), `category` | `event_kind`; `vendor_category`, `requirement_category`, `budget_category` |
| `/api/ops/jobs/:id` (research-stack.md) | `/api/ops/export-jobs/{job_id}` and `/api/ops/export-jobs/{job_id}/retry` (research-nudgebee.md) |
| `OPS_RECOVERY_TOKEN` (research-nudgebee.md), `OPS_API_TOKEN` (research-stack.md env table) | `JOBS_API_TOKEN` (architecture.md 5) |
| `SUPABASE_SECRET_KEY`, the "publishable key" | `SUPABASE_SERVICE_ROLE_KEY` (server only); `NEXT_PUBLIC_SUPABASE_ANON_KEY` (the browser's only key) |
| `NUDGEBEE_WEBHOOK_URL` | `NUDGEBEE_EXPORT_WEBHOOK_URL` |
| `FLAGSMITH_SYNTHETIC_KEY`, `FLAGSMITH_INTERNAL_EMAILS`, `FLAGSMITH_WEBHOOK_SECRET` | `FLAGSMITH_SERVER_KEY_SYNTHETIC`, `INTERNAL_USER_EMAILS`; no Flagsmith webhook secret exists. `FLAGSMITH_SERVER_KEY` stays: each deployment's own key (architecture.md 5.2) |
| Export status `running` | `rendering` (export-and-recovery.md 2.1) |
| Render page `/render/card/{publication_id}?t=` | `/render/card/{job_id}?t=` (3.7, 6.4) |
| Realtime doorbell, channel `wedding:{wedding_id}` | None. Polling only (5.6) |
| `card:{wedding_id}:r{revision}:{format}`, `${publicationId}:${format}` | `export_key` = `export:{wedding_id}:rev{revision}:{format}` (demo-data.md 13.2) |
| `SYNTHETIC_RENDER_FAILURE` | `DRILL_INJECTED`, message "Injected fault (deliberate): renderer timeout" |
| Generic tool fields `target_id`, `title`, `date`, `time`, `venue`, `name`, `per_person_inr`, `headcount`, `notes` (research-sarvam.md 3.2) | Each voice action carries its command's own input fields (3.9) |
| `voice_attempts` (research-flagsmith.md) | `voice_turns` |
| Flags `voice_mode` and `voice_tts_enabled` (research-flagsmith.md) | `voice_pilot` (the mic and the `/api/voice/*` gate) and `spoken_replies`; the rollout segment is `voice_rollout`. flagsmith.md is binding for flag names (open question 6) |
| `card_export_fault_once` flag, `synthetic_failure_pending` column, `POST …/inject-failure` (research-flagsmith.md, research-nudgebee.md E4) | The `export_failure_drill` flag, read when a job is created; it arms the job (`fail_injection` `once`, `synthetic` true) only when enabled with a value equal to the job's `wedding_id` on an `is_sample` wedding (3.7). The env fallback `EXPORT_FAILURE_DRILL` holds a wedding id, not `once`. No inject route |
| Retry answering 409 `max_attempts` (research-stack.md) | HTTP 200 with outcome `not_retryable`: NudgeBee fails a step on any status of 400 or above |
| `WORKER_LOST` | `LEASE_EXPIRED` |
| Export trigger `owner` | `export_trigger`: `request`, `owner_retry`, `nudgebee` |
| Card path `exports/{wedding_id}/r{revision}.png`, artifact id `art_r7png` | Object key `{wedding_id}/card-rev{revision}.png` in bucket `exports` (keys never include the bucket name); `artifact_id` is the file name, `card-rev3.png` |
| Asset kind `invite_scan` | Removed. Card photos are never stored (doc-ai.md 3.1); `uploads` holds couple photos only |

---

## 1. Glossary (ubiquitous language)

UI words first; the code name follows in brackets.

| Term | Meaning |
|---|---|
| Wedding (`weddings`) | One planning workspace for one couple: names, city, main date, sharing settings. Everything else belongs to exactly one wedding. |
| Member (`members`) | A signed-in person who works in a wedding. Mira and Kabir are owners; Diya is a manager. Guests are never members. |
| Role (`member_role`) | `owner` (the couple or family: full control, publishes, approves spending) or `manager` (the event manager: edits the draft and logistics, proposes spending). |
| Function (`events`) | One ceremony or party: mehendi, haldi, sangeet, wedding or reception. The UI says "function" or "event"; the code says `event`. |
| Venue (`venues`) | A named space, such as "Lotus Hall" at "Mallige Gardens". A function points at one venue. |
| Draft itinerary | The current, editable function rows, venues, invitation wording and style. Members see it; guests never do. |
| Published revision | A numbered, frozen copy of the guest-visible part of the draft (REV-1, REV-2, REV-3). Guests and exported cards read only the latest one. |
| Publication (`publications`) | The record of one publish: revision number, snapshot, who published and when, and what changed. |
| Household (`households`) | A family unit that shares one invitation link, such as H16 Bhat (Tara alone) or H02 Deshpande (three people). Every guest belongs to one household. |
| Guest (`guests`) | One invited person. 40 named guests and 210 labelled synthetic placeholders in the demo. |
| Invitation (`invitations`) | One row per guest per function: "this guest is invited to this function". It also holds that guest's RSVP for that function. |
| Invitation link (`invitation_links`) | The private URL `/i/{token}` for one household. The token is random, stored only as a hash, and revocable. |
| RSVP | The response on an invitation row: `attending`, `declined` or `pending`, plus the number of plus-ones attending. Exactly one current RSVP per guest per function. |
| Headcount | People expected at a function: each attending guest counts 1 plus their attending plus-ones. |
| Vendor (`vendors`) | A business the family deals with (caterer, venue, decorator). A one-off payee, such as a boutique, is a vendor flagged `is_one_off`. |
| Quote (`quotes`) | A price a vendor offered. Never counted in any total. Annapoorna quoted ₹850 a plate. |
| Commitment (`commitments`) | An agreed amount with a vendor: a contract. Either `lump_sum` or `per_unit` (₹800 per plate × 250 plates). Its `amount_inr` is fixed when agreed and changes only by a new version. |
| Payment (`payments`) | Money the family records as paid to a vendor. Kinds: `advance`, `instalment`, `final`. Jashn records money; it never transfers it. |
| Payment version (`payment_versions`) | One immutable state of a payment. A correction adds version 2 and supersedes version 1; nothing is edited in place. |
| Payment correction | Fixing a recorded payment ("it was ₹40,000, not ₹50,000") by adding a new version of the same payment. Never a second payment. |
| Committed / paid / outstanding | Committed is the sum of current commitment amounts; paid is the sum of current payment amounts; outstanding is what is still owed (formulas in rule M4). |
| Budget (`budgets`, `budget_lines`) | What the family means to spend: one overall total plus optional amounts per category. |
| Estimate | What catering would cost at today's confirmed headcount: headcount × per-plate rate. Shown beside the contract, labelled "Estimate, not the contract". Never stored, never a total. |
| Contract | The commitment itself, as agreed. The demo's is ₹2,00,000, fixed. |
| Requirement (`requirements`) | A light note on a function, such as "Jain food for 12 guests", optionally linked to a vendor. Members only. |
| Shagun (`shagun_entries`) | A gift received, usually cash, with a thank-you status. Owners only. Never part of the expense ledger. |
| Proposal (`proposals`) | A manager's money change waiting for an owner: approved (it runs) or rejected (it doesn't). Never in totals while pending. |
| Activity entry (`activity_entries`) | One line in the history: who did what, when, with the before and after values, in English and Hindi. |
| Export job (`export_jobs`) | Rendering one invitation card image for one published revision and format. At most one per revision and format. |
| Voice turn (`voice_turns`) | One push-to-talk recording: transcript, proposed actions, and whether the speaker confirmed, cancelled or was refused. |
| Command | A named write, such as `correct_payment`. The only way anything changes. |
| Read model | A named server-side query with fixed formulas, such as `money_summary`. The only way numbers reach a screen or a spoken reply. |

---

## 2. Rules and invariants

Each rule has an id so tests, reviews and later documents can cite it. Every rule is checkable by a test or by reading one screen.

### 2.1 Money (M)

- **M1. Integers only.** Every money value is a whole number of rupees in an integer field ending `_inr`. A request carrying a fraction, an exponent, a string, a negative number or zero where a positive amount is required is rejected with `validation_failed`.
- **M2. Ranges.** A single amount (payment, commitment, quote, expense, shagun) is 1 to 1,00,00,00,000 (₹100 crore). `unit_price_inr` is 1 to 10,00,000. `quantity` is 1 to 1,00,000, and `unit_price_inr` × `quantity` must not exceed ₹100 crore. Budget totals and lines are 0 to 10,00,00,00,000.
- **M3. Per-unit totals are computed.** For a `per_unit` commitment the server computes `amount_inr` = `unit_price_inr` × `quantity` (800 × 250 = 2,00,000). If the input also carries `amount_inr` and it differs, the command fails with `amount_mismatch`. A `lump_sum` commitment carries `amount_inr` and no unit fields.
- **M4. Per-vendor figures.** Over non-deleted vendors only:
  - `committed_inr(v)` = sum of `amount_inr` of the **current version** of every **active** commitment of vendor v.
  - `paid_inr(v)` = sum of `amount_inr` of the **current version** of every **non-void** payment of vendor v.
  - `outstanding_inr(v)` = committed − paid when that is positive, else 0.
  - `overpaid_inr(v)` = paid − committed when that is positive, else 0.
- **M5. Wedding totals are sums of vendor figures.** `total_committed_inr`, `total_paid_inr`, `total_outstanding_inr` and `total_overpaid_inr` are the sums of M4 over all vendors. Total outstanding is never computed as total committed minus total paid, because one overpaid vendor must not hide another vendor's due. Check: total outstanding − total overpaid = total committed − total paid.
- **M6. Budget position.**
  - `budget_inr` is the overall budget (`budgets.total_inr`).
  - `uncommitted_inr` = budget − total committed when positive, else 0; `over_budget_inr` = total committed − budget when positive, else 0.
  - Per budget category: `planned_inr` from `budget_lines`, `committed_inr` = sum of committed over vendors in that category, with uncommitted and over-budget worked out the same way. A category with **no** `budget_lines` row is not a line of ₹0: it reports `has_line` false, `planned_inr` null, `uncommitted_inr` 0 and `over_budget_inr` 0, and never raises the `over_budget` warning. Only categories with a line can be over budget; the wedding-level check above still applies.
  - `unallocated_inr` = budget − sum of category lines when positive, else 0.
  - `pending_proposals_inr` = the sum of the committed amounts that pending proposals would add; `if_approved_committed_inr` = total committed + pending proposals. Neither is ever part of a total (A5).
- **M7. Display.** The rupee sign, Indian digit grouping, no decimals and no space: ₹1,60,000, ₹12,00,000, ₹1,20,00,000. Never "Rs.", "INR" or Western grouping. Owed amounts are never negative; an overpayment reads "Overpaid ₹5,000". Spoken Hindi amounts are built in code from crore, lakh, hazaar and sau words: 1,50,000 is "एक लाख पचास हज़ार रुपये" and 1,60,000 is "एक लाख साठ हज़ार रुपये". Amounts of ₹1,00,00,000 and above read the crore part first: ₹2,00,00,000 is "दो करोड़ रुपये" and ₹1,20,00,000 is "एक करोड़ बीस लाख रुपये" (never "एक सौ बीस लाख"); the number tests include both. voice.md 3.5 owns the word builder. Generated replies never use colloquial forms such as डेढ़ लाख, so they always match `demo-data.md` §14 (D22). Speakers may still say डेढ़ लाख or sava lakh, and Jashn must understand them (D75).
- **M8. Arithmetic lives in code.** Totals, balances, estimates and differences are computed by the read models (section 4). The LLM never computes a number, and a spoken or written reply uses only numbers a read model returned. Numbers the LLM extracts are inputs to validate and are shown beside the words that were heard.

### 2.2 Corrections and versions (C)

- **C1. Shape.** A payment is one identity row (`payments`) plus one or more versions (`payment_versions`). At every moment exactly one version is current (its `superseded_at` is empty).
- **C2. A correction appends,** in one transaction and in this order, because the one-current-version index (5.1) is a partial unique index, checked row by row and never deferrable:
  1. lock the payment (identity) row;
  2. set `superseded_at` on version n, so for a moment no version is current;
  3. insert version n+1 with the merged values (`superseded_at` empty);
  4. set `superseded_by_version_id` on version n to the new row's id, and set `payments.current_version_no` to n+1;
  5. write the activity entry and the receipt.

  Inserting n+1 before step 2 fails with a duplicate-key error and rolls the whole command back. C10 uses the same order.
- **C3. Versions are immutable.** No version's amount, date, method or note is ever updated. The only later changes to a version row are the two writes of C2: `superseded_at` (step 2) and `superseded_by_version_id` (step 4), each set once. No version is deleted (only `reset_demo` removes rows).
- **C4. Stale writes fail.** `expected_version` must equal `current_version_no`; otherwise the command fails with `stale_version` and returns the current version.
- **C5. Identity is fixed.** The vendor, the linked commitment and `payment_kind` never change between versions. A payment recorded against the wrong vendor is voided and recorded again.
- **C6. Totals use current versions.** After PAY-01 goes from ₹50,000 to ₹40,000, paid falls by exactly ₹10,000, the caterer still has exactly one payment, and PAY-01 has exactly two versions (voice-test-set X-01).
- **C7. The trail is visible.** The UI shows the current amount with the previous version's amount struck through beside it ("~~₹50,000~~ ₹40,000"), plus "Corrected by Mira, 25 Nov, 3:12 pm". History lists every version, oldest first, with who, when, the source and, for voice, the transcript.
- **C8. No-op corrections write nothing.** A correction whose values equal the current version returns outcome `unchanged`.
- **C9. Void instead of delete.** `void_payment` marks a payment void: it stays listed, struck through, labelled "Void", and it leaves the totals. A void cannot be undone. "Undo" on a just-saved payment receipt is a void. "Undo" on a correction is another correction back to the earlier values (version 3); version 2 stays in History.
- **C10. Commitments use the same pattern.** `commitments` plus `commitment_versions`, changed only by `update_commitment` (a new version) and `void_commitment`, with C1–C9 applied unchanged.

### 2.3 Estimate versus contract (E)

- **E1. When an estimate exists.** Only for an active commitment whose current version is `per_unit` with `unit` `plate` or `person`, and which is linked to a function (`event_id`). `record_commitment` fills a missing `event_id` (3.3), so a per-plate caterer recorded without naming a function still gets an estimate. Seeded COM-01 v1 is `per_unit`, `unit` `plate`, ₹800 × 250, `event_id` EVT-REC.
- **E2. Formula.** `estimate_inr` = `confirmed_headcount` of that function (R5) × the current `unit_price_inr`. 229 × ₹800 = ₹1,83,200; 230 × ₹800 = ₹1,84,000.
- **E3. Difference.** `difference_inr` = the absolute difference between the contract amount and the estimate, with `direction` `below`, `above` or `equal`: "₹16,000 below the contract. The contract changes only if you renegotiate it."
- **E4. Never stored, never totalled.** The estimate is computed on every read. It is never written to any table and never added to committed, paid, outstanding or budget figures.
- **E5. RSVPs never touch contracts.** No RSVP command reads or writes a commitment; a test checks the commitment rows are unchanged after `submit_rsvp` and `set_rsvp`.
- **E6. Labelling.** Always "Estimate, not the contract" (Hindi "अंदाज़ा, कॉन्ट्रैक्ट नहीं"), with the ≈ sign and the formula "230 attending × ₹800", in its own box beside the contract line.
- **E7. Planning numbers are not RSVPs.** A function's `expected_headcount` (250 for the reception) sizes contracts and halls. It is never used as an RSVP count or in an estimate.

### 2.4 RSVP and headcount (R)

- **R1. One row per guest per function.** `invitations` is unique on guest and function, and the row carries the RSVP. Creating an invitation creates its RSVP as `pending` with 0 plus-ones.
- **R2. Values.** `rsvp_status` is `attending`, `declined` or `pending`. `plus_ones` is 0 to the invitation's `max_plus_ones` when attending, and is forced to 0 otherwise.
- **R3. Plus-ones.** `max_plus_ones` defaults to 0, meaning no plus-one. Plus-ones are unnamed and have no rows of their own. Every demo invitation has `max_plus_ones` 0.
- **R4. Headcount.** An attending invitation counts 1 + `plus_ones`; declined and pending count 0.
- **R5. Counts per function.** Over active invitations (not revoked, guest not deleted): `invited` (rows), `attending`, `declined`, `pending` (rows by status) and `confirmed_headcount` (sum of R4). Every count is a count of stored rows; no total is ever typed in.
- **R6. Responses update; they never insert.** `submit_rsvp` and `set_rsvp` update the existing row. Answering again overwrites the earlier answer.
- **R7. Exactly once under concurrency.** The command locks the invitation rows it changes before writing. Two simultaneous submissions from two devices therefore run one after the other, the row still exists exactly once, and the count changes at most once. An answer equal to the stored one returns `unchanged` and writes nothing.
- **R8. Repeated taps replay.** A key names one exact request (I1). The guest page creates a key when it shows "Send reply" for a selection, reuses it only to resend that identical request (a double tap or a network retry, which replays the first result), and creates a new key whenever the selection or any field changes and after every response. So Tara's "Attending", then "Can't attend" without a reload, sends two keys and both apply.
- **R9. Guest scope.** A guest link answers only for guests in its household, and only for functions that are both in the latest published revision and actively invited. Anything else returns 404 `not_found`, identical to an unknown id.
- **R10. On behalf.** Owners and managers may record a response for any active invitation with `set_rsvp` (a phone call, say). The row records `responded_via` `member` and who did it.
- **R11. Revoke and re-invite.** Removing a guest from a function sets `revoked_at` on the row, which drops out of every count. Inviting them again clears `revoked_at` and resets the RSVP to `pending`.
- **R12. The demo check.** Tara's tap moves the reception from 229 to 230 attending and from 12 to 11 pending; the sangeet stays at 136; a second tap changes nothing (voice-test-set X-02).

### 2.5 Draft and publish (P)

- **P1. Edits go to the draft.** Owner and manager edits to guest-visible fields (P2) change the draft rows only, and increment `weddings.draft_version` in the same transaction.
- **P2. Guest-visible fields** are exactly the publication snapshot fields (5.3): the couple's names, city and main date; each function's kind, titles, start, end, muhurat, venue, dress code and description; each venue's name, place, locality, address and map link; the invitation style, wording, blessing line and couple photo.
- **P3. Only owners publish.** A manager calling `publish_itinerary` gets 403 `forbidden`; publishing is not proposable (voice-test-set E-06). The owner's publish is the owner's approval of the manager's draft changes.
- **P4. A publish freezes a revision.** `publish_itinerary` copies the guest-visible draft into a new `publications` row with revision = the previous revision + 1 and points `weddings.published_revision` at it. Publications are never edited or deleted.
- **P5. Guests read only the latest revision.** The guest page and the card renderer read only the publication whose revision equals `weddings.published_revision`, never the draft tables.
- **P6. Publish what was reviewed.** `expected_draft_version` must equal the current `draft_version`, or the command fails with `draft_changed` and returns the new change list.
- **P7. Nothing to publish.** If the draft equals the latest snapshot, the command returns `unchanged` and creates no revision.
- **P8. Unpublished changes** are the field-by-field differences between the draft and the latest snapshot, each with the published value ("was Banyan Hall") and who changed it last.
- **P9. Cards belong to a revision.** Once a newer revision exists, cards exported for older revisions are labelled "Out of date. Export a new card."
- **P10. Invitations are live, functions are published.** Who is invited takes effect immediately and is not part of the snapshot, but a guest only ever sees functions present in the latest publication. Only owners change who is invited (A3), because an invitation change alters what a guest link reveals without a publish.
  - **The card's function list is frozen per job.** `request_card_export` computes `card_event_ids` from live invitations when it creates the job (3.7): the published functions to which every invited guest has an active invitation, or every published function when nobody is invited. Every attempt of that job prints the same list.

### 2.6 Approvals (A)

- **A1. Gated for managers.** A manager must propose, and an owner runs directly: `record_commitment`, `update_commitment`, `void_commitment`, `record_payment`, `correct_payment`, `void_payment`, `record_expense`.
- **A2. How a manager proposes.** A manager calling a gated command directly gets 403 `approval_required`. Manager screens send `propose_change` with the command name and its input instead, and the voice confirm route does this wrapping itself when the speaker is a manager.
- **A3. Owner-only, not proposable:** `publish_itinerary`, updating the wedding profile, `set_budget_line`, `set_sharing`, `invite_member`, `revoke_member_invite`, `remove_member`, `set_invitations`, `create_invitation_links`, `revoke_invitation_link`, `record_shagun`, `mark_shagun_thanked`, `approve_proposal`, `reject_proposal` and `reset_demo`. A manager's `add_guest` is limited too (3.4): no `event_ids`, no `max_plus_ones`, and not into a household that has an active link. Managers keep `set_rsvp` (R10) and `set_dietary`.
- **A4. Lifecycle.** `pending` → `approved`, `rejected` or `withdrawn`, and every end state is final. Only an owner approves or rejects; only the proposer withdraws. Approval runs the stored input unchanged, as the approving owner, in the same transaction as the status change. If the command fails (for example `stale_version`), everything rolls back, the proposal stays pending and the owner sees the error; the owner can then reject it.
- **A5. Proposals change nothing until approved.** A pending proposal is never in any total and never changes any record. Screens show it as "Proposed" with "if approved" figures.
- **A6. One entry on approval.** Approval writes the executed command's own activity entry, marked with `proposal_id` and "proposed by Diya". Rejection and withdrawal write their own entries.
- **A7. Managers track their own proposals** through the `proposals` read model, even though money entries in the activity feed are owner-only (G7).

### 2.7 Privacy (G)

- **G1. A guest link is one household.** The token resolves to exactly one household, and the guest view (4.6) is built for that household only.
- **G2. A guest never receives:** any money figure, vendors, quotes, budget, shagun, requirements, proposals, the activity feed, members, other households or guests (not even counts), functions the household is not invited to (not even their names or how many there are), draft values, contacts, tokens, export jobs or conflict warnings.
- **G3. Allowlist projection.** The guest view is built by copying the allowed fields into a new object, never by deleting fields from a richer one, and its type has no money fields.
- **G4. Guest tokens open only guest routes.** `/i/{token}` and `/api/i/{token}/...` accept the token. Every other route ignores it. Money, planner, export and voice routes answer 401, and planner pages show the sign-in page. A function outside the household's scope, asked through the RSVP route, is 404 `not_found` (R9). A guest link never gets 403 (D35).
- **G5. No oracle.** An unknown, malformed or revoked token gets the same 404 body as any missing page.
- **G6. Guest pages** load no Supabase client, and send `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex` and `Cache-Control: private, no-store`, so the token never leaks through a Directions link.
- **G7. Manager sharing.** A manager reads the budget and wedding totals only if `managers_can_see_budget`, vendor money only if `managers_can_see_vendor_dues`, and guest phone numbers and emails only if `managers_can_see_guest_contacts`. A manager never reads shagun or owner-only activity entries. Seed values: vendor dues on, budget off, contacts off (demo-data.md 1.3).
- **G8. Secrets stay on the server.** `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `DATABASE_URL_SESSION`, `JOBS_API_TOKEN`, `SARVAM_API_KEY`, `FLAGSMITH_SERVER_KEY`, `FLAGSMITH_SERVER_KEY_PRODUCTION`, `FLAGSMITH_SERVER_KEY_SYNTHETIC`, `FLAGSMITH_ORG_API_KEY`, `FLAGSMITH_ID_SALT`, `INTERNAL_USER_EMAILS` (which holds personal data), `RENDER_TOKEN_SECRET` and `NUDGEBEE_EXPORT_WEBHOOK_URL` are never in `NEXT_PUBLIC_` variables, responses, logs or NudgeBee-visible output. The browser's only key is `NEXT_PUBLIC_SUPABASE_ANON_KEY` (6.2). architecture.md 5 is the full list.
- **G9. What leaves for Sarvam.**
  - A voice turn: the transcript and a snapshot filtered by the speaker's role (voice.md 1.9): references, names and the figures that speaker may see. Never phone numbers, emails, tokens, links, UUIDs or another household's data. Text in the snapshot that members or guests wrote is data, not instructions: the model can only propose, and every action is validated (V5) and shown on the card before anyone confirms.
  - A card read (Should #11): the photo, the fixed extraction schema, `language`, `output_format` and `mode`. Nothing from the database is ever sent (doc-ai.md 3.3).

### 2.8 Activity log (L)

- **L1. One entry per change.** Every command that changes state writes exactly one activity entry in the same transaction. Outcomes `unchanged` and `replayed`, and failed commands, write none. A refused voice write is recorded in `voice_turns`, not in the activity log. The one exception is `reset_demo`, which writes none (3.7); export worker results are system writes with their own entries (3.7), and the worker's claim (`queued` to `rendering`) moves `weddings.version` without an entry.
- **L2. Contents.** Who (`actor_type`, the member or household, `actor_label` as shown at the time), what (`command`, `topic`, `entity_type`, `entity_id`, `summary_en`, `summary_hi`), when (`occurred_at`), and the before and after values of the changed fields only (money as integers). Plus `source`, and for voice `voice_turn_id` and `spoken_text`, and for approvals `proposal_id`.
- **L3. Fixed templates.** Summaries come from the templates in section 3, filled in code. The LLM never writes an activity line.
- **L4. Append-only.** Entries are never edited. Only `reset_demo` removes them.
- **L5. Visibility.** Entries about money (commitments, payments, quotes, expenses, budget), shagun, members and invitation links are `owners`; everything else is `members`.
- **L5a. Contents follow visibility.** An entry's `before`, `after` and `spoken_text` must never carry what its visibility hides:
  1. any `set_wedding_profile` entry whose `before` or `after` carries `budget_inr` is `owners`, on create as well as on update (3.1);
  2. `spoken_text` is stored on a `members` entry only when every action of that voice turn wrote a `members` entry; otherwise it stays on `voice_turns` and on the `owners` entries;
  3. `guest_contacts` values (phone, email) are never copied into activity; an entry records only that a contact was added or changed;
  4. as a second check, `activity_feed` drops money, budget, contact and shagun fields from `before` and `after` when the reader is a manager (4.7).

  Test: after S-01/S-02 setup with a budget, and after a mixed event-and-payment voice turn, Diya's feed contains no rupee amount and no phone number.
- **L6. The poll cursor moves.** Every state change also increments `weddings.version` in the same transaction (5.6).

### 2.9 Voice (V)

- **V1. One write path.** A voice action is executed by the same dispatcher and the same command as the form, with `source` `voice` and the `voice_turn_id`.
- **V2. Explicit confirmation by the speaker.** Nothing is written until the member who spoke confirms, by tapping or with a fixed phrase matched in code ("haan, save karo"; voice.md 1.8), within 10 minutes. Another user, or an unknown turn id, gets 403 `forbidden` (voice.md 1.13); a late confirmation, or a confirm of a closed turn, gets 410 `voice_turn_expired` ("This request is closed."). Every voice-turn lookup (phrase confirm, phrase cancel, `context_turn_id`, `/api/voice/confirm`, `/api/voice/cancel`) is scoped to the request's `user_id` and `wedding_id` (empty for setup), so a turn open on another copy or another wedding is never found. A `context_turn_id` that fails that scope, or is 10 minutes old, is ignored.
- **V3. Kill switch, twice** (flagsmith.md 3.2, which wins here). Typed commands never check this flag.
  1. **Early, at `POST /api/voice/turn`.** When `voice_writes_enabled` is off and the validated proposal holds any write (including a manager's that would become `propose_change`), no confirmable preview is offered: the turn is stored `paused` with `refusal_code` `voice_writes_paused`, and the 200 response's `refused` event carries the fixed R-03 refusal line and the prefill (a list with one `{command, input, labels}` entry per action, 3.8). A question in the same turn is still answered. A spoken confirm of an open turn gets the same refusal.
  2. **Authoritative, in the dispatcher (3.0 step 4).** For every command with `source` `voice`, the guard reads the switch through the voice gate (`src/contracts/flags.ts`, Lane C's implementation, which fails closed: an unreadable flag counts as off). Off: nothing is written and the answer is 423 `voice_writes_paused` with `error.prefill` (3.8). The dispatcher returns its single action's entry; `/api/voice/confirm` rebuilds the full list from the stored turn before answering 423 (D121). This covers a preview shown before the flip and confirmed after it.
- **V4. Questions stay up.** Read-only questions are answered from read models, need no confirmation, and keep working while voice writes are off.
- **V5. Validate like typing.** Every proposed action is validated exactly like a typed input. Every id must exist in this wedding and be visible to the speaker. Missing values stay empty and are asked for, never guessed.
- **V6. Server-filled fields.** `expected_version` and `expected_draft_version` are filled by the server from the state it showed in the preview; the LLM never supplies them.
- **V7. Multi-action turns.** Actions run in order, each command in its own transaction with the idempotency key `{voice_turn_id}:{index}`. A failure stops the later actions and the result says what was saved. Confirming again is safe, because applied actions replay.
- **V8. Managers propose.** A manager's gated money actions are sent as `propose_change` (A2).
- **V9. Speak after commit.** A spoken reply after a write is built from read models after the transaction commits, never before.
- **V10. Voice is rate limited per user** before any Sarvam call: at most 12 turns a minute and 300 a day (voice.md 1.4 check 4), answering 429 `rate_limited`. This protects the Sarvam account's shared limit of about 60 calls a minute. The counts come from the user's `voice_turns` rows (last minute, last day), so they hold across server instances and need no new store. Reply-audio isn't rate-limited on its own: each turn's audio parts are capped by its stored speech parts (D121).
- **V11. Publishing stands alone.** A turn may hold at most 4 actions (voice.md 1.11), and `publish_itinerary` must be the only action in its turn. A turn that holds `publish_itinerary` with anything else is answered as a question ("One thing at a time, please: publishing goes on its own.") with nothing to confirm, so a spoken "haan" can never publish as a side effect of another change.

### 2.10 Idempotency and concurrency (I)

- **I1. Keys.** Every command accepts an `idempotency_key`: opaque text of 8 to 200 printable characters, **never validated as a UUID**. Section 3 marks where it is required. Its forms:
  - a client UUID (forms, review cards, "Send reply", the exports panel's Retry);
  - `{uuid}:{index}`: voice uses `{voice_turn_id}:{index}` (V7), and the card-import apply route uses `{import_id}:{index}` (doc-ai.md 1.5);
  - `proposal:{proposal_id}` (approval, 3.5);
  - `nb-{execution_id}-{job_id}` (NudgeBee).

  A key names one exact request. Clients create it when the confirmation is shown (the form's save button, the review card, "Send reply"), reuse it only to resend that identical request, and create a new one when any field changes and after every response (R8).
- **I2. Replay.** The same key, command, actor and request returns the stored response with outcome `replayed` and writes nothing. The same key with a different request fails with 409 `idempotency_key_reused`. The ops retry route reports a replay with `replayed` "true" and the stored `outcome` instead (export-and-recovery.md 5.3); "outcome `replayed`" applies to the dispatcher envelope only.
- **I2a. Under concurrency.** The receipt is looked up once before the transaction as a fast path, and again inside it after the first lock (3.0 step 6). A same-key request that arrives while the first is in flight waits on that lock, finds the receipt and replays; it never gets a 500 or a `stale_version`. Receipts are stored for every outcome that the command defines, including no-change ones such as the retry's `already_succeeded`.
- **I3. Same transaction.** The receipt is written in the transaction that makes the change, so a crash leaves both or neither.
- **I4. Optimistic versions.** `update_event`, `update_commitment`, `void_commitment`, `correct_payment` and `void_payment` require `expected_version`; `publish_itinerary` requires `expected_draft_version`.

---

## 3. Command catalog: the only write path

### 3.0 How every command runs

**One dispatcher.** Every write calls one server-side dispatcher with: the actor, the wedding, the command name, the input, the `idempotency_key`, the `source` and, for voice, the `voice_turn_id`. research-stack.md calls this function `applyAction`; its action names are the command names below. Transports:

| Caller | Transport | Actor |
|---|---|---|
| Planner screens (forms, buttons) | The one server action `dispatchCommand` (`src/server/actions/dispatch.ts` [A], `'use server'`), which takes the request envelope below and returns the response envelope. Server components pass it to client forms as a prop; lanes never write their own command wrappers (D98) | The signed-in member |
| Voice | `POST /api/voice/confirm` (3.8), which calls the dispatcher once per action | The member who spoke |
| Card reading (Should #11) | `POST /api/card-imports/{import_id}/apply`, which runs `create_event` once per function with keys `{import_id}:{index}` (doc-ai.md 1.5) | The uploader, now an owner |
| Exports panel | `POST /api/w/{wedding_id}/exports` (`request_card_export`, owner or manager) and `POST /api/w/{wedding_id}/exports/{job_id}/retry` (`retry_card_export`, owner; `wait` 0, an idempotency key per press) | The signed-in member |
| Guest page | `POST /api/i/{token}/rsvp` and `POST /api/i/{token}/dietary` | The household resolved from the token |
| NudgeBee | `POST /api/ops/export-jobs/{job_id}/retry` with `Authorization: Bearer <JOBS_API_TOKEN>` | `system` (label "NudgeBee") |
| Tests and scripts | `POST /api/w/{wedding_id}/commands/{command}` with a member session | The signed-in member |

Voice and the generic command route may also run `request_card_export`: the worker is kicked after commit wherever the command ran, so no transport refuses an export command. The same bearer token also guards the internal worker route `POST /api/ops/export-jobs/{job_id}/run`, which is not a transport: it claims and finishes jobs through Lane D's job module (3.7). Operational tables are written outside the dispatcher (0.1, Writes row).

**Actor context.** The resolved actor carries the member row (id, role, display name) and, for a signed-in user, the user's email, server-only, so Lane C can compute `is_internal` for Flagsmith (flagsmith.md 2.3). The email is never sent to Flagsmith, logged or returned. The contracts PR ships the session helper's final signature as a stub, `src/server/auth/session.ts` [A], returning the fixture member with these fields; Lane A replaces the body in `lane-a-dispatcher` (D96).

**Order of checks, every time:**
1. Resolve the actor: the session's user id (the `sub` claim from `getClaims()`) to a member of this wedding (6.2), a guest token to a household (6.3), or the ops token (6.4). Failure: 401 `unauthenticated` (guest routes: 404 `not_found`, G5).
2. Check the role against the matrix in 6.1. Failure: 403 `forbidden`, or `approval_required` for a manager on a gated command (A2).
3. Validate the input: types, ranges, required fields, and that every id belongs to this wedding and is visible to this actor. Failure: 422 `validation_failed` (or a specific code below); a hidden id is 404 `not_found`.
4. For voice: the turn belongs to this member and is under 10 minutes old (V2), then the kill switch through the voice-gate interface in `src/contracts/flags.ts`, which Lane C implements and which fails closed (V3, flagsmith.md 6.8). The contracts stub fails closed too: until Lane C's real gate merges in `lane-c-voice` at 10:45, it refuses every voice write and never answers "enabled" (D47).
5. Look up the receipt for the idempotency key (I2), as a fast path.
6. One transaction. Its first statement locks this wedding's `weddings` row (every command updates that row anyway, L6), so writes for one wedding run one at a time. Then: re-check the receipt (a hit returns `replayed`, I2a); lock the rows being changed; check expected versions; apply the change; write the activity entry; increment `weddings.version` (and `draft_version` where P1 applies); write the receipt. With the wedding row locked first, RSVPs that change several rows can't deadlock, and `publish_itinerary` reads the draft under the same lock as its `draft_version` check. Guest commands take the same lock. Only a `set_wedding_profile` create has no wedding row yet, so it starts at the receipt check.
7. After commit, in `after()`, never failing the command: the export kick when the command queued a job (3.7), Lane C's `setup_saved` conversion when `set_wedding_profile` created a wedding (3.1, flagsmith.md 5.4), and the read models a spoken reply needs (V9). The export kick runs through the after-commit map (D53, D101): its types (`AfterCommitHandler` and the map type) are in `src/contracts/services.ts`, and the map is a static export in `src/server/jobs/after-commit.ts` [D], which the contracts PR ships empty. Lane A's dispatcher imports it statically and runs the committed command's entry in `after()`; Lane D adds the export kick there at 11:40. Nothing registers itself by an import side effect. The setup-saved hook is the contracts no-op stub from 10:45 until Lane C's real conversion lands in the 11:40 batch (D39). The ops retry route is the one exception: it kicks `/run` before its wait loop, not in `after()` (3.7, D53). The NudgeBee failure webhook is sent by the export worker after a failed attempt (export-and-recovery.md 2.8), never by the dispatcher.

**Request envelope** (`dispatchCommand` takes the same fields):

```json
{
  "wedding_id": "0b7c…",
  "command": "correct_payment",
  "input": { "payment_id": "5d2e…", "expected_version": 1, "amount_inr": 40000 },
  "idempotency_key": "a41f…:0",
  "source": "voice",
  "voice_turn_id": "a41f…"
}
```

**Response envelope:**

```json
{
  "ok": true,
  "outcome": "applied",
  "command": "correct_payment",
  "result": { "payment_id": "5d2e…", "version_no": 2, "amount_inr": 40000,
              "vendor_totals": { "committed_inr": 200000, "paid_inr": 40000, "outstanding_inr": 160000 } },
  "activity_entry_id": "c9a0…",
  "version": 1043,
  "warnings": []
}
```

**Outcomes:** `applied` (200), `proposed` (202, only from `propose_change`), `replayed` (200, I2) and `unchanged` (200: nothing differed, nothing written).

**Error codes** (body: `{"ok": false, "error": {"code", "message", "field", "current", "prefill"}}`; `current` carries the fresh record for 409s; `prefill` appears only on 423 `voice_writes_paused`, inside `error`, in the shape of 3.8). Voice refusal codes in stream events (`voice_writes_paused`, `forbidden`, `not_shared`) are stored in `voice_turns.refusal_code`; `not_shared` is a voice refusal only, never an HTTP error (voice.md 0.2):

| Code | HTTP | When |
|---|---|---|
| `unauthenticated` | 401 | No valid session, or a bad ops token |
| `forbidden` | 403 | The role may not run this command (6.1) |
| `approval_required` | 403 | A manager ran a gated command directly; send `propose_change` |
| `not_found` | 404 | Unknown id, an id from another wedding, an id the actor may not see, an unknown or revoked guest token |
| `validation_failed` | 422 | Bad input; `field` names it, `message` says why (`required`, `out_of_range`, `not_integer`, `year_required`, `time_order`, `too_long`, `unknown_value`) |
| `amount_mismatch` | 422 | Per-unit amount differs from rate × quantity (M3) |
| `plus_ones_exceeds_limit` | 422 | `plus_ones` above the invitation's `max_plus_ones` |
| `stale_version` | 409 | `expected_version` is not current (C4) |
| `draft_changed` | 409 | `expected_draft_version` is not current (P6) |
| `idempotency_key_reused` | 409 | Same key, different request (I2) |
| `payment_void`, `commitment_void` | 409 | Changing a voided record |
| `proposal_not_pending` | 409 | Deciding a proposal that is already decided |
| `duplicate_vendor`, `duplicate_requirement` | 409 | Same name (vendor) or same text and quantity on the same function (requirement) |
| `not_invited` | 409 | A member set an RSVP for a guest not invited to that function |
| `nothing_published` | 409 | Card export before any publish |
| `proposal_changed` | 409 | Approving a proposal whose payee or any shown value no longer matches the current state (3.5) |
| `already_member`, `invite_invalid` | 409, 404 | Member invites |
| `last_owner` | 409 | `remove_member` on the wedding's only owner |
| `voice_turn_expired` | 410 | Confirmation after 10 minutes, or of a closed turn ("This request is closed.") |
| `expectation_failed` | 412 | Ops GET with `expect=succeeded` when the job hasn't succeeded after the wait (export-and-recovery.md 5.2) |
| `voice_writes_paused` | 423 | Kill switch off, or unreadable, at the dispatcher (V3); `error.prefill` is the list of every action's `{command, input, labels}` (3.8) |
| `voice_unavailable` | 403 | Voice is not on for this user: flag `voice_pilot` off (flagsmith.md 3.1), or Flagsmith can't be read and the user isn't internal (flagsmith.md 6.8) |
| `demo_reset_disabled`, `not_sample_wedding` | 403 | `reset_demo` guards |
| `rate_limited` | 429 | Guest routes over their limits (6.3); voice routes over 12 turns a minute or 300 a day per user (V10). Limits counted in instance memory are best effort; tests check only that a burst gets 429s |
| `internal_error` | 500 | Anything else; nothing was written |

**Template placeholders** in activity text: `{actor}` is `actor_label`; `{vendor}` the vendor name; `{event}` the function word in a sentence ("the reception"; an `other` function uses its title); `{event_hi}` its `title_hi`; `{old}` and `{new}` are formatted per M7 or as "Mon 14 Dec, 7:30 PM"; `{kind}` and `{kind_hi}` are advance/एडवांस, instalment/किस्त, final payment/आख़िरी भुगतान.

**Input types:** `uuid`; `key` (an idempotency key, I1: opaque text of 8 to 200 characters, never checked as a UUID); `text(n)` (trimmed, 1 to n characters); `inr` (integer rupees, M1–M2); `int`; `bool`; `date` (`YYYY-MM-DD`); `time` (`HH:MM`, IST); an enum name from 5.2; `list of X`. "Server-filled for voice" marks fields the server supplies (V6).

### 3.1 Wedding, budget and members

#### `set_wedding_profile` (voice kind)
- **Who:** creating (no `wedding_id` in the envelope): any signed-in user, who becomes its owner. Updating: owner. Manager: 403 `forbidden`.
- **Inputs:**

| Field | Type | Required | Validation |
|---|---|---|---|
| `bride_name` | text(60) | on create | |
| `groom_name` | text(60) | on create | |
| `wedding_date` | date | on create | The year must have been given or confirmed (the voice layer never fills a missing year); 2026-01-01 to 2030-12-31 |
| `city` | text(60) | no | |
| `budget_inr` | inr | no | 0 to 10,00,00,00,000; writes `budgets.total_inr` |
| `expected_guests` | int | no | 0 to 5,000 |
| `setup_opened_at` | timestamp | no | Create only; feeds the Flagsmith "seconds to save" value |

- **Effects:** create inserts the wedding, the owner's `members` row, a `budgets` row, an `invite_styles` row with defaults and sharing flags all off. Update changes the given fields; names, city and date are guest-visible (P1).
- **Activity:** create: "{actor} created the wedding of {bride_name} and {groom_name}, {wedding_date}, {city}." / "{actor} ने {bride_name} और {groom_name} की शादी जोड़ी: {wedding_date}, {city}।" Its visibility is `members` when no `budget_inr` was given, and `owners` when it was, because `after` then holds the budget (L5a). Update, members: "{actor} changed the wedding details: {changes}." / "{actor} ने शादी की जानकारी बदली: {changes}।" Still one entry (L1) when the budget changes too, but then its visibility is `owners`; a budget-only change reads "{actor} changed the budget from {old} to {new}." / "{actor} ने बजट {old} से बदलकर {new} किया।" with topic `budget.updated`.
- **Topic:** `wedding.created`, `wedding.updated`. **Idempotency:** required on create.
- **Errors:** `validation_failed` (`year_required`), `forbidden`.
- **After commit** (flagsmith.md 5.4): Lane C's hook sends the `setup_saved` conversion only for a create with outcome `applied`, by a non-internal user who now owns exactly one wedding; never for `replayed` or `unchanged`. Its value is the whole seconds since `experiment_exposures.exposed_at` (or since `setup_opened_at` when there is no exposure row), clamped to 0–3600. It runs in `after()` and never fails the command.
- **Card reading** (Should #11): a card's functions are saved by `POST /api/card-imports/{import_id}/apply` after this command creates the wedding, never through `/api/voice/confirm` (3.8).

#### `set_budget_line`
- **Who:** owner only.
- **Inputs:** `budget_category` (enum, required); `planned_inr` (inr 0 to 10,00,00,00,000, required). Upsert, one line per category.
- **Activity** (owners): "{actor} set the {category} budget to {new} (was {old})." / "{actor} ने {category_hi} का बजट {old} से बदलकर {new} किया।" **Topic:** `budget.updated`. **Idempotency:** optional.

#### `set_sharing`
- **Who:** owner only.
- **Inputs** (at least one): `managers_can_see_vendor_dues`, `managers_can_see_budget`, `managers_can_see_guest_contacts` (bool).
- **Activity** (owners): "{actor} changed what managers can see: {changes}." / "{actor} ने बदला कि मैनेजर क्या देख सकते हैं: {changes}।" **Topic:** `sharing.updated`.

#### `invite_member`
- **Who:** owner only.
- **Inputs:** `email` (text(120), valid address, required); `role` (`member_role`, required); `display_name` (text(60)).
- **Effects:** a `member_invites` row with a new 256-bit token stored only as a SHA-256 hash, expiring in 48 hours. The join token is the only credential: with "Confirm email" off, anyone can sign up with any address, so the email match in `accept_member_invite` proves nothing on its own. The response carries `join_url` (`/join/{token}`) once; the receipt stores the response without it, so a replay returns `token_already_issued: true`.
- **Activity** (owners): "{actor} invited {email} as {role}." / "{actor} ने {email} को {role_hi} के रूप में बुलाया।" (owner मालिक, manager इवेंट मैनेजर). **Topic:** `member.invited`. **Idempotency:** required.
- **Errors:** `already_member`.

#### `accept_member_invite`
- **Who:** a signed-in user whose email equals the invite's email (case-insensitive).
- **Inputs:** `token` (text(64), required).
- **Effects:** a `members` row with the invited role; the invite is marked accepted.
- **Activity** (owners, so an unexpected join is visible to the owners): "{email} accepted the invite as {role}." / "{email} ने {role_hi} के रूप में न्योता स्वीकार किया।" **Topic:** `member.joined`.
- **Errors:** `invite_invalid` (unknown, expired, revoked or used), `forbidden` (email mismatch), `already_member`.

#### `revoke_member_invite`
- **Who:** owner only (A3).
- **Inputs:** `member_invite_id` (uuid, required).
- **Effects:** sets `revoked_at` on a pending invite; its join link answers `invite_invalid` at once.
- **Activity** (owners): "{actor} cancelled the invite to {email}." / "{actor} ने {email} का न्योता रद्द किया।" **Topic:** `member.invite_revoked`. **Idempotency:** optional.
- **Errors:** `invite_invalid` (already accepted, revoked or expired), `not_found`.

#### `remove_member`
- **Who:** owner only (A3).
- **Inputs:** `member_id` (uuid, required).
- **Effects:** sets `members.removed_at`. From the next request the removed member fails every check (6.2): no reads, no writes, no voice, and the version poll answers 403. Refuses to remove the wedding's last owner (409 `last_owner`).
- **Activity** (owners): "{actor} removed {member} from the wedding." / "{actor} ने {member} को शादी से हटाया।" **Topic:** `member.removed`. **Idempotency:** optional.
- **Errors:** `last_owner`, `not_found` (unknown or already removed).

**Who builds member management (D64, D109).** Lane A6 adds the `remove_member` and `revoke_member_invite` handlers beside `invite_member` and `accept_member_invite`. Lane B builds the owner's invite and sharing controls, and the one-time display of `join_url`, in its planner subtree, through Lane A's server action: an owners-only Team and sharing sheet opened from the shell's wedding menu, with no new route segment. It is B4's sheet at 13:45, after A6 (12:30), and it reads `team` and the household link fields (4.11, 4.4). The `/join/[token]` page stays with Lane A (acceptance AT-8.1). Must 8's demo doesn't depend on the sheet: the seed creates Diya's membership (D68).

### 3.2 Functions, venues, the invitation and publishing

**Who builds these (D41).** `update_invite_style` and `publish_itinerary` are Lane D's handlers in `src/server/invite/handlers.ts`, as are `request_card_export` and `retry_card_export` (3.7). Lane A's dispatcher calls them; no note gives `publish_itinerary` to Lane A. `publish_itinerary` builds and diffs its snapshot with Lane A's pure module `src/db/itinerary-snapshot.ts` (A1, 10:45; 5.3), and Lane D never writes a second builder (D95). `create_event`, `update_event` and `add_asset` are Lane A's, and the draft venue change (`update_event`) ships by 11:40.

#### `create_event` (voice kind)
- **Who:** owner, manager. Writes the draft.
- **Inputs:**

| Field | Type | Required | Validation |
|---|---|---|---|
| `event_kind` | enum | yes | `mehendi`, `haldi`, `sangeet`, `wedding`, `reception`, `other` |
| `title` | text(40) | for `other` | Defaults to the kind's English name |
| `title_hi` | text(40) | no | Defaults to मेहंदी, हल्दी, संगीत, विवाह, रिसेप्शन |
| `event_date` | date | yes | 2026 to 2030 |
| `start_time`, `end_time` | time | no | End after start, same calendar day |
| `muhurat_time` | time | no | Between start and end when both exist |
| `venue_id` | uuid | no | A venue of this wedding |
| `venue_name` | text(80) | no | Used when `venue_id` is absent. Matched after normalising case, spaces and punctuation: a venue matches when the text equals its `name`, equals "{name}, {place_name}" or "{name} at {place_name}", or holds exactly one saved venue's distinctive word ("Lotus" for Lotus Hall; voice.md 2.5). Exactly one match: its `venue_id` is used and shown in the preview. Several: the preview asks which one (voice: `clarify`). None: a new venue with only a name is created and the preview says "New venue" |
| `dress_code` | text(120) | no | |
| `description` | text(500) | no | |
| `lead_name` | text(60) | no | The function lead, a person's name (not a role) |
| `expected_headcount` | int | no | 0 to 5,000; planning only (E7) |

- **Effects:** inserts the function (version 1) and any new venue; increments `draft_version`. The result lists any `warnings` of kind `overlap` or `over_capacity` (4.3).
- **Activity** (members): "{actor} added the {event} on {when} at {venue}." / "{actor} ने {event_hi} जोड़ा: {when}, {venue}।" With no venue: "{actor} added the {event} on {when}." / "{actor} ने {event_hi} जोड़ा: {when}।" **Topic:** `event.created`. **Idempotency:** optional; the card-import apply route sends `{import_id}:{index}` (I1).

#### `update_event` (voice kind)
- **Who:** owner, manager. Writes the draft.
- **Inputs:** `event_id` (uuid, required); `expected_version` (int, required; server-filled for voice); then any `create_event` field except `event_kind`. Sending `null` clears an optional field (`end_time`, `muhurat_time`, `venue_id`, `dress_code`, `description`, `lead_name`). At least one field must change.
- **Effects:** updates the fields and increments the function's `version`; increments `draft_version` when a guest-visible field changed (`lead_name` and `expected_headcount` are not guest-visible).
- **Activity** (members). A venue change: "{actor} moved the {event} from {old_venue} to {new_venue}." / "{actor} ने {event_hi} का स्थान {old_venue} से बदलकर {new_venue} किया।" A time change: "{actor} changed the {event} time from {old} to {new}." / "{actor} ने {event_hi} का समय {old} से बदलकर {new} किया।" Anything else: "{actor} changed the {event}: {changes}." / "{actor} ने {event_hi} में बदलाव किया: {changes}।" If several fields change, the venue line wins, then the time line; `before` and `after` carry every field.
- **Topic:** `event.updated`. **Idempotency:** optional.
- **Errors:** `stale_version` (returns the current function and who changed it last), `validation_failed`.

#### `update_invite_style` (voice kind)
- **Who:** owner, manager. Writes the draft.
- **Inputs** (at least one): `theme` (`maroon_gold`, `peacock_gold`); `typeface` (`eczar`, `tiro_devanagari`); `layout` (`card_with_inserts`, `one_card`, `facing_pages`); `photo_frame` (`mounted`, `arch`); `photo_asset_id` (uuid of a `couple_photo` asset of this wedding, or `null` to remove); `heading_hi` (text(40), default "शुभ विवाह"); `wording_en`, `wording_hi` (text(600)); `blessing_line` (text(80), `null` = none, the default). `wording_en` holds two paragraphs separated by one blank line: the card prints the first above the couple's names and the second below them; with no blank line, everything prints above (export-and-recovery.md 1.2).
- **Effects:** updates `invite_styles`; increments `draft_version`.
- **Activity** (members): "{actor} changed the invitation: {changes}." / "{actor} ने निमंत्रण बदला: {changes}।" **Topic:** `invite_style.updated`.

#### `add_asset`
- **Who:** owner, manager.
- **Flow:** `POST /api/uploads/sign` returns `asset_id`, the object key `{wedding_id}/{asset_id}.{ext}` in bucket `uploads` and a signed upload URL; the browser uploads straight to Storage with `NEXT_PUBLIC_SUPABASE_ANON_KEY` and that signed URL; then the client runs `add_asset`.
- **Inputs:** `asset_id` (uuid from the sign step); `asset_kind` (`couple_photo`, the only kind); `mime_type` (`image/jpeg`, `image/png`, `image/webp`); `bytes` (int, at most 10 MB); `width`, `height` (int, optional). The server checks that the object exists at that key with that size, and stores the key (without the bucket name) in `assets.storage_path`.
- **Effects:** inserts `assets`. A photo reaches guests only when the style references it and an owner publishes. Invitation-card photos (Should #11) are never stored and never become assets (doc-ai.md 3.1).
- **Activity** (members): "{actor} added a couple photo." / "{actor} ने जोड़े की फ़ोटो जोड़ी।" **Topic:** `asset.added`.

#### `publish_itinerary`
- **Who:** owner only. Manager: 403 `forbidden`, not proposable (P3). Voice: owners only, with the review sheet as the preview.
- **Inputs:** `expected_draft_version` (int, required; server-filled for voice); `note` (text(200)).
- **Effects:** builds the snapshot with Lane A's builder (5.3, D95), inserts `publications` with revision = previous + 1 and the `changes` list against the previous revision, and sets `weddings.published_revision`. Older cards become out of date (P9; computed, nothing written).
- **Activity** (members): "{actor} published the schedule, revision {n}: {changes}." / "{actor} ने कार्यक्रम प्रकाशित किया, संस्करण {n}: {changes}।" For REV-3 the change reads "reception venue Banyan Hall to Lotus Hall".
- **Topic:** `itinerary.published`. **Idempotency:** required.
- **Errors:** `forbidden`, `draft_changed` (returns the current `draft_version` and change list), `validation_failed` (`no_functions`). Nothing changed: outcome `unchanged`.

### 3.3 Vendors and money

Every command in this group except `add_vendor` and `update_vendor` writes an `owners` activity entry (L5), and every money command returns the vendor's M4 figures in `result.vendor_totals`, so the confirmation and the spoken reply need no second read.

#### `add_vendor` (voice kind)
- **Who:** owner, manager.
- **Inputs:**

| Field | Type | Required | Validation |
|---|---|---|---|
| `name` | text(80) | yes | Unique within the wedding, ignoring case and surrounding spaces |
| `vendor_category` | enum | yes | A `budget_category` value (5.2); it decides which budget line the vendor's money counts against |
| `status` | enum | no | `considering` (default), `booked`, `cancelled` |
| `contact_name` | text(60) | no | |
| `contact_phone` | text(20) | no | Digits, spaces and a leading +; stored as entered |
| `event_ids` | list of uuid | no | Functions of this wedding the vendor serves (stored in `vendor_events`) |
| `notes` | text(500) | no | |

- **Effects:** inserts the vendor and its `vendor_events` rows.
- **Activity** (members): "{actor} added the vendor {vendor} ({category})." / "{actor} ने वेंडर {vendor} जोड़ा ({category_hi})।" **Topic:** `vendor.added`. **Idempotency:** optional.
- **Errors:** `duplicate_vendor` (409, `current` carries the existing vendor so voice can offer it instead), `validation_failed`.

#### `update_vendor`
- **Who:** owner, manager.
- **Inputs:** `vendor_id` (uuid, required) and at least one `add_vendor` field. `event_ids`, when sent, replaces the whole set. Last write wins; there is no `expected_version`.
- **`vendor_category` is fixed once money exists.** When the vendor has an active commitment or a non-void payment, changing `vendor_category` fails with `validation_failed` on `vendor_category`, so a manager can't move committed money between budget lines without an owner.
- **Activity** (members): "{actor} updated the vendor {vendor}: {changes}." / "{actor} ने वेंडर {vendor} की जानकारी बदली: {changes}।" **Topic:** `vendor.updated`.
- **Errors:** `duplicate_vendor`, `not_found`, `validation_failed`. Cancelling a vendor does not void its commitments; the owner voids them separately.

#### `add_quote`
- **Who:** owner; a manager only while `managers_can_see_vendor_dues` is on (otherwise 403 `forbidden`). Not gated: a quote never counts in a total.
- **Inputs:** `vendor_id` (uuid, required); `pricing` (`lump_sum` or `per_unit`, required); for `per_unit`: `unit`, `unit_price_inr` and `quantity` (required), with `amount_inr` computed as in M3; for `lump_sum`: `amount_inr` (required); `event_id` (uuid, optional); `description` (text(200)); `quoted_on` (date, default today in IST); `valid_until` (date, optional).
- **Effects:** inserts a quote with `quote_status` `open`.
- **Activity** (owners): "{actor} added a quote from {vendor}: {amount}." / "{actor} ने {vendor} का कोटेशन जोड़ा: {amount}।" **Topic:** `quote.added`.
- **Errors:** `amount_mismatch`, `validation_failed`, `forbidden`.

#### `record_commitment` (voice kind, gated: A1)
- **Who:** owner. Manager: 403 `approval_required`; send it through `propose_change`.
- **Inputs:**

| Field | Type | Required | Validation |
|---|---|---|---|
| `vendor_id` | uuid | yes | A vendor of this wedding |
| `pricing` | enum | yes | `lump_sum` or `per_unit` |
| `unit` | enum | per_unit | `plate`, `person`, `item`, `hour`, `day` |
| `unit_price_inr` | inr | per_unit | 1 to 10,00,000 (M2) |
| `quantity` | int | per_unit | 1 to 1,00,000 |
| `amount_inr` | inr | lump_sum | For `per_unit` it may be sent only as a check; it must equal `unit_price_inr` × `quantity` (M3) |
| `event_id` | uuid | see rule | The function it is for (E1). When omitted, the server fills it: the linked quote's `event_id` if it has one, else the vendor's only function in `vendor_events`; the preview shows "For: Reception". When `pricing` is `per_unit` with `unit` `plate` or `person` and no function can be found that way, `event_id` is required (`validation_failed`, `required`; voice puts it in `missing_fields` and asks which function). The same rule applies when the command arrives through `propose_change` |
| `description` | text(200) | no | The basis, such as "250 covers × ₹800, fixed minimum" |
| `quote_id` | uuid | no | An `open` quote of the same vendor; it becomes `accepted` |
| `agreed_on` | date | no | Default today (IST) |
| `due_on` | date | no | When the balance is due; drives `due_state` (4.2) |

- **Effects:** inserts the commitment (`current_version_no` 1) and `commitment_versions` version 1; marks the quote `accepted`; moves the vendor from `considering` to `booked`. A vendor may hold several active commitments.
- **Activity** (owners): per unit: "{actor} agreed {amount} with {vendor} ({quantity} {unit}s × {unit_price})." / "{actor} ने {vendor} के साथ {amount} तय किया ({quantity} × {unit_price})।" Lump sum: "{actor} agreed {amount} with {vendor}." / "{actor} ने {vendor} के साथ {amount} तय किया।"
- **Warnings:** `over_budget` when the vendor's category goes over its budget line (M6).
- **Topic:** `commitment.recorded`. **Idempotency:** required.
- **Errors:** `amount_mismatch`, `validation_failed`, `approval_required`, `not_found`.

#### `update_commitment` (voice kind, gated)
- **Who:** owner; manager through `propose_change`.
- **Inputs:** `commitment_id` (uuid, required); `expected_version` (int, required; server-filled for voice); and at least one of `pricing`, `unit`, `unit_price_inr`, `quantity`, `amount_inr`, `event_id`, `description`, `agreed_on`, `due_on`. The new version is the current version with these fields replaced, and M3 applies to the result. `vendor_id` and `quote_id` never change (C5).
- **Effects:** appends version n+1 and supersedes version n (C2, C10). Voice test M-08 gives COM-04 version 2 at ₹1,25,000.
- **Activity** (owners): amount changed: "{actor} changed the agreed amount with {vendor} from {old} to {new}." / "{actor} ने {vendor} के साथ तय रकम {old} से बदलकर {new} की।" Anything else: "{actor} changed the commitment with {vendor}: {changes}." / "{actor} ने {vendor} के साथ तय शर्तें बदलीं: {changes}।"
- **Warnings:** `over_budget` (M-08: Photography goes ₹5,000 over its ₹1,20,000 line).
- **Topic:** `commitment.updated`. **Idempotency:** required.
- **Errors:** `stale_version`, `commitment_void`, `amount_mismatch`, `approval_required`. Same values: `unchanged`.

#### `void_commitment` (gated)
- **Who:** owner; manager through `propose_change`.
- **Inputs:** `commitment_id` (uuid, required); `expected_version` (int, required); `void_reason` (text(200)).
- **Effects:** sets `voided_at`, `voided_by_member_id` and `void_reason`. The commitment leaves every total (M4); its payments stay and still count as paid, so the vendor may show as overpaid.
- **Activity** (owners): "{actor} cancelled the {amount} commitment with {vendor}." / "{actor} ने {vendor} के साथ तय {amount} रद्द किया।" **Topic:** `commitment.voided`. **Idempotency:** required.
- **Errors:** `stale_version`, `commitment_void` (already void).

#### `record_payment` (voice kind, gated)
- **Who:** owner; manager through `propose_change` (voice-test-set X-04).
- **Inputs:**

| Field | Type | Required | Validation |
|---|---|---|---|
| `vendor_id` | uuid | yes | A vendor of this wedding |
| `amount_inr` | inr | yes | M1, M2 |
| `payment_kind` | enum | yes | `advance`, `instalment`, `final`. The form and the voice preview suggest `advance` for a vendor's first payment and `instalment` after that; the person can change it before saving |
| `paid_on` | date | no | Not after today (IST). Empty means "not stated" (voice test M-01) and shows as "Date not given" |
| `method` | enum | no | `upi`, `cash`, `bank_transfer`, `cheque`, `card`, `other` |
| `commitment_id` | uuid | no | An active commitment of the same vendor. If omitted and the vendor has exactly one active commitment, the server links that one |
| `note` | text(200) | no | |

- **Effects:** inserts the payment (`current_version_no` 1) and `payment_versions` version 1, which carries `source`, and for voice `voice_turn_id` and `spoken_text`.
- **Activity** (owners): "{actor} recorded an {kind} of {amount} to {vendor}." (the article is "a" for a final payment) / "{actor} ने {vendor} को {amount} का {kind_hi} दर्ज किया।"
- **Warnings:** `overpaid` when the vendor's paid figure now exceeds its committed figure. The payment is still saved, because Jashn records what happened.
- **Topic:** `payment.recorded`. **Idempotency:** required.
- **Errors:** `validation_failed`, `approval_required`, `not_found`.

#### `correct_payment` (voice kind, gated)
- **Who:** owner; manager through `propose_change`.
- **Inputs:**

| Field | Type | Required | Validation |
|---|---|---|---|
| `payment_id` | uuid | yes | A non-void payment of this wedding |
| `expected_version` | int | yes | Must equal `current_version_no` (C4). Server-filled for voice from the version the preview showed |
| `amount_inr` | inr | at least one of these four | The corrected amount |
| `paid_on` | date | | `null` clears it |
| `method` | enum | | |
| `note` | text(200) | | |
| `change_reason` | text(200) | no | Shown in History, such as "Advance was ₹40,000, not ₹50,000" |

- **Effects:** C2: version n+1 with the merged values, version n superseded, the same payment identity. The vendor still has exactly as many payments as before (C6).
- **Activity** (owners): amount changed: "{actor} corrected the {kind} to {vendor} from {old} to {new}." / "{actor} ने {vendor} का {kind_hi} {old} से बदलकर {new} किया।" ACT-06 reads "Mira corrected the advance to Annapoorna Caterers from ₹50,000 to ₹40,000." Other fields only: "{actor} corrected the {kind} to {vendor}: {changes}." / "{actor} ने {vendor} के {kind_hi} में सुधार किया: {changes}।"
- **Result:** the payment with all its versions, and `vendor_totals`; for the demo `outstanding_inr` 160000, which the spoken reply turns into "एक लाख साठ हज़ार रुपये बाकी हैं।" (M7).
- **Topic:** `payment.corrected`. **Idempotency:** required.
- **Errors:** `stale_version`, `payment_void`, `validation_failed`, `approval_required`. Same values: `unchanged` (C8).

#### `void_payment` (gated)
- **Who:** owner; manager through `propose_change`.
- **Inputs:** `payment_id` (uuid, required); `expected_version` (int, required); `void_reason` (text(200)).
- **Effects:** sets `voided_at`, `voided_by_member_id` and `void_reason` on the payment. Versions are untouched. The payment leaves the totals but stays listed, struck through and labelled "Void" (C9).
- **Activity** (owners): "{actor} voided the {amount} {kind} to {vendor}." / "{actor} ने {vendor} को दिया गया {amount} का {kind_hi} रद्द किया।" **Topic:** `payment.voided`. **Idempotency:** required.
- **Errors:** `stale_version`, `payment_void` (already void).

#### `record_expense` (gated)
- **Purpose:** a one-off cost with a payee who is not a regular vendor, such as EXP-01 (printed cards, ₹12,000) and EXP-02 (the bridal lehenga, ₹95,000), or a proposed one such as PRP-01 (the dhol player, ₹15,000).
- **Who:** owner; manager through `propose_change`.
- **Inputs:** `payee_name` (text(80), required); `budget_category` (enum, required); `amount_inr` (inr, required); `paid_in_full` (bool; default true when an owner runs it directly, **required with no default** inside `propose_change`, 3.5); `paid_on` (date) and `method` (enum), both optional and used only when paid in full; `event_id` (uuid, optional); `description` (text(200)).
- **Category check:** when `payee_name` names an existing vendor whose `vendor_category` differs from `budget_category`, the command fails with `validation_failed` on `budget_category`, and `current` names the existing vendor and its category, so the preview can offer it.
- **Effects, one transaction:** reuses the vendor with that name (ignoring case) or creates one with `is_one_off` true, status `booked` and `vendor_category` = `budget_category`; adds a `lump_sum` commitment for the amount; when `paid_in_full`, adds a `final` payment for the same amount. Committed rises by the amount; paid rises too only when paid in full, so outstanding is unchanged for a paid expense.
- **Activity** (owners): "{actor} recorded an expense of {amount} to {vendor} ({category})." / "{actor} ने {vendor} को {amount} का खर्च दर्ज किया ({category_hi})।" **Topic:** `expense.recorded`. **Idempotency:** required.
- **Errors:** `validation_failed`, `approval_required`.

### 3.4 Requirements, guests and RSVPs

#### `add_requirement` (voice kind; scope.md Should #12)
- **Who:** owner, manager.
- **Inputs:** `event_id` (uuid, required); `text` (text(200), required: what is needed, without the count, such as "Jain food"); `quantity` (int 1 to 10,000, optional); `requirement_category` (enum, default `other`: `catering`, `decor`, `music`, `ritual`, `logistics`, `attire`, `other`; the form suggests one from the linked vendor); `vendor_id` (uuid, optional).
- **Effects:** inserts the requirement. Nothing in the ledger changes (voice test R-01: Jain plates cost the same ₹800).
- **Duplicates:** the same function, the same text (ignoring case and spaces) and the same quantity as an existing requirement fails with 409 `duplicate_requirement`, and `current` carries the existing one, so voice asks instead of adding (R-02).
- **Activity** (members): "{actor} added "{item}" to the {event}." / "{actor} ने {event_hi} में ज़रूरत जोड़ी: {item}।" `{item}` is the text, followed by " for {quantity}" when a quantity is set, so ACT-10 reads: Mira added "Jain food for 12" to the reception.
- **Topic:** `requirement.added`. **Idempotency:** optional.

#### `add_guest` (voice kind)
- **Who:** owner; manager with limits. A manager may not send `event_ids` or `max_plus_ones`, and may not add a guest to a household that has an active invitation link (that household's page lists its members' names); any of these is 403 `forbidden`. An owner then invites the guest with `set_invitations`.
- **Inputs:**

| Field | Type | Required | Validation |
|---|---|---|---|
| `full_name` | text(80) | yes | |
| `household_id` | uuid | no | An existing household of this wedding |
| `household_name` | text(80) | no | Used when `household_id` is absent: creates a household with this name. With neither, a new household named after the guest is created |
| `relation` | text(80) | no | Stored on a newly created household ("Kabir's college friend") |
| `group_label` | text(40) | no | Such as `FAM-B` or `FR-K` (demo-data.md 4.2) |
| `event_ids` | list of uuid | no | Creates one `pending` invitation per function (R1) |
| `max_plus_ones` | int | no | 0 to 10, default 0, applied to each new invitation |
| `dietary_note` | text(200) | no | |
| `phone`, `email` | text(20), text(120) | no | Stored in `guest_contacts`. Typed only; never voice fields (G9) |
| `note` | text(200) | no | Such as "child, 6" |

- **Effects:** inserts the guest, a household if needed, a `guest_contacts` row if a contact was given, and the invitations. The first guest of a new household becomes its `primary_guest_id`.
- **Warnings:** `possible_duplicate` when a guest with the same name already exists in this wedding.
- **Activity** (members): "{actor} added the guest {guest}, invited to {events}." / "{actor} ने मेहमान {guest} को जोड़ा, न्योता: {events_hi}।" With no functions: "{actor} added the guest {guest}." / "{actor} ने मेहमान {guest} को जोड़ा।" The entry's `after` never holds `phone` or `email`, only `contact_added` true (L5a).
- **Topic:** `guest.added`. **Idempotency:** optional.

#### `set_invitations`
- **Who:** owner only (A3, P10). A manager gets 403 `forbidden`: inviting a household to a function reveals that function, its time and its address on the guest link with no publish step. No demo step needs a manager to invite. Test (beside X-04): Diya's `set_invitations` returns 403 `forbidden`.
- **Inputs:** `guest_id` (uuid, required); `event_ids` (list of uuid, required: the complete set of functions this guest is invited to; an empty list removes all); `max_plus_ones` (int 0 to 10, optional, applied to all of this guest's active invitations).
- **Effects:** a function added to the set inserts an invitation, or clears `revoked_at` on an old one and resets it to `pending` with 0 plus-ones (R11). A function removed from the set gets `revoked_at` (R11). A lowered `max_plus_ones` lowers any larger `plus_ones` to the new limit.
- **Activity** (members): "{actor} changed {guest}'s invitations: {changes}." / "{actor} ने {guest} के न्योते बदले: {changes}।" **Topic:** `invitations.set`.

#### `set_rsvp` (voice kind)
- **Who:** owner, manager, on a guest's behalf (R10).
- **Inputs:** `guest_ids` (list of uuid, 1 to 50, required); `event_id` (uuid, required); `rsvp_status` (`attending`, `declined` or `pending`, required); `plus_ones` (int, optional, only when `guest_ids` has exactly one guest; default 0).
- **Validation:** every guest needs an active invitation to that function, or the whole command fails with 409 `not_invited` naming the guest. `plus_ones` above `max_plus_ones` fails with `plus_ones_exceeds_limit`.
- **Effects:** R6 and R7. Each row gets the status, `plus_ones` (with several guests, an attending guest keeps the stored value), `responded_at`, `responded_via` `member` and `rsvp_updated_by_member_id`. Guests whose answer is unchanged are skipped; if every answer is unchanged, the outcome is `unchanged`.
- **Activity** (members): one guest: "{actor} marked {guest} as {response} for the {event}." / "{actor} ने {event_hi} के लिए {guest} का जवाब दर्ज किया: {response_hi}।" Several: "{actor} marked {n} guests as {response} for the {event}: {names}." / "{actor} ने {event_hi} के लिए {n} मेहमानों का जवाब दर्ज किया: {response_hi} ({names})।" Words: attending "attending" / आएँगे; declined "not attending" / नहीं आएँगे; pending "not replied" / जवाब बाकी.
- **Result:** that function's `rsvp_totals` (4.4), for the reply (G-02: "Ab 231 log aa rahe hain").
- **Topic:** `rsvp.updated`. **Idempotency:** optional for forms, always present for voice.

#### `set_dietary` (voice kind)
- **Who:** owner, manager; or the guest token, for guests of its own household (`POST /api/i/{token}/dietary`).
- **Inputs:** `guest_id` (uuid, required); `dietary_note` (text(200), or `null` to clear).
- **Effects:** updates `guests.dietary_note`. It is live, not part of the publication snapshot.
- **Activity** (members): "{actor} updated {guest}'s dietary note: {note}." / "{actor} ने {guest} के खाने की जानकारी बदली: {note}।" From a guest link, `{actor}` is the guest's name.
- **Topic:** `dietary.updated`.

#### `submit_rsvp` (guest token)
- **Who:** the guest token only, through `POST /api/i/{token}/rsvp`. Members use `set_rsvp`.
- **Inputs:**

| Field | Type | Required | Validation |
|---|---|---|---|
| `responses` | list, 1 to 20 | yes | Each item: `guest_id` (uuid), `event_id` (uuid), `rsvp_status` (`attending` or `declined`) and `plus_ones` (int, default 0) |
| `idempotency_key` | key | yes | One per exact request (R8, I1); the guest page sends a UUID |

- **Validation:** every `guest_id` is in the token's household, and every `event_id` is a function in the latest publication to which that guest has an active invitation; anything else is 404 `not_found` with the same body as an unknown token (R9, G5). `plus_ones` above the limit is 422 `plus_ones_exceeds_limit`.
- **Effects:** R6 and R7, with `responded_via` `guest_link`. Unchanged answers are skipped; all unchanged gives `unchanged` (R12: Tara's second tap).
- **Activity** (members; `actor_type` `guest`): one response: "{guest} is attending the {event}." / "{guest} {event_hi} में आएँगे।" or "{guest} can't attend the {event}." / "{guest} {event_hi} में नहीं आ पाएँगे।" Several: "The {household} household replied: {list}." / "{household} परिवार ने जवाब भेजा: {list}।" ACT-09 reads "Tara Bhat is attending the reception."
- **Result:** the household's refreshed `guest_invitation_view` (4.6). It never contains counts.
- **Topic:** `rsvp.submitted`. **Errors:** `not_found`, `plus_ones_exceeds_limit`, `validation_failed`, `idempotency_key_reused`, and 429 `rate_limited` after 30 POSTs a minute per token (6.3; counted in instance memory, best effort).

#### `create_invitation_links`
- **Who:** owner only (A3).
- **Inputs:** `household_ids` (list of uuid, 1 to 100, required; synthetic households have no links and fail with `validation_failed`); `rotate` (bool, default false).
- **Effects:** for each household with no active link, or for every listed household when `rotate` is true (revoking its old link first): a new token (6.3), stored only as its SHA-256 hash plus a 4-character `token_hint`. Households that already have an active link are listed under `skipped` when `rotate` is false.
- **Result:** `links`: a list of `household_id` and `url` (`/i/{token}`). The raw tokens appear in this one response only. The stored receipt leaves them out, so a replay returns the household ids with `tokens_already_issued: true` and no URLs.
- **Activity** (owners): "{actor} created invitation links for {n} households." / "{actor} ने {n} परिवारों के लिए न्योते के लिंक बनाए।"
- **Topic:** `invitation_links.created`. **Idempotency:** required.

#### `revoke_invitation_link`
- **Who:** owner only.
- **Inputs:** `household_id` (uuid, required).
- **Effects:** sets `revoked_at` on the household's active link. The old URL answers 404 at once (G5); the household's RSVPs stay as they are.
- **Activity** (owners): "{actor} turned off the invitation link for the {household} household." / "{actor} ने {household} परिवार के न्योते का लिंक बंद किया।" **Topic:** `invitation_link.revoked`.
- **Errors:** `not_found` (no active link).

### 3.5 Proposals

#### `propose_change`
- **Who:** manager only. An owner runs the command directly, so an owner sending this gets 403 `forbidden`. For every A1 command except `record_expense`, the manager also needs `managers_can_see_vendor_dues` (otherwise 403 `forbidden`, as for `add_quote`), because the preview, the summary and the deltas carry current vendor money (G7). The manager's voice snapshot is filtered the same way (voice.md 1.9). A `record_expense` proposal carries only the amount the manager supplied.
- **Inputs:** `command` (one of the gated commands in A1, required; anything else is `validation_failed`); `input` (object, required: exactly that command's input; for `record_expense`, `paid_in_full` is required with no default); `reason` (text(200), optional).
- **Effects:** validates `input` exactly as the command would (types, ids, M3), without running it. Resolves a `record_expense` payee name to an existing vendor id, or to "new vendor", and stores it in `proposals.vendor_id`. Inserts a `pending` proposal holding `command`, `input`, the proposer, `summary_en`, `summary_hi`, `committed_delta_inr` (how much committed would rise: the amount for `record_commitment` and `record_expense`, new minus current for `update_commitment`, minus the amount for `void_commitment`, 0 for payments) and `paid_delta_inr` (how much paid would rise: the amount for `record_payment` and for a paid-in-full `record_expense`, new minus current for `correct_payment`, minus the amount for `void_payment`, else 0). Nothing else changes (A5).
- **Summaries** (`{summary}` / `{summary_hi}`):

| Command | English | Hindi |
|---|---|---|
| `record_commitment` | a commitment of {amount} with {vendor} | {vendor} के साथ {amount} तय करना |
| `update_commitment` | changing the agreed amount with {vendor} from {old} to {new} | {vendor} के साथ तय रकम {old} से {new} करना |
| `void_commitment` | cancelling the {amount} commitment with {vendor} | {vendor} के साथ तय {amount} रद्द करना |
| `record_payment` | a payment of {amount} to {vendor} | {vendor} को {amount} का भुगतान |
| `correct_payment` | correcting the {kind} to {vendor} from {old} to {new} | {vendor} का {kind_hi} {old} से {new} करना |
| `void_payment` | voiding the {amount} {kind} to {vendor} | {vendor} को दिया {amount} का {kind_hi} रद्द करना |
| `record_expense` | an expense of {amount} to {vendor} ({category}), {paid_state} | {vendor} को {amount} का खर्च ({category_hi}), {paid_state_hi} |

`{paid_state}` is "paid in full" / "पूरा भुगतान हो चुका" or "not yet paid" / "भुगतान बाकी". Seeded PRP-01's summary and ACT-03 follow the template too, so both carry ", not yet paid" (D91).

- **Activity** (owners): "{actor} proposed {summary}. It needs an owner's approval." / "{actor} ने प्रस्ताव भेजा: {summary_hi}। मालिक की मंज़ूरी बाकी है।" Seeded ACT-03: "Diya proposed an expense of ₹15,000 to Dhol player (Music and entertainment), not yet paid. It needs an owner's approval."
- **Result:** HTTP 202, outcome `proposed`, `proposal_id`. **Topic:** `proposal.created`. **Idempotency:** required.

#### `approve_proposal`
- **Who:** owner only.
- **Inputs:** `proposal_id` (uuid, required).
- **Before approving** (the review step): the owner's screen dry-runs the stored input on the current state and shows the old and new value of every field it changes, plus `committed_delta_inr` and `paid_delta_inr`.
- **Effects:** locks the proposal, which must be `pending` (otherwise 409 `proposal_not_pending`). A `record_expense` runs against the stored `proposals.vendor_id`, never a fresh name lookup; if that vendor was renamed, deleted, or (for "new vendor") a vendor with the payee's name now exists, approval fails with 409 `proposal_changed` and the proposal stays pending. Commands with `expected_version` fail with `stale_version` when the record changed since the proposal. Otherwise it runs the stored command with the stored input as the approving owner, with idempotency key `proposal:{proposal_id}`, in the same transaction that sets `approved`, `decided_by_member_id`, `decided_at` and `result_entity_id` (A4). If the command fails, everything rolls back, the proposal stays pending, and the error is returned.
- **Activity:** only the executed command's own entry (A6), with `proposal_id` set and the suffix " Proposed by {proposer}." / " प्रस्ताव: {proposer}।" **Topic:** the executed command's topic.
- **Idempotency:** required. **Errors:** `proposal_not_pending`, `proposal_changed`, plus any error of the executed command.

#### `reject_proposal`
- **Who:** owner only. **Inputs:** `proposal_id` (required); `decision_reason` (text(200), optional, shown to the proposer).
- **Effects:** sets `rejected` and the decision fields.
- **Activity** (owners): "{actor} declined {proposer}'s proposal: {summary}." / "{actor} ने {proposer} का प्रस्ताव नामंज़ूर किया: {summary_hi}।" **Topic:** `proposal.rejected`. **Errors:** `proposal_not_pending`.

#### `withdraw_proposal`
- **Who:** the manager who proposed it. **Inputs:** `proposal_id` (required).
- **Effects:** sets `withdrawn`.
- **Activity** (owners): "{actor} withdrew the proposal: {summary}." / "{actor} ने अपना प्रस्ताव वापस लिया: {summary_hi}।" **Topic:** `proposal.withdrawn`. **Errors:** `proposal_not_pending`, `forbidden` (someone else's proposal).

### 3.6 Shagun (scope.md Should #13)

#### `record_shagun` (voice kind once #13 ships)
- **Who:** owner only.
- **Inputs:** `giver_name` (text(80), required, as it should read in the register: "Ramesh & Kavita Sharma"); `household_id` (uuid, optional; voice resolves "Sharma ji" to H05 only because exactly one household matches, and the preview names it); `amount_inr` (inr, required); `received_on` (date, default today in IST); `how` (text(120), such as "Home visit" or "UPI"); `note` (text(200)).
- **Effects:** inserts a shagun entry with thank-you `pending`. It never touches the ledger.
- **Activity** (owners): "{actor} recorded shagun of {amount} from {giver}." / "{actor} ने {giver} से मिला {amount} का शगुन दर्ज किया।"
- **Result:** `shagun_totals`: SHG-06 makes ₹45,400 received and 4 thank-yous pending.
- **Topic:** `shagun.recorded`. **Idempotency:** required.

#### `mark_shagun_thanked`
- **Who:** owner only.
- **Inputs:** `shagun_entry_id` (uuid, required); `thanked` (bool, required; false puts it back to pending); `thanked_note` (text(120), such as "Kabir called her on 16 Nov").
- **Activity** (owners): "{actor} marked the thank-you to {giver} as done." / "{actor} ने दर्ज किया कि {giver} को धन्यवाद कह दिया गया है।" Undo: "{actor} put the thank-you to {giver} back to pending." / "{actor} ने {giver} का धन्यवाद फिर से बाकी में रखा।"
- **Topic:** `shagun.thanked`.

### 3.7 Card export and demo controls

**Export lifecycle** (export-and-recovery.md 2.1 is the full table). A job moves `queued` → `rendering` → `succeeded` or `failed`; a retry moves `failed` → `queued` again. Labels: "Queued", "Rendering" (or "Retrying" from attempt 2), "Ready", "Failed".
- **Where the worker runs.** Chromium runs only in the internal route `POST /api/ops/export-jobs/{job_id}/run`, behind the `JOBS_API_TOKEN` bearer check (`maxDuration` 120 s). `request_card_export` and `retry_card_export` kick it after commit, from any transport (3.0 step 7), except the ops retry route, which kicks it before its wait (D53, below). The reserved job id `probe` renders a fixture and writes nothing.
- **Who builds the worker (D41, D58, D102).** Lane D owns the job module in `src/server/jobs/`, including the worker's upsert and size check. It writes Storage only through Lane A's Storage adapter and signing helpers, which merge by 11:40 at the latest, ahead of Lane D in that batch. Their signatures are typed in `src/contracts/services.ts` from the contracts PR, so Lane D builds against them from 10:00. The 10:30 probe uses a temporary token check inside Lane D's own path, which lives until Lane A's system verifier for `JOBS_API_TOKEN` lands (11:40 at the latest). Then `/run`, the ops GET and the retry switch to the verifier, and the temporary check is deleted.
- **The claim.** Compare-and-set `queued` → `rendering` (`attempts` + 1, `lease_until` = now + 2 minutes); the attempt row becomes `rendering` with `started_at` and `renderer` (`chromium` or `og`). The claim moves `weddings.version` without an activity entry.
- **The render.** The worker renders `/render/card/{job_id}?t=…` (6.4) and upserts the PNG at the job's fixed object key `{wedding_id}/card-rev{revision}.png` in bucket `exports`, so one `export_key` never has two files; `export_jobs.artifact_path` stores that key. A worker writes only while it still holds its claim.
- **Lazy expiry.** A `rendering` job past its lease becomes `failed` with `LEASE_EXPIRED`; a job `queued` for over 60 s becomes `failed` with `NOT_STARTED`. Lazy expiry runs only in the ops GET, the retry paths and `request_card_export`; member read models never write (the panel shows such a job as stalled).
- **Results.** Success and failure are system writes (actor `system`, label "Jashn"): each writes one activity entry and moves `weddings.version`.
- **Where export activity lives (D63).** Every export template in this section, and its call site, lives in Lane D's `src/server/jobs/` or `src/server/invite/`. Lane A's append helper takes the finished entry. Lane D never edits `src/server/activity/`.

| System step | Activity (members, `actor_type` `system`) | Topic |
|---|---|---|
| Job succeeds | "The card for revision {n} is ready." / "संस्करण {n} का कार्ड तैयार है।" | `export.succeeded` |
| Job fails | "The card export for revision {n} failed: {reason}." / "संस्करण {n} का कार्ड नहीं बन पाया: {reason}।" `{reason}` is the short per-code phrase of export-and-recovery.md 2.5 ("renderer timeout" / "रेंडरर टाइमआउट" for `DRILL_INJECTED`), never the raw error message. A drill failure adds " (deliberate drill)" / " (जानबूझकर किया गया अभ्यास)" | `export.failed` |

**Failure webhook (export-and-recovery.md 2.8 and 5.5).** When the worker first fails a job, it posts `{type: "invitation_export.failed", job_id, export_key, error_code, failed_at, synthetic}` to `NUDGEBEE_EXPORT_WEBHOOK_URL` after its commit, with a 5 s timeout, and sets `notified_at`. Every value is a string (`synthetic` is "true" or "false"). It is sent at most once per job, by the worker only: never by the dispatcher, and never for a lazy failure found by an ops route.

**Failure codes:** `DRILL_INJECTED`, `RENDER_TIMEOUT` (the 45 s cap), `FONT_NOT_LOADED`, `RENDER_FAILED`, `UPLOAD_FAILED`, `LEASE_EXPIRED` (lazy) and `NOT_STARTED` (lazy, after 60 s in `queued`). Messages never hold URLs, tokens, paths or stack traces (export-and-recovery.md 2.5).

#### `request_card_export` (voice kind)
- **Who:** owner, manager.
- **Inputs:** `format` (`png`, required; the only format built; `pdf` exists only if the lead approves the PDF Should at 13:30, D66 and 5.2). There is no revision input: a card is always made from the latest published revision, and older revisions are out of date (P9).
- **Effects:** finds the publication whose revision is `weddings.published_revision` (none: 409 `nothing_published`) and forms `export_key` = `export:{wedding_id}:rev{revision}:{format}`. If a job with that key exists, nothing is written: the outcome is `unchanged` and the result is that job (a failed job is retried with `retry_card_export`, not re-requested). Otherwise it inserts the job (`queued`, `attempts` 0, `max_attempts` 3) with `card_event_ids` frozen from live invitations (P10), and the attempt 1 row (trigger `request`). It runs lazy expiry on the existing job first. A race on the unique key returns `unchanged`, never a 500.
- **The drill.** The job gets `fail_injection` `once` and `synthetic` true only when the Flagsmith flag `export_failure_drill` is enabled **and** its value equals the job's `wedding_id`, on a wedding with `is_sample` true. The env fallback `EXPORT_FAILURE_DRILL` holds a wedding id, not `once`, and applies only when Flagsmith can't be read (flagsmith.md 3.6, export-and-recovery.md 4.1). The first render then fails with `DRILL_INJECTED`, "Injected fault (deliberate): renderer timeout", and sets `fail_injection` to `consumed`.
- **Activity** (members): "{actor} started a card export for revision {n}." / "{actor} ने संस्करण {n} का कार्ड बनवाना शुरू किया।"
- **Result:** `export_job_status` (4.8). **Topic:** `export.requested`.
- **Idempotency:** the `export_key` itself: one job per published revision and format. The envelope key is optional.
- **Errors:** `nothing_published`, `forbidden`.

#### `retry_card_export`
- **Who:** NudgeBee, through `POST /api/ops/export-jobs/{job_id}/retry` with `Authorization: Bearer <JOBS_API_TOKEN>` (6.4); or an owner, through the Retry button on the exports panel, `POST /api/w/{wedding_id}/exports/{job_id}/retry` (`wait` 0, a new key per press; a manager gets 403 `forbidden`). The actor is `system` "NudgeBee" or the owner. The exact HTTP shapes are export-and-recovery.md 5.3 and 5.6.
- **Inputs:**

| Field | Where | Required | Validation |
|---|---|---|---|
| `Idempotency-Key` | header | yes | 8 to 200 printable ASCII characters; NudgeBee sends `nb-{execution_id}-{job_id}`, the panel a UUID per press. Missing or malformed: 400 `validation_failed`, field `idempotency_key` |
| `expected_export_key` | body | yes on the ops route | The `export_key` NudgeBee read from the status call. Server-filled for the owner's button |
| `nudgebee` | body | no | `workflow_id`, `execution_id`, `approver` (strings up to 100 characters), stored on the attempt |
| `wait` | query | no | 0 to 25 seconds, default 25: how long to wait for the render before answering |

- **Effects.** After the fast-path receipt lookup, one transaction locks the job row, re-checks the receipt (a same-key twin waits here and replays, never a 500; I2a), runs lazy expiry, then evaluates in this order:

| State | Action | `outcome` | `status` after |
|---|---|---|---|
| Key seen before, same request | Replay: the stored `outcome` and `attempt`, with `replayed` "true"; `status` and `artifact` are read fresh | stored | current, after the wait |
| `succeeded` | none | `already_succeeded` | `succeeded`, same artifact |
| `queued`, or `rendering` within its lease | none | `in_progress` | current, after the wait |
| Key differs from the job's, or the job's revision is older than `published_revision` | none | `stale_revision` | unchanged |
| `failed`, `attempts` ≥ `max_attempts` | none | `not_retryable` | `failed` |
| `failed`, retryable | Compare-and-set `failed` → `queued`; insert attempt N+1 (trigger, key, NudgeBee ids, approver); activity entry; version; once committed, start `/run` before the wait | `retried` | `succeeded`, `failed` (a new error) or `queued`/`rendering` (over the wait) |

- **The kick comes before the wait (D53).** When the outcome `retried` is committed, the route starts `/run` with a fire-and-forget request, and only then begins its wait loop. A kick left to `after()` would run after the response, so the wait would end before the worker had started. The owner's panel route (`wait` 0) kicks in `after()` like any other command.
- **Receipts** are written for every outcome, including the no-change ones. For every outcome, the route then waits up to `wait` seconds while the job is `queued` or `rendering`, reading the row every 500 ms.
- **Every outcome is HTTP 200**, because NudgeBee fails a workflow step on any status of 400 or above. The only errors: 400 `validation_failed` (field `idempotency_key` or `body`: a missing or malformed key, a body without `expected_export_key`), 401 `unauthenticated`, 404 `not_found` (unknown job, or a job id that isn't a UUID), 409 `idempotency_key_reused` (the same key with a different job or body) and 500.
- **Never** publishes, changes the guest page, the ledger or RSVPs, or messages guests.
- **Activity** (members), only for `retried`; the worker's own entry reports the result. From NudgeBee (actor `system`, "NudgeBee"): "NudgeBee retried the card export for revision {n} (run {run}, approved by {approver})." / "NudgeBee ने संस्करण {n} का कार्ड दोबारा बनवाया (रन {run}, मंज़ूरी: {approver})।" `{run}` is the first 8 characters of the execution id; `{approver}` is cut at "@". From an owner: "{actor} retried the card export for revision {n}." / "{actor} ने संस्करण {n} का कार्ड दोबारा बनवाया।"
- **Topic:** `export.retried`. **Idempotency:** required (I1).
- **Response** (200). On the ops route every scalar is a string ("true"/"false" for booleans) and nothing is null; `artifact` is always an object, with empty strings when there is no file. Fields: `job_id`, `export_key`, `outcome`, `replayed`, `attempt`, `status`, `retryable`, `revision`, `latest_revision`, `artifact` (`artifact_id`, `sha256`, `bytes`) and `idempotency_key`. export-and-recovery.md 5.3 has the worked examples:

```json
{
  "job_id": "5b1e…", "export_key": "export:0b7c…:rev3:png",
  "outcome": "retried", "replayed": "false", "attempt": "2",
  "status": "succeeded", "retryable": "false", "revision": "3", "latest_revision": "3",
  "artifact": { "artifact_id": "card-rev3.png", "sha256": "9f2c…", "bytes": "412377" },
  "idempotency_key": "nb-019e…-5b1e…"
}
```

The owner's panel route answers with the dispatcher envelope and normal JSON types instead (export-and-recovery.md 5.6).

#### `reset_demo`
- **Who:** owner, only on a wedding with `is_sample` true and only when the server env `DEMO_RESET_ENABLED` is `true`; otherwise 403 `demo_reset_disabled` or `not_sample_wedding`. Lane A ships it by 11:40 (D102). It has no UI control and runs through the command route only. The demo and `e2e` copies are L's (D17); a lane may reset its own rehearsal copy only, as that copy's owner, with `checkpoint` `d0` and `confirm_text` `RESET` (D120).
- **Sample copies.** The seed creates the demo copy (D0, for judging and recording only), rehearsal copies `a` to `d` and an `e2e` copy, all with `is_sample` true. Each copy has its own `mira.<copy>@example.com` owner and `diya.<copy>@example.com` manager, and Lane A's seed creates every one of these accounts with the password `SEED_PASSWORD`, a passphrase the user chooses so the teammate can type it on a phone as Diya (D118); nobody makes them in the Supabase dashboard (D27, D68). `reset_demo` acts on the one copy named by `wedding_id` and never touches another. Seeded guest links are printed once and written to the gitignored `demo-links.local.md` (6.3).
- **Inputs:** `checkpoint` (`s0` or `d0`, default `d0`); `confirm_text` (exactly `RESET`).
- **Every seeded row carries a `seed_key`,** in every table, unique per table and wedding (5.0): not only the demo-data ids but also version rows (`PAY-01/v1`, `COM-01/v1`), invitations (`INV-H16-EVT-REC`), vendor links (`VE-VEN-CAT-EVT-REC`), budget lines (`BL-catering`), `budgets`, `invite_styles` and `guest_contacts` (keyed by their parent's `seed_key`). Live rows have none.
- **Effects, one transaction, in this order:**
  1. Lock the wedding row.
  2. Delete live rows (no `seed_key`), children first: `command_receipts`, `export_attempts`, `export_jobs`, `activity_entries`, live `payment_versions` and `commitment_versions` (PAY-01 version 2), live payments and commitments, live `requirements` (REQ-10), live proposals, live `publications` (REV-3), `voice_turns`, then any other live row outside the kept tables listed below. `superseded_by_version_id` has no foreign key (5.1), so deleting version 2 is never blocked by version 1.
  3. Upsert every seeded row with its fixed UUID and seeded values (0.1). Seeded version rows get their seeded `superseded_at` back (PAY-01 v1 current again), which the index allows because step 2 removed the live version.
  4. Reset `published_revision` and `draft_version` to their seeded values; `weddings.version` still increases (+1), so every open screen refreshes on its next poll.

  S0 also removes COM-01, PAY-01 and their versions and reopens QUO-01. Kept: auth users, `members`, `invitation_links` (Tara's link keeps working), `assets` (the couple photo, part of D0 from the 11:40 photo step, 5.1 and D107), `experiment_exposures`, `card_imports` and Storage files (a re-export overwrites the fixed key).
- **Activity:** none. This is the one exception to L1, so the reset state matches `demo-data.md` §9.3 exactly (D0 shows 5 Diya items). The reset is logged on the server. It has no topic: its `version` bump alone refreshes open screens.
- **Errors:** `demo_reset_disabled`, `not_sample_wedding`, `validation_failed`.

### 3.8 Voice-turn controls (not domain commands)

| Route | Who | What it does |
|---|---|---|
| `POST /api/voice/turn` | A member (owner or manager), or a signed-in user during setup | Multipart: exactly one of `audio` (up to 2 MB and 30 s), `text` (typed, 1 to 500 characters) or `option` (a tapped option of a question); `wedding_id` (empty during setup); `client_turn_id` (required; a repeat replays); `ui_language` (`en` or `hi`); optional `context_turn_id`, `speech_language`, `duration_ms`, `attached_asset_id`, `page`, `setup_opened_at` and `fixture_id` (voice.md 1.4). Checks the session, the role, `voice_pilot` (403 `voice_unavailable`) and the rate limit (V10) before any Sarvam call. Runs speech-to-text. If the whole normalised transcript is a confirm or cancel phrase, it acts on the speaker's one open turn (V2 scope). Otherwise it calls the model with the role-filtered snapshot (G9), validates every action (V5), resolves names to ids, applies the early kill-switch check (V3), stores a `voice_turns` row and answers 200 with an NDJSON event stream (`heard`, then one of `preview`, `answer`, `clarify`, `refused`, `saved`, `cancelled`, `error`, then `done`; voice.md 1.5) |
| `POST /api/voice/confirm` | The member who spoke (V2) | Takes `voice_turn_id`, optional `edits` (field values typed into the review card, validated like any input) and `via`. Checks the speaker, `voice_pilot`, the turn's status (a closed turn: 410 `voice_turn_expired`, "This request is closed.") and the 10-minute window, then runs each action through the dispatcher in order with key `{voice_turn_id}:{index}` (V7), wrapping a manager's gated actions in `propose_change` (V8); the dispatcher's voice gate is the authoritative kill-switch check (V3), and on its 423 the route rebuilds the full prefill list from the stored turn (D121). Returns each action's result and the spoken reply (V9) |
| `POST /api/voice/cancel` | The member who spoke | Marks the turn `cancelled`; nothing is written. Reply: "ठीक है, कुछ नहीं बदला।" (en "OK, nothing was changed.") |
| `GET /api/voice/turns/{voice_turn_id}/reply-audio?part={n}` | The speaker | Streams the stored reply's speech part from Bulbul; 204 when `spoken_replies` is off (voice.md 1.14). Not rate-limited on its own: the turn's stored speech parts cap it (V10) |
| `GET /api/voice/turns/{voice_turn_id}/trace` | The speaker, or an owner of the turn's wedding | The judge panel's data (voice.md 8) |

voice.md 1.4 to 1.17 is the full contract for these routes and wins where this section is shorter.

- **Turn statuses** (`voice_turn_status`): `proposed` (preview shown; Confirm stays disabled while `missing_fields` is not empty), `confirmed`, `partially_saved` (V7), `cancelled`, `paused` (refused by the kill switch), `answered` (a question, or a clarifying question back, with nothing to confirm), `superseded` (a follow-up turn merged it, as S-02 completes S-01), `failed` (speech-to-text or the model failed) and `expired` (10 minutes passed).
- **Phrases** (voice.md 1.8 is the full rule). Normalise: lowercase, drop punctuation and the danda (।), then map each word to one Latin form with voice.md 1.8's table (हाँ, हां, han, haa, ha → haan; सेव → save; करो, kar do, कर दो → karo; ठीक → theek; है → hai; जी → ji; नहीं, नही, nahi → nahin; रहने → rehne; दो → do; कैंसल → cancel). Then the **whole** normalised utterance must equal one listed phrase; containing one is not enough, so "haan, lekin chaalis nahin pachaas" goes to the model. Confirm: haan · haan save karo · yes save · theek hai save · haan ji · yes · save karo · theek hai save karo. Cancel: nahin rehne do · cancel · nahin · rehne do · no · cancel karo. A confirm phrase with no open turn may replay a turn confirmed in the last 2 minutes, or take a question's `default` option (voice.md 1.8, 6.2). voice-test-set C-01 and C-02 gain the mixed-script variants ("हाँ, save करो", "हां सेव करो").
- **Setup turns:** a setup preview is a draft held in the turn, not in `weddings`. Nothing is saved until `set_wedding_profile` has names and a full date and is confirmed (voice-test-set S-01 to S-03). Reading an invitation card (Should #11) is not a voice turn: its draft lives in `card_imports`, and its functions are saved by `POST /api/card-imports/{import_id}/apply` after `set_wedding_profile` creates the wedding, never through `/api/voice/confirm`.
- **Early refusal** (200, V3 step 1): the stream's `refused` event carries `code` `voice_writes_paused`, the fixed R-03 line "Abhi voice se badlav band hain. Aap type karke save kar sakte hain." (the respectful form for any speaker, D93), and `prefill`. The turn is stored `paused`. No Confirm is offered.
- **One prefill shape (D61, D121).** The prefill is always a list of `{command, input, labels}`, one entry per action, in the early refusal and in the 423's `error.prefill` alike. `labels` holds the field labels for the form. The dispatcher's 423 carries its single action's entry; `/api/voice/confirm` rebuilds the full list from the stored turn before answering 423.
- **Paused response** (423, V3 step 2, from `/api/voice/confirm` when the switch flipped after the preview). `prefill` is always inside `error`:

```json
{
  "ok": false,
  "error": {
    "code": "voice_writes_paused",
    "message": "Voice changes are paused. You can type it instead.",
    "prefill": [
      { "command": "add_requirement",
        "input": { "event_id": "e5d1…", "text": "Jain food", "quantity": 12,
                   "requirement_category": "catering", "vendor_id": "c3a9…" },
        "labels": { "text": "Requirement", "quantity": "Quantity",
                    "requirement_category": "Category", "vendor_id": "Vendor" } }
    ]
  }
}
```

### 3.9 Voice arguments: how `propose_actions` maps to commands

- voice.md section 2 is the full tool contract and wins where this section is shorter.
- The tool keeps its top level from research-sarvam.md 3.2: `intent` (`act`, `ask` or `clarify`), `actions` (at most 4), `missing_fields` and `reply`, plus `reply_language` (`en`, `hinglish` or `hi`). Each action is `kind` plus **that command's own input fields, with the same names**, plus the helper `heard` (for every number, amount, date and time, the exact words that gave it, which code re-reads). The ask kinds take the query parameters `scope`, `detail`, `next_event`, `day`, `latest`, `actor_member_id`, `thanked` and `budget_category` (voice.md 2.4). The tool schema lists the union of those fields, every one optional except `kind`, with no `null` unions.
- **Ids.** The snapshot gives every record a short reference: its `seed_key` (`EVT-REC`, `PAY-01`) or, for records created live, a short alias. Actions put these in the `*_id` fields; the server maps them to UUIDs and treats an unknown reference as missing (V5). Names heard are kept beside each resolved id for the preview.
- **Server-filled, never from the model:** `expected_version`, `expected_draft_version`, `idempotency_key`, `source`, `voice_turn_id`, `wedding_id`, and contact fields.
- **Voice-only helper fields** (shown in the preview, never passed to a command): `date_text` and `month` for a partial wedding date (S-01, S-03); `previous_inr` on `correct_payment` and `update_commitment`, counted only when it was heard (it has a `heard` phrase); the old value always comes from the record, and the preview warns if a heard one differs; `user_claim_inr` on a balance question (M-09: the reply corrects a wrong premise). A day without month or year in `create_event` or `update_event` is resolved against the wedding's month and year and shown in the preview (E-01); a wedding date is never completed that way.

| Voice kind | Command | Notes |
|---|---|---|
| `set_wedding_profile` | `set_wedding_profile` | `wedding_date` only when day, month and year are all known |
| `create_event`, `update_event` | same names | `venue_name` as heard, matched in code (3.2, voice.md 2.5): "Lotus Hall, Mallige Gardens" and "Lotus" both match Lotus Hall. `venue_id` is never in the tool schema |
| `add_vendor` | `add_vendor` | |
| `record_commitment`, `update_commitment` | same names | A model-supplied `amount_inr` on `per_unit` is only a check (M3) |
| `record_payment`, `correct_payment` | same names | A manager's become proposals (V8); M-12 gives PRP-02 |
| `add_requirement` | `add_requirement` | |
| `update_invite_style` | `update_invite_style` | `photo_asset_id` may only be an image uploaded with this turn or already in `assets` |
| `add_guest` | `add_guest` | No contact fields |
| `set_rsvp`, `set_dietary` | same names | |
| `publish_itinerary` | `publish_itinerary` | Owners only; the preview is the publish review sheet; alone in its turn (V11) |
| `request_card_export` | `request_card_export` | |
| `record_shagun` | `record_shagun` | Only once Should #13 ships |
| `query_*` (ask) | read models (4.9) | No confirmation; works while voice writes are paused (V4) |

The eleven kinds already in research-sarvam.md's enum are `set_wedding_profile`, `create_event`, `update_event`, `add_vendor`, `record_commitment`, `record_payment`, `correct_payment`, `add_requirement`, `update_invite_style`, `add_guest` and `set_rsvp`. This table adds `update_commitment`, `set_dietary`, `publish_itinerary`, `request_card_export` and `record_shagun`. Example arguments for live step #2 (M-03):

```json
{
  "intent": "act",
  "actions": [
    { "kind": "correct_payment", "payment_id": "PAY-01", "amount_inr": 40000,
      "heard": [ { "field": "amount_inr", "phrase": "चालीस हज़ार" } ] }
  ],
  "missing_fields": [],
  "reply": "Caterer ka advance badal doon?",
  "reply_language": "hinglish"
}
```

---

## 4. Read models

A read model is a named server function that takes the actor, the wedding and a few parameters, and returns JSON built from the tables in section 5. It is the only source of numbers for screens and spoken replies (M8).

**Conventions.** Money is integer `_inr` (format with M7 only when displaying). Instants are ISO 8601 with the IST offset (`2026-12-14T19:30:00+05:30`); dates are `YYYY-MM-DD`. "Today" is the IST calendar date. Every read model filters by role (6.1): a block the actor may not see is **left out** and its name listed in `hidden` (for example `"hidden": ["budget"]`), so the screen can say "Not shared with you" and nothing leaks as a zero. Every planner read model also returns `version` (5.6). Every row a member read model returns carries `seed_key` (null for live rows), so voice.md 1.9's snapshot can name records (D99). The guest view (4.6) and the ops view (4.8) keep their fixed field lists.

### 4.1 `overview` (Should #10)

| Block | Contents | Who |
|---|---|---|
| `header` | Couple names, city, `wedding_date`, the date range from the first function's start to the last one's end, `is_sample` (shows the "Fictional demo data" badge) | Members |
| `next_event` | The next function to start after now: title, start, venue, and `days_until` in IST calendar days | Members |
| `decisions` | Pending proposals (count and list from 4.10) for owners; `unpublished_changes_count` (4.3) for everyone; open conflicts (4.3) | Members (proposals: owners) |
| `money` | The totals and budget block of 4.2 | Owners; managers with `managers_can_see_budget` |
| `dues` | Vendors with `due_state` `overdue` or `due_soon` (4.2) | Owners; managers with `managers_can_see_vendor_dues` |
| `rsvp` | `rsvp_totals` (4.4) for every function | Members |
| `activity_today` | The first 5 entries of `activity_feed` (4.7) for today | Members, with L5 visibility |

### 4.2 `money_summary` and `vendor_ledger`

**`money_summary`, one row per vendor** (vendors not deleted; one-off payees included):

| Field | Formula |
|---|---|
| `vendor_id`, `name`, `vendor_category`, `is_one_off`, `status` | Stored |
| `committed_inr`, `paid_inr`, `outstanding_inr`, `overpaid_inr` | M4 |
| `next_due_on` | The earliest `due_on` among the vendor's active commitments, when `outstanding_inr` > 0 |
| `days_until_due` | Whole IST calendar days from today to `next_due_on`, an integer computed by Lane A; null when there is no due date (D99). On 25 Nov, Mallige Gardens (due 1 Dec) reads 6 |
| `due_state` | `none` when nothing is outstanding or no date is set; `overdue` when `next_due_on` is before today; `due_soon` when it is within the next 7 days; otherwise `upcoming` |
| `pending_proposals_inr` | Sum of `committed_delta_inr` of this vendor's pending proposals (A5; never added to the figures above) |

**Totals:** `total_committed_inr`, `total_paid_inr`, `total_outstanding_inr`, `total_overpaid_inr` (M5); `budget_inr`, `uncommitted_inr`, `over_budget_inr`, `unallocated_inr`, `pending_proposals_inr`, `if_approved_committed_inr` (M6).

**Category lines**, one per `budget_category` in the order of 5.2: `label`, `label_hi`, `has_line`, `planned_inr` (null when there is no line; then uncommitted and over-budget are 0, M6), `committed_inr`, `paid_inr`, `outstanding_inr`, `uncommitted_inr`, `over_budget_inr`, each the sum over the vendors of that category, with M4's rules; plus `pending_proposals_inr` from proposals in that category (Music at D0: ₹15,000, so ₹70,000 if approved).

**Demo values at D0:** Annapoorna Caterers ₹2,00,000 / ₹50,000 / ₹1,50,000; totals ₹9,27,000 / ₹3,97,000 / ₹5,30,000; budget ₹12,00,000; uncommitted ₹2,73,000; unallocated ₹0; pending proposals ₹15,000; if approved ₹9,42,000. At D1: Annapoorna ₹1,60,000 outstanding; totals paid ₹3,87,000, outstanding ₹5,40,000.

**Visibility:** owners see everything. A manager sees the vendor rows' money only with `managers_can_see_vendor_dues`, and the totals, budget and category lines only with `managers_can_see_budget` (G7). Seeded: Diya sees vendor dues but not the budget (voice test M-14).

**`vendor_ledger`, one vendor**, with the same visibility:
- The vendor, its contact, its linked functions, and its M4 figures.
- `quotes`: amount, pricing fields, status, `quoted_on`.
- `commitments`: the current version's fields; `formula_text` for per-unit ones ("250 plates × ₹800 = ₹2,00,000"); `version_count`; `voided`.
- `payments`: the current version's amount, kind, `paid_on` ("Date not given" when empty), method and note; `previous_amount_inr` (the amount of the version before the current one, when it differs: the struck-through value in C7); `corrected_by` and `corrected_at`; `version_count`; `voided`.
- `history`: every version of every commitment and payment, oldest first: `version_no`, the values, `change_reason`, who, when, `source`, and for voice the `spoken_text`.
- `estimate`: the `catering_estimate` rows (4.5) for this vendor, if any.

### 4.3 `itinerary`

- `functions`, ordered by start, each with the draft values, the venue, `version`, and `published` (the same function's values in the latest snapshot, or absent if never published). Each also carries `requirements` (D99: `requirement_id`, `label`, `status`; empty until Should #12 ships). `label` is the text plus " for {quantity}" when a quantity is set, as in ACT-10.
- `venues` (D99): every venue of the wedding, with `venue_id`, `name` and `capacity`, for the function editor's venue picker. The `venues` and `requirements` types are in the contracts PR, and Lane A delivers both in A4 (11:40).
- `unpublished_changes` (P8): one item per differing field: `entity` (`wedding`, `event`, `venue`, `invite_style`), `entity_id`, `field`, `published_value`, `draft_value`, `changed_by` and `changed_at` (from the latest activity entry for that field). At D2 there is exactly one: the reception venue, Banyan Hall → Lotus Hall, by Diya.
- `conflicts`, computed on the draft, members only (guests never see warnings, G2):
  - `overlap`: two functions on the same day whose times overlap, taking 3 hours as the length when `end_time` is empty. Fields `event_ids`, `overlap_minutes`, and the text "The Mehendi ends at 19:30 but the Sangeet starts at 19:00: 30 minutes overlap." This one stays unresolved in the demo copy (demo-data.md 3.1).
  - `over_capacity`: a function's `confirmed_headcount` (4.4) is above its venue's `capacity`: "Banyan Hall seats 220; 229 are attending the reception." It disappears in the draft once Diya moves the reception to Lotus Hall (300).
- `draft_version`, `published_revision`, and the latest publication's `published_at` and `published_by`.

### 4.4 `rsvp_totals`

Per active function, ordered by start:

| Field | Formula (R5) |
|---|---|
| `invited` | Active invitations (not revoked, guest not deleted) |
| `attending`, `declined`, `pending` | Active invitations by `rsvp_status` |
| `confirmed_headcount` | Sum over attending invitations of 1 + `plus_ones` (R4) |
| `named`, `synthetic` | The same five counts split by `guests.is_synthetic` (demo-data.md 4.5: reception attending 32 + 197) |
| `expected_headcount` | The planning field, shown beside the counts and never mixed into them (E7) |

The reception reads 250 / 229 / 9 / 12 with headcount 229 at D0, and 250 / 230 / 9 / 11 with headcount 230 from D4. The sangeet reads 150 / 136 / 8 / 6 throughout. `rsvp_guest_list` (members) lists, per function, each invited guest with household, group, status, plus-ones and dietary note; the 210 synthetic guests collapse into one row, "210 imported guests (synthetic placeholders)". Phone numbers and emails appear only for owners and for managers with `managers_can_see_guest_contacts`. Each household also carries `link_status` (`none`, `active` or `revoked`) and `last_rotated_at` (null if its link was never rotated). Their type and fixture are in `lane-lead-contracts-2` (about 10:30), and Lane A delivers them in A5 (12:30; D99).

### 4.5 `catering_estimate`

One row per commitment that meets E1:

| Field | Formula |
|---|---|
| `commitment_id`, `vendor_name`, `event_id`, `event_title`, `unit` | Stored |
| `unit_price_inr`, `contract_amount_inr`, `contract_quantity` | The commitment's current version |
| `expected_headcount` | The function's planning field (E7) |
| `confirmed_headcount` | 4.4 for that function |
| `estimate_inr` | `confirmed_headcount` × `unit_price_inr` (E2) |
| `difference_inr`, `direction` | E3 |
| `formula_text`, `label`, `label_hi` | "230 attending × ₹800", "Estimate, not the contract", "अंदाज़ा, कॉन्ट्रैक्ट नहीं" (E6) |

D0: 229 × ₹800 = ₹1,83,200, ₹16,800 below the ₹2,00,000 contract. D4: 230 × ₹800 = ₹1,84,000, ₹16,000 below. Visibility: as vendor money (4.2).

### 4.6 `guest_invitation_view` (the only guest read model)

Built for the household that the token resolves to (G1), only from the latest publication snapshot plus that household's live invitation rows, by copying allowed fields (G3):

- `revision`.
- `wedding`: `bride_name`, `groom_name`, `city`, `wedding_date`, `heading_hi`, `wording_en`, `wording_hi`, `blessing_line`, `theme`, `typeface`, `layout`, `photo_frame`, and `photo_url` (a signed URL valid for 1 hour, or absent).
- `household`: `name`, and `guests` with `guest_id`, `full_name` and `dietary_note`.
- `functions`: only functions in the snapshot to which at least one guest of the household has an active invitation (P10). Each has `event_id`, `event_kind`, `title`, `title_hi`, `starts_at`, `ends_at`, `muhurat_at`, `dress_code`, `description`, `venue` (`name`, `place_name`, `locality`, `address`, `map_url`), and `responses`: for each invited guest of the household, `guest_id`, `rsvp_status`, `plus_ones` and `max_plus_ones`.

Nothing else, ever (G2): no counts, no other guests, no money, no vendors. Tara at D4:

```json
{
  "revision": 3,
  "wedding": { "bride_name": "Mira", "groom_name": "Kabir", "city": "Bengaluru", "wedding_date": "2026-12-14",
               "heading_hi": "शुभ विवाह", "theme": "maroon_gold", "photo_url": "https://…(signed, 1 h)" },
  "household": { "name": "Bhat", "guests": [ { "guest_id": "9a3f…", "full_name": "Tara Bhat", "dietary_note": null } ] },
  "functions": [
    { "event_id": "51c2…", "event_kind": "sangeet", "title": "Sangeet", "starts_at": "2026-12-13T19:00:00+05:30",
      "venue": { "name": "Garden Hall", "place_name": "Mallige Gardens" },
      "responses": [ { "guest_id": "9a3f…", "rsvp_status": "attending", "plus_ones": 0, "max_plus_ones": 0 } ] },
    { "event_id": "e5d1…", "event_kind": "reception", "title": "Reception", "starts_at": "2026-12-14T19:30:00+05:30",
      "venue": { "name": "Lotus Hall", "place_name": "Mallige Gardens" },
      "responses": [ { "guest_id": "9a3f…", "rsvp_status": "attending", "plus_ones": 0, "max_plus_ones": 0 } ] }
  ]
}
```

`GET /api/i/{token}/revision` returns only `{"revision": 3}`; the guest page polls it every 10 s (5.6). It resolves the token exactly as the page does, so an unknown, malformed or revoked token gets the same 404 as the page (G5).

### 4.7 `activity_feed`

- **Fields** per entry: `id`, `seq`, `occurred_at`, `actor_type`, `actor_label`, `command`, `topic`, `entity_type`, `entity_id`, `summary_en`, `summary_hi`, `before`, `after`, `source`, `voice_turn_id`, `spoken_text`, `proposal_id`, and `awaiting_publish` (true for a draft edit made after the latest publish: "Draft. Guests still see Banyan Hall.").
- **Order and paging:** `seq` descending; parameters `before_seq` and `limit` (default 50, at most 200).
- **Filters:** `day` (an IST date, `today` allowed), `actor_member_id`, `topic_prefix` (such as `payment.`), `entity_id`.
- **Visibility:** owners see every entry; managers see entries with visibility `members` (L5); guests never see the feed. For a manager, `before` and `after` also lose any money, budget, contact or shagun field, as a second check behind L5a.
- Voice test O-02 ("Diya ne kya badla?") reads the latest entry by Diya (ACT-07) plus its `awaiting_publish` flag.

### 4.8 `export_job_status`

**Who builds it (D16, D52).** Lane D, in `src/server/jobs/status.ts`, because its computed fields (`stalled`, `can_retry`, `card_summary`) are job logic. The contracts PR ships that file as a stub returning the fixture export view; Lane A's read-model index re-exports it from the contracts merge (about 09:50–09:55, D70), and Lane D replaces the body in `lane-d-export-jobs` in the 11:40 batch.

**Member view** (exports panel; normal JSON types; it never writes, so a stalled job is only shown as stalled): `job_id`, `job_label` (computed `JOB-EXP-R{revision}-{FORMAT}`), `revision`, `format`, `status`, `label` (queued "Queued"; rendering "Rendering", or "Retrying" from attempt 2; succeeded "Ready"; failed "Failed"), `synthetic` (shows "Deliberate drill"), `attempts`, `max_attempts`, `renderer` (`chromium` or `og`, the latest attempt's), `card_summary` (one line: couple, functions, date, venue), `card_functions` (the titles behind `card_event_ids`), `last_error` (`code`, `message`, `at`), `notified_at`, `stalled` (computed: `rendering` past its lease, or `queued` for over 60 s: "Stopped responding"), `can_retry` (owner, job failed or stalled, attempts left, revision current), `out_of_date` (the revision is older than `published_revision`: "Out of date. Export a new card." P9), `download_url` (signed, 10 minutes, only when succeeded, download name `jashn-card-rev{n}.png`), and `attempt_log` (each attempt's number, trigger, times, outcome, error code, renderer, NudgeBee run id and approver).

**Ops view** (`GET /api/ops/export-jobs/{job_id}`; export-and-recovery.md 5.2 is binding and has the worked examples): HTTP 200 for any existing job, 401 for a bad token, 404 for an unknown job or a non-UUID id. It runs lazy expiry first, without sending the webhook. Optional query: `wait` (0 to 10 s: hold the answer while the job is `queued` or `rendering`) and `expect=succeeded` (after the wait, 412 `expectation_failed` if the job hasn't succeeded). Every scalar is a string ("true"/"false" for booleans) and nothing is null; `artifact`, `last_error` and `last_recovery` are always objects, with empty strings where there is no value. There are **no signed URLs**, because NudgeBee run output is not masked. Fields: `job_id`, `job_label`, `export_key`, `wedding_id`, `revision`, `latest_revision`, `format`, `status`, `retryable`, `attempts`, `max_attempts`, `synthetic`, `last_error`, `artifact`, `last_recovery`, `card_summary`, `updated_at`.

```json
{
  "job_id": "5b1e…", "job_label": "JOB-EXP-R3-PNG", "export_key": "export:0b7c…:rev3:png",
  "wedding_id": "0b7c…", "revision": "3", "latest_revision": "3", "format": "png",
  "status": "failed", "retryable": "true", "attempts": "1", "max_attempts": "3", "synthetic": "true",
  "last_error": { "code": "DRILL_INJECTED", "message": "Injected fault (deliberate): renderer timeout", "at": "2026-11-25T08:12:07Z" },
  "artifact": { "artifact_id": "", "sha256": "", "bytes": "", "created_at": "" },
  "last_recovery": { "nudgebee_execution_id": "", "approver": "", "attempt": "" },
  "card_summary": "Mira & Kabir, Reception, Monday, 14 December 2026, Lotus Hall",
  "updated_at": "2026-11-25T08:12:07Z"
}
```

After recovery: `"status": "succeeded"`, `"retryable": "false"`, `"attempts": "2"`, `artifact` filled (`"artifact_id": "card-rev3.png"`) and `last_recovery` filled (`"attempt": "2"`).

### 4.9 Voice questions (`intent` `ask`)

| Voice kind | Read model and fields | Reply rule |
|---|---|---|
| `query_balance` | `money_summary` vendor row, or `vendor_ledger` | Hindi: the amount in words, then "बाकी हैं।" (M7): "एक लाख साठ हज़ार रुपये बाकी हैं।" English: "₹1,60,000 is still owed to Annapoorna Caterers." `user_claim_inr` is compared in code; a wrong claim is corrected, never agreed with (M-09) |
| `query_budget` | `money_summary` totals and category lines | Refused for managers without `managers_can_see_budget` (M-14) |
| `query_rsvp` | `rsvp_totals` | "229 of 250 have confirmed for the reception. 9 declined and 12 haven't replied yet." (G-01) |
| `query_event` | `itinerary` | Members hear the draft value, plus the published one if it differs. O-03 joins two answers: "Reception: Lotus Hall. एक लाख साठ हज़ार रुपये बाकी हैं।" |
| `query_changes` | `activity_feed` (actor, latest) and `itinerary.unpublished_changes` | O-02 |
| `query_catering` | `catering_estimate` | V-01 |
| `query_shagun` | `shagun_register` (4.10) | Owners only |

Every answer is a code template with numbers from these read models; the templates live in voice.md section 4, which wins on wording. The second, tool-free model call (research-sarvam.md) is **off today** (voice.md 4.1): if it is ever built, it gets only read-model facts, and code checks that every number in its text appears among those facts, falling back to the template on a mismatch (M8). A guest asking anything beyond their own invitation gets "Sorry, I can only help with your invitation and RSVP." (G-05).

### 4.10 `proposals` and `shagun_register`

- **`proposals`:** `proposal_id`, `command`, `summary_en`, `summary_hi`, `committed_delta_inr`, `paid_delta_inr`, `status`, `proposed_by`, `proposed_at`, `decided_by`, `decided_at`, `reason` (the manager's) and `decision_reason` (the owner's). Owners see all; a manager sees only their own (A7). At D0: PRP-01, pending, ₹15,000, by Diya.
- **`shagun_register`** (owners only): entries (`giver_name`, household, `amount_inr`, `received_on`, `how`, `note`, `thank_you` with `thanked_note`), plus `total_received_inr` and `pending_thank_yous`. At D0: ₹40,300 and 3; after SHG-06: ₹45,400 and 4.

### 4.11 `wedding_profile` and `team` (D99)

- **`wedding_profile`** (members): `wedding_id`; `display_name` ("Mira & Kabir", from `bride_name` and `groom_name`); `wedding_date`, plus `first_event_date` and `last_event_date` (null until a function exists); `city`; `budget_inr` (owners, and managers with `managers_can_see_budget`; otherwise `budget` is listed in `hidden`); `is_sample`; and `member`, the current member's `role` and `display_name`. It feeds D60's landing view and B1's shell. Its type and fixture are in the contracts PR (D44), and Lane A makes it real at 10:45.
- **`team`** (owners only): `members` (each `member_id`, `display_name` and `role`), `pending_invites` (each `member_invite_id`, `email`, `role`, `display_name` and `expires_at`) and the three `managers_can_see_*` sharing flags. Lane B's Team and sharing sheet reads it, with the household link fields of 4.4 (D109). Its type and fixture are in `lane-lead-contracts-2` (about 10:30), and Lane A delivers it in A6 (12:30).

---

## 5. Data model (Supabase Postgres, schema `app`)

### 5.0 Standard columns and conventions

These columns are on every table unless the table says otherwise, and are not repeated below:

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | Primary key. Not on `budgets`, `invite_styles` and `guest_contacts` (keyed by their parent), `vendor_events` (composite key) or `command_receipts` (keyed by the idempotency key) |
| `wedding_id` | uuid | no | | FK to `weddings.id`, on delete cascade, indexed. Not on `weddings`; nullable on `voice_turns` and `command_receipts` (wedding setup) |
| `created_at` | timestamptz | no | `now()` | |
| `updated_at` | timestamptz | no | `now()` | Only on tables whose rows change; set by the command |
| `seed_key` | text | yes | | On every row the seed writes, in every table (`EVT-REC`, `PAY-01`, `H16`, `PAY-01/v1`, `COM-01/v1`, `INV-H16-EVT-REC`, `VE-VEN-CAT-EVT-REC`, `BL-catering`; parent-keyed tables use their parent's key). Unique per table and wedding when present. Live rows have none, which is how `reset_demo` finds them (3.7) |

- **Seeded ids.** Live rows keep the `gen_random_uuid()` default. Seeded rows get fixed UUIDv5 ids from the sample copy and the `seed_key`, through the helper `src/db/ids.ts` (0.1, D100), so a wipe and reseed gives the same ids. The seed builds the REV-1 and REV-2 snapshots with Lane A's pure builder `src/db/itinerary-snapshot.ts`, the one `publish_itinerary` imports (5.3, D95), never by hand.
- **No database behaviour.** No trigger, SQL function or RPC implements app behaviour. Activity entries, `version` and `draft_version` bumps, `updated_at`, version supersession (C2) and receipts are written by the dispatcher in the command's transaction.
- **No foreign key into `auth`.** `members.user_id`, `weddings.created_by_user_id`, `voice_turns.user_id`, `experiment_exposures.user_id` and `card_imports.user_id` hold the Supabase user id without a constraint, because drizzle-kit manages only `app`.
- Money columns are bigint whole rupees with a check of at least 0, or at least 1 where M2 requires a positive amount.
- Every reference between wedding-scoped rows must point at a row of the same wedding. The dispatcher checks it (3.0 step 3); a test tries a foreign id and expects 404.
- Function times are IST wall-clock values (a `date` plus `time` columns), because every function is in India. Read models expose `starts_at` and `ends_at` with the +05:30 offset.
- No hackathon command deletes a function, guest, vendor or requirement. Their `deleted_at` columns are reserved, and read models already exclude rows that have one.
- Audio is never stored. A voice turn keeps the transcript only.

### 5.1 Tables

#### Wedding, budget and members

**`weddings`**

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `bride_name`, `groom_name` | text | no | | 1 to 60 characters |
| `city` | text | yes | | |
| `wedding_date` | date | no | | The main date shown on the invitation |
| `expected_guests` | integer | yes | | Planning number from setup |
| `timezone` | text | no | `Asia/Kolkata` | Fixed in the hackathon |
| `is_sample` | boolean | no | false | A sample copy (the demo copy D0, rehearsal copies `a` to `d`, the `e2e` copy; 3.7); enables the badge, `reset_demo` and the export drill |
| `managers_can_see_vendor_dues`, `managers_can_see_budget`, `managers_can_see_guest_contacts` | boolean | no | false | G7. The seed sets vendor dues to true |
| `version` | bigint | no | 0 | +1 in every state-changing transaction (L6). Never goes down, not even on reset |
| `draft_version` | bigint | no | 0 | +1 when a guest-visible draft field changes (P1) |
| `published_revision` | integer | yes | | Revision of the latest publication; empty before the first publish |
| `created_by_user_id` | uuid | no | | The Supabase Auth user who created it (no foreign key, 5.0) |

**`budgets`**: `wedding_id` (uuid, primary key, FK), `total_inr` (bigint, not null, default 0), `updated_at`. Kept apart from `weddings` so a manager's reads never touch it without `managers_can_see_budget`.

**`budget_lines`**: `budget_category` (enum, not null), `planned_inr` (bigint, not null). Unique on (`wedding_id`, `budget_category`).

**`members`**

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `user_id` | uuid | no | | The Supabase Auth user id (the `sub` claim), with no foreign key (5.0). Unique on (`wedding_id`, `user_id`); indexed on `user_id` for the guard's membership check (6.2) |
| `role` | `member_role` | no | | |
| `display_name` | text | no | | "Mira", "Diya": used as `actor_label` |
| `preferred_language` | `app_language` | no | `en` | |
| `removed_at` | timestamptz | yes | | Set by `remove_member` (3.1). A removed member fails every check |

**`member_invites`**: `email` (text, not null), `role` (`member_role`), `display_name` (text), `token_hash` (bytea, not null, unique), `expires_at` (timestamptz, not null, 48 hours after creation), `accepted_at`, `accepted_by_member_id`, `revoked_at`, `invited_by_member_id`.

#### Functions, the invitation and publications

**`venues`**: `name` (text, not null: "Lotus Hall"), `place_name` (text: "Mallige Gardens"), `locality` (text: "Whitefield"), `address` (text), `capacity` (integer), `map_url` (text). Unique per wedding on `name` and `place_name`, ignoring case. Seeded: Courtyard Lawn 80, Garden Hall 180, Mandap Lawn, Banyan Hall 220 and Lotus Hall 300 at Mallige Gardens, and the Terrace at the Deshpande family home, Jayanagar.

**`events`** (functions)

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `event_kind` | `event_kind` | no | | |
| `title`, `title_hi` | text | no | | "Reception", "रिसेप्शन" |
| `event_date` | date | no | | |
| `start_time`, `end_time`, `muhurat_time` | time | yes | | IST wall clock; check: end after start |
| `venue_id` | uuid | yes | | FK to `venues` |
| `dress_code`, `description` | text | yes | | |
| `lead_name` | text | yes | | The function lead ("Diya Fernandes"), not an account role |
| `expected_headcount` | integer | yes | | Planning only (E7) |
| `sort_order` | integer | no | 0 | Tie-break after date and time |
| `version` | integer | no | 1 | Optimistic concurrency for `update_event` (I4) |
| `deleted_at` | timestamptz | yes | | Reserved |

Indexed on (`wedding_id`, `event_date`, `start_time`).

**`invite_styles`**: `wedding_id` (primary key, FK); `theme` (default `maroon_gold`); `typeface` (default `eczar`); `layout` (default `card_with_inserts`); `photo_frame` (default `mounted`); `photo_asset_id` (FK to `assets`, nullable); `heading_hi` (default "शुभ विवाह"); `wording_en`, `wording_hi` (text); `blessing_line` (text, nullable); `updated_at`, `updated_by_member_id`.

**`assets`**: `asset_kind` (enum, not null; `couple_photo` only), `storage_path` (text, not null, unique: the object key `{wedding_id}/{asset_id}.{ext}` in bucket `uploads`, without the bucket name), `mime_type` (text), `bytes` (integer, at most 10 MB), `width`, `height` (integer), `uploaded_by_member_id`. Seeded: the couple photo (D14, D107). L commits it as `scripts/seed-assets/couple-photo.jpg` by 11:00, in a lead PR merged first in the 11:40 batch. The seed's photo step is idempotent: it uploads the file and upserts the asset row by `seed_key`, and touches nothing else. L runs it for every copy right after the 11:40 deploy. From then on the photo is part of D0, so `reset_demo` keeps it. The card renders with and without a photo.

**`publications`**

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `revision` | integer | no | | Unique on (`wedding_id`, `revision`); 1, 2, 3 in order |
| `snapshot` | jsonb | no | | The guest-visible draft at publish time (5.3) |
| `draft_version` | bigint | no | | The `draft_version` that was reviewed and published |
| `changes` | jsonb | no | `[]` | Field-by-field differences from the previous revision (5.3) |
| `note` | text | yes | | |
| `published_by_member_id` | uuid | no | | |
| `published_at` | timestamptz | no | `now()` | |

No command updates or deletes a publication (P4). Seeded: REV-1 and REV-2.

#### Guests and RSVPs

**`households`**: `name` (text, not null: "Bhat"), `relation` (text), `primary_guest_id` (FK to `guests`, nullable), `is_synthetic` (boolean, default false: true only for "Imported list (synthetic)", which has no link).

**`guests`**: `household_id` (uuid, not null, FK, indexed), `full_name` (text, not null), `group_label` (text), `dietary_note` (text), `note` (text), `is_synthetic` (boolean, default false), `deleted_at` (reserved). Seeded: 40 named guests and 210 synthetic ones, "Imported guest 041" to "Imported guest 250".

**`guest_contacts`**: `guest_id` (primary key, FK), `wedding_id`, `phone`, `email`, `updated_at`. A separate table so the contact columns are read only by the queries G7 allows.

**`invitations`** (one per guest per function; it holds the RSVP)

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `guest_id` | uuid | no | | FK. Unique on (`guest_id`, `event_id`) (R1) |
| `event_id` | uuid | no | | FK. Indexed on (`event_id`, `rsvp_status`) for counts |
| `max_plus_ones` | smallint | no | 0 | 0 to 10 |
| `rsvp_status` | `rsvp_status` | no | `pending` | |
| `plus_ones` | smallint | no | 0 | Check: between 0 and `max_plus_ones`, and 0 unless attending (R2) |
| `responded_at` | timestamptz | yes | | |
| `responded_via` | `rsvp_channel` | yes | | |
| `rsvp_updated_by_member_id` | uuid | yes | | Set by `set_rsvp` (R10) |
| `revoked_at` | timestamptz | yes | | R11 |

**`invitation_links`** (one active per household)

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `household_id` | uuid | no | | FK. Partial unique: one row per household where `revoked_at` is empty |
| `token_hash` | bytea | no | | SHA-256 of the token (6.3). Unique; the lookup key |
| `token_hint` | text | no | | Last 4 characters, for the UI |
| `created_by_member_id` | uuid | yes | | Empty for seeded links |
| `revoked_at` | timestamptz | yes | | |

#### Vendors and money

**`vendors`**: `name` (text, not null; unique per wedding ignoring case), `vendor_category` (`budget_category`, not null), `status` (`vendor_status`, default `considering`), `is_one_off` (boolean, default false), `contact_name`, `contact_phone`, `notes` (text), `deleted_at` (reserved). Seeded: VEN-CAT, VEN-VEN, VEN-DEC, VEN-PHO, VEN-MEH, VEN-DJ, and two one-off payees, "Printer (fictional)" and "Boutique (fictional)".

**`vendor_events`**: `vendor_id` and `event_id` (both FK, together the primary key), `wedding_id`.

**`quotes`**: `vendor_id` (not null), `event_id` (nullable), `pricing` (`commitment_pricing`), `unit`, `unit_price_inr`, `quantity` (nullable, all three set for `per_unit`), `amount_inr` (bigint, not null, computed for `per_unit`), `description`, `quoted_on` (date), `valid_until` (date), `status` (`quote_status`, default `open`), `created_by_member_id`. Seeded: QUO-01 to QUO-06, one per regular vendor, QUO-01 being Annapoorna's ₹850 × 250 = ₹2,12,500.

**`commitments`** (identity) and **`commitment_versions`** (values)

| Table | Column | Type | Null | Notes |
|---|---|---|---|---|
| `commitments` | `vendor_id` | uuid | no | FK. Fixed for life (C5) |
| | `quote_id` | uuid | yes | FK |
| | `current_version_no` | integer | no | Default 1 |
| | `voided_at`, `voided_by_member_id`, `void_reason` | | yes | Active means `voided_at` is empty |
| | `created_by_member_id` | uuid | yes | |
| `commitment_versions` | `commitment_id` | uuid | no | FK. Unique on (`commitment_id`, `version_no`); partial unique on `commitment_id` where `superseded_at` is empty (exactly one current, C1) |
| | `version_no` | integer | no | 1, 2, 3 |
| | `pricing`, `unit`, `unit_price_inr`, `quantity`, `amount_inr` | | per M3 | `amount_inr` not null |
| | `event_id` | uuid | yes | The function, for E1 |
| | `description`, `agreed_on`, `due_on`, `change_reason` | | yes | |
| | `source`, `voice_turn_id`, `spoken_text` | | `source` not null | Who and how (C7) |
| | `created_by_member_id` | uuid | yes | |
| | `superseded_at`, `superseded_by_version_id` | | yes | Each set once, in C2's order (C3). `superseded_by_version_id` is a plain uuid with **no foreign key**, so `reset_demo` can delete a live version without first clearing the pointer to it |

**`payments`** (identity) and **`payment_versions`** (values)

| Table | Column | Type | Null | Notes |
|---|---|---|---|---|
| `payments` | `vendor_id` | uuid | no | FK. Fixed for life (C5); indexed |
| | `commitment_id` | uuid | yes | FK |
| | `payment_kind` | `payment_kind` | no | Fixed for life |
| | `current_version_no` | integer | no | Default 1 |
| | `voided_at`, `voided_by_member_id`, `void_reason` | | yes | C9 |
| | `created_by_member_id` | uuid | yes | |
| `payment_versions` | `payment_id` | uuid | no | FK. Same two unique rules as `commitment_versions` |
| | `version_no` | integer | no | |
| | `amount_inr` | bigint | no | At least 1 |
| | `paid_on` | date | yes | Empty means "not stated" |
| | `method` | `payment_method` | yes | |
| | `note`, `change_reason` | text | yes | |
| | `source`, `voice_turn_id`, `spoken_text` | | `source` not null | M-03 stores "Caterer ko chaalis hazaar advance diya tha" |
| | `created_by_member_id` | uuid | yes | |
| | `superseded_at`, `superseded_by_version_id` | | yes | As in `commitment_versions`: C2's order, no foreign key on the pointer |

Seeded payments: PAY-01 to PAY-06, and EXP-01 and EXP-02 (whose commitments carry the same seed keys). Seeded version rows carry `{seed_key}/v{n}` (PAY-01/v1). Seeded COM-01 v1: `per_unit`, `unit` `plate`, `unit_price_inr` 800, `quantity` 250, `amount_inr` 200000, `event_id` EVT-REC, `description` "250 covers × ₹800, fixed minimum".

#### Notes, gifts and proposals

**`requirements`**: `event_id` (not null), `requirement_category` (default `other`), `text` (not null), `quantity` (integer, nullable), `vendor_id` (nullable), `created_by_member_id`, `deleted_at` (reserved). Seeded REQ-01 to REQ-09.

**`shagun_entries`**: `giver_name` (not null), `household_id` (nullable), `amount_inr` (bigint, at least 1), `received_on` (date, not null), `how`, `note` (text), `thanked_at` (timestamptz; empty means the thank-you is pending), `thanked_note`, `thanked_by_member_id`, `recorded_by_member_id`. Seeded SHG-01 to SHG-05.

**`proposals`**

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `command` | text | no | | One of the A1 commands |
| `input` | jsonb | no | | That command's input, unchanged |
| `reason` | text | yes | | The manager's note |
| `summary_en`, `summary_hi` | text | no | | From the 3.5 table |
| `vendor_id` | uuid | yes | | For per-vendor `pending_proposals_inr`, and the vendor approval runs against (3.5); empty when the payee does not exist yet ("new vendor", PRP-01) |
| `budget_category` | `budget_category` | yes | | From the input (`record_expense`) or the vendor; for the category lines' `pending_proposals_inr` |
| `committed_delta_inr` | bigint | no | 0 | May be negative (a void) |
| `paid_delta_inr` | bigint | no | 0 | How much paid would rise (3.5); may be negative |
| `status` | `proposal_status` | no | `pending` | Indexed on (`wedding_id`, `status`) |
| `proposed_by_member_id` | uuid | no | | |
| `decided_by_member_id`, `decided_at`, `decision_reason` | | yes | | |
| `result_entity_id` | uuid | yes | | What the approval created or changed |
| `voice_turn_id` | uuid | yes | | |

Seeded PRP-01: `record_expense` with payee "Dhol player", Music and entertainment, ₹15,000, not paid in full, description "For the baraat", proposed by Diya.

#### History, receipts, exports and voice

**`activity_entries`**

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `seq` | bigint | no | identity | Unique; the feed's order and cursor. Indexed on (`wedding_id`, `seq`) and (`wedding_id`, `actor_member_id`, `seq`) |
| `occurred_at` | timestamptz | no | `now()` | Seeded entries carry their demo-data times |
| `actor_type` | `actor_type` | no | | |
| `actor_member_id`, `actor_guest_id` | uuid | yes | | Whichever applies |
| `actor_label` | text | no | | The name at the time: "Mira", "Tara Bhat", "NudgeBee" |
| `command`, `topic` | text | no | | Topics in 5.4 |
| `source` | `command_source` | no | | |
| `entity_type`, `entity_id` | | no | | |
| `summary_en`, `summary_hi` | text | no | | From the section 3 templates (L3) |
| `before`, `after` | jsonb | yes | | Changed fields only |
| `visibility` | `activity_visibility` | no | | L5 |
| `proposal_id`, `voice_turn_id`, `spoken_text`, `idempotency_key` | | yes | | |

**`command_receipts`**

| Column | Type | Null | Notes |
|---|---|---|---|
| `idempotency_key` | text | no | Primary key |
| `command` | text | no | |
| `wedding_id` | uuid | yes | |
| `actor_key` | text | no | `member:{id}`, `household:{id}` or `ops` |
| `request_hash` | text | no | SHA-256 of the command name and canonical input; a different hash for the same key is `idempotency_key_reused` (I2) |
| `outcome`, `http_status` | text, integer | no | |
| `response` | jsonb | no | The response as sent, with raw tokens and signed URLs removed |
| `created_at` | timestamptz | no | |

**`export_jobs`**

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `publication_id` | uuid | no | | FK |
| `revision` | integer | no | | |
| `format` | `export_format` | no | `png` | |
| `export_key` | text | no | | Unique: `export:{wedding_id}:rev{revision}:{format}` |
| `status` | `export_status` | no | `queued` | |
| `card_event_ids` | uuid array | no | | The published functions every invited guest is invited to (all published functions when nobody is invited), frozen at creation (P10, 3.7) |
| `attempts`, `max_attempts` | integer | no | 0, 3 | |
| `lease_until` | timestamptz | yes | | Set when a worker claims the job |
| `fail_injection` | `fail_injection` | no | `none` | The drill (3.7) |
| `synthetic` | boolean | no | false | Shown as "Deliberate drill" |
| `last_error_code`, `last_error_message`, `last_error_at` | | yes | | `DRILL_INJECTED`, `RENDER_TIMEOUT`, `FONT_NOT_LOADED`, `RENDER_FAILED`, `UPLOAD_FAILED`, `LEASE_EXPIRED`, `NOT_STARTED` (3.7) |
| `artifact_path`, `artifact_sha256`, `artifact_bytes`, `artifact_created_at` | | yes | | Set on success. `artifact_path` is the object key `{wedding_id}/card-rev{revision}.png` in bucket `exports`, without the bucket name |
| `notified_at` | timestamptz | yes | | When the failure webhook (3.7) was sent |
| `requested_by_member_id` | uuid | no | | |

Seeded: JOB-EXP-R2-PNG (succeeded 24 Nov 21:05, Banyan Hall; out of date after REV-3). Its file is `scripts/seed-assets/card-rev2.png`, which Lane D renders from a Banyan Hall variant of the probe fixture at about 12:00 and commits (a one-file exception to Lane A's `scripts/`). Lane A's seed uploads it when present. Until then the job is seeded Ready with no file, and rehearsals before 13:45 skip its download (D15).

**`export_attempts`**: `job_id` (FK), `attempt_no` (unique with `job_id`), `trigger` (`export_trigger`), `idempotency_key` (text, unique, nullable), `nudgebee_workflow_id`, `nudgebee_execution_id`, `approver` (text), `status` (`export_status`), `renderer` (text, nullable: `chromium` or `og`, set at the claim), `error_code`, `started_at`, `finished_at`.

`export_jobs` and `export_attempts` are operational: Lane D's job module writes them (0.1), using Lane A's append-activity and bump-version helpers in the same transaction.

**`voice_turns`** (the voice log; research-flagsmith.md called it `voice_attempts`)

| Column | Type | Null | Notes |
|---|---|---|---|
| `wedding_id` | uuid | yes | Empty during setup |
| `user_id`, `member_id` | uuid | `member_id` yes | The speaker |
| `status` | `voice_turn_status` | no | 3.8 |
| `transcript`, `language_code` | text | yes | |
| `intent` | text | yes | `act`, `ask` or `clarify` |
| `actions` | jsonb | no | The validated preview: per action, the command, its input, the words heard and resolved names |
| `missing_fields` | jsonb | no | |
| `reply_text` | text | yes | |
| `context_turn_id`, `superseded_by_turn_id` | uuid | yes | |
| `flags` | jsonb | yes | Flag values read for this turn: `voice_pilot`, `voice_writes_enabled`, `spoken_replies`, `env_label`, the setup variant (setup turns) and `fallback` (true when any value was a fallback). Development and Production share one database, so the rollout gate counts only turns whose `env_label` is `production` (flagsmith.md 3.2, 4.3) |
| `refusal_code` | text | yes | `voice_writes_paused` (R-03 lands here, not in the ledger), `forbidden` or `not_shared` |
| `results` | jsonb | yes | Per action: outcome, error code, entity id, and the voice gate's answer |
| `expires_at` | timestamptz | no | Created plus 10 minutes (V2) |
| `confirmed_at`, `confirmed_via` | | yes | `tap` or `phrase`. `confirmed_at` is written once the confirm passes its checks, before the first action runs (voice.md 9) |
| `client_turn_id` | uuid | no | From the dock; unique with `user_id`, so a repeated request replays |
| `input_mode` | text | no | `speech`, `typed`, `tap` or `fixture` |
| `speech_language`, `reply_language` | text | yes | `hi-IN` or `en-IN`; the register `en`, `hinglish` or `hi` |
| `reply_speech`, `options` | jsonb | yes | The latest reply's speech parts; a question's options |
| `ref_map`, `trace`, `timings_ms` | jsonb | no | Reference-to-UUID map used by the confirm; the judge panel's trace (never audio); timings |
| `fixture_id` | text | yes | The test row, in fixture mode |

voice.md section 9 is binding for these voice columns. `voice_turns` is operational: only Lane C's voice routes write it, outside the dispatcher, and writing a turn never moves `weddings.version`. `failed` is used only when speech-to-text, the model or the server failed; command errors leave the turn `proposed`. Indexes: (`user_id`, `client_turn_id`) unique; (`user_id`, `wedding_id`, `created_at`) for the speaker's open and latest turns and for V10's counts. No audio column, ever.

#### Operational tables defined by other specs

Lane A creates both in schema `app`, with RLS on and no policies, like every table. Only Lane C's server modules write them, outside the dispatcher, and neither moves `weddings.version` or appears in a publication snapshot.

**`experiment_exposures`** (flagsmith.md 5.10 is binding): `id`, `user_id` (no foreign key), `experiment` (`setup_entry`), `flagsmith_env` (the `env_label` at exposure), `flagsmith_experiment_id` (nullable), `identity_key`, `variant` (`voice_first` or `form_first`), `exposed_at`, `converted_at` (nullable), `seconds_to_save` (nullable), `wedding_id` (nullable). Unique on (`user_id`, `experiment`, `flagsmith_env`).

For both tables the 5.0 standard columns don't apply: the columns are exactly the ones listed in the owning spec.

**`card_imports`** (doc-ai.md 1.8 is binding): `id` (the routes' `import_id`), `request_idempotency_key` (unique per `user_id`), `user_id` (no foreign key), `wedding_id` (null until applied), `provider` (`docai` or `gemma4`), `language`, `image_sha256`, `image_bytes` (never the image), `sarvam_idempotency_key` (unique), `sarvam_job_id`, `sarvam_run_id`, `status` (enum `card_import_status`: `submitting`, `reading`, `fetching`, `ready`, `failed`, `timed_out`, `applied`, `applied_partial`, `discarded`, `expired`), `sarvam_status`, `last_checked_at`, `submitted_at`, `ready_at`, `applied_at`, `error_code`, `error_detail`, `pages_total`, `draft` (cleared on apply, discard or expiry), `field_counts`, `applied_event_ids`, `created_at`, `updated_at`.

### 5.2 Enums (Postgres enum types in schema `app`)

| Enum | Values (UI label / Hindi where shown to people) |
|---|---|
| `member_role` | `owner` (Owner / मालिक), `manager` (Event manager / इवेंट मैनेजर) |
| `app_language` | `en`, `hi` |
| `event_kind` | `mehendi` (मेहंदी), `haldi` (हल्दी), `sangeet` (संगीत), `wedding` (विवाह), `reception` (रिसेप्शन), `other` |
| `invite_theme` | `maroon_gold` (Maroon & Gold), `peacock_gold` (Peacock & Gold) |
| `invite_typeface` | `eczar`, `tiro_devanagari` |
| `invite_layout` | `card_with_inserts`, `one_card`, `facing_pages` |
| `photo_frame` | `mounted`, `arch` |
| `asset_kind` | `couple_photo` (card photos are never stored, doc-ai.md 3.1) |
| `budget_category` | In this order: `venue` (Venue and halls / वेन्यू और हॉल), `catering` (Catering / खाना), `decor` (Decor and flowers / सजावट और फूल), `photography` (Photography and video / फ़ोटो और वीडियो), `attire` (Attire and jewellery / कपड़े और गहने), `music` (Music and entertainment / संगीत और मनोरंजन), `mehendi_makeup` (Mehendi and makeup / मेहंदी और मेकअप), `invitations_gifts` (Invitations and gifts / निमंत्रण और तोहफ़े), `transport` (Transport and logistics / आना-जाना), `contingency` (Contingency / आकस्मिक खर्च) |
| `vendor_status` | `considering`, `booked` (demo-data's "Contracted" and "Booked" are both `booked`), `cancelled` |
| `commitment_pricing` | `lump_sum`, `per_unit` |
| `commitment_unit` | `plate`, `person`, `item`, `hour`, `day` |
| `quote_status` | `open`, `accepted` |
| `payment_kind` | `advance` (Advance / एडवांस), `instalment` (Instalment / किस्त), `final` (Final payment / आख़िरी भुगतान) |
| `payment_method` | `upi` (UPI), `cash`, `bank_transfer`, `cheque`, `card`, `other` |
| `requirement_category` | `catering`, `decor`, `music`, `ritual`, `logistics`, `attire`, `other` |
| `rsvp_status` | `attending` (Attending / आएँगे), `declined` (Can't attend / नहीं आएँगे), `pending` (Not replied / जवाब बाकी) |
| `rsvp_channel` | `guest_link`, `member` |
| `proposal_status` | `pending`, `approved`, `rejected`, `withdrawn` |
| `command_source` | `ui`, `voice`, `guest_link`, `nudgebee`, `system`, `seed` |
| `actor_type` | `member`, `guest`, `system` |
| `activity_visibility` | `members`, `owners` |
| `entity_type` | `wedding`, `budget`, `member`, `member_invite`, `event`, `venue`, `invite_style`, `asset`, `publication`, `household`, `guest`, `invitation`, `invitation_link`, `vendor`, `quote`, `commitment`, `payment`, `requirement`, `shagun_entry`, `proposal`, `export_job` |
| `voice_turn_status` | `proposed`, `confirmed`, `partially_saved`, `cancelled`, `paused`, `answered`, `superseded`, `failed`, `expired` |
| `export_format` | `png`. `pdf` is added only if the lead approves the PDF Should at 13:30: Lane A adds the value and the bucket's `application/pdf` type in an additive migration, and Lane D builds the export for the 14:30 batch (D66, 5.5) |
| `export_status` | `queued` (Queued), `rendering` (Rendering, or Retrying from attempt 2), `succeeded` (Ready), `failed` (Failed) |
| `card_import_status` | `submitting`, `reading`, `fetching`, `ready`, `failed`, `timed_out`, `applied`, `applied_partial`, `discarded`, `expired` (doc-ai.md 1.8) |
| `fail_injection` | `none`, `once`, `consumed` |
| `export_trigger` | `request`, `owner_retry`, `nudgebee` |

**API-only value sets** (in JSON, not stored as types): command `outcome` (`applied`, `replayed`, `unchanged`, `proposed`); retry `outcome` (`retried`, `already_succeeded`, `in_progress`, `not_retryable`, `stale_revision`; a replay is the `replayed` "true" flag, not an outcome); `due_state` (`none`, `upcoming`, `due_soon`, `overdue`); estimate `direction` (`below`, `above`, `equal`); voice `intent` (`act`, `ask`, `clarify`); `reset_demo` `checkpoint` (`s0`, `d0`).

### 5.3 How versions and history are stored

| What | How | Why |
|---|---|---|
| Payments and commitments | An identity row plus immutable version rows; one current version per identity, enforced by a partial unique index (C1 to C10) | Corrections keep the earlier value and who changed it |
| Functions, venues, style, wedding profile | Updated in place, with `events.version` for optimistic concurrency. The before and after values live in the activity entry | Draft edits are cheap; the guest-visible history is the publications |
| Guest-visible schedule | `publications`: a full immutable snapshot per revision, plus its `changes` list | Guests and cards read a frozen copy (P4, P5) |
| RSVPs | Updated in place on the invitation row, with the activity entry as history | One row per guest per function (R1) |
| Everything | `activity_entries`, append-only (L4) | Who changed what, when |

**Snapshot fields** (exactly the guest-visible fields of P2). The couple photo is kept as an asset id, and the guest view signs a URL when it reads it.

```json
{
  "wedding": { "bride_name": "Mira", "groom_name": "Kabir", "city": "Bengaluru", "wedding_date": "2026-12-14" },
  "invite_style": { "theme": "maroon_gold", "typeface": "eczar", "layout": "card_with_inserts", "photo_frame": "mounted",
                    "photo_asset_id": "c0a8…", "heading_hi": "शुभ विवाह", "wording_en": "With the blessings of our families…",
                    "wording_hi": "…", "blessing_line": null },
  "events": [
    { "event_id": "e5d1…", "event_kind": "reception", "title": "Reception", "title_hi": "रिसेप्शन",
      "event_date": "2026-12-14", "start_time": "19:30", "end_time": "23:00", "muhurat_time": null,
      "dress_code": "Formal evening", "description": "…",
      "venue": { "venue_id": "7f3b…", "name": "Lotus Hall", "place_name": "Mallige Gardens",
                 "locality": "Whitefield", "address": "…", "map_url": "…" } }
  ]
}
```

**`changes`** for REV-3: `[{"entity": "event", "entity_id": "e5d1…", "field": "venue", "from": "Banyan Hall", "to": "Lotus Hall"}]`. The publish review sheet and the activity text are both built from this list.

**The snapshot builder (D95).** `src/db/itinerary-snapshot.ts` [A] holds pure functions: one builds a publication snapshot from the itinerary rows, and one diffs two snapshots into a `changes` list (P2's fields). It imports nothing server-only, so `scripts/seed.ts` can use it. Lane A ships it in A1 (10:45). Lane D's `publish_itinerary` handler imports it and never writes a second builder.

**Seeded snapshots.** The seed builds REV-1 and REV-2 with that builder, never by hand: REV-2 is built from the D0 draft after open question 16's description edit, so draft and snapshot agree field for field. Times are written `HH:MM` and absent values `null` in both. Lane A's A4 test (11:40, where the itinerary read model lands) asserts that `itinerary.unpublished_changes` is empty at D0 and holds exactly one item (the reception venue) at D2.

### 5.4 Topics

Topics name what happened. They are stored on activity entries only and sent nowhere. Approval uses the executed command's topic, with `proposal_id` set.

| Area | Topics |
|---|---|
| Wedding and members | `wedding.created`, `wedding.updated`, `budget.updated`, `sharing.updated`, `member.invited`, `member.invite_revoked`, `member.joined`, `member.removed` |
| Functions and invitation | `event.created`, `event.updated`, `invite_style.updated`, `asset.added`, `itinerary.published` |
| Vendors and money | `vendor.added`, `vendor.updated`, `quote.added`, `commitment.recorded`, `commitment.updated`, `commitment.voided`, `payment.recorded`, `payment.corrected`, `payment.voided`, `expense.recorded` |
| Guests | `requirement.added`, `guest.added`, `invitations.set`, `rsvp.updated`, `rsvp.submitted`, `dietary.updated`, `invitation_links.created`, `invitation_link.revoked` |
| Proposals and shagun | `proposal.created`, `proposal.rejected`, `proposal.withdrawn`, `shagun.recorded`, `shagun.thanked` |
| Exports | `export.requested`, `export.succeeded`, `export.failed`, `export.retried`. `reset_demo` has no topic: it writes no activity, and its `version` bump refreshes open screens |

### 5.5 Storage buckets

| Bucket (private) | Object path | Written by | Read by |
|---|---|---|---|
| `uploads` | `{wedding_id}/{asset_id}.{ext}` | The browser, with a signed upload URL (valid 2 hours) from `POST /api/uploads/sign`, members only. Limit 10 MB; JPEG, PNG or WebP. Couple photos only | The server. Members get signed download URLs (10 minutes). Guests get the published couple photo only, signed for 1 hour, inside their view (4.6) |
| `exports` | `{wedding_id}/card-rev{revision}.png` (and `{wedding_id}/card-rev{revision}.pdf` only if the lead approves the PDF Should at 13:30, with `application/pdf` added to the allowed types by Lane A's additive migration, D66) | The export worker (`/run`) only, by upsert at that fixed key | Members, through a signed URL valid 10 minutes, download name `jashn-card-rev{n}.png`. Never guests; never NudgeBee (it gets only `artifact_id`, the file name) |

Object keys never include the bucket name; `assets.storage_path` and `export_jobs.artifact_path` store the key. Neither bucket has storage policies for the `anon` or `authenticated` roles, so the browser cannot list or read objects on its own; only the server, with `SUPABASE_SERVICE_ROLE_KEY`, signs URLs. Invitation-card photos for Should #11 are never written to Storage (doc-ai.md 3.1).

### 5.6 Live updates: polling

- **The cursor.** Every state-changing transaction increments `weddings.version` (L6), including guest RSVPs, publishes, proposal decisions and every export-job transition (the worker's claim moves it without an activity entry). Reads, replays, `unchanged` outcomes, voice turns, exposures and card imports don't move it.
- **Planner poll.** Planner screens call `GET /api/w/{wedding_id}/version` every 2.5 seconds while the tab is visible. The answer is only `{"version": 1043}` (members only; 401 or 403 otherwise, and a removed member gets 403). When the number changes, the screen re-runs its read models (a router refresh). This alone meets voice-test-set X-05. The endpoint reads one row and evaluates no flags.
- **Guest poll.** The guest page loads no Supabase client (G6) and polls `GET /api/i/{token}/revision` every 10 seconds while visible, reloading its view when the revision changes. The endpoint resolves the token exactly as the page does, so a bad token gets the same 404 as the page (G5). On a 429 the page backs off to 30 s and keeps showing its content (D90; architecture.md 2.4 records it). Tara's page therefore shows a publish within 12 s: one 10 s poll plus the refresh (D92).
- **Focus refresh.** Every screen, planner and guest, also refreshes once whenever its tab becomes visible or regains focus, whatever the number. That is also how flag changes reach an open page (flagsmith.md 6.9).
- **The one exception: `/setup` (D79).** Setup sits under the planner routes but runs no version poll and no focus refresh, so the experiment exposure isn't re-recorded and the draft isn't disturbed (flagsmith.md 5.3).
- **No Realtime.** No Broadcast, no `wedding:{wedding_id}` channel, no `realtime.messages` policy, no `supabase_realtime` publication and no WebSocket. The only browser use of Supabase is the planner's signed upload (6.2); guest pages use none. NudgeBee polls the ops status endpoint (4.8). architecture.md 2.4 has the timings.

---

## 6. Access control

### 6.1 Role matrix

✓ = allowed. "If shared" = only while the matching `managers_can_see_*` flag is on (G7). Anything not listed for a column is refused: 401 for anonymous callers, 403 for members and the ops token, and 404 on guest routes (G5).

| Capability | Owner | Manager | Guest token | Anonymous | Ops token |
|---|---|---|---|---|---|
| `wedding_profile`, `overview`, `itinerary` (draft), `rsvp_totals`, `export_job_status`, activity entries with visibility `members` | ✓ | ✓ | – | – | – |
| Owner-only activity entries (money, shagun, members, links) | ✓ | – | – | – | – |
| Vendor money: `money_summary` rows, `vendor_ledger`, `catering_estimate`; `add_quote` | ✓ | If shared (vendor dues) | – | – | – |
| Budget, totals and category lines | ✓ | If shared (budget) | – | – | – |
| Guest phone numbers and emails | ✓ | If shared (contacts) | – | – | – |
| `shagun_register`, `record_shagun`, `mark_shagun_thanked` | ✓ | – | – | – | – |
| `team` (members, pending invites, sharing flags; 4.11) | ✓ | – | – | – | – |
| `proposals` | All | Own only | – | – | – |
| Preview a household's `guest_invitation_view` in the planner | ✓ | ✓ | – | – | – |
| `guest_invitation_view`, `submit_rsvp` | – | – | Own household | – | – |
| `set_dietary` | ✓ | ✓ | Own household | – | – |
| `create_event`, `update_event`, `update_invite_style`, `add_asset`, `add_vendor`, `update_vendor`, `add_requirement`, `set_rsvp`, `request_card_export` | ✓ | ✓ | – | – | – |
| `add_guest` | ✓ | ✓ without `event_ids` or `max_plus_ones`, and not into a household with an active link (3.4) | – | – | – |
| Gated money commands (A1) | ✓ | 403 `approval_required`; use `propose_change` | – | – | – |
| `propose_change`, `withdraw_proposal` (own) | – | ✓ (A1 money commands other than `record_expense` only with vendor dues shared, 3.5) | – | – | – |
| `set_wedding_profile` (update), `set_budget_line`, `set_sharing`, `invite_member`, `revoke_member_invite`, `remove_member`, `set_invitations`, `create_invitation_links`, `revoke_invitation_link`, `publish_itinerary`, `approve_proposal`, `reject_proposal`, `reset_demo` | ✓ | 403 `forbidden` | – | – | – |
| `set_wedding_profile` (create), `accept_member_invite` | Any signed-in user (the holder of the join token, for accept) | | – | – | – |
| `retry_card_export` | ✓ (exports panel route) | – | – | – | ✓ |
| Ops status read (4.8) and the internal worker route `/run` (3.7) | – | – | – | – | ✓ |
| Voice routes (3.8) | ✓ | ✓ | Only if guest voice ships, limited to `set_dietary` and its own invitation's RSVP | – | – |

### 6.2 Database posture: RLS on, zero policies, one server guard

- **One path to data.** The browser never queries tables (0.1). The Next.js server connects with `DATABASE_URL` as the `postgres` role, which bypasses RLS, and every read model and command first calls the guard (`src/server/authz/`, Lane A; research-stack.md calls it `requireMember`), given the wedding and a capability, which applies 6.1 from `src/contracts/permissions.ts`.
- **RLS on, zero policies.** RLS is enabled on every table in schema `app`, with no policies at all, and the API roles (`anon`, `authenticated`) have no grants on the schema, which the Data API doesn't expose. A leaked anon key therefore reads nothing.
- **No database-side authorization.** No SQL functions, no `SECURITY DEFINER` functions, no RPCs, no triggers and no database-side JWT checks. All authorization is the guard plus the dispatcher (3.0).
- **One membership check, in server code**, defined once in the guard: the session's user id (the `sub` claim from `getClaims()`) equals `members.user_id` on a `members` row of that wedding whose `removed_at` is empty. The role then comes from that row. A removed member fails it on the next request.
- **Guests are resolved on the server by token** (6.3) and are never Supabase users. Guest routes load nothing from Supabase in the browser (G6).
- **Keys.** `SUPABASE_SERVICE_ROLE_KEY` and `DATABASE_URL` stay on the server and are never in `NEXT_PUBLIC_` variables or any response (G8). The browser holds only `NEXT_PUBLIC_SUPABASE_ANON_KEY`, used for the signed upload. Sign-in and sign-up run in server actions, so there is no browser Supabase auth client.
- **Storage** has no client policies (5.5). Realtime is not used (5.6).

### 6.3 Invitation link tokens

| Property | Design |
|---|---|
| Randomness | 32 bytes (256 bits) from a cryptographic random generator; the minimum allowed is 128 bits |
| Format | base64url without padding (43 characters). URL `/i/{token}`. No ids, names or counters in it |
| Storage | Only the SHA-256 digest, in `invitation_links.token_hash` (unique). A request hashes the presented token and looks it up. The raw token is never stored, logged or put in activity |
| Shown | Once: in the `create_invitation_links` response, or, for seeded households, printed once by the seed run and written to the gitignored `demo-links.local.md` (the team's demo notes), never committed. `reset_demo` keeps links, so Tara's keeps working |
| Revocation | `revoke_invitation_link` sets `revoked_at`; revoked links fail lookup at once. Rotating is revoke plus a new link |
| Not enumerable | 256-bit random values; the same 404 for unknown, malformed and revoked tokens (G5). Guessing is hopeless at that size, so limits only stop floods and must not hit a shared venue Wi-Fi: per token hash, about 120 GETs a minute (the 10 s poll is 6) and 30 POSTs a minute; per IP, a loose ceiling of 600 requests a minute on `/i/` and `/api/i/`. Counted in memory per server instance, so best effort (a test checks only that a burst gets 429s). On a 429 the page keeps its content and backs off to 30 s (5.6, D90). These numbers win over any other note (D108). Lane A owns the single rate limiter; Lane D's guest routes call it once per request and test the 429s through those routes (D57) |
| Expiry | None by default: the link lives until revoked |
| Headers | `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex`, `Cache-Control: private, no-store` (G6) |

Member invitation tokens (`invite_member`) use the same design, are single-use, expire after 48 hours and can be revoked (`revoke_member_invite`). The join token is the only credential (3.1).

### 6.4 The NudgeBee ops token and the render token

- **`JOBS_API_TOKEN`:** 32 random bytes, base64. It lives in the server env and in NudgeBee's Secrets (`jashn_ops_token`), nowhere else. The user pastes it into that Secret by 11:10, before the 11:15 tunnel read, from their password manager or by copying it from `.env.local` in an editor. Nobody sends it through chat, Notion or a terminal (D117).
- **Use:** sent as `Authorization: Bearer <token>` and compared in constant time (compare SHA-256 digests, so the length does not leak).
- **Scope:** exactly three routes: `GET /api/ops/export-jobs/{job_id}` and `POST /api/ops/export-jobs/{job_id}/retry` (NudgeBee), and the internal worker `POST /api/ops/export-jobs/{job_id}/run`, which only the server's own kick calls. It is not a session, carries no membership, and is accepted nowhere else.
- **Responses:** JSON only, no CORS headers, `Cache-Control: no-store`. The token is never echoed or logged. A bad or missing token gets 401 with no detail. The routes are excluded from Vercel bot challenges (research-nudgebee.md).
- **Rotation:** change it in the Vercel env and in NudgeBee's Secrets, then redeploy.
- **`NUDGEBEE_EXPORT_WEBHOOK_URL`** contains NudgeBee's own webhook token. It is server env only, and NudgeBee takes only `job_id` from the webhook payload.
- **`RENDER_TOKEN_SECRET`** signs the card render URL `/render/card/{job_id}?t=…`: an HMAC-SHA-256 over the job id and an expiry 5 minutes ahead. The render page accepts no other credential and reads only that job's publication snapshot, its `card_event_ids` and the wedding's `is_sample`, so it prints only the frozen function list (P10) and never reads guest data.

---

## 7. Worked example: the demo story through the commands

Step numbers #1 to #8 are the live voice moments in `demo-script.md`. Step 1 is the video's opening from S0; the live demo starts at D0 from the seed, which equals the state after step 1.

### 7.1 Steps

1. **M-01 (video, from S0).** Mira: "The caterer is charging eight hundred per person for 250 people. I paid a fifty-thousand advance." One voice turn, one review card, two actions, confirmed once:
   - `record_commitment`: `vendor_id` VEN-CAT, `pricing` `per_unit`, `unit` `plate`, `unit_price_inr` 800, `quantity` 250, `quote_id` QUO-01 (server-filled: the vendor's only open quote), `description` "250 covers × ₹800, fixed minimum". The utterance names no function, so the model sends no `event_id` (V5); the server links EVT-REC, VEN-CAT's only function in `vendor_events`, and the card shows "For: Reception" (3.3). The server computes 800 × 250 = ₹2,00,000 (M3). Key `{voice_turn_id}:0`. (The model may send `unit` `person` for "per person"; E1 treats both the same. The seeded COM-01 uses `plate`.)
   - `record_payment`: `vendor_id` VEN-CAT, `amount_inr` 50000, `payment_kind` `advance`, `paid_on` empty (not stated). It links to COM-01, the vendor's only active commitment. Key `{voice_turn_id}:1`.
   - Reply: "Saved a ₹2,00,000 catering commitment and a ₹50,000 advance. ₹1,50,000 is outstanding."
2. **#1, O-01.** "Caterer ko ab kitna dena hai?" `query_balance` reads Annapoorna's `outstanding_inr` = 150000. Reply: "एक लाख पचास हज़ार रुपये बाकी हैं।" Nothing is written.
3. **#2 and #3, M-03 then C-01.** "Caterer ko chaalis hazaar advance diya tha." The preview reads "Correction, not a new payment: ₹50,000 → ₹40,000." "Haan, save karo." confirms it, matched in code. `correct_payment` runs (payload below): PAY-01 gets version 2 at ₹40,000, version 1 is superseded, and the caterer still has one payment. ACT-06. Reply after commit: "एक लाख साठ हज़ार रुपये बाकी हैं।" Confirming again replays the stored result (X-01).
4. **#4, E-04.** Diya, on her phone and her own login: "Reception Lotus Hall mein shift kar do." `update_event`: `event_id` EVT-REC, `expected_version` (server-filled), `venue_name` "Lotus Hall" (or "Lotus Hall, Mallige Gardens", as voice-test-set E-04 expects), which matches the existing Lotus Hall at Mallige Gardens (3.2); no new venue is created. Only the draft changes and `draft_version` goes up by one. ACT-07 (members): "Diya moved the reception from Banyan Hall to Lotus Hall.", with `awaiting_publish` true. The draft's over-capacity warning (Banyan Hall seats 220; 229 attending) disappears.
5. **#5, O-02.** "Diya ne kya badla?" `query_changes` reads ACT-07 and the one unpublished change. Nothing is written.
6. **#6, E-05.** Mira: "Schedule publish kar do." The review sheet lists one change. `publish_itinerary` with `expected_draft_version` (server-filled) creates REV-3 with `changes` = reception venue Banyan Hall → Lotus Hall, and sets `published_revision` to 3. ACT-08: "Mira published the schedule, revision 3: reception venue Banyan Hall to Lotus Hall." The REV-2 card (JOB-EXP-R2-PNG) is now out of date. Diya saying the same line gets 403 `forbidden` (E-06).
7. **Tara's tap.** Her link shows the sangeet (attending) and the reception (pending), both at Mallige Gardens, the reception now in Lotus Hall. She taps Attending for the reception: `submit_rsvp` (payload below). Her reception row goes from `pending` to `attending`: 230 / 9 / 11, headcount 230. The estimate is 230 × ₹800 = ₹1,84,000, ₹16,000 below the contract, which stays ₹2,00,000 (E5). The sangeet stays at 136. ACT-09: "Tara Bhat is attending the reception." A second tap with the same key is `replayed`; after a reload (a new key) it is `unchanged`. Either way the count stays 230 (X-02).
8. **#7, O-03.** "Reception ka venue kya hai, aur caterer ka kitna baaki hai?" `query_event` and `query_balance`. Reply: "Reception: Lotus Hall. एक लाख साठ हज़ार रुपये बाकी हैं।"
9. **#8, R-03.** `voice_writes_enabled` is switched off in Flagsmith. Mira: "Reception mein barah logon ke liye Jain khana add karo." The early check at `/api/voice/turn` (V3 step 1) refuses at once: no preview and no Confirm; the 200 stream's `refused` event carries the fixed line "Abhi voice se badlav band hain. Aap type karke save kar sakte hain." and the prefill. The turn is stored `paused` with `refusal_code` `voice_writes_paused`; nothing is written and no activity entry appears. (A preview shown before the flip and confirmed after it would get the dispatcher's 423 instead.) She saves the prefilled form: `add_requirement` with `event_id` EVT-REC, `text` "Jain food", `quantity` 12, `requirement_category` `catering`, `vendor_id` VEN-CAT, `source` `ui`. REQ-10 and ACT-10 ("Mira added "Jain food for 12" to the reception."). The ledger is unchanged, and questions still work (X-06).
10. **Export beat (recorded, not live).** With `export_failure_drill` enabled and its value set to the demo copy's `wedding_id`, `request_card_export` (`format` `png`) creates JOB-EXP-R3-PNG with `export_key` `export:{wedding_id}:rev3:png`, `card_event_ids` [EVT-REC] and `fail_injection` `once`, and kicks `/run`. The worker claims it (`rendering`), the first render fails with `DRILL_INJECTED`, and the worker's webhook starts the NudgeBee run. NudgeBee reads the job (`failed`, `retryable` "true"), a person approves, and `retry_card_export` (`Idempotency-Key` `nb-{execution_id}-{job_id}`, `expected_export_key` as read) returns `retried` with status `succeeded` and artifact `card-rev3.png`, which lists the Reception at Lotus Hall. The run's own `replay_check` step resends the same key and gets `replayed` "true". A retry with a new key returns `already_succeeded` with the same artifact; re-running the finished workflow ends at `nothing_to_retry` (export-and-recovery.md 6.3). Still one card. No ledger, RSVP or publication changes.

### 7.2 State after each step

| After | State | Caterer contract | Caterer paid | Caterer outstanding | Reception attending / declined / pending | Estimate | Reception venue (guests see / draft) | Wedding committed / paid / outstanding | New activity |
|---|---|---|---|---|---|---|---|---|---|
| Start | S0 | none (QUO-01 ₹2,12,500 is not counted) | ₹0 | ₹0 | 229 / 9 / 12 | none (no commitment) | Banyan Hall / Banyan Hall | ₹7,27,000 / ₹3,47,000 / ₹3,80,000 | – |
| 1 | D0 | **₹2,00,000** | **₹50,000** | **₹1,50,000** | 229 / 9 / 12 | ₹1,83,200 | Banyan Hall / Banyan Hall | ₹9,27,000 / ₹3,97,000 / ₹5,30,000 | 2 (commitment, advance) |
| 2 | D0 | ₹2,00,000 | ₹50,000 | ₹1,50,000 | 229 / 9 / 12 | ₹1,83,200 | Banyan Hall / Banyan Hall | unchanged | – |
| 3 | D1 | ₹2,00,000 | **₹40,000** | **₹1,60,000** | 229 / 9 / 12 | ₹1,83,200 | Banyan Hall / Banyan Hall | ₹9,27,000 / **₹3,87,000** / **₹5,40,000** | ACT-06 |
| 4 | D2 | ₹2,00,000 | ₹40,000 | ₹1,60,000 | 229 / 9 / 12 | ₹1,83,200 | Banyan Hall / **Lotus Hall** | unchanged | ACT-07 |
| 5 | D2 | ₹2,00,000 | ₹40,000 | ₹1,60,000 | 229 / 9 / 12 | ₹1,83,200 | Banyan Hall / Lotus Hall | unchanged | – |
| 6 | D3 | ₹2,00,000 | ₹40,000 | ₹1,60,000 | 229 / 9 / 12 | ₹1,83,200 | **Lotus Hall** / Lotus Hall | unchanged | ACT-08 |
| 7 | D4 | ₹2,00,000 | ₹40,000 | ₹1,60,000 | **230 / 9 / 11** | **₹1,84,000** | Lotus Hall / Lotus Hall | unchanged | ACT-09 |
| 8 | D4 | ₹2,00,000 | ₹40,000 | ₹1,60,000 | 230 / 9 / 11 | ₹1,84,000 | Lotus Hall / Lotus Hall | unchanged | – |
| 9 | D5 | ₹2,00,000 | ₹40,000 | ₹1,60,000 | 230 / 9 / 11 | ₹1,84,000 | Lotus Hall / Lotus Hall | unchanged | ACT-10 |
| 10 | D5 + card | ₹2,00,000 | ₹40,000 | ₹1,60,000 | 230 / 9 / 11 | ₹1,84,000 | Lotus Hall / Lotus Hall | unchanged | System export entries only |

### 7.3 Payloads

Step 3, the confirmed correction (the dispatcher call the confirm route makes):

```json
{
  "wedding_id": "0b7c…",
  "command": "correct_payment",
  "input": { "payment_id": "5d2e…(PAY-01)", "expected_version": 1, "amount_inr": 40000 },
  "idempotency_key": "a41f…:0",
  "source": "voice",
  "voice_turn_id": "a41f…"
}
```

Its result carries `version_no` 2 and `vendor_totals` `{committed_inr: 200000, paid_inr: 40000, outstanding_inr: 160000}`; the reply is built from `outstanding_inr` after commit (V9).

Step 7, Tara's tap, `POST /api/i/{token}/rsvp`:

```json
{
  "idempotency_key": "3d0b9c2e-…",
  "responses": [
    { "guest_id": "9a3f…(Tara Bhat)", "event_id": "e5d1…(EVT-REC)", "rsvp_status": "attending", "plus_ones": 0 }
  ]
}
```

It answers `{"ok": true, "outcome": "applied", ...}` with Tara's refreshed `guest_invitation_view` (4.6), which has no counts and no money.

### 7.4 Checks a test can make

- PAY-01 has exactly two versions, the caterer has exactly one payment, and total paid fell by exactly ₹10,000 (C6, X-01).
- The commitment rows are identical before and after step 7 (E5), and the reception still has 250 active invitations; Tara's row keeps its id (R6).
- `weddings.version` rises by one per applied command (by 2 at step 1, by 1 at steps 3, 4, 6, 7 and 9), not at all for questions, replays, `unchanged` outcomes or the paused voice turn, and by one per transition in the export beat (request, claim, failure, retry, claim, success), where the claims write no activity entry.
- Exactly one activity entry per write step; none for steps 2, 5 and 8 or the refused voice turn (L1).
- Tara's view at every step contains no ₹ amount, no vendor record, no counts and no function she isn't invited to (G2, X-03). Diya calling `record_payment` directly gets 403 `approval_required` (X-04).

---

## 8. Open questions, each with the default to build if nobody decides

| # | Question | Default |
|---|---|---|
| 1 | L5 keeps money entries owners-only even while vendor dues are shared, so Diya sees the caterer's new balance (4.2) but not ACT-06 in her feed. Should shared dues also share money entries? | No. Keep L5 as written; it is the simpler and safer rule, and no demo step needs Diya to see ACT-06 |
| 2 | Raw link tokens are shown once (6.3). How does an owner copy an old household link later? | "Copy link" on an old link rotates it, after the warning "The old link will stop working". Tara's demo URL lives in the team's demo notes |
| 3 | The token sits in the URL path, so it appears in Vercel request logs | Accept it for the hackathon; logs are private to the team. Later, swap the token for an httpOnly cookie on first open and redirect to a token-free URL |
| 4 | Deleting functions, guests, vendors and requirements | Not built; `deleted_at` is reserved (5.0) |
| 5 | Multi-action voice turns are not atomic (V7) | Keep one transaction per action. A partial save says plainly what was saved and what failed, and confirming again finishes the rest |
| 6 | Flag names differ: `voice_pilot` and `spoken_replies` (demo-data.md 13.1, demo-script.md) against `voice_mode` and `voice_tts_enabled` (research-flagsmith.md) | **Settled** by flagsmith.md, which is binding for flag names: the flag `voice_pilot` shows the mic and gates `/api/voice/*` (403 `voice_unavailable`); the flag `spoken_replies` gates spoken replies; `voice_rollout` is the segment. `voice_mode` and `voice_tts_enabled` are never created, and demo-script.md needs no change |
| 7 | Guest voice (G-03, G-07) | Not built unless the must-work list passes; the guest page uses buttons and a dietary field |
| 8 | Tasks (demo-data.md 9.2) | Future scope; no table |
| 9 | `bride_name` and `groom_name` assume a bride and a groom | Keep them for the hackathon; later rename to partner names with display labels |
| 10 | PRP-01's payee is not named in demo-data.md ("dhol player for the baraat") | A one-off payee "Dhol player", proposed as `record_expense` with `paid_in_full` false, so approval adds ₹15,000 to Music commitments (₹70,000) and nothing to paid |
| 11 | Voice test I-02 says a voice card export needs no confirmation; V2 says every voice write needs one tap | One tap, so voice has a single rule |
| 12 | `paid_on` may be empty (M-01) | Allowed; shown as "Date not given" and sorted by when it was recorded |
| 13 | Receipt attachments, PDF cards, more export formats | Future scope (scope.md); `export_format` has only `png`. If the lead approves the PDF Should at 13:30 (D66): Lane A adds `pdf` to `export_format` and `application/pdf` to the `exports` bucket in an additive migration, and Lane D builds a one-page PDF at the key `{wedding_id}/card-rev{revision}.pdf`, with its own `export_key` check, for the 14:30 batch (5.5) |
| 14 | Kabir is a seeded second owner who never acts on stage | Seed him anyway; no step depends on him |
| 15 | The model's `previous_inr` can differ from the stored amount | The preview shows the stored amount and warns "You said ₹50,000; the record shows ₹X". The correction applies to the stored current version |
| 16 | The seeded reception description, "Dinner by Annapoorna Caterers.", is free text that guests would read, and it names a vendor | Show family-written text as written, but change that seed line to "Dinner follows." The privacy test checks structured fields and ₹ amounts, not free text |
| 17 | research-stack.md lets only owners export cards; this file lets managers too | Managers may export: a card shows only published data |
| 18 | research-nudgebee.md renders inside the retry call; research-stack.md re-queues and waits | **Settled** by export-and-recovery.md: the retry re-queues, starts `/run` (the only place Chromium runs) with a fire-and-forget request as soon as `retried` is committed, and only then waits up to `wait` (0 to 25 s, NudgeBee sends 20) (3.7, D53) |
| 19 | Can a guest change an answer back to "not replied"? | No: guests choose Attending or Can't attend (`submit_rsvp`); members can set `pending` with `set_rsvp` |
| 20 | voice-test-set E-04 and voice.md 2.5 create a new bare venue when `venue_name` matches nothing; a review asked that voice never create a venue inside `update_event` | **Closed (D88):** an unknown venue named in a voice `create_event` or `update_event` gets voice.md 2.5's "New venue" card, which the speaker must confirm. The widened matching in 3.2 already makes "Lotus Hall, Mallige Gardens" match |
| 21 | A review asked that a spoken confirm phrase work only for single-action turns, and that the snapshot drop requirement text, dietary notes and activity summaries (prompt injection through member- or guest-written text) | **Closed (D89):** spoken confirm phrases work for multi-action turns, as voice.md 1.8 says, and the snapshot follows voice.md 1.9 (role-filtered). Member-written and guest-written text is data, never instructions (G9). Mitigations in place: the model only proposes, every action is validated and listed on the card, `publish_itinerary` stands alone (V11), and no model-written text is spoken (4.9) |

---

## 9. Reconciliation log (05:05)

Applied at 05:05–05:20 IST against architecture.md 9, export-and-recovery.md 11, flagsmith.md 10.1, doc-ai.md 5.7, voice.md 10 and the adversarial review. Section numbers and test ids are unchanged; new material sits inside existing sections (L5a, I2a, V10, V11, open questions 20 and 21, two new commands in 3.1, one new subsection in 5.1).

### 9.1 From the integration specs

- 0.1: `realtime` unused; Writes row names the operational tables and the helpers; Ids row gives seeded rows fixed name-based UUIDs.
- 0.2: replaced with the decided stack in 8 lines.
- 0.3: env renames (`JOBS_API_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NUDGEBEE_EXPORT_WEBHOOK_URL`, Flagsmith names), `running` → `rendering`, render page by job id, no doorbell, `invite_scan` removed, flags `voice_pilot`/`spoken_replies`, drill value, object keys without the bucket.
- 3.0: transports gain the exports panel routes and the card-import apply route; `request_card_export` allowed from any transport; ops token also covers `/run`.
- 3.0: actor context carries the user's email, server-only, for `is_internal`.
- 3.0 step 4: kill switch through the voice gate in `src/contracts/flags.ts`, fail-closed.
- 3.0 step 7: doorbell removed; after-commit work is the export kick, the `setup_saved` conversion and reply read models; webhook belongs to the worker.
- 3.0 errors: `expectation_failed` (412) added; `voice_unavailable` names `voice_pilot` and the Flagsmith-unreadable case.
- 3.1 `set_wedding_profile`: conversion rules (create, applied, non-internal, one wedding, 0–3600 s, in `after()`).
- 3.2 `create_event`: activity form without a venue; card-import key `{import_id}:{index}`.
- 3.2 `update_invite_style`: `wording_en` two-paragraph rule.
- 3.2 `add_asset`: object key without bucket; `invite_scan` kind and scan activity removed.
- 3.4 `submit_rsvp` and 6.3: rate limits counted in memory, best effort.
- 3.7: lifecycle rewritten (`rendering`, `/run` only, claim moves version with no entry, `probe` id, lazy expiry incl. `NOT_STARTED`, readers that may expire).
- 3.7: failure codes `RENDER_TIMEOUT`, `FONT_NOT_LOADED`, `NOT_STARTED`; `{reason}` is the per-code phrase.
- 3.7: webhook to `NUDGEBEE_EXPORT_WEBHOOK_URL`, worker only, string values, never for lazy failures.
- 3.7 `request_card_export`: `card_event_ids` frozen; drill only when value equals an `is_sample` wedding's id; env fallback holds a wedding id.
- 3.7 `retry_card_export`: lock-and-recheck, receipts for every outcome, wait for every outcome, replay keeps stored `outcome`/`attempt` with `replayed` "true", 400 `validation_failed` and 409 `idempotency_key_reused`, `{result}` dropped from both templates, all-string response with `retryable`, `revision`, `latest_revision`.
- 3.7 `reset_demo`: sample copies D0, `a`–`d`, `e2e`; one copy only; links in `demo-links.local.md`; no topic.
- 3.8: setup turns state that card functions are saved by the apply route, never by `/api/voice/confirm`.
- 4.8: member view gains `job_label`, `card_summary`, `card_functions`, `renderer`, `notified_at`, `stalled`, `can_retry`, download name; ops view all strings, objects never null, `job_label`, `latest_revision`, `card_summary`, `wait`, `expect=succeeded`.
- 5.0: no triggers or SQL functions; no foreign key into `auth`.
- 5.1: `export_jobs.card_event_ids`, `export_attempts.renderer`, full failure-code list, `artifact_path` is the key; `experiment_exposures` and `card_imports` added as operational tables.
- 5.1 `voice_turns.flags`: `voice_pilot`, `voice_writes_enabled`, `spoken_replies`, `env_label`, setup variant, `fallback`; production-only rollout count.
- 5.2: `asset_kind` couple photo only; `export_status` `rendering`; `card_import_status`; PDF note on `export_format`.
- 5.4: topics are stored only; `demo.reset` removed.
- 5.5: bucket keys, PDF option, no scan sentence, service-role signing.
- 5.6: retitled "Live updates: polling"; doorbell deleted; focus refresh; revision 404 identical to the page.
- 6.2: `auth.uid()` predicate replaced by the guard's `sub` check; no SQL functions, `SECURITY DEFINER`, RPCs or DB-side JWT checks; anon key for the signed upload only; sign-in in server actions.
- 6.4: `JOBS_API_TOKEN` scope of three routes; `NUDGEBEE_EXPORT_WEBHOOK_URL`; render token signs job id and expiry; page reads snapshot, `card_event_ids`, `is_sample`.
- G8: full secret list; G9: what a card read sends to Sarvam; I1: `{uuid}:{index}` key form.
- P10: card list frozen per job. 7.1 step 10: drill value, `card_event_ids`, `replay_check`, `already_succeeded` with a new key, `nothing_to_retry`.
- Open questions 6 and 18 marked settled; 13 gains the PDF path.

### 9.2 From voice.md (10 and 11) and flagsmith.md 3.2

- V3 rewritten: early refusal at `/api/voice/turn` (200, `paused`, fixed R-03 line, prefill), authoritative 423 at the dispatcher; 7.1 step 9 follows it.
- 3.8: turn route fields (`text`, `option`, `client_turn_id`, `speech_language`, `duration_ms`, `attached_asset_id`, `page`, `setup_opened_at`, `fixture_id`) and the NDJSON stream; reply-audio and trace routes; 410 for a closed turn.
- 3.8 phrases: voice.md 1.8's word map, whole-utterance rule and added phrases; confirm phrase may take a question's `default` option.
- 3.9: `heard`, `reply_language`, query parameters, `previous_inr` only when heard; example updated.
- 5.1 `voice_turns`: voice.md 9's columns, indexes, `confirmed_at` timing, `failed` meaning.
- 4.9: templates live in voice.md 4; the second model call is off today.
- 3.0: `not_shared` is a voice refusal code in `refusal_code`, not an HTTP error.

### 9.3 From the adversarial review (re-expressed for the guard, the dispatcher's transaction and polling)

- C2/C3/C10: supersede-then-insert order for the partial unique index.
- 3.8: phrase matcher specified (normalisation, whole utterance, mixed-script variants for C-01/C-02).
- 3.2 `venue_name`: matching widened to "{name}, {place_name}", "{name} at {place_name}" and one distinctive word; 7.1 step 4 notes E-04's form.
- V3 / 3.0 error body: one early check, `prefill` inside `error` for the 423, listed in the error body.
- E1 / 3.3 `record_commitment`: `event_id` inferred from the quote or the vendor's only function, required for plate/person otherwise; COM-01 v1 seed values; 7.1 step 1 no longer has the model invent EVT-REC.
- I1 and `submit_rsvp`: keys are opaque 8–200 character text, never UUID-checked; four forms listed; new input type `key`.
- 3.7 `reset_demo` and 5.0: `seed_key` on every seeded row; delete-then-upsert order; `superseded_by_version_id` has no foreign key.
- 0.3, 3.0, open question 6: flag names from flagsmith.md, which is binding for flags.
- 3.0 step 6 and I2a: the transaction locks the wedding row first and re-checks the receipt.
- R8 and I1: one key per exact request; new key on any change and after every response.
- M6 and 4.2: a category with no line is never over budget (`has_line`, `planned_inr` null).
- 0.1 Money: int8 and numeric parsed as numbers, aggregates cast to bigint, safe-integer check.
- 5.3: seed builds REV-1/REV-2 with the publish snapshot builder; D0/D2 seed check.
- 3.5 and 6.1: `propose_change` for A1 commands other than `record_expense` needs vendor dues shared.
- 3.3: `vendor_category` fixed once money exists; `record_expense` category conflict fails.
- M7: crore words in spoken amounts.
- L5a and 4.7: `before`/`after`/`spoken_text` follow visibility; budget-bearing create is owners; no contacts in activity; manager feed filtered.
- A3, P10, 3.4, 6.1: `set_invitations` owner-only; manager `add_guest` limited; test beside X-04.
- P10, 3.7, 6.4: card lists only `card_event_ids`, frozen per job (the job id is signed, not the list).
- V11: `publish_itinerary` must be alone in its turn; 4.9 model-written answers off.
- V10 and 3.0: per-user voice rate limit from voice.md (12 a minute, 300 a day), counted from `voice_turns`.
- 3.5: `paid_in_full` required in proposals, payee resolved to `vendor_id`, `paid_delta_inr`, dry-run review, 409 `proposal_changed`; record_expense summary states paid or not.
- 3.1, A3, 5.1, 6.3: `remove_member`, `revoke_member_invite`, `last_owner`, 48-hour invites, join token is the only credential, accept entry is owners-only.
- V2: every voice-turn lookup scoped to `user_id` and `wedding_id`; bad `context_turn_id` ignored.
- 6.3 and 5.6: guest limits keyed by token hash (120 GET, 30 POST a minute) with a loose 600-a-minute IP ceiling; back-off on 429.
- 0.2, 3.0, 5.6, 6.2: Realtime doorbell and its policy removed.

### 9.4 Sweep

- Searched for Realtime, doorbell, broadcast, `auth.uid`, policy, `SECURITY DEFINER`, `OPS_API_TOKEN`, `OPS_RECOVERY_TOKEN`, `SUPABASE_SECRET_KEY`, `NUDGEBEE_WEBHOOK_URL`, `running`, `/render/card/{publication_id}`, `invite_scan`, `voice_mode`. Every remaining hit is a negation ("no Realtime") or a rename row in 0.3.
- G6 no longer mentions Realtime; the "publishable key" wording is now `NEXT_PUBLIC_SUPABASE_ANON_KEY`; 6.2 retitled.
- Header: authority order stated (architecture for stack and env, flagsmith for flags, export-and-recovery for ops JSON, voice.md for the voice path).

### 9.5 Rejected, with the reason

- Review: "voice never creates a venue; unknown name becomes a clarify" and "send `venue_id` from the snapshot". voice.md 2.4 and 2.5 win on the voice path (no `venue_id` in the schema; "New venue" card). Open question 20.
- Review: "spoken confirm only for single-action turns" and "snapshot carries only ids and 40-character names, no notes or activity". voice.md 1.8 and 1.9 win on the voice path. Open question 21; V11 and 4.9 cover the worst case.
- Review: "at most 3 actions a turn". voice.md 1.11 sets 4.
- Review: voice limits of 6 a minute and 60 an hour, and a global 30-a-minute Sarvam cap. voice.md 1.4 sets 12 a minute and 300 a day; a global cap needs shared state the stack doesn't have.
- Review: "keep `voice_pilot` below 100% until judging ends". flagsmith.md 4.3 rolls to 100% by 14:30.
- Review: "count guest limits in Postgres or a Vercel WAF rule". architecture.md 9 item 15 keeps limits in memory, best effort.
- Review: 404 for a voice confirm or cancel outside scope. voice.md 1.13 answers 403 `forbidden` for an unknown or foreign turn.
- Review: "sign `card_event_ids` into the render token". The token signs the job id; the list is frozen on the job row, which the page reads (export-and-recovery.md 11 item 4).
- Review: "correct flagsmith.md's prefill example". Not this file's to edit; flagsmith.md 3.2 already says the 423's prefill is inside `error`.
- doc-ai.md 5.7 optional: a `card_import` value for `command_source` (doc-ai 5.8 question 2 says none is needed) and fields for the card's hosts and RSVP contact (left open in doc-ai 5.8 question 1).

### 9.6 Lead decisions, rounds 1 to 3 (about 05:50)

- G4: a guest link gets 401 on money, planner, export and voice routes, and 404 through the RSVP route; never 403 (D35).
- 3.0 step 4: the contracts voice-gate stub fails closed until `lane-c-voice` merges at 10:45 (D47).
- 3.0 step 7: the post-commit registration interface; Lane D registers the export kick; the setup-saved stub until 11:40 (D53, D39).
- 3.1: who builds member management: A6 handlers, Lane B's owner controls and join URL display, `/join/[token]` with Lane A (D64).
- 3.2: the invite and export handlers are Lane D's, in `src/server/invite/handlers.ts`; `update_event` is Lane A's, by 11:40 (D41).
- 3.5: seeded PRP-01 and ACT-03 gain ", not yet paid" (D91).
- 3.7: the worker's owner, Storage adapter and verifier handoff (D41, D58); export activity templates live in Lane D's folders (D63); the ops retry kicks `/run` fire-and-forget before its wait (D53); `pdf` only if approved at 13:30 (D66); `reset_demo` has no UI control (D17); Lane A's seed creates every sample account (D27, D68).
- 3.8 and 7.1 step 9: R-03 reads "sakte hain" (D93).
- 4.8: `export_job_status` is Lane D's `src/server/jobs/status.ts`, stubbed in contracts (D16, D52).
- 5.1: JOB-EXP-R2-PNG's file and when it is seeded (D15).
- 5.2, 5.5 and open question 13: the PDF path (D66).
- 5.6 and 0.2: the 30 s back-off (D90), the 12 s guest limit (D92) and the `/setup` exception (D79). 6.3: Lane A owns the one rate limiter (D57).
- M7: speakers may say colloquial amounts; Jashn's own output never does (D22, D75).
- Open questions 18, 20 and 21: 18 follows D53; 20 and 21 are closed (D88, D89).

### 9.7 Lead decisions, round 4 (about 06:15)

- Header: follows D1–D122 (D122).
- 0.1 Ids and 5.0: UUIDv5 under the D100 namespace, names `<table>:<seed_key>`, helper `src/db/ids.ts` in the contracts PR (D100).
- V3, 3.0 errors and 3.8: the prefill is always a list of `{command, input, labels}`; the confirm route rebuilds the full list before a 423; the 3.8 example is a list (D121).
- V10 and 3.8: the reply-audio sentence is dropped; reply-audio is capped by the turn's stored speech parts (D121).
- 3.0: `dispatchCommand` is the one server action (D98); the session helper stub (D96); the after-commit map in `src/server/jobs/after-commit.ts`, imported statically (D101).
- 3.1: the owners-only Team and sharing sheet, B4 at 13:45 (D109).
- 3.2, 5.0 and 5.3: the snapshot builder is Lane A's pure `src/db/itinerary-snapshot.ts` (A1); the D0/D2 check is A4's test (D95).
- 3.7: the Storage adapter, signing helpers and verifier by 11:40, typed in contracts (D102); `reset_demo` by 11:40, lanes reset only their own copy (D102, D120); `SEED_PASSWORD` is a passphrase (D118); the photo is kept (D107).
- Section 4: `seed_key` on every member read-model row; `days_until_due` (4.2); `venues` and `requirements` in `itinerary` (4.3); household link fields (4.4); new 4.11 with `wedding_profile` and `team` (D99). 6.1 gains both.
- 5.1 `assets`: the seeded couple photo and its idempotent photo step (D107).
- 6.3: domain's guest limits win (D108). 6.4: who pastes `JOBS_API_TOKEN` into NudgeBee, and how (D117).
- Open question 20 points to voice.md 2.5 (D88).

