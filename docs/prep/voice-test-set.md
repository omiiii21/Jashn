# Jashn voice test set

Prep note written at about 02:30 IST on 25 Nov 2026, before coding starts. Every name, number and ID comes from `demo-data.md`, which wins if the two disagree. The set has 47 utterances across all modules, in English (EN), Hinglish in Roman script (HI-Latn) and Hindi in Devanagari (HI-Deva). The last two sections give the pass criteria and the 8 live-demo utterances in order.

**Updated about 05:55** for decisions D49 (who runs the set), D82 (the pass rule) and D93 ("sakte hain"), and for voice.md section 10: its names, the M-04, M-06, M-08, R-01 and SH-02 replies, E-07 from the Overview, and the mixed-script C-01 and C-02 forms. voice.md wins on names and reply wording; demo-data.md wins on values. **Updated again about 06:15** for round 4: D112 (Lane C's V-T3 and V-T4), D111 (the 12:45 run beside the smoke test), D50 and D121 (no test-set run after the freeze), D120 (resets and fresh owners) and D59 (Lane D's PublishSheet).

## How to run it

- **Run on the rehearsal copy, never on the demo copy.** Many rows change data. Reset to the stated starting state before each row, or chain rows only where the table says "after X".
- Speak each line on the stage headset, in the hall, at normal speed. At least two fluent Hindi speakers run the full set, and one of them should be from outside the team.
- **Who and where** (decision D49). By 11:30 the user books two fluent Hindi speakers (one from outside the team), a separate device and a rehearsal copy. The teammate or a booked speaker runs each full run, independent of the presenter and the 13:00–13:30 NudgeBee recording. Lane C provides the resets, the timings and the results log. Bank one real Sarvam correction with audible playback as soon as one succeeds. The 12:45 run keeps these people, so it can overlap the two-device smoke test at about 12:35–12:55 (decision D111). Lane C runs `reset_demo` only on a rehearsal copy it owns, as that copy's owner; L resets any other copy, and the demo and e2e copies stay L's (decisions D17 and D120).
- **Full runs of the set are at 12:45 and 14:00** (PLAN; decision D29). No full run follows the 14:45 freeze: take 1 is recorded right after the freeze smoke test and doubles as the first stopwatch rehearsal (decisions D50 and D121).
- **Lane C's two checks come first** (decision D112; voice.md 1.16). V-T4 types the 8 live lines into the turn route's `text` input, 3 runs each, as soon as the route answers (about 10:25) and before `lane-c-voice` is marked ready. V-T3 records M-03 on the iPhone and the Android phone through Lane C's tunnel: before 10:40 if the route records by then, otherwise by 11:30 at the latest, with the WAV fallback off until then.
- Record per row: the raw transcript, the structured action, the preview text, pass/fail, and two timings: speech end → preview, and confirm → start of the spoken reply.
- **A row passes on the action, not on the transcript's spelling.** Saaras `codemix` returns mixed script and often turns numbers into digits. "Caterer ko chaalis hazaar advance diya tha" may arrive as "Caterer को 40000 advance दिया था". The preview must show the original words beside the ₹ amount.
- Suggested STT keyterms: Mehendi, Haldi, Sangeet, Shagun, lakh, hazaar, advance, caterer, Annapoorna, Lotus Hall, Banyan Hall, Garden Hall, Mallige Gardens, Mira, Kabir, Diya, Tara, Sharma.

### Starting states

| State | Meaning |
|---|---|
| T0 | Empty owner account (Mira), with no wedding yet: a fresh internal owner signed up as `setup-c-<HHMM>@example.com` (decision D120), so setup opens voice-first with the mic (flagsmith 3.4 row 4) |
| T1 | After setup: wedding saved for Mira & Kabir, Mon 14 Dec 2026, Bengaluru, ₹12,00,000, 250 expected. No events. The invite is in the Peacock & Gold alternative theme if it was built, otherwise in the default theme with no photo. |
| S0 | Populated wedding before the caterer is recorded (video pre-state, demo-data §7.3) |
| D0 | Live-demo start: caterer ₹2,00,000 / ₹50,000 paid / ₹1,50,000 outstanding; reception 229/9/12 of 250; Banyan Hall published |
| D1 to D5 | The states after each live step (demo-data §9.3) |

### Action vocabulary

