# Jashn voice: the pipeline and the action contract

Prep note written at about 04:10 IST on Wed 25 Nov 2026, before FestiveHacks coding starts at 09:00, and completed at about 05:00 against flagsmith.md's fourth version (04:49) and architecture.md's 04:48 revision. It is notes only (Rule 4): prose, tables, one short file list and short JSON examples of payloads and tool arguments. It contains no code, SQL, config or pseudo-code. Session C (voice and Flagsmith) owns this file and builds it after 09:00. Session A builds the dispatcher and the `voice_turns` table that voice writes to (section 9 lists the columns C asks for). Session B renders `VoiceDock` with `wedding_id` in the planner shell's header (decisions D20 and D97). Session D owns the reusable `PublishSheet` that voice reuses through its confirm callback (decisions D19 and D59).

**Read with:** `scope.md`; `research-sarvam.md` (cited as RS); `research-stack.md`; `demo-data.md`; `demo-script.md`; `voice-test-set.md` (rows such as M-03); `design-direction.md` §7.1; and in `spec/`: `domain-and-data.md` (cited as domain), `flagsmith.md`, `architecture.md`, `doc-ai.md` and `acceptance.md` (cited as AT-x.y).

**Which file wins.**
- domain is binding for entity, table, field, enum, command, topic and error names. This file reuses them exactly. Every new name is listed in 0.2.
- demo-data wins on values. flagsmith.md wins on flag names and on where flags are checked.
- This file settles everything else about voice: the routes beyond domain 3.8, the tool contract, how numbers and dates are read and spoken, the reply templates, the failure copy and fixture mode. Section 10 lists what other specs must change to match it.

**Nothing here was observed with a key.** Sarvam facts come from RS. The Sarvam tests (RS §7: T0 to T4 at about 09:14, T5 and T6 at about 10:00–10:10, decision D7) and four voice checks of our own (1.16) confirm them before Lane C builds on them.

---

## 0. On one page

### 0.1 The rules

1. **Push-to-talk only.** The mic records while it is held, or after a tap that locks it, and never listens on its own. Every mic track is stopped after each clip. Audio is never stored anywhere.
2. **Show what was heard at once.** The transcript reaches the screen before the model is called.
3. **The model only proposes.** One forced tool, `propose_actions`. The model never computes, never writes, and never uses an id that isn't in the snapshot.
4. **Code re-reads every number.** For each number, amount, date and time, the model also returns the words it heard. Code reads those words again, and a mismatch becomes a question, never a guess.
5. **Nothing is written until the speaker confirms**, by tap or by a fixed phrase matched in code, within 10 minutes (domain V2).
6. **One write path.** Confirmed actions run through the one dispatcher, as the speaker, with `source` `voice`, the `voice_turn_id` and the key `{voice_turn_id}:{index}` (V1, V7).
7. **Numbers in replies come from saved records**, read after the commit (M8, V9). Every reply on the demo path is a code template.
8. **Replies are short and in the speaker's language:** at most two short sentences. Hindi words are written in Devanagari for speech, English words and names in Latin, and spoken amounts are built in code (M7).
9. **Kill switch.** With `voice_writes_enabled` off, questions are still answered, voice writes are refused at the turn and again at confirm, and typing is unaffected.
10. **Failures write nothing** and always leave the typed path open.

### 0.2 Names this file settles

| Thing | Name | Notes |
|---|---|---|
| Turn route | `POST /api/voice/turn` | domain 3.8. This file adds the `text` input, more request fields (1.4) and a streamed response (1.5) |
| Confirm and cancel | `POST /api/voice/confirm`, `POST /api/voice/cancel` | domain 3.8 |
| Dock state | No route of its own: VoiceDock's server render, plus the `voice` block in every voice response | flagsmith 6.9 and 10.3: the focus refresh (architecture 2.4) re-renders VoiceDock, and there is no `/api/voice/state` (1.15) |
| VoiceDock props | `wedding_id` (null on `/setup`); from the setup screen only, also `setup_opened_at` and `show_printed_card` | New (decision D97). The contracts stub declares them, and they stay fixed (1.15) |
| Spoken reply | `GET /api/voice/turns/{voice_turn_id}/reply-audio?part={n}` | New. architecture 2.2 asked voice.md to name it |
| Judge panel data | `GET /api/voice/turns/{voice_turn_id}/trace` | New (section 8) |
| Fixture switch | `VOICE_FIXTURE_MODE` (`on`, or unset) | architecture 5. On by itself when `SARVAM_API_KEY` is missing, never on Production (6.4) |
| Fixture files | `src/server/voice/fixtures/{row_id}.json`; reply audio in `public/voice-fixtures/{row_id}.mp3` | 6.4 |
| Stream events | `heard`, `preview`, `answer`, `clarify`, `refused`, `saved`, `cancelled`, `error`, `done` | 1.5 |
| Reply registers | `en`, `hinglish`, `hi` | Also the language chip: English, Hinglish, हिंदी (1.6) |
| Input modes | `speech`, `typed`, `tap` (an option tapped on a question, 6.2), `fixture` | Stored on the turn (section 9) |
| Codes in stream events | `error`: `no_speech`, `audio_unreadable`, `stt_unavailable`, `llm_unavailable`, `llm_no_action`, `internal_error`. `refused`: `voice_writes_paused`, `forbidden`, `not_shared` | 6.1 and 4.6. Plain HTTP errors keep domain 3.0's codes. `not_shared` is new, and is stored as a `refusal_code` |
| Tool | `propose_actions`, top level `intent`, `actions`, `missing_fields`, `reply`, `reply_language` | RS 3.2 and domain 3.9, plus `reply_language` |
| Action helpers | `heard`, `previous_inr`, `user_claim_inr`, `date_text`, `month` | `heard` is new; the rest are domain 3.9's |
| Query parameters | `scope`, `detail`, `next_event`, `day`, `latest`, `actor_member_id`, `thanked`, `budget_category` | 2.4 |
| Snapshot references | The record's `seed_key`, or an alias `{PREFIX}-L{n}`; the photo attached to this turn is `ASSET-NEW` | 1.9 |
| Text-to-speech voices | `simran_enhi_customer` with `hi-IN`; `simran_en_customer` with `en-IN` | RS 3.3; the user picks by 10:30 after the 09:14 audition, or these defaults stand (decision D78) |
| Refusal line | R-03: "Abhi voice se badlav band hain. Aap type karke save kar sakte hain." | flagsmith 3.2 gives voice.md this line; English and Hindi forms in 4.10. "sakte hain" is the respectful form, right for any speaker (decision D93) |

### 0.3 Earlier names and what they are now

voice-test-set.md and research notes were written before domain. Read their names like this:

| Earlier name | Now |
|---|---|
| `publish_schedule` | `publish_itinerary` |
| `export_card` {revision, format} | `request_card_export` {`format` `png`}; no revision input (domain 3.7) |
| `propose_expense` | Not a model kind. A manager's `record_payment` (or any A1 command) is sent by the server as `propose_change` (V8) |
| `extract_invite` | Not a model kind. On the setup screen, the dock's paperclip choice "Printed card" opens the card-reading sheet (doc-ai §1.6, 7.3 I-03); the model never sees the image |
| `confirm`, `cancel` | Not model kinds. Fixed phrases matched in code before any model call (1.8) |
| `rate_inr`, `covers` | `unit_price_inr`, `quantity` |
| `type` (payment), `installment` | `payment_kind`, `instalment` |
| `palette` | `theme` |
| `count` (requirement) | `quantity` |
| `status` (RSVP) | `rsvp_status` |
| `kind` (event) | `event_kind` |
| `event`, `vendor`, `payment`, `commitment`, `guest`, `guests` | `event_id`, `vendor_id`, `payment_id`, `commitment_id`, `guest_id`, `guest_ids` |
| `date`, `start`, `end` | `event_date`, `paid_on` or `received_on`; `start_time`, `end_time` |
| `note` (dietary) | `dietary_note` |
| `from` (shagun) | `giver_name` plus `household_id` |
| `basis: fixed_minimum` | `pricing` `per_unit` with `description` "250 covers × ₹800, fixed minimum" |
| `field` (event question), `thank_you: pending`, `actor`, `date` (changes) | `detail`, `thanked` false, `actor_member_id`, `day` |
| `voice_tts_enabled`, `voice_mode` (flags) | `spoken_replies`, `voice_pilot` (flagsmith 3) |
| `voice_attempts` (table) | `voice_turns` |
| `preview_id` | `voice_turn_id` |

---

## 1. The pipeline, end to end

### 1.1 The path at a glance

| # | Step | Where | What happens | p50 budget |
|---|---|---|---|---|
| 1 | Press | Browser | Mic requested inside the press gesture; "Listening" shows once the recorder has started (1.2) | – |
| 2 | Release | Browser | Recorder stops; the final blob is collected; every mic track is stopped; the iOS audio element is unlocked (1.14) | 0.15 s |
| 3 | Upload | Browser to `bom1` | Multipart `POST /api/voice/turn` (1.4) | 0.3 s |
| 4 | Gate | Route | Session, membership, body limits. The user's flags are evaluated as the request arrives, alongside reading the body; `voice_pilot` must be on before anything goes to Sarvam (AT-1.7) | 0.05 s |
| 5 | Speech to text | Sarvam Saaras | `saaras:v4`, `codemix`, language hint, keyterms from this wedding (1.6) | 1.5 s (unmeasured) |
| 6 | Heard | Route to browser | The `heard` event: transcript and language chip, shown at once (1.7) | 0.05 s |
| 7 | Phrase check | Route | A confirm or cancel phrase acts on the open turn with no model call (1.8) | 0 |
| 8 | Snapshot | Route | Role-filtered records, built in parallel with step 5 (1.9) | 0 (parallel) |
| 9 | Model | Sarvam chat | `sarvam-105b`, forced `propose_actions` (1.10) | 2.0 s (unmeasured) |
| 10 | Check and resolve | Route | Structure, references, numbers re-read from phrases, validation like typing, the kill switch, the turn row stored (1.11) | 0.15 s |
| 11 | Card | Browser | Review card, answer card, question or refusal (1.12) | 0.1 s |
| | **Speech end to card** | | **Target p50 5 s or less; above 8 s, cut live #1 and #5 (voice-test-set pass criterion 5)** | **≈ 4.3 s** |
| 12 | Confirm | Browser to route | Tap, or a confirm phrase as a new turn (1.13) | 0.05 s |
| 13 | Apply | Route to dispatcher | Per action, in order: the voice gate (kill switch), then the command in its own transaction (V7) | 0.4 s |
| 14 | Reply text | Route | Template filled from the command results and read models, after commit (V9) | 0.05 s |
| 15 | Spoken reply | Route to Bulbul | `GET …/reply-audio`, streamed MP3, voice chosen from the reply's script (1.14) | 0.7 s to first byte (unmeasured) |
| | **Tap to first sound** | | **Target: audio starts within 0.7 s of the saved state showing, and never before it (design-direction 7.1)** | **≈ 1.3 s** |

Questions skip steps 12 to 13: the answer text arrives with the card, and its audio follows at once.

### 1.2 Push-to-talk: hold to talk, tap to lock

**Decision: hold to talk is the main gesture, and a short tap locks the recording.** Holding fits the demo script ("hold push-to-talk only while speaking to the app"), keeps narration out of the mic, and is the WhatsApp gesture people already know. Tap-to-lock covers trackpads, screen readers and long sentences.

| Gesture | Result |
|---|---|
| Press and hold the mic (pointer or touch) | Starts recording. Release sends the clip |
| Press shorter than 300 ms | A tap: recording continues, locked, with Stop and Cancel buttons. Stop sends |
| While holding, drag 40 px left | Cancel: nothing is sent; "Cancelled" for 1 s (design-direction 7.1) |
| While holding, drag 40 px up | Lock: recording continues hands-free with Stop and Cancel |
| Space or Enter on the focused mic | Starts a locked recording; the same key again sends; Escape cancels |
| Pressing the mic while a reply is playing | Stops the reply and starts recording |

