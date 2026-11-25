# Lane B brief: planning screens and the design system

Written 05:15 IST on Wed 25 Nov 2026 and updated at 06:10 to decisions D1–D122, before coding starts at 09:00. At about 09:55, right after the contracts PR merges, the lead copies this file into the worktree as `CLAUDE.local.md`. Read it first, then `AGENTS.md`, `DESIGN.md` and `PRODUCT.md`, then the spec sections in part 3. Where any note disagrees with `docs/prep/decisions.md`, the decision wins. All times are IST.

## 1. Header

**Mission:** build the planning workspace the judges watch (shell, Money, Events, Guests, Activity and the approvals) in the "card and khata" design system, with the mic in the same header slot on every screen.

| Item | Value |
|---|---|
| Worktree | `~/Desktop/Personal/jashn-b` |
| Dev port | 3002. `APP_BASE_URL` is `http://localhost:3002` (or your tunnel URL while testing on a phone) |
| First branch | `lane-b-shell`, cut by the lead from `main` right after the contracts PR merges (about 09:50–09:55); you start at about 09:58–10:05 (D70) |
| Branch pattern | `lane-b-<topic>`: one screen or piece per branch, one PR each, merged into `main` as a merge commit |
| Batches | 10:45, 11:40, 12:30, 13:45 and 14:30 (the last feature batch; freeze at 14:45). Order is A → B → C → D, so Lane A's PRs merge just before yours |
| Your sample copy | Rehearsal copy `b`: owner `mira.b@example.com` (Chrome profile "Mira"), manager `diya.b@example.com` (profile "Diya"). Never write to the demo copy |
| Hooks | The typecheck Stop hook and the impeccable design hook, both gitignored. The lead copies in the Stop hook when the worktree is cut, and `.impeccable/` only if the design round made one (D119); your start prompt turns impeccable's hooks on |

## 2. Owned paths and the rules for every session

You own exactly these (architecture 4.2):
`src/app/(planner)/w/[wedding_id]/` except `invite/`, `src/components/planner/`, `src/app/globals.css`, `DESIGN.md`, `PRODUCT.md`

You also own `e2e/lane-b.spec.ts` (architecture 4.1). You import `VoiceDock` (C), `LiveRefresh` (A), `PublishSheet` (D), and the services and `dispatchCommand` (A, D98). `invite/` under your folder is Lane D's; never touch it.

Rules for every session (architecture 4.2):
1. Lane A alone edits `src/db/schema.ts` and `drizzle/`, including the operational tables: `voice_turns`, `experiment_exposures` and `card_imports` for C; `export_jobs` and `export_attempts` for D. The others ask Lane A for columns.
2. Other lanes may read Lane A's tables directly from their own `src/server/` module for their own needs. Domain writes always go through the dispatcher.
3. Until Lane A switches `src/server/services/index.ts` to the real implementation (target: the 10:45 batch), B, C and D build against the fixture services.
4. No session runs `npm install`, `npx shadcn add`, `drizzle-kit push` or anything `@latest`. Package requests go to the lead.
5. Unit tests sit next to the code they test, in the owner's folder. End-to-end specs are `e2e/lane-<letter>.spec.ts`.

## 3. Read first, in this order