**Intent** is one of `act` (propose a change), `ask` (a read-only question) or `clarify` (something is missing or ambiguous, so ask and write nothing).

**Write kinds:** `set_wedding_profile`, `create_event`, `update_event`, `publish_schedule`, `set_rsvp`, `set_dietary`, `record_commitment`, `update_commitment`, `record_payment`, `correct_payment`, `propose_expense`, `add_requirement`, `update_invite_style`, `export_card`, `extract_invite`, `record_shagun`, `confirm`, `cancel`.

**Read kinds:** `query_balance`, `query_budget`, `query_rsvp`, `query_event`, `query_changes`, `query_catering`, `query_shagun`.

**These names predate the specs.** The binding names are voice.md's (its 0.3 maps every earlier name): `publish_schedule` is `publish_itinerary`; `export_card` is `request_card_export` with `format` `png` and no revision; `propose_expense` is a manager's `record_payment` sent by the server as `propose_change`; `extract_invite` is not a kind (the paperclip's "Printed card" choice on setup, doc-ai 1.6); `confirm` and `cancel` are phrases matched in code; field names such as `rate_inr`, `covers`, `palette` and `count` are `unit_price_inr`, `quantity`, `theme` and `quantity`. A row passes on the action under its voice.md name.

The model only proposes. Code resolves IDs against the saved wedding, does all arithmetic, and writes only through the same server functions the forms use. **Refused** means the server rejects the request for that role or flag: 403, or a refused voice write. A model's reply alone does not count as a refusal.

"Confirm" means a preview card appears and nothing is written until the person confirms, by tapping or by saying a confirmation phrase (C-01). Read-only questions need no confirmation. Publishing, money changes and destructive edits always do.

## A. Wedding setup

| ID | Who · lang · start | Utterance | Expected action (intent · kind {fields}) | Confirm | Expected state change | Expected spoken reply |
|---|---|---|---|---|---|---|
| S-01 | Mira · EN · T0 | "Our wedding is on 14 December in Bengaluru. Budget is twelve lakh, roughly 250 guests." | act · set_wedding_profile {date_text: "14 December", wedding_date: **null**, city: "Bengaluru", budget_inr: 1200000, expected_guests: 250}; missing: [year, couple names] | Review card; saved as a **draft** only | Draft wedding with city, budget and guests; year and names empty and highlighted | "Got it: 14 December in Bengaluru, twelve lakh, about 250 guests. Which year is it, and what are the couple's names?" |
| S-02 | Mira · HI-Latn · after S-01 | "Saal 2026 hai. Dulhan Mira hai aur dulha Kabir." | act · set_wedding_profile {wedding_date: 2026-12-14, bride_name: "Mira", groom_name: "Kabir"}; missing: [] | Yes | Wedding saved (T1) and reopens after a refresh | "Mira aur Kabir ki shaadi, 14 December 2026, Bengaluru. Save ho gayi." |
| S-03 | Mira · HI-Latn · T0 | "Shaadi Bengaluru mein hai, December mein. Budget baarah lakh hai." | act · set_wedding_profile {city: "Bengaluru", month: 12, budget_inr: 1200000}; missing: [day, year, couple names] | Review card; draft only | Draft with city, month and ₹12,00,000; day, year and names empty | "Baarah lakh note kar liya. December mein kaunsi tareekh, kaunsa saal, aur dulha-dulhan ke naam?" |

## B. Events and itinerary

| ID | Who · lang · start | Utterance | Expected action | Confirm | Expected state change | Expected spoken reply |
|---|---|---|---|---|---|---|
| E-01 | Mira · EN · T1 | "Add the sangeet on the thirteenth at seven in the evening, at Garden Hall." | act · create_event {kind: sangeet, date: 2026-12-13 (resolved from the wedding month, shown in the preview), start: 19:00, tz: Asia/Kolkata, venue: "Garden Hall"} | Yes | New sangeet in the **draft** schedule; guests see it only after publishing | "Sangeet added for Sunday 13 December at 7 PM, Garden Hall." |
| E-02 | Mira · HI-Latn · T1 | "Sangeet terah tareekh ko shaam saat baje Garden Hall mein rakho." | Same as E-01: date 2026-12-13, start 19:00, venue "Garden Hall" | Yes | Same as E-01 | "Sangeet 13 December, shaam saat baje, Garden Hall mein add ho gaya." |
| E-03 | Mira · HI-Deva · D0 | "मेहंदी शाम साढ़े पाँच बजे तक ख़त्म कर दो।" | act · update_event {event: EVT-MEH, end: 17:30 (was 19:30)} | Yes | Draft mehendi ends 17:30; **the mehendi–sangeet conflict warning disappears**; guests still see 19:30 until a publish | "मेहंदी अब शाम साढ़े पाँच बजे ख़त्म होगी। संगीत से टकराव हट गया।" |
| E-04 | **Diya** (phone) · HI-Latn · D1 | "Reception Lotus Hall mein shift kar do." | act · update_event {event: EVT-REC, venue: "Lotus Hall, Mallige Gardens" (was Banyan Hall)} | Yes (Diya taps Save draft) | D2: draft venue Lotus Hall; guests still see Banyan Hall; ACT-07 "Diya moved the reception from Banyan Hall to Lotus Hall" | "Draft mein reception ab Lotus Hall mein hai. Guests ko publish ke baad dikhega." |
| E-05 | Mira · HI-Latn · D2 | "Schedule publish kar do." | act · publish_schedule {revision: 3, changes: [EVT-REC venue Banyan Hall → Lotus Hall]} | Yes (Lane D's PublishSheet lists the change; Mira taps Publish, decision D59) | D3: REV-3 published; the REV-2 card is marked stale; ACT-08 | "Schedule publish ho gaya. Guests ko ab Lotus Hall dikhega." |
| E-06 | **Diya** · HI-Latn · D2 | "Schedule publish kar do." | act · publish_schedule → **refused** (the manager role cannot publish; the server returns 403) | – | None; Diya's draft stays | "Publish sirf Mira ya Kabir kar sakte hain. Aapka badlav draft mein safe hai." |
| E-07 | Mira · HI-Latn · D0, spoken from the Overview (voice.md 4.5) | "Venue kya hai?" | clarify · query_event {event: null}; missing: [function], because five functions have three different venues | No write | None | "Kis function ka venue? Mehendi, haldi, sangeet, shaadi ya reception?" |
| E-08 | Mira · HI-Latn · D0 | "Haldi kal subah rakhte hain." | clarify · update_event {event: EVT-HAL, date: ambiguous}. "Kal" can mean yesterday or tomorrow, and tomorrow (26 Nov) is weeks before the wedding. | No write | None | "Kal matlab 26 November? Haldi abhi 13 December subah hai. Kaunsi tareekh rakhun?" |

## C. Guests and RSVP

| ID | Who · lang · start | Utterance | Expected action | Confirm | Expected state change | Expected spoken reply |
|---|---|---|---|---|---|---|
| G-01 | Mira · EN · D0 | "Who's attending the reception?" | ask · query_rsvp {event: EVT-REC} | No | None; opens Guests filtered to the reception (32 named plus "197 imported") | "229 of 250 have confirmed for the reception. 9 declined and 12 haven't replied yet." |
| G-02 | Mira · HI-Latn · D0 | "Nikhil aur Prachi Jain reception mein aa rahe hain." | act · set_rsvp {guests: [Nikhil Jain, Prachi Jain], event: EVT-REC, status: attending, source: owner_on_behalf} | Yes | Reception 229 → **231** attending, 12 → 10 pending. Their wedding RSVP stays pending. Rehearsal copy only. | "Nikhil aur Prachi reception ke liye confirm ho gaye. Ab 231 log aa rahe hain." |
| G-03 | **Tara** (guest link) · EN · D3 · *only if guest voice ships* | "I'll be there for the reception." | act · set_rsvp {guest: Tara Bhat, **taken from the link token, not from speech**, event: EVT-REC, status: attending} | Yes (the Attending button) | D4: 230 / 9 / 11; estimate ₹1,84,000; the sangeet is unchanged | "Thank you, Tara. You're confirmed for the reception on 14 December at Lotus Hall." |
| G-04 | **Tara** · HI-Latn · D4 | "Caterer ko kitne paise diye hain?" | ask · query_balance → **refused**: the guest scope has no money tools, and any money read with a guest token returns 401 (decision D35) | – | None (the refusal is logged) | "Main sirf aapke invitation aur RSVP mein madad kar sakti hoon." |
| G-05 | **Tara** · EN · D4 | "What's the total wedding budget?" | ask · query_budget → **refused** | – | None | "Sorry, I can only help with your invitation and RSVP." |
| G-06 | **Tara** · HI-Deva · D4 | "मेहंदी कब है?" | ask · query_event {event: EVT-MEH} → **not invited**. It must not reveal the mehendi's date, time or venue. | – | None | "आपका निमंत्रण संगीत और रिसेप्शन के लिए है। रिसेप्शन 14 दिसंबर को शाम साढ़े सात बजे, Lotus Hall में है।" |
| G-07 | **Tara** · HI-Latn · D4 | "Mujhe mushroom se allergy hai." | act · set_dietary {guest: Tara Bhat, note: "Mushroom allergy"} (a permitted guest field) | Yes | Tara's dietary note is saved and visible to Mira and Diya | "Note kar liya: mushroom se allergy." |

## D. Money ledger

| ID | Who · lang · start | Utterance | Expected action | Confirm | Expected state change | Expected spoken reply |
|---|---|---|---|---|---|---|
| M-01 | Mira · EN · S0 | "The caterer is charging eight hundred per person for 250 people. I paid a fifty-thousand advance." | act · record_commitment {vendor: VEN-CAT, rate_inr: 800, covers: 250, amount_inr: 200000 **computed in code**, basis: fixed_minimum} **and** record_payment {vendor: VEN-CAT, amount_inr: 50000, type: advance, paid_on: **null** (not stated; recorded_at = now)} | Yes, on one card showing both | S0 → D0: COM-01 ₹2,00,000, PAY-01 ₹50,000; caterer outstanding ₹1,50,000; wedding outstanding ₹3,80,000 → ₹5,30,000 | "Saved a ₹2,00,000 catering commitment and a ₹50,000 advance. ₹1,50,000 is outstanding." |
| M-02 | Mira · EN · after M-01 | "Actually, that advance was forty thousand." | act · **correct_payment** {payment: PAY-01, amount_inr: 40000, previous_inr: 50000} | Yes | D1: PAY-01 version 2 = ₹40,000, **still one caterer payment**; caterer ₹1,60,000; wedding paid ₹3,87,000, outstanding ₹5,40,000 | "Corrected the caterer's advance to ₹40,000. ₹1,60,000 is outstanding." |
| M-03 | Mira · HI-Latn · D0 · **LIVE #2** | "Caterer ko chaalis hazaar advance diya tha." | act · **correct_payment** {payment: PAY-01 (the caterer's only advance), amount_inr: 40000, previous_inr: 50000}. Preview: "Correction, not a new payment: ₹50,000 → ₹40,000." | Yes (C-01) | D1, as in M-02, plus ACT-06 | After confirming: "एक लाख साठ हज़ार रुपये बाकी हैं।" |
| M-04 | Mira · HI-Deva · D0, previous turn about the caterer | "नहीं, पचास नहीं, चालीस हज़ार दिए थे।" | act · **correct_payment** {payment: PAY-01, resolved from the conversation context, amount_inr: 40000, previous_inr: 50000}. With no prior turn naming a vendor, it behaves like M-05. | Yes | D1 | "एक लाख साठ हज़ार रुपये बाकी हैं।" (voice.md 4.10 drops "ठीक कर दिया।" so both Hindi registers share the correction reply) |
| M-05 | Mira · HI-Latn · D0, fresh conversation | "Advance chaalis hazaar tha." | clarify · correct_payment {payment: **null**, amount_inr: 40000}; missing: [vendor], because six vendors have advances | No write | None | "Kis vendor ka advance? Caterer, venue, decorator, photographer, mehendi artist ya DJ?" |
| M-06 | Mira · HI-Latn · D0 | "Decorator ko pachaas hazaar aur de diye." | act · record_payment {vendor: VEN-DEC, amount_inr: 50000, type: installment}. "Aur" means an **additional** payment, not a correction. | Yes | New PAY-07; decorator ₹1,00,000 → ₹50,000; wedding paid ₹3,97,000 → ₹4,47,000, outstanding ₹5,30,000 → ₹4,80,000 | "Decorator ko ₹50,000 ka payment save hua. Ab ₹50,000 baaki hai." |
| M-07 | Mira · HI-Latn · D1 | "Caterer ko dedh lakh de diye." | act · record_payment {vendor: VEN-CAT, amount_inr: 150000, type: installment}. The preview shows "dedh lakh = ₹1,50,000". | Yes | New PAY-08; caterer ₹1,60,000 → **₹10,000**; wedding outstanding ₹5,40,000 → ₹3,90,000 | "Caterer ko ₹1,50,000 ka payment save hua. Ab sirf ₹10,000 baaki hai." |
| M-08 | Mira · HI-Latn · D0 | "Photographer ka total sava lakh ho gaya hai." | act · update_commitment {commitment: COM-04, amount_inr: 125000, previous_inr: 110000} | Yes (a contract change; history kept) | COM-04 version 2 = ₹1,25,000; photographer ₹80,000 → ₹95,000; committed ₹9,27,000 → ₹9,42,000; Photography is **₹5,000 over** its ₹1,20,000 budget | "Photographer ka contract ₹1,25,000 ho gaya. ₹95,000 baaki hai, aur photography budget se ₹5,000 upar hai." |
| M-09 | Mira · HI-Latn · D0 | "Venue ka ₹1.5L baaki hai na?" | ask · query_balance {vendor: VEN-VEN, user_claim_inr: 150000}. It must **not agree** with the wrong premise. | No | None | "Nahi, venue ka ₹1,40,000 baaki hai. ₹2,80,000 mein se ₹1,40,000 diye ja chuke hain." |
| M-10 | Mira · EN · D3 | "What changed today, and how much do we still owe?" | ask · query_changes {date: 2026-11-25} + query_balance {scope: wedding} | No | None; shows links to ACT-04 to ACT-08 and to Money | "Diya made three changes today, including moving the reception to Lotus Hall, which is now published. You still owe ₹5,40,000, including ₹1,60,000 to the caterer." |
| M-11 | Mira · HI-Deva · D1 | "कुल कितना बाकी है?" | ask · query_balance {scope: wedding} | No | None | "कुल पाँच लाख चालीस हज़ार रुपये बाकी हैं।" |
| M-12 | **Diya** · HI-Latn · D0 | "Decorator ko bees hazaar de diye." | act · **propose_expense** {kind: payment, vendor: VEN-DEC, amount_inr: 20000}. A manager cannot record payments. | Yes (it sends a proposal) | PRP-02 awaits Mira; **the ledger is unchanged** | "Yeh ₹20,000 ka payment Mira ki approval ke liye bhej diya. Ledger abhi nahi badla." |
| M-13 | Mira · HI-Latn · D0 | "Mehendi artist ko advance de diya." | clarify · record_payment {vendor: VEN-MEH, amount_inr: **null**}; missing: [amount]. Note that a ₹5,000 advance already exists. | No write | None | "Kitna diya? ₹5,000 ka advance pehle se likha hai. Kya yeh naya payment hai?" |
| M-14 | **Diya** · EN · D0 | "What's our total budget, and how much shagun came in?" | ask · query_budget + query_shagun → **refused**: neither is shared with the manager (server 403) | – | None | "The budget and the Shagun register haven't been shared with you. I can help with vendor dues." |

## E. Vendors and catering

| ID | Who · lang · start | Utterance | Expected action | Confirm | Expected state change | Expected spoken reply |
|---|---|---|---|---|---|---|
| V-01 | Mira · HI-Latn · D4 | "Caterer ka estimate kitna hai?" | ask · query_catering {vendor: VEN-CAT} → confirmed 230 × ₹800 alongside the fixed contract | No | None | "Confirmed guests ke hisaab se estimate ₹1,84,000 hai. Contract fixed ₹2,00,000 ka hi hai." |

## F. Requirements

| ID | Who · lang · start | Utterance | Expected action | Confirm | Expected state change | Expected spoken reply |
|---|---|---|---|---|---|---|
| R-01 | Mira · EN · D0 | "Add Jain food for twelve guests at the reception." | act · add_requirement {event: EVT-REC, category: catering, text: "Jain food", count: 12, vendor: VEN-CAT}. Cost check: Jain plates are quoted at the same ₹800. | Yes | REQ-10 saved; **ledger unchanged**; visible to Diya | "Added Jain food for 12 at the reception. It doesn't change what you owe the caterer." |
| R-02 | Mira · HI-Deva · D0 | "रिसेप्शन में बारह लोगों के लिए जैन खाना चाहिए।" | Same as R-01. If R-01 already ran, it must detect the duplicate and ask instead. | Yes | REQ-10 (or no change, for a duplicate) | "रिसेप्शन में बारह लोगों के लिए जैन खाना जोड़ दिया।" |
| R-03 | Mira · HI-Latn · D4 with `voice_writes_enabled = false` · **LIVE #8** | "Reception mein barah logon ke liye Jain khana add karo." | act · add_requirement {event: EVT-REC, text: "Jain food", count: 12} → **refused by the server** (kill switch) | – | Nothing written by voice; the refusal is logged. Mira then types it: REQ-10 and ACT-10 (D5). | "Abhi voice se badlav band hain. Aap type karke save kar sakte hain." |

## G. Invitation studio

| ID | Who · lang · start | Utterance | Expected action | Confirm | Expected state change | Expected spoken reply |
|---|---|---|---|---|---|---|
| I-01 | Mira · EN · T1, with a photo uploaded with the request | "Make the invite maroon and gold. Use this photo." | act · update_invite_style {palette: maroon_gold, photo_asset_id: <this upload>} | Yes (preview, then apply) | The invite draft is Maroon & Gold with the photo, used as uploaded. The website changes only after publishing. | "Your invite is now maroon and gold, with this photo. Publish it when you're happy." |
| I-02 | Mira · HI-Latn · D3 | "Naya card export karo." | act · export_card {revision: 3, format: png}, idempotent on `rev3:png` | No (not a publish, money or destructive change) | REV-3 export job, a card showing Lotus Hall; the REV-2 card stays marked stale | "Lotus Hall wala naya card ban raha hai. Pehle download kiya card purana hai." |
| I-03 | Mira · HI-Latn · T0, uploading `arora-printer-proof.jpg` | "Yeh purana card hai, isse details le lo." | act · extract_invite {file} → a review draft (demo-data §12); missing: [**year**, **reception time**, **reception hall**] | A review form; nothing saved until it is reviewed | Draft fields filled; year, reception time and hall marked "not printed" | "Card se Kabir, Mira aur 14 December mil gaye. Saal aur reception ka time card par nahi hai. Bata dijiye." |

## H. Shagun register

| ID | Who · lang · start | Utterance | Expected action | Confirm | Expected state change | Expected spoken reply |
|---|---|---|---|---|---|---|
| SH-01 | Mira · HI-Latn · D0 | "Sharma ji ne 5,100 shagun diya." (also try it spoken as "ikyavan sau") | act · record_shagun {from: H05 Ramesh & Kavita Sharma (the only Sharma household, named in the preview), amount_inr: 5100, received_on: 2026-11-25} | Yes | SHG-06; Shagun ₹40,300 → **₹45,400**; thank-you pending 3 → 4; **the expense ledger is unchanged** | "Sharma ji ka ₹5,100 shagun likh liya, aur thank-you list mein jod diya." |
| SH-02 | Mira · HI-Deva · after SH-01 | "किस किस को थैंक यू बोलना बाकी है?" | ask · query_shagun {thank_you: pending} | No | None | "चार लोग: Prakash & Vandana Kulkarni, Leena & Glen D'Souza, Naveen & Ritu Arora, Ramesh & Kavita Sharma।" The names are the register's, as stored (voice.md 7.3), spoken in two parts |

## I. Overview, activity and confirmations

| ID | Who · lang · start | Utterance | Expected action | Confirm | Expected state change | Expected spoken reply |
|---|---|---|---|---|---|---|
| O-01 | Mira · HI-Latn · D0 · **LIVE #1** | "Caterer ko ab kitna dena hai?" | ask · query_balance {vendor: VEN-CAT} | No | None | "एक लाख पचास हज़ार रुपये बाकी हैं।" |
| O-02 | Mira · HI-Latn · D2 · **LIVE #5** | "Diya ne kya badla?" | ask · query_changes {actor: Diya, latest: true} | No | None; links to ACT-07 | "Diya ne reception Banyan Hall se Lotus Hall mein shift kiya. Yeh abhi draft hai, guests ko Banyan Hall hi dikh raha hai." |
| O-03 | Mira · HI-Latn · D4 · **LIVE #7** | "Reception ka venue kya hai, aur caterer ka kitna baaki hai?" | ask · query_event {event: EVT-REC, field: venue} + query_balance {vendor: VEN-CAT} | No | None; opens EVT-REC and PAY-01 history | "Reception: Lotus Hall. एक लाख साठ हज़ार रुपये बाकी हैं।" |
| O-04 | Mira · EN · D0 | "What did the event manager change today?" | ask · query_changes {actor: Diya, date: 2026-11-25} | No | None; links to ACT-04 and ACT-05 | "Today Diya added two notes: a sugar-free dessert at the reception, and a stage canopy for the sangeet." |
| C-01 | Mira · HI-Latn · a preview pending from M-03 · **LIVE #3** | "Haan, save karo." Also try the mixed-script forms Saaras may write: "हाँ, save करो" and "हां सेव करो". | act · confirm {preview_id}. It is matched in code against a fixed list ("haan", "haan, save karo", "yes, save", "theek hai, save"), after voice.md 1.8 maps the script variants, so each form matches; no model call is needed. | It is the confirmation | Applies the pending preview **exactly once** | The confirmed action's reply: "एक लाख साठ हज़ार रुपये बाकी हैं।" |
| C-02 | Mira · HI-Deva · any pending preview | "नहीं, रहने दो।" Also try the mixed-script forms "nahin, रहने दो" and "नहीं, rehne do". | act · cancel {preview_id}, matched in code after voice.md 1.8 maps the script variants | – | None; the preview is discarded and nothing is written | "ठीक है, कुछ नहीं बदला।" |

## Coverage map

| Requirement | Rows |
|---|---|
| Indian numbers: baarah lakh / twelve lakh | S-03, S-01 |
| dedh lakh · sava lakh · pachaas hazaar · ₹1.5L · chaalis hazaar · ikyavan sau | M-07 · M-08 · M-06 (and "fifty-thousand" in M-01) · M-09 · M-03, M-05 · SH-01 |
| Dates: "terah tareekh ko shaam saat baje" · "the thirteenth" · a missing year | E-02 · E-01 · S-01, I-03 |
| Corrections that must not add a payment | M-02, M-03, M-04. M-06 and M-07 are the counter-cases, where a payment **is** added. |
| Ambiguity (ask, don't guess) | E-07 (which venue), E-08 ("kal"), M-05 (whose advance), R-02 (duplicate) |
| Missing information asked for, never invented | S-01, S-03, M-13, I-03, plus M-01's paid_on left empty |
| A guest asking about money is refused | G-04, G-05; also G-06 (an uninvited event) |
| Role limits for the manager | E-06 (publish), M-12 (payment → proposal), M-14 (budget and Shagun) |
| Flagsmith kill switch | R-03 |
| Every module | Setup A, Events B, Guests C, Money D, Vendors E, Requirements F, Invite G, Shagun H, Overview/activity I |
| Languages | 12 EN, 28 HI-Latn, 7 HI-Deva (47 total) |

## Non-spoken checks (run these alongside the set)

| ID | Check | Expected |
|---|---|---|
| X-01 | Confirm M-03 twice: a double tap, a network retry with the same idempotency key, or "Haan, save karo" said twice | One correction; PAY-01 has exactly 2 versions; caterer ₹1,60,000 |
| X-02 | Tara taps Attending twice, then reloads and taps again | Reception stays at 230; one row for Tara |
| X-03 | Call the money, vendor, Shagun, guest-list, draft-schedule and mehendi endpoints **directly** with Tara's link token | 401 on the money, planner, export and voice routes, and 404 for an out-of-scope function through the RSVP route, whatever the assistant says (decision D35) |
| X-04 | Call the budget, Shagun and record-payment endpoints directly with Diya's session | 403 (record-payment accepts only a proposal) |
| X-05 | Refresh both devices after each live step | Every number equals demo-data §9.3; the voice-made change survives a refresh and appears in the other session |
| X-06 | Set `voice_writes_enabled = false` and ask O-03 | The question is still answered (reads allowed); only writes are refused |

## Pass criteria

1. **Critical. Every one of these must hold, 100% of the time, before 14:45.**
   - **Nothing invented.** In every row with missing information, the field stays empty, is listed in `missing_fields`, and the reply asks for it.
   - **No unconfirmed writes.** Money, publishing and destructive changes always go through a preview and an explicit confirmation. C-02 writes nothing.
   - **Corrections never add payments.** After M-02, M-03 or M-04 the caterer has exactly one payment, with its history intact (X-01).
   - **Exactly once.** Repeated confirmations and repeated RSVPs change nothing the second time (X-01, X-02).
   - **Privacy is server-enforced.** E-06, M-12 and M-14 are refused or converted by the server. X-03 returns 401 (404 for an out-of-scope function through the RSVP route), and X-04 returns 403 (decision D35). G-04 to G-06 don't apply while guest voice isn't built.
   - **The kill switch works.** R-03 writes nothing while the flag is off, typing still saves, and questions are still answered (X-06).
   - **Arithmetic is exact.** Amounts are exact to the rupee and computed in code. Dates are stored as ISO dates in Asia/Kolkata. Spoken numbers equal the saved values.
2. **Accuracy** (decision D82, which replaces D28's arithmetic; voice.md 7.3). **At most three of the rows that apply may fail** to give the expected intent, kind and fields on the first try. While #11 and #13 are unbuilt that is 36 of 39: the 47 rows, minus G-03 to G-07 (guest voice isn't built), minus SH-01, SH-02 and I-03. If #11 or #13 ships, its rows apply again, and the bar is still at most three failures. Every miss must fail safe: a clarifying question or an editable preview, never a wrong saved record.
3. **Live set.** The 8 live utterances below succeed in **5 consecutive runs** on the stage headset in the hall. Astra's trigger applies: if two of five amount-bearing turns fail by **12:15**, shorten the line, keep the editable-number fallback, and record a successful run for the noisy-room fallback.
4. **Replies.** Each reply is two short sentences or fewer, in the speaker's language (Hindi or Hinglish for Hindi input, English for English input), and plays through Bulbul. Text stays on screen when `spoken_replies` is off.
5. **Latency.** Sarvam publishes none, so measure it. Target a median of 5 s or less from speech end to preview. If the median passes 8 s, cut LIVE #1 and #5 from the live demo and narrate them instead.
6. **Real speakers.** At least two fluent Hindi speakers, one from outside the team, run the full set in the hall. Results are logged per row with the transcript.

## The 8 live-demo utterances, in order

| # | Speaker · device · state | Utterance | What must happen | Expected spoken reply | Row |
|---|---|---|---|---|---|
| 1 | Mira · laptop headset · D0 | "Caterer ko ab kitna dena hai?" | Answer from saved records | "एक लाख पचास हज़ार रुपये बाकी हैं।" | O-01 |
| 2 | Mira · laptop · D0 | "Caterer ko chaalis hazaar advance diya tha." | Preview: "Correction, not a new payment: PAY-01 ₹50,000 → ₹40,000" | (none until confirmed) | M-03 |
| 3 | Mira · laptop · preview pending | "Haan, save karo." | PAY-01 version 2 saved once → D1 | "एक लाख साठ हज़ार रुपये बाकी हैं।" | C-01 |
| 4 | Diya · phone · D1 | "Reception Lotus Hall mein shift kar do." | Preview, then Diya taps Save draft → D2; the activity item appears on the laptop | "Draft mein reception ab Lotus Hall mein hai. Guests ko publish ke baad dikhega." | E-04 |
| 5 | Mira · laptop · D2 | "Diya ne kya badla?" | Answer from ACT-07 | "Diya ne reception Banyan Hall se Lotus Hall mein shift kiya. Yeh abhi draft hai, guests ko Banyan Hall hi dikh raha hai." | O-02 |
| 6 | Mira · laptop · D2 | "Schedule publish kar do." | PublishSheet, then Mira taps Publish → D3 | "Schedule publish ho gaya. Guests ko ab Lotus Hall dikhega." | E-05 |
| – | Tara · phone | *(no utterance: she taps Attending on the reception)* | D4: 229 → 230; estimate ₹1,84,000; contract ₹2,00,000 | – | – |
| 7 | Mira · laptop · D4 | "Reception ka venue kya hai, aur caterer ka kitna baaki hai?" | Answer from EVT-REC and PAY-01 | "Reception: Lotus Hall. एक लाख साठ हज़ार रुपये बाकी हैं।" | O-03 |
| 8 | Mira · laptop · D4 with the kill switch off | "Reception mein barah logon ke liye Jain khana add karo." | **Refused by the server**; then Mira types it and saves → D5 | "Abhi voice se badlav band hain. Aap type karke save kar sakte hain." | R-03 |
