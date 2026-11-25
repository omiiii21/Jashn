# Jashn demo data: the single source of truth

Prep note written at about 02:00 IST on 25 Nov 2026, before coding starts. It is a plain-language data sheet, not code. At 09:00 the builders turn it into seed records. When another document disagrees with this one, this one wins, except `decisions.md` (D1–D122), which wins over every note.

**Everything here is fictional.** Every person, household, phone number, email address, company, venue and amount is invented for the demo, and screens must carry a visible "Fictional demo data" badge. Phone numbers use the `+91 90000 0xxxx` pattern and emails use the reserved `example.com` domain. Locality names (Whitefield, Jayanagar, Indiranagar) are real Bengaluru areas; every building and business in them is invented.

- Timezone for every date and time: **Asia/Kolkata (IST, UTC+05:30)**. "Today" in the demo is **Wednesday 25 Nov 2026**.
- Money is in Indian rupees, written in Indian grouping (₹12,00,000). Jashn records money and never transfers it.
- IDs such as `EVT-REC` or `PAY-01` are labels for this document and the test set. The database uses UUIDs: each seeded row keeps its label as its `seed_key`, and its id is a fixed UUIDv5 made by `src/db/ids.ts`, so the fixtures, the tests and the seed agree (decision D100; domain-and-data 0.1 gives the name format).

## 1. People and accounts

### 1.1 The couple and their families (fictional)

| Person | Relation | Notes |
|---|---|---|
| Mira Deshpande | Bride | Wedding owner (signed-in account). Speaks English, Hindi and Hinglish. |
| Kabir Arora | Groom | Co-owner account exists but is not signed in during the demo. |
| Anil & Sunita Deshpande | Mira's parents | Household H01. Sunita leads the mehendi. Anil leads the wedding ceremony. |
| Rakesh & Neelam Arora | Kabir's parents | Household H09. Neelam leads the haldi and is the RSVP contact on the printed card. |
| Kamla Arora | Kabir's grandmother (Dadi) | Household H10. Diabetic, so she needs a sugar-free dessert. |

Mira's family is Marathi and Kabir's is Punjabi. That is why the menu mixes the two cuisines and the sangeet setlist has three Marathi and three Punjabi songs.

### 1.2 Signed-in accounts

| Account | Role | Login email | Phone | Used in demo by |
|---|---|---|---|---|
| Mira Deshpande | Owner | mira.owner@example.com | +91 90000 00001 | Lead, on the projected laptop |
| Kabir Arora | Owner (co-owner) | kabir.owner@example.com | +91 90000 00002 | Nobody (exists to show that two owners can be added) |
| Diya Fernandes | Event manager | diya.manager@example.com | +91 90000 00003 | Teammate, on the phone (Chrome profile) |
| Tara Bhat | Guest (no account) | Private RSVP link for household H16 | +91 90000 01601 | Teammate, on the phone (Safari private tab) |

**Diya Fernandes** is the event manager and runs **Rangoli Lane Events (fictional)**, a small wedding-planning studio in Indiranagar, Bengaluru (events@rangolilane.example.com). Mira invited her into the wedding workspace on 20 Nov 2026.

### 1.3 What each role may see (enforced on the server)