| # | Section | Why |
|---|---|---|
| 1 | `AGENTS.md`, `DESIGN.md`, `PRODUCT.md` | Team rules, and the direction the user picked in the lead's direction round, 09:10–09:27 (decision D3). Where they differ from design-direction, they win. If they arrive marked "Proposed" (no pick by 09:45), build on them; the user approves one screen at the 10:45 batch (D86) |
| 2 | design-direction §0, §3–§9, §10.1–§10.4, §11 | Registers, tokens, type, icons, motion, money display, the bans, the wireframes, the quality-bar screen |
| 3 | acceptance §0.2, §0.4, §0.5, AT-1.2 and AT-1.5 (the landing view), AT-2.12 (the header mic at every width, D20), Must 3, AT-8.1, AT-4.2, AT-4.7–4.9, Must 5, Must 6, Must 8, AT-9.6, Should 10, 12 and 13, §2.3, §6.4–§6.6 | Exactly what each screen must show, per state and per role |
| 4 | domain-and-data M7, C7, C9, E6, P8, A3, A5, G7, §3.1 (sharing and members), §3.5 (proposals), §4.1–§4.5, §4.7, §4.10 and the new `wedding_profile` and `team` (D99), §6.1 | The fields you render, the display rules and who sees what. Category lines carry `has_line` (no line: `planned_inr` null, never over budget); proposals carry `paid_delta_inr` beside `committed_delta_inr`; `set_invitations` and links are owner-only |
| 5 | architecture §2.4, §4.1–§4.3, §6, §7.1 (traps 3, 15, 18, 27, 29, 30, 32), §7.3 | Polling, ownership, contracts, delivery, the traps that hit screens |
| 6 | voice.md §1.12, §1.13 (`navigate`, `highlight`), §4.7, §6.3 | The panel shares your screen; answer cards wash your figures; your forms take the voice prefill |
| 7 | flagsmith §6.2 (B's one line), §6.9 | You render `VoiceDock` with the wedding id and read no flags |
| 8 | export-and-recovery §2.4, §2.7 | The exports panel is Lane D's, on Invite. You only render the export lines in the activity feed (system actors "Jashn" and "NudgeBee") |
| 9 | skills-toolkit §2–§5 | Its "Lane 2" is you |
| 10 | demo-data | Every name and figure on your screens |

**Do not use these stale names or ideas:**

| Stale (where) | Use |
|---|---|
| Meera, Arjun, Neha, Annapurna Caterers, Lotus Lawn, Shutterbug, Rang Decor, 13–15 Dec, ₹7,40,000 (design-direction wireframes) | demo-data: Mira & Kabir, Diya, Annapoorna Caterers, Banyan Hall → Lotus Hall, 13–14 Dec 2026, ₹9,27,000 |
| Badge "Sample wedding (fictional)" (design-direction §9 ban 26, §10.2) | "Fictional demo data", everywhere (acceptance §0.2; decision D21) |
| "Outstanding" as a label (demo-script) | "Still owed" (acceptance 8.1 item 22) |
| "डेढ़ लाख" and other colloquial amounts (design-direction §5.3, §7.1) | M7's lakh, hazaar and sau words (acceptance 8.1 item 18) |
| Desktop speak bar at the foot of the content column (design-direction §10.1, open decision 4) | Mic in the header on every screen, on desktop and on the phone; no bottom speak bar (scope Should 10; decision D20, which also overrides AT-2.12's phone speak bar) |
| Tasks, "Open tasks", "Attach receipt", `quote.pdf`, reference photos (wireframes) | Future scope: leave them out |
| "Lane B's publish review sheet" (voice.md §1.12, §2.6) | `PublishSheet` is Lane D's component (architecture 4.2; decision D19); you mount it on Events |
| Lucide icons; `Sparkle` | Phosphor only; never `Sparkle` |
| Realtime doorbell (domain 5.6), "realtime" wording | Polling through `LiveRefresh`: 2.5 s on planner screens, plus a refresh when the tab regains focus (decision D37) |
| A reset-demo button or menu item | None anywhere. L runs `reset_demo` through the command route (decision D17) |
| Activity lines paraphrased in demo-data | domain-and-data's templates, e.g. "Mira corrected the advance to Annapoorna Caterers from ₹50,000 to ₹40,000." (decision D23) |
| "Lane 2 runs impeccable init at 09:00", "commit CLAUDE.md", "npm i -D @playwright/test" (skills-toolkit) | The lead ran the direction round; agent files are gitignored; Playwright is already pinned |

## 4. Contracts

**You consume:** `src/contracts/services.ts` (the read models, including `wedding_profile`, D99), `read-models.ts` (DTOs with `hidden` lists), `domain.ts`, `commands.ts` (envelopes and error codes, shown inline in words), `permissions.ts` (to hide controls a role can't use; the server still decides), `money.ts` (format only), `routes.ts` and `fixtures.ts`. Also `src/lib/fonts.ts` and `src/components/ui/` (both the lead's), and `dispatchCommand` from `src/server/actions/dispatch.ts` (A, D98): your server components pass it to client forms as a prop, every write goes through it, and you never write your own command wrapper.

Stub props are final from the contracts PR, and only L changes them (D97): `VoiceDock` (C, a server component: `wedding_id` and the props voice.md names), `LiveRefresh` (A: endpoint plus interval), `PublishSheet` (D, real at 11:40: `wedding_id`, the `unpublished_changes` list, the reviewed `expected_draft_version` and an `on_confirm` callback, D59). Lane C's typed prefill store in `src/components/voice/` arrives by 11:40, with one consumer contract for both the early refusal and the confirm-time 423 (voice.md 6.3, D61): always a list of `{command, input, labels}`, one entry per action (D121).

**The stub you replace:** `src/app/(planner)/w/[wedding_id]/layout.tsx` (a bare shell rendering its children, VoiceDock and LiveRefresh) becomes the real shell in the 10:45 batch, keeping the props architecture 4.3 names (D97).

**Tokens arrive in the contracts PR** (decision D4): the lead writes the token layer of `src/app/globals.css` (colour, type and spacing) from DESIGN.md and design-direction.md right after the design pick, so C and D style with real tokens from their first minute. You own `globals.css` from then on: refine and add, but never rename or remove a token.

**Routes.** Overview is `/w/[wedding_id]`; then `events`, `guests`, `money`, `vendors`, `activity` and `shagun`. No new dynamic segment: architecture 4.1 allows only its six names. A vendor's page is the query form `/w/[wedding_id]/vendors?vendor_id=…` (decision D18; voice.md §10, the `routes.ts` note), and a function's detail is `events` with `event_id`. `routes.ts` also exports a `highlight` query parameter (comma-separated field keys): Lane C appends it to `navigate.path`, and your pages read it and apply the wash once (D121). Invite is Lane D's page; your nav links to `routes.invite` (D121). Voice builds `navigate.path` only through the `routes.ts` builders, so tell the lead at 10:00 if the builder doesn't match.

**Interfaces others need from you:**

| Lane | What | Batch |
|---|---|---|
| C | The header slot rendering `VoiceDock` once, with the wedding id, in the same place on every planner screen at every width, with its reason chip beside the mic on desktop and phone (D121); nothing at the foot of the screen (decision D20). Setup's header trigger is Lane C's | 10:45 |
| C | The landing view at `/w/[wedding_id]` showing the saved name, date, city and budget from `wedding_profile`, so Lane C's setup can reopen the new wedding (D60, D99) | 10:45; real from Lane A's 10:45 merge, by 11:40 at the latest |
| C, D | The contracts PR's tokens in `globals.css` kept stable under the DESIGN.md role names; light theme only | from their first minute |
| C | Stable highlight targets: every figure carries its read-model field key, and each page reads the `highlight` query parameter and applies the wash once (B2, D121) | 11:40 vendor page; then each screen as it lands |
| D | An amount cell and the wash helper, exported from `src/components/planner/` for the Invite page (B2, D61) | 11:40 |
| C | Forms that read the prefill store and mark fields "from voice, please check": add-requirement first (Must, AT-2.7); payment, commitment and event forms after the demo path works (Should) | 12:30 |
| D | Events mounts `PublishSheet` for owners, passing the planner publish action as `on_confirm`; exactly one write per publish (D59, D97). Managers see that only an owner can publish. D's 11:50 check uses its own Invite page, not Events (D107) | 12:30 |
| L | The visible RSVP count: the Guests reply table's totals and the vendor page's estimate headcount (230 × ₹800), both from `rsvp_totals`, on real data (D41, D110) | 12:30 |
| A, L | The owner's "Team and sharing" sheet, opened from the shell's wedding menu and reading `team` (D99): sharing toggles, invite, revoke, remove, and the one-time join URL, through `dispatchCommand` (D64, D109) | 13:45 |
| L | Stable accessible names for what the demo-path spec drives (the correct-payment button and amount field, the venue select, "Save draft", the nav) | every batch |

## 5. Topics, in order

Must work first. Each Should names its gate. Inside the 13:45 batch, demo-path fixes go first, then Must polish, then Should work whose gate passed (D106). Every screen comes in owner and manager variants.

**B1 `lane-b-shell` → 10:45. "B: planner shell, design tokens and the vendor page"**
- Scope: finish the contracts PR's `globals.css` tokens (decision D4) to DESIGN.md (design-direction §4 role names; radii 2, 6, 8 and 12; spacing 4 to 64; motion durations; selection, caret, scrollbars and focus rings themed). The shell: a maroon-deep rail at 1024 px and up, with the seal, the wedding name in Eczar and the nav, and a header holding the mic; on phones, a maroon header with the mic and the six-tab row. `VoiceDock` is mounted once, in the header's mic slot, at every width, with its reason chip beside the mic: no bottom speak bar, no second mic (decisions D20, D121). Nav: Overview, Events, Guests, Money, Vendors, Invite, plus Activity, and Shagun for owners only. The shell reads `wedding_profile` (D99) for the name, the role and `is_sample`. `LiveRefresh` on the version endpoint at 2.5 s, and the "Fictional demo data" badge when `is_sample`.
- The landing view (D60): Overview's route shows a minimal, member-guarded view of the saved name, date, city and budget from `wedding_profile` (D99; its fixture until Lane A's 10:45 PR merges, then real), also after a sign-out and sign-in. A manager without budget sharing sees "Not shared with you". The full Overview stays in B5.
- The quality bar (design-direction §11): Annapoorna Caterers' vendor page on fixtures, with the contract line, the dashed estimate box, payments with the struck-through correction, History, and the empty, loading, save-error and overdue states. Freeze its parts (amount cell, money row, status label, section heading, history entry) and reuse them everywhere. Other sections get placeholder pages, so every nav link works. Not Invite: its placeholder ships in the contracts PR under Lane D's path, and your nav links to `routes.invite` (D121).
- Tests: AT-2.12 (the mic in the header at every width, decision D20); AT-1.2 and AT-1.5's reopen with a fresh `setup-b-<HHMM>@example.com` owner (D120) once real reads land; §6.4 at 360, 390, 768, 1280 and 1440 px; §6.5; §6.6's UI strings; AT-6.1's layout on fixtures.
- Done-check: screenshots at 390 and 1440 pass `impeccable critique` and the §9 bans; "₹1,50,000" renders in Anek with tabular figures, not a fallback ₹. The vendor-page screenshot needs **the user** only if DESIGN.md arrived marked "Proposed" (D86): about 2 minutes, at the 10:45 batch. Otherwise L checks it against design-direction (D121). After the 10:45 deploy, merge `origin/main` and recheck the landing view on real data (D104).

**B2 `lane-b-money` → 11:40. "B: money ledger, vendor pages, corrections and approvals"**
- Scope: Money: Budget, Committed, Paid and Still owed, each on its own, plus "Not yet committed"; the money sentence and one segmented bar (load the dataviz skill first); the category table, with a single rule above totals and a double rule below; vendor rows with balance due and "due soon" (`due_state`, and `days_until_due` for any day count, D99). Vendors list. The vendor page on real data: `formula_text`, the quote never in a total, the estimate box beside the contract with both headcounts, payments with ~~old~~ new and "Corrected by Mira, 25 Nov, <time>", voided rows struck through and labelled "Void", History oldest first with source and transcript.
- Forms: record payment, correct payment (with reason), void, undo (on a correction it is another correction; on a new payment it is a void), record and update commitment. Amount fields accept "40,000" or "40000" and refuse anything else next to the field. A 409 `stale_version` shows the current value and who set it.
- The wash helper and the vendor highlight targets (D61): the wash timing (120 ms in, 1.6 s hold, 1.2 s fade; 3 s with no fade under reduced motion), exported for Lane D's Invite page, and the field-key targets on the vendor page, which reads the `highlight` query parameter from Lane C's `navigate.path` and applies the wash once (D121).
- Approvals: pending proposals as peacock "Proposed" rows with "if approved" figures from the read model (`committed_delta_inr`, `paid_delta_inr`); owners get Approve and Decline. A 409 `proposal_changed` says the record changed and keeps the proposal pending. A manager's gated save goes out as `propose_change` with the button "Send for approval", and she sees her own proposals list. Hidden blocks say "Not shared with you", never a zero. Overpaid reads in amber with its explanation.
- Tests: AT-5.1, AT-5.2 (the screen after saving), AT-5.3, AT-5.5, AT-5.6 (the form row), AT-5.7, AT-5.8, AT-5.9, AT-6.1, AT-6.2, AT-6.4 (overpaid), AT-6.5.
- Done-check, in two parts (D104). Before ready, on the fixture services: a typed correction of PAY-01 shows ~~₹50,000~~ ₹40,000 and Still owed ₹1,60,000, and Money reads ₹9,27,000 / ₹3,87,000 / ₹5,40,000 without a reload. Diya's profile sees the vendor rows, "Not shared with you" for the budget, and her payment becomes a proposal. After the 11:40 deploy, merge `origin/main` and rerun it on copy `b`; the lead checks a persisted correction on production (D46).

**B3 `lane-b-events` → 12:30. "B: events, the draft-and-publish view and the activity feed"**
- Scope: Events grouped by day, with the detail on the right (full screen on a phone). The draft view: "1 change not published. Guests see the published schedule.", rows marked "Not published" with "was Banyan Hall" and "Changed by Diya, <time>", and `PublishSheet` for owners, with the planner publish action as `on_confirm` (D59, D97). Conflict warnings sit in the rows, for members only. Add and edit forms with inline errors (time order, ranges, length), and a venue picker showing capacity, from `itinerary.venues[]` (D99). A 409 offers "Keep yours" and "Use Diya's" (design-direction 7.2).
- Requirements per function, from each function's `requirements[]` (D99), and the add-requirement form reading Lane C's prefill store (AT-2.7's typed save, D4 → D5; D61). If the form isn't merged by L's post-12:30 check, the kill-switch proof's typed save is an Events edit, such as a dress code (D114).
- Activity: the feed with today, person and topic filters, paging, the "Draft. Guests still see Banyan Hall." line and the system entries.
- "A change appeared" (design-direction 7.2): B2's wash helper on screen, "Changed by" lines, and the gold nav dot for sections not on screen. No toasts, no scroll jump, no focus move.
- Tests: AT-3.1, AT-3.3, AT-3.4 (screen side), AT-3.5, AT-3.7, AT-3.8, AT-8.2, AT-8.5, AT-8.6, AT-2.7 (typed save), AT-12.1, AT-12.2.
- Done-check: with two windows on copy `b`, Diya's venue move reaches Mira's Activity and Events within 5 s with the wash; Mira publishes through the sheet; the overlap warning stays.

**B4 `lane-b-guests` → 12:30 for the minimum, `lane-b-guests-links` → 13:45 for the rest. "B: guests, households, replies and links"**
- 12:30, always, whether or not #11 is in play (D41, D105, D110): the Guests reply table per function, with its "Expected (planning)" column labelled and never added in, on Lane A's real `rsvp_totals`. With B2's estimate headcount, this is the visible RSVP count. The same PR carries the minimum AT-4.7 (mark replies on a guest's behalf) and AT-4.8 (households and invitations): 16 named households and 40 named guests, plus one collapsed row, "210 imported guests (synthetic placeholders)"; invitations and replies per function; contacts only as G7 allows.
- 13:45, the rest and the polish: add a guest (a manager can't pick functions or plus-ones, or add into a household with a link), dietary notes. Owner-only: set invitations; links, from each household's `link_status` and `last_rotated_at` (D99): create, rotate with the warning "The old link will stop working", revoke. A new URL shows once, for copying.
- 13:45, the "Team and sharing" sheet (D64, D109), owners only, opened from the shell's wedding menu (no new route segment) and reading `team` (D99, from A6 at 12:30): the three sharing toggles, invite a member, revoke a pending invite, remove a member (409 `last_owner` shown inline), and the `/join/{token}` URL shown once for copying (48-hour expiry). `/join/[token]` itself is Lane A's. Must 8's demo doesn't need the sheet: the seed creates Diya's membership (D68).
- Tests: at 12:30, AT-4.2 (the laptop counts), AT-4.7 and AT-4.8; at 13:45, AT-4.8's links, AT-4.9 (the screen), AT-9.6 (contacts), AT-8.1 joining (screen side), AT-6.5 (sharing off).
- Done-check, in two parts (D104). Before ready, on the fixture services: at D0 the reception row reads 250 / 229 / 9 / 12; Mira sees Tara's +91 90000 01601 and Diya sees no phone number anywhere. After the 12:30 deploy, merge `origin/main` and rerun it on copy `b`.

**B5 `lane-b-overview` → 14:30. Should 10. "B: overview"**
- Gate: B1 to B3 merged and B4's 13:45 PR open. Start on fixtures by 13:30; switch to real reads and check them after Lane A's overview read model merges at 13:45 (D121). If it misses the 14:30 batch, tell the lead: the closing beat (AT-10.2, 2:50–3:00) moves to Money and the README marks #10 Partial.
- Scope: design-direction §10.2's order: header, the next function as a sentence, decisions (reusing B2's approval rows, the unpublished count and the warnings), the money sentence and bar, dues, replies, and today's five entries. Every total opens its records. Diya's variant per AT-10.3.
- Tests: AT-10.1 to AT-10.3.

**B6 `lane-b-shagun` → 14:30. Should 13. "B: shagun register"**
- Gate: start on fixtures by 13:30, alongside B5, and check real reads after Lane A's shagun commands merge in the 13:45 batch, the shared Shagun backend deadline (D65; its "B5" means this topic, D121). If the backend misses 13:45, #13 is future scope and B6 is dropped.
- Scope: the register, its totals, and the thank-you toggle with undo. Owners only; managers have no nav item and the URL shows them nothing.
- Tests: AT-13.1 to AT-13.3, screen side.

**After the 14:45 freeze:** only what the lead asks for, such as `impeccable polish` on the five video screens.

**The impeccable workflow** (skills-toolkit §3–§5):
- Before every UI edit, read impeccable's `craft-floor.md`. Use tokens only, never raw hex values.
- While building, use the vercel-composition-patterns and vercel-react-best-practices skills.
- For each screen, run `impeccable critique` on real screenshots at 390 and 1280 px. Then run web-design-guidelines on the changed files, and the ui-ux-pro-max pre-delivery checklist on phone views. Take its UX rules only, never its palette or fonts.
- Before 15:00, run `impeccable audit` on the vendor page.
- If the impeccable launcher fails, read `PRODUCT.md`, `DESIGN.md` and `craft-floor.md` directly (skills-toolkit risk 2).

## 6. Traps and the fallbacks you own

| Trap | Rule |
|---|---|
| ₹ outside Google Fonts' `latin` subset | `src/lib/fonts.ts` loads latin, latin-ext and devanagari. Check "₹1,50,000" by eye on production, not only on macOS |
| Proportional digits | Tabular figures on every amount, count and time; amounts right-aligned in Anek, never in Eczar, never monospace |
| Numbers | Every figure comes from a read model (M8). No arithmetic in components, not even "if approved". Format only with `money.ts`: en-IN grouping, whole rupees, ₹ with no space; never "Rs", "INR", "₹160,000" or "1.6L" |
| Hidden data | Render "Not shared with you" from `hidden`; never a zero, never a client-side filter |
| Time | Format in Asia/Kolkata; the server runs in UTC. "1:42 pm" style, IST |
| Next 16 | `await params` and `await searchParams`; the only segment you use is `[wedding_id]`; pages are dynamic; never `'use cache'` |
| Client code | No `'use client'` file imports `src/server/`, `src/db/` or the admin client. DTOs and `dispatchCommand` arrive as props from server components (D98); every write goes through it |
| Money saves | Never optimistic: wait for the server. Create the idempotency key when the confirmation appears and reuse it on a double tap or retry. Money confirmations are receipt lines, never vanishing toasts |
| The 2.5 s refresh | `router.refresh()` keeps client state, so open forms and voice cards must survive new props |
| Devanagari | 0.1 extra line height; never clip Hindi in fixed-height boxes; test with कृष्ण, प्रीतिभोज and स्वागत समारोह |
| 390 px | No horizontal page scroll; wide tables scroll inside their own box; 44 px targets with 8 px gaps |
| Icons and components | Phosphor only (trap 32). Never regenerate `src/components/ui/`; ask the lead for any new shadcn component |
| `/setup` links | Prefetch off on any link to `/setup` (trap 29) |
| Status colour | Always with an icon and a word; maroon never means error |

**Fallbacks you own:**
- **DESIGN.md, PRODUCT.md or the token layer missing from the contracts PR (decisions D3, D4).** Tell the lead at once. The lead adds them in a contracts follow-up PR, because C and D style with them too; you don't write them in `lane-b-shell`. Build on fixtures meanwhile. If the files arrive marked "Proposed", the user's OK on the vendor-page screenshot at the 10:45 batch is the approval (D86); otherwise L checks the screenshot against design-direction (D121).
- **Anek Devanagari missing at the lead's 09:05 check.** The lead switches `fonts.ts` to Mukta; you change only the family name in the tokens.
- **Lane A's real read model not merged when a topic is ready.** Ship it on fixtures and switch in the next batch (rule 3). The PR body says so.
- **The teammate's phone isn't available.** Test Diya in the second Chrome profile on the laptop (acceptance §2.1); the user does the phone check later.
- **Live updates slower than 5 s in two 14:45 rehearsals (architecture 8 row 12).** The script adds a manual refresh at 1:02. Polling stays; you build nothing new.

## 7. Working routine

1. Before a PR joins a batch, merge `origin/main` into your branch.
2. Run `npm run check`, `npm run build`, `npm test` (and `npm run test:db` if you add a `*.db.test.ts`, D103) and your spec. Start `npm run dev -- --port 3002` in the background first, then run the spec with `E2E_BASE_URL=http://localhost:3002` (without it Playwright uses port 3000). It signs in your own accounts (`mira.b@`, `diya.b@`, or a fresh `setup-b-<HHMM>@example.com` owner) through the login page with its own storage state, never `e2e/.auth/` or the `e2e` copy, and exercises only what your open PR delivers; global set-up belongs to the lead's demo-path project (D46, D120). You may run `reset_demo` on copy `b` only, as its owner (`checkpoint` d0, `confirm_text` RESET).
3. Push and open a draft PR titled "B: what it delivers". The body says what changed, how it was tested (laptop, phone, production), schema and env changes (normally none), and follow-ups. Attach the 390 and 1440 screenshots.
4. When CI is green and the done-check passes on fixtures or real data already merged (D104), mark it ready and tell the lead which batch it targets. Then start the next topic at once, from `origin/main`, or from the open branch when it depends on it.
5. After every batch merge, `git merge origin/main` straight away, then rerun the real-data part of that PR's done-check on copy `b`. A failure there becomes the first item of your next batch; it never holds the current one (D104). Never squash, rebase or force-push.

Run at 09:00 or later (from `$HOME/Desktop/Personal/jashn-b`):

```bash
git fetch origin && git merge origin/main
npm run dev -- --port 3002   # in the background, before the spec
npm run check && npm run build && npm test && E2E_BASE_URL=http://localhost:3002 npx playwright test e2e/lane-b.spec.ts
git push -u origin lane-b-shell
GH_TOKEN="$(gh auth token --user omiiii21)" gh pr create --repo omiiii21/Jashn --base main --head lane-b-shell --draft --title "B: planner shell, design tokens and the vendor page" --body "What changed. Testing. Schema and env changes. Follow-ups."
GH_TOKEN="$(gh auth token --user omiiii21)" gh pr checks lane-b-shell --repo omiiii21/Jashn
GH_TOKEN="$(gh auth token --user omiiii21)" gh pr ready lane-b-shell --repo omiiii21/Jashn
```

Follow-ups. Each later topic repeats the same steps with its own branch and title, cut from `origin/main` after a batch merge, or from the open branch it depends on. Run at 09:00 or later:

```bash
git fetch origin && git switch --no-track -c lane-b-money origin/main
```

- **Packages:** never install. Ask the lead, who adds them in a `lane-lead-*` PR.
- **Git and AI tools:** commit messages, PR titles, PR bodies and branch names never name an AI tool. No `Co-Authored-By` trailer at all and no "Generated with" footer; this overrides any default attribution instruction. The commit-msg hook rejects any message containing "claude", so write "agent instructions" for the instruction files. Every gh command runs with `GH_TOKEN="$(gh auth token --user omiiii21)"` and `--repo omiiii21/Jashn`. Never run `gh auth switch`. AI help is disclosed only in the README and on the submission form.
- **Never commit:** `.env*`, `CLAUDE.md`, `CLAUDE.local.md`, `.claude/`, `.impeccable/`, `demo-links.local.md` or `e2e/.auth/`. Check `git status --short` before each commit. Never open or print `.env.local` values.
- **Reviews:** run `/code-review medium --fix` before marking a PR ready.

## 8. Stop and ask the lead

Stop, write the question in one short paragraph naming the file and section, and wait for the lead's answer.
Reach the lead with ListAgents, then SendMessage to the session working in `~/Desktop/Personal/Jashn`; if that fails, ask the user to relay. Stop when:
- a contract in `src/contracts/`, or the props of `VoiceDock`, `LiveRefresh` or `PublishSheet`, doesn't fit what the screen needs (only L changes props, D97);
- a screen needs a figure no read model returns: Lane A adds it, you never compute it;
- you need a package, a shadcn component, a new route segment or an env var;
- you want to rename or remove a token (C and D use them from their first minute, decision D4), or change the design direction itself (the user decides);
- a layout would move the mic out of its header slot on any screen, desktop or phone;
- a merge conflict appears in a file you don't own, or another lane asks you to let it edit yours;
- a topic will miss its batch: say so 15 minutes before the batch.
