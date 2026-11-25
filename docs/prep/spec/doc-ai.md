# Should #11: read an existing invitation

Spec for the build on Wed 25 Nov 2026, written between about 03:10 and 03:40 IST, before coding starts at 09:00. It is notes only (hackathon rule 4): prose, tables, one plain file list and short JSON examples of HTTP payloads. It contains no code.

Where the facts come from:
- **Sarvam:** every Sarvam fact comes from `research-sarvam.md`, cited as RS with a section or row id (RS §4, RS B24). Nothing here was observed with a key; the Sarvam tests in section 5 (T0–T4 at about 09:14, T5 and T6 at about 10:05–10:15) check it.
- **Names:** `spec/domain-and-data.md` is binding for command, field, table and error names, cited as "domain §n". It says reading an image "is not a command": it fills a setup draft, and nothing is saved until `set_wedding_profile` and `create_event` are confirmed (domain §0.3). That draft is "the same kind of draft" as a voice setup turn's (domain §3.8). This spec follows both.
- **Data:** `demo-data.md` is the source of truth for the sample card (its §12).
- **Other specs:** `spec/architecture.md` (cited as "arch §n") for lanes, paths, routes and delivery, and `spec/flagsmith.md` ("flags §n") for the flag. Both are binding for those names. They have since applied everything #11 asked of them; section 5.7 keeps the list as a record.
- **Fact-check, about 04:50.** Every Sarvam status code, limit, price and field name here was compared with `research-sarvam.md` and matches it. The file paths, branch name, gate times and contract timing were aligned with `architecture.md` (5.2, 5.3, 5.6), and open questions 2, 5, 6 and 7 are settled (5.8).
- **Decisions pass, about 05:55:** updated for decisions.md D44 (the contract types move to `lane-lead-contracts-2`), D56 (the gate), D70 (contracts and lane-start times), D73 (L's HTML-to-JPEG card) and the paperclip's "Printed card" entry (1.6). decisions.md wins wherever this file still disagrees.
- **Round 4 pass, about 06:20:** updated for D105 (the minimum Guests and Invite studio screens ship at 12:30 whatever #11's state), D106 (what the 13:45 batch takes), D115 with D9 (the flag's key moves to `lane-lead-contracts-2`; the user, the one Flagsmith seat, makes every change to the flag), D119 (L's card at 10:00–10:05, T5 at about 10:05–10:15), D120 (the test owner's address) and D121 (the 09:35–09:55 contracts window).
- **Background:** `research-stack.md` (STK), `research-flagsmith.md` (FS), `voice-test-set.md` (row I-03), `demo-script.md` (shot V02b) and `design-direction.md` (review-card patterns).

## At a glance

| | |
|---|---|
| What | The owner photographs or picks a printed wedding card. Jashn reads it with Sarvam Document AI, drafts the names, date and functions for review, and leaves anything not printed empty, asking for it. |
| Where | New-wedding setup only, in both `setup_entry` arms, placed identically. |
| Saves through | `set_wedding_profile` (create) and `create_event`, through the one dispatcher (`applyAction`), exactly as typing does. |
| Never | Stores the photo, sends guest data, saves before the owner confirms, or fills a year, time or hall that is not printed. |
| Flag | `image_extraction_provider`: `docai`, `gemma4` or `off`, with fallback `off` (flags §3.8). |
| Lanes | Lane C builds it. Lane A adds one table. L writes the contract types and the flag's key in `lane-lead-contracts-2` at about 10:30, because no first branch needs them (decisions D44 and D115). Lanes B and D have no work for #11 itself. Their minimum Guests and Invite studio screens, which the gate needs, ship at 12:30 whatever #11's state (decision D105). |
| Gate | The test T5 (or T6), run by L at about 10:05–10:15, passes; L verifies Must 1–9 by 13:00, or #11 is future scope; and the build starts by 13:00 so it can join the 14:30 merge batch (section 5.2; decisions D56, D105 and D119). |
| Demo | An optional 4 s of the submission video (demo-script V02b, voice-test-set I-03), only if Working. It is not in the live demo. |

---

## 1. User flow

### 1.1 Where it appears

- **Entry point.** The setup screen (`(planner)/setup/`, Lane C) shows a secondary action, "Start from a printed card", with the Phosphor `Image` icon. Never `Sparkle` or any other "AI magic" glyph (design-direction §6).
- **Both experiment arms.** It appears in the voice-first and the form-first arm, in the same place. The arms therefore stay comparable. Adding it during the day is still a mid-experiment change, so write the time it goes live into the README's experiment notes (flags §3.8 rejects `stt_mode` for the same reason).
- **Flag.** It is hidden when `image_extraction_provider` is `off`, and the server checks the flag again on every new import (1.7).
- **Who.** Any signed-in person, in their own setup. `set_wedding_profile` lets any signed-in user create a wedding and become its owner (domain §3.1). An import belongs to the person who started it. Managers never see another person's imports, and guest links never reach these routes.
- **Not today.** There is no entry on Events, Invite or Overview, so reading a card into an existing wedding is future scope. PDFs, DOCX and cards made of several photos are also future scope.

### 1.2 The upload

- **The sheet.**
  - It is titled "Read a printed card".
  - On a phone it is a full-height bottom sheet; on a laptop it is a side sheet over setup.
  - Setup stays usable underneath, so the owner can type the budget while the card is read.
- **Buttons.**
  - On phones: "Take a photo" opens the rear camera through the browser's camera-capture option, and "Choose a photo" opens the library or files.
  - On laptops: "Choose a photo", plus drag and drop.
- **Accepted files.** JPG and PNG, plus any other photo format the browser itself can open. iPhone library photos normally reach Safari as JPEG; AC-2 checks this.
- **Sample card (optional).** A link, "Try the sample card (fictional)", loads `/samples/arora-printer-proof.jpg` into the same flow, so a judge without a printed card can try it.
- **Card language.**
  - The control reads "The card is mostly in: English | हिंदी", with English as the default.
  - It is sent to Sarvam as `en-IN` or `hi-IN` (2.4).
- **Privacy line.** Shown under the buttons (copy in 1.9). It says that Sarvam reads the photo, that Jashn does not keep it, and that nothing is saved before the owner checks the details.
- **Preparing the photo, in the browser, every time.**
  1. Draw the photo upright (browsers apply the camera's orientation by default). Re-encode it as JPEG at quality 0.85, with the longest edge at most 2,000 px.
  2. Re-encoding drops all photo metadata, including the GPS location, so the location never leaves the phone.
  3. Refuse the photo if the browser can't open it, or if the result is over 4 MB. Vercel functions accept 4.5 MB request bodies (STK §2), and research-sarvam §4 asks for well under 5 MB.
  4. Keep the re-encoded bytes in the page. The review preview needs them, and a network retry must resend exactly the same bytes (2.1).
- **Upload key.** The browser creates an `idempotency_key` (a random UUID) once per prepared photo and sends it with the upload, so a retried request can never start a second job. The import's own `id` (`import_id`) is generated by Postgres, like every id (domain §0.1).

### 1.3 Progress states

| Stage (`stage`) | Starts when | The owner sees | Import `status` |
|---|---|---|---|
| Preparing | A photo is chosen | "Preparing the photo" | (none yet) |
| `sending` | The upload starts | "Sending to Sarvam" | `submitting` |
| `waiting` | Sarvam reports `pending` | "Waiting at Sarvam · 0:04" (time since submit) | `reading` |
| `reading` | Sarvam reports `running`, or a gemma4 call is in progress | "Reading the card · 0:12". After 30 s it adds "Still reading. You can fill in the rest of setup meanwhile." | `reading` (`fetching` while the results download) |
| `ready` | The results are fetched and turned into a draft | The review form (1.4) | `ready` |
| `failed` | Sarvam reports `failed` or `rejected`, or an error in 2.6 | The message from 1.9, with Try again and Enter by hand | `failed` |
| `timed_out` | 180 s pass after submit without a final status | The message from 1.9, with Try again and Enter by hand | `timed_out` |

Rules:
- **Escape routes.** Cancel and "Enter by hand" are visible at every stage. Cancel discards the import (DELETE, 1.7). Sarvam's job is left to finish, and its result is ignored, because no cancel call is documented.
- **Polling.**
  - The browser polls our status route every 3 s while the sheet is open and the tab is visible, and polls straight away when the tab becomes visible again.
  - When a response's `poll_after_seconds` is larger than 3 (Sarvam is rate-limiting), it waits that long instead.
  - A skeleton of the review form sits under the progress line, as in design-direction §7.1 "Interpreting".
- **Retries.**
  - "Try again" starts a new import with the same prepared photo: a new upload key, so a new `import_id` and a new Sarvam `Idempotency-Key`.
  - Allow at most 2 tries per photo. After that, only "Enter by hand" remains.
- **gemma4.** A gemma4 import has no job status, so it skips `waiting` and shows `reading` until it finishes.
- **Ready.** When the review form appears, focus moves to the first field that needs the owner: the year, or the first "Please check".

### 1.4 The review form

**Layout**, top to bottom:
1. **Header.**
   - "From your card".
   - The reader line: "Read by Sarvam Document AI", or "Read by the backup reader (gemma4 on Sarvam)".
   - A thumbnail from the browser's own copy of the photo; tap it to enlarge.
2. **Couple.** Bride and groom.
3. **Date.** The printed date text, the day and month that were read, and the year.
4. **Functions.** One block per printed function, in printed order, each with an Include switch (on by default). The fields are function type, date, start and end time, muhurat time and venue.
5. **For your guests.** Hosts and RSVP contact (see 1.5 for where they go).
6. **Footer.**
   - "Use these details" (primary) and "Enter by hand instead".
   - A helper line that says what is left to do.

Every field shows its value in an editable input, a state label, and the printed source line "On the card: 'Monday, 14th December'" (design-direction §7.1: uncertain values show where they came from).

**Field states** (contract enum `card_field_state`):

| State | When | The field shows | The owner must |
|---|---|---|---|
| `read`: "Read · 97%" | Sarvam confidence is 0.8 or more | The value, prefilled | Nothing (it stays editable) |
| `check`: "Please check · 62%" | Confidence above 0 and below 0.8. Also: any value from gemma4, shown as "no score"; a value worked out by a rule in the table below; a year read from the card; a value cut to fit a field limit | The value, prefilled, with a dotted underline and "?" | Tick "Looks right" or edit it |
| `not_printed`: "Not printed" | The value is null or empty, or its confidence is 0 | An empty input, never prefilled | Fill it, or leave it empty if it is optional |
| `edited`: "Changed by you" | The owner typed or picked a value | The owner's value | Nothing |

- **The 0.8 threshold** comes from the docs' own example (RS §4 review rule).
- **Percentages.** Confidence is shown as a whole percentage of Sarvam's 0–1 score.
- **Not by colour alone.** Every state is a text label, so it never depends on colour.
- **"Not printed" wording.** The label is exactly that, so the video caption "Year: not printed" (demo-script V02b) matches the screen.

**The year** (demo-data §12: "the year stays unconfirmed until Mira picks it"):
- **When it shows.** Whenever a date was read without a year. Text: "Year: not printed. Which year is it?"
- **Choices.**
  - Chips for 2026 and 2027, plus "Other year", which takes a number from 2026 to 2030 (the `wedding_date` and `create_event` range, domain §3.1–3.2).
  - **No chip is preselected,** not even the one that matches the printed weekday.
- **Hint.**
  - When the card prints a weekday, the server works out which years from 2026 to 2030 put that date on that weekday and sends them in the draft (`weekday_matches`). The form then shows, for example, "14 December 2026 is a Monday, as printed."
  - If no year matches, it says so.
- **Warnings after a pick.** Neither warning blocks saving.
  - Weekday mismatch: "The card says Monday, but 14 December 2027 is a Tuesday."
  - Past date: "This date has passed." Today is 25 Nov 2026.
- **Scope.** The chosen year applies to every function's date. Each function's date stays editable on its own.
- **A year printed on the card** is prefilled but always as `check` ("Read as 2026"), never `read`. A made-up year is the very failure this feature has to avoid.

**How printed text becomes fields.** Code applies these rules to the printed text only; the model is never asked to interpret anything.

| Draft field (command input) | Taken from | Rule |
|---|---|---|
| Any value | Any leaf | Trim spaces. Null, empty or confidence 0 means `not_printed`. A value that arrives with confidence 0 is dropped. Devanagari digits (०–९) are read as 0–9. A value longer than its command's limit is cut to the limit and marked `check` (`bride_name` and `groom_name` 60, `title` 40, `venue_name` 80; domain §3.1–3.2). Printed text that can't become a valid value (such as "31 November") leaves the input empty, marked `check`, with the printed text shown. |
| `bride_name`, `groom_name` | `bride_name`, `groom_name` | Copied as printed. No surname is ever added (the Arora card prints none for the couple). |
| `event_kind` | `events[].event_name` | Match the printed name, ignoring case: **mehendi** (mehendi, mehndi, mehandi, henna, मेहंदी, मेंहदी); **haldi** (haldi, pithi, हल्दी); **sangeet** (sangeet, sangeeth, संगीत); **wedding** (wedding, shaadi, shadi, vivah, vivaah, shubh vivah, marriage, pheras, phere, muhurat, lagna, विवाह, शादी, शुभ विवाह, फेरे, मुहूर्त); **reception** (reception, रिसेप्शन, स्वागत समारोह, प्रीतिभोज). With no match the kind is `other` and `title` is the printed name, marked `check`. With no name at all the kind is empty and the owner picks one. |
| `date` | `events[].date_text` | A day from 1 to 31 (with or without st, nd, rd or th) beside a month name. English month names may be full or three letters. Hindi month names cover जनवरी to दिसंबर, including both spellings of फ़रवरी/फरवरी, सितंबर/सितम्बर, नवंबर/नवम्बर and दिसंबर/दिसम्बर. A numeric date is read day first (14.12.26, 14/12/2026). A four-digit year, or a two-digit year in a numeric date (read as 20YY), fills the year as `check`. A weekday name (English, or रविवार to शनिवार) is kept only for the hint and the warning. A day that doesn't exist in that month gives no date. Words such as "to follow" or "the next day" give no date. |
| `date` ("to follow") | All printed text of the function | If a function has no printed date but any of its printed text contains "to follow", it takes the day and month of the function printed just before it, as `check`, with the source "Worked out from 'to follow in the evening'". This is the only value ever worked out rather than copied. |
| `muhurat_time` | `events[].time_text` | If the function's name or time text contains "muhurat" or "मुहूर्त", its clock time goes here ("Muhurat 11:15 AM" gives `muhurat_time` 11:15). |
| `start_time`, `end_time` | `events[].time_text` | Otherwise, a 12-hour time (11:15 AM, 11.15 am, 7 PM, 7:30 p.m.) or a 24-hour time (19:30) fills `start_time`. A range ("7 PM to 11 PM", "7–11 PM") also fills `end_time`. "Onwards" fills only the start. Hindi time words next to a number set AM or PM (प्रातः or सुबह morning, दोपहर afternoon, शाम, सायं or सायंकाल evening, रात or रात्रि night), as `check`. Words without a number ("in the evening", "to follow", "सायंकाल" alone) give no time. If the end isn't after the start on the same day ("8 PM to 1 AM"), `end_time` stays empty and is marked `check`, because `create_event` needs the end on the same day (domain §3.2). |
| `venue_name` | `events[].venue_name` and `venue_address` | The two joined with ", ", skipping an empty part and an address that repeats the name. If the joined text is over 80 characters, use the name alone; the full address stays visible as the source line. The state is the weaker of the parts that were read. `create_event` matches this against the wedding's venues, or creates a new one and says "New venue" (domain §3.2). |
| `wedding_date` (setup) | The first function whose kind is `wedding` | Its day and month, plus the chosen year. If there is no wedding function, the setup date stays empty and setup asks for it. If the owner later sets a function's kind to `wedding`, the setup date follows it. |
| Function list | `events` | Printed order, at most 8 functions. Two functions of the same kind are both shown, and the owner decides. |
| Hosts, RSVP contact | `hosts`, `rsvp_contact` | Copied as printed. |

**When "Use these details" is enabled.** All four must hold:
1. Every `check` field has been ticked "Looks right" or edited.
2. A year is chosen whenever a date was read without one.
3. Every included function has an `event_kind` (plus a `title` for `other`) and a full `date`. These are the only fields `create_event` requires (domain §3.2).
4. Every included function passes `create_event`'s own checks: an end after the start on the same day, a muhurat between them, a date from 2026 to 2030. The form uses the contract's input schema for `create_event` (`src/contracts/commands.ts`, arch §4.3), so a function the dispatcher would reject is flagged here, before saving.

Things that do not block:
- **Time, muhurat and venue are optional** in `create_event`. When they are not printed, the field stays empty and the helper line says "Not printed: the Reception's time and venue. Add them now, or later in Events." (voice-test-set I-03 asks for them the same way).
- **Empty couple names.** `set_wedding_profile` requires them on create, so setup asks for them before it can save, just as it asks today.

The helper line counts what is left, for example "1 thing left: pick the year."

**Nothing found.** If every field is `not_printed`, the form shows "We couldn't find wedding details in this photo." with Try again and Enter by hand.

### 1.5 Confirm and apply

"Use these details" writes nothing. The details are saved only by the two commands that typing already uses, through the one dispatcher (domain §3.0; research-stack calls it `applyAction`).

1. **Hand-off.** The sheet closes, and the setup draft (Lane C's) receives:
   - `bride_name`, `groom_name` and `wedding_date`. Each is marked "from your card" in the setup review (design-direction §7.1: "from your photo: …").
   - The included functions, listed in the setup review as "Functions from your card: added to your draft schedule when you save".
   - If setup already had a name or date, a one-line notice shows the replacement before it happens, for example "Replaces what you entered: Meera → Mira".
   - In the voice-first arm the values go into the open setup turn's draft, if Lane C's setup keeps its draft there (domain §3.8). The card's functions still go through step 4, never through `/api/voice/confirm`, so the voice kill switch never blocks them.
2. **Setup carries on as usual.** It asks for whatever else it normally asks for, such as the budget, guest count and city. The venue address is never copied into `city`, which stays the owner's answer.
3. **Save.** "Save wedding" runs `set_wedding_profile` (create) exactly as the setup form does, with setup's own idempotency key (required on create, domain §3.1).
   - A `wedding_date` without a confirmed year can't reach it: the year picker guarantees one, and the command rejects a missing year with `validation_failed` (`year_required`).
   - The `setup_saved` conversion fires after commit as designed (domain §3.1, flags §5.4).
4. **Functions.** Once the save returns the `wedding_id`, the setup screen calls our apply route (1.7) with it and the reviewed functions.
   - For each included function, in printed order, the route calls the dispatcher with `create_event` and its inputs: `event_kind`, `title` (only for `other`), `date`, `start_time`, `end_time`, `muhurat_time` and `venue_name`.
   - Each call carries the idempotency key `{import_id}:{index}`, where `index` is the function's place in the draft. Voice already uses this shape, `{voice_turn_id}:{index}` (domain V7, §3.8): a UUID, a colon and a number. So the dispatcher's key check accepts it as it accepts voice keys, the key survives the draft being cleared, and two tabs can't make different keys for the same function. Rule I1 lists only UUIDs and the NudgeBee form, so 5.7 asks domain-and-data to name this shape.
   - As in V7, each command runs in its own transaction, and a failure stops the later functions.
   - The functions land in the draft itinerary, so guests see nothing until an owner publishes (domain P1, P5).
5. **Record.** The route stores the `wedding_id` and the created event ids on the import, sets the status to `applied`, and clears the draft text (section 3).

Rules:
- **Checks in the apply route.**
  - The signed-in user is the import's uploader.
  - The import is `ready`, `applied_partial` or `applied`. Applying an `applied` import again only replays (next rule). Any other status gets 409 `import_not_ready`.
  - The dispatcher's usual checks pass: the actor is an owner of `wedding_id` and `create_event` is allowed (domain §3.0 order of checks).
  - The route does not check the flag. It calls no AI, like any form.
- **Replays are safe.** The same keys return the stored receipts (`command_receipts`, domain I2), so a double tap or a network retry creates each function exactly once.
- **Partial failure.**
  - The response gives each function's outcome. Setup shows, for example, "Wedding saved. The Reception couldn't be added: <reason>. Try again."
  - The import becomes `applied_partial`. "Try again" resends every function with the same keys, so finished ones replay and the rest run.
  - Functions already saved show as "Saved" and can no longer be edited here; they are changed later in Events. Sending a saved function with changed values would only get 409 `idempotency_key_reused` (domain I2).
- **If the setup save fails,** nothing is applied and the import stays `ready`.
- **If the page reloads** between "Use these details" and Save, what survives depends on how setup keeps its draft. If setup keeps the draft only in the page, the owner reads the card again (it costs ₹1).
- **Hosts and RSVP contact.**
  - `set_wedding_profile` has no field for either.
  - They are shown under "For your guests" with the note "Shown for reference. Jashn doesn't save this yet." and are not applied.
  - If domain-and-data adds the fields that 5.7 suggests, they are applied with the setup save.
- **#11 never writes:** publications, households, guests, invitations, RSVPs, vendors, money, shagun, requirements, invite style, assets or members.
- **Activity.** Each `create_event` writes its usual activity entry (domain §3.2). Its `source` is `ui`, the value the setup form's saves send, because the owner confirms the functions in a form (5.8, question 2).

### 1.6 Voice shortcut (voice-test-set I-03), optional

Build this only after the button flow passes its checks (5.5).
- **The paperclip's "Printed card" choice** (voice.md 7.3 I-03 and open question 22, adopted at 05:55). The voice dock's paperclip offers two choices. "Couple photo" works everywhere. "Printed card" shows **only on the setup screen**, and only while the setup render's `image_extraction_provider` isn't `off` (flags §3.8). The setup screen passes that to the dock as a prop, so the dock evaluates nothing new. Only members with voice see the paperclip (flags §3.1).
- **What it does.** "Printed card" opens this sheet at `sending` with the chosen photo. The photo goes only to `POST /api/card-imports` (1.7, 3.1), never to the voice turn route or Storage.
- **No voice kind.** voice.md keeps no `extract_invite` kind (its 0.3). Nothing is sent to the dispatcher by voice (domain §0.3), and the model never sees the image. The spoken sentence ("Yeh purana card hai, isse details le lo.") is not needed and not parsed.
- **Spoken with no card attached.** The request gets voice.md 2.3's generic reply ("Yeh abhi voice se nahi ho sakta. Uske page par kar sakte hain."), not a request for a photo, because the model has no kind to recognise it.
- **The spoken reply when the draft is ready** is built in code from the draft, not by the model. For the Arora card voice-test-set expects: "Card se Kabir, Mira aur 14 December mil gaye. Saal aur reception ka time card par nahi hai. Bata dijiye." voice.md's text and voice rules apply: it uses the Bulbul client in `src/server/voice/` and voice.md 1.14's rules, `spoken_replies` included.
- **Kill switch.** `voice_writes_enabled` does not apply here. Reading writes nothing, and the card's functions are saved by the apply route (1.5), never by a voice confirmation.

### 1.7 Our HTTP routes (Lane C)

The routes run on the Node runtime. Field names are snake_case, and errors use the domain envelope `{"ok": false, "error": {"code", "message", "field", "current"}}` (domain §0.1, §3.0).
- **Route handlers, not server actions.** A file can't go through a server action (arch §2.1). The apply route follows `/api/voice/confirm`: one route that calls the dispatcher once per item (domain §3.8).
- **Outside `/api/voice/`.** flags §3.0 gates every `/api/voice/*` route on `voice_pilot`, and reading a card is not voice, so a member without voice can still read one. `src/app/api/card-imports/` is one of Lane C's paths (arch §4.1–4.2).
- **Every response** sends `Cache-Control: no-store` (arch §2.1).

| Route | Who | What it does | Returns |
|---|---|---|---|
| `POST /api/card-imports` (multipart: `idempotency_key`, `language`, `file`) | A signed-in user, while the flag isn't `off` | Checks the limits below. Inserts the import (Postgres makes its `id`), with the provider taken from the flag, a new server-made Sarvam idempotency key and the SHA-256 of the bytes. For `docai` it submits to Sarvam from memory (2.1) and stores `job_id` and `run_id`. For `gemma4` it starts the call in `after()`. | 202 with `import_id` and the stage. A repeat of the same `idempotency_key` with the same bytes and language returns the same 202 without a second job. |
| `GET /api/card-imports/{import_id}` | The uploader | For `docai`: at most one Sarvam status call per import every 2.5 s (2.2). On a final status, the one request that moves the import from `reading` to `fetching` (a conditional update) fetches the results (2.3), builds the draft and stores it; any other request just reports `reading`. After 180 s with no final status: `timed_out`. | 200 with `status`, `stage` and `elapsed_seconds`, plus `draft` or `error_code` |
| `POST /api/card-imports/{import_id}/apply` | The uploader, who owns `wedding_id` | The steps in 1.5 | 200 with each function's outcome |
| `DELETE /api/card-imports/{import_id}` | The uploader | Discard: status `discarded`, draft cleared | 204 |

- **Limits.**
  - A user may have only one import being read (`submitting`, `reading` or `fetching`). A second POST returns 409 `import_in_progress` with that import's id, and the sheet resumes it. Starting a new import discards a `ready` one that was never applied.
  - A user may start at most 10 imports an hour; beyond that, 429 `too_many_imports`.
  - These limits protect Sarvam's shared limit of 30 Extract requests a minute (RS C10, B27) and the credits.
- **Durations.** `maxDuration` is 120 s on the POST route, because the gemma4 call runs in `after()` and that limit bounds it (arch §2.1–2.2). The other routes get 30 s. arch §2.2 lists the same limits.
- **Housekeeping.** Every call to these routes first runs a cheap sweep:
  - Imports stuck in `submitting` for over 60 s become `failed`.
  - Imports still `reading` or `fetching` 180 s after submit become `timed_out`, so a closed tab never leaves one open.
  - Drafts older than 24 hours are cleared, and their imports become `expired`.
- **Byte check.** The server checks that the received bytes are a JPEG, and otherwise returns 422 `validation_failed` on `file`.

**Our error codes** (new for #11 unless marked "domain"):

| Code | HTTP | Cause | The owner sees (1.9) |
|---|---|---|---|
| `unauthenticated` (domain) | 401 | No session, for example a guest link (domain G4) | Sign-in page |
| `not_found` (domain) | 404 | Unknown import, or another user's import: an id the actor may not see (domain §3.0) | "failed" |
| `card_reader_off` | 403 | The flag is `off` (new imports only) | "unavailable" |
| `validation_failed` (domain) | 422 | `field` is `file` (not a JPEG, over 4 MB), `language` or `idempotency_key` | "file" |
| `idempotency_key_reused` (domain) | 409 | Same `idempotency_key` with different bytes or language | Starts a new import |
| `import_in_progress` | 409 | Another import is being read | Resumes it |
| `import_not_ready` | 409 | Apply on an import that isn't `ready`, `applied_partial` or `applied` | "failed" |
| `too_many_imports` | 429 | Over 10 in an hour | "busy" |
| `reader_busy` | 503, with `Retry-After` | Sarvam still says 429 after our retries | "busy" |
| `reader_unavailable` | 503 | Sarvam 401, 402 or 403, or a 429 `seat_budget_exhausted_error` | "unavailable" |
| `read_failed` | 200 (in `error_code`, status `failed`) | Sarvam `failed` or `rejected`, a 400, 404 or 422 from Sarvam, or gemma4 output that doesn't parse | "failed" |
| `read_timed_out` | 200 (in `error_code`, status `timed_out`) | 180 s without a final status | "timed out" |

On apply, each function's result carries the dispatcher's own codes, such as `forbidden` or `validation_failed` (domain §3.0).

**Payload examples.** All values are illustrative.

Response to the POST (202):
```json
{
  "ok": true,
  "import_id": "0b5c9a6e-3f1d-4f7a-9a62-2d8f1c7e4b10",
  "status": "reading",
  "stage": "waiting",
  "provider": "docai",
  "poll_after_seconds": 3
}
```

Response to the status GET while reading (200):
```json
{ "ok": true, "import_id": "0b5c9a6e-…", "status": "reading", "stage": "reading", "elapsed_seconds": 12, "poll_after_seconds": 3 }
```

Response to the status GET when the Arora card is ready (200). Each field carries `value`, `state` and, from Document AI, `confidence`; `printed` holds the source text.
```json
{
  "ok": true, "import_id": "0b5c9a6e-…", "status": "ready", "stage": "ready", "provider": "docai", "pages_total": 1,
  "draft": {
    "bride_name": { "value": "Mira", "state": "read", "confidence": 0.96, "printed": "Mira" },
    "groom_name": { "value": "Kabir", "state": "read", "confidence": 0.97, "printed": "Kabir" },
    "date_read": { "printed": "Monday, 14th December", "day": 14, "month": 12, "year": null, "weekday": "monday", "weekday_matches": [2026], "year_state": "not_printed" },
    "functions": [
      { "index": 0, "event_kind": { "value": "wedding", "state": "read", "printed": "Wedding" }, "date": { "day": 14, "month": 12, "state": "read" }, "muhurat_time": { "value": "11:15", "state": "read", "printed": "Muhurat 11:15 AM" }, "start_time": { "value": null, "state": "not_printed" }, "venue_name": { "value": "Mandap Lawn, Mallige Gardens, Whitefield, Bengaluru", "state": "read" } },
      { "index": 1, "event_kind": { "value": "reception", "state": "read", "printed": "Reception" }, "date": { "day": 14, "month": 12, "state": "check", "printed": "to follow in the evening" }, "start_time": { "value": null, "state": "not_printed" }, "venue_name": { "value": null, "state": "not_printed" } }
    ],
    "hosts": { "value": "Smt. Neelam & Shri Rakesh Arora; Smt. Sunita & Shri Anil Deshpande", "state": "read" },
    "rsvp_contact": { "value": "Neelam Arora · +91 90000 00901", "state": "read" }
  }
}
```

Apply request, after Mira picks 2026 and types the reception's time and the original hall from demo-data §2–3:
```json
{
  "wedding_id": "<id returned by set_wedding_profile>",
  "functions": [
    { "index": 0, "event_kind": "wedding", "date": "2026-12-14", "muhurat_time": "11:15", "venue_name": "Mandap Lawn, Mallige Gardens, Whitefield, Bengaluru" },
    { "index": 1, "event_kind": "reception", "date": "2026-12-14", "start_time": "19:30", "venue_name": "Banyan Hall, Mallige Gardens" }
  ]
}
```

Apply response (200). On a replay, `outcome` reads `replayed` for each function.
```json
{
  "ok": true,
  "status": "applied",
  "functions": [
    { "index": 0, "outcome": "applied", "event_id": "…", "idempotency_key": "0b5c9a6e-…:0" },
    { "index": 1, "outcome": "applied", "event_id": "…", "idempotency_key": "0b5c9a6e-…:1" }
  ]
}
```

### 1.8 Stored record: `app.card_imports` (Lane A)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, primary key | Generated by Postgres; the routes call it `import_id` |
| `request_idempotency_key` | uuid | The browser's upload key; unique per `user_id` |
| `user_id` | uuid | The uploader (Supabase auth user) |
| `wedding_id` | uuid, null until applied | |
| `provider` | `docai` or `gemma4` | Taken from the flag at creation and never changed |
| `language` | `en-IN` or `hi-IN` | |
| `image_sha256`, `image_bytes` | text, int | The hash and size of the bytes received. Never the image itself. |
| `sarvam_idempotency_key` | uuid, unique | Made by the server and sent as `Idempotency-Key` |
| `sarvam_job_id`, `sarvam_run_id` | text, null | Document AI only |
| `status` | enum `card_import_status` | `submitting`, `reading`, `fetching`, `ready`, `failed`, `timed_out`, `applied`, `applied_partial`, `discarded`, `expired` |
| `sarvam_status`, `last_checked_at` | text and timestamptz, both nullable | The last Sarvam status seen and when; used by the 2.5 s guard |
| `submitted_at`, `ready_at`, `applied_at` | timestamptz, null | |
| `error_code`, `error_detail` | text, null | Our code. The detail holds only Sarvam's HTTP status and `error.code`, never content. |
| `pages_total` | int, null | From Sarvam's `usage` |
| `draft` | jsonb, null | The draft in 1.7's shape. Cleared on apply, discard or expiry. |
| `field_counts` | jsonb, null | How many fields were `read`, `check` and `not_printed`. Kept after the draft is cleared, for the README's honest numbers. |
| `applied_event_ids` | jsonb, null | The events the import created |
| `created_at`, `updated_at` | timestamptz | |

It is an operational table like `voice_turns`: Lane A adds it, and only Lane C's server module writes it, never the dispatcher or a browser (arch §4.2 rule 1, §9 item 14). It has RLS on and no policies, so only the server reaches it, as with every app table (domain §0.2, arch §9 item 1). It is not part of `weddings.version` or the publication snapshot.

### 1.9 Copy

| Key | English | Hindi |
|---|---|---|
| Entry | Start from a printed card | छपे हुए कार्ड से शुरू करें |
| Sheet title | Read a printed card | छपा हुआ कार्ड पढ़ें |
| Buttons | Take a photo · Choose a photo | फ़ोटो खींचें · फ़ोटो चुनें |
| Language | The card is mostly in: English · हिंदी | कार्ड ज़्यादातर किस भाषा में है: English · हिंदी |
| Privacy line (reader `docai`) | Sarvam AI reads the photo. Jashn doesn't keep it, and nothing is saved until you check the details. Sarvam keeps uploaded documents for up to 8 days. | फ़ोटो Sarvam AI पढ़ता है। Jashn उसे अपने पास नहीं रखता, और आपके जाँचने से पहले कुछ भी सेव नहीं होता। Sarvam अपलोड किए गए दस्तावेज़ 8 दिन तक रखता है। |
| Privacy line (reader `gemma4`) | Sarvam AI reads the photo. Jashn doesn't keep it, and nothing is saved until you check the details. Sarvam doesn't publish how long it keeps photos sent to this reader. | फ़ोटो Sarvam AI पढ़ता है। Jashn उसे अपने पास नहीं रखता, और आपके जाँचने से पहले कुछ भी सेव नहीं होता। Sarvam ने यह नहीं बताया है कि इस रीडर को भेजी गई फ़ोटो वह कितने समय तक रखता है। |
| Preparing | Preparing the photo | फ़ोटो तैयार हो रही है |
| Sending | Sending to Sarvam | Sarvam को भेजी जा रही है |
| Waiting | Waiting at Sarvam · 0:04 | Sarvam पर इंतज़ार · 0:04 |
| Reading | Reading the card · 0:12 | कार्ड पढ़ा जा रहा है · 0:12 |
| Slow | Still reading. You can fill in the rest of setup meanwhile. | अभी पढ़ा जा रहा है। तब तक आप बाकी जानकारी भर सकते हैं। |
| States | Read · 97% · Please check · 62% · Not printed · Changed by you · no score | कार्ड से पढ़ा गया · कृपया जाँच लें · कार्ड पर नहीं छपा · आपने बदला · कोई स्कोर नहीं |
| Year | Year: not printed. Which year is it? | साल: कार्ड पर नहीं छपा। कौन सा साल है? |
| Weekday hint | 14 December 2026 is a Monday, as printed. | 14 दिसंबर 2026 को सोमवार है, जैसा कार्ड पर छपा है। |
| Tick | Looks right | सही है |
| Primary | Use these details | ये जानकारी इस्तेमाल करें |
| Secondary | Enter by hand instead | ख़ुद भरें |
| Failed | Couldn't read this card. Try a clearer photo, or enter the details by hand. | यह कार्ड पढ़ा नहीं जा सका। साफ़ फ़ोटो लेकर फिर कोशिश करें, या जानकारी ख़ुद भरें। |
| Timed out | This is taking too long. Try again, or enter the details by hand. | बहुत समय लग रहा है। फिर कोशिश करें, या जानकारी ख़ुद भरें। |
| Busy | Sarvam is busy. Try again in a minute. | Sarvam अभी व्यस्त है। एक मिनट बाद फिर कोशिश करें। |
| Unavailable | Card reading isn't available right now. Enter the details by hand. | अभी कार्ड पढ़ने की सुविधा उपलब्ध नहीं है। जानकारी ख़ुद भरें। |
| File | Use a JPG or PNG photo under 4 MB. | 4 MB से छोटी JPG या PNG फ़ोटो चुनें। |
| Nothing found | We couldn't find wedding details in this photo. | इस फ़ोटो में शादी की जानकारी नहीं मिली। |
| Reference only | Shown for reference. Jashn doesn't save this yet. | सिर्फ़ देखने के लिए। Jashn इसे अभी सेव नहीं करता। |

---

## 2. Sarvam Document AI

### 2.0 Rules for every call (RS §3.0)

- **Server only.**
  - Calls go from our server only, with the header `api-subscription-key: <SARVAM_API_KEY>`.
  - The key never reaches the browser (domain G8).
- **Plain `fetch`, not the SDK.** `sarvamai@1.1.22`'s `docAi.extract` has no `language` field; 1.1.23-alpha.2 adds it (RS C14).
- **Multipart.** Append the image as a Blob with a filename, and never set `Content-Type` by hand, because `fetch` has to add the boundary.
- **Errors** use the envelope `{"error": {"message", "code", "request_id"}}`.
- **Retry policy.** Retry only 429, 500, 502 and 503, with backoff, honouring `Retry-After`. Never retry 400, 401, 402, 403 or 422, or a 429 whose code is `seat_budget_exhausted_error`.

### 2.1 Submit: returns 201, carries an Idempotency-Key

`POST https://api.sarvam.ai/doc-ai/v1/job/extract`, multipart, with these headers:
- `api-subscription-key`
- `Idempotency-Key`: the import's `sarvam_idempotency_key`

| Field | Value | Source |
|---|---|---|
| `file` | The prepared JPEG from memory, filename `card.jpg`, type `image/jpeg` | RS §4: JPG, PNG or PDF; one request is one logical document |
| `schema` | The schema in 2.5, as a JSON **string** | RS §4 |
| `language` | `en-IN` or `hi-IN`, always (2.4) | RS B22 |
| `output_format` | `json` | RS B21 |
| `mode` | `basic` (₹1 a page). Use `advanced` (₹2.50 a page) only if test T5b chose it. | RS §4, B29 |

**Don't send** (RS B21):
- `config_id`: send exactly one of `schema` and `config_id`.
- `upload_ids`: send exactly one of `file` and `upload_ids`.
- `model`: it defaults to `sarvam-vision-v1`, and other values return 400.
- `classification`: not available yet.

**Response: 201 Created**, not 200 (RS Verdict 2, B23). Treat any 2xx as success, and store `job_id` and `run_id`.
```json
{ "job_id": "…", "status": "pending", "run_id": "…" }
```

**Idempotency** (RS B25):
- **Sarvam's rule.** Resending the identical request with the same key returns the original `job_id`. The same key with a changed request returns 409 `IDEMPOTENCY_KEY_REUSED`.
- **Retries inside the POST route** (429 or 5xx, at most 2, at 1 s and 3 s) resend the same bytes and fields with the same key.
- **A repeated POST with the same upload key** is allowed only with the same bytes (same SHA-256) and the same language. It then reuses the stored Sarvam key.
  - If the import already has a `job_id`, the route only returns its stage.
  - If it is still `submitting` without one, the route resubmits with the same key, which is safe under B25.
- **A changed repeat** returns our 409 `idempotency_key_reused`.
- **"Try again"** always makes a new import with a new key.
- **If Sarvam's 409 `IDEMPOTENCY_KEY_REUSED` ever arrives,** it is our bug. Log it, mark the import `failed`, and let the owner try again.

### 2.2 Status: polled every 3 s

- **Endpoint.** `GET https://api.sarvam.ai/doc-ai/v1/job/{job_id}/status`.
- **Driven by the browser.** The browser's 3 s poll drives it through our status route. One serverless request is never held open (RS §4).
- **Values.** `pending`, then `running`, then one of `completed`, `partially_completed`, `failed` or `rejected` (RS B24). Only `status` is read; the rest of the body is undocumented in our research.
- **Guard.** At most one Sarvam status call per import every 2.5 s, using `last_checked_at`, so two open tabs don't double the rate.
- **Timeout.** 180 s after submit, which matches T5's 60 polls of 3 s. No job duration is documented (RS §4, B37); T5 measures it.
- **Rate limit.**
  - Extract allows 30 requests a minute per account, shared by every key, and the docs don't say whether status polls count (RS B27, C10, Verdict 7).
  - One import polled every 3 s makes 20 status calls a minute, plus one submit and one results call. That is why each user gets one active import.
  - On a 429, poll no faster than the `Retry-After` value, and never faster than every 5 s (RS §4 allows 3 to 5 s).
- **Other errors.** A 404 `not_found_error` (job not found) ends the import as `read_failed`. A 5xx is retried on the next poll.

### 2.3 Results: 409 until done, gzip-compressed

- **Endpoint.** `GET https://api.sarvam.ai/doc-ai/v1/job/{job_id}/results`.
- **When to call it.** Only after `completed` or `partially_completed`. `failed` and `rejected` end the import without a results call.
- **Too early.** Before a final status, the call returns 409 `RESULTS_NOT_READY` (RS Verdict 2). If that happens because of lag, set the import back to `reading` and try again on the next poll.
- **Compression.** The body is gzip-compressed. Node's `fetch` decodes it automatically; with curl, use `--compressed` (RS Verdict 2, B24).
- **Shape** (RS §4, C7):
  - `result` holds the values in the schema's shape.
  - `annotations` mirrors `result` leaf by leaf, nested inside `events`. Each leaf is `{confidence, sources[]}`, and a source carries `page_num`, `filename` and either `bbox_norm` or `region_norm`.
  - A field Sarvam couldn't find is `null`, with confidence 0 and no sources.
  - `usage.pages_total` and `version` complete the body.
- **Reading it.**
  - Read only the keys in our schema and ignore anything else.
  - If an annotation is missing for a value that exists, treat the value as `check`.
  - Validate the draft against the contract type before storing it.
- **`partially_completed`.** Build the draft from what came back, and show "Sarvam could read only part of this card." Every rule in 1.4 still applies.

Illustrative results for the Arora card:
```json
{
  "type": "extract", "job_id": "…", "status": "completed",
  "result": { "bride_name": "Mira", "groom_name": "Kabir", "hosts": "Smt. Neelam & Shri Rakesh Arora … Smt. Sunita & Shri Anil Deshpande", "events": [
    { "event_name": "Wedding", "date_text": "Monday, 14th December", "time_text": "Muhurat 11:15 AM", "venue_name": "Mandap Lawn, Mallige Gardens", "venue_address": "Whitefield, Bengaluru" },
    { "event_name": "Reception", "date_text": null, "time_text": "to follow in the evening", "venue_name": null, "venue_address": null } ],
    "rsvp_contact": "Neelam Arora · +91 90000 00901" },
  "annotations": {
    "bride_name": { "confidence": 0.96, "sources": [ { "page_num": 1, "filename": "card.jpg", "bbox_norm": [0.42, 0.44, 0.58, 0.49] } ] },
    "events": [ { "event_name": { "confidence": 0.9, "sources": [] } }, { "date_text": { "confidence": 0, "sources": [] } } ]
  },
  "usage": { "pages_total": 1 }, "version": 1
}
```

**Source boxes (optional).** Tapping a field can outline its `bbox_norm` on the browser's copy of the photo. Our research doesn't say whether the four numbers are two corners or a corner plus a size, so check T5's output before building it. Fields with `region_norm` or no sources get no outline.

### 2.4 Language: always sent

- **Always send `language`** (RS Verdict 4, B22). Sarvam's guide and the spec's description say the default is `indic`, but the spec's `default` field says `en-IN`. Never rely on either.
- **Which value.** Send `en-IN` when the owner picks English (the default) and `hi-IN` for हिंदी.
- **Mixed cards.** A mostly English card with one Devanagari blessing line, like the Arora card, is `en-IN`: no field is read from the blessing line.

### 2.5 The extraction schema

**The exact string.** The schema is the one in RS §4. It is also the one-line `invite_schema.json` in RS §7 T5. Keep that exact string as one server constant, so T5 checks exactly what the app sends. If anyone changes the schema, rerun T5 with the new string.

| Path | Type | Description sent (exactly) | Can come back null | Needed to save | Goes to |
|---|---|---|---|---|---|
| (root) | object | (none; the root is not a field) | no | | |
| `bride_name` | string | "Bride's full name exactly as printed on the card" | yes | Yes, but setup asks for it if it is empty | `set_wedding_profile.bride_name` |
| `groom_name` | string | "Groom's full name exactly as printed on the card" | yes | Yes, but setup asks for it if it is empty | `set_wedding_profile.groom_name` |
| `hosts` | string | "Names of the inviting family or parents exactly as printed" | yes | no | Reference only today |
| `events` | array of objects | "Each wedding function printed on the card, in printed order" | yes (null or empty) | no | Function list |
| `events[]` | object | "One wedding function" | n/a | | One function |
| `events[].event_name` | string | "Function name as printed, e.g. Mehendi, Haldi, Sangeet, Wedding, Reception" | yes | The kind is needed to include the function | `create_event.event_kind` (and `title` for `other`) |
| `events[].date_text` | string | "Date exactly as printed; include the year only if it is printed" | yes | A full date is needed to include the function | `create_event.date`; `set_wedding_profile.wedding_date` from the wedding function |
| `events[].time_text` | string | "Time exactly as printed" | yes | no | `create_event.start_time`, `end_time` or `muhurat_time` |
| `events[].venue_name` | string | "Venue name exactly as printed" | yes | no | `create_event.venue_name` |
| `events[].venue_address` | string | "Venue address exactly as printed" | yes | no | Joined into `create_event.venue_name` |
| `rsvp_contact` | string | "RSVP contact names and phone numbers exactly as printed" | yes | no | Reference only today |

Why it is shaped this way (RS Verdict 5, B28, C7):
- **Valid structure.** Every field has a `type` and a non-empty `description` (the SDK 1.1.22 docstring requires one). The object has `properties`, the array has `items`, and nesting is 4 levels: root, `events`, item, leaf.
- **No union types and no open objects.** No field uses `type: ["string","null"]`, and no object lacks `properties` or uses `additionalProperties`. The docs don't say how such constructs are treated.
- **Nullability is not declared.** Sarvam itself returns `null` with confidence 0 for anything it can't find, and the app treats null, an empty string and confidence 0 alike as `not_printed`.
- **No `required` list,** so a missing field can always come back null instead of being forced into existence.
- **Printed text only.** Dates and times are parsed in code, and the year comes from the owner when it isn't printed (RS §4).

### 2.6 Error codes (RS §5 error table, C12)

| HTTP | `error.code` | Means here | We do | Owner sees |
|---|---|---|---|---|
| 201 | none | Job created (submit) | Store `job_id` and `run_id` | Waiting |
| 400 | `invalid_request_error` | Bad parameter, file or schema | `read_failed`, no retry; log the message | Failed |
| **401** | `UNAUTHORIZED` | **Missing or invalid key. Document AI only:** every other Sarvam API, including gemma4's chat, answers 403 instead | `reader_unavailable`, no retry. Log "Document AI key rejected (401)"; the operator checks `SARVAM_API_KEY`, and the user sets the flag to `off` | Unavailable |
| 402 | `insufficient_quota_error` | Out of credits. The balance is shared by every key and product, so voice is failing too (RS C11) | `reader_unavailable`, no retry; top up | Unavailable |
| 403 | (billing or entitlement) | On Document AI, a billing or plan problem, not a bad key | `reader_unavailable`, no retry | Unavailable |
| 404 | `not_found_error` | Job not found | `read_failed` | Failed |
| 409 | `RESULTS_NOT_READY` | Results asked for too early | Keep polling | Reading |
| 409 | `IDEMPOTENCY_KEY_REUSED` | Same key, changed request: our bug | `read_failed`, log it | Failed (Try again) |
| 413 | `FILE_TOO_LARGE` | File over 100 MiB; our 4 MB cap prevents it | `validation_failed` on `file` | File |
| 422 | `unprocessable_entity_error` | Validation failure | `read_failed`, no retry | Failed |
| 429 | `rate_limit_exceeded_error`, `model_rate_limit_exceeded_error` | Rate or capacity | Back off with `Retry-After`. Submit: at most 2 retries, then `reader_busy`. Polls: slow to 5 s or more. | Busy |
| 429 | `seat_budget_exhausted_error` | Not temporary | `reader_unavailable`, no retry | Unavailable |
| 500, 502, 503 | `internal_server_error`, `model_call_failed`, `model_overloaded` | Transient | Retry with backoff (submit: at most 2, same key). Polls continue. | Reading, then Failed if it persists |

### 2.7 Fallback: gemma4 on `/v2/chat/completions`

- **When it is used.**
  - Only when `image_extraction_provider` is `gemma4`.
  - The user, the only Flagsmith seat, sets it after T5 fails and T6 passes at about 10:15, or during the day if Document AI starts failing (decisions D9 and D115).
  - There is no automatic switch inside one import, and the provider is fixed per import: the fallback sits behind a flag, as RS §4 advises.
- **Request.** `POST https://api.sarvam.ai/v2/chat/completions`, JSON, with the header `api-subscription-key`. Send exactly the body T6 tests (RS §4, §7 T6):

```json
{
  "model": "gemma4",
  "max_tokens": 1000,
  "messages": [ { "role": "user", "content": [
    { "type": "text", "text": "Read this wedding invitation. Copy names, dates, times and venues exactly as printed. Use an empty string for anything that is not printed." },
    { "type": "image_url", "image_url": { "url": "data:image/jpeg;base64,<the prepared JPEG>" } }
  ] } ],
  "response_format": { "type": "json_schema", "json_schema": { "name": "invite", "strict": true, "schema": "<the 2.5 schema as a JSON object, not a string>" } }
}
```

**Reasoning setting: send no `reasoning_effort` at all.**
- **gemma4 has reasoning off by default** (RS C8, §4).
- **Sending `"none"`.** It is the documented off value on `/v2`, but the spec's own enum text says it switches thinking off only on the DeepSeek models and `qwen38-27b`, and that other models reject it or keep thinking (RS §2c).
- **Sending `null`.** On `/v2` it is undocumented (RS B9).
- **Check every call.** Confirm that `usage.completion_tokens_details.reasoning_tokens` is 0 or absent, and log a warning otherwise (RS §3.2).
- **If T6 shows reasoning tokens,** run T6 once more with `"reasoning_effort": "none"` added (T6b). Keep that field only if the call returns 200 with 0 reasoning tokens.

**Rules:**
- **Image.** A base64 data URI of the prepared JPEG. A remote image URL returns 400 (RS C8), so a storage link is never sent.
- **Size.** The body must stay under 10 MiB, or the call returns 413 (RS C8). A 4 MB JPEG is about 5.3 MB in base64, so the 4 MB cap keeps us under.
- **Tokens.** `max_tokens` 1000, within the Starter plan's cap of 4,096 (RS Verdict 6, B11).
- **Schema form.** The schema goes in as an object here. In Document AI it is a string.
- **Synchronous.** One call, run in `after()` from the POST route and bounded by its 120 s `maxDuration`. The status route only reads our table.
- **Output.**
  - Read `choices[0].message.content`, a JSON string, and parse it into the same shape as Document AI's `result`.
  - The import is `read_failed` if there is no content, if it doesn't parse or fit the schema, or if `finish_reason` is `"length"`. There is one attempt only.
- **No confidence scores.** Every non-empty value is `check` ("no score"), and every empty string is `not_printed` (RS §4).
- **Weaker on Indic scripts.** The docs say gemma4 is "not specifically tuned for Indian languages" (RS C8), so expect worse reads of `hi-IN` cards.
- **Errors.**
  - A bad key on chat completions is 403 `invalid_api_key_error`, not 401 (RS C12), and maps to `reader_unavailable`.
  - 402, 413, 429 and 5xx are handled as in 2.6.
- **Limits and price.** 50 requests a minute (RS C10). ₹35 input and ₹90 output per million tokens (RS B29): about ₹3 for 20 calls (RS §5 estimate).

### 2.8 Cost and limits for #11

| Item | Figure | Source |
|---|---|---|
| Document AI Extract, basic | ₹1 a page; one photo is one page | RS B29 |
| Document AI Extract, advanced | ₹2.50 a page | RS B29 |
| Expected use today | About 30 imports, about ₹30 (the build-day estimate already counts 30 Extract pages) | RS §5 |
| Extract limit | 30 requests a minute, per account, shared by every key | RS C10, B27 |
| File limit | 100 MiB per file and 500 pages per request; data retained 8 days | RS B26, B27 |
| gemma4 | 50 requests a minute; body at most 10 MiB | RS C10, §5 |
| Credits | Shared by every key and product; an empty balance returns 402 everywhere | RS C11 |

---

## 3. Privacy

### 3.1 The photo: storage and deletion

- **It is never stored by Jashn.**
  - The browser re-encodes the photo, which drops all metadata, including the GPS location (1.2).
  - It is sent once, over HTTPS, to our POST route. The route holds it in memory for that one request (and, for gemma4, for that request's `after()` work), sends it to Sarvam and drops it.
  - It is never written to Supabase Storage, the database, the function's disk or any log.
- **Deletion after extraction.** Nothing of ours needs deleting. When the request ends, the bytes are gone.
  - The review thumbnail is the browser's own copy, released when the sheet closes.
  - We keep only the SHA-256 of the bytes (to match retries), the size and the timings.
- **Why not the `uploads` bucket.**
  - The prepared card is under 4 MB, which fits Vercel's 4.5 MB request limit, the same reasoning as the audio exception in STK §6.6.
  - Storing it would add a signed upload, a deletion step and a sweep, and leave a copy to protect.
  - It also can't use `add_asset`'s path `uploads/{wedding_id}/…` (domain §3.2): during setup there is no wedding yet.
  - So #11 does not use the `invite_scan` asset kind, and arch §3.6 keeps card photos out of the `uploads` bucket.
  - The card photo is the second file that may travel in a route handler's body, beside voice audio (STK §6.6). AGENTS.md rule 10 already names both: "Only `/api/voice/turn` and `/api/card-imports` accept a file body, and they never store it" (arch §7.3). Even with Storage the bytes would pass through a function, because the server has to read them to send them to Sarvam.
- **At Sarvam.**
  - Document AI retains data for 8 days (RS B26). Our research found no call that deletes a job sooner, so ask Sarvam at their 11:20 slot (astra-plan §5).
  - Our research has no retention figure for gemma4 chat completions, so treat it as unknown.
  - The privacy line shows the sentence that fits the import's reader (1.9), and the README says both.

### 3.2 The extracted text

- **Where it lives.** It is stored as the import's `draft`, which only the uploader can read.
- **When it is cleared.**
  - On apply or discard.
  - By the sweep (1.7), which clears drafts older than 24 hours and marks them `expired`.
- **What stays afterwards:** the provider, language, statuses, Sarvam job and run ids, timings, page count, `field_counts` and the ids of the created events. No names, phone numbers or dates.
- **After apply,** the names, date and functions are ordinary wedding records under the usual role rules (domain §2.7, demo-data §1.3).

### 3.3 No guest data sent

| Sent to Sarvam | Never sent |
|---|---|
| **Document AI:** the photo; the fixed schema (field descriptions only); `language`, `output_format` and `mode`; the API key and a random `Idempotency-Key` | Anything from our database: households, guests, their phone numbers or emails, RSVPs, invitations, money, vendors, the wedding snapshot, user or wedding ids, the owner's email, tokens |
| **gemma4:** the fixed prompt, the photo as a data URI, the schema, `model` and `max_tokens` | The same list |

- **The card itself** shows printed names and an RSVP phone number. It is the owner's own document, sent by their own action, after the privacy line told them where it goes. domain G9 sets the equivalent rule for voice, where what leaves is the transcript and a role-filtered snapshot without phone numbers.
- **Flagsmith gets nothing from #11.** No traits and no events come from the card (flags §2.3 lists what is never sent), and guests are never identified (flags §2.1).
- **Logs.** They hold the import id, provider, HTTP status, Sarvam `error.code`, job and run ids, timings, page count and `field_counts`. They never hold a field value, the image or its base64. Vercel keeps runtime logs for only 1 hour (STK §2).

### 3.4 Who can reach it

- **Uploader only.** Only the signed-in uploader can create, poll, apply or discard an import.
- **Managers and guests.** Nobody can read another person's import: it answers 404, as for any id the actor may not see (domain §3.0). A guest link carries no session, so it gets 401 (domain G4).
- **The guest site.** Nothing from an import appears there until an owner publishes the functions it created (domain P5).

### 3.5 Demo hygiene

- **Fictional cards only.** Use only the fictional cards in section 4 today.
- **Never a real family's card.** It carries real names and phone numbers, and Sarvam keeps it for 8 days.

---

## 4. Fictional sample invitation for testing

### 4.1 The main test card: `arora-printer-proof.jpg`

This is the card from demo-data §12: a photographed printer's proof sent by the Arora family. Make it **after 09:00**, because demo-data marks it as design work under rule 4. No image is made tonight. The teammate lays it out after the NudgeBee checks. If they haven't by 09:50, L builds it instead at about 10:00–10:05, right after the worktrees (decisions D73 and D119, step 1 below). Either way it exists by about 10:05 for T5 and T6, at about 10:05–10:15 (decisions D7 and D119). The card prints exactly:

> ॥ श्री गणेशाय नमः ॥
> Smt. Neelam & Shri Rakesh Arora
> request the pleasure of your company at the wedding of their son
> **Kabir**
> with
> **Mira**
> daughter of Smt. Sunita & Shri Anil Deshpande
> Monday, 14th December
> Muhurat 11:15 AM · Mandap Lawn, Mallige Gardens, Whitefield, Bengaluru
> Reception to follow in the evening
> RSVP: Neelam Arora · +91 90000 00901

What the card deliberately leaves out (demo-data §12):
- **No year.** The year must stay empty until the owner picks one. 14 December falls on a Monday in 2026 (demo-data §14, check 26), so the hint can say so.
- **No reception time or hall.** "To follow in the evening" is not a time.

Other built-in tests:
- **No surnames for the couple.** The surnames appear only in the parents' lines.
- **No "Wedding" heading.** The main function is named only in "the wedding of their son", so the reader has to recognise it.
- **A phone number in the demo pattern** (+91 90000 0xxxx).
- **A Devanagari blessing line on an English card,** which is still sent as `en-IN`.

**Look,** following design-direction and demo-data §11.2:
- **Card.** Portrait at 5:7. Ivory stock `#F7EFDF` with a thin double hairline border in gold `#C9A24E`, small corner ornaments and printer's crop marks at the corners.
- **Type.** The blessing line in gold-ink `#7D5B17` in Tiro Devanagari Hindi or Noto Serif Devanagari. "Kabir" and "Mira" large in maroon `#6A1224`, set in Eczar. Everything else in ink `#2B1D1A`.
- **Label.** The card text stays exactly as printed above. The "fictional" label sits *beside* the card: a paper slip in the photo reading "FICTIONAL TEST CARD".

**How to make it** (the teammate after the NudgeBee checks, about 10 minutes; or L at about 10:00–10:05, decision D119; done by about 10:05):
1. **Lay it out.** It is a fictional printer's proof, never made with an image generator: they garble printed text.
   - **The teammate:** one portrait slide in Keynote or Google Slides.
   - **L, if the teammate hasn't laid it out by 09:50** (decision D73): an HTML page outside the repo, in `~/sarvam-smoke`, with the text and look above. L renders it to JPEG with headless Chrome at about 10:00–10:05, after the worktrees (decision D119). The page is a throwaway test asset and is never committed.
2. **Export a clean copy.** Save it as `arora-printer-proof-clean.jpg` and copy it to `~/sarvam-smoke/invite.jpg`, so T5 and T6 (RS §7) run exactly as written. This copy is enough for T5 and T6 at about 10:05–10:15. On L's path the page is `~/sarvam-smoke/arora-card.html`, and the render and the JPEG conversion are two commands (1000 × 1400 keeps the 5:7 portrait).

   Run at 09:00 or later, from `~/sarvam-smoke`:

   ```bash
   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu --hide-scrollbars --window-size=1000,1400 --screenshot=arora-clean.png "file://$HOME/sarvam-smoke/arora-card.html"
   sips -s format jpeg -s formatOptions 92 arora-clean.png --out invite.jpg && cp invite.jpg arora-printer-proof-clean.jpg
   ```
3. **Photograph it.** Print it, or show it full screen, and photograph it with the iPhone in daylight at a slight angle (about 10°), with the slip beside it. Save the result as `arora-printer-proof.jpg`.
4. **Keep the working files outside the repo** in `~/sarvam-smoke` (RS §6). If the sample link ships (1.2), Lane C commits `public/samples/arora-printer-proof.jpg` in its own PR: `public/samples/` is Lane C's folder (arch §4.1–4.2). It is fictional and labelled.

### 4.2 Expected draft for the Arora card

| Field | Expected value | Expected state |
|---|---|---|
| Groom / bride | Kabir / Mira | `read` or `check`; no surname added |
| Date read | "Monday, 14th December": 14 December, weekday Monday | Day and month `read`; year `not_printed` |
| Year | Empty; no chip preselected; hint "14 December 2026 is a Monday, as printed." | `not_printed` until picked |
| Wedding function | Kind `wedding`; muhurat 11:15 (printed "Muhurat 11:15 AM"); start and end empty; venue "Mandap Lawn, Mallige Gardens, Whitefield, Bengaluru" | Kind, muhurat and venue `read`; start `not_printed` |
| Reception function | Kind `reception`; date 14 December, worked out from "to follow"; time and venue empty | Date `check`; time and venue `not_printed`, with "add them now, or later in Events" |
| Hosts | "Smt. Neelam & Shri Rakesh Arora; Smt. Sunita & Shri Anil Deshpande" (any faithful wording) | Reference only |
| RSVP contact | "Neelam Arora · +91 90000 00901" | Reference only |

This matches voice-test-set I-03's "missing" list: year, reception time and reception hall.

### 4.3 Optional variants

Make these only if time allows, in the same folder:

| File | What it is | Expected |
|---|---|---|
| `arora-angle-glare.jpg` | The same card at about 30°, with a lamp's glare across the date | Lower confidence: more `check`s, nothing invented |
| `not-a-card.jpg` | A photo of a blank sheet of paper on a desk | Every field `not_printed`; "We couldn't find wedding details in this photo." |
| `arora-hindi.jpg` | A Devanagari version, sent as `hi-IN` (text below) | Bride मीरा, groom कबीर. Wedding function from "शुभ विवाह", muhurat 11:15 as `check` (प्रातः). Reception from "प्रीतिभोज", with date, time and venue `not_printed` (no "to follow" phrase). Year `not_printed`. |

Text of `arora-hindi.jpg`:

> ॥ श्री गणेशाय नमः ॥
> श्रीमती नीलम एवं श्री राकेश अरोड़ा
> अपने सुपुत्र
> **कबीर**
> संग
> **मीरा**
> सुपुत्री श्रीमती सुनीता एवं श्री अनिल देशपांडे
> के शुभ विवाह में आपको सादर आमंत्रित करते हैं
> सोमवार, 14 दिसंबर
> मुहूर्त प्रातः 11:15 बजे · Mandap Lawn, Mallige Gardens, Whitefield, Bengaluru
> सायंकाल प्रीतिभोज
> RSVP: नीलम अरोड़ा · +91 90000 00901

### 4.4 Rule cases for the unit tests (vitest is in the toolchain, STK §4)

| Input | Expected |
|---|---|
| Date "Monday, 14th December" | 14 December, year `not_printed`, weekday Monday |
| Date "14th December 2026" | 14 December 2026, year `check` |
| Date "14.12.26" | 14 December 2026, year `check` |
| Date "सोमवार, 14 दिसंबर" | 14 December, weekday Monday, year `not_printed` |
| Date "31 November" | No date, `check`, printed text shown |
| Date null, time "to follow in the evening", previous function on 14 December | 14 December, `check`, "Worked out from 'to follow in the evening'" |
| Time "Muhurat 11:15 AM" | `muhurat_time` 11:15; `start_time` empty |
| Time "7:30 PM onwards" | `start_time` 19:30 |
| Time "7 PM to 11 PM" | `start_time` 19:00, `end_time` 23:00 |
| Time "8 PM to 1 AM" | `start_time` 20:00; `end_time` empty, `check` |
| Time "in the evening", and "सायंकाल" on its own | No time |
| Time "मुहूर्त प्रातः 11:15 बजे" | `muhurat_time` 11:15, `check` |
| Name "Mehndi" · "Shubh Vivah" · "प्रीतिभोज" · "Reception" | `mehendi` · `wedding` · `reception` · `reception` |
| Name "Cocktail Night" | `other`, title "Cocktail Night", `check` |
| Venue name "Mandap Lawn, Mallige Gardens" and address "Whitefield, Bengaluru" | "Mandap Lawn, Mallige Gardens, Whitefield, Bengaluru" |
| Value "Kabir" with confidence 0.62 | `check` · 62% |
| Value null with confidence 0, or "" from gemma4 | `not_printed` |
| Any non-empty gemma4 value | `check`, "no score" |

---

## 5. Gating, tests and delivery

### 5.1 Go/no-go at about 10:05–10:15 (the T-tests in RS §7)

This go/no-go runs in a terminal outside the repo, from `~/sarvam-smoke` (decision D7):
- **T0–T4:** L runs them at about 09:14, when `~/sarvam-smoke` is created. The key is read from `.env.local` and never printed, so the teammate needs no Sarvam key.
- **T5 and T6:** L runs T5 at about 10:05–10:15, then T6 only if T5 is slow or wrong, once the clean card image exists (4.1, step 2; decision D119). The teammate makes the fictional Arora card after the NudgeBee checks. If they haven't laid it out by 09:50, L renders it at about 10:00–10:05 from an HTML page outside the repo with headless Chrome (decisions D73 and D119).

L writes the results into the build notes and tells Lane C and the lead.

| Test | What it settles for #11 | Pass |
|---|---|---|
| **T0** | The key works, and Document AI is reachable | The three calls return `200`, `403` and `200` (RS §7). For #11 the third matters: `GET /doc-ai/v1/capabilities` returns `200`. A 401 there means the key is wrong; a 402 or 403 means billing or entitlement (RS C12). |
| **T5** | Document AI on the fictional card, run exactly as RS §7 writes it (schema = 2.5, `language=en-IN`, `mode=basic`, polling every 3 s for up to 60 polls) | All six checks below |
| **T5b** (added by this spec; only if T5 invents nothing but misreads) | The same card with `mode=advanced` (₹2.50) | All six checks. If it passes, the app sends `advanced`. |
| **T6** (only if T5 is slow or inaccurate, as RS §7 says) | gemma4 on `/v2`, run exactly as RS §7 writes it | 200; `content` parses and fits the schema; the names and date are read; the year, reception time and hall are empty strings; `finish_reason` is not "length"; `usage.completion_tokens_details.reasoning_tokens` in `gemma.out.json` is 0 or absent. Write down the time. |
| **T6b** (added by this spec; only if T6 shows reasoning tokens) | T6 with `"reasoning_effort": "none"` | 200 with 0 reasoning tokens. Otherwise keep T6's body. |

**T5's six checks:**
1. The submit returns **201** with `job_id`, `status: "pending"` and `run_id`.
2. The status reaches `completed` or `partially_completed` within 180 s. Write down the duration.
3. The results return 200, read with `--compressed`.
4. The values come back right (ignoring case and extra spaces):
   - groom "Kabir" and bride "Mira";
   - a function whose date text contains "14" and "December";
   - its time text contains "11:15";
   - "Mandap Lawn" appears in its venue name or address;
   - `rsvp_contact` contains "90000 00901".
5. **Nothing is invented:**
   - no year anywhere in `result`;
   - the reception (if present) has no clock time and no hall name;
   - nothing appears that isn't on the card.
6. `annotations` carry a confidence for each value.

A failure of check 5 is a no-go for that reader, however accurate the rest is. The demo shot exists to show "Year: not printed".

**Decision:**

| T5 (or T5b) | T6 | Decision | Flag value once #11 ships |
|---|---|---|---|
| Passes, job ≤ 60 s | (not needed) | Build with Document AI | `docai` |
| Passes, job 60–180 s | Passes | Build with Document AI. The slow message shows from 30 s, and the user may switch the flag to `gemma4` if it's slow in practice. | `docai` |
| Passes, job 60–180 s | Fails | Build with Document AI and the slow message | `docai` |
| Fails | Passes | Build with gemma4 | `gemma4` |
| Fails | Fails | Don't build #11. The README marks it Future, with the measured reason. | `off` |

T5 "fails" on any of: no 201; a 401, 402 or 403; no final status within 180 s; an invented value; or wrong names or date even after T5b.

**Re-run before building.** Once the photographed `arora-printer-proof.jpg` exists, run T5 (or T6) once more on it before the build starts (about 2 minutes). Real photos read worse than clean exports.

### 5.2 The build gate

- **Must 1–9 first.** #11 is a Should (`scope.md`: built "once the must-work list passes", and it "depends on Sarvam's document reading passing the checks"). It is built **only after Must 1–9 pass** their acceptance checks, as confirmed by the lead.
  - **The Must screens come in time** (decision D105, which replaces D56's "if #11 is still in play"). The minimum Guests screen (AT-4.7, AT-4.8; Lane B) and the minimum Invite studio (AT-7.1's typed path; Lane D) ship in the 12:30 batch whether or not #11 is in play, with their polish in 13:45.
  - **If L cannot verify Must 1–9 by 13:00, #11 is future scope** (D56, which D105 keeps). The README marks it Future, with the reason.
  - Before then, #11 work is limited to three things that put nothing on screen: the T5/T6 test at about 10:05–10:15, the sample card, and the two items below.
  - **Contract types in `lane-lead-contracts-2`, at about 10:30** (decisions D44 and D115). No first branch needs them, so they stay out of the 09:35–09:55 contracts PR (decision D121). L writes `src/contracts/card-import.ts`, and the flag's key, values and fallback `off` in `src/contracts/flags.ts` (arch §4.3). They are types only, and nothing imports them until the build starts.
  - **The table in any Lane A batch.** Lane A adds `card_imports` with its other operational tables (arch §4.2 rule 1, §9 item 13). An unused table changes nothing on screen.
  - **The Flagsmith flag only when the build starts** (flags §3.8, §7.4 step G).
- **Order among the Shoulds** (a recommendation to the lead):
  - #12 (the typed Jain-food save in the Flagsmith beat, 2:10–2:30) and #10 (the closing overview) appear in the live demo (demo-script §2).
  - #11 appears only in an optional 4 s of the video.
  - So #11 comes after #12 and #10, unless a lane is otherwise idle.
- **Latest start: 13:00** (arch §8 row 11 uses the same time). Merges go in batches, and 14:30 is the last feature batch before the 14:45 freeze (arch §6.4, demo-script §5). Steps 1–4 of the build take about 80 minutes (5.4), so a start after 13:00 misses that batch, and #11 becomes Future.
- **Flag while building** (flags §3.8: create it only once #11 is being built, with fallback `off`):
  - Every change to this flag in the Flagsmith dashboard, from creating it to the Production default, is the user's: the free plan's one seat (decisions D9 and D115).
  - Create it when the build starts: a string flag with the values `docai`, `gemma4` and `off`, with "Server-side only" ticked like every flag (flags §3.0).
  - **Production default `off`,** with a segment override for `internal_team` (flags §4.1) set to the chosen reader, so the team can test on the production domain.
  - Development uses the chosen reader.
  - **The code fallback,** used when Flagsmith can't be read, is **`off`**, as flags §3.8 says: an optional reader hides itself rather than running unconfigured. research-flagsmith's sketch used `docai`; flags §3.8 and this spec replace that.
  - It is read with the member's identity on the setup screen's render (to show the entry) and on the import POST route (to choose the reader), never in the browser (flags §6.5, §6.9).
- **Switch on.** The user sets the Production default to the chosen reader (flags §3.8 expects `docai`) only after AC-1 to AC-12 pass.
  - AC-1 and AC-3 to AC-12 pass on the dev server before the PR joins a batch, signed in as a fresh internal owner such as `setup-c-<HHMM>@example.com` (decision D120), and AC-2 passes on the iPhone through Lane C's tunnel (arch §6.6).
  - After the merge, AC-1, AC-2 and AC-9 run again on production with an internal account. If they haven't passed by the **14:45** freeze, the flag stays `off`, and the README marks #11 Partial (saying exactly what works) or Future.
  - V02b is recorded only if #11 is Working (demo-script §4.2; §4.4 asks for both the laptop and the phone), with a fresh internal (`@example.com`) test owner, so it starts at T0 as I-03 expects.
- **Turning it off later.** If Document AI starts failing during the day, set the flag to `gemma4` (when T6 passed) or `off` (research-flagsmith's "Image reading failing" row). Setting `off` stops new imports at once. Imports already in flight keep polling until they finish or time out, so nothing is left half-done.

### 5.3 Work split and files

Paths are the ones arch §4.1–4.2 gives Lane C. arch is binding for the folders; the file names inside them are Lane C's choice, and the ones below are a suggestion.

- **L** (in `lane-lead-contracts-2` at about 10:30, decisions D44 and D115 and arch §4.3; about 10 minutes):
  - `src/contracts/card-import.ts`: the draft shape, the `card_import_status`, stage, `card_field_state` and provider enums, and the error codes (1.4, 1.7);
  - `src/contracts/api.ts`: the request and response shapes of the four routes in 1.7;
  - `src/contracts/flags.ts`: the flag key, its values and the fallback `off`;
  - a later contract change goes in a `lane-lead-contracts-<n>` PR, merged at once (arch §6.4).
- **Lane A** (about 5 minutes):
  - the `app.card_imports` table (1.8), in an additive migration (arch §3.1);
  - nothing in Storage.
- **Lane C, everything else:**
  - `src/lib/card-import/`: the pure rules shared by the server and the review form. It has no `server-only` import, so the browser form and plain vitest can both load it.
    - `rules.ts`: the rules from 1.4 (dates, times, kinds, venue joining, field states, weekday matches)
    - `rules.test.ts`: the cases in 4.4
  - `src/server/card-import/`: server-only.
    - `sarvam-doc-ai.ts`: submit, status and results
    - `sarvam-gemma4.ts`: the fallback call
    - `normalise.ts`: Sarvam's result or gemma4's content into the draft
    - `imports.ts`: reading and updating `card_imports`, the limits and the sweep
  - `src/app/api/card-imports/route.ts`: POST
  - `src/app/api/card-imports/[import_id]/route.ts`: GET and DELETE
  - `src/app/api/card-imports/[import_id]/apply/route.ts`: POST apply
  - `src/components/setup/card-import/`: the sheet, the photo step, progress, the review form and the year picker
  - `src/app/(planner)/setup/`: the entry action and the "Functions from your card" list in the setup review
  - `public/samples/arora-printer-proof.jpg`, only if the sample link ships (4.1)
  - `src/components/voice/`: only the optional paperclip of 1.6
- **Lanes B and D:** nothing. The created functions show up in Events, the invite and the guest site through the normal draft and publish flow.
- **Packages.** #11 needs none: plain `fetch`, the browser's own canvas, and zod, which is already pinned (arch §1.1). Lanes never install packages (arch §4.2 rule 4). Unit tests under `src/server/` need `server-only` aliased to an empty module, which the lead's `vitest.config.ts` already does (arch §7.1 trap 11).

### 5.4 Build order and time (estimates)

| Step | Minutes | Needs | Done when |
|---|---|---|---|
| 1. Rules and their unit tests | 15 | Nothing | The 4.4 cases pass |
| 2. Sheet, progress and review form, on a fixture draft (the 1.7 example) | 30 | The contract entries | The 4.2 draft shows correctly on the laptop and the iPhone |
| 3. Sarvam client, POST and status routes | 20 | Lane A's table on `main` | The sample card goes from POST to `ready` on the dev server, and the draft matches 4.2 (AC-1) |
| 4. Apply route and the setup hand-off | 15 | Step 3 | AC-3 to AC-12 pass on the dev server, and AC-2 through the tunnel |
| 5. PR in the next batch, then production checks | 15 | The batch | AC-1, AC-2 and AC-9 pass on production |
| **Total** | **about 95** | | |

Ask Lane A for the table as soon as the lead approves #11. Steps 1 and 2 don't need it, so it can arrive with Lane A's next batch PR.

Optional extras, only after step 5: the voice shortcut (1.6), source boxes (2.3) and the variants in 4.3.

### 5.5 Acceptance checks (#11's definition of done)

| # | Check | Pass |
|---|---|---|
| AC-1 | Laptop, Chrome: choose the sample card | The draft matches 4.2. No year chip is preselected. The weekday hint shows. |
| AC-2 | iPhone, Safari, through Lane C's tunnel and then on the production URL: "Take a photo" of the printed or on-screen card | The same draft (confidences may differ). The upload was a JPEG under 4 MB (the server log shows its size). |
| AC-3 | Before Save | After "Use these details", and before "Save wedding", no wedding, event or activity row exists for this owner |
| AC-4 | Save | Pick 2026; type Reception 19:30 and "Banyan Hall, Mallige Gardens"; Use these details; save setup. Result: a wedding for Mira and Kabir on 2026-12-14 and two draft functions (wedding with muhurat 11:15; reception at 19:30). They survive a refresh, show as unpublished in Events, and each has one activity entry. |
| AC-5 | Exactly once | Double-tap Save, and replay the apply request with the same body. There are still two functions, and `command_receipts` holds `{import_id}:0` and `{import_id}:1` once each. |
| AC-6 | Nothing invented | On the Arora card, no year, reception time or hall is ever prefilled. "Use these details" stays disabled until a year is picked and every `check` is ticked. |
| AC-7 | Privacy | Supabase Storage holds no object for the import. The import row holds no image. After apply, `draft` is empty. The logs show the field names sent to Sarvam (2.1) and no field values. |
| AC-8 | Roles | Another signed-in user (Diya's session) calling GET or apply on the test owner's import gets 404. A request with only Tara's link (no session) gets 401. |
| AC-9 | Flag `off` | The entry action is hidden, POST returns 403 `card_reader_off`, and setup still works by hand |
| AC-10 | Flag `gemma4` (only if T6 passed) | The same flow; every filled field shows "Please check · no score"; the reception's time and hall are `not_printed` |
| AC-11 | Not a card | `not-a-card.jpg` (or any photo without a card) shows "We couldn't find wedding details in this photo." and nothing is prefilled |
| AC-12 | Failure paths | A wrong `SARVAM_API_KEY` in local dev shows "Card reading isn't available right now", and the log shows 401. Cutting the network while it reads: polling resumes, then finishes or times out at 180 s. "Try again" makes a new import. |

### 5.6 Delivery

- **Branch: `lane-c-card-reader`.** Every lane uses short-lived topic branches named `lane-<letter>-<topic>` (arch §6.1; flags §7.7 lists Lane C's others). Cut it from `origin/main` in Lane C's worktree. The `lane-` prefix means Vercel builds nothing for it (arch §6.5), and the name never names a tool.
- **Pull requests.** Every change goes through a pull request to `main` on github.com/omiiii21/Jashn, opened as a draft (`gh pr create --draft`) and marked ready with `gh pr ready` when the checks pass (decision D30). The lead merges each one as a merge commit, in this order:
  1. the lead's contract types (`src/contracts/card-import.ts`, plus the `image_extraction_provider` key, values and fallback in `src/contracts/flags.ts`), in `lane-lead-contracts-2` at about 10:30, merged at once (5.2; decisions D44 and D115). The first contracts PR is written 09:35–09:55 and merges at about 09:50–09:55, and the lanes start at about 09:58–10:05 (decisions D70 and D121). Nothing needs #11's types before 10:30;
  2. Lane A's table, in any Lane A batch PR;
  3. Lane C's feature, in a later batch: 13:45 only if L's post-12:30 demo-path run passed and the PR's own checks are green, otherwise 14:30, the last batch (batches run A → B → C → D, arch §6.4; decision D106).
- **No AI mentions.**
  - Commit messages, PR titles, PR descriptions and branch names never mention Claude or any AI tool. They carry no Co-Authored-By trailer or other AI co-author line, and no "Generated with" footer (arch §6.2, AGENTS.md rule 12).
  - The local commit-msg hook strips AI footers, then rejects any message that still contains the word "claude" in any case. So a commit message that touches the agent-instructions file calls it "agent instructions", never by its file name (arch §6.2).
  - AGENTS.md rule 12 replaces research-stack §5's old rule 10, which asked for a co-author line.
  - Describe the change in plain product terms. The title follows arch §6.2's form: "C: read a printed invitation into the setup draft".
- **PR body** (arch §6.2 asks for what changed, how it was tested, schema or env changes, and follow-ups):
  - what the feature does, the flag and its value;
  - schema and env: no new variables, and the table is in Lane A's PR;
  - the reader-test numbers from about 10:05–10:15 (HTTP codes and job time);
  - AC-1 to AC-12 with pass or fail, and on which device;
  - phone screenshots of the review form;
  - the privacy note from 3.1.
- **gh.** Run every `gh` command for this repo with `GH_TOKEN` set from `gh auth token --user omiiii21`, and with `--repo omiiii21/Jashn` (arch §6.2). Never run `gh auth switch`.
- **After the merge.** Vercel builds `main`. Test on production with an internal account (the `internal_team` override), then the user sets the Production default (5.2; decision D115).
- **Repo README** (the product README at the root, not `docs/prep/spec/README.md`):
  - The W/P/F row "Reading an existing invitation image into a reviewable draft" (demo-script §4.4).
  - A privacy line: "Card photos are re-encoded in your browser, sent to Sarvam Document AI to be read, and never stored by Jashn. Sarvam keeps documents for up to 8 days."
  - The time #11 went live, in the experiment notes.
  - The AI-assistance disclosure in the README and on the submission form (presentation.md §6, which demo-script §4.3 points to; decision D31) names Sarvam's document reading. If gemma4 is the reader, add "or gemma4 through Sarvam's API".

### 5.7 Changes needed in other specs

None of these blocks the build. Each one keeps the specs consistent with #11. architecture.md and flagsmith.md have applied theirs; domain-and-data.md's are still open (another workflow owns that file).

**domain-and-data.md (open)**
1. §5: add `card_imports` (1.8) as an operational table, like `voice_turns`.
2. I1: name the key shape `{uuid}:{index}`, which voice (V7) and #11 (1.5) both use, beside UUIDs and the NudgeBee form.
3. G9: add what leaves for Sarvam when a card is read: the photo, the fixed schema, `language`, `output_format` and `mode`, and never anything from the database (3.3).
4. `add_asset`: #11 uses neither the `invite_scan` kind nor its activity line "uploaded an invitation image to read". Drop both, or mark them as reserved for reading a card into an existing wedding (future scope).
5. Optional: fields for the card's hosts and RSVP contact (5.8, question 1). No new `source` value is needed (5.8, question 2).
6. `create_event`'s activity template needs a form without a venue (5.8, question 3).

**architecture.md (all applied in its 04:07 revision)**
1. §2.2 has the `/api/card-imports` rows: POST takes multipart with a JPEG of at most 4 MB and gets 120 s; status, DELETE and apply get 30 s each.
2. §3.6: the `uploads` bucket holds no invitation scans, and card photos are never stored.
3. §4.1–4.2: `src/app/api/card-imports/`, `src/server/card-import/`, `src/lib/card-import/`, `src/components/setup/card-import/` and `public/samples/` are Lane C's.
4. §7.3 rule 10 names `/api/card-imports` beside `/api/voice/turn` as the only routes that accept a file body.

**flagsmith.md (all applied in its fourth version)**
1. §3.0 has a row for `image_extraction_provider`:
   - a string, `docai`, `gemma4` or `off`;
   - Production `off` with the `internal_team` override until #11 passes its checks, then the chosen reader;
   - Development the chosen reader; Synthetic unused; fallback `off`;
   - read by the setup screen's render and `POST /api/card-imports`, with the member's identity.
2. §6.5 and §6.8: the same readers, and the fallback `off`.
3. §7.4 step B, the description to paste: "Should #11 card reader: docai (Sarvam Document AI), gemma4 (backup reader) or off (hidden). Fallback off. Server-side only."
4. §7.8: the README's experiment notes give the time the card entry went live in both arms.

### 5.8 Open questions

1. domain-and-data has no field for the card's hosts line or RSVP contact, so both are shown for reference only, although demo-data §12 marks them "Fill in". Should `set_wedding_profile` (or `update_invite_style`) gain optional fields for them?
2. **Settled: the activity `source` is `ui`.** domain §5.2's `command_source` enum is `ui`, `voice`, `guest_link`, `nudgebee`, `system` and `seed`. The owner reviews and confirms a card's functions in a form, so the apply route sends `ui`, like the setup form. No `card_import` value is added today.
3. `create_event`'s activity template "{actor} added the {event} on {when} at {venue}." needs a form without a venue, because cards often omit the hall.
4. demo-data §12 doesn't say whether the reception's date comes from "to follow in the evening". This doc fills it as `check`, which matches I-03's missing list of year, reception time and hall. If that is unwanted, drop the "to follow" rule.
5. **Settled: the photo goes through the route handler.** AGENTS.md rule 10 (arch §7.3) names `/api/card-imports` as one of the two routes that accept a file body and never store it (3.1). No signed upload is built.
6. **Settled: the branch is `lane-c-card-reader`.** Every lane uses topic branches (arch §6.1; 5.6).
7. **Settled: yes.** Lane A may add the unused `card_imports` table in any batch, before Must 1–9 pass (5.2; arch §9 item 13).
8. Is there a Sarvam call to delete a Document AI job before its 8 days? Do status polls count toward Extract's 30 requests a minute (RS B27)? Ask both at the 11:20 Sarvam slot (astra-plan §5).
9. Is `bbox_norm` two corners or a corner plus a size? It only matters for the optional source boxes; read T5's output.
10. Does iOS Safari hand over JPEG for library photos (AC-2)? If not, the browser re-encode must cover the format it does hand over.
11. Does Lane C's setup keep its draft across a reload? If not, a reload between "Use these details" and Save means reading the card again (1.5).