| Data | Owner (Mira) | Manager (Diya) | Guest (Tara's link) |
|---|---|---|---|
| Draft schedule | Read and edit | Read and edit | No |
| Published schedule | Read, publish | Read | Only her invited functions: Sangeet and Reception |
| Guest list | Everything | Names, RSVP status and dietary notes; no phone numbers (owner setting "share contacts" is off) | Only her own household |
| Vendors and vendor dues | Everything | Read, plus propose changes (owner shared "Vendors & dues" on 20 Nov) | No |
| Budget, category budgets, wedding totals | Everything | No (not shared) | No |
| Record or correct a payment | Yes, after confirmation | No; it becomes a proposal for the owner | No |
| Shagun register | Everything | No (not shared) | No |
| Requirements and tasks | Read and edit | Read and edit | No |
| Activity feed | Everything | Everything except money and Shagun items | No |

Guest-directory visibility is off: a guest never sees who else is invited.

### 1.4 Sample copies and their accounts

The seed creates six sample copies of this wedding, all with the same data, the "Fictional demo data" badge and `is_sample` true (decision D27). Each copy has its own owner and manager; the password is `SEED_PASSWORD` from `.env.local`, never printed. It is a passphrase the user chooses and keeps in their password manager, because the teammate types it on a phone as Diya (decision D118).

| Copy | Used by | Owner (Mira) | Manager (Diya) |
|---|---|---|---|
| Demo copy | Judging and recorded takes only, each followed by a reset to D0 | mira.owner@example.com | diya.manager@example.com |
| Rehearsal copy `a` | Lane A | mira.a@example.com | diya.a@example.com |
| Rehearsal copy `b` | Lane B | mira.b@example.com | diya.b@example.com |
| Rehearsal copy `c` | Lane C | mira.c@example.com | diya.c@example.com |
| Rehearsal copy `d` | Lane D | mira.d@example.com | diya.d@example.com |
| `e2e` copy | The Playwright run | mira.e2e@example.com | diya.e2e@example.com |

Every one of these addresses ends in `@example.com`, so Flagsmith treats it as internal and the experiment never enrols it. `reset_demo` acts on one named copy and never touches another. A lane resets only its own rehearsal copy, as that copy's owner (`checkpoint` d0, `confirm_text` RESET); the demo and `e2e` copies are L's (decisions D17 and D120). If copies `c` and `d` aren't seeded by 10:45, Lanes C and D read the `e2e` copy (GETs only) and use fixtures for writes until 11:40. Every voice test that writes runs on a rehearsal copy.

Accounts made during the day, outside the seed (decision D120):
- fresh internal owners for setup tests sign up as `setup-<lane>-<HHMM>@example.com` and start with no wedding;
- AT-1.7's non-internal tester is `nonint-c-<HHMM>@example.net`, on local dev only, never on production.

## 2. Venues (fictional)

| Venue | Space | Capacity | Used for |
|---|---|---|---|
| Deshpande family home (fictional address, Jayanagar) | Terrace | 60 | Mehendi |
| Mallige Gardens (fictional), Whitefield, Bengaluru | Courtyard Lawn | 80 | Haldi |
| Mallige Gardens | Garden Hall | 180 | Sangeet |
| Mallige Gardens | Mandap Lawn | 250 | Wedding ceremony |
| Mallige Gardens | Banyan Hall | 220 | Reception, original hall (still on the published schedule before the demo) |
| Mallige Gardens | Lotus Hall | 300 | Reception, new hall (Diya moves it here live) |

Why Diya moves the reception: 229 guests have confirmed and Banyan Hall seats 220. The Mallige Gardens package covers any of its halls, so **the move changes no money**.

## 3. The five functions

The **owner** column names the function lead, the person responsible for it. That is a different thing from the account role "owner".

| ID | Function | Date | Time (IST) | Venue | Dress code | Owner (function lead) | Invited groups (section 4.2) | Description |
|---|---|---|---|---|---|---|---|---|
| EVT-HAL | Haldi | Sun 13 Dec 2026 | 09:30–11:30 | Courtyard Lawn, Mallige Gardens | Yellow; clothes that can get stained | Neelam Arora | FAM-B, FAM-G, PH-1 | Joint haldi for both families. Turmeric paste from Sunita's family recipe. |
| EVT-MEH | Mehendi | Sun 13 Dec 2026 | 15:00–19:30 ⚠ | Terrace, Deshpande family home, Jayanagar | Green and pink, festive casual | Sunita Deshpande | FAM-B, FAM-G, FR-M, PH-1, PH-2 | Henna for the bride and family. Music and chai. |
| EVT-SAN | Sangeet | Sun 13 Dec 2026 | 19:00–23:00 | Garden Hall, Mallige Gardens | Indo-western, some sparkle | Diya Fernandes | All named groups, PH-1, PH-2, PH-3 | Family dance performances, then the DJ. |
| EVT-WED | Wedding | Mon 14 Dec 2026 | 10:30–13:30 (muhurat 11:15) | Mandap Lawn, Mallige Gardens | Traditional: sarees, kurtas, sherwanis; pastels | Anil Deshpande | FAM-B, FAM-G, FF, FR-M, PH-1 to PH-4 | Pheras at the muhurat, then lunch. |
| EVT-REC | Reception | Mon 14 Dec 2026 | 19:30–23:00 | **Banyan Hall** (published) → **Lotus Hall** (Diya's live draft), Mallige Gardens | Formal evening | Diya Fernandes | Everyone: all named groups, PH-1 to PH-5 | Dinner follows. (Guests never see vendor names; Annapoorna Caterers is linked on the planner side only. Decision D24.) |

### 3.1 The deliberate timing conflict

**The mehendi ends at 19:30, but the sangeet starts at 19:00.** The two overlap by 30 minutes, the bride and both families are invited to both, and Jayanagar to Whitefield is a long evening drive. Diya caused it on 24 Nov by extending the mehendi from 18:00 to 19:30 (ACT-02), and Mira published it without noticing. The Events page and the overview must show a conflict warning to the owner and manager. Guests never see warnings. **Leave the conflict unresolved in the demo copy.** Fixing it is a voice test (E-03 in the test set) that runs on the rehearsal copy only.

### 3.2 Publication state

| Revision | Published by | When | What guests saw |
|---|---|---|---|
| REV-1 | Mira | Sun 22 Nov 2026, 20:00 | First schedule: mehendi 15:00–18:00, sangeet, wedding, reception at Banyan Hall. No haldi yet. |
| REV-2 | Mira | Tue 24 Nov 2026, 21:00 | Diya's haldi added, mehendi extended to 19:30 (the conflict). **This is the live published version at demo start.** |
| REV-3 | Mira | Live in the demo | Reception moves from Banyan Hall to Lotus Hall. |

The seed builds the REV-1 and REV-2 snapshots with Lane A's pure snapshot builder, `src/db/itinerary-snapshot.ts`, the same one `publish_itinerary` uses for REV-3 (decision D95).

At demo start the draft equals REV-2. There are **no unpublished draft changes**, so Mira's live publish carries only Diya's venue move.

A card exported earlier (job `JOB-EXP-R2-PNG`, completed 24 Nov 21:05) still shows Banyan Hall. Downloaded cards are static, and that stale card is the point of the export beat.

**The REV-2 card file** (decision D15). Lane D renders it from a Banyan Hall variant of the probe fixture at about 12:00 and commits it as `scripts/seed-assets/card-rev2.png`, a one-file exception to Lane A's ownership of `scripts/`. Lane A's seed uploads it when present. Until then `JOB-EXP-R2-PNG` is seeded as Ready without a file, and rehearsals before 13:45 skip its download.

## 4. Guests and RSVP

### 4.1 Households (16 named households, 40 named guests)

Each household gets one private RSVP link, a random token created at seed time, such as `/i/<token>`. The link shows only that household's invited functions, from the published revision.

| HH | Household | Relation | Primary contact (fictional) | Members |
|---|---|---|---|---|
| H01 | Deshpande | Mira's parents | Sunita, +91 90000 00101 | Anil, Sunita |
| H02 | Deshpande | Mira's brother's family | Rohan, +91 90000 00201 | Rohan, Ishita, Myra (child, 6) |
| H03 | Kulkarni | Mira's maternal uncle (Mama) | Prakash, +91 90000 00301 | Prakash, Vandana, Aditya |
| H04 | Joshi | Mira's aunt (Bua) | Meena, +91 90000 00401 | Meena, Sameer, Riya |
| H05 | Sharma | Deshpande family friends ("Sharma ji") | Ramesh, +91 90000 00501 | Ramesh, Kavita, Tanmay |
| H06 | Rao | Mira's friend and her mother | Nisha, +91 90000 00601 | Nisha, Usha |
| H07 | Shenoy | Mira's friend and her husband | Aarti, +91 90000 00701 | Aarti, Kiran |
| H08 | D'Souza | Mira's colleague and her husband | Leena, +91 90000 00801 | Leena, Glen |
| H09 | Arora | Kabir's parents | Neelam, +91 90000 00901 | Rakesh, Neelam |
| H10 | Arora | Kabir's grandmother (Dadi) | Kamla, via Neelam, +91 90000 01001 | Kamla |
| H11 | Bhalla | Kabir's sister's family | Simran, +91 90000 01101 | Simran, Varun, Kiaan (child, 8) |
| H12 | Arora | Kabir's uncle (Chacha) | Naveen, +91 90000 01201 | Naveen, Ritu, Dev, Anya |
| H13 | Jain | Arora family friends | Mahesh, +91 90000 01301 | Mahesh, Sarita, Nikhil, Prachi |
| H14 | Siddiqui | Kabir's friend, his wife and mother | Yusuf, +91 90000 01401 | Yusuf, Sana, Rukhsana |
| H15 | Iyer | Kabir's colleague and his wife | Pranav, +91 90000 01501 | Pranav, Meghna |
| H16 | Bhat | Kabir's college friend: **the demo guest** | Tara, +91 90000 01601, tara.guest@example.com | Tara |

### 4.2 Guest groups

| Group | Who | Named guests |
|---|---|---|
| FAM-B | Bride's family: H01–H04 | 11 |
| FAM-G | Groom's family: H09–H12 | 10 |
| FF | Family friends: H05, H13 | 7 |
| FR-M | Mira's friends and colleague: H06–H08 | 6 |
| FR-K | Kabir's friends and colleagues: H14–H16 | 6 |
| PH-1 to PH-5 | Imported placeholder guests (section 4.4) | 0 named, 210 placeholders |

### 4.3 Named guests: per-function invitations and pre-demo RSVP

Key: **Y** attending · **N** declined · **P** pending · **–** not invited. Columns: Haldi, Mehendi, Sangeet, Wedding, Reception.

| # | Guest | HH | Group | Hal | Meh | San | Wed | Rec | Dietary note |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Anil Deshpande | H01 | FAM-B | Y | Y | Y | Y | Y | – |
| 2 | Sunita Deshpande | H01 | FAM-B | Y | Y | Y | Y | Y | – |
| 3 | Rohan Deshpande | H02 | FAM-B | Y | Y | Y | Y | Y | – |
| 4 | Ishita Deshpande | H02 | FAM-B | Y | Y | Y | Y | Y | – |
| 5 | Myra Deshpande (6) | H02 | FAM-B | Y | Y | Y | Y | Y | Peanut allergy |
| 6 | Prakash Kulkarni | H03 | FAM-B | Y | Y | Y | Y | Y | – |
| 7 | Vandana Kulkarni | H03 | FAM-B | Y | Y | Y | Y | Y | – |
| 8 | Aditya Kulkarni | H03 | FAM-B | P | P | Y | Y | Y | – |
| 9 | Meena Joshi | H04 | FAM-B | Y | Y | Y | Y | Y | – |
| 10 | Sameer Joshi | H04 | FAM-B | Y | Y | Y | Y | Y | – |
| 11 | Riya Joshi | H04 | FAM-B | N | N | Y | Y | Y | – (arrives on the evening of 13 Dec) |
| 12 | Rakesh Arora | H09 | FAM-G | Y | Y | Y | Y | Y | – |
| 13 | Neelam Arora | H09 | FAM-G | Y | Y | Y | Y | Y | – |
| 14 | Kamla Arora | H10 | FAM-G | Y | Y | N | Y | Y | Diabetic: sugar-free dessert |
| 15 | Simran Bhalla | H11 | FAM-G | Y | Y | Y | Y | Y | – |
| 16 | Varun Bhalla | H11 | FAM-G | Y | Y | Y | Y | Y | – |
| 17 | Kiaan Bhalla (8) | H11 | FAM-G | Y | Y | Y | Y | Y | – |
| 18 | Naveen Arora | H12 | FAM-G | Y | Y | Y | Y | Y | – |
| 19 | Ritu Arora | H12 | FAM-G | Y | Y | Y | Y | Y | – |
| 20 | Dev Arora | H12 | FAM-G | P | P | P | P | P | – |
| 21 | Anya Arora | H12 | FAM-G | P | P | P | P | P | – |
| 22 | Ramesh Sharma | H05 | FF | – | – | Y | Y | Y | – |
| 23 | Kavita Sharma | H05 | FF | – | – | Y | Y | Y | – |
| 24 | Tanmay Sharma | H05 | FF | – | – | N | Y | Y | – |
| 25 | Mahesh Jain | H13 | FF | – | – | Y | Y | Y | Jain (no onion, garlic or root vegetables) |
| 26 | Sarita Jain | H13 | FF | – | – | Y | Y | Y | Jain |
| 27 | Nikhil Jain | H13 | FF | – | – | Y | P | P | Jain |
| 28 | Prachi Jain | H13 | FF | – | – | Y | P | P | Jain |
| 29 | Nisha Rao | H06 | FR-M | – | Y | Y | Y | Y | – |
| 30 | Usha Rao | H06 | FR-M | – | N | N | Y | Y | Low spice |
| 31 | Aarti Shenoy | H07 | FR-M | – | Y | Y | Y | Y | – |
| 32 | Kiran Shenoy | H07 | FR-M | – | N | Y | Y | Y | – |
| 33 | Leena D'Souza | H08 | FR-M | – | Y | Y | Y | Y | – |
| 34 | Glen D'Souza | H08 | FR-M | – | N | N | N | N | – (travelling for work) |
| 35 | Yusuf Siddiqui | H14 | FR-K | – | – | Y | – | Y | – |
| 36 | Sana Siddiqui | H14 | FR-K | – | – | Y | – | Y | – |
| 37 | Rukhsana Siddiqui | H14 | FR-K | – | – | N | – | N | – (sent Shagun instead) |
| 38 | Pranav Iyer | H15 | FR-K | – | – | Y | – | Y | – |
| 39 | Meghna Iyer | H15 | FR-K | – | – | Y | – | P | Gluten-free |
| 40 | **Tara Bhat** | H16 | FR-K | – | – | **Y** | – | **P** | – (none yet; test G-09 adds one) |

Tara's link shows two functions: the **Sangeet**, where she is already attending, and the **Reception**, where she is pending. Her live tap changes only the reception, which shows that the correct event updates.

### 4.4 Imported placeholder guests (synthetic, 210 records)

These are real guest rows with labelled names, "Imported guest 041" to "Imported guest 250", flagged `synthetic = true` in household "Imported list (synthetic)". They stand in for the long tail of relatives and colleagues that a family imports from a phone list. They have no contacts and no links.

| Tier | Size | Invited to | Haldi Y/N/P | Mehendi Y/N/P | Sangeet Y/N/P | Wedding Y/N/P | Reception Y/N/P |
|---|---|---|---|---|---|---|---|
| PH-1 Close extended family | 9 | All five | 8 / 1 / 0 | 8 / 1 / 0 | 8 / 1 / 0 | 9 / 0 / 0 | 9 / 0 / 0 |
| PH-2 Extended family | 24 | Mehendi, Sangeet, Wedding, Reception | – | 22 / 1 / 1 | 23 / 0 / 1 | 23 / 1 / 0 | 23 / 1 / 0 |
| PH-3 Friends and family friends | 77 | Sangeet, Wedding, Reception | – | – | 72 / 2 / 3 | 72 / 3 / 2 | 74 / 2 / 1 |
| PH-4 Wedding guests | 36 | Wedding, Reception | – | – | – | 32 / 1 / 3 | 33 / 1 / 2 |
| PH-5 Reception only (colleagues, neighbours) | 64 | Reception | – | – | – | – | 58 / 3 / 3 |
| **Placeholders total** | **210** | | 8 / 1 / 0 | 30 / 2 / 1 | 103 / 3 / 4 | 136 / 5 / 5 | 197 / 7 / 6 |

### 4.5 Exact pre-demo RSVP counts per function

| Function | Invited (named + placeholder) | Attending | Declined | Pending | expected_headcount (planning field) |
|---|---|---|---|---|---|
| Haldi | 30 (21 + 9) | 25 (17 + 8) | 2 (1 + 1) | 3 (3 + 0) | 30 |
| Mehendi | 60 (27 + 33) | 50 (20 + 30) | 6 (4 + 2) | 4 (3 + 1) | 60 |
| Sangeet | 150 (40 + 110) | 136 (33 + 103) | 8 (5 + 3) | 6 (2 + 4) | 150 |
| Wedding | 180 (34 + 146) | 165 (29 + 136) | 6 (1 + 5) | 9 (4 + 5) | 180 |
| **Reception** | **250 (40 + 210)** | **229 (32 + 197)** | **9 (2 + 7)** | **12 (6 + 6)** | **250** |

**How 229/250 is represented.** Every invitee is a stored guest record with one invitation row per function, and every count on every screen is a count of those rows by status. No total is typed in. The 40 named guests are the visible sample. The other 210 are the labelled synthetic placeholders above, shown on the Guests screen as one collapsed row, "210 imported guests (synthetic placeholders)". Each function also has a separate **`expected_headcount`** planning field typed by the owner. It sizes contracts and halls; the caterer's 250 covers come from it. It is **never** used as an RSVP count. Tara's tap updates her one reception row from pending to attending. The reception moves from **229 to 230** attending and from 12 to 11 pending, and tapping again changes nothing.

### 4.6 Pending reception guests, by name (pre-demo)

Dev Arora, Anya Arora, Nikhil Jain, Prachi Jain, Meghna Iyer and **Tara Bhat** (6 named), plus 6 imported placeholders (1 in PH-3, 2 in PH-4, 3 in PH-5), for 12 in all.

## 5. Budget by category (at demo start, D0)

Planned means the budget. Committed means agreed vendor amounts plus miscellaneous expenses. Paid means recorded payments. Outstanding is committed minus paid. Uncommitted is budget minus committed.

| Category | Budget (planned) | Committed | Paid | Outstanding | Uncommitted |
|---|---|---|---|---|---|
| Venue and halls | ₹3,00,000 | ₹2,80,000 | ₹1,40,000 | ₹1,40,000 | ₹20,000 |
| Catering | ₹2,40,000 | ₹2,00,000 | ₹50,000 | ₹1,50,000 | ₹40,000 |
| Decor and flowers | ₹1,60,000 | ₹1,50,000 | ₹50,000 | ₹1,00,000 | ₹10,000 |
| Photography and video | ₹1,20,000 | ₹1,10,000 | ₹30,000 | ₹80,000 | ₹10,000 |
| Attire and jewellery | ₹1,50,000 | ₹95,000 | ₹95,000 | ₹0 | ₹55,000 |
| Music and entertainment | ₹70,000 | ₹55,000 | ₹15,000 | ₹40,000 | ₹15,000 |
| Mehendi and makeup | ₹50,000 | ₹25,000 | ₹5,000 | ₹20,000 | ₹25,000 |
| Invitations and gifts | ₹40,000 | ₹12,000 | ₹12,000 | ₹0 | ₹28,000 |
| Transport and logistics | ₹30,000 | ₹0 | ₹0 | ₹0 | ₹30,000 |
| Contingency | ₹40,000 | ₹0 | ₹0 | ₹0 | ₹40,000 |
| **Total** | **₹12,00,000** | **₹9,27,000** | **₹3,97,000** | **₹5,30,000** | **₹2,73,000** |

Proposed but not committed: **PRP-01**, a dhol player for the baraat at ₹15,000 (Music), proposed by Diya and awaiting Mira's approval. Its seeded summary follows domain-and-data's `record_expense` template, with the ", not yet paid" suffix (decision D91): "an expense of ₹15,000 to Dhol player (Music and entertainment), not yet paid". It appears as a proposal and is **not** counted in committed or outstanding. If Mira approves it, Music commitments become ₹70,000, which equals that category's budget.

## 6. Vendors and catering

| ID | Vendor (fictional) | Category | Contact (fictional) | Linked functions | Status | Quote | Agreed (commitment) | Advance paid | Balance | Balance due |
|---|---|---|---|---|---|---|---|---|---|---|
| VEN-CAT | Annapoorna Caterers | Catering | Suresh, +91 90000 02001 | Reception | Contracted: **fixed minimum of 250 covers** | ₹850 × 250 = ₹2,12,500 | **₹800 × 250 = ₹2,00,000** (COM-01) | ₹50,000 (PAY-01) | **₹1,50,000** | Sat 12 Dec 2026 |
| VEN-VEN | Mallige Gardens | Venue | Events desk, +91 90000 02002 | Haldi, Sangeet, Wedding, Reception | Contracted: any hall, includes the in-house kitchen | ₹3,10,000 | ₹2,80,000 (COM-02) | ₹1,40,000 (PAY-02) | ₹1,40,000 | Tue 1 Dec 2026 |
| VEN-DEC | Marigold Lane Decor | Decor | Ritika, +91 90000 02003 | All five | Contracted | ₹1,65,000 | ₹1,50,000 (COM-03) | ₹50,000 (PAY-03) | ₹1,00,000 | Thu 10 Dec 2026 |
| VEN-PHO | Frame & Phera Studio | Photography | Arvind, +91 90000 02004 | All five | Contracted | ₹1,30,000 | ₹1,10,000 (COM-04) | ₹30,000 (PAY-04) | ₹80,000 | Mon 14 Dec 2026 |
| VEN-MEH | Mehendi Mahal Artists | Mehendi and makeup | Zubeida, +91 90000 02005 | Mehendi | Booked | ₹30,000 | ₹25,000 (COM-05) | ₹5,000 (PAY-05) | ₹20,000 | Sun 13 Dec 2026 |
| VEN-DJ | Bass Baraat Sound | Music | Joel, +91 90000 02006 | Sangeet, Reception | Booked | ₹60,000 | ₹55,000 (COM-06) | ₹15,000 (PAY-06) | ₹40,000 | Sun 13 Dec 2026 |

Food at the other functions (haldi breakfast, sangeet dinner, wedding lunch) comes from the Mallige Gardens kitchen in the venue package. The ₹40,000 of uncommitted catering budget is for chai and snacks at the mehendi at home.

### 6.1 Catering card (VEN-CAT, Reception)

- **Menu (vegetarian, Marathi and Punjabi):** aam panna and masala chaas. Starters: paneer tikka, hara bhara kebab, corn tikki, mini dosa. Mains: dal makhani, varan-bhaat, paneer butter masala, bhindi do pyaza, veg biryani, butter naan, puran poli. Desserts: gulab jamun, shrikhand, and sugar-free kheer on request.
- **Rate:** ₹800 per plate, agreed. The quote was ₹850. Jain plates are quoted at the **same ₹800**, so a Jain requirement changes no cost.
- **Signed contract (fixed):** 250 covers × ₹800 = **₹2,00,000**. RSVPs never change this number. Only an owner-approved commitment change can.
- **Estimate from confirmed guests (labelled "Estimate, not the contract"):** confirmed × ₹800. That is 229 × ₹800 = **₹1,83,200** at demo start and **230 × ₹800 = ₹1,84,000** after Tara's RSVP.
- **Headcount inputs:** expected_headcount 250 (planning) and confirmed reception RSVPs (counted rows). Show both beside the contract.

## 7. Money ledger

### 7.1 Commitments and miscellaneous expenses (pre-demo)

| ID | Vendor / payee | Category | Amount | Basis | Recorded |
|---|---|---|---|---|---|
| COM-01 | Annapoorna Caterers | Catering | ₹2,00,000 | 250 × ₹800, fixed minimum | 20 Nov 2026, Mira |
| COM-02 | Mallige Gardens | Venue | ₹2,80,000 | Package, 13–14 Dec | 10 Nov 2026, Mira |
| COM-03 | Marigold Lane Decor | Decor | ₹1,50,000 | All five functions | 18 Nov 2026, Mira (Diya's proposal, approved) |
| COM-04 | Frame & Phera Studio | Photography | ₹1,10,000 | Photo and video, all five | 12 Nov 2026, Mira |
| COM-05 | Mehendi Mahal Artists | Mehendi | ₹25,000 | Bride, plus 20 guests | 21 Nov 2026, Mira |
| COM-06 | Bass Baraat Sound | Music | ₹55,000 | Sangeet and reception | 22 Nov 2026, Mira |
| EXP-01 | Printed cards for elders, 100 cards (fictional printer) | Invitations | ₹12,000 | Paid in full | 16 Nov 2026, Mira |
| EXP-02 | Bridal lehenga (fictional boutique) | Attire | ₹95,000 | Paid in full | 8 Nov 2026, Mira |
| | **Total committed** | | **₹9,27,000** | | |

### 7.2 Payments (pre-demo). These are recorded, not transferred.

| ID | Paid on | To | Type | Amount | Method (recorded only) | Receipt |
|---|---|---|---|---|---|---|
| PAY-01 | Fri 20 Nov 2026 | Annapoorna Caterers | Advance | **₹50,000** (this is the disputed one) | UPI | – |
| PAY-02 | Tue 10 Nov 2026 | Mallige Gardens | Advance | ₹1,40,000 | Bank transfer | – (receipt attachments are future scope in scope.md) |
| PAY-03 | Wed 18 Nov 2026 | Marigold Lane Decor | Advance | ₹50,000 | UPI | – |
| PAY-04 | Thu 12 Nov 2026 | Frame & Phera Studio | Advance | ₹30,000 | UPI | – |
| PAY-05 | Sat 21 Nov 2026 | Mehendi Mahal Artists | Advance | ₹5,000 | Cash | – |
| PAY-06 | Sun 22 Nov 2026 | Bass Baraat Sound | Advance | ₹15,000 | UPI | – |
| EXP-01 | Mon 16 Nov 2026 | Printer (fictional) | Paid in full | ₹12,000 | Cash | – |
| EXP-02 | Sun 8 Nov 2026 | Boutique (fictional) | Paid in full | ₹95,000 | Card | – |
| | | | **Total paid** | **₹3,97,000** | | |

**PAY-01 history.** Version 1: ₹50,000, recorded 20 Nov 2026 by Mira, typed. The live demo adds version 2, ₹40,000, corrected by Mira by voice ("Caterer ko chaalis hazaar advance diya tha"). The record keeps both versions: the corrected value, who corrected it, when, the transcript, and the earlier value. **No new payment row is created.**

### 7.3 Wedding totals at each demo state

| State | Trigger | Caterer committed / paid / outstanding | Wedding committed / paid / outstanding | Planned | Uncommitted |
|---|---|---|---|---|---|
| S0 (video only) | Populated wedding before the caterer is recorded. VEN-CAT exists with its ₹850 quote only. | ₹0 / ₹0 / ₹0 | ₹7,27,000 / ₹3,47,000 / ₹3,80,000 | ₹12,00,000 | ₹4,73,000 |
| S0 → D0 | Voice M-01: "...eight hundred per person for 250 people. I paid a fifty-thousand advance." | ₹2,00,000 / ₹50,000 / ₹1,50,000 | ₹9,27,000 / ₹3,97,000 / ₹5,30,000 | ₹12,00,000 | ₹2,73,000 |
| **D0** | **Live demo start** | ₹2,00,000 / ₹50,000 / **₹1,50,000** | ₹9,27,000 / ₹3,97,000 / ₹5,30,000 | ₹12,00,000 | ₹2,73,000 |
| D1 | Correction of PAY-01 to ₹40,000 | ₹2,00,000 / ₹40,000 / **₹1,60,000** | ₹9,27,000 / **₹3,87,000** / **₹5,40,000** | ₹12,00,000 | ₹2,73,000 |
| D2 to D5 | Venue move, publish, RSVP, typed requirement | Unchanged from D1 | Unchanged from D1 | ₹12,00,000 | ₹2,73,000 |

In the brief's original wording, recording the commitment and advance is spoken in the video from state S0. The live demo starts at D0, with that recording already done, so the room sees the dispute at once.

## 8. Requirements per function (pre-demo)

| ID | Function | Requirement | Vendor | Added by |
|---|---|---|---|---|
| REQ-01 | Mehendi | Natural henna only; no chemical "black" henna | VEN-MEH | Mira |
| REQ-02 | Mehendi | Floor cushions for 30, plus 10 chairs for elders | – | Diya |
| REQ-03 | Haldi | Marigold décor; old bedsheets spread over the lawn | VEN-DEC | Diya |
| REQ-04 | Sangeet | Marigold and fairy-light canopy over the stage | VEN-DEC | Diya (ACT-05) |
| REQ-05 | Sangeet | Family dance slot at 21:00 (12 minutes); DJ plays 3 Marathi and 3 Punjabi songs | VEN-DJ | Mira |
| REQ-06 | Wedding | Mandap faces east; muhurat 11:15; pandit confirmed | VEN-DEC | Mira |
| REQ-07 | Wedding | Kanyadaan items checklist, kept by Sunita | – | Mira |
| REQ-08 | Reception | Sugar-free dessert option, for Kamla Arora | VEN-CAT | Diya (ACT-04) |
| REQ-09 | Reception | Peanut-free kids' counter, for Myra | VEN-CAT | Mira |

**Added live (D5):** REQ-10, Reception: "Jain food for 12 guests", linked to VEN-CAT. Mira types it in the Flagsmith beat after voice writes are switched off. Cost check: Jain plates cost the same ₹800, so there is no cost change. The 12 are the 4 named Jain guests (H13; 2 attending and 2 pending) plus 8 Jain guests in the imported lists.

## 9. Collaboration: activity, proposals and tasks

### 9.1 Manager activity, pre-demo (5 items by Diya)

| ID | When (IST) | Who | What the owner sees | Status |
|---|---|---|---|---|
| ACT-01 | Tue 24 Nov 2026, 16:05 | Diya | Added the **Haldi**: Sun 13 Dec, 09:30–11:30, Courtyard Lawn | Published in REV-2 |
| ACT-02 | Tue 24 Nov 2026, 17:40 | Diya | Changed the **Mehendi** end time from 18:00 to 19:30. ⚠ It now overlaps the Sangeet by 30 min. | Published in REV-2; the conflict remains |
| ACT-03 | Tue 24 Nov 2026, 19:15 | Diya | **Proposed** an expense: dhol player for the baraat, ₹15,000 (PRP-01). Seeded line: "Diya proposed an expense of ₹15,000 to Dhol player (Music and entertainment), not yet paid. It needs an owner's approval." (decision D91) | Awaiting Mira's approval; not committed |
| ACT-04 | Wed 25 Nov 2026, 08:30 | Diya | Added a requirement to the **Reception**: sugar-free dessert for Kamla Arora (REQ-08) | Saved |
| ACT-05 | Wed 25 Nov 2026, 08:45 | Diya | Added a requirement to the **Sangeet**: marigold and fairy-light canopy over the stage (REQ-04) | Saved |

The "What the owner sees" column summarises each item. The exact activity lines, here and in 9.3, come from the templates in `spec/domain-and-data.md` section 3, which win over any wording in this sheet (decision D23).

ACT-04 and ACT-05 must be timestamped on the demo day so that "today" questions find them. If the demo date moves, shift them.

### 9.2 Open tasks (optional)

Task boards are future scope in `scope.md`. Seed these only if a light task list ships, and keep them out of the demo path.

| ID | Task | Assignee | Due | Status |
|---|---|---|---|---|
| TSK-01 | Confirm canopy flowers with Marigold Lane | Diya | Sat 5 Dec 2026 | Open |
| TSK-02 | Book a Garden Hall sound check for Bass Baraat Sound | Diya | Tue 8 Dec 2026 | Open |
| TSK-03 | Get the Jain menu in writing from Annapoorna | Diya | Tue 1 Dec 2026 | Open |

### 9.3 Everything that changes during the live demo, step by step

| State | Live step | Records written | Reception attending / declined / pending | Catering estimate (contract stays ₹2,00,000) | Reception venue: guests see / draft | New activity item |
|---|---|---|---|---|---|---|
| D0 | Start | – | 229 / 9 / 12 | ₹1,83,200 | Banyan Hall / Banyan Hall | – (5 items) |
| D0 | #1 "Caterer ko ab kitna dena hai?" | None (a question) | 229 / 9 / 12 | ₹1,83,200 | Banyan / Banyan | – |
| D1 | #2–#3 correction, confirmed | PAY-01 version 2 = ₹40,000 | 229 / 9 / 12 | ₹1,83,200 | Banyan / Banyan | ACT-06: "Mira corrected the advance to Annapoorna Caterers from ₹50,000 to ₹40,000." |
| D2 | #4 Diya moves the reception (phone) | EVT-REC draft venue = Lotus Hall | 229 / 9 / 12 | ₹1,83,200 | **Banyan** / **Lotus** | ACT-07: "Diya moved the reception from Banyan Hall to Lotus Hall." (draft) |
| D2 | #5 "Diya ne kya badla?" | None | 229 / 9 / 12 | ₹1,83,200 | Banyan / Lotus | – |
| D3 | #6 Mira publishes | REV-3 published; the old REV-2 card is marked "out of date, regenerate" | 229 / 9 / 12 | ₹1,83,200 | **Lotus / Lotus** | ACT-08: "Mira published the schedule, revision 3: reception venue Banyan Hall to Lotus Hall." |
| D4 | Tara taps Attending (Reception) | Tara's reception invitation: P → Y | **230 / 9 / 11** | **₹1,84,000** | Lotus / Lotus | ACT-09: "Tara Bhat is attending the reception." |
| D4 | #7 "Reception ka venue kya hai, aur caterer ka kitna baaki hai?" | None | 230 / 9 / 11 | ₹1,84,000 | Lotus / Lotus | – |
| D5 | #8 voice refused (kill switch), then typed | REQ-10 saved by typing; the refused voice attempt goes to the voice log, not to the ledger | 230 / 9 / 11 | ₹1,84,000 | Lotus / Lotus | ACT-10: Mira added "Jain food for 12" to the reception. |
| D5 | NudgeBee beat (recording) | None live | – | – | – | – |

The sangeet stays at 136 attending throughout, because Tara was already attending it. After every run, switch `voice_writes_enabled` back on and **reset the demo copy to D0**. Resetting must also revert REV-3, PAY-01 version 2, REQ-10 and ACT-06 to ACT-10.

## 10. Shagun register (cash gifts received)

The Shagun register is visible to the owner only. It is **separate from the expense ledger** and never changes planned, committed, paid or outstanding.

| ID | From | HH | Amount | Received | How / note | Thank-you |
|---|---|---|---|---|---|---|
| SHG-01 | Kamla Arora (Dadi) | H10 | ₹21,000 | Sun 15 Nov 2026 | At the roka | ✅ Done: Kabir called her on 16 Nov |
| SHG-02 | Prakash & Vandana Kulkarni (Mama–Mami) | H03 | ₹11,000 | Wed 18 Nov 2026 | Home visit | ⏳ Pending |
| SHG-03 | Leena & Glen D'Souza | H08 | ₹2,100 | Fri 20 Nov 2026 | UPI, recorded only; Glen can't attend | ⏳ Pending |
| SHG-04 | Rukhsana Siddiqui | H14 | ₹1,100 | Sun 22 Nov 2026 | Cash via Yusuf; she declined the functions | ✅ Done: Mira messaged her on 22 Nov |
| SHG-05 | Naveen & Ritu Arora (Chacha–Chachi) | H12 | ₹5,100 | Mon 23 Nov 2026 | Home visit | ⏳ Pending |
| | **Total received** | | **₹40,300** | | | 3 pending |

**Thank-you list, pre-demo:** Kulkarni Mama–Mami (₹11,000), Leena & Glen D'Souza (₹2,100) and Naveen & Ritu Arora (₹5,100).

The voice test "Sharma ji ne 5,100 shagun diya" adds **SHG-06**: Ramesh & Kavita Sharma (H05), ₹5,100, received today, thank-you pending. Afterwards the total is **₹45,400** and **4** thank-yous are pending. "Sharma ji" resolves to H05 because it is the only Sharma household. The preview still names the household before saving.

## 11. Invitation studio, wedding website and exported card

### 11.1 Wording

English (the reception card, as Tara receives it):

> With the blessings of our families
> **Mira & Kabir**
> invite you to celebrate their wedding
> **Reception** · Monday, 14 December 2026 · 7:30 PM onwards
> Lotus Hall, Mallige Gardens, Whitefield, Bengaluru
> Kindly reply through your personal invitation link

Hindi lines:

> शुभ विवाह (heading)
> आपकी उपस्थिति से हमें अत्यंत प्रसन्नता होगी। ("Your presence will bring us great joy.")

A household's private link lists only that household's invited functions, taken from the latest published revision. The shared exported card is different: it lists only the functions that every invited guest is invited to, which in the demo is the Reception alone (acceptance 8.1 item 11, export-and-recovery 1.1). Before REV-3, the reception line reads "Banyan Hall".

### 11.2 Colours and type

These values are taken from `design-direction.md` §4. If that file changes, it wins.

| Theme | Page ground | Card stock | Names and headings | Foil (seal, hairline) | Blessing and Hindi line | Details | Use |
|---|---|---|---|---|---|---|---|
| **Maroon & Gold** (demo theme) | maroon-deep `#4E0C1A` | ivory `#F7EFDF` | maroon `#6A1224` | gold `#C9A24E` | gold-ink `#7D5B17` | ink `#2B1D1A` | Live demo; set by the voice line "Make the invite maroon and gold" |
| Peacock & Gold (the alternative theme, if built) | peacock-deep `#0D3A45` | ivory `#F7EFDF` | peacock `#14505E` | gold `#C9A24E` | gold-ink `#7D5B17` | ink `#2B1D1A` | Starting theme in the video's setup segment, so the voice change is visible. If it isn't built, the voice line only adds the photo. |

Gold `#C9A24E` is foil only; it never sets small text on ivory. Fonts follow the design direction: Eczar for names, function names and wording; Anek Devanagari for logistics and controls; and, optionally in the studio, Tiro Devanagari Hindi for the Hindi lines.

### 11.3 Website and card

- **Wedding website:** a mobile page reached through the household's private link. It shows the couple photo, "Mira & Kabir · 14 December 2026 · Bengaluru", the Hindi heading, that household's published functions, and RSVP buttons. It must not be indexed by search engines. Tara's page never shows the mehendi, haldi or wedding, any money, or other guests.
- **Couple photo:** a fictional AI-generated portrait, labelled "AI-generated, fictional", generated by L with GPT-6.2-Sol between 10:00 and 11:00 (after 09:00, because it is design work under rule 4). It is used as uploaded and never cropped or retouched (decision D14).
  - L commits it as `scripts/seed-assets/couple-photo.jpg` by 11:00, in a lead PR merged first in the 11:40 batch (decision D107).
  - The seed's photo step is idempotent: it uploads the file and upserts the asset row by `seed_key`, and touches nothing else. L runs it for every copy right after the 11:40 deploy. From then on the photo is part of D0, so `reset_demo` keeps it.
  - The card template renders with and without a photo, so the 11:50 production card on copy `d` passes either way.
- **Exported card:** a 1080 × 1350 PNG of the published revision, with the names, date, reception line, Hindi lines, photo and a small "Fictional demo data" footer. Every card is keyed by publication revision and format, such as `rev3:png`. `JOB-EXP-R2-PNG` (Banyan Hall) is stale after REV-3. The REV-3 card shows **Lotus Hall**.

## 12. The "existing invite" image (for the read-an-invitation test)

The image is a fictional photographed printer's proof sent by the Arora family, file `arora-printer-proof.jpg`. Create it after 09:00. It is design work, so Rule 4 applies. The card prints exactly:

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

**Deliberately missing:**

1. **The year.** `date_iso` must stay empty. Jashn may say that 14 December falls on a Monday in 2026, but the year stays unconfirmed until Mira picks it.
2. **The reception time and hall.** "To follow in the evening" is not a time. The draft must leave both empty and ask for them.

| Field | Expected extraction | Review state |
|---|---|---|
| Groom / bride | Kabir / Mira (no surnames printed for the couple) | Fill in; surnames optional |
| Hosts | Neelam & Rakesh Arora; Sunita & Anil Deshpande | Fill in |
| Wedding | "Monday, 14th December", 11:15, Mandap Lawn, Mallige Gardens, Whitefield, Bengaluru | **Year: please confirm** |
| Reception | "to follow in the evening" | **Time and hall: not printed; please add** |
| RSVP contact | Neelam Arora, +91 90000 00901 | Fill in |

## 13. Sponsor data used by the demo

### 13.1 Flagsmith (production environment; there is no rehearsal environment)

| Flag | Type | Demo value | What it does |
|---|---|---|---|
| `setup_entry` | Multivariate: `voice_first` / `form_first`, 50/50 by a stable opaque owner ID | Applies to new owners' first sessions. Mira is an existing owner and is not in it. | Opens setup on the microphone or on the form. Both arms can switch input. Exposure is sent when the entry screen renders; `setup_saved` is sent after the database confirms the save. |
| `voice_pilot` | Boolean with a segment override | On for the internal segment (Mira, Diya); 10% of eligible owners | Shows the microphone |
| `voice_writes_enabled` | Boolean, **checked by the server on every voice-originated write** | `true`. Flipped to `false` live in the Flagsmith beat, then **restored to `true`** | When false, voice writes are refused. Voice questions and typed edits still work. |
| `spoken_replies` | Boolean | `true` | Mutes Bulbul replies if they are slow; the text replies stay |

**Experiment counts: do not pre-fill.** Read them from Flagsmith on the day, at about 14:30, and show the real exposures and saves per arm with the sample size. Claim no winner. No rehearsal Flagsmith environment exists (decision D25): rehearsals and the recording run on production with internal `@example.com` accounts, which the experiment never enrols, so they stay out of the real counts. Label any synthetic traffic.

### 13.2 NudgeBee: the export to recover

| Field | Value |
|---|---|
| Job | `JOB-EXP-R3-PNG`: invitation-card export for publication REV-3, format PNG |
| Export key (`export_key`) | `export:<wedding-id>:rev3:png`. This is the job's export key, not an HTTP Idempotency-Key (decision D26). |
| Retry Idempotency-Key | `nb-{execution_id}-{job_id}`, sent by NudgeBee on the retry call (export-and-recovery 2.3) |
| Attempt 1 | **Failed on purpose**: "Injected fault (deliberate): renderer timeout". The drill flag (`export_failure_drill`) is armed for the recorded run only and is **off** for the live demo by default. The lead decides at 14:30 (decision D40): the live run keeps the recorded NudgeBee beat with the drill off, unless the live run completes in under 15 s in rehearsal. |
| Workflow | `card-export-recovery`: read the job status over HTTPS → branch on failed → **operator approval** → call the export-only retry endpoint for the same `export_key`, with the retry Idempotency-Key → read the result and artifact ID |
| Attempt 2 | Succeeds after approval, producing artifact `card-rev3.png` (Lotus Hall) |
| Side effects | None. No new publication revision, no ledger rows and no RSVP changes. A replay returns the same artifact. |
| Run ID | Copied from the real run when it is recorded (V15, 13:00–13:30, with a retake at 14:00–14:30 only if needed; decision D33), and kept visible in the clip, captioned "Recorded today, HH:MM" with the real time |

## 14. Numbers check

| # | Check | Arithmetic | Result |
|---|---|---|---|
| 1 | Category budgets | 3,00,000 + 2,40,000 + 1,60,000 + 1,20,000 + 1,50,000 + 70,000 + 50,000 + 40,000 + 30,000 + 40,000 | **₹12,00,000** ✓ |
| 2 | Caterer contract | 250 × ₹800 | **₹2,00,000** |
| 3 | Caterer quote (not used) | 250 × ₹850 | ₹2,12,500 |
| 4 | Caterer outstanding at D0 | 2,00,000 − 50,000 | **₹1,50,000** |
| 5 | Caterer outstanding at D1 | 2,00,000 − 40,000 | **₹1,60,000** (+₹10,000; the caterer still has exactly 1 payment) |
| 6 | Committed | 2,00,000 + 2,80,000 + 1,50,000 + 1,10,000 + 25,000 + 55,000 + 12,000 + 95,000 | **₹9,27,000** |
| 7 | Paid at D0 | 50,000 + 1,40,000 + 50,000 + 30,000 + 5,000 + 15,000 + 12,000 + 95,000 | **₹3,97,000** |
| 8 | Outstanding at D0 | 9,27,000 − 3,97,000 | **₹5,30,000** |
| 9 | Vendor balances equal outstanding | 1,50,000 + 1,40,000 + 1,00,000 + 80,000 + 20,000 + 40,000 (misc expenses are fully paid) | ₹5,30,000 ✓ |
| 10 | Paid at D1 | 3,97,000 − 50,000 + 40,000 | **₹3,87,000** |
| 11 | Outstanding at D1 | 9,27,000 − 3,87,000 | **₹5,40,000** |
| 12 | Uncommitted | 12,00,000 − 9,27,000 = category sum 20,000 + 40,000 + 10,000 + 10,000 + 55,000 + 15,000 + 25,000 + 28,000 + 30,000 + 40,000 | **₹2,73,000** ✓ |
| 13 | Video state S0 | 9,27,000 − 2,00,000; 3,97,000 − 50,000; 7,27,000 − 3,47,000; 12,00,000 − 7,27,000 | ₹7,27,000 / ₹3,47,000 / ₹3,80,000 / ₹4,73,000 |
| 14 | Proposal excluded | Music committed 55,000; with PRP-01 it would be 55,000 + 15,000 | ₹70,000 = Music budget (not counted until approved) |
| 15 | Reception at D0 | 229 + 9 + 12; named 32 + 2 + 6; placeholders 197 + 7 + 6 | 250 ✓; 40 ✓; 210 ✓ |
| 16 | Reception at D4 | 230 + 9 + 11 | 250 ✓ |
| 17 | Catering estimate | 229 × 800; 230 × 800 | **₹1,83,200 → ₹1,84,000** |
| 18 | Estimate vs contract | 2,00,000 − 1,84,000 = 20 unconfirmed covers × 800 | ₹16,000 (the contract does not change) |
| 19 | Named guests | 11 + 10 + 7 + 6 + 6 | 40 named in 16 households |
| 20 | Placeholders | 9 + 24 + 77 + 36 + 64 | 210 |
| 21 | Invited per function | Haldi 21 + 9; Mehendi 27 + 33; Sangeet 40 + 110; Wedding 34 + 146; Reception 40 + 210 | 30 / 60 / 150 / 180 / 250 |
| 22 | RSVP sums per function | Haldi 25 + 2 + 3; Mehendi 50 + 6 + 4; Sangeet 136 + 8 + 6; Wedding 165 + 6 + 9 | 30 / 60 / 150 / 180 ✓ |
| 23 | Shagun | 21,000 + 11,000 + 2,100 + 1,100 + 5,100; then + 5,100 | ₹40,300 → ₹45,400 |
| 24 | Timing conflict | Mehendi ends 19:30 − Sangeet starts 19:00 | 30 min overlap |
| 25 | Hall capacity | Banyan 220 < 229 confirmed; Lotus 300 ≥ 250 invited | Explains the move |
| 26 | Weekdays (checked) | 13 Dec 2026, 14 Dec 2026, 25 Nov 2026 | Sunday, Monday, Wednesday |

Spoken forms: ₹1,50,000 is "एक लाख पचास हज़ार रुपये", ₹1,60,000 is "एक लाख साठ हज़ार रुपये", ₹5,40,000 is "पाँच लाख चालीस हज़ार रुपये", ₹1,84,000 is "एक लाख चौरासी हज़ार रुपये" and ₹12,00,000 is "बारह लाख रुपये".

The fixed live replies, character for character:

- After the Hinglish correction "Caterer ko chaalis hazaar advance diya tha" is confirmed: **"एक लाख साठ हज़ार रुपये बाकी हैं।"**
- Before the correction, for "Caterer ko ab kitna dena hai?": "एक लाख पचास हज़ार रुपये बाकी हैं।"
- For "Reception ka venue kya hai, aur caterer ka kitna baaki hai?" at D4: "Reception: Lotus Hall. एक लाख साठ हज़ार रुपये बाकी हैं।"

## 15. Decisions this sheet makes (where earlier notes differed)

1. **The reception's original hall is Banyan Hall, not Garden Hall.** The astra plan wrote "Diya moved the reception from Garden Hall", but Garden Hall is the sangeet venue. With a distinct hall, Tara's phone shows an unambiguous before and after. Both halls are in Mallige Gardens, so the move costs nothing.
2. **The live question names the event:** "Reception ka venue kya hai…". The plan's "Venue kya hai" is ambiguous across five functions, and it is kept as an ambiguity test.
3. **There are two seed states.** S0, for the video, records the caterer by voice as the brief's utterance does. D0, for the live demo, starts with the ₹50,000 advance already recorded.
4. **229/250 comes from stored rows** (40 named and 210 synthetic placeholders). `expected_headcount` is a planning field only.
5. **Light requirements are in, as a SHOULD.** The plan listed requirements as future scope; the approved feature list includes per-function notes. "Jain food for 12" is the typed save in the Flagsmith beat.
6. **Colours and fonts follow `design-direction.md`, and scope follows `scope.md`.** The invitation uses its maroon and gold tokens and its Eczar and Anek Devanagari fonts. Receipt attachments, task boards and décor reference images are not on the demo path, because `scope.md` lists them as future scope.