**Rules.**
- **The mic opens on press and closes after every clip.** Ask for mono audio with echo cancellation, noise suppression and automatic gain on. Stop every track of the stream on release, Stop, Cancel or an error, so the browser's recording indicator goes off (AT-2.13). No warm stream, no wake word, no listening while idle.
- **First use.** If mic permission has not been granted yet (Permissions API state `prompt`, or no answer from that API and the stream taking longer than 800 ms), the first press only asks. It never records. After Allow, the dock says "Mic ready. Hold the mic and speak."
- **"Listening 0:00" appears only once the recorder has actually started**, so the person knows when to talk. Speech before that is lost, and the person can see that it would be.
- **Limits.** The timer turns amber at 20 s. Recording stops by itself at 25 s and sends what it has, with the note "Stopped at 25 seconds". The route rejects more than 30 s or 2 MB (architecture 2.2; Saaras's hard limit is 30 s).
- **Too short.** A clip under 300 ms is never a hold (it is a tap, which locks), so every sent clip is at least 300 ms. Empty speech is judged by the server (6.1 row 6), not by the browser.
- **While a turn is in flight** (uploading or interpreting), the mic is disabled and shows "Interpreting…". An open review card does not disable the mic: the person may confirm by phrase, add a missing value, or start something new.
- **The level meter** is driven by the real mic signal (design-direction 7.1). It is display only, never a speech detector.

**States** follow design-direction 7.1: Idle, Press, Listening (held or locked), Interpreting, Review, Saving, Saved and Spoken reply. Section 1.12 adds the card states; section 6 adds the failure states.

### 1.3 Recording format per browser

The dock picks the first type that `MediaRecorder.isTypeSupported` accepts, in this order:

| Order | Recorder type | Who uses it | Upload part type | File name |
|---|---|---|---|---|
| 1 | `audio/webm;codecs=opus` | Chrome and Edge (desktop and Android), Firefox, Safari 18.4 and later | `audio/webm` | `clip.webm` |
| 2 | `audio/webm` | Older Chromium builds | `audio/webm` | `clip.webm` |
| 3 | `audio/mp4` | Safari 14.3 to 18.3, including older iPhones (AAC in MP4) | `audio/mp4` | `clip.m4a` |
| 4 | `audio/ogg;codecs=opus` | Older Firefox | `audio/ogg` | `clip.ogg` |
| 5 | None | No usable recorder | – | The mic is disabled with "This browser can't record here. Type your request instead." Typing still works |

- **Start the recorder without a timeslice** and use the single blob from the final `dataavailable` event after `stop`. Fragmented MP4 from timesliced Safari recordings is a known decode risk.
- **Upload the base type only**, with `;codecs=…` stripped (RS 3.1: a wrong part type gives 400 "Invalid file type"). Reject a 0-byte blob in the browser (RS: 400 "Failed to read the file").
- **The dock also sends `duration_ms`**, measured from recorder start to stop.
- **WAV fallback.** If T3 or V-T3 (1.16) shows Saaras rejecting a browser's format, or a turn comes back with 400 "Failed to read the file" or "Invalid file type", that browser converts later clips to 16 kHz mono WAV in the browser before upload (`audio/wav`, `clip.wav`; 25 s is about 0.8 MB). The dock remembers this per device in local storage.

### 1.4 The turn request: `POST /api/voice/turn`

Multipart form fields:

| Field | Required | Meaning |
|---|---|---|
| `audio` | One of `audio`, `text` or `option` | The clip (1.3): at most 2 MB and 30 s |
| `text` | One of `audio`, `text` or `option` | Typed into the dock's text field, 1 to 500 characters. Skips speech to text (6.3) |
| `option` | One of `audio`, `text` or `option` | The `value` of an option the person tapped on a question (6.2). Needs `context_turn_id`. Skips speech to text and the model |
| `wedding_id` | Yes, except in setup | Empty means a setup turn (domain 3.8) |
| `client_turn_id` | Yes | A UUID the dock makes per clip or typed request. A repeat from the same user replays the stored turn instead of calling Sarvam again |
| `ui_language` | Yes | `en` or `hi`: the screen's language. Used for labels and for the reply when the words give no language (1.6) |
| `speech_language` | No | `hi-IN` (default) or `en-IN`: the dock's speech setting, sent to Saaras (1.6) |
| `context_turn_id` | No | The speaker's previous turn this one follows up (S-02 after S-01; M-04 after a caterer question). The dock sends its latest turn's id while that turn is under 10 minutes old and the panel has not been closed since |
| `duration_ms` | With `audio` | Recording length |
| `attached_asset_id` | No | A couple photo uploaded with this request through the normal upload flow (`/api/uploads/sign`, then `add_asset`, both typed), for I-01. It appears in the snapshot as `ASSET-NEW` |
| `page` | No | The planner path and query the person is on, such as `/w/{wedding_id}/vendors?vendor_id={uuid}` for an open vendor page. architecture 4.1 has no `[vendor_id]` segment, so a record is named by a query parameter; the URL comes from `src/contracts/routes.ts`. Only questions use it (4.5) |
| `setup_opened_at` | Setup only | Passed through to `set_wedding_profile` for the Flagsmith seconds-to-save value (domain 3.1) |
| `fixture_id` | Fixture mode only | The test row to replay, such as `M-03` (6.4) |

**Checks, in this order** (each fails before any Sarvam call):

| # | Check | Failure |
|---|---|---|
| 1 | A signed-in session | 401 `unauthenticated` |
| 2 | With `wedding_id`: the user is an owner or manager of it. Guests never reach voice routes | 403 `forbidden` |
| 3 | `voice_pilot` on for this user (flagsmith 3.1); the evaluation started when the request arrived | 403 `voice_unavailable` |
| 4 | At most 12 turns a minute and 300 a day per user, which protects the 60-a-minute Sarvam limit shared by the account (RS) | 429 `rate_limited` |
| 5 | Exactly one of `audio`, `text` and `option`; audio 1 byte to 2 MB with `duration_ms` up to 30,000; text 1 to 500 characters; an `option` offered by the context turn, which is still under 10 minutes old | 422 `validation_failed`, `field` `audio`, `text` or `option`, `message` `required`, `too_long` or `unknown_value` |
| 6 | `client_turn_id` already used by this user | Not an error: replay the stored turn's events |

**One open turn per speaker.** A new turn closes the speaker's older open turn in the same wedding. If the new turn completes or changes it (the same kind and target), the older turn becomes `superseded`, with `superseded_by_turn_id` set. Otherwise it becomes `cancelled`, and the dock drops its card with the line "Replaced by your new request." So a spoken "haan" can only ever mean one card.

**Disconnects.** If the browser goes away before the terminal event, the route stops at the next step, skips any model call not yet started, and marks the turn `cancelled`.

### 1.5 The turn response: a stream of events

Errors from the checks in 1.4 are ordinary JSON error envelopes (domain 3.0) with the voice block added. Otherwise the route answers 200 with `content-type: application/x-ndjson`: one JSON object per line, in this order:

1. `heard`, as soon as the transcript exists.
2. Exactly one terminal event: `preview`, `answer`, `clarify`, `refused`, `saved`, `cancelled` or `error`.
3. `done`.

The stream is the body of this one request's response, and it ends with `done`. Nothing is ever pushed to a browser outside a response it asked for: there is no Realtime, WebSocket or server-sent channel anywhere (architecture 2.4).

| Event | Fields | Sent when |
|---|---|---|
| `heard` | `voice_turn_id`, `transcript`, `language_code` (Saaras's), `chip` (`en`, `hinglish` or `hi`), `input_mode`, `voice` | First, whenever a transcript exists. A typed or tapped turn sends its text or label. A turn with no usable transcript (6.1 rows 6, 8 and 9) skips it and goes straight to `error` |
| `preview` | `status` `proposed`, `title`, `button_label`, `actions` (per action: `index`, `kind`, `command`, `fields`, `after_saving`, `warnings`), `missing_fields`, `confirm_enabled`, `disabled_reason`, `reply`, `expires_at` | A write to review (1.12) |
| `answer` | `cards` (per answer: `title`, `figure`, `link`; the link carries the `highlight` parameter, 4.7), `reply` | Questions only (section 4) |
| `clarify` | `question` (a `reply`), `missing_fields`, `options` (optional; each `label`, `value` and `default`, 6.2), `cards` (answers given in the same turn, optional) | Something needed is missing or unclear; nothing to confirm |
| `refused` | `code` (`voice_writes_paused`, `forbidden` or `not_shared`), `reply`, `prefill` (a list with one `{command, input, labels}` entry per action, the same shape as the 423's `error.prefill`, decision D121), `cards` | The kill switch, a role limit, or data not shared with this member |
| `saved` | The confirm response body (1.13) | A confirm phrase confirmed the open turn |
| `cancelled` | `reply` | A cancel phrase cancelled the open turn |
| `error` | `code`, `stage` (`stt`, `llm` or `server`), `message`, `retryable` | 6.1 |
| `done` | `timings_ms`, `voice` | Always last |

Every `reply` object has `display_text`, `language` (the register), `speak` (true when it will be spoken) and `parts` (how many audio parts the reply route will serve). The speech text itself stays on the server.

Example for live #2 (M-03), shortened:

```json
{"type":"heard","voice_turn_id":"a41f…","transcript":"Caterer को चालीस हज़ार advance दिया था","language_code":"hi-IN","chip":"hinglish","input_mode":"speech"}
{"type":"preview","voice_turn_id":"a41f…","status":"proposed","title":"Correction, not a new payment","button_label":"Save correction",
 "actions":[{"index":0,"kind":"correct_payment","command":"correct_payment","fields":[
   {"field":"amount_inr","label":"Advance to Annapoorna Caterers, 20 Nov","old":"₹50,000","new":"₹40,000","heard":"चालीस हज़ार","state":"ok"}],
   "after_saving":[{"label":"Still owed","old":"₹1,50,000","new":"₹1,60,000"}],"warnings":[]}],
 "missing_fields":[],"confirm_enabled":true,"reply":{"display_text":"Correction, not a new payment: ₹50,000 → ₹40,000.","language":"hinglish","speak":false,"parts":0}}
{"type":"done","voice_turn_id":"a41f…","timings_ms":{"stt":1410,"llm":1880,"server_total":3520}}
```

### 1.6 Speech to text (Saaras)

`POST https://api.sarvam.ai/speech-to-text`, multipart, header `api-subscription-key`. Sarvam is called only from `src/server/voice/`.

| Field | Value | Why |
|---|---|---|
| `file` | The clip, with the base type and file name from 1.3 | RS 3.1 |
| `model` | `saaras:v4` | Keyterms work only on v4 (RS B3) |
| `mode` | `codemix` | English stays in Latin, Hindi comes back in Devanagari, numbers often as digits |
| `language_code` | `hi-IN` by default; `en-IN` only when the dock's speech setting is "English only" | See below |
| `keyterms` | A JSON-encoded list of at most 50 terms of at most 64 characters | Built per wedding (below) |
| `with_timestamps`, `input_audio_codec` | Omitted | RS 3.1 |

**The language hint does not follow the screen language.** `members.preferred_language` defaults to `en`, so most people, Mira on the demo laptop included, read an English screen while speaking Hinglish. Sending `en-IN` for them would hurt every live line. So every turn sends `hi-IN` with `codemix`, which keeps English words in Latin. The dock's menu has one speech setting, "Hindi or Hinglish (recommended)" or "English only", kept per device in local storage; "English only" sends `en-IN`. V-T1 (1.16) checks the English rows with `hi-IN` at about 09:14. RS advises against `unknown` (auto-detect): it costs 10% more and guesses badly on short clips.

**Timeout and retries.** 10 s per attempt. One retry on 429 (except `seat_budget_exhausted_error`), 500, 502, 503, a network error or a timeout, honouring `Retry-After` up to 2 s, and only if the route has been running for less than 15 s. Never retry 400, 401, 402, 403 or 422 (RS).

**Keyterms for a wedding,** in this priority order. Remove duplicates ignoring case, drop anything over 64 characters, and stop at 50:

1. Function words: Mehendi, Haldi, Sangeet, Reception, Baraat, and the titles of any `other` functions.
2. People: the bride's and groom's first names and every member's display name (Mira, Kabir, Diya).
3. Venues: every venue name and place name (Courtyard Lawn, Terrace, Garden Hall, Mandap Lawn, Banyan Hall, Lotus Hall, Mallige Gardens).
4. Vendors: every vendor name, then the words caterer, decorator, photographer, DJ.
5. Money words: lakh, hazaar, advance, shagun.
6. Household surnames (Deshpande, Kulkarni, Joshi, Sharma and so on).
7. Named guests' full names, those with a pending invitation first, until the list holds 50.

A setup turn (no wedding yet) sends only lists 1 and 5 plus Bengaluru. The demo wedding fills about 28 terms from lists 1 to 5, and the rest are surnames and guests. V-T2 checks whether Devanagari spellings of the vendor and venue names help, since codemix may write them in Devanagari.

**What is kept from the response:** `request_id`, `transcript` and `language_code`. `language_probability` is null when a code is sent (RS B2), so it is ignored. Saaras gives no confidence score; 6.2 lists the signs Jashn uses instead.

**Normalising for matching** (never for display): Unicode NFC; remove the nukta; treat chandrabindu as anusvara; lowercase Latin; remove punctuation, including the danda (।) and the commas inside numbers; collapse spaces. Phrase checks (3.1), confirm phrases (1.8) and alias matching (2.5) all use this form.

**The language chip and the reply register** come from the transcript, never from Saaras's `language_code`, which only echoes the hint (RS B7). Count the words that contain Devanagari letters (D) and the words in Latin letters only (L), ignoring digits and the ₹ sign:

| Transcript | Chip | Reply register |
|---|---|---|
| D is 0 (all Latin, or typed in Latin) | English, unless the model's `reply_language` is `hinglish` or `hi`, then Hinglish | `en`, or `hinglish` |
| L is 0 (Devanagari only) | हिंदी | `hi` |
| Both, and the model says `en` with D of 1 (one stray loanword in an English sentence) | English | `en` |
| Both, otherwise | Hinglish | `hinglish` |

Names count as words, so "Diya ने क्या बदला?" is Hinglish and gets O-02's Hinglish reply. If Saaras writes a Hindi sentence's loanwords in Latin ("Reception में बारह लोगों…"), the reply comes back in Hinglish rather than Devanagari Hindi. That still meets voice-test-set pass criterion 4 ("Hindi or Hinglish for Hindi input").

### 1.7 What the person sees first

- On `heard`, the panel shows "You said …" with the transcript exactly as returned, and the chip (English, Hinglish or हिंदी), within 150 ms (design-direction 7.1).
- When the card arrives, the words each field came from (the `heard` phrases, 2.2) get the maroon underline, left to right. A dotted underline marks a phrase whose value is uncertain (6.2).
- **Tapping an underlined span makes it plain text again** (design-direction 7.1). For Jashn that means "don't use this": the field it filled is emptied and marked "?", so the card can't be saved until the person types the value.
- **Edit what I heard.** A pencil beside the transcript makes it editable. Sending the edited text runs the same turn again as typed input (6.3), with this turn as context, and the old card is superseded.
- The skeleton card appears only if the result takes more than 300 ms. After 4 s: "Still working. You can keep using the page." (AT-2.10).

### 1.8 Confirm and cancel phrases (no model call)

Checked right after speech to text, on the normalised transcript, before the model is called (domain 3.8). The **whole utterance** must be a phrase: anything longer goes to the model, so "नहीं, पचास नहीं, चालीस हज़ार दिए थे" (M-04) is never read as a cancel.

**Words that count as the same** (Saaras may mix scripts: "हाँ, save करो"):

| Canonical | Also accepted |
|---|---|
| haan | हाँ, हां, han, haa, ha |
| save | सेव |
| karo | करो, kar do, कर दो, kardo |
| theek | ठीक, thik, theekh |
| hai | है, he |
| yes | yeah, yep |
| ji | जी |
| nahin | नहीं, nahi, nai, नही |
| rehne | रहने, rahne |
| do | दो |
| cancel | कैंसल, cancel karo |
| no | – |

**Phrases** after that mapping. domain 3.8's list, plus the equivalents marked *added*:

| Confirm | Cancel |
|---|---|
| haan · haan save karo · yes save · theek hai save · *haan ji* · *yes* · *save karo* · *theek hai save karo* | nahin rehne do · cancel · *nahin* · *rehne do* · *no* · *cancel karo* |

**What happens:**

| Situation | Result | Reply |
|---|---|---|
| Confirm phrase, the speaker has one open turn in this wedding (or this setup) | That turn is confirmed exactly as a tap would (1.13), with `confirmed_via` `phrase`; the phrase turn is stored with intent `ask` and status `answered` and links to it | The confirmed action's reply (`saved` event) |
| Confirm phrase, no open turn, but one of the speaker's turns was confirmed in the last 2 minutes | Nothing written. The `saved` event replays that turn's stored results with outcome `replayed` (X-01, AT-2.9) | en "That's already saved." · hinglish "Yeh pehle hi save ho chuka hai." · hi "यह पहले ही सेव हो चुका है।" |
| Confirm phrase, no open turn, and the speaker's latest turn in this wedding is a question under 10 minutes old with a `default` option (a number or date check, 6.2) | That option is taken exactly as if tapped. Resolution runs again, and the result is a new preview, not a save | The new preview's reply |
| Confirm phrase, the latest turn is such a question without a `default` option | Nothing written | The question again |
| Confirm phrase, nothing open | Nothing written | en "There's nothing to confirm right now." · hinglish "Abhi confirm karne ke liye kuch nahi hai." · hi "अभी पुष्टि करने के लिए कुछ नहीं है।" |
| Cancel phrase, one open turn | Turn `cancelled` (`cancelled` event) | "ठीक है, कुछ नहीं बदला।" for `hi` and `hinglish` (C-02, domain 3.8); en "OK, nothing was changed." |
| Cancel phrase, no open turn, and the latest turn is a question under 10 minutes old | Nothing written. The phrase turn is now the speaker's latest, so a later "haan" can't answer the question | As for an open turn |
| Cancel phrase, nothing open | Nothing | en "There's nothing to cancel." · hinglish "Cancel karne ke liye kuch nahi hai." · hi "रद्द करने के लिए कुछ नहीं है।" |

The kill switch applies to a phrase confirm exactly as to a tap (flagsmith 3.2).

A confirm phrase works for a turn with several actions too, as a tap does (decision D89 closes domain open question 21 this way). It can never publish as a side effect, because `publish_itinerary` always stands alone in its turn (domain V11, 1.11 step 2).

### 1.9 The snapshot sent to the model (G9)

Built from read models with the speaker's role (domain 6.1), in parallel with speech to text, as compact lines of text (one record per line). Every record is named by a **reference**: its `seed_key` when it has one (`EVT-REC`, `VEN-CAT`, `PAY-01`, `COM-04`), otherwise an alias made for this turn, `{PREFIX}-L{n}` (`PAY-L1` for a payment recorded live). The reference-to-UUID map is stored with the turn (`ref_map`), so the confirm uses exactly the mapping the preview used. Every read-model row carries `seed_key`, null for live rows (decision D99), so the snapshot names records from the read models alone.

| Block | Contents | Who gets it |
|---|---|---|
| Header | Today's IST date and weekday; the speaker's name, role and screen language; the wedding's couple names, date, city | Everyone (setup: today and the speaker only) |
| Functions | Reference, kind, title, date, start, end, muhurat, venue name, dress code, lead; the published value beside any draft value that differs | Members |
| Venues | Name, place, capacity | Members |
| Vendors | Reference, name, category, status, linked functions, in the order they were added | Members |
| Money | Commitments (reference, vendor, pricing, rate, quantity, amount, function) and payments (reference, vendor, kind, amount, date, method), current versions only | Owners; managers with `managers_can_see_vendor_dues` |
| Budget | Total and category lines | Owners; managers with `managers_can_see_budget` |
| People | Members (reference, name, role); the 16 named households (reference, name, relation); the 40 named guests (reference, name, household, invited functions with RSVP). The 210 synthetic guests appear only as a count | Members |
| Requirements | Reference, function, text, quantity, vendor | Members |
| Recent activity | The last 10 entries visible to the speaker: actor, time, summary | Members (managers: `members` visibility only) |
| Shagun | Givers, amounts, thank-you state | Owners, once #13 ships |
| Context | Up to 2 earlier turns of this speaker, under 10 minutes old, as plain user and assistant text plus a one-line summary of what was proposed ("Proposed: correct_payment PAY-01 amount_inr 40000"). RS: never replay tool calls without matching tool messages | When `context_turn_id` is given |
| Setup draft | The draft held in the open setup turn | Setup turns with context |
| Attached photo | `ASSET-NEW` (a couple photo) | When `attached_asset_id` is sent |

**Never in the snapshot:** phone numbers, emails, tokens, links, UUIDs, other weddings, anything in a read model's `hidden` list. **Text written by members or guests** (requirement text, dietary notes, activity summaries) stays in the snapshot, role-filtered as above, and is data, never instructions (G9; decision D89 closes domain open question 21 this way). The demo wedding is about 3,000 tokens. A manager's snapshot simply lacks the blocks she can't see, so the model can't leak them.

### 1.10 The model call

`POST https://api.sarvam.ai/v1/chat/completions` with header `api-subscription-key`, from the server only.

| Parameter | Value |
|---|---|
| `model` | `sarvam-105b` |
| `reasoning_effort` | `null` (v1 turns reasoning off this way; `"none"` is v2 only, RS verdict 1) |
| `temperature` | 0.2 (RS B12). Drop to 0 if V-T4 shows the live lines varying between runs |
| `max_tokens` | 1200 |
| `tools` | One tool, `propose_actions` (section 2) |
| `tool_choice` | `{"type":"function","function":{"name":"propose_actions"}}` |
| `messages` | System (the instructions in 2.8 plus the snapshot), the context turns as plain user and assistant text, then the transcript as the user message |

- **Read** `choices[0].message.tool_calls[0].function.arguments`, a JSON string. Log `usage.completion_tokens_details.reasoning_tokens`; it must be 0 on the first call, and the judge panel shows it.
- **Timeouts:** 12 s for the first call, 20 s for a retry.
- **One retry per turn at most, for any reason** (architecture 2.2). Which one:

| First call | Retry |
|---|---|
| 429 (not `seat_budget_exhausted_error`), 500, 502, 503, network error or timeout | The same request, after `Retry-After` (up to 2 s) |
| No tool call; arguments that don't parse; arguments that break the tool schema (unknown `kind`, wrong type, unknown property, too many items); `finish_reason` `length` | The same request with `reasoning_effort` `"low"` and `max_tokens` 3000 (under the 4,096 Starter cap) |
| 400, 401, 402, 403, 422, `seat_budget_exhausted_error` | None |

- **No new Sarvam attempt starts after 30 s of route time.** After a failed retry, the turn becomes `failed` and the person gets the editable transcript and the typed path (6.1).
- **If T4 fails at about 09:14** (the forced tool with reasoning off misbehaves), the first call switches to RS's `json_schema` variant (`response_format` with `strict`, no `tools`, read `message.content`) with the same schema. The retry rule stays.
- **Validation failures are not retries.** An unknown reference, a missing year or a mismatched number is not the model failing; it becomes a question (1.11).

### 1.11 Checking and resolving on the server

In this order, for every turn with a model result:

1. **Structure.** Check the arguments against the tool schema (zod, `src/contracts/api.ts`). Keep at most 4 actions; with more, ask "One or two things at a time, please." Unknown kinds count as a schema failure (retry rule in 1.10).
2. **Role, per action.** Before anything else, so nothing hidden is described:
   - a manager's `publish_itinerary` → refused with `forbidden` (E-06);
   - a manager's money question without `managers_can_see_vendor_dues`, or a budget question without `managers_can_see_budget`, and any shagun question or `record_shagun` from a manager → refused with `not_shared` (M-14);
   - a manager's A1 command (`record_commitment`, `update_commitment`, `record_payment`, `correct_payment`) → kept, and marked to be sent as `propose_change` at confirm (V8), but only while `managers_can_see_vendor_dues` is on. With it off, the turn is refused with `not_shared` and the vendor-payments line of 4.6, because the dispatcher would answer such a `propose_change` with 403 `forbidden` (domain 3.5);
   - a manager's `add_guest` with `event_ids` or `max_plus_ones`, or into a household that has an active guest link → refused with `forbidden`: "Only Mira or Kabir can invite guests to functions." The dispatcher answers the same 403 `forbidden` (domain 3.4);
   - **publishing stands alone (domain V11).** A turn that holds `publish_itinerary` with any other action is answered as a `clarify` with nothing to confirm: en "One thing at a time, please: publishing goes on its own." · hinglish "Ek baar mein ek kaam: publish alag se kijiye." · hi "एक बार में एक काम: पब्लिश अलग से कीजिए।" So a spoken "haan" can never publish as a side effect of another change.
3. **References.** Map each reference to its record (2.5). An unknown reference counts as missing (V5). A name given where a reference belongs goes through the alias rules (2.5) before it is given up.
4. **Numbers, dates and times.** Re-read every value from its `heard` phrase (section 3). A match is accepted; anything else marks the field uncertain.
5. **Kind rules.** Fill server-side values and run the per-kind rules of 2.6: matching the venue, the correction target (section 5), the suggested vendor, duplicates, conflicts.
6. **Validation like typing (V5).** Required fields, ranges, enums and lengths, exactly as the command validates them, without running it.
7. **Missing and uncertain fields.** The server's own list, plus any field the model put in `missing_fields` (the model knows when it guessed: such a field is marked "?" even if it has a value).
8. **Decide what the turn is:**

| Situation | Turn | Event |
|---|---|---|
| Only questions, all answerable | `answered` | `answer` |
| A question can't be answered without more (E-07) | `answered`, `missing_fields` set | `clarify` |
| A write whose identifying field (the record it changes) or primary field (the value being set) is missing or uncertain (M-05, M-13, E-08) | `answered`, `missing_fields` set | `clarify` |
| A setup draft (`set_wedding_profile` create) with anything missing (S-01, S-03) | `proposed`, Confirm disabled | `preview` with the question spoken |
| A write with only secondary fields missing or uncertain | `proposed`, Confirm disabled with the reason | `preview` |
| A complete write | `proposed`, Confirm enabled | `preview` (silent) |
| A role refusal | `answered`, `refusal_code` `forbidden` or `not_shared` | `refused` |

9. **Kill switch (flagsmith 3.2, the early check).** If the turn holds any write (including a manager's that would become `propose_change`) and `voice_writes_enabled` is off: no confirmable preview. The turn is stored `paused` with `refusal_code` `voice_writes_paused`; the `refused` event carries the fixed refusal line (4.10) and the prefill. Questions in the same turn are still answered (4.3).
10. **Store the turn** (`voice_turns`, section 9): transcript, language code, chip and register, intent, validated actions (command, input, heard phrases, resolved names), `missing_fields`, reply text and speech parts, `ref_map`, flags read, timings, request ids. Then send the terminal event.

A clarifying turn keeps its partial actions. When the next turn names it as context, the server merges: values from the new turn win, values from the stored turn fill the gaps. That is how S-02 completes S-01, and how "Caterer ka" answers M-05's question.

### 1.12 The review card and its states

Built by `src/components/voice/` from the `preview` event. On phones it is a bottom sheet at about 60% height; on desktop the panel docks right at 400 px (design-direction 7.3).

**What a card shows:**
- **A title in plain words** ("Correction, not a new payment"; "Add sangeet"; "Reception venue").
- **One row per field:** label, value, the heard words in small type ("heard 'chaalis hazaar'"), and the old value struck through for changes (C7). States: ok, uncertain ("?" with a dotted underline and the question), missing ("?"), suggested ("suggested" tag, for values the server picked such as the payment kind or the requirement's vendor), edited.
- **An "After saving" block,** computed in code from read models, before anything is written: balances ("Still owed ~~₹1,50,000~~ ₹1,60,000"), RSVP counts, conflicts that appear or clear, "Guests still see Banyan Hall until an owner publishes."
- **Warnings** (duplicate, over budget, overpaid, previous amount differs).
- **A button named for the action:** Save correction, Save payment, Save new amount, Save both, Save draft, Add sangeet, Save wedding, Publish revision 3, Send for approval, Save requirement, Save RSVP, Export card, Save shagun. Beside it: Edit and Cancel.
- **The reference in small type** (PAY-01, EVT-REC), so judges can match it to History.

**Editing.** Tapping a field opens an inline editor: amounts typed with or without grouping, a date picker, a time picker, a list for enums and records. Edited values go to the confirm as `edits` and are validated like any typed input. An edit clears that field's "?".

| State | Shown | Notes |
|---|---|---|
| Proposed, ready | The full card; the button enabled | Silent; the card does the talking |
| Proposed, needs input | "?" fields; the button disabled with the reason beside it ("Add the year and the couple's names to save.") | The question is spoken. A spoken answer with this turn as context fills it |
| Saving | The button keeps its width; a spinner after 150 ms | Money is never saved optimistically |
| Saved | The card collapses into the receipt "Saved by Mira, 3:10 pm. Undo". The app routes to the affected record and the changed figures get the wash (AT-2.12) | Undo runs the reverse as a typed command (5.5) |
| Sent for approval | Receipt "Sent to Mira for approval" | Manager money (V8) |
| Partly saved | One line per action: saved, or not saved with the reason | V7 |
| Refused | No card with a Save button; the refusal line; the prefilled form opens | 4.10 |
| Changed meanwhile | "Diya changed this a moment ago" with the refreshed values; the button needs another tap | After a 409 at confirm (1.13) |
| Expired | "This request expired. Say it again." | 10 minutes (V2) |
| Cancelled or replaced | The card closes; "Nothing was changed." or "Replaced by your new request." | |

The planner shell's poller reads `GET /api/w/{wedding_id}/version` every 2.5 s and calls `router.refresh()` when `version` moved, and once more whenever the tab becomes visible or gains focus. `router.refresh()` keeps client state, so an open card survives it (architecture 2.4). Writing a voice turn never moves `version` (section 9), so an open card never triggers a refresh by itself.

### 1.13 Confirming: `POST /api/voice/confirm`

**Request:** `voice_turn_id`; optional `edits` (a list of `action_index`, `field`, `value` as text); `via` (`tap`). The phrase path reaches the same logic from the turn route with `via` `phrase`.

**Checks, in order:**

| # | Check | Failure |
|---|---|---|
| 1 | Session | 401 `unauthenticated` |
| 2 | The turn exists and its `user_id` is the caller (V2) | 403 `forbidden` (AT-2.8), also for an unknown id, so ids can't be probed |
| 3 | `voice_pilot` still on | 403 `voice_unavailable` |
| 4 | Status: `confirmed` or `partially_saved` → replay (below). `cancelled`, `superseded`, `answered`, `paused`, `failed` or `expired` → closed | 410 `voice_turn_expired`, message "This request is closed." |
| 5 | Under 10 minutes since the turn was created | 410 `voice_turn_expired`; the turn becomes `expired` |
| 6 | After applying `edits`: nothing missing or uncertain | 422 `validation_failed` with the first such `field` |
| 7 | Per action, in order: build the envelope; the dispatcher's guard calls the voice gate (flagsmith 3.2), then runs the command | As below |

**The envelope per action** (domain 3.0): `wedding_id`; `command` (the kind, or `propose_change` with `{command, input}` for a manager's A1 command); `input` with server-filled `expected_version` or `expected_draft_version` from the preview (V6) and UUIDs from `ref_map`; `idempotency_key` `{voice_turn_id}:{index}`; `source` `voice`; `voice_turn_id`. The command stores the transcript as `spoken_text` where it keeps one (payment and commitment versions).

**Outcomes:**
- **All applied (or proposed):** turn `confirmed`, `confirmed_at`, `confirmed_via`. The reply is filled from the results (`vendor_totals`, `rsvp_totals`) and read models, after commit.
- **A later action fails:** the earlier ones stay saved (each had its own transaction), the rest are not run, turn `partially_saved` (V7). Reply: "Saved the commitment, but not the advance: {reason}. You can add it on the form."
- **423 `voice_writes_paused` on the first action** (the switch flipped after the card appeared): nothing written, turn `paused`, response 423 with domain 3.8's body plus the voice block. `error.prefill` is always a list of `{command, input, labels}`, one entry per action (decision D121): the dispatcher returns its single action's entry, and the confirm route rebuilds the full list from the stored turn before it answers 423. The card turns into the refusal line and the prefilled form (AT-2.7 "Also").
- **409 `stale_version` or `draft_changed`:** nothing written for that action. The route re-runs resolution for it against the current record (no model call), stores the refreshed preview and answers 409 with it. The card shows "Changed meanwhile" (1.12) and needs another tap.
- **Any other command error** (`duplicate_requirement`, `not_invited`, `validation_failed`): shown on the card in plain words (6.1 row 23). The turn stays `proposed`: if an edit can fix it the button comes back after the edit, otherwise only Cancel is left and the turn expires at 10 minutes. `failed` is kept for speech and model failures (section 9).
- **Replay:** a second confirm, a double tap, a network retry or a repeated "haan, save karo" finds the receipts by key and returns each action's stored result with outcome `replayed`. Nothing is written twice (X-01, AT-2.9).
- **How screens catch up (polling only, architecture 2.4).**
  - The speaker's screen: on a 200 or 202 confirm, or a `saved` event, the dock goes to `navigate.path` when the response has one, and otherwise calls `router.refresh()` once. Either way the page re-renders from the server with the commit in it.
  - The figures to highlight ride in that path. `src/contracts/routes.ts` exports a `highlight` query parameter (comma-separated field keys); Lane C appends it to `navigate.path`, and Lane B's page reads it and applies the highlight once (decision D121).
  - The receipt and the reply come from this response, never from a later message.
  - Every other open planner screen sees the change through its own 2.5 s version poll: Mira's laptop shows Diya's E-04 draft within about 1 to 3.5 s.
  - Guest pages see a publish through their 10 s revision poll, so Tara's page updates within about 12 s: one poll plus the refresh (decision D92).
  - Nothing is pushed.

**Response** (200, or 202 when every action was proposed; shortened: `voice` carries all five dock fields):

```json
{"ok":true,"voice_turn_id":"a41f…","status":"confirmed","confirmed_via":"tap",
 "results":[{"index":0,"command":"correct_payment","outcome":"applied","idempotency_key":"a41f…:0",
   "entity_ref":"PAY-01","activity_entry_id":"c9a0…","vendor_totals":{"committed_inr":200000,"paid_inr":40000,"outstanding_inr":160000}}],
 "reply":{"display_text":"एक लाख साठ हज़ार रुपये बाकी हैं।","language":"hinglish","speak":true,"parts":1},
 "navigate":{"path":"/w/0b7c…/vendors?vendor_id=…&highlight=outstanding_inr"},
 "voice":{"voice_available":true,"writes_enabled":true,"spoken_replies":true}}
```

`POST /api/voice/cancel` takes `voice_turn_id`, applies checks 1 to 4, marks the turn `cancelled` and returns the cancel reply (1.8). Check 3 is there because every `/api/voice/*` route answers 403 `voice_unavailable` when `voice_pilot` is off (flagsmith 3.1); the card then closes with the mic's off text. At check 4, cancelling a closed turn is not an error: it returns the same reply.

### 1.14 Spoken replies (Bulbul)

**When.** Answers, questions back, refusals, and confirmations after the commit. A complete preview is silent; a preview that needs input speaks its question. A write's reply is never spoken before the server has said it was saved (V9), and it should start within 0.7 s of the saved state showing (design-direction 7.1).

**The route:** `GET /api/voice/turns/{voice_turn_id}/reply-audio?part={n}` (folder `turns/[voice_turn_id]/reply-audio/`, architecture 4.1), for the speaker only.
- Checks in order: a session (401 `unauthenticated`); the turn is the caller's (403 `forbidden`, also for an unknown id, as at confirm); `voice_pilot` on (403 `voice_unavailable`, flagsmith 3.1).
- No rate limit of its own (decision D121): a turn's audio parts are capped by its stored speech parts, and the turn itself already counted against the per-user limit (1.4 check 4).
- Reads the stored speech parts of that turn's latest reply. The browser never sends text to speak.
- Checks `spoken_replies` for the user. Off: 204 and no Bulbul request (flagsmith 3.3).
- Calls `POST https://api.sarvam.ai/text-to-speech/stream` with `text` (the part), `language_code`, `model` `bulbul:v4-flash` (always sent: omitting it routes to v3, which rejects v4 voices), `speaker`, `enable_preprocessing` true and `output_audio_codec` `mp3`.
- Checks the status and that the content type is `audio/mpeg` before passing the body through (errors come back as JSON, RS B19). Streams the chunks to the browser as they arrive (`maxDuration` 30 s, architecture 2.2).
- First-byte timeout 8 s. No retry: the text is already on screen. A failure returns 500 `internal_error`, and the dock shows a small "Audio unavailable" note beside the caption.

**Speech parts.** The speech text is split at sentence ends (। . ?) into parts of at most 140 characters. The dock fetches part 2 while part 1 plays. Most replies are one part.

**The voice is chosen from the speech text's script** (RS B7):

| Speech text | `language_code` | `speaker` |
|---|---|---|
| Contains Devanagari | `hi-IN` | `simran_enhi_customer` |
| Latin only | `en-IN` | `simran_en_customer` |

The audition (RS §7 item 5) may swap either voice. L plays the samples at about 09:14; the user (or the teammate) picks the two voices by 10:30, which takes about 2 minutes, and with no pick these defaults stand (decision D78). The choice is one constant in `src/server/voice/`.

**Display text and speech text are separate.** Every template has both (4.10):
- Hindi words are written in Devanagari in the speech text even when the display is Latin Hinglish. E-04 displays "Draft mein reception ab Lotus Hall mein hai." and speaks "Draft में reception अब Lotus Hall में है।"
- Every amount in speech is words built in code (3.5); every count and day in Hindi speech too. `enable_preprocessing` stays on as a safety net only.

**iOS and autoplay.**
- The dock keeps one `<audio>` element for the whole session.
- In the release, Stop, Send and Save gesture handlers, it synchronously plays a 0.1 s silent clip (an inline data URI) on that element, before any `await`. WebKit drops the gesture after an `await`, and an element played in a gesture may later play new sources.
- The reply then plays on the same element.
- If `play()` still fails with `NotAllowedError`, the caption shows a "Play reply" button (Phosphor SpeakerHigh).

**Captions** show the display text with a Stop button (Phosphor Stop) while audio plays.

### 1.15 Flags on the voice path

Flag names, fallbacks and where they are read are flagsmith.md's (section 3, 6.5 and 6.8). This is how voice uses them:

| Flag | Read by | Effect |
|---|---|---|
| `voice_pilot` | VoiceDock (server component, per render); the setup screen's render; every `/api/voice/*` request: turn, confirm, cancel, reply-audio and trace | Off: no mic ("Voice is switched off right now. You can type or edit directly."), and every voice route answers 403 `voice_unavailable` before any Sarvam call |
| `voice_writes_enabled` | The turn route (early check, 1.11 step 9); the dispatcher's voice gate at every confirmed action (environment flags, fresh each time); VoiceDock; the setup screen's entry decision (flagsmith 3.4 rows 4 and 5) | Off: questions answered; writes refused at the turn (`refused`, turn `paused`) and at confirm (423). Typed commands, the guest RSVP and NudgeBee's retry never read it. The card reader's apply route doesn't either (doc-ai 1.6) |
| `spoken_replies` | The turn and confirm routes before marking a reply `speak`; the reply-audio route | Off: no Bulbul request; text only |

**The voice block.** Every voice response carries flagsmith 6.9's five dock fields under the key `voice`: in the `heard` and `done` events, and in every JSON response of the voice routes, errors included. So the first refused turn updates the mic at once (flagsmith 10.3).

```json
{"voice":{"voice_available":true,"writes_enabled":false,"spoken_replies":true,
  "chip":{"key":"internal_team","label_en":"Voice · team preview","label_hi":"वॉइस · टीम प्रीव्यू"},
  "fallback":false}}
```

- `chip` keys are flagsmith 3.1's: `internal_team`, `voice_rollout`, `voice_on`, `safe_mode`; null when voice is off. `writes_enabled` false adds the second chip, `questions_only`, "Questions only" / सिर्फ़ सवाल, whose popover says "Voice can answer questions. To change something, type it." Both chips sit beside the header mic, on desktop and phone (decisions D20 and D121).
- **No state route** (flagsmith 6.9 and 10.3). VoiceDock is a server component. A navigation, a `router.refresh()` after `version` moves, or the focus refresh (architecture 2.4: once whenever the tab becomes visible or gains focus) re-renders it with a fresh evaluation, so AT-2.7's chip appears within one render of switching back from the Flagsmith tab. The dock's client part uses whichever block it received last: new props replace a response's block, and a voice response's block replaces the props' until the next render.
- **The gate fails closed from the first minute** (decision D47). The contracts PR's voice-gate stub refuses every voice write; it never answers "enabled". Lane C's real gate replaces it in `lane-c-voice` at 10:45.
- **The kill-switch checks on production** (decision D47, flagsmith 7.6 FV7). At 11:15 the user turns `voice_writes_enabled` off, and Lane C checks what is deployed: the early refusal with a `paused` turn, and the "Questions only" chip. If Lane C's pipeline splits into `lane-c-voice-pipeline`, this first stage moves to right after the 11:40 deploy, and the user flips the switch then (decision D121). After the 12:30 deploy the full check runs: a voice write pending from before the flip, confirmed after it (423); one typed save (R-03's requirement form, or an Events edit such as a dress code if that form isn't merged yet, decision D114); one read-only question. The flag is then restored, and the result goes into the README log.
- **`/setup` has no poller and no focus refresh** (architecture 2.4; flagsmith 5.3; decision D79, the one exception to D37). There a flip reaches the dock on the next navigation or with the next voice response's block. The server enforces the switch on the next request either way.
- **No flags in the browser** (flagsmith 6.9). The dock's client part gets plain props and voice blocks only: no Flagsmith SDK, key, identity or traits. The version poll never calls Flagsmith.
- **VoiceDock's props** (decision D97). The contracts stub declares the final ones, and changing them is a contracts change made by L. Lane B's shell passes `wedding_id` alone. The setup screen passes `wedding_id` null, plus `setup_opened_at` (1.4) and `show_printed_card`, true while the setup render's `image_extraction_provider` isn't `off` (7.3 I-03). VoiceDock reads the rest on the server (the session, the screen language, the flags, fixture mode) and hands its client part plain props, including `dispatchCommand` for Undo (decision D98).
- Fixture mode is not a flag. VoiceDock passes it as a prop, and the `heard` event says `input_mode` `fixture` (6.4).
- `voice_turns.flags` stores `voice_pilot`, `voice_writes_enabled`, `spoken_replies`, `env_label`, the setup variant on setup turns, and `fallback` (flagsmith 10.1 item 7). The confirm also records the gate's answer per action in `results`.
- **The setup experiment, from the voice side** (flagsmith 3.4, 5.3 and 5.4).
  - The setup variant on a setup turn is copied from the same identity evaluation the route already made. Voice never branches on it.
  - Voice routes never record an exposure: no `trackExposureEvent`, and no `experiment_exposures` write. Only the setup page's server render records exposures.
  - The conversion needs nothing from voice. A voice-confirmed `set_wedding_profile` create runs through the dispatcher like the form. The dispatcher's after-commit setup-saved hook sends `setup_saved` for both arms and both input paths, using the `setup_opened_at` the turn passed through (1.4).
  - Voice routes send no Flagsmith events of their own.
- **Flagsmith unreachable:** fallbacks apply (flagsmith 6.8). Internal accounts keep the mic with the chip "Voice · safe mode" and can only ask, because the kill switch fails closed. Everyone else gets no mic, and the routes answer 403 `voice_unavailable` (flagsmith 10.1 item 8).

### 1.16 Latency, timings and the morning voice checks

**Timeouts in one place:** Flagsmith 2 s plus one retry (flagsmith 6.3); speech to text 10 s per attempt; model 12 s, retry 20 s; Bulbul first byte 8 s; no new Sarvam attempt after 30 s of route time; the browser gives up on a turn after 45 s ("That took too long. Nothing was saved. Try again or type.") and cancels it.

**Timings stored per turn** in `timings_ms`: `flags`, `keyterms`, `stt`, `stt_retry`, `snapshot`, `llm`, `llm_retry`, `resolve`, `server_total`; at confirm `gate`, `dispatch`, `reply`. The dock measures `release_to_heard`, `release_to_card` and `saved_to_audio`, shows them in the judge panel (section 8) and sends them with the next confirm, cancel or turn as `client_timings` so they are kept. These give voice-test-set's two timings per row: speech end to preview, and confirm to the start of the spoken reply.

**The morning voice checks** (decision D78). L runs V-T1, V-T2 and the Bulbul audition samples with T0 to T4 at about 09:14, from `~/sarvam-smoke`. The key is read from `.env.local` and never printed. The user (or the teammate) listens and picks the two voices by 10:30. V-T3 and V-T4 belong to Lane C (decision D112). V-T4 runs through the turn route's `text` input as soon as the route answers (about 10:25): 3 runs of the live 8, before `lane-c-voice` is marked ready. V-T3 runs on both phones through Lane C's tunnel before 10:40 if the route records by then, and otherwise by 11:30 at the latest, with the WAV fallback off until then. L passes the 09:14 results to Lane C at its start.

| Check | How | Decides |
|---|---|---|
| V-T1 English with `hi-IN` | Speak S-01, G-01 and R-01 through T2's request with `hi-IN` and `codemix` | If the English comes back in Latin with the numbers right, `hi-IN` stays the only default. Otherwise the dock asks English-first people to pick "English only" on first use |
| V-T2 Keyterms | Speak O-01 and O-03 with Latin-only keyterms, then with Devanagari spellings added ("अन्नपूर्णा", "लोटस हॉल") | Whether list 3 and 4 terms get Devanagari twins |
| V-T3 Phone formats | Record M-03 on the iPhone (Safari) and the Android phone, upload through the real turn route over Lane C's tunnel | Whether the WAV fallback must be on for a browser |
| V-T4 The real tool | The 8 live lines typed into the turn route's `text` input, 3 runs each, so the model gets the full `propose_actions` schema and the demo snapshot | Latency against the 2.0 s budget, `reasoning_tokens` 0, and whether temperature drops to 0 |

### 1.17 The voice routes in one table

| Route | Who | Body | Answer | `maxDuration` |
|---|---|---|---|---|
| `POST /api/voice/turn` | An owner or manager of `wedding_id`, or any signed-in user in setup | Multipart (1.4) | 200 NDJSON stream (1.5); 401, 403, 422, 429 as JSON | 60 s |
| `POST /api/voice/confirm` | The speaker | JSON (1.13) | 200 or 202; 401, 403, 409, 410, 422, 423 | 30 s |
| `POST /api/voice/cancel` | The speaker | JSON `voice_turn_id` | 200; 401, 403 | 10 s |
| `GET /api/voice/turns/{voice_turn_id}/reply-audio?part={n}` | The speaker | – | 200 `audio/mpeg` stream, 204 when spoken replies are off; 401, 403, 500 (1.14) | 30 s |
| `GET /api/voice/turns/{voice_turn_id}/trace` | The speaker, or an owner of the turn's wedding | – | 200 JSON (section 8); 401, 403 | 10 s |

- All are dynamic, server-only and under `src/app/api/voice/` (Lane C, architecture 4.2).
- The folders are `turn/`, `confirm/`, `cancel/`, `turns/[voice_turn_id]/reply-audio/` and `turns/[voice_turn_id]/trace/` (architecture 4.1). The dynamic segment is `[voice_turn_id]`, never `[id]` or `[turn_id]`.
- The `maxDuration` values are architecture 2.2's.
- Every 403 is either `forbidden` (not this person's turn or wedding) or `voice_unavailable` (`voice_pilot` off, flagsmith 3.1).
- The guest page never calls these routes. A guest link carries no session, so they answer 401.

---

## 2. The `propose_actions` tool

The tool keeps RS 3.2's top level and domain 3.9's rule: each action is `kind` plus **that command's own input fields, with the same names**. The schema is one flat object per action, the union of every kind's fields, all optional except `kind`, with no `null` unions and no open objects (RS: constrained decoding is undocumented for those). The schema lives in `src/contracts/api.ts` (Lane C's request to the lead), so the zod check in 1.11 and the tool definition can't drift.

### 2.1 Top level

| Field | Type | Required | Meaning |
|---|---|---|---|
| `intent` | `act`, `ask` or `clarify` | Yes | `act` proposes a change, `ask` is a read-only question, `clarify` means the model can't tell what is wanted. The server decides the turn's real outcome (1.11 step 8); a mixed turn (a question and a change) is `act` |
| `actions` | List of action objects (2.2), at most 4 | Yes (may be empty for `clarify`) | In the order spoken |
| `missing_fields` | List of strings, at most 12 | Yes (may be empty) | Field names the model could not fill or had to guess (2.3's vocabulary). With several actions, prefixed by the action's index and a colon: `1:amount_inr` |
| `reply` | Text, at most 200 characters | Yes (may be empty) | One short sentence in the speaker's language, with no numbers. Shown in the judge panel as "suggested by the model". Spoken only in the narrow case of 4.1 |
| `reply_language` | `en`, `hinglish` or `hi` | Yes | The model's reading of the speaker's language. Used only for all-Latin transcripts (1.6) |

### 2.2 Every action

| Field | Type | Meaning |
|---|---|---|
| `kind` | One of the 23 kinds in 2.3 | Required |
| `heard` | List of `{field, phrase}`, at most 12; `field` text up to 40, `phrase` text up to 80; both required | For every number, amount, date and time the action carries, the exact words from the utterance that gave it, copied as written in the transcript ("चालीस हज़ार", "dedh lakh", "the thirteenth", "shaam saat baje"). Optional for names, references and `text`, where it lets the card underline the words |
| The kind's fields | 2.4 | Only those the person actually said, plus references from the snapshot |
| `previous_inr` | Integer | `correct_payment` and `update_commitment`: the old amount, **only when the person said it** ("पचास नहीं, चालीस"). Never sent to a command. Without a `heard` phrase it is ignored: the old value always comes from the record |
| `user_claim_inr` | Integer | `query_balance`: an amount the person asserts ("₹1.5L baaki hai na?", M-09), checked in code |
| `date_text` | Text, at most 40 | `set_wedding_profile`: a day and month without a year, as said ("14 December") |
| `month` | Integer 1 to 12 | `set_wedding_profile`: a month alone (S-03) |

**`missing_fields` vocabulary:** any field name from 2.4, plus `year`, `month`, `day` (parts of a date), `daypart` (morning or evening for a 12-hour time), `vendor_id`, `event_id`, `payment_id`, `guest_ids` (which record). The server's own list (1.11 step 7) is what counts; the model's list can only add "?" marks, never remove them.

### 2.3 The kinds

**Write kinds (16), each the domain command of the same name** (domain 3.9): `set_wedding_profile`, `create_event`, `update_event`, `update_invite_style`, `add_vendor`, `record_commitment`, `update_commitment`, `record_payment`, `correct_payment`, `add_requirement`, `add_guest`, `set_rsvp`, `set_dietary`, `publish_itinerary`, `request_card_export`, `record_shagun`.

**Ask kinds (7), each answered from read models** (section 4): `query_balance`, `query_budget`, `query_rsvp`, `query_event`, `query_changes`, `query_catering`, `query_shagun`.

- `publish_itinerary` is accepted only as the turn's single action (domain V11, 1.11 step 2).
- `record_shagun` and `query_shagun` stay in the schema even before Should #13 ships. Until it ships, the server answers "The Shagun register isn't set up yet." and writes nothing.
- **Not kinds:** confirm and cancel (phrases, 1.8); reading a card image (the paperclip, doc-ai §1.6); `propose_change` (server only, V8); and every command voice doesn't offer (`void_payment`, `void_commitment`, `record_expense`, `set_budget_line`, `set_sharing`, `invite_member`, `set_invitations`, invitation links, proposal decisions, `mark_shagun_thanked`, `reset_demo`). A request for one of those comes back as `clarify` with no actions, and the server answers: en "I can't do that by voice yet. You can do it on its page." · hinglish "Yeh abhi voice se nahi ho sakta. Uske page par kar sakte hain." · hi "यह अभी वॉइस से नहीं हो सकता। उसके पेज पर कर सकते हैं।"

### 2.4 The fields in the schema

Every field is optional. Texts are trimmed; references are text up to 24 characters; dates are `YYYY-MM-DD`; times are `HH:MM`, 24-hour, IST; integers are whole numbers (an amount arrives in rupees).

| Field | Type and limits | Kinds |
|---|---|---|
| `bride_name`, `groom_name` | Text up to 60 | `set_wedding_profile` |
| `wedding_date` | Date | `set_wedding_profile` |
| `city` | Text up to 60 | `set_wedding_profile` |
| `budget_inr` | Integer | `set_wedding_profile` |
| `expected_guests` | Integer | `set_wedding_profile` |
| `event_kind` | `mehendi`, `haldi`, `sangeet`, `wedding`, `reception`, `other` | `create_event` |
| `title` | Text up to 40 | `create_event`, `update_event` (for `other` functions) |
| `event_id` | Reference | `update_event`, `record_commitment`, `add_requirement`, `set_rsvp`, `query_rsvp`, `query_event`, `query_catering` |
| `event_ids` | List of references, at most 10 | `add_vendor`, `add_guest` |
| `event_date` | Date | `create_event`, `update_event` |
| `start_time`, `end_time`, `muhurat_time` | Time | `create_event`, `update_event` |
| `venue_name` | Text up to 80 | `create_event`, `update_event` |
| `dress_code` | Text up to 120 | `create_event`, `update_event` |
| `lead_name` | Text up to 60 | `create_event`, `update_event` |
| `expected_headcount` | Integer | `create_event`, `update_event` |
| `theme` | `maroon_gold`, `peacock_gold` | `update_invite_style` |
| `typeface` | `eczar`, `tiro_devanagari` | `update_invite_style` |
| `layout` | `card_with_inserts`, `one_card`, `facing_pages` | `update_invite_style` |
| `photo_frame` | `mounted`, `arch` | `update_invite_style` |
| `photo_asset_id` | Reference (`ASSET-NEW` or an existing couple photo) | `update_invite_style` |
| `name` | Text up to 80 | `add_vendor` |
| `vendor_category` | A `budget_category` value | `add_vendor` |
| `status` | `considering`, `booked`, `cancelled` | `add_vendor` |
| `contact_name` | Text up to 60 | `add_vendor` |
| `notes` | Text up to 200 | `add_vendor` |
| `vendor_id` | Reference | `record_commitment`, `update_commitment`, `record_payment`, `correct_payment`, `add_requirement`, `query_balance`, `query_catering` |
| `pricing` | `lump_sum`, `per_unit` | `record_commitment`, `update_commitment` |
| `unit` | `plate`, `person`, `item`, `hour`, `day` | `record_commitment`, `update_commitment` |
| `unit_price_inr` | Integer | `record_commitment`, `update_commitment` |
| `quantity` | Integer | `record_commitment`, `update_commitment`, `add_requirement` |
| `amount_inr` | Integer | `record_commitment`, `update_commitment`, `record_payment`, `correct_payment`, `record_shagun` |
| `description` | Text up to 200 | `record_commitment`, `update_commitment` |
| `due_on` | Date | `record_commitment`, `update_commitment` |
| `commitment_id` | Reference | `update_commitment` |
| `payment_id` | Reference | `correct_payment` |
| `payment_kind` | `advance`, `instalment`, `final` | `record_payment`, `correct_payment` (to find the payment) |
| `paid_on` | Date | `record_payment`, `correct_payment` |
| `method` | `upi`, `cash`, `bank_transfer`, `cheque`, `card`, `other` | `record_payment`, `correct_payment` |
| `note` | Text up to 200 | `record_payment`, `correct_payment`, `record_shagun` |
| `text` | Text up to 200 | `add_requirement` |
| `requirement_category` | `catering`, `decor`, `music`, `ritual`, `logistics`, `attire`, `other` | `add_requirement` |
| `full_name` | Text up to 80 | `add_guest` |
| `household_id` | Reference | `add_guest`, `record_shagun` |
| `household_name`, `relation` | Text up to 80 | `add_guest` |
| `max_plus_ones` | Integer | `add_guest` |
| `dietary_note` | Text up to 200 | `add_guest`, `set_dietary` |
| `guest_ids` | List of references, at most 50 | `set_rsvp` |
| `guest_id` | Reference | `set_dietary` |
| `rsvp_status` | `attending`, `declined`, `pending` | `set_rsvp` |
| `plus_ones` | Integer | `set_rsvp` |
| `format` | `png` | `request_card_export` |
| `giver_name` | Text up to 80 | `record_shagun` |
| `received_on` | Date | `record_shagun` |
| `how` | Text up to 120 | `record_shagun` |
| `scope` | `vendor`, `wedding` | `query_balance` |
| `detail` | `venue`, `time`, `date`, `dress_code`, `all` | `query_event` |
| `next_event` | Boolean | `query_event` ("the next function") |
| `day` | Text up to 10: `today` or a date | `query_changes` |
| `latest` | Boolean | `query_changes` ("what did Diya change": the latest entry) |
| `actor_member_id` | Reference | `query_changes` |
| `thanked` | Boolean | `query_shagun` |
| `budget_category` | A `budget_category` value | `query_budget` |

**Never in the schema, so the model can't send them:** `expected_version`, `expected_draft_version`, `idempotency_key`, `source`, `voice_turn_id`, `wedding_id` (V6, domain 3.9); `contact_phone`, `phone`, `email` (G9); `venue_id` (voice sends `venue_name`, matched in code); `quote_id` and `agreed_on` (server-filled); `commitment_id` on a payment (server-linked); `change_reason` (a server template, 5.4); `title_hi`, `description` of a function, `wording_en`, `wording_hi`, `heading_hi` and `blessing_line` (typed in their screens); `group_label` and `note` on a guest; `setup_opened_at`.

### 2.5 References and names

The model is told to put snapshot references in every `*_id` field. When it puts a name or a role word there instead, the server tries these rules before treating the field as missing (V5). All matching uses the normalised form of 1.6.

| Record | The server also accepts | Several match | None match |
|---|---|---|---|
| Function | The kind word: mehendi, mehndi, मेहंदी; haldi, हल्दी; sangeet, संगीत; wedding, shaadi, vivah, pheras, शादी, विवाह; reception, रिसेप्शन. An `other` function's title | Clarify, listing them | Clarify with every function, in `event_kind` order: "Kis function ka …? Mehendi, haldi, sangeet, shaadi ya reception?" (E-07) |
| Vendor | Its name, ignoring case, punctuation and "&", or one distinctive word of it ("Annapoorna"). A role word that matches exactly one vendor that is not one-off: caterer, catering, कैटरर, khana wala (catering); decorator, decor, डेकोरेटर, सजावट (decor); photographer, photo, video, फ़ोटोग्राफ़र (photography); DJ, music, sound, डीजे (music); mehendi artist, mehendi wali, makeup (mehendi_makeup); venue, hall, वेन्यू (venue); printer (invitations_gifts); boutique, tailor (attire) | Clarify, listing them by role word in the order the vendors were added (M-05) | Clarify: "I couldn't find {heard} among your vendors." |
| Venue | `venue_name` matched to this wedding's venue names, ignoring case; then one distinctive word ("Lotus" for Lotus Hall); "Lotus Hall, Mallige Gardens" matches Lotus Hall at that place | Clarify, listing them | A new venue, and the card says "New venue" (domain 3.2; decision D88 closes domain open question 20 this way) |
| Payment | Section 5.2 | Section 5.2 | Section 5.2 |
| Commitment | The vendor's only active commitment | Clarify, listing them by amount | Clarify (2.6) |
| Guest | Full name; first name and surname; a first name alone when only one named guest has it. A surname said once after two first names applies to both ("Nikhil aur Prachi Jain") | Clarify, listing up to 3 with their household | Clarify: "I couldn't find {heard} on the guest list." |
| Household | A surname with ji, family or parivaar, when exactly one household has it ("Sharma ji" is H05, demo-data 10) | Clarify, listing them | `add_guest`: a new household; `record_shagun`: the giver as said, with no household |
| Member | Display name; "the event manager" or "manager" when the wedding has exactly one manager (O-04) | Clarify | Clarify |
| Photo | `ASSET-NEW`, or an existing couple photo's reference | – | Clarify: "Attach the photo with the paperclip first." |

A reference the snapshot never gave (a made-up `PAY-09`) is unknown, and the field is treated as missing.

### 2.6 Each write kind

Each block gives who may run it, the **identifying** field (which record changes) and the **primary** field (the value being set). Missing or uncertain identifying or primary fields make the turn a question with no card (1.11 step 8). The table says what the model fills, what becomes the command input, what is checked, and what happens when the value is missing or unclear. "Re-read" means section 3's phrase check. Card titles, buttons and replies are in 4.10 and section 7.

#### `set_wedding_profile`

Who: creating, any signed-in user in setup (no wedding yet); updating, owners. A manager is refused (`forbidden`): "Only Mira or Kabir can change the wedding details." Identifying: none on create (a setup draft always shows as a card); the wedding on update. Primary: on update, the changed field.

| Field | From the model | Becomes | Checked | Missing or unclear |
|---|---|---|---|---|
| `bride_name`, `groom_name` | As said, in Latin script | The same | 1 to 60 characters | On create: "?" and asked for (S-01) |
| `wedding_date` | Only when day, month and year were all said | `wedding_date` | Re-read; 2026-01-01 to 2030-12-31; a weekday said with it must match | **A year is never filled in** (AT-1.4). No year: `year` in `missing_fields` |
| `date_text` | A day and month without a year ("14 December") | Kept in the draft; joined into `wedding_date` when a year is said (S-02) | Readable as a day and month | – |
| `month` | A month alone | Kept in the draft | 1 to 12 | `day` and `year` missing (S-03) |
| `city` | As said | `city` | Up to 60 characters | Optional |
| `budget_inr` | The number | `budget_inr` | Re-read; 0 to 10,00,00,00,000 (M2) | "?" |
| `expected_guests` | The number ("roughly 250" is 250) | `expected_guests` | Re-read; 0 to 5,000 | "?" |

Server-filled: `setup_opened_at`, from the turn request. Follow-up turns merge into the draft (1.11). Nothing reaches `weddings` until the card is confirmed with names and a full date (domain 3.8).

#### `create_event`

Who: owners and managers; writes the draft. Identifying: `event_kind` (and `title` for `other`). Primary: `event_date`.

| Field | From the model | Becomes | Checked | Missing or unclear |
|---|---|---|---|---|
| `event_kind` | The function word (2.5) | `event_kind` | Enum | Clarify: "Which function?" |
| `title` | Only for `other` ("Baraat", "Cocktail night") | `title` | Up to 40 | Required for `other` |
| `event_date` | The date | `event_date` | Re-read (3.3). A day alone takes the wedding's month and year, and the card says "from the wedding month" (E-01). A relative word (kal, aaj, parson, tomorrow) always becomes a question (E-08). 2026 to 2030 | Clarify: "Kis tareekh ko?" |
| `start_time`, `end_time`, `muhurat_time` | Times | The same | Re-read (3.4); end after start on the same day; muhurat between them | A 12-hour time with no daypart and two valid readings: "?" and "Subah saat ya shaam saat?" |
| `venue_name` | The venue as said | `venue_id` when it matches one of this wedding's venues (2.5); otherwise `venue_name`, and the card says "New venue" | Up to 80 | Optional |
| `dress_code`, `lead_name` | As said | The same | Up to 120 and 60; `lead_name` is a person, not a role | Optional |
| `expected_headcount` | The number | The same | Re-read; 0 to 5,000 | Optional |

If a function of the same kind (other than `other`) already exists, the card warns "There's already a sangeet on Sun 13 Dec." and Confirm stays enabled. "After saving" lists conflicts the new function would create, computed with domain 4.3's rules ("Overlaps the Mehendi by 30 minutes").

#### `update_event`

Who: owners and managers; writes the draft. Identifying: `event_id`. Primary: at least one changed field.

| Field | From the model | Becomes | Checked | Missing or unclear |
|---|---|---|---|---|
| `event_id` | Reference, or the function word | UUID | A function of this wedding | Clarify with the function list (E-07's form) |
| Any `create_event` field except `event_kind` | As in `create_event` | The same | As in `create_event`. A 12-hour time with no daypart takes the only reading that fits the function's stored times: "साढ़े पाँच बजे तक" as an end after a 15:00 start is 17:30 (E-03) | As in `create_event` |

- Server-filled: `expected_version`, the function's version shown on the card.
- Clearing a field is not offered by voice (the schema has no nulls): "To clear it, use the form."
- Every value equal to the stored one: an answer, "It's already {value}.", and no card.
- "After saving" says "Guests still see {published value} until an owner publishes." and lists conflicts that appear or clear: "The over-capacity warning goes away." (E-04); "The overlap with the Sangeet goes away." (E-03).

#### `update_invite_style`

Who: owners and managers; writes the draft. Identifying: the wedding's invitation. Primary: at least one field.

| Field | From the model | Becomes | Checked | Missing or unclear |
|---|---|---|---|---|
| `theme` | "maroon and gold", "maroon": `maroon_gold`; "peacock", "peacock and gold", "mor": `peacock_gold` | `theme` | Enum | Another colour: clarify "We have Maroon & Gold and Peacock & Gold." |
| `typeface` | "Eczar"; "Devanagari", "Hindi font": `tiro_devanagari` | `typeface` | Enum | – |
| `layout`, `photo_frame` | "one card", "with inserts", "facing pages"; "arch", "mounted" | The same | Enum | – |
| `photo_asset_id` | `ASSET-NEW` for "this photo", or an existing photo's reference | The UUID of a `couple_photo` asset of this wedding (domain 3.9) | Exists, is this wedding's | "This photo" with nothing attached: clarify "Attach the photo with the paperclip first." |

Wording, the Hindi heading and the blessing line are typed in the studio, never by voice.

#### `add_vendor`

Who: owners and managers. Identifying: `name`. Primary: `vendor_category`.

| Field | From the model | Becomes | Checked | Missing or unclear |
|---|---|---|---|---|
| `name` | As said | `name` | Up to 80; unique ignoring case | The name exists: clarify "Annapoorna Caterers is already a vendor." (domain `duplicate_vendor`, checked at preview) |
| `vendor_category` | From the role word (2.5) | The same | `budget_category` | "?" with the choices |
| `status` | "booked", "book kar liya": `booked`; "cancel": `cancelled` | Default `considering` | Enum | – |
| `contact_name` | A person's name | The same | Up to 60 | Phone numbers are never taken by voice (G9) |
| `event_ids`, `notes` | Functions; a short note | The same | Up to 10; up to 200 | – |

#### `record_commitment`

Who: owners; a manager's goes as `propose_change` (V8). Identifying: `vendor_id`. Primary: the amount (`amount_inr` for `lump_sum`; `unit_price_inr` and `quantity` for `per_unit`).

| Field | From the model | Becomes | Checked | Missing or unclear |
|---|---|---|---|---|
| `vendor_id` | Reference or role word | UUID | A vendor of this wedding | Clarify with the vendor list |
| `pricing` | `per_unit` when a rate and a count were said; `lump_sum` when a total was | The same | Enum | – |
| `unit` | per person, head, plate, cover, thali: `plate` for a catering vendor, `person` otherwise; per item; per hour, ghanta: `hour`; per day, din: `day` | The same | Enum | `per_unit` with no unit: `plate` for catering, `person` otherwise, marked "suggested" |
| `unit_price_inr`, `quantity` | The numbers | The same | Re-read; 1 to 10,00,000 and 1 to 1,00,000 (M2) | "?"; no count: clarify "Kitne logon ke liye?" |
| `amount_inr` | `lump_sum`: the total said. `per_unit`: only if a total was also said | `per_unit`: computed in code as rate × quantity (M3); a model value is ignored. `lump_sum`: re-read | M3: a total said with a rate and a count must equal their product | Mismatch: clarify "250 × ₹800 is ₹2,00,000, but I heard ₹2,10,000. Which is right?" |
| `event_id` | The function | The same. With no function said and a `plate` or `person` unit: the vendor's only linked function (E1), shown on the card | – | Several linked functions: "?" |
| `description` | A basis the person said ("fixed minimum") | Appended to the server's "{quantity} {unit}s × {rate}" | Up to 200 | – |
| `due_on` | A date | The same | Re-read; the next such date on or after today | Optional |

Server-filled: `quote_id`, when the vendor has exactly one open quote (the card says "Accepts quote: ₹850 × 250"); `agreed_on` today (domain default). "After saving" shows the vendor's committed and outstanding figures and the budget line, with `over_budget` (M6).

#### `update_commitment`

Who: owners; managers through `propose_change`. Identifying: `commitment_id`. Primary: the changed value.

| Field | From the model | Becomes | Checked | Missing or unclear |
|---|---|---|---|---|
| `commitment_id` | Reference, or found from `vendor_id` | The vendor's only active commitment | Not void | Several: clarify, listing them by amount. None: clarify "Nothing is agreed with {vendor} yet. Shall I record a new amount?" |
| `vendor_id` | Reference or role word | Used only to find the commitment | – | – |
| `amount_inr` | The new total | `lump_sum`: `amount_inr`. `per_unit`: a new total alone is unclear | Re-read; M2 | `per_unit`: clarify "Is that a new rate or a new count?" |
| `unit_price_inr`, `quantity` | A new rate or count | The same; the amount is recomputed (M3) | Re-read; M2 | – |
| `previous_inr` | The old amount, only if said | Never sent | Compared with the stored amount | Differs: the card warns "You said ₹X; the record shows ₹Y." (domain OQ15) |
| `due_on`, `description` | As in `record_commitment` | The same | – | – |

Server-filled: `expected_version`. The same values: "It's already ₹1,25,000." and no card (outcome would be `unchanged`).

#### `record_payment`

Who: owners; a manager's goes as `propose_change` (M-12). Identifying: `vendor_id`. Primary: `amount_inr`. Whether a sentence is a new payment or a correction: 5.1.

| Field | From the model | Becomes | Checked | Missing or unclear |
|---|---|---|---|---|
| `vendor_id` | Reference or role word | UUID | A vendor of this wedding | Clarify with the vendor list |
| `amount_inr` | The number | The same | Re-read; M1, M2; under ₹100 is uncertain (3.6) | Clarify: "Kitna diya?" (M-13) |
| `payment_kind` | advance, एडवांस, booking amount, token: `advance`; final, last, aakhri, baaki ka poora: `final`; instalment, kisht: `instalment` | Not said: `advance` for the vendor's first payment and `instalment` after it (domain 3.3), marked "suggested" | Enum | – |
| `paid_on` | Only if a date was said | The same | Re-read: aaj is today, kal yesterday, parson the day before; a day and month is the latest such date not after today | Not said: empty, "Date not given" (domain 3.3, M-01) |
| `method` | UPI, GPay, PhonePe, Paytm: `upi`; cash, nakad, नकद: `cash`; NEFT, IMPS, RTGS, bank transfer: `bank_transfer`; cheque, चेक: `cheque`; card: `card` | The same | Enum | Optional |
| `note` | A short note | The same | Up to 200 | – |

- Server-filled: `commitment_id` when the vendor has exactly one active commitment (domain 3.3), including one created by an earlier action of the same turn (M-01).
- **Duplicate warning:** the same vendor, amount and kind as an existing payment, with the same date or both dates empty: "Looks like the ₹50,000 advance already recorded on 20 Nov. Save another?" Confirm stays enabled.
- **Overpaid warning** when paid would pass committed; the command still saves (domain 3.3).

#### `correct_payment`

Section 5.

#### `add_requirement`

Who: owners and managers. Identifying: `event_id`. Primary: `text`.

| Field | From the model | Becomes | Checked | Missing or unclear |
|---|---|---|---|---|
| `event_id` | Reference or function word | UUID | A function of this wedding | Clarify with the function list |
| `text` | What is needed as a short English phrase without the count ("Jain food"), names as said | The same | Up to 200 | – |
| `quantity` | The count | The same | Re-read; 1 to 10,000 | Optional |
| `requirement_category` | food, khana, plates, dessert, menu: `catering`; flowers, phool, decor, canopy, lights: `decor`; DJ, music, songs, gaana: `music`; pandit, puja, mandap items: `ritual`; chairs, seating, transport, parking: `logistics`; clothes, kapde: `attire`; else `other` | The same | Enum | – |
| `vendor_id` | If a vendor was named | Not named: the one vendor of the matching category (catering, decor, music, attire) that serves this function, marked "suggested" (AT-2.7's prefill has Annapoorna Caterers) | – | – |

- `text` is English so that domain's duplicate rule (same function, same text ignoring case and spaces, same quantity) catches R-02 after R-01. The heard words stay on the card ("heard 'जैन खाना'") and in Hindi replies.
- **Duplicate:** checked at preview. It is a question with no card: "Jain food for 12 is already on the reception." (R-02).

#### `add_guest`

Who: owners; managers with limits (domain 3.4). A manager may not send `event_ids` or `max_plus_ones`, and may not add into a household that has an active guest link. Any of these is refused at the turn with `forbidden` (1.11 step 2), and the dispatcher answers 403 `forbidden` if one reaches it. A manager's guest is added with no invitations; an owner invites them with `set_invitations`, which voice doesn't offer. Identifying and primary: `full_name`.

| Field | From the model | Becomes | Checked | Missing or unclear |
|---|---|---|---|---|
| `full_name` | As said | The same | Up to 80 | – |
| `household_id` | A household reference ("Sharma family", "Jain parivaar") | The same | – | Several households match: clarify |
| `household_name`, `relation` | For a new household | The same | Up to 80 | – |
| `event_ids` | Functions; "sab functions" means every function | The same | Up to 10 | – |
| `max_plus_ones` | The number | The same | Re-read; 0 to 10 | – |
| `dietary_note` | Short English | The same | Up to 200 | – |

Never by voice: phone and email (G9). A guest with the same name gives the `possible_duplicate` warning on the card.

#### `set_rsvp`

Who: owners and managers, on a guest's behalf (R10). Identifying: `guest_ids` and `event_id`. Primary: `rsvp_status`.

| Field | From the model | Becomes | Checked | Missing or unclear |
|---|---|---|---|---|
| `guest_ids` | References | UUIDs | 1 to 50; each with an active invitation to the function | Not invited: clarify "Prachi isn't invited to the mehendi." (domain `not_invited`, checked at preview) |
| `event_id` | Reference or function word | UUID | – | Clarify with the function list |
| `rsvp_status` | aa rahe, aayenge, coming, attending, confirm: `attending`; nahi aa paayenge, not coming, mana kar diya: `declined`; pata nahi: `pending` | The same | Enum | – |
| `plus_ones` | Only with one guest | The same | Re-read; up to the invitation's `max_plus_ones` | Above it: clarify |

Everyone already has that answer: "They're already marked attending." and no card. "After saving" shows the function's counts with the change applied (G-02: 231 attending, 10 not replied).

#### `set_dietary`

Who: owners and managers. Identifying: `guest_id`. Primary: `dietary_note` (short English, "Mushroom allergy"; up to 200).

#### `publish_itinerary`

Who: owners only. A manager is refused at the turn with `forbidden` (E-06), and it is never proposable (domain 3.2, AT-3.5).
- No model fields. Server-filled: `expected_draft_version`, from the sheet shown.
- It must be the turn's only action (domain V11, 1.11 step 2).
- Nothing unpublished: "There's nothing new to publish." and no card.
- **The preview is Lane D's reusable `PublishSheet`** (decisions D19 and D59), built from `itinerary.unpublished_changes`: "Publish revision 3 · 1 change: Reception venue", ~~Banyan Hall~~ Lotus Hall, primary button "Publish revision 3" (AT-3.4).
  - The sheet takes the reviewed `expected_draft_version` and a confirm callback. Lane B passes the planner action; Lane C passes the voice confirm (`POST /api/voice/confirm` for this turn). Either path makes exactly one write.
  - Lane D's handler and the sheet ship in the 11:40 batch. Lane C's E-05 integration ships in the 12:30 batch (`lane-c-voice-answers`).
- At confirm, `draft_changed` refreshes the sheet with the new list and needs another tap (AT-3.6).

#### `request_card_export`

Who: owners and managers. `format` is `png` ("card", "PNG", "image"). A one-tap card (domain OQ11). Lane D's `request_card_export` handler ships at 11:40; Lane C's I-02 integration ships at 12:30 (decision D59).
- Nothing published: "Publish the schedule first. There's no card to make yet."
- A job already exists for the published revision: "The card for revision 3 is already ready." (or "already being made"); no card.

#### `record_shagun`

Who: owners only; a manager is refused with `not_shared`. Only once Should #13 ships.

| Field | From the model | Becomes | Checked | Missing or unclear |
|---|---|---|---|---|
| `giver_name` | As said, or the household's line from the snapshot ("Ramesh & Kavita Sharma") | The same; with only a household, "{household} family" | Up to 80 | – |
| `household_id` | "Sharma ji": the only Sharma household (H05) | The same | – | Several: clarify, listing them |
| `amount_inr` | The number ("5,100", "ikyavan sau") | The same | Re-read; M1, M2; no lower bound (₹101 and ₹501 are usual) | Clarify: "Kitna shagun?" |
| `received_on` | A date | Default today | Re-read; not after today; kal is yesterday | – |
| `how`, `note` | "home visit", "UPI" | The same | Up to 120 and 200 | – |

### 2.7 Example arguments

M-01, two actions on one card (the commitment total is not in the arguments: code computes it):

```json
{"intent":"act","reply_language":"en","missing_fields":[],"reply":"Shall I save both?",
 "actions":[
  {"kind":"record_commitment","vendor_id":"VEN-CAT","pricing":"per_unit","unit":"plate","unit_price_inr":800,"quantity":250,
   "heard":[{"field":"unit_price_inr","phrase":"eight hundred per person"},{"field":"quantity","phrase":"250 people"}]},
  {"kind":"record_payment","vendor_id":"VEN-CAT","amount_inr":50000,"payment_kind":"advance",
   "heard":[{"field":"amount_inr","phrase":"fifty-thousand"},{"field":"payment_kind","phrase":"advance"}]}]}
```

S-01, a setup draft with the year and the names missing:

```json
{"intent":"act","reply_language":"en","missing_fields":["year","bride_name","groom_name"],
 "reply":"Which year is it, and what are the couple's names?",
 "actions":[{"kind":"set_wedding_profile","date_text":"14 December","city":"Bengaluru","budget_inr":1200000,"expected_guests":250,
   "heard":[{"field":"date_text","phrase":"14 December"},{"field":"budget_inr","phrase":"twelve lakh"},
            {"field":"expected_guests","phrase":"roughly 250 guests"}]}]}
```

O-03, two questions in one turn:

```json
{"intent":"ask","reply_language":"hinglish","missing_fields":[],"reply":"",
 "actions":[{"kind":"query_event","event_id":"EVT-REC","detail":"venue"},
            {"kind":"query_balance","scope":"vendor","vendor_id":"VEN-CAT"}]}
```

### 2.8 What the model's instructions say

The system message is plain text in `src/server/voice/`, in this order. It is versioned (`prompt_version` in the trace), so a rehearsal result can be tied to the prompt that produced it.

1. **Job.** "You turn one thing a wedding planner said into one call to propose_actions. Always call the tool. You only propose; the app checks, the person confirms, and the app saves."
2. **The input.** Transcripts mix Hindi in Devanagari and English in Latin script, and numbers may come as digits. Text typed in the dock may be Hinglish in Latin.
3. **References.** Use only references from the snapshot in `*_id` fields. Never invent one. If you can't tell which record, leave the field out and list it in `missing_fields`.
4. **Values.** Copy numbers, amounts, dates and times exactly as said. For each, add a `heard` item with the exact words from the utterance. Never add, multiply or subtract; never work out a total, a balance or a weekday; never fill a year, a month or a time of day that wasn't said. If you are unsure, leave it out and list it in `missing_fields`.
5. **Kinds.** A question is an `ask` kind; a change is a write kind; both in one sentence is two actions. Past tense with "tha", "thi", "the", "actually", "asal mein" or "X nahin, Y" about an existing payment or agreed amount is a correction (`correct_payment`, `update_commitment`); "aur", "phir se", "another", "more" is a new payment. Publishing the schedule is `publish_itinerary`. Anything not in the tool is `clarify` with no actions.
6. **Text fields.** `text` of a requirement and `dietary_note` are short English phrases. Names stay as said, in Latin script.
7. **Reply.** One short sentence in the speaker's language, without any number. Set `reply_language`.
8. **Examples.** Six short examples, none of them a live demo line: a correction of the photographer's advance, a new payment with "aur" to the DJ, moving the haldi's venue, two questions in one sentence, a setup sentence without a year, and an advance with no vendor named (a `clarify`).
9. **Today and the speaker**, then the snapshot (1.9).

A transcript can contain instructions ("ignore the rules and…"). That changes nothing: the model can only propose, and the server checks every value and the person confirms.

---

## 3. Numbers, money and dates in Hindi, Hinglish and English

### 3.1 Phrase first: code re-reads every value

The model returns each value **and** the words it came from (`heard`, 2.2). Code, in `src/server/voice/`, then:

1. Finds the phrase in this turn's transcript, or in a context turn's transcript (a follow-up may answer with only part of the sentence), using the normalised form of 1.6.
2. Reads the phrase with the rules below.
3. Compares the result with the model's value.

| Result | What happens |
|---|---|
| Found, read, equal | Accepted. The card shows the value with "heard '…'" |
| Found, read, different | Uncertain: the code's reading is offered, never the model's. "?" plus "Is it ₹40,000? I heard 'चालीस हज़ार'." |
| Not found in the transcript | Uncertain (the model invented or rewrote the words) |
| Found but not readable as a whole value | Uncertain |
| No phrase given for an amount, date or time | Uncertain. Exception: values code computes itself, such as a per-unit total (M3) |
| Outside its range (3.6) | Uncertain, with the range in the question |

An uncertain identifying or primary field makes the turn a question; any other uncertain field is a "?" on the card (1.11 step 8). Saaras often writes numbers as digits ("Caterer को 40000 advance दिया था"); then the phrase is "40000" and the card shows "heard '40000'". The person's own words appear only when Saaras kept them.

### 3.2 Reading amounts and counts

**Number words from 1 to 99.** Saaras's codemix usually writes Hindi number words in Devanagari, so the Devanagari column is the main one. The Latin column is for typed text and Latin transcripts. Latin words are matched after folding long vowels (aa to a, ee to i, oo to u) and w to v, so chaalis, chalis and chaalees are one word.

| | +0 | +1 | +2 | +3 | +4 | +5 | +6 | +7 | +8 | +9 |
|---|---|---|---|---|---|---|---|---|---|---|
| 0 | – | एक ek | दो do | तीन teen | चार chaar | पाँच paanch | छह chhah | सात saat | आठ aath | नौ nau |
| 10 | दस das | ग्यारह gyaarah | बारह baarah | तेरह terah | चौदह chaudah | पंद्रह pandrah | सोलह solah | सत्रह satrah | अठारह athaarah | उन्नीस unnees |
| 20 | बीस bees | इक्कीस ikkees | बाईस baaees | तेईस teyees | चौबीस chaubees | पच्चीस pachchees | छब्बीस chhabbees | सत्ताईस sattaees | अट्ठाईस atthaees | उनतीस untees |
| 30 | तीस tees | इकतीस iktees | बत्तीस battees | तैंतीस taintees | चौंतीस chauntees | पैंतीस paintees | छत्तीस chhattees | सैंतीस saintees | अड़तीस adtees | उनतालीस untaalees |
| 40 | चालीस chaalees | इकतालीस iktaalees | बयालीस bayaalees | तैंतालीस taintaalees | चवालीस chavaalees | पैंतालीस paintaalees | छियालीस chhiyaalees | सैंतालीस saintaalees | अड़तालीस adtaalees | उनचास unchaas |
| 50 | पचास pachaas | इक्यावन ikyaavan | बावन baavan | तिरेपन tirepan | चौवन chauvan | पचपन pachpan | छप्पन chhappan | सत्तावन sattaavan | अट्ठावन atthaavan | उनसठ unsath |
| 60 | साठ saath | इकसठ iksath | बासठ baasath | तिरसठ tirsath | चौंसठ chaunsath | पैंसठ painsath | छियासठ chhiyaasath | सड़सठ sadsath | अड़सठ adsath | उनहत्तर unhattar |
| 70 | सत्तर sattar | इकहत्तर ikhattar | बहत्तर bahattar | तिहत्तर tihattar | चौहत्तर chauhattar | पचहत्तर pachhattar | छिहत्तर chhihattar | सतहत्तर sathattar | अठहत्तर athhattar | उन्यासी unyaasi |
| 80 | अस्सी assi | इक्यासी ikyaasi | बयासी bayaasi | तिरासी tiraasi | चौरासी chauraasi | पचासी pachaasi | छियासी chhiyaasi | सत्तासी sattaasi | अट्ठासी atthaasi | नवासी navaasi |
| 90 | नब्बे nabbe | इक्यानवे ikyaanve | बानवे baanve | तिरानवे tiraanve | चौरानवे chauraanve | पचानवे pachaanve | छियानवे chhiyaanve | सत्तानवे sattaanve | अट्ठानवे atthaanve | निन्यानवे ninyaanve |

Also accepted: छः and chhe, che for 6; पच्चीस as pachees; उनासी for 79; चौवालीस for 44; तिरपन for 53; English one to ninety-nine, with or without hyphens.

**Scale words:**

| Value | Devanagari | Latin and English |
|---|---|---|
| 100 | सौ | sau, hundred |
| 1,000 | हज़ार, हजार | hazaar, hazar, hajar, thousand, k (as in 40k) |
| 1,00,000 | लाख | lakh, lac, laakh, lakhs, L (as in 1.5L) |
| 10,00,000 | – | million (English only) |
| 1,00,00,000 | करोड़, करोड | crore, karod, karor, cr |

**Fraction words.** They change the count in front of a scale word:

| Word | Devanagari | Meaning | Examples |
|---|---|---|---|
| dedh | डेढ़, डेढ | 1½ of the scale that follows | dedh lakh = 1,50,000; dedh hazaar = 1,500; dedh sau = 150 |
| dhai, adhai, arhai | ढाई | 2½ | dhai lakh = 2,50,000; dhai hazaar = 2,500; dhai sau = 250 |
| sava | सवा | The count that follows plus ¼; 1¼ when a scale follows directly | sava lakh = 1,25,000; sava do lakh = 2,25,000; sava paanch hazaar = 5,250 |
| saade, sadhe | साढ़े | The count that follows plus ½ (said with 3 and above) | saade teen lakh = 3,50,000; saade paanch hazaar = 5,500 |
| paune | पौने | The count that follows minus ¼; ¾ when a scale follows directly | paune do lakh = 1,75,000; paune lakh = 75,000; paune sau = 75 |
| English | – | "one and a half", "two and a half", "half a", "a quarter of a" | one and a half lakh = 1,50,000; half a lakh = 50,000 |

**Digits and symbols.**
- Devanagari digits ० to ९ are 0 to 9, also mixed with Latin digits.
- Grouping commas may be Indian (1,50,000; 12,00,000) or Western (150,000), or absent. A grouping that is neither (15,00) makes the value uncertain.
- A decimal point is allowed only before a scale word ("1.5 lakh", "₹1.5L", "2.25 lakh"), and the result must be whole rupees.
- **Ignored words:** currency (₹, Rs, Rs., INR, rupaye, rupaiye, rupees, rupee, रुपये, रुपए, रुपया, रु); units (people, persons, guests, log, logon, लोग, लोगों, plates, covers, per person, per plate, per head); approximations (about, around, roughly, approx, lagbhag, लगभग, kareeb, क़रीब, takreeban); and only, sirf, total, kul.

**How code reads a phrase:**
1. Normalise it (1.6), turn Devanagari digits into Latin digits and drop the ignored words.
2. Split it into groups. A group is an optional fraction word, then a count (digits, or one number word from 1 to 99), then an optional scale word. A missing count before a scale means one ("lakh" alone, "a lakh" and "sau" are 1,00,000, 1,00,000 and 100).
3. A group's value is its count, changed by its fraction word, times its scale.
4. Groups add up while each scale is smaller than the one before: "ek lakh saath hazaar paanch sau" is 1,60,500. A bare count after a hazaar or sau group adds too ("paanch sau pachaas" is 550; "do hazaar chhabbees" is 2026). A count from 11 to 99 right before sau is that many hundreds: "ikyavan sau" is 5,100 and "pandrah sau" 1,500.
5. **A bare count after a lakh or crore group is ambiguous.** "Do lakh pachaas" usually means 2,50,000 but could be 2,00,050, so the field is uncertain, and the question offers the reading with the next scale down first ("₹2,50,000?").
6. The result must be a whole number. "Dedh" alone, "1.5" with no scale, or any leftover word that isn't ignored makes the field uncertain.
7. **A correction pair** ("पचास नहीं, चालीस हज़ार"; "fifty, no, forty thousand"): a bare count borrows its partner's scale, giving 50,000 and 40,000 (M-04).

### 3.3 Dates

**What can be said:**
- Day: digits 1 to 31; ordinals (1st, 13th, the first to the thirty-first, "the thirteenth"); Hindi number words with or without tareekh or तारीख़ ("terah tareekh", "तेरह तारीख़ को").
- Month: English names and their three-letter forms (Hinglish uses the same); Hindi जनवरी, फ़रवरी, मार्च, अप्रैल, मई, जून, जुलाई, अगस्त, सितंबर, अक्टूबर, नवंबर, दिसंबर, with or without the nukta and with म्ब spellings (दिसम्बर).
- Numbers: 13/12, 13-12, 13.12, 13/12/2026 and 2026-12-13. Day first, always.
- Year: four digits, or words ("twenty twenty-six", "two thousand twenty-six", "do hazaar chhabbees", "दो हज़ार छब्बीस", "saal 2026 hai").
- Weekdays (a check only): Monday, somvaar, सोमवार; Tuesday, mangalvaar, मंगलवार; Wednesday, budhvaar, बुधवार; Thursday, guruvaar, veervaar, गुरुवार; Friday, shukravaar, शुक्रवार; Saturday, shanivaar, शनिवार; Sunday, ravivaar, itvaar, रविवार, इतवार.
- Relative words: aaj, आज, today; kal, कल (yesterday or tomorrow, by tense); parson, परसों; tomorrow, yesterday; "next Sunday", "agle ravivaar".

**How each field fills in what wasn't said:**

| Field | Day only | Day and month | Relative word | Year |
|---|---|---|---|---|
| `wedding_date` | Kept as `date_text`; month and year asked | Kept as `date_text`; year asked | Asked | **Never filled in.** Only a year the person said counts (AT-1.4). The card may say "14 December 2026 would be a Monday" but never picks the year |
| `event_date` | The wedding's month and year; the card says "from the wedding month" (E-01) | The year that puts the date between 120 days before and 30 days after the wedding; none or two: asked | **Always asked,** offering the resolved date: "Kal matlab 26 November?" (E-08) | As said, 2026 to 2030 |
| `paid_on`, `received_on` | This month, or last month if the day hasn't come yet | The latest such date not after today | aaj today; kal yesterday; parson the day before; the date is shown | As said; never after today |
| `due_on` | This month, or next month if the day has passed | The next such date on or after today | kal tomorrow; parson the day after; shown | As said |
| `day` (`query_changes`) | – | As for `paid_on` | aaj, today: `today`; kal with a past verb: yesterday | – |

A weekday said with a date must match it: "Monday 13 December" is uncertain, because 13 Dec 2026 is a Sunday ("13 December is a Sunday. Which did you mean?"). All dates are IST calendar dates; "today" is the IST date (domain 4).

### 3.4 Times

| Said | Reading |
|---|---|
| Digits: 7, 7:30, 7.30, 19:00, 7 PM, 7pm, 7 बजे | As said. 13 to 23, AM and PM need no daypart |
| Words: saat baje, सात बजे, seven, seven thirty | That hour and those minutes |
| saade, साढ़े before an hour | Half past: "saade saat" is 7:30 |
| sava, सवा before an hour | Quarter past: "sava saat" is 7:15 |
| paune, पौने before an hour | Quarter to: "paune aath" is 7:45 |
| dedh baje, डेढ़ बजे; dhai baje, ढाई बजे | 1:30; 2:30 |
| half past seven, quarter past seven, quarter to eight | 7:30, 7:15, 7:45 |
| noon, dopahar barah baje | 12:00 |

**Dayparts** turn a 12-hour reading into 24-hour time:

| Word | Hours become |
|---|---|
| subah, सुबह, morning, AM | As said, 1 to 11 |
| dopahar, दोपहर, afternoon | 12 stays 12:00; 1 to 5 become 13:00 to 17:00 |
| shaam, शाम, evening | 4 to 11 become 16:00 to 23:00: "shaam saat baje" is 19:00 |
| raat, रात, night, PM | 7 to 11 become 19:00 to 23:00 |

**No daypart:** if exactly one reading fits the function's other stored times (an end after its start, a muhurat between them, the same day), use it and show it: "saade paanch baje tak" as the mehendi's end after a 15:00 start is 17:30. Otherwise the field is uncertain: "Subah saat ya shaam saat?" / "Seven in the morning or the evening?"

### 3.5 Saying numbers, dates and times

**Hindi amount words** (speech text in `hi` and `hinglish`, and the display of the balance line):
- Split the amount the Indian way: crore, lakh, hazaar, sau, then the rest below 100.
- Each part that isn't zero is its count from 3.2's table followed by करोड़, लाख, हज़ार or सौ. Zero parts are left out. A crore count above 99 is said the same way ("एक सौ पच्चीस करोड़").
- Then रुपये (रुपया for exactly one rupee).
- **Never** डेढ़, ढाई, सवा, साढ़े or पौने for money, even when the person said "dedh lakh" (M7). Spell हज़ार with the nukta and पाँच with the chandrabindu, as demo-data §14 does.

**English amount words** (speech text in `en`): the same parts with crore, lakh, thousand and hundred, standard English for 1 to 99 ("eighty-four"), then rupees. No "and".

| Amount | Hindi | English |
|---|---|---|
| ₹1,60,000 | एक लाख साठ हज़ार रुपये | one lakh sixty thousand rupees |
| ₹1,50,000 | एक लाख पचास हज़ार रुपये | one lakh fifty thousand rupees |
| ₹5,40,000 | पाँच लाख चालीस हज़ार रुपये | five lakh forty thousand rupees |
| ₹1,84,000 | एक लाख चौरासी हज़ार रुपये | one lakh eighty-four thousand rupees |
| ₹12,00,000 | बारह लाख रुपये | twelve lakh rupees |
| ₹2,00,000 | दो लाख रुपये | two lakh rupees |
| ₹1,40,000 | एक लाख चालीस हज़ार रुपये | one lakh forty thousand rupees |
| ₹2,80,000 | दो लाख अस्सी हज़ार रुपये | two lakh eighty thousand rupees |
| ₹95,000 | पचानवे हज़ार रुपये | ninety-five thousand rupees |
| ₹40,000 | चालीस हज़ार रुपये | forty thousand rupees |
| ₹10,000 | दस हज़ार रुपये | ten thousand rupees |
| ₹5,100 | पाँच हज़ार एक सौ रुपये | five thousand one hundred rupees |
| ₹45,400 | पैंतालीस हज़ार चार सौ रुपये | forty-five thousand four hundred rupees |
| ₹2,73,000 | दो लाख तिहत्तर हज़ार रुपये | two lakh seventy-three thousand rupees |
| ₹1,25,00,500 | एक करोड़ पच्चीस लाख पाँच सौ रुपये | one crore twenty-five lakh five hundred rupees |

**Other numbers in speech.**
- Counts, days and years in Hindi speech are words too, without रुपये: 229 is दो सौ उनतीस; 13 December is "तेरह दिसंबर" (or "तेरह December" in Hinglish); 2026 is "दो हज़ार छब्बीस". English speech leaves counts as digits, which Bulbul reads.
- **Clock times** in Hindi speech use the clock words: "शाम सात बजे", "शाम साढ़े पाँच बजे" (E-03), "सुबह साढ़े नौ बजे". Fractions are fine for times; only money avoids them. English: "7 PM", "5:30 PM".

**Display** follows M7: ₹ with Indian grouping and no decimals (₹1,60,000), never "Rs." or "INR", and "Overpaid ₹5,000" rather than a negative. Dates show as "Sun 13 Dec 2026", times as "7:00 pm" (acceptance's style). In replies:
- `en`: ₹ figures.
- `hinglish`: ₹ figures, except the balance line, which is in Devanagari words (O-01).
- `hi`: amounts in words in the sentence; the answer card shows the ₹ figure.

### 3.6 Ranges and plausibility

| Value | Allowed | Outside it |
|---|---|---|
| One amount: a payment, a lump-sum commitment, a correction, shagun | 1 to 1,00,00,00,000 (M2) | Uncertain: "₹2,00,00,00,000? Please check the amount." |
| `unit_price_inr` | 1 to 10,00,000 | Uncertain |
| `quantity` (commitment) | 1 to 1,00,000 | Uncertain |
| `quantity` (requirement) | 1 to 10,000 | Uncertain |
| `budget_inr` | 0 to 10,00,00,00,000 | Uncertain |
| `expected_guests`, `expected_headcount` | 0 to 5,000 | Uncertain |
| `plus_ones`; `max_plus_ones` | 0 to the invitation's limit; 0 to 10 | Uncertain |
| **Voice only:** vendor money (payments, commitment amounts, rates) under ₹100 | – | Uncertain: "₹40, or ₹40,000?" This catches a dropped "hazaar". Not applied to shagun, where ₹101 is normal |

Fractions of a rupee, negatives and zero where a positive amount is needed never reach a command (M1); the field stays uncertain. A payment that would take paid above committed is a warning ("Overpaid ₹5,000"), not an error (domain 3.3).

### 3.7 Worked examples

| Said | Field | Value | Note |
|---|---|---|---|
| "chaalis hazaar", "चालीस हज़ार", "40000", "40,000", "४०,०००", "40k" | `amount_inr` | 40,000 | |
| "dedh lakh", "डेढ़ लाख", "1.5 lakh", "₹1.5L", "one and a half lakh" | `amount_inr` | 1,50,000 | M-07, M-09 |
| "paanch sau", "पाँच सौ", "500" | `amount_inr` | 500 | |
| "5,100", "ikyavan sau", "इक्यावन सौ" | `amount_inr` | 5,100 | SH-01 |
| "twelve lakh", "baarah lakh", "बारह लाख", "12 lakh", "12,00,000" | `budget_inr` | 12,00,000 | S-01, S-03 |
| "sava lakh", "सवा लाख" | `amount_inr` | 1,25,000 | M-08 |
| "dhai lakh" | `amount_inr` | 2,50,000 | |
| "paune do lakh" | `amount_inr` | 1,75,000 | |
| "saade teen hazaar" | `amount_inr` | 3,500 | |
| "ek lakh saath hazaar", "एक लाख साठ हज़ार" | `amount_inr` | 1,60,000 | |
| "fifty-thousand" | `amount_inr` | 50,000 | M-01 |
| "pachaas hazaar", "पचास हज़ार" | `amount_inr` | 50,000 | M-06 |
| "bees hazaar", "बीस हज़ार" | `amount_inr` | 20,000 | M-12 |
| "do lakh pachaas" | `amount_inr` | Uncertain; asks "₹2,50,000?" | Rule 5 |
| "chaalis" alone, for a payment | `amount_inr` | 40, uncertain: "₹40, or ₹40,000?" | Plausibility |
| "पचास नहीं, चालीस हज़ार दिए थे" | `previous_inr`, `amount_inr` | 50,000 and 40,000 | Rule 7, M-04 |
| "eight hundred per person for 250 people" | `unit_price_inr`, `quantity` | 800 and 250; ₹2,00,000 computed in code | M3, M-01 |
| "13 Dec", "13 December", "terah December", "तेरह दिसंबर", "13/12" | `event_date` | 2026-12-13 | The year from the wedding window |
| "the thirteenth", "terah tareekh ko" | `event_date` | 2026-12-13, "from the wedding month" | E-01, E-02 |
| "14 December" in setup | `wedding_date` | Not set: `date_text` "14 December", year asked | S-01, AT-1.4 |
| "Saal 2026 hai" after S-01 | `wedding_date` | 2026-12-14 | Merged with the draft, S-02 |
| "kal diya", for a payment | `paid_on` | 2026-11-24, shown | Past tense |
| "Haldi kal subah" | `event_date` | Asked: "Kal matlab 26 November?" | E-08 |
| "Monday 13 December" | `event_date` | Uncertain | 13 Dec 2026 is a Sunday |
| "shaam saat baje", "seven in the evening", "7 PM" | `start_time` | 19:00 | E-01, E-02 |
| "शाम साढ़े पाँच बजे तक" for the mehendi | `end_time` | 17:30 | E-03 |
| "saade paanch baje tak" for the mehendi (starts 15:00) | `end_time` | 17:30 | The only reading after the start |
| "saat baje" for a new function | `start_time` | Uncertain: "Subah saat ya shaam saat?" | No daypart, no other time |
| "roughly 250 guests" | `expected_guests` | 250 | Approximation word ignored |

---

## 4. Answering questions from saved records

### 4.1 The rules

- **Code computes every figure.** An `ask` action reads its read model (domain 4) with the speaker's role, takes the figures as they are (`outstanding_inr`, `attending`, `estimate_inr`…), and fills a template. Nothing is added up in the voice module except what a template states as a join of two read-model values. The model's `reply` is never spoken for `ask` or `act` (M8).
- **Templates, not the model, on the demo path.** Every ask kind has templates (4.2). The model's `reply` is spoken only for a `clarify` that no template covers, and only if it passes the guard: at most 140 characters and two sentences, no digits of either script, no ₹, no number word from 3.2, and the register's script. Otherwise the generic question: en "Sorry, I didn't get that. Say it again, or type it." · hinglish "Maaf kijiye, samajh nahi aaya. Phir se boliye, ya type kijiye." · hi "माफ़ कीजिए, समझ नहीं आया। फिर से बोलिए, या टाइप कीजिए।"
- **The second, tool-free model call** (domain 4.9, RS 3.4) is not built today. If time allows after the must-work list passes, it gets only read-model facts, and its text passes the same guard, with a number allowed only if it appears among the facts.
- **Each answer** has display text, speech text, one answer card per question with a source link, and the figures to highlight on the page.
- **Questions work while voice writes are off** (V4, X-06). They never write, never move `weddings.version` and never write an activity entry. The turn is `answered`.

### 4.2 Templates for each question kind

In the tables, `{role}` is the vendor's role word (caterer, venue, decorator…, 2.5) when only one vendor has it, otherwise the vendor's name. `{Vendor}` is the vendor's name.

**`query_balance`** — `money_summary` (the vendor row or the totals); the card links to the vendor page or Money. Who: owners; managers see vendor rows with `managers_can_see_vendor_dues` and the wedding total only with `managers_can_see_budget` (domain 4.2).

| Case | en | hinglish | hi |
|---|---|---|---|
| A vendor, something owed (O-01) | "₹1,50,000 is still owed to Annapoorna Caterers." | "एक लाख पचास हज़ार रुपये बाकी हैं।" | The same as hinglish |
| A vendor, nothing owed | "Annapoorna Caterers is paid in full." | "{Vendor} ka poora payment ho chuka hai." | "{Vendor} का पूरा भुगतान हो चुका है।" |
| A vendor, overpaid | "Annapoorna Caterers has been overpaid by ₹5,000." | "{Vendor} ko ₹5,000 zyada diye gaye hain." | "{Vendor} को पाँच हज़ार रुपये ज़्यादा दिए गए हैं।" |
| A vendor, nothing agreed yet | "Nothing is agreed with {Vendor} yet. ₹5,000 has been paid." | "{Vendor} ke saath abhi kuch tay nahi hua. ₹5,000 diye gaye hain." | "{Vendor} के साथ अभी कुछ तय नहीं हुआ। पाँच हज़ार रुपये दिए गए हैं।" |
| The wedding total (M-10, M-11) | "You still owe ₹5,40,000, including ₹1,60,000 to the caterer." | "कुल पाँच लाख चालीस हज़ार रुपये बाकी हैं।" | The same as hinglish |
| A wrong claim (M-09) | "No, ₹1,40,000 is still owed to Mallige Gardens. ₹1,40,000 of ₹2,80,000 has been paid." | "Nahi, {role} ka ₹1,40,000 baaki hai. ₹2,80,000 mein se ₹1,40,000 diye ja chuke hain." | "नहीं, {Vendor} के एक लाख चालीस हज़ार रुपये बाकी हैं। दो लाख अस्सी हज़ार में से एक लाख चालीस हज़ार दिए जा चुके हैं।" |
| A right claim | "Yes, ₹1,40,000 is still owed to Mallige Gardens." | "Haan, {role} ka ₹1,40,000 baaki hai." | "हाँ, एक लाख चालीस हज़ार रुपये बाकी हैं।" |
| A manager without budget sharing asks for the total | "The total hasn't been shared with you. I can tell you what each vendor is owed." | "Total aapke saath share nahi hua hai. Har vendor ka baaki bata sakti hoon." | "कुल रकम आपके साथ साझा नहीं की गई है। हर वेंडर का बकाया बता सकती हूँ।" |

The "including" clause names the vendor with the largest outstanding amount, and is left out when only one vendor is owed. Card: "Still owed to Annapoorna Caterers: ₹1,50,000", linking to the vendor page, with that figure highlighted (AT-2.1).

**`query_budget`** — `money_summary` totals and category lines. Who: owners; managers with `managers_can_see_budget`.

| Case | en | hinglish | hi |
|---|---|---|---|
| The whole budget | "The budget is ₹12,00,000. ₹9,27,000 is committed and ₹2,73,000 is still open." | "Budget ₹12,00,000 hai. ₹9,27,000 tay ho chuka hai, ₹2,73,000 abhi khula hai." | "बजट बारह लाख रुपये है। नौ लाख सत्ताईस हज़ार रुपये तय हो चुके हैं, दो लाख तिहत्तर हज़ार रुपये अभी खुले हैं।" |
| A category | "Photography: ₹1,10,000 committed of a ₹1,20,000 budget." | "Photography ka budget ₹1,20,000 hai, ₹1,10,000 tay hai." | "फ़ोटोग्राफ़ी का बजट एक लाख बीस हज़ार रुपये है, एक लाख दस हज़ार रुपये तय हैं।" |
| A category over budget | "Photography is ₹5,000 over its ₹1,20,000 budget." | "Photography budget se ₹5,000 upar hai." | "फ़ोटोग्राफ़ी बजट से पाँच हज़ार रुपये ऊपर है।" |
| Not shared (M-14) | "The budget hasn't been shared with you. I can help with vendor dues." | "Budget aapke saath share nahi hua hai. Vendors ke baaki mein madad kar sakti hoon." | "बजट आपके साथ साझा नहीं किया गया है। वेंडर के बकाया में मदद कर सकती हूँ।" |

**`query_rsvp`** — `rsvp_totals` for the function (synthetic guests included in the counts). Who: members. After answering, the app opens Guests filtered to that function's attending guests (AT-2.4).

| Case | en | hinglish | hi |
|---|---|---|---|
| A function (G-01) | "229 of 250 have confirmed for the reception. 9 declined and 12 haven't replied yet." | "Reception ke liye 250 mein se 229 ne confirm kiya hai. 9 ne mana kiya, 12 ka jawab baaki hai." | "रिसेप्शन के लिए 250 में से 229 लोग आ रहे हैं। 9 नहीं आएँगे, 12 का जवाब बाकी है।" |
| No function (4.5) | "Which function? Mehendi, haldi, sangeet, wedding or reception?" | "Kis function ke liye? Mehendi, haldi, sangeet, shaadi ya reception?" | "किस कार्यक्रम के लिए? मेहंदी, हल्दी, संगीत, शादी या रिसेप्शन?" |

**`query_event`** — `itinerary`, and `overview.next_event` for "the next function". Who: members; they hear the draft value, plus the published one when it differs (domain 4.9).

| Case | en | hinglish | hi |
|---|---|---|---|
| Venue (O-03) | "The reception is at Lotus Hall, Mallige Gardens." | "Reception: Lotus Hall." | The same as hinglish |
| Venue, draft differs | "In the draft the reception is at Lotus Hall. Guests still see Banyan Hall." | "Reception: Lotus Hall, abhi draft mein. Guests ko Banyan Hall dikh raha hai." | "रिसेप्शन: Lotus Hall, अभी ड्राफ़्ट में। मेहमानों को Banyan Hall दिख रहा है।" |
| Time | "The sangeet is on Sunday 13 December, 7 PM to 11 PM." | "Sangeet Sunday 13 December ko shaam 7 baje se raat 11 baje tak hai." | "संगीत रविवार, 13 दिसंबर को शाम सात बजे से रात ग्यारह बजे तक है।" |
| Date | "The wedding is on Monday 14 December 2026." | "Shaadi Monday 14 December ko hai." | "शादी सोमवार, 14 दिसंबर को है।" |
| Dress code | "Dress code for the sangeet: Indo-western, some sparkle." | "Sangeet ka dress code: Indo-western, some sparkle." | "संगीत का ड्रेस कोड: Indo-western, some sparkle।" |
| All | The venue sentence, then the time sentence | | |
| The next function | "Next is the haldi: Sunday 13 December, 9:30 AM, at Courtyard Lawn. That's 18 days away." | "Agla function haldi hai: Sunday 13 December, subah 9:30, Courtyard Lawn. 18 din baaki hain." | "अगला कार्यक्रम हल्दी है: रविवार, 13 दिसंबर, सुबह साढ़े नौ बजे, Courtyard Lawn। अठारह दिन बाकी हैं।" |
| No function (E-07) | "Which function's venue? Mehendi, haldi, sangeet, wedding or reception?" | "Kis function ka venue? Mehendi, haldi, sangeet, shaadi ya reception?" | "किस कार्यक्रम का स्थान? मेहंदी, हल्दी, संगीत, शादी या रिसेप्शन?" |

**`query_changes`** — `activity_feed` (filters `day`, `actor_member_id`) with `awaiting_publish`, and `itinerary.unpublished_changes`. Who: members; managers see only entries with visibility `members` (domain 4.7).
- **No actor named:** changes by members other than the speaker, who knows her own (M-10). If there are none, her own. The answer card still lists the speaker's own entries under "Your changes today", linked but not spoken.
- **`latest`:** the newest matching entry (O-02). **`day`:** that IST day. Neither: today.
- **One entry:** the entry's sentence. Hindi uses `summary_hi`. Hinglish has its own phrasing for the topics the demo uses (an event's venue or time changed, a payment corrected, a requirement added, the schedule published), and uses `summary_hi` for the rest. A draft edit adds where it stands (`awaiting_publish`).
- **Two entries of one topic:** both, listed (O-04). An item is the record's text up to its first comma, starting lowercase, then "at the {function}".
- **Three or more:** the count and the most important one. Importance: function and schedule changes, then money, then requirements and the rest; newest first within a level.
- **One card per entry,** linking to its record (AT-2.4).

| Case | en | hinglish | hi |
|---|---|---|---|
| The latest, a draft venue move (O-02) | "Diya moved the reception from Banyan Hall to Lotus Hall. It's still a draft; guests still see Banyan Hall." | "Diya ne reception Banyan Hall se Lotus Hall mein shift kiya. Yeh abhi draft hai, guests ko Banyan Hall hi dikh raha hai." | `summary_hi`, then where it stands: "Diya ने रिसेप्शन का स्थान Banyan Hall से बदलकर Lotus Hall किया। यह अभी ड्राफ़्ट है, मेहमानों को Banyan Hall ही दिख रहा है।" |
| The same, after publishing | "… It's published now." | "… Yeh publish ho chuka hai." | "… यह प्रकाशित हो चुका है।" |
| Two of one topic (O-04) | "Today Diya added two notes: sugar-free dessert option at the reception, and marigold and fairy-light canopy over the stage at the sangeet." | "Aaj Diya ne do notes jode: reception mein sugar-free dessert option, aur sangeet mein marigold and fairy-light canopy over the stage." | "आज Diya ने दो नोट जोड़े: रिसेप्शन में sugar-free dessert option, और संगीत में marigold and fairy-light canopy over the stage।" |
| Three or more (M-10) | "Diya made three changes today, including moving the reception to Lotus Hall, which is now published." | "Aaj Diya ne teen badlav kiye, jaise reception ko Lotus Hall mein shift karna, jo ab publish ho chuka hai." | "आज Diya ने तीन बदलाव किए, जैसे रिसेप्शन को Lotus Hall में ले जाना, जो अब प्रकाशित हो चुका है।" |
| Nothing | "Nothing has changed today." | "Aaj kuch nahi badla." | "आज कुछ नहीं बदला।" |

**`query_catering`** — `catering_estimate` (domain 4.5). Who: as vendor money.

| Case | en | hinglish | hi |
|---|---|---|---|
| A per-plate contract (V-01) | "At ₹800 a plate for 230 confirmed guests, the estimate is ₹1,84,000. The contract stays fixed at ₹2,00,000." | "Confirmed guests ke hisaab se estimate ₹1,84,000 hai. Contract fixed ₹2,00,000 ka hi hai." | "आने वाले मेहमानों के हिसाब से अंदाज़ा एक लाख चौरासी हज़ार रुपये है। कॉन्ट्रैक्ट दो लाख रुपये पर तय है।" |
| Nothing per plate | "There's no per-plate contract to estimate from." | "Estimate ke liye per-plate contract nahi hai." | "अंदाज़े के लिए प्रति-प्लेट कॉन्ट्रैक्ट नहीं है।" |

Card: "Estimate, not the contract" / "अंदाज़ा, कॉन्ट्रैक्ट नहीं" with "230 attending × ₹800 = ₹1,84,000" beside "Contract ₹2,00,000" (E6).

**`query_shagun`** — `shagun_register` (domain 4.10). Who: owners only. Names are the register's giver names, as stored. The Devanagari names in SH-02's expected line would need Hindi names, which Jashn doesn't store.

| Case | en | hinglish | hi |
|---|---|---|---|
| Totals | "₹45,400 in shagun so far. 4 thank-yous are still to send." | "Ab tak ₹45,400 shagun aaya hai. 4 logon ko thank-you bolna baaki hai." | "अब तक पैंतालीस हज़ार चार सौ रुपये शगुन आया है। चार लोगों को थैंक यू बोलना बाकी है।" |
| Still to thank (SH-02) | "4 to thank: {names}." | "4 log: {names}." | "चार लोग: {names}।" |
| A manager (M-14) | 4.6 | | |

### 4.3 Several questions, or a question and a change

- **Answers come in the order asked.** With two questions, each answer gives its first sentence only, so the reply stays at two: O-03 is "Reception: Lotus Hall." then "एक लाख साठ हज़ार रुपये बाकी हैं।"; M-10 is the changes sentence then the balance sentence.
- **More than two questions:** the first two are answered, and the panel shows (without speaking) "Ask me the rest one at a time."
- **A question with a change** (flagsmith 3.2 leaves the phrasing to this file): the answer's first sentence is spoken, and the change appears as its silent card. With voice writes off, the answer's first sentence is followed by the refusal's first sentence ("Abhi voice se badlav band hain."), and the prefilled form opens. The full R-03 line is used when a turn holds only writes.
- Two refusals join into one sentence (M-14): "The budget and the Shagun register haven't been shared with you. I can help with vendor dues." The second sentence names what the speaker can see.

### 4.4 A wrong premise

`user_claim_inr` is compared in code with the read model's figure (M-09). If they differ, the reply starts with "Nahi" / "No" / "नहीं" and gives the real figure; it never repeats the claimed number as if it were true. If they are equal, it starts with "Haan" / "Yes" / "हाँ". Other wrong premises ("Reception Banyan Hall mein hai na?") get the true value from the normal template, which corrects them without a separate check.

### 4.5 No function or vendor named

| Question | Spoken on a page about one record | Anywhere else |
|---|---|---|
| `query_balance` with no vendor and no "kul" or "total" | That vendor's balance | The wedding total ("kitna baaki hai?", scope.md) |
| `query_rsvp`, `query_event` with no function | That function | A question listing the functions (E-07). Exception: "next function" uses `overview.next_event` |
| `query_catering` with no vendor | – | The only per-plate catering commitment, else a question |

The page comes from the turn request's `page` (1.4). **Writes never use the page:** M-05 must ask even when spoken on the caterer's page. Run E-07 from the overview, since on the reception's page it would be answered.

### 4.6 Refusals by role and sharing

| Who | Asks for | Code | Reply |
|---|---|---|---|
| Manager | The budget or the wedding total, without `managers_can_see_budget` | `not_shared` | 4.2 |
| Manager | Vendor money, without `managers_can_see_vendor_dues` | `not_shared` | en "Vendor payments haven't been shared with you." · hinglish "Vendor payments aapke saath share nahi hue hain." · hi "वेंडर के भुगतान आपके साथ साझा नहीं किए गए हैं।" |
| Manager | Shagun, or `record_shagun` | `not_shared` | en "The Shagun register hasn't been shared with you." · hinglish "Shagun register aapke saath share nahi hua hai." · hi "शगुन रजिस्टर आपके साथ साझा नहीं किया गया है।" |
| Manager | Publishing | `forbidden` | E-06 (4.10) |
| A guest link | Anything | – | Guest voice isn't built (domain OQ7). A guest link carries no session, so every voice route answers 401; the guest page has no mic |

The snapshot never holds what the speaker may not see (1.9), so the model has nothing to leak; these checks run on the server before any answer is built. A refusal is stored in `voice_turns` with its `refusal_code` and never in the activity log (L1).

### 4.7 Answer cards

An answer card has a title, the figure in ₹ or the value, and a link to the record. The link carries the figures to highlight on that page as the `highlight` query parameter from `src/contracts/routes.ts` (comma-separated field keys, decision D121), and the page applies the wash once (design-direction 7.2). It has no Save button. Every card links to its source, so a judge can click from the spoken number to the saved record (demo-script #7).

### 4.8 Length

- At most two short sentences per reply (voice-test-set pass criterion 4), and at most 140 characters per speech part (1.14).
- A template with a list shortens itself when a sentence would pass 140 characters. O-04 becomes "Today Diya added two notes, at the reception and the sangeet."
- Where the test set's line had three short sentences (M-13, E-08), the template joins two of them with a comma. The words stay the same.

### 4.9 The live lines, as shown and as spoken

The reply register follows 1.6. **Where demo-data §14 or flagsmith fixes a line, `hi` and `hinglish` share it,** so Saaras's choice of script can't change a live line: the balance line, the venue answer, the correction reply and the kill-switch refusal.

| Live | Shown | Spoken (speech text) | Voice |
|---|---|---|---|
| #1 O-01 | एक लाख पचास हज़ार रुपये बाकी हैं। | The same | `hi-IN`, `simran_enhi_customer` |
| #2 M-03 | Correction, not a new payment: ₹50,000 → ₹40,000. | Nothing: a complete preview is silent | – |
| #3 C-01 | एक लाख साठ हज़ार रुपये बाकी हैं। | The same | `hi-IN` |
| #4 E-04 | Draft mein reception ab Lotus Hall mein hai. Guests ko publish ke baad dikhega. | Draft में reception अब Lotus Hall में है। Guests को publish के बाद दिखेगा। | `hi-IN` |
| #5 O-02 | Diya ne reception Banyan Hall se Lotus Hall mein shift kiya. Yeh abhi draft hai, guests ko Banyan Hall hi dikh raha hai. | Diya ने reception Banyan Hall से Lotus Hall में shift किया। यह अभी draft है, guests को Banyan Hall ही दिख रहा है। | `hi-IN` |
| #6 E-05 | Schedule publish ho gaya. Guests ko ab Lotus Hall dikhega. | Schedule publish हो गया। Guests को अब Lotus Hall दिखेगा। | `hi-IN` |
| #7 O-03 | Reception: Lotus Hall. एक लाख साठ हज़ार रुपये बाकी हैं। | The same | `hi-IN` |
| #8 R-03 | Abhi voice se badlav band hain. Aap type karke save kar sakte hain. | अभी voice से बदलाव बंद हैं। आप type करके save कर सकते हैं। | `hi-IN` |

### 4.10 Templates for changes, questions back, refusals and cancels

Each has a display form per register. The speech form follows 1.14: Hindi words in Devanagari, English words and names in Latin, every amount, count and day in words (3.5). `{…}` fills come from the command result or read models after commit. Errors are in section 6.

| Situation | en | hinglish | hi |
|---|---|---|---|
| Setup, incomplete: first what was noted, then the missing parts in the order day, year, names (en S-01; hinglish and hi S-03) | "Got it: 14 December in Bengaluru, ₹12,00,000, about 250 guests. Which year is it, and what are the couple's names?" Spoken with "twelve lakh rupees" | "₹12,00,000 note kar liya. December mein kaunsi tareekh, kaunsa saal, aur dulha-dulhan ke naam?" Spoken "बारह लाख रुपये note कर लिया। …" | "बारह लाख रुपये नोट कर लिया। दिसंबर में कौन सी तारीख़, कौन सा साल, और दूल्हा-दुल्हन के नाम?" |
| Setup, saved (S-02) | "Saved: Mira and Kabir's wedding, 14 December 2026, Bengaluru." | "Mira aur Kabir ki shaadi, 14 December 2026, Bengaluru. Save ho gayi." | "Mira और Kabir की शादी, 14 दिसंबर 2026, Bengaluru। सेव हो गई।" |
| Function added (E-01, E-02) | "Sangeet added for Sunday 13 December at 7 PM, Garden Hall." | "Sangeet 13 December, shaam saat baje, Garden Hall mein add ho gaya." | "संगीत रविवार, 13 दिसंबर को शाम सात बजे, Garden Hall में जोड़ दिया।" |
| Venue moved, draft (E-04) | "The reception is at Lotus Hall in the draft. Guests see it once it's published." | 4.9 #4 | "ड्राफ़्ट में रिसेप्शन अब Lotus Hall में है। मेहमानों को पब्लिश के बाद दिखेगा।" |
| Time changed (E-03) | "The mehendi now ends at 5:30 PM. The clash with the sangeet is gone." | "Mehendi ab shaam saade paanch baje khatam hogi. Sangeet se takraav hat gaya." | "मेहंदी अब शाम साढ़े पाँच बजे ख़त्म होगी। संगीत से टकराव हट गया।" |
| Published (E-05) | "Published revision 3. Guests now see Lotus Hall for the reception." | 4.9 #6 | "कार्यक्रम प्रकाशित हो गया। मेहमानों को अब Lotus Hall दिखेगा।" |
| Publish refused, manager (E-06) | "Only Mira or Kabir can publish. Your change is safe in the draft." | "Publish sirf Mira ya Kabir kar sakte hain. Aapka badlav draft mein safe hai." | "प्रकाशित सिर्फ़ Mira या Kabir कर सकते हैं। आपका बदलाव ड्राफ़्ट में सुरक्षित है।" |
| Invite changed (I-01) | "Your invite is now maroon and gold, with this photo. Publish it when you're happy." | "Invite ab maroon aur gold hai, is photo ke saath. Pasand aaye to publish kar dijiye." | "निमंत्रण अब मरून और गोल्ड में है, इस फ़ोटो के साथ। पसंद आए तो पब्लिश कर दीजिए।" |
| Card export started (I-02) | "Making the card for revision 3. The card downloaded before is out of date." | "Lotus Hall wala naya card ban raha hai. Pehle download kiya card purana hai." | "संस्करण 3 का नया कार्ड बन रहा है। पहले डाउनलोड किया कार्ड पुराना है।" |
| Commitment and payment saved (M-01) | "Saved a ₹2,00,000 catering commitment and a ₹50,000 advance. ₹1,50,000 is outstanding." | "₹2,00,000 ka catering contract aur ₹50,000 ka advance save ho gaya. ₹1,50,000 baaki hai." | "दो लाख रुपये का कैटरिंग कॉन्ट्रैक्ट और पचास हज़ार रुपये का एडवांस सेव हो गया। एक लाख पचास हज़ार रुपये बाकी हैं।" |
| Correction saved (M-02, M-03, M-04) | "Corrected the caterer's advance to ₹40,000. ₹1,60,000 is outstanding." | "एक लाख साठ हज़ार रुपये बाकी हैं।" | The same as hinglish |
| Payment saved (M-06, M-07) | "Saved a ₹1,50,000 instalment to Annapoorna Caterers. ₹10,000 is still owed." | "Caterer ko ₹1,50,000 ka payment save hua. Ab sirf ₹10,000 baaki hai." | "Annapoorna Caterers को एक लाख पचास हज़ार रुपये का भुगतान सेव हो गया। अब सिर्फ़ दस हज़ार रुपये बाकी हैं।" |
| Agreed amount changed (M-08) | "The agreed amount with Frame & Phera Studio is now ₹1,25,000. ₹95,000 is still owed, and photography is ₹5,000 over budget." | "Photographer ka contract ₹1,25,000 ho gaya. ₹95,000 baaki hai, aur photography budget se ₹5,000 upar hai." | "Frame & Phera Studio के साथ तय रकम अब एक लाख पच्चीस हज़ार रुपये है। पचानवे हज़ार रुपये बाकी हैं, और फ़ोटोग्राफ़ी बजट से पाँच हज़ार रुपये ऊपर है।" |
| Sent for approval (M-12) | "Sent the ₹20,000 payment to Mira for approval. The ledger hasn't changed." | "Yeh ₹20,000 ka payment Mira ki approval ke liye bhej diya. Ledger abhi nahi badla." | "बीस हज़ार रुपये का भुगतान Mira की मंज़ूरी के लिए भेज दिया। लेजर अभी नहीं बदला।" |
| Requirement added (R-01, R-02) | "Added Jain food for 12 at the reception. It doesn't change what you owe the caterer." | "Reception mein 12 logon ke liye Jain food jod diya." | "रिसेप्शन में बारह लोगों के लिए जैन खाना जोड़ दिया।" |
| Requirement already there (R-02 after R-01) | "Jain food for 12 is already on the reception." | "Reception mein 12 logon ke liye Jain food pehle se hai." | "रिसेप्शन में बारह लोगों के लिए जैन खाना पहले से है।" |
| RSVP saved (G-02) | "Nikhil and Prachi are confirmed for the reception. 231 are now coming." | "Nikhil aur Prachi reception ke liye confirm ho gaye. Ab 231 log aa rahe hain." | "Nikhil और Prachi रिसेप्शन के लिए कन्फ़र्म हो गए। अब दो सौ इकतीस लोग आ रहे हैं।" |
| Shagun saved (SH-01) | "Recorded ₹5,100 shagun from the Sharmas and added them to the thank-you list." | "Sharma ji ka ₹5,100 shagun likh liya, aur thank-you list mein jod diya." | "Sharma जी का पाँच हज़ार एक सौ रुपये का शगुन लिख लिया, और धन्यवाद सूची में जोड़ दिया।" |
| **Voice writes off (R-03)** | "Voice changes are paused right now. You can type it and save." | "Abhi voice se badlav band hain. Aap type karke save kar sakte hain." | The same as hinglish |
| Which vendor (M-05) | "Which vendor's advance? Caterer, venue, decorator, photographer, mehendi artist or DJ?" | "Kis vendor ka advance? Caterer, venue, decorator, photographer, mehendi artist ya DJ?" | "किस वेंडर का एडवांस? कैटरर, वेन्यू, डेकोरेटर, फ़ोटोग्राफ़र, मेहंदी आर्टिस्ट या डीजे?" |
| How much (M-13) | "How much? A ₹5,000 advance is already recorded, so is this a new payment?" | "Kitna diya? ₹5,000 ka advance pehle se likha hai, kya yeh naya payment hai?" | "कितना दिया? पाँच हज़ार रुपये का एडवांस पहले से लिखा है, क्या यह नया भुगतान है?" |
| Which date, relative word (E-08) | "Do you mean tomorrow, 26 November? The haldi is on 13 December in the morning, so which date should I use?" | "Kal matlab 26 November? Haldi abhi 13 December subah hai, kaunsi tareekh rakhun?" | "कल यानी 26 नवंबर? हल्दी अभी 13 दिसंबर सुबह है, कौन सी तारीख़ रखूँ?" |
| Morning or evening | "Seven in the morning or the evening?" | "Subah saat ya shaam saat?" | "सुबह सात या शाम सात?" |
| A number to check: code's reading differs from the model's (3.1); the heard words are quoted as the transcript wrote them | "Is it ₹40,000? I heard 'चालीस हज़ार'." | "₹40,000 sahi hai? Maine 'चालीस हज़ार' suna." | "क्या चालीस हज़ार रुपये सही है? मैंने 'चालीस हज़ार' सुना।" |
| A small amount for a vendor (3.6) | "₹40, or ₹40,000?" | "₹40 ya ₹40,000?" | "चालीस रुपये या चालीस हज़ार रुपये?" |
| Two readings (3.2 rule 5) | "₹2,50,000? I heard 'do lakh pachaas'." | "₹2,50,000? Maine 'do lakh pachaas' suna." | "दो लाख पचास हज़ार रुपये? मैंने 'दो लाख पचास' सुना।" |
| Nothing would change | "It's already ₹40,000." | "Yeh pehle se ₹40,000 hai." | "यह पहले से चालीस हज़ार रुपये है।" |
| Cancelled (C-02) | "OK, nothing was changed." | "ठीक है, कुछ नहीं बदला।" | "ठीक है, कुछ नहीं बदला।" |
| Expired | "This request expired. Say it again." | "Yeh request purani ho gayi. Phir se boliye." | "यह अनुरोध पुराना हो गया। फिर से बोलिए।" |

**Filling rules for the table:**
- **Vendor words.** "the caterer" and "Caterer ko" are `{role}`; full names where the role isn't unique.
- **"sirf"** ("only") is added when what is still owed is under a tenth of the agreed amount (M-07).
- **The second sentence of "Requirement added"** appears only when the requirement is linked to a vendor. The `hi` form repeats the person's own words for the item ("जैन खाना") when they were heard in Devanagari, and otherwise uses `text`.
- **Manager forms.** In "Invite changed", a manager's second sentence names the owners instead: "Mira or Kabir can publish it."
- **"Sent for approval"** names the wedding's first owner.
- **"Card export started"** names the venue when the newest published change is a venue, and otherwise says "Revision {n} ka naya card ban raha hai."; its second sentence appears only when an older card exists.
- **Wording differences from voice-test-set** are deliberate where M7 or a missing fact requires them:
  - M-06 and M-08 show ₹ figures instead of "pachaas hazaar" and "sava lakh", because generated replies never use dedh-style words (M7).
  - R-01's second sentence states what Jashn knows (a requirement never touches the ledger) instead of "The caterer's quote shows no extra cost", which no record holds.
  - M-04 drops "ठीक कर दिया।" so that the correction reply is the same in both Hindi registers.

---

## 5. Corrections by voice

A correction changes a payment that is already recorded. It never adds one: after M-02, M-03 or M-04 the caterer still has exactly one payment, with its history intact (voice-test-set pass criterion 1, X-01). The model proposes `correct_payment` (2.8 item 5). Code checks that the sentence is a correction, finds the one payment it corrects and builds the card. Agreed amounts follow the same pattern through `update_commitment` (5.5).

### 5.1 A correction or a new payment

The model decides first, from 2.8 item 5's cues. Code then checks every payment action against the transcript in its normalised form (1.6):

| Cue | Words |
|---|---|
| Correction | था, थी, थे, tha, thi ("diya tha", "दिए थे"); Latin "the" only right after diya, diye, kiya, kiye, liya or liye, because English "the" is everywhere; was, were; actually, asal mein, असल में; galat, गलत, wrong; sahi karo, theek karo, ठीक करो, correct, fix; a contrast: "X nahin, Y", "X नहीं, Y", "not X, Y" |
| New payment | aur, और, ek aur, phir se, फिर से, another, more, again, extra |

| The model says | The transcript has | Code does |
|---|---|---|
| `correct_payment` | Anything | Treats it as a correction and finds the payment (5.2). A correction can't add a payment, so the model's kind is kept |
| `record_payment` | No correction cue, or a new-payment cue as well | Treats it as a new payment (2.6), with its duplicate warning |
| `record_payment` | A correction cue and no new-payment cue, in the turn's only payment action, for a vendor that already has a payment (of the kind said, if a kind was said) | Asks, with the options "New payment" and "Correction": en "Is this a new payment, or a correction of the ₹50,000 advance on 20 Nov?" · hinglish "Yeh naya payment hai, ya 20 Nov wale ₹50,000 advance ki correction?" · hi "यह नया भुगतान है, या 20 नवंबर के पचास हज़ार रुपये के एडवांस में सुधार?" |

The option "Correction" turns the stored action into `correct_payment` and runs 5.2; "New payment" keeps it as it is. In the test set, M-02, M-03, M-04 and M-05 carry correction cues, M-06 has "aur", and M-07 has no cue at all and is a new payment.

### 5.2 Finding the payment

The candidates are this wedding's non-void payments in the speaker's snapshot (1.9). Code narrows them in this order:

1. **A reference.** A `payment_id` from the snapshot names the payment, if it is a candidate. A void payment is answered: en "That payment is void. Record it again on the vendor page." · hinglish "Yeh payment void hai. Vendor page par phir se record kijiye." · hi "यह भुगतान रद्द है। वेंडर पेज पर फिर से दर्ज कीजिए।"
2. **The vendor.** `vendor_id`, by reference or role word (2.5). Without one, code tries in turn: the payment the context turn saved ("that advance" in M-02 is the payment M-01 recorded); the context turn's vendor (M-04 follows a question about the caterer); the only candidate, if the wedding has exactly one. Otherwise the vendor is missing. The question lists the vendors that have a candidate (of the kind said) by role word, in the order the vendors were added, with one option each (M-05).
3. **The kind.** A `payment_kind` that was said keeps only the payments of that kind.
4. **The old amount.** A heard `previous_inr` keeps the payments whose current amount equals it. If none does, this step is skipped and the card warns: "You said ₹50,000; the record shows ₹45,000." (domain OQ15).
5. **The result:**

| What is left | What happens |
|---|---|
| One payment | That is the target. M-03 at D0 gives PAY-01, the caterer's only advance |
| None, and the vendor has no candidate at all | There is nothing to correct, so the card becomes a new payment (`record_payment`, title "New payment") with the warning "No payment to Annapoorna Caterers is recorded yet, so this adds one." Confirm stays enabled |
| None, because no payment has the kind said ("woh final payment tha" when only an advance exists) | The type can't change: the C5 question in 5.5 |
| Several | A question listing up to 3, newest first, with one option each. With more than 3 it adds "Or pick it on the vendor page." and a link. en "Which one: the ₹1,50,000 instalment on 25 Nov, or the ₹50,000 advance on 20 Nov?" · hinglish "Kaunsa wala: 25 Nov ka ₹1,50,000 instalment, ya 20 Nov ka ₹50,000 advance?" · hi "कौन सा: 25 नवंबर की एक लाख पचास हज़ार रुपये की किस्त, या 20 नवंबर का पचास हज़ार रुपये का एडवांस?" A payment without a date is "with no date" / "bina date ka" / "बिना तारीख़ का" |

A spoken answer to that question ("pehla wala", "20 November wala", "advance wala") goes to the model with the question as context. The model answers with a listed payment's reference, and code accepts only one that was listed.

At D0 every vendor has exactly one payment, so live #2 never needs the question. The several-payments case appears on the rehearsal copy after M-07, when no kind is said ("Caterer ko chaalis hazaar diya tha").

### 5.3 The correction card

M-03 at D0. Like every card, its labels follow the screen language (`ui_language`); only the reply follows the register (1.6).

| Part | English screen | Hindi screen |
|---|---|---|
| Title | Correction, not a new payment | सुधार, नया भुगतान नहीं |
| Record | Advance to Annapoorna Caterers, 20 Nov · PAY-01 | Annapoorna Caterers को एडवांस, 20 नवंबर · PAY-01 |
| Field | Amount ~~₹50,000~~ ₹40,000 · heard "चालीस हज़ार" (or "40000", as Saaras wrote it) | रकम ~~₹50,000~~ ₹40,000 · सुना "चालीस हज़ार" |
| After saving | Still owed ~~₹1,50,000~~ ₹1,60,000 | बाकी ~~₹1,50,000~~ ₹1,60,000 |
| Note | Still one payment. The old amount stays in History. | भुगतान एक ही रहेगा। पुरानी रकम इतिहास में रहेगी। |
| Buttons | Edit · Cancel · **Save correction** | बदलें · रद्द करें · **सुधार सेव करें** |

- The preview is silent (1.14). A silent preview's display reply is its title line in the screen language: "Correction, not a new payment: ₹50,000 → ₹40,000." (M-03).
- Other corrections use the same layout: "Paid on ~~20 Nov~~ 21 Nov", "Method ~~UPI~~ Cash".
- A manager's correction is titled "Correction, sent for approval", with the button "Send for approval", the note "The ledger won't change until Mira approves.", and "After approval" in place of "After saving".

### 5.4 Saving it

The envelope the confirm sends for M-03 (1.13):

```json
{"wedding_id":"0b7c…","command":"correct_payment",
 "input":{"payment_id":"5e21…","expected_version":1,"amount_inr":40000,
          "change_reason":"Advance was ₹40,000, not ₹50,000."},
 "idempotency_key":"a41f…:0","source":"voice","voice_turn_id":"a41f…"}
```

- **Server-filled.** `expected_version` is the version the card showed (V6). `change_reason` is a server template (2.4), never the model's text:
  - an amount: "{Kind} was {new}, not {old}.", which gives "Advance was ₹40,000, not ₹50,000." (domain's own example); `{Kind}` is Advance, Instalment or Final payment;
  - a date: "Paid on {new}, not {old}.", for example "Paid on 21 Nov, not 20 Nov.";
  - a method: "Paid by {new}, not {old}.", for example "Paid by cash, not UPI.";
  - several changes: the sentences joined, within 200 characters.
- **Voice details.** The dispatcher stores the turn's transcript as the new version's `spoken_text`, with `source` `voice` and the `voice_turn_id` (domain 5.1).
- **One transaction (C2, C6):**
  - PAY-01 gains version 2 at ₹40,000, and version 1 is superseded;
  - the caterer still has one payment, and paid falls by exactly ₹10,000;
  - ACT-06 reads "Mira corrected the advance to Annapoorna Caterers from ₹50,000 to ₹40,000.";
  - one receipt is written under `{voice_turn_id}:0`, and `weddings.version` moves once.
- **On screen after the commit:**
  - the payment row: "~~₹50,000~~ ₹40,000 · Corrected by Mira, 25 Nov, 3:12 pm" (C7);
  - PAY-01's History, oldest first: version 1, ₹50,000, 20 Nov 2026, Mira, typed; version 2, ₹40,000, 25 Nov 2026, Mira, voice, with the transcript as Saaras wrote it and the reason;
  - the receipt "Saved by Mira, 3:12 pm. Undo", the route to the vendor page, and the wash on Still owed (AT-2.12);
  - the reply (4.10, "Correction saved"): "एक लाख साठ हज़ार रुपये बाकी हैं।" for `hi` and `hinglish` (C-01); "Corrected the caterer's advance to ₹40,000. ₹1,60,000 is outstanding." for `en` (M-02).
- **Exactly once.** A second "haan, save karo", a double tap or a network retry finds the receipt and replays it. Nothing is written again, and PAY-01 keeps exactly two versions (X-01, AT-2.9).

### 5.5 Other cases

| Case | What happens |
|---|---|
| The new value equals the current one (said again after saving) | No card: "It's already ₹40,000." (4.10). The command would return `unchanged` anyway (C8) |
| The old amount said differs from the record | The card warns (5.2 step 4), and Confirm stays enabled |
| The payment changed after the card appeared | The confirm gets `stale_version`. The card refreshes as "Kabir changed this a moment ago", with the current amount struck through, and needs another tap (1.13). If the current amount now equals the new one, the card closes with "It's already ₹40,000." |
| The payment was voided after the card appeared | `payment_void`: "That record was voided meanwhile. Nothing was saved." Only Cancel is left (6.1 row 23) |
| A date or a method | Corrected like an amount: `paid_on` or `method` carries the new value (2.4) |
| The type or the vendor ("woh advance nahi, final payment tha"; "woh decorator ko diya tha") | These can't change (C5). A question with no card: en "A payment's type and vendor can't be changed. Void it on the vendor page and record it again." · hinglish "Payment ka type aur vendor badal nahi sakte. Vendor page par use void karke phir se record kijiye." · hi "भुगतान का प्रकार और वेंडर नहीं बदले जा सकते। वेंडर पेज पर उसे रद्द करके फिर से दर्ज कीजिए।" |
| Undo on the receipt | A typed command (`source` `ui`, with its own key), sent through `dispatchCommand` (decision D98). For a correction: `correct_payment` back to the earlier values, giving version 3 with the reason "Undo: back to ₹50,000."; version 2 stays in History (C9). For a payment just recorded: `void_payment` with the reason "Undone right after saving." Undo shows while the receipt is on screen, for owners only |
| A manager | The correction is kept and sent as `propose_change` (V8), with 5.3's manager card. Reply: en "Sent the correction to Mira for approval. The ledger hasn't changed." · hinglish "Correction Mira ki approval ke liye bhej di. Ledger abhi nahi badla." · hi "सुधार Mira की मंज़ूरी के लिए भेज दिया। लेजर अभी नहीं बदला।" Without `managers_can_see_vendor_dues` it is refused with `not_shared` (4.6) |
| An agreed amount (M-08) | `update_commitment`, through the same steps: the vendor's only active commitment (2.6), with `previous_inr` compared. The card is titled "Agreed amount" and shows "Frame & Phera Studio ~~₹1,10,000~~ ₹1,25,000 · heard 'सवा लाख'", "Still owed ~~₹80,000~~ ₹95,000" and "Photography ₹5,000 over its ₹1,20,000 budget", with the button "Save new amount". Its reason is "Agreed amount changed from ₹1,10,000 to ₹1,25,000." |
| Voice writes are off | The early refusal (1.11 step 9). The prefill opens the payment's correction form on the vendor page, with the amount ₹40,000 marked "from voice, please check" (6.3) |
| A correction and a new payment in one sentence | Two actions on one card, "Save both", run in order (V7) |
| Said on the caterer's page | The page is never used for writes (4.5). The vendor must be said, or come from a context turn |

---

## 6. Failures

**Rules for every failure:**
- **Nothing is written.** Every message says so when a write was possible.
- **The typed path stays open.** Every message offers typing. When the mic can't be used at all, the dock's text field takes the focus.
- **Failure messages are shown, never spoken,** in the screen language. Questions back are spoken; errors aren't.
- **The clip.** After an upload or speech-to-text failure, the dock keeps the clip in memory for one Retry. It is never written to storage, and it is dropped on success, on Cancel, on a new recording, or after 2 minutes (rule 1).
- **The transcript.** After a model failure the transcript stays on screen with "Edit what I heard" (1.7), so the person can fix it and send it as typed text without speaking again.

### 6.1 What can go wrong

| # | What happens | Detected by | Turn | Shown: en · hi |
|---|---|---|---|---|
| 1 | Mic permission denied | The browser: `NotAllowedError`, or the Permissions API says `denied` | None | "Jashn can't use the mic. Allow it in the browser's site settings, or type instead." · "Jashn माइक इस्तेमाल नहीं कर पा रहा। ब्राउज़र की साइट सेटिंग में अनुमति दें, या टाइप करें।" |
| 2 | No mic, or another app holds it | `NotFoundError`, `NotReadableError`, `OverconstrainedError` | None | "No mic is available. Connect one or close the app using it, or type instead." · "कोई माइक उपलब्ध नहीं है। माइक जोड़ें या उसे इस्तेमाल कर रहा ऐप बंद करें, या टाइप करें।" |
| 3 | The browser can't record: no recorder type (1.3 row 5), or the page isn't on https or localhost | The dock, before it shows the mic | None | "This browser can't record here. Type your request instead." · "यह ब्राउज़र यहाँ रिकॉर्ड नहीं कर सकता। अपनी बात टाइप करें।" |
| 4 | Offline | The browser reports offline, or the upload fails at once | None | "You're offline, so nothing was sent. Try again when you're back online." · "आप ऑफ़लाइन हैं, इसलिए कुछ नहीं भेजा गया। ऑनलाइन होने पर फिर कोशिश करें।" The mic is disabled until the browser is online again |
| 5 | The upload fails with a network error before any response | The dock | Possibly a turn the server cancels (1.4, disconnects) | The dock sends the clip once more, as a new turn. If that fails too: "Couldn't send that. Nothing was saved. Try again or type." · "भेजा नहीं जा सका। कुछ सेव नहीं हुआ। फिर कोशिश करें या टाइप करें।" with Retry |
| 6 | **Empty speech:** the transcript is empty, only punctuation, or only fillers (hmm, hm, umm, um, uh, acha, accha, ok, okay, हम्म, अच्छा, ओके) | The route, after speech to text. No model call | `answered`, error `no_speech` | "I didn't hear anything. Hold the mic and speak, or type." (AT-2.10) · "मुझे कुछ सुनाई नहीं दिया। माइक दबाकर बोलिए, या टाइप कीजिए।" The mic stays ready |
| 7 | Too long | The recorder stops at 25 s (1.2); the route rejects more than 30 s or 2 MB | None (422) | "That recording is too long. Say it in two parts, or type." · "रिकॉर्डिंग बहुत लंबी है। दो हिस्सों में बोलिए, या टाइप कीजिए।" |
| 8 | Saaras can't read the audio: 400 "Failed to read the file" or "Invalid file type" | The route | `failed`, `audio_unreadable` | The dock switches this device to WAV (1.3), converts the clip it still holds, and sends it once more as a new turn without asking. If that fails too: "Couldn't read that recording. Try again or type." · "रिकॉर्डिंग पढ़ी नहीं जा सकी। फिर कोशिश करें या टाइप करें।" |
| 9 | Saaras answers 429, 500, 502 or 503, or fails with a network error or a timeout, after its one retry (1.6); or answers 401, 402 or 403 | The route | `failed`, `stt_unavailable` | "Couldn't reach the speech service. Nothing was saved. Try again or type." (AT-2.10) · "स्पीच सेवा से संपर्क नहीं हो पाया। कुछ सेव नहीं हुआ। फिर कोशिश करें या टाइप करें।" |
| 10 | The model answers 429 or a 5xx, or fails with a network error or a timeout, after its retry; or answers 401, 402, 403 or `seat_budget_exhausted_error` (1.10) | The route | `failed`, `llm_unavailable` | "Couldn't reach the assistant. Nothing was saved. Edit what I heard, or type it." · "असिस्टेंट से संपर्क नहीं हो पाया। कुछ सेव नहीं हुआ। सुनी हुई बात बदलें, या टाइप करें।" |
| 11 | No usable tool call after the retry with `reasoning_effort` "low": no call, arguments that don't parse or break the schema, or `finish_reason` `length` | The route (1.10, 1.11 step 1) | `failed`, `llm_no_action` | "Couldn't work out what to do. Nothing was saved. Edit what I heard, or type it." · "समझ नहीं आया कि क्या करना है। कुछ सेव नहीं हुआ। सुनी हुई बात बदलें, या टाइप करें।" |
| 12 | The 30 s window for Sarvam attempts runs out (1.10) | The route | `failed`, with the code of the stage it was in | As row 9 or row 10 |
| 13 | The browser gives up after 45 s | The dock, which then sends cancel | `cancelled` | "That took too long. Nothing was saved. Try again or type." (1.16) · "बहुत देर लग गई। कुछ सेव नहीं हुआ। फिर कोशिश करें या टाइप करें।" |
| 14 | Too many turns: 12 a minute or 300 a day | The route (1.4 check 4) | None (429 `rate_limited`) | "Too many requests in a row. Wait a moment, or type." · "एक साथ बहुत सारे अनुरोध। थोड़ा रुकिए, या टाइप कीजिए।" |
| 15 | Voice is off for this user, or Flagsmith can't be read and the user isn't internal | VoiceDock; the routes answer 403 `voice_unavailable` | None | The mic is replaced by design-direction 7.1's "Voice is switched off right now. You can type or edit directly." (1.15) |
| 16 | Something is missing, unclear or unknown: a reference, a year, a number that doesn't re-read | 1.11 | `answered` or `proposed` | Not a failure: a question, or a "?" on the card (6.2) |
| 17 | A role refusal | 1.11 step 2 | `answered`, refusal `forbidden` or `not_shared` | 4.6 |
| 18 | Voice writes are off | 1.11 step 9, or 423 at confirm | `paused` | The fixed refusal line and the prefilled form (4.10, 6.3) |
| 19 | A confirm after 10 minutes | 410 `voice_turn_expired` | `expired` | "This request expired. Say it again." · "यह अनुरोध पुराना हो गया। फिर से बोलिए।" with the mic and "Edit what I heard" (AT-2.8) |
| 20 | A confirm of a closed turn (cancelled, superseded, answered, paused or failed) | 410 `voice_turn_expired` | Unchanged | "This request is closed." · "यह अनुरोध बंद हो चुका है।" |
| 21 | Someone else's turn | 403 `forbidden` | Unchanged | "This request belongs to someone else." · "यह अनुरोध किसी और का है।" Reachable only through the API (AT-2.8) |
| 22 | The record changed after the card appeared | 409 at confirm | `proposed` | "Changed meanwhile" (1.12) |
| 23 | A command error at confirm | The dispatcher | `proposed`, or `partially_saved` when earlier actions were saved (V7) | The plain words below, on the card (1.13) |
| 24 | Bulbul fails: an error status, a JSON body, or no first byte within 8 s | The reply-audio route answers 500 | Unchanged | The text stays, with a small "Audio unavailable" · "आवाज़ उपलब्ध नहीं" beside the caption (1.14) |
| 25 | The browser blocks playback | `play()` rejects with `NotAllowedError` | Unchanged | The "Play reply" · "जवाब सुनें" button (1.14) |
| 26 | An unexpected server error | Any voice route | Before a confirm: `failed`, `internal_error`. At confirm: the dispatcher's own result | "Something went wrong. Nothing was saved. Try again or type." · "कुछ गड़बड़ हो गई। कुछ सेव नहीं हुआ। फिर कोशिश करें या टाइप करें।" |

**The `error` event** (1.5) for rows 6 and 8 to 12 and 26: `stage` is `stt` for rows 6, 8 and 9, `llm` for rows 10 and 11, and `server` for row 26 (row 12 takes its stage's). `retryable` is true for rows 8, 9, 10, 12 and 26, where the dock offers Retry with the clip it holds, and false for rows 6 and 11, where the person speaks again or edits what was heard.

**Command errors in plain words** (row 23; English shown, Hindi screens translate them the same way):

| Code | On the card | Can an edit fix it? |
|---|---|---|
| `duplicate_requirement` | "Jain food for 12 is already on the reception." Normally caught at the preview (R-02) | No |
| `duplicate_vendor` | "Annapoorna Caterers is already a vendor." | Yes, a new name |
| `not_invited` | "Prachi isn't invited to the mehendi." | No |
| `plus_ones_exceeds_limit` | "Nikhil can bring at most 1." | Yes |
| `amount_mismatch` | "The total doesn't match the rate and count. Edit one of them." | Yes |
| `validation_failed` | The field's label and the reason: "Year: needed", "End time: must be after the start" | Yes |
| `payment_void`, `commitment_void` | "That record was voided meanwhile. Nothing was saved." | No |
| `nothing_published` | "Publish the schedule first. There's no card to make yet." | No |
| `internal_error` | "Something went wrong. Nothing was saved. Try again or use the form." | No |

### 6.2 When Jashn isn't sure

Saaras gives no confidence score (1.6), so code looks for these signs instead:

| Sign | Treated as |
|---|---|
| A value's phrase doesn't re-read to the model's value, isn't in the transcript, or can't be read (3.1) | An uncertain field |
| Vendor money under ₹100 (3.6) | An uncertain field |
| A name the server can't match (2.5) | A missing reference: "I couldn't find {heard} among your vendors." |
| A field the model filled but also listed in `missing_fields` | An uncertain field (1.11 step 7) |
| Letters from a script other than Devanagari and Latin, or one word making up more than half of a transcript of 6 or more words (noise often comes back like that) | Not understood: 4.1's generic question, with no model call. The turn is `answered` |
| Nothing, or only fillers | 6.1 row 6 |

**What follows:**
- **An uncertain secondary field** gets a "?" on the card and a dotted underline on its phrase (1.7). If code has its own reading, the field shows it with a chip, "Use ₹40,000". Tapping the chip, or editing the field, clears the "?". Confirm stays disabled while any "?" is left (1.12).
- **An uncertain or missing identifying or primary field** makes the turn a question with no card (1.11 step 8). The question carries options when there is something to choose from.

**Options on a question:**
- **Shape.** At most 6 options. Each has a `label` (in the screen language, with amounts and dates in display form), a `value`, and `default` true or false. The `value` is a short token the server issued, such as `o2`. It stands for a value stored with the turn's partial actions, so the browser never sends a raw amount or id.
- **Tapping one** sends a turn with `option` and `context_turn_id` (1.4). Its input mode is `tap` and its transcript is the option's label. There is no speech to text and no model call: the server merges the option's value into the stored partial actions and runs 1.11 steps 2 to 10 again. Usually the result is a preview with a Save button.
- **Speaking.** "Haan" or "yes" picks the `default` option (1.8). Anything else goes to the model with the question as context, like any follow-up (1.11).
- **Defaults.** At most one option is the `default`, and only when it is a reading code made itself of the person's own words. Lists of records never have one, and neither does an either-or question, because a "haan" to it would mean nothing.

| Question | Options | `default` |
|---|---|---|
| "Is it ₹40,000? I heard 'चालीस हज़ार'." (code's reading differs from the model's, 3.1) | Code's reading | That reading |
| "₹2,50,000? I heard 'do lakh pachaas'." (3.2 rule 5) | "₹2,50,000", "₹2,00,050" | "₹2,50,000" |
| "₹40, or ₹40,000?" (3.6) | Both | None |
| "Kal matlab 26 November? …" (E-08) | "26 November", "Keep 13 December" | "26 November" |
| "Subah saat ya shaam saat?" (3.4) | "7:00 am", "7:00 pm" | None |
| "Kis vendor ka advance? …" (M-05) | One per vendor with a candidate, by role word | None |
| "Kis function ka venue? …" (E-07) | The five functions | None |
| "Which one: …?" (5.2) | Up to 3 payments | None |
| "Is this a new payment, or a correction …?" (5.1) | "New payment", "Correction" | None |
| "Kitna diya? …" (M-13) | None: the amount is said or typed | – |

The thresholds in the first table (the filler list, ₹100, the noise rule) are first guesses, to be tuned after the first full run of the test set (section 11).

### 6.3 The typed paths

1. **The dock's text field** (beside the header mic on every screen, decision D20). A typed request goes to the same turn route with `text` (1.4). Its input mode is `typed`; speech to text is skipped, and everything after it is the same: the model, the checks, the card, the confirm, `source` `voice`, and the kill switch (a voice turn, however it was entered). It serves noisy rooms, people who can't speak, and the morning checks. The chip is computed from the text like a transcript (1.6), so Hinglish typed in Latin gets a Hinglish reply when the model says it is Hinglish.
2. **Edit what I heard** (1.7). The transcript becomes editable. Sending it runs a typed turn with the old turn as its context, and the old card is superseded.
3. **The forms: the real typed path.** Every voice write has a screen that runs the same command with `source` `ui`, and typed commands never read `voice_writes_enabled` (V3, flagsmith 3.2). After a refusal or a 423, the dock routes to the record's page and hands the form the prefill (each action's command, input and labels) through client state, never in the URL. The form marks each prefilled field "from voice, please check" until it is edited or saved. Saving it is an ordinary typed command with its own key, sent through `dispatchCommand` (decision D98).

| Kind | The form that opens | Prefill |
|---|---|---|
| `add_requirement` | The function's add-requirement form | **Must** (AT-2.7: Jain food, 12, Catering, Annapoorna Caterers) |
| `correct_payment`, `record_payment` | The vendor page's payment forms | Should |
| `record_commitment`, `update_commitment` | The vendor page's commitment form | Should |
| `create_event`, `update_event` | The function's editor on Events | Should |
| `set_wedding_profile` | The setup form | Should |
| Every other kind | Its page, opened without a prefill until the form supports one | – |

**The prefill store** (decision D61). Lane B owns the forms. Lane C exports a typed prefill store from `src/components/voice/` by the 11:40 batch.
- **One consumer contract for both refusals.** The early refusal (the turn's `refused` event) and the confirm-time 423 (`error.prefill`) carry the same list, one `{command, input, labels}` entry per action with the validated input (decision D121), and fill the store the same way. For the 423, the confirm route rebuilds the full list from the stored turn (1.13).
- **How a form uses it.** The form for that kind reads its entry once when it opens, marks each field "from voice, please check", and clears the entry on save or cancel. It is never in the URL.
- **Who consumes it when.** B3 consumes it for the add-requirement form in the 12:30 batch (AT-2.7). The other forms in the table follow as Shoulds.

`publish_itinerary` needs no prefill: its fallback is Lane D's `PublishSheet`, opened from Events.

### 6.4 Fixture mode

- **When it is on.** `VOICE_FIXTURE_MODE` set to `on`, or `SARVAM_API_KEY` missing, in local development only. **Never in a production build** (architecture 5, AT-2.10), whatever the variables say: that covers the Vercel deployment and the laptop hosting fallback. There a missing key gives 6.1 row 9 instead, and during the demo a Sarvam failure goes to the typed path, never to fixtures (architecture 8 row 5).
- **What it replaces.** Only the three Sarvam calls:
  - speech to text returns the fixture's transcript, so the confirm and cancel phrases (1.8) still work;
  - the model returns the fixture's tool arguments;
  - the reply-audio route serves `public/voice-fixtures/{row_id}.mp3` for a speech part whose text equals that fixture's `audio_text`, and answers 204 otherwise (text only).
- **What stays real:** the turn route and its checks, the snapshot, resolution and every check in 1.11, the card, the confirm, the dispatcher, the flags and the kill switch, and the stored turn (input mode `fixture`, with its `fixture_id`).
- **Choosing a row.** In fixture mode the dock shows a row picker beside the mic: the live 8 in order, then every other row id. Holding the mic still records and uploads, which tests the browser path, but the clip is ignored and the picked row's fixture is used. With no row picked, the dock says "Pick a test row first."
- **The file.** `src/server/voice/fixtures/{row_id}.json` holds the start state, Saaras's transcript and language code, the tool arguments, the `audio_text` of the row's MP3 (or null), and where it came from. M-03:

```json
{"row_id":"M-03","start_state":"D0","source":"hand-written",
 "stt":{"transcript":"Caterer को चालीस हज़ार advance दिया था","language_code":"hi-IN"},
 "llm":{"intent":"act","reply_language":"hinglish","missing_fields":[],"reply":"",
  "actions":[{"kind":"correct_payment","vendor_id":"VEN-CAT","payment_kind":"advance","amount_inr":40000,
   "heard":[{"field":"amount_inr","phrase":"चालीस हज़ार"}]}]},
 "audio_text":null}
```

- **Where fixtures come from.** At first they are hand-written from section 7, with the transcript as Saaras is likely to write it. Once the key works, real results replace them: when the app runs locally, the judge panel has "Save as fixture", which writes the turn's real transcript, arguments and reply audio to the two paths. Only Bulbul's reply audio is saved. A person's recording never is.
- **Labels.** Every fixture turn shows "Fixture, not Sarvam" on the dock and in the judge panel (AT-2.10, architecture 8 row 3).

---

## 7. The test matrix

How to read it:
- **Heard** is a likely Saaras `codemix` transcript, marked ≈. Hindi words often come back in Devanagari and numbers as digits. A row passes on the action, not on the spelling (voice-test-set, "How to run it").
- **Actions** are the actions after 1.11's checks, with references resolved. The server-filled `expected_version` and the keys are left out.
- **Card or question** is what appears before anything is written.
- **Reply** is the display text after saving or answering. "Spoken" gives the speech text where it differs (1.14). Every write's reply is spoken only after its commit.

### 7.1 The live 8, in order

All five rehearsal runs in a row must pass on the stage headset (pass criterion 3). Mira's screen is English; her register is Hinglish unless noted.

| # | Row · start · who | Heard | Actions | Card or question | Reply |
|---|---|---|---|---|---|
| 1 | O-01 · D0 · Mira, laptop | ≈ "Caterer को अब कितना देना है?" | `query_balance` {`scope` vendor, `vendor_id` VEN-CAT} | Answer card "Still owed to Annapoorna Caterers: ₹1,50,000", linking to the vendor page, with the figure washed | "एक लाख पचास हज़ार रुपये बाकी हैं।" (spoken the same, `hi-IN`) |
| 2 | M-03 · D0 · Mira | ≈ "Caterer को चालीस हज़ार advance दिया था", or "…40000 advance…" | `correct_payment` {`payment_id` PAY-01, `amount_inr` 40000, re-read from the phrase}. PAY-01 is the caterer's only advance (5.2) | "Correction, not a new payment" · Advance to Annapoorna Caterers, 20 Nov · PAY-01 · ~~₹50,000~~ ₹40,000 · heard "चालीस हज़ार" · Still owed ~~₹1,50,000~~ ₹1,60,000 · **Save correction** | Shown: "Correction, not a new payment: ₹50,000 → ₹40,000." Not spoken |
| 3 | C-01 · #2's card open | ≈ "हाँ, save करो" | A confirm phrase, with no model call: #2 is confirmed with `confirmed_via` `phrase`, and `correct_payment` is applied once under `{voice_turn_id}:0` | Receipt "Saved by Mira, 3:12 pm. Undo". D1: PAY-01 version 2; the caterer owes ₹1,60,000 and the wedding ₹5,40,000; ACT-06 | "एक लाख साठ हज़ार रुपये बाकी हैं।" |
| 4 | E-04 · D1 · Diya, phone | ≈ "Reception Lotus Hall में shift कर दो" | `update_event` {`event_id` EVT-REC, `venue_name` "Lotus Hall", matched to Lotus Hall at Mallige Gardens} | "Reception venue: Banyan Hall → Lotus Hall (Mallige Gardens, seats 300)" · After saving: "The over-capacity warning goes away. Guests still see Banyan Hall until an owner publishes." · **Save draft** | After Save draft (D2, ACT-07): "Draft mein reception ab Lotus Hall mein hai. Guests ko publish ke baad dikhega." Spoken: "Draft में reception अब Lotus Hall में है। Guests को publish के बाद दिखेगा।" |
| 5 | O-02 · D2 · Mira | ≈ "Diya ने क्या बदला?" | `query_changes` {`actor_member_id` Diya, `latest` true} | Answer card linking to ACT-07 | "Diya ne reception Banyan Hall se Lotus Hall mein shift kiya. Yeh abhi draft hai, guests ko Banyan Hall hi dikh raha hai." Spoken in its Devanagari form (4.9) |
| 6 | E-05 · D2 · Mira | ≈ "Schedule publish कर दो" | `publish_itinerary`, with `expected_draft_version` from the sheet | Lane D's `PublishSheet` (D59): "Publish revision 3 · 1 change: Reception venue", ~~Banyan Hall~~ Lotus Hall · **Publish revision 3** | After Publish (D3, REV-3, ACT-08): "Schedule publish ho gaya. Guests ko ab Lotus Hall dikhega." Spoken in its Devanagari form |
| – | Tara's tap · D3 | – | Not voice: `submit_rsvp` from her link | D4: reception 230 / 9 / 11; estimate ₹1,84,000; the contract stays ₹2,00,000 | – |
| 7 | O-03 · D4 · Mira | ≈ "Reception का venue क्या है, और caterer का कितना बाकी है?" | `query_event` {EVT-REC, `detail` venue} and `query_balance` {VEN-CAT} | Two answer cards: the reception, and the caterer with PAY-01's history | "Reception: Lotus Hall. एक लाख साठ हज़ार रुपये बाकी हैं।" |
| 8 | R-03 · D4 with `voice_writes_enabled` off · Mira | ≈ "Reception में बारह लोगों के लिए Jain खाना add करो" | `add_requirement` {EVT-REC, `text` "Jain food", `quantity` 12, catering, VEN-CAT suggested}, refused early: turn `paused`, `voice_writes_paused` | No card. The reception's add-requirement form opens with Jain food, 12, Catering and Annapoorna Caterers, each marked "from voice, please check" | "Abhi voice se badlav band hain. Aap type karke save kar sakte hain." Spoken: "अभी voice से बदलाव बंद हैं। आप type करके save कर सकते हैं।" The typed Save then gives D5 (REQ-10 with `source` `ui`, ACT-10) |

Before #8, the "Questions only" chip appears within one render of the tab regaining focus (AT-2.7). After every run: `voice_writes_enabled` back on, and reset to D0 (demo-data §9.3).

### 7.2 Must-work rows

| Row · start | Said | Actions | Card or question | Reply |
|---|---|---|---|---|
| S-01 · T0 | "Our wedding is on 14 December in Bengaluru. Budget is twelve lakh, roughly 250 guests." | `set_wedding_profile` draft {`date_text` "14 December", `city` Bengaluru, `budget_inr` 12,00,000, `expected_guests` 250}; no `wedding_date`; missing `year`, `bride_name`, `groom_name` | Draft card with "?" on the year and the names; **Save wedding** disabled: "Add the year and the couple's names to save." | Spoken question: "Got it: 14 December in Bengaluru, ₹12,00,000, about 250 guests. Which year is it, and what are the couple's names?" (speech: "twelve lakh rupees") |
| S-02 · after S-01 | "Saal 2026 hai. Dulhan Mira hai aur dulha Kabir." | Merged into S-01's draft: `wedding_date` 2026-12-14, `bride_name` Mira, `groom_name` Kabir. S-01's turn is `superseded` | Mira & Kabir · Mon 14 Dec 2026 · Bengaluru · ₹12,00,000 · 250 guests · **Save wedding** | After saving (T1): "Mira aur Kabir ki shaadi, 14 December 2026, Bengaluru. Save ho gayi." |
| S-03 · T0 | "Shaadi Bengaluru mein hai, December mein. Budget baarah lakh hai." | Draft {`city` Bengaluru, `month` 12, `budget_inr` 12,00,000}; missing `day`, `year`, names | Draft card with "?" | "₹12,00,000 note kar liya. December mein kaunsi tareekh, kaunsa saal, aur dulha-dulhan ke naam?" |
| E-01 · T1 | "Add the sangeet on the thirteenth at seven in the evening, at Garden Hall." | `create_event` {sangeet, 2026-12-13 "from the wedding month", `start_time` 19:00, `venue_name` Garden Hall} | "Add sangeet" · Sun 13 Dec 2026 · 7:00 pm · Garden Hall (New venue at T1) · **Add sangeet** | "Sangeet added for Sunday 13 December at 7 PM, Garden Hall." |
| E-02 · T1 | "Sangeet terah tareekh ko shaam saat baje Garden Hall mein rakho." | As E-01 | As E-01 | "Sangeet 13 December, shaam saat baje, Garden Hall mein add ho gaya." |
| E-03 · D0 | "मेहंदी शाम साढ़े पाँच बजे तक ख़त्म कर दो।" | `update_event` {EVT-MEH, `end_time` 17:30} | "Mehendi ends: ~~7:30 pm~~ 5:30 pm" (AT-3.9) · After saving: "The overlap with the Sangeet goes away." · **Save draft** | "मेहंदी अब शाम साढ़े पाँच बजे ख़त्म होगी। संगीत से टकराव हट गया।" |
| E-06 · D2 · Diya | "Schedule publish kar do." | `publish_itinerary`, refused at the turn with `forbidden` | No card | "Publish sirf Mira ya Kabir kar sakte hain. Aapka badlav draft mein safe hai." |
| E-07 · D0, from the overview | "Venue kya hai?" | `query_event` with no function: a question, with the five functions as options | – | "Kis function ka venue? Mehendi, haldi, sangeet, shaadi ya reception?" |
| E-08 · D0 | "Haldi kal subah rakhte hain." | `update_event` {EVT-HAL}; "kal" for a function is a question, with the `default` option "26 November" | – | "Kal matlab 26 November? Haldi abhi 13 December subah hai, kaunsi tareekh rakhun?" |
| G-01 · D0 | "Who's attending the reception?" | `query_rsvp` {EVT-REC} | Answer card; Guests opens filtered to the reception's attending guests | "229 of 250 have confirmed for the reception. 9 declined and 12 haven't replied yet." |
| G-02 · D0, rehearsal copy | "Nikhil aur Prachi Jain reception mein aa rahe hain." | `set_rsvp` {`guest_ids` Nikhil Jain and Prachi Jain, EVT-REC, attending} | "RSVP for the reception: Nikhil Jain, Prachi Jain → Attending" · After saving: 231 attending, 10 not replied · **Save RSVP** | "Nikhil aur Prachi reception ke liye confirm ho gaye. Ab 231 log aa rahe hain." |
| M-01 · S0 | "The caterer is charging eight hundred per person for 250 people. I paid a fifty-thousand advance." | `record_commitment` {VEN-CAT, `per_unit`, `plate`, 800 × 250, `amount_inr` 2,00,000 computed in code, EVT-REC, the ₹850 quote accepted} and `record_payment` {VEN-CAT, 50,000, advance, `paid_on` empty} | One card with two rows, "Date not given" · After saving: Still owed ₹1,50,000 · **Save both** | "Saved a ₹2,00,000 catering commitment and a ₹50,000 advance. ₹1,50,000 is outstanding." |
| M-02 · after M-01 | "Actually, that advance was forty thousand." | `correct_payment` {the payment M-01 saved, from the context turn; 40,000} | "Correction, not a new payment" · ~~₹50,000~~ ₹40,000 · **Save correction** | "Corrected the caterer's advance to ₹40,000. ₹1,60,000 is outstanding." |
| M-04 · D0, after a caterer question | "नहीं, पचास नहीं, चालीस हज़ार दिए थे।" | `correct_payment` {PAY-01, through the context turn's vendor and the heard old amount 50,000; 40,000} | As M-03 | "एक लाख साठ हज़ार रुपये बाकी हैं।" |
| M-05 · D0, fresh | "Advance chaalis hazaar tha." | `correct_payment` with no vendor: a question with six options | – | "Kis vendor ka advance? Caterer, venue, decorator, photographer, mehendi artist ya DJ?" |
| M-06 · D0 | "Decorator ko pachaas hazaar aur de diye." | `record_payment` {VEN-DEC, 50,000, instalment suggested}; "aur" makes it new (5.1) | "New payment" · Marigold Lane Decor · ₹50,000 · heard "पचास हज़ार" · Instalment (suggested) · Date not given · Still owed ~~₹1,00,000~~ ₹50,000 · **Save payment** | "Decorator ko ₹50,000 ka payment save hua. Ab ₹50,000 baaki hai." |
| M-07 · D1 | "Caterer ko dedh lakh de diye." | `record_payment` {VEN-CAT, 1,50,000, instalment suggested} | "New payment" · ₹1,50,000 · heard "डेढ़ लाख" · Still owed ~~₹1,60,000~~ ₹10,000 · **Save payment** | "Caterer ko ₹1,50,000 ka payment save hua. Ab sirf ₹10,000 baaki hai." |
| M-08 · D0 | "Photographer ka total sava lakh ho gaya hai." | `update_commitment` {COM-04, `amount_inr` 1,25,000} | "Agreed amount" · ~~₹1,10,000~~ ₹1,25,000 · heard "सवा लाख" · Still owed ~~₹80,000~~ ₹95,000 · Photography ₹5,000 over budget · **Save new amount** | "Photographer ka contract ₹1,25,000 ho gaya. ₹95,000 baaki hai, aur photography budget se ₹5,000 upar hai." |
| M-09 · D0 | "Venue ka ₹1.5L baaki hai na?" | `query_balance` {VEN-VEN, `user_claim_inr` 1,50,000}, which code finds wrong (₹1,40,000) | Answer card linking to Mallige Gardens | "Nahi, venue ka ₹1,40,000 baaki hai. ₹2,80,000 mein se ₹1,40,000 diye ja chuke hain." |
| M-10 · D3 | "What changed today, and how much do we still owe?" | `query_changes` {`day` today} and `query_balance` {`scope` wedding} | Cards for Diya's ACT-04, ACT-05 and ACT-07, then Mira's own ACT-06 and ACT-08 listed silently under "Your changes today", and Money | "Diya made three changes today, including moving the reception to Lotus Hall, which is now published. You still owe ₹5,40,000, including ₹1,60,000 to the caterer." |
| M-11 · D1 | "कुल कितना बाकी है?" | `query_balance` {`scope` wedding} | Answer card linking to Money | "कुल पाँच लाख चालीस हज़ार रुपये बाकी हैं।" |
| M-12 · D0 · Diya | "Decorator ko bees hazaar de diye." | `record_payment` {VEN-DEC, 20,000}, sent as `propose_change` (V8) | "Payment, sent for approval" · Marigold Lane Decor · ₹20,000 · "The ledger won't change until Mira approves." · **Send for approval** | 202 `proposed`, PRP-02: "Yeh ₹20,000 ka payment Mira ki approval ke liye bhej diya. Ledger abhi nahi badla." |
| M-13 · D0 | "Mehendi artist ko advance de diya." | `record_payment` {VEN-MEH} with no amount: a question | – | "Kitna diya? ₹5,000 ka advance pehle se likha hai, kya yeh naya payment hai?" |
| M-14 · D0 · Diya | "What's our total budget, and how much shagun came in?" | `query_budget` and `query_shagun`, both refused with `not_shared` | No card | "The budget and the Shagun register haven't been shared with you. I can help with vendor dues." |
| V-01 · D4 | "Caterer ka estimate kitna hai?" | `query_catering` {VEN-CAT} | "Estimate, not the contract" · 230 attending × ₹800 = ₹1,84,000 · Contract ₹2,00,000 | "Confirmed guests ke hisaab se estimate ₹1,84,000 hai. Contract fixed ₹2,00,000 ka hi hai." |
| R-01 · D0 | "Add Jain food for twelve guests at the reception." | `add_requirement` {EVT-REC, "Jain food", 12, catering, VEN-CAT suggested} | "Add requirement" · Reception · Jain food · 12 · Catering · Annapoorna Caterers (suggested) · **Save requirement** | "Added Jain food for 12 at the reception. It doesn't change what you owe the caterer." |
| R-02 · D0, or after R-01 | "रिसेप्शन में बारह लोगों के लिए जैन खाना चाहिए।" | As R-01. After R-01 the duplicate is found at the preview: a question | As R-01, or none | "रिसेप्शन में बारह लोगों के लिए जैन खाना जोड़ दिया।" After R-01: "रिसेप्शन में बारह लोगों के लिए जैन खाना पहले से है।" |
| I-01 · T1, photo attached | "Make the invite maroon and gold. Use this photo." | `update_invite_style` {`theme` maroon_gold, `photo_asset_id` ASSET-NEW} | "Invite style" · Maroon & Gold · the photo · **Save draft** | "Your invite is now maroon and gold, with this photo. Publish it when you're happy." |
| I-02 · D3 | "Naya card export karo." | `request_card_export` {`format` png} | "Export card" · revision 3 · **Export card** (one tap, domain OQ11) | "Lotus Hall wala naya card ban raha hai. Pehle download kiya card purana hai." |
| O-04 · D0 | "What did the event manager change today?" | `query_changes` {`actor_member_id` Diya ("the event manager", 2.5), `day` today} | Cards linking to ACT-04 and ACT-05 | "Today Diya added two notes: sugar-free dessert option at the reception, and marigold and fairy-light canopy over the stage at the sangeet." |
| C-02 · any open card | "नहीं, रहने दो।" | A cancel phrase, with no model call | The card closes | "ठीक है, कुछ नहीं बदला।" |

**I-01's timing** (decision D121). I-01 by voice is Lane C's 13:45 item, after A6's `/api/uploads/sign` and `add_asset` (12:30) and Lane D's `update_invite_style` (11:40). It includes the dock paperclip's "Couple photo" upload. If it misses 13:45, the README marks AT-7.1's voice half Partial.

### 7.3 Rows that depend on features not yet built

| Row | Depends on | Expected |
|---|---|---|
| SH-01 | Should #13 (Shagun): its backend by the 13:45 batch, then Lane C's gated voice topic in the 14:30 batch (decision D65) | `record_shagun` {H05, `giver_name` Ramesh & Kavita Sharma, 5,100 from "5,100" or "ikyavan sau", today}; card "Shagun received" · **Save shagun**; "Sharma ji ka ₹5,100 shagun likh liya, aur thank-you list mein jod diya." Before #13 ships: "The Shagun register isn't set up yet." |
| SH-02 | Should #13 | `query_shagun` {`thanked` false}; "चार लोग: Prakash & Vandana Kulkarni, Leena & Glen D'Souza, Naveen & Ritu Arora, Ramesh & Kavita Sharma।" The names are the register's, as stored, so they differ from the test set's Devanagari forms. It is spoken in two parts |
| I-03 | Should #11 (the card reader), built only after its button flow passes (doc-ai 1.6) | Voice has no kind for it (0.3). The paperclip offers two choices. "Couple photo" is the upload flow behind `attached_asset_id` (1.4). "Printed card" shows only on the setup screen, and only while the setup render's `image_extraction_provider` isn't `off` (flagsmith 3.8). The setup screen passes that to the dock as the `show_printed_card` prop (1.15), so the dock evaluates nothing new. "Printed card" opens doc-ai §1.6's sheet at `sending` with that photo. The photo goes only to `POST /api/card-imports`, never to the turn route or Storage (doc-ai 3.1). The spoken sentence ("Yeh purana card hai, isse details le lo.") is not needed and not parsed; said with no card attached, it gets 2.3's "can't do that by voice yet" reply. `voice_writes_enabled` doesn't apply, because the apply route saves the functions (doc-ai 1.5, 1.6) |
| G-03 to G-07 | Guest voice (domain OQ7), not built | A guest link carries no session, so the voice routes answer 401 and the guest page has no mic. Guest privacy is still checked by X-03 |

**Accuracy bar** (decision D82). At most three of the rows that apply may fail. While #11 and #13 are unbuilt that is 36 of 39: the 47 rows, minus G-03 to G-07 (no guest voice), minus SH-01, SH-02 and I-03. If #11 or #13 ships, its rows apply again, and the bar is still at most three failures.

### 7.4 The non-spoken checks, through voice

| Check | Through voice | Expected |
|---|---|---|
| X-01 | Confirm #2 twice: a double tap, a network retry, or "Haan, save karo" said twice | The second confirm returns every action as `replayed`. A second phrase gets the `saved` event with the replayed results and "Yeh pehle hi save ho chuka hai." (1.8). PAY-01 has exactly two versions; the caterer owes ₹1,60,000 |
| X-03 | Tara's link token against every voice route | 401: no session |
| X-04 | Diya's session: "Decorator ko bees hazaar de diye." and M-14 | Only a proposal (`propose_change`, 202); `not_shared` refusals; no money read model is called for what she can't see |
| X-05 | Refresh both devices after each live step | Voice-made changes survive the refresh and show on the other device; an open card survives the 2.5 s poll (1.12) |
| X-06 | `voice_writes_enabled` off, then O-03 | Answered as in #7 |
| Fixture labels | Any row with fixture mode on, locally | "Fixture, not Sarvam" on the dock and in the judge panel; no Sarvam request in the trace |

**Who runs the full set** (decisions D29 and D49). Full runs start at 12:45 and 14:00. The teammate or a booked speaker runs them on a separate device and a rehearsal copy, independent of the presenter. By 11:30 the user books two fluent Hindi speakers, one from outside the team. Lane C provides the resets, the timings and the results log. Bank one real Sarvam correction with audible playback as soon as one succeeds. The 12:45 run keeps these people, so it can overlap the two-device smoke test at about 12:35–12:55 (decision D111). Resets follow decision D120: Lane C runs `reset_demo` only on a rehearsal copy it owns, as that copy's owner; L resets any other copy, and the demo and e2e copies stay L's (D17).

**Per run, log** the row, the transcript, the actions, the card, the reply, pass or fail, and two timings: release to card, and saved to audio (1.16). The judge panel's "Copy summary" (section 8) gives all of these in one line.

---

## 8. The judge panel: "How Jashn heard you"

**Purpose.** One screen that answers the likeliest judge questions for any turn: Q1 "Is that really live Sarvam?", Q2 "What stops the model from inventing amounts?", Q3 "What if it's sent twice?" and Q10 "Walk us through a path" (demo-script §6). It is not part of the three-minute script; the lead opens it during Q&A, and it is the fastest way to log a rehearsal.

**Where.** A "How Jashn heard you" link under every turn's transcript in the voice panel, on desktop and on the phone. It opens a side sheet on desktop and a full sheet on the phone. Its data comes from `GET /api/voice/turns/{voice_turn_id}/trace` (1.17), which only the speaker and the wedding's owners may read; anyone else gets 403 `forbidden`, as at confirm. Like every voice route it also needs `voice_pilot` on for the reader, or it answers 403 `voice_unavailable` (flagsmith 3.1). The demo's owner is an internal account, so the panel works there. Opening it never calls Sarvam again.

**When it ships** (decision D106). `lane-c-judge-panel` is a Should PR. It merges at 13:45 only if L's post-12:30 demo-path run passed and its own checks are green; otherwise it moves to 14:30 or becomes future scope.

| Block | Shows | Proves |
|---|---|---|
| Heard | The transcript exactly as Saaras returned it; the input mode; the clip's length and type ("3.9 s · audio/webm"); the language code sent; `saaras:v4`, `codemix`; Saaras's `request_id` and time; how many keyterms were sent, with the list behind a tap | **Sarvam Saaras** heard this clip: a live request id and timing |
| Language | The chip and the register, with the word counts that chose them ("Devanagari 5 · Latin 3 → Hinglish") | The reply language was computed (1.6) |
| Proposed | `sarvam-105b`; each attempt with its request id, time and `reasoning_tokens` (0); the retry's reason, if any; `prompt_version`; the raw tool arguments, labelled "Suggested by the model" | **The Sarvam model** proposed through the forced tool, and did nothing more |
| Checked | One row per value: the model's value, the heard phrase, code's reading, and the result (match, uncertain or mismatch). Every reference with the record it resolved to ("VEN-CAT → Annapoorna Caterers"). The kind rules that ran ("PAY-01: the caterer's only advance") | **Code**, not the model, decided every number and record |
| Flags | `voice_pilot`, `voice_writes_enabled`, `spoken_replies`, `env_label` and `fallback`, as read for this turn; at confirm, the voice gate's answer for each action | **Flagsmith** decided whether voice could write |
| Confirmed | Who confirmed, how (a tap, or a phrase with a link to its turn), when, and any edits, old and new | A person confirmed; the model never saves |
| Saved | Per action: the command, its outcome (applied, proposed, replayed or unchanged), its idempotency key, its activity entry, and a link to the record ("PAY-01 · version 2") | **The shared dispatcher** wrote it once, as the forms do |
| Spoken | The display text and the speech text; `bulbul:v4-flash`, the voice and its language code; the time to the first byte | **Sarvam Bulbul** spoke a reply built from the saved record |
| Timings | Release to heard, release to card, confirm to saved, saved to audio, and the server's time per step | Speed, measured rather than claimed |

**Never shown:** the Sarvam key or any request header; the snapshot itself (the panel shows only how many blocks and roughly how many tokens it had); the audio, which is never kept; other people's turns; phone numbers and emails.

**Fixture mode** puts a banner at the top: "Fixture, not Sarvam: no Sarvam request was made." Request ids read "fixture", and "Save as fixture" appears when the app runs locally (6.4).

**Copy summary** puts one line on the clipboard for the rehearsal log: time, input mode, chip, each action with its key values and check results, outcome, release to card, and saved to audio. For example: "15:12 · speech · Hinglish · correct_payment PAY-01 amount_inr 40000 (match) · applied · card 3.5 s · audio 0.6 s".

**The trace response,** shortened (the raw arguments and the full checks are left out):

```json
{"voice_turn_id":"a41f…","input_mode":"speech","fixture":false,
 "stt":{"request_id":"…","model":"saaras:v4","mode":"codemix","language_code":"hi-IN","ms":1410,"keyterms":31,
        "audio":{"type":"audio/webm","ms":3900,"bytes":61440}},
 "llm":{"model":"sarvam-105b","prompt_version":"v3","attempts":[{"request_id":"…","ms":1880,"reasoning_tokens":0}]},
 "checks":[{"action":0,"field":"amount_inr","phrase":"चालीस हज़ार","model":40000,"code":40000,"result":"match"},
           {"action":0,"field":"payment_id","resolved":"PAY-01","why":"the caterer's only advance"}],
 "flags":{"voice_pilot":true,"voice_writes_enabled":true,"spoken_replies":true,"env_label":"production","fallback":false},
 "confirm":{"via":"phrase","at":"2026-11-25T15:12:04+05:30","edits":[]},
 "results":[{"index":0,"outcome":"applied","idempotency_key":"a41f…:0","entity_ref":"PAY-01","version":2}],
 "reply":{"parts":1,"speaker":"simran_enhi_customer","first_byte_ms":640}}
```

---

## 9. What Lane A adds to `voice_turns`

domain 5.1's columns stay as they are. Session C asks for these, all written only by Lane C's voice routes, outside the dispatcher. Writing a voice turn never moves `weddings.version`.

| Column | Type | Null | Notes |
|---|---|---|---|
| `client_turn_id` | uuid | no | From the dock (1.4). Unique together with `user_id`, so a repeated request replays |
| `input_mode` | text | no | `speech`, `typed`, `tap` or `fixture` (0.2) |
| `speech_language` | text | yes | `hi-IN` or `en-IN`, as sent to Saaras |
| `reply_language` | text | yes | The register: `en`, `hinglish` or `hi` (1.6) |
| `reply_speech` | jsonb | yes | The latest reply's speech parts, language code and voice (1.14). The reply-audio route reads only this |
| `ref_map` | jsonb | no | Snapshot reference to UUID for this turn (1.9), so the confirm uses the preview's mapping |
| `options` | jsonb | yes | A question's options, and the value each stands for (6.2) |
| `trace` | jsonb | no | For the judge panel: request ids, attempts, `reasoning_tokens`, the raw tool arguments, the checks, the resolutions, the keyterm count, the audio facts (type, length, bytes; never the audio), `prompt_version`, and the error code of 6.1 |
| `timings_ms` | jsonb | no | The server's and the dock's timings (1.16) |
| `fixture_id` | text | yes | The test row, in fixture mode |

- **`actions`** (domain) also holds a question's partial actions, so a follow-up turn or an option can complete them (1.11, 6.2).
- **`confirmed_at`** is written as soon as the confirm passes 1.13's checks 1 to 6, before the first action runs. So a partly saved turn has it, which flagsmith 4.3's third count relies on.
- **`failed`** is used only for 6.1 rows 8 to 12 and row 26, where speech to text, the model or the server failed. Empty speech and questions are `answered`, and command errors leave the turn `proposed`. So flagsmith 4.3's failed-turn count measures real failures.
- **Indexes:** (`user_id`, `client_turn_id`), unique; (`user_id`, `wedding_id`, created time), to find the speaker's latest and open turns.
- **No audio column, ever** (AT-2.13).
- **Before Lane A's 10:45 merge** (decision D96). Lane A pushes `lane-a-schema` (`src/db/schema.ts` and the first migration, with these columns) as a draft PR by 10:20. Lane C merges `origin/lane-a-schema` into `lane-c-voice` with a merge commit (architecture 6.3) and writes `voice_turns` through it; before 10:20 it builds on fixtures. If `lane-a-schema` isn't pushed by 10:25, Lane C's 10:45 PR keeps these writes behind its own small store interface with an in-memory fake, and the real write moves to 11:40.
- **The speaker** comes from `src/server/auth/session.ts` [A]. The contracts PR ships it as a stub with its final signature, returning the fixture member, and Lane A replaces the body in `lane-a-dispatcher` (decision D96).

---

## 10. Changes other specs need

**domain-and-data.md**
1. V3, 3.8 and section 7 step 9: the early refusal at `/api/voice/turn`. With the switch off, a turn holding a write is stored `paused` with a 200 refusal and the prefill; the 423 at confirm stays the authoritative check. flagsmith 10.1 item 2 asks the same.
2. The `voice_unavailable` row names the flag `voice_mode`; it is `voice_pilot` (flagsmith 10.1 item 1).
3. 3.8:
   - the turn route also takes `text`, `option`, `client_turn_id`, `speech_language`, `duration_ms`, `attached_asset_id`, `page`, `setup_opened_at` and `fixture_id` (1.4), and answers with an NDJSON stream (1.5);
   - voice adds the reply-audio and trace routes (1.17);
   - a confirm of a closed turn answers 410 `voice_turn_expired` with "This request is closed.";
   - the phrase lists gain 1.8's equivalents, and a confirm phrase can answer a question's `default` option (1.8, 6.2).
4. 3.9: the action helper `heard`, the top-level `reply_language`, and the query parameters of 2.4. `previous_inr` counts only when it was heard (2.2).
5. 5.1, `voice_turns`: section 9's columns.
6. 4.9: the reply templates live in this file's section 4, and the second, model-written answer is off for today (4.1).
7. 3.0: `not_shared` is a voice refusal code stored in `refusal_code`, not an HTTP error (0.2).
8. 3.8: `error.prefill` is a list of `{command, input, labels}`, one entry per action, and the example changes to match (decision D121; 1.13).
9. V10: drop "The reply-audio route counts against the same user" (decision D121; 1.14).
10. §4: every read-model row carries `seed_key`, null for live rows (decision D99; 1.9).

**architecture.md**
- Nothing outstanding in its 04:48 revision. 2.2 and 4.1 list the reply-audio route (`?part={n}`, 30 s) and the trace route (10 s), and there is no `/api/voice/state`. The fixture files sit in `src/server/voice/fixtures/`, inside a folder Lane C already owns.
- One note for `src/contracts/routes.ts` (4.3): a vendor page is addressed as `/w/{wedding_id}/vendors?vendor_id={uuid}`, since 4.1 allows no `[vendor_id]` segment (decision D18). Voice builds `navigate.path` and reads `page` only through the URL builders. `routes.ts` also exports the `highlight` query parameter that `navigate.path` and answer-card links carry (decision D121; 1.13, 4.7).

**acceptance.md**
1. AT-2.10: add the model failures' copy (6.1 rows 10 and 11).
2. AT-6.4's M-06 and M-08 replies, and AT-12.2's R-01 reply, change as in 4.10: ₹ figures in place of "pachaas hazaar" and "sava lakh" (M7), and "It doesn't change what you owe the caterer." in place of a cost claim no record holds.
3. AT-13.2's SH-02 reply uses the giver names as stored (7.3).

**voice-test-set.md** (applied at 05:55)
1. The earlier names, as in 0.3.
2. The expected replies of M-06, M-08, R-01 and SH-02, as in 4.10 and 7.3.
3. G-03 to G-07 don't apply while guest voice isn't built, and the accuracy bar counts only the rows that apply (7.3).
4. E-07 is spoken from the overview (4.5).

**design-direction.md** (applied at 05:55)
- Its number-formatting rule ("In sentences and speech use lakh and crore words ('₹12 lakh', 'डेढ़ लाख')") is superseded by domain M7: sentences on screen show ₹ figures, and speech uses code-built words without डेढ़, ढाई, सवा, साढ़े or पौने (3.5).

**demo-script.md**
1. #2: the card's "heard" may show digits ("heard '40000'") when Saaras writes digits (3.1). The narration still holds.
2. §6 Q1: open the judge panel (section 8) on the turn just spoken.

**flagsmith.md**
- 4.3's turn gate: `failed` means only what section 9 says. Every voice turn counts toward the 20, whatever its `input_mode` (decision D94). Applied at 05:55.

**doc-ai.md** (both applied at 05:55)
- 1.6: voice keeps no `extract_invite` kind (0.3). If the sheet speaks its reply, it uses the Bulbul client in `src/server/voice/` and 1.14's rules, `spoken_replies` included.
- 1.6: the sheet opens from the paperclip's "Printed card" choice (7.3 I-03), not from the spoken sentence. "No photo attached: the reply asks for one" becomes 2.3's generic reply, because the model has no kind to recognise the request.

---

## 11. Open questions

Each has a default that holds until someone decides otherwise.

1. **Closed: "sakte hain"** (decision D93). R-03's line uses the respectful "sakte hain", which fits any speaker, Kabir or a judge included. One line for everyone.
2. **The early refusal** contradicts domain V3 as written. Default: this file and flagsmith 3.2. Domain's owner applies section 10.
3. **`hi-IN` for English speakers.** V-T1 at about 09:14 decides whether `hi-IN` stays the only default (1.6, 1.16).
4. **Devanagari keyterms.** V-T2 decides whether vendor and venue names get Devanagari twins.
5. **iPhone and Android formats.** V-T3 decides whether WAV is on from the start for a browser (1.3).
6. **The forced tool with reasoning off.** T4 and V-T4 decide between `tools` and the `json_schema` fallback, and whether the temperature drops to 0 (1.10).
7. **The two Bulbul voices,** and whether the Hinglish speech text (Hindi words in Devanagari, English in Latin, 1.14) sounds right in the `hi-IN` voice. L plays the audition at about 09:14 and the user picks by 10:30; with no pick, 1.14's defaults stand (decision D78).
8. **The thresholds of 6.2:** the filler list, the ₹100 rule and the noise rule. Tune them after the first full run of the test set.
9. **Page context for questions** (4.5). Default: on, for questions only. Drop it if rehearsals show it surprising people.
10. **English requirement text** (2.6). Default: short English, so that domain's duplicate rule works; Hindi replies repeat the heard words.
11. **The one-tap card export** (domain OQ11). Default: one tap, like every voice write.
12. **Guest voice** (domain OQ7). Default: not built; G-03 to G-07 don't apply.
13. **M-12's approver.** Default: the reply names the wedding's first owner ("Mira"). With two owners it could say "Mira or Kabir".
14. **The model-written answer** (domain 4.9, RS 3.4). Default: off; every answer is a template (4.1).
15. **At most 4 actions in a turn** (1.11). Default: 4; no test row needs more than 2.
16. **The added confirm and cancel phrases** (1.8). Default: in. Domain's owner accepts them under section 10.
17. **Options on questions** (6.2) are new: they need room in the panel (Lane B) and the `option` turn field (1.4). Default: built, since they make M-05, E-07 and 5.2's questions one tap.
18. **Prefilled forms beyond `add_requirement`** (6.3). Default: Should, for Lane B after the demo path works.
19. **Client timings of a turn that has no follow-up request** are lost (1.16). Default: accepted; rehearsal logging uses "Copy summary".
20. **Closed: the rollout gate counts every voice turn** (flagsmith 4.3; decision D94), not only `speech` turns.
21. **Closed: the vendor page's query name is `vendor_id`** (1.4, 1.13; decision D18): `/w/{wedding_id}/vendors?vendor_id={uuid}`, built only through `src/contracts/routes.ts`.
22. **Closed: the paperclip's two choices** (7.3 I-03): "Couple photo" everywhere and, on setup only, "Printed card". doc-ai 1.6 adopted it at 05:55.

**Domain open questions closed the voice.md way.** Domain open question 20: an unknown venue in a voice `create_event` or `update_event` gets the "New venue" card of 2.5 (decision D88). Domain open question 21: a spoken confirm phrase works for multi-action turns (1.8), and the snapshot stays role-filtered as in 1.9, with member and guest text treated as data (decision D89).

---

## 12. Consistency pass (05:05)

Checked against architecture 2.2, 2.4, 3, 4.1, 4.2, 5 and 8, flagsmith 3, 5.3–5.5, 6.5–6.9 and 10, and doc-ai 1.6. Section numbers and row ids are unchanged. One line per change:

1. 1.17: the reply-audio and trace paths use `{voice_turn_id}`, not `{id}`.
2. 1.17: the folder names are stated, with the segment `[voice_turn_id]` only (architecture 4.1).
3. 1.17: the answer codes now include 401 and 403 on every route, and 403 is defined as `forbidden` or `voice_unavailable`.
4. 1.4: the `page` example is `/w/{wedding_id}/vendors?vendor_id={uuid}`. It was `/w/{id}/vendors/{vendor_id}`, a segment that architecture 4.1 doesn't allow.
5. 1.13: the confirm example's `navigate.path` uses the same query form.
6. 1.5: the NDJSON stream is stated to be the one response body. Nothing is pushed, and there is no Realtime, WebSocket or SSE.
7. 1.12: the poll sentence now cites architecture 2.4, not 2.3. It names the version endpoint and the focus refresh, and says a voice turn never moves `version`.
8. 1.13: a new bullet, "How screens catch up". The dock navigates or calls `router.refresh()` after a confirm, other screens catch up through the 2.5 s version poll, and guests through the 10 s revision poll.
9. 1.13: cancel now applies checks 1 to 4, so `voice_pilot` off gives 403 `voice_unavailable` (flagsmith 3.1: every `/api/voice/*` route).
10. 1.14: reply-audio lists its checks: session, own turn, and `voice_pilot` before `spoken_replies`.
11. Section 8: trace also answers 403 `voice_unavailable` when `voice_pilot` is off.
12. 1.15: `voice_pilot` is read by the setup screen and by all five voice routes.
13. 1.15: `voice_writes_enabled` adds the setup screen's entry decision (flagsmith 3.4 rows 4 and 5). Its "never read by" list matches flagsmith 3.2.
14. 1.15: `/setup` has no focus refresh, so a flip shows there on the next navigation or voice response (flagsmith 6.9).
15. 1.15: no flags in the browser (flagsmith 6.9).
16. 1.15: voice never records an exposure, and never branches on the setup variant it stores. The conversion comes from the dispatcher's setup-saved hook for voice and form alike (flagsmith 5.3, 5.4).
17. 0.3 and 7.3 I-03: the card reader opens from the paperclip's "Printed card" choice, on setup only, gated by `image_extraction_provider` from the setup render. The photo goes only to `/api/card-imports` (doc-ai 1.6, 3.1).
18. Section 10: requests added for doc-ai 1.6 (the paperclip, `spoken_replies`) and for `src/contracts/routes.ts` (the vendor query name).
19. Section 11: open questions 21 and 22 added.
20. Checked and left unchanged:
    - env names (`SARVAM_API_KEY`, `VOICE_FIXTURE_MODE`);
    - every flag name, the kill switch failing closed, the R-03 line and the dock fields;
    - the `maxDuration` values;
    - every JSON block, each a payload of at most 15 lines. No code block needed rewriting.

---

## 13. Decisions pass (05:55)

Applied from decisions.md rounds 1 to 3 and the 05:05 follow-ups. Section numbers and row ids are unchanged. One line per change:

1. Header, 2.6 `publish_itinerary` and 7.1 #6: `PublishSheet` is Lane D's, with a confirm callback; Lane C's E-05 and I-02 integrations ship at 12:30 (D19, D59).
2. 0.2, 4.9, 4.10 and 7.1 #8: R-03 reads "sakte hain" (D93).
3. 0.2, 1.10, 1.14, 1.16 and section 11: the morning checks run at about 09:14 (L), and the user picks the voices by 10:30 (D7, D78). V-T3 and V-T4 run in Lane C's worktree.
4. 1.8, 1.11 step 2, 2.3 and 2.6: `publish_itinerary` stands alone in its turn (domain V11).
5. 1.11 step 2 and 2.6 `add_guest`: a manager's limits, refused with `forbidden` (domain 3.4).
6. 1.11 step 2: a manager's money command goes as `propose_change` only with `managers_can_see_vendor_dues`; otherwise `not_shared` (domain 3.5).
7. 1.15: the contracts stub fails closed, and the kill-switch checks run at 11:15 and after 12:30 (D47).
8. 6.3: the typed prefill store ships by 11:40, with one consumer contract for the early refusal and the 423 (D61).
9. 7.3: the accuracy bar is "at most three of the rows that apply may fail" (D82); SH rows follow D65.
10. 7.4: who runs the full set, and when (D29, D49).
11. 1.8, 1.9, 2.5 and section 11: domain open questions 20 and 21 closed the voice.md way (D88, D89); voice open questions 1, 20, 21 and 22 closed (D93, D94, D18).
12. 1.13: the guest page updates within about 12 s (D92). 1.15: `/setup` is D37's one exception (D79).
13. 1.4, 2.8, section 6's rules and 6.3: "the speak bar" is now "the dock's text field", beside the header mic (D20).

---

## 14. Round 4 pass (06:15)

Applied from decisions.md round 4 (D95–D122). Section numbers and row ids are unchanged. One line per change:

1. Header, 0.2, 1.15 and 7.3 I-03: VoiceDock's props are `wedding_id` (null on `/setup`), plus `setup_opened_at` and `show_printed_card` from the setup screen; the contracts stub declares them (D97).
2. 1.5, 1.13 and 6.3: the prefill is always a list of `{command, input, labels}`, and the confirm route rebuilds it from the stored turn before a 423 (D121).
3. 1.5, 1.13, 4.7 and section 10: highlights ride in the URL as `routes.ts`'s `highlight` parameter, and the confirm example changes to match (D121).
4. 1.9: every read-model row carries `seed_key` (D99).
5. 1.14: reply-audio has no rate limit of its own (D121).
6. 1.15: both chips sit beside the header mic (D20, D121). The kill-switch check is FV7 (D113); its first stage moves to after the 11:40 deploy if the pipeline splits (D121), and its typed save may be an Events edit (D114).
7. 1.16: V-T4 runs at about 10:25 through the `text` input, and V-T3 before 10:40 or by 11:30 (D112).
8. 5.5 and 6.3: Undo and the prefilled forms' saves go through `dispatchCommand` (D98).
9. 7.2: I-01 by voice is Lane C's 13:45 item (D121).
10. 7.4: the 12:45 run can overlap the smoke test (D111), and resets follow D17 and D120.
11. Section 8: `lane-c-judge-panel` is a gated 13:45 Should (D106).
12. Section 9: `lane-a-schema` arrives as a draft PR by 10:20, with a fake store as the fallback, and the session helper is a contracts stub (D96).
