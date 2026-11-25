# Jashn: card export and NudgeBee recovery

Prep note written at about 03:20 IST on Wed 25 Nov 2026, before FestiveHacks coding starts at 09:00. It is notes only (Rule 4): prose, tables, short JSON examples of HTTP payloads, and setup commands labelled "Run at 09:00 or later". It contains no SQL, TypeScript, YAML, config or pseudo-code. Session D builds from it after 09:00. The lead copies its names into `src/contracts/jobs.ts`, `flags.ts`, `api.ts` and `routes.ts` at 09:35–09:55 (decision D121).

**Status: binding for session D** on the exported card, the export job, the ops HTTP contract and the NudgeBee workflow. Entity, table, field, command, topic and error names come from `spec/domain-and-data.md`. Where this file deliberately differs, section 0.2 says so and section 11 lists the change that file needs. Data values (names, dates, hall, file names, workflow name) come from `demo-data.md`.

Fact-checked at about 04:50 against `research-stack.md` and `research-nudgebee.md`, and against `architecture.md` (04:07 and later) and `flagsmith.md` (04:42), which have both adopted this file's changes (0.2, section 12).

Read with: `scope.md` (Must #7 and the NudgeBee sponsor line), `demo-data.md` §11 and §13.2, `demo-script.md`, `design-direction.md` §0, §4–§7 and §10.7, `research-stack.md` §7 and §9, `research-nudgebee.md`, and the sibling specs `domain-and-data.md` (§3.7, §4.8, §5, §6), `architecture.md` (§2.2, §3.6, §4, §5, §6, §8) and `flagsmith.md` (§3.6, §3.7).

---

## 0. Decisions at a glance

### 0.1 The decisions

1. **One shared card per published revision and format.** A 1080 × 1350 PNG is the Must. An 8 × 10 in PDF is a Should behind the 13:30 gate, otherwise future scope.
2. **The card lists only the functions every invited guest is invited to.** In the demo that is the Reception. The list is frozen on the job when the job is created, so every attempt prints the same card and the render page needs no guest data.
3. **Chromium runs in one route only:** the internal worker route `POST /api/ops/export-jobs/{job_id}/run`. Every command that queues a job kicks it after commit, whichever transport ran the command: the exports panel, voice, NudgeBee or tests. The reserved job id `probe` renders a built-in sample card for the production smoke test (probe PR open by 10:25, merged about 10:30, P1 measured at 10:40) and for warm-up.
4. **States are `queued`, `rendering`, `succeeded` and `failed`.** A retry moves `failed` to `queued`, and only the worker moves `queued` to `rendering`. Both moves are compare-and-set, so at most one render runs per job.
5. **`export_key` = `export:{wedding_id}:rev{revision}:{format}`,** and it is unique. Each revision and format has one job and one file, at a fixed path written by upsert.
6. **NudgeBee calls two routes** on the production domain, with `Authorization: Bearer <JOBS_API_TOKEN>`: GET status and POST retry.
   - Every business state answers HTTP 200, with the state in the body, and every scalar is a string.
   - The retry requires `Idempotency-Key`. A resend with the same key replays the first answer.
   - A different key can still only claim a `failed` job once, conditionally on `export_key`.
7. **The drill is the Flagsmith flag `export_failure_drill`,** as `flagsmith.md` §3.6 designs it, with one change: its value names the one sample wedding it may arm. It fails attempt 1 before Chromium starts, and it is labelled everywhere as deliberate.
8. **The workflow `card-export-recovery` has a webhook trigger and a manual trigger.** Its steps:
   1. read the status;
   2. branch on `failed`;
   3. in-app approval, with a 45-minute timeout;
   4. retry;
   5. verify;
   6. re-send the same retry to prove the replay;
   7. print a verdict.
9. **The demo beat is recorded by default** (V15, 13:00–13:30, with a retake at 14:00–14:30 only if needed, on the demo copy). It goes live only if two rehearsals in a row finish in under 15 s; the lead decides at 14:30 (7.1).
10. **Fallbacks:**
    - the next/og renderer, deployed dormant in the 11:40 batch and switched on at 12:15 with no deploy (decision D48);
    - kind plus the agent if T2 or T4 fails (decided at 09:30 if the teammate ran the checks, otherwise at about 10:20; 6.7);
    - manual runs if the webhook fails;
    - email approval if in-app approval fails;
    - the recording path chosen at 12:45 if the retry through NudgeBee is broken (decision D43; 6.10).

### 0.2 Names, and where this file differs from the other specs

| Topic | This file | domain-and-data.md | architecture.md / flagsmith.md | Why |
|---|---|---|---|---|
| Job states | `queued`, `rendering`, `succeeded`, `failed` | `running` instead of `rendering` | – | Session D's brief names `rendering`. Domain change 2 |
| Ops token | `JOBS_API_TOKEN`; NudgeBee Secret `jashn_ops_token` | `OPS_API_TOKEN` | `JOBS_API_TOKEN`, Secret `jashn_ops_token` | Brief and architecture agree. Domain change 1 |
| Webhook env var | `NUDGEBEE_EXPORT_WEBHOOK_URL` | `NUDGEBEE_WEBHOOK_URL` | `NUDGEBEE_EXPORT_WEBHOOK_URL` | Architecture's retired-names table |
| Where Chromium runs | One internal route, `/api/ops/export-jobs/{job_id}/run` | The requesting route's `after()` | Same as this file (architecture §0 item 6, §2.2) | A voice-requested export confirms in Lane C's route, which has no Chromium. One function to warm (3.2) |
| Render page | `/render/card/{job_id}?t=…` | `/render/card/{publication_id}` | Same as this file (architecture §2.2, §3.7) | The job carries the frozen function list (1.1) |
| Export object | Bucket `exports`, object `{wedding_id}/card-rev{revision}.png` (`.pdf` only if the PDF ships) | Same | Same (architecture §9 item 11) | The object name equals the artifact id `card-rev3.png` |
| Drill switch | Flag enabled **and** its value equals the wedding id; sample weddings only | Flag on arms any new job | Same as this file (flagsmith §3.6) | Several sample copies exist (architecture §9 item 10); this stops cross-lane trips |
| Drill env fallback | `EXPORT_FAILURE_DRILL` = a wedding id | `once` | A wedding id (architecture §5.1, flagsmith §6.8) | The same reason |
| Ops JSON | Every scalar a string, never null | Examples use booleans and nulls | – | research-nudgebee E1 and U4 |
| Failure codes | Adds `RENDER_TIMEOUT`, `FONT_NOT_LOADED`, `NOT_STARTED` | Four codes | – | Tests and the panel need them (2.5) |
| Route time limits | Request 30 s, owner's retry 30 s, NudgeBee's retry 60 s, GET 15 s, run 120 s | – | Same as this file (architecture §2.2) | Only `/run` renders |
| Names in the research notes | Routes `/api/ops/export-jobs/…`; token `JOBS_API_TOKEN`; drill flag `export_failure_drill`; error `DRILL_INJECTED` | – | Same | research-stack §9 used `/api/ops/jobs/…`, `OPS_API_TOKEN` and a 409 for `max_attempts`; research-nudgebee used `OPS_RECOVERY_TOKEN`, an `inject-failure` route and `SYNTHETIC_RENDER_FAILURE`; research-flagsmith used `card_export_fault_once`. None of those names is built |
| Workflow name | `card-export-recovery` | – | – | demo-data §13.2 (research used `jashn-invite-export-recovery`) |
| PDF | Should, gated at 13:30 | Future scope | Bucket allows PDF | 1.4 |

---

## 1. The card

### 1.1 What one card is

- **One image per published revision and format,** shared by the couple however they like (WhatsApp, print).
  - It is not per household. A household's personal link (`/i/{token}`) stays the one place that lists exactly that household's functions (G1, R9).
  - Per-household cards are future scope.
- **Functions on the card:** the published functions in the snapshot to which every invited guest has an active invitation, in start order.
  - An invited guest is a guest with at least one active invitation in this wedding.
  - If nobody is invited yet, every published function is listed.
  - Demo: all 250 guests (40 named, 210 placeholders) are invited to the Reception, so the card lists the Reception only. That matches demo-data §11.3.
  - Why: a card can be forwarded to anyone, so it must never name a function that some household isn't invited to (demo-data §11.1; the spirit of G2).
- **Frozen when the job is created.**
  - `request_card_export` computes the list from live invitations, because P10 keeps invitations out of the snapshot.
  - It stores the event ids on the job as `card_event_ids`.
  - Every attempt of that job prints the same card, and the render page reads no guest data.
- **More than three functions:** print the first three, then "and {n} more functions. Your personal invitation link lists them all."
- **No qualifying function:** no function block. The date line falls back to the wedding date and city, and the reply line becomes "Your personal invitation link lists your functions."

### 1.2 Content, top to bottom

| # | Element | Source (snapshot unless noted) | Demo value (REV-3) | Rule |
|---|---|---|---|---|
| 1 | Blessing line | `invite_style.blessing_line` | none | Shown only when the couple sets one; never a default religious mark |
| 2 | Seal | Initials of `bride_name` and `groom_name` | MK | Two concentric rings |
| 3 | Hindi heading | `invite_style.heading_hi` | शुभ विवाह | Marked as Hindi |
| 4 | Lead-in | `wording_en`, first paragraph | With the blessings of our families | See the split rule below |
| 5 | Names | `bride_name` & `groom_name` | Mira & Kabir | |
| 6 | Follow line | `wording_en`, second paragraph | invite you to celebrate their wedding | |
| 7 | Photo | `invite_style.photo_asset_id` | The AI-generated fictional portrait | Mounted, never cropped (1.3). With no photo set, the card renders without the photo box (decision D107) |
| 8 | Function title | Event `title` and `title_hi` | Reception, रिसेप्शन | One block per listed function |
| 9 | Date | `event_date` | Monday, 14 December 2026 | Weekday first, IST |
| 10 | Time | `start_time`, plus `muhurat_time` when set | 7:30 PM onwards | When set, an extra line: "Muhurat 11:15 AM" |
| 11 | Venue | Venue `name`, `place_name`, `locality`, then the wedding `city` | Lotus Hall, Mallige Gardens, Whitefield, Bengaluru | |
| 12 | Hindi line | `invite_style.wording_hi` | आपकी उपस्थिति से हमें अत्यंत प्रसन्नता होगी। | Marked as Hindi |
| 13 | Reply line | Fixed text | Kindly reply through your personal invitation link | |
| 14 | Footer | Fixed text, sample weddings only (`is_sample`) | Fictional demo data. AI-generated photo. | |

**Never on the card:**
- money of any kind, vendors, guests or guest counts;
- draft values, warnings (such as the mehendi conflict) or RSVP state;
- QR codes, links or tokens.

**`wording_en` split rule.** The text splits at its first blank line: the first paragraph prints above the names and the second below them. With no blank line, everything prints above the names and nothing below. This is a convention for `update_invite_style` (domain change 17). The demo wording from demo-data §11.1 is stored as two paragraphs.

### 1.3 Layout and style

**Canvas:**
- 1080 × 1350 CSS px with a maroon-deep ground.
- The ivory card stock is inset 40 px on every side (1000 × 1270), with a 2 px radius.
- The foil frame is a 1 px gold hairline 12 px inside the card edge, with square corners.
- Content sits in a centred column 872 px wide (64 px side padding).

**Type** (faces from `src/lib/fonts.ts`; the Devanagari line height is 0.1 above the Latin one, per design-direction §5):

| Element | Face, weight, size | Colour |
|---|---|---|
| Blessing line | Eczar 400, 22 px | gold-ink |
| Seal initials | Eczar 600, 30 px, inside two rings of 88 px and 80 px | maroon on ivory |
| Hindi heading | Eczar 500, 54 px | maroon |
| Lead-in and follow line | Eczar 400, 28 px | gold-ink |
| Names | Eczar 600, 84 px | maroon |
| Function title | Eczar 500, 40 px; `title_hi` beside it in Eczar 400, 26 px | maroon; gold-ink |
| Date, time and venue | Anek Devanagari 400, 25 px, one per line | ink |
| Hindi line | Eczar 400, 28 px | gold-ink |
| Reply line | Anek Devanagari 400, 22 px | ink |
| Footer | Anek Devanagari 400, 18 px | ink |

**Colours** (demo-data §11.2, from design-direction §4):

| Theme | Ground | Card stock | Names and headings | Foil (frame) | Wording and Hindi lines | Details |
|---|---|---|---|---|---|---|
| `maroon_gold` (demo) | `#4E0C1A` | `#F7EFDF` | `#6A1224` | `#C9A24E` | `#7D5B17` | `#2B1D1A` |
| `peacock_gold` (if built) | `#0D3A45` | `#F7EFDF` | `#14505E` | `#C9A24E` | `#7D5B17` | `#2B1D1A` |

**Photo:**
- The photo box keeps the photo's own aspect ratio, at most 560 px wide and 380 px tall.
- It sits inside a 1 px gold-ink rule with a 10 px ivory margin, never cropped or retouched. That satisfies design-direction ("uncropped") and demo-data ("used as uploaded").
- L asks GPT-6.2-Sol, at 10:00–11:00 (decision D14), for a 3:2 landscape image of at least 1500 × 1000, as a JPEG under 1.5 MB, so the box comes out at about 540 × 360. The user approves it at about 10:40 (D119).
- L commits it as `scripts/seed-assets/couple-photo.jpg` by 11:00, in a lead PR merged first in the 11:40 batch. The seed's photo step is idempotent: it uploads the file and upserts the asset row by `seed_key`, and touches nothing else. L runs it for every copy right after the 11:40 deploy. From then on it's part of D0, so `reset_demo` keeps it (decision D107).
- The template renders with and without a photo, so the 11:50 card passes either way (D107).
- `photo_frame` `arch` is optional. If it isn't built, it renders as `mounted`.

**Fit rule:**
- The worker measures the content before capture. If it is taller than the card, shrink in this order:
  1. the photo box, down to 240 px tall;
  2. the vertical gaps, down to half;
  3. the function block, down to one line per function.
- Text never goes below 22 px (the 18 px footer excepted) and is never clipped.
- If it still doesn't fit, the attempt fails with `RENDER_FAILED` "layout overflow".

**Rules from design-direction:**
- Gold is foil only and never sets small text.
- No gradients, no clip-art, no ornaments beyond the seal and the frame.
- No all-caps, no exclamation marks, and no middle-dot strings: demo-data's "Reception · Monday…" line is set as separate lines.

**Studio settings that reach the card:**
- `theme`.
- `typeface`: `tiro_devanagari` sets the three Hindi elements (heading, `title_hi`, Hindi line) in Tiro Devanagari Hindi.
- `photo_frame`.
- `layout` is for the guest site and is ignored on the card.

### 1.4 Formats and sizes

| Format | Size | How | Status |
|---|---|---|---|
| PNG | 1080 × 1350 px (4:5), device scale 1, sRGB, about 0.4–1.5 MB | Chromium screenshot of the full viewport | **Must** |
| PDF | 8 × 10 in (203.2 × 254 mm), one page, the same 4:5 layout | Chromium print of the same page: backgrounds on, zero margins, scale 0.711 (768 ÷ 1080) | Should, about 30 minutes, only if the lead approves it at 13:30 (decision D66). Then Lane A adds the `pdf` enum value and `application/pdf` in the `exports` bucket in an additive migration, and Lane D ships it in the 14:30 batch: a one-page PDF render, its download, and its own `export_key` check (a second key, `…:pdf`) |
| PNG via next/og | 1080 × 1350 px | The 12:15 fallback (3.7) | Only after the switch |

**Why 1080 × 1350:**
- demo-data §11.3 fixes it.
- It is the portrait size WhatsApp and Instagram show without cropping.
- 4:5 prints as 8 × 10 in with no layout change.

Not rendered at 2×: the file would be four times larger for no visible gain on a phone.

### 1.5 Fonts and Devanagari shaping

- **Faces** come from `src/lib/fonts.ts` (lead, next/font/google, self-hosted on the deployment):
  - Eczar 400, 500 and 600;
  - Anek Devanagari 400 and 500;
  - Tiro Devanagari Hindi 400;
  - subsets latin, latin-ext and devanagari.
  - research-stack §7 confirms that Eczar, Tiro Devanagari Hindi and Mukta have a `devanagari` subset in next/font 16.4.6. Its list does not name Anek Devanagari, so that face is unconfirmed. The lead checks it at about 09:10, after the 09:08 install, in the installed font data (architecture §4.1); if it is missing, or has no `devanagari` subset, `fonts.ts` uses Mukta in its place, on the card and in the app.
- **Why web fonts are mandatory:**
  - Sparticuz Chromium ships only Open Sans (Latin, Greek, Cyrillic). Without the web fonts every Hindi glyph is a box.
  - Chromium shapes Devanagari itself (HarfBuzz) once a font with the glyphs has loaded.
  - next/og (Satori 0.29) cannot shape Devanagari, which is why its fallback is Latin-only.
- **Language marking.** Every Hindi element is marked as Hindi (the `hi` language attribute) inside an English page, so line breaking and font fallback follow Hindi rules.
- **Readiness guard,** run by the worker in the page before capture:
  1. Navigation waits until the network is idle.
  2. The document's font set reports ready.
  3. For each element marked Hindi, and for the names, the browser loads that element's own computed font for that element's own text. At least one web font face must come back loaded.
  4. When the snapshot has a photo, it has loaded and decoded, with a non-zero natural size. Otherwise: `RENDER_FAILED` "photo not loaded". With no photo set, the step passes (D107).
  5. The fit rule holds (1.3).

  Steps 1–3 share an 8 s budget. If it runs out, the attempt fails with `FONT_NOT_LOADED` and the names of the faces that didn't load.
- **The local trap.** macOS Chrome has system Devanagari fonts (Kohinoor, ITF Devanagari), so a missing web font still looks right on the laptop and fails only on Vercel. Guard step 3 checks the web faces themselves, so the same mistake fails locally too.
- **Visual check strings** (design-direction §5): कृष्ण, प्रीतिभोज, स्वागत समारोह, plus शुभ विवाह and the Hindi line.
  - Pass: conjuncts join, matras sit on the right consonant, there are no dotted circles and no boxes, and the result matches local Chrome by eye.
  - The probe card (3.6) prints the test strings on an extra line so the check can be made on production.

### 1.6 Privacy of the render page

- **What it reads:** `/render/card/{job_id}?t=…` reads only the job (its publication, format and `card_event_ids`), that publication's snapshot, and the wedding's `is_sample`. It signs the couple photo for 1 hour (architecture §3.6). The reserved id `probe` renders the built-in sample card and reads nothing.
- **The token:** an HMAC-SHA-256 over the job id and an expiry at most 5 minutes ahead, made with `RENDER_TOKEN_SECRET` and minted by the worker. A wrong, expired or missing token gets the plain 404 page.
- **Headers:** noindex, no-store and no-referrer (architecture §3.4 sets them for `/render/*`). The proxy skips `/render/*`.
- **Card only:** no app chrome, no badge and no toaster. The root layout (lead) must stay bare: html, body and fonts.

---

## 2. The export job lifecycle

### 2.1 States and transitions

| From | To | Done by | Guard | Writes |
|---|---|---|---|---|
| none | `queued` | `request_card_export` (owner or manager, from the panel or by voice) | A published revision exists (else 409 `nothing_published`); no job has this `export_key` (else `unchanged`, returning that job) | The job with `card_event_ids`, the attempt 1 row (trigger `request`), an activity entry, the version and the receipt. After commit: kick the worker |
| `queued` | `rendering` | The worker (`/run`) | Compare-and-set on `queued`; `attempts` + 1; `lease_until` = now + 2 min | The attempt row becomes `rendering`, with `started_at` and `renderer`. The version moves; no activity entry |
| `rendering` | `succeeded` | The worker | It still holds the claim: status `rendering` and `attempts` equal to its own attempt number | Artifact fields, attempt row, an activity entry and the version |
| `rendering` | `failed` | The worker: the drill, the guard, the cap or a render error | The same claim check | `last_error_*`, attempt row, an activity entry and the version. After commit, the webhook if this is the job's first failure (2.8) |
| `rendering` | `failed` (`LEASE_EXPIRED`) | Lazily, by the next ops GET, retry or request that reads the job | `lease_until` has passed | As above |
| `queued` | `failed` (`NOT_STARTED`) | Lazily, by the same readers | Queued for more than 60 s | As above |
| `failed` | `queued` | `retry_card_export`: NudgeBee through the ops route, or the owner through the panel | Compare-and-set on status `failed`, `export_key` = `expected_export_key`, revision = `published_revision`, `attempts` < `max_attempts` | Attempt row N+1 (trigger `nudgebee` or `owner_retry`, the key, NudgeBee ids, approver), an activity entry, the version and the receipt. After commit: kick the worker |
| any | removed | `reset_demo` on a sample wedding | The job has no `seed_key` | As domain-and-data §3.7 |

- `succeeded` is terminal.
- A `failed` job with 3 attempts is terminal for its revision. A new revision gives a new key.
- Member read models never write. The panel shows a stalled job (lease passed, or queued for over 60 s) as "stopped responding", and the owner's Retry runs the lazy expiry first.

### 2.2 Timers and invariants

| Timer | Value | Why |
|---|---|---|
| Render cap | 45 s, from taking the instance's render slot to the end of the upload | Beyond it: `RENDER_TIMEOUT` |
| Lease | 2 min from the claim (domain-and-data §3.7) | Covers a wait for the slot (≤ 45 s) plus a render (≤ 45 s) |
| Queued expiry | 60 s | The kick was lost: `NOT_STARTED` |
| `/run` `maxDuration` | 120 s | No shorter than the lease |
| Retry `wait` | 0–25 s, default 25; NudgeBee sends 20 | Under NudgeBee's HTTP step timeout, which stays at its documented default of 30 s (research-nudgebee F15) |
| GET `wait` | 0–10 s | Under the route's 15 s limit |
| `max_attempts` | 3 | The initial attempt plus two retries |

**Invariants:**
- **One job per `export_key`** (unique), and one object per job (fixed path, upsert).
- **At most one render in flight per job:** two compare-and-sets (`failed` → `queued`, then `queued` → `rendering`).
- **A worker writes only while it holds its claim.** It re-checks the claim before uploading and before completing. A worker that lost its lease uploads nothing, and its result is dropped.
- **One browser per server instance and one page at a time.** Launches never overlap, which avoids the `spawn ETXTBSY` trap.
- **A retry or a render never publishes.** It never changes the guest page, RSVPs or the ledger, and never messages guests.

### 2.3 The keys

| Key | Form | Guarantees |
|---|---|---|
| `export_key` | `export:{wedding_id}:rev{revision}:{format}` (demo: `export:<demo wedding id>:rev3:png`) | One job per revision and format. A second request returns `unchanged` with the existing job, whatever its state. A double click racing on the unique key also returns `unchanged`, never a 500 |
| Retry `Idempotency-Key` | NudgeBee: `nb-{execution_id}-{job_id}`; panel: a UUID made when the button appears | Stored in `command_receipts` for every outcome. The same key with the same request replays; the same key with a different request is 409 |
| Claim condition | Status `failed`, `export_key` = `expected_export_key`, revision = published revision, `attempts` < 3 | Checked in one compare-and-set, so two different keys can't both claim |
| `job_label` | Computed as `JOB-EXP-R{revision}-{FORMAT}` | Gives JOB-EXP-R3-PNG and JOB-EXP-R2-PNG without a stored column |

### 2.4 Records

The tables are domain-and-data's `export_jobs` and `export_attempts` (Lane A owns the schema), plus two columns:
- `export_jobs.card_event_ids`: an array of event ids, frozen at creation (1.1);
- `export_attempts.renderer`: `chromium` or `og`.

Receipts go in `command_receipts`. Every transition moves `weddings.version`, so open panels refresh through the 2.5 s poll.

**Activity entries** (visibility `members`). These templates and their call sites live in Lane D's `src/server/jobs/` (or `src/server/invite/`). Lane A's append helper takes the finished entry, and Lane D never edits `src/server/activity/` (decision D63).

| Step | English | Hindi (native check needed) | Actor | Topic |
|---|---|---|---|---|
| Requested | "{actor} started a card export for revision {n}." | "{actor} ने संस्करण {n} का कार्ड बनवाना शुरू किया।" | Member | `export.requested` |
| Failed | "The card export for revision {n} failed: {reason}." A drill adds " (deliberate drill)" | "संस्करण {n} का कार्ड नहीं बन पाया: {reason}।" A drill adds " (जानबूझकर किया गया अभ्यास)" | `system`, "Jashn" | `export.failed` |
| Retried by NudgeBee | "NudgeBee retried the card export for revision {n} (run {run}, approved by {approver})." | "NudgeBee ने संस्करण {n} का कार्ड दोबारा बनवाया (रन {run}, मंज़ूरी: {approver})।" | `system`, "NudgeBee" | `export.retried` |
| Retried by the owner | "{actor} retried the card export for revision {n}." | "{actor} ने संस्करण {n} का कार्ड दोबारा बनवाया।" | Member | `export.retried` |
| Ready | "The card for revision {n} is ready." | "संस्करण {n} का कार्ड तैयार है।" | `system`, "Jashn" | `export.succeeded` |

- `{run}` is the first 8 characters of the NudgeBee execution id.
- `{approver}` is NudgeBee's approver string, cut at "@" when it is an email.
- The retried lines drop domain-and-data's `{result}`, because the worker's own entry reports the result (domain change 12).
- A drill produces four entries in order: requested, failed, retried, ready.

### 2.5 Failure codes

| Code | When | Message (NudgeBee and the panel) | `{reason}` in activity, en / hi draft |
|---|---|---|---|
| `DRILL_INJECTED` | Attempt 1 of a job with `fail_injection` `once` | Injected fault (deliberate): renderer timeout | renderer timeout / रेंडरर टाइमआउट |
| `RENDER_TIMEOUT` | The 45 s cap | The render took longer than 45 s | the render took too long / कार्ड बनने में बहुत देर लगी |
| `FONT_NOT_LOADED` | Guard step 3 | Web fonts did not load: {faces} | the fonts did not load / फ़ॉन्ट लोड नहीं हुए |
| `RENDER_FAILED` | Browser launch, render page status, photo, layout overflow, anything else | A short cause: "browser launch failed", "render page returned 404", "photo not loaded", "layout overflow" | the renderer failed / रेंडरर नहीं चल पाया |
| `UPLOAD_FAILED` | Storage upload, or a size mismatch after the upload | Could not save the card file | the file could not be saved / फ़ाइल सेव नहीं हो पाई |
| `LEASE_EXPIRED` | Lazy: `rendering` past its lease | The render stopped without reporting back | the render stopped / रेंडर बीच में रुक गया |
| `NOT_STARTED` | Lazy: `queued` for over 60 s | The render never started | the render never started / रेंडर शुरू नहीं हुआ |

Messages never contain URLs, tokens, file paths or stack traces. They go to NudgeBee, whose outputs are not masked.

### 2.6 Storage path and signed URLs

- **Where cards live:** bucket `exports` (private, no Storage policies; PNG up to 10 MB, plus PDF only if it ships). The object is `{wedding_id}/card-rev{revision}.png`, the key domain-and-data §5.5 and architecture §3.6 use.
- **What the job stores:**
  - `artifact_path` holds that path, never a URL;
  - `artifact_id` is the file name (`card-rev3.png`);
  - plus `artifact_sha256`, `artifact_bytes` and `artifact_created_at`.
- **Upload:** an upsert with the content type, then a size check against the rendered bytes. A mismatch is `UPLOAD_FAILED`. Lane D's worker owns both steps, through the Storage adapter Lane A ships by 11:40 at the latest, merged ahead of Lane D in that batch (the `exports` write and the signed download; decisions D41 and D102).
- **Downloads:**
  - `export_job_status` returns `download_url` for a succeeded job, signed for 10 minutes with the download name `jashn-card-rev{n}.png` (domain-and-data §4.8, architecture §3.6). Owners and managers only.
  - The panel thumbnail uses the same URL: an image tag ignores the attachment header.
  - A link left open for more than 10 minutes expires; reloading the page signs a new one.
  - A card never streams through a function.
- **What NudgeBee gets:** only `artifact_id`, `sha256`, `bytes` and `created_at`. Never a URL, path or token.
- **Reset:** `reset_demo` keeps Storage files. The next export of the same revision overwrites the same object.
- **The seeded REV-2 card.** JOB-EXP-R2-PNG needs a real file at `{demo wedding id}/card-rev2.png`.
  - At about 12:00, Lane D renders it from a Banyan Hall variant of the probe fixture and commits it as `scripts/seed-assets/card-rev2.png`. This one file is a lead-granted exception to Lane A's ownership of `scripts/` (decision D15).
  - A real `request_card_export` can't make it: D0's seeded JOB-EXP-R2-PNG already holds that `export_key` (`export:{wedding_id}:rev2:png`), so the command answers "unchanged" and renders nothing.
  - Lane A's seed uploads the file when it is present. Until then, JOB-EXP-R2-PNG is seeded as Ready without a file, and rehearsals before 13:45 skip its download.
  - The row keeps demo-data's fictional completion time (24 Nov 21:05).

### 2.7 What the owner sees

The exports panel sits on the invite page (`/w/{wedding_id}/invite`). It is built from `export_job_status` (domain-and-data §4.8) and refreshed by the version poll. Lane D implements that read model in `src/server/jobs/`, because its computed fields (stalled, can_retry, card_summary) are job logic; Lane A's read-model index re-exports it (decision D16).

| Situation | Status | Detail line | Buttons |
|---|---|---|---|
| No card for the latest revision | – | "No card yet for revision 3." | Export card |
| Queued | Queued | "Started by Mira at 1:41 pm." | – |
| Rendering, attempt 1 | Rendering | "Making the card. This takes a few seconds." | – |
| Failed, NudgeBee notified | Failed, plus a "Deliberate drill" chip for a drill | "Renderer timeout, 1:42 pm. Sent to NudgeBee for recovery. The retry waits for an operator's approval." | Retry here (owner) |
| Failed, NudgeBee not notified | Failed | "{Reason}, 1:42 pm. NudgeBee was not notified." | Retry here (owner) |
| Failed, 45 minutes after notifying | Failed | "No approval came within 45 minutes." | Retry here (owner) |
| Stalled (computed, nothing written) | Rendering | "This render stopped responding." | Retry here (owner) |
| Retrying (attempt 2 or later, queued or rendering) | Retrying | "Approved by lead in NudgeBee run 019e8cde." or "Started by Mira." | – |
| Ready | Ready | "Ready at 1:43 pm, attempt 2 of 3." The thumbnail shows | Download card |
| Failed 3 times | Failed | "Failed 3 times. Export again after the next publish." | – |
| A card for an older revision | Out of date | "Out of date. Export a new card." (P9; acceptance AT-3.4 checks this wording), then "Made 24 Nov for revision 2. The reception venue has changed since." The reason comes from the newer revision's `changes` list | Download (secondary); Export a new card (primary, when no job exists for the latest revision) |

**Below the status, the attempts list,** one line per attempt. For example:
- "Attempt 1 failed at 1:42 pm: renderer timeout (deliberate drill). Started by Mira."
- "Attempt 2 ready at 1:43 pm. NudgeBee run 019e8cde, approved by lead."

A line names the fallback renderer when `renderer` is `og`.

**Manager view:** the same, but without Retry. The failed state adds "The owner or NudgeBee can retry."

**Copy rules:** sentence case, no exclamation marks, no arrows on buttons, times in IST as "1:42 pm".

**Voice:** I-02 "Naya card export karo." runs `request_card_export` exactly like the button. Lane C ships it, and E-05 (publish by voice, through Lane D's reusable `PublishSheet`), in the 12:30 batch (decision D59). The reply after commit follows voice-test-set I-02. Voice never arms a drill. An armed drill applies to any new job on the named wedding, whatever started it.

### 2.8 The failure webhook

- **When:** after the commit that first moves a job to `failed` (`notified_at` empty). That is either from the worker, or from a lazy failure found by a member's request.
  - Never when an ops route found the lazy failure: NudgeBee is already involved.
  - Never for later failures of the same job: at most once per job.
- **How:**
  - A POST to `NUDGEBEE_EXPORT_WEBHOOK_URL` with the JSON in 5.5, a 5 s timeout and no retry.
  - `notified_at` is set only on a 2xx answer.
  - The URL carries NudgeBee's token, so it is never logged.
- **If unset:** nothing is sent and the panel says "NudgeBee was not notified".

---

## 3. Rendering on Vercel

### 3.1 Packages

- **Versions:** puppeteer-core **25.11.0** and @sparticuz/chromium **153.0.0**, exact. Not 25.18.1 or 158.0.0 (architecture §1.1).
- **Install:** the lead installs them in the scaffold (architecture §7.2); no session runs npm install.
- **Imports:** they are imported only from `src/server/export/`, by dynamic import, and only by the `/run` route.
- **next.config (lead, only if the probe needs it):**
  - nothing to add for bundling: Next 16.4.6 already has both packages on its default server-external list (research-stack §7, item 9);
  - add a file-tracing include for the `/run` route covering the Chromium package's `bin` folder, only if the probe reports a missing file (research-stack §14 lists this as unknown).

### 3.2 Which route renders what

| Route | Called by | Auth | `maxDuration` | What it does | Chromium |
|---|---|---|---|---|---|
| `POST /api/w/{wedding_id}/exports` | Exports panel: Export card | Member session, owner or manager | 30 s | Runs `request_card_export` through the dispatcher and returns its envelope (5.6). The kick runs after commit | No |
| `POST /api/w/{wedding_id}/exports/{job_id}/retry` | Exports panel: Retry here | Member session, owner only | 30 s | Runs `retry_card_export` as the owner with `wait` 0, then the kick | No |
| `GET /api/ops/export-jobs/{job_id}` | NudgeBee | Bearer `JOBS_API_TOKEN` | 15 s | Job status (5.2) | No |
| `POST /api/ops/export-jobs/{job_id}/retry` | NudgeBee | Bearer | 60 s | Retry (5.3). It waits by reading the job row every 500 ms | No |
| `POST /api/ops/export-jobs/{job_id}/run` | Jashn's own after-commit kick; the team, with job id `probe` | Bearer | 120 s | Claims and renders (3.3). `probe` renders the sample card and returns the PNG | **Yes, the only route** |
| `/render/card/{job_id}` | Chromium | Render token | 30 s | The card page (1.6) | No; it is the page |

- **Any transport can request a card.** The voice confirm route and the generic command route can also run `request_card_export`, because the dispatcher's after-commit kick starts the worker. No route but `/run` imports Chromium. Architecture §3.3 and §9 item 9 say the same: no transport refuses an export command.
- **The kick:** a POST to `{base}/api/ops/export-jobs/{job_id}/run` with the bearer token.
  - Lane D adds it once to the after-commit map, a static export in `src/server/jobs/after-commit.ts` that the contracts PR ships empty, in `lane-d-export-jobs` at 11:40. The types (`AfterCommitHandler` and the map type) are in `src/contracts/services.ts`. Lane A's dispatcher imports the map statically and runs the committed command's entry in `after()`; nothing registers itself by an import side effect (decisions D53 and D101).
  - Ordinary command responses send it in `after()`. It waits up to 5 s for the answer and logs a failure.
  - The ops retry route is the exception: it starts `/run` itself, fire-and-forget, before its wait loop (5.3 step 7).
  - A lost kick is recovered by the 60 s `NOT_STARTED` expiry: the job becomes `failed` and retryable.

### 3.3 The worker, step by step (`/run` for job J)

1. **Check the token.** Otherwise 401. The probe PR uses a temporary bearer check inside Lane D's own path. Lane A's system verifier merges by 11:40 at the latest, ahead of Lane D in that batch, so the temporary check lives until then; Lane D then switches `/run`, the GET and the retry to it and deletes the temporary check (decisions D58 and D102).
2. **`probe`:** skip to step 6 with the built-in sample card, plus the test strings. The sample card is the demo wedding's names and Hindi lines with the reception at Lotus Hall, kept as a small fixture in `src/server/export/`. No database and no upload. Answer with the PNG and the timing headers (3.4).
3. **Claim.**
   - Compare-and-set `queued` to `rendering`, with `attempts` + 1 and a 2-minute lease.
   - Read `card_renderer` once, through environment flags, and record it on the attempt row.
   - Move the version.
   - If the job wasn't `queued`, answer 200 with `started` "false" and the current status, and stop.
4. **The drill.** If `fail_injection` is `once`:
   - set it to `consumed`;
   - fail the attempt at once with `DRILL_INJECTED`, before any browser starts;
   - answer 200 with status `failed`.
5. **Answer 202** with `started` "true" and the attempt number, then continue in `after()`, bounded by `maxDuration`.
6. **Take the render slot.** Wait for this instance's slot (one render at a time), then start the 45 s cap.
7. **Get the browser.** The instance launches it once:
   - headless shell mode, the package's recommended arguments, graphics off;
   - locally, the Chrome at `CHROME_EXECUTABLE_PATH`.

   A launch failure is `RENDER_FAILED` "browser launch failed". It clears the stored browser so the next attempt relaunches.
8. **Open the page.**
   - A new page with a 1080 × 1350 viewport at scale 1.
   - Open `{base}/render/card/{J}?t=…`. The base is `https://` plus `VERCEL_PROJECT_PRODUCTION_URL` in production, and `APP_BASE_URL` locally.
   - Any status other than 200 is `RENDER_FAILED`.
9. **Run the readiness guard** (1.5).
10. **Capture** the PNG (or print the PDF). Close the page and keep the browser.
11. **Re-check the claim.** If it was lost, stop and upload nothing.
12. **Upload** by upsert, check the size, and hash the bytes.
13. **Commit,** on the claim condition: success (artifact fields, attempt, activity, version) or failure (code, attempt, activity, version). After a first failure, send the webhook.
14. **Log** one line: job id, attempt, status, error code, renderer, NudgeBee run id, and the durations of launch, navigation, fonts, capture and upload. Never the token, the render token, the webhook URL or a signed URL.

With `card_renderer` = `og`, steps 7–10 are replaced by building the image in memory (3.7).

### 3.4 Time, memory and cold start

| Limit (Vercel Hobby, Fluid compute) | Value | How the card fits |
|---|---|---|
| Memory and CPU | 2 GB, 1 vCPU, fixed | Sparticuz asks for at least 1600 MB; one page at a time stays under it |
| Duration | 300 s maximum | `/run` 120 s; render cap 45 s |
| Bundle | 250 MB uncompressed | Chromium (about 70 MB, research-stack §4) sits in `/run` only |
| Bodies | 4.5 MB | The probe PNG is at most about 1.5 MB; downloads never pass through a function |
| `/tmp` | Per instance | Chromium unpacks there once per instance |
| Concurrency | Fluid runs several requests in one instance | A render slot plus a single launch per instance |
| Runtime logs | 1 hour | Evidence lives in tables and in NudgeBee (6.6) |

**Cold start** is unmeasured in `bom1`, and the probe measures it (P1 at 10:40, 3.6). The budget, from the claim to Ready:

| Part | Budget |
|---|---|
| Function start | about 1 s |
| Chromium unpack and launch | 2–5 s |
| Render page cold start | 1–3 s |
| Fonts and photo | about 1 s |
| Capture and upload | about 1 s |
| **Target** | 5 s or less warm, 15 s or less cold |

The probe answers with these headers:
- `X-Render-Launch-Ms`;
- `X-Render-Navigate-Ms`;
- `X-Render-Fonts-Ms`;
- `X-Render-Capture-Ms`;
- `X-Render-Total-Ms`;
- `X-Render-Instance` (`cold` or `warm`).

**Warm-up,** 5 minutes before any live or recorded take: run the probe twice, then one full drill on D's rehearsal copy. The probe is the same route and function as real renders, so it warms the right instance.

### 3.5 Local development

- **D's worktree** (`~/Desktop/Personal/jashn-d`, port 3004) runs the same code with two settings:
  - `CHROME_EXECUTABLE_PATH` points at the local Chrome binary;
  - `APP_BASE_URL` is `http://localhost:3004`.
- **Local Chrome hides missing web fonts.** The guard (1.5) catches it.
- **Before the 11:40 batch,** NudgeBee can reach a cloudflared quick tunnel to port 3004 (architecture §6.6). Point the Config `jashn_base_url` at it for the 11:15 authenticated read against a real Jashn job (decision D43), then back to production.
- **Linux Chromium can only be tested on production,** hence the out-of-batch probe merge at about 10:30.

### 3.6 The 10:30 probe and the 12:15 gate

**The probe PR** comes from `lane-d-render-probe`, out of batch: PR open by 10:25, merged about 10:30, P1 measured at 10:40. It holds three things:
- the render page, with the `probe` fixture;
- the Chromium module;
- `/run` with the `probe` id.

**If there's no Ready production deploy** (decision D119): by 09:50, L tells Lane D the probe waits, and the user retries the import at 10:05. Still none by 10:40: the og renderer (3.7) becomes Lane D's top priority (D48), and L brings up the tunnel host (architecture §8 row 10).

**After the deploy** (P1, at 10:40), from the laptop:
- First check that `/api/health` serves the probe merge's commit SHA. The probe waits for that deployed SHA (decision D44).
- POST to `/api/ops/export-jobs/probe/run` with the bearer token read from an environment variable. Never type it into a chat or print it.
- Save the PNG and open it.

**The probe passes when:**
- the answer is 200, within 30 s cold and within 6 s on the second call;
- the PNG is 1080 × 1350;
- the Hindi heading, the Hindi line and the test strings shape like local Chrome;
- Eczar is visible in the names, and there are no boxes;
- the photo (or its placeholder) is present.

Write down the timing headers for architecture §10 question 5.

**If the 10:40 probe fails,** the og renderer (3.7) becomes Lane D's top priority, and Lane D verifies a real PNG from it (decision D48).

**The key signal, about 11:50** (decisions D41 and D107). After the 11:40 deploy, on production, on copy `d`, on Lane D's own pages:
1. Diya's `update_event` (reception to Lotus Hall) goes through `POST /api/w/[wedding_id]/commands/update_event`, signed in as `diya.d@example.com`.
2. Mira (`mira.d@example.com`) publishes through `PublishSheet` on Lane D's own Invite page, from `lane-d-publish`.
3. The export job's PNG downloads.

Lane B's Events screen isn't needed (B3 is 12:30). The card renders with or without the couple photo, so it passes either way.

**The 12:15 gate** (architecture §8 row 2):
- **Pass:** a real REV-3 PNG job has succeeded on production, on D's rehearsal copy, with both Hindi lines.
- **If the 11:40 batch slipped:** a passing probe with the REV-3 fixture counts at 12:15, and the real job must then pass by 12:45.
- **Fail:** the user (Flagsmith's one seat) sets `card_renderer` to `og` in Flagsmith Production. The og renderer is already deployed from the 11:40 batch, so no deploy is needed.

### 3.7 The 12:15 fallback to next/og

- **Ships dormant in the 11:40 batch,** whatever the probe says, with Chromium still selected (decision D48). Lane D rehearses the switch locally before that merge, so the 12:15 flip needs no deploy.
- **Trigger:** the 12:15 gate fails, or Hindi shapes wrongly on production.
- **Switch:** the user sets Flagsmith `card_renderer` = `og` in Production, with no deploy. The worker reads it at each claim and records it on the attempt.
- **What changes:**
  - The worker builds the image in memory with next/og's ImageResponse at 1080 × 1350.
  - Dynamic text is Latin only: names, English wording, function title, date, time, venue, reply line and footer.
  - The Hindi heading and Hindi line come from two transparent PNGs in `public/card/`, captured at 2× from the render page in local Chrome.
  - `title_hi` is omitted. If `heading_hi` or `wording_hi` differ from the defaults, that line is omitted too: never wrong Hindi.
  - Fonts: Eczar and Anek Latin TTF files, committed after 09:00 with their OFL licence, because Satori reads TTF, OTF or WOFF but not WOFF2.
  - The photo is fetched on the server and embedded.
- **What stays the same:** jobs, `export_key`, the drill, the ops routes, the webhook, the NudgeBee workflow and the panel.
- **Limits:** PNG only. The README marks "dynamic Hindi on the exported card" as Partial.

---

## 4. Demo failure injection (the drill)

### 4.1 Mechanism: the Flagsmith flag, scoped to one wedding

This is `flagsmith.md` §3.6's flag: it is read through environment flags, once, when `request_card_export` creates a job. This file adds one rule: the flag's value names the wedding.

| `export_failure_drill` in Flagsmith Production | Effect on a new job |
|---|---|
| Disabled (default) | None |
| Enabled, value empty, or a wedding id that isn't a sample wedding | None; the server logs "drill ignored" |
| Enabled, value = this wedding's id, and the wedding has `is_sample` | `fail_injection` `once` and `synthetic` true |

- **If Flagsmith is unreachable,** the flag falls back to off.
- **The env override:** `EXPORT_FAILURE_DRILL` (a wedding id, unset by default) is the only override. It needs a redeploy.

### 4.2 Why it is safe

- **Off by default,** and off when Flagsmith fails.
- **Narrow:** only sample weddings, only the named copy, and only new jobs. Existing jobs and cards never change.
- **One attempt only:** it fails attempt 1, before any browser starts. It is consumed in the same write as the claim, so the retry renders normally.
- **Nothing else can arm it:** no request field, header, voice phrase or ops call. Flags never decide authorisation (flagsmith §2.4).
- **Labelled everywhere:**
  - the panel chip "Deliberate drill";
  - the activity suffix;
  - `synthetic` "true" and the message "Injected fault (deliberate): renderer timeout" in NudgeBee.
- **Nothing guest-visible changes:** no publish and no guest page change.

### 4.3 Repeatability

Each drill needs a new job, and so a new `export_key`:
- **D's rehearsal copy,** for every practice run. Reset it to D0, which removes REV-3 and its job: Lane D runs `reset_demo` itself, as copy `d`'s owner (`checkpoint` d0, `confirm_text` RESET); the demo and `e2e` copies stay L's (D17, D120). Move the reception to Lotus Hall, publish REV-3 and export. That takes about a minute, by typing.
- **The demo copy:** only for the recorded take, or the live upgrade.
- **The reject-path test (NB-T12)** reuses its failed job: start a manual run with the job id.
- **Other lanes' copies and the Playwright copy** are never armed, because they aren't named.

### 4.4 Operating it

- **Recorded take:**
  1. In Flagsmith Production, set the value to the demo copy's wedding id (from the planner URL), then enable the flag.
  2. Export the card.
  3. Wait for "Failed" with the drill chip.
  4. Disable the flag and clear the value at once.
- **Live upgrade:** arm the flag in the pre-flight, because no other export happens before 2:30. Disarm it right after the run, together with `voice_writes_enabled`.
- **Every pre-flight:** check the flag's state (the pre-flight in 7.5).

---

## 5. The job HTTP contract NudgeBee calls

### 5.1 Rules for every ops route

- **Base URL:** `https://<production domain>` (NudgeBee Config `jashn_base_url`).
  - The exact https URL, with no trailing slash and no redirects: a 301 or 302 can turn the POST into a GET.
  - Never a `VERCEL_URL` deployment URL; those are protected.
- **Auth:** `Authorization: Bearer <JOBS_API_TOKEN>`.
  - Compared in constant time: hash both values, then compare the digests.
  - If the token is unset in the environment, every call gets 401 and a server log line.
  - The token is never echoed or logged.
- **Responses:** JSON with `Cache-Control: no-store` and no CORS headers. The proxy skips `/api/ops/*`, and no Vercel challenge mode applies there.
- **Strings rule:**
  - Every scalar is a string (`"3"`, `"true"`), and nothing is null.
  - Absent values are empty strings, and the objects `artifact`, `last_error` and `last_recovery` are always present.
  - Why: NudgeBee's template rendering of numbers, booleans and nulls is unverified (U4).
- **Status codes:**

  | Status | When |
  |---|---|
  | 200 | Every business state |
  | 400 `validation_failed` | Malformed request. The ops routes use 400 where the dispatcher's own envelope uses 422 (domain-and-data §3.0); section 11 item 10 records the difference |
  | 401 `unauthenticated` | Bad or missing token |
  | 404 `not_found` | Unknown job; a job id that isn't a UUID gets the same body |
  | 409 `idempotency_key_reused` | The same key with a different request |
  | 412 `expectation_failed` | Only when the caller asks with `expect` |
  | 500 | Real server faults |

  The error body is domain-and-data's `{"ok": false, "error": {"code", "message", "field", "current"}}`, with the strings rule.
- **The reserved id `probe`** is accepted only by `/run`. The GET and the retry answer 404 for it, like any unknown id.

### 5.2 GET job status

`GET /api/ops/export-jobs/{job_id}`. Optional query:
- `wait`, 0–10 s: while the job is `queued` or `rendering`, hold the answer until it settles or the wait ends;
- `expect=succeeded`: after the wait, answer 412 if the job hasn't succeeded.

It runs the lazy expiry first, without sending the webhook.

| Field | Meaning |
|---|---|
| `job_id`, `job_label` | UUID, and JOB-EXP-R3-PNG |
| `export_key`, `wedding_id`, `revision`, `format` | Identity |
| `latest_revision` | The wedding's published revision now |
| `status` | `queued`, `rendering`, `succeeded` or `failed` |
| `retryable` | "true" only when the job is failed, `attempts` < `max_attempts`, and `revision` = `latest_revision` |
| `attempts`, `max_attempts` | Attempts started; 3 |
| `synthetic` | "true" for a drill job |
| `last_error` | `code`, `message`, `at` |
| `artifact` | `artifact_id`, `sha256`, `bytes`, `created_at` |
| `last_recovery` | `nudgebee_execution_id`, `approver`, `attempt` of the latest NudgeBee-triggered attempt |
| `card_summary` | One line for the approval message |
| `updated_at` | ISO time, UTC |

Failed, after the drill:

```json
{
  "job_id": "5b1e0c2a-7d3f-4c1e-9a52-0f6c2d8e4b17", "job_label": "JOB-EXP-R3-PNG",
  "export_key": "export:0b7c4e2d-…:rev3:png", "wedding_id": "0b7c4e2d-…",
  "revision": "3", "latest_revision": "3", "format": "png",
  "status": "failed", "retryable": "true", "attempts": "1", "max_attempts": "3",
  "synthetic": "true",
  "last_error": { "code": "DRILL_INJECTED", "message": "Injected fault (deliberate): renderer timeout",
                  "at": "2026-11-25T08:12:07Z" },
  "artifact": { "artifact_id": "", "sha256": "", "bytes": "", "created_at": "" },
  "last_recovery": { "nudgebee_execution_id": "", "approver": "", "attempt": "" },
  "card_summary": "Mira & Kabir, Reception, Monday, 14 December 2026, Lotus Hall",
  "updated_at": "2026-11-25T08:12:07Z"
}
```

Succeeded, after the recovery (identity fields as above):

```json
{
  "job_id": "5b1e0c2a-…", "job_label": "JOB-EXP-R3-PNG", "export_key": "export:0b7c4e2d-…:rev3:png",
  "revision": "3", "latest_revision": "3", "format": "png",
  "status": "succeeded", "retryable": "false", "attempts": "2", "max_attempts": "3",
  "synthetic": "true",
  "last_error": { "code": "DRILL_INJECTED", "message": "Injected fault (deliberate): renderer timeout",
                  "at": "2026-11-25T08:12:07Z" },
  "artifact": { "artifact_id": "card-rev3.png", "sha256": "9f2c1a7e…", "bytes": "412377",
                "created_at": "2026-11-25T08:13:02Z" },
  "last_recovery": { "nudgebee_execution_id": "019e8cde-…", "approver": "lead", "attempt": "2" },
  "card_summary": "Mira & Kabir, Reception, Monday, 14 December 2026, Lotus Hall",
  "updated_at": "2026-11-25T08:13:02Z"
}
```

### 5.3 POST retry

`POST /api/ops/export-jobs/{job_id}/retry?wait=20`

**Headers:**
- `Authorization: Bearer …`;
- `Content-Type: application/json`;
- `Idempotency-Key`: required, 8–200 printable ASCII characters. NudgeBee sends `nb-{execution_id}-{job_id}`.

**Body.** `expected_export_key` is required. The `nudgebee` fields are optional strings of up to 100 characters, stored on the attempt.

```json
{
  "expected_export_key": "export:0b7c4e2d-…:rev3:png",
  "nudgebee": {
    "workflow_id": "3c9d…",
    "execution_id": "019e8cde-…",
    "approver": "lead"
  }
}
```

**Processing order:**
1. Check the token. Otherwise 401.
2. Validate the request. Otherwise 400 `validation_failed`, naming `idempotency_key` or `body`. The checks:
   - `Idempotency-Key` is present and well formed;
   - the body is JSON with `expected_export_key`.
3. The job exists. Otherwise 404. A job id that isn't a UUID gets this same 404, never a 400 (5.1, EX-11).
4. Look up the receipt for this key, as a fast path. The same request replays (go to step 8); a different request is 409.
5. In one transaction:
   1. lock the job row;
   2. re-check the receipt, because a concurrent twin with the same key waits here and then replays;
   3. run the lazy expiry;
   4. evaluate the outcome table below;
   5. for `retried`: compare-and-set `failed` to `queued`, insert attempt N+1 (trigger `nudgebee`, the key, workflow and execution ids, approver), write the activity entry and move the version;
   6. write the receipt for every outcome.
6. Commit.
7. For `retried`: start `/run` at once with a fire-and-forget request, before step 8 begins (decision D53). A kick left to `after()` would only run once the response had gone, so the wait would end before the worker started. The dispatcher's `after()` kick from the after-commit map (D101) that follows is harmless: the claim is a compare-and-set, so that call answers `started` "false".
8. While the job is `queued` or `rendering`, wait up to `wait` seconds, reading the row every 500 ms.
9. Answer 200 with the retry shape. `status`, `retryable` and `artifact` are read fresh.

**Outcomes:**

| Job state (after the lazy expiry) | Action | `outcome` | `status` in the answer |
|---|---|---|---|
| This key was seen with the same request | None: replay | The stored outcome, with `replayed` "true" | Current, after the wait |
| `succeeded` | None | `already_succeeded` | `succeeded`, same artifact |
| `queued`, or `rendering` within its lease | None | `in_progress` | Current, after the wait |
| `expected_export_key` differs, or `revision` < `latest_revision` | None | `stale_revision` | Unchanged |
| `failed` with `attempts` ≥ 3 | None | `not_retryable` | `failed` |
| `failed` and retryable | Claim, new attempt, kick, wait | `retried` | `succeeded`, `failed` with a new error, or `queued`/`rendering` if the wait ran out |

The first call, `retried`:

```json
{
  "job_id": "5b1e0c2a-…", "export_key": "export:0b7c4e2d-…:rev3:png",
  "outcome": "retried", "replayed": "false", "attempt": "2",
  "status": "succeeded", "retryable": "false", "revision": "3", "latest_revision": "3",
  "artifact": { "artifact_id": "card-rev3.png", "sha256": "9f2c1a7e…", "bytes": "412377" },
  "idempotency_key": "nb-019e8cde-…-5b1e0c2a-…"
}
```

The same key and body sent again: a replay that starts nothing.

```json
{
  "job_id": "5b1e0c2a-…", "export_key": "export:0b7c4e2d-…:rev3:png",
  "outcome": "retried", "replayed": "true", "attempt": "2",
  "status": "succeeded", "retryable": "false", "revision": "3", "latest_revision": "3",
  "artifact": { "artifact_id": "card-rev3.png", "sha256": "9f2c1a7e…", "bytes": "412377" },
  "idempotency_key": "nb-019e8cde-…-5b1e0c2a-…"
}
```

A new run, so a new key, after success: nothing is re-rendered.

```json
{
  "job_id": "5b1e0c2a-…", "export_key": "export:0b7c4e2d-…:rev3:png",
  "outcome": "already_succeeded", "replayed": "false", "attempt": "2",
  "status": "succeeded", "retryable": "false", "revision": "3", "latest_revision": "3",
  "artifact": { "artifact_id": "card-rev3.png", "sha256": "9f2c1a7e…", "bytes": "412377" },
  "idempotency_key": "nb-02a4f7b1-…-5b1e0c2a-…"
}
```

A replay keeps the stored `outcome` and `attempt` (what that request did) and reports the job as it is now. It never claims, so it can never make a second card.

### 5.4 Errors

A missing or wrong token (401). Nothing is written, and the token is never echoed.

```json
{ "ok": false,
  "error": { "code": "unauthenticated", "message": "Missing or invalid bearer token.",
             "field": "", "current": {} } }
```

A missing `Idempotency-Key` (400). Nothing is written.

```json
{ "ok": false,
  "error": { "code": "validation_failed", "message": "Idempotency-Key header is required (8 to 200 characters).",
             "field": "idempotency_key", "current": {} } }
```

The verify call, `?wait=10&expect=succeeded`, while the render hasn't finished (412). This fails NudgeBee's step honestly.

```json
{ "ok": false,
  "error": { "code": "expectation_failed", "message": "Job is rendering; expected succeeded.",
             "field": "expect", "current": { "status": "rendering", "attempts": "2" } } }
```

The same key with a different job or body gets 409 `idempotency_key_reused`, with the same body shape.

### 5.5 The failure webhook and the manual input

Jashn to NudgeBee, a POST to `NUDGEBEE_EXPORT_WEBHOOK_URL`. NudgeBee uses only `job_id` from it.

```json
{
  "type": "invitation_export.failed",
  "job_id": "5b1e0c2a-7d3f-4c1e-9a52-0f6c2d8e4b17",
  "export_key": "export:0b7c4e2d-…:rev3:png",
  "error_code": "DRILL_INJECTED",
  "failed_at": "2026-11-25T08:12:07Z",
  "synthetic": "true"
}
```

The manual trigger's input: `{"job_id": "5b1e0c2a-7d3f-4c1e-9a52-0f6c2d8e4b17"}`.

### 5.6 The member route the panel calls

These are member routes, so they use normal JSON types; the strings rule is for ops routes only. `POST /api/w/{wedding_id}/exports` takes domain-and-data's request envelope.

```json
{
  "wedding_id": "0b7c4e2d-…",
  "command": "request_card_export",
  "input": { "format": "png" },
  "idempotency_key": "e3a1f0c4-…",
  "source": "ui"
}
```

The answer is the dispatcher envelope, with the member view of the job as `result`:

```json
{
  "ok": true, "outcome": "applied", "command": "request_card_export",
  "result": { "job_id": "5b1e0c2a-…", "job_label": "JOB-EXP-R3-PNG", "revision": 3, "format": "png",
              "status": "queued", "label": "Queued", "synthetic": true, "attempts": 0,
              "max_attempts": 3,
              "card_summary": "Mira & Kabir, Reception, Monday, 14 December 2026, Lotus Hall" },
  "activity_entry_id": "c9a0…", "version": 1051, "warnings": []
}
```

The owner's Retry is `POST /api/w/{wedding_id}/exports/{job_id}/retry`, with an idempotency key made per press (architecture §9 item 9) and the same envelope carrying `"command": "retry_card_export"`. The server fills `expected_export_key` and uses `wait` 0; the panel follows the poll. A manager gets 403 `forbidden`.

---

## 6. The NudgeBee workflow

### 6.1 Objects to create (12:15–13:00, browser only, by the NudgeBee operator)

**The NudgeBee operator** is whoever can sign in to the user's NudgeBee account: the invited teammate, otherwise the user (decision D72). The operator runs the checks T1–T9 (6.7), builds `card-export-recovery` (10:00–11:00, against httpbin stand-ins; 10:05–11:00 during the keynote if the operator is the user, after any unfinished Flagsmith steps A–E and T1, T2 and T4, following 6.1–6.4 click by click; D119), joins Lane D for the 11:15 tunnel read, and creates the production objects at 12:15–13:00. The Config and the Secret exist before the 11:15 read: the user pastes the Secret's value by 11:10, whoever operates the rest of NudgeBee (decision D117).

| Object | Where in NudgeBee | Name | Setting |
|---|---|---|---|
| K8s account | Admin → Integrations → Kubernetes Clusters | `jashn-kind` (Non-production) | Exists from tonight. The agent connects only if T2 fails |
| Config | Configs | `jashn_base_url` | `https://<production domain>`, no trailing slash. The tunnel URL only for the 11:15 tunnel read |
| Secret | Configs, type Secret | `jashn_ops_token` | The `JOBS_API_TOKEN` value. The user pastes it by 11:10, from their password manager or by copying it from `.env.local` in an editor. Nobody sends it through chat, Notion or a terminal (D117) |
| Automation webhook | Admin → Integrations → Webhooks | `jashn_export_failed` | Its URL becomes Vercel's `NUDGEBEE_EXPORT_WEBHOOK_URL` (Production), plus D's `.env.local` for the dry run |
| Workflow | Automations | `card-export-recovery` | Manual and webhook triggers; Automation Timeout 60 min; Retries 0 (override the pre-filled 3, so each step's own policy applies) |
| Repo copy | `ops/nudgebee/card-export-recovery.yaml` | – | Exported once the workflow works (workflow-as-code), with no secrets. Written after 09:00 |

Scope the Config and Secret to `jashn-kind` or to the tenant, whichever the workflow's account picker accepts.

### 6.2 Triggers: both

- **Webhook (primary).**
  - Jashn posts the failure within a second, and the run starts with no human noticing first.
  - Filter: the payload's `type` equals `invitation_export.failed`. The filter key name is unverified (U5); if it fights back, drop the filter.
  - The run takes only `job_id` from the body.
  - Security: a forged webhook can at most make NudgeBee read a job and ask a human, because the base URL and token come from NudgeBee's own Config and Secret.
- **Manual.**
  - Input `job_id`.
  - Used when the webhook fails (fallback ladder step 1), for the reject-path test, and for a second run on a job that has already notified (the webhook fires at most once per job).
- **Webhook runs act as the automation's owner** (the account of the operator who built it). Triggers always run the published version that is marked live, never the draft (research-nudgebee F27, F36). After every edit: publish, then make that version live, then test.

### 6.3 Steps

| # | Task id | Type | Runs when | What it does | Timeout and failure policy |
|---|---|---|---|---|---|
| 1 | `resolve_job` | Print | Always | Prints the job id: the manual input `job_id`, else the webhook body's `job_id` | Default |
| 2 | `read_status` | HTTP GET, bearer = Secret `jashn_ops_token` | After 1 | GET `{jashn_base_url}/api/ops/export-jobs/{job id}` | 20 s; 3 attempts, 2 s apart (a GET is safe to repeat) |
| 3 | `nothing_to_retry` | Print | Step 2's `status` isn't `failed`, or `retryable` isn't "true" | "Nothing to retry: {job_label} is {status} after {attempts} attempts. Artifact {artifact_id}." | Default |
| 4 | `approve_retry` | Approval, `in_app` | Step 2's `status` is `failed` and `retryable` is "true" | Shows the message in 6.4; options `approve` and `reject` | **45 min**; 1 attempt |
| 5 | `retry_export` | HTTP POST, bearer | Step 4's status is `approve` | POST `…/retry?wait=20` with `Idempotency-Key` `nb-{workflow_execution_id}-{job_id}`. Body: `expected_export_key` from step 2, then `workflow_id`, `execution_id` and `approver` from the run and step 4 | 30 s, the documented default (F15); `wait=20` leaves 10 s of margin. 2 attempts, 5 s apart. A resend reuses the key and replays |
| 6 | `verify` | HTTP GET, bearer | After 5 | GET `…?wait=10&expect=succeeded`. A 412 fails the step, and so the run, if no card exists | 20 s; 2 attempts, 3 s apart |
| 7 | `replay_check` | HTTP POST, bearer | After 6 | Sends step 5's request again, with the same key and body, to prove the replay in the run record | 30 s; 1 attempt |
| 8 | `verdict` | Print | After 7 | "Card {artifact_id} ready (sha256 {first 12}). Retry {outcome}; resend replayed {replayed}; one card for {export_key}. No publish, guest page, RSVP or ledger change." | Default |
| 9 | `rejected` | Print | Step 4's status is `reject` | "Rejected by {approver}. The job stays failed; nothing was re-rendered." | Default |

**Notes on the steps:**
- **Branching:** conditions on the tasks, or one Switch after step 2. Skipped tasks skip their dependents, so a non-failed job never reaches the approval.
- **Optional `ai_note`** (`llm.summary`, before step 4). A two-sentence summary for the approver, put into the approval message. Add it only if a test run shows it finishes in under 5 s and a failure there can't fail the run (U6). It never decides anything.
- **Optional `events.store`,** with `finding_id` = `{job_id}:{attempt}`. Only if time is left after 13:30.
- **Never click Retry on a run that is waiting at an approval** (U17).

### 6.4 The approval message

Every value comes from step 2's body:

> Retry the invitation card export?
> Job: {job_label} ({job_id})
> Card: {card_summary}
> Revision {revision}, {format}. Key {export_key}
> Status: {status} after {attempts} of {max_attempts} attempts
> Last error: {last_error.code}: {last_error.message}
> Deliberate drill: {synthetic}
> If you approve: Jashn re-renders this one card. Nothing is published, and the guest page, RSVPs and the ledger do not change.
> If you reject: nothing happens, and the job stays failed.
> This request expires 45 minutes after it was created.

- Any user on the team's NudgeBee tenant can approve; approvals have no per-step roles (F30). The tenant holds the user's account, plus the teammate's if the user invited them (D8).
- Fallback: `email` approval sent to the user (6.10; decision D121).

### 6.5 Timeouts

- The approval step uses its own 45-minute task timeout.
- The workflow allows 60 minutes.
- Without both, NudgeBee's 5-minute default fails a waiting approval (F30).
- The panel says "No approval came within 45 minutes" from `notified_at` alone.

### 6.6 What is logged, and where

| Where | What | How long |
|---|---|---|
| NudgeBee run | The trigger body or manual input; each task's inputs (secret masked) and outputs (**not masked**, so Jashn returns no secret, URL or path); approval status, approver and comment; timings; the run id | NudgeBee's retention (unknown): take screenshots |
| `export_attempts` | Per attempt: number, trigger, idempotency key, NudgeBee workflow and execution ids, approver, renderer, status, error code, start and finish | Until `reset_demo` removes a non-seeded job |
| `activity_entries` | Requested, failed, retried and ready, in English and Hindi | The same |
| `command_receipts` | Each retry request's stored answer, with no secrets | The same |
| Vercel runtime logs | One line per transition (3.3 step 14) and one per ops call: route, job id, outcome, NudgeBee run id, duration | 1 hour (Hobby) |
| Evidence pack | The V15 recording, three screenshots (failed, awaiting approval, completed), the run id, and the downloaded `card-rev3.png` | Kept locally, and shown in the video |

### 6.7 Account checks (teammate from 09:10, or the user at about 10:05; browser, about 25 minutes)

research-nudgebee's tests T1–T9 run in order, by the NudgeBee operator (6.1; decisions D8 and D72):
- **If the user has invited the teammate to the user's NudgeBee account:** the teammate runs T1, T2 and T4 first, at 09:10–09:28, then the rest, while the lead scaffolds.
- **Otherwise:** the user runs them from about 10:05, once the lanes have started, after any unfinished Flagsmith steps A–E (hard limit 10:30). The kind decision moves with them: about 10:20, later if the Flagsmith steps run late (decision D119).

| Test | What | Decides |
|---|---|---|
| T1 | Create Automation works, and `jashn-kind` is selectable | Access |
| **T2** | In `jashn-kind`, with **no agent connected**: manual trigger → HTTP GET to httpbin → Print the status code | **U1 for HTTP steps** |
| T3 | Bearer auth from a dummy Secret, masked in inputs | Secret handling |
| **T4** | `in_app` approval: approve once, reject once; write down what `approver` looks like | **U1 for approvals**; the approver format |
| T5 | HTTP 500 with 2 attempts fails the step | F16, F34 |
| T6 | Webhook trigger and filter, with a test payload | U5 |
| T7 | Templating: the `or` fallback, and how numbers render | U4 |
| T8 | Retry on a completed run gives a new execution id | F33 |
| T9 | Create from Code accepts a minimal definition | Workflow-as-code |

**The kind decision** (09:30 if the teammate ran the checks, otherwise about 10:20, moving with the user's checks):
- If T2 and T4 pass, Option A runs with no agent and no cluster.
- If either fails, the account needs a connected agent: go to 6.8 at once (architecture §8 row 6).
- Ask the remaining unknowns (U1, U2, U4–U8, U11, U12, U17) at the 11:10 NudgeBee sponsor demo.

### 6.8 Fallback: kind plus the agent (15–25 minutes)

**Before starting:**
- Docker Desktop must be running; tonight its daemon was not.
- In Docker Desktop's Settings → Resources, give it 8 GB of memory (10 GB if Option B stays possible) and 4–6 CPUs.
- Use the venue Wi-Fi, or the phone hotspot if outbound wss on port 443 is blocked.

It runs on the user's MacBook in three parts (decisions D8 and D119). L's Bash tool has no terminal the user can type into, and its shell state doesn't carry between calls, so the hidden prompt and the install belong to the user.

1. L runs Docker, `kind create cluster` and the download. Run at 09:00 or later (from the kind decision at 09:30 or about 10:20, and only if T2 or T4 failed):

```bash
open -a Docker
brew install kind && kind version
kind create cluster --name jashn-ops
kubectl cluster-info --context kind-jashn-ops
mkdir -p "$HOME/nudgebee-agent" && cd "$HOME/nudgebee-agent"
curl -fsSL https://raw.githubusercontent.com/nudgebee/k8s-agent/main/installation.sh -o installation.sh
```

2. The user, in a plain Terminal tab (as in build-kickoff step 0), pastes the agent key from the password manager at the hidden prompt, then runs the installer. Run at 09:00 or later:

```bash
cd "$HOME/nudgebee-agent"
read -s NB_AGENT_KEY
bash installation.sh -a "$NB_AGENT_KEY" -d true -t true -g true
```

3. L runs the kubectl checks. Run at 09:00 or later:

```bash
kubectl get pods -n nudgebee-agent
kubectl logs -n nudgebee-agent -l app=nudgebee-agent-runner --tail=50
```

**Pass:**
- `kind version` prints v0.33.0;
- the runner log shows "relay connected";
- `jashn-kind` shows Connected in NudgeBee.

Then rerun T2 and T4.

**Notes on the flags:**
- `-g true` is the minimal install, with no Prometheus.
- If Option B might follow, leave out `-g true` and answer yes to Prometheus and no to Loki.

**Helm 4 risk (U10).** This Mac has Helm 4.3.2, and NudgeBee documents Helm 3.x. If the installer fails on a Helm error, use a Helm 3 binary for this one install.

Run at 09:00 or later (only after a Helm error from the installer). L downloads the binary, replacing `3.X.Y` with the newest 3.x release on the Helm releases page:

```bash
mkdir -p "$HOME/helm3" && cd "$HOME/helm3"
curl -fsSLO "https://get.helm.sh/helm-v3.X.Y-darwin-arm64.tar.gz" && tar -xzf "helm-v3.X.Y-darwin-arm64.tar.gz"
```

Then the user reruns the installer in the same Terminal tab, where `NB_AGENT_KEY` is still set. Run at 09:00 or later:

```bash
cd "$HOME/nudgebee-agent" && PATH="$HOME/helm3/darwin-arm64:$PATH" bash installation.sh -a "$NB_AGENT_KEY" -d true -t true -g true
```

**Keeping it alive.** Once the agent is needed, it must stay connected through judging:
- Docker stays running;
- the laptop stays awake and on its charger.

Run at 09:00 or later (from the moment the agent is needed), in a spare terminal tab:

```bash
caffeinate -dims
```

### 6.9 Option B stretch: the CrashLoopBackOff template (gate at 13:30)

**Start at 13:30 only if all of these hold:**
- V15 is recorded;
- NB-T10 to NB-T12 pass;
- Lane D's Must items are merged;
- kind plus the agent are connected, or Docker is running and the install fits in 25 minutes.

**Hard stop at 14:30.** Nothing in Option A depends on it.

**What it shows:**
1. A stand-in worker, `invite-export-worker`, runs in namespace `jashn`. It holds about 150 MB under a 96Mi memory limit, so it is OOMKilled and goes into CrashLoopBackOff.
   - Choose an image with an arm64 build at 13:30.
   - It is a stand-in: the real export stays on Vercel.
2. NudgeBee's Troubleshoot view shows "OOM Killed", and NuBi's root-cause analysis cites exit 137 and the 96Mi limit.
3. The official template "K8s CrashLoopBackOff Remediation" runs with these edits:
   - approval switched to `in_app`;
   - the Slack steps deleted;
   - rightsize up, +100% with a 512Mi maximum.

   It runs manually with `namespace` `jashn`, `workload_name` `invite-export-worker` and the account id. The pod returns to Running at 192Mi.

**How it is shown:** only as a clip labelled "Experimental: NudgeBee diagnosing a stand-in worker in a local kind cluster". The deep analysis can take minutes (7m41s in NudgeBee's blog), so cut the wait.

### 6.10 Fallback ladder

| Order | Trigger | Then |
|---|---|---|
| 1 | The webhook hasn't started NB-T10's run by 12:50, after the 12:30 deploy (decision D121) | Start runs manually with the job id. Keep debugging the filter only until 13:00 |
| 2 | In-app approval unusable (T4 by 09:28, or at about 10:10 if the user runs the checks; or later) | `email` approval to the user (U7: the link may need a login; decision D121) |
| 3 | The authenticated status read against a real Jashn job fails (through the tunnel at 11:15, by 11:30; from production at about 11:50, after the 11:40 batch; decisions D13 and D43) | Lane D owns the fix: the exact https URL (no redirect, no challenge), the Secret and the response shape. A manual start doesn't help, because it calls the same URL with the same credential. Ask the sponsor's team at once. Keep the first successful run id |
| 4 | Retries through NudgeBee still fail **at 12:45** | The lead and the user choose the recording path at 12:45 (decision D43): record NudgeBee reading the failed job, then the user retrying in Jashn, then NudgeBee reading the completion, and label who retried. Disclose it in the README (architecture §8 row 8). 13:00–13:30 stays protected for V15 |
| 5 | No real run at all by 12:45 | The README says so. Demo the owner's Retry and the ops contract; no NudgeBee clip |

---

## 7. The demo

### 7.1 Mode

- **Recorded by default,** per demo-script §2 (2:30–2:50, at most 20 s): a 15 s clip of the real run plus 2 s of the card showing Lotus Hall, captioned "Recorded today, HH:MM", with the real recording time filled in at recording (decision D33). The run id is on screen in S5 and S6.
- **The live upgrade** (about 15 s live) is used only if both of these hold, decided by the lead at 14:30:
  - two rehearsals in a row (14:00–14:30, on the demo copy after a reset) take 15 s or less from the Export click to NudgeBee showing Completed, with the approval clicked within 3 s of appearing;
  - the new run shows in NudgeBee's Executions view without a manual reload, or the reload fits inside the 15 s.
- **The drill in live mode** stays a lead decision at 14:30 (decision D40). The default is the recorded NudgeBee beat, with the drill off in the live run (demo-data §13.2). Only if the live run completes in under 15 s in rehearsal does the live upgrade arm the drill, and the lead then says so on stage, as demo-script requires.

### 7.2 Recording V15 (13:00–13:30; retake 14:00–14:30 if needed; on the demo copy)

**Preparation (about 3 minutes):**
1. Reset the demo copy to D0.
2. By typing: as Diya, move the reception to Lotus Hall; as Mira, publish REV-3.
3. Run the warm-up (3.4).
4. Open the NudgeBee Executions view in a second tab.
5. Start the screen recorder at 1080p.
6. Arm the drill with the demo copy's id (4.4).

| Shot | Screen | Action | Judges see | Seconds in the cut |
|---|---|---|---|---|
| S1 | Jashn invite page, exports panel | Click Export card | Queued, then Failed with the "Deliberate drill" chip, the message and "Sent to NudgeBee" | 3 |
| S2 | NudgeBee Executions | Open the new webhook run | `resolve_job` and `read_status` green; `approve_retry` waiting | 2 |
| S3 | NudgeBee approval | Hold on the message | The card summary, and the "If you approve" and "If you reject" lines | 3 |
| S4 | NudgeBee approval | Click Approve, with the comment "Re-render the card only" | The approver recorded | 1 |
| S5 | NudgeBee run | Steps turn green | `retry_export`, `verify`, `replay_check` and `verdict`; the run id | 3 |
| S6 | Jashn | The panel shows Ready: "Attempt 2 ready… NudgeBee run 019e8cde, approved by lead". Open the card | `card-rev3.png` showing **Lotus Hall** | 3, plus 2 on the card |
| S7 (optional, not in the cut) | NudgeBee | Retry the finished run | It ends at `nothing_to_retry` | – |

**After the take:**
- Disarm the drill.
- Write down the run id and the time for the caption ("Recorded today, HH:MM").
- Take the three fallback screenshots: failed, awaiting approval, completed.
- Keep the downloaded `card-rev3.png`.
- The narration over the clip is demo-script's line, word for word: "We deliberately failed this card export once. NudgeBee read the job, waited for my approval, called our export-only retry and checked the result: one card, no duplicate publish, no ledger change. This is a recording of the real run; the ID is on screen."

### 7.3 The live upgrade, if chosen

REV-3 was published live at 1:18. The drill was armed in the pre-flight.

| Clock | Action (lead, laptop) | Line to say |
|---|---|---|
| 2:30 | Click Export card on the invite page | "Live now: I'll break this card export on purpose. It's labelled as a drill." |
| 2:33 | Switch to NudgeBee and open the run at the approval | "NudgeBee picked up the failure, read the job over HTTPS, and now it waits for a human." |
| 2:37 | Point at "If you approve…", then click Approve | "I approve the retry. It re-renders this one card and nothing else." |
| 2:40 | The steps turn green | "It verified the card, and a resend was replayed, not repeated. The same run ID is in Jashn." |
| 2:45 | Back to Jashn; open the card | "Lotus Hall. One card, no publish, no ledger change." |

If the run hasn't reached the approval by 2:38, play the V15 clip and say: "Here is the same run recorded earlier today."

### 7.4 Making the approval visible

A judge's NudgeBee post says human approval matters, so it gets screen time, not a blur:
- **The message says what will and won't change,** in plain words (6.4). It is held for 3 s in the clip and pointed at live.
- **The approver's name appears in three places:** NudgeBee's step output, Jashn's attempt line ("approved by lead") and the activity feed.
- **Rejecting is a real path,** with its own printed outcome (NB-T12), so approval is a decision, not a formality.

### 7.5 Pre-flight additions (demo-script §1.2)

**Recorded mode (default):**
- `export_failure_drill` is disabled, with an empty value;
- the clip is paused at 0:00, with the run id in the caption;
- the NudgeBee console tab is open on the real run, as a backup.

**Live upgrade:**
- the drill is enabled with the demo copy's id;
- the NudgeBee Executions tab is open;
- the warm-up was run 5 minutes before;
- if 6.8 was needed, the agent shows Connected.

**After every run:** disable the drill and reset the demo copy to D0 (demo-script's after-run step). Never replay the recorded run after a reset: its job is gone, and `read_status` answers 404.

### 7.6 Judge questions

1. **"Why does a re-render need a human?"**
   - "It's cheap, but it acts on what guests receive. The approval states exactly what changes and what can't, and the run records who approved."
   - "The same pattern will guard riskier recoveries, like re-sending invitations."
2. **"What if NudgeBee sends the retry twice?"**
   - "The same Idempotency-Key replays the first answer; you can see it in the run's `replay_check` step."
   - "A new run with a new key can only claim a failed job once, so there is still one card for revision 3."
3. **"Is the failure real?"** demo-script Q6:
   - "The fault is injected and labelled, from a Flagsmith flag scoped to the sample wedding, but the recovery is real."
   - "NudgeBee reads our job over HTTPS, waits for a human, and calls an export-only retry keyed by revision and format."

---

## 8. Tests

### 8.1 Unit and integration tests (vitest 5.1.1, in `src/server/jobs/`)

- **Pure tests** run in CI: the outcome table, the claim guards, `job_label`, the strings rule and the token check.
- **Database tests** run locally only, because CI has no database credentials.
  - They are named `*.db.test.ts`. The scaffold's `vitest.config.ts` excludes them unless `RUN_DB_TESTS=1`, so CI's `npm test` never runs them. Lane D runs `npm test` and `npm run test:db` before marking a PR ready (decision D103; architecture §6.3).
  - Each makes its own throwaway sample wedding in the shared Supabase project and deletes it afterwards.
  - The renderer is a stub that can succeed, fail, hang or upload.

| Id | Test | Passes when |
|---|---|---|
| EX-01 | **Retry repeated 3 times with one key** on a failed job | The first answer is `retried` and the next two replay (`replayed` "true", same `attempt` "2", same artifact). The job has 2 attempts; there is one object in the job's folder, one `export.retried` entry and one receipt |
| EX-02 | Three retries with **different** keys after success | Each answers `already_succeeded` with the same `artifact_id` and sha256. No attempt row, activity entry or version change |
| EX-03 | **Concurrent retries,** different keys: 5 parallel requests, repeated 5 times | Exactly one `retried` per round; the rest are `in_progress`, or `already_succeeded` if the render finished. Attempts rise by exactly 1 |
| EX-04 | Concurrent retries with the **same** key | One `retried`, and the twin answers as a replay. Never a 500, never a second attempt |
| EX-05 | **Bad token,** every variant: missing header, `Basic` scheme, wrong token, extra whitespace, empty bearer, a rotated old token, a member session cookie with no token | 401 `unauthenticated` with no detail, for GET, retry and run. Nothing written; the token never appears in the answer or the log |
| EX-06 | **Already succeeded** | `already_succeeded`, same artifact and sha256. The object's modified time is unchanged |
| EX-07 | **Render timeout,** with a stub that hangs and a test-only cap of 2 s (a setting refused in production) | The attempt fails with `RENDER_TIMEOUT`; the job is failed and retryable; no object; the stub webhook was called once. A retry then succeeds as attempt 2 |
| EX-08 | Lease expiry: a job left `rendering` with a passed lease | The next GET returns it failed with `LEASE_EXPIRED`, and the webhook stays silent. A retry claims it |
| EX-09 | Queued for 61 s | `NOT_STARTED` on the next read |
| EX-10 | `Idempotency-Key` missing, 7 characters, 201 characters, or with non-printable characters | 400 `validation_failed`, field `idempotency_key`. Nothing written |
| EX-11 | Unknown job id, and a non-UUID job id | 404, with identical bodies |
| EX-12 | One key reused for another job, or with another `expected_export_key` | 409 `idempotency_key_reused` |
| EX-13 | Stale: a revision 2 job while revision 3 is published; also a wrong `expected_export_key` | `stale_revision`, no attempt |
| EX-14 | Attempts at 3 | `not_retryable` |
| EX-15 | Export twice; then a double click racing | `unchanged` with the same job; one row per `export_key` |
| EX-16 | Drill scoping: the value is wedding A's id. Export on A, then on B (also a sample); empty value; a non-sample wedding with a matching id; Flagsmith unreachable | Armed only on A, and only attempt 1; the retry renders normally |
| EX-17 | Font guard: the render page in a test mode that blocks the Devanagari face | `FONT_NOT_LOADED`, no object |
| EX-18 | Render page | A bad or expired token gets 404. The HTML has no money, vendor, guest name, count or draft value. Only the frozen functions show. Headers are noindex, no-store and no-referrer |
| EX-19 | Webhook URL unset, or answering 500 | The job fails, and `notified_at` stays empty. The panel says not notified, and the owner's Retry works |
| EX-20 | Roles | A manager can request but gets 403 on retry. A guest token gets 401 on member routes. The ops token gets 401 on member routes |

### 8.2 Production checks (D's rehearsal copy, or the `probe` id)

These use an HTTP client that reads the token from an environment variable.
- **P1, 10:40: the probe.** Cold and warm timings, plus the visual Hindi check (3.6).
- **P2, 11:50:** GET with no token, then a wrong token (both 401), then a good token (200, the strings rule holds).
- **P3, about 11:50–12:15: a real REV-3 export,** on copy `d` and Lane D's own pages (3.6). Diya's `update_event` goes through the command route, Mira publishes through `PublishSheet` on D's Invite page, and the job reaches Ready; the downloaded PNG matches local Chrome by eye (decisions D41 and D107). This is the 12:15 gate.
- **P4 and P5 run after the 12:30 deploy** (decision D62).
- **P4: EX-01 and EX-03 again on production,** against a drill job.
- **P5: headers and links.** `/render/*` and `/api/ops/*` answer no-store and noindex, with no CORS headers. The panel's `download_url` saves `jashn-card-rev3.png` and stops working after 10 minutes.

### 8.3 NudgeBee end to end (after the 12:30 deploy, by 13:00)

These run after the 12:30 deploy, because the production webhook URL only takes effect then. Their run ids are appended to `ops/nudgebee/` in a follow-up PR (decision D62). V15 at 13:00 needs one successful NB-T10.

| Id | Test | Passes when |
|---|---|---|
| NB-T10 | **Full drill** on D's rehearsal copy | The webhook run starts within 10 s, waits at the approval, then goes approve, `retried`, verify 200, `replay_check` replayed "true", verdict. Jashn shows attempt 2 with the run id and approver, one object and four activity entries. Time each stage |
| NB-T11 | Replay: Retry the finished run, then a direct POST with a new key | The run ends at `nothing_to_retry`, and the POST answers `already_succeeded` with the same artifact |
| NB-T12 | Reject | `rejected` prints, the job stays failed and nothing renders |
| NB-T13 | Approval timeout, on a copy of the workflow with a 2-minute approval | The step and the run fail after 2 minutes, the job stays failed, and the owner's Retry still works |
| NB-T14 | Manual trigger with a job id | Same as NB-T10 from step 2 |
| NB-T15 | Webhook filter: a payload with another `type` | No run starts |

The full drill is never wired to `retry_export` on the demo copy until EX-01 to EX-04 pass.

---

## 9. Risks

| # | Risk | Trigger: when, and the signal | Fallback |
|---|---|---|---|
| 1 | The never-connected account can't run HTTP or approval steps (U1) | T2 or T4 fails (the kind decision at 09:30, or about 10:20 if the user runs the checks) | kind plus the agent (6.8) on the user's MacBook, kept connected through judging |
| 2 | Helm 4.3.2 breaks the agent install (U10) | During 6.8: an installer error | A Helm 3 binary for this install only |
| 3 | Docker or the laptop sleeps, and the agent disconnects | Any time after 6.8: "Disconnected" in NudgeBee | `caffeinate`, the charger, restart Docker; at worst, the recorded clip only |
| 4 | The venue blocks the agent's outbound wss | 6.8: no "relay connected" within 5 minutes | Phone hotspot |
| 5 | Chromium fails on Vercel: launch, missing files, ETXTBSY | 10:40 probe; the 12:15 gate | The file-tracing include (3.1), the launch arguments from the installed 153.0.0 README, graphics off, one launch per instance. A failed 10:40 probe makes the og renderer Lane D's top priority; it is deployed dormant at 11:40 either way, and at 12:15 the user sets `card_renderer` = `og` (D48) |
| 6 | Hindi wrong on production: boxes, broken conjuncts | 10:40 visual check; 12:15 | Check the subsets and the guard. At 12:15, og with the pre-rendered Hindi |
| 7 | Cold renders too slow | 10:40 timings above 30 s; rehearsals above 15 s | Warm-up 5 minutes before (3.4); the beat stays recorded |
| 8 | NudgeBee can't reach production: SSRF guard, redirect, challenge | The tunnel read at 11:15, by 11:30; the first production read by about 11:50, after the 11:40 batch (decisions D13 and D43) | Lane D fixes the URL, credential or response: the exact https URL with no redirect; no challenge on `/api/ops/*`; ask the sponsor's team. A manual run calls the same URL, so it is no fix here |
| 9 | The webhook never starts runs (U5, integration name) | After the 12:30 deploy, NB-T10; no run by 12:50 (D121) | Manual trigger (6.10 step 1) |
| 10 | In-app approval unusable | T4: by 09:28, or about 10:10 if the user runs the checks | Email approval |
| 11 | Retries through NudgeBee still fail | **12:45** (decision D43) | The recording path in 6.10 step 4, with the retry labelled as the user's, disclosed |
| 12 | A duplicate attempt or file shows up in tests | Any EX run | Keep `retry_export` disconnected in NudgeBee until EX-01 to EX-04 pass |
| 13 | The approval times out mid-take | During recording | 45-minute step and 60-minute workflow. Approve within a minute; rerun manually |
| 14 | The token leaks: printed, committed or in NudgeBee output | Any time | Rotate: new value in Vercel Production and the NudgeBee Secret, then redeploy. The bearer is never logged |
| 15 | Flagsmith unreachable | The Flags drawer shows "fallback" | The drill stays off and the renderer stays Chromium. Set `EXPORT_FAILURE_DRILL` and redeploy only if a drill must run |
| 16 | The drill is left armed, or armed for the wrong copy | Every pre-flight; 16:35 | Scoped by wedding id; the pre-flight check; disarm |
| 17 | App chrome leaks into the card, or the root layout changes | The probe, and after every batch | The root layout stays bare; the render page owns its body |
| 18 | Hobby's 1-hour logs lose the evidence | Always | `export_attempts`, activity entries, the NudgeBee run and the recording |
| 19 | A reset removes the recorded job | After the take | Evidence lives in NudgeBee and the clip. No replay of that run after a reset |
| 20 | A cold render takes longer than the retry's `wait` | NB-T10 timings | The retry answers within 20 s with `queued` or `rendering`; the verify step then long-polls for 10 s, twice. If that still isn't enough, raise the verify step's attempts to 4, not the HTTP timeout |
| 21 | Template quirks: booleans, nulls, `or` (U4–U6) | T7 in the account checks (6.7); after the 12:30 deploy | The strings rule, no nulls, and Print steps to debug |
| 22 | NudgeBee is down while judging | Judging | The recorded clip, screenshots and the run id (demo-script fallback) |
| 23 | Option B overruns | 14:30 | Drop it |
| 24 | Lane D is overloaded (guest site, RSVP, studio, export, NudgeBee) | The 11:40 batch misses the job module | Cut in this order: PDF, `ai_note`, the stalled-state copy, the Option B stretch. Keep the card, the ops routes and the drill |

---

## 10. Delivery and build order

### 10.1 Team rules for this work

- **Branches and PRs.** Every change goes through a feature branch and a pull request to `main`.
  - Lane D works in `~/Desktop/Personal/jashn-d` (port 3004). Its first branch is `lane-d-render-probe`; later ones are `lane-d-<topic>`, such as `lane-d-export-jobs` and `lane-d-ops-recovery` (architecture §6.1).
  - The `lane-` prefix stops Vercel previews.
  - PRs open as drafts (`gh pr create --draft`) and are marked ready with `gh pr ready` when the checks pass (decision D30). The lead merges them as merge commits.
  - PRs join the lead's batches (10:45, 11:40, 12:30, 13:45, 14:30), always A, then B, C, D. The probe PR is the one out-of-batch merge.
  - Real export jobs extend the probe. So Lane D fetches and merges the probe from `origin/main` before cutting its next branch (such as `lane-d-publish` or `lane-d-export-jobs`), or stacks that branch on the open probe branch (decision D67).
- **Done-checks come in two parts** (decision D104; architecture §6.4).
  - Before marking a PR ready, the check passes on fixture services or injected dependencies, on copy `d`. Run `npm test`, plus `npm run test:db` for the EX tests (D103).
  - After the batch deploys, Lane D merges `origin/main` and reruns the real-data part: the REV-3 export at about 11:50 on production (3.6; D41, D107), and Tara's double tap after the 12:30 deploy. A failure there becomes the first item of the next batch; it doesn't hold the current one.
- **Test data** (decision D120).
  - Copy `d` only, with `mira.d@example.com` and `diya.d@example.com`. Never `e2e/.auth/` or the `e2e` copy, which are L's.
  - Lane D's spec starts its own dev server first (`npm run dev -- --port 3004`, in the background) and signs in through the login page with its own storage state.
  - If copy `d` isn't seeded by 10:45, read the `e2e` copy (GETs only) and use fixtures for writes until 11:40.
- **No AI tool names in history.** Commits, PR titles and descriptions, and branch names never mention Claude or any AI tool, and never carry a Co-Authored-By trailer.
  - The local commit-msg hook strips AI footers and rejects any message containing "claude".
  - Write "agent instructions", never the file name.
  - PR titles follow architecture §6.2, for example "D: card export jobs and the recovery endpoints".
- **Disclosure.** AI assistance is disclosed in the README and on the submission form (decision D31; presentation.md §6 holds the text, and demo-script §4.3 points to it).
- **gh.** gh commands for this repo run with `GH_TOKEN` from `gh auth token --user omiiii21`. The repo is github.com/omiiii21/Jashn (public, personal account), passed as `--repo omiiii21/Jashn`. Never run `gh auth switch`.

Run at 09:00 or later, from D's worktree, for the probe PR (its body: what changed, how it was tested, env changes):

```bash
git fetch origin && git merge origin/main
npm run check && npm test && npm run build
git push -u origin lane-d-render-probe
GH_TOKEN="$(gh auth token --user omiiii21)" gh pr create --draft --repo omiiii21/Jashn --base main --head lane-d-render-probe --title "D: card render page and Chromium probe" --body "Render page with a sample card, the Chromium module and the probe route. Tested locally with Chrome; production check after merge. Needs RENDER_TOKEN_SECRET and JOBS_API_TOKEN in Production."
GH_TOKEN="$(gh auth token --user omiiii21)" gh pr ready lane-d-render-probe --repo omiiii21/Jashn
```

### 10.2 Timeline (export and NudgeBee items only; the guest site and RSVP fit around them)

| Time (IST) | Who | Work | Done when |
|---|---|---|---|
| 09:10–09:28 | Teammate, only if invited to the user's NudgeBee account | NudgeBee T1, T2 and T4 first, then the rest of T1–T9 (6.7) | The 09:30 kind decision is made |
| ~10:05 | User, if the teammate isn't invited | After any unfinished Flagsmith steps A–E (hard limit 10:30): NudgeBee T1, T2 and T4 first, then the rest of T1–T9 (6.7; D119) | The kind decision is made at about 10:20, later if Flagsmith runs late |
| From 09:30 or about 10:20 | L and the user, on the user's MacBook | Only if T2 or T4 failed: kind plus the agent (6.8). L runs Docker, kind and the download; the user runs `read -s` and the installer in a plain Terminal tab; L runs the kubectl checks (D119) | Connected |
| about 09:10 | L | After the 09:08 install, check that next/font has Anek Devanagari | `fonts.ts` is final |
| 09:35–09:55 | L | Contracts from 10.5 (writing window, decision D121), merged at about 09:50–09:55 (decision D70) | `lane-lead-contracts` is merged |
| ~10:00–10:25 | D (session starts at about 09:58–10:05) | Render page (fixture), Chromium module, `/run` with `probe` behind a temporary token check (D58); the probe spec, with no seeded data and no login (D54); local check with Chrome | Probe PR open |
| ~10:30–10:40 | L, D | Out-of-batch merge at about 10:30 (PR open by 10:25); P1, the production probe, at 10:40, once `/api/health` serves the probe's SHA (3.6) | Timings written down; Hindi shaping checked |
| 10:00–11:00 | The NudgeBee operator (6.1; D72) | Build `card-export-recovery` in NudgeBee against httpbin stand-ins (the user: 10:05–11:00, during the keynote, after the checks; D119) | It validates and runs |
| 10:40–11:30 | D | Job module: the four handlers (D41), with `publish_itinerary` on Lane A's snapshot builder (D95); claim and lazy expiry, ops GET and retry (kick before the wait, D53), the kick in the after-commit map (D101), the request and owner-retry routes, webhook, the real `export_job_status` (D52), the reusable `PublishSheet` (D59) and D's Invite page mounting it in `lane-d-publish` (D107), panel v1, the switch to Lane A's system verifier once it merges (D58, D102), the dormant og renderer (D48), EX tests | EX-01 to EX-15 pass locally |
| by 11:10 | User | Paste `JOBS_API_TOKEN` into the NudgeBee Secret `jashn_ops_token`, from the password manager or copied from `.env.local` in an editor; never through chat, Notion or a terminal (decision D117) | The Secret holds the token |
| 11:10 | User | NudgeBee sponsor demo: ask U1, U4–U8, U17 and the HTTP timeout | Answers written down |
| 11:15 (by 11:30) | D, the NudgeBee operator | An authenticated read against a real Jashn job through the tunnel (3.5), then the retry (D43) | Authenticated read and retry work by 11:30 (decision D13) |
| 11:40 | L | Batch: first L's couple-photo PR (D107); Lane A's Storage adapter, token resolver and system verifier ahead of Lane D (D102); then the job module, the four handlers, `PublishSheet` with D's Invite page, and the dormant og renderer. Right after the deploy, L runs the seed's photo step for every copy (D107) | Deployed about 11:50 |
| about 11:50–12:15 | D | The key signal on copy `d`: Diya's `update_event` through the command route, Mira's publish through `PublishSheet` on D's Invite page, then the PNG from a real export job (3.6; D41, D107). NudgeBee's first production read, keeping the first successful run id (D43). P2 and P3. At about 12:00, render the REV-2 seed card and commit `scripts/seed-assets/card-rev2.png` (2.6) | **12:15 gate** |
| 12:15–13:00 | The NudgeBee operator, D | NudgeBee objects on production (6.1) from 12:15; L adds `NUDGEBEE_EXPORT_WEBHOOK_URL` (10.4). After the 12:30 deploy: NB-T10 to NB-T15, P4 and P5, with the run ids appended to `ops/nudgebee/` in a follow-up PR (D62). No webhook run for NB-T10 by 12:50: start it manually, and debug the filter until 13:00 only (6.10 step 1; D121) | One full drill (NB-T10) has passed |
| 12:30 | L | Batch: the recovery PR, gated on the tunnel or manual checks, committing the workflow and object names in `ops/nudgebee/` (D62); panel polish; webhook env live; the minimum Invite studio on D's Invite page (AT-7.1's typed path: the style, and the couple photo through A6's upload; D105); Lane B's `PublishSheet` mount on Events (B3; D107) | Deployed |
| 12:45 | L and the user | Choose the recording path (6.10 step 4; D43) | Path chosen |
| 13:00–13:30 | User, D | **Record V15** (7.2). Protected | Run id and recording time written down for "Recorded today, HH:MM" |
| 13:30 | L | Option B gate (6.9); PDF approval (1.4, D66) | Go or no-go |
| 13:45 | L | Batch: demo-path fixes first, then Must polish (such as the Invite studio's), then Should work that passed its gate (decision D106) | Deployed |
| 14:00–14:30 | User, D | Two live-mode timing rehearsals (7.1); retake V15 only if needed | Mode decided at 14:30 (default: recorded, drill off live) |
| 14:30 | L | Last batch: the PDF, if approved at 13:30 (D66), and fixes (D106) | – |
| 14:45 | All | Freeze | – |

### 10.3 What Lane D needs from others

| From | What | By |
|---|---|---|
| Lead | Exact puppeteer-core and @sparticuz/chromium installed; `src/lib/fonts.ts`; a bare root layout; `RENDER_TOKEN_SECRET` and `JOBS_API_TOKEN` in Vercel Production; the contracts in 10.5, including the `src/server/jobs/status.ts` stub (D52), the after-commit types and the empty `src/server/jobs/after-commit.ts` (D53, D101), the component stubs with their final props (D97) and the Invite placeholder under D's path (D121); the next.config entries, only if the probe needs them; the couple photo, generated by L with GPT-6.2-Sol through the codex wrapper (3:2, at least 1500 × 1000; labelled AI-generated in the README, never cropped; decision D14), committed as `scripts/seed-assets/couple-photo.jpg` and seeded into every copy (D107) | The contracts merge at about 09:50–09:55 (D70); next.config after 10:40; photo generated 10:00–11:00, approved by the user at about 10:40 (D119), committed by 11:00, merged first in the 11:40 batch and seeded right after that deploy (D107) |
| Lane A | `export_jobs` and `export_attempts` with the two added columns (2.4); the pure snapshot builder `src/db/itinerary-snapshot.ts` that `publish_itinerary` imports (A1; D95); the dispatcher running the after-commit map (D53, D101); the append-activity helper taking a finished entry (D63) and the bump-version helper; `LiveRefresh` (D57); the proxy skipping `/api/ops/*` and `/render/*`; the read-model index re-exporting D's `export_job_status` from the 09:50 stub on (D52) | 10:45 batch |
| Lane A | The Storage adapter and signing helpers (D41); the system verifier for `JOBS_API_TOKEN` (D58); the guest token resolver (D57); `reset_demo` removing non-seeded jobs; A4: the draft venue change `update_event`, ahead of member-invite work, and the itinerary read model (D41). Their signatures are typed in `src/contracts/services.ts` from the contracts PR, so D builds against them from 10:00 (D102) | 11:40 batch at the latest, merged ahead of Lane D (D102); Lane A may ship any of them at 10:45 |
| Lane A | The guest DTO, the revision read, the RSVP and dietary handlers and the one rate limiter (A5; D57, D108); `/api/uploads/sign` and `add_asset` for the studio's couple photo (A6; D105, D121); the seed uploading `scripts/seed-assets/card-rev2.png` when present (D commits the file, 2.6) | 12:30 batch; the upload works once D's file lands after 12:00 |
| Lane A | The `pdf` enum value and the bucket MIME type, in an additive migration, only if the lead approves the PDF at 13:30 (D66) | For D's 14:30 PDF |
| Lane B | The planner action passed to D's `PublishSheet` on Events (B3), with one write (D59). The 11:50 check doesn't need it: it uses D's own Invite page (D107) | 12:30 batch |
| Lane C | The environment-flag reader for `export_failure_drill` (with its value) and `card_renderer` | 10:45 batch |
| Lane C | Voice I-02 calling `request_card_export`, and E-05 passing the voice confirm to D's `PublishSheet` (D59) | 12:30 batch |
| The NudgeBee operator: the invited teammate, otherwise the user (6.1; D72) | NudgeBee checks, the workflow, the 11:15 tunnel read with D, and the production objects. The Secret's value is pasted by the user (D117) | Checks by 09:28 (or the user's from about 10:05, D119); the Secret by 11:10; workflow by 11:00; objects 12:15–13:00 |

### 10.4 Environment variables (names only; architecture §5 holds the full table)

| Name | Where | Note |
|---|---|---|
| `JOBS_API_TOKEN` | Server; Vercel Production | Bearer for `/api/ops/*`. The same value is NudgeBee's Secret `jashn_ops_token`, which the user pastes by 11:10 (D117) |
| `RENDER_TOKEN_SECRET` | Server; Vercel Production | HMAC for render URLs |
| `NUDGEBEE_EXPORT_WEBHOOK_URL` | Server; Vercel Production at about 12:15 (live after the 12:30 deploy) | Optional; carries NudgeBee's token |
| `EXPORT_FAILURE_DRILL` | Server; unset | A wedding id, only when Flagsmith is down |
| `CHROME_EXECUTABLE_PATH`, `APP_BASE_URL` | D's `.env.local` only | Local Chrome; `http://localhost:3004` or the tunnel |
| `NUDGEBEE_AGENT_AUTH_KEY` | Laptop only | Used only by 6.8 |

**Adding the webhook URL** (at about 12:15, once the NudgeBee webhook exists; decision D5). The operator puts the URL into the main `.env.local` in an editor, never printed. L then adds it the way it added the 09:35 values (architecture §5.1), with the documented form `npx vercel@66.6.0 env add NUDGEBEE_EXPORT_WEBHOOK_URL --environment production --sensitive --yes` (decision D119), run from the empty scratch folder `~/jashn-vercel-cli`, with the value fed on stdin straight from `.env.local`. The Vercel CLI is never installed globally and never run from the repo. The fallback is the dashboard: Project → Settings → Environment Variables, scope Production, marked Sensitive, pasted from the clipboard. The value applies from the next production deploy, the 12:30 batch.

Run at 09:00 or later (L, from the main worktree; it prints nothing):

```bash
grep -E '^NUDGEBEE_EXPORT_WEBHOOK_URL=' .env.local | cut -d= -f2- | npx --yes vercel@66.6.0 env add NUDGEBEE_EXPORT_WEBHOOK_URL --environment production --sensitive --yes --cwd "$HOME/jashn-vercel-cli"
```

**Rotation** (risk 14): replace `JOBS_API_TOKEN` in Vercel Production and in NudgeBee's Secret, then redeploy.

### 10.5 What the lead copies into the contracts at 09:35–09:55

- **`src/contracts/jobs.ts`** (owned by D):
  - **Statuses and panel labels:** queued "Queued", rendering "Rendering" ("Retrying" from attempt 2), succeeded "Ready", failed "Failed".
  - **Identity:** the `export_key` format, the `job_label` format, `max_attempts` 3.
  - **Timers:** render cap 45 s, lease 120 s, queued expiry 60 s, retry `wait` 0–25 (default 25), GET `wait` 0–10.
  - **Error codes,** with messages and reason phrases (2.5).
  - **Values:** retry outcomes (5.3); `export_trigger` values; `fail_injection` values; renderer values `chromium` and `og`.
  - **Webhook:** the type `invitation_export.failed`.
  - **Keys:** the Idempotency-Key rules (8–200 printable characters); the reserved job id `probe`.
- **`src/contracts/flags.ts`:**
  - `export_failure_drill`: default off, and its value names the wedding id;
  - `card_renderer`: default `chromium`, or `og`.
- **`src/contracts/api.ts`:** the JSON shapes in 5.2–5.6, plus `/run`:
  - 202 with `started` "true" and `attempt`;
  - 200 with `started` "false" and `status`;
  - `probe` answers with a PNG.
- **`src/contracts/routes.ts`:** builders for the six routes in 3.2.
- **Lane D's stubs** (architecture §4.3; decisions D44, D52, D53, D97, D101 and D121):
  - `src/server/invite/handlers.ts` as an empty handler map;
  - `src/server/jobs/after-commit.ts`, the static after-commit map, exported empty;
  - `src/server/jobs/status.ts`, whose `export_job_status` returns the fixture export view until `lane-d-export-jobs` replaces the body in the 11:40 batch;
  - `src/components/invite/PublishSheet.tsx` as a disabled button that already declares its final props: `wedding_id`, the `unpublished_changes` list, `expected_draft_version` and an `on_confirm` callback. D keeps them unchanged; a change is a contracts change, made by L;
  - the Invite placeholder page under D's path, `src/app/(planner)/w/[wedding_id]/invite/`, which Lane B's nav links to through `routes.invite`.

### 10.6 Paths session D creates after 09:00

- `src/app/render/card/[job_id]/`: the card page
- `src/app/(planner)/w/[wedding_id]/invite/`: the Invite page, grown from the contracts PR's placeholder (D121). `lane-d-publish` mounts `PublishSheet` there at 11:40 for the 11:50 check (D107); the minimum studio extends it at 12:30 (D105), and its polish goes in 13:45
- `src/app/api/w/[wedding_id]/exports/`, and its `[job_id]/retry/`
- `src/app/api/ops/export-jobs/[job_id]/`, and its `retry/` and `run/`
- `src/server/export/`: the Chromium renderer, the og renderer, upload, the readiness guard, the og fonts
- `src/server/jobs/`: the state machine, worker, kick, lazy expiry, ops logic, webhook, the export activity templates (D63), the `export_job_status` read model in `status.ts` (re-exported by Lane A's read-model index; decisions D16 and D52), the export kick's entry in `after-commit.ts` (D101), tests (database tests named `*.db.test.ts`, D103)
- `scripts/seed-assets/card-rev2.png`: the REV-2 seed card, the one file D adds under Lane A's `scripts/` (2.6; decision D15)
- `src/server/invite/handlers.ts`: all four handlers (`update_invite_style`, `publish_itinerary`, `request_card_export` with the card function list, and `retry_card_export`) (D41). `publish_itinerary` builds its snapshot with Lane A's pure builder in `src/db/itinerary-snapshot.ts`; D never writes a second builder (D95)
- `src/components/invite/`: the exports panel and the reusable `PublishSheet` (D59)
- `public/card/`: the og Hindi PNGs and the probe's placeholder photo
- `ops/nudgebee/`: `card-export-recovery.yaml` and a short README with the object names and test run ids

---

## 11. Changes needed in domain-and-data.md

1. **Token and webhook names.** In §0.3, §2.7 G8, the §3.0 transports table, §3.7 and §6.4, `OPS_API_TOKEN` becomes `JOBS_API_TOKEN`. In §6.4, `NUDGEBEE_WEBHOOK_URL` becomes `NUDGEBEE_EXPORT_WEBHOOK_URL`.
2. **Status name.** In §3.7, §4.8 and §5.2 `export_status`, `running` becomes `rendering`. Labels: "Rendering", or "Retrying" from attempt 2.
3. **Where the worker runs (§3.7).**
   - Chromium runs only in the internal route `POST /api/ops/export-jobs/{job_id}/run`, behind the bearer token.
   - `request_card_export` and `retry_card_export` kick it after commit, from any transport. The reserved job id `probe` renders a fixture.
   - The claim (`queued` → `rendering`) moves `weddings.version` without an activity entry.
4. **Render page (§3.7, §6.4).** The page is `/render/card/{job_id}?t=`; the token signs the job id and the expiry. The page reads the job's publication snapshot, `card_event_ids` and `is_sample` only.
5. **New columns (§5.1).**
   - `export_jobs.card_event_ids`: an array of event ids, frozen at creation. It holds the published functions every invited guest is invited to, or all of them when nobody is invited.
   - `export_attempts.renderer`: `chromium` or `og`.
   - Add a note under P10 that the card's list is frozen per job.
6. **Failure codes.** Add `RENDER_TIMEOUT`, `FONT_NOT_LOADED` and `NOT_STARTED`. `NOT_STARTED` is a lazy expiry after 60 s in `queued`. Lazy expiry runs in the ops GET, the retry paths and `request_card_export`; member read models never write.
7. **Ops JSON (§4.8 and the §3.7 retry response).**
   - Every scalar is a string ("true"/"false" for booleans) and nothing is null. `artifact`, `last_error` and `last_recovery` are always objects, with empty strings when there is no value.
   - The GET adds `job_label` (computed `JOB-EXP-R{revision}-{FORMAT}`), `latest_revision` and `card_summary`.
   - The retry response adds `retryable`, `revision` and `latest_revision`.
8. **GET query.** `wait` (0–10 s) and `expect=succeeded`, with a new error `expectation_failed` (412) in the §3.0 table.
9. **Retry replay.**
   - A replay keeps the stored `outcome` and `attempt`, sets `replayed` "true", and reports the current `status` and `artifact`.
   - The route waits, up to `wait`, while the job is `queued` or `rendering`, for every outcome.
   - Note that I2's "outcome `replayed`" applies to the dispatcher envelope; the ops shape uses the flag.
10. **Retry errors.** The 400 uses the code `validation_failed` (field `idempotency_key` or `body`). 409 `idempotency_key_reused` is also an error on the ops route (§3.7 lists only 400, 401, 404 and 500).
11. **I2 under concurrency.**
    - A same-key request that arrives while the first is in flight waits on the job's row lock, re-checks the receipt inside the transaction and replays. It never gets a 500.
    - Receipts are stored for every retry outcome, including no-change ones.
12. **Activity templates.**
    - Remove `{result}` from both `export.retried` templates: the worker's own entry reports the result.
    - `{reason}` in the failure template is the short per-code phrase from this file's §2.5, not the raw message.
13. **Transports (§3.0 and §6.1).**
    - The panel's request goes through `POST /api/w/{wedding_id}/exports`, and the owner's retry through `POST /api/w/{wedding_id}/exports/{job_id}/retry`, as architecture §9 item 9 proposes.
    - Voice and the generic command route may also run `request_card_export`, because the worker is kicked after commit; no refusal is needed.
    - The ops-token row covers the internal `/run` route.
14. **The drill.** `export_failure_drill` is honoured only when it is enabled and its value equals the job's `wedding_id`, on an `is_sample` wedding. The env fallback `EXPORT_FAILURE_DRILL` holds a wedding id, not `once` (§3.7, §0.3).
15. **Webhook.** It isn't sent for a lazy failure found by an ops route, and `synthetic` is sent as a string.
16. **Member view (§4.8).** Add `job_label`, `card_summary`, `card_functions`, `renderer`, `notified_at`, `stalled` (computed) and `can_retry`. `download_url` stays as §4.8 has it: signed for 10 minutes, with the download name `jashn-card-rev{n}.png`.
17. **`update_invite_style` (§3.2).** `wording_en` holds two paragraphs separated by a blank line, printed above and below the names.
18. **§7.1 step 10.** Re-running the finished workflow ends at `nothing_to_retry`. `already_succeeded` comes from a retry with a new key, and the run's own `replay_check` shows `replayed` "true".
19. **PDF, only if the Should ships after the 13:30 gate.** Add `pdf` to `export_format`, `application/pdf` to the `exports` bucket (§5.5), and the object `{wedding_id}/card-rev{revision}.pdf`.

## 12. Changes the other specs need

Both specs have applied everything this section asked for. Nothing is outstanding; the list stays as a record.

**05:40 IST:** rounds 2 and 3 of `decisions.md` were applied to this file where they touch it: D41, D43/D62, D44, D48, D52, D53, D58, D59, D63, D66, D67, D70 and D72, plus D5 in 10.4 (the round-1 item that hadn't landed). architecture.md §2.3, §3.3 and §8 say the same. Where this file still disagrees with `decisions.md`, `decisions.md` wins.

**06:15 IST:** round 4 applied where it touches this file: D95 (10.3, 10.6), D97 (10.5), D101 (3.2, 5.3, 10.3, 10.5, 10.6), D102 (2.6, 3.3, 10.3), D103 (8.1, 10.1), D104 (10.1), D105 and D106 (10.2, 10.6), D107 (1.2, 1.3, 1.5, 3.6, 8.2, 10.2, 10.3), D117 (6.1, 10.2, 10.4), D119 (1.3, 3.6, 6.1, 6.7, 6.8, 10.2, 10.4), D120 (4.3, 10.1), D121 (header, 6.4, 6.10, 9, 10.2, 10.5, 10.6) and D122. This file follows D1–D122.

- **architecture.md (applied):**
  - Chromium runs only in `api/ops/export-jobs/[job_id]/run/` (120 s): its §0 item 6, §2.2 and §4.1. No transport refuses an export command (its §9 item 9).
  - The request route and the owner's retry route have 30 s, and NudgeBee's retry route 60 s, because none of them renders.
  - The render page is `render/card/[job_id]`, and the render token signs the job id (its §2.2, §3.7, §4.1).
  - `EXPORT_FAILURE_DRILL` holds a wedding id (its §5.1).
  - If the PDF ships, the `exports` bucket also accepts `application/pdf` (its §3.6).
- **flagsmith.md (applied):**
  - Its §3.6 gives the drill flag a string value that names the wedding it may arm, and its §7.4 step B description says "Set the value to the sample wedding's id, then enable".
  - Its §3.7 has `card_renderer` read once at each claim.

## 13. Open questions

1. **U1:** can an account whose agent never connected run HTTP and approval steps? Answered by T2 and T4 by 09:30, or at about 10:20 if the user runs the checks, later if the user's Flagsmith steps run late (6.7, D119).
2. Is Anek Devanagari in next/font 16.4.6, with a `devanagari` subset? research-stack §7's verified list doesn't name it. Check at about 09:10, after the 09:08 install; Mukta otherwise (1.5).
3. **@sparticuz/chromium 153 on Vercel Node 24 in `bom1`:**
   - cold start;
   - whether a file-tracing include is needed;
   - the launch arguments in headless shell mode.
   Measured at 10:40.
4. Does Vercel bundle `/run` into a shared function with other routes? That affects warm-up and bundle size.
5. **Remaining NudgeBee unknowns:**
   - U4–U6: how strings and booleans render, the `or` fallback, the webhook filter key, a `continue` policy;
   - U7: whether an email approval link needs a login;
   - U8: whether a waiting approval notifies anyone;
   - U17: what Retry does to a run waiting at an approval;
   - the HTTP task's maximum timeout. The `timeout` option is documented with a 30 s default (F15), and this design stays at 30 s, so the answer changes nothing unless risk 20 bites.
6. What does NudgeBee's `approver` look like: an email or a name? T4 records it.
7. Does NudgeBee's Executions view refresh on its own? That decides the 15 s live target.
8. How long do Fluid instances stay warm between the warm-up and the beat?
9. Settled (decision D15): Lane D renders and commits `scripts/seed-assets/card-rev2.png`; Lane A's seed uploads it (2.6).
10. Settled as a default (decision D40): the recorded beat, with the drill off in the live run, unless the live run completes in under 15 s in rehearsal. The lead decides at 14:30 (7.1).
11. How long does NudgeBee keep runs, and can a run page be shown to judges by link? If not, screenshots.
